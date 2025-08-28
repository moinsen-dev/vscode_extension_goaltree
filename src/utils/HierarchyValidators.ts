/**
 * HierarchyValidators - Validation utilities for goal hierarchy operations
 * 
 * This module provides comprehensive validation for goal hierarchies including
 * circular dependency detection, depth limits, and structural integrity checks.
 */

import { Goal, GoalStatus, GoalStatusType } from '../types';

/**
 * Validation result for hierarchy operations
 */
export interface ValidationResult {
  /** Whether the validation passed */
  isValid: boolean;
  /** Error message if validation failed */
  error?: string;
  /** Warning messages */
  warnings: string[];
  /** Additional context information */
  context?: Record<string, any>;
}

/**
 * Circular dependency detection result
 */
export interface CircularDependencyResult {
  /** Whether a circular dependency was found */
  hasCircularDependency: boolean;
  /** The cycle path if found */
  cyclePath: string[];
  /** Description of the circular dependency */
  description?: string;
}

/**
 * Hierarchy integrity check result
 */
export interface IntegrityCheckResult {
  /** Whether the hierarchy is valid */
  isValid: boolean;
  /** List of issues found */
  issues: Array<{
    type: 'orphaned' | 'circular' | 'depth' | 'status' | 'blocking';
    goalId: string;
    description: string;
    severity: 'error' | 'warning';
  }>;
  /** Summary statistics */
  statistics: {
    totalGoals: number;
    rootGoals: number;
    maxDepth: number;
    orphanedGoals: number;
    circularReferences: number;
  };
}

/**
 * Configuration for hierarchy validation
 */
export interface HierarchyValidationConfig {
  /** Maximum allowed depth in the hierarchy */
  maxDepth: number;
  /** Maximum number of children per parent */
  maxChildrenPerParent: number;
  /** Whether to allow orphaned goals */
  allowOrphanedGoals: boolean;
  /** Whether to validate status consistency */
  validateStatusConsistency: boolean;
}

/**
 * Default validation configuration
 */
export const DEFAULT_HIERARCHY_CONFIG: HierarchyValidationConfig = {
  maxDepth: 10,
  maxChildrenPerParent: 50,
  allowOrphanedGoals: false,
  validateStatusConsistency: true
};

/**
 * HierarchyValidators provides validation utilities for goal hierarchies
 */
export class HierarchyValidators {
  private goals: Map<string, Goal> = new Map();
  private config: HierarchyValidationConfig;

  constructor(config: HierarchyValidationConfig = DEFAULT_HIERARCHY_CONFIG) {
    this.config = config;
  }

  /**
   * Set the goals collection for validation
   */
  setGoals(goals: Goal[]): void {
    this.goals.clear();
    goals.forEach(goal => {
      this.goals.set(goal.id, goal);
    });
  }

