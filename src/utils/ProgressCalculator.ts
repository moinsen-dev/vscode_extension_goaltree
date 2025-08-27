/**
 * Progress calculation utilities for the Goal Tree extension
 * Provides comprehensive progress tracking and completion percentage calculations
 * for goals, tasks, and hierarchical structures
 */

import { Goal, Task, GoalHierarchy, TaskStatus } from '../types/Goal';
import { GoalStatus, GoalStatusType } from '../types/GoalStatus';

/**
 * Progress information for a single item
 */
export interface ProgressInfo {
  /** Completion percentage (0-100) */
  percentage: number;
  
  /** Number of completed items */
  completed: number;
  
  /** Total number of items */
  total: number;
  
  /** Whether the item is fully complete */
  isComplete: boolean;
  
  /** Additional progress details */
  details: {
    /** Breakdown by status */
    byStatus: Record<string, number>;
    
    /** Estimated vs actual progress */
    estimated?: number;
    
    /** Time-based progress metrics */
    timeMetrics?: {
      startDate?: Date;
      estimatedDuration?: number; // in hours
      actualDuration?: number;     // in hours
      remainingDuration?: number;  // in hours
    };
  };
}

/**
 * Hierarchical progress information
 */
export interface HierarchicalProgress extends ProgressInfo {
  /** Progress of direct children */
  childrenProgress: ProgressInfo[];
  
  /** Combined progress including all descendants */
  aggregatedProgress: ProgressInfo;
  
  /** Progress calculation method used */
  calculationMethod: 'task-based' | 'goal-based' | 'weighted' | 'time-based';
  
  /** Weight in parent's progress calculation */
  weight: number;
}

/**
 * Progress calculation configuration
 */
export interface ProgressConfig {
  /** How to weight different items in calculations */
  weightingMethod: 'equal' | 'task-count' | 'estimated-hours' | 'priority';
  
  /** Whether to include blocked goals in progress calculations */
  includeBlocked: boolean;
  
  /** Whether completed goals count as 100% regardless of tasks */
  completedGoalOverride: boolean;
  
  /** Minimum task completion required to mark goal as in-progress */
  inProgressThreshold: number; // 0-100
  
  /** How to handle goals without tasks */
  emptyGoalHandling: 'ignore' | 'complete-if-status' | 'incomplete';
}

/**
 * Central progress calculation system
 */
export class ProgressCalculator {
  private static readonly DEFAULT_CONFIG: ProgressConfig = {
    weightingMethod: 'equal',
    includeBlocked: true,
    completedGoalOverride: true,
    inProgressThreshold: 10,
    emptyGoalHandling: 'complete-if-status'
  };

  private config: ProgressConfig;

  constructor(config: Partial<ProgressConfig> = {}) {
    this.config = { ...ProgressCalculator.DEFAULT_CONFIG, ...config };
  }

  /**
   * Calculate progress for a single goal based on its tasks
   */
  calculateGoalProgress(goal: Goal): ProgressInfo {
    // Handle completed goals first
    if (this.config.completedGoalOverride && goal.status === GoalStatus.COMPLETED) {
      return this.createCompleteProgress(1, 1);
    }

    // Handle goals without tasks
    if (goal.tasks.length === 0) {
      return this.handleEmptyGoal(goal);
    }

    // Calculate task-based progress
    const taskProgress = this.calculateTaskProgress(goal.tasks);
    
    // Add time-based metrics if available
    const timeMetrics = this.calculateTimeMetrics(goal);
    
    return {
      ...taskProgress,
      details: {
        ...taskProgress.details,
        timeMetrics
      }
    };
  }

  /**
   * Calculate progress for a list of tasks
   */
  calculateTaskProgress(tasks: Task[]): ProgressInfo {
    if (tasks.length === 0) {
      return this.createEmptyProgress();
    }

    const statusCounts = this.countTasksByStatus(tasks);
    const completed = statusCounts[TaskStatus.DONE] || 0;
    const total = tasks.length;
    const percentage = (completed / total) * 100;

    return {
      percentage,
      completed,
      total,
      isComplete: percentage === 100,
      details: {
        byStatus: statusCounts
      }
    };
  }

