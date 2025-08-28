/**
 * Data models for the goal tree extension
 * 
 * These interfaces define the core data structures used throughout the application.
 * Based on the PRD specifications for hierarchical goal and task management.
 */

export type { Goal, GoalStatus, Task, TaskStatus, GoalHierarchy, GoalDependency, BulkOperationResult } from './goal';
export type { TreeNode, TreeNodeType } from './tree';
export type { GoalProgress, GoalStatistics } from './progress';
export type { StorageData, BackupData } from './storage';

// Export the GoalTree container class
export { 
  GoalTree, 
  CircularDependencyError, 
  GoalNotFoundError, 
  InvalidHierarchyError,
  type GoalTreeStats,
  type GoalWithHierarchy
} from './GoalTree';

// Import parameter types from types module
export type { 
  CreateGoalParams, 
  UpdateGoalParams, 
  CreateTaskParams, 
  UpdateTaskParams
} from '../types';