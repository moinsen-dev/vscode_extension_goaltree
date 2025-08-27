/**
 * GoalHierarchyManager - Manages parent-child relationships and hierarchy operations
 * 
 * This service handles all operations related to goal hierarchies including
 * parent-child relationships, reordering, and hierarchy validation.
 */

import { 
  Goal, 
  GoalHierarchy,
  GoalStatus,
  GoalStatusType
} from '../types';

/**
 * Hierarchy operation result
 */
export interface HierarchyOperationResult {
  /** Whether the operation was successful */
  success: boolean;
  /** Error message if operation failed */
  error?: string;
  /** Warning messages */
  warnings: string[];
  /** Goals that were affected by the operation */
  affectedGoals: string[];
}

/**
 * Move goal parameters
 */
export interface MoveGoalParams {
  /** Goal ID to move */
  goalId: string;
  /** New parent ID (undefined for root level) */
  newParentId?: string;
  /** Position in the new parent's children (0-based, undefined for end) */
  position?: number;
}

/**
 * Reorder goals parameters
 */
export interface ReorderGoalsParams {
  /** Parent ID whose children to reorder */
  parentId?: string;
  /** Ordered list of goal IDs */
  orderedGoalIds: string[];
}

/**
 * Hierarchy statistics
 */
export interface HierarchyStatistics {
  /** Total number of root goals */
  rootGoals: number;
  /** Maximum depth of the hierarchy */
  maxDepth: number;
  /** Average number of children per parent */
  averageChildren: number;
  /** Total number of leaf goals */
  leafGoals: number;
  /** Goals by depth level */
  goalsByDepth: Record<number, number>;
}

/**
 * Goal hierarchy change event
 */
export interface HierarchyChangeEvent {
  /** Type of hierarchy change */
  type: 'move' | 'reorder' | 'parent-change';
  /** Goals that were affected */
  affectedGoals: Array<{
    goalId: string;
    previousParentId?: string;
    newParentId?: string;
    previousPosition?: number;
    newPosition?: number;
  }>;
  /** Timestamp of the change */
  timestamp: Date;
}

/**
 * GoalHierarchyManager handles all hierarchy-related operations
 */
export class GoalHierarchyManager {
  private goals: Map<string, Goal> = new Map();
  private hierarchyChangeListeners: Array<(event: HierarchyChangeEvent) => void> = [];

  /**
   * Set the goals collection for hierarchy management
   */
  setGoals(goals: Goal[]): void {
    this.goals.clear();
    goals.forEach(goal => {
      this.goals.set(goal.id, goal);
    });
  }

  /**
   * Add a hierarchy change listener
   */
  onHierarchyChange(listener: (event: HierarchyChangeEvent) => void): void {
    this.hierarchyChangeListeners.push(listener);
  }

  /**
   * Remove a hierarchy change listener
   */
  removeHierarchyChangeListener(listener: (event: HierarchyChangeEvent) => void): void {
    const index = this.hierarchyChangeListeners.indexOf(listener);
    if (index > -1) {
      this.hierarchyChangeListeners.splice(index, 1);
    }
  }

  /**
   * Get the full hierarchy tree
   */
  getHierarchy(): GoalHierarchy[] {
    const rootGoals = Array.from(this.goals.values()).filter(goal => !goal.parentId);
    return rootGoals.map(goal => this.buildHierarchy(goal, 0, [goal.id]));
  }

  /**
   * Build hierarchy for a specific goal
   */
  private buildHierarchy(goal: Goal, level: number, path: string[]): GoalHierarchy {
    const children = this.getDirectChildren(goal.id);
    return {
      goal,
      children: children.map(child => 
        this.buildHierarchy(child, level + 1, [...path, child.id])
      ),
      level,
      path
    };
  }

