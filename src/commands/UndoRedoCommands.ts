/**
 * UndoRedoCommands - Command pattern implementations for goal operations
 * 
 * This module provides concrete implementations of undoable commands for all
 * goal management operations including creation, updates, deletion, and
 * task management. All commands integrate with the UndoRedoManager service.
 * 
 * Features:
 * - Reversible goal CRUD operations
 * - Reversible task management operations  
 * - Dependency management commands
 * - Batch operation support
 * - Deep state snapshots for complex operations
 * - Integration with GoalManager for business logic
 * - Event emission for tree view updates
 */

import * as vscode from 'vscode';
import {
    Goal,
    CreateGoalParams,
    UpdateGoalParams,
    Task,
    CreateTaskParams,
    UpdateTaskParams,
    GoalStatusType,
    TaskStatusType,
    GoalUtils,
    TaskUtils
} from '../types';
import { UndoableCommand } from '../services/UndoRedoManager';
import { GoalManager, GoalOperationResult } from '../services/GoalManager';

/**
 * Base class for all goal-related commands
 */
abstract class BaseGoalCommand implements UndoableCommand {
    public readonly id: string;
    public readonly timestamp: Date;
    public readonly affectedGoalIds: string[] = [];
    public metadata?: Record<string, any>;
    
    protected goalManager: GoalManager;
    
    constructor(
        goalManager: GoalManager,
        public readonly description: string,
        affectedGoalIds: string[] = [],
        metadata?: Record<string, any>
    ) {
        this.goalManager = goalManager;
        this.id = this.generateId();
        this.timestamp = new Date();
        this.affectedGoalIds = [...affectedGoalIds];
        this.metadata = metadata;
    }
    
    abstract execute(): Promise<void>;
    abstract undo(): Promise<void>;
    
    canUndo(): boolean {
        return true;
    }
    
    canRedo(): boolean {
        return true;
    }
    
    private generateId(): string {
        return `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    }
    
    protected logError(operation: string, error: unknown): void {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[${this.constructor.name}] ${operation} failed:`, errorMessage);
    }
}

// ===========================================
// Goal CRUD Commands
// ===========================================

/**
 * Command to create a new goal
 */
export class CreateGoalCommand extends BaseGoalCommand {
    private createdGoal?: Goal;
    
    constructor(
        goalManager: GoalManager,
        private readonly params: CreateGoalParams
    ) {
        super(
            goalManager,
            `Create goal: ${params.title}`,
            params.parentId ? [params.parentId] : [],
            { operation: 'create', params }
        );
    }
    
    async execute(): Promise<void> {
        try {
            const result = await this.goalManager.createGoal(this.params);
            if (!result.success || !result.data) {
                throw new Error(result.error || 'Failed to create goal');
            }
            
            this.createdGoal = result.data;
            this.affectedGoalIds.push(this.createdGoal.id);
            
        } catch (error) {
            this.logError('execute', error);
            throw error;
        }
    }
    
    async undo(): Promise<void> {
        if (!this.createdGoal) {
            throw new Error('Cannot undo: no goal was created');
        }
        
        try {
            const result = await this.goalManager.deleteGoal(this.createdGoal.id);
            if (!result.success) {
                throw new Error(result.error || 'Failed to delete goal during undo');
            }
            
        } catch (error) {
            this.logError('undo', error);
            throw error;
        }
    }
    
    getCreatedGoal(): Goal | undefined {
        return this.createdGoal;
    }
}

/**
 * Command to update an existing goal
 */
export class UpdateGoalCommand extends BaseGoalCommand {
    private originalState?: Goal;
    private updatedGoal?: Goal;
    
    constructor(
        goalManager: GoalManager,
        private readonly goalId: string,
        private readonly updates: UpdateGoalParams,
        originalState?: Goal
    ) {
        super(
            goalManager,
            `Update goal: ${updates.title || goalId}`,
            [goalId],
            { operation: 'update', goalId, updates }
        );
        this.originalState = originalState;
    }
    
