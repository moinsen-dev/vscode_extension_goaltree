/**
 * TaskManager Service - Issue #7 Stream A Implementation
 * 
 * Core TaskManager class providing comprehensive task operations within goals,
 * including CRUD operations, status transitions, task ordering, and integration
 * with the existing GoalManager and StorageService architecture.
 * 
 * This service provides:
 * - CRUD operations with StorageService persistence through GoalManager
 * - Status transitions with proper validation
 * - Task ordering and reordering within goals
 * - Event emission for tree view updates
 * - Integration with GoalManager for goal-task relationships
 * - Progress calculation and task metrics
 */

import * as vscode from 'vscode';
import {
    Goal,
    Task,
    CreateTaskParams,
    UpdateTaskParams,
    TaskStatus,
    TaskStatusType,
    TaskUtils,
    GoalEvent,
    GoalEventType,
    TaskAddedEvent,
    TaskUpdatedEvent,
    TaskDeletedEvent,
    TaskStatusChangedEvent,
    GoalEventUtils
} from '../types';
import { StorageService } from './storageService';
import { ValidationService } from './ValidationService';

/**
 * Task operation result interface
 */
export interface TaskOperationResult<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    timestamp: Date;
    operation: string;
}

/**
 * Task search parameters
 */
export interface TaskSearchParams {
    goalId?: string;
    status?: TaskStatusType;
    title?: string;
    limit?: number;
    orderBy?: 'created' | 'updated' | 'order' | 'title';
    orderDirection?: 'asc' | 'desc';
}

/**
 * Task statistics interface
 */
export interface TaskStatistics {
    total: number;
    byStatus: Record<TaskStatusType, number>;
    averageCompletionTime?: number;
    oldestTask?: Task;
    newestTask?: Task;
    goalProgress: Record<string, number>; // goalId -> percentage
}

/**
 * Task reorder operation parameters
 */
export interface ReorderTasksParams {
    goalId: string;
    taskOrders: Array<{ taskId: string; newOrder: number }>;
}

/**
 * Bulk task operation parameters
 */
export interface BulkTaskOperation {
    taskIds: string[];
    operation: 'updateStatus' | 'delete' | 'moveToGoal';
    params?: {
        status?: TaskStatusType;
        targetGoalId?: string;
    };
}

/**
 * TaskManager event emitter for task operations
 */
export class TaskManagerEventEmitter {
    private readonly eventEmitter = new vscode.EventEmitter<GoalEvent>();
    
    /**
     * Event fired when tasks change (for tree view updates)
     */
    readonly onTaskEvent = this.eventEmitter.event;
    
    /**
     * Emit a task event
     */
    async emit(event: GoalEvent): Promise<void> {
        this.eventEmitter.fire(event);
    }
    
    /**
     * Dispose of resources
     */
    dispose(): void {
        this.eventEmitter.dispose();
    }
}

/**
 * Core TaskManager class with comprehensive task operations
 */
export class TaskManager {
    private readonly storageService: StorageService;
    private readonly validationService: ValidationService;
    private readonly eventEmitter: TaskManagerEventEmitter;
    private isDisposed = false;
    private taskCache: Map<string, Task> = new Map(); // taskId -> Task
    private goalTaskCache: Map<string, string[]> = new Map(); // goalId -> taskIds[]
    private cacheStale = true;

    constructor(
        storageService: StorageService,
        validationService?: ValidationService
    ) {
        this.storageService = storageService;
        this.validationService = validationService || new ValidationService();
        this.eventEmitter = new TaskManagerEventEmitter();
        
        // Listen for storage changes to invalidate cache
        this.storageService.onDataChange(() => {
            this.cacheStale = true;
            this.taskCache.clear();
            this.goalTaskCache.clear();
        });
    }

    /**
     * Event fired when tasks change (for tree view updates)
     */
    get onTaskEvent() {
        return this.eventEmitter.onTaskEvent;
    }

    // ===========================================
    // Public CRUD Operations
    // ===========================================

