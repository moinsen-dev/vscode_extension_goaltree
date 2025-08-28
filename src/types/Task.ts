/**
 * Task types and interfaces for the Goal Tree extension
 * This file defines Task-related types, enums, and comprehensive type guards
 */

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
  
  /** ID of the goal this task belongs to */
  goalId: string;
  
  /** When the task was created */
  createdAt: Date;
  
  /** When the task was last updated */
  updatedAt?: Date;
  
  /** When the task was completed (if status is 'done') */
  completedAt?: Date;
  
  /** Optional detailed description or notes */
  description?: string;
}

/**
 * Task creation parameters
 */
export interface CreateTaskParams {
  title: string;
  description?: string;
  goalId: string;
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
 * Task progress information
 */
export interface TaskProgress {
  /** The task this progress relates to */
  task: Task;
  
  /** Whether the task is overdue */
  isOverdue: boolean;
  
  /** Days since task was created */
  daysSinceCreated: number;
  
  /** Days since task was last updated */
  daysSinceUpdated?: number;
}

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
 * Type guard for TaskStatus
 */
export function isTaskStatus(value: unknown): value is TaskStatusType {
  return isString(value) && Object.values(TaskStatus).includes(value as TaskStatus);
}

/**
 * Type guard for Task interface
 */
export function isTask(value: unknown): value is Task {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // Required fields
  if (!isNonEmptyString(obj.id)) return false;
  if (!isNonEmptyString(obj.title)) return false;
  if (!isTaskStatus(obj.status)) return false;
  if (typeof obj.order !== 'number' || obj.order < 0) return false;
  if (!isNonEmptyString(obj.goalId)) return false;
  
  // Handle both Date objects and ISO strings for createdAt
  const createdAt = obj.createdAt;
  if (!(isValidDate(createdAt) || isValidDateString(createdAt))) return false;

  // Optional fields
  if (obj.updatedAt !== undefined && obj.updatedAt !== null) {
    if (!(isValidDate(obj.updatedAt) || isValidDateString(obj.updatedAt))) return false;
  }

  if (obj.completedAt !== undefined && obj.completedAt !== null) {
    if (!(isValidDate(obj.completedAt) || isValidDateString(obj.completedAt))) return false;
  }

  if (obj.description !== undefined && obj.description !== null) {
    if (!isString(obj.description)) return false;
  }

  // Additional validation
  if (isString(obj.title) && obj.title.length > 200) return false;
  if (isString(obj.description) && obj.description.length > 1000) return false;

  return true;
}

/**
 * Type guard for Task array
 */
export function isTaskArray(value: unknown): value is Task[] {
  if (!Array.isArray(value)) {
    return false;
  }
  return value.every(isTask);
}

/**
 * Enhanced type guard result interface
 */
export interface TaskValidationResult {
  isValid: boolean;
  task?: Task;
  errors: string[];
  path?: string;
}

/**
 * Enhanced Task type guard with detailed error reporting
 */
export function validateTaskWithErrors(value: unknown, path = 'task'): TaskValidationResult {
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

  if (!isTaskStatus(obj.status)) {
    errors.push(`${path}.status must be one of: ${Object.values(TaskStatus).join(', ')}`);
  }

  if (typeof obj.order !== 'number' || obj.order < 0) {
    errors.push(`${path}.order must be a non-negative number`);
  }

  if (!isNonEmptyString(obj.goalId)) {
    errors.push(`${path}.goalId must be a non-empty string`);
  }

  const createdAt = obj.createdAt;
  if (!(isValidDate(createdAt) || isValidDateString(createdAt))) {
    errors.push(`${path}.createdAt must be a valid Date or ISO date string`);
  }

  // Optional field validation
  if (obj.updatedAt !== undefined && obj.updatedAt !== null) {
    if (!(isValidDate(obj.updatedAt) || isValidDateString(obj.updatedAt))) {
      errors.push(`${path}.updatedAt must be a valid Date or ISO date string if provided`);
    }
  }

  if (obj.description !== undefined && obj.description !== null) {
    if (!isString(obj.description)) {
      errors.push(`${path}.description must be a string`);
    } else if (obj.description.length > 1000) {
      errors.push(`${path}.description cannot exceed 1000 characters`);
    }
  }

  if (obj.completedAt !== undefined && obj.completedAt !== null) {
    if (!(isValidDate(obj.completedAt) || isValidDateString(obj.completedAt))) {
      errors.push(`${path}.completedAt must be a valid Date or ISO date string if provided`);
    }
  }

  return {
    isValid: errors.length === 0,
    task: errors.length === 0 ? (obj as unknown as Task) : undefined,
    errors,
    path
  };
}

/**
 * Helper functions for working with tasks
 */
export const TaskUtils = {
  /**
   * Check if a task is completed
   */
  isCompleted(task: Task): boolean {
    return task.status === TaskStatus.DONE;
  },

  /**
   * Check if a task is in progress
   */
  isInProgress(task: Task): boolean {
    return task.status === TaskStatus.IN_PROGRESS;
  },

  /**
   * Check if a task is pending (todo)
   */
  isPending(task: Task): boolean {
    return task.status === TaskStatus.TODO;
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
  },

  /**
   * Create a new task with default values
   */
  createTask(params: CreateTaskParams): Omit<Task, 'id'> {
    return {
      title: params.title.trim(),
      description: params.description?.trim(),
      goalId: params.goalId,
      status: TaskStatus.TODO,
      order: 0,
      createdAt: new Date(),
    };
  },

  /**
   * Calculate task age in days
   */
  getTaskAgeInDays(task: Task): number {
    const now = new Date();
    const created = task.createdAt instanceof Date ? task.createdAt : new Date(task.createdAt);
    return Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
  },

  /**
   * Sort tasks by order
   */
  sortByOrder(tasks: Task[]): Task[] {
    return [...tasks].sort((a, b) => a.order - b.order);
  },

  /**
   * Sort tasks by status (todo > in-progress > done)
   */
  sortByStatus(tasks: Task[]): Task[] {
    const statusOrder = {
      [TaskStatus.TODO]: 0,
      [TaskStatus.IN_PROGRESS]: 1,
      [TaskStatus.DONE]: 2
    };
    
    return [...tasks].sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);
  },

  /**
   * Filter tasks by status
   */
  filterByStatus(tasks: Task[], status: TaskStatusType): Task[] {
    return tasks.filter(task => task.status === status);
  },

  /**
   * Get tasks for a specific goal
   */
  filterByGoalId(tasks: Task[], goalId: string): Task[] {
    return tasks.filter(task => task.goalId === goalId);
  }
};