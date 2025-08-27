/**
 * Core Goal types for the Goal Tree extension
 * This file defines the fundamental Goal interface and related types
 */

import { GoalStatus, GoalStatusType } from './GoalStatus';

/**
 * Task status enumeration
 */
export enum TaskStatus {
  /** Task is planned but not started */
  TODO = 'todo',
  
  /** Task is currently being worked on */
  IN_PROGRESS = 'in-progress',
  
  /** Task has been completed */
  DONE = 'done'
}

/**
 * Type alias for task status string values
 */
export type TaskStatusType = `${TaskStatus}`;

/**
 * Task interface representing individual actionable items within goals
 */
export interface Task {
  /** Unique identifier for the task */
  id: string;
  
  /** Task title/description */
  title: string;
  
  /** Current status of the task */
  status: TaskStatusType;
  
  /** Order/priority within the parent goal (0-based) */
  order: number;
  
  /** When the task was created */
  createdAt: Date;
  
  /** When the task was completed (if status is 'done') */
  completedAt?: Date;
  
  /** Optional detailed description or notes */
  description?: string;
}

/**
 * Core Goal interface representing hierarchical goals with basic relationships
 */
export interface Goal {
  /** Unique identifier for the goal */
  id: string;
  
  /** Goal title */
  title: string;
  
  /** Optional detailed description */
  description?: string;
  
  /** Current status of the goal */
  status: GoalStatusType;
  
  /** ID of parent goal (undefined for root goals) */
  parentId?: string;
  
  /** Array of goal IDs that must be completed before this goal can proceed */
  blockedByIds: string[];
  
  /** Tasks associated with this goal */
  tasks: Task[];
  
  /** When the goal was created */
  createdAt: Date;
  
  /** When the goal was last updated */
  updatedAt?: Date;
  
  /** When the goal was completed (if status is 'completed') */
  completedAt?: Date;
  
  /** Optional metadata for extensibility */
  metadata?: {
    /** Color coding for visual organization */
    color?: string;
    
    /** Priority level (1-5, where 5 is highest) */
    priority?: number;
    
    /** Estimated effort in hours */
    estimatedHours?: number;
    
    /** Actual time spent in hours */
    actualHours?: number;
    
    /** Tags for categorization */
    tags?: string[];
    
    /** Due date for the goal */
    dueDate?: Date;
  };
}

/**
 * Goal creation parameters (subset of Goal interface)
 */
export interface CreateGoalParams {
  title: string;
  description?: string;
  parentId?: string;
  metadata?: Goal['metadata'];
}

/**
 * Goal update parameters
 */
export interface UpdateGoalParams {
  title?: string;
  description?: string;
  status?: GoalStatusType;
  parentId?: string;
  blockedByIds?: string[];
  metadata?: Goal['metadata'];
}

/**
 * Task creation parameters
 */
export interface CreateTaskParams {
  title: string;
  description?: string;
}

/**
 * Task update parameters
 */
export interface UpdateTaskParams {
  title?: string;
  description?: string;
  status?: TaskStatusType;
  order?: number;
}

/**
 * Goal hierarchy information
 */
export interface GoalHierarchy {
  /** The goal itself */
  goal: Goal;
  
  /** Direct children of this goal */
  children: GoalHierarchy[];
  
  /** Depth level in the hierarchy (0 for root goals) */
  level: number;
  
  /** Path from root to this goal (array of goal IDs) */
  path: string[];
}

/**
 * Goal relationship information
 */
export interface GoalRelationship {
  /** The goal that is blocked */
  blockedGoal: Goal;
  
  /** The goal that is doing the blocking */
  blockingGoal: Goal;
  
  /** Whether this is a direct or transitive relationship */
  isDirect: boolean;
}

/**
 * Bulk operation result
 */
export interface BulkOperationResult {
  /** Number of successful operations */
  successful: number;
  
  /** Number of failed operations */
  failed: number;
  
  /** Array of error messages for failed operations */
  errors: string[];
  
  /** Details of the operations performed */
  details: Array<{
    goalId: string;
    operation: string;
    success: boolean;
    error?: string;
  }>;
}

/**
 * Helper functions for working with goals
 */
export const GoalUtils = {
  /**
   * Check if a goal is a root goal (has no parent)
   */
  isRootGoal(goal: Goal): boolean {
    return !goal.parentId;
  },

  /**
   * Check if a goal has any tasks
   */
  hasTasks(goal: Goal): boolean {
    return goal.tasks.length > 0;
  },

  /**
   * Get completed tasks count
   */
  getCompletedTasksCount(goal: Goal): number {
    return goal.tasks.filter(task => task.status === TaskStatus.DONE).length;
  },

  /**
   * Calculate task completion percentage
   */
  getTaskCompletionPercentage(goal: Goal): number {
    if (goal.tasks.length === 0) {
      return 0;
    }
    return (this.getCompletedTasksCount(goal) / goal.tasks.length) * 100;
  },

  /**
   * Check if a goal is blocked by other goals
   */
  isBlocked(goal: Goal): boolean {
    return goal.blockedByIds.length > 0 || goal.status === GoalStatus.BLOCKED;
  },

  /**
   * Get all task statuses
   */
  getAllTaskStatuses(): TaskStatusType[] {
    return Object.values(TaskStatus);
  },

  /**
   * Get display-friendly name for a task status
   */
  getTaskStatusDisplayName(status: TaskStatusType): string {
    switch (status) {
      case TaskStatus.TODO:
        return 'To Do';
      case TaskStatus.IN_PROGRESS:
        return 'In Progress';
      case TaskStatus.DONE:
        return 'Done';
      default:
        return 'Unknown';
    }
  }
};