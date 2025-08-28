/**
 * TreeCommands.ts - Command handlers for goal tree operations
 * 
 * This file provides command implementations for all goal tree operations
 * including goal/task creation, editing, status changes, and management.
 * Commands are designed to work with both command palette and context menus.
 */

import * as vscode from 'vscode';
import { Goal, GoalStatus, TaskStatus } from '../types/Goal';
import { StateManager } from '../services/stateManager';
import { GoalManager } from '../services/goalManager';
import { GoalTreeProvider } from '../providers/goalTreeProvider';
import { ChangeNotificationService } from '../services/ChangeNotificationService';
import { createLogger } from '../utils/logger';
import { GoalUndoRedoService } from '../services/GoalUndoRedoService';

/**
 * Tree command handler class - manages all tree-related commands
 */
export class TreeCommands {
    private logger = createLogger('TreeCommands');
    private undoRedoService?: GoalUndoRedoService;

    constructor(
        private stateManager: StateManager,
        private goalManager: GoalManager,
        private treeProvider: GoalTreeProvider,
        private changeNotificationService: ChangeNotificationService,
        undoRedoService?: GoalUndoRedoService
    ) {
        this.undoRedoService = undoRedoService;
    }

    /**
     * Register all tree commands with VS Code
     * Enhanced with better error handling and validation
     */
    registerCommands(context: vscode.ExtensionContext): void {
        if (!context) {
            this.logger.error('Cannot register commands: invalid extension context');
            throw new Error('Extension context is required for command registration');
        }

        const commandDefinitions = [
            // Goal creation commands
            { id: 'goalTree.createGoal', handler: this.createGoal.bind(this), category: 'Goal Creation' },
            { id: 'goalTree.createSubGoal', handler: this.createSubGoal.bind(this), category: 'Goal Creation' },
            { id: 'goalTree.duplicateGoal', handler: this.duplicateGoal.bind(this), category: 'Goal Creation' },

            // Task commands
            { id: 'goalTree.addTask', handler: this.addTask.bind(this), category: 'Task Management' },
            { id: 'goalTree.toggleTask', handler: this.toggleTask.bind(this), category: 'Task Management' },
            { id: 'goalTree.moveTaskUp', handler: this.moveTaskUp.bind(this), category: 'Task Management' },
            { id: 'goalTree.moveTaskDown', handler: this.moveTaskDown.bind(this), category: 'Task Management' },
            { id: 'goalTree.editTask', handler: this.editTask.bind(this), category: 'Task Management' },
            { id: 'goalTree.deleteTask', handler: this.deleteTask.bind(this), category: 'Task Management' },

            // Goal editing commands
            { id: 'goalTree.editGoal', handler: this.editGoal.bind(this), category: 'Goal Management' },
            { id: 'goalTree.deleteGoal', handler: this.deleteGoal.bind(this), category: 'Goal Management' },

            // Status management commands
            { id: 'goalTree.markPlanned', handler: this.markPlanned.bind(this), category: 'Status Management' },
            { id: 'goalTree.markInProgress', handler: this.markInProgress.bind(this), category: 'Status Management' },
            { id: 'goalTree.markCompleted', handler: this.markCompleted.bind(this), category: 'Status Management' },
            { id: 'goalTree.markBlocked', handler: this.markBlocked.bind(this), category: 'Status Management' },

            // Dependency management commands
            { id: 'goalTree.addDependency', handler: this.addDependency.bind(this), category: 'Dependency Management' },
            { id: 'goalTree.removeDependency', handler: this.removeDependency.bind(this), category: 'Dependency Management' },
            { id: 'goalTree.showDependencies', handler: this.showDependencies.bind(this), category: 'Dependency Management' },

            // View management commands
            { id: 'goalTree.refreshView', handler: this.refreshView.bind(this), category: 'View Management' },
            { id: 'goalTree.openView', handler: this.openView.bind(this), category: 'View Management' },
            { id: 'goalTree.expandAll', handler: this.expandAll.bind(this), category: 'View Management' },
            { id: 'goalTree.collapseAll', handler: this.collapseAll.bind(this), category: 'View Management' },

            // Configuration commands
            { id: 'goalTree.toggleShowCompleted', handler: this.toggleShowCompleted.bind(this), category: 'Configuration' },
            { id: 'goalTree.toggleSortByTitle', handler: this.toggleSortByTitle.bind(this), category: 'Configuration' },
            { id: 'goalTree.toggleGroupByStatus', handler: this.toggleGroupByStatus.bind(this), category: 'Configuration' },

            // Search and filter commands
            { id: 'goalTree.searchGoals', handler: this.searchGoals.bind(this), category: 'Search & Filter' },
            { id: 'goalTree.filterByStatus', handler: this.filterByStatus.bind(this), category: 'Search & Filter' },
            { id: 'goalTree.showOnlyBlocked', handler: this.showOnlyBlocked.bind(this), category: 'Search & Filter' },
            { id: 'goalTree.showOnlyHighPriority', handler: this.showOnlyHighPriority.bind(this), category: 'Search & Filter' },

            // Navigation commands
            { id: 'goalTree.goToParent', handler: this.goToParent.bind(this), category: 'Navigation' },
            { id: 'goalTree.goToFirstChild', handler: this.goToFirstChild.bind(this), category: 'Navigation' },
            { id: 'goalTree.focusNextGoal', handler: this.focusNextGoal.bind(this), category: 'Navigation' },
            { id: 'goalTree.focusPreviousGoal', handler: this.focusPreviousGoal.bind(this), category: 'Navigation' },

            // Additional enhanced commands
            { id: 'goalTree.focusGoal', handler: this.focusGoal.bind(this), category: 'Navigation' },
            { id: 'goalTree.exportGoal', handler: this.exportGoal.bind(this), category: 'Data Management' },
            { id: 'goalTree.importGoals', handler: this.importGoals.bind(this), category: 'Data Management' },
            { id: 'goalTree.exportAll', handler: this.exportAll.bind(this), category: 'Data Management' },

            // Undo/Redo commands
            { id: 'goalTree.undo', handler: this.undo.bind(this), category: 'Undo/Redo' },
            { id: 'goalTree.redo', handler: this.redo.bind(this), category: 'Undo/Redo' },
            { id: 'goalTree.showUndoHistory', handler: this.showUndoHistory.bind(this), category: 'Undo/Redo' },
            { id: 'goalTree.clearUndoHistory', handler: this.clearUndoHistory.bind(this), category: 'Undo/Redo' },
            { id: 'goalTree.createSnapshot', handler: this.createSnapshot.bind(this), category: 'Undo/Redo' },
            { id: 'goalTree.showSnapshots', handler: this.showSnapshots.bind(this), category: 'Undo/Redo' }
        ];

        const registeredCommands: vscode.Disposable[] = [];
        const registrationErrors: { command: string; error: any }[] = [];

        // Register commands with individual error handling
        for (const commandDef of commandDefinitions) {
            try {
                const disposable = vscode.commands.registerCommand(commandDef.id, this.wrapCommandHandler(commandDef.handler, commandDef.id));
                registeredCommands.push(disposable);
                context.subscriptions.push(disposable);
                
                this.logger.debug('Command registered successfully', { 
                    command: commandDef.id, 
                    category: commandDef.category 
                });
            } catch (error) {
                const errorInfo = { command: commandDef.id, error };
                registrationErrors.push(errorInfo);
                this.logger.error('Failed to register command', errorInfo);
            }
        }

        // Report registration results
        const successCount = registeredCommands.length;
        const errorCount = registrationErrors.length;
        
        if (errorCount > 0) {
            const errorMessage = `Failed to register ${errorCount} commands: ${registrationErrors.map(e => e.command).join(', ')}`;
            this.logger.error(errorMessage, { errors: registrationErrors });
            vscode.window.showWarningMessage(`Goal Tree: Some commands failed to register. Check logs for details.`);
        }

        this.logger.info('Command registration completed', { 
            successCount, 
            errorCount, 
            totalCommands: commandDefinitions.length 
        });

        if (successCount === 0) {
            throw new Error('Failed to register any commands. Extension cannot function properly.');
        }
    }

