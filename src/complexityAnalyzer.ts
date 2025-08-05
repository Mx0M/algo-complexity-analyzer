import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface ComplexityResult {
    complexity: string;
    confidence: number;
    details: string[];
    line_start: number;
    line_end: number;
}

export interface FunctionAnalysis {
    function: string;
    complexity: string;
    confidence: number;
    details: string[];
    line_start: number;
    line_end: number;
}

export interface AnalysisResult {
    overall: string;
    functions: FunctionAnalysis[];
    language: string;
    warnings: string[];
    timestamp?: number;
    file_name?: string;
}

export class ComplexityAnalyzer {
    private wasmModule: any = null;
    private isInitialized = false;

    constructor(private context: vscode.ExtensionContext) {}

    private async initializeWasm(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        try {
            const wasmPkgPath = path.join(this.context.extensionPath, 'assets', 'pkg');
            const wasmJsPath = path.join(wasmPkgPath, 'big_o_analyser.js');
            const wasmBinaryPath = path.join(wasmPkgPath, 'big_o_analyser_bg.wasm');

            // Check if files exist
            if (!fs.existsSync(wasmJsPath)) {
                throw new Error(`WASM JS file not found at: ${wasmJsPath}`);
            }
            if (!fs.existsSync(wasmBinaryPath)) {
                throw new Error(`WASM binary file not found at: ${wasmBinaryPath}`);
            }

            console.log('Loading WASM from:', wasmJsPath);

            // Clear require cache to ensure fresh load
            delete require.cache[require.resolve(wasmJsPath)];
            
            // For Node.js target, the module structure is different
            const wasmModule = require(wasmJsPath);
            
            console.log('WASM module loaded, available exports:', Object.keys(wasmModule));
            console.log('Module type:', typeof wasmModule);

            // For Node.js target, the functions are directly available
            // No initialization function needed - just use the module directly
            if (wasmModule.analyze_complexity || wasmModule.analyzeComplexity) {
                this.wasmModule = wasmModule;
                this.isInitialized = true;
                console.log('WASM module ready - using direct exports');
                console.log('Available analysis functions:', 
                    Object.keys(wasmModule).filter(key => 
                        typeof wasmModule[key] === 'function' && 
                        (key.includes('analyze') || key.includes('complex'))
                    )
                );
                return;
            }

            // If no direct functions, try initialization patterns
            if (typeof wasmModule.default === 'function') {
                console.log('Trying default initialization...');
                const initialized = await wasmModule.default();
                this.wasmModule = initialized || wasmModule;
            } else if (typeof wasmModule.init === 'function') {
                console.log('Trying init function...');
                await wasmModule.init();
                this.wasmModule = wasmModule;
            } else if (typeof wasmModule.initSync === 'function') {
                console.log('Trying initSync function...');
                wasmModule.initSync();
                this.wasmModule = wasmModule;
            } else {
                // Try using the module as-is
                console.log('No init function found, using module directly');
                this.wasmModule = wasmModule;
            }

            this.isInitialized = true;
            console.log('WASM module initialized successfully');
            console.log('Final available functions:', 
                Object.keys(this.wasmModule).filter(key => typeof this.wasmModule[key] === 'function')
            );

        } catch (error) {
            console.error('Primary WASM initialization failed:', error);
            
            // Try alternative method
            try {
                await this.initializeWasmWithCustomBindings();
            } catch (altError) {
                console.error('Alternative WASM initialization failed:', altError);
                throw new Error(`All WASM initialization methods failed. Primary: ${error}. Alternative: ${altError}`);
            }
        }
    }

    private async initializeWasmWithCustomBindings(): Promise<void> {
        try {
            const wasmBinaryPath = path.join(this.context.extensionPath, 'assets', 'pkg', 'big_o_analyser_bg.wasm');
            
            if (!fs.existsSync(wasmBinaryPath)) {
                throw new Error('WASM binary not found for custom bindings');
            }

            const wasmBytes = fs.readFileSync(wasmBinaryPath);

            // Try to read the generated JS file to understand what imports are needed
            const wasmJsPath = path.join(this.context.extensionPath, 'assets', 'pkg', 'big_o_analyser.js');
            let jsContent = '';
            
            if (fs.existsSync(wasmJsPath)) {
                jsContent = fs.readFileSync(wasmJsPath, 'utf-8');
            }

            // Create comprehensive imports object based on common wasm-bindgen patterns
            const imports: any = {
                __wbindgen_placeholder__: {
                    // Common wasm-bindgen functions
                    __wbindgen_string_new: (ptr: number, len: number) => {
                        // Return a string ID - simplified
                        return 0;
                    },
                    __wbindgen_throw: (ptr: number, len: number) => {
                        throw new Error('WASM runtime error');
                    },
                    __wbindgen_object_drop_ref: (idx: number) => {
                        // Object cleanup - no-op for now
                    },
                    __wbindgen_string_get: (arg: number, ptr_ptr: number, len_ptr: number) => {
                        // String access - simplified
                        return '';
                    },
                    __wbindgen_json_parse: (ptr: number, len: number) => {
                        return 0;
                    },
                    __wbindgen_json_serialize: (idx: number, ptr_ptr: number, len_ptr: number) => {
                        // JSON serialization - simplified
                    }
                }
            };

            // Add any additional imports found in the JS file
            if (jsContent.includes('console.log')) {
                imports.__wbindgen_placeholder__.__wbg_log_console = () => {};
            }

            console.log('Attempting WASM instantiation with custom imports...');
            
            const wasmInstance = await WebAssembly.instantiate(wasmBytes, imports);
            
            console.log('WASM instantiated, exports:', Object.keys(wasmInstance.instance.exports));
            
            // Create wrapper with available exports
            this.wasmModule = {
                ...wasmInstance.instance.exports
            };

            // Try to find analysis functions with different naming patterns
            const exports = wasmInstance.instance.exports as any;
            const exportKeys = Object.keys(exports);
            
            // Look for analysis functions
            const analysisFunctions = exportKeys.filter(key => 
                key.includes('analyze') || 
                key.includes('complex') ||
                key.includes('analysis')
            );
            
            console.log('Found potential analysis functions:', analysisFunctions);
            
            if (analysisFunctions.length === 0) {
                console.log('All available exports:', exportKeys);
                // If no obvious analysis functions, try to map common ones
                if (exports.exported_analyze_complexity) {
                    this.wasmModule.analyze_complexity = exports.exported_analyze_complexity;
                }
            }

            this.isInitialized = true;
            console.log('WASM module initialized with custom bindings successfully');

        } catch (error) {
            throw new Error(`Custom bindings initialization failed: ${error}`);
        }
    }

