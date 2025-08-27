/**
 * GoalManager Service - Core CRUD operations and business logic
 * 
 * This service implements all goal management operations including creation,
 * editing, deletion, status transitions, and hierarchical relationship management.
 * It provides proper validation, error handling, and event emission for tree view integration.
 */

import {
    Goal,
    CreateGoalParams,
    UpdateGoalParams,
    Task,
    CreateTaskParams,
    UpdateTaskParams,
    GoalStatus,
    TaskStatus,
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
    BulkOperationResult,
    GoalHierarchy,
    GoalEventUtils,
    GoalEventHandler
} from '../types';
import { ValidationService } from './ValidationService';

/**
 * Event listener interface for goal events
 */
interface EventListener {
    handler: GoalEventHandler;
    once: boolean;
}

/**
 * GoalManager class handles all goal CRUD operations and business logic
 */
export class GoalManager {
    private goals: Map<string, Goal> = new Map();
    private validationService: ValidationService;
    private eventListeners: Map<string, EventListener[]> = new Map();
    private logger: (message: string) => void;

    constructor(validationService?: ValidationService, logger?: (message: string) => void) {
        this.validationService = validationService || new ValidationService();
        this.logger = logger || ((message: string) => console.log(`GoalManager: ${message}`));
        this.log('GoalManager initialized');
    }

    // ===========================================
    // Goal CRUD Operations
    // ===========================================

    /**
     * Create a new goal with validation and event emission
     */
    async createGoal(params: CreateGoalParams): Promise<Goal> {
        try {
            // Validate goal creation
            const validation = this.validationService.validateGoalCreation(params);
            if (!validation.isValid) {
                throw new Error(`Goal creation validation failed: ${validation.errors.join(', ')}`);
            }

            // Validate parent exists if specified
            if (params.parentId) {
                const parent = this.goals.get(params.parentId);
                if (!parent) {
                    throw new Error(`Parent goal with id ${params.parentId} not found`);
                }
            }

            // Create the goal
            const goal: Goal = {
                id: this.generateId(),
                title: params.title,
                description: params.description,
                status: GoalStatus.PLANNED,
                parentId: params.parentId,
                blockedByIds: [],
                tasks: [],
                createdAt: new Date(),
                metadata: params.metadata
            };

            // Store the goal
            this.goals.set(goal.id, goal);

            // Emit creation event
            const event: GoalCreatedEvent = {
                id: GoalEventUtils.generateEventId(),
                type: GoalEventType.GOAL_CREATED,
                timestamp: new Date(),
                source: 'user',
                data: { goal }
            };
            await this.emitEvent(event);

            this.log(`Goal created: ${goal.title} (${goal.id})`);
            return goal;

        } catch (error) {
            this.logError('Failed to create goal', error);
            throw error;
        }
    }

