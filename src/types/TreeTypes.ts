/**
 * Tree view related types and interfaces for the Goal Tree extension
 * This file centralizes all tree-specific type definitions
 */

import * as vscode from 'vscode';
import { Goal, Task } from './Goal';

/**
 * Tree node types supported by the goal tree view
 */
export type TreeNodeType = 
  | 'goal' 
  | 'task' 
  | 'milestone' 
  | 'folder' 
  | 'root'
  | 'placeholder';

/**
 * Tree node base interface
 */
export interface TreeNode {
  /** Unique identifier for the tree node */
  id: string;
  
  /** Display label for the tree node */
  label: string;
  
  /** Type of tree node */
  type: TreeNodeType;
  
  /** Parent node ID (undefined for root nodes) */
  parentId?: string;
  
  /** Whether the node has children */
  hasChildren: boolean;
  
  /** Optional tooltip text */
  tooltip?: string;
  
  /** Optional description */
  description?: string;
  
  /** Context value for VS Code commands and menus */
  contextValue: string;
  
  /** Icon configuration */
  iconPath?: vscode.ThemeIcon | string;
  
  /** VS Code collapsible state */
  collapsibleState: vscode.TreeItemCollapsibleState;
  
  /** Optional command to execute on click */
  command?: vscode.Command;
  
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Goal tree node - extends TreeNode for goal-specific functionality
 */
export interface GoalTreeNode extends TreeNode {
  type: 'goal';
  
  /** Reference to the underlying Goal object */
  goal: Goal;
  
  /** Progress information */
  progress: {
    completed: number;
    total: number;
    percentage: number;
  };
  
  /** Visual indicators */
  indicators: {
    isBlocked: boolean;
    isHighPriority: boolean;
    isOverdue: boolean;
    isUrgent: boolean;
  };
}

/**
 * Task tree node - extends TreeNode for task-specific functionality
 */
export interface TaskTreeNode extends TreeNode {
  type: 'task';
  
  /** Reference to the underlying Task object */
  task: Task;
  
  /** Parent goal ID for the task */
  goalId: string;
  
  /** Task order within the parent goal */
  order: number;
}

/**
 * Tree view configuration options
 */
export interface TreeViewConfig {
  /** Whether to show completed goals and tasks */
  showCompleted: boolean;
  
  /** Whether to group items by status */
  groupByStatus: boolean;
  
  /** Whether to sort items by title */
  sortByTitle: boolean;
  
  /** Whether to enable auto-refresh */
  autoRefresh: boolean;
  
  /** Maximum number of items to display at once */
  maxItemsInView: number;
  
  /** Whether to enable lazy loading */
  enableLazyLoading: boolean;
  
  /** Debounce interval for refresh operations */
  debounceInterval: number;
}

/**
 * Tree view state for persistence
 */
export interface TreeViewState {
  /** Expanded/collapsed state for each node */
  nodeStates: Record<string, boolean>;
  
  /** Current configuration */
  config: TreeViewConfig;
  
  /** Last update timestamp */
  lastUpdated: number;
}

/**
 * Tree data provider capabilities
 */
export interface TreeDataProviderCapabilities {
  /** Supports refresh operations */
  canRefresh: boolean;
  
  /** Supports parent/child relationships */
  hasHierarchy: boolean;
  
  /** Supports drag and drop */
  supportsDragDrop: boolean;
  
  /** Supports multi-select */
  supportsMultiSelect: boolean;
  
  /** Supports filtering */
  supportsFiltering: boolean;
  
  /** Supports sorting */
  supportsSorting: boolean;
  
  /** Supports lazy loading */
  supportsLazyLoading: boolean;
}

/**
 * Tree item rendering context
 */
export interface TreeItemRenderContext {
  /** Current theme information */
  theme: {
    isDark: boolean;
    colorTheme: string;
  };
  
  /** Performance settings */
  performance: {
    enableCaching: boolean;
    maxCacheSize: number;
    enableProfiling: boolean;
  };
  
  /** User preferences */
  preferences: {
    showIcons: boolean;
    showDescriptions: boolean;
    showProgress: boolean;
    compactMode: boolean;
  };
}

/**
 * Tree item creation parameters
 */
export interface TreeItemCreationParams {
  /** Node data */
  node: TreeNode;
  