  /**
   * Calculate hierarchical progress for a goal tree
   */
  calculateHierarchicalProgress(hierarchy: GoalHierarchy): HierarchicalProgress {
    // Calculate progress for child goals first
    const childrenProgress = hierarchy.children.map(child => 
      this.calculateHierarchicalProgress(child)
    );

    // Calculate own progress
    const ownProgress = this.calculateGoalProgress(hierarchy.goal);
    
    // Calculate aggregated progress
    const aggregatedProgress = this.aggregateProgress(
      ownProgress, 
      childrenProgress, 
      hierarchy.goal
    );

    // Determine calculation method
    const calculationMethod = this.determineCalculationMethod(hierarchy.goal, childrenProgress);
    
    // Calculate weight for this goal in parent's progress
    const weight = this.calculateWeight(hierarchy.goal, hierarchy.children.length);

    return {
      ...ownProgress,
      childrenProgress,
      aggregatedProgress,
      calculationMethod,
      weight
    };
  }

  /**
   * Calculate overall project/tree progress
   */
  calculateOverallProgress(goals: Goal[]): ProgressInfo {
    if (goals.length === 0) {
      return this.createEmptyProgress();
    }

    // Separate root goals from child goals
    const rootGoals = goals.filter(goal => !goal.parentId);
    const allGoals = goals;

    // Calculate progress for each root goal and aggregate
    const rootProgressInfo = rootGoals.map(goal => {
      const hierarchy = this.buildHierarchy(goal, allGoals);
      return this.calculateHierarchicalProgress(hierarchy);
    });

    return this.aggregateProgressList(rootProgressInfo);
  }

  /**
   * Get progress status based on percentage and thresholds
   */
  getProgressStatus(progress: ProgressInfo): 'not-started' | 'in-progress' | 'completed' | 'blocked' {
    if (progress.percentage === 0) {
      return 'not-started';
    } else if (progress.percentage >= 100) {
      return 'completed';
    } else {
      return 'in-progress';
    }
  }

  /**
   * Check if a goal should be considered "in progress" based on task completion
   */
  shouldBeInProgress(progress: ProgressInfo): boolean {
    return progress.percentage >= this.config.inProgressThreshold && progress.percentage < 100;
  }

  /**
   * Calculate estimated time to completion
   */
  calculateTimeToCompletion(goal: Goal): number | null {
    const metadata = goal.metadata;
    if (!metadata?.estimatedHours || !metadata?.actualHours) {
      return null;
    }

    const progress = this.calculateGoalProgress(goal);
    if (progress.percentage === 0) {
      return metadata.estimatedHours;
    }

    // Calculate based on actual vs estimated progress rate
    const actualRate = metadata.actualHours / (progress.percentage / 100);
    const remainingProgress = (100 - progress.percentage) / 100;
    
    return actualRate * remainingProgress;
  }

  /**
   * Get progress trend (improving, declining, stable)
   */
  getProgressTrend(currentProgress: ProgressInfo, previousProgress: ProgressInfo): 'improving' | 'declining' | 'stable' {
    const diff = currentProgress.percentage - previousProgress.percentage;
    
    if (Math.abs(diff) < 1) { // Less than 1% change
      return 'stable';
    }
    
    return diff > 0 ? 'improving' : 'declining';
  }

  /**
   * Private helper methods
   */

  private handleEmptyGoal(goal: Goal): ProgressInfo {
    switch (this.config.emptyGoalHandling) {
      case 'complete-if-status':
        const isComplete = goal.status === GoalStatus.COMPLETED;
        return this.createCompleteProgress(isComplete ? 1 : 0, 1);
        
      case 'ignore':
        return this.createEmptyProgress();
        
      case 'incomplete':
      default:
        return this.createCompleteProgress(0, 1);
    }
  }

