use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}

macro_rules! console_log {
    ($($t:tt)*) => {
        log(&format_args!($($t)*).to_string())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComplexityResult {
    complexity: String,
    confidence: f64,
    details: Vec<String>,
    line_start: usize,
    line_end: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionAnalysis {
    function: String,
    complexity: String,
    confidence: f64,
    details: Vec<String>,
    line_start: usize,
    line_end: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AnalysisResult {
    overall: String,
    functions: Vec<FunctionAnalysis>,
    language: String,
    warnings: Vec<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Complexity {
    Constant,     // O(1)
    Logarithmic,  // O(log n)
    Linear,       // O(n)
    Linearithmic, // O(n log n)
    Quadratic,    // O(n²)
    Cubic,        // O(n³)
    Polynomial,   // O(n^k) where k > 3
    Exponential,  // O(2ⁿ)
    Factorial,    // O(n!)
}

impl Complexity {
    fn to_string(&self) -> &'static str {
        match self {
            Complexity::Constant => "O(1)",
            Complexity::Logarithmic => "O(log n)",
            Complexity::Linear => "O(n)",
            Complexity::Linearithmic => "O(n log n)",
            Complexity::Quadratic => "O(n²)",
            Complexity::Cubic => "O(n³)",
            Complexity::Polynomial => "O(n^k)",
            Complexity::Exponential => "O(2ⁿ)",
            Complexity::Factorial => "O(n!)",
        }
    }

    fn order(&self) -> u8 {
        match self {
            Complexity::Constant => 0,
            Complexity::Logarithmic => 1,
            Complexity::Linear => 2,
            Complexity::Linearithmic => 3,
            Complexity::Quadratic => 4,
            Complexity::Cubic => 5,
            Complexity::Polynomial => 6,
            Complexity::Exponential => 7,
            Complexity::Factorial => 8,
        }
    }

    fn max(self, other: Complexity) -> Complexity {
        if self.order() > other.order() {
            self
        } else {
            other
        }
    }
}

#[derive(Debug)]
pub struct FunctionInfo {
    name: String,
    start_line: usize,
    end_line: usize,
    loop_depth: usize,
    recursive_calls: usize,
    has_binary_search: bool,
    has_sorting: bool,
    has_dynamic_programming: bool,
}

pub struct ComplexityAnalyzer {
    language: String,
    builtin_functions: HashMap<&'static str, Complexity>,
}

impl ComplexityAnalyzer {
    pub fn new(language: &str) -> Self {
        let mut builtin_functions = HashMap::new();

        // Add language-specific builtin function complexities
        match language.to_lowercase().as_str() {
            "javascript" | "typescript" => {
                builtin_functions.insert("sort", Complexity::Linearithmic);
                builtin_functions.insert("indexOf", Complexity::Linear);
                builtin_functions.insert("includes", Complexity::Linear);
                builtin_functions.insert("find", Complexity::Linear);
                builtin_functions.insert("filter", Complexity::Linear);
                builtin_functions.insert("map", Complexity::Linear);
                builtin_functions.insert("reduce", Complexity::Linear);
            }
            "python" => {
                builtin_functions.insert("sorted", Complexity::Linearithmic);
                builtin_functions.insert("sort", Complexity::Linearithmic);
                builtin_functions.insert("max", Complexity::Linear);
                builtin_functions.insert("min", Complexity::Linear);
                builtin_functions.insert("sum", Complexity::Linear);
            }
            "java" => {
                builtin_functions.insert("Arrays.sort", Complexity::Linearithmic);
                builtin_functions.insert("Collections.sort", Complexity::Linearithmic);
            }
            _ => {}
        }

        Self {
            language: language.to_string(),
            builtin_functions,
        }
    }

    pub fn analyze(&self, code: &str) -> AnalysisResult {
        // Early validation to prevent processing huge inputs
        if code.len() > 100_000 {
            return AnalysisResult {
                overall: "O(1)".to_string(),
                functions: vec![],
                language: self.language.clone(),
                warnings: vec!["Code too large to analyze safely".to_string()],
            };
        }

        let functions = self.extract_functions(code);
        let mut function_results = Vec::with_capacity(functions.len());
        let mut warnings = Vec::new();

        if functions.is_empty() {
            warnings
                .push("No functions detected. Analyzing entire code as single block.".to_string());
        }

        for func in functions {
            let analysis = self.analyze_function(&func, code);
            function_results.push(FunctionAnalysis {
                function: func.name,
                complexity: analysis.complexity,
                confidence: analysis.confidence,
                details: analysis.details,
                line_start: analysis.line_start,
                line_end: analysis.line_end,
            });
        }

        let overall = self.get_overall_complexity(&function_results);

        AnalysisResult {
            overall,
            functions: function_results,
            language: self.language.clone(),
            warnings,
        }
    }

    fn extract_functions(&self, code: &str) -> Vec<FunctionInfo> {
        let mut functions = Vec::new();
        let lines: Vec<&str> = code.lines().collect();

        // Limit processing to reasonable number of lines
        if lines.len() > 10_000 {
            return vec![self.create_function_info(
                "main".to_string(),
                1,
                lines.len().min(1000), // Limit analysis scope
            )];
        }

        match self.language.to_lowercase().as_str() {
            "python" => self.extract_python_functions(&lines, &mut functions),
            "javascript" | "typescript" => self.extract_js_functions(&lines, &mut functions),
            "java" | "c" | "cpp" | "c++" | "rust" => {
                self.extract_c_style_functions(&lines, &mut functions)
            }
            _ => self.extract_generic_functions(&lines, &mut functions),
        }

        if functions.is_empty() {
            functions.push(self.create_function_info("main".to_string(), 1, lines.len()));
        }

        functions
    }

    fn extract_python_functions(&self, lines: &[&str], functions: &mut Vec<FunctionInfo>) {
        let mut current_function: Option<(String, usize, usize)> = None;

        for (i, line) in lines.iter().enumerate() {
            let indent_level = line.len() - line.trim_start().len();

            if line.trim_start().starts_with("def ") {
                // Save previous function
                if let Some((name, start, _)) = current_function.take() {
                    functions.push(self.create_function_info(name, start, i));
                }

                if let Some(func_name) = self.extract_python_function_name(line) {
                    current_function = Some((func_name, i + 1, indent_level));
                }
            } else if let Some((name, start, base_indent)) = current_function.as_ref() {
                // Function ended if we're back to base level or less
                if !line.trim().is_empty() && indent_level <= *base_indent {
                    functions.push(self.create_function_info(name.clone(), *start, i));
                    current_function = None;

                    // Check if this line starts a new function
                    if line.trim_start().starts_with("def ") {
                        if let Some(func_name) = self.extract_python_function_name(line) {
                            current_function = Some((func_name, i + 1, indent_level));
                        }
                    }
                }
            }
        }

        // Handle last function
        if let Some((name, start, _)) = current_function {
            functions.push(self.create_function_info(name, start, lines.len()));
        }
    }

    fn extract_js_functions(&self, lines: &[&str], functions: &mut Vec<FunctionInfo>) {
        let mut current_function: Option<(String, usize)> = None;
        let mut brace_count = 0;

        for (i, line) in lines.iter().enumerate() {
            let trimmed = line.trim();

            if let Some(func_name) = self.extract_js_function_name(trimmed) {
                if let Some((name, start)) = current_function.take() {
                    functions.push(self.create_function_info(name, start, i));
                }

                current_function = Some((func_name, i + 1));
                brace_count = line.matches('{').count() as i32 - line.matches('}').count() as i32;
            } else if current_function.is_some() {
                brace_count += line.matches('{').count() as i32 - line.matches('}').count() as i32;

                if brace_count <= 0 {
                    let (name, start) = current_function.take().unwrap();
                    functions.push(self.create_function_info(name, start, i + 1));
                }
            }
        }

        if let Some((name, start)) = current_function {
            functions.push(self.create_function_info(name, start, lines.len()));
        }
    }

    fn extract_c_style_functions(&self, lines: &[&str], functions: &mut Vec<FunctionInfo>) {
        let mut current_function: Option<(String, usize)> = None;
        let mut brace_count = 0;

        for (i, line) in lines.iter().enumerate() {
            let trimmed = line.trim();

            if let Some(func_name) = self.extract_c_style_function_name(trimmed) {
                if let Some((name, start)) = current_function.take() {
                    functions.push(self.create_function_info(name, start, i));
                }

                current_function = Some((func_name, i + 1));
                brace_count = line.matches('{').count() as i32 - line.matches('}').count() as i32;
            } else if current_function.is_some() {
                brace_count += line.matches('{').count() as i32 - line.matches('}').count() as i32;

                if brace_count <= 0 {
                    let (name, start) = current_function.take().unwrap();
                    functions.push(self.create_function_info(name, start, i + 1));
                }
            }
        }

        if let Some((name, start)) = current_function {
            functions.push(self.create_function_info(name, start, lines.len()));
        }
    }

    fn extract_generic_functions(&self, lines: &[&str], functions: &mut Vec<FunctionInfo>) {
        self.extract_c_style_functions(lines, functions);
    }

    fn extract_python_function_name(&self, line: &str) -> Option<String> {
        if let Some(paren_pos) = line.find('(') {
            let after_def = line.trim_start().strip_prefix("def ")?;
            let name_end = paren_pos.saturating_sub(4);
            let name = after_def.get(..name_end)?.trim();
            if !name.is_empty() && name.len() < 100 {
                // Reasonable name length
                return Some(name.to_string());
            }
        }
        None
    }

    fn extract_js_function_name(&self, line: &str) -> Option<String> {
        // Regular function declaration
        if line.starts_with("function ") {
            if let Some(paren_pos) = line.find('(') {
                let name = line.get(9..paren_pos)?.trim();
                if !name.is_empty() && name.len() < 100 {
                    return Some(name.to_string());
                }
            }
        }

        // Arrow function with const/let/var
        if let Some(arrow_pos) = line.find(" => ") {
            if let Some(eq_pos) = line.find(" = ") {
                if eq_pos < arrow_pos {
                    let before_eq = line.get(..eq_pos)?;
                    if let Some(space_pos) = before_eq.rfind(' ') {
                        let name = before_eq.get(space_pos + 1..)?.trim();
                        if !name.is_empty() && name.len() < 100 {
                            return Some(name.to_string());
                        }
                    }
                }
            }
        }

        // Method definition
        if line.contains(':') && line.contains("function") {
            if let Some(colon_pos) = line.find(':') {
                let name = line.get(..colon_pos)?.trim();
                if !name.is_empty()
                    && name.len() < 100
                    && name.chars().all(|c| c.is_alphanumeric() || c == '_')
                {
                    return Some(name.to_string());
                }
            }
        }

        None
    }

    fn extract_c_style_function_name(&self, line: &str) -> Option<String> {
        if line.contains('(') && (line.contains('{') || line.ends_with(';')) {
            let before_paren = line.split('(').next()?;
            let words: Vec<&str> = before_paren.split_whitespace().collect();
            if let Some(last_word) = words.last() {
                // Skip common keywords
                if !matches!(*last_word, "if" | "while" | "for" | "switch" | "catch")
                    && last_word.len() < 100
                {
                    return Some(last_word.to_string());
                }
            }
        }
        None
    }

    fn create_function_info(&self, name: String, start: usize, end: usize) -> FunctionInfo {
        FunctionInfo {
            loop_depth: 0,                  // Will be calculated during analysis
            recursive_calls: 0,             // Will be calculated during analysis
            has_binary_search: false,       // Will be calculated during analysis
            has_sorting: false,             // Will be calculated during analysis
            has_dynamic_programming: false, // Will be calculated during analysis
            name,
            start_line: start,
            end_line: end,
        }
    }

    fn analyze_function(&self, func: &FunctionInfo, full_code: &str) -> ComplexityResult {
        let mut complexity = Complexity::Constant;
        let mut confidence = 0.9f64;
        let mut details = Vec::new();

        // Get function body slice safely
        let lines: Vec<&str> = full_code.lines().collect();
        let start_idx = func.start_line.saturating_sub(1);
        let end_idx = func.end_line.min(lines.len());

        if start_idx >= lines.len() || start_idx >= end_idx {
            details.push("Unable to analyze function body".to_string());
            return ComplexityResult {
                complexity: complexity.to_string().to_string(),
                confidence,
                details,
                line_start: func.start_line,
                line_end: func.end_line,
            };
        }

        let function_body = lines[start_idx..end_idx].join("\n");

        // Check for builtin function calls
        for (builtin, builtin_complexity) in &self.builtin_functions {
            if function_body.contains(builtin) {
                complexity = complexity.max(builtin_complexity.clone());
                details.push(format!("Built-in function '{}' detected", builtin));
            }
        }

        // Calculate properties
        let loop_depth = self.calculate_loop_depth(&function_body);
        let recursive_calls = self.count_function_calls(&function_body, &func.name);
        let has_binary_search = self.detect_binary_search(&function_body);
        let has_sorting = self.detect_sorting(&function_body);
        let has_dynamic_programming = self.detect_dynamic_programming(&function_body);

        // Analyze loop complexity
        match loop_depth {
            0 => {
                if recursive_calls == 0 {
                    details.push("No loops or recursion detected".to_string());
                }
            }
            1 => {
                complexity = complexity.max(Complexity::Linear);
                details.push("Single loop detected".to_string());

                if has_binary_search {
                    complexity = Complexity::Logarithmic;
                    details.push("Binary search pattern overrides linear complexity".to_string());
                    confidence = 0.9f64;
                }
            }
            2 => {
                complexity = complexity.max(Complexity::Quadratic);
                details.push("Nested loops detected (depth: 2)".to_string());
                confidence = 0.85f64;
            }
            3 => {
                complexity = complexity.max(Complexity::Cubic);
                details.push("Triple nested loops detected".to_string());
                confidence = 0.85f64;
            }
            n if n > 3 => {
                complexity = complexity.max(Complexity::Polynomial);
                details.push(format!("Deeply nested loops (depth: {})", n));
                confidence = 0.7f64;
            }
            _ => {}
        }

        // Analyze recursion patterns
        if recursive_calls > 0 {
            if self.is_tail_recursive(&function_body, &func.name) {
                complexity = complexity.max(Complexity::Linear);
                details.push("Tail recursion detected".to_string());
                confidence = 0.8f64;
            } else if self.is_divide_and_conquer(&function_body) {
                complexity = complexity.max(Complexity::Linearithmic);
                details.push("Divide and conquer recursion detected".to_string());
                confidence = 0.85f64;
            } else if recursive_calls > 1 {
                if self.is_fibonacci_like(&function_body, &func.name) {
                    complexity = complexity.max(Complexity::Exponential);
                    details.push("Exponential recursion (fibonacci-like) detected".to_string());
                    confidence = 0.9f64;
                } else {
                    complexity = complexity.max(Complexity::Exponential);
                    details.push("Multiple recursive calls detected".to_string());
                    confidence = 0.7f64;
                }
            } else {
                complexity = complexity.max(Complexity::Linear);
                details.push("Simple recursion detected".to_string());
                confidence = 0.7f64;
            }
        }

        // Check for dynamic programming
        if has_dynamic_programming {
            details
                .push("Dynamic programming pattern detected - may reduce complexity".to_string());
            confidence = confidence.min(0.6f64);
        }

        // Check for sorting
        if has_sorting {
            complexity = complexity.max(Complexity::Linearithmic);
            details.push("Sorting operation detected".to_string());
        }

        // Special case: factorial-like patterns
        if self.detect_factorial_pattern(&function_body) {
            complexity = complexity.max(Complexity::Factorial);
            details.push("Factorial complexity pattern detected".to_string());
            confidence = 0.8f64;
        }

        ComplexityResult {
            complexity: complexity.to_string().to_string(),
            confidence,
            details,
            line_start: func.start_line,
            line_end: func.end_line,
        }
    }

    fn calculate_loop_depth(&self, code: &str) -> usize {
        let mut max_depth = 0usize;
        let mut current_depth = 0usize;

        for line in code.lines().take(1000) {
            // Limit processing
            let trimmed = line.trim();

            // Skip comments and empty lines
            if trimmed.is_empty() || trimmed.starts_with("//") || trimmed.starts_with("#") {
                continue;
            }

            // Detect loop starts
            if self.is_loop_start(trimmed) {
                current_depth += 1;
                max_depth = max_depth.max(current_depth);
            }

            // Detect block ends based on language
            match self.language.to_lowercase().as_str() {
                "python" => {
                    if self.is_python_dedent(line) {
                        current_depth = current_depth.saturating_sub(1);
                    }
                }
                _ => {
                    let close_braces = line.matches('}').count();
                    current_depth = current_depth.saturating_sub(close_braces);
                }
            }
        }

        max_depth.min(10) // Cap at reasonable depth
    }

    fn is_loop_start(&self, line: &str) -> bool {
        match self.language.to_lowercase().as_str() {
            "python" => line.starts_with("for ") || line.starts_with("while "),
            _ => {
                line.starts_with("for ")
                    || line.starts_with("for(")
                    || line.starts_with("while ")
                    || line.starts_with("while(")
                    || line.contains("for (")
                    || line.contains("while (")
            }
        }
    }

    fn is_python_dedent(&self, line: &str) -> bool {
        !line.trim().is_empty()
            && !line.starts_with(' ')
            && !line.starts_with('\t')
            && !line.trim().starts_with('#')
    }

    fn count_function_calls(&self, code: &str, function_name: &str) -> usize {
        if function_name.len() > 50 {
            // Avoid processing very long names
            return 0;
        }
        let pattern = format!("{}(", function_name);
        code.matches(&pattern).count().min(100) // Cap at reasonable number
    }

    fn detect_binary_search(&self, code: &str) -> bool {
        let has_mid = code.contains("mid") || code.contains("middle");
        let has_bounds = (code.contains("left") || code.contains("low") || code.contains("start"))
            && (code.contains("right") || code.contains("high") || code.contains("end"));
        let has_division = code.contains("/2")
            || code.contains(">> 1")
            || code.contains("div 2")
            || code.contains("// 2");

        has_mid && has_bounds && has_division
    }

    fn detect_sorting(&self, code: &str) -> bool {
        let sorting_patterns = [
            "sort(",
            ".sort(",
            "sorted(",
            "quicksort",
            "mergesort",
            "Arrays.sort",
            "Collections.sort",
        ];

        sorting_patterns
            .iter()
            .any(|pattern| code.to_lowercase().contains(&pattern.to_lowercase()))
    }

    fn detect_dynamic_programming(&self, code: &str) -> bool {
        let dp_indicators = ["memo", "cache", "dp[", "table[", "@lru_cache", "@cache"];

        dp_indicators
            .iter()
            .any(|indicator| code.to_lowercase().contains(&indicator.to_lowercase()))
    }

    fn detect_factorial_pattern(&self, code: &str) -> bool {
        code.contains("factorial") || (code.contains("*") && code.contains("n-1"))
    }

    fn is_divide_and_conquer(&self, code: &str) -> bool {
        let has_division = code.contains("mid") || code.contains("/2") || code.contains(">> 1");
        let has_merge_combine = code.contains("merge") || code.contains("combine");
        has_division && has_merge_combine
    }

    fn is_tail_recursive(&self, code: &str, function_name: &str) -> bool {
        let lines: Vec<&str> = code.lines().collect();
        let pattern = format!("{}(", function_name);

        for line in lines.iter().rev().take(10) {
            // Only check last few lines
            let trimmed = line.trim();
            if trimmed.contains(&pattern) {
                return trimmed.starts_with("return ");
            }
        }
        false
    }

    fn is_fibonacci_like(&self, code: &str, function_name: &str) -> bool {
        let pattern = format!("{}(", function_name);
        let call_count = code.matches(&pattern).count();

        call_count >= 2
            && (code.contains("n-1") || code.contains("n - 1"))
            && (code.contains("n-2") || code.contains("n - 2"))
    }

    fn get_overall_complexity(&self, functions: &[FunctionAnalysis]) -> String {
        if functions.is_empty() {
            return "O(1)".to_string();
        }

        let complexity_order = [
            "O(n!)",
            "O(2ⁿ)",
            "O(n^k)",
            "O(n³)",
            "O(n²)",
            "O(n log n)",
            "O(n)",
            "O(log n)",
            "O(1)",
        ];

        for &complexity in &complexity_order {
            if functions.iter().any(|f| f.complexity == complexity) {
                return complexity.to_string();
            }
        }

        "O(1)".to_string()
    }
}

#[wasm_bindgen]
pub fn analyze_complexity(code: &str, language: &str) -> Result<JsValue, JsValue> {
    // Early validation
    if code.is_empty() {
        return Err(JsValue::from_str("Empty code provided"));
    }

    if code.len() > 500_000 {
        // 500KB limit
        return Err(JsValue::from_str("Code too large to analyze"));
    }

    console_log!(
        "Analyzing complexity for {} code ({} chars)",
        language,
        code.len()
    );

    let analyzer = ComplexityAnalyzer::new(language);
    let result = analyzer.analyze(code);

    serde_wasm_bindgen::to_value(&result).map_err(|e| {
        console_log!("Serialization error: {}", e);
        JsValue::from_str("Failed to serialize result")
    })
}

#[wasm_bindgen]
pub fn get_supported_languages() -> Vec<JsValue> {
    vec![
        JsValue::from_str("javascript"),
        JsValue::from_str("typescript"),
        JsValue::from_str("python"),
        JsValue::from_str("java"),
        JsValue::from_str("c"),
        JsValue::from_str("cpp"),
        JsValue::from_str("rust"),
    ]
}

#[wasm_bindgen]
pub fn init() {
    console_log!("Rust-WASM Big O Analyzer initialized");
}

#[wasm_bindgen(start)]
pub fn main() {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();

    console_log!("WASM module loaded successfully");
}
