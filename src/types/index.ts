/**
 * Main types export file for the Goal Tree extension
 * This file re-exports all types for convenient importing
 */

// Core fundamental types - NEW separated structure
export * from './Goal';
export * from './Task';
export * from './GoalTree';
export * from './GoalStatus';
export * from './GoalEvents';

// Extension types
export * from './extension';

// VS Code specific types
export * from './vscode';

// Tree view types
export * from './TreeTypes';

// Common utility types
export * from './common';

// Configuration types
export * from './configuration';

// Parameter types for operations (selective exports to avoid conflicts)
export type { 
  SearchGoalParams,
  BulkOperationParams,
  ExportParams,
  ImportParams
} from './parameters';

// Dependency types (enhanced features)
export * from './Dependency';
export * from './DependencyStatus';
export * from './DependencyGraph';