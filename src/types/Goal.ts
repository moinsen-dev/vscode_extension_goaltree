/**
 * Enhanced Goal types with dependency support for the Goal Tree extension
 * This file extends the core Goal model with dependency-specific type definitions
 */

import { Goal as BaseGoal, GoalStatus } from '../models/goal';
import { Dependency, DependencyType, DependencyTypeType } from './Dependency';
import { DependencyStatus, DependencyStatusType } from './DependencyStatus';

/**
 * Enhanced Goal interface that includes structured dependency information
 * This extends the base Goal model with richer dependency data
 */
export interface EnhancedGoal extends BaseGoal {
  /** Structured dependency relationships */
  dependencies: {
    /** Dependencies that block this goal */
    blockedBy: Dependency[];
    
    /** Dependencies this goal blocks */
    blocking: Dependency[];
    
    /** Computed dependency metadata */
    computed: {
      /** Whether this goal is currently blocked by any active dependencies */
      isBlocked: boolean;
      
      /** Number of active dependencies blocking this goal */
      activeBlockingCount: number;
      
      /** Number of goals this goal is currently blocking */
      currentlyBlockingCount: number;
      
      /** Maximum depth of dependency chain blocking this goal */
      maxBlockingDepth: number;
      
      /** Estimated resolution time for all blocking dependencies */
      estimatedUnblockTime?: Date;
      
      /** Whether this goal is part of a circular dependency */
      isInCircularDependency: boolean;
      
      /** Next dependencies that would become unblocked if this goal completes */
      nextUnblockable: string[];
    };
  };
}

/**
 * Goal with dependency context for UI display
 */
export interface GoalWithDependencyContext extends EnhancedGoal {
  /** UI-specific dependency information */
  dependencyContext: {
    /** Visual status for dependency representation */
    visualStatus: GoalDependencyVisualStatus;
    
    /** Human-readable dependency summary */
    dependencySummary: string;
    
    /** Blocking reason (why this goal can't proceed) */
    blockingReason?: string;
    
    /** Critical path information */
    criticalPath?: {
      /** Whether this goal is on the critical path */
      isOnCriticalPath: boolean;
      
      /** Position in the critical path (0-based) */
      criticalPathPosition?: number;
      
      /** Total critical path length */
      criticalPathLength?: number;
    };
    
    /** Dependency warnings */
    warnings: DependencyWarning[];
  };
}

/**
 * Visual status for goal dependency representation
 */
export enum GoalDependencyVisualStatus {
  /** Goal has no dependencies and can proceed */
  FREE = 'free',
  
  /** Goal is blocked by active dependencies */
  BLOCKED = 'blocked',
  
  /** Goal has dependencies but they are close to completion */
  NEARLY_UNBLOCKED = 'nearly_unblocked',
  
  /** Goal is part of a circular dependency */
  CIRCULAR = 'circular',
  
  /** Goal has soft dependencies that don't prevent progress */
  SOFT_BLOCKED = 'soft_blocked',
  
  /** Goal has invalid or problematic dependencies */
  INVALID_DEPENDENCIES = 'invalid_dependencies'
}

/**
 * Type alias for goal dependency visual status string values
 */
export type GoalDependencyVisualStatusType = `${GoalDependencyVisualStatus}`;

/**
 * Dependency warning for goals
 */
export interface DependencyWarning {
  /** Type of warning */
  type: DependencyWarningType;
  
  /** Warning message */
  message: string;
  
  /** Severity level */
  severity: 'low' | 'medium' | 'high' | 'critical';
  
  /** Suggested action */
  suggestedAction?: string;
  
  /** Related goal IDs */
  relatedGoalIds: string[];
}

/**
 * Types of dependency warnings
 */
export enum DependencyWarningType {
  /** Circular dependency detected */
  CIRCULAR_DEPENDENCY = 'circular_dependency',
  
  /** Dependencies are overdue */
  OVERDUE_DEPENDENCIES = 'overdue_dependencies',
  
