/**
 * GoalUndoRedoService - Integration service for goal operations with undo/redo
 * 
 * This service provides a high-level interface that combines GoalManager operations
 * with UndoRedoManager capabilities, automatically wrapping all goal operations
 * in undoable commands.
 * 
 * Features:
 * - Automatic command creation for all goal operations
 * - Transaction support for complex multi-step operations  
 * - State snapshots before major changes
 * - Integration with VS Code command palette
 * - Memory-efficient operation tracking
 * - Event-driven updates for UI feedback
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
    BulkOperationResult
} from '../types';
import { GoalManager, GoalOperationResult } from './GoalManager';
import { UndoRedoManager, UndoRedoResult } from './UndoRedoManager';
import {
    CommandFactory,
    CreateGoalCommand,
    UpdateGoalCommand,
    DeleteGoalCommand,
    ChangeGoalStatusCommand,
    MoveGoalCommand,
    AddTaskCommand,
    UpdateTaskCommand,
    DeleteTaskCommand,
    ChangeTaskStatusCommand,
    AddDependencyCommand,
    RemoveDependencyCommand,
    BulkStatusChangeCommand,
    BulkDeleteCommand
} from '../commands/UndoRedoCommands';

/**
 * Configuration options for GoalUndoRedoService
 */
export interface GoalUndoRedoServiceConfig {
    /** Maximum number of operations in undo/redo history */
    maxHistorySize?: number;
    
    /** Maximum number of state snapshots to keep */
    maxSnapshots?: number;
    
    /** Whether to automatically create snapshots before major operations */
    autoSnapshot?: boolean;
    
    /** Whether to enable logging */
    enableLogging?: boolean;
    
    /** Custom logger function */
    logger?: (message: string) => void;
}

/**
 * Transaction context for grouping multiple operations
 */
export interface GoalTransaction {
    id: string;
    description: string;
    startTime: Date;
    operations: number;
}

/**
 * Service result interface with undo/redo context
 */
export interface GoalUndoRedoResult<T = any> extends GoalOperationResult<T> {
    /** Whether undo is available after this operation */
    canUndo: boolean;
    
    /** Whether redo is available after this operation */
    canRedo: boolean;
    
    /** Description of what can be undone */
    undoDescription?: string;
    
    /** Description of what can be redone */
    redoDescription?: string;
    
    /** Command ID for tracking this operation */
    commandId?: string;
}

/**
 * Main integration service class
 */
export class GoalUndoRedoService {
    private readonly GoalManager: GoalManager;
    private readonly undoRedoManager: UndoRedoManager;
    private readonly commandFactory: CommandFactory;
    private readonly config: Required<GoalUndoRedoServiceConfig>;
    
    private currentTransaction: GoalTransaction | null = null;
    private isDisposed = false;
    
    // Event emitters for UI feedback
    private readonly onUndoRedoStateChange = new vscode.EventEmitter<{
        canUndo: boolean;
        canRedo: boolean;
        undoDescription?: string;
        redoDescription?: string;
    }>();
    
    constructor(
        GoalManager: GoalManager,
        undoRedoManager?: UndoRedoManager,
        config?: GoalUndoRedoServiceConfig
    ) {
        this.GoalManager = GoalManager;
        this.undoRedoManager = undoRedoManager || new UndoRedoManager();
        this.commandFactory = new CommandFactory(this.GoalManager);
        
        // Apply default configuration
        this.config = {
            maxHistorySize: config?.maxHistorySize ?? 100,
            maxSnapshots: config?.maxSnapshots ?? 10,
            autoSnapshot: config?.autoSnapshot ?? true,
            enableLogging: config?.enableLogging ?? false,
            logger: config?.logger ?? ((message: string) => console.log(`[GoalUndoRedoService] ${message}`))
        };
        
        // Configure the undo/redo manager
        this.undoRedoManager.setMaxStackSize(this.config.maxHistorySize);
        this.undoRedoManager.setMaxSnapshotCount(this.config.maxSnapshots);
        
        this.log('GoalUndoRedoService initialized');
    }
    
    /**
     * Event fired when undo/redo state changes
     */
    get onUndoRedoStateChanged() {
        return this.onUndoRedoStateChange.event;
    }
    
    // ===========================================
    // Goal CRUD Operations with Undo/Redo
    // ===========================================
    
