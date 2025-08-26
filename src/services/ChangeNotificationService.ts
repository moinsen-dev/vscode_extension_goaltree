/**
 * Change notification service using VS Code EventEmitter for real-time updates
 * Provides event-driven architecture for coordinating between auto-save and UI updates
 */

import * as vscode from 'vscode';
import { Goal } from '../models/goal';
import { ChangeEvent, ChangeBatch, ChangeType } from './change-tracker';
import { createLogger } from '../utils/logger';

/**
 * Generic event payload structure
 */
export interface EventPayload<T = any> {
    /** Event type identifier */
    type: string;
    /** Event data */
    data: T;
    /** Event timestamp */
    timestamp: Date;
}

/**
 * Specific event data types
 */
export interface ChangeEventData {
    change: ChangeEvent;
}

export interface GoalCreatedData {
    goal: Goal;
    change: ChangeEvent;
}

export interface GoalUpdatedData {
    goalId: string;
    previousGoal: Goal;
    newGoal: Goal;
    change: ChangeEvent;
}

export interface GoalDeletedData {
    goal: Goal;
    change: ChangeEvent;
}

export interface GoalStatusChangedData {
    goalId: string;
    previousStatus: string;
    newStatus: string;
    change: ChangeEvent;
}

export interface GoalHierarchyChangedData {
    goalId: string;
    previousParentId?: string;
    newParentId?: string;
    change: ChangeEvent;
}

export interface TaskCreatedData {
    goalId: string;
    task: any;
    change: ChangeEvent;
}

export interface TaskUpdatedData {
    goalId: string;
    taskId: string;
    previousTask: any;
    newTask: any;
    change: ChangeEvent;
}

export interface TaskDeletedData {
    goalId: string;
    task: any;
    change: ChangeEvent;
}

export interface TaskStatusChangedData {
    goalId: string;
    taskId: string;
    previousStatus: string;
    newStatus: string;
    change: ChangeEvent;
}

export interface TaskReorderedData {
    goalId: string;
    taskId: string;
    previousOrder: number;
    newOrder: number;
    change: ChangeEvent;
}

export interface BulkOperationData {
    description: string;
    affectedGoalIds: string[];
    changeCount: number;
    change: ChangeEvent;
}

export interface BatchStartedData {
    batchId: string;
    description: string;
}

export interface BatchEndedData {
    batch: ChangeBatch;
}

export interface SaveTriggeredData {
    reason: string;
    changeCount: number;
    urgent: boolean;
}

export interface SaveStartedData {
    changeCount: number;
    urgent: boolean;
}

export interface SaveCompletedData {
    changeCount: number;
    duration: number;
    dataSize: number;
}

export interface SaveFailedData {
    error: string;
    changeCount: number;
    duration: number;
}

export interface SaveCancelledData {
    reason: string;
    changeCount: number;
}

export interface NotificationData {
    level: 'info' | 'warning' | 'error';
    message: string;
    details?: any;
}

/**
 * Event type constants
 */
export const EventTypes = {
    CHANGE: 'change',
    GOAL_CREATED: 'goal:created',
    GOAL_UPDATED: 'goal:updated',
    GOAL_DELETED: 'goal:deleted',
    GOAL_STATUS_CHANGED: 'goal:status-changed',
    GOAL_HIERARCHY_CHANGED: 'goal:hierarchy-changed',
    TASK_CREATED: 'task:created',
    TASK_UPDATED: 'task:updated',
    TASK_DELETED: 'task:deleted',
    TASK_STATUS_CHANGED: 'task:status-changed',
    TASK_REORDERED: 'task:reordered',
    BULK_OPERATION: 'bulk:operation',
    BATCH_STARTED: 'batch:started',
    BATCH_ENDED: 'batch:ended',
    SAVE_TRIGGERED: 'save:triggered',
    SAVE_STARTED: 'save:started',
    SAVE_COMPLETED: 'save:completed',
    SAVE_FAILED: 'save:failed',
    SAVE_CANCELLED: 'save:cancelled',
    NOTIFICATION: 'notification'
} as const;

/**
 * Type-safe event emitter for change notifications
 */
