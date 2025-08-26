import * as vscode from 'vscode';
// import { GoalManager, StateManager, StorageService, DependencyService } from './services';

// Temporarily disabled for Stream A testing - services will be re-enabled when Stream B/C/D complete
// let goalManager: GoalManager;
// let stateManager: StateManager;
// let storageService: StorageService;
// let dependencyService: DependencyService;

/**
 * Extension activation function - called when the extension is activated
 */
export function activate(context: vscode.ExtensionContext): void {
	console.log('Goal Tree extension is now active!');

	// Initialize core services - temporarily disabled for Stream A testing
	// storageService = new StorageService(context);
	// stateManager = new StateManager();
	// dependencyService = new DependencyService(stateManager);
	// goalManager = new GoalManager(storageService, stateManager, dependencyService);

	// TODO: Tree data provider will be initialized by other streams

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
				// TODO: Goal creation will be implemented when services are available
				vscode.window.showInformationMessage(`Goal creation placeholder: ${goalTitle}`);
			}
		}),

		vscode.commands.registerCommand('goalTree.refreshView', () => {
			// TODO: Refresh will be implemented when tree provider is available
			vscode.window.showInformationMessage('Goal Tree refreshed');
		})
	];

	// Register all commands with the context
	commands.forEach(command => context.subscriptions.push(command));

	// Set the context to enable the view
	vscode.commands.executeCommand('setContext', 'goalTree.enabled', true);

	// Listen for configuration changes
	const configWatcher = vscode.workspace.onDidChangeConfiguration(event => {
		if (event.affectsConfiguration('goalTree')) {
			// TODO: Refresh tree provider when available
			console.log('Goal Tree configuration changed');
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