  /** Rendering context */
  context: TreeItemRenderContext;
  
  /** Whether this item is currently selected */
  isSelected?: boolean;
  
  /** Whether this item is currently focused */
  isFocused?: boolean;
}

/**
 * Tree refresh options
 */
export interface TreeRefreshOptions {
  /** Whether to preserve expanded state */
  preserveExpandedState: boolean;
  
  /** Whether to preserve selection */
  preserveSelection: boolean;
  
  /** Whether to force reload from data source */
  forceReload: boolean;
  
  /** Specific node to refresh (if undefined, refreshes entire tree) */
  nodeId?: string;
}

/**
 * Tree operation result
 */
export interface TreeOperationResult {
  /** Whether the operation was successful */
  success: boolean;
  
  /** Error message if operation failed */
  error?: string;
  
  /** Number of items affected */
  itemsAffected: number;
  
  /** Additional metadata about the operation */
  metadata?: Record<string, any>;
}

/**
 * Tree filter criteria
 */
export interface TreeFilterCriteria {
  /** Text to search for */
  searchText?: string;
  
  /** Status filter */
  status?: string[];
  
  /** Priority filter */
  priority?: number[];
  
  /** Tag filter */
  tags?: string[];
  
  /** Date range filter */
  dateRange?: {
    start: Date;
    end: Date;
  };
  
  /** Whether to include completed items */
  includeCompleted: boolean;
}

/**
 * Tree sort options
 */
export interface TreeSortOptions {
  /** Field to sort by */
  field: 'title' | 'status' | 'priority' | 'createdAt' | 'updatedAt' | 'dueDate';
  
  /** Sort direction */
  direction: 'asc' | 'desc';
  
