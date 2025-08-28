/**
 * TreeContextMenuProvider.ts - Context menu provider for goal tree operations
 * 
 * This file manages right-click context menus for goal tree items,
 * providing contextual actions based on item type and status.
 */

import * as vscode from 'vscode';
import { Goal, Task, GoalStatus, TaskStatus, TaskStatusType } from '../types/Goal';
import { TREE_CONTEXT_VALUES } from '../types/TreeTypes';
import { StateManager } from '../services/stateManager';
import { GoalManager } from '../services/goalManager';
import { TaskManager } from '../services/TaskManager';
import { BulkTaskOperations } from '../services/BulkTaskOperations';
import { GoalTreeProvider } from './GoalTreeProvider';
import { createLogger } from '../utils/logger';

/**
 * Context menu item definition
 */
interface ContextMenuItem {
    command: string;
    title: string;
    icon?: string;
    group?: string;
    when?: string;
    enabled?: boolean;
}

/**
 * Context menu group definitions for better organization
 */
const MENU_GROUPS = {
    CREATE: '1_create',
    EDIT: '2_edit',
    STATUS: '3_status',
    MOVE: '4_move',
    DEPENDENCY: '5_depend',
    VIEW: '6_view',
    DELETE: '9_delete'
} as const;

/**
 * Tree context menu provider
 * Provides dynamic context menus based on the selected tree item
 */
export class TreeContextMenuProvider {
    private logger = createLogger('TreeContextMenuProvider');

    constructor(
        private stateManager: StateManager,
        private goalManager: GoalManager,
        private taskManager: TaskManager,
        private bulkTaskOperations: BulkTaskOperations,
        private goalTreeProvider?: GoalTreeProvider
    ) {}

    /**
     * Get context menu items for a given tree element
     * @param element The tree element (goalId or goalId:taskId)
     * @param contextValue The context value from the tree item
     * @returns Array of context menu items
     */
    getContextMenuItems(element: string, contextValue: string): ContextMenuItem[] {
        try {
            // Determine if this is a goal or task
            if (element.includes(':')) {
                // Task element (format: goalId:taskId)
                const [goalId, taskId] = element.split(':');
                return this.getTaskContextMenuItems(goalId, taskId, contextValue);
            } else {
                // Goal element
                return this.getGoalContextMenuItems(element, contextValue);
            }
        } catch (error) {
            this.logger.error('Error generating context menu items', { element, contextValue, error });
            return [];
        }
    }

    /**
     * Get context menu items for goal elements
     */
    private getGoalContextMenuItems(goalId: string, contextValue: string): ContextMenuItem[] {
        const goal = this.stateManager.getGoal(goalId);
        if (!goal) {
            this.logger.warn('Goal not found for context menu', { goalId });
            return [];
        }

        const items: ContextMenuItem[] = [];

        // Creation items
        items.push(
            {
                command: 'goalTree.createSubGoal',
                title: 'Add Sub-goal',
                icon: 'plus',
                group: MENU_GROUPS.CREATE
            },
            {
                command: 'goalTree.addTask',
                title: 'Add Task',
                icon: 'checklist',
                group: MENU_GROUPS.CREATE
            }
        );

        // Edit items
        items.push(
            {
                command: 'goalTree.editGoal',
                title: 'Edit Goal',
                icon: 'edit',
                group: MENU_GROUPS.EDIT
            },
            {
                command: 'goalTree.duplicateGoal',
                title: 'Duplicate Goal',
                icon: 'copy',
                group: MENU_GROUPS.EDIT
            }
        );

        // Status items (only show relevant status changes)
        const statusItems = this.getGoalStatusMenuItems(goal);
        items.push(...statusItems);

        // Dependency items
        items.push(
            {
                command: 'goalTree.addDependency',
                title: 'Add Dependency',
                icon: 'link',
                group: MENU_GROUPS.DEPENDENCY
            },
            {
                command: 'goalTree.showDependencies',
                title: 'Show Dependencies',
                icon: 'info',
                group: MENU_GROUPS.DEPENDENCY,
                enabled: goal.blockedByIds.length > 0
            }
        );

        // Remove dependency item (only if has dependencies)
        if (goal.blockedByIds.length > 0) {
            items.push({
                command: 'goalTree.removeDependency',
                title: 'Remove Dependency',
                icon: 'unlink',
                group: MENU_GROUPS.DEPENDENCY
            });
        }

        // View items
        items.push(
            {
                command: 'goalTree.expandAll',
                title: 'Expand All',
                icon: 'expand-all',
                group: MENU_GROUPS.VIEW
            },
            {
                command: 'goalTree.collapseAll',
                title: 'Collapse All',
                icon: 'collapse-all',
                group: MENU_GROUPS.VIEW
            },
            {
                command: 'goalTree.focusGoal',
                title: 'Focus on Goal',
                icon: 'target',
                group: MENU_GROUPS.VIEW
            },
            {
                command: 'goalTree.exportGoal',
                title: 'Export Goal',
                icon: 'export',
                group: MENU_GROUPS.VIEW
            }
        );

        // Delete item (always last)
        items.push({
            command: 'goalTree.deleteGoal',
            title: 'Delete Goal',
            icon: 'trash',
            group: MENU_GROUPS.DELETE
        });

        this.logger.debug('Generated goal context menu items', { 
            goalId, 
            itemCount: items.length,
            status: goal.status 
        });

        return items.filter(item => item.enabled !== false);
    }

