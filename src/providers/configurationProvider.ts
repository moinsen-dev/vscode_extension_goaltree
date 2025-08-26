import * as vscode from 'vscode';
import { TreeViewConfig } from '../models/tree';

/**
 * ConfigurationProvider handles VS Code settings and configuration for the goal tree extension
 */
export class ConfigurationProvider {
    private static readonly CONFIGURATION_SECTION = 'goalTree';
    
    private _onDidChangeConfiguration = new vscode.EventEmitter<TreeViewConfig>();
    public readonly onDidChangeConfiguration = this._onDidChangeConfiguration.event;

    constructor() {
        // Listen to configuration changes
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration(ConfigurationProvider.CONFIGURATION_SECTION)) {
                this._onDidChangeConfiguration.fire(this.getTreeViewConfig());
            }
        });
    }

    /**
     * Gets the current tree view configuration from VS Code settings
     */
    getTreeViewConfig(): TreeViewConfig {
        const config = vscode.workspace.getConfiguration(ConfigurationProvider.CONFIGURATION_SECTION);

        return {
            showCompleted: config.get<boolean>('showCompleted', true),
            showTaskCounts: config.get<boolean>('showTaskCounts', true),
            groupByStatus: config.get<boolean>('groupByStatus', false),
            maxDepth: config.get<number>('maxDepth', -1),
            sortOrder: config.get<'created' | 'title' | 'priority' | 'status'>('sortOrder', 'created'),
            sortDirection: config.get<'asc' | 'desc'>('sortDirection', 'asc'),
            filter: {
                searchText: config.get<string>('filter.searchText'),
                status: config.get<string[]>('filter.status') as any,
                tags: config.get<string[]>('filter.tags'),
                priorityRange: config.get<{ min: number; max: number }>('filter.priorityRange'),
                hasTasksOnly: config.get<boolean>('filter.hasTasksOnly', false),
                blockedOnly: config.get<boolean>('filter.blockedOnly', false)
            }
        };
    }

    /**
     * Updates tree view configuration
     */
    async updateTreeViewConfig(updates: Partial<TreeViewConfig>): Promise<void> {
        const config = vscode.workspace.getConfiguration(ConfigurationProvider.CONFIGURATION_SECTION);
        
        for (const [key, value] of Object.entries(updates)) {
            if (key === 'filter' && typeof value === 'object' && value !== null) {
                // Handle nested filter properties
                for (const [filterKey, filterValue] of Object.entries(value)) {
                    await config.update(`filter.${filterKey}`, filterValue, vscode.ConfigurationTarget.Workspace);
                }
            } else {
                await config.update(key, value, vscode.ConfigurationTarget.Workspace);
            }
        }
    }

    /**
     * Gets auto-refresh setting
     */
    getAutoRefresh(): boolean {
        const config = vscode.workspace.getConfiguration(ConfigurationProvider.CONFIGURATION_SECTION);
        return config.get<boolean>('autoRefresh', true);
    }

    /**
     * Gets default goal type for new goals
     */
    getDefaultGoalType(): string {
        const config = vscode.workspace.getConfiguration(ConfigurationProvider.CONFIGURATION_SECTION);
        return config.get<string>('defaultGoalType', 'task');
    }

    /**
     * Gets storage configuration
     */
    getStorageConfig(): {
        autoSaveInterval: number;
        maxBackups: number;
        enableCompression: boolean;
        compressionThreshold: number;
    } {
        const config = vscode.workspace.getConfiguration(ConfigurationProvider.CONFIGURATION_SECTION);
        
        return {
            autoSaveInterval: config.get<number>('storage.autoSaveInterval', 5000), // 5 seconds
            maxBackups: config.get<number>('storage.maxBackups', 10),
            enableCompression: config.get<boolean>('storage.enableCompression', false),
            compressionThreshold: config.get<number>('storage.compressionThreshold', 100000) // 100KB
        };
    }

    /**
     * Gets keyboard shortcuts configuration
     */
    getKeyboardShortcuts(): Record<string, string> {
        const config = vscode.workspace.getConfiguration(ConfigurationProvider.CONFIGURATION_SECTION);
        return config.get<Record<string, string>>('keyboardShortcuts', {});
    }

    /**
     * Gets theme configuration
     */
    getThemeConfig(): {
        iconTheme: string;
        colorTheme: 'auto' | 'light' | 'dark';
        customColors: Record<string, string>;
    } {
        const config = vscode.workspace.getConfiguration(ConfigurationProvider.CONFIGURATION_SECTION);
        
        return {
            iconTheme: config.get<string>('theme.iconTheme', 'default'),
            colorTheme: config.get<'auto' | 'light' | 'dark'>('theme.colorTheme', 'auto'),
            customColors: config.get<Record<string, string>>('theme.customColors', {})
        };
    }

    /**
     * Gets performance configuration
     */
    getPerformanceConfig(): {
        maxGoalsInView: number;
        enableVirtualization: boolean;
        debounceInterval: number;
    } {
        const config = vscode.workspace.getConfiguration(ConfigurationProvider.CONFIGURATION_SECTION);
        
        return {
            maxGoalsInView: config.get<number>('performance.maxGoalsInView', 1000),
            enableVirtualization: config.get<boolean>('performance.enableVirtualization', true),
            debounceInterval: config.get<number>('performance.debounceInterval', 300)
        };
    }

    /**
     * Gets notification preferences
     */
    getNotificationConfig(): {
        showGoalCompletion: boolean;
        showGoalBlocked: boolean;
        showImportExportResults: boolean;
        soundEnabled: boolean;
    } {
        const config = vscode.workspace.getConfiguration(ConfigurationProvider.CONFIGURATION_SECTION);
        
        return {
            showGoalCompletion: config.get<boolean>('notifications.showGoalCompletion', true),
            showGoalBlocked: config.get<boolean>('notifications.showGoalBlocked', true),
            showImportExportResults: config.get<boolean>('notifications.showImportExportResults', true),
            soundEnabled: config.get<boolean>('notifications.soundEnabled', false)
        };
    }

    /**
     * Gets debugging configuration
     */
    getDebugConfig(): {
        enableLogging: boolean;
        logLevel: 'error' | 'warn' | 'info' | 'debug';
        logToFile: boolean;
        performanceMonitoring: boolean;
    } {
        const config = vscode.workspace.getConfiguration(ConfigurationProvider.CONFIGURATION_SECTION);
        
        return {
            enableLogging: config.get<boolean>('debug.enableLogging', false),
            logLevel: config.get<'error' | 'warn' | 'info' | 'debug'>('debug.logLevel', 'info'),
            logToFile: config.get<boolean>('debug.logToFile', false),
            performanceMonitoring: config.get<boolean>('debug.performanceMonitoring', false)
        };
    }

    /**
     * Resets configuration to defaults
     */
    async resetToDefaults(): Promise<void> {
        const config = vscode.workspace.getConfiguration(ConfigurationProvider.CONFIGURATION_SECTION);
        const inspect = config.inspect('');
        
        if (inspect) {
            // Clear workspace settings
            for (const key of Object.keys(inspect.workspaceValue || {})) {
                await config.update(key, undefined, vscode.ConfigurationTarget.Workspace);
            }
            
            // Clear user settings if requested
            const choice = await vscode.window.showQuickPick(
                ['Workspace Only', 'Global Settings Too', 'Cancel'],
                {
                    placeHolder: 'Reset configuration for workspace only or globally?'
                }
            );
            
            if (choice === 'Global Settings Too') {
                for (const key of Object.keys(inspect.globalValue || {})) {
                    await config.update(key, undefined, vscode.ConfigurationTarget.Global);
                }
            }
        }
        
        vscode.window.showInformationMessage('Goal Tree configuration reset to defaults');
    }

    /**
     * Exports current configuration to JSON
     */
    async exportConfiguration(): Promise<string> {
        const config = vscode.workspace.getConfiguration(ConfigurationProvider.CONFIGURATION_SECTION);
        const settings: Record<string, any> = {};
        
        // Get all configuration keys and values
        const inspect = config.inspect('');
        if (inspect) {
            // Prefer workspace settings, fall back to global settings
            const values = { 
                ...(inspect.globalValue || {}), 
                ...(inspect.workspaceValue || {})
            };
            Object.assign(settings, values);
        }
        
        return JSON.stringify({
            version: '1.0',
            exportedAt: new Date().toISOString(),
            settings
        }, null, 2);
    }

    /**
     * Imports configuration from JSON
     */
    async importConfiguration(jsonData: string, target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Workspace): Promise<void> {
        try {
            const data = JSON.parse(jsonData);
            
            if (!data.settings || typeof data.settings !== 'object') {
                throw new Error('Invalid configuration format');
            }
            
            const config = vscode.workspace.getConfiguration(ConfigurationProvider.CONFIGURATION_SECTION);
            
            // Apply each setting
            for (const [key, value] of Object.entries(data.settings)) {
                await config.update(key, value, target);
            }
            
            vscode.window.showInformationMessage('Configuration imported successfully');
            
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to import configuration: ${error}`);
            throw error;
        }
    }

    /**
     * Validates current configuration
     */
    validateConfiguration(): { isValid: boolean; errors: string[]; warnings: string[] } {
        const errors: string[] = [];
        const warnings: string[] = [];
        
        const config = this.getTreeViewConfig();
        const storageConfig = this.getStorageConfig();
        const performanceConfig = this.getPerformanceConfig();
        
        // Validate tree view config
        if (config.maxDepth < -1) {
            errors.push('maxDepth must be -1 (unlimited) or a positive number');
        }
        
        if (config.filter.priorityRange) {
            if (config.filter.priorityRange.min > config.filter.priorityRange.max) {
                errors.push('Priority range minimum cannot be greater than maximum');
            }
        }
        
        // Validate storage config
        if (storageConfig.autoSaveInterval < 1000) {
            warnings.push('Auto-save interval less than 1 second may impact performance');
        }
        
        if (storageConfig.maxBackups < 1) {
            warnings.push('Having no backups may lead to data loss');
        }
        
        if (storageConfig.maxBackups > 100) {
            warnings.push('High backup count may consume significant storage space');
        }
        
        // Validate performance config
        if (performanceConfig.maxGoalsInView > 10000) {
            warnings.push('High max goals in view may impact performance');
        }
        
        if (performanceConfig.debounceInterval < 100) {
            warnings.push('Very low debounce interval may cause performance issues');
        }
        
        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Gets configuration schema for validation and documentation
     */
    getConfigurationSchema(): any {
        return {
            type: 'object',
            properties: {
                showCompleted: {
                    type: 'boolean',
                    default: true,
                    description: 'Show completed goals in the tree view'
                },
                showTaskCounts: {
                    type: 'boolean',
                    default: true,
                    description: 'Show task counts in goal labels'
                },
                groupByStatus: {
                    type: 'boolean',
                    default: false,
                    description: 'Group goals by status'
                },
                maxDepth: {
                    type: 'number',
                    default: -1,
                    description: 'Maximum depth to display (-1 for unlimited)'
                },
                sortOrder: {
                    type: 'string',
                    enum: ['created', 'title', 'priority', 'status'],
                    default: 'created',
                    description: 'Sort order for goals'
                },
                sortDirection: {
                    type: 'string',
                    enum: ['asc', 'desc'],
                    default: 'asc',
                    description: 'Sort direction'
                },
                autoRefresh: {
                    type: 'boolean',
                    default: true,
                    description: 'Automatically refresh the goal tree view when files change'
                },
                defaultGoalType: {
                    type: 'string',
                    enum: ['task', 'milestone', 'objective'],
                    default: 'task',
                    description: 'Default type when creating new goals'
                }
            }
        };
    }
}