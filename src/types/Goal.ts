/**
 * Core Goal types for the Goal Tree extension
 * This file defines the fundamental Goal interface and related types
 */

import { GoalStatus, GoalStatusType } from './GoalStatus';
import { Task, TaskStatus, TaskStatusType } from './Task';

// Re-export types for convenience
export type { GoalStatusType } from './GoalStatus';
export { GoalStatus } from './GoalStatus';
export type { Task, TaskStatusType } from './Task';
export { TaskStatus } from './Task';

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
 * Goal progress information
 */
export interface GoalProgress {
  /** The goal this progress relates to */
  goal: Goal;
  
  /** Progress percentage (0-100) based on task completion */
  taskProgress: number;
  
  /** Number of completed tasks */
  completedTasks: number;
  
  /** Total number of tasks */
  totalTasks: number;
  
  /** Whether the goal is overdue */
  isOverdue: boolean;
  
  /** Days since goal was created */
  daysSinceCreated: number;
  
  /** Days since goal was last updated */
  daysSinceUpdated?: number;
  
  /** Estimated completion date based on current progress */
  estimatedCompletion?: Date;
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
   * Check if a goal is completed
   */
  isCompleted(goal: Goal): boolean {
    return goal.status === GoalStatus.COMPLETED;
  },

  /**
   * Check if a goal is in progress
   */
  isInProgress(goal: Goal): boolean {
    return goal.status === GoalStatus.IN_PROGRESS;
  },

  /**
   * Check if a goal is planned
   */
  isPlanned(goal: Goal): boolean {
    return goal.status === GoalStatus.PLANNED;
  },

  /**
   * Create a new goal with default values
   */
  createGoal(params: CreateGoalParams): Omit<Goal, 'id'> {
    return {
      title: params.title.trim(),
      description: params.description?.trim(),
      status: GoalStatus.PLANNED,
      parentId: params.parentId,
      blockedByIds: [],
      tasks: [],
      createdAt: new Date(),
      metadata: params.metadata,
    };
  },

  /**
   * Calculate goal age in days
   */
  getGoalAgeInDays(goal: Goal): number {
    const now = new Date();
    const created = goal.createdAt instanceof Date ? goal.createdAt : new Date(goal.createdAt);
    return Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
  },

  /**
   * Check if goal is overdue based on due date in metadata
   */
  isOverdue(goal: Goal): boolean {
    if (!goal.metadata?.dueDate) return false;
    const dueDate = goal.metadata.dueDate instanceof Date ? goal.metadata.dueDate : new Date(goal.metadata.dueDate);
    return new Date() > dueDate && goal.status !== GoalStatus.COMPLETED;
  },

  /**
   * Get goal priority (defaults to 3 if not set)
   */
  getPriority(goal: Goal): number {
    return goal.metadata?.priority ?? 3;
  },

  /**
   * Filter goals by status
   */
  filterByStatus(goals: Goal[], status: GoalStatusType): Goal[] {
    return goals.filter(goal => goal.status === status);
  },

  /**
   * Filter goals by priority
   */
  filterByPriority(goals: Goal[], minPriority: number, maxPriority: number = 5): Goal[] {
    return goals.filter(goal => {
      const priority = this.getPriority(goal);
      return priority >= minPriority && priority <= maxPriority;
    });
  },

  /**
   * Sort goals by priority (highest first)
   */
  sortByPriority(goals: Goal[]): Goal[] {
    return [...goals].sort((a, b) => this.getPriority(b) - this.getPriority(a));
  },

  /**
   * Sort goals by creation date (newest first)
   */
  sortByCreatedDate(goals: Goal[]): Goal[] {
    return [...goals].sort((a, b) => {
      const dateA = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
      const dateB = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
      return dateB.getTime() - dateA.getTime();
    });
  }
};

/**
 * Type guard utilities for runtime validation
 */

/**
 * Type guard for string values
 */
function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * Type guard for non-empty strings
 */
function isNonEmptyString(value: unknown): value is string {
  return isString(value) && value.trim().length > 0;
}

/**
 * Type guard for valid Date objects
 */
function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !isNaN(value.getTime());
}

/**
 * Type guard for ISO date strings
 */
function isValidDateString(value: unknown): value is string {
  if (!isString(value)) return false;
  const date = new Date(value);
  return isValidDate(date) && date.toISOString() === value;
}

/**
 * Type guard for GoalStatus
 */
export function isGoalStatus(value: unknown): value is GoalStatusType {
  return isString(value) && Object.values(GoalStatus).includes(value as GoalStatus);
}

/**
 * Type guard for Goal metadata
 */
