/**
 * TreeCommands.ts - Command handlers for goal tree operations
 * 
 * This file provides command implementations for all goal tree operations
 * including goal/task creation, editing, status changes, and management.
 * Commands are designed to work with both command palette and context menus.
 */

import * as vscode from 'vscode';
import { Goal, Task, GoalStatus, TaskStatus } from '../types/Goal';
import { StateManager } from '../services/stateManager';
import { GoalManager } from '../services/goalManager';
import { GoalTreeProvider } from '../providers/goalTreeProvider';
import { ChangeNotificationService } from '../services/ChangeNotificationService';
import { createLogger } from '../utils/logger';
import { TREE_CONTEXT_VALUES } from '../types/TreeTypes';

/**
 * Tree command handler class - manages all tree-related commands
 */
export class TreeCommands {
    private logger = createLogger('TreeCommands');

    constructor(
        private stateManager: StateManager,
        private goalManager: GoalManager,
        private treeProvider: GoalTreeProvider,
        private changeNotificationService: ChangeNotificationService
    ) {}

    /**
     * Register all tree commands with VS Code
     */
    registerCommands(context: vscode.ExtensionContext): void {
        const commands = [
            // Goal creation commands
            vscode.commands.registerCommand('goalTree.createGoal', this.createGoal.bind(this)),
            vscode.commands.registerCommand('goalTree.createSubGoal', this.createSubGoal.bind(this)),
            vscode.commands.registerCommand('goalTree.duplicateGoal', this.duplicateGoal.bind(this)),

            // Task commands
            vscode.commands.registerCommand('goalTree.addTask', this.addTask.bind(this)),
            vscode.commands.registerCommand('goalTree.toggleTask', this.toggleTask.bind(this)),
            vscode.commands.registerCommand('goalTree.moveTaskUp', this.moveTaskUp.bind(this)),
            vscode.commands.registerCommand('goalTree.moveTaskDown', this.moveTaskDown.bind(this)),
            vscode.commands.registerCommand('goalTree.editTask', this.editTask.bind(this)),
            vscode.commands.registerCommand('goalTree.deleteTask', this.deleteTask.bind(this)),

            // Goal editing commands
            vscode.commands.registerCommand('goalTree.editGoal', this.editGoal.bind(this)),
            vscode.commands.registerCommand('goalTree.deleteGoal', this.deleteGoal.bind(this)),

            // Status management commands
            vscode.commands.registerCommand('goalTree.markPlanned', this.markPlanned.bind(this)),
            vscode.commands.registerCommand('goalTree.markInProgress', this.markInProgress.bind(this)),
            vscode.commands.registerCommand('goalTree.markCompleted', this.markCompleted.bind(this)),
            vscode.commands.registerCommand('goalTree.markBlocked', this.markBlocked.bind(this)),

            // Dependency management commands
            vscode.commands.registerCommand('goalTree.addDependency', this.addDependency.bind(this)),
            vscode.commands.registerCommand('goalTree.removeDependency', this.removeDependency.bind(this)),
            vscode.commands.registerCommand('goalTree.showDependencies', this.showDependencies.bind(this)),

            // View management commands
            vscode.commands.registerCommand('goalTree.refreshView', this.refreshView.bind(this)),
            vscode.commands.registerCommand('goalTree.openView', this.openView.bind(this)),
            vscode.commands.registerCommand('goalTree.expandAll', this.expandAll.bind(this)),
            vscode.commands.registerCommand('goalTree.collapseAll', this.collapseAll.bind(this)),

            // Configuration commands
            vscode.commands.registerCommand('goalTree.toggleShowCompleted', this.toggleShowCompleted.bind(this)),
            vscode.commands.registerCommand('goalTree.toggleSortByTitle', this.toggleSortByTitle.bind(this)),
            vscode.commands.registerCommand('goalTree.toggleGroupByStatus', this.toggleGroupByStatus.bind(this)),

            // Search and filter commands
            vscode.commands.registerCommand('goalTree.searchGoals', this.searchGoals.bind(this)),
            vscode.commands.registerCommand('goalTree.filterByStatus', this.filterByStatus.bind(this)),
            vscode.commands.registerCommand('goalTree.showOnlyBlocked', this.showOnlyBlocked.bind(this)),
            vscode.commands.registerCommand('goalTree.showOnlyHighPriority', this.showOnlyHighPriority.bind(this)),

            // Navigation commands
            vscode.commands.registerCommand('goalTree.goToParent', this.goToParent.bind(this)),
            vscode.commands.registerCommand('goalTree.goToFirstChild', this.goToFirstChild.bind(this)),
            vscode.commands.registerCommand('goalTree.focusNextGoal', this.focusNextGoal.bind(this)),
            vscode.commands.registerCommand('goalTree.focusPreviousGoal', this.focusPreviousGoal.bind(this))
        ];

        // Register all commands
        commands.forEach(command => context.subscriptions.push(command));

        this.logger.info('Registered all tree commands', { commandCount: commands.length });
    }