    async execute(): Promise<void> {
        try {
            // Get current state if not provided
            if (!this.originalState) {
                const currentResult = await this.goalManager.getGoal(this.goalId);
                if (!currentResult.success || !currentResult.data) {
                    throw new Error(`Goal ${this.goalId} not found`);
                }
                this.originalState = { ...currentResult.data };
            }
            
            const result = await this.goalManager.updateGoal(this.goalId, this.updates);
            if (!result.success || !result.data) {
                throw new Error(result.error || 'Failed to update goal');
            }
            
            this.updatedGoal = result.data;
            
        } catch (error) {
            this.logError('execute', error);
            throw error;
        }
    }
    
    async undo(): Promise<void> {
        if (!this.originalState) {
            throw new Error('Cannot undo: original state not captured');
        }
        
        try {
            // Restore original state
            const restoreUpdates: UpdateGoalParams = {
                title: this.originalState.title,
                description: this.originalState.description,
                status: this.originalState.status,
                parentId: this.originalState.parentId,
                blockedByIds: [...this.originalState.blockedByIds],
                metadata: this.originalState.metadata
            };
            
            const result = await this.goalManager.updateGoal(this.goalId, restoreUpdates);
            if (!result.success) {
                throw new Error(result.error || 'Failed to restore goal during undo');
            }
            
        } catch (error) {
            this.logError('undo', error);
            throw error;
        }
    }
    
    getOriginalState(): Goal | undefined {
        return this.originalState;
    }
    
    getUpdatedGoal(): Goal | undefined {
        return this.updatedGoal;
    }
}

/**
 * Command to delete a goal
 */
export class DeleteGoalCommand extends BaseGoalCommand {
    private deletedGoal?: Goal;
    private deletedChildGoals: Goal[] = [];
    
    constructor(
        goalManager: GoalManager,
        private readonly goalId: string,
        deletedGoal?: Goal
    ) {
        super(
            goalManager,
            `Delete goal: ${deletedGoal?.title || goalId}`,
            [goalId],
            { operation: 'delete', goalId }
        );
        this.deletedGoal = deletedGoal;
    }
    
    async execute(): Promise<void> {
        try {
            // Capture the goal state before deletion if not provided
            if (!this.deletedGoal) {
                const goalResult = await this.goalManager.getGoal(this.goalId);
                if (!goalResult.success || !goalResult.data) {
                    throw new Error(`Goal ${this.goalId} not found`);
                }
                this.deletedGoal = { ...goalResult.data };
            }
            
            // Capture child goals that will be deleted recursively
            const childrenResult = await this.goalManager.getChildGoals(this.goalId);
            if (childrenResult.success && childrenResult.data) {
                // Deep capture all descendants
                await this.captureDescendants(childrenResult.data);
            }
            
            const result = await this.goalManager.deleteGoal(this.goalId);
            if (!result.success) {
                throw new Error(result.error || 'Failed to delete goal');
            }
            
        } catch (error) {
            this.logError('execute', error);
            throw error;
        }
    }
    
    async undo(): Promise<void> {
        if (!this.deletedGoal) {
            throw new Error('Cannot undo: deleted goal state not captured');
        }
        
        try {
            // Recreate the main goal
            const createParams: CreateGoalParams = {
                title: this.deletedGoal.title,
                description: this.deletedGoal.description,
                parentId: this.deletedGoal.parentId,
                metadata: this.deletedGoal.metadata
            };
            
            const createResult = await this.goalManager.createGoal(createParams);
            if (!createResult.success || !createResult.data) {
                throw new Error(createResult.error || 'Failed to recreate goal during undo');
            }
            
            const recreatedGoal = createResult.data;
            
            // Restore original properties that can't be set during creation
            const restoreUpdates: UpdateGoalParams = {
                status: this.deletedGoal.status,
                blockedByIds: [...this.deletedGoal.blockedByIds]
            };
            
            await this.goalManager.updateGoal(recreatedGoal.id, restoreUpdates);
            
            // Restore tasks
            for (const task of this.deletedGoal.tasks) {
                await this.goalManager.addTask(recreatedGoal.id, {
                    title: task.title,
                    description: task.description
                });
            }
            
            // Recreate child goals recursively
            await this.recreateChildGoals(this.deletedChildGoals, recreatedGoal.id);
            
        } catch (error) {
            this.logError('undo', error);
            throw error;
        }
    }
    