    /**
     * Get context menu items for task elements
     */
    private getTaskContextMenuItems(goalId: string, taskId: string, contextValue: string): ContextMenuItem[] {
        const goal = this.stateManager.getGoal(goalId);
        if (!goal) {
            this.logger.warn('Goal not found for task context menu', { goalId, taskId });
            return [];
        }

        const task = goal.tasks.find(t => t.id === taskId);
        if (!task) {
            this.logger.warn('Task not found for context menu', { goalId, taskId });
            return [];
        }

        const items: ContextMenuItem[] = [];

        // Edit items
        items.push({
            command: 'goalTree.editTask',
            title: 'Edit Task',
            icon: 'edit',
            group: MENU_GROUPS.EDIT
        });

        // Duplicate task
        items.push({
            command: 'goalTree.duplicateTask',
            title: 'Duplicate Task',
            icon: 'copy',
            group: MENU_GROUPS.EDIT
        });

        // Enhanced status items
        const statusItems = this.getEnhancedTaskStatusMenuItems(task);
        items.push(...statusItems);

        // Move items (if multiple tasks exist)
        if (goal.tasks.length > 1) {
            const taskIndex = goal.tasks.findIndex(t => t.id === taskId);
            
            if (taskIndex > 0) {
                items.push({
                    command: 'goalTree.moveTaskUp',
                    title: 'Move Up',
                    icon: 'arrow-up',
                    group: MENU_GROUPS.MOVE
                });
            }
            
            if (taskIndex < goal.tasks.length - 1) {
                items.push({
                    command: 'goalTree.moveTaskDown',
                    title: 'Move Down',
                    icon: 'arrow-down',
                    group: MENU_GROUPS.MOVE
                });
            }

            // Advanced move options
            items.push({
                command: 'goalTree.moveTaskToTop',
                title: 'Move to Top',
                icon: 'arrow-up',
                group: MENU_GROUPS.MOVE,
                enabled: taskIndex > 0
            });

            items.push({
                command: 'goalTree.moveTaskToBottom',
                title: 'Move to Bottom',
                icon: 'arrow-down',
                group: MENU_GROUPS.MOVE,
                enabled: taskIndex < goal.tasks.length - 1
            });
        }

        // Task conversion and organization
        items.push({
            command: 'goalTree.convertTaskToGoal',
            title: 'Convert to Goal',
            icon: 'target',
            group: MENU_GROUPS.EDIT
        });

        // View and utility items
        items.push({
            command: 'goalTree.showTaskDetails',
            title: 'Show Details',
            icon: 'info',
            group: MENU_GROUPS.VIEW
        });

        items.push({
            command: 'goalTree.copyTaskId',
            title: 'Copy Task ID',
            icon: 'clippy',
            group: MENU_GROUPS.VIEW
        });

        // Delete item (always last)
        items.push({
            command: 'goalTree.deleteTask',
            title: 'Delete Task',
            icon: 'trash',
            group: MENU_GROUPS.DELETE
        });

        this.logger.debug('Generated task context menu items', { 
            goalId, 
            taskId, 
            itemCount: items.length,
            status: task.status 
        });

        return items.filter(item => item.enabled !== false);
    }

