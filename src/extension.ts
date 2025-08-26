import * as vscode from 'vscode';
import { GoalManager, StateManager, StorageService, DependencyService, ChangeNotificationService } from './services';
import { GoalTreeProvider } from './providers';
import { CONFIG_KEYS, STORAGE_KEYS } from './constants';

// Core service instances
let goalManager: GoalManager;
let stateManager: StateManager;
let storageService: StorageService;
let dependencyService: DependencyService;
let changeNotificationService: ChangeNotificationService;
let goalTreeProvider: GoalTreeProvider;
let extensionContext: vscode.ExtensionContext;

/**
 * Extension activation function - called when the extension is activated
 */
export function activate(context: vscode.ExtensionContext): void {
	console.log('Goal Tree extension is now active!');

	// Store context for later use
	extensionContext = context;

	// Initialize core services
	storageService = new StorageService(context);
	stateManager = new StateManager();
	dependencyService = new DependencyService(stateManager);
	goalManager = new GoalManager(storageService, stateManager, dependencyService);
	changeNotificationService = ChangeNotificationService.getInstance();

	// Initialize and register tree data provider
	goalTreeProvider = new GoalTreeProvider(stateManager, goalManager);
	vscode.window.registerTreeDataProvider('goalTreeView', goalTreeProvider);

	// Register basic commands (extension structure)
	const commands = [
		vscode.commands.registerCommand('goalTree.openView', () => {
			vscode.commands.executeCommand('workbench.view.extension.goalTreeContainer');
			vscode.window.showInformationMessage('Goal Tree view opened');
		}),

		vscode.commands.registerCommand('goalTree.createGoal', async () => {
			const goalTitle = await vscode.window.showInputBox({
				prompt: 'Enter goal title',
				placeHolder: 'My new goal...'
			});

			if (goalTitle) {
				try {
					const goal = await goalManager.createGoal(goalTitle);
					goalTreeProvider.refresh();
					vscode.window.showInformationMessage(`Goal created: ${goalTitle}`);
				} catch (error) {
					vscode.window.showErrorMessage(`Failed to create goal: ${error}`);
				}
			}
		}),

		vscode.commands.registerCommand('goalTree.refreshView', () => {
			goalTreeProvider.refresh();
			vscode.window.showInformationMessage('Goal Tree refreshed');
		}),

		vscode.commands.registerCommand('goalTree.toggleTask', async (goalId: string, taskId: string) => {
			try {
				const goal = stateManager.getGoal(goalId);
				if (goal) {
					const task = goal.tasks.find(t => t.id === taskId);
					if (task) {
						const newStatus = task.status === 'done' ? 'todo' : 'done';
						await goalManager.updateTask(goalId, taskId, { status: newStatus });
						goalTreeProvider.refresh();
					}
				}
			} catch (error) {
				vscode.window.showErrorMessage(`Failed to toggle task: ${error}`);
			}
		}),

		vscode.commands.registerCommand('goalTree.deleteGoal', async (goalId: string) => {
			const confirmation = await vscode.window.showWarningMessage(
				'Are you sure you want to delete this goal?',
				{ modal: true },
				'Delete'
			);

			if (confirmation === 'Delete') {
				try {
					await goalManager.deleteGoal(goalId);
					goalTreeProvider.refresh();
					vscode.window.showInformationMessage('Goal deleted successfully');
				} catch (error) {
					vscode.window.showErrorMessage(`Failed to delete goal: ${error}`);
				}
			}
		})
	];

	// Register all commands with the context
	commands.forEach(command => context.subscriptions.push(command));

	// Set the context to enable the view
	vscode.commands.executeCommand('setContext', 'goalTree.enabled', true);

	// Set up event listeners for real-time updates
	const eventListeners = [
		changeNotificationService.onEvent('goal:created', () => {
			goalTreeProvider.refresh();
		}),

		changeNotificationService.onEvent('goal:updated', () => {
			goalTreeProvider.refresh();
		}),

		changeNotificationService.onEvent('goal:deleted', () => {
			goalTreeProvider.refresh();
		}),

		changeNotificationService.onEvent('goal:status-changed', () => {
			goalTreeProvider.refresh();
		}),

		changeNotificationService.onEvent('task:created', () => {
			goalTreeProvider.refresh();
		}),

		changeNotificationService.onEvent('task:updated', () => {
			goalTreeProvider.refresh();
		}),

		changeNotificationService.onEvent('task:deleted', () => {
			goalTreeProvider.refresh();
		}),

		changeNotificationService.onEvent('task:status-changed', () => {
			goalTreeProvider.refresh();
		})
	];

	// Register all event listeners for proper cleanup
	eventListeners.forEach(listener => context.subscriptions.push(listener));

	// Initialize configuration on startup
	initializeConfiguration(context);

	// Listen for configuration changes
	const configWatcher = vscode.workspace.onDidChangeConfiguration(event => {
		if (event.affectsConfiguration('goalTree')) {
			handleConfigurationChange(event, context);
		}
	});

	context.subscriptions.push(configWatcher);

	// Services are initialized and ready to use

	console.log('Goal Tree extension activated successfully');
}