    // Goal Creation Commands

    /**
     * Create a new root-level goal
     */
    async createGoal(): Promise<void> {
        try {
            const goalTitle = await vscode.window.showInputBox({
                prompt: 'Enter goal title',
                placeHolder: 'My new goal...',
                validateInput: (value) => {
                    if (!value.trim()) {
                        return 'Goal title cannot be empty';
                    }
                    if (value.length > 100) {
                        return 'Goal title must be 100 characters or less';
                    }
                    return null;
                }
            });

            if (!goalTitle) {
                return; // User cancelled
            }

            const description = await vscode.window.showInputBox({
                prompt: 'Enter goal description (optional)',
                placeHolder: 'Describe your goal...'
            });

            const goal = await this.goalManager.createGoal(goalTitle.trim(), undefined, {
                description: description?.trim()
            });

            this.treeProvider.refresh();
            this.changeNotificationService.emit('goal:created', { goalId: goal.id, goal });
            
            vscode.window.showInformationMessage(`Goal created: ${goalTitle}`);
            this.logger.info('Goal created successfully', { goalId: goal.id, title: goalTitle });

            // Expand to show the new goal
            await vscode.commands.executeCommand('goalTreeView.reveal', goal.id, {
                select: true,
                focus: true,
                expand: true
            });

        } catch (error) {
            this.logger.error('Failed to create goal', error);
            vscode.window.showErrorMessage(`Failed to create goal: ${error}`);
        }
    }

    /**
     * Create a sub-goal under the selected goal
     */
    async createSubGoal(goalId?: string): Promise<void> {
        try {
            // If no goalId provided, get from tree selection or prompt
            if (!goalId) {
                goalId = await this.getSelectedGoalId();
                if (!goalId) {
                    return;
                }
            }

            const parentGoal = this.stateManager.getGoal(goalId);
            if (!parentGoal) {
                vscode.window.showErrorMessage('Parent goal not found');
                return;
            }

            const goalTitle = await vscode.window.showInputBox({
                prompt: `Enter sub-goal title for "${parentGoal.title}"`,
                placeHolder: 'Sub-goal title...',
                validateInput: (value) => {
                    if (!value.trim()) {
                        return 'Sub-goal title cannot be empty';
                    }
                    if (value.length > 100) {
                        return 'Sub-goal title must be 100 characters or less';
                    }
                    return null;
                }
            });

            if (!goalTitle) {
                return; // User cancelled
            }

            const description = await vscode.window.showInputBox({
                prompt: 'Enter sub-goal description (optional)',
                placeHolder: 'Describe your sub-goal...'
            });

            const subGoal = await this.goalManager.createGoal(goalTitle.trim(), goalId, {
                description: description?.trim()
            });

            this.treeProvider.refresh();
            this.changeNotificationService.emit('goal:created', { goalId: subGoal.id, goal: subGoal, parentId: goalId });
            
            vscode.window.showInformationMessage(`Sub-goal created: ${goalTitle}`);
            this.logger.info('Sub-goal created successfully', { goalId: subGoal.id, parentId: goalId, title: goalTitle });

            // Expand parent and reveal the new sub-goal
            await vscode.commands.executeCommand('goalTreeView.reveal', subGoal.id, {
                select: true,
                focus: true,
                expand: true
            });

        } catch (error) {
            this.logger.error('Failed to create sub-goal', error);
            vscode.window.showErrorMessage(`Failed to create sub-goal: ${error}`);
        }
    }

