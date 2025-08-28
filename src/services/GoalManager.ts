/**
 * GoalManager Service - Issue #4 Stream A Implementation
 * 
 * Core GoalManager class with full CRUD operations, status transitions, 
 * parent-child relationships, and StorageService integration.
 * 
 * This service provides comprehensive goal management operations including:
 * - CRUD operations with StorageService persistence
 * - Status transitions with proper validation
 * - Parent-child relationship management
 * - Event emission for tree view updates
 * - Circular dependency prevention
 * - Proper error handling and recovery
 */

import * as vscode from 'vscode';
import {
    Goal,
    CreateGoalParams,
    UpdateGoalParams,
    Task,
    CreateTaskParams,
    UpdateTaskParams,
    GoalStatus,
    GoalStatusType,
    GoalStatusUtils,
    TaskStatus,
    TaskStatusType,
    GoalEvent,
    GoalEventType,
    GoalCreatedEvent,
    GoalUpdatedEvent,
    GoalDeletedEvent,
    GoalStatusChangedEvent,
    GoalMovedEvent,
    TaskAddedEvent,
    TaskUpdatedEvent,
    TaskDeletedEvent,
    TaskStatusChangedEvent,
    GoalEventUtils,
    BulkOperationResult,
    GoalHierarchy,
    GoalUtils
} from '../types';
import { StorageService } from './storageService';
import { ValidationService } from './ValidationService';
import { 
    ProgressCalculationUtils, 
    ProgressResult, 
    HierarchicalProgressResult,
    ProgressCalculationStrategy,
    ProgressDelta,
    ProgressCalculationHelpers
} from '../utils/progressCalculation';

/**
 * Goal operation result interface
 */
export interface GoalOperationResult<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    timestamp: Date;
    operation: string;
}

/**
 * GoalManager event emitter for tree view updates
 */
export class GoalManagerEventEmitter {
    private readonly eventEmitter = new vscode.EventEmitter<GoalEvent>();
    
    /**
     * Event fired when goals change (for tree view updates)
     */
    readonly onGoalEvent = this.eventEmitter.event;
    
    /**
     * Emit a goal event
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
 * Core GoalManager class with StorageService integration and progress calculation
 */
export class GoalManager {
    private readonly storageService: StorageService;
    private readonly validationService: ValidationService;
    private readonly eventEmitter: GoalManagerEventEmitter;
    private readonly progressCalculator: ProgressCalculationUtils;
    private isDisposed = false;
    private goalCache: Map<string, Goal> = new Map();
    private progressCache: Map<string, ProgressResult> = new Map();
    private cacheStale = true;

    constructor(
        storageService: StorageService,
        validationService?: ValidationService
    ) {
        this.storageService = storageService;
        this.validationService = validationService || new ValidationService();
        this.eventEmitter = new GoalManagerEventEmitter();
        this.progressCalculator = new ProgressCalculationUtils({
            enableCaching: true,
            cacheTtl: 60000, // 1 minute cache
            performance: {
                enableBatchProcessing: true,
                batchSize: 50,
                enableParallelProcessing: true,
                maxConcurrentCalculations: 5
            }
        });
        
        // Listen for storage changes to invalidate caches
        this.storageService.onDataChange(() => {
            this.cacheStale = true;
            this.progressCache.clear();
        });
    }

    /**
     * Event fired when goals change (for tree view updates)
     */
    get onGoalEvent() {
        return this.eventEmitter.onGoalEvent;
    }

    // ===========================================
    // Public CRUD Operations
    // ===========================================

    /**
     * Create a new goal with validation and persistence
     */
    async createGoal(params: CreateGoalParams): Promise<GoalOperationResult<Goal>> {
        if (this.isDisposed) {
            return {
                success: false,
                error: 'GoalManager has been disposed',
                timestamp: new Date(),
                operation: 'createGoal'
            };
        }

        try {
            // Validate goal creation
            const validation = this.validationService.validateGoalCreation(params);
            if (!validation.isValid) {
                return {
                    success: false,
                    error: `Goal creation validation failed: ${validation.errors.join(', ')}`,
                    timestamp: new Date(),
                    operation: 'createGoal'
                };
            }

            // Validate parent exists if specified
            if (params.parentId) {
                const parent = await this.getGoal(params.parentId);
                if (!parent.success || !parent.data) {
                    return {
                        success: false,
                        error: `Parent goal with id ${params.parentId} not found`,
                        timestamp: new Date(),
                        operation: 'createGoal'
                    };
                }
            }

            // Create the goal using GoalUtils
            const goalTemplate = GoalUtils.createGoal(params);
            const goal: Goal = {
                ...goalTemplate,
                id: this.generateId()
            };

            // Persist to storage
            const saveResult = await this.storageService.saveGoal(goal);
            if (!saveResult.success) {
                return {
                    success: false,
                    error: saveResult.error || 'Failed to save goal',
                    timestamp: new Date(),
                    operation: 'createGoal'
                };
            }

            // Update cache
            this.goalCache.set(goal.id, goal);

            // Emit creation event
            await this.emitGoalCreatedEvent(goal);

            return {
                success: true,
                data: goal,
                timestamp: new Date(),
                operation: 'createGoal'
            };

        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                timestamp: new Date(),
                operation: 'createGoal'
            };
        }
    }

