/**
 * Performance-related commands for the Goal Tree extension
 */

import * as vscode from 'vscode';
import { GoalTreeProvider } from '../providers/goalTreeProvider';
import { GoalTreePerformanceTest, runPerformanceTests } from '../test/performance-test';
import { createLogger } from '../utils/logger';

const logger = createLogger('PerformanceCommands');

/**
 * Register performance-related commands
 */
export function registerPerformanceCommands(
    context: vscode.ExtensionContext,
    provider: GoalTreeProvider
): void {
    // Command to run performance tests
    const runTestsCommand = vscode.commands.registerCommand(
        'goalTree.performance.runTests',
        async () => {
            try {
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: 'Running Goal Tree Performance Tests',
                    cancellable: false
                }, async (progress) => {
                    progress.report({ increment: 0, message: 'Initializing tests...' });
                    
                    await runPerformanceTests(context);
                    
                    progress.report({ increment: 100, message: 'Tests completed' });
                });
            } catch (error) {
                logger.error('Error running performance tests', error);
                vscode.window.showErrorMessage(`Failed to run performance tests: ${error}`);
            }
        }
    );

    // Command to show performance stats
    const showStatsCommand = vscode.commands.registerCommand(
        'goalTree.performance.showStats',
        async () => {
            try {
                const stats = provider.getPerformanceStats();
                const statsMessage = `Goal Tree Performance Stats:
Cache Size: ${stats.cacheSize} entries
Loading States: ${stats.loadingStates}
Expanded Items: ${stats.expandedItems}
Total Tracked Items: ${stats.totalTrackedItems}
Debounce Info: ${JSON.stringify(stats.debounceInfo, null, 2)}

Configuration:
Lazy Loading: ${stats.config.enableLazyLoading ? 'Enabled' : 'Disabled'}
Virtual Scrolling: ${stats.config.enableVirtualScrolling ? 'Enabled' : 'Disabled'}
Cache: ${stats.config.cacheEnabled ? 'Enabled' : 'Disabled'}
Max Goals in View: ${stats.config.maxGoalsInView}
Debounce Interval: ${stats.config.debounceInterval}ms`;

                // Show stats in a webview or info message
                const panel = vscode.window.createWebviewPanel(
                    'goalTreePerformanceStats',
                    'Goal Tree Performance Stats',
                    vscode.ViewColumn.One,
                    {}
                );

                panel.webview.html = createStatsHtml(stats);
                
                logger.info('Performance stats displayed', stats);
            } catch (error) {
                logger.error('Error showing performance stats', error);
                vscode.window.showErrorMessage(`Failed to show performance stats: ${error}`);
            }
        }
    );

    // Command to reset performance components
    const resetCommand = vscode.commands.registerCommand(
        'goalTree.performance.reset',
        async () => {
            try {
                const choice = await vscode.window.showQuickPick(
                    [
                        { label: 'Reset All (including view state)', description: 'Clear everything' },
                        { label: 'Reset Performance Only', description: 'Preserve view state' }
                    ],
                    { placeHolder: 'Choose what to reset' }
                );

                if (choice) {
                    const preserveViewState = choice.label.includes('Performance Only');
                    provider.resetPerformanceComponents(preserveViewState);
                    
                    vscode.window.showInformationMessage(
                        `Performance components reset ${preserveViewState ? '(view state preserved)' : '(all data cleared)'}`
                    );
                }
            } catch (error) {
                logger.error('Error resetting performance components', error);
                vscode.window.showErrorMessage(`Failed to reset performance components: ${error}`);
            }
        }
    );

    // Command to run quick validation
    const quickValidationCommand = vscode.commands.registerCommand(
        'goalTree.performance.quickValidation',
        async () => {
            try {
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: 'Running Quick Performance Validation',
                    cancellable: false
                }, async (progress) => {
                    progress.report({ increment: 0, message: 'Testing with 100 goals...' });
                    
                    const tester = new GoalTreePerformanceTest();
                    const passed = await tester.runQuickValidation(context);
                    
                    progress.report({ increment: 100, message: 'Validation completed' });
                    
                    if (passed) {
                        vscode.window.showInformationMessage('✅ Quick performance validation passed!');
                    } else {
                        vscode.window.showWarningMessage('⚠️ Quick performance validation failed - check output for details');
                    }
                });
            } catch (error) {
                logger.error('Error running quick validation', error);
                vscode.window.showErrorMessage(`Quick validation failed: ${error}`);
            }
        }
    );

    // Command to configure performance settings
    const configureCommand = vscode.commands.registerCommand(
        'goalTree.performance.configure',
        async () => {
            try {
                const currentStats = provider.getPerformanceStats();
                const config = currentStats.config;

                const options = [
                    {
                        label: `${config.enableLazyLoading ? '✓' : '○'} Lazy Loading`,
                        description: 'Load children on demand',
                        action: 'toggleLazyLoading'
                    },
                    {
                        label: `${config.enableVirtualScrolling ? '✓' : '○'} Virtual Scrolling`,
                        description: 'Optimize large lists (experimental)',
                        action: 'toggleVirtualScrolling'
                    },
                    {
                        label: `${config.cacheEnabled ? '✓' : '○'} Caching`,
                        description: 'Cache frequently accessed data',
                        action: 'toggleCaching'
                    },
                    {
                        label: 'Set Max Goals in View',
                        description: `Current: ${config.maxGoalsInView}`,
                        action: 'setMaxGoals'
                    },
                    {
                        label: 'Set Debounce Interval',
                        description: `Current: ${config.debounceInterval}ms`,
                        action: 'setDebounceInterval'
                    }
                ];

                const choice = await vscode.window.showQuickPick(options, {
                    placeHolder: 'Choose performance setting to modify'
                });

                if (choice) {
                    await handleConfigurationChoice(choice.action, provider, config);
                }
            } catch (error) {
                logger.error('Error configuring performance settings', error);
                vscode.window.showErrorMessage(`Failed to configure performance settings: ${error}`);
            }
        }
    );

    // Register all commands
    context.subscriptions.push(
        runTestsCommand,
        showStatsCommand,
        resetCommand,
        quickValidationCommand,
        configureCommand
    );

    logger.info('Performance commands registered');
}

