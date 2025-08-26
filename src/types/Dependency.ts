/**
 * Core dependency relationship types for the Goal Tree extension
 * Defines the structure and interfaces for goal dependencies
 */

import { DependencyStatus, DependencyStatusType, DependencyResolutionStrategy, DependencyResolutionStrategyType } from './DependencyStatus';
import { ID, Timestamp } from './common';

/**
 * Core dependency relationship interface
 * Represents a blocking relationship between two goals
 */
export interface Dependency {
  /** Unique identifier for this dependency relationship */
  id: string;
  
  /** ID of the goal that is blocked (cannot proceed) */
  blockedGoalId: string;
  
  /** ID of the goal that is doing the blocking (must complete first) */
  blockingGoalId: string;
  
  /** Current status of the dependency */
  status: DependencyStatusType;
  
  /** Strategy for resolving this dependency */
  resolutionStrategy: DependencyResolutionStrategyType;
  
  /** When this dependency was created */
  createdAt: Date;
  
  /** When this dependency was last updated */
  updatedAt: Date;
  
  /** When this dependency was resolved (if status is 'resolved') */
  resolvedAt?: Date;
  
  /** Optional reason or description for this dependency */
  reason?: string;
  
  /** Optional metadata for extensibility */
  metadata?: {
    /** Priority of this dependency (1-5, where 5 is highest) */
    priority?: number;
    
    /** Whether this is a hard or soft dependency */
    type?: DependencyType;
    
    /** Custom tags for categorization */
    tags?: string[];
    
    /** Expected resolution date */
    expectedResolutionDate?: Date;
  };
}

/**
 * Type of dependency relationship
 */
export enum DependencyType {
  /** Hard dependency - blocked goal cannot start until blocker completes */
  HARD = 'hard',
  
  /** Soft dependency - blocked goal can start but should ideally wait */
  SOFT = 'soft',
  
  /** Information dependency - for awareness, doesn't block execution */
  INFORMATIONAL = 'informational'
}

/**
 * Type alias for dependency type string values
 */
export type DependencyTypeType = `${DependencyType}`;

/**
 * Dependency creation parameters
 */
export interface CreateDependencyParams {
  /** ID of the goal that will be blocked */
  blockedGoalId: string;
  
  /** ID of the goal that will do the blocking */
  blockingGoalId: string;
  
  /** Optional reason for the dependency */
  reason?: string;
  
  /** Resolution strategy (defaults to AUTO_RESOLVE) */
  resolutionStrategy?: DependencyResolutionStrategyType;
  
  /** Type of dependency (defaults to HARD) */
  type?: DependencyTypeType;
  
  /** Priority level (defaults to 3) */
  priority?: number;
  
  /** Custom tags */
  tags?: string[];
  
  /** Expected resolution date */
  expectedResolutionDate?: Date;
}

/**
 * Dependency update parameters
 */
export interface UpdateDependencyParams {
  /** New status for the dependency */
  status?: DependencyStatusType;
  
  /** New resolution strategy */
  resolutionStrategy?: DependencyResolutionStrategyType;
  
  /** New reason */
  reason?: string;
  
  /** Updated metadata */
  metadata?: Dependency['metadata'];
}

/**
 * Dependency relationship information with goal details
 */
export interface DependencyRelationship {
  /** The dependency relationship */
  dependency: Dependency;
  
  /** Title of the blocked goal */
  blockedGoalTitle: string;
  
  /** Title of the blocking goal */
  blockingGoalTitle: string;
  
  /** Whether this is a direct or transitive dependency */
  isDirect: boolean;
  
  /** Path length in the dependency chain */
  chainLength: number;
}

/**
 * Dependency validation result
 */
export interface DependencyValidationResult {
  /** Whether the dependency is valid */
  isValid: boolean;
  
  /** Validation error if invalid */
  error?: string;
  
  /** Warning messages */
  warnings: string[];
  
  /** Suggested alternatives if invalid */
  suggestions: string[];
}

/**
 * Bulk dependency operation parameters
 */
export interface BulkDependencyParams {
  /** Array of dependencies to create/update */
  dependencies: CreateDependencyParams[];
  
  /** Whether to validate all dependencies before creating any */
  validateFirst?: boolean;
  
  /** Whether to continue on errors or stop at first failure */
  continueOnError?: boolean;
}

