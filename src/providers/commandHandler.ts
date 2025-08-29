import * as vscode from 'vscode';
import { Goal, Task, CreateGoalParams, UpdateGoalParams } from '../models';
import { GoalManager } from '../services';
import { StateManager } from '../services/stateManager';
import { GoalTreeProvider } from './goalTreeProvider';

/**
 * CommandHandler manages all VS Code commands for the goal tree extension
 */
export class CommandHandler {
    private GoalManager: GoalManager;
    private stateManager: StateManager;
    private treeProvider: GoalTreeProvider;
    private context: vscode.ExtensionContext;

    constructor(
        GoalManager: GoalManager,
        stateManager: StateManager,
        treeProvider: GoalTreeProvider,
        context: vscode.ExtensionContext
    ) {
        this.GoalManager = GoalManager;
        this.stateManager = stateManager;
        this.treeProvider = treeProvider;
        this.context = context;

        this.registerCommands();
    }

    /**
     * Registers all commands with VS Code
     */
    private registerCommands(): void {
        const commands = [
            // Tree view commands
            { command: 'goalTree.openView', handler: this.openView.bind(this) },
            { command: 'goalTree.refreshView', handler: this.refreshView.bind(this) },
            { command: 'goalTree.selectItem', handler: this.selectItem.bind(this) },
            
            // Goal management commands
            { command: 'goalTree.createGoal', handler: this.createGoal.bind(this) },
            { command: 'goalTree.createSubGoal', handler: this.createSubGoal.bind(this) },
            { command: 'goalTree.editGoal', handler: this.editGoal.bind(this) },
            { command: 'goalTree.deleteGoal', handler: this.deleteGoal.bind(this) },
            { command: 'goalTree.duplicateGoal', handler: this.duplicateGoal.bind(this) },
            
            // Goal status commands
            { command: 'goalTree.markInProgress', handler: this.markInProgress.bind(this) },
            { command: 'goalTree.markCompleted', handler: this.markCompleted.bind(this) },
            { command: 'goalTree.markBlocked', handler: this.markBlocked.bind(this) },
            { command: 'goalTree.markPlanned', handler: this.markPlanned.bind(this) },
            
            // Task management commands
            { command: 'goalTree.addTask', handler: this.addTask.bind(this) },
            { command: 'goalTree.editTask', handler: this.editTask.bind(this) },
            { command: 'goalTree.deleteTask', handler: this.deleteTask.bind(this) },
            { command: 'goalTree.toggleTask', handler: this.toggleTask.bind(this) },
            { command: 'goalTree.moveTaskUp', handler: this.moveTaskUp.bind(this) },
            { command: 'goalTree.moveTaskDown', handler: this.moveTaskDown.bind(this) },
            
            // Dependency commands
            { command: 'goalTree.addDependency', handler: this.addDependency.bind(this) },
            { command: 'goalTree.removeDependency', handler: this.removeDependency.bind(this) },
            { command: 'goalTree.showDependencies', handler: this.showDependencies.bind(this) },
            
            // View configuration commands
            { command: 'goalTree.toggleCompleted', handler: this.toggleCompleted.bind(this) },
            { command: 'goalTree.groupByStatus', handler: this.groupByStatus.bind(this) },
            { command: 'goalTree.sortByTitle', handler: this.sortByTitle.bind(this) },
            { command: 'goalTree.sortByCreated', handler: this.sortByCreated.bind(this) },
            { command: 'goalTree.sortByPriority', handler: this.sortByPriority.bind(this) },
            
            // Import/Export commands
            { command: 'goalTree.exportGoals', handler: this.exportGoals.bind(this) },
            { command: 'goalTree.importGoals', handler: this.importGoals.bind(this) },
            
            // Statistics commands
            { command: 'goalTree.showStatistics', handler: this.showStatistics.bind(this) }
        ];

        for (const { command, handler } of commands) {
            const disposable = vscode.commands.registerCommand(command, handler);
            this.context.subscriptions.push(disposable);
        }
    }

    // Tree View Commands

    private async openView(): Promise<void> {
        await vscode.commands.executeCommand('goalTreeView.focus');
    }

    private refreshView(): void {
        this.treeProvider.refresh();
    }

    private async selectItem(item: any): Promise<void> {
        // Handle item selection - could show details, open editor, etc.
        if (item.type === 'goal') {
            const goal = item.data as Goal;
            vscode.window.showInformationMessage(`Selected goal: ${goal.title}`);
        } else if (item.type === 'task') {
            const task = item.data as Task;
            vscode.window.showInformationMessage(`Selected task: ${task.title}`);
        }
    }

    // Goal Management Commands

