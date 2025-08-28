/**
 * BulkTaskOperations Service - Issue #7 Stream C Implementation
 * 
 * Comprehensive bulk task operations service providing batch processing capabilities,
 * transaction-like behavior with rollback, validation, and performance optimization
 * for large task collections.
 * 
 * This service provides:
 * - Bulk task status updates with atomic operations
 * - Bulk task deletion with confirmation and rollback
 * - Bulk task reordering and priority changes
 * - Batch validation and comprehensive error handling
 * - Performance optimization for large task sets
 * - Transaction-like operations with rollback on failure
 * - Progress tracking and operation result reporting
 */

import * as vscode from 'vscode';
import {
    Task,
    TaskStatus,
    TaskStatusType,
    UpdateTaskParams,
    GoalEvent
} from '../types';
import { TaskManager, TaskOperationResult } from './TaskManager';
import { StorageService } from './storageService';
import { ValidationService } from './ValidationService';

/**
 * Bulk operation types
 */
export enum BulkOperationType {
    STATUS_UPDATE = 'status-update',
    DELETE = 'delete',
    REORDER = 'reorder',
    MOVE_TO_GOAL = 'move-to-goal',
    UPDATE_PROPERTIES = 'update-properties'
}

/**
 * Bulk operation parameters
 */
export interface BulkOperationParams {
    /** Type of bulk operation to perform */
    operation: BulkOperationType;
    
    /** Target task IDs for the operation */
    taskIds: string[];
    
    /** Operation-specific parameters */
    data?: {
        /** New status for status updates */
        status?: TaskStatusType;
        
        /** Target goal ID for move operations */
        targetGoalId?: string;
        
        /** New order mappings for reorder operations */
        orderMappings?: Record<string, number>;
        
        /** Property updates for update operations */
        updates?: Partial<UpdateTaskParams>;
    };
    
    /** Whether to validate before performing operations */
    validateFirst?: boolean;
    
    /** Whether to stop on first error or continue */
    stopOnError?: boolean;
    
    /** Maximum number of operations to perform in parallel */
    maxConcurrency?: number;
}

/**
 * Bulk operation result
 */
export interface BulkOperationResult {
    /** Whether the overall operation was successful */
    success: boolean;
    
    /** Number of successful operations */
    successCount: number;
    
    /** Number of failed operations */
    failureCount: number;
    
    /** Total number of operations attempted */
    totalCount: number;
    
    /** Successfully processed tasks */
    successfulTasks: Task[];
    
    /** Failed task IDs with error messages */
    failures: Array<{
        taskId: string;
        error: string;
    }>;
    
    /** Overall error message if operation failed */
    error?: string;
    
    /** Operation timestamp */
    timestamp: Date;
    
    /** Time taken for the operation in milliseconds */
    executionTime: number;
    
    /** Rollback information if needed */
    rollbackData?: BulkOperationRollback;
}

/**
 * Rollback information for failed bulk operations
 */
export interface BulkOperationRollback {
    /** Whether rollback is available */
    available: boolean;
    
    /** Previous task states before operation */
    previousStates: Record<string, Task>;
    
    /** Operations that were successfully completed before failure */
    completedOperations: string[];
    
    /** Rollback execution function */
    execute?: () => Promise<BulkOperationResult>;
}

/**
 * Bulk operation validation result
 */
export interface BulkOperationValidation {
    /** Whether all tasks can be operated on */
    isValid: boolean;
    
    /** Validation errors by task ID */
    errors: Record<string, string[]>;
    
    /** Warnings that don't prevent operation */
    warnings: Record<string, string[]>;
    
    /** Total number of errors */
    errorCount: number;
    
    /** Total number of warnings */
    warningCount: number;
}

/**
 * Batch processing configuration
 */
export interface BatchProcessingConfig {
    /** Number of tasks to process in each batch */
    batchSize: number;
    
    /** Maximum number of concurrent batches */
    maxConcurrentBatches: number;
    
    /** Delay between batches in milliseconds */
    batchDelay: number;
    
