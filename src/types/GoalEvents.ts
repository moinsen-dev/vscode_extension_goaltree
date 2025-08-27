/**
 * Goal event types for the Goal Tree extension
 * This file defines event interfaces for the goal event system
 */

import { Goal, Task, GoalStatusType, TaskStatusType } from './Goal';

/**
 * Event types that can occur in the goal system
 */
export enum GoalEventType {
  /** Goal was created */
  GOAL_CREATED = 'goal_created',
  
  /** Goal was updated */
  GOAL_UPDATED = 'goal_updated',
  
  /** Goal was deleted */
  GOAL_DELETED = 'goal_deleted',
  
  /** Goal status changed */
  GOAL_STATUS_CHANGED = 'goal_status_changed',
  
  /** Goal was moved to different parent */
  GOAL_MOVED = 'goal_moved',
  
  /** Task was added to goal */
  TASK_ADDED = 'task_added',
  
  /** Task was updated */
  TASK_UPDATED = 'task_updated',
  
  /** Task was deleted */
  TASK_DELETED = 'task_deleted',
  
  /** Task status changed */
  TASK_STATUS_CHANGED = 'task_status_changed',
  
  /** Goal dependency was added */
  DEPENDENCY_ADDED = 'dependency_added',
  
  /** Goal dependency was removed */
  DEPENDENCY_REMOVED = 'dependency_removed',
  
  /** Goal tree was refreshed */
  TREE_REFRESHED = 'tree_refreshed'
}

/**
 * Type alias for goal event type string values
 */
export type GoalEventTypeType = `${GoalEventType}`;

/**
 * Base event interface
 */
export interface BaseGoalEvent {
  /** Unique event identifier */
  id: string;
  
  /** Type of event */
  type: GoalEventTypeType;
  
  /** When the event occurred */
  timestamp: Date;
  
  /** Source of the event (e.g., user action, system trigger) */
  source: 'user' | 'system' | 'external';
  
  /** Optional metadata */
  metadata?: Record<string, any>;
}

/**
 * Goal created event
 */
export interface GoalCreatedEvent extends BaseGoalEvent {
  type: typeof GoalEventType.GOAL_CREATED;
  data: {
    goal: Goal;
  };
}

/**
 * Goal updated event
 */
export interface GoalUpdatedEvent extends BaseGoalEvent {
  type: typeof GoalEventType.GOAL_UPDATED;
  data: {
    goal: Goal;
    previousState: Partial<Goal>;
    changes: string[];
  };
}

/**
 * Goal deleted event
 */
export interface GoalDeletedEvent extends BaseGoalEvent {
  type: typeof GoalEventType.GOAL_DELETED;
  data: {
    goalId: string;
    goal: Goal; // Snapshot before deletion
  };
}

/**
 * Goal status changed event
 */
export interface GoalStatusChangedEvent extends BaseGoalEvent {
  type: typeof GoalEventType.GOAL_STATUS_CHANGED;
  data: {
    goalId: string;
    previousStatus: GoalStatusType;
    newStatus: GoalStatusType;
    goal: Goal;
  };
}

/**
 * Goal moved event
 */
export interface GoalMovedEvent extends BaseGoalEvent {
  type: typeof GoalEventType.GOAL_MOVED;
  data: {
    goalId: string;
    previousParentId?: string;
    newParentId?: string;
    goal: Goal;
  };
}

/**
 * Task added event
 */
export interface TaskAddedEvent extends BaseGoalEvent {
  type: typeof GoalEventType.TASK_ADDED;
  data: {
    goalId: string;
    task: Task;
    goal: Goal;
  };
}

/**
 * Task updated event
 */
export interface TaskUpdatedEvent extends BaseGoalEvent {
  type: typeof GoalEventType.TASK_UPDATED;
  data: {
    goalId: string;
    task: Task;
    previousState: Partial<Task>;
    changes: string[];
    goal: Goal;
  };
}

/**
 * Task deleted event
 */
