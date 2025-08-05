import * as vscode from 'vscode';
import { AnalysisResult, ComplexityAnalyzer } from './complexityAnalyzer';

export class DecorationProvider {
    private decorationTypes: Map<string, vscode.TextEditorDecorationType> = new Map();

    constructor() {
        this.initializeDecorationTypes();
    }

    private initializeDecorationTypes() {
        const complexities = ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)', 'O(n²)', 'O(n³)', 'O(n^k)', 'O(2ⁿ)', 'O(n!)'];
        
        complexities.forEach(complexity => {
            const color = ComplexityAnalyzer.getComplexityColor(complexity);
            const decorationType = vscode.window.createTextEditorDecorationType({
                after: {
                    contentText: ` ${complexity}`,
                    color: color,
                    fontWeight: 'bold',
                    margin: '0 0 0 1em'
                },
                rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
                overviewRulerColor: color,
                overviewRulerLane: vscode.OverviewRulerLane.Right,
                light: {
                    border: `1px solid ${color}30`,
                    backgroundColor: `${color}10`
                },
                dark: {
                    border: `1px solid ${color}50`,
                    backgroundColor: `${color}20`
                }
            });
            
            this.decorationTypes.set(complexity, decorationType);
        });
    }

    public applyDecorations(editor: vscode.TextEditor | undefined, result: AnalysisResult) {
        if (!editor) {
            return;
        }

        // Clear existing decorations
        this.clearDecorations(editor);

        // Apply function-level decorations
        const decorationMap = new Map<string, vscode.DecorationOptions[]>();

        result.functions.forEach(func => {
            const startLine = Math.max(0, func.line_start - 1);
            const endLine = Math.max(0, func.line_end - 1);
            
            if (startLine < editor.document.lineCount) {
                const range = new vscode.Range(
                    new vscode.Position(startLine, 0),
                    new vscode.Position(Math.min(endLine, editor.document.lineCount - 1), 0)
                );

                const decorationOptions: vscode.DecorationOptions = {
                    range,
                    hoverMessage: this.createHoverMessage(func)
                };

                if (!decorationMap.has(func.complexity)) {
                    decorationMap.set(func.complexity, []);
                }
                decorationMap.get(func.complexity)?.push(decorationOptions);
            }
        });

        // Apply decorations by complexity type
        decorationMap.forEach((decorations, complexity) => {
            const decorationType = this.decorationTypes.get(complexity);
            if (decorationType) {
                editor.setDecorations(decorationType, decorations);
            }
        });

        // Apply overall complexity decoration to the first line
        if (result.overall && editor.document.lineCount > 0) {
            const overallDecorationType = this.decorationTypes.get(result.overall);
            if (overallDecorationType) {
                const overallRange = new vscode.Range(
                    new vscode.Position(0, 0),
                    new vscode.Position(0, 0)
                );

                const overallDecoration: vscode.DecorationOptions = {
                    range: overallRange,
                    hoverMessage: this.createOverallHoverMessage(result)
                };

                editor.setDecorations(overallDecorationType, [overallDecoration]);
            }
        }
    }

    private createHoverMessage(func: any): vscode.MarkdownString {
        const hover = new vscode.MarkdownString();
        hover.isTrusted = true;
        hover.supportHtml = true;

        const complexityColor = ComplexityAnalyzer.getComplexityColor(func.complexity);
        const description = ComplexityAnalyzer.getComplexityDescription(func.complexity);

        hover.appendMarkdown(`### Function: \`${func.function}\`\n\n`);
        hover.appendMarkdown(`**Complexity:** <span style="color: ${complexityColor}; font-weight: bold;">${func.complexity}</span>\n\n`);
        hover.appendMarkdown(`**Description:** ${description}\n\n`);
        hover.appendMarkdown(`**Confidence:** ${(func.confidence * 100).toFixed(1)}%\n\n`);
        hover.appendMarkdown(`**Lines:** ${func.line_start} - ${func.line_end}\n\n`);

        if (func.details && func.details.length > 0) {
            hover.appendMarkdown(`**Analysis Details:**\n`);
            func.details.forEach((detail: string) => {
                hover.appendMarkdown(`- ${detail}\n`);
            });
        }

        return hover;
    }

    private createOverallHoverMessage(result: AnalysisResult): vscode.MarkdownString {
        const hover = new vscode.MarkdownString();
        hover.isTrusted = true;
        hover.supportHtml = true;

        const complexityColor = ComplexityAnalyzer.getComplexityColor(result.overall);
        const description = ComplexityAnalyzer.getComplexityDescription(result.overall);

        hover.appendMarkdown(`### Overall File Complexity\n\n`);
        hover.appendMarkdown(`**Complexity:** <span style="color: ${complexityColor}; font-weight: bold;">${result.overall}</span>\n\n`);
        hover.appendMarkdown(`**Description:** ${description}\n\n`);
        hover.appendMarkdown(`**Language:** ${result.language}\n\n`);
        hover.appendMarkdown(`**Functions Analyzed:** ${result.functions.length}\n\n`);

        if (result.warnings && result.warnings.length > 0) {
            hover.appendMarkdown(`**Warnings:**\n`);
            result.warnings.forEach(warning => {
                hover.appendMarkdown(`- ⚠️ ${warning}\n`);
            });
        }

        const avgConfidence = result.functions.length > 0 
            ? result.functions.reduce((sum, f) => sum + f.confidence, 0) / result.functions.length 
            : 0;
        hover.appendMarkdown(`\n**Average Confidence:** ${(avgConfidence * 100).toFixed(1)}%\n`);

        return hover;
    }

    private clearDecorations(editor: vscode.TextEditor) {
        this.decorationTypes.forEach(decorationType => {
            editor.setDecorations(decorationType, []);
        });
    }

    public dispose() {
        this.decorationTypes.forEach(decorationType => {
            decorationType.dispose();
        });
        this.decorationTypes.clear();
    }
}