    /**
     * Duplicate an existing goal
     */
    async duplicateGoal(goalId?: string): Promise<void> {
        try {
            if (!goalId) {
                goalId = await this.getSelectedGoalId();
                if (!goalId) {
                    return;
                }
            }

            const goal = this.stateManager.getGoal(goalId);
            if (!goal) {
                vscode.window.showErrorMessage('Goal not found');
                return;
            }

            const newTitle = await vscode.window.showInputBox({
                prompt: 'Enter title for duplicated goal',
                value: `${goal.title} (Copy)`,
                validateInput: (value) => {
                    if (!value.trim()) {
                        return 'Goal title cannot be empty';
                    }
                    if (value.length > 100) {
                        return 'Goal title must be 100 characters or less';
                    }
                    return null;
                }
            });

            if (!newTitle) {
                return; // User cancelled
            }

            const duplicatedGoal = await this.goalManager.duplicateGoal(goalId, newTitle.trim());

            this.treeProvider.refresh();
            this.changeNotificationService.emit('goal:created', { goalId: duplicatedGoal.id, goal: duplicatedGoal });
            
            vscode.window.showInformationMessage(`Goal duplicated: ${newTitle}`);
            this.logger.info('Goal duplicated successfully', { originalId: goalId, newId: duplicatedGoal.id });

            // Reveal the duplicated goal
            await vscode.commands.executeCommand('goalTreeView.reveal', duplicatedGoal.id, {
                select: true,
                focus: true,
                expand: true
            });

        } catch (error) {
            this.logger.error('Failed to duplicate goal', error);
            vscode.window.showErrorMessage(`Failed to duplicate goal: ${error}`);
        }
    }

    // Task Commands

    /**
     * Add a task to a goal
     */
    async addTask(goalId?: string): Promise<void> {
        try {
            if (!goalId) {
                goalId = await this.getSelectedGoalId();
                if (!goalId) {
                    return;
                }
            }

            const goal = this.stateManager.getGoal(goalId);
            if (!goal) {
                vscode.window.showErrorMessage('Goal not found');
                return;
            }

            const taskTitle = await vscode.window.showInputBox({
                prompt: `Add task to "${goal.title}"`,
                placeHolder: 'Task description...',
                validateInput: (value) => {
                    if (!value.trim()) {
                        return 'Task title cannot be empty';
                    }
                    if (value.length > 200) {
                        return 'Task title must be 200 characters or less';
                    }
                    return null;
                }
            });

            if (!taskTitle) {
                return; // User cancelled
            }

            const task = await this.goalManager.createTask(goalId, taskTitle.trim());

            this.treeProvider.refresh();
            this.changeNotificationService.emit('task:created', { goalId, taskId: task.id, task });
            
            vscode.window.showInformationMessage(`Task added: ${taskTitle}`);
            this.logger.info('Task created successfully', { goalId, taskId: task.id, title: taskTitle });

            // Expand parent goal to show the new task
            await vscode.commands.executeCommand('goalTreeView.reveal', `${goalId}:${task.id}`, {
                select: true,
                focus: true
            });

        } catch (error) {
            this.logger.error('Failed to create task', error);
            vscode.window.showErrorMessage(`Failed to create task: ${error}`);
        }
    }

    /**
     * Toggle task completion status
     */
    async toggleTask(goalId?: string, taskId?: string): Promise<void> {
        try {
            if (!goalId || !taskId) {
                const selection = await this.getSelectedTaskId();
                if (!selection) {
                    return;
                }
                goalId = selection.goalId;
                taskId = selection.taskId;
            }

            const goal = this.stateManager.getGoal(goalId);
            if (!goal) {
                vscode.window.showErrorMessage('Goal not found');
                return;
            }

            const task = goal.tasks.find(t => t.id === taskId);
            if (!task) {
                vscode.window.showErrorMessage('Task not found');
                return;
            }

            // Cycle through task statuses: todo -> in-progress -> done -> todo
            let newStatus: TaskStatus;
            switch (task.status) {
                case 'todo':
                    newStatus = 'in-progress';
                    break;
                case 'in-progress':
                    newStatus = 'done';
                    break;
                case 'done':
                    newStatus = 'todo';
                    break;
                default:
                    newStatus = 'in-progress';
            }

            await this.goalManager.updateTask(goalId, taskId, { status: newStatus });

            this.treeProvider.refresh();
            this.changeNotificationService.emit('task:status-changed', { goalId, taskId, newStatus, oldStatus: task.status });

            this.logger.info('Task status toggled', { goalId, taskId, newStatus, oldStatus: task.status });

        } catch (error) {
            this.logger.error('Failed to toggle task', error);
            vscode.window.showErrorMessage(`Failed to toggle task: ${error}`);
        }
    }