/**
 * Extension deactivation function - called when the extension is deactivated
 */
export function deactivate(): void {
	console.log('Goal Tree extension is being deactivated');
	
	// Save view state before deactivation
	// Note: context is not available in deactivate, using a module-level context reference
	if (extensionContext) {
		saveViewState(extensionContext);
	}
	
	// Clean up resources - TODO: Implement cleanup when needed

	// Reset context
	vscode.commands.executeCommand('setContext', 'goalTree.enabled', false);
	
	console.log('Goal Tree extension deactivated successfully');
}

/**
 * Get the extension configuration
 */
export function getConfig(): vscode.WorkspaceConfiguration {
	return vscode.workspace.getConfiguration('goalTree');
}

/**
 * Initialize configuration values on extension startup
 */
function initializeConfiguration(context: vscode.ExtensionContext): void {
	const config = getConfig();
	
	// Apply all configuration settings to tree provider
	goalTreeProvider.setShowCompleted(config.get('showCompleted', true));
	goalTreeProvider.setSortByTitle(config.get('sortByTitle', false));
	goalTreeProvider.setGroupByStatus(config.get('groupByStatus', false));
	
	// Load view state if persistence is enabled
	restoreViewState(context);
	
	console.log('Goal Tree configuration initialized');
}

/**
 * Handle configuration changes
 */
function handleConfigurationChange(event: vscode.ConfigurationChangeEvent, context: vscode.ExtensionContext): void {
	const config = getConfig();
	let needsRefresh = false;
	
	// Check for changes that affect tree display
	if (event.affectsConfiguration('goalTree.showCompleted')) {
		goalTreeProvider.setShowCompleted(config.get('showCompleted', true));
		needsRefresh = true;
	}
	
	if (event.affectsConfiguration('goalTree.sortByTitle')) {
		goalTreeProvider.setSortByTitle(config.get('sortByTitle', false));
		needsRefresh = true;
	}
	
	if (event.affectsConfiguration('goalTree.groupByStatus')) {
		goalTreeProvider.setGroupByStatus(config.get('groupByStatus', false));
		needsRefresh = true;
	}
	
	// Handle auto refresh setting
	if (event.affectsConfiguration('goalTree.autoRefresh')) {
		const autoRefresh = config.get('autoRefresh', true);
		goalTreeProvider.setAutoRefresh(autoRefresh);
		console.log(`Goal Tree auto refresh ${autoRefresh ? 'enabled' : 'disabled'}`);
	}
	
	// Handle view state persistence
	if (event.affectsConfiguration('goalTree.persistViewState')) {
		const persistViewState = config.get('persistViewState', true);
		if (persistViewState) {
			restoreViewState(context);
		}
	}
	
	// Refresh tree if any display settings changed
	if (needsRefresh) {
		goalTreeProvider.refresh();
		console.log('Goal Tree configuration updated and refreshed');
	}
}

/**
 * Save current view state for persistence
 */
function saveViewState(context: vscode.ExtensionContext): void {
	const config = getConfig();
	if (!config.get('persistViewState', true)) {
		return;
	}
	
	// Get current expanded/collapsed state from tree provider
	const viewState = goalTreeProvider.getViewState();
	if (viewState) {
		// Use VS Code's global state for view state persistence
		context.globalState.update(STORAGE_KEYS.TREE_VIEW_STATE, viewState);
	}
}

/**
 * Restore saved view state
 */
function restoreViewState(context: vscode.ExtensionContext): void {
	const config = getConfig();
	if (!config.get('persistViewState', true)) {
		return;
	}
	
	const viewState = context.globalState.get(STORAGE_KEYS.TREE_VIEW_STATE);
	if (viewState) {
		goalTreeProvider.setViewState(viewState as { [key: string]: boolean });
	}
}