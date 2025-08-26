/**
 * TypeScript type guard functions for runtime type checking
 * Provides type-safe runtime validation without external dependencies
 */

import { Goal, Task, GoalStatus, TaskStatus } from '../models/goal';
import { TreeNode, TreeNodeType, CategoryNode } from '../models/tree';

/**
 * Type guard for string values
 */
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * Type guard for non-empty strings
 */
export function isNonEmptyString(value: unknown): value is string {
  return isString(value) && value.trim().length > 0;
}

/**
 * Type guard for valid Date objects
 */
export function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !isNaN(value.getTime());
}

/**
 * Type guard for ISO date strings
 */
export function isValidDateString(value: unknown): value is string {
  if (!isString(value)) return false;
  const date = new Date(value);
  return isValidDate(date) && date.toISOString() === value;
}

/**
 * Type guard for TaskStatus
 */
export function isTaskStatus(value: unknown): value is TaskStatus {
  return isString(value) && ['todo', 'in-progress', 'done'].includes(value);
}

/**
 * Type guard for GoalStatus
 */
export function isGoalStatus(value: unknown): value is GoalStatus {
  return isString(value) && ['planned', 'in-progress', 'blocked', 'completed'].includes(value);
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
  
  // Handle both Date objects and ISO strings for createdAt
  const createdAt = obj.createdAt;
  if (!(isValidDate(createdAt) || isValidDateString(createdAt))) return false;

  // Optional fields
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

  // Validate tasks array
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
 * Type guard for TreeNodeType
 */
export function isTreeNodeType(value: unknown): value is TreeNodeType {
  return isString(value) && ['goal', 'task', 'category'].includes(value);
}

/**
 * Type guard for CategoryNode
 */
export function isCategoryNode(value: unknown): value is CategoryNode {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  if (!isNonEmptyString(obj.category)) return false;
  if (typeof obj.count !== 'number' || obj.count < 0) return false;
  if (!isGoalArray(obj.goals)) return false;

  return true;
}

/**
 * Type guard for TreeNode
 */
export function isTreeNode(value: unknown): value is TreeNode {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // Required fields
  if (!isNonEmptyString(obj.id)) return false;
  if (!isNonEmptyString(obj.label)) return false;
  if (!isTreeNodeType(obj.type)) return false;
  if (typeof obj.hasChildren !== 'boolean') return false;
  if (!isNonEmptyString(obj.contextValue)) return false;

  // Validate data field based on type
  if (obj.type === 'goal' && !isGoal(obj.data)) return false;
  if (obj.type === 'task' && !isTask(obj.data)) return false;
  if (obj.type === 'category' && !isCategoryNode(obj.data)) return false;

  // Optional fields
  if (obj.description !== undefined && obj.description !== null) {
    if (!isString(obj.description)) return false;
  }

  if (obj.parentId !== undefined && obj.parentId !== null) {
    if (!isNonEmptyString(obj.parentId)) return false;
  }

  return true;
}

/**
 * Type guard for storage data format
 */
export function isStorageData(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // Version field (required)
  if (!isString(obj.version) || !/^\d+\.\d+(\.\d+)?$/.test(obj.version)) {
    return false;
  }

  // Goals array (required)
  if (!isGoalArray(obj.goals)) {
    return false;
  }

  // Optional timestamp fields
  if (obj.createdAt !== undefined && !isValidDateString(obj.createdAt)) {
    return false;
  }

  if (obj.updatedAt !== undefined && !isValidDateString(obj.updatedAt)) {
    return false;
  }

  return true;
}

/**
 * Type guard for backup data format
 */
export function isBackupData(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // Required fields
  if (!isString(obj.version) || !/^\d+\.\d+(\.\d+)?$/.test(obj.version)) {
    return false;
  }

  if (!isValidDateString(obj.backupCreatedAt)) {
    return false;
  }

  if (!isString(obj.reason) || 
      !['manual', 'auto-save', 'migration', 'corruption-recovery'].includes(obj.reason)) {
    return false;
  }

  if (!isGoalArray(obj.goals)) {
    return false;
  }

  // Optional timestamp fields
  if (obj.originalCreatedAt !== undefined && !isValidDateString(obj.originalCreatedAt)) {
    return false;
  }

  if (obj.originalUpdatedAt !== undefined && !isValidDateString(obj.originalUpdatedAt)) {
    return false;
  }

  return true;
}

/**
 * Type guard for import/export data format
 */
export function isImportExportData(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // Required fields
  if (!isString(obj.version) || !/^\d+\.\d+(\.\d+)?$/.test(obj.version)) {
    return false;
  }

  if (!isValidDateString(obj.exportedAt)) {
    return false;
  }

  if (!isGoalArray(obj.goals)) {
    return false;
  }

  // Optional fields
  if (obj.exportedBy !== undefined && obj.exportedBy !== null && !isString(obj.exportedBy)) {
    return false;
  }

  if (obj.metadata !== undefined && obj.metadata !== null) {
    if (typeof obj.metadata !== 'object') return false;
    
    const metadata = obj.metadata as Record<string, unknown>;
    
    if (metadata.totalGoals !== undefined && typeof metadata.totalGoals !== 'number') return false;
    if (metadata.totalTasks !== undefined && typeof metadata.totalTasks !== 'number') return false;
    if (metadata.workspaceName !== undefined && metadata.workspaceName !== null && !isString(metadata.workspaceName)) return false;
    if (metadata.description !== undefined && metadata.description !== null && !isString(metadata.description)) return false;
  }

  return true;
}

/**
 * Enhanced type guard with detailed error reporting
 */
export interface TypeGuardResult<T> {
  isValid: boolean;
  data?: T;
  errors: string[];
  path?: string;
}

/**
 * Enhanced Goal type guard with detailed error reporting
 */
export function validateGoalWithErrors(value: unknown, path = 'goal'): TypeGuardResult<Goal> {
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
    errors.push(`${path}.status must be one of: planned, in-progress, blocked, completed`);
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
    data: errors.length === 0 ? (obj as unknown as Goal) : undefined,
    errors,
    path
  };
}

/**
 * Enhanced Task type guard with detailed error reporting
 */
export function validateTaskWithErrors(value: unknown, path = 'task'): TypeGuardResult<Task> {
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
    errors.push(`${path}.status must be one of: todo, in-progress, done`);
  }

  if (typeof obj.order !== 'number' || obj.order < 0) {
    errors.push(`${path}.order must be a non-negative number`);
  }

  const createdAt = obj.createdAt;
  if (!(isValidDate(createdAt) || isValidDateString(createdAt))) {
    errors.push(`${path}.createdAt must be a valid Date or ISO date string`);
  }

  // Optional field validation
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
    data: errors.length === 0 ? (obj as unknown as Task) : undefined,
    errors,
    path
  };
}