/**
 * Services module exports
 * 
 * This module provides the core service layer for the goal tree extension.
 * Services handle business logic, data operations, and application state management.
 * 
 * Stream C additions: Enhanced storage service with workspace isolation,
 * concurrent access protection, and comprehensive data integrity checks.
 * 
 * Stream D additions: Auto-save functionality with change notifications,
 * debounced saves, and event-driven updates for real-time coordination.
 * 
 * Stream E additions: Comprehensive backup and recovery system with
 * automated backups, data integrity validation, and error recovery.
 */

export { GoalManager } from './goalManager';
export { TaskManager, 
         createTaskManager,
         type TaskOperationResult,
         type TaskSearchParams,
         type TaskStatistics,
         type ReorderTasksParams,
         type BulkTaskOperation } from './TaskManager';
export { StorageService, 
         createStorageService, 
         StorageServiceUtils,
         type StorageConfig,
         type StorageResult,
         type DataChangeEvent,
         type StorageMetadata } from './storageService';
export { StateManager } from './stateManager';
export { DependencyService } from './dependencyService';

// Stream C: Status & Hierarchy Management (Issue #4)
export { 
    GoalStatusManager, 
    createGoalStatusManager,
    type StatusTransitionResult,
    type CascadeConfig,
    type StatusChangeEvent
} from './GoalStatusManager';
export { 
    GoalHierarchyManager, 
    createGoalHierarchyManager,
    type HierarchyOperationResult,
    type MoveGoalParams,
    type ReorderGoalsParams,
    type HierarchyStatistics,
    type HierarchyChangeEvent
} from './GoalHierarchyManager';

// Stream 2: Dependency Resolution Services
export { 
    DependencyResolver, 
    createDependencyResolver,
    type DependencyResolverConfig 
} from './DependencyResolver';

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

// Stream D: Auto-Save and Change Management components
export { 
    AutoSaveService, 
    AutoSaveUtils,
    type AutoSaveConfig,
    type AutoSaveStatus
} from './AutoSaveService';
export { 
    ChangeNotificationService, 
    ChangeNotificationUtils,
    EventTypes,
    type EventPayload,
    type ChangeEventData,
    type GoalCreatedData,
    type GoalUpdatedData,
    type GoalDeletedData,
    type SaveTriggeredData,
    type SaveCompletedData,
    type SaveFailedData
} from './ChangeNotificationService';
export { 
    ChangeTracker, 
    ChangeType,
    type ChangeEvent,
    type ChangeBatch,
    type ChangeStatistics,
    type ChangeTrackerConfig
} from './change-tracker';

// Stream E: Backup and Recovery System components
export { BackupService } from './BackupService';
export { RecoveryService } from './RecoveryService';
export { 
    IntegrityChecker,
    type ComprehensiveIntegrityResult,
    type AutoRepairResult,
    type IntegrityIssue,
    IntegritySeverity,
    IntegrityCategory
} from './integrity-checker';

// Stream D: Event System & Integration components (Issue #4)
export { 
    EventManager, 
    createEventManager 
} from './EventManager';
export { 
    UndoRedoManager, 
    createUndoRedoManager,
    type UndoableCommand,
    type CommandGroup,
    type UndoRedoResult
} from './UndoRedoManager';

export type {
    BackupOptions,
    BackupSchedule,
    RestoreOptions,
    BackupServiceResult
} from './BackupService';

export type {
    RecoveryStrategy,
    CorruptionSeverity,
    RecoveryScenario,
    RecoveryResult,
    RecoveryOptions
} from './RecoveryService';