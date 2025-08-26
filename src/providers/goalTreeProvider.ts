import * as vscode from 'vscode';
import { Goal, Task, TreeNode, TreeNodeType } from '../models';
import { StateManager } from '../services/stateManager';
import { GoalManager } from '../services/goalManager';
import { ICONS, CONTEXT_VALUES, TREE_NODE_TYPES } from '../constants';

/**
 * Tree item representing a goal or task in the VS Code tree view
 */
export class GoalTreeItem extends vscode.TreeItem {
    constructor(
        public readonly id: string,
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly contextValue: string,
        public readonly tooltip?: string,
        public readonly iconPath?: vscode.ThemeIcon,
        public readonly command?: vscode.Command
    ) {
        super(label, collapsibleState);
        this.id = id;
        this.tooltip = tooltip;
        this.contextValue = contextValue;
        this.iconPath = iconPath;
        this.command = command;
    }
}

/**
 * Tree data provider for the goal tree view in VS Code sidebar
 */
export class GoalTreeProvider implements vscode.TreeDataProvider<string> {
    private _onDidChangeTreeData: vscode.EventEmitter<string | undefined | null | void> = new vscode.EventEmitter<string | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<string | undefined | null | void> = this._onDidChangeTreeData.event;

    private stateManager: StateManager;
    private goalManager: GoalManager;
    private showCompleted: boolean = true;
    private groupByStatus: boolean = false;
    private sortByTitle: boolean = false;

    constructor(stateManager: StateManager, goalManager: GoalManager) {
        this.stateManager = stateManager;
        this.goalManager = goalManager;

        // Listen for state changes to refresh the tree
        this.stateManager.onDidChangeGoals(() => {
            this.refresh();
        });
    }

    /**
     * Refresh the tree view
     */
    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    /**
     * Get tree item for a given element
     */
    getTreeItem(element: string): vscode.TreeItem {
        // Check if element is a goal or task
        const goal = this.stateManager.getGoal(element);
        if (goal) {
            return this.createGoalTreeItem(goal);
        }

        // Check if it's a task (format: goalId:taskId)
        const [goalId, taskId] = element.split(':');
        const parentGoal = this.stateManager.getGoal(goalId);
        const task = parentGoal?.tasks.find(t => t.id === taskId);
        
        if (task && parentGoal) {
            return this.createTaskTreeItem(task, parentGoal);
        }

        // Fallback for unknown elements
        return new vscode.TreeItem('Unknown item');
    }

    /**
     * Get children for a given element
     */
    getChildren(element?: string): Thenable<string[]> {
        if (!element) {
            // Return root level goals
            const rootGoals = this.stateManager.getRootGoals();
            return Promise.resolve(this.filterAndSortGoals(rootGoals).map(g => g.id));
        }

        // Get children for a specific goal
        const goal = this.stateManager.getGoal(element);
        if (goal) {
            const children: string[] = [];
            
            // Add child goals
            const childGoals = this.stateManager.getChildGoals(element);
            children.push(...this.filterAndSortGoals(childGoals).map(g => g.id));
            
            // Add tasks (use format: goalId:taskId for unique identification)
            if (goal.tasks.length > 0) {
                const filteredTasks = this.filterTasks(goal.tasks);
                children.push(...filteredTasks.map(t => `${element}:${t.id}`));
            }
            
            return Promise.resolve(children);
        }

        return Promise.resolve([]);
    }

    /**
     * Create a tree item for a goal
     */
    private createGoalTreeItem(goal: Goal): GoalTreeItem {
        const hasChildren = this.stateManager.getChildGoals(goal.id).length > 0 || goal.tasks.length > 0;
        const collapsibleState = hasChildren ? 
            vscode.TreeItemCollapsibleState.Collapsed : 
            vscode.TreeItemCollapsibleState.None;

        const progress = this.goalManager.getGoalProgress(goal.id);
        const progressText = progress.total > 0 ? ` (${progress.completed}/${progress.total})` : '';
        const label = `${goal.title}${progressText}`;
        
        const tooltip = this.createGoalTooltip(goal, progress);
        const contextValue = this.getGoalContextValue(goal);
        const iconPath = this.getGoalIcon(goal);

        return new GoalTreeItem(
            goal.id,
            label,
            collapsibleState,
            contextValue,
            tooltip,
            iconPath
        );
    }

    /**
     * Create a tree item for a task
     */
    private createTaskTreeItem(task: Task, parentGoal: Goal): GoalTreeItem {
        const label = task.title;
        const tooltip = this.createTaskTooltip(task);
        const contextValue = this.getTaskContextValue(task);
        const iconPath = this.getTaskIcon(task);

        // Add command to toggle task completion on click
        const command: vscode.Command = {
            command: 'goalTree.toggleTask',
            title: 'Toggle Task',
            arguments: [parentGoal.id, task.id]
        };

        return new GoalTreeItem(
            `${parentGoal.id}:${task.id}`,
            label,
            vscode.TreeItemCollapsibleState.None,
            contextValue,
            tooltip,
            iconPath,
            command
        );
    }