    private async captureDescendants(children: Goal[]): Promise<void> {
        for (const child of children) {
            this.deletedChildGoals.push({ ...child });
            this.affectedGoalIds.push(child.id);
            
            // Get grandchildren
            const grandChildrenResult = await this.goalManager.getChildGoals(child.id);
            if (grandChildrenResult.success && grandChildrenResult.data && grandChildrenResult.data.length > 0) {
                await this.captureDescendants(grandChildrenResult.data);
            }
        }
    }
    
    private async recreateChildGoals(childGoals: Goal[], newParentId: string): Promise<void> {
        // Sort by dependency order to avoid creation issues
        const sortedChildren = [...childGoals].sort((a, b) => {
            // Root level children first, then by creation order
            if (a.parentId === this.goalId && b.parentId !== this.goalId) return -1;
            if (b.parentId === this.goalId && a.parentId !== this.goalId) return 1;
            return a.createdAt.getTime() - b.createdAt.getTime();
        });
        
        const idMapping = new Map<string, string>();
        idMapping.set(this.goalId, newParentId);
        
        for (const child of sortedChildren) {
            const mappedParentId = idMapping.get(child.parentId || '') || newParentId;
            
            const createParams: CreateGoalParams = {
                title: child.title,
                description: child.description,
                parentId: mappedParentId,
                metadata: child.metadata
            };
            
            const createResult = await this.goalManager.createGoal(createParams);
            if (createResult.success && createResult.data) {
                idMapping.set(child.id, createResult.data.id);
                
                // Restore additional properties
                const restoreUpdates: UpdateGoalParams = {
                    status: child.status,
                    blockedByIds: [...child.blockedByIds]
                };
                
                await this.goalManager.updateGoal(createResult.data.id, restoreUpdates);
                
                // Restore tasks
                for (const task of child.tasks) {
                    await this.goalManager.addTask(createResult.data.id, {
                        title: task.title,
                        description: task.description
                    });
                }
            }
        }
    }
    
    getDeletedGoal(): Goal | undefined {
        return this.deletedGoal;
    }
}

// ===========================================
// Goal Status Commands
// ===========================================

/**
 * Command to change goal status
 */
export class ChangeGoalStatusCommand extends BaseGoalCommand {
    private originalStatus?: GoalStatusType;
    
    constructor(
        goalManager: GoalManager,
        private readonly goalId: string,
        private readonly newStatus: GoalStatusType,
        originalStatus?: GoalStatusType
    ) {
        super(
            goalManager,
            `Change status to ${newStatus} for goal ${goalId}`,
            [goalId],
            { operation: 'statusChange', goalId, newStatus, originalStatus }
        );
        this.originalStatus = originalStatus;
    }
    
    async execute(): Promise<void> {
        try {
            // Capture original status if not provided
            if (!this.originalStatus) {
                const goalResult = await this.goalManager.getGoal(this.goalId);
                if (!goalResult.success || !goalResult.data) {
                    throw new Error(`Goal ${this.goalId} not found`);
                }
                this.originalStatus = goalResult.data.status;
            }
            
            const result = await this.goalManager.updateGoal(this.goalId, {
                status: this.newStatus
            });
            
            if (!result.success) {
                throw new Error(result.error || 'Failed to change goal status');
            }
            
        } catch (error) {
            this.logError('execute', error);
            throw error;
        }
    }
    
    async undo(): Promise<void> {
        if (!this.originalStatus) {
            throw new Error('Cannot undo: original status not captured');
        }
        
        try {
            const result = await this.goalManager.updateGoal(this.goalId, {
                status: this.originalStatus
            });
            
            if (!result.success) {
                throw new Error(result.error || 'Failed to restore goal status during undo');
            }
            
        } catch (error) {
            this.logError('undo', error);
            throw error;
        }
    }
    
    getOriginalStatus(): GoalStatusType | undefined {
        return this.originalStatus;
    }
    
    getNewStatus(): GoalStatusType {
        return this.newStatus;
    }
}

/**
 * Command to move a goal (change parent)
 */
