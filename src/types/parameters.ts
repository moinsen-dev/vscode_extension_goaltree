/**
 * Parameter types for various operations
 */

import { GoalStatus, TaskStatus } from '../models';

/**
 * Parameters for creating a new goal
 */
export interface CreateGoalParams {
  title: string;
  description?: string;
  parentId?: string;
  status?: GoalStatus;
  dueDate?: Date;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  tags?: string[];
  metadata?: Record<string, any>;
}

/**
 * Parameters for updating an existing goal
 */
export interface UpdateGoalParams {
  id: string;
  title?: string;
  description?: string;
  status?: GoalStatus;
  dueDate?: Date;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  tags?: string[];
  parentId?: string;
  metadata?: Record<string, any>;
}

/**
 * Parameters for creating a new task
 */
export interface CreateTaskParams {
  title: string;
  description?: string;
  goalId: string;
  status?: TaskStatus;
  dueDate?: Date;
  estimatedTime?: number; // in minutes
  priority?: 'low' | 'medium' | 'high' | 'critical';
  assignee?: string;
  tags?: string[];
}

/**
 * Parameters for updating an existing task
 */
export interface UpdateTaskParams {
  id: string;
  title?: string;
  description?: string;
  status?: TaskStatus;
  dueDate?: Date;
  estimatedTime?: number;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  assignee?: string;
  tags?: string[];
  completedAt?: Date;
}

/**
 * Parameters for goal search/filtering
 */
export interface SearchGoalParams {
  query?: string;
  status?: GoalStatus[];
  parentId?: string;
  tags?: string[];
  dateRange?: {
    start?: Date;
    end?: Date;
  };
  priority?: string[];
  limit?: number;
  offset?: number;
}

/**
 * Parameters for bulk operations
 */
export interface BulkOperationParams {
  goalIds: string[];
  operation: 'delete' | 'updateStatus' | 'move' | 'duplicate';
  targetStatus?: GoalStatus;
  targetParentId?: string;
}

/**
 * Export/Import parameters
 */
export interface ExportParams {
  format: 'json' | 'csv' | 'markdown';
  goalIds?: string[];
  includeCompleted?: boolean;
  includeMetadata?: boolean;
}

export interface ImportParams {
  format: 'json' | 'csv';
  data: string | object;
  mergeStrategy: 'replace' | 'merge' | 'append';
  validateOnly?: boolean;
}