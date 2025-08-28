/**
 * TreeCommands - Command handlers for goal tree operations and dependency management
 * 
 * This module provides command handlers for all goal tree operations including
 * dependency management, visual operations, and tree view interactions.
 */

import {
    window,
    commands,
    TreeItem,
    QuickPickItem,
    QuickPickOptions,
    InputBoxOptions,
    MessageItem,
    ProgressLocation,
    CancellationToken
} from 'vscode';

import {
    Goal,
    GoalStatus,
    GoalStatusType,
    Task,
    TaskStatus,
    CreateGoalParams,
    UpdateGoalParams,
    CreateTaskParams,
    UpdateTaskParams,
    GoalUtils
} from '../types';

import { GoalManager } from '../services/GoalManager';
import { GoalTreeProvider, GoalTreeItem, GoalTreeItemType } from '../providers/goalTreeProvider';

/**
 * Interface for dependency resolver service (to be provided by Stream A)
 * This interface will be implemented when the DependencyResolver service is ready
 */
interface IDependencyResolver {
    createDependency(blockedGoalId: string, blockingGoalId: string): Promise<void>;
    deleteDependency(blockedGoalId: string, blockingGoalId: string): Promise<void>;
    getDependencyChain(goalId: string): Promise<string[]>;
    detectCircularDependencies(): Promise<string[]>;
    buildDependencyGraph(): Promise<any>;
    queryDependencies(filter?: any): Promise<any[]>;
    syncWithGoalManager(): Promise<void>;
}

/**
 * Quick pick item for goal selection
 */
interface GoalQuickPickItem extends QuickPickItem {
    goalId: string;
    goal: Goal;
}

/**
 * Dependency chain visualization item
 */
interface DependencyChainItem {
    goalId: string;
    title: string;
    status: GoalStatusType;
    level: number;
    isDirectDependency: boolean;
}

/**
 * Tree commands handler class
 */
export class TreeCommands {
    private goalManager: GoalManager;
    private treeProvider: GoalTreeProvider;
    private dependencyResolver?: IDependencyResolver; // Will be injected when available

    constructor(goalManager: GoalManager, treeProvider: GoalTreeProvider) {
        this.goalManager = goalManager;
        this.treeProvider = treeProvider;
    }

    // ===========================================
    // Dependency Resolver Integration
    // ===========================================

    /**
     * Set the dependency resolver instance (called by Stream A when ready)
     */
    public setDependencyResolver(resolver: IDependencyResolver): void {
        this.dependencyResolver = resolver;
    }

    // ===========================================
    // Goal Selection Commands
    // ===========================================

    public async selectGoal(goalId: string): Promise<void> {
        try {
            const goal = this.goalManager.getGoal(goalId);
            if (!goal) {
                window.showErrorMessage(`Goal with ID ${goalId} not found`);
                return;
            }

            // Show goal details in a quick pick with actions
            const actions: QuickPickItem[] = [
                {
                    label: '$(edit) Edit Goal',
                    description: 'Modify goal title, description, or status'
                },
                {
                    label: '$(add) Add Task',
                    description: 'Add a new task to this goal'
                },
                {
                    label: '$(add) Add Child Goal',
                    description: 'Create a child goal'
                },
                {
                    label: '$(link) Manage Dependencies',
                    description: 'Add or remove goal dependencies'
                },
                {
                    label: '$(list-tree) Show Dependencies',
                    description: 'View dependency chain visualization'
                },
                {
                    label: '$(trash) Delete Goal',
                    description: 'Delete this goal and all its children'
                }
            ];

            const selected = await window.showQuickPick(actions, {
                title: `Actions for: ${goal.title}`,
                placeHolder: 'Select an action to perform'
            });

            if (!selected) return;

            switch (selected.label) {
                case '$(edit) Edit Goal':
                    await this.editGoal(goalId);
                    break;
                case '$(add) Add Task':
                    await this.addTask(goalId);
                    break;
                case '$(add) Add Child Goal':
                    await this.createChildGoal(goalId);
                    break;
                case '$(link) Manage Dependencies':
                    await this.manageDependencies(goalId);
                    break;
                case '$(list-tree) Show Dependencies':
                    await this.showDependencies(goalId);
                    break;
                case '$(trash) Delete Goal':
                    await this.deleteGoal(goalId);
                    break;
            }

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            window.showErrorMessage(`Failed to select goal: ${errorMessage}`);
        }
    }

