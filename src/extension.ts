import * as vscode from 'vscode';
import { ComplexityAnalyzer } from './complexityAnalyzer';
import { ReportProvider } from './reportProvider';
import { DecorationProvider } from './decorationProvider';
import { ExportManager } from './exportManager';

export function activate(context: vscode.ExtensionContext) {
    console.log('Algorithm Complexity Analyzer is now active!');

    // Initialize services
    const analyzer = new ComplexityAnalyzer(context);
    const reportProvider = new ReportProvider(context);
    const decorationProvider = new DecorationProvider();
    const exportManager = new ExportManager();

    // Register webview provider
    const provider = vscode.window.registerWebviewViewProvider(
        'complexityAnalyzer.report',
        reportProvider,
        {
            webviewOptions: {
                retainContextWhenHidden: true
            }
        }
    );

    // Register commands
    const analyzeFileCommand = vscode.commands.registerCommand(
        'complexityAnalyzer.analyzeFile',
        async (uri?: vscode.Uri) => {
            try {
                const targetUri = uri || vscode.window.activeTextEditor?.document.uri;
                if (!targetUri) {
                    vscode.window.showErrorMessage('No file selected for analysis');
                    return;
                }

                const document = await vscode.workspace.openTextDocument(targetUri);
                await analyzeDocument(document, analyzer, reportProvider, decorationProvider);
            } catch (error) {
                vscode.window.showErrorMessage(`Analysis failed: ${error}`);
            }
        }
    );

    const analyzeSelectionCommand = vscode.commands.registerCommand(
        'complexityAnalyzer.analyzeSelection',
        async () => {
            try {
                const editor = vscode.window.activeTextEditor;
                if (!editor) {
                    vscode.window.showErrorMessage('No active editor');
                    return;
                }

                const selection = editor.selection;
                if (selection.isEmpty) {
                    vscode.window.showErrorMessage('No code selected');
                    return;
                }

                const selectedText = editor.document.getText(selection);
                const language = editor.document.languageId;

                await analyzeCode(selectedText, language, analyzer, reportProvider, decorationProvider, selection);
            } catch (error) {
                vscode.window.showErrorMessage(`Analysis failed: ${error}`);
            }
        }
    );

    const showReportCommand = vscode.commands.registerCommand(
        'complexityAnalyzer.showReport',
        () => {
            vscode.commands.executeCommand('complexityAnalyzer.report.focus');
        }
    );

    const exportReportCommand = vscode.commands.registerCommand(
        'complexityAnalyzer.exportReport',
        async () => {
            const result = reportProvider.getLastResult();
            if (!result) {
                vscode.window.showErrorMessage('No analysis results to export');
                return;
            }

            await exportManager.exportReport(result);
        }
    );

    // Auto-analyze on file open if enabled
    const onDidOpenTextDocument = vscode.workspace.onDidOpenTextDocument(async (document) => {
        const config = vscode.workspace.getConfiguration('complexityAnalyzer');
        const autoAnalyze = config.get<boolean>('autoAnalyze', false);

        if (autoAnalyze && isSupportedLanguage(document.languageId)) {
            await analyzeDocument(document, analyzer, reportProvider, decorationProvider);
        }
    });

    // Register disposables
    context.subscriptions.push(
        provider,
        analyzeFileCommand,
        analyzeSelectionCommand,
        showReportCommand,
        exportReportCommand,
        onDidOpenTextDocument
    );

    // Set context for conditional UI
    vscode.commands.executeCommand('setContext', 'complexityAnalyzer.hasResults', false);
}

async function analyzeDocument(
    document: vscode.TextDocument,
    analyzer: ComplexityAnalyzer,
    reportProvider: ReportProvider,
    decorationProvider: DecorationProvider
) {
    if (!isSupportedLanguage(document.languageId)) {
        vscode.window.showWarningMessage(`Language ${document.languageId} is not supported`);
        return;
    }

    const config = vscode.workspace.getConfiguration('complexityAnalyzer');
    const maxFileSize = config.get<number>('maxFileSize', 100000);

    if (document.getText().length > maxFileSize) {
        vscode.window.showWarningMessage(`File too large to analyze (>${maxFileSize} characters)`);
        return;
    }

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: "Analyzing code complexity...",
            cancellable: false
        },
        async (progress) => {
            progress.report({ increment: 0, message: "Initializing WASM module..." });

            const result = await analyzer.analyzeCode(document.getText(), document.languageId);
            
            progress.report({ increment: 50, message: "Generating report..." });

            await reportProvider.updateReport(result, document.fileName);
            
            progress.report({ increment: 75, message: "Applying decorations..." });

            const showDecorations = config.get<boolean>('showInlineDecorations', true);
            if (showDecorations) {
                decorationProvider.applyDecorations(vscode.window.activeTextEditor, result);
            }

            progress.report({ increment: 100, message: "Analysis complete!" });

            vscode.commands.executeCommand('setContext', 'complexityAnalyzer.hasResults', true);
        }
    );
}

async function analyzeCode(
    code: string,
    language: string,
    analyzer: ComplexityAnalyzer,
    reportProvider: ReportProvider,
    decorationProvider: DecorationProvider,
    selection?: vscode.Selection
) {
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: "Analyzing selected code...",
            cancellable: false
        },
        async (progress) => {
            progress.report({ increment: 0, message: "Analyzing..." });

            const result = await analyzer.analyzeCode(code, language);
            
            progress.report({ increment: 75, message: "Generating report..." });

            await reportProvider.updateReport(result, 'Selected Code');

            progress.report({ increment: 100, message: "Analysis complete!" });

            vscode.commands.executeCommand('setContext', 'complexityAnalyzer.hasResults', true);
        }
    );
}

function isSupportedLanguage(languageId: string): boolean {
    const supportedLanguages = ['javascript', 'typescript', 'python', 'java', 'c', 'cpp', 'rust'];
    return supportedLanguages.includes(languageId);
}

export function deactivate() {
    console.log('Algorithm Complexity Analyzer deactivated');
}