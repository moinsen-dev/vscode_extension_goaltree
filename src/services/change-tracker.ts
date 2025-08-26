/**
 * Change tracking service for detecting and batching data modifications
 * Monitors Goal and Task changes to trigger auto-save operations
 */

import { Goal, Task } from '../models/goal';
import { createLogger } from '../utils/logger';

/**
 * Types of changes that can be tracked
 */
export enum ChangeType {
    GOAL_CREATED = 'goal_created',
    GOAL_UPDATED = 'goal_updated',
    GOAL_DELETED = 'goal_deleted',
    GOAL_STATUS_CHANGED = 'goal_status_changed',
    GOAL_HIERARCHY_CHANGED = 'goal_hierarchy_changed',
    TASK_CREATED = 'task_created',
    TASK_UPDATED = 'task_updated',
    TASK_DELETED = 'task_deleted',
    TASK_STATUS_CHANGED = 'task_status_changed',
    TASK_REORDERED = 'task_reordered',
    BULK_OPERATION = 'bulk_operation'
}

/**
 * Detailed information about a specific change
 */
export interface ChangeEvent {
    /** Unique identifier for this change */
    id: string;
    
    /** Type of change that occurred */
    type: ChangeType;
    
    /** When the change occurred */
    timestamp: Date;
    
    /** ID of the affected goal */
    goalId: string;
    
    /** ID of the affected task (if applicable) */
    taskId?: string;
    
    /** Previous value (for updates) */
    previousValue?: any;
    
    /** New value (for updates) */
    newValue?: any;
    
    /** Additional metadata about the change */
    metadata?: {
        /** Field that was changed (for updates) */
        field?: string;
        
        /** Batch ID if this change is part of a batch operation */
        batchId?: string;
        
        /** User-friendly description of the change */
        description?: string;
        
        /** Whether this change should trigger an immediate save */
        urgent?: boolean;
        
        /** Array of affected goal IDs (for bulk operations) */
        affectedGoals?: string[];
        
        /** Number of changes in a bulk operation */
        changeCount?: number;
    };
}

/**
 * Batch of related changes
 */
export interface ChangeBatch {
    /** Unique identifier for the batch */
    id: string;
    
    /** When the batch was created */
    createdAt: Date;
    
    /** When the batch was last updated */
    updatedAt: Date;
    
    /** All changes in this batch */
    changes: ChangeEvent[];
    
    /** Description of the batch operation */
    description: string;
    
    /** Whether any changes in this batch are urgent */
    hasUrgentChanges: boolean;
}

/**
 * Statistics about tracked changes
 */
export interface ChangeStatistics {
    /** Total number of changes tracked */
    totalChanges: number;
    
    /** Number of pending (unsaved) changes */
    pendingChanges: number;
    
    /** Number of batches */
    totalBatches: number;
    
    /** Changes by type */
    changesByType: Record<ChangeType, number>;
    
    /** Most recent change timestamp */
    lastChangeTime?: Date;
    
    /** Average changes per batch */
    averageChangesPerBatch: number;
}

/**
 * Configuration for change tracking behavior
 */
export interface ChangeTrackerConfig {
    /** Maximum number of changes to keep in memory */
    maxChanges: number;
    
    /** Maximum age of changes before they're considered stale (ms) */
    maxAge: number;
    
    /** Whether to track field-level changes for updates */
    trackFieldChanges: boolean;
    
    /** Whether to automatically batch related changes */
    autoBatch: boolean;
    
    /** Time window for auto-batching related changes (ms) */
    batchWindow: number;
    
    /** Whether to enable detailed logging */
    enableLogging: boolean;
}

/**
 * Service for tracking and managing data changes
 */
export class ChangeTracker {
    private static instance: ChangeTracker;
    
    private changes: ChangeEvent[] = [];
    private batches: ChangeBatch[] = [];
    private currentBatch: ChangeBatch | null = null;
    private config: ChangeTrackerConfig;
    private logger = createLogger('ChangeTracker');
    private nextChangeId = 1;
    private nextBatchId = 1;
    
    private constructor(config?: Partial<ChangeTrackerConfig>) {
        this.config = {
            maxChanges: 1000,
            maxAge: 24 * 60 * 60 * 1000, // 24 hours
            trackFieldChanges: true,
            autoBatch: true,
            batchWindow: 100, // 100ms
            enableLogging: true,
            ...config
        };
        
        // Set up periodic cleanup
        setInterval(() => this.cleanup(), 60000); // Clean up every minute
    }
    