    public async selectTask(goalId: string, taskId: string): Promise<void> {
        try {
            const goal = this.goalManager.getGoal(goalId);
            if (!goal) {
                window.showErrorMessage(`Goal with ID ${goalId} not found`);
                return;
            }

            const task = goal.tasks.find(t => t.id === taskId);
            if (!task) {
                window.showErrorMessage(`Task with ID ${taskId} not found`);
                return;
            }

            // Show task actions
            const actions: QuickPickItem[] = [
                {
                    label: '$(edit) Edit Task',
                    description: 'Modify task title or description'
                },
                {
                    label: '$(check) Toggle Status',
                    description: `Mark as ${task.status === TaskStatus.DONE ? 'not done' : 'done'}`
                },
                {
                    label: '$(trash) Delete Task',
                    description: 'Remove this task from the goal'
                }
            ];

            const selected = await window.showQuickPick(actions, {
                title: `Task: ${task.title}`,
                placeHolder: 'Select an action to perform'
            });

            if (!selected) return;

            switch (selected.label) {
                case '$(edit) Edit Task':
                    await this.editTask(goalId, taskId);
                    break;
                case '$(check) Toggle Status':
                    await this.toggleTaskStatus(goalId, taskId);
                    break;
                case '$(trash) Delete Task':
                    await this.deleteTask(goalId, taskId);
                    break;
            }

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            window.showErrorMessage(`Failed to select task: ${errorMessage}`);
        }
    }

    // ===========================================
    // Dependency Management Commands
    // ===========================================

    public async addDependency(goalId?: string): Promise<void> {
        try {
            // If goalId is provided, use it; otherwise let user select
            let blockedGoal: Goal;
            
            if (goalId) {
                const goal = this.goalManager.getGoal(goalId);
                if (!goal) {
                    window.showErrorMessage(`Goal with ID ${goalId} not found`);
                    return;
                }
                blockedGoal = goal;
            } else {
                const selectedBlocked = await this.selectGoalFromList('Select goal to be blocked:');
                if (!selectedBlocked) return;
                blockedGoal = selectedBlocked;
            }

            // Select the blocking goal
            const allGoals = this.goalManager.getAllGoals()
                .filter(g => g.id !== blockedGoal.id && !blockedGoal.blockedByIds.includes(g.id));

            if (allGoals.length === 0) {
                window.showInformationMessage('No available goals to create dependency with');
                return;
            }

            const blockingGoalItems: GoalQuickPickItem[] = allGoals.map(goal => ({
                label: goal.title,
                description: `Status: ${goal.status}`,
                detail: goal.description,
                goalId: goal.id,
                goal
            }));

            const selectedBlocking = await window.showQuickPick(blockingGoalItems, {
                title: `Select goal that blocks "${blockedGoal.title}":`,
                placeHolder: 'Choose the blocking goal'
            });

            if (!selectedBlocking) return;

            // Create the dependency using the appropriate service
            if (this.dependencyResolver) {
                await this.dependencyResolver.createDependency(blockedGoal.id, selectedBlocking.goalId);
                window.showInformationMessage(`Created dependency: "${blockedGoal.title}" is now blocked by "${selectedBlocking.goal.title}"`);
            } else {
                // Fallback to basic GoalManager functionality
                await this.goalManager.addBlockingDependency(blockedGoal.id, selectedBlocking.goalId);
                window.showInformationMessage(`Added dependency: "${blockedGoal.title}" is now blocked by "${selectedBlocking.goal.title}"`);
            }

            this.treeProvider.refresh();

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            window.showErrorMessage(`Failed to add dependency: ${errorMessage}`);
        }
    }