    /**
     * Update an existing goal with validation and status transition logic
     */
    async updateGoal(goalId: string, updates: UpdateGoalParams): Promise<Goal> {
        try {
            const existingGoal = this.goals.get(goalId);
            if (!existingGoal) {
                throw new Error(`Goal with id ${goalId} not found`);
            }

            // Validate goal update
            const validation = this.validationService.validateGoalUpdate(existingGoal, updates);
            if (!validation.isValid) {
                throw new Error(`Goal update validation failed: ${validation.errors.join(', ')}`);
            }

            // Validate status transition if status is being changed
            if (updates.status && updates.status !== existingGoal.status) {
                const statusValidation = this.validationService.validateStatusTransition(
                    existingGoal.status,
                    updates.status
                );
                if (!statusValidation.isValid) {
                    throw new Error(`Invalid status transition: ${statusValidation.errors.join(', ')}`);
                }

                // Check for blocking dependencies when transitioning to in-progress
                if (updates.status === GoalStatus.IN_PROGRESS) {
                    const blockers = this.getBlockingGoals(goalId);
                    if (blockers.length > 0) {
                        const blockerTitles = blockers.map(g => g.title).join(', ');
                        throw new Error(`Cannot start goal - blocked by: ${blockerTitles}`);
                    }
                }
            }

            // Validate parent change (prevent circular dependencies)
            if (updates.parentId !== undefined && updates.parentId !== existingGoal.parentId) {
                if (updates.parentId && this.wouldCreateCircularDependency(goalId, updates.parentId)) {
                    throw new Error('Cannot set parent - would create circular dependency');
                }
            }

            // Create updated goal
            const previousState = { ...existingGoal };
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

            // Store updated goal
            this.goals.set(goalId, updatedGoal);

            // Emit update events
            const changes = this.getChangedFields(previousState, updatedGoal);
            
            const updateEvent: GoalUpdatedEvent = {
                id: GoalEventUtils.generateEventId(),
                type: GoalEventType.GOAL_UPDATED,
                timestamp: new Date(),
                source: 'user',
                data: {
                    goal: updatedGoal,
                    previousState,
                    changes
                }
            };
            await this.emitEvent(updateEvent);

            // Emit status change event if status changed
            if (updates.status && updates.status !== existingGoal.status) {
                const statusEvent: GoalStatusChangedEvent = {
                    id: GoalEventUtils.generateEventId(),
                    type: GoalEventType.GOAL_STATUS_CHANGED,
                    timestamp: new Date(),
                    source: 'user',
                    data: {
                        goalId,
                        previousStatus: existingGoal.status,
                        newStatus: updates.status,
                        goal: updatedGoal
                    }
                };
                await this.emitEvent(statusEvent);
            }

            // Emit move event if parent changed
            if (updates.parentId !== undefined && updates.parentId !== existingGoal.parentId) {
                const moveEvent: GoalMovedEvent = {
                    id: GoalEventUtils.generateEventId(),
                    type: GoalEventType.GOAL_MOVED,
                    timestamp: new Date(),
                    source: 'user',
                    data: {
                        goalId,
                        previousParentId: existingGoal.parentId,
                        newParentId: updates.parentId,
                        goal: updatedGoal
                    }
                };
                await this.emitEvent(moveEvent);
            }

            this.log(`Goal updated: ${updatedGoal.title} (${goalId})`);
            return updatedGoal;

        } catch (error) {
            this.logError('Failed to update goal', error);
            throw error;
        }
    }

    /**
     * Delete a goal and all its children with proper cleanup
     */
    async deleteGoal(goalId: string): Promise<void> {
        try {
            const goal = this.goals.get(goalId);
            if (!goal) {
                throw new Error(`Goal with id ${goalId} not found`);
            }

            // Validate goal deletion
            const validation = this.validationService.validateGoalDeletion(goal, Array.from(this.goals.values()));
            if (!validation.isValid) {
                throw new Error(`Goal deletion validation failed: ${validation.errors.join(', ')}`);
            }

            // Get all child goals for recursive deletion
            const childGoals = this.getChildGoals(goalId);
            
            // Delete children first
            for (const child of childGoals) {
                await this.deleteGoal(child.id);
            }

            // Remove from blocked dependencies of other goals
            this.removeFromBlockedDependencies(goalId);

            // Remove the goal
            this.goals.delete(goalId);

            // Emit deletion event
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
            await this.emitEvent(event);

            this.log(`Goal deleted: ${goal.title} (${goalId})`);

        } catch (error) {
            this.logError('Failed to delete goal', error);
            throw error;
        }
    }

    /**
     * Get a goal by ID
     */
    getGoal(goalId: string): Goal | undefined {
        return this.goals.get(goalId);
    }

    /**
     * Get all goals
     */
    getAllGoals(): Goal[] {
        return Array.from(this.goals.values());
    }

    /**
     * Get root goals (goals without parents)
     */
    getRootGoals(): Goal[] {
        return Array.from(this.goals.values()).filter(goal => !goal.parentId);
    }

    /**
     * Get child goals of a specific goal
     */
    getChildGoals(parentId: string): Goal[] {
        return Array.from(this.goals.values()).filter(goal => goal.parentId === parentId);
    }

    // ===========================================
    // Task Operations
    // ===========================================

