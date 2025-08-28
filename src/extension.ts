/**
 * Goal Tree Extension - Main extension entry point
 * 
 * This file handles extension activation, registration of providers and commands,
 * and initialization of the goal management system with visual dependency indicators.
 */

import {
    ExtensionContext,
    window,
    workspace,
    ConfigurationChangeEvent,
    commands
} from 'vscode';

import { GoalManager } from './services/GoalManager';
import { ValidationService } from './services/ValidationService';
import { GoalTreeProvider } from './providers/goalTreeProvider';
import { TreeCommands } from './commands/TreeCommands';
import {
    GoalTreeExtension,
    ExtensionState,
    ExtensionCommand,
    CommandHandler,
    ExtensionContributions
} from './types/extension';

/**
 * Extension state management
 */
class ExtensionStateManager {
    private static instance: ExtensionStateManager;
    private state: ExtensionState;

    private constructor() {
        this.state = {
            isActivated: false,
            version: '0.1.0'
        };
    }

    public static getInstance(): ExtensionStateManager {
        if (!ExtensionStateManager.instance) {
            ExtensionStateManager.instance = new ExtensionStateManager();
        }
        return ExtensionStateManager.instance;
    }

    public getState(): ExtensionState {
        return { ...this.state };
    }

    public updateState(updates: Partial<ExtensionState>): void {
        this.state = { ...this.state, ...updates };
    }

    public isActivated(): boolean {
        return this.state.isActivated;
    }
}

/**
 * Main extension implementation
 */
class GoalTreeExtensionImpl implements GoalTreeExtension {
    public context: ExtensionContext;
    private goalManager: GoalManager;
    private validationService: ValidationService;
    private treeProvider: GoalTreeProvider;
    private treeCommands: TreeCommands;
    private stateManager: ExtensionStateManager;
    private contributions: ExtensionContributions;

    constructor(context: ExtensionContext) {
        this.context = context;
        this.stateManager = ExtensionStateManager.getInstance();
        this.contributions = {
            commands: new Map<ExtensionCommand, CommandHandler>(),
            providers: [],
            disposables: []
        };

        // Initialize services
        this.validationService = new ValidationService();
        this.goalManager = new GoalManager(
            this.validationService,
            (message: string) => this.log(message)
        );

        // Initialize providers
        this.treeProvider = new GoalTreeProvider(this.goalManager);
        this.contributions.providers.push(this.treeProvider);

        // Initialize commands
        this.treeCommands = TreeCommands.registerCommands(this.goalManager, this.treeProvider);
    }

    public async activate(): Promise<void> {
        try {
            this.log('Activating Goal Tree extension...');

            // Update state
            this.stateManager.updateState({
                isActivated: true,
                activationTime: new Date(),
                context: this.context
            });

            // Register tree data provider
            const treeView = window.createTreeView('goalTreeView', {
                treeDataProvider: this.treeProvider,
                canSelectMany: false
            });
            this.contributions.disposables.push(treeView);

            // Configure tree provider based on settings
            this.configureTreeProvider();

            // Register configuration change listener
            const configListener = workspace.onDidChangeConfiguration((e: ConfigurationChangeEvent) => {
                if (e.affectsConfiguration('goalTree')) {
                    this.configureTreeProvider();
                }
            });
            this.contributions.disposables.push(configListener);

            // Enable goal tree context
            await commands.executeCommand('setContext', 'goalTree.enabled', true);

            this.log('Goal Tree extension activated successfully');
            
            // Show welcome message for first-time users
            const isFirstTime = this.context.globalState.get('goalTree.firstTime', true);
            if (isFirstTime) {
                await this.showWelcomeMessage();
                await this.context.globalState.update('goalTree.firstTime', false);
            }

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logError('Failed to activate extension', error);
            window.showErrorMessage(`Goal Tree extension failed to activate: ${errorMessage}`);
            throw error;
        }
    }