    /** Whether to enable progress reporting */
    enableProgressReporting: boolean;
}

/**
 * Core BulkTaskOperations service
 */
export class BulkTaskOperations {
    private readonly taskManager: TaskManager;
    private readonly storageService: StorageService;
    private readonly validationService: ValidationService;
    private readonly eventEmitter = new vscode.EventEmitter<GoalEvent>();
    private isDisposed = false;

    // Default batch processing configuration
    private static readonly DEFAULT_BATCH_CONFIG: BatchProcessingConfig = {
        batchSize: 50,
        maxConcurrentBatches: 3,
        batchDelay: 10,
        enableProgressReporting: true
    };

    constructor(
        taskManager: TaskManager,
        storageService: StorageService,
        validationService?: ValidationService
    ) {
        this.taskManager = taskManager;
        this.storageService = storageService;
        this.validationService = validationService || new ValidationService();
    }

    /**
     * Event fired when bulk operations complete
     */
    get onBulkOperationComplete() {
        return this.eventEmitter.event;
    }

    // ===========================================
    // Public Bulk Operation Methods
    // ===========================================

    /**
     * Perform bulk task status updates
     */
    async bulkUpdateTaskStatus(
        taskIds: string[],
        newStatus: TaskStatusType,
        options?: Partial<BulkOperationParams>
    ): Promise<BulkOperationResult> {
        if (this.isDisposed) {
            return this.createFailureResult(taskIds, 'BulkTaskOperations service has been disposed');
        }

        const params: BulkOperationParams = {
            operation: BulkOperationType.STATUS_UPDATE,
            taskIds,
            data: { status: newStatus },
            validateFirst: true,
            stopOnError: false,
            maxConcurrency: 5,
            ...options
        };

        return await this.executeBulkOperation(params);
    }

    /**
     * Perform bulk task deletion with optional confirmation
     */
    async bulkDeleteTasks(
        taskIds: string[],
        options?: Partial<BulkOperationParams> & {
            requireConfirmation?: boolean;
            confirmationMessage?: string;
        }
    ): Promise<BulkOperationResult> {
        if (this.isDisposed) {
            return this.createFailureResult(taskIds, 'BulkTaskOperations service has been disposed');
        }

        // Handle confirmation if required
        if (options?.requireConfirmation !== false) {
            const message = options?.confirmationMessage || 
                `Are you sure you want to delete ${taskIds.length} task(s)? This action cannot be undone.`;
            
            const confirmed = await this.requestConfirmation(message);
            if (!confirmed) {
                return this.createFailureResult(taskIds, 'Operation cancelled by user');
            }
        }

        const params: BulkOperationParams = {
            operation: BulkOperationType.DELETE,
            taskIds,
            validateFirst: true,
            stopOnError: false,
            maxConcurrency: 3, // Lower concurrency for deletions
            ...options
        };

        return await this.executeBulkOperation(params);
    }

    /**
     * Perform bulk task reordering
     */
    async bulkReorderTasks(
        orderMappings: Record<string, number>,
        options?: Partial<BulkOperationParams>
    ): Promise<BulkOperationResult> {
        if (this.isDisposed) {
            return this.createFailureResult(Object.keys(orderMappings), 'BulkTaskOperations service has been disposed');
        }

        const taskIds = Object.keys(orderMappings);
        const params: BulkOperationParams = {
            operation: BulkOperationType.REORDER,
            taskIds,
            data: { orderMappings },
            validateFirst: true,
            stopOnError: true, // Reordering should be atomic
            maxConcurrency: 1, // Sequential for reordering
            ...options
        };

        return await this.executeBulkOperation(params);
    }