  /**
   * Get direct children of a goal
   */
  getDirectChildren(parentId: string): Goal[] {
    return Array.from(this.goals.values())
      .filter(goal => goal.parentId === parentId)
      .sort((a, b) => {
        // Sort by metadata order if available, otherwise by creation date
        const orderA = a.metadata?.priority || 0;
        const orderB = b.metadata?.priority || 0;
        if (orderA !== orderB) {
          return orderB - orderA; // Higher priority first
        }
        return a.createdAt.getTime() - b.createdAt.getTime();
      });
  }

  /**
   * Get all descendant goals (recursive children)
   */
  getAllDescendants(goalId: string): Goal[] {
    const descendants: Goal[] = [];
    const directChildren = this.getDirectChildren(goalId);
    
    for (const child of directChildren) {
      descendants.push(child);
      descendants.push(...this.getAllDescendants(child.id));
    }
    
    return descendants;
  }

  /**
   * Get all ancestors of a goal
   */
  getAncestors(goalId: string): Goal[] {
    const ancestors: Goal[] = [];
    let current = this.goals.get(goalId);
    
    while (current?.parentId) {
      const parent = this.goals.get(current.parentId);
      if (parent) {
        ancestors.unshift(parent); // Add to beginning to maintain order
        current = parent;
      } else {
        break;
      }
    }
    
    return ancestors;
  }

  /**
   * Get the root goal for a given goal
   */
  getRootGoal(goalId: string): Goal | undefined {
    const ancestors = this.getAncestors(goalId);
    return ancestors.length > 0 ? ancestors[0] : this.goals.get(goalId);
  }

  /**
   * Check if a goal is an ancestor of another goal
   */
  isAncestor(potentialAncestorId: string, goalId: string): boolean {
    const ancestors = this.getAncestors(goalId);
    return ancestors.some(ancestor => ancestor.id === potentialAncestorId);
  }

  /**
   * Get the depth of a goal in the hierarchy
   */
  getGoalDepth(goalId: string): number {
    return this.getAncestors(goalId).length;
  }

  /**
   * Get siblings of a goal (goals with the same parent)
   */
  getSiblings(goalId: string): Goal[] {
    const goal = this.goals.get(goalId);
    if (!goal) {
      return [];
    }
    
    return this.getDirectChildren(goal.parentId || '')
      .filter(sibling => sibling.id !== goalId);
  }

  /**
   * Validate if a goal can be moved to a new parent
   */
  validateMove(goalId: string, newParentId?: string): HierarchyOperationResult {
    const goal = this.goals.get(goalId);
    if (!goal) {
      return {
        success: false,
        error: `Goal with ID ${goalId} not found`,
        warnings: [],
        affectedGoals: []
      };
    }

    // Check if new parent exists (if specified)
    if (newParentId) {
      const newParent = this.goals.get(newParentId);
      if (!newParent) {
        return {
          success: false,
          error: `New parent goal with ID ${newParentId} not found`,
          warnings: [],
          affectedGoals: []
        };
      }

      // Prevent circular references
      if (this.wouldCreateCircularReference(goalId, newParentId)) {
        return {
          success: false,
          error: 'Moving goal would create a circular reference in the hierarchy',
          warnings: [],
          affectedGoals: []
        };
      }

      // Prevent moving a goal under its own descendant
      if (this.isAncestor(goalId, newParentId)) {
        return {
          success: false,
          error: 'Cannot move a goal under its own descendant',
          warnings: [],
          affectedGoals: []
        };
      }
    }

    // Collect warnings
    const warnings: string[] = [];
    const affectedGoals = [goalId];

    // Check for potential issues
    if (newParentId) {
      const newParent = this.goals.get(newParentId);
      if (newParent?.status === GoalStatus.COMPLETED) {
        warnings.push('Moving goal under a completed parent may affect completion status');
      }
    }

    // Add descendants to affected goals
    const descendants = this.getAllDescendants(goalId);
    affectedGoals.push(...descendants.map(d => d.id));

    return {
      success: true,
      warnings,
      affectedGoals
    };
  }

