/**
 * GoalTreeItem class for VS Code tree view
 * Represents individual tree nodes for goals and tasks with proper icons and context
 */

import * as vscode from 'vscode';
import { Goal, Task } from '../types/Goal';
import { TreeNode, TreeNodeType, GoalTreeNode, TaskTreeNode, TreeTypeUtils } from '../types/TreeTypes';

/**
 * Extended VS Code TreeItem for the goal tree view
 * Provides enhanced functionality for goal and task display
 */
export class GoalTreeItem extends vscode.TreeItem {
    /**
     * Create a new GoalTreeItem
     * 
     * @param id Unique identifier for the tree item
     * @param label Display label for the tree item
     * @param collapsibleState VS Code collapsible state
     * @param contextValue Context value for commands and menus
     * @param tooltip Optional tooltip text
     * @param iconPath Optional icon path or theme icon
     * @param command Optional command to execute on click
     */
    constructor(
        public override readonly id: string,
        public override readonly label: string,
        public override readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public override readonly contextValue: string,
        public override readonly tooltip?: string,
        public override readonly iconPath?: vscode.ThemeIcon | string | vscode.Uri,
        public override readonly command?: vscode.Command
    ) {
        super(label, collapsibleState);
        this.id = id;
        this.tooltip = tooltip;
        this.contextValue = contextValue;
        this.iconPath = iconPath;
        this.command = command;
    }

    /**
     * Create a GoalTreeItem from a Goal object
     * 
     * @param goal The goal object to create the tree item from
     * @param hasChildren Whether the goal has child goals or tasks
     * @param isExpanded Whether the goal should be initially expanded
     * @param progress Progress information for the goal
     * @returns A new GoalTreeItem instance
     */
    static fromGoal(
        goal: Goal,
        hasChildren: boolean,
        isExpanded: boolean = false,
        progress: { completed: number; total: number; percentage: number } = { completed: 0, total: 0, percentage: 0 }
    ): GoalTreeItem {
        // Determine collapsible state
        let collapsibleState: vscode.TreeItemCollapsibleState;
        if (hasChildren) {
            collapsibleState = isExpanded ? 
                vscode.TreeItemCollapsibleState.Expanded : 
                vscode.TreeItemCollapsibleState.Collapsed;
        } else {
            collapsibleState = vscode.TreeItemCollapsibleState.None;
        }

        // Calculate indicators
        const indicators = {
            isBlocked: goal.status === 'blocked' || goal.blockedByIds.length > 0,
            isHighPriority: goal.metadata?.priority ? goal.metadata.priority >= 4 : false,
            isOverdue: goal.metadata?.dueDate ? new Date(goal.metadata.dueDate).getTime() < Date.now() : false,
            isUrgent: goal.metadata?.dueDate ? 
                new Date(goal.metadata.dueDate).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000 : false
        };

        // Format progress text
        const progressText = GoalTreeItem.formatProgressText(progress, goal);
        const label = `${goal.title}${progressText}`;

        // Create comprehensive tooltip
        const tooltip = GoalTreeItem.createGoalTooltip(goal, progress, indicators);

        // Get context value
        const contextValue = GoalTreeItem.buildGoalContextValue(goal, indicators);

        // Get appropriate icon
        const iconPath = TreeTypeUtils.getGoalIcon(goal, indicators);

        const treeItem = new GoalTreeItem(
            goal.id,
            label,
            collapsibleState,
            contextValue,
            tooltip,
            iconPath
        );

        // Add accessibility information
        treeItem.accessibilityInformation = {
            label: `Goal: ${goal.title}, Status: ${goal.status}, Progress: ${progress.percentage}%`,
            role: 'treeitem'
        };

        return treeItem;
    }

