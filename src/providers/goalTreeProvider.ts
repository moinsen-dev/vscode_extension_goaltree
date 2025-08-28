/**
 * GoalTreeProvider - Tree view provider for displaying goals with dependency indicators
 * 
 * This provider creates the tree view interface for goals, including visual indicators
 * for blocked goals, dependency relationships, and status information.
 */

import {
    TreeDataProvider,
    TreeItem,
    TreeItemCollapsibleState,
    Event,
    EventEmitter,
    ThemeIcon,
    ThemeColor,
    ProviderResult,
    Command,
    TreeItemLabel
} from 'vscode';

import {
    Goal,
    GoalStatus,
    GoalStatusType,
    Task,
    TaskStatus,
    GoalEvent,
    GoalEventType,
    GoalUtils
} from '../types';

import { GoalManager } from '../services/GoalManager';

/**
 * Tree item types for different elements in the goal tree
 */
export enum GoalTreeItemType {
    GOAL = 'goal',
    TASK = 'task',
    DEPENDENCY_INFO = 'dependency_info'
}

/**
 * Extended tree item with goal-specific properties
 */
export class GoalTreeItem extends TreeItem {
    public readonly type: GoalTreeItemType;
    public readonly goalId?: string;
    public readonly taskId?: string;
    public readonly parentGoalId?: string;
    public readonly isBlocked: boolean;
    public readonly isBlocking: boolean;
    public readonly dependencyCount: number;

    constructor(
        label: string | TreeItemLabel,
        collapsibleState: TreeItemCollapsibleState,
        type: GoalTreeItemType,
        options: {
            goalId?: string;
            taskId?: string;
            parentGoalId?: string;
            isBlocked?: boolean;
            isBlocking?: boolean;
            dependencyCount?: number;
            iconPath?: ThemeIcon;
            contextValue?: string;
            command?: Command;
            tooltip?: string;
            description?: string;
        } = {}
    ) {
        super(label, collapsibleState);
        
        this.type = type;
        this.goalId = options.goalId;
        this.taskId = options.taskId;
        this.parentGoalId = options.parentGoalId;
        this.isBlocked = options.isBlocked || false;
        this.isBlocking = options.isBlocking || false;
        this.dependencyCount = options.dependencyCount || 0;
        
        if (options.iconPath) {
            this.iconPath = options.iconPath;
        }
        
        if (options.contextValue) {
            this.contextValue = options.contextValue;
        }
        
        if (options.command) {
            this.command = options.command;
        }
        
        if (options.tooltip) {
            this.tooltip = options.tooltip;
        }
        
        if (options.description) {
            this.description = options.description;
        }
    }
}

/**
 * Visual configuration for different goal states
 */
export interface GoalVisualConfig {
    icon: ThemeIcon;
    color?: ThemeColor;
    tooltip: string;
    contextValue: string;
}

/**
 * Goal tree provider implementation
 */
export class GoalTreeProvider implements TreeDataProvider<GoalTreeItem> {
    private _onDidChangeTreeData: EventEmitter<GoalTreeItem | undefined | null | void> = new EventEmitter<GoalTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: Event<GoalTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private goalManager: GoalManager;
    private showCompletedGoals: boolean = true;
    private showTasksInline: boolean = true;
    private showDependencyInfo: boolean = true;

    constructor(goalManager: GoalManager) {
        this.goalManager = goalManager;
        
        // Listen to goal events for automatic refresh
        this.goalManager.on(GoalEventType.GOAL_CREATED, () => this.refresh());
        this.goalManager.on(GoalEventType.GOAL_UPDATED, () => this.refresh());
        this.goalManager.on(GoalEventType.GOAL_DELETED, () => this.refresh());
        this.goalManager.on(GoalEventType.GOAL_STATUS_CHANGED, () => this.refresh());
        this.goalManager.on(GoalEventType.GOAL_MOVED, () => this.refresh());
        this.goalManager.on(GoalEventType.TASK_ADDED, () => this.refresh());
        this.goalManager.on(GoalEventType.TASK_UPDATED, () => this.refresh());
        this.goalManager.on(GoalEventType.TASK_DELETED, () => this.refresh());
        this.goalManager.on(GoalEventType.TASK_STATUS_CHANGED, () => this.refresh());
    }

