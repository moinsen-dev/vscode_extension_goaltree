/**
 * Shared type definitions for the Goal Tree extension
 * 
 * This file contains commonly used types that are shared across
 * multiple modules in the extension. It serves as a central location
 * for type definitions that don't belong to a specific domain.
 */

import { ExtensionContext, Disposable, TreeItem, Command } from 'vscode';
import { Result, ID, Timestamp } from './types/common';

/**
 * Extension activation result
 */
export interface ActivationResult {
  success: boolean;
  context?: ExtensionContext;
  error?: Error;
  services?: ExtensionServices;
}

/**
 * Core extension services
 */
export interface ExtensionServices {
  GoalManager: any; // Will be typed when service is available
  stateManager: any;
  storageService: any;
  dependencyService: any;
}

/**
 * Extension lifecycle events
 */
export type ExtensionLifecycleEvent = 
  | 'activation-started'
  | 'activation-completed'
  | 'deactivation-started'
  | 'deactivation-completed'
  | 'error';

/**
 * Extension lifecycle handler
 */
export type LifecycleHandler = (event: ExtensionLifecycleEvent, data?: any) => void | Promise<void>;

/**
 * Extension state
 */
export interface ExtensionState {
  isActivated: boolean;
  activationTimestamp?: Timestamp;
  version: string;
  workspaceFolder?: string;
}

/**
 * Command registration data
 */
export interface CommandRegistration {
  command: string;
  title: string;
  category?: string;
  handler: (...args: any[]) => any;
  icon?: string;
}

/**
 * View registration data
 */
export interface ViewRegistration {
  id: string;
  name: string;
  when?: string;
  provider: any; // Tree data provider
}

/**
 * Configuration change handler
 */
export type ConfigurationChangeHandler = (changedKeys: string[]) => void | Promise<void>;

/**
 * Extension resource cleanup handler
 */
export type CleanupHandler = () => void | Promise<void>;

/**
 * Goal tree item for tree view
 */
export interface GoalTreeItem extends TreeItem {
  goalId: ID;
  parentId?: ID;
  level: number;
  hasChildren: boolean;
}

/**
 * Extension error with context
 */
export interface ExtensionError extends Error {
  code?: string;
  context?: Record<string, any>;
  timestamp: Timestamp;
}

/**
 * Disposable resource tracking
 */
export interface DisposableResource {
  id: string;
  type: 'command' | 'provider' | 'listener' | 'watcher';
  disposable: Disposable;
  created: Timestamp;
}

/**
 * Extension contribution points
 */
export interface ContributionPoints {
  commands: CommandRegistration[];
  views: ViewRegistration[];
  disposables: DisposableResource[];
}

/**
 * Extension initialization options
 */
export interface ExtensionInitOptions {
  enableLogging?: boolean;
  autoRefresh?: boolean;
  defaultGoalType?: string;
}

/**
 * Operation result with metadata
 */
export interface ExtensionOperationResult<T = any> extends Result<T> {
  operation: string;
  timestamp: Timestamp;
  duration?: number;
}

/**
 * Extension context with services
 */
export interface ExtensionContextWithServices extends ExtensionContext {
  goalTreeServices: ExtensionServices;
  goalTreeState: ExtensionState;
}