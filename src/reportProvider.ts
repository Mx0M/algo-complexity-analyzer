import * as vscode from 'vscode';
import { AnalysisResult, ComplexityAnalyzer } from './complexityAnalyzer';

export class ReportProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private _lastResult?: AnalysisResult;

    constructor(private context: vscode.ExtensionContext) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this.context.extensionUri
            ]
        };

        this.updateWebview();

        // Handle messages from webview
        webviewView.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'export':
                        vscode.commands.executeCommand('complexityAnalyzer.exportReport');
                        break;
                    case 'refresh':
                        this.updateWebview();
                        break;
                }
            },
            undefined,
            this.context.subscriptions
        );
    }

    public async updateReport(result: AnalysisResult, fileName?: string) {
        this._lastResult = {
            ...result,
            file_name: fileName
        };
        this.updateWebview();
    }

    public getLastResult(): AnalysisResult | undefined {
        return this._lastResult;
    }

    private updateWebview() {
        if (!this._view) {
            return;
        }

        this._view.webview.html = this.getWebviewContent();
    }

    private getWebviewContent(): string {
        if (!this._lastResult) {
            return this.getEmptyStateContent();
        }

        const config = vscode.workspace.getConfiguration('complexityAnalyzer');
        const theme = config.get<string>('theme', 'auto');
        
        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Complexity Analysis Report</title>
            <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
            <script src="https://d3js.org/d3.v7.min.js"></script>
            <style>
                :root {
                    --bg-color: ${theme === 'dark' ? '#1e1e1e' : '#ffffff'};
                    --text-color: ${theme === 'dark' ? '#cccccc' : '#333333'};
                    --border-color: ${theme === 'dark' ? '#3c3c3c' : '#e1e4e8'};
                    --card-bg: ${theme === 'dark' ? '#252526' : '#f6f8fa'};
                    --success-color: #28a745;
                    --warning-color: #ffc107;
                    --danger-color: #dc3545;
                }

                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    background-color: var(--bg-color);
                    color: var(--text-color);
                    margin: 0;
                    padding: 16px;
                    line-height: 1.6;
                }

                .header {
                    border-bottom: 1px solid var(--border-color);
                    padding-bottom: 16px;
                    margin-bottom: 24px;
                }

                .header h1 {
                    margin: 0;
                    font-size: 24px;
                    font-weight: 600;
                }

                .header .meta {
                    margin-top: 8px;
                    font-size: 14px;
                    opacity: 0.8;
                }

                .summary-cards {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 16px;
                    margin-bottom: 24px;
                }

                .summary-card {
                    background: var(--card-bg);
                    border: 1px solid var(--border-color);
                    border-radius: 8px;
                    padding: 16px;
                    text-align: center;
                }

                .summary-card h3 {
                    margin: 0 0 8px 0;
                    font-size: 18px;
                    font-weight: 600;
                }

                .summary-card .value {
                    font-size: 24px;
                    font-weight: 700;
                    margin: 8px 0;
                }

                .summary-card .description {
                    font-size: 12px;
                    opacity: 0.7;
                }

                .complexity-badge {
                    display: inline-block;
                    padding: 4px 12px;
                    border-radius: 16px;
                    font-size: 14px;
                    font-weight: 600;
                    color: white;
                    margin: 4px 2px;
                }

                .chart-container {
                    background: var(--card-bg);
                    border: 1px solid var(--border-color);
                    border-radius: 8px;
                    padding: 16px;
                    margin-bottom: 24px;
                }

                .chart-container h3 {
                    margin: 0 0 16px 0;
                    font-size: 18px;
                    font-weight: 600;
                }

                .functions-list {
                    background: var(--card-bg);
                    border: 1px solid var(--border-color);
                    border-radius: 8px;
                    padding: 16px;
                    margin-bottom: 24px;
                }

                .function-item {
                    border-bottom: 1px solid var(--border-color);
                    padding: 16px 0;
                }

                .function-item:last-child {
                    border-bottom: none;
                }

                .function-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 8px;
                }

                .function-name {
                    font-size: 16px;
                    font-weight: 600;
                    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
                }

                .function-location {
                    font-size: 12px;
                    opacity: 0.6;
                }

                .function-details {
                    margin-top: 8px;
                }

                .detail-item {
                    font-size: 14px;
                    margin: 4px 0;
                    padding-left: 16px;
                    position: relative;
                }

                .detail-item:before {
                    content: "•";
                    position: absolute;
                    left: 0;
                    color: var(--text-color);
                    opacity: 0.5;
                }

                .warnings {
                    background: #fff3cd;
                    border: 1px solid #ffeaa7;
                    border-radius: 8px;
                    padding: 16px;
                    margin-bottom: 24px;
                    color: #856404;
                }

                .warnings h3 {
                    margin: 0 0 8px 0;
                    font-size: 16px;
                }

                .actions {
                    display: flex;
                    gap: 8px;
                    margin-top: 24px;
                }

                .btn {
                    padding: 8px 16px;
                    border: 1px solid var(--border-color);
                    border-radius: 4px;
                    background: var(--card-bg);
                    color: var(--text-color);
                    cursor: pointer;
                    font-size: 14px;
                }

                .btn:hover {
                    opacity: 0.8;
                }

                .btn-primary {
                    background: #007acc;
                    color: white;
                    border-color: #007acc;
                }

                .complexity-chart {
                    height: 300px;
                    margin: 16px 0;
                }

                .complexity-distribution {
                    height: 250px;
                    margin: 16px 0;
                }

                .confidence-indicator {
                    display: inline-block;
                    width: 60px;
                    height: 8px;
                    background: #e9ecef;
                    border-radius: 4px;
                    margin-left: 8px;
                    position: relative;
                }

                .confidence-bar {
                    height: 100%;
                    border-radius: 4px;
                    transition: width 0.3s ease;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>Algorithm Complexity Analysis</h1>
                <div class="meta">
                    ${this._lastResult.file_name ? `File: ${this._lastResult.file_name} • ` : ''}
                    Language: ${this._lastResult.language} • 
                    Analyzed: ${new Date(this._lastResult.timestamp || Date.now()).toLocaleString()}
                </div>
            </div>

            ${this.generateSummaryCards()}
            ${this.generateWarnings()}
            ${this.generateCharts()}
            ${this.generateFunctionsList()}

            <div class="actions">
                <button class="btn btn-primary" onclick="exportReport()">Export Report</button>
                <button class="btn" onclick="refreshReport()">Refresh</button>
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                const analysisData = ${JSON.stringify(this._lastResult)};

                function exportReport() {
                    vscode.postMessage({ command: 'export' });
                }

                function refreshReport() {
                    vscode.postMessage({ command: 'refresh' });
                }

                // Initialize charts
                document.addEventListener('DOMContentLoaded', function() {
                    initializeCharts();
                });

                function initializeCharts() {
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
                                    backgroundColor: Object.keys(complexityData).map(complexity => 
                                        getComplexityColor(complexity)
                                    ),
                                    borderWidth: 2,
                                    borderColor: 'var(--border-color)'
                                }]
                            },
                            options: {
                                responsive: true,
                                maintainAspectRatio: false,
                                plugins: {
                                    legend: {
                                        position: 'bottom',
                                        labels: {
                                            color: 'var(--text-color)',
                                            padding: 20
                                        }
                                    },
                                    title: {
                                        display: true,
                                        text: 'Complexity Distribution',
                                        color: 'var(--text-color)',
                                        font: {
                                            size: 16,
                                            weight: 'bold'
                                        }
                                    }
                                }
                            }
                        });
                    }

                    // Function complexity comparison chart
                    const funcCtx = document.getElementById('functionChart');
                    if (funcCtx && analysisData.functions.length > 0) {
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
                                            color: 'var(--text-color)',
                                            callback: function(value) {
                                                const complexities = ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)', 'O(n²)', 'O(n³)', 'O(n^k)', 'O(2ⁿ)', 'O(n!)'];
                                                return complexities[value] || value;
                                            }
                                        },
                                        grid: {
                                            color: 'var(--border-color)'
                                        }
                                    },
                                    x: {
                                        ticks: {
                                            color: 'var(--text-color)',
                                            maxRotation: 45
                                        },
                                        grid: {
                                            color: 'var(--border-color)'
                                        }
                                    }
                                },
                                plugins: {
                                    legend: {
                                        display: false
                                    },
                                    title: {
                                        display: true,
                                        text: 'Function Complexity Comparison',
                                        color: 'var(--text-color)',
                                        font: {
                                            size: 16,
                                            weight: 'bold'
                                        }
                                    }
                                }
                            }
                        });
                    }

                    // Confidence visualization
                    document.querySelectorAll('.confidence-bar').forEach((bar, index) => {
                        const confidence = analysisData.functions[index]?.confidence || 0;
                        bar.style.width = (confidence * 100) + '%';
                        bar.style.backgroundColor = confidence > 0.8 ? '#28a745' : confidence > 0.6 ? '#ffc107' : '#dc3545';
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
            </script>
        </body>
        </html>`;
    }

    private generateSummaryCards(): string {
        if (!this._lastResult){
                return '';
            };

        const overallComplexity = this._lastResult.overall;
        const functionCount = this._lastResult.functions.length;
        const avgConfidence = this._lastResult.functions.length > 0 
            ? this._lastResult.functions.reduce((sum, f) => sum + f.confidence, 0) / this._lastResult.functions.length 
            : 0;

        return `
        <div class="summary-cards">
            <div class="summary-card">
                <h3>Overall Complexity</h3>
                <div class="value">
                    <span class="complexity-badge" style="background-color: ${ComplexityAnalyzer.getComplexityColor(overallComplexity)}">
                        ${overallComplexity}
                    </span>
                </div>
                <div class="description">${ComplexityAnalyzer.getComplexityDescription(overallComplexity)}</div>
            </div>
            <div class="summary-card">
                <h3>Functions Analyzed</h3>
                <div class="value">${functionCount}</div>
                <div class="description">Total functions found in code</div>
            </div>
            <div class="summary-card">
                <h3>Average Confidence</h3>
                <div class="value">${(avgConfidence * 100).toFixed(1)}%</div>
                <div class="description">Analysis confidence level</div>
            </div>
        </div>`;
    }

    private generateWarnings(): string {
        if (!this._lastResult?.warnings || this._lastResult.warnings.length === 0) {
            return '';
        }

        return `
        <div class="warnings">
            <h3>⚠️ Warnings</h3>
            ${this._lastResult.warnings.map(warning => `<div>• ${warning}</div>`).join('')}
        </div>`;
    }

    private generateCharts(): string {
        if (!this._lastResult?.functions || this._lastResult.functions.length === 0) {
            return '';
        }

        return `
        <div class="chart-container">
            <h3>Complexity Distribution</h3>
            <div class="complexity-chart">
                <canvas id="complexityChart"></canvas>
            </div>
        </div>
        
        <div class="chart-container">
            <h3>Function Complexity Comparison</h3>
            <div class="complexity-chart">
                <canvas id="functionChart"></canvas>
            </div>
        </div>`;
    }

    private generateFunctionsList(): string {
        if (!this._lastResult?.functions || this._lastResult.functions.length === 0) {
            return '<div class="functions-list"><h3>No functions found</h3></div>';
        }

        return `
        <div class="functions-list">
            <h3>Function Analysis Details</h3>
            ${this._lastResult.functions.map((func, index) => `
                <div class="function-item">
                    <div class="function-header">
                        <div>
                            <div class="function-name">${func.function}</div>
                            <div class="function-location">Lines ${func.line_start}-${func.line_end}</div>
                        </div>
                        <div>
                            <span class="complexity-badge" style="background-color: ${ComplexityAnalyzer.getComplexityColor(func.complexity)}">
                                ${func.complexity}
                            </span>
                            <div class="confidence-indicator">
                                <div class="confidence-bar"></div>
                            </div>
                            <small>${(func.confidence * 100).toFixed(1)}%</small>
                        </div>
                    </div>
                    <div class="function-details">
                        ${func.details.map(detail => `<div class="detail-item">${detail}</div>`).join('')}
                    </div>
                </div>
            `).join('')}
        </div>`;
    }

    private getEmptyStateContent(): string {
        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Algorithm Complexity Analyzer</title>
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    padding: 24px;
                    text-align: center;
                    color: var(--vscode-foreground);
                }
                .empty-state {
                    max-width: 400px;
                    margin: 0 auto;
                }
                .icon {
                    font-size: 64px;
                    margin-bottom: 16px;
                    opacity: 0.5;
                }
                h2 {
                    margin-bottom: 16px;
                    font-weight: 600;
                }
                p {
                    margin-bottom: 24px;
                    opacity: 0.8;
                    line-height: 1.6;
                }
                .actions {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }
                .btn {
                    padding: 8px 16px;
                    border: 1px solid var(--vscode-button-border);
                    border-radius: 4px;
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    cursor: pointer;
                    text-decoration: none;
                }
            </style>
        </head>
        <body>
            <div class="empty-state">
                <div class="icon">📊</div>
                <h2>No Analysis Results</h2>
                <p>Select some code or open a file and run the complexity analyzer to see detailed results here.</p>
                <div class="actions">
                    <button class="btn" onclick="analyzeCurrentFile()">Analyze Current File</button>
                    <button class="btn" onclick="showCommands()">Show All Commands</button>
                </div>
            </div>
            
            <script>
                const vscode = acquireVsCodeApi();
                
                function analyzeCurrentFile() {
                    vscode.postMessage({ command: 'analyzeFile' });
                }
                
                function showCommands() {
                    vscode.postMessage({ command: 'showCommands' });
                }
            </script>
        </body>
        </html>`;
    }
}