/**
 * Handle configuration choice
 */
async function handleConfigurationChoice(
    action: string,
    provider: GoalTreeProvider,
    currentConfig: any
): Promise<void> {
    const config = vscode.workspace.getConfiguration('goalTree.performance');

    switch (action) {
        case 'toggleLazyLoading':
            await config.update('enableLazyLoading', !currentConfig.enableLazyLoading, true);
            provider.updatePerformanceConfig({ enableLazyLoading: !currentConfig.enableLazyLoading });
            vscode.window.showInformationMessage(
                `Lazy loading ${!currentConfig.enableLazyLoading ? 'enabled' : 'disabled'}`
            );
            break;

        case 'toggleVirtualScrolling':
            await config.update('enableVirtualScrolling', !currentConfig.enableVirtualScrolling, true);
            provider.updatePerformanceConfig({ enableVirtualScrolling: !currentConfig.enableVirtualScrolling });
            vscode.window.showInformationMessage(
                `Virtual scrolling ${!currentConfig.enableVirtualScrolling ? 'enabled' : 'disabled'}`
            );
            break;

        case 'toggleCaching':
            await config.update('cacheEnabled', !currentConfig.cacheEnabled, true);
            provider.updatePerformanceConfig({ cacheEnabled: !currentConfig.cacheEnabled });
            vscode.window.showInformationMessage(
                `Caching ${!currentConfig.cacheEnabled ? 'enabled' : 'disabled'}`
            );
            break;

        case 'setMaxGoals':
            const maxGoalsInput = await vscode.window.showInputBox({
                prompt: 'Enter maximum goals to show in view',
                value: currentConfig.maxGoalsInView.toString(),
                validateInput: (value) => {
                    const num = parseInt(value);
                    if (isNaN(num) || num < 10 || num > 10000) {
                        return 'Please enter a number between 10 and 10000';
                    }
                    return null;
                }
            });
            
            if (maxGoalsInput) {
                const maxGoals = parseInt(maxGoalsInput);
                await config.update('maxGoalsInView', maxGoals, true);
                provider.updatePerformanceConfig({ maxGoalsInView: maxGoals });
                vscode.window.showInformationMessage(`Max goals in view set to ${maxGoals}`);
            }
            break;

        case 'setDebounceInterval':
            const intervalInput = await vscode.window.showInputBox({
                prompt: 'Enter debounce interval in milliseconds',
                value: currentConfig.debounceInterval.toString(),
                validateInput: (value) => {
                    const num = parseInt(value);
                    if (isNaN(num) || num < 50 || num > 5000) {
                        return 'Please enter a number between 50 and 5000';
                    }
                    return null;
                }
            });
            
            if (intervalInput) {
                const interval = parseInt(intervalInput);
                await config.update('debounceInterval', interval, true);
                provider.updatePerformanceConfig({ debounceInterval: interval });
                vscode.window.showInformationMessage(`Debounce interval set to ${interval}ms`);
            }
            break;
    }
}

/**
 * Create HTML for performance stats display
 */