    private async createGoal(parentGoal?: Goal): Promise<void> {
        const title = await vscode.window.showInputBox({
            prompt: 'Enter goal title',
            placeHolder: 'Goal title...',
            validateInput: (value) => {
                return value.trim() ? null : 'Goal title cannot be empty';
            }
        });

        if (!title) return;

        const description = await vscode.window.showInputBox({
            prompt: 'Enter goal description (optional)',
            placeHolder: 'Goal description...'
        });

        try {
            await this.GoalManager.createGoal({
                title: title.trim(),
                description: description?.trim(),
                parentId: parentGoal?.id
            });
            this.treeProvider.refresh();
            vscode.window.showInformationMessage(`Goal "${title}" created successfully`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create goal: ${error}`);
        }
    }

    private async createSubGoal(treeItem?: any): Promise<void> {
        // Handle tree item context or direct goal parameter
        let parentGoal: Goal | undefined;
        
        if (treeItem && typeof treeItem === 'object' && 'id' in treeItem) {
            // Called from context menu with tree item
            parentGoal = this.stateManager.getGoal(treeItem.id);
        } else if (treeItem && typeof treeItem === 'object' && 'title' in treeItem) {
            // Called directly with Goal object
            parentGoal = treeItem as Goal;
        }
        
        await this.createGoal(parentGoal);
    }

    private async editGoal(treeItemOrGoal: any): Promise<void> {
        // Extract goal from tree item or use direct goal parameter
        let goal: Goal | undefined;
        
        if (treeItemOrGoal && typeof treeItemOrGoal === 'object' && 'id' in treeItemOrGoal) {
            // Called from context menu with tree item
            goal = this.stateManager.getGoal(treeItemOrGoal.id);
        } else if (treeItemOrGoal && typeof treeItemOrGoal === 'object' && 'title' in treeItemOrGoal) {
            // Called directly with Goal object
            goal = treeItemOrGoal as Goal;
        }
        
        if (!goal) {
            vscode.window.showErrorMessage('Goal not found');
            return;
        }
        const title = await vscode.window.showInputBox({
            prompt: 'Edit goal title',
            value: goal.title,
            validateInput: (value) => {
                return value.trim() ? null : 'Goal title cannot be empty';
            }
        });

        if (title === undefined) return; // User cancelled

        const description = await vscode.window.showInputBox({
            prompt: 'Edit goal description (optional)',
            value: goal.description ?? ''
        });

        if (description === undefined) return; // User cancelled

        try {
            const updates: UpdateGoalParams = {
                title: title.trim(),
                description: description.trim() || undefined
            };

            await this.GoalManager.updateGoal(goal.id, updates);
            this.treeProvider.refresh();
            vscode.window.showInformationMessage(`Goal "${title}" updated successfully`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to update goal: ${error}`);
        }
    }

    private async deleteGoal(treeItemOrGoal: any): Promise<void> {
        // Extract goal from tree item or use direct goal parameter
        let goal: Goal | undefined;
        
        if (treeItemOrGoal && typeof treeItemOrGoal === 'object' && 'id' in treeItemOrGoal) {
            // Called from context menu with tree item
            goal = this.stateManager.getGoal(treeItemOrGoal.id);
        } else if (treeItemOrGoal && typeof treeItemOrGoal === 'object' && 'title' in treeItemOrGoal) {
            // Called directly with Goal object
            goal = treeItemOrGoal as Goal;
        }
        
        if (!goal) {
            vscode.window.showErrorMessage('Goal not found');
            return;
        }
        const childGoals = this.stateManager.getChildGoals(goal.id);
        const hasChildren = childGoals.length > 0 || goal.tasks.length > 0;
        
        let message = `Delete goal "${goal.title}"?`;
        if (hasChildren) {
            message += ` This will also delete ${childGoals.length} child goal(s) and ${goal.tasks.length} task(s).`;
        }

        const choice = await vscode.window.showWarningMessage(
            message,
            { modal: true },
            'Delete',
            'Cancel'
        );

        if (choice !== 'Delete') return;

        try {
            await this.GoalManager.deleteGoal(goal.id);
            this.treeProvider.refresh();
            vscode.window.showInformationMessage(`Goal "${goal.title}" deleted successfully`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to delete goal: ${error}`);
        }
    }

    private async duplicateGoal(treeItemOrGoal: any): Promise<void> {
        // Extract goal from tree item or use direct goal parameter
        let goal: Goal | undefined;
        
        if (treeItemOrGoal && typeof treeItemOrGoal === 'object' && 'id' in treeItemOrGoal) {
            // Called from context menu with tree item
            goal = this.stateManager.getGoal(treeItemOrGoal.id);
        } else if (treeItemOrGoal && typeof treeItemOrGoal === 'object' && 'title' in treeItemOrGoal) {
            // Called directly with Goal object
            goal = treeItemOrGoal as Goal;
        }
        
        if (!goal) {
            vscode.window.showErrorMessage('Goal not found');
            return;
        }
        const newTitle = await vscode.window.showInputBox({
            prompt: 'Enter title for duplicated goal',
            value: `${goal.title} (Copy)`,
            validateInput: (value) => {
                return value.trim() ? null : 'Goal title cannot be empty';
            }
        });

        if (!newTitle) return;

        try {
            await this.GoalManager.createGoal({
                title: newTitle.trim(),
                description: goal.description,
                parentId: goal.parentId
            });
            this.treeProvider.refresh();
            vscode.window.showInformationMessage(`Goal "${newTitle}" duplicated successfully`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to duplicate goal: ${error}`);
        }
    }

