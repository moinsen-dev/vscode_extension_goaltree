/**
 * Extension-specific type definitions
 */

import { ExtensionContext, TreeDataProvider, TreeItem, Event } from 'vscode';

/**
 * Main extension interface
 */
export interface GoalTreeExtension {
  context: ExtensionContext;
  activate(): Promise<void>;
  deactivate(): Promise<void>;
}

/**
 * Extension activation state
 */
export interface ExtensionState {
  isActivated: boolean;
  activationTime?: Date;
  version: string;
  context?: ExtensionContext;
}

/**
 * Extension commands
 */
export type ExtensionCommand = 
  | 'goalTree.openView'
  | 'goalTree.createGoal'
  | 'goalTree.deleteGoal'
  | 'goalTree.refreshView'
  | 'goalTree.editGoal'
  | 'goalTree.toggleGoalStatus'
  | 'goalTree.exportGoals'
  | 'goalTree.importGoals'
  // Goal and task selection commands
  | 'goalTree.selectGoal'
  | 'goalTree.selectTask'
  | 'goalTree.refreshTree'
  // Dependency management commands
  | 'goalTree.addDependency'
  | 'goalTree.removeDependency'
  | 'goalTree.showDependencies'
  | 'goalTree.manageDependencies'
  | 'goalTree.checkCircularDependencies'
  // Task management commands
  | 'goalTree.addTask'
  | 'goalTree.editTask'
  | 'goalTree.deleteTask'
  | 'goalTree.toggleTaskStatus';

/**
 * Command handler function type
 */
export type CommandHandler = (...args: any[]) => Promise<void> | void;

/**
 * Extension contributions
 */
export interface ExtensionContributions {
  commands: Map<ExtensionCommand, CommandHandler>;
  providers: TreeDataProvider<any>[];
  disposables: { dispose(): any }[];
}