    /**
     * Add a task to a goal
     */
    async addTask(goalId: string, params: CreateTaskParams): Promise<Task> {
        try {
            const goal = this.goals.get(goalId);
            if (!goal) {
                throw new Error(`Goal with id ${goalId} not found`);
            }

            // Validate task creation
            const validation = this.validationService.validateTaskCreation(params);
            if (!validation.isValid) {
                throw new Error(`Task creation validation failed: ${validation.errors.join(', ')}`);
            }

            const task: Task = {
                id: this.generateId(),
                title: params.title,
                description: params.description,
                status: TaskStatus.TODO,
                order: goal.tasks.length,
                createdAt: new Date()
            };

            goal.tasks.push(task);
            goal.updatedAt = new Date();
            this.goals.set(goalId, goal);

            // Emit task added event
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
            await this.emitEvent(event);

            this.log(`Task added to goal ${goal.title}: ${task.title} (${task.id})`);
            return task;

        } catch (error) {
            this.logError('Failed to add task', error);
            throw error;
        }
    }

    /**
     * Update a task in a goal
     */
    async updateTask(goalId: string, taskId: string, updates: UpdateTaskParams): Promise<Task> {
        try {
            const goal = this.goals.get(goalId);
            if (!goal) {
                throw new Error(`Goal with id ${goalId} not found`);
            }

            const taskIndex = goal.tasks.findIndex(t => t.id === taskId);
            if (taskIndex === -1) {
                throw new Error(`Task with id ${taskId} not found in goal ${goalId}`);
            }

            const existingTask = goal.tasks[taskIndex];

            // Validate task update
            const validation = this.validationService.validateTaskUpdate(existingTask, updates);
            if (!validation.isValid) {
                throw new Error(`Task update validation failed: ${validation.errors.join(', ')}`);
            }

            const previousState = { ...existingTask };
            const updatedTask: Task = {
                ...existingTask,
                ...updates
            };

            // Handle completion
            if (updates.status === TaskStatus.DONE && existingTask.status !== TaskStatus.DONE) {
                updatedTask.completedAt = new Date();
            }

            goal.tasks[taskIndex] = updatedTask;
            goal.updatedAt = new Date();
            this.goals.set(goalId, goal);

            // Emit task updated event
            const changes = this.getChangedFields(previousState, updatedTask);
            const updateEvent: TaskUpdatedEvent = {
                id: GoalEventUtils.generateEventId(),
                type: GoalEventType.TASK_UPDATED,
                timestamp: new Date(),
                source: 'user',
                data: {
                    goalId,
                    task: updatedTask,
                    previousState,
                    changes,
                    goal
                }
            };
            await this.emitEvent(updateEvent);

            // Emit status change event if status changed
            if (updates.status && updates.status !== existingTask.status) {
                const statusEvent: TaskStatusChangedEvent = {
                    id: GoalEventUtils.generateEventId(),
                    type: GoalEventType.TASK_STATUS_CHANGED,
                    timestamp: new Date(),
                    source: 'user',
                    data: {
                        goalId,
                        taskId,
                        previousStatus: existingTask.status,
                        newStatus: updates.status,
                        task: updatedTask,
                        goal
                    }
                };
                await this.emitEvent(statusEvent);
            }

            this.log(`Task updated in goal ${goal.title}: ${updatedTask.title} (${taskId})`);
            return updatedTask;

        } catch (error) {
            this.logError('Failed to update task', error);
            throw error;
        }
    }

    /**
     * Delete a task from a goal
     */
    async deleteTask(goalId: string, taskId: string): Promise<void> {
        try {
            const goal = this.goals.get(goalId);
            if (!goal) {
                throw new Error(`Goal with id ${goalId} not found`);
            }

            const taskIndex = goal.tasks.findIndex(t => t.id === taskId);
            if (taskIndex === -1) {
                throw new Error(`Task with id ${taskId} not found in goal ${goalId}`);
            }

            const task = goal.tasks[taskIndex];
            goal.tasks.splice(taskIndex, 1);

            // Reorder remaining tasks
            goal.tasks.forEach((t, index) => {
                t.order = index;
            });

            goal.updatedAt = new Date();
            this.goals.set(goalId, goal);

            // Emit task deleted event
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
            await this.emitEvent(event);

            this.log(`Task deleted from goal ${goal.title}: ${task.title} (${taskId})`);

        } catch (error) {
            this.logError('Failed to delete task', error);
            throw error;
        }
    }

