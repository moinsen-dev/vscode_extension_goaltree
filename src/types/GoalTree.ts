/**
 * GoalTree types and interfaces for hierarchical goal management
 * This file defines the GoalTree container class and related types for managing goal hierarchies
 */

import { Goal, GoalStatus, GoalStatusType } from './Goal';
import { Task, TaskStatus, TaskStatusType } from './Task';

/**
 * Goal hierarchy information
 */
export interface GoalHierarchy {
  /** The goal itself */
  goal: Goal;
  
  /** Direct children of this goal */
  children: GoalHierarchy[];
  
  /** Depth level in the hierarchy (0 for root goals) */
  level: number;
  
  /** Path from root to this goal (array of goal IDs) */
  path: string[];
  
  /** Parent hierarchy node (undefined for root goals) */
  parent?: GoalHierarchy;
}

/**
 * Goal relationship information for dependency tracking
 */
export interface GoalRelationship {
  /** The goal that is blocked */
  blockedGoal: Goal;
  
  /** The goal that is doing the blocking */
  blockingGoal: Goal;
  
  /** Whether this is a direct or transitive relationship */
  isDirect: boolean;
  
  /** Depth of the dependency relationship */
  depth: number;
}

/**
 * Goal tree statistics
 */
export interface GoalTreeStats {
  /** Total number of goals in the tree */
  totalGoals: number;
  
  /** Number of root goals (goals without parents) */
  rootGoals: number;
  
  /** Number of completed goals */
  completedGoals: number;
  
  /** Number of blocked goals */
  blockedGoals: number;
  
  /** Number of goals in progress */
  inProgressGoals: number;
  
  /** Number of planned goals */
  plannedGoals: number;
  
  /** Total number of tasks across all goals */
  totalTasks: number;
  
  /** Number of completed tasks */
  completedTasks: number;
  
  /** Number of tasks in progress */
  inProgressTasks: number;
  
  /** Number of pending tasks */
  pendingTasks: number;
  
  /** Maximum depth of the goal hierarchy */
  maxDepth: number;
  
  /** Average number of children per goal */
  averageChildren: number;
  
  /** Overall progress percentage (0-100) */
  overallProgress: number;
}

/**
 * GoalTree traversal options
 */
export interface TraversalOptions {
  /** Whether to include completed goals */
  includeCompleted?: boolean;
  
  /** Whether to include blocked goals */
  includeBlocked?: boolean;
  
  /** Maximum depth to traverse (-1 for unlimited) */
  maxDepth?: number;
  
  /** Filter predicate for goals */
  goalFilter?: (goal: Goal) => boolean;
  
  /** Whether to traverse breadth-first (default: depth-first) */
  breadthFirst?: boolean;
}

/**
 * Goal search options
 */
export interface GoalSearchOptions {
  /** Search query string */
  query?: string;
  
  /** Search in goal titles */
  searchTitles?: boolean;
  
  /** Search in goal descriptions */
  searchDescriptions?: boolean;
  
  /** Search in task titles and descriptions */
  searchTasks?: boolean;
  
  /** Filter by goal status */
  status?: GoalStatusType[];
  
  /** Filter by tags */
  tags?: string[];
  
  /** Filter by priority range */
  priorityRange?: { min: number; max: number };
  
  /** Case-sensitive search */
  caseSensitive?: boolean;
  
  /** Use regex for search */
  useRegex?: boolean;
}

/**
 * Goal search results
 */
export interface GoalSearchResults {
  /** Matching goals */
  goals: Goal[];
  
  /** Total number of matches */
  totalMatches: number;
  
  /** Search query used */
  query?: string;
  
  /** Time taken for search in milliseconds */
  searchTime: number;
}

/**
 * Bulk operation result for multiple goals/tasks
 */
export interface BulkOperationResult {
  /** Number of successful operations */
  successful: number;
  
  /** Number of failed operations */
  failed: number;
  
  /** Array of error messages for failed operations */
  errors: string[];
  
  /** Details of the operations performed */
  details: Array<{
    goalId: string;
    operation: string;
    success: boolean;
    error?: string;
  }>;
}