    /**
     * Gets the singleton instance of ChangeTracker
     */
    static getInstance(config?: Partial<ChangeTrackerConfig>): ChangeTracker {
        if (!ChangeTracker.instance) {
            ChangeTracker.instance = new ChangeTracker(config);
        }
        return ChangeTracker.instance;
    }
    
    /**
     * Starts tracking a batch of related changes
     */
    startBatch(description: string): string {
        if (this.currentBatch) {
            this.endBatch();
        }
        
        const batchId = `batch_${this.nextBatchId++}`;
        this.currentBatch = {
            id: batchId,
            createdAt: new Date(),
            updatedAt: new Date(),
            changes: [],
            description,
            hasUrgentChanges: false
        };
        
        if (this.config.enableLogging) {
            this.logger.debug(`Started change batch: ${description}`);
        }
        
        return batchId;
    }
    
    /**
     * Ends the current batch
     */
    endBatch(): void {
        if (this.currentBatch && this.currentBatch.changes.length > 0) {
            this.batches.push({ ...this.currentBatch });
            
            if (this.config.enableLogging) {
                this.logger.debug(
                    `Ended batch ${this.currentBatch.id} with ${this.currentBatch.changes.length} changes`
                );
            }
        }
        
        this.currentBatch = null;
    }
    
    /**
     * Records a goal creation
     */
    recordGoalCreated(goal: Goal): string {
        return this.recordChange({
            type: ChangeType.GOAL_CREATED,
            goalId: goal.id,
            newValue: goal,
            metadata: {
                description: `Created goal: ${goal.title}`,
                urgent: false
            }
        });
    }
    
    /**
     * Records a goal update
     */
    recordGoalUpdated(goalId: string, previousGoal: Goal, newGoal: Goal): string {
        const changes = this.detectGoalChanges(previousGoal, newGoal);
        let mainChangeId = '';
        
        // Record overall update
        mainChangeId = this.recordChange({
            type: ChangeType.GOAL_UPDATED,
            goalId,
            previousValue: previousGoal,
            newValue: newGoal,
            metadata: {
                description: `Updated goal: ${newGoal.title}`,
                urgent: false
            }
        });
        
        // Record specific field changes if configured
        if (this.config.trackFieldChanges) {
            for (const fieldChange of changes) {
                this.recordChange({
                    type: fieldChange.isStatusChange ? ChangeType.GOAL_STATUS_CHANGED : ChangeType.GOAL_UPDATED,
                    goalId,
                    previousValue: fieldChange.previousValue,
                    newValue: fieldChange.newValue,
                    metadata: {
                        field: fieldChange.field,
                        description: fieldChange.description,
                        urgent: fieldChange.isStatusChange
                    }
                });
            }
        }
        
        return mainChangeId;
    }
    
    /**
     * Records a goal deletion
     */
    recordGoalDeleted(goal: Goal): string {
        return this.recordChange({
            type: ChangeType.GOAL_DELETED,
            goalId: goal.id,
            previousValue: goal,
            metadata: {
                description: `Deleted goal: ${goal.title}`,
                urgent: true // Deletions are urgent
            }
        });
    }
    
    /**
     * Records a goal hierarchy change
     */
    recordGoalHierarchyChanged(goalId: string, previousParentId?: string, newParentId?: string): string {
        return this.recordChange({
            type: ChangeType.GOAL_HIERARCHY_CHANGED,
            goalId,
            previousValue: previousParentId,
            newValue: newParentId,
            metadata: {
                field: 'parentId',
                description: `Moved goal hierarchy: ${previousParentId || 'root'} -> ${newParentId || 'root'}`,
                urgent: true // Hierarchy changes are urgent
            }
        });
    }
    
    /**
     * Records a task creation
     */
    recordTaskCreated(goalId: string, task: Task): string {
        return this.recordChange({
            type: ChangeType.TASK_CREATED,
            goalId,
            taskId: task.id,
            newValue: task,
            metadata: {
                description: `Created task: ${task.title}`,
                urgent: false
            }
        });
    }
    
