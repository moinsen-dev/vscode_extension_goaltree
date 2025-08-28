/**
 * GoalStatusManager - Handles status transitions and business rules
 * 
 * This service manages goal status transitions, validating business rules
 * and ensuring data integrity during status changes.
 */

import { 
  Goal, 
  GoalStatus, 
  GoalStatusType, 
  GoalStatusUtils,
  TaskStatus,
  TaskStatusType
} from '../types';

/**
 * Status transition validation result
 */
export interface StatusTransitionResult {
  /** Whether the transition is valid */
  isValid: boolean;
  /** Error message if transition is invalid */
  error?: string;
  /** Warning messages for the transition */
  warnings: string[];
  /** Required actions before transition can proceed */
  requiredActions: string[];
}

/**
 * Cascading update configuration
 */
export interface CascadeConfig {
  /** Whether to automatically update parent status */
  updateParent: boolean;
  /** Whether to automatically update children status */
  updateChildren: boolean;
  /** Maximum depth for cascading updates */
  maxDepth: number;
}

/**
 * Status change event data
 */
export interface StatusChangeEvent {
  goalId: string;
  previousStatus: GoalStatusType;
  newStatus: GoalStatusType;
  cascadedChanges: Array<{
    goalId: string;
    previousStatus: GoalStatusType;
    newStatus: GoalStatusType;
  }>;
  timestamp: Date;
}

/**
 * GoalStatusManager handles all status-related operations
 */
export class GoalStatusManager {
  private goals: Map<string, Goal> = new Map();
  private statusChangeListeners: Array<(event: StatusChangeEvent) => void> = [];

  /**
   * Set the goals collection for status management
   */
  setGoals(goals: Goal[]): void {
    this.goals.clear();
    goals.forEach(goal => {
      this.goals.set(goal.id, goal);
    });
  }

  /**
   * Add a status change listener
   */
  onStatusChange(listener: (event: StatusChangeEvent) => void): void {
    this.statusChangeListeners.push(listener);
  }

  /**
   * Remove a status change listener
   */
  removeStatusChangeListener(listener: (event: StatusChangeEvent) => void): void {
    const index = this.statusChangeListeners.indexOf(listener);
    if (index > -1) {
      this.statusChangeListeners.splice(index, 1);
    }
  }

  /**
   * Validate a status transition for a goal
   */
  validateStatusTransition(goalId: string, newStatus: GoalStatusType): StatusTransitionResult {
    const goal = this.goals.get(goalId);
    if (!goal) {
      return {
        isValid: false,
        error: `Goal with ID ${goalId} not found`,
        warnings: [],
        requiredActions: []
      };
    }

    return this.validateStatusTransitionForGoal(goal, newStatus);
  }

  /**
   * Validate status transition for a specific goal
   */
  private validateStatusTransitionForGoal(goal: Goal, newStatus: GoalStatusType): StatusTransitionResult {
    const currentStatus = goal.status;
    const warnings: string[] = [];
    const requiredActions: string[] = [];

    // Check if transition is allowed by status rules
    const validTransitions = GoalStatusUtils.getValidTransitions(currentStatus);
    if (!validTransitions.includes(newStatus)) {
      return {
        isValid: false,
        error: `Invalid transition from ${currentStatus} to ${newStatus}. Valid transitions: ${validTransitions.join(', ')}`,
        warnings,
        requiredActions
      };
    }

    // Business rule validations
    switch (newStatus) {
      case GoalStatus.IN_PROGRESS:
        return this.validateInProgressTransition(goal, warnings, requiredActions);

      case GoalStatus.COMPLETED:
        return this.validateCompletedTransition(goal, warnings, requiredActions);

      case GoalStatus.BLOCKED:
        return this.validateBlockedTransition(goal, warnings, requiredActions);

      case GoalStatus.PLANNED:
        return this.validatePlannedTransition(goal, warnings, requiredActions);

      default:
        return {
          isValid: true,
          warnings,
          requiredActions
        };
    }
  }

  /**
   * Validate transition to IN_PROGRESS status
   */
  private validateInProgressTransition(
    goal: Goal, 
    warnings: string[], 
    requiredActions: string[]
  ): StatusTransitionResult {
    // Check if goal is blocked by dependencies
    const blockingGoals = this.getBlockingGoals(goal);
    if (blockingGoals.length > 0) {
      const blockingTitles = blockingGoals.map(g => g.title).join(', ');
      return {
        isValid: false,
        error: `Cannot start goal - blocked by incomplete dependencies: ${blockingTitles}`,
        warnings,
        requiredActions: [`Complete blocking goals: ${blockingTitles}`]
      };
    }

    // Check if parent goal allows children to be in progress
    const parent = goal.parentId ? this.goals.get(goal.parentId) : null;
    if (parent && parent.status === GoalStatus.COMPLETED) {
      warnings.push('Starting work on a goal whose parent is already completed');
    }

    return {
      isValid: true,
      warnings,
      requiredActions
    };
  }