    /**
     * Create a goal with automatic undo support
     */
    async createGoal(params: CreateGoalParams): Promise<GoalUndoRedoResult<Goal>> {
        if (this.isDisposed) {
            return this.createErrorResult('Service has been disposed');
        }
        
        try {
            await this.createSnapshotIfNeeded('Before creating goal');
            
            const command = this.commandFactory.createGoal(params);
            await this.undoRedoManager.executeCommand(command);
            
            const createdGoal = command.getCreatedGoal();
            if (!createdGoal) {
                return this.createErrorResult('Goal creation failed - no goal returned');
            }
            
            this.emitStateChange();
            this.log(`Goal created: ${createdGoal.title} (${createdGoal.id})`);
            
            return this.createSuccessResult(createdGoal, 'createGoal', command.id);
            
        } catch (error) {
            return this.createErrorResult(error instanceof Error ? error.message : String(error));
        }
    }
    
    /**
     * Update a goal with automatic undo support
     */
    async updateGoal(goalId: string, updates: UpdateGoalParams): Promise<GoalUndoRedoResult<Goal>> {
        if (this.isDisposed) {
            return this.createErrorResult('Service has been disposed');
        }
        
        try {
            // Get current state for undo
            const currentResult = await this.GoalManager.getGoal(goalId);
            if (!currentResult.success || !currentResult.data) {
                return this.createErrorResult(`Goal ${goalId} not found`);
            }
            
            await this.createSnapshotIfNeeded('Before updating goal');
            
            const command = this.commandFactory.updateGoal(goalId, updates, currentResult.data);
            await this.undoRedoManager.executeCommand(command);
            
            const updatedGoal = command.getUpdatedGoal();
            if (!updatedGoal) {
                return this.createErrorResult('Goal update failed - no updated goal returned');
            }
            
            this.emitStateChange();
            this.log(`Goal updated: ${updatedGoal.title} (${goalId})`);
            
            return this.createSuccessResult(updatedGoal, 'updateGoal', command.id);
            
        } catch (error) {
            return this.createErrorResult(error instanceof Error ? error.message : String(error));
        }
    }
    
    /**
     * Delete a goal with automatic undo support
     */
    async deleteGoal(goalId: string): Promise<GoalUndoRedoResult<void>> {
        if (this.isDisposed) {
            return this.createErrorResult('Service has been disposed');
        }
        
        try {
            // Get current state for undo
            const currentResult = await this.GoalManager.getGoal(goalId);
            if (!currentResult.success || !currentResult.data) {
                return this.createErrorResult(`Goal ${goalId} not found`);
            }
            
            await this.createSnapshotIfNeeded('Before deleting goal');
            
            const command = this.commandFactory.deleteGoal(goalId, currentResult.data);
            await this.undoRedoManager.executeCommand(command);
            
            this.emitStateChange();
            this.log(`Goal deleted: ${currentResult.data.title} (${goalId})`);
            
            return this.createSuccessResult(undefined, 'deleteGoal', command.id);
            
        } catch (error) {
            return this.createErrorResult(error instanceof Error ? error.message : String(error));
        }
    }
    
    /**
     * Change goal status with automatic undo support
     */
    async changeGoalStatus(goalId: string, newStatus: GoalStatusType): Promise<GoalUndoRedoResult<Goal>> {
        if (this.isDisposed) {
            return this.createErrorResult('Service has been disposed');
        }
        
        try {
            // Get current state for undo
            const currentResult = await this.GoalManager.getGoal(goalId);
            if (!currentResult.success || !currentResult.data) {
                return this.createErrorResult(`Goal ${goalId} not found`);
            }
            
            const originalStatus = currentResult.data.status;
            if (originalStatus === newStatus) {
                return this.createSuccessResult(currentResult.data, 'changeGoalStatus');
            }
            
            const command = this.commandFactory.changeGoalStatus(goalId, newStatus, originalStatus);
            await this.undoRedoManager.executeCommand(command);
            
            // Get updated goal
            const updatedResult = await this.GoalManager.getGoal(goalId);
            if (!updatedResult.success || !updatedResult.data) {
                return this.createErrorResult('Failed to retrieve updated goal');
            }
            
            this.emitStateChange();
            this.log(`Goal status changed: ${goalId} from ${originalStatus} to ${newStatus}`);
            
            return this.createSuccessResult(updatedResult.data, 'changeGoalStatus', command.id);
            
        } catch (error) {
            return this.createErrorResult(error instanceof Error ? error.message : String(error));
        }
    }
    