    async analyzeCode(code: string, language: string): Promise<AnalysisResult> {
        try {
            await this.initializeWasm();
        } catch (initError) {
            console.error('WASM initialization failed completely:', initError);
            return this.getFallbackResult(language, `WASM unavailable: ${initError}`);
        }

        if (!code || code.trim().length === 0) {
            return this.getFallbackResult(language, 'No code provided for analysis');
        }

        // Validate input size
        const config = vscode.workspace.getConfiguration('complexityAnalyzer');
        const maxSize = config.get<number>('maxFileSize', 100000);
        
        if (code.length > maxSize) {
            return this.getFallbackResult(language, `Code too large (${code.length} > ${maxSize} chars)`);
        }

        try {
            console.log(`Analyzing ${language} code (${code.length} characters)`);
            
            // Try different function names that might exist
            let result;
            if (this.wasmModule.analyze_complexity) {
                result = this.wasmModule.analyze_complexity(code, language);
            } else if (this.wasmModule.analyzeComplexity) {
                result = this.wasmModule.analyzeComplexity(code, language);
            } else {
                throw new Error('No analysis function found in WASM module');
            }
            
            const analysisResult: AnalysisResult = {
                overall: result.overall || "O(n)",
                functions: result.functions || [],
                language: language,
                warnings: result.warnings || [],
                timestamp: Date.now()
            };

            console.log('Analysis completed:', analysisResult);
            return analysisResult;

        } catch (error) {
            console.error('Analysis execution failed:', error);
            return this.getFallbackResult(language, `Analysis error: ${error}`);
        }
    }

    private getFallbackResult(language: string, errorMessage: string): AnalysisResult {
        // Provide a basic static analysis as fallback
        return {
            overall: "O(n)", // Conservative estimate
            functions: [],
            language: language,
            warnings: [errorMessage, "Using fallback analysis"],
            timestamp: Date.now()
        };
    }

    getSupportedLanguages(): string[] {
        const defaultLanguages = ['javascript', 'typescript', 'python', 'java', 'c', 'cpp', 'rust', 'go'];
        
        if (!this.isInitialized || !this.wasmModule) {
            return defaultLanguages;
        }

        try {
            if (this.wasmModule.get_supported_languages) {
                return this.wasmModule.get_supported_languages();
            } else if (this.wasmModule.getSupportedLanguages) {
                return this.wasmModule.getSupportedLanguages();
            }
            return defaultLanguages;
        } catch (error) {
            console.error('Failed to get supported languages:', error);
            return defaultLanguages;
        }
    }

    // Diagnostic method to check WASM state
    public getDiagnostics(): any {
        return {
            isInitialized: this.isInitialized,
            hasModule: !!this.wasmModule,
            availableFunctions: this.wasmModule ? Object.keys(this.wasmModule).filter(key => typeof this.wasmModule[key] === 'function') : [],
            moduleType: this.wasmModule ? typeof this.wasmModule : 'undefined'
        };
    }

    static getComplexityOrder(complexity: string): number {
        const order: { [key: string]: number } = {
            'O(1)': 0,
            'O(log n)': 1,
            'O(n)': 2,
            'O(n log n)': 3,
            'O(n²)': 4,
            'O(n³)': 5,
            'O(n^k)': 6,
            'O(2ⁿ)': 7,
            'O(n!)': 8
        };
        return order[complexity] ?? 2; // Default to O(n)
    }

    static getComplexityColor(complexity: string): string {
        const colors: { [key: string]: string } = {
            'O(1)': '#28a745',      // Green
            'O(log n)': '#20c997',   // Teal
            'O(n)': '#ffc107',       // Yellow
            'O(n log n)': '#fd7e14', // Orange
            'O(n²)': '#dc3545',      // Red
            'O(n³)': '#6f42c1',      // Purple
            'O(n^k)': '#e83e8c',     // Pink
            'O(2ⁿ)': '#343a40',      // Dark
            'O(n!)': '#000000'       // Black
        };
        return colors[complexity] ?? '#6c757d';
    }

    static getComplexityDescription(complexity: string): string {
        const descriptions: { [key: string]: string } = {
            'O(1)': 'Constant time - excellent performance',
            'O(log n)': 'Logarithmic time - very good performance',
            'O(n)': 'Linear time - good performance',
            'O(n log n)': 'Linearithmic time - acceptable performance',
            'O(n²)': 'Quadratic time - poor performance for large inputs',
            'O(n³)': 'Cubic time - very poor performance',
            'O(n^k)': 'Polynomial time - extremely poor performance',
            'O(2ⁿ)': 'Exponential time - unacceptable for large inputs',
            'O(n!)': 'Factorial time - only suitable for tiny inputs'
        };
        return descriptions[complexity] ?? 'Linear time complexity (estimated)';
    }
}