export class MoveGoalCommand extends BaseGoalCommand {
    private originalParentId?: string;
    
    constructor(
        goalManager: GoalManager,
        private readonly goalId: string,
        private readonly newParentId: string | undefined,
        originalParentId?: string
    ) {
        const affectedGoals = [goalId];
        if (newParentId) affectedGoals.push(newParentId);
        if (originalParentId) affectedGoals.push(originalParentId);
        
        super(
            goalManager,
            `Move goal ${goalId} to ${newParentId || 'root'}`,
            affectedGoals,
            { operation: 'move', goalId, newParentId, originalParentId }
        );
        this.originalParentId = originalParentId;
    }
    
    async execute(): Promise<void> {
        try {
            // Capture original parent if not provided
            if (this.originalParentId === undefined) {
                const goalResult = await this.goalManager.getGoal(this.goalId);
                if (!goalResult.success || !goalResult.data) {
                    throw new Error(`Goal ${this.goalId} not found`);
                }
                this.originalParentId = goalResult.data.parentId;
            }
            
            const result = await this.goalManager.updateGoal(this.goalId, {
                parentId: this.newParentId
            });
            
            if (!result.success) {
                throw new Error(result.error || 'Failed to move goal');
            }
            
        } catch (error) {
            this.logError('execute', error);
            throw error;
        }
    }
    
    async undo(): Promise<void> {
        try {
            const result = await this.goalManager.updateGoal(this.goalId, {
                parentId: this.originalParentId
            });
            
            if (!result.success) {
                throw new Error(result.error || 'Failed to restore goal parent during undo');
            }
            
        } catch (error) {
            this.logError('undo', error);
            throw error;
        }
    }
    
    getOriginalParentId(): string | undefined {
        return this.originalParentId;
    }
    
    getNewParentId(): string | undefined {
        return this.newParentId;
    }
}

// ===========================================
// Task Commands
// ===========================================

/**
 * Command to add a task to a goal
 */
export class AddTaskCommand extends BaseGoalCommand {
    private addedTask?: Task;
    
    constructor(
        goalManager: GoalManager,
        private readonly goalId: string,
        private readonly params: CreateTaskParams
    ) {
        super(
            goalManager,
            `Add task: ${params.title} to goal ${goalId}`,
            [goalId],
            { operation: 'addTask', goalId, params }
        );
    }
    
    async execute(): Promise<void> {
        try {
            const result = await this.goalManager.addTask(this.goalId, this.params);
            if (!result.success || !result.data) {
                throw new Error(result.error || 'Failed to add task');
            }
            
            this.addedTask = result.data;
            
        } catch (error) {
            this.logError('execute', error);
            throw error;
        }
    }
    
    async undo(): Promise<void> {
        if (!this.addedTask) {
            throw new Error('Cannot undo: no task was added');
        }
        
        try {
            const result = await this.goalManager.deleteTask(this.goalId, this.addedTask.id);
            if (!result.success) {
                throw new Error(result.error || 'Failed to delete task during undo');
            }
            
        } catch (error) {
            this.logError('undo', error);
            throw error;
        }
    }
    
    getAddedTask(): Task | undefined {
        return this.addedTask;
    }
}

/**
 * Command to update a task
 */
export class UpdateTaskCommand extends BaseGoalCommand {
    private originalState?: Task;
    
    constructor(
        goalManager: GoalManager,
        private readonly goalId: string,
        private readonly taskId: string,
        private readonly updates: UpdateTaskParams,
        originalState?: Task
    ) {
        super(
            goalManager,
            `Update task: ${updates.title || taskId}`,
            [goalId],
            { operation: 'updateTask', goalId, taskId, updates }
        );
        this.originalState = originalState;
    }
    
    async execute(): Promise<void> {
        try {
            // Capture original state if not provided
            if (!this.originalState) {
                const goalResult = await this.goalManager.getGoal(this.goalId);
                if (!goalResult.success || !goalResult.data) {
                    throw new Error(`Goal ${this.goalId} not found`);
                }
                
                const task = goalResult.data.tasks.find(t => t.id === this.taskId);
                if (!task) {
                    throw new Error(`Task ${this.taskId} not found in goal ${this.goalId}`);
                }
                this.originalState = { ...task };
            }
            
            const result = await this.goalManager.updateTask(this.goalId, this.taskId, this.updates);
            if (!result.success) {
                throw new Error(result.error || 'Failed to update task');
            }
            
        } catch (error) {
            this.logError('execute', error);
            throw error;
        }
    }
    