    // ===========================================
    // Status Management
    // ===========================================

    /**
     * Get goals blocked by a specific goal
     */
    getBlockedGoals(goalId: string): Goal[] {
        return Array.from(this.goals.values()).filter(goal => 
            goal.blockedByIds.includes(goalId)
        );
    }

    /**
     * Get goals blocking a specific goal
     */
    getBlockingGoals(goalId: string): Goal[] {
        const goal = this.goals.get(goalId);
        if (!goal) return [];

        return goal.blockedByIds
            .map(id => this.goals.get(id))
            .filter((g): g is Goal => g !== undefined);
    }

    /**
     * Add a blocking dependency
     */
    async addBlockingDependency(blockedGoalId: string, blockingGoalId: string): Promise<void> {
        try {
            const blockedGoal = this.goals.get(blockedGoalId);
            const blockingGoal = this.goals.get(blockingGoalId);

            if (!blockedGoal) {
                throw new Error(`Blocked goal with id ${blockedGoalId} not found`);
            }
            if (!blockingGoal) {
                throw new Error(`Blocking goal with id ${blockingGoalId} not found`);
            }

            // Prevent circular dependencies
            if (this.wouldCreateCircularDependency(blockingGoalId, blockedGoalId)) {
                throw new Error('Cannot add dependency - would create circular dependency');
            }

            if (!blockedGoal.blockedByIds.includes(blockingGoalId)) {
                blockedGoal.blockedByIds.push(blockingGoalId);
                blockedGoal.updatedAt = new Date();
                this.goals.set(blockedGoalId, blockedGoal);

                this.log(`Added dependency: ${blockedGoal.title} blocked by ${blockingGoal.title}`);
            }

        } catch (error) {
            this.logError('Failed to add blocking dependency', error);
            throw error;
        }
    }

    /**
     * Remove a blocking dependency
     */
    async removeBlockingDependency(blockedGoalId: string, blockingGoalId: string): Promise<void> {
        try {
            const blockedGoal = this.goals.get(blockedGoalId);
            if (!blockedGoal) {
                throw new Error(`Blocked goal with id ${blockedGoalId} not found`);
            }

            const index = blockedGoal.blockedByIds.indexOf(blockingGoalId);
            if (index > -1) {
                blockedGoal.blockedByIds.splice(index, 1);
                blockedGoal.updatedAt = new Date();
                this.goals.set(blockedGoalId, blockedGoal);

                this.log(`Removed dependency: ${blockedGoal.title} no longer blocked by ${blockingGoalId}`);
            }

        } catch (error) {
            this.logError('Failed to remove blocking dependency', error);
            throw error;
        }
    }

    // ===========================================
    // Bulk Operations
    // ===========================================

    /**
     * Mark multiple goals as completed
     */
    async bulkCompleteGoals(goalIds: string[]): Promise<BulkOperationResult> {
        const result: BulkOperationResult = {
            successful: 0,
            failed: 0,
            errors: [],
            details: []
        };

        for (const goalId of goalIds) {
            try {
                await this.updateGoal(goalId, { status: GoalStatus.COMPLETED });
                result.successful++;
                result.details.push({
                    goalId,
                    operation: 'complete',
                    success: true
                });
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                result.failed++;
                result.errors.push(`${goalId}: ${errorMessage}`);
                result.details.push({
                    goalId,
                    operation: 'complete',
                    success: false,
                    error: errorMessage
                });
            }
        }

        this.log(`Bulk complete operation: ${result.successful} successful, ${result.failed} failed`);
        return result;
    }

    // ===========================================
    // Utility Methods
    // ===========================================

    /**
     * Get the goal hierarchy starting from root goals
     */
    getGoalHierarchy(): GoalHierarchy[] {
        const rootGoals = this.getRootGoals();
        return rootGoals.map(goal => this.buildHierarchy(goal, 0, [goal.id]));
    }

