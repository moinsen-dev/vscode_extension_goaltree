/**
 * GoalManager Service - Core CRUD operations and business logic with enhanced event system and undo/redo
 * 
 * This service implements all goal management operations including creation,
 * editing, deletion, status transitions, and hierarchical relationship management.
 * It provides proper validation, error handling, enhanced event emission, and undo/redo capabilities.
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
import { EventManager } from './EventManager';
import { UndoRedoManager, UndoableCommand } from './UndoRedoManager';

/**
 * Goal operation commands for undo/redo functionality
 */
class CreateGoalCommand implements UndoableCommand {
    id: string;
    description: string;
    timestamp: Date;
    affectedGoalIds: string[];
    metadata?: Record<string, any>;

    private goalManager: GoalManager;
    private params: CreateGoalParams;
    private createdGoal: Goal | null = null;

    constructor(goalManager: GoalManager, params: CreateGoalParams) {
        this.id = `create_goal_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        this.description = `Create goal: ${params.title}`;
        this.timestamp = new Date();
        this.affectedGoalIds = [];
        this.goalManager = goalManager;
        this.params = params;
    }

    async execute(): Promise<void> {
        this.createdGoal = await this.goalManager.createGoalDirect(this.params);
        this.affectedGoalIds = [this.createdGoal.id];
    }

    async undo(): Promise<void> {
        if (this.createdGoal) {
            await this.goalManager.deleteGoalDirect(this.createdGoal.id);
        }
    }

    canUndo(): boolean {
        return this.createdGoal !== null;
    }

    canRedo(): boolean {
        return true;
    }
}

class UpdateGoalCommand implements UndoableCommand {
    id: string;
    description: string;
    timestamp: Date;
    affectedGoalIds: string[];
    metadata?: Record<string, any>;

    private goalManager: GoalManager;
    private goalId: string;
    private updates: UpdateGoalParams;
    private previousState: Goal | null = null;

    constructor(goalManager: GoalManager, goalId: string, updates: UpdateGoalParams) {
        this.id = `update_goal_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        this.description = `Update goal: ${updates.title || 'properties'}`;
        this.timestamp = new Date();
        this.affectedGoalIds = [goalId];
        this.goalManager = goalManager;
        this.goalId = goalId;
        this.updates = updates;
    }

    async execute(): Promise<void> {
        // Store previous state before updating
        const goal = this.goalManager.getGoal(this.goalId);
        if (!goal) {
            throw new Error(`Goal with id ${this.goalId} not found`);
        }
        this.previousState = { ...goal }; // Deep copy

        await this.goalManager.updateGoalDirect(this.goalId, this.updates);
    }

    async undo(): Promise<void> {
        if (this.previousState) {
            // Restore to previous state
            const restoreUpdates: UpdateGoalParams = {
                title: this.previousState.title,
                description: this.previousState.description,
                status: this.previousState.status,
                parentId: this.previousState.parentId,
                blockedByIds: this.previousState.blockedByIds,
                metadata: this.previousState.metadata
            };
            await this.goalManager.updateGoalDirect(this.goalId, restoreUpdates);
        }
    }

    canUndo(): boolean {
        return this.previousState !== null;
    }

    canRedo(): boolean {
        return true;
    }
}

class DeleteGoalCommand implements UndoableCommand {
    id: string;
    description: string;
    timestamp: Date;
    affectedGoalIds: string[];
    metadata?: Record<string, any>;

    private goalManager: GoalManager;
    private goalId: string;
    private deletedGoal: Goal | null = null;
    private deletedChildren: Goal[] = [];