    /**
     * Records a task update
     */
    recordTaskUpdated(goalId: string, taskId: string, previousTask: Task, newTask: Task): string {
        const changes = this.detectTaskChanges(previousTask, newTask);
        let mainChangeId = '';
        
        // Record overall update
        mainChangeId = this.recordChange({
            type: ChangeType.TASK_UPDATED,
            goalId,
            taskId,
            previousValue: previousTask,
            newValue: newTask,
            metadata: {
                description: `Updated task: ${newTask.title}`,
                urgent: false
            }
        });
        
        // Record specific field changes
        if (this.config.trackFieldChanges) {
            for (const fieldChange of changes) {
                this.recordChange({
                    type: fieldChange.isStatusChange ? ChangeType.TASK_STATUS_CHANGED : 
                          fieldChange.field === 'order' ? ChangeType.TASK_REORDERED : ChangeType.TASK_UPDATED,
                    goalId,
                    taskId,
                    previousValue: fieldChange.previousValue,
                    newValue: fieldChange.newValue,
                    metadata: {
                        field: fieldChange.field,
                        description: fieldChange.description,
                        urgent: fieldChange.isStatusChange
                    }
                });
            }
        }
        
        return mainChangeId;
    }
    
    /**
     * Records a task deletion
     */
    recordTaskDeleted(goalId: string, task: Task): string {
        return this.recordChange({
            type: ChangeType.TASK_DELETED,
            goalId,
            taskId: task.id,
            previousValue: task,
            metadata: {
                description: `Deleted task: ${task.title}`,
                urgent: true // Deletions are urgent
            }
        });
    }
    
    /**
     * Records a bulk operation
     */
    recordBulkOperation(description: string, affectedGoalIds: string[], changes: number): string {
        return this.recordChange({
            type: ChangeType.BULK_OPERATION,
            goalId: affectedGoalIds[0] || 'multiple', // Use first goal or 'multiple'
            metadata: {
                description,
                urgent: true, // Bulk operations are typically urgent
                affectedGoals: affectedGoalIds,
                changeCount: changes
            }
        });
    }
    
    /**
     * Gets all pending changes
     */
    getPendingChanges(): ChangeEvent[] {
        return [...this.changes];
    }
    
    /**
     * Gets changes filtered by criteria
     */
    getChanges(filter?: {
        type?: ChangeType;
        goalId?: string;
        taskId?: string;
        since?: Date;
        urgent?: boolean;
    }): ChangeEvent[] {
        let filtered = this.changes;
        
        if (filter) {
            if (filter.type) {
                filtered = filtered.filter(c => c.type === filter.type);
            }
            if (filter.goalId) {
                filtered = filtered.filter(c => c.goalId === filter.goalId);
            }
            if (filter.taskId) {
                filtered = filtered.filter(c => c.taskId === filter.taskId);
            }
            if (filter.since) {
                filtered = filtered.filter(c => c.timestamp >= filter.since!);
            }
            if (filter.urgent !== undefined) {
                filtered = filtered.filter(c => !!c.metadata?.urgent === filter.urgent);
            }
        }
        
        return filtered;
    }
    
    /**
     * Gets all batches
     */
    getBatches(): ChangeBatch[] {
        return [...this.batches];
    }
    
    /**
     * Gets statistics about tracked changes
     */
    getStatistics(): ChangeStatistics {
        const changesByType: Record<ChangeType, number> = {} as any;
        
        // Initialize all change types to 0
        Object.values(ChangeType).forEach(type => {
            changesByType[type] = 0;
        });
        
        // Count changes by type
        this.changes.forEach(change => {
            changesByType[change.type]++;
        });
        
        return {
            totalChanges: this.changes.length,
            pendingChanges: this.changes.length, // All tracked changes are pending until cleared
            totalBatches: this.batches.length,
            changesByType,
            lastChangeTime: this.changes.length > 0 ? this.changes[this.changes.length - 1].timestamp : undefined,
            averageChangesPerBatch: this.batches.length > 0 ? 
                this.batches.reduce((sum, batch) => sum + batch.changes.length, 0) / this.batches.length : 0
        };
    }
    
    /**
     * Checks if there are urgent changes that need immediate saving
     */
    hasUrgentChanges(): boolean {
        return this.changes.some(change => change.metadata?.urgent === true);
    }
    
    /**
     * Clears all tracked changes (called after successful save)
     */
    clearChanges(): void {
        const clearedCount = this.changes.length;
        this.changes = [];
        
        if (this.currentBatch) {
            this.endBatch();
        }
        
        if (this.config.enableLogging && clearedCount > 0) {
            this.logger.debug(`Cleared ${clearedCount} tracked changes`);
        }
    }
    
    /**
     * Updates configuration
     */
    updateConfig(newConfig: Partial<ChangeTrackerConfig>): void {
        this.config = { ...this.config, ...newConfig };
    }
    