    /**
     * Create a new task within a goal
     */
    async createTask(goalId: string, params: CreateTaskParams): Promise<TaskOperationResult<Task>> {
        if (this.isDisposed) {
            return {
                success: false,
                error: 'TaskManager has been disposed',
                timestamp: new Date(),
                operation: 'createTask'
            };
        }

        try {
            // Validate task creation
            const validation = this.validationService.validateTaskCreation(params);
            if (!validation.isValid) {
                return {
                    success: false,
                    error: `Task creation validation failed: ${validation.errors.join(', ')}`,
                    timestamp: new Date(),
                    operation: 'createTask'
                };
            }

            // Get the goal to add task to
            const goalResult = await this.storageService.getGoal(goalId);
            if (!goalResult.success || !goalResult.data) {
                return {
                    success: false,
                    error: `Goal with id ${goalId} not found`,
                    timestamp: new Date(),
                    operation: 'createTask'
                };
            }

            const goal = goalResult.data;

            // Create the task using TaskUtils
            const taskTemplate = TaskUtils.createTask(params);
            const task: Task = {
                ...taskTemplate,
                id: this.generateTaskId(),
                goalId: goalId,
                order: goal.tasks.length // Add to end
            };

            // Update goal with new task
            const updatedGoal: Goal = {
                ...goal,
                tasks: [...goal.tasks, task],
                updatedAt: new Date()
            };

            // Save to storage
            const saveResult = await this.storageService.saveGoal(updatedGoal);
            if (!saveResult.success) {
                return {
                    success: false,
                    error: saveResult.error || 'Failed to save goal with new task',
                    timestamp: new Date(),
                    operation: 'createTask'
                };
            }

            // Update cache
            this.updateCacheWithGoal(updatedGoal);

            // Emit task creation event
            await this.emitTaskAddedEvent(goalId, task, updatedGoal);

            return {
                success: true,
                data: task,
                timestamp: new Date(),
                operation: 'createTask'
            };

        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                timestamp: new Date(),
                operation: 'createTask'
            };
        }
    }

    /**
     * Get a task by ID
     */
    async getTask(taskId: string): Promise<TaskOperationResult<Task | undefined>> {
        if (this.isDisposed) {
            return {
                success: false,
                error: 'TaskManager has been disposed',
                timestamp: new Date(),
                operation: 'getTask'
            };
        }

        try {
            await this.refreshCacheIfNeeded();

            const task = this.taskCache.get(taskId);
            return {
                success: true,
                data: task,
                timestamp: new Date(),
                operation: 'getTask'
            };

        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                timestamp: new Date(),
                operation: 'getTask'
            };
        }
    }

    /**
     * Update an existing task
     */
    async updateTask(taskId: string, updates: UpdateTaskParams): Promise<TaskOperationResult<Task>> {
        if (this.isDisposed) {
            return {
                success: false,
                error: 'TaskManager has been disposed',
                timestamp: new Date(),
                operation: 'updateTask'
            };
        }

        try {
            // Refresh cache to ensure we have latest data
            await this.refreshCacheIfNeeded();

            const existingTask = this.taskCache.get(taskId);
            if (!existingTask) {
                return {
                    success: false,
                    error: `Task with id ${taskId} not found`,
                    timestamp: new Date(),
                    operation: 'updateTask'
                };
            }

            const previousState = { ...existingTask };

            // Validate task update
            const validation = this.validationService.validateTaskUpdate(existingTask, updates);
            if (!validation.isValid) {
                return {
                    success: false,
                    error: `Task update validation failed: ${validation.errors.join(', ')}`,
                    timestamp: new Date(),
                    operation: 'updateTask'
                };
            }

            // Get the goal containing this task
            const goalResult = await this.storageService.getGoal(existingTask.goalId);
            if (!goalResult.success || !goalResult.data) {
                return {
                    success: false,
                    error: `Goal with id ${existingTask.goalId} not found`,
                    timestamp: new Date(),
                    operation: 'updateTask'
                };
            }

            const goal = goalResult.data;
            const taskIndex = goal.tasks.findIndex(t => t.id === taskId);
            if (taskIndex === -1) {
                return {
                    success: false,
                    error: `Task ${taskId} not found in goal ${existingTask.goalId}`,
                    timestamp: new Date(),
                    operation: 'updateTask'
                };
            }

            // Create updated task
            const updatedTask: Task = {
                ...existingTask,
                ...updates,
                updatedAt: new Date()
            };

            // Handle completion status
            if (updates.status === TaskStatus.DONE && existingTask.status !== TaskStatus.DONE) {
                updatedTask.completedAt = new Date();
            }

            // Update goal with modified task
            const updatedTasks = [...goal.tasks];
            updatedTasks[taskIndex] = updatedTask;

            const updatedGoal: Goal = {
                ...goal,
                tasks: updatedTasks,
                updatedAt: new Date()
            };

            // Save to storage
            const saveResult = await this.storageService.saveGoal(updatedGoal);
            if (!saveResult.success) {
                return {
                    success: false,
                    error: saveResult.error || 'Failed to save goal with updated task',
                    timestamp: new Date(),
                    operation: 'updateTask'
                };
            }

            // Update cache
            this.updateCacheWithGoal(updatedGoal);

            // Emit update events
            await this.emitTaskUpdatedEvent(existingTask.goalId, updatedTask, previousState, updatedGoal);
            
            if (updates.status && updates.status !== existingTask.status) {
                await this.emitTaskStatusChangedEvent(
                    existingTask.goalId, 
                    taskId, 
                    existingTask.status, 
                    updates.status, 
                    updatedTask, 
                    updatedGoal
                );
            }

            return {
                success: true,
                data: updatedTask,
                timestamp: new Date(),
                operation: 'updateTask'
            };

        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                timestamp: new Date(),
                operation: 'updateTask'
            };
        }
    }

    /**
     * Delete a task by ID
     */
    async deleteTask(taskId: string): Promise<TaskOperationResult<void>> {
        if (this.isDisposed) {
            return {
                success: false,
                error: 'TaskManager has been disposed',
                timestamp: new Date(),
                operation: 'deleteTask'
            };
        }

        try {
            // Refresh cache to ensure we have latest data
            await this.refreshCacheIfNeeded();

            const existingTask = this.taskCache.get(taskId);
            if (!existingTask) {
                return {
                    success: false,
                    error: `Task with id ${taskId} not found`,
                    timestamp: new Date(),
                    operation: 'deleteTask'
                };
            }

            // Get the goal containing this task
            const goalResult = await this.storageService.getGoal(existingTask.goalId);
            if (!goalResult.success || !goalResult.data) {
                return {
                    success: false,
                    error: `Goal with id ${existingTask.goalId} not found`,
                    timestamp: new Date(),
                    operation: 'deleteTask'
                };
            }

            const goal = goalResult.data;
            const taskIndex = goal.tasks.findIndex(t => t.id === taskId);
            if (taskIndex === -1) {
                return {
                    success: false,
                    error: `Task ${taskId} not found in goal ${existingTask.goalId}`,
                    timestamp: new Date(),
                    operation: 'deleteTask'
                };
            }

            // Remove task and reorder remaining tasks
            const updatedTasks = goal.tasks.filter(t => t.id !== taskId);
            updatedTasks.forEach((t, index) => {
                t.order = index;
            });

            const updatedGoal: Goal = {
                ...goal,
                tasks: updatedTasks,
                updatedAt: new Date()
            };

            // Save to storage
            const saveResult = await this.storageService.saveGoal(updatedGoal);
            if (!saveResult.success) {
                return {
                    success: false,
                    error: saveResult.error || 'Failed to save goal with deleted task',
                    timestamp: new Date(),
                    operation: 'deleteTask'
                };
            }

            // Update cache
            this.updateCacheWithGoal(updatedGoal);

            // Emit task deletion event
            await this.emitTaskDeletedEvent(existingTask.goalId, taskId, existingTask, updatedGoal);

            return {
                success: true,
                timestamp: new Date(),
                operation: 'deleteTask'
            };

        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                timestamp: new Date(),
                operation: 'deleteTask'
            };
        }
    }

    // ===========================================
    // Task Querying and Filtering
    // ===========================================

    /**
     * Get all tasks for a specific goal
     */
    async getTasksByGoal(goalId: string): Promise<TaskOperationResult<Task[]>> {
        if (this.isDisposed) {
            return {
                success: false,
                error: 'TaskManager has been disposed',
                timestamp: new Date(),
                operation: 'getTasksByGoal'
            };
        }

        try {
            const goalResult = await this.storageService.getGoal(goalId);
            if (!goalResult.success || !goalResult.data) {
                return {
                    success: false,
                    error: `Goal with id ${goalId} not found`,
                    timestamp: new Date(),
                    operation: 'getTasksByGoal'
                };
            }

            const tasks = TaskUtils.sortByOrder(goalResult.data.tasks);
            return {
                success: true,
                data: tasks,
                timestamp: new Date(),
                operation: 'getTasksByGoal'
            };

        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                timestamp: new Date(),
                operation: 'getTasksByGoal'
            };
        }
    }

    /**
     * Get tasks filtered by status
     */
    async getTasksByStatus(status: TaskStatusType): Promise<TaskOperationResult<Task[]>> {
        if (this.isDisposed) {
            return {
                success: false,
                error: 'TaskManager has been disposed',
                timestamp: new Date(),
                operation: 'getTasksByStatus'
            };
        }

        try {
            await this.refreshCacheIfNeeded();

            const tasks = Array.from(this.taskCache.values())
                .filter(task => task.status === status);

            return {
                success: true,
                data: TaskUtils.sortByOrder(tasks),
                timestamp: new Date(),
                operation: 'getTasksByStatus'
            };

        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                timestamp: new Date(),
                operation: 'getTasksByStatus'
            };
        }
    }

    /**
     * Search tasks with various filters
     */
    async searchTasks(params: TaskSearchParams): Promise<TaskOperationResult<Task[]>> {
        if (this.isDisposed) {
            return {
                success: false,
                error: 'TaskManager has been disposed',
                timestamp: new Date(),
                operation: 'searchTasks'
            };
        }

        try {
            await this.refreshCacheIfNeeded();

            let tasks = Array.from(this.taskCache.values());

            // Apply filters
            if (params.goalId) {
                tasks = tasks.filter(task => task.goalId === params.goalId);
            }

            if (params.status) {
                tasks = tasks.filter(task => task.status === params.status);
            }

            if (params.title) {
                const searchTerm = params.title.toLowerCase();
                tasks = tasks.filter(task => 
                    task.title.toLowerCase().includes(searchTerm) ||
                    (task.description && task.description.toLowerCase().includes(searchTerm))
                );
            }

            // Apply sorting
            const orderBy = params.orderBy || 'order';
            const orderDirection = params.orderDirection || 'asc';

            tasks.sort((a, b) => {
                let comparison = 0;
                
                switch (orderBy) {
                    case 'created':
                        const aCreated = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
                        const bCreated = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
                        comparison = aCreated.getTime() - bCreated.getTime();
                        break;
                    case 'updated':
                        const aUpdated = a.updatedAt ? (a.updatedAt instanceof Date ? a.updatedAt : new Date(a.updatedAt)) : new Date(0);
                        const bUpdated = b.updatedAt ? (b.updatedAt instanceof Date ? b.updatedAt : new Date(b.updatedAt)) : new Date(0);
                        comparison = aUpdated.getTime() - bUpdated.getTime();
                        break;
                    case 'title':
                        comparison = a.title.localeCompare(b.title);
                        break;
                    case 'order':
                    default:
                        comparison = a.order - b.order;
                        break;
                }

                return orderDirection === 'desc' ? -comparison : comparison;
            });

            // Apply limit
            if (params.limit && params.limit > 0) {
                tasks = tasks.slice(0, params.limit);
            }

            return {
                success: true,
                data: tasks,
                timestamp: new Date(),
                operation: 'searchTasks'
            };

        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                timestamp: new Date(),
                operation: 'searchTasks'
            };
        }
    }

    // ===========================================
    // Task Status Operations
    // ===========================================

    /**
     * Update task status with validation
     */
    async updateTaskStatus(taskId: string, newStatus: TaskStatusType): Promise<TaskOperationResult<Task>> {
        return this.updateTask(taskId, { status: newStatus });
    }

    /**
     * Validate status transition
     */
    validateStatusTransition(currentStatus: TaskStatusType, newStatus: TaskStatusType): { isValid: boolean; error?: string } {
        const validTransitions = this.getValidStatusTransitions(currentStatus);
        
        if (validTransitions.includes(newStatus)) {
            return { isValid: true };
        }
        
        return { 
            isValid: false, 
            error: `Invalid status transition from ${currentStatus} to ${newStatus}` 
        };
    }

    /**
     * Get valid status transitions for current status
     */
    private getValidStatusTransitions(currentStatus: TaskStatusType): TaskStatusType[] {
        switch (currentStatus) {
            case TaskStatus.TODO:
                return [TaskStatus.IN_PROGRESS, TaskStatus.DONE];
            case TaskStatus.IN_PROGRESS:
                return [TaskStatus.TODO, TaskStatus.DONE];
            case TaskStatus.DONE:
                return [TaskStatus.TODO, TaskStatus.IN_PROGRESS];
            default:
                return [];
        }
    }

    // ===========================================
    // Task Ordering Operations
    // ===========================================

    /**
     * Reorder tasks within a goal
     */
    async reorderTasks(params: ReorderTasksParams): Promise<TaskOperationResult<Task[]>> {
        if (this.isDisposed) {
            return {
                success: false,
                error: 'TaskManager has been disposed',
                timestamp: new Date(),
                operation: 'reorderTasks'
            };
        }

        try {
            const goalResult = await this.storageService.getGoal(params.goalId);
            if (!goalResult.success || !goalResult.data) {
                return {
                    success: false,
                    error: `Goal with id ${params.goalId} not found`,
                    timestamp: new Date(),
                    operation: 'reorderTasks'
                };
            }

            const goal = goalResult.data;
            const updatedTasks = [...goal.tasks];

            // Apply new orders
            for (const { taskId, newOrder } of params.taskOrders) {
                const taskIndex = updatedTasks.findIndex(t => t.id === taskId);
                if (taskIndex >= 0) {
                    updatedTasks[taskIndex].order = newOrder;
                }
            }

            // Sort by order and reassign sequential order values
            updatedTasks.sort((a, b) => a.order - b.order);
            updatedTasks.forEach((task, index) => {
                task.order = index;
            });

            const updatedGoal: Goal = {
                ...goal,
                tasks: updatedTasks,
                updatedAt: new Date()
            };

            // Save to storage
            const saveResult = await this.storageService.saveGoal(updatedGoal);
            if (!saveResult.success) {
                return {
                    success: false,
                    error: saveResult.error || 'Failed to save reordered tasks',
                    timestamp: new Date(),
                    operation: 'reorderTasks'
                };
            }

            // Update cache
            this.updateCacheWithGoal(updatedGoal);

            return {
                success: true,
                data: updatedTasks,
                timestamp: new Date(),
                operation: 'reorderTasks'
            };

        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                timestamp: new Date(),
                operation: 'reorderTasks'
            };
        }
    }

    /**
     * Move task up in order
     */
    async moveTaskUp(taskId: string): Promise<TaskOperationResult<Task[]>> {
        return this.moveTask(taskId, 'up');
    }

    /**
     * Move task down in order
     */
    async moveTaskDown(taskId: string): Promise<TaskOperationResult<Task[]>> {
        return this.moveTask(taskId, 'down');
    }

    /**
     * Set specific order for a task
     */
    async setTaskOrder(taskId: string, newOrder: number): Promise<TaskOperationResult<Task>> {
        if (this.isDisposed) {
            return {
                success: false,
                error: 'TaskManager has been disposed',
                timestamp: new Date(),
                operation: 'setTaskOrder'
            };
        }

        if (newOrder < 0) {
            return {
                success: false,
                error: 'Task order must be non-negative',
                timestamp: new Date(),
                operation: 'setTaskOrder'
            };
        }

        try {
            await this.refreshCacheIfNeeded();

            const task = this.taskCache.get(taskId);
            if (!task) {
                return {
                    success: false,
                    error: `Task with id ${taskId} not found`,
                    timestamp: new Date(),
                    operation: 'setTaskOrder'
                };
            }

            const goalResult = await this.storageService.getGoal(task.goalId);
            if (!goalResult.success || !goalResult.data) {
                return {
                    success: false,
                    error: `Goal with id ${task.goalId} not found`,
                    timestamp: new Date(),
                    operation: 'setTaskOrder'
                };
            }

            const goal = goalResult.data;
            const updatedTasks = [...goal.tasks];
            
            // Find the task and update its order
            const taskIndex = updatedTasks.findIndex(t => t.id === taskId);
            if (taskIndex >= 0) {
                updatedTasks[taskIndex].order = newOrder;
            }

            // Sort and reassign sequential orders
            updatedTasks.sort((a, b) => a.order - b.order);
            updatedTasks.forEach((t, index) => {
                t.order = index;
            });

            const updatedGoal: Goal = {
                ...goal,
                tasks: updatedTasks,
                updatedAt: new Date()
            };

            const saveResult = await this.storageService.saveGoal(updatedGoal);
            if (!saveResult.success) {
                return {
                    success: false,
                    error: saveResult.error || 'Failed to save task order',
                    timestamp: new Date(),
                    operation: 'setTaskOrder'
                };
            }

            // Update cache
            this.updateCacheWithGoal(updatedGoal);

            const updatedTask = updatedTasks.find(t => t.id === taskId);
            return {
                success: true,
                data: updatedTask!,
                timestamp: new Date(),
                operation: 'setTaskOrder'
            };

        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                timestamp: new Date(),
                operation: 'setTaskOrder'
            };
        }
    }

    // ===========================================
    // Goal Integration Operations
    // ===========================================

    /**
     * Add task to goal (alias for createTask for consistency with GoalManager)
     */
    async addTaskToGoal(goalId: string, params: CreateTaskParams): Promise<TaskOperationResult<Task>> {
        return this.createTask(goalId, params);
    }

    /**
     * Remove task from goal (alias for deleteTask for consistency with GoalManager)
     */
    async removeTaskFromGoal(goalId: string, taskId: string): Promise<TaskOperationResult<void>> {
        // Verify task belongs to goal
        await this.refreshCacheIfNeeded();
        const task = this.taskCache.get(taskId);
        if (task && task.goalId !== goalId) {
            return {
                success: false,
                error: `Task ${taskId} does not belong to goal ${goalId}`,
                timestamp: new Date(),
                operation: 'removeTaskFromGoal'
            };
        }

        return this.deleteTask(taskId);
    }

    /**
     * Get all tasks for a goal (alias for getTasksByGoal)
     */
    async getGoalTasks(goalId: string): Promise<TaskOperationResult<Task[]>> {
        return this.getTasksByGoal(goalId);
    }

    // ===========================================
    // Statistics and Progress
    // ===========================================

    /**
     * Get comprehensive task statistics
     */
    async getTaskStatistics(): Promise<TaskOperationResult<TaskStatistics>> {
        if (this.isDisposed) {
            return {
                success: false,
                error: 'TaskManager has been disposed',
                timestamp: new Date(),
                operation: 'getTaskStatistics'
            };
        }

        try {
            await this.refreshCacheIfNeeded();

            const allTasks = Array.from(this.taskCache.values());
            
            const byStatus: Record<TaskStatusType, number> = {
                [TaskStatus.TODO]: 0,
                [TaskStatus.IN_PROGRESS]: 0,
                [TaskStatus.DONE]: 0
            };

            const completionTimes: number[] = [];
            let oldestTask: Task | undefined;
            let newestTask: Task | undefined;
            const goalProgress: Record<string, number> = {};

            for (const task of allTasks) {
                byStatus[task.status]++;

                // Track oldest and newest
                const taskCreated = task.createdAt instanceof Date ? task.createdAt : new Date(task.createdAt);
                if (!oldestTask || taskCreated < (oldestTask.createdAt instanceof Date ? oldestTask.createdAt : new Date(oldestTask.createdAt))) {
                    oldestTask = task;
                }
                if (!newestTask || taskCreated > (newestTask.createdAt instanceof Date ? newestTask.createdAt : new Date(newestTask.createdAt))) {
                    newestTask = task;
                }

                // Calculate completion times for done tasks
                if (task.status === TaskStatus.DONE && task.completedAt) {
                    const completed = task.completedAt instanceof Date ? task.completedAt : new Date(task.completedAt);
                    const created = taskCreated;
                    completionTimes.push(completed.getTime() - created.getTime());
                }
            }

            // Calculate goal progress
            const goalTaskMap: Map<string, Task[]> = new Map();
            for (const task of allTasks) {
                if (!goalTaskMap.has(task.goalId)) {
                    goalTaskMap.set(task.goalId, []);
                }
                goalTaskMap.get(task.goalId)!.push(task);
            }

            for (const [goalId, tasks] of goalTaskMap) {
                const completedTasks = tasks.filter(t => t.status === TaskStatus.DONE).length;
                goalProgress[goalId] = tasks.length > 0 ? (completedTasks / tasks.length) * 100 : 0;
            }

            const averageCompletionTime = completionTimes.length > 0 
                ? completionTimes.reduce((sum, time) => sum + time, 0) / completionTimes.length 
                : undefined;

            const statistics: TaskStatistics = {
                total: allTasks.length,
                byStatus,
                averageCompletionTime,
                oldestTask,
                newestTask,
                goalProgress
            };

            return {
                success: true,
                data: statistics,
                timestamp: new Date(),
                operation: 'getTaskStatistics'
            };

        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                timestamp: new Date(),
                operation: 'getTaskStatistics'
            };
        }
    }

    /**
     * Calculate progress for a specific goal based on task completion
     */
    async calculateGoalProgress(goalId: string): Promise<TaskOperationResult<number>> {
        if (this.isDisposed) {
            return {
                success: false,
                error: 'TaskManager has been disposed',
                timestamp: new Date(),
                operation: 'calculateGoalProgress'
            };
        }

        try {
            const tasksResult = await this.getTasksByGoal(goalId);
            if (!tasksResult.success || !tasksResult.data) {
                return {
                    success: false,
                    error: tasksResult.error || 'Failed to get tasks for goal',
                    timestamp: new Date(),
                    operation: 'calculateGoalProgress'
                };
            }

            const tasks = tasksResult.data;
            if (tasks.length === 0) {
                return {
                    success: true,
                    data: 0,
                    timestamp: new Date(),
                    operation: 'calculateGoalProgress'
                };
            }

            const completedTasks = tasks.filter(t => t.status === TaskStatus.DONE).length;
            const progress = (completedTasks / tasks.length) * 100;

            return {
                success: true,
                data: Math.round(progress * 100) / 100, // Round to 2 decimal places
                timestamp: new Date(),
                operation: 'calculateGoalProgress'
            };

        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                timestamp: new Date(),
                operation: 'calculateGoalProgress'
            };
        }
    }

    // ===========================================
    // Bulk Operations
    // ===========================================

    /**
     * Perform bulk operations on multiple tasks
     */
    async bulkUpdateTasks(operation: BulkTaskOperation): Promise<TaskOperationResult<Task[]>> {
        if (this.isDisposed) {
            return {
                success: false,
                error: 'TaskManager has been disposed',
                timestamp: new Date(),
                operation: 'bulkUpdateTasks'
            };
        }

        try {
            const results: Task[] = [];
            const errors: string[] = [];

            for (const taskId of operation.taskIds) {
                try {
                    let result: TaskOperationResult<Task | void>;

                    switch (operation.operation) {
                        case 'updateStatus':
                            if (!operation.params?.status) {
                                errors.push(`Task ${taskId}: Status parameter required`);
                                continue;
                            }
                            result = await this.updateTaskStatus(taskId, operation.params.status);
                            break;

                        case 'delete':
                            result = await this.deleteTask(taskId);
                            break;

                        case 'moveToGoal':
                            if (!operation.params?.targetGoalId) {
                                errors.push(`Task ${taskId}: Target goal ID required`);
                                continue;
                            }
                            // Move task to different goal (requires delete + recreate)
                            const taskResult = await this.getTask(taskId);
                            if (taskResult.success && taskResult.data) {
                                const task = taskResult.data;
                                await this.deleteTask(taskId);
                                const newTaskResult = await this.createTask(operation.params.targetGoalId, {
                                    title: task.title,
                                    description: task.description,
                                    goalId: operation.params.targetGoalId
                                });
                                result = newTaskResult;
                            } else {
                                errors.push(`Task ${taskId}: Task not found`);
                                continue;
                            }
                            break;

                        default:
                            errors.push(`Task ${taskId}: Unknown operation ${operation.operation}`);
                            continue;
                    }

                    if (result.success && result.data) {
                        results.push(result.data as Task);
                    } else {
                        errors.push(`Task ${taskId}: ${result.error || 'Operation failed'}`);
                    }

                } catch (error) {
                    errors.push(`Task ${taskId}: ${error instanceof Error ? error.message : String(error)}`);
                }
            }

            return {
                success: errors.length === 0,
                data: results,
                error: errors.length > 0 ? errors.join('; ') : undefined,
                timestamp: new Date(),
                operation: 'bulkUpdateTasks'
            };

        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                timestamp: new Date(),
                operation: 'bulkUpdateTasks'
            };
        }
    }

    // ===========================================
    // Private Helper Methods
    // ===========================================

    private generateTaskId(): string {
        return `task_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    }

    private async moveTask(taskId: string, direction: 'up' | 'down'): Promise<TaskOperationResult<Task[]>> {
        try {
            await this.refreshCacheIfNeeded();

            const task = this.taskCache.get(taskId);
            if (!task) {
                return {
                    success: false,
                    error: `Task with id ${taskId} not found`,
                    timestamp: new Date(),
                    operation: `moveTask${direction === 'up' ? 'Up' : 'Down'}`
                };
            }

            const goalResult = await this.storageService.getGoal(task.goalId);
            if (!goalResult.success || !goalResult.data) {
                return {
                    success: false,
                    error: `Goal with id ${task.goalId} not found`,
                    timestamp: new Date(),
                    operation: `moveTask${direction === 'up' ? 'Up' : 'Down'}`
                };
            }

            const goal = goalResult.data;
            const tasks = TaskUtils.sortByOrder(goal.tasks);
            const taskIndex = tasks.findIndex(t => t.id === taskId);

            if (taskIndex === -1) {
                return {
                    success: false,
                    error: `Task ${taskId} not found in goal tasks`,
                    timestamp: new Date(),
                    operation: `moveTask${direction === 'up' ? 'Up' : 'Down'}`
                };
            }

            // Check if move is possible
            const newIndex = direction === 'up' ? taskIndex - 1 : taskIndex + 1;
            if (newIndex < 0 || newIndex >= tasks.length) {
                return {
                    success: false,
                    error: `Cannot move task ${direction} - already at ${direction === 'up' ? 'top' : 'bottom'}`,
                    timestamp: new Date(),
                    operation: `moveTask${direction === 'up' ? 'Up' : 'Down'}`
                };
            }

            // Swap positions
            const updatedTasks = [...tasks];
            [updatedTasks[taskIndex], updatedTasks[newIndex]] = [updatedTasks[newIndex], updatedTasks[taskIndex]];

            // Reassign order values
            updatedTasks.forEach((t, index) => {
                t.order = index;
            });

            const updatedGoal: Goal = {
                ...goal,
                tasks: updatedTasks,
                updatedAt: new Date()
            };

            const saveResult = await this.storageService.saveGoal(updatedGoal);
            if (!saveResult.success) {
                return {
                    success: false,
                    error: saveResult.error || 'Failed to save reordered tasks',
                    timestamp: new Date(),
                    operation: `moveTask${direction === 'up' ? 'Up' : 'Down'}`
                };
            }

            // Update cache
            this.updateCacheWithGoal(updatedGoal);

            return {
                success: true,
                data: updatedTasks,
                timestamp: new Date(),
                operation: `moveTask${direction === 'up' ? 'Up' : 'Down'}`
            };

        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                timestamp: new Date(),
                operation: `moveTask${direction === 'up' ? 'Up' : 'Down'}`
            };
        }
    }

    private async refreshCacheIfNeeded(): Promise<void> {
        if (!this.cacheStale) return;

        const goalsResult = await this.storageService.getGoals();
        if (goalsResult.success && goalsResult.data) {
            this.taskCache.clear();
            this.goalTaskCache.clear();

            for (const goal of goalsResult.data) {
                this.updateCacheWithGoal(goal);
            }

            this.cacheStale = false;
        }
    }

    private updateCacheWithGoal(goal: Goal): void {
        const taskIds: string[] = [];
        
        for (const task of goal.tasks) {
            this.taskCache.set(task.id, task);
            taskIds.push(task.id);
        }
        
        this.goalTaskCache.set(goal.id, taskIds);
    }

    // ===========================================
    // Event Emission Methods
    // ===========================================

    private async emitTaskAddedEvent(goalId: string, task: Task, goal: Goal): Promise<void> {
        const event: TaskAddedEvent = {
            id: GoalEventUtils.generateEventId(),
            type: GoalEventType.TASK_ADDED,
            timestamp: new Date(),
            source: 'user',
            data: {
                goalId,
                task,
                goal
            }
        };
        await this.eventEmitter.emit(event);
    }

    private async emitTaskUpdatedEvent(goalId: string, task: Task, previousState: Task, goal: Goal): Promise<void> {
        const changes = this.getChangedFields(previousState, task);
        const event: TaskUpdatedEvent = {
            id: GoalEventUtils.generateEventId(),
            type: GoalEventType.TASK_UPDATED,
            timestamp: new Date(),
            source: 'user',
            data: {
                goalId,
                task,
                previousState,
                changes,
                goal
            }
        };
        await this.eventEmitter.emit(event);
    }

    private async emitTaskDeletedEvent(goalId: string, taskId: string, task: Task, goal: Goal): Promise<void> {
        const event: TaskDeletedEvent = {
            id: GoalEventUtils.generateEventId(),
            type: GoalEventType.TASK_DELETED,
            timestamp: new Date(),
            source: 'user',
            data: {
                goalId,
                taskId,
                task,
                goal
            }
        };
        await this.eventEmitter.emit(event);
    }

    private async emitTaskStatusChangedEvent(
        goalId: string, 
        taskId: string, 
        previousStatus: TaskStatusType, 
        newStatus: TaskStatusType, 
        task: Task, 
        goal: Goal
    ): Promise<void> {
        const event: TaskStatusChangedEvent = {
            id: GoalEventUtils.generateEventId(),
            type: GoalEventType.TASK_STATUS_CHANGED,
            timestamp: new Date(),
            source: 'user',
            data: {
                goalId,
                taskId,
                previousStatus,
                newStatus,
                task,
                goal
            }
        };
        await this.eventEmitter.emit(event);
    }

    private getChangedFields(before: any, after: any): string[] {
        const changes: string[] = [];
        for (const key in after) {
            if (before[key] !== after[key]) {
                changes.push(key);
            }
        }
        return changes;
    }

    /**
     * Dispose of resources
     */
    dispose(): void {
        if (this.isDisposed) return;

        this.taskCache.clear();
        this.goalTaskCache.clear();
        this.eventEmitter.dispose();
        this.isDisposed = true;
    }

    /**
     * Get direct access to the StorageService for advanced operations
     */
    getStorageService(): StorageService {
        return this.storageService;
    }
}

/**
 * Factory function to create a TaskManager instance
 */
export function createTaskManager(storageService: StorageService, validationService?: ValidationService): TaskManager {
    return new TaskManager(storageService, validationService);
}