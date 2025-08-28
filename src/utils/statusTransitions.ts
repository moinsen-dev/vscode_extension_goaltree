/**
 * Status transition validation utilities
 * 
 * This module provides functions to validate status transitions for Goals and Tasks
 * according to the business rules defined in the PRD.
 */

import { Goal, GoalStatus, Task, TaskStatus } from '../models/goal';
import { ValidationResult } from '../types/common';

/**
 * Valid goal status transitions
 */
const GOAL_STATUS_TRANSITIONS: Record<GoalStatus, GoalStatus[]> = {
  'planned': ['in-progress', 'blocked', 'completed'],
  'in-progress': ['blocked', 'completed', 'planned'],
  'blocked': ['planned', 'in-progress', 'completed'],
  'completed': [] // Completed goals cannot transition to other states
};

/**
 * Valid task status transitions
 */
const TASK_STATUS_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  'todo': ['in-progress', 'done'],
  'in-progress': ['todo', 'done'],
  'done': ['in-progress'] // Allow reopening completed tasks
};

/**
 * Status transition result
 */
export interface StatusTransitionResult extends ValidationResult {
  /** The previous status */
  fromStatus?: GoalStatus | TaskStatus;
  /** The new status */
  toStatus?: GoalStatus | TaskStatus;
  /** Whether this transition requires additional confirmation */
  requiresConfirmation?: boolean;
  /** Warning message for potentially risky transitions */
  warningMessage?: string;
}

/**
 * Validate a goal status transition
 */
export function validateGoalStatusTransition(
  goal: Goal,
  newStatus: GoalStatus,
  options: {
    /** Allow transitions that normally require confirmation */
    force?: boolean;
    /** Additional context for validation */
    context?: string;
  } = {}
): StatusTransitionResult {
  const { force = false } = options;
  const currentStatus = goal.status;

  // Same status is always allowed
  if (currentStatus === newStatus) {
    return {
      isValid: true,
      errors: [],
      fromStatus: currentStatus,
      toStatus: newStatus
    };
  }

  const allowedTransitions = GOAL_STATUS_TRANSITIONS[currentStatus];
  
  // Check if transition is fundamentally allowed
  if (!allowedTransitions.includes(newStatus)) {
    return {
      isValid: false,
      errors: [`Cannot transition goal from '${currentStatus}' to '${newStatus}'. Valid transitions are: ${allowedTransitions.join(', ')}`],
      fromStatus: currentStatus,
      toStatus: newStatus
    };
  }

  // Special validation rules
  const warnings: string[] = [];
  let requiresConfirmation = false;

  // Validate transition to 'completed'
  if (newStatus === 'completed') {
    const incompleteTasks = goal.tasks.filter(task => task.status !== 'done');
    if (incompleteTasks.length > 0) {
      if (!force) {
        return {
          isValid: false,
          errors: [`Cannot mark goal as completed while ${incompleteTasks.length} task(s) are incomplete. Complete all tasks first or use force option.`],
          fromStatus: currentStatus,
          toStatus: newStatus,
          requiresConfirmation: true
        };
      } else {
        warnings.push(`Goal marked as completed with ${incompleteTasks.length} incomplete tasks`);
        requiresConfirmation = true;
      }
    }

    // Set completion date
    if (!goal.completedAt) {
      warnings.push('Goal will be marked with current completion date');
    }
  }

  // Validate transition to 'blocked'
  if (newStatus === 'blocked') {
    if (goal.blockedByIds.length === 0) {
      warnings.push('Goal is marked as blocked but has no blocking dependencies');
      requiresConfirmation = true;
    }
  }

  // Validate transition from 'completed'
  if (currentStatus === 'completed' && newStatus !== 'completed') {
    if (!force) {
      return {
        isValid: false,
        errors: [`Cannot reopen completed goal without force option. This will clear the completion date.`],
        fromStatus: currentStatus,
        toStatus: newStatus,
        requiresConfirmation: true
      };
    } else {
      warnings.push('Reopening completed goal will clear completion date');
      requiresConfirmation = true;
    }
  }

  // Validate transition to 'in-progress'
  if (newStatus === 'in-progress') {
    // Check if goal has blocking dependencies
    if (goal.blockedByIds.length > 0) {
      warnings.push('Starting goal that may have unresolved dependencies');
      requiresConfirmation = true;
    }
  }

  return {
    isValid: true,
    errors: [],
    warnings,
    fromStatus: currentStatus,
    toStatus: newStatus,
    requiresConfirmation,
    warningMessage: warnings.length > 0 ? warnings.join('; ') : undefined
  };
}

/**
 * Validate a task status transition
 */