export class ChangeNotificationService extends vscode.EventEmitter<EventPayload> {
    private static instance: ChangeNotificationService;
    private logger = createLogger('ChangeNotificationService');
    private eventStats = new Map<string, number>();
    private listeners = new Map<string, Set<vscode.Disposable>>();
    
    private constructor() {
        super();
        this.setupEventLogging();
    }
    
    /**
     * Gets the singleton instance of ChangeNotificationService
     */
    static getInstance(): ChangeNotificationService {
        if (!ChangeNotificationService.instance) {
            ChangeNotificationService.instance = new ChangeNotificationService();
        }
        return ChangeNotificationService.instance;
    }
    
    /**
     * Fires a change event for any type of change
     */
    notifyChange(change: ChangeEvent): void {
        this.fireEvent(EventTypes.CHANGE, { change });
        
        // Fire specific event based on change type
        switch (change.type) {
            case ChangeType.GOAL_CREATED:
                if (change.newValue) {
                    this.fireEvent(EventTypes.GOAL_CREATED, {
                        goal: change.newValue,
                        change
                    });
                }
                break;
                
            case ChangeType.GOAL_UPDATED:
                if (change.previousValue && change.newValue) {
                    this.fireEvent(EventTypes.GOAL_UPDATED, {
                        goalId: change.goalId,
                        previousGoal: change.previousValue,
                        newGoal: change.newValue,
                        change
                    });
                }
                break;
                
            case ChangeType.GOAL_DELETED:
                if (change.previousValue) {
                    this.fireEvent(EventTypes.GOAL_DELETED, {
                        goal: change.previousValue,
                        change
                    });
                }
                break;
                
            case ChangeType.GOAL_STATUS_CHANGED:
                this.fireEvent(EventTypes.GOAL_STATUS_CHANGED, {
                    goalId: change.goalId,
                    previousStatus: change.previousValue,
                    newStatus: change.newValue,
                    change
                });
                break;
                
            case ChangeType.GOAL_HIERARCHY_CHANGED:
                this.fireEvent(EventTypes.GOAL_HIERARCHY_CHANGED, {
                    goalId: change.goalId,
                    previousParentId: change.previousValue,
                    newParentId: change.newValue,
                    change
                });
                break;
                
            case ChangeType.TASK_CREATED:
                if (change.newValue && change.taskId) {
                    this.fireEvent(EventTypes.TASK_CREATED, {
                        goalId: change.goalId,
                        task: change.newValue,
                        change
                    });
                }
                break;
                
            case ChangeType.TASK_UPDATED:
                if (change.previousValue && change.newValue && change.taskId) {
                    this.fireEvent(EventTypes.TASK_UPDATED, {
                        goalId: change.goalId,
                        taskId: change.taskId,
                        previousTask: change.previousValue,
                        newTask: change.newValue,
                        change
                    });
                }
                break;
                
            case ChangeType.TASK_DELETED:
                if (change.previousValue && change.taskId) {
                    this.fireEvent(EventTypes.TASK_DELETED, {
                        goalId: change.goalId,
                        task: change.previousValue,
                        change
                    });
                }
                break;
                
            case ChangeType.TASK_STATUS_CHANGED:
                if (change.taskId) {
                    this.fireEvent(EventTypes.TASK_STATUS_CHANGED, {
                        goalId: change.goalId,
                        taskId: change.taskId,
                        previousStatus: change.previousValue,
                        newStatus: change.newValue,
                        change
                    });
                }
                break;
                
            case ChangeType.TASK_REORDERED:
                if (change.taskId) {
                    this.fireEvent(EventTypes.TASK_REORDERED, {
                        goalId: change.goalId,
                        taskId: change.taskId,
                        previousOrder: change.previousValue,
                        newOrder: change.newValue,
                        change
                    });
                }
                break;
                
            case ChangeType.BULK_OPERATION:
                this.fireEvent(EventTypes.BULK_OPERATION, {
                    description: change.metadata?.description || 'Bulk operation',
                    affectedGoalIds: change.metadata?.affectedGoals || [change.goalId],
                    changeCount: change.metadata?.changeCount || 1,
                    change
                });
                break;
        }
    }
    