export interface TaskDeletedEvent extends BaseGoalEvent {
  type: typeof GoalEventType.TASK_DELETED;
  data: {
    goalId: string;
    taskId: string;
    task: Task; // Snapshot before deletion
    goal: Goal;
  };
}

/**
 * Task status changed event
 */
export interface TaskStatusChangedEvent extends BaseGoalEvent {
  type: typeof GoalEventType.TASK_STATUS_CHANGED;
  data: {
    goalId: string;
    taskId: string;
    previousStatus: TaskStatusType;
    newStatus: TaskStatusType;
    task: Task;
    goal: Goal;
  };
}

/**
 * Dependency added event
 */
export interface DependencyAddedEvent extends BaseGoalEvent {
  type: typeof GoalEventType.DEPENDENCY_ADDED;
  data: {
    blockedGoalId: string;
    blockingGoalId: string;
    blockedGoal: Goal;
    blockingGoal: Goal;
  };
}

/**
 * Dependency removed event
 */
export interface DependencyRemovedEvent extends BaseGoalEvent {
  type: typeof GoalEventType.DEPENDENCY_REMOVED;
  data: {
    blockedGoalId: string;
    blockingGoalId: string;
    blockedGoal: Goal;
    blockingGoal: Goal;
  };
}

/**
 * Tree refreshed event
 */
export interface TreeRefreshedEvent extends BaseGoalEvent {
  type: typeof GoalEventType.TREE_REFRESHED;
  data: {
    goalCount: number;
    rootGoalIds: string[];
  };
}

/**
 * Union type of all goal events
 */
export type GoalEvent = 
  | GoalCreatedEvent
  | GoalUpdatedEvent
  | GoalDeletedEvent
  | GoalStatusChangedEvent
  | GoalMovedEvent
  | TaskAddedEvent
  | TaskUpdatedEvent
  | TaskDeletedEvent
  | TaskStatusChangedEvent
  | DependencyAddedEvent
  | DependencyRemovedEvent
  | TreeRefreshedEvent;

/**
 * Event handler function type
 */
export type GoalEventHandler<T extends GoalEvent = GoalEvent> = (event: T) => void | Promise<void>;

/**
 * Event listener registration
 */
export interface GoalEventListener {
  /** Event types to listen for */
  eventTypes: GoalEventTypeType[];
  
  /** Handler function */
  handler: GoalEventHandler;
  
  /** Optional listener identifier */
  id?: string;
  
  /** Whether this is a one-time listener */
  once?: boolean;
}

/**
 * Event emitter interface for goals
 */
export interface GoalEventEmitter {
  /**
   * Emit an event
   */
  emit<T extends GoalEvent>(event: T): Promise<void>;
  
  /**
   * Register an event listener
   */
  on<T extends GoalEvent>(
    eventType: T['type'] | T['type'][],
    handler: GoalEventHandler<T>
  ): void;
  
  /**
   * Register a one-time event listener
   */
  once<T extends GoalEvent>(
    eventType: T['type'],
    handler: GoalEventHandler<T>
  ): void;
  
  /**
   * Remove an event listener
   */
  off<T extends GoalEvent>(
    eventType: T['type'] | T['type'][],
    handler: GoalEventHandler<T>
  ): void;
  
  /**
   * Remove all event listeners for a given type
   */
  removeAllListeners(eventType?: GoalEventTypeType): void;
  
  /**
   * Get list of event types that have listeners
   */
  listenerEventTypes(): GoalEventTypeType[];
}

/**
 * Event store interface for persisting events
 */
export interface GoalEventStore {
  /**
   * Store an event
   */
  store(event: GoalEvent): Promise<void>;
  