  /** Whether to group by status first */
  groupByStatus: boolean;
}

/**
 * Context values used for VS Code command and menu visibility
 */
export const TREE_CONTEXT_VALUES = {
  // Goal contexts
  GOAL: 'goal',
  GOAL_PLANNED: 'goal:planned',
  GOAL_IN_PROGRESS: 'goal:in-progress',
  GOAL_BLOCKED: 'goal:blocked',
  GOAL_COMPLETED: 'goal:completed',
  
  // Task contexts
  TASK: 'task',
  TASK_TODO: 'task:todo',
  TASK_IN_PROGRESS: 'task:in-progress',
  TASK_DONE: 'task:done',
  
  // Special contexts
  IS_BLOCKED: 'blocked',
  IS_HIGH_PRIORITY: 'high-priority',
  IS_URGENT: 'urgent',
  HAS_DEPENDENCIES: 'has-dependencies',
  
  // Container contexts
  ROOT: 'root',
  FOLDER: 'folder',
  PLACEHOLDER: 'placeholder'
} as const;

/**
 * Type for context values
 */
export type TreeContextValue = typeof TREE_CONTEXT_VALUES[keyof typeof TREE_CONTEXT_VALUES];

/**
 * Tree icons configuration
 */
export const TREE_ICONS = {
  // Goal icons
  GOAL_PLANNED: 'circle-outline',
  GOAL_IN_PROGRESS: 'play',
  GOAL_BLOCKED: 'error',
  GOAL_COMPLETED: 'check',
  
  // Task icons
  TASK_TODO: 'circle-small',
  TASK_IN_PROGRESS: 'play-circle',
  TASK_DONE: 'check-all',
  
  // Special icons
  HIGH_PRIORITY: 'flame',
  URGENT: 'warning',
  BLOCKED: 'debug-disconnect',
  LOADING: 'loading',
  ERROR: 'error',
  
  // Container icons
  FOLDER: 'folder',
  FOLDER_OPEN: 'folder-opened'
} as const;

/**
 * Tree theme colors
 */
export const TREE_COLORS = {
  // Status colors
  PLANNED: 'charts.blue',
  IN_PROGRESS: 'charts.blue',
  BLOCKED: 'charts.red',
  COMPLETED: 'charts.green',
  
  // Priority colors
  HIGH_PRIORITY: 'charts.orange',
  URGENT: 'charts.red',
  
  // General colors
  FOREGROUND: 'charts.foreground',
  SECONDARY: 'charts.foreground'
} as const;

/**
 * Helper functions for working with tree types
 */
export const TreeTypeUtils = {
  /**
   * Check if a node is a goal node
   */
  isGoalNode(node: TreeNode): node is GoalTreeNode {
    return node.type === 'goal';
  },
  
  /**
   * Check if a node is a task node
   */
  isTaskNode(node: TreeNode): node is TaskTreeNode {
    return node.type === 'task';
  },
  
  /**
   * Get context value for a goal based on its status
   */
  getGoalContextValue(goal: Goal): string {
    switch (goal.status) {
      case 'planned':
        return TREE_CONTEXT_VALUES.GOAL_PLANNED;
      case 'in-progress':
        return TREE_CONTEXT_VALUES.GOAL_IN_PROGRESS;
      case 'blocked':
        return TREE_CONTEXT_VALUES.GOAL_BLOCKED;
      case 'completed':
        return TREE_CONTEXT_VALUES.GOAL_COMPLETED;
      default:
        return TREE_CONTEXT_VALUES.GOAL;
    }
  },
  
  /**
   * Get context value for a task based on its status
   */
  getTaskContextValue(task: Task): string {
    switch (task.status) {
      case 'todo':
        return TREE_CONTEXT_VALUES.TASK_TODO;
      case 'in-progress':
        return TREE_CONTEXT_VALUES.TASK_IN_PROGRESS;
      case 'done':
        return TREE_CONTEXT_VALUES.TASK_DONE;
      default:
        return TREE_CONTEXT_VALUES.TASK;
    }
  },
  
  /**
   * Get icon for a goal based on its status and properties
   */
  getGoalIcon(goal: Goal, indicators: GoalTreeNode['indicators']): vscode.ThemeIcon {
    // Handle blocked goals first
    if (indicators.isBlocked) {
      const color = indicators.isUrgent || indicators.isHighPriority ? 
        TREE_COLORS.URGENT : TREE_COLORS.BLOCKED;
      return new vscode.ThemeIcon(TREE_ICONS.BLOCKED, new vscode.ThemeColor(color));
    }
    
    // Handle priority goals
    if (indicators.isUrgent || indicators.isHighPriority) {
      const iconName = goal.status === 'completed' ? TREE_ICONS.GOAL_COMPLETED : 
                      goal.status === 'in-progress' ? TREE_ICONS.GOAL_IN_PROGRESS :
                      TREE_ICONS.GOAL_PLANNED;
      return new vscode.ThemeIcon(iconName, new vscode.ThemeColor(TREE_COLORS.HIGH_PRIORITY));
    }
    
    // Standard status icons
    switch (goal.status) {
      case 'planned':
        return new vscode.ThemeIcon(TREE_ICONS.GOAL_PLANNED, new vscode.ThemeColor(TREE_COLORS.PLANNED));
      case 'in-progress':
        return new vscode.ThemeIcon(TREE_ICONS.GOAL_IN_PROGRESS, new vscode.ThemeColor(TREE_COLORS.IN_PROGRESS));
      case 'completed':
        return new vscode.ThemeIcon(TREE_ICONS.GOAL_COMPLETED, new vscode.ThemeColor(TREE_COLORS.COMPLETED));
      default:
        return new vscode.ThemeIcon(TREE_ICONS.GOAL_PLANNED, new vscode.ThemeColor(TREE_COLORS.PLANNED));
    }
  },
  
  /**
   * Get icon for a task based on its status
   */
  getTaskIcon(task: Task): vscode.ThemeIcon {
    switch (task.status) {
      case 'todo':
        return new vscode.ThemeIcon(TREE_ICONS.TASK_TODO, new vscode.ThemeColor(TREE_COLORS.FOREGROUND));
      case 'in-progress':
        return new vscode.ThemeIcon(TREE_ICONS.TASK_IN_PROGRESS, new vscode.ThemeColor(TREE_COLORS.IN_PROGRESS));
      case 'done':
        return new vscode.ThemeIcon(TREE_ICONS.TASK_DONE, new vscode.ThemeColor(TREE_COLORS.COMPLETED));
      default:
        return new vscode.ThemeIcon(TREE_ICONS.TASK_TODO, new vscode.ThemeColor(TREE_COLORS.FOREGROUND));
    }
  }
};