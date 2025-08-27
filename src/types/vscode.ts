/**
 * VS Code API extended types and utilities
 */

import { TreeItem, TreeItemCollapsibleState, ThemeIcon, TreeDataProvider, Event } from 'vscode';

/**
 * Extended tree item for goal tree
 */
export interface GoalTreeItem extends TreeItem {
  id: string;
  contextValue: string;
  collapsibleState: TreeItemCollapsibleState;
  iconPath?: ThemeIcon | string;
  tooltip?: string;
  description?: string;
}

/**
 * Tree node types
 */
export type TreeNodeType = 
  | 'goal' 
  | 'task' 
  | 'milestone' 
  | 'folder' 
  | 'root';

/**
 * Tree node icon configuration
 */
export interface TreeNodeIcon {
  id: string;
  color?: 'success' | 'warning' | 'error' | 'info';
}

/**
 * Enhanced tree data provider interface
 */
export interface EnhancedTreeDataProvider<T> extends TreeDataProvider<T> {
  refresh(): void;
  getParent?(element: T): T | undefined;
  onDidChangeTreeData: Event<T | undefined | null | void>;
}

/**
 * VS Code tree view UI configuration
 */
export interface VSCodeTreeViewConfig {
  showCollapseAll: boolean;
  canSelectMany: boolean;
  showWelcome: boolean;
  title?: string;
  showIcons?: boolean;
  showDescription?: boolean;
  showProgress?: boolean;
  compactMode?: boolean;
  expandDepth?: number;
}