    // ===========================================
    // TreeDataProvider Implementation
    // ===========================================

    getTreeItem(element: GoalTreeItem): TreeItem {
        return element;
    }

    getChildren(element?: GoalTreeItem): ProviderResult<GoalTreeItem[]> {
        if (!element) {
            // Return root goals
            return this.getRootGoalItems();
        }

        switch (element.type) {
            case GoalTreeItemType.GOAL:
                return this.getGoalChildren(element);
            case GoalTreeItemType.TASK:
                return [];
            case GoalTreeItemType.DEPENDENCY_INFO:
                return [];
            default:
                return [];
        }
    }

    getParent(element: GoalTreeItem): ProviderResult<GoalTreeItem> {
        if (element.type === GoalTreeItemType.TASK && element.parentGoalId) {
            const goal = this.goalManager.getGoal(element.parentGoalId);
            if (goal) {
                return this.createGoalTreeItem(goal);
            }
        } else if (element.type === GoalTreeItemType.GOAL && element.goalId) {
            const goal = this.goalManager.getGoal(element.goalId);
            if (goal?.parentId) {
                const parentGoal = this.goalManager.getGoal(goal.parentId);
                if (parentGoal) {
                    return this.createGoalTreeItem(parentGoal);
                }
            }
        }
        return null;
    }

    // ===========================================
    // Tree Item Creation
    // ===========================================

    private getRootGoalItems(): GoalTreeItem[] {
        const rootGoals = this.goalManager.getRootGoals();
        
        if (!this.showCompletedGoals) {
            return rootGoals
                .filter(goal => goal.status !== GoalStatus.COMPLETED)
                .map(goal => this.createGoalTreeItem(goal));
        }
        
        return rootGoals.map(goal => this.createGoalTreeItem(goal));
    }

    private getGoalChildren(goalItem: GoalTreeItem): GoalTreeItem[] {
        if (!goalItem.goalId) return [];
        
        const goal = this.goalManager.getGoal(goalItem.goalId);
        if (!goal) return [];
        
        const children: GoalTreeItem[] = [];
        
        // Add dependency information if enabled and goal has dependencies
        if (this.showDependencyInfo && (goal.blockedByIds.length > 0 || goalItem.isBlocking)) {
            children.push(this.createDependencyInfoItem(goal));
        }
        
        // Add child goals
        const childGoals = this.goalManager.getChildGoals(goal.id);
        const filteredChildGoals = this.showCompletedGoals 
            ? childGoals 
            : childGoals.filter(child => child.status !== GoalStatus.COMPLETED);
            
        children.push(...filteredChildGoals.map(child => this.createGoalTreeItem(child)));
        
        // Add tasks if inline display is enabled
        if (this.showTasksInline && goal.tasks.length > 0) {
            const filteredTasks = this.showCompletedGoals 
                ? goal.tasks 
                : goal.tasks.filter(task => task.status !== TaskStatus.DONE);
                
            children.push(...filteredTasks.map(task => this.createTaskTreeItem(task, goal.id)));
        }
        
        return children;
    }

    private createGoalTreeItem(goal: Goal): GoalTreeItem {
        const childGoals = this.goalManager.getChildGoals(goal.id);
        const hasChildren = childGoals.length > 0 || 
                          (this.showTasksInline && goal.tasks.length > 0) ||
                          (this.showDependencyInfo && goal.blockedByIds.length > 0);

        const collapsibleState = hasChildren ? TreeItemCollapsibleState.Collapsed : TreeItemCollapsibleState.None;
        
        // Determine visual configuration based on goal state
        const visualConfig = this.getGoalVisualConfig(goal);
        const isBlocked = this.isGoalBlocked(goal);
        const isBlocking = this.isGoalBlocking(goal);
        const dependencyInfo = this.getDependencyDisplayInfo(goal);
        
        // Create label with dependency information
        const label = this.createGoalLabel(goal, dependencyInfo);
        
        const treeItem = new GoalTreeItem(
            label,
            collapsibleState,
            GoalTreeItemType.GOAL,
            {
                goalId: goal.id,
                isBlocked,
                isBlocking,
                dependencyCount: goal.blockedByIds.length,
                iconPath: visualConfig.icon,
                contextValue: visualConfig.contextValue,
                tooltip: this.createGoalTooltip(goal, dependencyInfo),
                description: this.createGoalDescription(goal, dependencyInfo),
                command: {
                    command: 'goalTree.selectGoal',
                    title: 'Select Goal',
                    arguments: [goal.id]
                }
            }
        );
        
        return treeItem;
    }

