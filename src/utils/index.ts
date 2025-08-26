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
 * - Storage utilities (Stream C)
 * - Debouncing utilities (Stream D)
 * - Backup management utilities (Stream E)
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
export { memoize } from './performance';
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

// Stream C: Storage utilities
export {
  StorageUtils,
  type DataTransformResult,
  type ExtendedStorageMetadata,
  type IntegrityCheckResult,
  type StorageStats
} from './storage-utils';

// Stream D: Debouncing utilities
export {
  debounce,
  throttle,
  DebouncePresets,
  DebounceManager,
  type DebounceOptions,
  type DebounceInfo,
  type DebouncedFunction
} from './debounce';

// Stream E: Backup management utilities
export {
  BackupUtils,
  BackupTrigger,
  type BackupMetadata,
  type BackupRotationPolicy,
  type BackupFileInfo
} from './backup-utils';

// Stream 2: Graph algorithms and circular dependency detection utilities
export {
  GraphAlgorithms,
  createGraphAlgorithms
} from './GraphAlgorithms';

export {
  CircularDependencyDetector,
  createCircularDependencyDetector,
  CycleUtils,
  type CycleDetectionResult,
  type CycleDetail,
  type CycleBreakingSuggestion,
  type CycleDetectorConfig,
  CycleSeverity,
  SuggestionType
} from './CircularDependencyDetector';