  private countTasksByStatus(tasks: Task[]): Record<string, number> {
    const counts: Record<string, number> = {};
    
    tasks.forEach(task => {
      counts[task.status] = (counts[task.status] || 0) + 1;
    });
    
    return counts;
  }

  private calculateTimeMetrics(goal: Goal): ProgressInfo['details']['timeMetrics'] | undefined {
    const metadata = goal.metadata;
    if (!metadata) return undefined;

    const timeMetrics: NonNullable<ProgressInfo['details']['timeMetrics']> = {};
    
    if (goal.createdAt) {
      timeMetrics.startDate = goal.createdAt;
    }
    
    if (metadata.estimatedHours) {
      timeMetrics.estimatedDuration = metadata.estimatedHours;
    }
    
    if (metadata.actualHours) {
      timeMetrics.actualDuration = metadata.actualHours;
    }
    
    // Calculate remaining duration
    if (metadata.estimatedHours && metadata.actualHours) {
      const progress = this.calculateGoalProgress(goal);
      if (progress.percentage > 0 && progress.percentage < 100) {
        const estimatedTotal = metadata.actualHours / (progress.percentage / 100);
        timeMetrics.remainingDuration = Math.max(0, estimatedTotal - metadata.actualHours);
      }
    }
    
    return Object.keys(timeMetrics).length > 0 ? timeMetrics : undefined;
  }

  private aggregateProgress(
    ownProgress: ProgressInfo, 
    childrenProgress: HierarchicalProgress[], 
    goal: Goal
  ): ProgressInfo {
    if (childrenProgress.length === 0) {
      return ownProgress;
    }

    // Calculate weighted average based on configuration
    const weights = childrenProgress.map(child => child.weight);
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    
    if (totalWeight === 0) {
      return ownProgress;
    }

    const weightedPercentage = childrenProgress.reduce(
      (sum, child, index) => sum + (child.percentage * weights[index]), 
      0
    ) / totalWeight;

    const totalCompleted = childrenProgress.reduce((sum, child) => sum + child.completed, 0);
    const totalItems = childrenProgress.reduce((sum, child) => sum + child.total, 0);

    // Combine with own progress if the goal has tasks
    let finalPercentage = weightedPercentage;
    let finalCompleted = totalCompleted;
    let finalTotal = totalItems;

    if (goal.tasks.length > 0) {
      const ownWeight = this.calculateWeight(goal, 0);
      const combinedWeight = totalWeight + ownWeight;
      
      finalPercentage = (weightedPercentage * totalWeight + ownProgress.percentage * ownWeight) / combinedWeight;
      finalCompleted += ownProgress.completed;
      finalTotal += ownProgress.total;
    }

    return {
      percentage: finalPercentage,
      completed: finalCompleted,
      total: finalTotal,
      isComplete: finalPercentage >= 100,
      details: {
        byStatus: this.aggregateStatusCounts(childrenProgress, ownProgress)
      }
    };
  }

  private determineCalculationMethod(
    goal: Goal, 
    childrenProgress: HierarchicalProgress[]
  ): HierarchicalProgress['calculationMethod'] {
    if (childrenProgress.length === 0) {
      return 'task-based';
    }

    if (goal.tasks.length > 0) {
      return 'weighted';
    }

    return 'goal-based';
  }

  private calculateWeight(goal: Goal, childrenCount: number): number {
    switch (this.config.weightingMethod) {
      case 'task-count':
        return goal.tasks.length || 1;
        
      case 'estimated-hours':
        return goal.metadata?.estimatedHours || 1;
        
      case 'priority':
        return goal.metadata?.priority || 1;
        
      case 'equal':
      default:
        return 1;
    }
  }

  private aggregateProgressList(progressList: ProgressInfo[]): ProgressInfo {
    if (progressList.length === 0) {
      return this.createEmptyProgress();
    }

    const totalWeight = progressList.length;
    const averagePercentage = progressList.reduce(
      (sum, progress) => sum + progress.percentage, 
      0
    ) / totalWeight;

    const totalCompleted = progressList.reduce((sum, progress) => sum + progress.completed, 0);
    const totalItems = progressList.reduce((sum, progress) => sum + progress.total, 0);

    return {
      percentage: averagePercentage,
      completed: totalCompleted,
      total: totalItems,
      isComplete: averagePercentage >= 100,
      details: {
        byStatus: this.aggregateStatusCountsFromList(progressList)
      }
    };
  }