    private createTaskTreeItem(task: Task, parentGoalId: string): GoalTreeItem {
        const visualConfig = this.getTaskVisualConfig(task);
        
        const treeItem = new GoalTreeItem(
            task.title,
            TreeItemCollapsibleState.None,
            GoalTreeItemType.TASK,
            {
                taskId: task.id,
                parentGoalId,
                iconPath: visualConfig.icon,
                contextValue: visualConfig.contextValue,
                tooltip: this.createTaskTooltip(task),
                command: {
                    command: 'goalTree.selectTask',
                    title: 'Select Task',
                    arguments: [parentGoalId, task.id]
                }
            }
        );
        
        return treeItem;
    }

    private createDependencyInfoItem(goal: Goal): GoalTreeItem {
        const blockerCount = goal.blockedByIds.length;
        const blockedCount = this.goalManager.getBlockedGoals(goal.id).length;
        
        let label: string;
        let icon: ThemeIcon;
        
        if (blockerCount > 0 && blockedCount > 0) {
            label = `⛓️ Blocked by ${blockerCount}, blocking ${blockedCount}`;
            icon = new ThemeIcon('link');
        } else if (blockerCount > 0) {
            label = `🚫 Blocked by ${blockerCount} goal${blockerCount > 1 ? 's' : ''}`;
            icon = new ThemeIcon('stop-circle');
        } else {
            label = `⏸️ Blocking ${blockedCount} goal${blockedCount > 1 ? 's' : ''}`;
            icon = new ThemeIcon('debug-pause');
        }
        
        const treeItem = new GoalTreeItem(
            label,
            TreeItemCollapsibleState.None,
            GoalTreeItemType.DEPENDENCY_INFO,
            {
                goalId: goal.id,
                iconPath: icon,
                contextValue: 'goalTree.dependencyInfo',
                tooltip: this.createDependencyInfoTooltip(goal),
                command: {
                    command: 'goalTree.showDependencies',
                    title: 'Show Dependencies',
                    arguments: [goal.id]
                }
            }
        );
        
        return treeItem;
    }

    // ===========================================
    // Visual Configuration
    // ===========================================

    private getGoalVisualConfig(goal: Goal): GoalVisualConfig {
        const isBlocked = this.isGoalBlocked(goal);
        const isBlocking = this.isGoalBlocking(goal);
        
        // Priority: Blocked status > Regular status
        if (isBlocked) {
            return {
                icon: new ThemeIcon('stop-circle', new ThemeColor('problemsErrorIcon.foreground')),
                color: new ThemeColor('problemsErrorIcon.foreground'),
                tooltip: `Goal is blocked by ${goal.blockedByIds.length} dependencies`,
                contextValue: 'goalTree.goal.blocked'
            };
        }
        
        // Visual config based on status
        switch (goal.status) {
            case GoalStatus.COMPLETED:
                return {
                    icon: new ThemeIcon('check-circle', new ThemeColor('testing.iconPassed')),
                    color: new ThemeColor('testing.iconPassed'),
                    tooltip: 'Goal completed',
                    contextValue: isBlocking ? 'goalTree.goal.completed.blocking' : 'goalTree.goal.completed'
                };
                
            case GoalStatus.IN_PROGRESS:
                return {
                    icon: new ThemeIcon('play-circle', new ThemeColor('problemsWarningIcon.foreground')),
                    color: new ThemeColor('problemsWarningIcon.foreground'),
                    tooltip: 'Goal in progress',
                    contextValue: isBlocking ? 'goalTree.goal.inprogress.blocking' : 'goalTree.goal.inprogress'
                };
                
            case GoalStatus.PAUSED:
                return {
                    icon: new ThemeIcon('debug-pause', new ThemeColor('editorWarning.foreground')),
                    color: new ThemeColor('editorWarning.foreground'),
                    tooltip: 'Goal paused',
                    contextValue: isBlocking ? 'goalTree.goal.paused.blocking' : 'goalTree.goal.paused'
                };
                
            case GoalStatus.CANCELLED:
                return {
                    icon: new ThemeIcon('circle-slash', new ThemeColor('problemsErrorIcon.foreground')),
                    color: new ThemeColor('problemsErrorIcon.foreground'),
                    tooltip: 'Goal cancelled',
                    contextValue: 'goalTree.goal.cancelled'
                };
                
            case GoalStatus.BLOCKED:
                return {
                    icon: new ThemeIcon('stop-circle', new ThemeColor('problemsErrorIcon.foreground')),
                    color: new ThemeColor('problemsErrorIcon.foreground'),
                    tooltip: 'Goal explicitly blocked',
                    contextValue: 'goalTree.goal.blocked'
                };
                
            case GoalStatus.PLANNED:
            default:
                return {
                    icon: new ThemeIcon('circle-outline', new ThemeColor('foreground')),
                    color: new ThemeColor('foreground'),
                    tooltip: 'Goal planned',
                    contextValue: isBlocking ? 'goalTree.goal.planned.blocking' : 'goalTree.goal.planned'
                };
        }
    }