    /**
     * Move a goal (change parent) with automatic undo support
     */
    async moveGoal(goalId: string, newParentId?: string): Promise<GoalUndoRedoResult<Goal>> {
        if (this.isDisposed) {
            return this.createErrorResult('Service has been disposed');
        }
        
        try {
            // Get current state for undo
            const currentResult = await this.GoalManager.getGoal(goalId);
            if (!currentResult.success || !currentResult.data) {
                return this.createErrorResult(`Goal ${goalId} not found`);
            }
            
            const originalParentId = currentResult.data.parentId;
            if (originalParentId === newParentId) {
                return this.createSuccessResult(currentResult.data, 'moveGoal');
            }
            
            await this.createSnapshotIfNeeded('Before moving goal');
            
            const command = this.commandFactory.moveGoal(goalId, newParentId, originalParentId);
            await this.undoRedoManager.executeCommand(command);
            
            // Get updated goal
            const updatedResult = await this.GoalManager.getGoal(goalId);
            if (!updatedResult.success || !updatedResult.data) {
                return this.createErrorResult('Failed to retrieve moved goal');
            }
            
            this.emitStateChange();
            this.log(`Goal moved: ${goalId} from ${originalParentId || 'root'} to ${newParentId || 'root'}`);
            
            return this.createSuccessResult(updatedResult.data, 'moveGoal', command.id);
            
        } catch (error) {
            return this.createErrorResult(error instanceof Error ? error.message : String(error));
        }
    }
    
    // ===========================================
    // Task Operations with Undo/Redo
    // ===========================================
    
    /**
     * Add a task to a goal with automatic undo support
     */
    async addTask(goalId: string, params: CreateTaskParams): Promise<GoalUndoRedoResult<Task>> {
        if (this.isDisposed) {
            return this.createErrorResult('Service has been disposed');
        }
        
        try {
            const command = this.commandFactory.addTask(goalId, params);
            await this.undoRedoManager.executeCommand(command);
            
            const addedTask = command.getAddedTask();
            if (!addedTask) {
                return this.createErrorResult('Task creation failed - no task returned');
            }
            
            this.emitStateChange();
            this.log(`Task added: ${addedTask.title} to goal ${goalId}`);
            
            return this.createSuccessResult(addedTask, 'addTask', command.id);
            
        } catch (error) {
            return this.createErrorResult(error instanceof Error ? error.message : String(error));
        }
    }
    
    /**
     * Update a task with automatic undo support
     */
    async updateTask(goalId: string, taskId: string, updates: UpdateTaskParams): Promise<GoalUndoRedoResult<Task>> {
        if (this.isDisposed) {
            return this.createErrorResult('Service has been disposed');
        }
        
        try {
            // Get current task state for undo
            const goalResult = await this.GoalManager.getGoal(goalId);
            if (!goalResult.success || !goalResult.data) {
                return this.createErrorResult(`Goal ${goalId} not found`);
            }
            
            const task = goalResult.data.tasks.find(t => t.id === taskId);
            if (!task) {
                return this.createErrorResult(`Task ${taskId} not found in goal ${goalId}`);
            }
            
            const command = this.commandFactory.updateTask(goalId, taskId, updates, task);
            await this.undoRedoManager.executeCommand(command);
            
            // Get updated task
            const updatedGoalResult = await this.GoalManager.getGoal(goalId);
            if (!updatedGoalResult.success || !updatedGoalResult.data) {
                return this.createErrorResult('Failed to retrieve updated goal');
            }
            
            const updatedTask = updatedGoalResult.data.tasks.find(t => t.id === taskId);
            if (!updatedTask) {
                return this.createErrorResult('Failed to find updated task');
            }
            
            this.emitStateChange();
            this.log(`Task updated: ${updatedTask.title} (${taskId})`);
            
            return this.createSuccessResult(updatedTask, 'updateTask', command.id);
            
        } catch (error) {
            return this.createErrorResult(error instanceof Error ? error.message : String(error));
        }
    }
    