    // Private helper methods
    
    private recordChange(change: Partial<ChangeEvent> & { type: ChangeType; goalId: string }): string {
        const changeId = `change_${this.nextChangeId++}`;
        const fullChange: ChangeEvent = {
            id: changeId,
            timestamp: new Date(),
            ...change
        };
        
        this.changes.push(fullChange);
        
        // Add to current batch if active
        if (this.currentBatch) {
            this.currentBatch.changes.push(fullChange);
            this.currentBatch.updatedAt = new Date();
            
            if (fullChange.metadata?.urgent) {
                this.currentBatch.hasUrgentChanges = true;
            }
            
            if (fullChange.metadata?.batchId === undefined) {
                fullChange.metadata = {
                    ...fullChange.metadata,
                    batchId: this.currentBatch.id
                };
            }
        }
        
        // Auto-batch if configured and no current batch
        if (this.config.autoBatch && !this.currentBatch) {
            this.startBatch('Auto-batch');
            setTimeout(() => this.endBatch(), this.config.batchWindow);
        }
        
        if (this.config.enableLogging) {
            this.logger.debug(`Recorded change: ${fullChange.type} for goal ${fullChange.goalId}`);
        }
        
        return changeId;
    }
    
    private detectGoalChanges(previous: Goal, current: Goal): Array<{
        field: string;
        previousValue: any;
        newValue: any;
        description: string;
        isStatusChange: boolean;
    }> {
        const changes = [];
        
        if (previous.title !== current.title) {
            changes.push({
                field: 'title',
                previousValue: previous.title,
                newValue: current.title,
                description: `Title changed: "${previous.title}" -> "${current.title}"`,
                isStatusChange: false
            });
        }
        
        if (previous.description !== current.description) {
            changes.push({
                field: 'description',
                previousValue: previous.description,
                newValue: current.description,
                description: 'Description updated',
                isStatusChange: false
            });
        }
        
        if (previous.status !== current.status) {
            changes.push({
                field: 'status',
                previousValue: previous.status,
                newValue: current.status,
                description: `Status changed: ${previous.status} -> ${current.status}`,
                isStatusChange: true
            });
        }
        
        if (previous.parentId !== current.parentId) {
            changes.push({
                field: 'parentId',
                previousValue: previous.parentId,
                newValue: current.parentId,
                description: `Parent changed: ${previous.parentId || 'none'} -> ${current.parentId || 'none'}`,
                isStatusChange: false
            });
        }
        
        return changes;
    }
    
    private detectTaskChanges(previous: Task, current: Task): Array<{
        field: string;
        previousValue: any;
        newValue: any;
        description: string;
        isStatusChange: boolean;
    }> {
        const changes = [];
        
        if (previous.title !== current.title) {
            changes.push({
                field: 'title',
                previousValue: previous.title,
                newValue: current.title,
                description: `Task title changed: "${previous.title}" -> "${current.title}"`,
                isStatusChange: false
            });
        }
        
        if (previous.description !== current.description) {
            changes.push({
                field: 'description',
                previousValue: previous.description,
                newValue: current.description,
                description: 'Task description updated',
                isStatusChange: false
            });
        }
        
        if (previous.status !== current.status) {
            changes.push({
                field: 'status',
                previousValue: previous.status,
                newValue: current.status,
                description: `Task status changed: ${previous.status} -> ${current.status}`,
                isStatusChange: true
            });
        }
        
        if (previous.order !== current.order) {
            changes.push({
                field: 'order',
                previousValue: previous.order,
                newValue: current.order,
                description: `Task order changed: ${previous.order} -> ${current.order}`,
                isStatusChange: false
            });
        }
        
        return changes;
    }
    
    private cleanup(): void {
        const now = Date.now();
        const maxAge = this.config.maxAge;
        
        // Remove old changes
        const initialCount = this.changes.length;
        this.changes = this.changes.filter(change => 
            (now - change.timestamp.getTime()) < maxAge
        );
        
        // Remove old batches
        this.batches = this.batches.filter(batch => 
            (now - batch.createdAt.getTime()) < maxAge
        );
        
        // Enforce max changes limit
        if (this.changes.length > this.config.maxChanges) {
            this.changes = this.changes.slice(-this.config.maxChanges);
        }
        
        const cleaned = initialCount - this.changes.length;
        if (cleaned > 0 && this.config.enableLogging) {
            this.logger.debug(`Cleaned up ${cleaned} old change records`);
        }
    }
}