    /**
     * Move task up in order
     */
    async moveTaskUp(goalId?: string, taskId?: string): Promise<void> {
        try {
            if (!goalId || !taskId) {
                const selection = await this.getSelectedTaskId();
                if (!selection) {
                    return;
                }
                goalId = selection.goalId;
                taskId = selection.taskId;
            }

            await this.goalManager.moveTask(goalId, taskId, 'up');

            this.treeProvider.refresh();
            this.changeNotificationService.emit('task:updated', { goalId, taskId });
            
            this.logger.info('Task moved up', { goalId, taskId });

        } catch (error) {
            this.logger.error('Failed to move task up', error);
            vscode.window.showErrorMessage(`Failed to move task up: ${error}`);
        }
    }

    /**
     * Move task down in order
     */
    async moveTaskDown(goalId?: string, taskId?: string): Promise<void> {
        try {
            if (!goalId || !taskId) {
                const selection = await this.getSelectedTaskId();
                if (!selection) {
                    return;
                }
                goalId = selection.goalId;
                taskId = selection.taskId;
            }

            await this.goalManager.moveTask(goalId, taskId, 'down');

            this.treeProvider.refresh();
            this.changeNotificationService.emit('task:updated', { goalId, taskId });
            
            this.logger.info('Task moved down', { goalId, taskId });

        } catch (error) {
            this.logger.error('Failed to move task down', error);
            vscode.window.showErrorMessage(`Failed to move task down: ${error}`);
        }
    }

    /**
     * Edit a task
     */
    async editTask(goalId?: string, taskId?: string): Promise<void> {
        try {
            if (!goalId || !taskId) {
                const selection = await this.getSelectedTaskId();
                if (!selection) {
                    return;
                }
                goalId = selection.goalId;
                taskId = selection.taskId;
            }

            const goal = this.stateManager.getGoal(goalId);
            if (!goal) {
                vscode.window.showErrorMessage('Goal not found');
                return;
            }

            const task = goal.tasks.find(t => t.id === taskId);
            if (!task) {
                vscode.window.showErrorMessage('Task not found');
                return;
            }

            const newTitle = await vscode.window.showInputBox({
                prompt: 'Edit task title',
                value: task.title,
                validateInput: (value) => {
                    if (!value.trim()) {
                        return 'Task title cannot be empty';
                    }
                    if (value.length > 200) {
                        return 'Task title must be 200 characters or less';
                    }
                    return null;
                }
            });

            if (newTitle === undefined) {
                return; // User cancelled
            }

            const newDescription = await vscode.window.showInputBox({
                prompt: 'Edit task description (optional)',
                value: task.description || '',
                placeHolder: 'Task description...'
            });

            await this.goalManager.updateTask(goalId, taskId, {
                title: newTitle.trim(),
                description: newDescription?.trim() || undefined
            });

            this.treeProvider.refresh();
            this.changeNotificationService.emit('task:updated', { goalId, taskId });
            
            vscode.window.showInformationMessage(`Task updated: ${newTitle}`);
            this.logger.info('Task edited successfully', { goalId, taskId, newTitle });

        } catch (error) {
            this.logger.error('Failed to edit task', error);
            vscode.window.showErrorMessage(`Failed to edit task: ${error}`);
        }
    }

    /**
     * Delete a task
     */
    async deleteTask(goalId?: string, taskId?: string): Promise<void> {
        try {
            if (!goalId || !taskId) {
                const selection = await this.getSelectedTaskId();
                if (!selection) {
                    return;
                }
                goalId = selection.goalId;
                taskId = selection.taskId;
            }

            const goal = this.stateManager.getGoal(goalId);
            if (!goal) {
                vscode.window.showErrorMessage('Goal not found');
                return;
            }

            const task = goal.tasks.find(t => t.id === taskId);
            if (!task) {
                vscode.window.showErrorMessage('Task not found');
                return;
            }

            const confirmation = await vscode.window.showWarningMessage(
                `Are you sure you want to delete task "${task.title}"?`,
                { modal: true },
                'Delete'
            );

            if (confirmation !== 'Delete') {
                return;
            }

            await this.goalManager.deleteTask(goalId, taskId);

            this.treeProvider.refresh();
            this.changeNotificationService.emit('task:deleted', { goalId, taskId });
            
            vscode.window.showInformationMessage('Task deleted successfully');
            this.logger.info('Task deleted successfully', { goalId, taskId });

        } catch (error) {
            this.logger.error('Failed to delete task', error);
            vscode.window.showErrorMessage(`Failed to delete task: ${error}`);
        }
    }