    /**
     * Get a goal by ID
     */
    async getGoal(goalId: string): Promise<GoalOperationResult<Goal | undefined>> {
        if (this.isDisposed) {
            return {
                success: false,
                error: 'GoalManager has been disposed',
                timestamp: new Date(),
                operation: 'getGoal'
            };
        }

        try {
            // Check cache first if not stale
            if (!this.cacheStale && this.goalCache.has(goalId)) {
                return {
                    success: true,
                    data: this.goalCache.get(goalId),
                    timestamp: new Date(),
                    operation: 'getGoal'
                };
            }

            // Fetch from storage
            const result = await this.storageService.getGoal(goalId);
            if (!result.success) {
                return {
                    success: false,
                    error: result.error || 'Failed to fetch goal',
                    timestamp: new Date(),
                    operation: 'getGoal'
                };
            }

            // Update cache
            if (result.data) {
                this.goalCache.set(goalId, result.data);
            }

            return {
                success: true,
                data: result.data,
                timestamp: new Date(),
                operation: 'getGoal'
            };

        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                timestamp: new Date(),
                operation: 'getGoal'
            };
        }
    }

    /**
     * Update an existing goal with validation and persistence
     */
    async updateGoal(goalId: string, updates: UpdateGoalParams): Promise<GoalOperationResult<Goal>> {
        if (this.isDisposed) {
            return {
                success: false,
                error: 'GoalManager has been disposed',
                timestamp: new Date(),
                operation: 'updateGoal'
            };
        }

        try {
            // Get existing goal
            const existingResult = await this.getGoal(goalId);
            if (!existingResult.success || !existingResult.data) {
                return {
                    success: false,
                    error: `Goal with id ${goalId} not found`,
                    timestamp: new Date(),
                    operation: 'updateGoal'
                };
            }

            const existingGoal = existingResult.data;
            const previousState = { ...existingGoal };

            // Validate goal update
            const validation = this.validationService.validateGoalUpdate(existingGoal, updates);
            if (!validation.isValid) {
                return {
                    success: false,
                    error: `Goal update validation failed: ${validation.errors.join(', ')}`,
                    timestamp: new Date(),
                    operation: 'updateGoal'
                };
            }

            // Validate status transition if status is being changed
            if (updates.status && updates.status !== existingGoal.status) {
                const statusValidation = this.validationService.validateStatusTransition(
                    existingGoal.status,
                    updates.status
                );
                if (!statusValidation.isValid) {
                    return {
                        success: false,
                        error: `Invalid status transition: ${statusValidation.errors.join(', ')}`,
                        timestamp: new Date(),
                        operation: 'updateGoal'
                    };
                }

                // Check for blocking dependencies when transitioning to in-progress
                if (updates.status === GoalStatus.IN_PROGRESS) {
                    const blockers = await this.getBlockingGoals(goalId);
                    if (blockers.success && blockers.data && blockers.data.length > 0) {
                        const blockerTitles = blockers.data.map(g => g.title).join(', ');
                        return {
                            success: false,
                            error: `Cannot start goal - blocked by: ${blockerTitles}`,
                            timestamp: new Date(),
                            operation: 'updateGoal'
                        };
                    }
                }
            }

            // Validate parent change (prevent circular dependencies)
            if (updates.parentId !== undefined && updates.parentId !== existingGoal.parentId) {
                if (updates.parentId && await this.wouldCreateCircularDependency(goalId, updates.parentId)) {
                    return {
                        success: false,
                        error: 'Cannot set parent - would create circular dependency',
                        timestamp: new Date(),
                        operation: 'updateGoal'
                    };
                }
            }

            // Create updated goal
            const updatedGoal: Goal = {
                ...existingGoal,
                ...updates,
                updatedAt: new Date()
            };

            // Handle completion status
            if (updates.status === GoalStatus.COMPLETED && existingGoal.status !== GoalStatus.COMPLETED) {
                updatedGoal.completedAt = new Date();
                // Auto-unblock dependent goals
                await this.handleGoalCompletion(goalId);
            }

            // Persist to storage
            const saveResult = await this.storageService.saveGoal(updatedGoal);
            if (!saveResult.success) {
                return {
                    success: false,
                    error: saveResult.error || 'Failed to save updated goal',
                    timestamp: new Date(),
                    operation: 'updateGoal'
                };
            }

            // Update cache
            this.goalCache.set(goalId, updatedGoal);

            // Emit update events
            await this.emitGoalUpdatedEvent(updatedGoal, previousState, updates);
            
            if (updates.status && updates.status !== existingGoal.status) {
                await this.emitGoalStatusChangedEvent(goalId, existingGoal.status, updates.status, updatedGoal);
            }
            
            if (updates.parentId !== undefined && updates.parentId !== existingGoal.parentId) {
                await this.emitGoalMovedEvent(goalId, existingGoal.parentId, updates.parentId, updatedGoal);
            }

            return {
                success: true,
                data: updatedGoal,
                timestamp: new Date(),
                operation: 'updateGoal'
            };

        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                timestamp: new Date(),
                operation: 'updateGoal'
            };
        }
    }

    /**
     * Delete a goal with validation and cascade handling
     */
    async deleteGoal(goalId: string): Promise<GoalOperationResult<void>> {
        if (this.isDisposed) {
            return {
                success: false,
                error: 'GoalManager has been disposed',
                timestamp: new Date(),
                operation: 'deleteGoal'
            };
        }

        try {
            // Get goal to delete
            const goalResult = await this.getGoal(goalId);
            if (!goalResult.success || !goalResult.data) {
                return {
                    success: false,
                    error: `Goal with id ${goalId} not found`,
                    timestamp: new Date(),
                    operation: 'deleteGoal'
                };
            }

            const goal = goalResult.data;
            
            // Get all goals for validation
            const allGoalsResult = await this.getAllGoals();
            if (!allGoalsResult.success) {
                return {
                    success: false,
                    error: 'Failed to fetch goals for validation',
                    timestamp: new Date(),
                    operation: 'deleteGoal'
                };
            }

            const allGoals = allGoalsResult.data || [];

            // Validate goal deletion
            const validation = this.validationService.validateGoalDeletion(goal, allGoals);
            if (!validation.isValid) {
                return {
                    success: false,
                    error: `Goal deletion validation failed: ${validation.errors.join(', ')}`,
                    timestamp: new Date(),
                    operation: 'deleteGoal'
                };
            }

            // Delete child goals recursively
            const childGoals = await this.getChildGoals(goalId);
            if (childGoals.success && childGoals.data) {
                for (const child of childGoals.data) {
                    const childDeleteResult = await this.deleteGoal(child.id);
                    if (!childDeleteResult.success) {
                        return {
                            success: false,
                            error: `Failed to delete child goal: ${childDeleteResult.error}`,
                            timestamp: new Date(),
                            operation: 'deleteGoal'
                        };
                    }
                }
            }

            // Remove from blocked dependencies of other goals
            await this.removeFromBlockedDependencies(goalId);

            // Delete from storage
            const deleteResult = await this.storageService.deleteGoal(goalId);
            if (!deleteResult.success) {
                return {
                    success: false,
                    error: deleteResult.error || 'Failed to delete goal from storage',
                    timestamp: new Date(),
                    operation: 'deleteGoal'
                };
            }

            // Remove from cache
            this.goalCache.delete(goalId);

            // Emit deletion event
            await this.emitGoalDeletedEvent(goalId, goal);

            return {
                success: true,
                timestamp: new Date(),
                operation: 'deleteGoal'
            };

        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                timestamp: new Date(),
                operation: 'deleteGoal'
            };
        }
    }

    /**
     * Get all goals
     */
    async getAllGoals(): Promise<GoalOperationResult<Goal[]>> {
        if (this.isDisposed) {
            return {
                success: false,
                error: 'GoalManager has been disposed',
                timestamp: new Date(),
                operation: 'getAllGoals'
            };
        }

        try {
            const result = await this.storageService.getGoals();
            if (!result.success) {
                return {
                    success: false,
                    error: result.error || 'Failed to fetch goals',
                    timestamp: new Date(),
                    operation: 'getAllGoals'
                };
            }

            // Update cache
            this.goalCache.clear();
            for (const goal of result.data || []) {
                this.goalCache.set(goal.id, goal);
            }
            this.cacheStale = false;

            return {
                success: true,
                data: result.data || [],
                timestamp: new Date(),
                operation: 'getAllGoals'
            };

        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                timestamp: new Date(),
                operation: 'getAllGoals'
            };
        }
    }

    // ===========================================
    // Hierarchy Management
    // ===========================================

    /**
     * Get root goals (goals without parents)
     */
    async getRootGoals(): Promise<GoalOperationResult<Goal[]>> {
        const allGoalsResult = await this.getAllGoals();
        if (!allGoalsResult.success) {
            return allGoalsResult;
        }

        const rootGoals = (allGoalsResult.data || []).filter(goal => !goal.parentId);
        return {
            success: true,
            data: rootGoals,
            timestamp: new Date(),
            operation: 'getRootGoals'
        };
    }

    /**
     * Get child goals of a specific goal
     */
    async getChildGoals(parentId: string): Promise<GoalOperationResult<Goal[]>> {
        const allGoalsResult = await this.getAllGoals();
        if (!allGoalsResult.success) {
            return allGoalsResult;
        }

        const childGoals = (allGoalsResult.data || []).filter(goal => goal.parentId === parentId);
        return {
            success: true,
            data: childGoals,
            timestamp: new Date(),
            operation: 'getChildGoals'
        };
    }

    // ===========================================
    // Dependency Management
    // ===========================================

    /**
     * Get goals blocked by a specific goal
     */
    async getBlockedGoals(goalId: string): Promise<GoalOperationResult<Goal[]>> {
        const allGoalsResult = await this.getAllGoals();
        if (!allGoalsResult.success) {
            return allGoalsResult;
        }

        const blockedGoals = (allGoalsResult.data || []).filter(goal => 
            goal.blockedByIds.includes(goalId)
        );

        return {
            success: true,
            data: blockedGoals,
            timestamp: new Date(),
            operation: 'getBlockedGoals'
        };
    }

    /**
     * Get goals blocking a specific goal
     */
    async getBlockingGoals(goalId: string): Promise<GoalOperationResult<Goal[]>> {
        const goalResult = await this.getGoal(goalId);
        if (!goalResult.success || !goalResult.data) {
            return {
                success: goalResult.success,
                error: goalResult.error,
                timestamp: new Date(),
                operation: 'getBlockingGoals'
            };
        }

        const allGoalsResult = await this.getAllGoals();
        if (!allGoalsResult.success) {
            return allGoalsResult;
        }

        const allGoals = allGoalsResult.data || [];
        const blockingGoals = goalResult.data.blockedByIds
            .map(id => allGoals.find(g => g.id === id))
            .filter((g): g is Goal => g !== undefined);

        return {
            success: true,
            data: blockingGoals,
            timestamp: new Date(),
            operation: 'getBlockingGoals'
        };
    }

    /**
     * Add a blocking dependency
     */
    async addBlockingDependency(blockedGoalId: string, blockingGoalId: string): Promise<GoalOperationResult<Goal>> {
        try {
            // Check if dependency would create circular reference
            if (await this.wouldCreateCircularDependency(blockingGoalId, blockedGoalId)) {
                return {
                    success: false,
                    error: 'Cannot add dependency - would create circular dependency',
                    timestamp: new Date(),
                    operation: 'addBlockingDependency'
                };
            }

            const goalResult = await this.getGoal(blockedGoalId);
            if (!goalResult.success || !goalResult.data) {
                return {
                    success: goalResult.success,
                    error: goalResult.error || 'Goal not found',
                    timestamp: new Date(),
                    operation: 'addBlockingDependency'
                };
            }

            const goal = goalResult.data;
            if (!goal.blockedByIds.includes(blockingGoalId)) {
                const updatedBlockedByIds = [...goal.blockedByIds, blockingGoalId];
                return await this.updateGoal(blockedGoalId, { blockedByIds: updatedBlockedByIds });
            }

            return {
                success: true,
                data: goalResult.data,
                timestamp: new Date(),
                operation: 'addBlockingDependency'
            }; // Already blocked by this goal

        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                timestamp: new Date(),
                operation: 'addBlockingDependency'
            };
        }
    }

    /**
     * Remove a blocking dependency
     */
    async removeBlockingDependency(blockedGoalId: string, blockingGoalId: string): Promise<GoalOperationResult<Goal>> {
        const goalResult = await this.getGoal(blockedGoalId);
        if (!goalResult.success || !goalResult.data) {
            return {
                success: goalResult.success,
                error: goalResult.error || 'Goal not found',
                timestamp: new Date(),
                operation: 'removeBlockingDependency'
            };
        }

        const goal = goalResult.data;
        const updatedBlockedByIds = goal.blockedByIds.filter(id => id !== blockingGoalId);
        
        if (updatedBlockedByIds.length !== goal.blockedByIds.length) {
            return await this.updateGoal(blockedGoalId, { blockedByIds: updatedBlockedByIds });
        }

        return {
            success: true,
            data: goalResult.data,
            timestamp: new Date(),
            operation: 'removeBlockingDependency'
        }; // Not blocked by this goal
    }

    // ===========================================
    // Task Operations
    // ===========================================

    /**
     * Add a task to a goal
     */
    async addTask(goalId: string, params: CreateTaskParams): Promise<GoalOperationResult<Task>> {
        try {
            const goalResult = await this.getGoal(goalId);
            if (!goalResult.success || !goalResult.data) {
                return {
                    success: false,
                    error: `Goal with id ${goalId} not found`,
                    timestamp: new Date(),
                    operation: 'addTask'
                };
            }

            // Validate task creation
            const validation = this.validationService.validateTaskCreation(params);
            if (!validation.isValid) {
                return {
                    success: false,
                    error: `Task creation validation failed: ${validation.errors.join(', ')}`,
                    timestamp: new Date(),
                    operation: 'addTask'
                };
            }

            const goal = goalResult.data;
            const task: Task = {
                id: this.generateId(),
                title: params.title,
                description: params.description,
                goalId: goalId,
                status: TaskStatus.TODO,
                order: goal.tasks.length,
                createdAt: new Date()
            };

            const updatedGoal: Goal = {
                ...goal,
                tasks: [...goal.tasks, task],
                updatedAt: new Date()
            };

            // Persist to storage
            const saveResult = await this.storageService.saveGoal(updatedGoal);
            if (!saveResult.success) {
                return {
                    success: false,
                    error: saveResult.error || 'Failed to save goal with new task',
                    timestamp: new Date(),
                    operation: 'addTask'
                };
            }

            // Update cache
            this.goalCache.set(goalId, updatedGoal);

            // Emit task added event
            await this.emitTaskAddedEvent(goalId, task, updatedGoal);

            // Trigger progress calculation and parent goal updates
            await this.handleTaskStatusChange(goalId, updatedGoal, TaskStatus.DONE, TaskStatus.TODO);

            return {
                success: true,
                data: task,
                timestamp: new Date(),
                operation: 'addTask'
            };

        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                timestamp: new Date(),
                operation: 'addTask'
            };
        }
    }

    /**
     * Update a task in a goal
     */
    async updateTask(goalId: string, taskId: string, updates: UpdateTaskParams): Promise<GoalOperationResult<Task>> {
        try {
            const goalResult = await this.getGoal(goalId);
            if (!goalResult.success || !goalResult.data) {
                return {
                    success: false,
                    error: `Goal with id ${goalId} not found`,
                    timestamp: new Date(),
                    operation: 'updateTask'
                };
            }

            const goal = goalResult.data;
            const taskIndex = goal.tasks.findIndex(t => t.id === taskId);
            if (taskIndex === -1) {
                return {
                    success: false,
                    error: `Task with id ${taskId} not found in goal ${goalId}`,
                    timestamp: new Date(),
                    operation: 'updateTask'
                };
            }

            const existingTask = goal.tasks[taskIndex];
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

            const updatedTask: Task = {
                ...existingTask,
                ...updates
            };

            // Handle completion
            if (updates.status === TaskStatus.DONE && existingTask.status !== TaskStatus.DONE) {
                updatedTask.completedAt = new Date();
            }

            const updatedTasks = [...goal.tasks];
            updatedTasks[taskIndex] = updatedTask;

            const updatedGoal: Goal = {
                ...goal,
                tasks: updatedTasks,
                updatedAt: new Date()
            };

            // Persist to storage
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
            this.goalCache.set(goalId, updatedGoal);

            // Emit task updated event
            await this.emitTaskUpdatedEvent(goalId, updatedTask, previousState, updatedGoal);

            // Emit status change event if status changed
            if (updates.status && updates.status !== existingTask.status) {
                await this.emitTaskStatusChangedEvent(goalId, taskId, existingTask.status, updates.status, updatedTask, updatedGoal);
                
                // Trigger progress calculation and parent goal updates
                await this.handleTaskStatusChange(goalId, updatedGoal, existingTask.status, updates.status);
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
     * Delete a task from a goal
     */
    async deleteTask(goalId: string, taskId: string): Promise<GoalOperationResult<void>> {
        try {
            const goalResult = await this.getGoal(goalId);
            if (!goalResult.success || !goalResult.data) {
                return {
                    success: false,
                    error: `Goal with id ${goalId} not found`,
                    timestamp: new Date(),
                    operation: 'deleteTask'
                };
            }

            const goal = goalResult.data;
            const taskIndex = goal.tasks.findIndex(t => t.id === taskId);
            if (taskIndex === -1) {
                return {
                    success: false,
                    error: `Task with id ${taskId} not found in goal ${goalId}`,
                    timestamp: new Date(),
                    operation: 'deleteTask'
                };
            }

            const task = goal.tasks[taskIndex];
            const updatedTasks = goal.tasks.filter(t => t.id !== taskId);

            // Reorder remaining tasks
            updatedTasks.forEach((t, index) => {
                t.order = index;
            });

            const updatedGoal: Goal = {
                ...goal,
                tasks: updatedTasks,
                updatedAt: new Date()
            };

            // Persist to storage
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
            this.goalCache.set(goalId, updatedGoal);

            // Emit task deleted event
            await this.emitTaskDeletedEvent(goalId, taskId, task, updatedGoal);

            // Trigger progress calculation and parent goal updates (task was removed)
            await this.handleTaskStatusChange(goalId, updatedGoal, task.status, TaskStatus.TODO);

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
    // Private Helper Methods
    // ===========================================

    private generateId(): string {
        return `goal_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    }

    private async handleGoalCompletion(goalId: string): Promise<void> {
        // Find goals that were blocked by this goal and auto-unblock them
        const unblockedGoalsResult = await this.getBlockedGoals(goalId);
        
        if (unblockedGoalsResult.success && unblockedGoalsResult.data) {
            for (const goal of unblockedGoalsResult.data) {
                await this.removeBlockingDependency(goal.id, goalId);
                
                // Check if goal can now be started
                const remainingBlockersResult = await this.getBlockingGoals(goal.id);
                if (remainingBlockersResult.success && remainingBlockersResult.data) {
                    const remainingBlockers = remainingBlockersResult.data;
                    if (remainingBlockers.length === 0 && goal.status === GoalStatus.BLOCKED) {
                        await this.updateGoal(goal.id, { status: GoalStatus.PLANNED });
                    }
                }
            }
        }
    }

    private async wouldCreateCircularDependency(goalId: string, potentialParentId: string): Promise<boolean> {
        const visited = new Set<string>();
        
        const checkCircular = async (currentId: string): Promise<boolean> => {
            if (visited.has(currentId)) return false;
            if (currentId === goalId) return true;
            
            visited.add(currentId);
            const goalResult = await this.getGoal(currentId);
            if (!goalResult.success || !goalResult.data || !goalResult.data.parentId) {
                return false;
            }
            
            return await checkCircular(goalResult.data.parentId);
        };
        
        return await checkCircular(potentialParentId);
    }

    private async removeFromBlockedDependencies(goalId: string): Promise<void> {
        const allGoalsResult = await this.getAllGoals();
        if (!allGoalsResult.success || !allGoalsResult.data) return;

        for (const goal of allGoalsResult.data) {
            const index = goal.blockedByIds.indexOf(goalId);
            if (index > -1) {
                const updatedBlockedByIds = goal.blockedByIds.filter(id => id !== goalId);
                await this.updateGoal(goal.id, { blockedByIds: updatedBlockedByIds });
            }
        }
    }

    // ===========================================
    // Event Emission Methods
    // ===========================================

    private async emitGoalCreatedEvent(goal: Goal): Promise<void> {
        const event: GoalCreatedEvent = {
            id: GoalEventUtils.generateEventId(),
            type: GoalEventType.GOAL_CREATED,
            timestamp: new Date(),
            source: 'user',
            data: { goal }
        };
        await this.eventEmitter.emit(event);
    }

    private async emitGoalUpdatedEvent(goal: Goal, previousState: Goal, updates: UpdateGoalParams): Promise<void> {
        const changes = Object.keys(updates);
        const event: GoalUpdatedEvent = {
            id: GoalEventUtils.generateEventId(),
            type: GoalEventType.GOAL_UPDATED,
            timestamp: new Date(),
            source: 'user',
            data: {
                goal,
                previousState,
                changes
            }
        };
        await this.eventEmitter.emit(event);
    }

    private async emitGoalDeletedEvent(goalId: string, goal: Goal): Promise<void> {
        const event: GoalDeletedEvent = {
            id: GoalEventUtils.generateEventId(),
            type: GoalEventType.GOAL_DELETED,
            timestamp: new Date(),
            source: 'user',
            data: {
                goalId,
                goal
            }
        };
        await this.eventEmitter.emit(event);
    }

    private async emitGoalStatusChangedEvent(goalId: string, previousStatus: GoalStatusType, newStatus: GoalStatusType, goal: Goal): Promise<void> {
        const event: GoalStatusChangedEvent = {
            id: GoalEventUtils.generateEventId(),
            type: GoalEventType.GOAL_STATUS_CHANGED,
            timestamp: new Date(),
            source: 'user',
            data: {
                goalId,
                previousStatus,
                newStatus,
                goal
            }
        };
        await this.eventEmitter.emit(event);
    }

    private async emitGoalMovedEvent(goalId: string, previousParentId: string | undefined, newParentId: string | undefined, goal: Goal): Promise<void> {
        const event: GoalMovedEvent = {
            id: GoalEventUtils.generateEventId(),
            type: GoalEventType.GOAL_MOVED,
            timestamp: new Date(),
            source: 'user',
            data: {
                goalId,
                previousParentId,
                newParentId,
                goal
            }
        };
        await this.eventEmitter.emit(event);
    }

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

    private async emitTaskStatusChangedEvent(goalId: string, taskId: string, previousStatus: TaskStatusType, newStatus: TaskStatusType, task: Task, goal: Goal): Promise<void> {
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

    // ===========================================
    // Progress Calculation & Goal Integration
    // ===========================================

    /**
     * Calculate progress for a specific goal
     */
    async calculateGoalProgress(
        goalId: string, 
        strategy: ProgressCalculationStrategy = ProgressCalculationStrategy.TASK_COMPLETION
    ): Promise<GoalOperationResult<ProgressResult>> {
        if (this.isDisposed) {
            return {
                success: false,
                error: 'GoalManager has been disposed',
                timestamp: new Date(),
                operation: 'calculateGoalProgress'
            };
        }

        try {
            const goalResult = await this.getGoal(goalId);
            if (!goalResult.success || !goalResult.data) {
                return {
                    success: false,
                    error: `Goal with id ${goalId} not found`,
                    timestamp: new Date(),
                    operation: 'calculateGoalProgress'
                };
            }

            const progress = await this.progressCalculator.calculateTaskProgress(goalResult.data, strategy);

            return {
                success: true,
                data: progress,
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

    /**
     * Calculate hierarchical progress for a goal and its children
     */
    async calculateHierarchicalProgress(goalId: string): Promise<GoalOperationResult<HierarchicalProgressResult>> {
        if (this.isDisposed) {
            return {
                success: false,
                error: 'GoalManager has been disposed',
                timestamp: new Date(),
                operation: 'calculateHierarchicalProgress'
            };
        }

        try {
            const goalResult = await this.getGoal(goalId);
            if (!goalResult.success || !goalResult.data) {
                return {
                    success: false,
                    error: `Goal with id ${goalId} not found`,
                    timestamp: new Date(),
                    operation: 'calculateHierarchicalProgress'
                };
            }

            const childGoalsResult = await this.getChildGoals(goalId);
            const childGoals = childGoalsResult.success ? childGoalsResult.data || [] : [];

            const hierarchicalProgress = await this.progressCalculator.calculateGoalProgress(
                goalResult.data, 
                childGoals
            );

            return {
                success: true,
                data: hierarchicalProgress,
                timestamp: new Date(),
                operation: 'calculateHierarchicalProgress'
            };

        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                timestamp: new Date(),
                operation: 'calculateHierarchicalProgress'
            };
        }
    }

    /**
     * Update goal status based on progress calculation
     */
    async updateGoalStatusFromProgress(goalId: string): Promise<GoalOperationResult<Goal>> {
        if (this.isDisposed) {
            return {
                success: false,
                error: 'GoalManager has been disposed',
                timestamp: new Date(),
                operation: 'updateGoalStatusFromProgress'
            };
        }

        try {
            const goalResult = await this.getGoal(goalId);
            if (!goalResult.success || !goalResult.data) {
                return {
                    success: false,
                    error: `Goal with id ${goalId} not found`,
                    timestamp: new Date(),
                    operation: 'updateGoalStatusFromProgress'
                };
            }

            const goal = goalResult.data;
            const progressResult = await this.calculateGoalProgress(goalId);
            
            if (!progressResult.success || !progressResult.data) {
                return {
                    success: false,
                    error: 'Failed to calculate goal progress',
                    timestamp: new Date(),
                    operation: 'updateGoalStatusFromProgress'
                };
            }

            const suggestedStatus = this.progressCalculator.suggestGoalStatusUpdate(goal, progressResult.data);
            
            if (suggestedStatus && suggestedStatus !== goal.status) {
                return await this.updateGoal(goalId, { status: suggestedStatus });
            }

            return {
                success: true,
                data: goal,
                timestamp: new Date(),
                operation: 'updateGoalStatusFromProgress'
            };

        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                timestamp: new Date(),
                operation: 'updateGoalStatusFromProgress'
            };
        }
    }

    /**
     * Handle task status change and trigger progress recalculation
     */
    private async handleTaskStatusChange(
        goalId: string, 
        updatedGoal: Goal, 
        previousStatus: TaskStatusType, 
        newStatus: TaskStatusType
    ): Promise<void> {
        try {
            // Calculate new progress for the goal
            const progressResult = await this.progressCalculator.calculateTaskProgress(updatedGoal);

            // Check if goal status should be updated based on progress
            const suggestedStatus = this.progressCalculator.suggestGoalStatusUpdate(updatedGoal, progressResult);
            
            if (suggestedStatus && suggestedStatus !== updatedGoal.status) {
                await this.updateGoal(goalId, { status: suggestedStatus });
            }

            // If goal is now complete, handle completion logic
            if (this.progressCalculator.shouldGoalBeComplete(updatedGoal, progressResult)) {
                await this.handleGoalCompletion(goalId);
            }

            // Propagate progress updates up the hierarchy
            await this.propagateProgressUpdates(goalId);

        } catch (error) {
            // Log error but don't fail the task update
            console.error('Failed to handle task status change:', error);
        }
    }

    /**
     * Propagate progress updates up the goal hierarchy
     */
    private async propagateProgressUpdates(goalId: string): Promise<void> {
        try {
            const goalResult = await this.getGoal(goalId);
            if (!goalResult.success || !goalResult.data) {
                return;
            }

            const goal = goalResult.data;
            if (goal.parentId) {
                // Update parent goal status based on child progress
                await this.updateGoalStatusFromProgress(goal.parentId);
                
                // Continue propagating up the hierarchy
                await this.propagateProgressUpdates(goal.parentId);
            }

        } catch (error) {
            console.error('Failed to propagate progress updates:', error);
        }
    }

    /**
     * Get progress information for multiple goals efficiently
     */
    async getGoalsProgress(goalIds: string[]): Promise<GoalOperationResult<Map<string, ProgressResult>>> {
        if (this.isDisposed) {
            return {
                success: false,
                error: 'GoalManager has been disposed',
                timestamp: new Date(),
                operation: 'getGoalsProgress'
            };
        }

        try {
            const goals: Goal[] = [];
            
            for (const goalId of goalIds) {
                const goalResult = await this.getGoal(goalId);
                if (goalResult.success && goalResult.data) {
                    goals.push(goalResult.data);
                }
            }

            const progressResults = await this.progressCalculator.calculateProgressOptimized(goals);

            return {
                success: true,
                data: progressResults,
                timestamp: new Date(),
                operation: 'getGoalsProgress'
            };

        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                timestamp: new Date(),
                operation: 'getGoalsProgress'
            };
        }
    }

    /**
     * Clear progress calculation cache
     */
    clearProgressCache(): void {
        this.progressCache.clear();
        this.progressCalculator.clearCache();
    }

    /**
     * Get progress calculation statistics
     */
    getProgressCacheStats(): { size: number; hitRate: number } {
        return this.progressCalculator.getCacheStats();
    }

    /**
     * Dispose of resources
     */
    dispose(): void {
        if (this.isDisposed) return;

        this.goalCache.clear();
        this.progressCache.clear();
        this.progressCalculator.clearCache();
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
 * Factory function to create a GoalManager instance
 */
export function createGoalManager(storageService: StorageService, validationService?: ValidationService): GoalManager {
    return new GoalManager(storageService, validationService);
}