    /**
     * Get status menu items for goals (only show applicable status changes)
     */
    private getGoalStatusMenuItems(goal: Goal): ContextMenuItem[] {
        const items: ContextMenuItem[] = [];
        const currentStatus = goal.status;

        // Add status change options (excluding current status)
        const statusOptions: Array<{status: GoalStatus, title: string, icon: string}> = [
            { status: GoalStatus.PLANNED, title: 'Mark as Planned', icon: 'circle-outline' },
            { status: GoalStatus.IN_PROGRESS, title: 'Mark as In Progress', icon: 'play' },
            { status: GoalStatus.COMPLETED, title: 'Mark as Completed', icon: 'check' },
            { status: GoalStatus.BLOCKED, title: 'Mark as Blocked', icon: 'stop' }
        ];

        statusOptions
            .filter(option => option.status !== currentStatus)
            .forEach(option => {
                items.push({
                    command: `goalTree.mark${this.capitalizeFirst(option.status.replace('-', ''))}`,
                    title: option.title,
                    icon: option.icon,
                    group: MENU_GROUPS.STATUS
                });
            });

        return items;
    }

    /**
     * Get enhanced status menu items for tasks with bulk operation support
     */
    private getEnhancedTaskStatusMenuItems(task: Task): ContextMenuItem[] {
        const items: ContextMenuItem[] = [];
        
        // Primary toggle action
        items.push({
            command: 'goalTree.toggleTask',
            title: this.getTaskToggleTitle(task.status),
            icon: this.getTaskToggleIcon(task.status),
            group: MENU_GROUPS.STATUS
        });

        // Quick status changes based on current status
        switch (task.status) {
            case TaskStatus.TODO:
                items.push(
                    {
                        command: 'goalTree.startTask',
                        title: 'Start Task',
                        icon: 'play',
                        group: MENU_GROUPS.STATUS
                    },
                    {
                        command: 'goalTree.completeTask',
                        title: 'Mark Complete',
                        icon: 'check',
                        group: MENU_GROUPS.STATUS
                    }
                );
                break;
            case TaskStatus.IN_PROGRESS:
                items.push(
                    {
                        command: 'goalTree.completeTask',
                        title: 'Complete Task',
                        icon: 'check',
                        group: MENU_GROUPS.STATUS
                    },
                    {
                        command: 'goalTree.pauseTask',
                        title: 'Pause Task',
                        icon: 'circle-outline',
                        group: MENU_GROUPS.STATUS
                    }
                );
                break;
            case TaskStatus.DONE:
                items.push(
                    {
                        command: 'goalTree.reopenTask',
                        title: 'Reopen Task',
                        icon: 'undo',
                        group: MENU_GROUPS.STATUS
                    },
                    {
                        command: 'goalTree.restartTask',
                        title: 'Restart Task',
                        icon: 'play',
                        group: MENU_GROUPS.STATUS
                    }
                );
                break;
        }

        return items;
    }

    /**
     * Get appropriate toggle title for task based on current status
     */
    private getTaskToggleTitle(status: TaskStatusType): string {
        switch (status) {
            case TaskStatus.TODO:
                return 'Start Task';
            case TaskStatus.IN_PROGRESS:
                return 'Complete Task';
            case TaskStatus.DONE:
                return 'Reopen Task';
            default:
                return 'Toggle Task';
        }
    }

    /**
     * Get appropriate toggle icon for task based on current status
     */
    private getTaskToggleIcon(status: TaskStatusType): string {
        switch (status) {
            case TaskStatus.TODO:
                return 'play';
            case TaskStatus.IN_PROGRESS:
                return 'check';
            case TaskStatus.DONE:
                return 'undo';
            default:
                return 'check';
        }
    }