    /**
     * Search goals by title or description
     */
    searchGoals(query: string): Goal[] {
        const lowerQuery = query.toLowerCase();
        return Array.from(this.goals.values()).filter(goal =>
            goal.title.toLowerCase().includes(lowerQuery) ||
            (goal.description?.toLowerCase().includes(lowerQuery))
        );
    }

    // ===========================================
    // Private Helper Methods
    // ===========================================

    private generateId(): string {
        return `goal_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    }

    private async emitEvent(event: GoalEvent): Promise<void> {
        try {
            const listeners = this.eventListeners.get(event.type) || [];
            for (const listener of [...listeners]) {
                try {
                    await listener.handler(event);
                    if (listener.once) {
                        this.removeEventListener(event.type, listener.handler);
                    }
                } catch (error) {
                    this.logError(`Event handler failed for ${event.type}`, error);
                }
            }
        } catch (error) {
            this.logError('Failed to emit event', error);
        }
    }

    private async handleGoalCompletion(goalId: string): Promise<void> {
        // Find goals that were blocked by this goal and auto-unblock them
        const unblockedGoals = this.getBlockedGoals(goalId);
        
        for (const goal of unblockedGoals) {
            await this.removeBlockingDependency(goal.id, goalId);
            
            // Check if goal can now be started
            const remainingBlockers = this.getBlockingGoals(goal.id);
            if (remainingBlockers.length === 0 && goal.status === GoalStatus.BLOCKED) {
                await this.updateGoal(goal.id, { status: GoalStatus.PLANNED });
            }
        }
    }

    private wouldCreateCircularDependency(goalId: string, potentialParentId: string): boolean {
        const visited = new Set<string>();
        
        const checkCircular = (currentId: string): boolean => {
            if (visited.has(currentId)) return false;
            if (currentId === goalId) return true;
            
            visited.add(currentId);
            const goal = this.goals.get(currentId);
            if (!goal?.parentId) return false;
            
            return checkCircular(goal.parentId);
        };
        
        return checkCircular(potentialParentId);
    }

    private removeFromBlockedDependencies(goalId: string): void {
        for (const goal of this.goals.values()) {
            const index = goal.blockedByIds.indexOf(goalId);
            if (index > -1) {
                goal.blockedByIds.splice(index, 1);
                goal.updatedAt = new Date();
                this.goals.set(goal.id, goal);
            }
        }
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

    private buildHierarchy(goal: Goal, level: number, path: string[]): GoalHierarchy {
        const children = this.getChildGoals(goal.id);
        return {
            goal,
            children: children.map(child => this.buildHierarchy(child, level + 1, [...path, child.id])),
            level,
            path
        };
    }

    // ===========================================
    // Event Management Methods
    // ===========================================

    /**
     * Add event listener for specific event type
     */
    on(eventType: string, handler: GoalEventHandler): void {
        const listeners = this.eventListeners.get(eventType) || [];
        listeners.push({ handler, once: false });
        this.eventListeners.set(eventType, listeners);
    }

    /**
     * Add one-time event listener
     */
    once(eventType: string, handler: GoalEventHandler): void {
        const listeners = this.eventListeners.get(eventType) || [];
        listeners.push({ handler, once: true });
        this.eventListeners.set(eventType, listeners);
    }

    /**
     * Remove event listener
     */
    off(eventType: string, handler: GoalEventHandler): void {
        this.removeEventListener(eventType, handler);
    }

    private removeEventListener(eventType: string, handler: GoalEventHandler): void {
        const listeners = this.eventListeners.get(eventType) || [];
        const filteredListeners = listeners.filter(l => l.handler !== handler);
        if (filteredListeners.length === 0) {
            this.eventListeners.delete(eventType);
        } else {
            this.eventListeners.set(eventType, filteredListeners);
        }
    }

    private removeAllListeners(): void {
        this.eventListeners.clear();
    }

    // ===========================================
    // Logging Methods
    // ===========================================

    private log(message: string): void {
        this.logger(`${message}`);
    }

    private logError(message: string, error: unknown): void {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger(`ERROR: ${message} - ${errorMessage}`);
    }

    /**
     * Dispose of resources
     */
    dispose(): void {
        this.goals.clear();
        this.removeAllListeners();
        this.log('GoalManager disposed');
    }
}