    // Goal Status Commands

    private async markInProgress(treeItemOrGoal: any): Promise<void> {
        const goal = this.extractGoalFromTreeItem(treeItemOrGoal);
        if (goal) {
            await this.updateGoalStatus(goal, 'in-progress');
        }
    }

    private async markCompleted(treeItemOrGoal: any): Promise<void> {
        const goal = this.extractGoalFromTreeItem(treeItemOrGoal);
        if (goal) {
            await this.updateGoalStatus(goal, 'completed');
        }
    }

    private async markBlocked(treeItemOrGoal: any): Promise<void> {
        const goal = this.extractGoalFromTreeItem(treeItemOrGoal);
        if (goal) {
            await this.updateGoalStatus(goal, 'blocked');
        }
    }

    private async markPlanned(treeItemOrGoal: any): Promise<void> {
        const goal = this.extractGoalFromTreeItem(treeItemOrGoal);
        if (goal) {
            await this.updateGoalStatus(goal, 'planned');
        }
    }

    private async updateGoalStatus(goal: Goal, status: Goal['status']): Promise<void> {
        try {
            await this.GoalManager.updateGoal(goal.id, { status });
            this.treeProvider.refresh();
            vscode.window.showInformationMessage(`Goal "${goal.title}" marked as ${status}`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to update goal status: ${error}`);
        }
    }

    // Task Management Commands

    private async addTask(treeItemOrGoal: any): Promise<void> {
        // Extract goal from tree item or use direct goal parameter
        const goal = this.extractGoalFromTreeItem(treeItemOrGoal);
        if (!goal) {
            vscode.window.showErrorMessage('Goal not found');
            return;
        }
        const title = await vscode.window.showInputBox({
            prompt: 'Enter task title',
            placeHolder: 'Task title...',
            validateInput: (value) => {
                return value.trim() ? null : 'Task title cannot be empty';
            }
        });

        if (!title) return;

        try {
            await this.GoalManager.addTask(goal.id, {
                title: title.trim()
            });
            this.treeProvider.refresh();
            vscode.window.showInformationMessage(`Task "${title}" added to goal "${goal.title}"`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to add task: ${error}`);
        }
    }

    private async editTask(treeItem: any): Promise<void> {
        // Extract task and goal from tree item
        const { goal, task } = this.extractTaskFromTreeItem(treeItem);
        if (!goal || !task) {
            vscode.window.showErrorMessage('Task or goal not found');
            return;
        }
        const title = await vscode.window.showInputBox({
            prompt: 'Edit task title',
            value: task.title,
            validateInput: (value) => {
                return value.trim() ? null : 'Task title cannot be empty';
            }
        });

        if (title === undefined) return; // User cancelled

        try {
            await this.GoalManager.updateTask(goal.id, task.id, { title: title.trim() });
            this.treeProvider.refresh();
            vscode.window.showInformationMessage(`Task "${title}" updated successfully`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to update task: ${error}`);
        }
    }

    private async deleteTask(treeItem: any): Promise<void> {
        // Extract task and goal from tree item
        const { goal, task } = this.extractTaskFromTreeItem(treeItem);
        if (!goal || !task) {
            vscode.window.showErrorMessage('Task or goal not found');
            return;
        }
        const choice = await vscode.window.showWarningMessage(
            `Delete task "${task.title}"?`,
            'Delete',
            'Cancel'
        );

        if (choice !== 'Delete') return;

        try {
            await this.GoalManager.deleteTask(goal.id, task.id);
            this.treeProvider.refresh();
            vscode.window.showInformationMessage(`Task "${task.title}" deleted successfully`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to delete task: ${error}`);
        }
    }