    async undo(): Promise<void> {
        if (!this.originalState) {
            throw new Error('Cannot undo: original task state not captured');
        }
        
        try {
            const restoreUpdates: UpdateTaskParams = {
                title: this.originalState.title,
                description: this.originalState.description,
                status: this.originalState.status,
                order: this.originalState.order
            };
            
            const result = await this.goalManager.updateTask(this.goalId, this.taskId, restoreUpdates);
            if (!result.success) {
                throw new Error(result.error || 'Failed to restore task during undo');
            }
            
        } catch (error) {
            this.logError('undo', error);
            throw error;
        }
    }
    
    getOriginalState(): Task | undefined {
        return this.originalState;
    }
}

/**
 * Command to delete a task
 */
export class DeleteTaskCommand extends BaseGoalCommand {
    private deletedTask?: Task;
    
    constructor(
        goalManager: GoalManager,
        private readonly goalId: string,
        private readonly taskId: string,
        deletedTask?: Task
    ) {
        super(
            goalManager,
            `Delete task: ${deletedTask?.title || taskId}`,
            [goalId],
            { operation: 'deleteTask', goalId, taskId }
        );
        this.deletedTask = deletedTask;
    }
    
    async execute(): Promise<void> {
        try {
            // Capture task state if not provided
            if (!this.deletedTask) {
                const goalResult = await this.goalManager.getGoal(this.goalId);
                if (!goalResult.success || !goalResult.data) {
                    throw new Error(`Goal ${this.goalId} not found`);
                }
                
                const task = goalResult.data.tasks.find(t => t.id === this.taskId);
                if (!task) {
                    throw new Error(`Task ${this.taskId} not found in goal ${this.goalId}`);
                }
                this.deletedTask = { ...task };
            }
            
            const result = await this.goalManager.deleteTask(this.goalId, this.taskId);
            if (!result.success) {
                throw new Error(result.error || 'Failed to delete task');
            }
            
        } catch (error) {
            this.logError('execute', error);
            throw error;
        }
    }
    
    async undo(): Promise<void> {
        if (!this.deletedTask) {
            throw new Error('Cannot undo: deleted task state not captured');
        }
        
        try {
            const createParams: CreateTaskParams = {
                title: this.deletedTask.title,
                description: this.deletedTask.description,
                goalId: this.goalId
            };
            
            const addResult = await this.goalManager.addTask(this.goalId, createParams);
            if (!addResult.success || !addResult.data) {
                throw new Error(addResult.error || 'Failed to recreate task during undo');
            }
            
            // Restore additional properties
            const restoreUpdates: UpdateTaskParams = {
                status: this.deletedTask.status,
                order: this.deletedTask.order
            };
            
            await this.goalManager.updateTask(this.goalId, addResult.data.id, restoreUpdates);
            
        } catch (error) {
            this.logError('undo', error);
            throw error;
        }
    }
    
    getDeletedTask(): Task | undefined {
        return this.deletedTask;
    }
}

/**
 * Command to change task status
 */
export class ChangeTaskStatusCommand extends BaseGoalCommand {
    private originalStatus?: TaskStatusType;
    
    constructor(
        goalManager: GoalManager,
        private readonly goalId: string,
        private readonly taskId: string,
        private readonly newStatus: TaskStatusType,
        originalStatus?: TaskStatusType
    ) {
        super(
            goalManager,
            `Change task status to ${newStatus}`,
            [goalId],
            { operation: 'taskStatusChange', goalId, taskId, newStatus, originalStatus }
        );
        this.originalStatus = originalStatus;
    }
    