  private aggregateStatusCounts(
    childrenProgress: ProgressInfo[], 
    ownProgress: ProgressInfo
  ): Record<string, number> {
    const aggregated: Record<string, number> = {};
    
    // Aggregate children status counts
    childrenProgress.forEach(child => {
      Object.entries(child.details.byStatus).forEach(([status, count]) => {
        aggregated[status] = (aggregated[status] || 0) + count;
      });
    });
    
    // Add own status counts
    Object.entries(ownProgress.details.byStatus).forEach(([status, count]) => {
      aggregated[status] = (aggregated[status] || 0) + count;
    });
    
    return aggregated;
  }

  private aggregateStatusCountsFromList(progressList: ProgressInfo[]): Record<string, number> {
    const aggregated: Record<string, number> = {};
    
    progressList.forEach(progress => {
      Object.entries(progress.details.byStatus).forEach(([status, count]) => {
        aggregated[status] = (aggregated[status] || 0) + count;
      });
    });
    
    return aggregated;
  }

  private buildHierarchy(rootGoal: Goal, allGoals: Goal[]): GoalHierarchy {
    const children = allGoals
      .filter(goal => goal.parentId === rootGoal.id)
      .map(child => this.buildHierarchy(child, allGoals));

    return {
      goal: rootGoal,
      children,
      level: 0,
      path: [rootGoal.id]
    };
  }

  private createEmptyProgress(): ProgressInfo {
    return {
      percentage: 0,
      completed: 0,
      total: 0,
      isComplete: false,
      details: {
        byStatus: {}
      }
    };
  }

  private createCompleteProgress(completed: number, total: number): ProgressInfo {
    return {
      percentage: total > 0 ? (completed / total) * 100 : 0,
      completed,
      total,
      isComplete: completed === total && total > 0,
      details: {
        byStatus: {}
      }
    };
  }
}

/**
 * Static utility functions for common progress operations
 */
export class ProgressUtils {
  /**
   * Format progress percentage for display
   */
  static formatPercentage(percentage: number): string {
    return `${Math.round(percentage)}%`;
  }

  /**
   * Format progress ratio for display
   */
  static formatRatio(completed: number, total: number): string {
    return `${completed}/${total}`;
  }

  /**
   * Get progress bar segments for visual representation
   */
  static getProgressBarSegments(percentage: number, segments: number = 10): boolean[] {
    const activeSegments = Math.round((percentage / 100) * segments);
    return Array.from({ length: segments }, (_, i) => i < activeSegments);
  }

  /**
   * Get color class based on progress percentage
   */
  static getProgressColorClass(percentage: number): string {
    if (percentage === 0) return 'progress-empty';
    if (percentage < 25) return 'progress-low';
    if (percentage < 50) return 'progress-medium';
    if (percentage < 75) return 'progress-high';
    if (percentage < 100) return 'progress-complete';
    return 'progress-full';
  }

  /**
   * Check if progress is considered good based on time metrics
   */
  static isProgressOnTrack(progress: ProgressInfo): boolean | null {
    const timeMetrics = progress.details.timeMetrics;
    if (!timeMetrics?.startDate || !timeMetrics?.estimatedDuration) {
      return null; // Cannot determine
    }

    const now = new Date();
    const elapsedHours = (now.getTime() - timeMetrics.startDate.getTime()) / (1000 * 60 * 60);
    const expectedProgress = Math.min(100, (elapsedHours / timeMetrics.estimatedDuration) * 100);
    
    // Consider on track if within 10% of expected progress
    return Math.abs(progress.percentage - expectedProgress) <= 10;
  }
}

export { ProgressConfig, ProgressInfo, HierarchicalProgress };