    public async deactivate(): Promise<void> {
        try {
            this.log('Deactivating Goal Tree extension...');

            // Dispose of all resources
            for (const disposable of this.contributions.disposables) {
                if (disposable && typeof disposable.dispose === 'function') {
                    disposable.dispose();
                }
            }

            // Dispose of providers
            for (const provider of this.contributions.providers) {
                if (provider && typeof (provider as any).dispose === 'function') {
                    (provider as any).dispose();
                }
            }

            // Dispose of goal manager
            this.goalManager.dispose();

            // Update state
            this.stateManager.updateState({
                isActivated: false,
                context: undefined
            });

            // Disable goal tree context
            await commands.executeCommand('setContext', 'goalTree.enabled', false);

            this.log('Goal Tree extension deactivated successfully');

        } catch (error) {
            this.logError('Error during deactivation', error);
        }
    }

    // ===========================================
    // Private Helper Methods
    // ===========================================

    private configureTreeProvider(): void {
        try {
            const config = workspace.getConfiguration('goalTree');
            
            // Apply configuration settings
            const showCompletedGoals = config.get<boolean>('showCompletedGoals', true);
            const showTasksInline = config.get<boolean>('showTasksInline', true);
            const showDependencyInfo = config.get<boolean>('showDependencyInfo', true);

            this.treeProvider.setShowCompletedGoals(showCompletedGoals);
            this.treeProvider.setShowTasksInline(showTasksInline);
            this.treeProvider.setShowDependencyInfo(showDependencyInfo);

            this.log(`Tree provider configured: completed=${showCompletedGoals}, tasks=${showTasksInline}, dependencies=${showDependencyInfo}`);

        } catch (error) {
            this.logError('Failed to configure tree provider', error);
        }
    }

    private async showWelcomeMessage(): Promise<void> {
        const createGoalAction = 'Create First Goal';
        const learnMoreAction = 'Learn More';
        
        const selection = await window.showInformationMessage(
            'Welcome to Goal Tree! Start organizing your goals and tracking dependencies.',
            createGoalAction,
            learnMoreAction
        );

        switch (selection) {
            case createGoalAction:
                await commands.executeCommand('goalTree.createGoal');
                break;
            case learnMoreAction:
                // Could open documentation or show quick tips
                await this.showQuickTips();
                break;
        }
    }

    private async showQuickTips(): Promise<void> {
        const tips = [
            '📝 Right-click goals to add dependencies',
            '🔗 Use "Show Dependencies" to visualize blocking relationships',
            '✅ Add tasks to break down your goals',
            '🚫 Visual indicators show blocked goals',
            '⚙️ Configure display options in settings'
        ];

        await window.showInformationMessage(
            `Goal Tree Quick Tips:\n\n${tips.join('\n')}`,
            'Got it'
        );
    }

    private log(message: string): void {
        console.log(`[Goal Tree] ${message}`);
    }

    private logError(message: string, error: unknown): void {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[Goal Tree] ERROR: ${message} - ${errorMessage}`);
    }
}

// ===========================================
// VS Code Extension Entry Points
// ===========================================

let extensionInstance: GoalTreeExtensionImpl | undefined;

/**
 * Extension activation function called by VS Code
 */
export async function activate(context: ExtensionContext): Promise<void> {
    try {
        extensionInstance = new GoalTreeExtensionImpl(context);
        await extensionInstance.activate();
        
        // Store extension instance in context for access by other parts
        context.globalState.setKeysForSync(['goalTree.firstTime']);
        
    } catch (error) {
        console.error('[Goal Tree] Extension activation failed:', error);
        throw error;
    }
}

/**
 * Extension deactivation function called by VS Code
 */
export async function deactivate(): Promise<void> {
    try {
        if (extensionInstance) {
            await extensionInstance.deactivate();
            extensionInstance = undefined;
        }
    } catch (error) {
        console.error('[Goal Tree] Extension deactivation failed:', error);
    }
}

/**
 * Get the current extension instance (for testing or external access)
 */
export function getExtensionInstance(): GoalTreeExtensionImpl | undefined {
    return extensionInstance;
}