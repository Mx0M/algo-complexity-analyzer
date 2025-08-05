import * as vscode from 'vscode';
import * as path from 'path';
import { AnalysisResult, ComplexityAnalyzer } from './complexityAnalyzer';

export class ExportManager {
    
    public async exportReport(result: AnalysisResult) {
        const options = await vscode.window.showQuickPick([
            { label: 'JSON Report', description: 'Export as JSON file', format: 'json' },
            { label: 'HTML Report', description: 'Export as HTML with charts', format: 'html' },
            { label: 'Markdown Report', description: 'Export as Markdown file', format: 'md' },
            { label: 'CSV Data', description: 'Export function data as CSV', format: 'csv' }
        ], {
            placeHolder: 'Choose export format'
        });

        if (!options) {
            return;
        }

        const defaultFileName = `complexity-report-${Date.now()}`;
        const fileUri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(path.join(vscode.workspace.rootPath || '', `${defaultFileName}.${options.format}`)),
            filters: this.getFileFilters(options.format)
        });

        if (!fileUri) {
            return;
        }

        try {
            let content: string;
            
            switch (options.format) {
                case 'json':
                    content = this.exportAsJson(result);
                    break;
                case 'html':
                    content = this.exportAsHtml(result);
                    break;
                case 'md':
                    content = this.exportAsMarkdown(result);
                    break;
                case 'csv':
                    content = this.exportAsCsv(result);
                    break;
                default:
                    throw new Error('Unsupported format');
            }

            await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, 'utf8'));
            
            const action = await vscode.window.showInformationMessage(
                `Report exported successfully to ${fileUri.fsPath}`,
                'Open File'
            );
            
            if (action === 'Open File') {
                vscode.commands.executeCommand('vscode.open', fileUri);
            }
            
        } catch (error) {
            vscode.window.showErrorMessage(`Export failed: ${error}`);
        }
    }

    private getFileFilters(format: string): { [name: string]: string[] } {
        switch (format) {
            case 'json':
                return { 'JSON Files': ['json'] };
            case 'html':
                return { 'HTML Files': ['html', 'htm'] };
            case 'md':
                return { 'Markdown Files': ['md', 'markdown'] };
            case 'csv':
                return { 'CSV Files': ['csv'] };
            default:
                return { 'All Files': ['*'] };
        }
    }

    private exportAsJson(result: AnalysisResult): string {
        return JSON.stringify(result, null, 2);
    }

    private exportAsMarkdown(result: AnalysisResult): string {
        const timestamp = new Date(result.timestamp || Date.now()).toLocaleString();
        
        let md = `# Algorithm Complexity Analysis Report\n\n`;
        md += `**Generated:** ${timestamp}\n`;
        md += `**Language:** ${result.language}\n`;
        if (result.file_name) {
            md += `**File:** ${result.file_name}\n`;
        }
        md += `\n`;

        // Summary
        md += `## Summary\n\n`;
        md += `- **Overall Complexity:** ${result.overall}\n`;
        md += `- **Functions Analyzed:** ${result.functions.length}\n`;
        if (result.functions.length > 0) {
            const avgConfidence = result.functions.reduce((sum, f) => sum + f.confidence, 0) / result.functions.length;
            md += `- **Average Confidence:** ${(avgConfidence * 100).toFixed(1)}%\n`;
        }
        md += `\n`;

        // Warnings
        if (result.warnings && result.warnings.length > 0) {
            md += `## ⚠️ Warnings\n\n`;
            result.warnings.forEach(warning => {
                md += `- ${warning}\n`;
            });
            md += `\n`;
        }

        // Complexity Distribution
        if (result.functions.length > 0) {
            md += `## Complexity Distribution\n\n`;
            const complexityCount: { [key: string]: number } = {};
            result.functions.forEach(func => {
                complexityCount[func.complexity] = (complexityCount[func.complexity] || 0) + 1;
            });

            md += `| Complexity | Count | Percentage |\n`;
            md += `|------------|-------|------------|\n`;
            Object.entries(complexityCount).forEach(([complexity, count]) => {
                const percentage = ((count / result.functions.length) * 100).toFixed(1);
                md += `| ${complexity} | ${count} | ${percentage}% |\n`;
            });
            md += `\n`;
        }

        // Function Details
        if (result.functions.length > 0) {
            md += `## Function Analysis\n\n`;
            result.functions.forEach(func => {
                md += `### \`${func.function}\`\n\n`;
                md += `- **Complexity:** ${func.complexity}\n`;
                md += `- **Confidence:** ${(func.confidence * 100).toFixed(1)}%\n`;
                md += `- **Lines:** ${func.line_start} - ${func.line_end}\n`;
                md += `- **Description:** ${ComplexityAnalyzer.getComplexityDescription(func.complexity)}\n`;
                
                if (func.details && func.details.length > 0) {
                    md += `- **Analysis Details:**\n`;
                    func.details.forEach(detail => {
                        md += `  - ${detail}\n`;
                    });
                }
                md += `\n`;
            });
        }

        return md;
    }

    private exportAsCsv(result: AnalysisResult): string {
        let csv = 'Function,Complexity,Confidence,Line Start,Line End,Description\n';
        
        result.functions.forEach(func => {
            const description = ComplexityAnalyzer.getComplexityDescription(func.complexity);
            csv += `"${func.function}","${func.complexity}",${func.confidence},${func.line_start},${func.line_end},"${description}"\n`;
        });

        return csv;
    }

    private exportAsHtml(result: AnalysisResult): string {
        const timestamp = new Date(result.timestamp || Date.now()).toLocaleString();
        
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Algorithm Complexity Analysis Report</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            line-height: 1.6;
            color: #333;
        }
        
        .header {
            border-bottom: 2px solid #e1e4e8;
            padding-bottom: 20px;
            margin-bottom: 30px;
        }
        
        .header h1 {
            margin: 0;
            color: #24292e;
            font-size: 32px;
        }
        
        .meta {
            margin-top: 10px;
            color: #586069;
            font-size: 14px;
        }
        
        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        
        .summary-card {
            background: #f6f8fa;
            border: 1px solid #e1e4e8;
            border-radius: 8px;
            padding: 20px;
            text-align: center;
        }
        
        .summary-card h3 {
            margin: 0 0 10px 0;
            color: #24292e;
        }
        
        .summary-card .value {
            font-size: 24px;
            font-weight: bold;
            margin: 10px 0;
        }
        
        .complexity-badge {
            display: inline-block;
            padding: 6px 12px;
            border-radius: 16px;
            color: white;
            font-weight: bold;
            font-size: 14px;
        }
        
        .chart-container {
            background: #fff;
            border: 1px solid #e1e4e8;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 30px;
        }
        
        .chart-container h3 {
            margin: 0 0 20px 0;
            color: #24292e;
        }
        
        .functions-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
        }
        
        .functions-table th,
        .functions-table td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #e1e4e8;
        }
        
        .functions-table th {
            background: #f6f8fa;
            font-weight: 600;
        }
        
        .warnings {
            background: #fff3cd;
            border: 1px solid #ffeaa7;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 30px;
        }
        
        .warnings h3 {
            margin: 0 0 10px 0;
            color: #856404;
        }
        
        .warning-item {
            margin: 5px 0;
            color: #856404;
        }
        
        .chart-canvas {
            max-height: 400px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Algorithm Complexity Analysis Report</h1>
        <div class="meta">
            Generated: ${timestamp} | 
            Language: ${result.language}
            ${result.file_name ? ` | File: ${result.file_name}` : ''}
        </div>
    </div>

    <div class="summary-grid">
        <div class="summary-card">
            <h3>Overall Complexity</h3>
            <div class="value">
                <span class="complexity-badge" style="background-color: ${ComplexityAnalyzer.getComplexityColor(result.overall)}">
                    ${result.overall}
                </span>
            </div>
            <div>${ComplexityAnalyzer.getComplexityDescription(result.overall)}</div>
        </div>
        <div class="summary-card">
            <h3>Functions Analyzed</h3>
            <div class="value">${result.functions.length}</div>
            <div>Total functions found</div>
        </div>
        <div class="summary-card">
            <h3>Average Confidence</h3>
            <div class="value">${result.functions.length > 0 ? ((result.functions.reduce((sum, f) => sum + f.confidence, 0) / result.functions.length) * 100).toFixed(1) : 0}%</div>
            <div>Analysis confidence level</div>
        </div>
    </div>

    ${result.warnings && result.warnings.length > 0 ? `
    <div class="warnings">
        <h3>⚠️ Warnings</h3>
        ${result.warnings.map(warning => `<div class="warning-item">• ${warning}</div>`).join('')}
    </div>
    ` : ''}

    ${result.functions.length > 0 ? `
    <div class="chart-container">
        <h3>Complexity Distribution</h3>
        <canvas id="complexityChart" class="chart-canvas"></canvas>
    </div>

    <div class="chart-container">
        <h3>Function Complexity Comparison</h3>
        <canvas id="functionChart" class="chart-canvas"></canvas>
    </div>

    <div class="chart-container">
        <h3>Function Analysis Details</h3>
        <table class="functions-table">
            <thead>
                <tr>
                    <th>Function</th>
                    <th>Complexity</th>
                    <th>Confidence</th>
                    <th>Lines</th>
                    <th>Details</th>
                </tr>
            </thead>
            <tbody>
                ${result.functions.map(func => `
                <tr>
                    <td><code>${func.function}</code></td>
                    <td>
                        <span class="complexity-badge" style="background-color: ${ComplexityAnalyzer.getComplexityColor(func.complexity)}">
                            ${func.complexity}
                        </span>
                    </td>
                    <td>${(func.confidence * 100).toFixed(1)}%</td>
                    <td>${func.line_start}-${func.line_end}</td>
                    <td>${func.details.join('; ')}</td>
                </tr>
                `).join('')}
            </tbody>
        </table>
    </div>
    ` : '<div class="chart-container"><h3>No functions found for analysis</h3></div>'}

    <script>
        const analysisData = ${JSON.stringify(result)};

        document.addEventListener('DOMContentLoaded', function() {
            if (analysisData.functions.length === 0) return;

            // Complexity distribution chart
            const complexityData = {};
            analysisData.functions.forEach(func => {
                complexityData[func.complexity] = (complexityData[func.complexity] || 0) + 1;
            });

            const ctx = document.getElementById('complexityChart');
            if (ctx) {
                new Chart(ctx, {
                    type: 'doughnut',
                    data: {
                        labels: Object.keys(complexityData),
                        datasets: [{
                            data: Object.values(complexityData),
                            backgroundColor: Object.keys(complexityData).map(complexity => getComplexityColor(complexity)),
                            borderWidth: 2,
                            borderColor: '#fff'
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                position: 'bottom',
                                labels: {
                                    padding: 20
                                }
                            }
                        }
                    }
                });
            }

            // Function complexity comparison chart
            const funcCtx = document.getElementById('functionChart');
            if (funcCtx) {
                new Chart(funcCtx, {
                    type: 'bar',
                    data: {
                        labels: analysisData.functions.map(f => f.function),
                        datasets: [{
                            label: 'Complexity Order',
                            data: analysisData.functions.map(f => getComplexityOrder(f.complexity)),
                            backgroundColor: analysisData.functions.map(f => getComplexityColor(f.complexity)),
                            borderColor: analysisData.functions.map(f => getComplexityColor(f.complexity)),
                            borderWidth: 1
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            y: {
                                beginAtZero: true,
                                ticks: {
                                    callback: function(value) {
                                        const complexities = ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)', 'O(n²)', 'O(n³)', 'O(n^k)', 'O(2ⁿ)', 'O(n!)'];
                                        return complexities[value] || value;
                                    }
                                }
                            },
                            x: {
                                ticks: {
                                    maxRotation: 45
                                }
                            }
                        },
                        plugins: {
                            legend: {
                                display: false
                            }
                        }
                    }
                });
            }

            function getComplexityColor(complexity) {
                const colors = {
                    'O(1)': '#28a745',
                    'O(log n)': '#20c997',
                    'O(n)': '#ffc107',
                    'O(n log n)': '#fd7e14',
                    'O(n²)': '#dc3545',
                    'O(n³)': '#6f42c1',
                    'O(n^k)': '#e83e8c',
                    'O(2ⁿ)': '#343a40',
                    'O(n!)': '#000000'
                };
                return colors[complexity] || '#6c757d';
            }

            function getComplexityOrder(complexity) {
                const order = {
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
                return order[complexity] || 0;
            }
        });
    </script>
</body>
</html>`;
    }
}