    /**
     * Notifies about batch operations
     */
    notifyBatchStarted(batchId: string, description: string): void {
        this.fireEvent(EventTypes.BATCH_STARTED, { batchId, description });
        this.logger.debug(`Batch started: ${description}`);
    }
    
    notifyBatchEnded(batch: ChangeBatch): void {
        this.fireEvent(EventTypes.BATCH_ENDED, { batch });
        this.logger.debug(`Batch ended: ${batch.description} with ${batch.changes.length} changes`);
    }
    
    /**
     * Notifies about save operations
     */
    notifySaveTriggered(reason: string, changeCount: number, urgent: boolean = false): void {
        this.fireEvent(EventTypes.SAVE_TRIGGERED, { reason, changeCount, urgent });
        this.logger.debug(`Auto-save triggered: ${reason} (${changeCount} changes, urgent: ${urgent})`);
    }
    
    notifySaveStarted(changeCount: number, urgent: boolean = false): void {
        this.fireEvent(EventTypes.SAVE_STARTED, { changeCount, urgent });
        this.logger.debug(`Auto-save started: ${changeCount} changes (urgent: ${urgent})`);
    }
    
    notifySaveCompleted(changeCount: number, duration: number, dataSize: number): void {
        this.fireEvent(EventTypes.SAVE_COMPLETED, { changeCount, duration, dataSize });
        this.logger.info(`Auto-save completed: ${changeCount} changes in ${duration}ms (${dataSize} bytes)`);
    }
    
    notifySaveFailed(error: string, changeCount: number, duration: number): void {
        this.fireEvent(EventTypes.SAVE_FAILED, { error, changeCount, duration });
        this.logger.error(`Auto-save failed: ${error} (${changeCount} changes, ${duration}ms)`);
    }
    
    notifySaveCancelled(reason: string, changeCount: number): void {
        this.fireEvent(EventTypes.SAVE_CANCELLED, { reason, changeCount });
        this.logger.debug(`Auto-save cancelled: ${reason} (${changeCount} changes)`);
    }
    
    /**
     * Sends general notifications
     */
    notify(level: 'info' | 'warning' | 'error', message: string, details?: any): void {
        this.fireEvent(EventTypes.NOTIFICATION, { level, message, details });
        
        switch (level) {
            case 'info':
                this.logger.info(message, details);
                break;
            case 'warning':
                this.logger.warn(message, details);
                break;
            case 'error':
                this.logger.error(message, details);
                break;
        }
    }
    
    /**
     * Creates a typed event listener with automatic cleanup tracking
     */
    onEvent<T = any>(
        eventType: string,
        listener: (data: T) => void,
        thisArg?: any,
        disposables?: vscode.Disposable[]
    ): vscode.Disposable {
        const wrappedListener = (payload: EventPayload) => {
            if (payload.type === eventType) {
                listener.call(thisArg, payload.data);
            }
        };
        
        const disposable = this.event(wrappedListener, thisArg, disposables);
        
        // Track the listener for statistics
        if (!this.listeners.has(eventType)) {
            this.listeners.set(eventType, new Set());
        }
        this.listeners.get(eventType)!.add(disposable);
        
        // Create a wrapped disposable that removes tracking
        return {
            dispose: () => {
                disposable.dispose();
                this.listeners.get(eventType)?.delete(disposable);
            }
        };
    }
    
    /**
     * Creates multiple event listeners and returns a disposable that cleans up all of them
     */
    onEvents(
        eventMap: Record<string, (data: any) => void>,
        thisArg?: any
    ): vscode.Disposable {
        const disposables: vscode.Disposable[] = [];
        
        for (const [eventType, listener] of Object.entries(eventMap)) {
            if (listener) {
                disposables.push(
                    this.onEvent(eventType, listener, thisArg)
                );
            }
        }
        
        return {
            dispose: () => {
                disposables.forEach(d => d.dispose());
            }
        };
    }
    