  /**
   * Check if moving a goal would create a circular reference
   */
  private wouldCreateCircularReference(goalId: string, newParentId: string): boolean {
    // A circular reference would occur if the new parent is a descendant of the goal being moved
    return this.isAncestor(goalId, newParentId);
  }

  /**
   * Move a goal to a new parent
   */
  async moveGoal(params: MoveGoalParams): Promise<HierarchyOperationResult> {
    const { goalId, newParentId, position } = params;

    // Validate the move
    const validation = this.validateMove(goalId, newParentId);
    if (!validation.success) {
      return validation;
    }

    const goal = this.goals.get(goalId)!;
    const previousParentId = goal.parentId;

    // Update the goal's parent
    goal.parentId = newParentId;
    goal.updatedAt = new Date();

    // Handle position if specified
    if (position !== undefined && newParentId) {
      // For now, we'll use metadata priority to simulate ordering
      // In a real implementation, you might want a dedicated ordering system
      const siblings = this.getDirectChildren(newParentId).filter(s => s.id !== goalId);
      goal.metadata = goal.metadata || {};
      
      // Adjust priorities to maintain order
      if (position === 0) {
        // First position - set priority higher than current highest
        const maxPriority = Math.max(...siblings.map(s => s.metadata?.priority || 0));
        goal.metadata.priority = maxPriority + 1;
      } else if (position >= siblings.length) {
        // Last position - set priority lower than current lowest
        const minPriority = Math.min(...siblings.map(s => s.metadata?.priority || 0));
        goal.metadata.priority = Math.min(minPriority - 1, 0);
      } else {
        // Middle position - interpolate priority
        const sortedSiblings = siblings.sort((a, b) => (b.metadata?.priority || 0) - (a.metadata?.priority || 0));
        const beforePriority = sortedSiblings[position - 1]?.metadata?.priority || 0;
        const afterPriority = sortedSiblings[position]?.metadata?.priority || 0;
        goal.metadata.priority = (beforePriority + afterPriority) / 2;
      }
    }

    // Create and emit hierarchy change event
    const event: HierarchyChangeEvent = {
      type: 'move',
      affectedGoals: [{
        goalId,
        previousParentId,
        newParentId,
        previousPosition: undefined, // Would need to be calculated from previous state
        newPosition: position
      }],
      timestamp: new Date()
    };

    this.hierarchyChangeListeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('Error in hierarchy change listener:', error);
      }
    });

    return {
      success: true,
      warnings: validation.warnings,
      affectedGoals: validation.affectedGoals
    };
  }

  /**
   * Reorder goals within the same parent
   */
  async reorderGoals(params: ReorderGoalsParams): Promise<HierarchyOperationResult> {
    const { parentId, orderedGoalIds } = params;

    // Get current children
    const currentChildren = this.getDirectChildren(parentId || '');
    const currentChildIds = currentChildren.map(c => c.id);

    // Validate that all provided IDs are current children
    const invalidIds = orderedGoalIds.filter(id => !currentChildIds.includes(id));
    if (invalidIds.length > 0) {
      return {
        success: false,
        error: `Invalid goal IDs for reordering: ${invalidIds.join(', ')}`,
        warnings: [],
        affectedGoals: []
      };
    }

    // Validate that all current children are included
    const missingIds = currentChildIds.filter(id => !orderedGoalIds.includes(id));
    if (missingIds.length > 0) {
      return {
        success: false,
        error: `Missing goal IDs in reorder operation: ${missingIds.join(', ')}`,
        warnings: [],
        affectedGoals: []
      };
    }

    // Update priorities based on new order
    const affectedGoals: Array<{
      goalId: string;
      previousParentId?: string;
      newParentId?: string;
      previousPosition?: number;
      newPosition?: number;
    }> = [];

    orderedGoalIds.forEach((goalId, index) => {
      const goal = this.goals.get(goalId)!;
      const previousPosition = currentChildIds.indexOf(goalId);
      
      goal.metadata = goal.metadata || {};
      goal.metadata.priority = orderedGoalIds.length - index; // Higher index = higher priority
      goal.updatedAt = new Date();

      affectedGoals.push({
        goalId,
        previousParentId: parentId,
        newParentId: parentId,
        previousPosition,
        newPosition: index
      });
    });

    // Create and emit hierarchy change event
    const event: HierarchyChangeEvent = {
      type: 'reorder',
      affectedGoals,
      timestamp: new Date()
    };

    this.hierarchyChangeListeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('Error in hierarchy change listener:', error);
      }
    });

    return {
      success: true,
      warnings: [],
      affectedGoals: orderedGoalIds
    };
  }

  /**
   * Get hierarchy statistics
   */
  getHierarchyStatistics(): HierarchyStatistics {
    const goals = Array.from(this.goals.values());
    const rootGoals = goals.filter(g => !g.parentId);
    const goalsByDepth: Record<number, number> = {};
    let maxDepth = 0;
    let totalChildren = 0;
    let parentCount = 0;

    // Calculate statistics
    goals.forEach(goal => {
      const depth = this.getGoalDepth(goal.id);
      maxDepth = Math.max(maxDepth, depth);
      
      if (goalsByDepth[depth]) {
        goalsByDepth[depth]++;
      } else {
        goalsByDepth[depth] = 1;
      }

      const children = this.getDirectChildren(goal.id);
      if (children.length > 0) {
        totalChildren += children.length;
        parentCount++;
      }
    });

    const leafGoals = goals.filter(goal => this.getDirectChildren(goal.id).length === 0).length;
    const averageChildren = parentCount > 0 ? totalChildren / parentCount : 0;

    return {
      rootGoals: rootGoals.length,
      maxDepth,
      averageChildren: Math.round(averageChildren * 100) / 100,
      leafGoals,
      goalsByDepth
    };
  }

  /**
   * Find goals by hierarchy criteria
   */
  findGoals(criteria: {
    /** Find root goals only */
    rootOnly?: boolean;
    /** Find leaf goals only */
    leafOnly?: boolean;
    /** Find goals at specific depth */
    depth?: number;
    /** Find goals with specific parent */
    parentId?: string;
    /** Maximum depth to search */
    maxDepth?: number;
  }): Goal[] {
    let results = Array.from(this.goals.values());

    if (criteria.rootOnly) {
      results = results.filter(goal => !goal.parentId);
    }

    if (criteria.leafOnly) {
      results = results.filter(goal => this.getDirectChildren(goal.id).length === 0);
    }

    if (criteria.depth !== undefined) {
      results = results.filter(goal => this.getGoalDepth(goal.id) === criteria.depth);
    }

    if (criteria.parentId !== undefined) {
      results = results.filter(goal => goal.parentId === criteria.parentId);
    }

    if (criteria.maxDepth !== undefined) {
      const maxDepth = criteria.maxDepth;
      results = results.filter(goal => this.getGoalDepth(goal.id) <= maxDepth);
    }

    return results;
  }

  /**
   * Get the path from root to a specific goal
   */
  getGoalPath(goalId: string): Goal[] {
    const goal = this.goals.get(goalId);
    if (!goal) {
      return [];
    }

    const ancestors = this.getAncestors(goalId);
    return [...ancestors, goal];
  }

  /**
   * Check if the hierarchy has any orphaned goals
   */
  findOrphanedGoals(): Goal[] {
    return Array.from(this.goals.values()).filter(goal => {
      if (!goal.parentId) {
        return false; // Root goals are not orphaned
      }
      return !this.goals.has(goal.parentId);
    });
  }
}

/**
 * Create a new GoalHierarchyManager instance
 */
export function createGoalHierarchyManager(): GoalHierarchyManager {
  return new GoalHierarchyManager();
}