    async execute(): Promise<void> {
        try {
            // Capture original status if not provided
            if (!this.originalStatus) {
                const goalResult = await this.goalManager.getGoal(this.goalId);
                if (!goalResult.success || !goalResult.data) {
                    throw new Error(`Goal ${this.goalId} not found`);
                }
                
                const task = goalResult.data.tasks.find(t => t.id === this.taskId);
                if (!task) {
                    throw new Error(`Task ${this.taskId} not found in goal ${this.goalId}`);
                }
                this.originalStatus = task.status;
            }
            
            const result = await this.goalManager.updateTask(this.goalId, this.taskId, {
                status: this.newStatus
            });
            
            if (!result.success) {
                throw new Error(result.error || 'Failed to change task status');
            }
            
        } catch (error) {
            this.logError('execute', error);
            throw error;
        }
    }
    
    async undo(): Promise<void> {
        if (!this.originalStatus) {
            throw new Error('Cannot undo: original task status not captured');
        }
        
        try {
            const result = await this.goalManager.updateTask(this.goalId, this.taskId, {
                status: this.originalStatus
            });
            
            if (!result.success) {
                throw new Error(result.error || 'Failed to restore task status during undo');
            }
            
        } catch (error) {
            this.logError('undo', error);
            throw error;
        }
    }
    
    getOriginalStatus(): TaskStatusType | undefined {
        return this.originalStatus;
    }
    
    getNewStatus(): TaskStatusType {
        return this.newStatus;
    }
}

// ===========================================
// Dependency Commands
// ===========================================

/**
 * Command to add a blocking dependency
 */
export class AddDependencyCommand extends BaseGoalCommand {
    constructor(
        goalManager: GoalManager,
        private readonly blockedGoalId: string,
        private readonly blockingGoalId: string
    ) {
        super(
            goalManager,
            `Add dependency: ${blockingGoalId} blocks ${blockedGoalId}`,
            [blockedGoalId, blockingGoalId],
            { operation: 'addDependency', blockedGoalId, blockingGoalId }
        );
    }
    
    async execute(): Promise<void> {
        try {
            const result = await this.goalManager.addBlockingDependency(this.blockedGoalId, this.blockingGoalId);
            if (!result.success) {
                throw new Error(result.error || 'Failed to add blocking dependency');
            }
            
        } catch (error) {
            this.logError('execute', error);
            throw error;
        }
    }
    
    async undo(): Promise<void> {
        try {
            const result = await this.goalManager.removeBlockingDependency(this.blockedGoalId, this.blockingGoalId);
            if (!result.success) {
                throw new Error(result.error || 'Failed to remove blocking dependency during undo');
            }
            
        } catch (error) {
            this.logError('undo', error);
            throw error;
        }
    }
}

/**
 * Command to remove a blocking dependency
 */
export class RemoveDependencyCommand extends BaseGoalCommand {
    constructor(
        goalManager: GoalManager,
        private readonly blockedGoalId: string,
        private readonly blockingGoalId: string
    ) {
        super(
            goalManager,
            `Remove dependency: ${blockingGoalId} no longer blocks ${blockedGoalId}`,
            [blockedGoalId, blockingGoalId],
            { operation: 'removeDependency', blockedGoalId, blockingGoalId }
        );
    }
    
    async execute(): Promise<void> {
        try {
            const result = await this.goalManager.removeBlockingDependency(this.blockedGoalId, this.blockingGoalId);
            if (!result.success) {
                throw new Error(result.error || 'Failed to remove blocking dependency');
            }
            
        } catch (error) {
            this.logError('execute', error);
            throw error;
        }
    }
    
    async undo(): Promise<void> {
        try {
            const result = await this.goalManager.addBlockingDependency(this.blockedGoalId, this.blockingGoalId);
            if (!result.success) {
                throw new Error(result.error || 'Failed to add blocking dependency during undo');
            }
            
        } catch (error) {
            this.logError('undo', error);
            throw error;
        }
    }
}

// ===========================================
// Batch Commands
// ===========================================

/**
 * Command for bulk goal status changes
 */
export class BulkStatusChangeCommand extends BaseGoalCommand {
    private originalStates: Map<string, GoalStatusType> = new Map();
    
    constructor(
        goalManager: GoalManager,
        private readonly goalIds: string[],
        private readonly newStatus: GoalStatusType
    ) {
        super(
            goalManager,
            `Change status to ${newStatus} for ${goalIds.length} goals`,
            [...goalIds],
            { operation: 'bulkStatusChange', goalIds, newStatus }
        );
    }
    