    /**
     * Capitalize first letter of a string
     */
    private capitalizeFirst(str: string): string {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    /**
     * Check if a context menu item should be visible based on context value
     */
    isItemVisible(item: ContextMenuItem, contextValue: string): boolean {
        if (!item.when) {
            return true;
        }

        // Simple when clause evaluation - in a real implementation,
        // this would use VS Code's when clause parser
        return this.evaluateWhenClause(item.when, contextValue);
    }

    /**
     * Enhanced when clause evaluation for context menus
     * Supports multiple operators and better error handling
     */
    private evaluateWhenClause(whenClause: string, contextValue: string): boolean {
        try {
            // Sanitize inputs
            if (!whenClause || typeof whenClause !== 'string') {
                this.logger.warn('Invalid when clause provided', { whenClause });
                return false;
            }
            
            if (!contextValue || typeof contextValue !== 'string') {
                this.logger.warn('Invalid context value provided', { contextValue });
                return false;
            }

            const normalizedClause = whenClause.trim();
            const normalizedContext = contextValue.trim();

            // Handle viewItem clauses
            if (normalizedClause.includes('viewItem')) {
                if (normalizedClause.includes('=~')) {
                    // Regular expression match with better error handling
                    const match = normalizedClause.match(/viewItem\s*=~\s*\/(.+)\/([gimuy]*)/);
                    if (match) {
                        try {
                            const flags = match[2] || '';
                            const regex = new RegExp(match[1], flags);
                            const result = regex.test(normalizedContext);
                            this.logger.debug('When clause regex evaluation', { 
                                clause: normalizedClause, 
                                context: normalizedContext, 
                                result 
                            });
                            return result;
                        } catch (regexError) {
                            this.logger.error('Invalid regex in when clause', { 
                                clause: normalizedClause, 
                                regex: match[1], 
                                error: regexError 
                            });
                            return false;
                        }
                    }
                } else if (normalizedClause.includes('==')) {
                    // Exact match with quoted string support
                    const match = normalizedClause.match(/viewItem\s*==\s*['"]?([^'"]+)['"]?/);
                    if (match) {
                        const result = normalizedContext === match[1].trim();
                        this.logger.debug('When clause exact match evaluation', { 
                            clause: normalizedClause, 
                            context: normalizedContext, 
                            expected: match[1].trim(),
                            result 
                        });
                        return result;
                    }
                } else if (normalizedClause.includes('!=')) {
                    // Not equal match with quoted string support
                    const match = normalizedClause.match(/viewItem\s*!=\s*['"]?([^'"]+)['"]?/);
                    if (match) {
                        const result = normalizedContext !== match[1].trim();
                        this.logger.debug('When clause not-equal evaluation', { 
                            clause: normalizedClause, 
                            context: normalizedContext, 
                            excluded: match[1].trim(),
                            result 
                        });
                        return result;
                    }
                } else if (normalizedClause.includes('in')) {
                    // Support for 'viewItem in (value1, value2)' syntax
                    const match = normalizedClause.match(/viewItem\s+in\s*\(([^)]+)\)/);
                    if (match) {
                        const values = match[1].split(',').map(v => v.trim().replace(/['"]?([^'"]*)['"]?/, '$1'));
                        const result = values.includes(normalizedContext);
                        this.logger.debug('When clause in-list evaluation', { 
                            clause: normalizedClause, 
                            context: normalizedContext, 
                            values,
                            result 
                        });
                        return result;
                    }
                }
            }

            // Handle logical operators (AND/OR)
            if (normalizedClause.includes('&&') || normalizedClause.includes('||')) {
                // Split by logical operators and evaluate recursively
                if (normalizedClause.includes('&&')) {
                    const parts = normalizedClause.split('&&').map(p => p.trim());
                    const result = parts.every(part => this.evaluateWhenClause(part, normalizedContext));
                    this.logger.debug('When clause AND evaluation', { 
                        clause: normalizedClause, 
                        context: normalizedContext, 
                        parts,
                        result 
                    });
                    return result;
                } else if (normalizedClause.includes('||')) {
                    const parts = normalizedClause.split('||').map(p => p.trim());
                    const result = parts.some(part => this.evaluateWhenClause(part, normalizedContext));
                    this.logger.debug('When clause OR evaluation', { 
                        clause: normalizedClause, 
                        context: normalizedContext, 
                        parts,
                        result 
                    });
                    return result;
                }
            }

            // Handle negation
            if (normalizedClause.startsWith('!')) {
                const innerClause = normalizedClause.substring(1).trim();
                const result = !this.evaluateWhenClause(innerClause, normalizedContext);
                this.logger.debug('When clause negation evaluation', { 
                    clause: normalizedClause, 
                    context: normalizedContext, 
                    innerClause,
                    result 
                });
                return result;
            }

            // Log unsupported when clauses for debugging
            this.logger.debug('Unsupported when clause, defaulting to true', { 
                clause: normalizedClause, 
                context: normalizedContext 
            });
            return true;
        } catch (error) {
            this.logger.error('Error evaluating when clause', { 
                whenClause, 
                contextValue, 
                error: error instanceof Error ? error.message : String(error)
            });
            return false;
        }
    }