  /**
   * Validate transition to COMPLETED status
   */
  private validateCompletedTransition(
    goal: Goal, 
    warnings: string[], 
    requiredActions: string[]
  ): StatusTransitionResult {
    // Check if all tasks are completed
    const incompleteTasks = goal.tasks.filter(task => task.status !== TaskStatus.DONE);
    if (incompleteTasks.length > 0) {
      const incompleteTaskTitles = incompleteTasks.map(t => t.title).join(', ');
      return {
        isValid: false,
        error: `Cannot complete goal - incomplete tasks: ${incompleteTaskTitles}`,
        warnings,
        requiredActions: [`Complete tasks: ${incompleteTaskTitles}`]
      };
    }

    // Check if all child goals are completed
    const children = this.getChildGoals(goal.id);
    const incompleteChildren = children.filter(child => child.status !== GoalStatus.COMPLETED);
    if (incompleteChildren.length > 0) {
      const incompleteChildTitles = incompleteChildren.map(c => c.title).join(', ');
      return {
        isValid: false,
        error: `Cannot complete goal - incomplete child goals: ${incompleteChildTitles}`,
        warnings,
        requiredActions: [`Complete child goals: ${incompleteChildTitles}`]
      };
    }

    return {
      isValid: true,
      warnings,
      requiredActions
    };
  }

  /**
   * Validate transition to BLOCKED status
   */
  private validateBlockedTransition(
    goal: Goal, 
    warnings: string[], 
    requiredActions: string[]
  ): StatusTransitionResult {
    if (goal.blockedByIds.length === 0) {
      warnings.push('Marking goal as blocked but no blocking dependencies specified');
      requiredActions.push('Consider adding blocking dependencies or use a different status');
    }

    return {
      isValid: true,
      warnings,
      requiredActions
    };
  }

  /**
   * Validate transition to PLANNED status
   */
  private validatePlannedTransition(
    goal: Goal, 
    warnings: string[], 
    requiredActions: string[]
  ): StatusTransitionResult {
    if (goal.status === GoalStatus.COMPLETED) {
      warnings.push('Reopening a completed goal - this will affect completion metrics');
    }

    return {
      isValid: true,
      warnings,
      requiredActions
    };
  }