    // Goal Status Commands

    /**
     * Mark goal as planned
     */
    async markPlanned(goalId?: string): Promise<void> {
        await this.changeGoalStatus(goalId, 'planned');
    }

    /**
     * Mark goal as in progress
     */
    async markInProgress(goalId?: string): Promise<void> {
        await this.changeGoalStatus(goalId, 'in-progress');
    }

    /**
     * Mark goal as completed
     */
    async markCompleted(goalId?: string): Promise<void> {
        await this.changeGoalStatus(goalId, 'completed');
    }

    /**
     * Mark goal as blocked
     */
    async markBlocked(goalId?: string): Promise<void> {
        await this.changeGoalStatus(goalId, 'blocked');
    }

    /**
     * Common method to change goal status
     */
    private async changeGoalStatus(goalId: string | undefined, status: GoalStatus): Promise<void> {
        try {
            if (!goalId) {
                goalId = await this.getSelectedGoalId();
                if (!goalId) {
                    return;
                }
            }

            const goal = this.stateManager.getGoal(goalId);
            if (!goal) {
                vscode.window.showErrorMessage('Goal not found');
                return;
            }

            if (goal.status === status) {
                vscode.window.showInformationMessage(`Goal is already ${status}`);
                return;
            }

            await this.goalManager.updateGoalStatus(goalId, status);

            this.treeProvider.refresh();
            this.changeNotificationService.emit('goal:status-changed', { goalId, newStatus: status, oldStatus: goal.status });
            
            vscode.window.showInformationMessage(`Goal marked as ${status}: ${goal.title}`);
            this.logger.info('Goal status changed', { goalId, newStatus: status, oldStatus: goal.status });

        } catch (error) {
            this.logger.error(`Failed to mark goal as ${status}`, error);
            vscode.window.showErrorMessage(`Failed to mark goal as ${status}: ${error}`);
        }
    }

    // Goal Editing Commands

    /**
     * Edit a goal
     */
    async editGoal(goalId?: string): Promise<void> {
        try {
            if (!goalId) {
                goalId = await this.getSelectedGoalId();
                if (!goalId) {
                    return;
                }
            }

            const goal = this.stateManager.getGoal(goalId);
            if (!goal) {
                vscode.window.showErrorMessage('Goal not found');
                return;
            }

            const newTitle = await vscode.window.showInputBox({
                prompt: 'Edit goal title',
                value: goal.title,
                validateInput: (value) => {
                    if (!value.trim()) {
                        return 'Goal title cannot be empty';
                    }
                    if (value.length > 100) {
                        return 'Goal title must be 100 characters or less';
                    }
                    return null;
                }
            });

            if (newTitle === undefined) {
                return; // User cancelled
            }

            const newDescription = await vscode.window.showInputBox({
                prompt: 'Edit goal description (optional)',
                value: goal.description || '',
                placeHolder: 'Goal description...'
            });

            await this.goalManager.updateGoal(goalId, {
                title: newTitle.trim(),
                description: newDescription?.trim() || undefined
            });

            this.treeProvider.refresh();
            this.changeNotificationService.emit('goal:updated', { goalId });
            
            vscode.window.showInformationMessage(`Goal updated: ${newTitle}`);
            this.logger.info('Goal edited successfully', { goalId, newTitle });

        } catch (error) {
            this.logger.error('Failed to edit goal', error);
            vscode.window.showErrorMessage(`Failed to edit goal: ${error}`);
        }
    }

    /**
     * Delete a goal
     */
    async deleteGoal(goalId?: string): Promise<void> {
        try {
            if (!goalId) {
                goalId = await this.getSelectedGoalId();
                if (!goalId) {
                    return;
                }
            }

            const goal = this.stateManager.getGoal(goalId);
            if (!goal) {
                vscode.window.showErrorMessage('Goal not found');
                return;
            }

            // Check for child goals
            const childGoals = this.stateManager.getChildGoals(goalId);
            let confirmationMessage = `Are you sure you want to delete goal "${goal.title}"?`;
            
            if (childGoals.length > 0) {
                confirmationMessage += `\n\nThis will also delete ${childGoals.length} child goal(s) and all their tasks.`;
            }
            
            if (goal.tasks.length > 0) {
                confirmationMessage += `\n\nThis will also delete ${goal.tasks.length} task(s).`;
            }

            const confirmation = await vscode.window.showWarningMessage(
                confirmationMessage,
                { modal: true },
                'Delete'
            );

            if (confirmation !== 'Delete') {
                return;
            }

            await this.goalManager.deleteGoal(goalId);

            this.treeProvider.refresh();
            this.changeNotificationService.emit('goal:deleted', { goalId });
            
            vscode.window.showInformationMessage('Goal deleted successfully');
            this.logger.info('Goal deleted successfully', { goalId });

        } catch (error) {
            this.logger.error('Failed to delete goal', error);
            vscode.window.showErrorMessage(`Failed to delete goal: ${error}`);
        }
    }