    public async removeDependency(goalId?: string): Promise<void> {
        try {
            // If goalId is provided, use it; otherwise let user select
            let blockedGoal: Goal;
            
            if (goalId) {
                const goal = this.goalManager.getGoal(goalId);
                if (!goal) {
                    window.showErrorMessage(`Goal with ID ${goalId} not found`);
                    return;
                }
                blockedGoal = goal;
            } else {
                const selectedBlocked = await this.selectGoalFromList('Select blocked goal:', goal => goal.blockedByIds.length > 0);
                if (!selectedBlocked) return;
                blockedGoal = selectedBlocked;
            }

            if (blockedGoal.blockedByIds.length === 0) {
                window.showInformationMessage(`"${blockedGoal.title}" has no dependencies to remove`);
                return;
            }

            // Select which blocking dependency to remove
            const blockingGoals = this.goalManager.getBlockingGoals(blockedGoal.id);
            const blockingItems: GoalQuickPickItem[] = blockingGoals.map(goal => ({
                label: goal.title,
                description: `Status: ${goal.status}`,
                detail: goal.description,
                goalId: goal.id,
                goal
            }));

            const selectedBlocking = await window.showQuickPick(blockingItems, {
                title: `Remove dependency from "${blockedGoal.title}":`,
                placeHolder: 'Select the blocking goal to remove'
            });

            if (!selectedBlocking) return;

            // Confirm removal
            const confirmItem: MessageItem = { title: 'Remove' };
            const cancelItem: MessageItem = { title: 'Cancel', isCloseAffordance: true };
            
            const confirmation = await window.showWarningMessage(
                `Remove dependency: "${blockedGoal.title}" blocked by "${selectedBlocking.goal.title}"?`,
                confirmItem,
                cancelItem
            );

            if (confirmation !== confirmItem) return;

            // Remove the dependency
            if (this.dependencyResolver) {
                await this.dependencyResolver.deleteDependency(blockedGoal.id, selectedBlocking.goalId);
                window.showInformationMessage(`Removed dependency: "${blockedGoal.title}" is no longer blocked by "${selectedBlocking.goal.title}"`);
            } else {
                // Fallback to basic GoalManager functionality
                await this.goalManager.removeBlockingDependency(blockedGoal.id, selectedBlocking.goalId);
                window.showInformationMessage(`Removed dependency: "${blockedGoal.title}" is no longer blocked by "${selectedBlocking.goal.title}"`);
            }

            this.treeProvider.refresh();

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            window.showErrorMessage(`Failed to remove dependency: ${errorMessage}`);
        }
    }

