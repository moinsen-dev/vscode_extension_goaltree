/**
 * Progress tracking and statistics models
 */

import { Goal, Task, GoalStatus, TaskStatus } from './goal';

/**
 * Progress information for a goal
 */
export interface GoalProgress {
  /** The goal ID this progress relates to */
  goalId: string;
  
  /** Total number of tasks */
  totalTasks: number;
  
  /** Number of completed tasks */
  completedTasks: number;
  
  /** Task completion percentage (0-100) */
  taskProgress: number;
  
  /** Total number of child goals */
  totalChildGoals: number;
  
  /** Number of completed child goals */
  completedChildGoals: number;
  
  /** Child goal completion percentage (0-100) */
  childGoalProgress: number;
  
  /** Overall progress combining tasks and child goals (0-100) */
  overallProgress: number;
  
  /** Whether this goal is blocked */
  isBlocked: boolean;
  
  /** Number of goals blocking this goal */
  blockingGoalsCount: number;
  
  /** Estimated completion date based on current progress */
  estimatedCompletion?: Date;
  
  /** Time tracking information */
  timeTracking?: {
    estimatedHours?: number;
    actualHours?: number;
    remainingHours?: number;
    efficiency?: number; // actualHours / estimatedHours
  };
}

/**
 * Statistics for the entire goal tree
 */
export interface GoalStatistics {
  /** Total number of goals */
  totalGoals: number;
  
  /** Goals by status */
  goalsByStatus: Record<GoalStatus, number>;
  
  /** Total number of tasks across all goals */
  totalTasks: number;
  
  /** Tasks by status */
  tasksByStatus: Record<TaskStatus, number>;
  
  /** Root level goals */
  rootGoals: number;
  
  /** Average depth of goal hierarchy */
  averageDepth: number;
  
  /** Maximum depth of goal hierarchy */
  maxDepth: number;
  
  /** Goals with dependencies */
  goalsWithDependencies: number;
  
  /** Total blocking relationships */
  totalBlockingRelationships: number;
  
  /** Progress statistics */
  progress: {
    /** Overall completion percentage */
    overallCompletion: number;
    
    /** Goals with 100% task completion */
    fullyCompletedGoals: number;
    
    /** Goals with partial progress */
    partialProgressGoals: number;
    
    /** Goals with no progress */
    noProgressGoals: number;
  };
  
  /** Time tracking statistics */
  timeTracking?: {
    /** Total estimated hours across all goals */
    totalEstimatedHours: number;
    
    /** Total actual hours logged */
    totalActualHours: number;
    
    /** Overall efficiency (actual/estimated) */
    overallEfficiency: number;
    
    /** Goals with time estimates */
    goalsWithEstimates: number;
  };
  
  /** Trend information */
  trends?: {
    /** Goals completed in last 7 days */
    completedLastWeek: number;
    
    /** Goals created in last 7 days */
    createdLastWeek: number;
    
    /** Tasks completed in last 7 days */
    tasksCompletedLastWeek: number;
    
    /** Average completion velocity (goals per week) */
    completionVelocity: number;
  };
}

/**
 * Progress snapshot for historical tracking
 */
export interface ProgressSnapshot {
  /** When this snapshot was taken */
  timestamp: Date;
  
  /** Goal statistics at this point in time */
  statistics: GoalStatistics;
  
  /** Individual goal progress */
  goalProgress: Map<string, GoalProgress>;
  
  /** Milestone events that occurred */
  milestones: ProgressMilestone[];
}

/**
 * Milestone events in progress tracking
 */
export interface ProgressMilestone {
  /** Unique identifier */
  id: string;
  
  /** Type of milestone */
  type: 'goal_completed' | 'goal_created' | 'major_milestone' | 'deadline_reached';
  
  /** When the milestone occurred */
  timestamp: Date;
  
  /** Goal ID related to this milestone */
  goalId?: string;
  
  /** Description of the milestone */
  description: string;
  
  /** Impact metrics */
  impact?: {
    /** Goals unblocked by this milestone */
    goalsUnblocked: number;
    
    /** Progress percentage gained */
    progressGained: number;
  };
}

/**
 * Progress report configuration
 */
export interface ProgressReportConfig {
  /** Date range for the report */
  dateRange: {
    start: Date;
    end: Date;
  };
  
  /** Goals to include (empty array means all goals) */
  includeGoals: string[];
  
  /** Whether to include detailed task breakdowns */
  includeTaskDetails: boolean;
  
  /** Whether to include time tracking information */
  includeTimeTracking: boolean;
  
  /** Whether to include trend analysis */
  includeTrends: boolean;
  
  /** Grouping options */
  groupBy?: 'status' | 'priority' | 'tag' | 'parent';
}

/**
 * Generated progress report
 */
export interface ProgressReport {
  /** Report configuration used */
  config: ProgressReportConfig;
  
  /** When the report was generated */
  generatedAt: Date;
  
  /** Summary statistics */
  summary: GoalStatistics;
  
  /** Detailed goal progress */
  goalDetails: GoalProgress[];
  
  /** Key achievements in the period */
  achievements: ProgressMilestone[];
  
  /** Identified issues or bottlenecks */
  issues: {
    blockedGoals: Goal[];
    overdueGoals: Goal[];
    stagnantGoals: Goal[];
  };
  
  /** Recommendations */
  recommendations: string[];
}