    // View Management Commands

    /**
     * Refresh the tree view
     */
    async refreshView(): Promise<void> {
        try {
            this.treeProvider.refresh();
            vscode.window.showInformationMessage('Goal Tree refreshed');
            this.logger.info('Tree view refreshed manually');
        } catch (error) {
            this.logger.error('Failed to refresh tree view', error);
            vscode.window.showErrorMessage(`Failed to refresh tree view: ${error}`);
        }
    }

    /**
     * Open the goal tree view
     */
    async openView(): Promise<void> {
        try {
            await vscode.commands.executeCommand('workbench.view.extension.goalTreeContainer');
            vscode.window.showInformationMessage('Goal Tree view opened');
            this.logger.info('Goal tree view opened');
        } catch (error) {
            this.logger.error('Failed to open tree view', error);
            vscode.window.showErrorMessage(`Failed to open tree view: ${error}`);
        }
    }

    /**
     * Expand all tree nodes
     */
    async expandAll(): Promise<void> {
        try {
            await vscode.commands.executeCommand('goalTreeView.expandAll');
            this.logger.info('All tree nodes expanded');
        } catch (error) {
            this.logger.error('Failed to expand all nodes', error);
        }
    }

    /**
     * Collapse all tree nodes
     */
    async collapseAll(): Promise<void> {
        try {
            await vscode.commands.executeCommand('goalTreeView.collapseAll');
            this.logger.info('All tree nodes collapsed');
        } catch (error) {
            this.logger.error('Failed to collapse all nodes', error);
        }
    }

    // Configuration Commands

    /**
     * Toggle showing completed items
     */
    async toggleShowCompleted(): Promise<void> {
        const config = vscode.workspace.getConfiguration('goalTree');
        const currentValue = config.get('showCompleted', true);
        await config.update('showCompleted', !currentValue, vscode.ConfigurationTarget.Workspace);
        
        const message = !currentValue ? 'Now showing completed items' : 'Now hiding completed items';
        vscode.window.showInformationMessage(message);
        this.logger.info('Show completed toggled', { newValue: !currentValue });
    }

    /**
     * Toggle sorting by title
     */
    async toggleSortByTitle(): Promise<void> {
        const config = vscode.workspace.getConfiguration('goalTree');
        const currentValue = config.get('sortByTitle', false);
        await config.update('sortByTitle', !currentValue, vscode.ConfigurationTarget.Workspace);
        
        const message = !currentValue ? 'Now sorting by title' : 'Now sorting by creation date';
        vscode.window.showInformationMessage(message);
        this.logger.info('Sort by title toggled', { newValue: !currentValue });
    }

    /**
     * Toggle grouping by status
     */
    async toggleGroupByStatus(): Promise<void> {
        const config = vscode.workspace.getConfiguration('goalTree');
        const currentValue = config.get('groupByStatus', false);
        await config.update('groupByStatus', !currentValue, vscode.ConfigurationTarget.Workspace);
        
        const message = !currentValue ? 'Now grouping by status' : 'No longer grouping by status';
        vscode.window.showInformationMessage(message);
        this.logger.info('Group by status toggled', { newValue: !currentValue });
    }

    // Search and Filter Commands

    /**
     * Search for goals
     */
    async searchGoals(): Promise<void> {
        const searchTerm = await vscode.window.showInputBox({
            prompt: 'Search goals by title or description',
            placeHolder: 'Enter search term...'
        });

        if (!searchTerm) {
            return;
        }

        // TODO: Implement search functionality in tree provider
        vscode.window.showInformationMessage('Search functionality coming soon!');
        this.logger.info('Search requested', { searchTerm });
    }