    /**
     * Gets statistics about event emission and listeners
     */
    getStatistics(): {
        eventStats: Record<string, number>;
        listenerCounts: Record<string, number>;
        totalEvents: number;
        totalListeners: number;
    } {
        const eventStats: Record<string, number> = {};
        const listenerCounts: Record<string, number> = {};
        let totalEvents = 0;
        let totalListeners = 0;
        
        // Convert event stats
        for (const [event, count] of this.eventStats.entries()) {
            eventStats[event] = count;
            totalEvents += count;
        }
        
        // Convert listener counts
        for (const [event, listeners] of this.listeners.entries()) {
            listenerCounts[event] = listeners.size;
            totalListeners += listeners.size;
        }
        
        return {
            eventStats,
            listenerCounts,
            totalEvents,
            totalListeners
        };
    }
    
    /**
     * Resets all statistics
     */
    resetStatistics(): void {
        this.eventStats.clear();
        this.logger.debug('Event statistics reset');
    }
    
    /**
     * Disposes all listeners and cleans up resources
     */
    override dispose(): void {
        // Dispose all tracked listeners
        for (const listeners of this.listeners.values()) {
            for (const disposable of listeners) {
                disposable.dispose();
            }
        }
        this.listeners.clear();
        
        // Call parent dispose
        super.dispose();
        
        this.logger.debug('ChangeNotificationService disposed');
    }
    
    // Private helper methods
    
    /**
     * Fires an event with the given type and data
     */
    private fireEvent(type: string, data: any): void {
        const payload: EventPayload = {
            type,
            data,
            timestamp: new Date()
        };
        
        this.fire(payload);
        this.incrementEventStat(type);
    }
    
    private setupEventLogging(): void {
        // Log significant events at debug level
        this.onEvent<SaveFailedData>(EventTypes.SAVE_FAILED, (data) => {
            this.logger.error(`Save failed: ${data.error}`, { 
                changeCount: data.changeCount,
                duration: data.duration 
            });
        });
        
        this.onEvent<SaveCompletedData>(EventTypes.SAVE_COMPLETED, (data) => {
            if (data.changeCount > 10) {
                this.logger.info(`Large save completed: ${data.changeCount} changes`, data);
            }
        });
        
        this.onEvent<BulkOperationData>(EventTypes.BULK_OPERATION, (data) => {
            this.logger.debug(`Bulk operation: ${data.description}`, {
                affectedGoals: data.affectedGoalIds.length,
                changes: data.changeCount
            });
        });
    }
    
    private incrementEventStat(eventType: string): void {
        const current = this.eventStats.get(eventType) || 0;
        this.eventStats.set(eventType, current + 1);
    }
}

/**
 * Utility functions for working with change notifications
 */
export class ChangeNotificationUtils {
    /**
     * Creates a debounced event listener that batches rapid events
     */
    static createDebouncedListener<T>(
        service: ChangeNotificationService,
        eventType: string,
        handler: (events: T[]) => void,
        delay: number = 100
    ): vscode.Disposable {
        let timeoutId: NodeJS.Timeout | undefined;
        let events: T[] = [];
        
        const disposable = service.onEvent<T>(eventType, (data) => {
            events.push(data);
            
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            
            timeoutId = setTimeout(() => {
                if (events.length > 0) {
                    handler([...events]);
                    events = [];
                }
                timeoutId = undefined;
            }, delay);
        });
        
        return {
            dispose: () => {
                if (timeoutId) {
                    clearTimeout(timeoutId);
                    // Process remaining events
                    if (events.length > 0) {
                        handler([...events]);
                    }
                }
                disposable.dispose();
            }
        };
    }
    
    /**
     * Creates a filtered event listener that only processes events matching criteria
     */
    static createFilteredListener<T>(
        service: ChangeNotificationService,
        eventType: string,
        filter: (data: T) => boolean,
        handler: (data: T) => void
    ): vscode.Disposable {
        return service.onEvent<T>(eventType, (data) => {
            if (filter(data)) {
                handler(data);
            }
        });
    }
    
    /**
     * Creates a one-time event listener that automatically disposes after first trigger
     */
    static createOnceListener<T>(
        service: ChangeNotificationService,
        eventType: string,
        handler: (data: T) => void
    ): vscode.Disposable {
        let disposable: vscode.Disposable;
        
        disposable = service.onEvent<T>(eventType, (data) => {
            handler(data);
            disposable.dispose();
        });
        
        return disposable;
    }
}