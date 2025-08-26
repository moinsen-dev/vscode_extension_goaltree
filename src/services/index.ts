/**
 * Services module exports
 * 
 * This module provides the core service layer for the goal tree extension.
 * Services handle business logic, data operations, and application state management.
 * 
 * Stream C additions: Enhanced storage service with workspace isolation,
 * concurrent access protection, and comprehensive data integrity checks.
 */

export { GoalManager } from './goalManager';
export { StorageService } from './storageService';
export { StateManager } from './stateManager';
export { DependencyService } from './dependencyService';

// Stream C: Storage Service Core components
export { WorkspaceManager } from './workspace-manager';
export { 
    FileOperations, 
    FileOperationError, 
    FileOperationErrorType,
    type FileOperationResult,
    type WriteOptions,
    type ReadOptions 
} from './file-operations';
export { 
    LockManager, 
    LockType, 
    type LockInfo, 
    type LockResult, 
    type LockOptions 
} from './lock-manager';