    /**
     * Create a GoalTreeItem from a Task object
     * 
     * @param task The task object to create the tree item from
     * @param parentGoal The parent goal containing this task
     * @returns A new GoalTreeItem instance
     */
    static fromTask(task: Task, parentGoal: Goal): GoalTreeItem {
        const label = task.title;
        const tooltip = GoalTreeItem.createTaskTooltip(task);
        const contextValue = TreeTypeUtils.getTaskContextValue(task);
        const iconPath = TreeTypeUtils.getTaskIcon(task);

        // Add command to toggle task completion on click
        const command: vscode.Command = {
            command: 'goalTree.toggleTask',
            title: 'Toggle Task',
            arguments: [parentGoal.id, task.id]
        };

        const treeItem = new GoalTreeItem(
            `${parentGoal.id}:${task.id}`,
            label,
            vscode.TreeItemCollapsibleState.None,
            contextValue,
            tooltip,
            iconPath,
            command
        );

        // Add accessibility information
        treeItem.accessibilityInformation = {
            label: `Task: ${task.title}, Status: ${task.status}`,
            role: 'treeitem'
        };

        return treeItem;
    }

    /**
     * Format progress text for display in the tree item label
     */
    private static formatProgressText(
        progress: { completed: number; total: number; percentage: number }, 
        goal: Goal
    ): string {
        if (progress.total === 0) {
            // No sub-items to track
            return goal.status === 'completed' ? ' ✓' : '';
        }

        const percentage = progress.percentage;
        let progressIndicator = '';

        // Add visual progress indicator based on percentage
        if (percentage === 100) {
            progressIndicator = ' ✓';
        } else if (percentage >= 75) {
            progressIndicator = ' ▮▮▮▯';
        } else if (percentage >= 50) {
            progressIndicator = ' ▮▮▯▯';
        } else if (percentage >= 25) {
            progressIndicator = ' ▮▯▯▯';
        } else if (percentage > 0) {
            progressIndicator = ' ▯▯▯▯';
        }

        // For goals with priority, show different format
        const hasPriority = goal.metadata?.priority && goal.metadata.priority >= 4;
        const isBlocked = goal.status === 'blocked' || goal.blockedByIds.length > 0;
        const hasUrgentDueDate = goal.metadata?.dueDate && 
            new Date(goal.metadata.dueDate).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000;

        if (hasPriority || isBlocked || hasUrgentDueDate) {
            return ` [${progress.completed}/${progress.total} • ${percentage}%]${progressIndicator}`;
        }

        return ` (${progress.completed}/${progress.total} • ${percentage}%)${progressIndicator}`;
    }

    /**
     * Create comprehensive tooltip for a goal
     */
    private static createGoalTooltip(
        goal: Goal, 
        progress: { completed: number; total: number; percentage: number },
        indicators: { isBlocked: boolean; isHighPriority: boolean; isOverdue: boolean; isUrgent: boolean }
    ): string {
        const lines = [
            `📋 ${goal.title}`,
            ``,
            `Status: ${GoalTreeItem.formatStatusWithIcon(goal.status)}`,
            `Progress: ${progress.percentage}% (${progress.completed}/${progress.total} items)`
        ];

        // Add priority information
        if (goal.metadata?.priority) {
            const priorityText = GoalTreeItem.formatPriorityText(goal.metadata.priority);
            lines.push(`Priority: ${priorityText}`);
        }

        // Add due date information
        if (goal.metadata?.dueDate) {
            const dueDate = new Date(goal.metadata.dueDate);
            let dueDateText = `Due: ${dueDate.toLocaleDateString()}`;
            if (indicators.isOverdue) {
                dueDateText += ' ⚠️ OVERDUE';
            } else if (indicators.isUrgent) {
                dueDateText += ' 🔥 URGENT';
            }
            lines.push(dueDateText);
        }

        lines.push(`Created: ${goal.createdAt.toLocaleDateString()}`);

        // Add completion information
        if (goal.completedAt) {
            const timeTaken = goal.completedAt.getTime() - goal.createdAt.getTime();
            const daysTaken = Math.floor(timeTaken / (24 * 60 * 60 * 1000));
            lines.push(`✅ Completed: ${goal.completedAt.toLocaleDateString()} (${daysTaken} days)`);
        }

        // Add blocking/dependency information
        if (goal.blockedByIds.length > 0) {
            lines.push(``, `🔒 Dependencies:`);
            goal.blockedByIds.forEach(blockedId => {
                lines.push(`  • ${blockedId} (dependency)`);
            });
        }

        // Add breakdown information
        if (progress.total > 0) {
            lines.push(``, `📊 Breakdown:`);
            if (goal.tasks.length > 0) {
                const completedTasks = goal.tasks.filter(t => t.status === 'done').length;
                lines.push(`  Tasks: ${completedTasks}/${goal.tasks.length} completed`);
            }
        }

        // Add time tracking information
        if (goal.metadata?.estimatedHours || goal.metadata?.actualHours) {
            lines.push(``, `⏱️ Time Tracking:`);
            if (goal.metadata.estimatedHours) {
                lines.push(`  Estimated: ${goal.metadata.estimatedHours}h`);
            }
            if (goal.metadata.actualHours) {
                lines.push(`  Actual: ${goal.metadata.actualHours}h`);
                if (goal.metadata.estimatedHours) {
                    const variance = goal.metadata.actualHours - goal.metadata.estimatedHours;
                    const varianceText = variance > 0 ? `+${variance}h over` : `${Math.abs(variance)}h under`;
                    lines.push(`  Variance: ${varianceText}`);
                }
            }
        }

        // Add tags
        if (goal.metadata?.tags && goal.metadata.tags.length > 0) {
            lines.push(``, `🏷️ Tags: ${goal.metadata.tags.join(', ')}`);
        }

        // Add description at the end if it exists
        if (goal.description) {
            lines.push(``, `📝 ${goal.description}`);
        }

        return lines.join('\n');
    }