    private getTaskVisualConfig(task: Task): GoalVisualConfig {
        switch (task.status) {
            case TaskStatus.DONE:
                return {
                    icon: new ThemeIcon('check', new ThemeColor('testing.iconPassed')),
                    tooltip: 'Task completed',
                    contextValue: 'goalTree.task.done'
                };
                
            case TaskStatus.IN_PROGRESS:
                return {
                    icon: new ThemeIcon('play', new ThemeColor('problemsWarningIcon.foreground')),
                    tooltip: 'Task in progress',
                    contextValue: 'goalTree.task.inprogress'
                };
                
            case TaskStatus.TODO:
            default:
                return {
                    icon: new ThemeIcon('circle', new ThemeColor('foreground')),
                    tooltip: 'Task to do',
                    contextValue: 'goalTree.task.todo'
                };
        }
    }

    // ===========================================
    // Label and Tooltip Creation
    // ===========================================

    private createGoalLabel(goal: Goal, dependencyInfo: { isBlocked: boolean; isBlocking: boolean; blockerCount: number; blockedCount: number }): string {
        let label = goal.title;
        
        // Add status indicators in title
        if (dependencyInfo.isBlocked) {
            label = `🚫 ${label}`;
        } else if (goal.status === GoalStatus.IN_PROGRESS) {
            label = `▶️ ${label}`;
        } else if (goal.status === GoalStatus.COMPLETED) {
            label = `✅ ${label}`;
        } else if (goal.status === GoalStatus.PAUSED) {
            label = `⏸️ ${label}`;
        }
        
        return label;
    }

    private createGoalDescription(goal: Goal, dependencyInfo: { isBlocked: boolean; isBlocking: boolean; blockerCount: number; blockedCount: number }): string | undefined {
        const descriptions: string[] = [];
        
        // Add task completion info
        if (goal.tasks.length > 0) {
            const completed = GoalUtils.getCompletedTasksCount(goal);
            descriptions.push(`${completed}/${goal.tasks.length} tasks`);
        }
        
        // Add dependency info
        if (dependencyInfo.isBlocked) {
            descriptions.push(`blocked by ${dependencyInfo.blockerCount}`);
        }
        if (dependencyInfo.isBlocking) {
            descriptions.push(`blocking ${dependencyInfo.blockedCount}`);
        }
        
        return descriptions.length > 0 ? descriptions.join(', ') : undefined;
    }