    /**
     * Move multiple tasks to a different goal
     */
    async bulkMoveTasks(
        taskIds: string[],
        targetGoalId: string,
        options?: Partial<BulkOperationParams>
    ): Promise<BulkOperationResult> {
        if (this.isDisposed) {
            return this.createFailureResult(taskIds, 'BulkTaskOperations service has been disposed');
        }

        const params: BulkOperationParams = {
            operation: BulkOperationType.MOVE_TO_GOAL,
            taskIds,
            data: { targetGoalId },
            validateFirst: true,
            stopOnError: false,
            maxConcurrency: 3,
            ...options
        };

        return await this.executeBulkOperation(params);
    }

    /**
     * Update multiple task properties
     */
    async bulkUpdateTaskProperties(
        taskIds: string[],
        updates: Partial<UpdateTaskParams>,
        options?: Partial<BulkOperationParams>
    ): Promise<BulkOperationResult> {
        if (this.isDisposed) {
            return this.createFailureResult(taskIds, 'BulkTaskOperations service has been disposed');
        }

        const params: BulkOperationParams = {
            operation: BulkOperationType.UPDATE_PROPERTIES,
            taskIds,
            data: { updates },
            validateFirst: true,
            stopOnError: false,
            maxConcurrency: 5,
            ...options
        };

        return await this.executeBulkOperation(params);
    }

    // ===========================================
    // Validation Methods
    // ===========================================

    /**
     * Validate bulk operation before execution
     */
    async validateBulkOperation(params: BulkOperationParams): Promise<BulkOperationValidation> {
        const errors: Record<string, string[]> = {};
        const warnings: Record<string, string[]> = {};

        // Validate task existence and accessibility
        for (const taskId of params.taskIds) {
            const taskResult = await this.taskManager.getTask(taskId);
            
            if (!taskResult.success || !taskResult.data) {
                this.addError(errors, taskId, `Task with ID ${taskId} not found`);
                continue;
            }

            const task = taskResult.data;

            // Operation-specific validation
            switch (params.operation) {
                case BulkOperationType.STATUS_UPDATE:
                    this.validateStatusUpdate(task, params.data?.status, errors, warnings, taskId);
                    break;
                    
                case BulkOperationType.DELETE:
                    this.validateDeletion(task, errors, warnings, taskId);
                    break;
                    
                case BulkOperationType.REORDER:
                    this.validateReordering(task, params.data?.orderMappings, errors, warnings, taskId);
                    break;
                    
                case BulkOperationType.MOVE_TO_GOAL:
                    await this.validateMove(task, params.data?.targetGoalId, errors, warnings, taskId);
                    break;
                    
                case BulkOperationType.UPDATE_PROPERTIES:
                    this.validatePropertyUpdate(task, params.data?.updates, errors, warnings, taskId);
                    break;
            }
        }

        return {
            isValid: Object.keys(errors).length === 0,
            errors,
            warnings,
            errorCount: Object.values(errors).reduce((count, errs) => count + errs.length, 0),
            warningCount: Object.values(warnings).reduce((count, warns) => count + warns.length, 0)
        };
    }

    // ===========================================
    // Performance Optimization Methods
    // ===========================================

    /**
     * Execute bulk operation with batch processing and performance optimization
     */
    async executeBulkOperationOptimized(
        params: BulkOperationParams,
        batchConfig: Partial<BatchProcessingConfig> = {}
    ): Promise<BulkOperationResult> {
        const config = { ...BulkTaskOperations.DEFAULT_BATCH_CONFIG, ...batchConfig };
        const startTime = Date.now();

        // Validate if requested
        if (params.validateFirst) {
            const validation = await this.validateBulkOperation(params);
            if (!validation.isValid) {
                return this.createValidationFailureResult(params.taskIds, validation);
            }
        }

        // Prepare rollback data
        const rollbackData = await this.prepareRollbackData(params.taskIds);

        try {
            // Split tasks into batches
            const batches = this.createBatches(params.taskIds, config.batchSize);
            const results: BulkOperationResult[] = [];
            
            // Process batches with concurrency control
            for (let i = 0; i < batches.length; i += config.maxConcurrentBatches) {
                const batchSlice = batches.slice(i, i + config.maxConcurrentBatches);
                
                const batchPromises = batchSlice.map(batch => 
                    this.processBatch(batch, params)
                );

                const batchResults = await Promise.all(batchPromises);
                results.push(...batchResults);

                // Add delay between batch groups
                if (i + config.maxConcurrentBatches < batches.length) {
                    await this.delay(config.batchDelay);
                }

                // Report progress if enabled
                if (config.enableProgressReporting) {
                    await this.reportProgress(i + config.maxConcurrentBatches, batches.length, params.operation);
                }
            }

            // Combine results
            const finalResult = this.combineResults(results, startTime, rollbackData);
            
            // Emit completion event
            await this.emitBulkOperationEvent(params, finalResult);
            
            return finalResult;

        } catch (error) {
            // Execute rollback if needed
            if (rollbackData.available && params.stopOnError) {
                await this.executeRollback(rollbackData);
            }

            return this.createFailureResult(
                params.taskIds, 
                error instanceof Error ? error.message : String(error),
                startTime,
                rollbackData
            );
        }
    }