    public async showDependencies(goalId: string): Promise<void> {
        try {
            const goal = this.goalManager.getGoal(goalId);
            if (!goal) {
                window.showErrorMessage(`Goal with ID ${goalId} not found`);
                return;
            }

            await window.withProgress({
                location: ProgressLocation.Notification,
                title: `Analyzing dependencies for "${goal.title}"`,
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 25, message: 'Building dependency chain...' });

                // Build dependency chain visualization
                const dependencyChain = await this.buildDependencyChainVisualization(goalId);

                progress.report({ increment: 50, message: 'Preparing visualization...' });

                if (dependencyChain.length === 0) {
                    window.showInformationMessage(`"${goal.title}" has no dependencies`);
                    return;
                }

                progress.report({ increment: 75, message: 'Formatting display...' });

                // Create dependency chain display
                const chainItems: QuickPickItem[] = dependencyChain.map(item => {
                    const indent = '  '.repeat(item.level);
                    const statusIcon = this.getStatusIcon(item.status);
                    const dependencyIcon = item.isDirectDependency ? '🔗' : '⛓️';
                    
                    return {
                        label: `${indent}${dependencyIcon} ${statusIcon} ${item.title}`,
                        description: `Status: ${item.status}`,
                        detail: item.isDirectDependency ? 'Direct dependency' : 'Indirect dependency'
                    };
                });

                progress.report({ increment: 100, message: 'Complete' });

                // Show the dependency chain
                await window.showQuickPick(chainItems, {
                    title: `Dependency Chain for: ${goal.title}`,
                    placeHolder: 'Dependencies that must be completed first',
                    canPickMany: false
                });
            });

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            window.showErrorMessage(`Failed to show dependencies: ${errorMessage}`);
        }
    }

    public async manageDependencies(goalId: string): Promise<void> {
        try {
            const goal = this.goalManager.getGoal(goalId);
            if (!goal) {
                window.showErrorMessage(`Goal with ID ${goalId} not found`);
                return;
            }

            const actions: QuickPickItem[] = [
                {
                    label: '$(add) Add Dependency',
                    description: 'Make this goal depend on another goal'
                },
                {
                    label: '$(remove) Remove Dependency',
                    description: 'Remove a blocking dependency'
                },
                {
                    label: '$(list-tree) View Dependency Chain',
                    description: 'Show all dependencies in a hierarchy'
                },
                {
                    label: '$(search) Find Circular Dependencies',
                    description: 'Check for circular dependency issues'
                }
            ];

            const selected = await window.showQuickPick(actions, {
                title: `Manage Dependencies: ${goal.title}`,
                placeHolder: 'Select a dependency management action'
            });

            if (!selected) return;

            switch (selected.label) {
                case '$(add) Add Dependency':
                    await this.addDependency(goalId);
                    break;
                case '$(remove) Remove Dependency':
                    await this.removeDependency(goalId);
                    break;
                case '$(list-tree) View Dependency Chain':
                    await this.showDependencies(goalId);
                    break;
                case '$(search) Find Circular Dependencies':
                    await this.checkCircularDependencies();
                    break;
            }

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            window.showErrorMessage(`Failed to manage dependencies: ${errorMessage}`);
        }
    }

    // ===========================================
    // Goal CRUD Commands
    // ===========================================

    public async createGoal(): Promise<void> {
        try {
            const title = await window.showInputBox({
                title: 'Create New Goal',
                placeHolder: 'Enter goal title',
                prompt: 'What do you want to accomplish?'
            });

            if (!title) return;

            const description = await window.showInputBox({
                title: 'Goal Description (Optional)',
                placeHolder: 'Enter detailed description',
                prompt: 'Describe your goal in more detail'
            });

            // Ask if this should be a child goal
            const parentGoal = await this.selectGoalFromList('Select parent goal (optional):', undefined, true);

            const params: CreateGoalParams = {
                title: title.trim(),
                description: description?.trim() || undefined,
                parentId: parentGoal?.id
            };

            const newGoal = await this.goalManager.createGoal(params);
            window.showInformationMessage(`Created goal: "${newGoal.title}"`);
            this.treeProvider.refresh();

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            window.showErrorMessage(`Failed to create goal: ${errorMessage}`);
        }
    }

    public async createChildGoal(parentId: string): Promise<void> {
        try {
            const parent = this.goalManager.getGoal(parentId);
            if (!parent) {
                window.showErrorMessage(`Parent goal with ID ${parentId} not found`);
                return;
            }

            const title = await window.showInputBox({
                title: `Create Child Goal for: ${parent.title}`,
                placeHolder: 'Enter child goal title',
                prompt: 'What sub-goal do you want to create?'
            });

            if (!title) return;

            const description = await window.showInputBox({
                title: 'Child Goal Description (Optional)',
                placeHolder: 'Enter detailed description',
                prompt: 'Describe your child goal in more detail'
            });

            const params: CreateGoalParams = {
                title: title.trim(),
                description: description?.trim() || undefined,
                parentId
            };

            const newGoal = await this.goalManager.createGoal(params);
            window.showInformationMessage(`Created child goal: "${newGoal.title}" under "${parent.title}"`);
            this.treeProvider.refresh();

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            window.showErrorMessage(`Failed to create child goal: ${errorMessage}`);
        }
    }

    public async editGoal(goalId: string): Promise<void> {
        try {
            const goal = this.goalManager.getGoal(goalId);
            if (!goal) {
                window.showErrorMessage(`Goal with ID ${goalId} not found`);
                return;
            }

            // Edit title
            const newTitle = await window.showInputBox({
                title: 'Edit Goal Title',
                value: goal.title,
                placeHolder: 'Enter goal title'
            });

            if (newTitle === undefined) return; // User cancelled

            // Edit description
            const newDescription = await window.showInputBox({
                title: 'Edit Goal Description',
                value: goal.description || '',
                placeHolder: 'Enter goal description (optional)'
            });

            if (newDescription === undefined) return; // User cancelled

            // Edit status
            const statusItems: QuickPickItem[] = Object.values(GoalStatus).map(status => ({
                label: status,
                picked: status === goal.status
            }));

            const selectedStatus = await window.showQuickPick(statusItems, {
                title: 'Select Goal Status',
                placeHolder: 'Choose the current status of this goal'
            });

            if (!selectedStatus) return;

            const updates: UpdateGoalParams = {
                title: newTitle.trim(),
                description: newDescription?.trim() || undefined,
                status: selectedStatus.label as GoalStatusType
            };

            const updatedGoal = await this.goalManager.updateGoal(goalId, updates);
            window.showInformationMessage(`Updated goal: "${updatedGoal.title}"`);
            this.treeProvider.refresh();

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            window.showErrorMessage(`Failed to edit goal: ${errorMessage}`);
        }
    }

    public async deleteGoal(goalId: string): Promise<void> {
        try {
            const goal = this.goalManager.getGoal(goalId);
            if (!goal) {
                window.showErrorMessage(`Goal with ID ${goalId} not found`);
                return;
            }

            // Check for child goals
            const childGoals = this.goalManager.getChildGoals(goalId);
            const hasChildren = childGoals.length > 0;

            let confirmMessage = `Delete goal "${goal.title}"?`;
            if (hasChildren) {
                confirmMessage += `\n\nThis will also delete ${childGoals.length} child goal(s).`;
            }

            const deleteItem: MessageItem = { title: 'Delete' };
            const cancelItem: MessageItem = { title: 'Cancel', isCloseAffordance: true };
            
            const confirmation = await window.showWarningMessage(
                confirmMessage,
                deleteItem,
                cancelItem
            );

            if (confirmation !== deleteItem) return;

            await this.goalManager.deleteGoal(goalId);
            window.showInformationMessage(`Deleted goal: "${goal.title}"`);
            this.treeProvider.refresh();

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            window.showErrorMessage(`Failed to delete goal: ${errorMessage}`);
        }
    }

    // ===========================================
    // Task Commands
    // ===========================================

    public async addTask(goalId: string): Promise<void> {
        try {
            const goal = this.goalManager.getGoal(goalId);
            if (!goal) {
                window.showErrorMessage(`Goal with ID ${goalId} not found`);
                return;
            }

            const title = await window.showInputBox({
                title: `Add Task to: ${goal.title}`,
                placeHolder: 'Enter task title',
                prompt: 'What task needs to be completed?'
            });

            if (!title) return;

            const description = await window.showInputBox({
                title: 'Task Description (Optional)',
                placeHolder: 'Enter task details',
                prompt: 'Provide more details about this task'
            });

            const params: CreateTaskParams = {
                title: title.trim(),
                description: description?.trim() || undefined
            };

            const newTask = await this.goalManager.addTask(goalId, params);
            window.showInformationMessage(`Added task: "${newTask.title}" to "${goal.title}"`);
            this.treeProvider.refresh();

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            window.showErrorMessage(`Failed to add task: ${errorMessage}`);
        }
    }

    public async editTask(goalId: string, taskId: string): Promise<void> {
        try {
            const goal = this.goalManager.getGoal(goalId);
            if (!goal) {
                window.showErrorMessage(`Goal with ID ${goalId} not found`);
                return;
            }

            const task = goal.tasks.find(t => t.id === taskId);
            if (!task) {
                window.showErrorMessage(`Task with ID ${taskId} not found`);
                return;
            }

            const newTitle = await window.showInputBox({
                title: 'Edit Task Title',
                value: task.title,
                placeHolder: 'Enter task title'
            });

            if (newTitle === undefined) return;

            const newDescription = await window.showInputBox({
                title: 'Edit Task Description',
                value: task.description || '',
                placeHolder: 'Enter task description (optional)'
            });

            if (newDescription === undefined) return;

            const updates: UpdateTaskParams = {
                title: newTitle.trim(),
                description: newDescription?.trim() || undefined
            };

            const updatedTask = await this.goalManager.updateTask(goalId, taskId, updates);
            window.showInformationMessage(`Updated task: "${updatedTask.title}"`);
            this.treeProvider.refresh();

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            window.showErrorMessage(`Failed to edit task: ${errorMessage}`);
        }
    }

    public async toggleTaskStatus(goalId: string, taskId: string): Promise<void> {
        try {
            const goal = this.goalManager.getGoal(goalId);
            if (!goal) {
                window.showErrorMessage(`Goal with ID ${goalId} not found`);
                return;
            }

            const task = goal.tasks.find(t => t.id === taskId);
            if (!task) {
                window.showErrorMessage(`Task with ID ${taskId} not found`);
                return;
            }

            const newStatus = task.status === TaskStatus.DONE ? TaskStatus.TODO : TaskStatus.DONE;
            
            const updates: UpdateTaskParams = {
                status: newStatus
            };

            const updatedTask = await this.goalManager.updateTask(goalId, taskId, updates);
            const statusText = newStatus === TaskStatus.DONE ? 'completed' : 'reopened';
            window.showInformationMessage(`Task "${updatedTask.title}" ${statusText}`);
            this.treeProvider.refresh();

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            window.showErrorMessage(`Failed to toggle task status: ${errorMessage}`);
        }
    }

    public async deleteTask(goalId: string, taskId: string): Promise<void> {
        try {
            const goal = this.goalManager.getGoal(goalId);
            if (!goal) {
                window.showErrorMessage(`Goal with ID ${goalId} not found`);
                return;
            }

            const task = goal.tasks.find(t => t.id === taskId);
            if (!task) {
                window.showErrorMessage(`Task with ID ${taskId} not found`);
                return;
            }

            const deleteItem: MessageItem = { title: 'Delete' };
            const cancelItem: MessageItem = { title: 'Cancel', isCloseAffordance: true };
            
            const confirmation = await window.showWarningMessage(
                `Delete task "${task.title}"?`,
                deleteItem,
                cancelItem
            );

            if (confirmation !== deleteItem) return;

            await this.goalManager.deleteTask(goalId, taskId);
            window.showInformationMessage(`Deleted task: "${task.title}"`);
            this.treeProvider.refresh();

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            window.showErrorMessage(`Failed to delete task: ${errorMessage}`);
        }
    }

    // ===========================================
    // Utility Commands
    // ===========================================

    public async refreshTree(): Promise<void> {
        this.treeProvider.refresh();
        window.showInformationMessage('Goal tree refreshed');
    }

    public async checkCircularDependencies(): Promise<void> {
        try {
            if (this.dependencyResolver) {
                const circularDeps = await this.dependencyResolver.detectCircularDependencies();
                if (circularDeps.length > 0) {
                    window.showWarningMessage(`Found ${circularDeps.length} circular dependencies. Check the output for details.`);
                } else {
                    window.showInformationMessage('No circular dependencies found');
                }
            } else {
                // Basic circular dependency check using GoalManager
                window.showInformationMessage('Advanced circular dependency detection requires the DependencyResolver service');
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            window.showErrorMessage(`Failed to check circular dependencies: ${errorMessage}`);
        }
    }

    // ===========================================
    // Helper Methods
    // ===========================================

    private async selectGoalFromList(
        title: string, 
        filter?: (goal: Goal) => boolean, 
        allowNone: boolean = false
    ): Promise<Goal | null> {
        let goals = this.goalManager.getAllGoals();
        
        if (filter) {
            goals = goals.filter(filter);
        }

        if (goals.length === 0 && !allowNone) {
            window.showInformationMessage('No goals available for selection');
            return null;
        }

        const goalItems: GoalQuickPickItem[] = goals.map(goal => ({
            label: goal.title,
            description: `Status: ${goal.status}`,
            detail: goal.description,
            goalId: goal.id,
            goal
        }));

        if (allowNone) {
            goalItems.unshift({
                label: '$(remove) None',
                description: 'No parent goal',
                goalId: '',
                goal: {} as Goal
            });
        }

        const selected = await window.showQuickPick(goalItems, {
            title,
            placeHolder: 'Select a goal'
        });

        if (!selected) return null;
        if (allowNone && selected.goalId === '') return null;
        
        return selected.goal;
    }

    private async buildDependencyChainVisualization(goalId: string): Promise<DependencyChainItem[]> {
        const chain: DependencyChainItem[] = [];
        const visited = new Set<string>();
        
        const buildChain = (currentGoalId: string, level: number, isDirect: boolean) => {
            if (visited.has(currentGoalId)) return;
            visited.add(currentGoalId);
            
            const goal = this.goalManager.getGoal(currentGoalId);
            if (!goal) return;
            
            // Add blocking goals
            for (const blockerId of goal.blockedByIds) {
                const blocker = this.goalManager.getGoal(blockerId);
                if (blocker) {
                    chain.push({
                        goalId: blocker.id,
                        title: blocker.title,
                        status: blocker.status,
                        level,
                        isDirectDependency: isDirect && level === 0
                    });
                    
                    // Recursively add dependencies of blockers
                    buildChain(blocker.id, level + 1, false);
                }
            }
        };
        
        buildChain(goalId, 0, true);
        
        // Sort by level to show hierarchy
        return chain.sort((a, b) => a.level - b.level);
    }

    private getStatusIcon(status: GoalStatusType): string {
        switch (status) {
            case GoalStatus.COMPLETED:
                return '✅';
            case GoalStatus.IN_PROGRESS:
                return '▶️';
            case GoalStatus.PAUSED:
                return '⏸️';
            case GoalStatus.CANCELLED:
                return '❌';
            case GoalStatus.BLOCKED:
                return '🚫';
            case GoalStatus.PLANNED:
            default:
                return '⚪';
        }
    }

    // ===========================================
    // Command Registration Helper
    // ===========================================

    public static registerCommands(
        goalManager: GoalManager,
        treeProvider: GoalTreeProvider
    ): TreeCommands {
        const commandHandler = new TreeCommands(goalManager, treeProvider);

        // Register all commands
        const commandMappings = [
            ['goalTree.selectGoal', (goalId: string) => commandHandler.selectGoal(goalId)],
            ['goalTree.selectTask', (goalId: string, taskId: string) => commandHandler.selectTask(goalId, taskId)],
            ['goalTree.createGoal', () => commandHandler.createGoal()],
            ['goalTree.addDependency', (goalId?: string) => commandHandler.addDependency(goalId)],
            ['goalTree.removeDependency', (goalId?: string) => commandHandler.removeDependency(goalId)],
            ['goalTree.showDependencies', (goalId: string) => commandHandler.showDependencies(goalId)],
            ['goalTree.manageDependencies', (goalId: string) => commandHandler.manageDependencies(goalId)],
            ['goalTree.editGoal', (goalId: string) => commandHandler.editGoal(goalId)],
            ['goalTree.deleteGoal', (goalId: string) => commandHandler.deleteGoal(goalId)],
            ['goalTree.addTask', (goalId: string) => commandHandler.addTask(goalId)],
            ['goalTree.refreshTree', () => commandHandler.refreshTree()],
            ['goalTree.checkCircularDependencies', () => commandHandler.checkCircularDependencies()]
        ];

        commandMappings.forEach(([commandId, handler]) => {
            commands.registerCommand(commandId as string, handler);
        });

        return commandHandler;
    }
}