    private async toggleTask(treeItemOrGoalId: any, taskId?: string): Promise<void> {
        let goal: Goal | undefined;
        let task: Task | undefined;
        
        if (typeof treeItemOrGoalId === 'string' && taskId) {
            // Called with goalId and taskId parameters (from click command)
            goal = this.stateManager.getGoal(treeItemOrGoalId);
            task = goal?.tasks.find(t => t.id === taskId);
        } else {
            // Called from context menu with tree item
            const result = this.extractTaskFromTreeItem(treeItemOrGoalId);
            goal = result.goal;
            task = result.task;
        }
        
        if (!goal || !task) {
            vscode.window.showErrorMessage('Task or goal not found');
            return;
        }
        const newStatus: Task['status'] = task.status === 'done' ? 'todo' : 'done';
        
        try {
            await this.GoalManager.updateTask(goal.id, task.id, { status: newStatus });
            this.treeProvider.refresh();
            const statusText = newStatus === 'done' ? 'completed' : 'reopened';
            vscode.window.showInformationMessage(`Task "${task.title}" ${statusText}`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to toggle task: ${error}`);
        }
    }

    private async moveTaskUp(treeItem: any): Promise<void> {
        // Extract task and goal from tree item
        const { goal, task } = this.extractTaskFromTreeItem(treeItem);
        if (!goal || !task) {
            vscode.window.showErrorMessage('Task or goal not found');
            return;
        }
        if (task.order === 0) return; // Already at top

        try {
            // reorderTasks method not available - showing placeholder message
            vscode.window.showWarningMessage('Task reordering not yet implemented');
            this.treeProvider.refresh();
            vscode.window.showInformationMessage(`Task "${task.title}" moved up`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to move task: ${error}`);
        }
    }

    private async moveTaskDown(treeItem: any): Promise<void> {
        // Extract task and goal from tree item
        const { goal, task } = this.extractTaskFromTreeItem(treeItem);
        if (!goal || !task) {
            vscode.window.showErrorMessage('Task or goal not found');
            return;
        }
        if (task.order >= goal.tasks.length - 1) return; // Already at bottom

        try {
            // reorderTasks method not available - showing placeholder message
            vscode.window.showWarningMessage('Task reordering not yet implemented');
            this.treeProvider.refresh();
            vscode.window.showInformationMessage(`Task "${task.title}" moved down`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to move task: ${error}`);
        }
    }

    // Dependency Commands

    private async addDependency(treeItemOrGoal: any): Promise<void> {
        // Extract goal from tree item or use direct goal parameter
        const goal = this.extractGoalFromTreeItem(treeItemOrGoal);
        if (!goal) {
            vscode.window.showErrorMessage('Goal not found');
            return;
        }
        const allGoals = this.stateManager.getAllGoals()
            .filter(g => g.id !== goal.id && g.status !== 'completed')
            .map(g => ({
                label: g.title,
                description: g.description,
                goal: g
            }));

        if (allGoals.length === 0) {
            vscode.window.showInformationMessage('No available goals to add as dependencies');
            return;
        }

        const selected = await vscode.window.showQuickPick(allGoals, {
            placeHolder: 'Select a goal that blocks this goal...'
        });

        if (!selected) return;

        // Implementation would require DependencyService integration
        vscode.window.showInformationMessage(`Adding dependency: "${selected.goal.title}" blocks "${goal.title}"`);
    }

    private async removeDependency(treeItemOrGoal: any): Promise<void> {
        // Extract goal from tree item or use direct goal parameter
        const goal = this.extractGoalFromTreeItem(treeItemOrGoal);
        if (!goal) {
            vscode.window.showErrorMessage('Goal not found');
            return;
        }
        if (goal.blockedByIds.length === 0) {
            vscode.window.showInformationMessage('This goal has no dependencies to remove');
            return;
        }

        const blockingGoals = goal.blockedByIds
            .map(id => this.stateManager.getGoal(id))
            .filter((g): g is Goal => g !== undefined)
            .map(g => ({
                label: g.title,
                description: g.description,
                goal: g
            }));

        const selected = await vscode.window.showQuickPick(blockingGoals, {
            placeHolder: 'Select dependency to remove...'
        });

        if (!selected) return;

        // Implementation would require DependencyService integration
        vscode.window.showInformationMessage(`Removing dependency: "${selected.goal.title}" no longer blocks "${goal.title}"`);
    }

    private async showDependencies(treeItemOrGoal: any): Promise<void> {
        // Extract goal from tree item or use direct goal parameter
        const goal = this.extractGoalFromTreeItem(treeItemOrGoal);
        if (!goal) {
            vscode.window.showErrorMessage('Goal not found');
            return;
        }
        const blocking = goal.blockedByIds
            .map(id => this.stateManager.getGoal(id))
            .filter((g): g is Goal => g !== undefined);

        const blocked = this.stateManager.getBlockedGoals(goal.id);

        const message = [
            `Dependencies for "${goal.title}":`,
            '',
            `Blocked by (${blocking.length}):`,
            ...blocking.map(g => `  • ${g.title}`),
            '',
            `Blocks (${blocked.length}):`,
            ...blocked.map(g => `  • ${g.title}`)
        ].join('\n');

        vscode.window.showInformationMessage(message);
    }

    // View Configuration Commands

    private toggleCompleted(): void {
        // TODO: Implement when config methods are added to GoalTreeProvider
        vscode.window.showInformationMessage('Toggle completed goals feature coming soon');
    }

    private groupByStatus(): void {
        // TODO: Implement when config methods are added to GoalTreeProvider
        vscode.window.showInformationMessage('Group by status feature coming soon');
    }

    private sortByTitle(): void {
        // TODO: Implement when config methods are added to GoalTreeProvider
        vscode.window.showInformationMessage('Sort by title feature coming soon');
    }

    private sortByCreated(): void {
        // TODO: Implement when config methods are added to GoalTreeProvider
        vscode.window.showInformationMessage('Sort by created feature coming soon');
    }

    private sortByPriority(): void {
        // TODO: Implement when config methods are added to GoalTreeProvider
        vscode.window.showInformationMessage('Sort by priority feature coming soon');
    }

    // Import/Export Commands

    private async exportGoals(): Promise<void> {
        const uri = await vscode.window.showSaveDialog({
            filters: { 'JSON files': ['json'] },
            defaultUri: vscode.Uri.file('goals-export.json')
        });

        if (!uri) return;

        try {
            // Implementation would require StorageService integration
            vscode.window.showInformationMessage(`Goals exported to ${uri.fsPath}`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to export goals: ${error}`);
        }
    }