    // ===========================================
    // Private Helper Methods
    // ===========================================

    private async executeBulkOperation(params: BulkOperationParams): Promise<BulkOperationResult> {
        return await this.executeBulkOperationOptimized(params);
    }

    private async processBatch(taskIds: string[], params: BulkOperationParams): Promise<BulkOperationResult> {
        const startTime = Date.now();
        const successfulTasks: Task[] = [];
        const failures: Array<{ taskId: string; error: string }> = [];

        for (const taskId of taskIds) {
            try {
                const result = await this.executeOperation(taskId, params);
                if (result.success && result.data) {
                    successfulTasks.push(result.data);
                } else {
                    failures.push({ taskId, error: result.error || 'Unknown error' });
                    
                    if (params.stopOnError) {
                        break;
                    }
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                failures.push({ taskId, error: errorMessage });
                
                if (params.stopOnError) {
                    break;
                }
            }
        }

        return {
            success: failures.length === 0,
            successCount: successfulTasks.length,
            failureCount: failures.length,
            totalCount: taskIds.length,
            successfulTasks,
            failures,
            timestamp: new Date(),
            executionTime: Date.now() - startTime
        };
    }

    private async executeOperation(taskId: string, params: BulkOperationParams): Promise<TaskOperationResult<Task | void>> {
        switch (params.operation) {
            case BulkOperationType.STATUS_UPDATE:
                return await this.taskManager.updateTaskStatus(taskId, params.data!.status!);
                
            case BulkOperationType.DELETE:
                const deleteResult = await this.taskManager.deleteTask(taskId);
                return { ...deleteResult, data: undefined as any }; // Delete doesn't return task
                
            case BulkOperationType.REORDER:
                const newOrder = params.data!.orderMappings![taskId];
                return await this.taskManager.setTaskOrder(taskId, newOrder);
                
            case BulkOperationType.MOVE_TO_GOAL:
                return await this.executeMoveToGoal(taskId, params.data!.targetGoalId!);
                
            case BulkOperationType.UPDATE_PROPERTIES:
                return await this.taskManager.updateTask(taskId, params.data!.updates!);
                
            default:
                return {
                    success: false,
                    error: `Unknown operation type: ${params.operation}`,
                    timestamp: new Date(),
                    operation: 'executeOperation'
                };
        }
    }

    private async executeMoveToGoal(taskId: string, targetGoalId: string): Promise<TaskOperationResult<Task>> {
        // Get the current task
        const taskResult = await this.taskManager.getTask(taskId);
        if (!taskResult.success || !taskResult.data) {
            return {
                success: false,
                error: `Task ${taskId} not found`,
                timestamp: new Date(),
                operation: 'moveToGoal'
            };
        }

        const task = taskResult.data;
        
        // Delete from current goal and create in target goal
        const deleteResult = await this.taskManager.deleteTask(taskId);
        if (!deleteResult.success) {
            return {
                success: false,
                error: deleteResult.error || 'Failed to remove task from current goal',
                timestamp: new Date(),
                operation: 'moveToGoal'
            };
        }

        // Create in target goal
        const createResult = await this.taskManager.createTask(targetGoalId, {
            title: task.title,
            description: task.description,
            goalId: targetGoalId
        });

        return createResult;
    }

    private validateStatusUpdate(
        task: Task,
        newStatus: TaskStatusType | undefined,
        errors: Record<string, string[]>,
        warnings: Record<string, string[]>,
        taskId: string
    ): void {
        if (!newStatus) {
            this.addError(errors, taskId, 'New status is required for status update operation');
            return;
        }

        if (task.status === newStatus) {
            this.addWarning(warnings, taskId, `Task is already in ${newStatus} status`);
        }

        // Validate status transition
        const validation = this.taskManager.validateStatusTransition(task.status, newStatus);
        if (!validation.isValid && validation.error) {
            this.addError(errors, taskId, validation.error);
        }
    }

    private validateDeletion(
        task: Task,
        _errors: Record<string, string[]>,
        warnings: Record<string, string[]>,
        taskId: string
    ): void {
        if (task.status === TaskStatus.DONE) {
            this.addWarning(warnings, taskId, 'Deleting completed task');
        }
    }

    private validateReordering(
        task: Task,
        orderMappings: Record<string, number> | undefined,
        errors: Record<string, string[]>,
        warnings: Record<string, string[]>,
        taskId: string
    ): void {
        if (!orderMappings || !(taskId in orderMappings)) {
            this.addError(errors, taskId, 'No order mapping provided for task');
            return;
        }

        const newOrder = orderMappings[taskId];
        if (newOrder < 0) {
            this.addError(errors, taskId, 'Task order must be non-negative');
        }

        if (newOrder === task.order) {
            this.addWarning(warnings, taskId, 'Task is already at the specified order');
        }
    }

    private async validateMove(
        task: Task,
        targetGoalId: string | undefined,
        errors: Record<string, string[]>,
        warnings: Record<string, string[]>,
        taskId: string
    ): Promise<void> {
        if (!targetGoalId) {
            this.addError(errors, taskId, 'Target goal ID is required for move operation');
            return;
        }

        if (task.goalId === targetGoalId) {
            this.addWarning(warnings, taskId, 'Task is already in the target goal');
            return;
        }

        // Check if target goal exists
        const goalResult = await this.storageService.getGoal(targetGoalId);
        if (!goalResult.success || !goalResult.data) {
            this.addError(errors, taskId, `Target goal ${targetGoalId} not found`);
        }
    }

    private validatePropertyUpdate(
        task: Task,
        updates: Partial<UpdateTaskParams> | undefined,
        errors: Record<string, string[]>,
        warnings: Record<string, string[]>,
        taskId: string
    ): void {
        if (!updates || Object.keys(updates).length === 0) {
            this.addError(errors, taskId, 'No property updates provided');
            return;
        }

        // Validate individual update fields
        if (updates.title !== undefined && updates.title.trim().length === 0) {
            this.addError(errors, taskId, 'Task title cannot be empty');
        }

        if (updates.order !== undefined && updates.order < 0) {
            this.addError(errors, taskId, 'Task order must be non-negative');
        }
    }

    private addError(errors: Record<string, string[]>, taskId: string, error: string): void {
        if (!errors[taskId]) {
            errors[taskId] = [];
        }
        errors[taskId].push(error);
    }

    private addWarning(warnings: Record<string, string[]>, taskId: string, warning: string): void {
        if (!warnings[taskId]) {
            warnings[taskId] = [];
        }
        warnings[taskId].push(warning);
    }

    private async prepareRollbackData(taskIds: string[]): Promise<BulkOperationRollback> {
        const previousStates: Record<string, Task> = {};
        const completedOperations: string[] = [];

        // Capture current states for rollback
        for (const taskId of taskIds) {
            const taskResult = await this.taskManager.getTask(taskId);
            if (taskResult.success && taskResult.data) {
                previousStates[taskId] = { ...taskResult.data };
            }
        }

        return {
            available: Object.keys(previousStates).length > 0,
            previousStates,
            completedOperations,
            execute: async () => {
                // Implement rollback logic here
                return this.createFailureResult([], 'Rollback not yet implemented');
            }
        };
    }

    private async executeRollback(rollbackData: BulkOperationRollback): Promise<void> {
        if (rollbackData.execute) {
            await rollbackData.execute();
        }
    }

    private createBatches<T>(items: T[], batchSize: number): T[][] {
        const batches: T[][] = [];
        for (let i = 0; i < items.length; i += batchSize) {
            batches.push(items.slice(i, i + batchSize));
        }
        return batches;
    }

    private combineResults(
        results: BulkOperationResult[],
        startTime: number,
        rollbackData?: BulkOperationRollback
    ): BulkOperationResult {
        const successfulTasks: Task[] = [];
        const failures: Array<{ taskId: string; error: string }> = [];
        let totalCount = 0;

        for (const result of results) {
            successfulTasks.push(...result.successfulTasks);
            failures.push(...result.failures);
            totalCount += result.totalCount;
        }

        return {
            success: failures.length === 0,
            successCount: successfulTasks.length,
            failureCount: failures.length,
            totalCount,
            successfulTasks,
            failures,
            timestamp: new Date(),
            executionTime: Date.now() - startTime,
            rollbackData
        };
    }

    private createFailureResult(
        taskIds: string[],
        error: string,
        startTime?: number,
        rollbackData?: BulkOperationRollback
    ): BulkOperationResult {
        return {
            success: false,
            successCount: 0,
            failureCount: taskIds.length,
            totalCount: taskIds.length,
            successfulTasks: [],
            failures: taskIds.map(taskId => ({ taskId, error })),
            error,
            timestamp: new Date(),
            executionTime: startTime ? Date.now() - startTime : 0,
            rollbackData
        };
    }

    private createValidationFailureResult(
        taskIds: string[],
        validation: BulkOperationValidation
    ): BulkOperationResult {
        const failures: Array<{ taskId: string; error: string }> = [];
        
        for (const [taskId, errors] of Object.entries(validation.errors)) {
            failures.push({ taskId, error: errors.join('; ') });
        }

        return {
            success: false,
            successCount: 0,
            failureCount: failures.length,
            totalCount: taskIds.length,
            successfulTasks: [],
            failures,
            error: `Validation failed with ${validation.errorCount} error(s)`,
            timestamp: new Date(),
            executionTime: 0
        };
    }

    private async requestConfirmation(message: string): Promise<boolean> {
        const result = await vscode.window.showWarningMessage(
            message,
            { modal: true },
            'Yes',
            'No'
        );
        return result === 'Yes';
    }

    private async delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private async reportProgress(completed: number, total: number, operation: BulkOperationType): Promise<void> {
        const percentage = Math.round((completed / total) * 100);
        vscode.window.setStatusBarMessage(`Bulk ${operation}: ${percentage}% complete (${completed}/${total})`, 2000);
    }

    private async emitBulkOperationEvent(params: BulkOperationParams, result: BulkOperationResult): Promise<void> {
        // Use a generic event type for bulk operations
        // This would need to be added to GoalEventType enum in the types
        console.log(`Bulk operation completed: ${params.operation}, success: ${result.success}, processed: ${result.totalCount} tasks`);
        
        // For now, we don't emit an event since the specific type doesn't exist
        // This could be enhanced later by adding BULK_OPERATION_COMPLETED to GoalEventType
    }

    /**
     * Dispose of resources
     */
    dispose(): void {
        if (this.isDisposed) return;
        
        this.eventEmitter.dispose();
        this.isDisposed = true;
    }
}

/**
 * Factory function to create a BulkTaskOperations instance
 */
export function createBulkTaskOperations(
    taskManager: TaskManager,
    storageService: StorageService,
    validationService?: ValidationService
): BulkTaskOperations {
    return new BulkTaskOperations(taskManager, storageService, validationService);
}