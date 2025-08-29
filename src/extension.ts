import * as vscode from 'vscode';
import { GoalManager, StateManager, StorageService, DependencyService, ChangeNotificationService } from './services';
import { ValidationService } from './services/ValidationService';
import { GoalTreeProvider, TreeContextMenuProvider } from './providers';
import { TreeCommands } from './commands/TreeCommands';
import { CONFIG_KEYS, STORAGE_KEYS } from './constants';

// Core service instances
let goalManager: GoalManager;
let stateManager: StateManager;
let storageService: StorageService;
let dependencyService: DependencyService;
let validationService: ValidationService;
let changeNotificationService: ChangeNotificationService;
let goalTreeProvider: GoalTreeProvider;
let treeContextMenuProvider: TreeContextMenuProvider;
let treeCommands: TreeCommands;
let extensionContext: vscode.ExtensionContext;
let treeView: vscode.TreeView<string>;

/**
 * Extension activation function - called when the extension is activated
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
	console.log('Goal Tree extension is now active!');

	// Store context for later use
	extensionContext = context;

	// Initialize core services
	storageService = new StorageService(context);
	stateManager = new StateManager();
	dependencyService = new DependencyService(stateManager);
	validationService = new ValidationService();
	goalManager = new GoalManager(storageService, validationService);
	changeNotificationService = ChangeNotificationService.getInstance();

	// Initialize tree components
	goalTreeProvider = new GoalTreeProvider(stateManager, goalManager, context);
	treeContextMenuProvider = new TreeContextMenuProvider(stateManager, goalManager);
	treeCommands = new TreeCommands(stateManager, goalManager, goalTreeProvider, changeNotificationService);

	// Register tree data provider and create tree view
	treeView = vscode.window.createTreeView('goalTreeView', {
		treeDataProvider: goalTreeProvider,
		showCollapseAll: true,
		canSelectMany: false
	});

	// Register tree commands
	treeCommands.registerCommands(context);

	// Initialize context menu provider
	treeContextMenuProvider.initialize();

	// Register tree view event handlers
	context.subscriptions.push(
		treeView,
		treeView.onDidExpandElement(e => {
			goalTreeProvider.onTreeItemExpanded(e.element, context);
		}),
		treeView.onDidCollapseElement(e => {
			goalTreeProvider.onTreeItemCollapsed(e.element, context);
		}),
		treeView.onDidChangeSelection(e => {
			// Handle selection changes if needed
			console.log('Tree selection changed:', e.selection);
		}),
		treeView.onDidChangeVisibility(e => {
			// Handle visibility changes if needed
			console.log('Tree visibility changed:', e.visible);
		})
	);

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

	// Load view state from previous session
	await goalTreeProvider.loadViewState(context);

	// Services are initialized and ready to use

	console.log('Goal Tree extension activated successfully');
}

/**
 * Extension deactivation function - called when the extension is deactivated
 */
export function deactivate(): void {
	console.log('Goal Tree extension is being deactivated');
	
	// Save view state and dispose resources
	if (extensionContext) {
		if (goalTreeProvider) {
			goalTreeProvider.dispose(extensionContext);
		}
		if (treeContextMenuProvider) {
			treeContextMenuProvider.dispose();
		}
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
	goalTreeProvider.setShowCompleted(config.get('showCompleted', true), context);
	goalTreeProvider.setSortByTitle(config.get('sortByTitle', false), context);
	goalTreeProvider.setGroupByStatus(config.get('groupByStatus', false), context);
	goalTreeProvider.setAutoRefresh(config.get('autoRefresh', true), context);
	
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
		goalTreeProvider.setShowCompleted(config.get('showCompleted', true), context);
		needsRefresh = true;
	}
	
	if (event.affectsConfiguration('goalTree.sortByTitle')) {
		goalTreeProvider.setSortByTitle(config.get('sortByTitle', false), context);
		needsRefresh = true;
	}
	
	if (event.affectsConfiguration('goalTree.groupByStatus')) {
		goalTreeProvider.setGroupByStatus(config.get('groupByStatus', false), context);
		needsRefresh = true;
	}
	
	// Handle auto refresh setting
	if (event.affectsConfiguration('goalTree.autoRefresh')) {
		const autoRefresh = config.get('autoRefresh', true);
		goalTreeProvider.setAutoRefresh(autoRefresh, context);
		console.log(`Goal Tree auto refresh ${autoRefresh ? 'enabled' : 'disabled'}`);
	}
	
	// Handle performance settings
	if (event.affectsConfiguration('goalTree.performance')) {
		// Update performance configuration if needed
		const perfConfig = config.get('performance', {});
		goalTreeProvider.updatePerformanceConfig(perfConfig);
	}
	
	// Handle view state persistence
	if (event.affectsConfiguration('goalTree.persistViewState')) {
		const persistViewState = config.get('persistViewState', true);
		if (persistViewState) {
			goalTreeProvider.loadViewState(context);
		}
	}
	
	// Refresh tree if any display settings changed
	if (needsRefresh) {
		goalTreeProvider.refresh();
		console.log('Goal Tree configuration updated and refreshed');
	}
}