    /**
     * Delete a task with automatic undo support
     */
    async deleteTask(goalId: string, taskId: string): Promise<GoalUndoRedoResult<void>> {
        if (this.isDisposed) {
            return this.createErrorResult('Service has been disposed');
        }
        
        try {
            // Get current task state for undo
            const goalResult = await this.GoalManager.getGoal(goalId);
            if (!goalResult.success || !goalResult.data) {
                return this.createErrorResult(`Goal ${goalId} not found`);
            }
            
            const task = goalResult.data.tasks.find(t => t.id === taskId);
            if (!task) {
                return this.createErrorResult(`Task ${taskId} not found in goal ${goalId}`);
            }
            
            const command = this.commandFactory.deleteTask(goalId, taskId, task);
            await this.undoRedoManager.executeCommand(command);
            
            this.emitStateChange();
            this.log(`Task deleted: ${task.title} (${taskId})`);
            
            return this.createSuccessResult(undefined, 'deleteTask', command.id);
            
        } catch (error) {
            return this.createErrorResult(error instanceof Error ? error.message : String(error));
        }
    }
    
    /**
     * Change task status with automatic undo support
     */
    async changeTaskStatus(goalId: string, taskId: string, newStatus: TaskStatusType): Promise<GoalUndoRedoResult<Task>> {
        if (this.isDisposed) {
            return this.createErrorResult('Service has been disposed');
        }
        
        try {
            // Get current task state
            const goalResult = await this.GoalManager.getGoal(goalId);
            if (!goalResult.success || !goalResult.data) {
                return this.createErrorResult(`Goal ${goalId} not found`);
            }
            
            const task = goalResult.data.tasks.find(t => t.id === taskId);
            if (!task) {
                return this.createErrorResult(`Task ${taskId} not found in goal ${goalId}`);
            }
            
            const originalStatus = task.status;
            if (originalStatus === newStatus) {
                return this.createSuccessResult(task, 'changeTaskStatus');
            }
            
            const command = this.commandFactory.changeTaskStatus(goalId, taskId, newStatus, originalStatus);
            await this.undoRedoManager.executeCommand(command);
            
            // Get updated task
            const updatedGoalResult = await this.GoalManager.getGoal(goalId);
            if (!updatedGoalResult.success || !updatedGoalResult.data) {
                return this.createErrorResult('Failed to retrieve updated goal');
            }
            
            const updatedTask = updatedGoalResult.data.tasks.find(t => t.id === taskId);
            if (!updatedTask) {
                return this.createErrorResult('Failed to find updated task');
            }
            
            this.emitStateChange();
            this.log(`Task status changed: ${taskId} from ${originalStatus} to ${newStatus}`);
            
            return this.createSuccessResult(updatedTask, 'changeTaskStatus', command.id);
            
        } catch (error) {
            return this.createErrorResult(error instanceof Error ? error.message : String(error));
        }
    }
    
    // ===========================================
    // Dependency Operations with Undo/Redo
    // ===========================================
    
    /**
     * Add a dependency with automatic undo support
     */
    async addDependency(blockedGoalId: string, blockingGoalId: string): Promise<GoalUndoRedoResult<Goal>> {
        if (this.isDisposed) {
            return this.createErrorResult('Service has been disposed');
        }
        
        try {
            const command = this.commandFactory.addDependency(blockedGoalId, blockingGoalId);
            await this.undoRedoManager.executeCommand(command);
            
            // Get updated goal
            const updatedResult = await this.GoalManager.getGoal(blockedGoalId);
            if (!updatedResult.success || !updatedResult.data) {
                return this.createErrorResult('Failed to retrieve updated goal');
            }
            
            this.emitStateChange();
            this.log(`Dependency added: ${blockingGoalId} blocks ${blockedGoalId}`);
            
            return this.createSuccessResult(updatedResult.data, 'addDependency', command.id);
            
        } catch (error) {
            return this.createErrorResult(error instanceof Error ? error.message : String(error));
        }
    }
    
    /**
     * Remove a dependency with automatic undo support
     */
    async removeDependency(blockedGoalId: string, blockingGoalId: string): Promise<GoalUndoRedoResult<Goal>> {
        if (this.isDisposed) {
            return this.createErrorResult('Service has been disposed');
        }
        
        try {
            const command = this.commandFactory.removeDependency(blockedGoalId, blockingGoalId);
            await this.undoRedoManager.executeCommand(command);
            
            // Get updated goal
            const updatedResult = await this.GoalManager.getGoal(blockedGoalId);
            if (!updatedResult.success || !updatedResult.data) {
                return this.createErrorResult('Failed to retrieve updated goal');
            }
            
            this.emitStateChange();
            this.log(`Dependency removed: ${blockingGoalId} no longer blocks ${blockedGoalId}`);
            
            return this.createSuccessResult(updatedResult.data, 'removeDependency', command.id);
            
        } catch (error) {
            return this.createErrorResult(error instanceof Error ? error.message : String(error));
        }
    }
    