    /**
     * Filter by status
     */
    async filterByStatus(): Promise<void> {
        const statuses: Array<{ label: string; value: GoalStatus }> = [
            { label: 'Planned', value: 'planned' },
            { label: 'In Progress', value: 'in-progress' },
            { label: 'Blocked', value: 'blocked' },
            { label: 'Completed', value: 'completed' }
        ];

        const selectedStatus = await vscode.window.showQuickPick(statuses, {
            placeHolder: 'Select status to filter by'
        });

        if (!selectedStatus) {
            return;
        }

        // TODO: Implement status filtering in tree provider
        vscode.window.showInformationMessage(`Filter by ${selectedStatus.label} coming soon!`);
        this.logger.info('Status filter requested', { status: selectedStatus.value });
    }

    /**
     * Show only blocked goals
     */
    async showOnlyBlocked(): Promise<void> {
        // TODO: Implement blocked filter in tree provider
        vscode.window.showInformationMessage('Show only blocked goals coming soon!');
        this.logger.info('Blocked filter requested');
    }

    /**
     * Show only high priority goals
     */
    async showOnlyHighPriority(): Promise<void> {
        // TODO: Implement priority filter in tree provider
        vscode.window.showInformationMessage('Show only high priority goals coming soon!');
        this.logger.info('High priority filter requested');
    }

    // Helper Methods

    /**
     * Get the currently selected goal ID from tree selection or prompt user
     */
    private async getSelectedGoalId(): Promise<string | undefined> {
        // TODO: Get from tree view selection
        // For now, let user pick from available goals
        const goals = this.stateManager.getAllGoals();
        if (goals.length === 0) {
            vscode.window.showInformationMessage('No goals available. Create a goal first.');
            return undefined;
        }

        const goalItems = goals.map(goal => ({
            label: goal.title,
            description: goal.status,
            detail: goal.description || undefined,
            goalId: goal.id
        }));

        const selectedItem = await vscode.window.showQuickPick(goalItems, {
            placeHolder: 'Select a goal'
        });

        return selectedItem?.goalId;
    }

    /**
     * Get the currently selected task ID from tree selection or prompt user
     */
    private async getSelectedTaskId(): Promise<{ goalId: string; taskId: string } | undefined> {
        // TODO: Get from tree view selection
        // For now, let user pick from available tasks
        const goals = this.stateManager.getAllGoals();
        const tasksWithGoals: Array<{ label: string; description: string; goalId: string; taskId: string }> = [];

        goals.forEach(goal => {
            goal.tasks.forEach(task => {
                tasksWithGoals.push({
                    label: task.title,
                    description: `${goal.title} - ${task.status}`,
                    goalId: goal.id,
                    taskId: task.id
                });
            });
        });

        if (tasksWithGoals.length === 0) {
            vscode.window.showInformationMessage('No tasks available. Create a task first.');
            return undefined;
        }

        const selectedItem = await vscode.window.showQuickPick(tasksWithGoals, {
            placeHolder: 'Select a task'
        });

        if (!selectedItem) {
            return undefined;
        }

        return {
            goalId: selectedItem.goalId,
            taskId: selectedItem.taskId
        };
    }

    // Dependency Management Commands

    /**
     * Add a dependency to a goal
     */
    async addDependency(goalId?: string): Promise<void> {
        try {
            if (!goalId) {
                goalId = await this.getSelectedGoalId();
                if (!goalId) {
                    return;
                }
            }

            const goal = this.stateManager.getGoal(goalId);
            if (!goal) {
                vscode.window.showErrorMessage('Goal not found');
                return;
            }

            // Get all goals except the current one and its children
            const allGoals = this.stateManager.getAllGoals();
            const availableGoals = allGoals.filter(g => 
                g.id !== goalId && 
                !goal.blockedByIds.includes(g.id) &&
                !this.isDescendant(goalId, g.id)
            );

            if (availableGoals.length === 0) {
                vscode.window.showInformationMessage('No available goals to add as dependency');
                return;
            }

            const goalItems = availableGoals.map(g => ({
                label: g.title,
                description: g.status,
                detail: g.description || undefined,
                goalId: g.id
            }));

            const selectedItem = await vscode.window.showQuickPick(goalItems, {
                placeHolder: 'Select goal to add as dependency'
            });

            if (!selectedItem) {
                return;
            }

            await this.goalManager.addDependency(goalId, selectedItem.goalId);

            this.treeProvider.refresh();
            this.changeNotificationService.emit('goal:updated', { goalId });
            
            vscode.window.showInformationMessage(`Dependency added: ${selectedItem.label}`);
            this.logger.info('Dependency added', { goalId, dependencyId: selectedItem.goalId });

        } catch (error) {
            this.logger.error('Failed to add dependency', error);
            vscode.window.showErrorMessage(`Failed to add dependency: ${error}`);
        }
    }