function createStatsHtml(stats: any): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Goal Tree Performance Stats</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            padding: 20px;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
        }
        .section {
            margin-bottom: 20px;
            padding: 15px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 5px;
        }
        .section h2 {
            margin-top: 0;
            color: var(--vscode-textCodeBlock-background);
        }
        .stat-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
            padding: 4px 0;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .stat-label {
            font-weight: 500;
        }
        .stat-value {
            color: var(--vscode-textLink-foreground);
        }
        .config-section {
            background-color: var(--vscode-textCodeBlock-background);
        }
        .performance-good {
            color: var(--vscode-gitDecoration-addedResourceForeground);
        }
        .performance-warning {
            color: var(--vscode-gitDecoration-modifiedResourceForeground);
        }
        .performance-bad {
            color: var(--vscode-gitDecoration-deletedResourceForeground);
        }
        pre {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 10px;
            border-radius: 3px;
            overflow-x: auto;
        }
    </style>
</head>
<body>
    <h1>🚀 Goal Tree Performance Statistics</h1>
    
    <div class="section">
        <h2>📊 Runtime Statistics</h2>
        <div class="stat-row">
            <span class="stat-label">Cache Size:</span>
            <span class="stat-value">${stats.cacheSize} entries</span>
        </div>
        <div class="stat-row">
            <span class="stat-label">Loading States:</span>
            <span class="stat-value">${stats.loadingStates}</span>
        </div>
        <div class="stat-row">
            <span class="stat-label">Expanded Items:</span>
            <span class="stat-value">${stats.expandedItems}</span>
        </div>
        <div class="stat-row">
            <span class="stat-label">Total Tracked Items:</span>
            <span class="stat-value">${stats.totalTrackedItems}</span>
        </div>
    </div>

    <div class="section config-section">
        <h2>⚙️ Configuration</h2>
        <div class="stat-row">
            <span class="stat-label">Lazy Loading:</span>
            <span class="stat-value ${stats.config.enableLazyLoading ? 'performance-good' : 'performance-warning'}">
                ${stats.config.enableLazyLoading ? 'Enabled ✓' : 'Disabled'}
            </span>
        </div>
        <div class="stat-row">
            <span class="stat-label">Virtual Scrolling:</span>
            <span class="stat-value ${stats.config.enableVirtualScrolling ? 'performance-good' : 'performance-warning'}">
                ${stats.config.enableVirtualScrolling ? 'Enabled ✓' : 'Disabled'}
            </span>
        </div>
        <div class="stat-row">
            <span class="stat-label">Caching:</span>
            <span class="stat-value ${stats.config.cacheEnabled ? 'performance-good' : 'performance-bad'}">
                ${stats.config.cacheEnabled ? 'Enabled ✓' : 'Disabled ⚠️'}
            </span>
        </div>
        <div class="stat-row">
            <span class="stat-label">Max Goals in View:</span>
            <span class="stat-value">${stats.config.maxGoalsInView}</span>
        </div>
        <div class="stat-row">
            <span class="stat-label">Debounce Interval:</span>
            <span class="stat-value">${stats.config.debounceInterval}ms</span>
        </div>
        <div class="stat-row">
            <span class="stat-label">Max Cache Size:</span>
            <span class="stat-value">${stats.config.maxCacheSize}</span>
        </div>
    </div>

    ${stats.profilerStats && stats.profilerStats.length > 0 ? `
    <div class="section">
        <h2>📈 Profiler Statistics</h2>
        <pre>${JSON.stringify(stats.profilerStats, null, 2)}</pre>
    </div>
    ` : ''}

    ${stats.debounceInfo && Object.keys(stats.debounceInfo).length > 0 ? `
    <div class="section">
        <h2>⏱️ Debounce Information</h2>
        <pre>${JSON.stringify(stats.debounceInfo, null, 2)}</pre>
    </div>
    ` : ''}

    <div class="section">
        <h2>💡 Performance Recommendations</h2>
        <ul>
            ${!stats.config.enableLazyLoading ? '<li class="performance-warning">Consider enabling lazy loading for better performance with large datasets</li>' : ''}
            ${!stats.config.cacheEnabled ? '<li class="performance-bad">Caching is disabled - this may impact performance</li>' : ''}
            ${stats.config.maxGoalsInView > 1000 ? '<li class="performance-warning">Max goals in view is high - consider reducing for better performance</li>' : ''}
            ${stats.config.debounceInterval < 100 ? '<li class="performance-warning">Debounce interval is low - may cause excessive refreshes</li>' : ''}
            ${stats.cacheSize > stats.config.maxCacheSize * 0.8 ? '<li class="performance-warning">Cache is near capacity - consider increasing max cache size</li>' : ''}
        </ul>
    </div>
</body>
</html>
    `;
}