    constructor(goalManager: GoalManager, goalId: string) {
        this.id = `delete_goal_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        this.description = `Delete goal`;
        this.timestamp = new Date();
        this.affectedGoalIds = [goalId];
        this.goalManager = goalManager;
        this.goalId = goalId;
    }

    async execute(): Promise<void> {
        this.deletedGoal = this.goalManager.getGoal(this.goalId) ?? null;
        if (!this.deletedGoal) {
            throw new Error(`Goal with id ${this.goalId} not found`);
        }
        
        this.description = `Delete goal: ${this.deletedGoal.title}`;
        this.deletedGoal = { ...this.deletedGoal }; // Deep copy
        
        // Store children that will be deleted
        this.deletedChildren = this.goalManager.getChildGoals(this.goalId);
        
        await this.goalManager.deleteGoalDirect(this.goalId);
    }

    async undo(): Promise<void> {
        if (this.deletedGoal) {
            // Recreate the goal
            const params: CreateGoalParams = {
                title: this.deletedGoal.title,
                description: this.deletedGoal.description,
                parentId: this.deletedGoal.parentId,
                metadata: this.deletedGoal.metadata
            };
            
            // Create with original ID (special case for undo)
            await this.goalManager.recreateGoalWithId(this.deletedGoal.id, params, this.deletedGoal);
            
            // Recreate children
            for (const child of this.deletedChildren) {
                const childParams: CreateGoalParams = {
                    title: child.title,
                    description: child.description,
                    parentId: child.parentId,
                    metadata: child.metadata
                };
                await this.goalManager.recreateGoalWithId(child.id, childParams, child);
            }
        }
    }

    canUndo(): boolean {
        return this.deletedGoal !== null;
    }

    canRedo(): boolean {
        return true;
    }
}

/**
 * Enhanced GoalManager class with EventManager and UndoRedoManager integration
 */
export class GoalManager {
    private goals: Map<string, Goal> = new Map();
    private validationService: ValidationService;
    private eventManager: EventManager;
    private undoRedoManager: UndoRedoManager | null = null;
    private logger: (message: string) => void;
    private isDisposed: boolean = false;

    constructor(
        validationService?: ValidationService,
        eventManager?: EventManager,
        undoRedoManager?: UndoRedoManager,
        logger?: (message: string) => void
    ) {
        this.validationService = validationService || new ValidationService();
        this.eventManager = eventManager || new EventManager();
        this.undoRedoManager = undoRedoManager || null;
        this.logger = logger || ((message: string) => console.log(`GoalManager: ${message}`));
        this.log('Enhanced GoalManager initialized');
    }

    // ===========================================
    // Public Goal CRUD Operations (with undo/redo support)
    // ===========================================

    /**
     * Create a new goal with validation, event emission, and undo/redo support
     */
    async createGoal(params: CreateGoalParams): Promise<Goal> {
        if (this.isDisposed) {
            throw new Error('GoalManager has been disposed');
        }

        if (this.undoRedoManager) {
            const command = new CreateGoalCommand(this, params);
            await this.undoRedoManager.executeCommand(command);
            return command['createdGoal']!;
        } else {
            return await this.createGoalDirect(params);
        }
    }

    /**
     * Update an existing goal with validation, event emission, and undo/redo support
     */
    async updateGoal(goalId: string, updates: UpdateGoalParams): Promise<Goal> {
        if (this.isDisposed) {
            throw new Error('GoalManager has been disposed');
        }

        if (this.undoRedoManager) {
            const command = new UpdateGoalCommand(this, goalId, updates);
            await this.undoRedoManager.executeCommand(command);
            return this.getGoal(goalId)!;
        } else {
            return await this.updateGoalDirect(goalId, updates);
        }
    }

    /**
     * Delete a goal with validation, event emission, and undo/redo support
     */
    async deleteGoal(goalId: string): Promise<void> {
        if (this.isDisposed) {
            throw new Error('GoalManager has been disposed');
        }

        if (this.undoRedoManager) {
            const command = new DeleteGoalCommand(this, goalId);
            await this.undoRedoManager.executeCommand(command);
        } else {
            await this.deleteGoalDirect(goalId);
        }
    }

    // ===========================================
    // Direct Operations (internal, no undo/redo)
    // ===========================================

    /**
     * Create a new goal directly (internal method)
     */
    async createGoalDirect(params: CreateGoalParams): Promise<Goal> {
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

            // Emit creation event via EventManager
            const event: GoalCreatedEvent = {
                id: GoalEventUtils.generateEventId(),
                type: GoalEventType.GOAL_CREATED,
                timestamp: new Date(),
                source: 'user',
                data: { goal }
            };
            await this.eventManager.emit(event);

            this.log(`Goal created: ${goal.title} (${goal.id})`);
            return goal;

        } catch (error) {
            this.logError('Failed to create goal', error);
            throw error;
        }
    }

    /**
     * Update an existing goal directly (internal method)
     */
    async updateGoalDirect(goalId: string, updates: UpdateGoalParams): Promise<Goal> {
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

            // Emit update events via EventManager
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
            await this.eventManager.emit(updateEvent);

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
                await this.eventManager.emit(statusEvent);
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
                await this.eventManager.emit(moveEvent);
            }

            this.log(`Goal updated: ${updatedGoal.title} (${goalId})`);
            return updatedGoal;

        } catch (error) {
            this.logError('Failed to update goal', error);
            throw error;
        }
    }

    /**
     * Delete a goal directly (internal method)
     */
    async deleteGoalDirect(goalId: string): Promise<void> {
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
                await this.deleteGoalDirect(child.id);
            }

            // Remove from blocked dependencies of other goals
            this.removeFromBlockedDependencies(goalId);

            // Remove the goal
            this.goals.delete(goalId);

            // Emit deletion event via EventManager
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
            await this.eventManager.emit(event);

            this.log(`Goal deleted: ${goal.title} (${goalId})`);

        } catch (error) {
            this.logError('Failed to delete goal', error);
            throw error;
        }
    }

    /**
     * Recreate a goal with specific ID (for undo operations)
     */
    async recreateGoalWithId(goalId: string, params: CreateGoalParams, originalGoal: Goal): Promise<Goal> {
        // Validate goal creation
        const validation = this.validationService.validateGoalCreation(params);
        if (!validation.isValid) {
            throw new Error(`Goal recreation validation failed: ${validation.errors.join(', ')}`);
        }

        // Recreate the goal with original properties
        const goal: Goal = {
            ...originalGoal,
            id: goalId // Use specific ID
        };

        // Store the goal
        this.goals.set(goal.id, goal);

        // Emit creation event via EventManager
        const event: GoalCreatedEvent = {
            id: GoalEventUtils.generateEventId(),
            type: GoalEventType.GOAL_CREATED,
            timestamp: new Date(),
            source: 'system', // Mark as system-generated (undo operation)
            data: { goal },
            metadata: { isUndoOperation: true }
        };
        await this.eventManager.emit(event);

        this.log(`Goal recreated: ${goal.title} (${goal.id})`);
        return goal;
    }

    // ===========================================
    // Query Methods (unchanged from original)
    // ===========================================

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
    // Task Operations (enhanced with events)
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

            // Emit task added event via EventManager
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
            await this.eventManager.emit(event);

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

            // Emit task updated event via EventManager
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
            await this.eventManager.emit(updateEvent);

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
                await this.eventManager.emit(statusEvent);
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

            // Emit task deleted event via EventManager
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
            await this.eventManager.emit(event);

            this.log(`Task deleted from goal ${goal.title}: ${task.title} (${taskId})`);

        } catch (error) {
            this.logError('Failed to delete task', error);
            throw error;
        }
    }

    // ===========================================
    // Status Management (unchanged from original)
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
    // Bulk Operations (enhanced with events)
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

        // Use command group for bulk operations if undo/redo is enabled
        let groupId: string | null = null;
        if (this.undoRedoManager) {
            groupId = this.undoRedoManager.startCommandGroup(
                `Bulk complete ${goalIds.length} goals`,
                true
            );
        }

        try {
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

        } finally {
            // End command group if it was started
            if (groupId && this.undoRedoManager) {
                this.undoRedoManager.endCommandGroup();
            }
        }
    }

    // ===========================================
    // Utility Methods (unchanged from original)
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
    // Event System Integration
    // ===========================================

    /**
     * Register an event listener with the EventManager
     */
    on<T extends GoalEvent>(
        eventType: T['type'] | T['type'][],
        handler: GoalEventHandler<T>,
        options?: {
            once?: boolean;
            filter?: (event: T) => boolean;
            priority?: number;
        }
    ): string {
        return this.eventManager.on(eventType, handler, options);
    }

    /**
     * Register a one-time event listener
     */
    once<T extends GoalEvent>(
        eventType: T['type'],
        handler: GoalEventHandler<T>,
        options?: {
            filter?: (event: T) => boolean;
            priority?: number;
        }
    ): string {
        return this.eventManager.once(eventType, handler, options);
    }

    /**
     * Remove an event listener
     */
    off<T extends GoalEvent>(
        eventType: T['type'] | T['type'][],
        handler: GoalEventHandler<T>
    ): void {
        this.eventManager.off(eventType, handler);
    }

    /**
     * Remove event listener by subscription ID
     */
    offById(subscriptionId: string): void {
        this.eventManager.offById(subscriptionId);
    }

    // ===========================================
    // Undo/Redo Integration
    // ===========================================

    /**
     * Undo the last operation
     */
    async undo(): Promise<UndoRedoManager['undo'] extends (...args: any[]) => Promise<infer T> ? T : never> {
        if (!this.undoRedoManager) {
            throw new Error('Undo/Redo is not enabled');
        }
        return await this.undoRedoManager.undo();
    }

    /**
     * Redo the last undone operation
     */
    async redo(): Promise<UndoRedoManager['redo'] extends (...args: any[]) => Promise<infer T> ? T : never> {
        if (!this.undoRedoManager) {
            throw new Error('Undo/Redo is not enabled');
        }
        return await this.undoRedoManager.redo();
    }

    /**
     * Check if undo is possible
     */
    canUndo(): boolean {
        return this.undoRedoManager ? this.undoRedoManager.canUndo() : false;
    }

    /**
     * Check if redo is possible
     */
    canRedo(): boolean {
        return this.undoRedoManager ? this.undoRedoManager.canRedo() : false;
    }

    /**
     * Get undo description
     */
    getUndoDescription(): string | null {
        return this.undoRedoManager ? this.undoRedoManager.getUndoDescription() : null;
    }

    /**
     * Get redo description
     */
    getRedoDescription(): string | null {
        return this.undoRedoManager ? this.undoRedoManager.getRedoDescription() : null;
    }

    /**
     * Create a state snapshot for rollback operations
     */
    createSnapshot(description: string): string | null {
        if (!this.undoRedoManager) return null;
        return this.undoRedoManager.createSnapshot(description, this.goals);
    }

    // ===========================================
    // Private Helper Methods (unchanged from original)
    // ===========================================

    private generateId(): string {
        return `goal_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    }