    private createGoalTooltip(goal: Goal, dependencyInfo: { isBlocked: boolean; isBlocking: boolean; blockerCount: number; blockedCount: number }): string {
        const parts = [`**${goal.title}**`];
        
        if (goal.description) {
            parts.push('', goal.description);
        }
        
        parts.push('', `**Status:** ${goal.status}`);
        
        if (goal.tasks.length > 0) {
            const completed = GoalUtils.getCompletedTasksCount(goal);
            const percentage = GoalUtils.getTaskCompletionPercentage(goal);
            parts.push(`**Tasks:** ${completed}/${goal.tasks.length} (${percentage.toFixed(0)}%)`);
        }
        
        if (dependencyInfo.isBlocked) {
            const blockers = this.goalManager.getBlockingGoals(goal.id);
            parts.push(`**Blocked by:** ${blockers.map(g => g.title).join(', ')}`);
        }
        
        if (dependencyInfo.isBlocking) {
            const blocked = this.goalManager.getBlockedGoals(goal.id);
            parts.push(`**Blocking:** ${blocked.map(g => g.title).join(', ')}`);
        }
        
        if (goal.metadata?.priority) {
            parts.push(`**Priority:** ${goal.metadata.priority}/5`);
        }
        
        if (goal.metadata?.dueDate) {
            parts.push(`**Due:** ${goal.metadata.dueDate.toLocaleDateString()}`);
        }
        
        return parts.join('\n');
    }

    private createTaskTooltip(task: Task): string {
        const parts = [`**${task.title}**`];
        
        if (task.description) {
            parts.push('', task.description);
        }
        
        parts.push('', `**Status:** ${GoalUtils.getTaskStatusDisplayName(task.status)}`);
        parts.push(`**Created:** ${task.createdAt.toLocaleDateString()}`);
        
        if (task.completedAt) {
            parts.push(`**Completed:** ${task.completedAt.toLocaleDateString()}`);
        }
        
        return parts.join('\n');
    }

    private createDependencyInfoTooltip(goal: Goal): string {
        const parts = [`**Dependency Information for ${goal.title}**`];
        
        const blockers = this.goalManager.getBlockingGoals(goal.id);
        const blocked = this.goalManager.getBlockedGoals(goal.id);
        
        if (blockers.length > 0) {
            parts.push('', '**Blocked by:**');
            blockers.forEach(blocker => {
                parts.push(`• ${blocker.title} (${blocker.status})`);
            });
        }
        
        if (blocked.length > 0) {
            parts.push('', '**Blocking:**');
            blocked.forEach(blockedGoal => {
                parts.push(`• ${blockedGoal.title} (${blockedGoal.status})`);
            });
        }
        
        parts.push('', 'Click to show detailed dependency chain');
        
        return parts.join('\n');
    }

    // ===========================================
    // Dependency Analysis
    // ===========================================

    private isGoalBlocked(goal: Goal): boolean {
        return goal.blockedByIds.length > 0 || goal.status === GoalStatus.BLOCKED;
    }

    private isGoalBlocking(goal: Goal): boolean {
        return this.goalManager.getBlockedGoals(goal.id).length > 0;
    }

    private getDependencyDisplayInfo(goal: Goal) {
        return {
            isBlocked: this.isGoalBlocked(goal),
            isBlocking: this.isGoalBlocking(goal),
            blockerCount: goal.blockedByIds.length,
            blockedCount: this.goalManager.getBlockedGoals(goal.id).length
        };
    }

    // ===========================================
    // Public Configuration Methods
    // ===========================================

    public setShowCompletedGoals(show: boolean): void {
        this.showCompletedGoals = show;
        this.refresh();
    }

    public setShowTasksInline(show: boolean): void {
        this.showTasksInline = show;
        this.refresh();
    }

    public setShowDependencyInfo(show: boolean): void {
        this.showDependencyInfo = show;
        this.refresh();
    }

    public refresh(element?: GoalTreeItem): void {
        this._onDidChangeTreeData.fire(element);
    }

    // ===========================================
    // Event Integration Methods
    // ===========================================

    public handleDependencyChanged(goalId: string): void {
        // Find the tree item for this goal and refresh it
        this.refresh();
    }

    public handleGoalStatusChanged(goalId: string, newStatus: GoalStatusType): void {
        // Refresh tree to update visual indicators
        this.refresh();
    }

    // ===========================================
    // Disposal
    // ===========================================

    public dispose(): void {
        this._onDidChangeTreeData.dispose();
    }
}