    async execute(): Promise<void> {
        try {
            // Capture original states
            for (const goalId of this.goalIds) {
                const goalResult = await this.goalManager.getGoal(goalId);
                if (goalResult.success && goalResult.data) {
                    this.originalStates.set(goalId, goalResult.data.status);
                }
            }
            
            // Apply status changes
            for (const goalId of this.goalIds) {
                const result = await this.goalManager.updateGoal(goalId, {
                    status: this.newStatus
                });
                
                if (!result.success) {
                    throw new Error(`Failed to update goal ${goalId}: ${result.error}`);
                }
            }
            
        } catch (error) {
            this.logError('execute', error);
            throw error;
        }
    }
    
    async undo(): Promise<void> {
        try {
            // Restore original states
            for (const [goalId, originalStatus] of this.originalStates.entries()) {
                const result = await this.goalManager.updateGoal(goalId, {
                    status: originalStatus
                });
                
                if (!result.success) {
                    console.warn(`Failed to restore status for goal ${goalId}: ${result.error}`);
                }
            }
            
        } catch (error) {
            this.logError('undo', error);
            throw error;
        }
    }
    
    getOriginalStates(): Map<string, GoalStatusType> {
        return new Map(this.originalStates);
    }
}

/**
 * Command for bulk goal deletion
 */
export class BulkDeleteCommand extends BaseGoalCommand {
    private deletedGoals: Map<string, Goal> = new Map();
    private deletionOrder: string[] = [];
    
    constructor(
        goalManager: GoalManager,
        private readonly goalIds: string[]
    ) {
        super(
            goalManager,
            `Delete ${goalIds.length} goals`,
            [...goalIds],
            { operation: 'bulkDelete', goalIds }
        );
    }
    
    async execute(): Promise<void> {
        try {
            // Capture states and determine deletion order (children first)
            await this.captureGoalsAndOrder();
            
            // Delete in determined order
            for (const goalId of this.deletionOrder) {
                const result = await this.goalManager.deleteGoal(goalId);
                if (!result.success) {
                    throw new Error(`Failed to delete goal ${goalId}: ${result.error}`);
                }
            }
            
        } catch (error) {
            this.logError('execute', error);
            throw error;
        }
    }
    
    async undo(): Promise<void> {
        try {
            // Recreate in reverse order (parents first)
            const creationOrder = [...this.deletionOrder].reverse();
            const idMapping = new Map<string, string>();
            
            for (const originalId of creationOrder) {
                const goal = this.deletedGoals.get(originalId);
                if (!goal) continue;
                
                // Map parent ID if it was also deleted
                const mappedParentId = goal.parentId && idMapping.has(goal.parentId) 
                    ? idMapping.get(goal.parentId) 
                    : goal.parentId;
                
                const createParams: CreateGoalParams = {
                    title: goal.title,
                    description: goal.description,
                    parentId: mappedParentId,
                    metadata: goal.metadata
                };
                
                const createResult = await this.goalManager.createGoal(createParams);
                if (createResult.success && createResult.data) {
                    idMapping.set(originalId, createResult.data.id);
                    
                    // Restore additional properties
                    const restoreUpdates: UpdateGoalParams = {
                        status: goal.status,
                        blockedByIds: [...goal.blockedByIds] // Note: dependency IDs may need remapping
                    };
                    
                    await this.goalManager.updateGoal(createResult.data.id, restoreUpdates);
                    
                    // Restore tasks
                    for (const task of goal.tasks) {
                        await this.goalManager.addTask(createResult.data.id, {
                            title: task.title,
                            description: task.description
                        });
                    }
                }
            }
            
        } catch (error) {
            this.logError('undo', error);
            throw error;
        }
    }
    