    /**
     * Wrap command handlers with error handling and logging
     */
    private wrapCommandHandler<T extends any[]>(handler: (...args: T) => Promise<void> | void, commandId: string) {
        return async (...args: T): Promise<void> => {
            const startTime = Date.now();
            try {
                this.logger.debug('Command execution started', { command: commandId, args: args.length });
                await handler(...args);
                const duration = Date.now() - startTime;
                this.logger.debug('Command execution completed', { command: commandId, duration });
            } catch (error) {
                const duration = Date.now() - startTime;
                this.logger.error('Command execution failed', { 
                    command: commandId, 
                    duration,
                    error: error instanceof Error ? error.message : String(error),
                    stack: error instanceof Error ? error.stack : undefined
                });
                
                // Show user-friendly error message
                const errorMessage = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Command failed: ${errorMessage}`);
            }
        };
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

            const goal = await this.goalManager.createGoal({
                title: goalTitle.trim(),
                description: description?.trim()
            });

            this.treeProvider.refresh();
            this.changeNotificationService.fire({ type: 'goal:created', data: { goalId: goal.id, goal }, timestamp: new Date() });
            
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

            const subGoal = await this.goalManager.createGoal({
                title: goalTitle.trim(),
                description: description?.trim(),
                parentId: goalId
            });

            this.treeProvider.refresh();
            this.changeNotificationService.fire({ type: 'goal:created', data: { goalId: subGoal.id, goal: subGoal, parentId: goalId }, timestamp: new Date() });
            
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

            // Manually duplicate goal since duplicateGoal method doesn't exist
            const originalGoal = this.stateManager.getGoal(goalId)!;
            const duplicatedGoal = await this.goalManager.createGoal({
                title: newTitle.trim(),
                description: originalGoal.description,
                parentId: originalGoal.parentId
            });

            this.treeProvider.refresh();
            this.changeNotificationService.fire({ type: 'goal:created', data: { goalId: duplicatedGoal.id, goal: duplicatedGoal }, timestamp: new Date() });
            
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

            const task = await this.goalManager.addTask(goalId, {
                title: taskTitle.trim()
            });

            this.treeProvider.refresh();
            this.changeNotificationService.fire({ type: 'task:created', data: { goalId, taskId: task.id, task }, timestamp: new Date() });
            
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
                case TaskStatus.TODO:
                    newStatus = TaskStatus.IN_PROGRESS;
                    break;
                case TaskStatus.IN_PROGRESS:
                    newStatus = TaskStatus.DONE;
                    break;
                case TaskStatus.DONE:
                    newStatus = TaskStatus.TODO;
                    break;
                default:
                    newStatus = TaskStatus.IN_PROGRESS;
            }

            await this.goalManager.updateTask(goalId, taskId, { status: newStatus });

            this.treeProvider.refresh();
            this.changeNotificationService.fire({ type: 'task:status-changed', data: { goalId, taskId, newStatus, oldStatus: task.status }, timestamp: new Date() });

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

            // moveTask method not available - need manual task reordering
            const goal = this.stateManager.getGoal(goalId);
            if (!goal) return;
            const task = goal.tasks.find(t => t.id === taskId);
            if (!task) return;
            // For now, just show a message that this feature needs implementation
            vscode.window.showWarningMessage('Task reordering not yet implemented');
            return;

            this.treeProvider.refresh();
            this.changeNotificationService.fire({ type: 'task:updated', data: { goalId, taskId }, timestamp: new Date() });
            
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

            // moveTask method not available - need manual task reordering
            const goal = this.stateManager.getGoal(goalId);
            if (!goal) return;
            const task = goal.tasks.find(t => t.id === taskId);
            if (!task) return;
            // For now, just show a message that this feature needs implementation
            vscode.window.showWarningMessage('Task reordering not yet implemented');
            return;

            this.treeProvider.refresh();
            this.changeNotificationService.fire({ type: 'task:updated', data: { goalId, taskId }, timestamp: new Date() });
            
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
                value: task.description ?? '',
                placeHolder: 'Task description...'
            });

            await this.goalManager.updateTask(goalId, taskId, {
                title: newTitle.trim(),
                description: newDescription?.trim() ?? undefined
            });

            this.treeProvider.refresh();
            this.changeNotificationService.fire({ type: 'task:updated', data: { goalId, taskId }, timestamp: new Date() });
            
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
            this.changeNotificationService.fire({ type: 'task:deleted', data: { goalId, taskId }, timestamp: new Date() });
            
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
        await this.changeGoalStatus(goalId, GoalStatus.PLANNED);
    }

    /**
     * Mark goal as in progress
     */
    async markInProgress(goalId?: string): Promise<void> {
        await this.changeGoalStatus(goalId, GoalStatus.IN_PROGRESS);
    }

    /**
     * Mark goal as completed
     */
    async markCompleted(goalId?: string): Promise<void> {
        await this.changeGoalStatus(goalId, GoalStatus.COMPLETED);
    }

    /**
     * Mark goal as blocked
     */
    async markBlocked(goalId?: string): Promise<void> {
        await this.changeGoalStatus(goalId, GoalStatus.BLOCKED);
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

            await this.goalManager.updateGoal(goalId, { status });

            this.treeProvider.refresh();
            this.changeNotificationService.fire({ type: 'goal:status-changed', data: { goalId, newStatus: status, oldStatus: goal.status }, timestamp: new Date() });
            
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
                value: goal.description ?? '',
                placeHolder: 'Goal description...'
            });

            await this.goalManager.updateGoal(goalId, {
                title: newTitle.trim(),
                description: newDescription?.trim() ?? undefined
            });

            this.treeProvider.refresh();
            this.changeNotificationService.fire({ type: 'goal:updated', data: { goalId }, timestamp: new Date() });
            
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
            this.changeNotificationService.fire({ type: 'goal:deleted', data: { goalId }, timestamp: new Date() });
            
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
            { label: 'Planned', value: GoalStatus.PLANNED },
            { label: 'In Progress', value: GoalStatus.IN_PROGRESS },
            { label: 'Blocked', value: GoalStatus.BLOCKED },
            { label: 'Completed', value: GoalStatus.COMPLETED }
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
            detail: goal.description ?? undefined,
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
                !this.isDescendant(goalId!, g.id)
            );

            if (availableGoals.length === 0) {
                vscode.window.showInformationMessage('No available goals to add as dependency');
                return;
            }

            const goalItems = availableGoals.map(g => ({
                label: g.title,
                description: g.status,
                detail: g.description ?? undefined,
                goalId: g.id
            }));

            const selectedItem = await vscode.window.showQuickPick(goalItems, {
                placeHolder: 'Select goal to add as dependency'
            });

            if (!selectedItem?.goalId) {
                vscode.window.showErrorMessage('Invalid dependency selection');
                return;
            }

            await this.goalManager.addBlockingDependency(goalId, selectedItem.goalId);

            this.treeProvider.refresh();
            this.changeNotificationService.fire({ type: 'goal:updated', data: { goalId }, timestamp: new Date() });
            
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
                    label: depGoal?.title ?? depId,
                    description: depGoal?.status ?? 'Unknown',
                    dependencyId: depId
                };
            });

            const selectedItem = await vscode.window.showQuickPick(dependencyItems, {
                placeHolder: 'Select dependency to remove'
            });

            if (!selectedItem?.dependencyId) {
                vscode.window.showErrorMessage('Invalid dependency selection');
                return;
            }

            await this.goalManager.removeBlockingDependency(goalId, selectedItem.dependencyId);

            this.treeProvider.refresh();
            this.changeNotificationService.fire({ type: 'goal:updated', data: { goalId }, timestamp: new Date() });
            
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
        this.logger.info('Focus previous goal requested');
    }

    // Enhanced Commands

    /**
     * Focus on a specific goal (zoom into goal view)
     */
    async focusGoal(goalId?: string): Promise<void> {
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

            // TODO: Implement focused view functionality
            vscode.window.showInformationMessage(`Focus view for "${goal.title}" coming soon!`);
            this.logger.info('Goal focus requested', { goalId, title: goal.title });

        } catch (error) {
            this.logger.error('Failed to focus on goal', error);
            vscode.window.showErrorMessage(`Failed to focus on goal: ${error}`);
        }
    }

    /**
     * Export a single goal to JSON
     */
    async exportGoal(goalId?: string): Promise<void> {
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

            // Get child goals recursively
            const childGoals = this.getGoalHierarchy(goalId);
            const exportData = {
                goal,
                childGoals,
                exportDate: new Date().toISOString(),
                version: '1.0'
            };

            const fileName = `goal-${goal.title.replace(/[^a-zA-Z0-9]/g, '-')}-${new Date().toISOString().split('T')[0]}.json`;
            
            const saveUri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(fileName),
                filters: {
                    'JSON Files': ['json'],
                    'All Files': ['*']
                }
            });

            if (saveUri) {
                const content = JSON.stringify(exportData, null, 2);
                await vscode.workspace.fs.writeFile(saveUri, Buffer.from(content, 'utf8'));
                
                vscode.window.showInformationMessage(`Goal exported to ${saveUri.fsPath}`);
                this.logger.info('Goal exported successfully', { goalId, fileName: saveUri.fsPath });
            }

        } catch (error) {
            this.logger.error('Failed to export goal', error);
            vscode.window.showErrorMessage(`Failed to export goal: ${error}`);
        }
    }

    /**
     * Import goals from JSON file
     */
    async importGoals(): Promise<void> {
        try {
            const fileUri = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false,
                filters: {
                    'JSON Files': ['json'],
                    'All Files': ['*']
                }
            });

            if (!fileUri || fileUri.length === 0) {
                return; // User cancelled
            }

            const content = await vscode.workspace.fs.readFile(fileUri[0]);
            const importData = JSON.parse(content.toString());

            // Validate import data structure
            if (!importData.goal && !importData.goals) {
                throw new Error('Invalid import file format: missing goal data');
            }

            const goalsToImport = importData.goals || [importData.goal];
            let importedCount = 0;

            for (const goalData of goalsToImport) {
                if (goalData && typeof goalData === 'object' && goalData.title) {
                    try {
                        await this.goalManager.createGoal({
                            title: goalData.title,
                            description: goalData.description,
                            parentId: goalData.parentId
                        });
                        importedCount++;
                    } catch (error) {
                        this.logger.warn('Failed to import goal', { title: goalData.title, error });
                    }
                }
            }

            this.treeProvider.refresh();
            
            if (importedCount > 0) {
                vscode.window.showInformationMessage(`Successfully imported ${importedCount} goal(s)`);
                this.logger.info('Goals imported successfully', { count: importedCount });
            } else {
                vscode.window.showWarningMessage('No goals were imported');
            }

        } catch (error) {
            this.logger.error('Failed to import goals', error);
            vscode.window.showErrorMessage(`Failed to import goals: ${error}`);
        }
    }

    /**
     * Export all goals to JSON
     */
    async exportAll(): Promise<void> {
        try {
            const allGoals = this.stateManager.getAllGoals();
            
            if (allGoals.length === 0) {
                vscode.window.showInformationMessage('No goals to export');
                return;
            }

            const exportData = {
                goals: allGoals,
                exportDate: new Date().toISOString(),
                version: '1.0',
                goalCount: allGoals.length
            };

            const fileName = `all-goals-${new Date().toISOString().split('T')[0]}.json`;
            
            const saveUri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(fileName),
                filters: {
                    'JSON Files': ['json'],
                    'All Files': ['*']
                }
            });

            if (saveUri) {
                const content = JSON.stringify(exportData, null, 2);
                await vscode.workspace.fs.writeFile(saveUri, Buffer.from(content, 'utf8'));
                
                vscode.window.showInformationMessage(`Exported ${allGoals.length} goals to ${saveUri.fsPath}`);
                this.logger.info('All goals exported successfully', { goalCount: allGoals.length, fileName: saveUri.fsPath });
            }

        } catch (error) {
            this.logger.error('Failed to export all goals', error);
            vscode.window.showErrorMessage(`Failed to export all goals: ${error}`);
        }
    }

    /**
     * Get goal hierarchy (goal with all its descendants)
     */
    private getGoalHierarchy(goalId: string): Goal[] {
        const childGoals: Goal[] = [];
        const directChildren = this.stateManager.getChildGoals(goalId);
        
        for (const child of directChildren) {
            childGoals.push(child);
            // Recursively get descendants
            const descendants = this.getGoalHierarchy(child.id);
            childGoals.push(...descendants);
        }
        
        return childGoals;
    }

    /**
     * Check if one goal is a descendant of another
     */
    private isDescendant(ancestorId: string, descendantId: string): boolean {
        const descendant = this.stateManager.getGoal(descendantId);
        if (!descendant?.parentId) {
            return false;
        }
        
        if (descendant.parentId === ancestorId) {
            return true;
        }
        
        return this.isDescendant(ancestorId, descendant.parentId);
    }

    // ===========================================
    // Undo/Redo Command Implementations
    // ===========================================

    /**
     * Undo the last operation
     */
    async undo(): Promise<void> {
        try {
            if (!this.undoRedoService) {
                vscode.window.showWarningMessage('Undo/Redo service is not available');
                return;
            }

            if (!this.undoRedoService.canUndo()) {
                vscode.window.showInformationMessage('Nothing to undo');
                return;
            }

            const undoDescription = this.undoRedoService.getUndoDescription();
            const result = await this.undoRedoService.undo();

            if (result.success) {
                this.treeProvider.refresh();
                const message = undoDescription ? `Undone: ${undoDescription}` : 'Operation undone';
                vscode.window.showInformationMessage(message);
                this.logger.info('Undo completed successfully', { 
                    commandsProcessed: result.commandsProcessed,
                    description: undoDescription 
                });
            } else {
                vscode.window.showErrorMessage(`Undo failed: ${result.error}`);
                this.logger.error('Undo operation failed', { error: result.error });
            }

        } catch (error) {
            this.logger.error('Failed to undo operation', error);
            vscode.window.showErrorMessage(`Undo failed: ${error}`);
        }
    }

    /**
     * Redo the last undone operation
     */
    async redo(): Promise<void> {
        try {
            if (!this.undoRedoService) {
                vscode.window.showWarningMessage('Undo/Redo service is not available');
                return;
            }

            if (!this.undoRedoService.canRedo()) {
                vscode.window.showInformationMessage('Nothing to redo');
                return;
            }

            const redoDescription = this.undoRedoService.getRedoDescription();
            const result = await this.undoRedoService.redo();

            if (result.success) {
                this.treeProvider.refresh();
                const message = redoDescription ? `Redone: ${redoDescription}` : 'Operation redone';
                vscode.window.showInformationMessage(message);
                this.logger.info('Redo completed successfully', { 
                    commandsProcessed: result.commandsProcessed,
                    description: redoDescription 
                });
            } else {
                vscode.window.showErrorMessage(`Redo failed: ${result.error}`);
                this.logger.error('Redo operation failed', { error: result.error });
            }

        } catch (error) {
            this.logger.error('Failed to redo operation', error);
            vscode.window.showErrorMessage(`Redo failed: ${error}`);
        }
    }

    /**
     * Show undo/redo history
     */
    async showUndoHistory(): Promise<void> {
        try {
            if (!this.undoRedoService) {
                vscode.window.showWarningMessage('Undo/Redo service is not available');
                return;
            }

            const undoRedoManager = this.undoRedoService.getUndoRedoManager();
            const history = undoRedoManager.getCommandHistory();
            const stats = undoRedoManager.getUndoRedoStats();

            if (history.length === 0) {
                vscode.window.showInformationMessage('No undo/redo history available');
                return;
            }

            // Create quick pick items for history
            const items = history.map((entry, index) => {
                const isGroup = undoRedoManager['isCommandGroup'](entry.item);
                const icon = entry.stack === 'undo' ? '$(arrow-left)' : '$(arrow-right)';
                const stackLabel = entry.stack === 'undo' ? 'Can Undo' : 'Can Redo';
                
                let detail = '';
                if (isGroup) {
                    const group = entry.item as any;
                    detail = `${group.commands.length} operations • ${group.timestamp.toLocaleString()}`;
                } else {
                    const command = entry.item as any;
                    detail = `Single operation • ${command.timestamp.toLocaleString()}`;
                }

                return {
                    label: `${icon} ${entry.item.description}`,
                    description: stackLabel,
                    detail,
                    stack: entry.stack,
                    index
                };
            });

            // Add stats header
            const statsItem = {
                label: `$(info) History Statistics`,
                description: `${stats.undoableCommands} undoable, ${stats.redoableCommands} redoable`,
                detail: `Total: ${stats.totalCommands} operations, ${stats.snapshots} snapshots`,
                stack: 'info' as const,
                index: -1
            };

            const allItems = [statsItem, ...items];

            const selected = await vscode.window.showQuickPick(allItems, {
                placeHolder: 'Select an operation to jump to (or view history)',
                matchOnDescription: true,
                matchOnDetail: true
            });

            if (selected && selected.stack !== 'info') {
                // For now, just show info. In future could implement "jump to" functionality
                vscode.window.showInformationMessage(`Selected: ${selected.label.replace(/\$\(.*?\)\s/, '')}`);
            }

        } catch (error) {
            this.logger.error('Failed to show undo history', error);
            vscode.window.showErrorMessage(`Failed to show undo history: ${error}`);
        }
    }

    /**
     * Clear all undo/redo history
     */
    async clearUndoHistory(): Promise<void> {
        try {
            if (!this.undoRedoService) {
                vscode.window.showWarningMessage('Undo/Redo service is not available');
                return;
            }

            const stats = this.undoRedoService.getStats();
            
            if (stats.totalCommands === 0) {
                vscode.window.showInformationMessage('No undo/redo history to clear');
                return;
            }

            const confirmation = await vscode.window.showWarningMessage(
                `Are you sure you want to clear all undo/redo history? This will remove ${stats.totalCommands} operations and ${stats.snapshots} snapshots.`,
                { modal: true },
                'Clear History'
            );

            if (confirmation === 'Clear History') {
                this.undoRedoService.clearHistory();
                vscode.window.showInformationMessage('Undo/redo history cleared');
                this.logger.info('Undo/redo history cleared', { 
                    operationsCleared: stats.totalCommands,
                    snapshotsCleared: stats.snapshots 
                });
            }

        } catch (error) {
            this.logger.error('Failed to clear undo history', error);
            vscode.window.showErrorMessage(`Failed to clear undo history: ${error}`);
        }
    }

    /**
     * Create a manual snapshot
     */
    async createSnapshot(): Promise<void> {
        try {
            if (!this.undoRedoService) {
                vscode.window.showWarningMessage('Undo/Redo service is not available');
                return;
            }

            const description = await vscode.window.showInputBox({
                prompt: 'Enter a description for this snapshot',
                placeHolder: 'e.g., Before major reorganization...',
                validateInput: (value) => {
                    if (!value.trim()) {
                        return 'Snapshot description cannot be empty';
                    }
                    if (value.length > 100) {
                        return 'Description must be 100 characters or less';
                    }
                    return null;
                }
            });

            if (!description) {
                return; // User cancelled
            }

            const snapshotId = await this.undoRedoService.createSnapshot(description.trim());
            vscode.window.showInformationMessage(`Snapshot created: ${description}`);
            this.logger.info('Manual snapshot created', { snapshotId, description });

        } catch (error) {
            this.logger.error('Failed to create snapshot', error);
            vscode.window.showErrorMessage(`Failed to create snapshot: ${error}`);
        }
    }

    /**
     * Show available snapshots
     */
    async showSnapshots(): Promise<void> {
        try {
            if (!this.undoRedoService) {
                vscode.window.showWarningMessage('Undo/Redo service is not available');
                return;
            }

            const undoRedoManager = this.undoRedoService.getUndoRedoManager();
            const snapshots = undoRedoManager.getSnapshots();

            if (snapshots.length === 0) {
                vscode.window.showInformationMessage('No snapshots available');
                return;
            }

            const items = snapshots
                .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()) // Most recent first
                .map((snapshot, index) => ({
                    label: `$(archive) ${snapshot.description}`,
                    description: snapshot.timestamp.toLocaleString(),
                    detail: `${snapshot.goalStates.size} goals captured`,
                    snapshotId: snapshot.id,
                    index
                }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'View snapshots (rollback functionality coming soon)',
                matchOnDescription: true,
                matchOnDetail: true
            });

            if (selected) {
                // For now, just show info. Future: implement rollback functionality
                const snapshot = snapshots.find(s => s.id === selected.snapshotId);
                if (snapshot) {
                    const message = `Snapshot: ${snapshot.description}\nCreated: ${snapshot.timestamp.toLocaleString()}\nGoals captured: ${snapshot.goalStates.size}`;
                    vscode.window.showInformationMessage(message);
                }
            }

        } catch (error) {
            this.logger.error('Failed to show snapshots', error);
            vscode.window.showErrorMessage(`Failed to show snapshots: ${error}`);
        }
    }
}