export function isGoalMetadata(value: unknown): value is Goal['metadata'] {
  if (value === null || value === undefined) {
    return true; // metadata is optional
  }

  if (typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // All metadata fields are optional
  if (obj.color !== undefined && !isString(obj.color)) return false;
  
  if (obj.priority !== undefined) {
    if (typeof obj.priority !== 'number' || obj.priority < 1 || obj.priority > 5) return false;
  }
  
  if (obj.estimatedHours !== undefined) {
    if (typeof obj.estimatedHours !== 'number' || obj.estimatedHours < 0) return false;
  }
  
  if (obj.actualHours !== undefined) {
    if (typeof obj.actualHours !== 'number' || obj.actualHours < 0) return false;
  }
  
  if (obj.tags !== undefined) {
    if (!Array.isArray(obj.tags)) return false;
    for (const tag of obj.tags) {
      if (!isNonEmptyString(tag)) return false;
    }
  }
  
  if (obj.dueDate !== undefined && obj.dueDate !== null) {
    if (!(isValidDate(obj.dueDate) || isValidDateString(obj.dueDate))) return false;
  }

  return true;
}

/**
 * Type guard for Goal interface
 */
export function isGoal(value: unknown): value is Goal {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // Required fields
  if (!isNonEmptyString(obj.id)) return false;
  if (!isNonEmptyString(obj.title)) return false;
  if (!isGoalStatus(obj.status)) return false;
  if (!Array.isArray(obj.blockedByIds)) return false;
  if (!Array.isArray(obj.tasks)) return false;

  // Handle both Date objects and ISO strings for createdAt
  const createdAt = obj.createdAt;
  if (!(isValidDate(createdAt) || isValidDateString(createdAt))) return false;

  // Validate blockedByIds array
  for (const id of obj.blockedByIds) {
    if (!isNonEmptyString(id)) return false;
  }

  // Validate tasks array - import TaskUtils to avoid circular dependency
  const { isTask } = require('./Task');
  for (const task of obj.tasks) {
    if (!isTask(task)) return false;
  }

  // Optional fields
  if (obj.description !== undefined && obj.description !== null) {
    if (!isString(obj.description)) return false;
  }

  if (obj.parentId !== undefined && obj.parentId !== null) {
    if (!isNonEmptyString(obj.parentId)) return false;
  }

  if (obj.updatedAt !== undefined && obj.updatedAt !== null) {
    if (!(isValidDate(obj.updatedAt) || isValidDateString(obj.updatedAt))) return false;
  }

  if (obj.completedAt !== undefined && obj.completedAt !== null) {
    if (!(isValidDate(obj.completedAt) || isValidDateString(obj.completedAt))) return false;
  }

  if (!isGoalMetadata(obj.metadata)) return false;

  // Additional validation
  if (isString(obj.title) && obj.title.length > 200) return false;
  if (isString(obj.description) && obj.description.length > 2000) return false;

  return true;
}

/**
 * Type guard for Goal array
 */
export function isGoalArray(value: unknown): value is Goal[] {
  if (!Array.isArray(value)) {
    return false;
  }
  return value.every(isGoal);
}

/**
 * Enhanced type guard result interface
 */
export interface GoalValidationResult {
  isValid: boolean;
  goal?: Goal;
  errors: string[];
  path?: string;
}

/**
 * Enhanced Goal type guard with detailed error reporting
 */
export function validateGoalWithErrors(value: unknown, path = 'goal'): GoalValidationResult {
  const errors: string[] = [];

  if (typeof value !== 'object' || value === null) {
    return { isValid: false, errors: [`${path} must be an object`] };
  }

  const obj = value as Record<string, unknown>;

  // Required field validation
  if (!isNonEmptyString(obj.id)) {
    errors.push(`${path}.id must be a non-empty string`);
  }

  if (!isNonEmptyString(obj.title)) {
    errors.push(`${path}.title must be a non-empty string`);
  } else if (obj.title.length > 200) {
    errors.push(`${path}.title cannot exceed 200 characters`);
  }

  if (!isGoalStatus(obj.status)) {
    errors.push(`${path}.status must be one of: ${Object.values(GoalStatus).join(', ')}`);
  }

  if (!Array.isArray(obj.blockedByIds)) {
    errors.push(`${path}.blockedByIds must be an array`);
  } else {
    obj.blockedByIds.forEach((id, index) => {
      if (!isNonEmptyString(id)) {
        errors.push(`${path}.blockedByIds[${index}] must be a non-empty string`);
      }
    });
  }

  if (!Array.isArray(obj.tasks)) {
    errors.push(`${path}.tasks must be an array`);
  } else {
    const { validateTaskWithErrors } = require('./Task');
    obj.tasks.forEach((task, index) => {
      const taskResult = validateTaskWithErrors(task, `${path}.tasks[${index}]`);
      errors.push(...taskResult.errors);
    });
  }

  const createdAt = obj.createdAt;
  if (!(isValidDate(createdAt) || isValidDateString(createdAt))) {
    errors.push(`${path}.createdAt must be a valid Date or ISO date string`);
  }

  // Optional field validation
  if (obj.description !== undefined && obj.description !== null) {
    if (!isString(obj.description)) {
      errors.push(`${path}.description must be a string`);
    } else if (obj.description.length > 2000) {
      errors.push(`${path}.description cannot exceed 2000 characters`);
    }
  }

  if (obj.parentId !== undefined && obj.parentId !== null && !isNonEmptyString(obj.parentId)) {
    errors.push(`${path}.parentId must be a non-empty string if provided`);
  }

  if (obj.updatedAt !== undefined && obj.updatedAt !== null) {
    if (!(isValidDate(obj.updatedAt) || isValidDateString(obj.updatedAt))) {
      errors.push(`${path}.updatedAt must be a valid Date or ISO date string if provided`);
    }
  }

  if (obj.completedAt !== undefined && obj.completedAt !== null) {
    if (!(isValidDate(obj.completedAt) || isValidDateString(obj.completedAt))) {
      errors.push(`${path}.completedAt must be a valid Date or ISO date string if provided`);
    }
  }

  if (!isGoalMetadata(obj.metadata)) {
    errors.push(`${path}.metadata is invalid`);
  }

  return {
    isValid: errors.length === 0,
    goal: errors.length === 0 ? (obj as unknown as Goal) : undefined,
    errors,
    path
  };
}