/**
 * GoalTree validation result
 */
export interface GoalTreeValidationResult {
  /** Whether the tree is valid */
  isValid: boolean;
  
  /** Array of validation errors */
  errors: string[];
  
  /** Array of validation warnings */
  warnings: string[];
  
  /** Number of goals validated */
  goalsValidated: number;
  
  /** Number of tasks validated */
  tasksValidated: number;
}

/**
 * Goal dependency cycle detection result
 */
export interface CycleDetectionResult {
  /** Whether cycles were found */
  hasCycles: boolean;
  
  /** Array of detected cycles (each cycle is an array of goal IDs) */
  cycles: string[][];
  
  /** Goals involved in cycles */
  cyclicGoals: string[];
}

/**
 * GoalTree export/import format
 */
export interface GoalTreeData {
  /** Format version */
  version: string;
  
  /** Goals in the tree */
  goals: Goal[];
  
  /** When the data was created/exported */
  createdAt: Date;
  
  /** When the data was last updated */
  updatedAt?: Date;
  
  /** Metadata about the export */
  metadata?: {
    /** Name of the workspace */
    workspaceName?: string;
    
    /** Description of the goal tree */
    description?: string;
    
    /** Total number of goals */
    totalGoals: number;
    
    /** Total number of tasks */
    totalTasks: number;
    
    /** Exported by (user/system identifier) */
    exportedBy?: string;
  };
}

/**
 * Type guard for GoalHierarchy
 */
export function isGoalHierarchy(value: unknown): value is GoalHierarchy {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;
  
  // Check required fields
  if (typeof obj.goal !== 'object' || !obj.goal) return false;
  if (!Array.isArray(obj.children)) return false;
  if (typeof obj.level !== 'number' || obj.level < 0) return false;
  if (!Array.isArray(obj.path)) return false;
  
  // Validate path contains strings
  for (const id of obj.path) {
    if (typeof id !== 'string') return false;
  }
  
  // Validate children are GoalHierarchy objects (recursive)
  for (const child of obj.children) {
    if (!isGoalHierarchy(child)) return false;
  }
  
  return true;
}

/**
 * Type guard for GoalTreeStats
 */
export function isGoalTreeStats(value: unknown): value is GoalTreeStats {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;
  const numericFields = [
    'totalGoals', 'rootGoals', 'completedGoals', 'blockedGoals', 'inProgressGoals',
    'plannedGoals', 'totalTasks', 'completedTasks', 'inProgressTasks', 'pendingTasks',
    'maxDepth', 'averageChildren', 'overallProgress'
  ];
  
  for (const field of numericFields) {
    if (typeof obj[field] !== 'number' || obj[field] < 0) {
      return false;
    }
  }
  
  // Overall progress should be 0-100
  if (obj.overallProgress > 100) return false;
  
  return true;
}

/**
 * Type guard for GoalTreeData
 */
export function isGoalTreeData(value: unknown): value is GoalTreeData {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;
  
  // Required fields
  if (typeof obj.version !== 'string') return false;
  if (!Array.isArray(obj.goals)) return false;
  if (!(obj.createdAt instanceof Date) && typeof obj.createdAt !== 'string') return false;
  
  // Optional fields
  if (obj.updatedAt !== undefined && obj.updatedAt !== null) {
    if (!(obj.updatedAt instanceof Date) && typeof obj.updatedAt !== 'string') return false;
  }
  
  if (obj.metadata !== undefined && obj.metadata !== null) {
    if (typeof obj.metadata !== 'object') return false;
    const metadata = obj.metadata as Record<string, unknown>;
    
    if (metadata.totalGoals !== undefined && typeof metadata.totalGoals !== 'number') return false;
    if (metadata.totalTasks !== undefined && typeof metadata.totalTasks !== 'number') return false;
    if (metadata.workspaceName !== undefined && typeof metadata.workspaceName !== 'string') return false;
    if (metadata.description !== undefined && typeof metadata.description !== 'string') return false;
    if (metadata.exportedBy !== undefined && typeof metadata.exportedBy !== 'string') return false;
  }
  
  return true;
}

/**
 * Helper functions for working with goal hierarchies
 */
