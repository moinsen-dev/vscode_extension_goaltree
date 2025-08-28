/**
 * Tree view related models for VS Code integration
 */

import { Goal, Task, GoalStatus } from './goal';

/**
 * Types of nodes that can appear in the tree view
 */
export type TreeNodeType = 'goal' | 'task' | 'category';

/**
 * Tree node interface for VS Code TreeDataProvider
 */
export interface TreeNode {
  /** Unique identifier for the tree node */
  id: string;
  
  /** Display label in the tree */
  label: string;
  
  /** Type of node */
  type: TreeNodeType;
  
  /** Optional description shown as tooltip */
  description?: string;
  
  /** Reference to the underlying data object */
  data: Goal | Task | CategoryNode;
  
  /** Whether this node has children */
  hasChildren: boolean;
  
  /** Parent node ID (undefined for root nodes) */
  parentId?: string;
  
  /** Visual state of the tree item */
  state: TreeNodeState;
  
  /** Context value for VS Code command integration */
  contextValue: string;
  
  /** Icon information */
  icon: TreeNodeIcon;
}

/**
 * Category node for grouping goals (e.g., "Completed Goals", "Blocked Goals")
 */
export interface CategoryNode {
  category: string;
  count: number;
  goals: Goal[];
}

/**
 * Visual state of a tree node
 */
export interface TreeNodeState {
  /** Whether the node is expanded */
  expanded: boolean;
  
  /** Whether the node is selected */
  selected: boolean;
  
  /** Whether the node is visible (not filtered out) */
  visible: boolean;
  
  /** Custom CSS class for styling */
  cssClass?: string;
  
  /** Progress information for goals with children */
  progress?: {
    completed: number;
    total: number;
    percentage: number;
  };
}

/**
 * Icon configuration for tree nodes
 */
export interface TreeNodeIcon {
  /** Icon identifier (VS Code icon or path) */
  id: string;
  
  /** Optional color theme */
  color?: 'success' | 'warning' | 'error' | 'info';
  
  /** Custom color (hex code) */
  customColor?: string;
}

/**
 * Tree view configuration
 */
export interface TreeViewConfig {
  /** Whether to show completed goals */
  showCompleted: boolean;
  
  /** Whether to show task counts in goal labels */
  showTaskCounts: boolean;
  
  /** Whether to group goals by status */
  groupByStatus: boolean;
  
  /** Maximum depth to display (-1 for unlimited) */
  maxDepth: number;
  
  /** Sort order for goals */
  sortOrder: 'created' | 'title' | 'priority' | 'status';
  
  /** Sort direction */
  sortDirection: 'asc' | 'desc';
  
  /** Filter configuration */
  filter: TreeViewFilter;
}

/**
 * Tree view filter configuration
 */
export interface TreeViewFilter {
  /** Filter by status */
  status?: GoalStatus[];
  
  /** Filter by text search */
  searchText?: string;
  
  /** Filter by tags */
  tags?: string[];
  
  /** Filter by priority range */
  priorityRange?: {
    min: number;
    max: number;
  };
  
  /** Show only goals with tasks */
  hasTasksOnly?: boolean;
  
  /** Show only blocked goals */
  blockedOnly?: boolean;
}

/**
 * Tree view state for persistence
 */
export interface TreeViewState {
  /** Configuration */
  config: TreeViewConfig;
  
  /** Expanded node IDs */
  expandedNodes: Set<string>;
  
  /** Selected node ID */
  selectedNode?: string;
  
  /** Last refresh timestamp */
  lastRefresh: Date;
}

/**
 * Tree operation result
 */
export interface TreeOperationResult {
  /** Whether the operation succeeded */
  success: boolean;
  
  /** Error message if operation failed */
  error?: string;
  
  /** Affected node IDs */
  affectedNodes: string[];
  
  /** Whether a refresh is needed */
  needsRefresh: boolean;
}

/**
 * Drag and drop operation data
 */
export interface DragDropOperation {
  /** Source node being dragged */
  source: TreeNode;
  
  /** Target node or position */
  target: {
    node?: TreeNode;
    position: 'before' | 'after' | 'child';
  };
  
  /** Type of operation */
  operation: 'move' | 'copy';
}

/**
 * Context menu item for tree nodes
 */
export interface ContextMenuItem {
  /** Command ID to execute */
  command: string;
  
  /** Display title */
  title: string;
  
  /** Optional icon */
  icon?: string;
  
  /** Menu group (for organizing items) */
  group?: string;
  
  /** When clause for conditional display */
  when?: string;
  
  /** Whether this is a separator */
  separator?: boolean;
}