    // ===========================================
    // Bulk Operations with Undo/Redo
    // ===========================================
    
    /**
     * Bulk status change with automatic undo support
     */
    async bulkStatusChange(goalIds: string[], newStatus: GoalStatusType): Promise<GoalUndoRedoResult<void>> {
        if (this.isDisposed) {
            return this.createErrorResult('Service has been disposed');
        }
        
        try {
            await this.createSnapshotIfNeeded('Before bulk status change');
            
            const command = this.commandFactory.bulkStatusChange(goalIds, newStatus);
            await this.undoRedoManager.executeCommand(command);
            
            this.emitStateChange();
            this.log(`Bulk status change: ${goalIds.length} goals changed to ${newStatus}`);
            
            return this.createSuccessResult(undefined, 'bulkStatusChange', command.id);
            
        } catch (error) {
            return this.createErrorResult(error instanceof Error ? error.message : String(error));
        }
    }
    
    /**
     * Bulk delete with automatic undo support
     */
    async bulkDelete(goalIds: string[]): Promise<GoalUndoRedoResult<void>> {
        if (this.isDisposed) {
            return this.createErrorResult('Service has been disposed');
        }
        
        try {
            await this.createSnapshotIfNeeded('Before bulk delete');
            
            const command = this.commandFactory.bulkDelete(goalIds);
            await this.undoRedoManager.executeCommand(command);
            
            this.emitStateChange();
            this.log(`Bulk delete: ${goalIds.length} goals deleted`);
            
            return this.createSuccessResult(undefined, 'bulkDelete', command.id);
            
        } catch (error) {
            return this.createErrorResult(error instanceof Error ? error.message : String(error));
        }
    }
    
    // ===========================================
    // Transaction Support
    // ===========================================
    
    /**
     * Start a transaction to group multiple operations
     */
    async startTransaction(description: string): Promise<GoalTransaction> {
        if (this.currentTransaction) {
            throw new Error('Cannot start transaction: another transaction is already active');
        }
        
        await this.createSnapshotIfNeeded(`Before transaction: ${description}`);
        
        const groupId = this.undoRedoManager.startCommandGroup(description, true);
        this.currentTransaction = {
            id: groupId,
            description,
            startTime: new Date(),
            operations: 0
        };
        
        this.log(`Transaction started: ${description} (${groupId})`);
        return { ...this.currentTransaction };
    }
    
    /**
     * Commit the current transaction
     */
    async commitTransaction(): Promise<void> {
        if (!this.currentTransaction) {
            throw new Error('No active transaction to commit');
        }
        
        const transaction = this.currentTransaction;
        this.currentTransaction = null;
        
        const group = this.undoRedoManager.endCommandGroup();
        this.emitStateChange();
        
        this.log(`Transaction committed: ${transaction.description} (${transaction.operations} operations)`);
    }
    
    /**
     * Rollback the current transaction
     */
    async rollbackTransaction(): Promise<void> {
        if (!this.currentTransaction) {
            throw new Error('No active transaction to rollback');
        }
        
        const transaction = this.currentTransaction;
        this.currentTransaction = null;
        
        this.undoRedoManager.cancelCommandGroup();
        this.emitStateChange();
        
        this.log(`Transaction rolled back: ${transaction.description}`);
    }
    
    // ===========================================
    // Undo/Redo Operations
    // ===========================================
    
    /**
     * Undo the last operation
     */
    async undo(): Promise<UndoRedoResult> {
        if (this.isDisposed) {
            throw new Error('Service has been disposed');
        }
        
        const result = await this.undoRedoManager.undo();
        this.emitStateChange();
        
        if (result.success) {
            this.log(`Undo completed: ${result.commandsProcessed} commands processed`);
        } else {
            this.log(`Undo failed: ${result.error}`);
        }
        
        return result;
    }
    