    /**
     * Generate context menu configuration for package.json
     * This method helps generate the menu contributions for package.json
     */
    generateMenuContributions(): any {
        const menuContributions = {
            "view/title": [
                {
                    "command": "goalTree.createGoal",
                    "when": "view == goalTreeView",
                    "group": "navigation"
                },
                {
                    "command": "goalTree.refreshView",
                    "when": "view == goalTreeView",
                    "group": "navigation"
                },
                {
                    "command": "goalTree.expandAll",
                    "when": "view == goalTreeView",
                    "group": "navigation"
                },
                {
                    "command": "goalTree.collapseAll",
                    "when": "view == goalTreeView",
                    "group": "navigation"
                }
            ],
            "view/item/context": [
                // Goal context menus
                {
                    "command": "goalTree.createSubGoal",
                    "when": "view == goalTreeView && viewItem =~ /^goal/",
                    "group": "1_create"
                },
                {
                    "command": "goalTree.addTask",
                    "when": "view == goalTreeView && viewItem =~ /^goal/",
                    "group": "1_create"
                },
                {
                    "command": "goalTree.editGoal",
                    "when": "view == goalTreeView && viewItem =~ /^goal/",
                    "group": "2_edit"
                },
                {
                    "command": "goalTree.duplicateGoal",
                    "when": "view == goalTreeView && viewItem =~ /^goal/",
                    "group": "2_edit"
                },
                
                // Goal status menus
                {
                    "command": "goalTree.markPlanned",
                    "when": "view == goalTreeView && viewItem =~ /^goal/ && viewItem != goal:planned",
                    "group": "3_status"
                },
                {
                    "command": "goalTree.markInProgress",
                    "when": "view == goalTreeView && viewItem =~ /^goal/ && viewItem != goal:in-progress",
                    "group": "3_status"
                },
                {
                    "command": "goalTree.markCompleted",
                    "when": "view == goalTreeView && viewItem =~ /^goal/ && viewItem != goal:completed",
                    "group": "3_status"
                },
                {
                    "command": "goalTree.markBlocked",
                    "when": "view == goalTreeView && viewItem =~ /^goal/ && viewItem != goal:blocked",
                    "group": "3_status"
                },

                // Task context menus
                {
                    "command": "goalTree.editTask",
                    "when": "view == goalTreeView && viewItem =~ /^task/",
                    "group": "2_edit"
                },
                {
                    "command": "goalTree.toggleTask",
                    "when": "view == goalTreeView && viewItem =~ /^task/",
                    "group": "3_status"
                },
                {
                    "command": "goalTree.moveTaskUp",
                    "when": "view == goalTreeView && viewItem =~ /^task/",
                    "group": "4_move"
                },
                {
                    "command": "goalTree.moveTaskDown",
                    "when": "view == goalTreeView && viewItem =~ /^task/",
                    "group": "4_move"
                },

                // Dependency menus
                {
                    "command": "goalTree.addDependency",
                    "when": "view == goalTreeView && viewItem =~ /^goal/",
                    "group": "5_depend"
                },
                {
                    "command": "goalTree.removeDependency",
                    "when": "view == goalTreeView && viewItem =~ /^goal/",
                    "group": "5_depend"
                },
                {
                    "command": "goalTree.showDependencies",
                    "when": "view == goalTreeView && viewItem =~ /^goal/",
                    "group": "5_depend"
                },

                // Delete menus
                {
                    "command": "goalTree.deleteGoal",
                    "when": "view == goalTreeView && viewItem =~ /^goal/",
                    "group": "9_delete"
                },
                {
                    "command": "goalTree.deleteTask",
                    "when": "view == goalTreeView && viewItem =~ /^task/",
                    "group": "9_delete"
                }
            ]
        };

        return menuContributions;
    }