  /** Too many dependencies for efficient management */
  EXCESSIVE_DEPENDENCIES = 'excessive_dependencies',
  
  /** Blocking goal has been inactive for too long */
  STALE_BLOCKING_GOAL = 'stale_blocking_goal',
  
  /** Invalid or missing dependency relationships */
  INVALID_DEPENDENCIES = 'invalid_dependencies',
  
  /** Potential performance impact from dependency structure */
  PERFORMANCE_CONCERN = 'performance_concern'
}

/**
 * Type alias for dependency warning type string values
 */
export type DependencyWarningTypeType = `${DependencyWarningType}`;

/**
 * Goal dependency configuration
 */
export interface GoalDependencyConfig {
  /** Default dependency type for new relationships */
  defaultDependencyType: DependencyTypeType;
  
  /** Whether to auto-resolve dependencies when blocking goals complete */
  autoResolveDependencies: boolean;
  
  /** Maximum number of dependencies to allow per goal */
  maxDependenciesPerGoal: number;
  
  /** Maximum dependency chain depth */
  maxDependencyChainDepth: number;
  
  /** Whether to warn about circular dependencies */
  warnCircularDependencies: boolean;
  
  /** Whether to allow soft dependencies */
  allowSoftDependencies: boolean;
  
  /** Threshold for considering dependencies "overdue" (in days) */
  overdueThresholdDays: number;
}

/**
 * Goal dependency metrics
 */
export interface GoalDependencyMetrics {
  /** Goal ID */
  goalId: string;
  
  /** Total number of dependencies */
  totalDependencies: number;
  
  /** Number of active dependencies */
  activeDependencies: number;
  
  /** Number of resolved dependencies */
  resolvedDependencies: number;
  
  /** Number of goals this goal blocks */
  goalsBlocked: number;
  
  /** Average age of dependencies (in days) */
  averageDependencyAge: number;
  
  /** Dependency resolution rate (resolved / total) */
  resolutionRate: number;
  
  /** Time spent blocked (in days) */
  timeSpentBlocked: number;
  
  /** Predicted unblock date */
  predictedUnblockDate?: Date;
}

/**
 * Bulk goal dependency operation parameters
 */
export interface BulkGoalDependencyParams {
  /** Goal IDs to operate on */
  goalIds: string[];
  
  /** Operation to perform */
  operation: 'add_dependency' | 'remove_dependency' | 'update_status' | 'validate_dependencies';
  
  /** Operation-specific parameters */
  parameters: {
    /** For add_dependency operation */
    addDependency?: {
      blockingGoalId: string;
      dependencyType?: DependencyTypeType;
    };
    
    /** For remove_dependency operation */
    removeDependency?: {
      blockingGoalId: string;
    };
    
    /** For update_status operation */
    updateStatus?: {
      newStatus: DependencyStatusType;
    };
  };
  
  /** Whether to validate before executing */
  validateFirst?: boolean;
  
  /** Whether to continue on errors */
  continueOnError?: boolean;
}

/**
 * Helper functions for working with enhanced goals
 */