  /**
   * Update validation configuration
   */
  updateConfig(config: Partial<HierarchyValidationConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Detect circular dependencies in the hierarchy
   */
  detectCircularDependencies(): CircularDependencyResult[] {
    const results: CircularDependencyResult[] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    
    // Check each goal as a potential starting point
    for (const goal of this.goals.values()) {
      if (!visited.has(goal.id)) {
        const cycle = this.findCycleFromGoal(goal.id, visited, recursionStack, []);
        if (cycle.length > 0) {
          results.push({
            hasCircularDependency: true,
            cyclePath: cycle,
            description: `Circular dependency detected: ${cycle.join(' → ')}`
          });
        }
      }
    }

    // If no cycles found, return a single negative result
    if (results.length === 0) {
      results.push({
        hasCircularDependency: false,
        cyclePath: []
      });
    }

    return results;
  }

  /**
   * Find cycle starting from a specific goal using DFS
   */
  private findCycleFromGoal(
    goalId: string, 
    visited: Set<string>, 
    recursionStack: Set<string>, 
    path: string[]
  ): string[] {
    if (recursionStack.has(goalId)) {
      // Found a cycle - return the cycle path
      const cycleStart = path.indexOf(goalId);
      return path.slice(cycleStart).concat(goalId);
    }

    if (visited.has(goalId)) {
      return []; // Already visited, no cycle from this path
    }

    visited.add(goalId);
    recursionStack.add(goalId);
    path.push(goalId);

    const goal = this.goals.get(goalId);
    if (goal) {
      // Check parent relationship
      if (goal.parentId) {
        const parentCycle = this.findCycleFromGoal(goal.parentId, visited, recursionStack, [...path]);
        if (parentCycle.length > 0) {
          return parentCycle;
        }
      }

      // Check blocking relationships
      for (const blockingId of goal.blockedByIds) {
        const blockingCycle = this.findCycleFromGoal(blockingId, visited, recursionStack, [...path]);
        if (blockingCycle.length > 0) {
          return blockingCycle;
        }
      }
    }

    recursionStack.delete(goalId);
    path.pop();
    return [];
  }

  /**
   * Validate that moving a goal won't create circular dependencies
   */
  validateMove(goalId: string, newParentId?: string): ValidationResult {
    const warnings: string[] = [];
    
    // Check if goal exists
    const goal = this.goals.get(goalId);
    if (!goal) {
      return {
        isValid: false,
        error: `Goal with ID ${goalId} not found`,
        warnings
      };
    }

    // Check if new parent exists (if specified)
    if (newParentId && !this.goals.has(newParentId)) {
      return {
        isValid: false,
        error: `New parent goal with ID ${newParentId} not found`,
        warnings
      };
    }

    // Prevent moving a goal to be its own parent
    if (goalId === newParentId) {
      return {
        isValid: false,
        error: 'Cannot move a goal to be its own parent',
        warnings
      };
    }

    // Check for circular dependency
    if (newParentId && this.wouldCreateCircularHierarchy(goalId, newParentId)) {
      return {
        isValid: false,
        error: 'Moving goal would create a circular hierarchy',
        warnings
      };
    }

    // Check depth limits
    if (newParentId) {
      const newDepth = this.calculateGoalDepth(newParentId) + 1;
      const maxChildDepth = this.getMaxDescendantDepth(goalId);
      const totalDepth = newDepth + maxChildDepth;

      if (totalDepth > this.config.maxDepth) {
        return {
          isValid: false,
          error: `Move would exceed maximum depth limit of ${this.config.maxDepth}`,
          warnings,
          context: {
            currentDepth: this.calculateGoalDepth(goalId),
            newDepth,
            maxChildDepth,
            totalDepth
          }
        };
      }
    }

    // Check children count limits
    if (newParentId) {
      const siblingCount = this.getDirectChildren(newParentId).length;
      if (siblingCount >= this.config.maxChildrenPerParent) {
        return {
          isValid: false,
          error: `New parent already has maximum allowed children (${this.config.maxChildrenPerParent})`,
          warnings
        };
      }

      if (siblingCount >= this.config.maxChildrenPerParent * 0.8) {
        warnings.push(`New parent is approaching maximum children limit (${siblingCount}/${this.config.maxChildrenPerParent})`);
      }
    }

    // Status consistency warnings
    if (this.config.validateStatusConsistency && newParentId) {
      const newParent = this.goals.get(newParentId)!;
      if (newParent.status === GoalStatus.COMPLETED && goal.status !== GoalStatus.COMPLETED) {
        warnings.push('Moving incomplete goal under a completed parent may affect status consistency');
      }
    }

    return {
      isValid: true,
      warnings
    };
  }

  /**
   * Check if moving a goal would create a circular hierarchy
   */
  private wouldCreateCircularHierarchy(goalId: string, newParentId: string): boolean {
    // Check if the new parent is a descendant of the goal being moved
    return this.isDescendant(newParentId, goalId);
  }

  /**
   * Check if one goal is a descendant of another
   */
  private isDescendant(potentialDescendantId: string, ancestorId: string): boolean {
    let current = this.goals.get(potentialDescendantId);
    
    while (current?.parentId) {
      if (current.parentId === ancestorId) {
        return true;
      }
      current = this.goals.get(current.parentId);
    }
    
    return false;
  }

  /**
   * Calculate the depth of a goal in the hierarchy
   */
  private calculateGoalDepth(goalId: string): number {
    let depth = 0;
    let current = this.goals.get(goalId);
    
    while (current?.parentId) {
      depth++;
      current = this.goals.get(current.parentId);
      
      // Prevent infinite loops in case of existing circular references
      if (depth > this.config.maxDepth * 2) {
        break;
      }
    }
    
    return depth;
  }

  /**
   * Get the maximum depth among all descendants of a goal
   */
  private getMaxDescendantDepth(goalId: string): number {
    const children = this.getDirectChildren(goalId);
    if (children.length === 0) {
      return 0;
    }
    
    let maxDepth = 0;
    for (const child of children) {
      const childDepth = 1 + this.getMaxDescendantDepth(child.id);
      maxDepth = Math.max(maxDepth, childDepth);
    }
    
    return maxDepth;
  }

  /**
   * Get direct children of a goal
   */
  private getDirectChildren(parentId: string): Goal[] {
    return Array.from(this.goals.values()).filter(goal => goal.parentId === parentId);
  }

  /**
   * Validate blocking relationships
   */
  validateBlockingRelationships(): ValidationResult {
    const warnings: string[] = [];
    const errors: string[] = [];

    for (const goal of this.goals.values()) {
      // Check if all blocking goals exist
      for (const blockingId of goal.blockedByIds) {
        if (!this.goals.has(blockingId)) {
          errors.push(`Goal ${goal.id} is blocked by non-existent goal ${blockingId}`);
        }
      }

      // Check for self-blocking
      if (goal.blockedByIds.includes(goal.id)) {
        errors.push(`Goal ${goal.id} is blocking itself`);
      }

      // Check for circular blocking dependencies
      const blockingCycle = this.detectBlockingCycle(goal.id, new Set(), []);
      if (blockingCycle.length > 0) {
        errors.push(`Circular blocking dependency detected: ${blockingCycle.join(' → ')}`);
      }
    }

    return {
      isValid: errors.length === 0,
      error: errors.length > 0 ? errors.join('; ') : undefined,
      warnings
    };
  }

  /**
   * Detect circular blocking dependencies
   */
  private detectBlockingCycle(goalId: string, visited: Set<string>, path: string[]): string[] {
    if (visited.has(goalId)) {
      const cycleStart = path.indexOf(goalId);
      return cycleStart >= 0 ? path.slice(cycleStart).concat(goalId) : [];
    }

    visited.add(goalId);
    path.push(goalId);

    const goal = this.goals.get(goalId);
    if (goal) {
      for (const blockingId of goal.blockedByIds) {
        const cycle = this.detectBlockingCycle(blockingId, new Set(visited), [...path]);
        if (cycle.length > 0) {
          return cycle;
        }
      }
    }

    return [];
  }

  /**
   * Perform comprehensive hierarchy integrity check
   */
  performIntegrityCheck(): IntegrityCheckResult {
    const issues: IntegrityCheckResult['issues'] = [];
    const goals = Array.from(this.goals.values());

    // Check for orphaned goals
    const orphanedGoals = goals.filter(goal => {
      if (!goal.parentId) return false; // Root goals are not orphaned
      return !this.goals.has(goal.parentId);
    });

    orphanedGoals.forEach(goal => {
      issues.push({
        type: 'orphaned',
        goalId: goal.id,
        description: `Goal has non-existent parent: ${goal.parentId}`,
        severity: this.config.allowOrphanedGoals ? 'warning' : 'error'
      });
    });

    // Check for circular dependencies
    const circularDeps = this.detectCircularDependencies();
    circularDeps.forEach(result => {
      if (result.hasCircularDependency) {
        const goalId = result.cyclePath[0] || 'unknown';
        issues.push({
          type: 'circular',
          goalId,
          description: result.description || 'Circular dependency detected',
          severity: 'error'
        });
      }
    });

    // Check depth limits
    goals.forEach(goal => {
      const depth = this.calculateGoalDepth(goal.id);
      if (depth > this.config.maxDepth) {
        issues.push({
          type: 'depth',
          goalId: goal.id,
          description: `Goal exceeds maximum depth limit: ${depth} > ${this.config.maxDepth}`,
          severity: 'error'
        });
      }
    });

    // Check children count limits
    goals.forEach(goal => {
      const children = this.getDirectChildren(goal.id);
      if (children.length > this.config.maxChildrenPerParent) {
        issues.push({
          type: 'depth',
          goalId: goal.id,
          description: `Goal has too many children: ${children.length} > ${this.config.maxChildrenPerParent}`,
          severity: 'error'
        });
      }
    });

    // Check status consistency
    if (this.config.validateStatusConsistency) {
      goals.forEach(goal => {
        if (goal.status === GoalStatus.COMPLETED) {
          const incompleteChildren = this.getDirectChildren(goal.id)
            .filter(child => child.status !== GoalStatus.COMPLETED);
          
          if (incompleteChildren.length > 0) {
            issues.push({
              type: 'status',
              goalId: goal.id,
              description: `Completed goal has incomplete children: ${incompleteChildren.map(c => c.id).join(', ')}`,
              severity: 'warning'
            });
          }
        }
      });
    }

    // Check blocking relationships
    const blockingValidation = this.validateBlockingRelationships();
    if (!blockingValidation.isValid && blockingValidation.error) {
      issues.push({
        type: 'blocking',
        goalId: 'multiple',
        description: blockingValidation.error,
        severity: 'error'
      });
    }

    // Calculate statistics
    const rootGoals = goals.filter(g => !g.parentId).length;
    const maxDepth = Math.max(...goals.map(g => this.calculateGoalDepth(g.id)), 0);

    return {
      isValid: !issues.some(issue => issue.severity === 'error'),
      issues,
      statistics: {
        totalGoals: goals.length,
        rootGoals,
        maxDepth,
        orphanedGoals: orphanedGoals.length,
        circularReferences: circularDeps.filter(r => r.hasCircularDependency).length
      }
    };
  }

  /**
   * Quick validation for common operations
   */
  quickValidate(operation: 'move' | 'create' | 'delete', goalId: string, targetId?: string): ValidationResult {
    switch (operation) {
      case 'move':
        return this.validateMove(goalId, targetId);
      
      case 'create':
        if (targetId) {
          // Validate parent exists and children count
          if (!this.goals.has(targetId)) {
            return {
              isValid: false,
              error: `Parent goal ${targetId} not found`,
              warnings: []
            };
          }
          
          const childrenCount = this.getDirectChildren(targetId).length;
          if (childrenCount >= this.config.maxChildrenPerParent) {
            return {
              isValid: false,
              error: `Parent already has maximum allowed children (${this.config.maxChildrenPerParent})`,
              warnings: []
            };
          }
        }
        return { isValid: true, warnings: [] };
      
      case 'delete':
        const children = this.getDirectChildren(goalId);
        const warnings: string[] = [];
        
        if (children.length > 0) {
          warnings.push(`Deleting goal will orphan ${children.length} child goals`);
        }
        
        return { isValid: true, warnings };
      
      default:
        return { isValid: true, warnings: [] };
    }
  }
}

/**
 * Create a new HierarchyValidators instance
 */
export function createHierarchyValidators(config?: HierarchyValidationConfig): HierarchyValidators {
  return new HierarchyValidators(config);
}

/**
 * Utility function to validate a hierarchy configuration
 */
export function validateHierarchyConfig(config: Partial<HierarchyValidationConfig>): ValidationResult {
  const warnings: string[] = [];
  
  if (config.maxDepth !== undefined && config.maxDepth < 1) {
    return {
      isValid: false,
      error: 'Maximum depth must be at least 1',
      warnings
    };
  }
  
  if (config.maxChildrenPerParent !== undefined && config.maxChildrenPerParent < 1) {
    return {
      isValid: false,
      error: 'Maximum children per parent must be at least 1',
      warnings
    };
  }
  
  if (config.maxDepth !== undefined && config.maxDepth > 20) {
    warnings.push('Very large maximum depth may impact performance');
  }
  
  if (config.maxChildrenPerParent !== undefined && config.maxChildrenPerParent > 100) {
    warnings.push('Very large maximum children count may impact UI performance');
  }
  
  return {
    isValid: true,
    warnings
  };
}