    /**
     * Get context menu items for the tree view title area
     */
    getTitleMenuItems(): ContextMenuItem[] {
        return [
            {
                command: 'goalTree.createGoal',
                title: 'Create Goal',
                icon: 'plus',
                group: 'navigation'
            },
            {
                command: 'goalTree.refreshView',
                title: 'Refresh',
                icon: 'refresh',
                group: 'navigation'
            },
            {
                command: 'goalTree.searchGoals',
                title: 'Search Goals',
                icon: 'search',
                group: 'navigation'
            },
            {
                command: 'goalTree.expandAll',
                title: 'Expand All',
                icon: 'expand-all',
                group: 'navigation'
            },
            {
                command: 'goalTree.collapseAll',
                title: 'Collapse All',
                icon: 'collapse-all',
                group: 'navigation'
            },
            {
                command: 'goalTree.toggleShowCompleted',
                title: 'Toggle Completed',
                icon: 'eye',
                group: 'view'
            },
            {
                command: 'goalTree.toggleSortByTitle',
                title: 'Sort by Title',
                icon: 'sort-precedence',
                group: 'view'
            },
            {
                command: 'goalTree.toggleGroupByStatus',
                title: 'Group by Status',
                icon: 'group-by-ref-type',
                group: 'view'
            },
            {
                command: 'goalTree.filterByStatus',
                title: 'Filter by Status',
                icon: 'filter',
                group: 'filter'
            },
            {
                command: 'goalTree.showOnlyBlocked',
                title: 'Show Only Blocked',
                icon: 'stop',
                group: 'filter'
            },
            {
                command: 'goalTree.importGoals',
                title: 'Import Goals',
                icon: 'cloud-download',
                group: 'management'
            },
            {
                command: 'goalTree.exportAll',
                title: 'Export All',
                icon: 'cloud-upload',
                group: 'management'
            }
        ];
    }

    /**
     * Initialize context menu provider
     * This method can be called to set up any initial configuration
     */
    initialize(): void {
        this.logger.info('TreeContextMenuProvider initialized');
    }

    // ===========================================
    // Enhanced Task Context Menu Actions
    // ===========================================