export const GoalTreeUtils = {
  /**
   * Calculate overall progress for a goal hierarchy
   */
  calculateProgress(hierarchy: GoalHierarchy): number {
    const collectAllGoals = (node: GoalHierarchy): Goal[] => {
      let goals = [node.goal];
      for (const child of node.children) {
        goals = goals.concat(collectAllGoals(child));
      }
      return goals;
    };

    const allGoals = collectAllGoals(hierarchy);
    if (allGoals.length === 0) return 0;

    const completed = allGoals.filter(goal => goal.status === GoalStatus.COMPLETED).length;
    return Math.round((completed / allGoals.length) * 100);
  },

  /**
   * Get the maximum depth of a hierarchy
   */
  getMaxDepth(hierarchy: GoalHierarchy): number {
    let maxDepth = hierarchy.level;
    for (const child of hierarchy.children) {
      const childMaxDepth = this.getMaxDepth(child);
      maxDepth = Math.max(maxDepth, childMaxDepth);
    }
    return maxDepth;
  },

  /**
   * Flatten a hierarchy into an array of goals
   */
  flattenHierarchy(hierarchy: GoalHierarchy): Goal[] {
    let goals = [hierarchy.goal];
    for (const child of hierarchy.children) {
      goals = goals.concat(this.flattenHierarchy(child));
    }
    return goals;
  },

  /**
   * Find a goal in a hierarchy by ID
   */
  findGoalInHierarchy(hierarchy: GoalHierarchy, goalId: string): GoalHierarchy | undefined {
    if (hierarchy.goal.id === goalId) {
      return hierarchy;
    }
    
    for (const child of hierarchy.children) {
      const found = this.findGoalInHierarchy(child, goalId);
      if (found) return found;
    }
    
    return undefined;
  },

  /**
   * Get all leaf goals (goals with no children)
   */
  getLeafGoals(hierarchy: GoalHierarchy): Goal[] {
    if (hierarchy.children.length === 0) {
      return [hierarchy.goal];
    }
    
    let leafGoals: Goal[] = [];
    for (const child of hierarchy.children) {
      leafGoals = leafGoals.concat(this.getLeafGoals(child));
    }
    return leafGoals;
  },

  /**
   * Get the path to a goal as a human-readable string
   */
  getGoalPath(hierarchy: GoalHierarchy, goalId: string): string | undefined {
    const found = this.findGoalInHierarchy(hierarchy, goalId);
    if (!found) return undefined;
    
    const pathGoals = found.path.map(id => {
      const pathGoal = this.findGoalInHierarchy(hierarchy, id);
      return pathGoal ? pathGoal.goal.title : id;
    });
    
    return pathGoals.join(' > ');
  },

  /**
   * Validate goal hierarchy structure
   */
  validateHierarchy(hierarchy: GoalHierarchy): string[] {
    const errors: string[] = [];
    const visitedIds = new Set<string>();

    const validateNode = (node: GoalHierarchy, expectedLevel: number): void => {
      // Check for duplicate IDs
      if (visitedIds.has(node.goal.id)) {
        errors.push(`Duplicate goal ID found: ${node.goal.id}`);
      }
      visitedIds.add(node.goal.id);

      // Check level consistency
      if (node.level !== expectedLevel) {
        errors.push(`Goal ${node.goal.id} has incorrect level: expected ${expectedLevel}, got ${node.level}`);
      }

      // Check path consistency
      if (node.path.length !== expectedLevel) {
        errors.push(`Goal ${node.goal.id} has incorrect path length: expected ${expectedLevel}, got ${node.path.length}`);
      }

      // Check parent-child consistency
      for (const child of node.children) {
        if (child.goal.parentId !== node.goal.id) {
          errors.push(`Child goal ${child.goal.id} has incorrect parentId: expected ${node.goal.id}, got ${child.goal.parentId}`);
        }
        if (child.parent !== node) {
          errors.push(`Child goal ${child.goal.id} has incorrect parent reference`);
        }
        validateNode(child, expectedLevel + 1);
      }
    };

    validateNode(hierarchy, 0);
    return errors;
  }
};