export const GoalDependencyUtils = {
  /**
   * Convert a base goal to an enhanced goal with dependency information
   */
  enhance(baseGoal: BaseGoal, dependencies: Dependency[]): EnhancedGoal {
    const blockedBy = dependencies.filter(d => d.blockedGoalId === baseGoal.id);
    const blocking = dependencies.filter(d => d.blockingGoalId === baseGoal.id);
    
    const activeBlockingCount = blockedBy.filter(d => d.status === DependencyStatus.ACTIVE).length;
    const isBlocked = activeBlockingCount > 0;
    
    return {
      ...baseGoal,
      dependencies: {
        blockedBy,
        blocking,
        computed: {
          isBlocked,
          activeBlockingCount,
          currentlyBlockingCount: blocking.filter(d => d.status === DependencyStatus.ACTIVE).length,
          maxBlockingDepth: this.calculateMaxDepth(baseGoal.id, dependencies),
          isInCircularDependency: this.checkCircularDependency(baseGoal.id, dependencies),
          nextUnblockable: this.getNextUnblockable(baseGoal.id, dependencies)
        }
      }
    };
  },

  /**
   * Calculate the maximum depth of dependency chain for a goal
   */
  calculateMaxDepth(goalId: string, dependencies: Dependency[], visited: Set<string> = new Set()): number {
    if (visited.has(goalId)) {
      return 0; // Avoid infinite loops
    }

    visited.add(goalId);
    const blockedBy = dependencies
      .filter(d => d.blockedGoalId === goalId && d.status === DependencyStatus.ACTIVE)
      .map(d => d.blockingGoalId);

    if (blockedBy.length === 0) {
      return 0;
    }

    let maxDepth = 0;
    for (const blockingGoalId of blockedBy) {
      const depth = this.calculateMaxDepth(blockingGoalId, dependencies, new Set(visited));
      maxDepth = Math.max(maxDepth, depth + 1);
    }

    return maxDepth;
  },

  /**
   * Check if a goal is part of a circular dependency
   */
  checkCircularDependency(goalId: string, dependencies: Dependency[], visited: Set<string> = new Set(), path: Set<string> = new Set()): boolean {
    if (path.has(goalId)) {
      return true; // Cycle detected
    }

    if (visited.has(goalId)) {
      return false; // Already processed
    }

    visited.add(goalId);
    path.add(goalId);

    const blockedBy = dependencies
      .filter(d => d.blockedGoalId === goalId)
      .map(d => d.blockingGoalId);

    for (const blockingGoalId of blockedBy) {
      if (this.checkCircularDependency(blockingGoalId, dependencies, visited, new Set(path))) {
        return true;
      }
    }

    path.delete(goalId);
    return false;
  },

  /**
   * Get goals that would become unblockable if this goal completes
   */
  getNextUnblockable(goalId: string, dependencies: Dependency[]): string[] {
    return dependencies
      .filter(d => d.blockingGoalId === goalId && d.status === DependencyStatus.ACTIVE)
      .map(d => d.blockedGoalId)
      .filter((id, index, array) => array.indexOf(id) === index); // Remove duplicates
  },

  /**
   * Calculate visual status for a goal based on its dependencies
   */
  calculateVisualStatus(goal: EnhancedGoal): GoalDependencyVisualStatusType {
    if (goal.dependencies.computed.isInCircularDependency) {
      return GoalDependencyVisualStatus.CIRCULAR;
    }

    if (goal.dependencies.computed.activeBlockingCount === 0) {
      return GoalDependencyVisualStatus.FREE;
    }

    const hasHardDependencies = goal.dependencies.blockedBy.some(
      d => d.status === DependencyStatus.ACTIVE && 
          (d.metadata?.type === DependencyType.HARD || !d.metadata?.type)
    );

    if (!hasHardDependencies) {
      return GoalDependencyVisualStatus.SOFT_BLOCKED;
    }

    // Check if dependencies are close to completion
    const nearCompletion = goal.dependencies.blockedBy.some(
      d => d.status === DependencyStatus.ACTIVE && 
          d.metadata?.expectedResolutionDate &&
          new Date(d.metadata.expectedResolutionDate).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000 // 7 days
    );

    if (nearCompletion) {
      return GoalDependencyVisualStatus.NEARLY_UNBLOCKED;
    }

    return GoalDependencyVisualStatus.BLOCKED;
  },

  /**
   * Generate dependency summary text for a goal
   */
  generateDependencySummary(goal: EnhancedGoal): string {
    const activeCount = goal.dependencies.computed.activeBlockingCount;
    
    if (activeCount === 0) {
      return 'No blocking dependencies';
    }

    if (activeCount === 1) {
      return '1 blocking dependency';
    }

    return `${activeCount} blocking dependencies`;
  }
};