    /**
     * Create enhanced tooltip for a task
     */
    private static createTaskTooltip(task: Task): string {
        const lines = [
            `✅ ${task.title}`,
            ``,
            `Status: ${GoalTreeItem.formatTaskStatusWithIcon(task.status)}`,
            `Created: ${task.createdAt.toLocaleDateString()}`
        ];

        if (task.completedAt) {
            const timeTaken = task.completedAt.getTime() - task.createdAt.getTime();
            const daysTaken = Math.floor(timeTaken / (24 * 60 * 60 * 1000));
            const timeText = daysTaken > 0 ? `${daysTaken} days` : 'Same day';
            lines.push(`✅ Completed: ${task.completedAt.toLocaleDateString()} (${timeText})`);
        }

        if (task.order !== undefined) {
            lines.push(`Order: #${task.order + 1}`);
        }

        if (task.description) {
            lines.push(``, `📝 ${task.description}`);
        }

        return lines.join('\n');
    }

    /**
     * Format status with appropriate icon
     */
    private static formatStatusWithIcon(status: string): string {
        switch (status) {
            case 'planned':
                return `⭕ ${status}`;
            case 'in-progress':
                return `▶️ ${status}`;
            case 'blocked':
                return `🚫 ${status}`;
            case 'completed':
                return `✅ ${status}`;
            default:
                return status;
        }
    }

    /**
     * Format task status with appropriate icon
     */
    private static formatTaskStatusWithIcon(status: string): string {
        switch (status) {
            case 'todo':
                return `⭕ ${status}`;
            case 'in-progress':
                return `▶️ ${status}`;
            case 'done':
                return `✅ ${status}`;
            default:
                return status;
        }
    }

    /**
     * Format priority level with visual indicators
     */
    private static formatPriorityText(priority: number): string {
        const stars = '★'.repeat(priority) + '☆'.repeat(5 - priority);
        switch (priority) {
            case 5:
                return `${stars} HIGHEST`;
            case 4:
                return `${stars} HIGH`;
            case 3:
                return `${stars} MEDIUM`;
            case 2:
                return `${stars} LOW`;
            case 1:
                return `${stars} LOWEST`;
            default:
                return `${stars} MEDIUM`;
        }
    }

    /**
     * Build context value for a goal with multiple attributes
     */
    private static buildGoalContextValue(
        goal: Goal, 
        indicators: { isBlocked: boolean; isHighPriority: boolean; isOverdue: boolean; isUrgent: boolean }
    ): string {
        const contextParts = [];

        // Add base status context
        contextParts.push(TreeTypeUtils.getGoalContextValue(goal));

        // Add additional context indicators
        if (indicators.isBlocked && !contextParts.includes('goal:blocked')) {
            contextParts.push('blocked');
        }
        if (indicators.isHighPriority) {
            contextParts.push('high-priority');
        }
        if (indicators.isUrgent) {
            contextParts.push('urgent');
        }
        if (goal.blockedByIds.length > 0) {
            contextParts.push('has-dependencies');
        }

        return contextParts.join('_');
    }
}