    /**
     * Redo the last undone operation
     */
    async redo(): Promise<UndoRedoResult> {
        if (this.isDisposed) {
            throw new Error('Service has been disposed');
        }
        
        const result = await this.undoRedoManager.redo();
        this.emitStateChange();
        
        if (result.success) {
            this.log(`Redo completed: ${result.commandsProcessed} commands processed`);
        } else {
            this.log(`Redo failed: ${result.error}`);
        }
        
        return result;
    }
    
    /**
     * Check if undo is possible
     */
    canUndo(): boolean {
        return this.undoRedoManager.canUndo();
    }
    
    /**
     * Check if redo is possible
     */
    canRedo(): boolean {
        return this.undoRedoManager.canRedo();
    }
    
    /**
     * Get description of what would be undone
     */
    getUndoDescription(): string | null {
        return this.undoRedoManager.getUndoDescription();
    }
    
    /**
     * Get description of what would be redone
     */
    getRedoDescription(): string | null {
        return this.undoRedoManager.getRedoDescription();
    }
    
    // ===========================================
    // State Management
    // ===========================================
    
    /**
     * Create a state snapshot manually
     */
    async createSnapshot(description: string): Promise<string> {
        return await this.undoRedoManager.createGoalSnapshot(description, this.GoalManager);
    }
    
    /**
     * Get undo/redo statistics
     */
    getStats() {
        return this.undoRedoManager.getUndoRedoStats();
    }
    
    /**
     * Clear all undo/redo history
     */
    clearHistory(): void {
        this.undoRedoManager.clear();
        this.emitStateChange();
        this.log('Undo/redo history cleared');
    }
    
    /**
     * Clear history for specific goals
     */
    clearGoalHistory(goalIds: string[]): number {
        const removedCount = this.undoRedoManager.clearGoalHistory(goalIds);
        this.emitStateChange();
        this.log(`Cleared history for ${goalIds.length} goals (${removedCount} commands removed)`);
        return removedCount;
    }
    
    // ===========================================
    // Private Helper Methods
    // ===========================================
    
    private async createSnapshotIfNeeded(description: string): Promise<void> {
        if (this.config.autoSnapshot && !this.currentTransaction) {
            await this.createSnapshot(description);
        }
    }
    
    private createSuccessResult<T>(
        data: T, 
        operation: string, 
        commandId?: string
    ): GoalUndoRedoResult<T> {
        return {
            success: true,
            data,
            timestamp: new Date(),
            operation,
            canUndo: this.canUndo(),
            canRedo: this.canRedo(),
            undoDescription: this.getUndoDescription() || undefined,
            redoDescription: this.getRedoDescription() || undefined,
            commandId
        };
    }
    
    private createErrorResult<T>(error: string): GoalUndoRedoResult<T> {
        return {
            success: false,
            error,
            timestamp: new Date(),
            operation: 'error',
            canUndo: this.canUndo(),
            canRedo: this.canRedo(),
            undoDescription: this.getUndoDescription() || undefined,
            redoDescription: this.getRedoDescription() || undefined
        };
    }
    
    private emitStateChange(): void {
        this.onUndoRedoStateChange.fire({
            canUndo: this.canUndo(),
            canRedo: this.canRedo(),
            undoDescription: this.getUndoDescription() || undefined,
            redoDescription: this.getRedoDescription() || undefined
        });
    }
    
    private log(message: string): void {
        if (this.config.enableLogging) {
            this.config.logger(message);
        }
    }
    
    // ===========================================
    // Lifecycle Methods
    // ===========================================
    
    /**
     * Dispose of the service and clean up resources
     */
    dispose(): void {
        if (this.isDisposed) return;
        
        this.currentTransaction = null;
        this.onUndoRedoStateChange.dispose();
        this.undoRedoManager.dispose();
        
        this.isDisposed = true;
        this.log('GoalUndoRedoService disposed');
    }
    
    /**
     * Get access to the underlying managers for advanced operations
     */
    getGoalManager(): GoalManager {
        return this.GoalManager;
    }
    
    getUndoRedoManager(): UndoRedoManager {
        return this.undoRedoManager;
    }
}

/**
 * Factory function to create GoalUndoRedoService
 */
export function createGoalUndoRedoService(
    GoalManager: GoalManager,
    config?: GoalUndoRedoServiceConfig
): GoalUndoRedoService {
    return new GoalUndoRedoService(GoalManager, undefined, config);
}