    /**
     * Remove a dependency from a goal
     */
    async removeDependency(goalId?: string): Promise<void> {
        try {
            if (!goalId) {
                goalId = await this.getSelectedGoalId();
                if (!goalId) {
                    return;
                }
            }

            const goal = this.stateManager.getGoal(goalId);
            if (!goal) {
                vscode.window.showErrorMessage('Goal not found');
                return;
            }

            if (goal.blockedByIds.length === 0) {
                vscode.window.showInformationMessage('Goal has no dependencies to remove');
                return;
            }

            const dependencyItems = goal.blockedByIds.map(depId => {
                const depGoal = this.stateManager.getGoal(depId);
                return {
                    label: depGoal?.title || depId,
                    description: depGoal?.status || 'Unknown',
                    dependencyId: depId
                };
            });

            const selectedItem = await vscode.window.showQuickPick(dependencyItems, {
                placeHolder: 'Select dependency to remove'
            });

            if (!selectedItem) {
                return;
            }

            await this.goalManager.removeDependency(goalId, selectedItem.dependencyId);

            this.treeProvider.refresh();
            this.changeNotificationService.emit('goal:updated', { goalId });
            
            vscode.window.showInformationMessage(`Dependency removed: ${selectedItem.label}`);
            this.logger.info('Dependency removed', { goalId, dependencyId: selectedItem.dependencyId });

        } catch (error) {
            this.logger.error('Failed to remove dependency', error);
            vscode.window.showErrorMessage(`Failed to remove dependency: ${error}`);
        }
    }

    /**
     * Show dependencies for a goal
     */
    async showDependencies(goalId?: string): Promise<void> {
        try {
            if (!goalId) {
                goalId = await this.getSelectedGoalId();
                if (!goalId) {
                    return;
                }
            }

            const goal = this.stateManager.getGoal(goalId);
            if (!goal) {
                vscode.window.showErrorMessage('Goal not found');
                return;
            }

            if (goal.blockedByIds.length === 0) {
                vscode.window.showInformationMessage(`Goal "${goal.title}" has no dependencies`);
                return;
            }

            const dependencies = goal.blockedByIds.map(depId => {
                const depGoal = this.stateManager.getGoal(depId);
                return depGoal ? `• ${depGoal.title} (${depGoal.status})` : `• ${depId} (not found)`;
            });

            const message = `Dependencies for "${goal.title}":\n\n${dependencies.join('\n')}`;
            vscode.window.showInformationMessage(message);
            
            this.logger.info('Dependencies shown', { goalId, dependencyCount: goal.blockedByIds.length });

        } catch (error) {
            this.logger.error('Failed to show dependencies', error);
            vscode.window.showErrorMessage(`Failed to show dependencies: ${error}`);
        }
    }

    // Navigation Commands (placeholders for future implementation)

    /**
     * Navigate to parent goal
     */
    async goToParent(): Promise<void> {
        // TODO: Implement navigation to parent
        vscode.window.showInformationMessage('Navigation to parent coming soon!');
    }

    /**
     * Navigate to first child goal
     */
    async goToFirstChild(): Promise<void> {
        // TODO: Implement navigation to first child
        vscode.window.showInformationMessage('Navigation to first child coming soon!');
    }

    /**
     * Focus next goal
     */
    async focusNextGoal(): Promise<void> {
        // TODO: Implement focus next goal
        vscode.window.showInformationMessage('Focus next goal coming soon!');
    }

    /**
     * Focus previous goal
     */
    async focusPreviousGoal(): Promise<void> {
        // TODO: Implement focus previous goal
        vscode.window.showInformationMessage('Focus previous goal coming soon!');
    }

    /**
     * Check if one goal is a descendant of another
     */
    private isDescendant(ancestorId: string, descendantId: string): boolean {
        const descendant = this.stateManager.getGoal(descendantId);
        if (!descendant || !descendant.parentId) {
            return false;
        }
        
        if (descendant.parentId === ancestorId) {
            return true;
        }
        
        return this.isDescendant(ancestorId, descendant.parentId);
    }
}