    private async captureGoalsAndOrder(): Promise<void> {
        // Get all goals and build hierarchy
        const goalHierarchy = new Map<string, Goal>();
        const parentToChildren = new Map<string, string[]>();
        
        for (const goalId of this.goalIds) {
            const goalResult = await this.goalManager.getGoal(goalId);
            if (goalResult.success && goalResult.data) {
                const goal = goalResult.data;
                goalHierarchy.set(goalId, { ...goal });
                this.deletedGoals.set(goalId, { ...goal });
                
                if (goal.parentId) {
                    const siblings = parentToChildren.get(goal.parentId) || [];
                    siblings.push(goalId);
                    parentToChildren.set(goal.parentId, siblings);
                }
            }
        }
        
        // Build deletion order (depth-first, children before parents)
        const visited = new Set<string>();
        
        const addToOrder = (goalId: string) => {
            if (visited.has(goalId) || !goalHierarchy.has(goalId)) return;
            
            visited.add(goalId);
            
            // Add children first
            const children = parentToChildren.get(goalId) || [];
            for (const child of children) {
                addToOrder(child);
            }
            
            // Add this goal
            this.deletionOrder.push(goalId);
        };
        
        // Start with root goals in the deletion set
        for (const goalId of this.goalIds) {
            const goal = goalHierarchy.get(goalId);
            if (goal && (!goal.parentId || !this.goalIds.includes(goal.parentId))) {
                addToOrder(goalId);
            }
        }
    }
    
    getDeletedGoals(): Map<string, Goal> {
        return new Map(this.deletedGoals);
    }
}

// ===========================================
// Command Factory Functions
// ===========================================

/**
 * Factory functions for creating command instances
 */
export class CommandFactory {
    constructor(private goalManager: GoalManager) {}
    
    createGoal(params: CreateGoalParams): CreateGoalCommand {
        return new CreateGoalCommand(this.goalManager, params);
    }
    
    updateGoal(goalId: string, updates: UpdateGoalParams, originalState?: Goal): UpdateGoalCommand {
        return new UpdateGoalCommand(this.goalManager, goalId, updates, originalState);
    }
    
    deleteGoal(goalId: string, deletedGoal?: Goal): DeleteGoalCommand {
        return new DeleteGoalCommand(this.goalManager, goalId, deletedGoal);
    }
    
    changeGoalStatus(goalId: string, newStatus: GoalStatusType, originalStatus?: GoalStatusType): ChangeGoalStatusCommand {
        return new ChangeGoalStatusCommand(this.goalManager, goalId, newStatus, originalStatus);
    }
    
    moveGoal(goalId: string, newParentId: string | undefined, originalParentId?: string): MoveGoalCommand {
        return new MoveGoalCommand(this.goalManager, goalId, newParentId, originalParentId);
    }
    
    addTask(goalId: string, params: CreateTaskParams): AddTaskCommand {
        return new AddTaskCommand(this.goalManager, goalId, params);
    }
    
    updateTask(goalId: string, taskId: string, updates: UpdateTaskParams, originalState?: Task): UpdateTaskCommand {
        return new UpdateTaskCommand(this.goalManager, goalId, taskId, updates, originalState);
    }
    
    deleteTask(goalId: string, taskId: string, deletedTask?: Task): DeleteTaskCommand {
        return new DeleteTaskCommand(this.goalManager, goalId, taskId, deletedTask);
    }
    
    changeTaskStatus(goalId: string, taskId: string, newStatus: TaskStatusType, originalStatus?: TaskStatusType): ChangeTaskStatusCommand {
        return new ChangeTaskStatusCommand(this.goalManager, goalId, taskId, newStatus, originalStatus);
    }
    
    addDependency(blockedGoalId: string, blockingGoalId: string): AddDependencyCommand {
        return new AddDependencyCommand(this.goalManager, blockedGoalId, blockingGoalId);
    }
    
    removeDependency(blockedGoalId: string, blockingGoalId: string): RemoveDependencyCommand {
        return new RemoveDependencyCommand(this.goalManager, blockedGoalId, blockingGoalId);
    }
    
    bulkStatusChange(goalIds: string[], newStatus: GoalStatusType): BulkStatusChangeCommand {
        return new BulkStatusChangeCommand(this.goalManager, goalIds, newStatus);
    }
    
    bulkDelete(goalIds: string[]): BulkDeleteCommand {
        return new BulkDeleteCommand(this.goalManager, goalIds);
    }
}