export function validateTaskStatusTransition(
  task: Task,
  newStatus: TaskStatus,
  options: {
    /** Allow transitions that normally require confirmation */
    force?: boolean;
    /** Additional context for validation */
    context?: string;
  } = {}
): StatusTransitionResult {
  const { force = false } = options;
  const currentStatus = task.status;

  // Same status is always allowed
  if (currentStatus === newStatus) {
    return {
      isValid: true,
      errors: [],
      fromStatus: currentStatus,
      toStatus: newStatus
    };
  }

  const allowedTransitions = TASK_STATUS_TRANSITIONS[currentStatus];
  
  // Check if transition is fundamentally allowed
  if (!allowedTransitions.includes(newStatus)) {
    return {
      isValid: false,
      errors: [`Cannot transition task from '${currentStatus}' to '${newStatus}'. Valid transitions are: ${allowedTransitions.join(', ')}`],
      fromStatus: currentStatus,
      toStatus: newStatus
    };
  }

  const warnings: string[] = [];
  let requiresConfirmation = false;

  // Validate transition to 'done'
  if (newStatus === 'done') {
    // Set completion date if not already set
    if (!task.completedAt) {
      warnings.push('Task will be marked with current completion date');
    }
  }

  // Validate transition from 'done'
  if (currentStatus === 'done' && newStatus !== 'done') {
    if (!force) {
      warnings.push('Reopening completed task will clear completion date');
      requiresConfirmation = true;
    }
  }

  // Validate transition to 'in-progress'
  if (newStatus === 'in-progress' && currentStatus === 'todo') {
    // This is a normal progression, no warnings needed
  }

  // Validate transition back to 'todo'
  if (newStatus === 'todo' && currentStatus === 'in-progress') {
    warnings.push('Moving task back to todo status');
  }

  return {
    isValid: true,
    errors: [],
    warnings,
    fromStatus: currentStatus,
    toStatus: newStatus,
    requiresConfirmation,
    warningMessage: warnings.length > 0 ? warnings.join('; ') : undefined
  };
}

/**
 * Apply a status transition to a goal (returns a new goal object)
 */
export function applyGoalStatusTransition(
  goal: Goal,
  newStatus: GoalStatus,
  options: {
    force?: boolean;
    timestamp?: Date;
  } = {}
): Goal {
  const { timestamp = new Date() } = options;
  
  const updatedGoal = { ...goal, status: newStatus };

  // Handle completion date
  if (newStatus === 'completed' && !goal.completedAt) {
    updatedGoal.completedAt = timestamp;
  } else if (newStatus !== 'completed' && goal.completedAt) {
    // Clear completion date when reopening
    updatedGoal.completedAt = undefined;
  }

  return updatedGoal;
}

/**
 * Apply a status transition to a task (returns a new task object)
 */
export function applyTaskStatusTransition(
  task: Task,
  newStatus: TaskStatus,
  options: {
    timestamp?: Date;
  } = {}
): Task {
  const { timestamp = new Date() } = options;
  
  const updatedTask = { ...task, status: newStatus };

  // Handle completion date
  if (newStatus === 'done' && !task.completedAt) {
    updatedTask.completedAt = timestamp;
  } else if (newStatus !== 'done' && task.completedAt) {
    // Clear completion date when reopening
    updatedTask.completedAt = undefined;
  }

  return updatedTask;
}

/**
 * Get all valid transitions for a goal status
 */
export function getValidGoalTransitions(status: GoalStatus): GoalStatus[] {
  return [...GOAL_STATUS_TRANSITIONS[status]];
}

/**
 * Get all valid transitions for a task status
 */
export function getValidTaskTransitions(status: TaskStatus): TaskStatus[] {
  return [...TASK_STATUS_TRANSITIONS[status]];
}

/**
 * Check if a goal status transition is valid (without detailed validation)
 */
export function isValidGoalTransition(fromStatus: GoalStatus, toStatus: GoalStatus): boolean {
  return fromStatus === toStatus || GOAL_STATUS_TRANSITIONS[fromStatus].includes(toStatus);
}

/**
 * Check if a task status transition is valid (without detailed validation)
 */
export function isValidTaskTransition(fromStatus: TaskStatus, toStatus: TaskStatus): boolean {
  return fromStatus === toStatus || TASK_STATUS_TRANSITIONS[fromStatus].includes(toStatus);
}

/**
 * Get human-readable description of a status
 */
export function getStatusDescription(status: GoalStatus | TaskStatus): string {
  const descriptions = {
    // Goal statuses
    'planned': 'Not yet started, ready to begin',
    'in-progress': 'Currently being worked on',
    'blocked': 'Cannot proceed due to dependencies',
    'completed': 'Successfully finished',
    
    // Task statuses
    'todo': 'Not yet started',
    'done': 'Successfully completed'
  };

  return descriptions[status] || `Unknown status: ${status}`;
}

/**
 * Get suggested next status for a goal based on its current state
 */
export function suggestNextGoalStatus(goal: Goal): GoalStatus[] {
  const suggestions: GoalStatus[] = [];
  const validTransitions = getValidGoalTransitions(goal.status);

  // Logic for suggesting next status based on goal state
  switch (goal.status) {
    case 'planned':
      if (goal.blockedByIds.length > 0) {
        suggestions.push('blocked');
      } else {
        suggestions.push('in-progress');
      }
      break;
      
    case 'in-progress':
      const completedTasks = goal.tasks.filter(t => t.status === 'done').length;
      const totalTasks = goal.tasks.length;
      
      if (totalTasks > 0 && completedTasks === totalTasks) {
        suggestions.push('completed');
      }
      if (goal.blockedByIds.length > 0) {
        suggestions.push('blocked');
      }
      break;
      
    case 'blocked':
      suggestions.push('in-progress');
      break;
      
    case 'completed':
      // Completed goals don't typically need suggestions for next status
      break;
  }

  // Filter suggestions to only include valid transitions
  return suggestions.filter(status => validTransitions.includes(status));
}

/**
 * Get suggested next status for a task based on its current state
 */
export function suggestNextTaskStatus(task: Task): TaskStatus[] {
  const suggestions: TaskStatus[] = [];
  const validTransitions = getValidTaskTransitions(task.status);

  switch (task.status) {
    case 'todo':
      suggestions.push('in-progress');
      break;
      
    case 'in-progress':
      suggestions.push('done');
      break;
      
    case 'done':
      // Completed tasks might need to be reopened
      suggestions.push('in-progress');
      break;
  }

  return suggestions.filter(status => validTransitions.includes(status));
}