/**
 * Bulk dependency operation result
 */
export interface BulkDependencyResult {
  /** Number of successful operations */
  successful: number;
  
  /** Number of failed operations */
  failed: number;
  
  /** Created/updated dependencies */
  dependencies: Dependency[];
  
  /** Array of error messages for failed operations */
  errors: Array<{
    dependency: CreateDependencyParams;
    error: string;
  }>;
}

/**
 * Dependency filter options
 */
export interface DependencyFilter {
  /** Filter by status */
  status?: DependencyStatusType | DependencyStatusType[];
  
  /** Filter by type */
  type?: DependencyTypeType | DependencyTypeType[];
  
  /** Filter by blocked goal ID */
  blockedGoalId?: string;
  
  /** Filter by blocking goal ID */
  blockingGoalId?: string;
  
  /** Filter by resolution strategy */
  resolutionStrategy?: DependencyResolutionStrategyType | DependencyResolutionStrategyType[];
  
  /** Filter by priority range */
  priorityRange?: {
    min?: number;
    max?: number;
  };
  
  /** Filter by creation date range */
  createdDateRange?: {
    from?: Date;
    to?: Date;
  };
  
  /** Filter by tags (all tags must match) */
  tags?: string[];
  
  /** Filter by tags (any tag must match) */
  anyTags?: string[];
}

/**
 * Dependency query options
 */
export interface DependencyQueryOptions {
  /** Filter options */
  filter?: DependencyFilter;
  
  /** Sort options */
  sort?: {
    field: keyof Dependency;
    direction: 'asc' | 'desc';
  };
  
  /** Pagination options */
  pagination?: {
    offset: number;
    limit: number;
  };
  
  /** Whether to include goal details */
  includeGoalDetails?: boolean;
}

/**
 * Dependency query result
 */
export interface DependencyQueryResult {
  /** Matching dependencies */
  dependencies: Dependency[];
  
  /** Total count (before pagination) */
  totalCount: number;
  
  /** Whether there are more results */
  hasMore: boolean;
  
  /** Goal details if requested */
  goalDetails?: Map<string, { id: string; title: string; status: string }>;
}

/**
 * Helper functions for working with dependencies
 */
export const DependencyUtils = {
  /**
   * Create a new dependency with default values
   */
  create(params: CreateDependencyParams): Omit<Dependency, 'id'> {
    const now = new Date();
    return {
      blockedGoalId: params.blockedGoalId,
      blockingGoalId: params.blockingGoalId,
      status: DependencyStatus.ACTIVE,
      resolutionStrategy: params.resolutionStrategy || DependencyResolutionStrategy.AUTO_RESOLVE,
      createdAt: now,
      updatedAt: now,
      reason: params.reason,
      metadata: {
        priority: params.priority || 3,
        type: params.type || DependencyType.HARD,
        tags: params.tags || [],
        expectedResolutionDate: params.expectedResolutionDate
      }
    };
  },

  /**
   * Check if a dependency is blocking progress
   */
  isBlocking(dependency: Dependency): boolean {
    return dependency.status === DependencyStatus.ACTIVE && 
           (dependency.metadata?.type === DependencyType.HARD || 
            !dependency.metadata?.type);
  },

  /**
   * Check if a dependency is resolved
   */
  isResolved(dependency: Dependency): boolean {
    return dependency.status === DependencyStatus.RESOLVED;
  },

  /**
   * Get display name for a dependency
   */
  getDisplayName(dependency: Dependency, goalTitles?: { blocked: string; blocking: string }): string {
    if (goalTitles) {
      return `${goalTitles.blocked} ← ${goalTitles.blocking}`;
    }
    return `${dependency.blockedGoalId} ← ${dependency.blockingGoalId}`;
  },

  /**
   * Calculate dependency age in days
   */
  getAge(dependency: Dependency): number {
    const now = new Date();
    const created = new Date(dependency.createdAt);
    return Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
  },

  /**
   * Check if dependency is overdue based on expected resolution date
   */
  isOverdue(dependency: Dependency): boolean {
    if (!dependency.metadata?.expectedResolutionDate) {
      return false;
    }
    return new Date() > new Date(dependency.metadata.expectedResolutionDate) &&
           dependency.status === DependencyStatus.ACTIVE;
  }
};