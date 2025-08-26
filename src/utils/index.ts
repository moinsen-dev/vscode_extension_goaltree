/**
 * Utility functions for the goal tree extension
 * 
 * This module provides common utility functions used throughout the application:
 * - ID generation
 * - Date formatting
 * - String manipulation
 * - Validation helpers
 * - Performance utilities
 * - Type guards
 * - Status transitions
 * - Hierarchy management
 */

export { generateId, validateId } from './idGenerator';
export { formatDate, parseDate, getRelativeTime, formatDuration } from './dateUtils';
export { 
  validateGoal, 
  validateTask, 
  sanitizeInput, 
  truncateText,
  isGoal,
  isTask,
  isGoalStatus,
  isTaskStatus,
  isGoalArray,
  isTaskArray,
  assertIsGoal,
  assertIsTask
} from './validation';
export { debounce, throttle, memoize } from './performance';
export { deepClone, isEqual, merge } from './objects';
export { createLogger } from './logger';
export type { Logger, LogLevel } from './logger';

// Status transition utilities
export {
  validateGoalStatusTransition,
  validateTaskStatusTransition,
  applyGoalStatusTransition,
  applyTaskStatusTransition,
  getValidGoalTransitions,
  getValidTaskTransitions,
  isValidGoalTransition,
  isValidTaskTransition,
  getStatusDescription,
  suggestNextGoalStatus,
  suggestNextTaskStatus,
  type StatusTransitionResult
} from './statusTransitions';

// Hierarchy management utilities
export {
  buildHierarchyMap,
  getGoalPath,
  getAncestors,
  getDescendants,
  getSiblings,
  isAncestor,
  isDescendant,
  findLowestCommonAncestor,
  calculateHierarchyStats,
  calculateGoalDepth,
  validateHierarchyIntegrity,
  flattenHierarchy,
  createHierarchyStructure,
  findGoalsAtDepth,
  sortHierarchically,
  type GoalPath,
  type TraversalOptions,
  type HierarchyStats
} from './hierarchyUtils';