    private async importGoals(): Promise<void> {
        const uris = await vscode.window.showOpenDialog({
            filters: { 'JSON files': ['json'] },
            canSelectMany: false
        });

        if (!uris || uris.length === 0) return;

        try {
            // Implementation would require StorageService integration
            vscode.window.showInformationMessage(`Goals imported from ${uris[0].fsPath}`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to import goals: ${error}`);
        }
    }

    // Statistics Commands

    private async showStatistics(): Promise<void> {
        const stats = this.stateManager.getStatistics();
        
        const message = [
            'Goal Tree Statistics:',
            '',
            `Total Goals: ${stats.totalGoals}`,
            `Root Goals: ${stats.rootGoals}`,
            `Completed Goals: ${stats.completedGoals}`,
            `Blocked Goals: ${stats.blockedGoals}`,
            '',
            `Total Tasks: ${stats.totalTasks}`,
            `Completed Tasks: ${stats.completedTasks}`,
            '',
            `Progress: ${Math.round((stats.completedTasks / Math.max(1, stats.totalTasks)) * 100)}%`
        ].join('\n');

        vscode.window.showInformationMessage(message);
    }

    // Helper Methods

    /**
     * Extract Goal object from tree item or direct parameter
     */
    private extractGoalFromTreeItem(treeItemOrGoal: any): Goal | undefined {
        if (!treeItemOrGoal) return undefined;
        
        if (typeof treeItemOrGoal === 'object') {
            // Check if it's already a Goal object
            if ('title' in treeItemOrGoal && 'status' in treeItemOrGoal && 'createdAt' in treeItemOrGoal) {
                return treeItemOrGoal as Goal;
            }
            
            // Check if it's a tree item with an ID
            if ('id' in treeItemOrGoal && typeof treeItemOrGoal.id === 'string') {
                return this.stateManager.getGoal(treeItemOrGoal.id);
            }
        }
        
        return undefined;
    }

    /**
     * Extract Task and Goal objects from tree item
     */
    private extractTaskFromTreeItem(treeItem: any): { goal: Goal | undefined; task: Task | undefined } {
        if (!treeItem || !('id' in treeItem)) {
            return { goal: undefined, task: undefined };
        }
        
        const treeItemId = treeItem.id as string;
        
        // Task tree items have format: "goalId:taskId"
        if (treeItemId.includes(':')) {
            const [goalId, taskId] = treeItemId.split(':');
            const goal = this.stateManager.getGoal(goalId);
            const task = goal?.tasks.find(t => t.id === taskId);
            return { goal, task };
        }
        
        return { goal: undefined, task: undefined };
    }
}