    /**
     * Execute task context menu command with proper integration
     */
    async executeTaskCommand(command: string, goalId: string, taskId: string): Promise<boolean> {
        if (!this.goalTreeProvider) {
            this.logger.warn('GoalTreeProvider not available for task command execution');
            return false;
        }

        try {
            switch (command) {
                case 'goalTree.toggleTask':
                    return await this.goalTreeProvider.toggleTaskStatus(goalId, taskId);
                
                case 'goalTree.editTask':
                    return await this.goalTreeProvider.editTask(goalId, taskId);
                
                case 'goalTree.deleteTask':
                    return await this.goalTreeProvider.deleteTask(goalId, taskId);
                
                case 'goalTree.moveTaskUp':
                    return await this.goalTreeProvider.moveTaskUp(goalId, taskId);
                
                case 'goalTree.moveTaskDown':
                    return await this.goalTreeProvider.moveTaskDown(goalId, taskId);
                
                case 'goalTree.startTask':
                case 'goalTree.completeTask':
                case 'goalTree.pauseTask':
                case 'goalTree.reopenTask':
                case 'goalTree.restartTask':
                    return await this.handleTaskStatusCommand(command, goalId, taskId);
                
                case 'goalTree.duplicateTask':
                    return await this.duplicateTask(goalId, taskId);
                
                case 'goalTree.moveTaskToTop':
                    return await this.moveTaskToPosition(goalId, taskId, 0);
                
                case 'goalTree.moveTaskToBottom':
                    return await this.moveTaskToPosition(goalId, taskId, -1);
                
                case 'goalTree.convertTaskToGoal':
                    return await this.convertTaskToGoal(goalId, taskId);
                
                case 'goalTree.showTaskDetails':
                    return this.showTaskDetails(goalId, taskId);
                
                case 'goalTree.copyTaskId':
                    return this.copyTaskId(taskId);
                
                default:
                    this.logger.warn(`Unknown task command: ${command}`);
                    return false;
            }
        } catch (error) {
            this.logger.error(`Error executing task command ${command}`, error);
            vscode.window.showErrorMessage(`Failed to execute command: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
    }

    /**
     * Handle specific task status change commands
     */
    private async handleTaskStatusCommand(command: string, goalId: string, taskId: string): Promise<boolean> {
        let targetStatus: 'todo' | 'in-progress' | 'done';

        switch (command) {
            case 'goalTree.startTask':
            case 'goalTree.restartTask':
                targetStatus = 'in-progress';
                break;
            case 'goalTree.completeTask':
                targetStatus = 'done';
                break;
            case 'goalTree.pauseTask':
            case 'goalTree.reopenTask':
                targetStatus = 'todo';
                break;
            default:
                return false;
        }

        return await this.goalTreeProvider!.setTaskStatus(goalId, taskId, targetStatus);
    }

    /**
     * Duplicate a task within the same goal
     */
    private async duplicateTask(goalId: string, taskId: string): Promise<boolean> {
        try {
            const goal = this.stateManager.getGoal(goalId);
            if (!goal) {
                vscode.window.showErrorMessage('Goal not found');
                return false;
            }

            const task = goal.tasks.find(t => t.id === taskId);
            if (!task) {
                vscode.window.showErrorMessage('Task not found');
                return false;
            }

            const result = await this.taskManager.createTask(goalId, {
                title: `${task.title} (Copy)`,
                description: task.description,
                goalId: goalId
            });

            if (result.success) {
                vscode.window.showInformationMessage(`Task "${task.title}" duplicated`);
                return true;
            } else {
                vscode.window.showErrorMessage(`Failed to duplicate task: ${result.error}`);
                return false;
            }
        } catch (error) {
            this.logger.error('Error duplicating task', error);
            vscode.window.showErrorMessage('Failed to duplicate task');
            return false;
        }
    }

    /**
     * Move task to specific position
     */
    private async moveTaskToPosition(goalId: string, taskId: string, position: number): Promise<boolean> {
        try {
            const goal = this.stateManager.getGoal(goalId);
            if (!goal) {
                return false;
            }

            const targetOrder = position === -1 ? goal.tasks.length - 1 : position;
            const result = await this.taskManager.setTaskOrder(taskId, targetOrder);
            
            if (result.success) {
                this.goalTreeProvider?.refresh();
                return true;
            }
            
            return false;
        } catch (error) {
            this.logger.error('Error moving task to position', error);
            return false;
        }
    }

    /**
     * Convert task to goal (placeholder for future implementation)
     */
    private async convertTaskToGoal(goalId: string, taskId: string): Promise<boolean> {
        try {
            const goal = this.stateManager.getGoal(goalId);
            if (!goal) {
                return false;
            }

            const task = goal.tasks.find(t => t.id === taskId);
            if (!task) {
                return false;
            }

            const confirmation = await vscode.window.showWarningMessage(
                `Convert task "${task.title}" to a new goal? This will remove it from the current goal.`,
                { modal: true },
                'Convert',
                'Cancel'
            );

            if (confirmation !== 'Convert') {
                return false;
            }

            // This is a placeholder - would need to integrate with GoalManager
            // to create a new goal and remove the task
            vscode.window.showInformationMessage('Task to goal conversion is not yet implemented');
            return false;
        } catch (error) {
            this.logger.error('Error converting task to goal', error);
            return false;
        }
    }

    /**
     * Show detailed task information
     */
    private showTaskDetails(goalId: string, taskId: string): boolean {
        try {
            const goal = this.stateManager.getGoal(goalId);
            if (!goal) {
                return false;
            }

            const task = goal.tasks.find(t => t.id === taskId);
            if (!task) {
                return false;
            }

            const details = [
                `📋 ${task.title}`,
                '',
                `Status: ${task.status}`,
                `Created: ${task.createdAt.toLocaleDateString()}`,
                task.completedAt ? `Completed: ${task.completedAt.toLocaleDateString()}` : '',
                `Order: #${(task.order || 0) + 1}`,
                `Goal: ${goal.title}`,
                '',
                task.description ? `📝 ${task.description}` : 'No description',
                '',
                `Task ID: ${task.id}`
            ].filter(line => line !== '').join('\n');

            vscode.window.showInformationMessage(details, { modal: true });
            return true;
        } catch (error) {
            this.logger.error('Error showing task details', error);
            return false;
        }
    }

    /**
     * Copy task ID to clipboard
     */
    private copyTaskId(taskId: string): boolean {
        try {
            vscode.env.clipboard.writeText(taskId);
            vscode.window.showInformationMessage(`Task ID copied to clipboard: ${taskId}`);
            return true;
        } catch (error) {
            this.logger.error('Error copying task ID', error);
            vscode.window.showErrorMessage('Failed to copy task ID');
            return false;
        }
    }

    /**
     * Get bulk task operations for external access
     */
    getBulkTaskOperations(): BulkTaskOperations {
        return this.bulkTaskOperations;
    }

    /**
     * Set the goal tree provider reference for command execution
     */
    setGoalTreeProvider(provider: GoalTreeProvider): void {
        this.goalTreeProvider = provider;
    }

    /**
     * Dispose of resources used by the context menu provider
     */
    dispose(): void {
        this.taskManager?.dispose();
        this.bulkTaskOperations?.dispose();
        this.logger.info('TreeContextMenuProvider disposed');
    }
}