    private async handleGoalCompletion(goalId: string): Promise<void> {
        // Find goals that were blocked by this goal and auto-unblock them
        const unblockedGoals = this.getBlockedGoals(goalId);
        
        for (const goal of unblockedGoals) {
            await this.removeBlockingDependency(goal.id, goalId);
            
            // Check if goal can now be started
            const remainingBlockers = this.getBlockingGoals(goal.id);
            if (remainingBlockers.length === 0 && goal.status === GoalStatus.BLOCKED) {
                await this.updateGoalDirect(goal.id, { status: GoalStatus.PLANNED });
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

    private log(message: string): void {
        this.logger(`${message}`);
    }

    private logError(message: string, error: unknown): void {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger(`ERROR: ${message} - ${errorMessage}`);
    }

    // ===========================================
    // Lifecycle Methods
    // ===========================================

    /**
     * Dispose of resources
     */
    dispose(): void {
        if (this.isDisposed) return;

        this.goals.clear();
        this.eventManager.dispose();
        if (this.undoRedoManager) {
            this.undoRedoManager.dispose();
        }

        this.isDisposed = true;
        this.log('Enhanced GoalManager disposed');
    }

    /**
     * Get access to the EventManager for advanced event operations
     */
    getEventManager(): EventManager {
        return this.eventManager;
    }

    /**
     * Get access to the UndoRedoManager for advanced undo/redo operations
     */
    getUndoRedoManager(): UndoRedoManager | null {
        return this.undoRedoManager;
    }
}