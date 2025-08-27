/**
 * Dependency status enumerations for the Goal Tree extension
 * Defines the various states a dependency relationship can be in
 */

/**
 * Status of a dependency relationship
 */
export enum DependencyStatus {
  /** Dependency is active and blocking progress */
  ACTIVE = 'active',
  
  /** Dependency has been resolved/completed */
  RESOLVED = 'resolved',
  
  /** Dependency has been temporarily disabled */
  DISABLED = 'disabled',
  
  /** Dependency is in an invalid state (e.g., circular reference) */
  INVALID = 'invalid'
}

/**
 * Type alias for dependency status string values
 */
export type DependencyStatusType = `${DependencyStatus}`;

/**
 * Validation status for dependency operations
 */
export enum DependencyValidationStatus {
  /** Dependency is valid and can be created/maintained */
  VALID = 'valid',
  
  /** Would create a circular dependency */
  CIRCULAR = 'circular',
  
  /** One or both goals don't exist */
  INVALID_GOALS = 'invalid_goals',
  
  /** Relationship already exists */
  ALREADY_EXISTS = 'already_exists',
  
  /** Relationship doesn't exist */
  NOT_EXISTS = 'not_exists'
}

/**
 * Type alias for dependency validation status string values
 */
export type DependencyValidationStatusType = `${DependencyValidationStatus}`;

/**
 * Resolution strategy for dependency conflicts
 */
export enum DependencyResolutionStrategy {
  /** Automatically resolve when blocking goal completes */
  AUTO_RESOLVE = 'auto_resolve',
  
  /** Require manual resolution */
  MANUAL_RESOLVE = 'manual_resolve',
  
  /** Skip this dependency during resolution */
  SKIP = 'skip'
}

/**
 * Type alias for dependency resolution strategy string values
 */
export type DependencyResolutionStrategyType = `${DependencyResolutionStrategy}`;

/**
 * Helper functions for working with dependency statuses
 */
export const DependencyStatusUtils = {
  /**
   * Check if a dependency status represents an active blocking state
   */
  isBlocking(status: DependencyStatusType): boolean {
    return status === DependencyStatus.ACTIVE;
  },

  /**
   * Check if a dependency status represents a resolved state
   */
  isResolved(status: DependencyStatusType): boolean {
    return status === DependencyStatus.RESOLVED;
  },

  /**
   * Check if a dependency status represents an invalid state
   */
  isInvalid(status: DependencyStatusType): boolean {
    return status === DependencyStatus.INVALID;
  },

  /**
   * Get all possible dependency status values
   */
  getAllStatuses(): DependencyStatusType[] {
    return Object.values(DependencyStatus);
  },

  /**
   * Get display-friendly name for a dependency status
   */
  getDisplayName(status: DependencyStatusType): string {
    switch (status) {
      case DependencyStatus.ACTIVE:
        return 'Active (Blocking)';
      case DependencyStatus.RESOLVED:
        return 'Resolved';
      case DependencyStatus.DISABLED:
        return 'Disabled';
      case DependencyStatus.INVALID:
        return 'Invalid';
      default:
        return 'Unknown';
    }
  }
};

/**
 * Helper functions for working with dependency validation statuses
 */
export const DependencyValidationUtils = {
  /**
   * Check if a validation status represents a valid state
   */
  isValid(status: DependencyValidationStatusType): boolean {
    return status === DependencyValidationStatus.VALID;
  },

  /**
   * Check if a validation status represents a circular dependency
   */
  isCircular(status: DependencyValidationStatusType): boolean {
    return status === DependencyValidationStatus.CIRCULAR;
  },

  /**
   * Get error message for a validation status
   */
  getErrorMessage(status: DependencyValidationStatusType): string {
    switch (status) {
      case DependencyValidationStatus.VALID:
        return '';
      case DependencyValidationStatus.CIRCULAR:
        return 'Creating this dependency would result in a circular reference';
      case DependencyValidationStatus.INVALID_GOALS:
        return 'One or both goals do not exist';
      case DependencyValidationStatus.ALREADY_EXISTS:
        return 'This dependency relationship already exists';
      case DependencyValidationStatus.NOT_EXISTS:
        return 'This dependency relationship does not exist';
      default:
        return 'Unknown validation error';
    }
  }
};