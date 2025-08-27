/**
 * Goal status enumeration for the Goal Tree extension
 * Defines the core states a goal can be in during its lifecycle
 */

/**
 * Core goal status enumeration
 */
export enum GoalStatus {
  /** Goal is planned but not yet started */
  PLANNED = 'planned',
  
  /** Goal is currently being worked on */
  IN_PROGRESS = 'in-progress',
  
  /** Goal is blocked by dependencies or external factors */
  BLOCKED = 'blocked',
  
  /** Goal has been completed successfully */
  COMPLETED = 'completed'
}

/**
 * Type alias for goal status string values
 */
export type GoalStatusType = `${GoalStatus}`;

/**
 * Helper functions for working with goal statuses
 */
export const GoalStatusUtils = {
  /**
   * Check if a goal status represents an active working state
   */
  isActive(status: GoalStatusType): boolean {
    return status === GoalStatus.IN_PROGRESS;
  },

  /**
   * Check if a goal status represents a blocked state
   */
  isBlocked(status: GoalStatusType): boolean {
    return status === GoalStatus.BLOCKED;
  },

  /**
   * Check if a goal status represents a completed state
   */
  isCompleted(status: GoalStatusType): boolean {
    return status === GoalStatus.COMPLETED;
  },

  /**
   * Check if a goal can be started (is in planned state)
   */
  canStart(status: GoalStatusType): boolean {
    return status === GoalStatus.PLANNED;
  },

  /**
   * Get all possible goal status values
   */
  getAllStatuses(): GoalStatusType[] {
    return Object.values(GoalStatus);
  },

  /**
   * Get display-friendly name for a goal status
   */
  getDisplayName(status: GoalStatusType): string {
    switch (status) {
      case GoalStatus.PLANNED:
        return 'Planned';
      case GoalStatus.IN_PROGRESS:
        return 'In Progress';
      case GoalStatus.BLOCKED:
        return 'Blocked';
      case GoalStatus.COMPLETED:
        return 'Completed';
      default:
        return 'Unknown';
    }
  },

  /**
   * Get valid status transitions from current status
   */
  getValidTransitions(currentStatus: GoalStatusType): GoalStatusType[] {
    switch (currentStatus) {
      case GoalStatus.PLANNED:
        return [GoalStatus.IN_PROGRESS, GoalStatus.BLOCKED];
      case GoalStatus.IN_PROGRESS:
        return [GoalStatus.BLOCKED, GoalStatus.COMPLETED, GoalStatus.PLANNED];
      case GoalStatus.BLOCKED:
        return [GoalStatus.IN_PROGRESS, GoalStatus.PLANNED];
      case GoalStatus.COMPLETED:
        return [GoalStatus.IN_PROGRESS]; // Allow reopening completed goals
      default:
        return [];
    }
  }
};