  /**
   * Change goal status with validation and cascading updates
   */
  async changeStatus(
    goalId: string, 
    newStatus: GoalStatusType, 
    cascadeConfig: CascadeConfig = { updateParent: true, updateChildren: false, maxDepth: 3 }
  ): Promise<StatusChangeEvent> {
    const goal = this.goals.get(goalId);
    if (!goal) {
      throw new Error(`Goal with ID ${goalId} not found`);
    }

    const previousStatus: GoalStatusType = goal.status;
    const wasCompleted = previousStatus === GoalStatus.COMPLETED;

    // Validate the transition
    const validation = this.validateStatusTransitionForGoal(goal, newStatus);
    if (!validation.isValid) {
      throw new Error(`Status transition failed: ${validation.error}`);
    }
    const cascadedChanges: Array<{
      goalId: string;
      previousStatus: GoalStatusType;
      newStatus: GoalStatusType;
    }> = [];

    // Update the goal status
    goal.status = newStatus;
    goal.updatedAt = new Date();

    // Set completion timestamp if completing
    if (newStatus === GoalStatus.COMPLETED) {
      goal.completedAt = new Date();
    } else if (wasCompleted && (newStatus as string) !== GoalStatus.COMPLETED) {
      // Clear completion timestamp if moving away from completed
      goal.completedAt = undefined;
    }

    // Handle cascading updates
    if (cascadeConfig.updateParent && cascadeConfig.maxDepth > 0) {
      await this.cascadeToParent(goal, cascadedChanges, cascadeConfig.maxDepth - 1);
    }

    if (cascadeConfig.updateChildren && cascadeConfig.maxDepth > 0) {
      await this.cascadeToChildren(goal, newStatus, cascadedChanges, cascadeConfig.maxDepth - 1);
    }

    // Create and emit status change event
    const event: StatusChangeEvent = {
      goalId,
      previousStatus,
      newStatus,
      cascadedChanges,
      timestamp: new Date()
    };

    this.statusChangeListeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('Error in status change listener:', error);
      }
    });

    return event;
  }

  /**
   * Cascade status changes to parent goal
   */
  private async cascadeToParent(
    goal: Goal, 
    cascadedChanges: Array<{ goalId: string; previousStatus: GoalStatusType; newStatus: GoalStatusType }>,
    remainingDepth: number
  ): Promise<void> {
    if (!goal.parentId || remainingDepth <= 0) {
      return;
    }

    const parent = this.goals.get(goal.parentId);
    if (!parent) {
      return;
    }

    const siblings = this.getChildGoals(goal.parentId);
    
    // Auto-complete parent if all children are completed
    if (goal.status === GoalStatus.COMPLETED) {
      const allChildrenCompleted = siblings.every(child => child.status === GoalStatus.COMPLETED);
      if (allChildrenCompleted && parent.status !== GoalStatus.COMPLETED) {
        const parentValidation = this.validateStatusTransitionForGoal(parent, GoalStatus.COMPLETED);
        if (parentValidation.isValid) {
          const previousParentStatus = parent.status;
          parent.status = GoalStatus.COMPLETED;
          parent.updatedAt = new Date();
          parent.completedAt = new Date();

          cascadedChanges.push({
            goalId: parent.id,
            previousStatus: previousParentStatus,
            newStatus: GoalStatus.COMPLETED
          });

          // Recurse to grandparent
          await this.cascadeToParent(parent, cascadedChanges, remainingDepth - 1);
        }
      }
    }

    // If a child is moved back to incomplete, ensure parent is not completed
    if (goal.status !== GoalStatus.COMPLETED && parent.status === GoalStatus.COMPLETED) {
      const previousParentStatus = parent.status;
      parent.status = GoalStatus.IN_PROGRESS;
      parent.updatedAt = new Date();
      parent.completedAt = undefined;

      cascadedChanges.push({
        goalId: parent.id,
        previousStatus: previousParentStatus,
        newStatus: GoalStatus.IN_PROGRESS
      });

      // Recurse to grandparent
      await this.cascadeToParent(parent, cascadedChanges, remainingDepth - 1);
    }
  }

  /**
   * Cascade status changes to child goals
   */
  private async cascadeToChildren(
    goal: Goal,
    newStatus: GoalStatusType,
    cascadedChanges: Array<{ goalId: string; previousStatus: GoalStatusType; newStatus: GoalStatusType }>,
    remainingDepth: number
  ): Promise<void> {
    if (remainingDepth <= 0) {
      return;
    }

    const children = this.getChildGoals(goal.id);
    
    // If parent is blocked, block all in-progress children
    if (newStatus === GoalStatus.BLOCKED) {
      for (const child of children) {
        if (child.status === GoalStatus.IN_PROGRESS) {
          const previousChildStatus = child.status;
          child.status = GoalStatus.BLOCKED;
          child.updatedAt = new Date();

          cascadedChanges.push({
            goalId: child.id,
            previousStatus: previousChildStatus,
            newStatus: GoalStatus.BLOCKED
          });

          // Recurse to grandchildren
          await this.cascadeToChildren(child, GoalStatus.BLOCKED, cascadedChanges, remainingDepth - 1);
        }
      }
    }
  }

  /**
   * Get goals that are blocking the specified goal
   */
  private getBlockingGoals(goal: Goal): Goal[] {
    return goal.blockedByIds
      .map(id => this.goals.get(id))
      .filter((g): g is Goal => g !== undefined && g.status !== GoalStatus.COMPLETED);
  }

  /**
   * Get child goals of a specified goal
   */
  private getChildGoals(parentId: string): Goal[] {
    return Array.from(this.goals.values()).filter(goal => goal.parentId === parentId);
  }

  /**
   * Get all goals with a specific status
   */
  getGoalsByStatus(status: GoalStatusType): Goal[] {
    return Array.from(this.goals.values()).filter(goal => goal.status === status);
  }

  /**
   * Check if a goal can transition to a specific status
   */
  canTransitionTo(goalId: string, newStatus: GoalStatusType): boolean {
    const validation = this.validateStatusTransition(goalId, newStatus);
    return validation.isValid;
  }

  /**
   * Get status transition statistics
   */
  getStatusStatistics(): Record<GoalStatusType, number> {
    const stats: Record<string, number> = {};
    
    GoalStatusUtils.getAllStatuses().forEach(status => {
      stats[status] = 0;
    });

    Array.from(this.goals.values()).forEach(goal => {
      stats[goal.status]++;
    });

    return stats as Record<GoalStatusType, number>;
  }

  /**
   * Bulk status update with validation
   */
  async bulkStatusUpdate(
    goalIds: string[], 
    newStatus: GoalStatusType,
    cascadeConfig: CascadeConfig = { updateParent: true, updateChildren: false, maxDepth: 3 }
  ): Promise<{
    successful: StatusChangeEvent[];
    failed: Array<{ goalId: string; error: string }>;
  }> {
    const successful: StatusChangeEvent[] = [];
    const failed: Array<{ goalId: string; error: string }> = [];

    for (const goalId of goalIds) {
      try {
        const event = await this.changeStatus(goalId, newStatus, cascadeConfig);
        successful.push(event);
      } catch (error) {
        failed.push({
          goalId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return { successful, failed };
  }
}

/**
 * Create a new GoalStatusManager instance
 */
export function createGoalStatusManager(): GoalStatusManager {
  return new GoalStatusManager();
}