  /**
   * Retrieve events by criteria
   */
  getEvents(criteria: {
    eventTypes?: GoalEventTypeType[];
    goalIds?: string[];
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<GoalEvent[]>;
  
  /**
   * Get events for a specific goal
   */
  getGoalEvents(goalId: string, eventTypes?: GoalEventTypeType[]): Promise<GoalEvent[]>;
  
  /**
   * Clear old events (for cleanup)
   */
  clearOldEvents(beforeDate: Date): Promise<number>;
}

/**
 * Utility functions for working with goal events
 */
export const GoalEventUtils = {
  /**
   * Create a unique event ID
   */
  generateEventId(): string {
    return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  },

  /**
   * Check if event is goal-related
   */
  isGoalEvent(event: GoalEvent): event is GoalCreatedEvent | GoalUpdatedEvent | GoalDeletedEvent | GoalStatusChangedEvent | GoalMovedEvent {
    return [
      GoalEventType.GOAL_CREATED,
      GoalEventType.GOAL_UPDATED,
      GoalEventType.GOAL_DELETED,
      GoalEventType.GOAL_STATUS_CHANGED,
      GoalEventType.GOAL_MOVED
    ].includes(event.type);
  },

  /**
   * Check if event is task-related
   */
  isTaskEvent(event: GoalEvent): event is TaskAddedEvent | TaskUpdatedEvent | TaskDeletedEvent | TaskStatusChangedEvent {
    return [
      GoalEventType.TASK_ADDED,
      GoalEventType.TASK_UPDATED,
      GoalEventType.TASK_DELETED,
      GoalEventType.TASK_STATUS_CHANGED
    ].includes(event.type);
  },

  /**
   * Check if event is dependency-related
   */
  isDependencyEvent(event: GoalEvent): event is DependencyAddedEvent | DependencyRemovedEvent {
    return [
      GoalEventType.DEPENDENCY_ADDED,
      GoalEventType.DEPENDENCY_REMOVED
    ].includes(event.type);
  },

  /**
   * Extract goal ID from event data
   */
  extractGoalId(event: GoalEvent): string | undefined {
    switch (event.type) {
      case GoalEventType.GOAL_CREATED:
      case GoalEventType.GOAL_UPDATED:
        return event.data.goal?.id;
      case GoalEventType.GOAL_STATUS_CHANGED:
      case GoalEventType.GOAL_MOVED:
        return event.data.goalId || event.data.goal?.id;
      case GoalEventType.GOAL_DELETED:
        return event.data.goalId;
      case GoalEventType.TASK_ADDED:
      case GoalEventType.TASK_UPDATED:
      case GoalEventType.TASK_DELETED:
      case GoalEventType.TASK_STATUS_CHANGED:
        return event.data.goalId;
      case GoalEventType.DEPENDENCY_ADDED:
      case GoalEventType.DEPENDENCY_REMOVED:
        return event.data.blockedGoalId; // Could also be blockingGoalId
      default:
        return undefined;
    }
  },

  /**
   * Get human-readable event description
   */
  getEventDescription(event: GoalEvent): string {
    switch (event.type) {
      case GoalEventType.GOAL_CREATED:
        return `Goal "${event.data.goal.title}" was created`;
      case GoalEventType.GOAL_UPDATED:
        return `Goal "${event.data.goal.title}" was updated`;
      case GoalEventType.GOAL_DELETED:
        return `Goal "${event.data.goal.title}" was deleted`;
      case GoalEventType.GOAL_STATUS_CHANGED:
        return `Goal status changed from ${event.data.previousStatus} to ${event.data.newStatus}`;
      case GoalEventType.GOAL_MOVED:
        return `Goal "${event.data.goal.title}" was moved to different parent`;
      case GoalEventType.TASK_ADDED:
        return `Task "${event.data.task.title}" was added`;
      case GoalEventType.TASK_UPDATED:
        return `Task "${event.data.task.title}" was updated`;
      case GoalEventType.TASK_DELETED:
        return `Task "${event.data.task.title}" was deleted`;
      case GoalEventType.TASK_STATUS_CHANGED:
        return `Task status changed from ${event.data.previousStatus} to ${event.data.newStatus}`;
      case GoalEventType.DEPENDENCY_ADDED:
        return `Dependency added between goals`;
      case GoalEventType.DEPENDENCY_REMOVED:
        return `Dependency removed between goals`;
      case GoalEventType.TREE_REFRESHED:
        return `Goal tree refreshed (${event.data.goalCount} goals)`;
      default:
        return 'Unknown event';
    }
  }
};