    /**
     * Create tooltip for a goal
     */
    private createGoalTooltip(goal: Goal, progress: { completed: number; total: number; percentage: number }): string {
        const lines = [
            `Title: ${goal.title}`,
            `Status: ${goal.status}`,
            `Progress: ${progress.percentage}% (${progress.completed}/${progress.total})`,
            `Created: ${goal.createdAt.toLocaleDateString()}`
        ];

        if (goal.description) {
            lines.push(`Description: ${goal.description}`);
        }

        if (goal.completedAt) {
            lines.push(`Completed: ${goal.completedAt.toLocaleDateString()}`);
        }

        if (goal.blockedByIds.length > 0) {
            lines.push(`Blocked by: ${goal.blockedByIds.length} goal(s)`);
        }

        return lines.join('\n');
    }

    /**
     * Create tooltip for a task
     */
    private createTaskTooltip(task: Task): string {
        const lines = [
            `Title: ${task.title}`,
            `Status: ${task.status}`,
            `Created: ${task.createdAt.toLocaleDateString()}`
        ];

        if (task.description) {
            lines.push(`Description: ${task.description}`);
        }

        if (task.completedAt) {
            lines.push(`Completed: ${task.completedAt.toLocaleDateString()}`);
        }

        return lines.join('\n');
    }

    /**
     * Get context value for a goal (used for command visibility in menus)
     */
    private getGoalContextValue(goal: Goal): string {
        const contexts = [CONTEXT_VALUES.GOAL];
        
        // Add status-specific context
        contexts.push(`${CONTEXT_VALUES.GOAL}_status-${goal.status}`);
        
        // Add additional contexts
        if (goal.tasks.length > 0) {
            contexts.push(CONTEXT_VALUES.HAS_TASKS);
        }
        
        const hasChildren = this.stateManager.getChildGoals(goal.id).length > 0;
        if (hasChildren) {
            contexts.push(CONTEXT_VALUES.HAS_CHILDREN);
        }
        
        if (goal.status === 'blocked') {
            contexts.push(CONTEXT_VALUES.IS_BLOCKED);
        }

        return contexts.join(' ');
    }

    /**
     * Get context value for a task
     */
    private getTaskContextValue(task: Task): string {
        const contexts = [CONTEXT_VALUES.TASK];
        contexts.push(`${CONTEXT_VALUES.TASK}_status-${task.status}`);
        return contexts.join(' ');
    }

    /**
     * Get icon for a goal based on its status
     */
    private getGoalIcon(goal: Goal): vscode.ThemeIcon {
        switch (goal.status) {
            case 'planned':
                return new vscode.ThemeIcon('circle-outline');
            case 'in-progress':
                return new vscode.ThemeIcon('play');
            case 'blocked':
                return new vscode.ThemeIcon('stop');
            case 'completed':
                return new vscode.ThemeIcon('check');
            default:
                return new vscode.ThemeIcon('circle-outline');
        }
    }

    /**
     * Get icon for a task based on its status
     */
    private getTaskIcon(task: Task): vscode.ThemeIcon {
        switch (task.status) {
            case 'todo':
                return new vscode.ThemeIcon('circle-outline');
            case 'in-progress':
                return new vscode.ThemeIcon('play');
            case 'done':
                return new vscode.ThemeIcon('check');
            default:
                return new vscode.ThemeIcon('circle-outline');
        }
    }

    /**
     * Filter goals based on current settings
     */
    private filterGoals(goals: Goal[]): Goal[] {
        return goals.filter(goal => {
            // Filter completed goals if not showing them
            if (!this.showCompleted && goal.status === 'completed') {
                return false;
            }
            return true;
        });
    }

    /**
     * Filter tasks based on current settings
     */
    private filterTasks(tasks: Task[]): Task[] {
        return tasks.filter(task => {
            // Filter completed tasks if not showing them
            if (!this.showCompleted && task.status === 'done') {
                return false;
            }
            return true;
        });
    }

    /**
     * Filter and sort goals
     */
    private filterAndSortGoals(goals: Goal[]): Goal[] {
        let filtered = this.filterGoals(goals);
        
        if (this.sortByTitle) {
            filtered = filtered.sort((a, b) => a.title.localeCompare(b.title));
        } else {
            // Sort by creation date (newest first)
            filtered = filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }
        
        return filtered;
    }

    /**
     * Set whether to show completed items
     */
    setShowCompleted(show: boolean): void {
        this.showCompleted = show;
        this.refresh();
    }

    /**
     * Set whether to group by status
     */
    setGroupByStatus(group: boolean): void {
        this.groupByStatus = group;
        this.refresh();
    }

    /**
     * Set whether to sort by title
     */
    setSortByTitle(sort: boolean): void {
        this.sortByTitle = sort;
        this.refresh();
    }
}