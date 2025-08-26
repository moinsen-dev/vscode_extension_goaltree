/**
 * Goal and Task data models based on PRD specifications
 */

/**
 * Goal status enumeration
 */
export type GoalStatus = 'planned' | 'in-progress' | 'blocked' | 'completed';

/**
 * Task status enumeration
 */
export type TaskStatus = 'todo' | 'in-progress' | 'done';

/**
 * Task interface representing individual actionable items within goals
 */
export interface Task {
  /** Unique identifier for the task */
  id: string;
  
  /** Task title/description */
  title: string;
  
  /** Current status of the task */
  status: TaskStatus;
  
  /** Order/priority within the parent goal (0-based) */
  order: number;
  
  /** When the task was created */
  createdAt: Date;
  
  /** When the task was completed (if status is 'done') */
  completedAt?: Date;
  
  /** Optional detailed description or notes */
  description?: string;
}

/**
 * Goal interface representing hierarchical goals with dependencies and tasks
 */
export interface Goal {
  /** Unique identifier for the goal */
  id: string;
  
  /** Goal title */
  title: string;
  
  /** Optional detailed description */
  description?: string;
  
  /** Current status of the goal */
  status: GoalStatus;
  
  /** ID of parent goal (undefined for root goals) */
  parentId?: string;
  
  /** Array of goal IDs that must be completed before this goal can proceed */
  blockedByIds: string[];
  
  /** Tasks associated with this goal */
  tasks: Task[];
  
  /** When the goal was created */
  createdAt: Date;
  
  /** When the goal was completed (if status is 'completed') */
  completedAt?: Date;
  
  /** Optional metadata for extensibility */
  metadata?: {
    /** Color coding for visual organization */
    color?: string;
    
    /** Priority level (1-5, where 5 is highest) */
    priority?: number;
    
    /** Estimated effort in hours */
    estimatedHours?: number;
    
    /** Actual time spent in hours */
    actualHours?: number;
    
    /** Tags for categorization */
    tags?: string[];
    
    /** Due date for the goal */
    dueDate?: Date;
  };
}

/**
 * Goal creation parameters (subset of Goal interface)
 */
export interface CreateGoalParams {
  title: string;
  description?: string;
  parentId?: string;
  metadata?: Goal['metadata'];
}

/**
 * Goal update parameters (partial Goal interface)
 */
export interface UpdateGoalParams {
  title?: string;
  description?: string;
  status?: GoalStatus;
  metadata?: Partial<Goal['metadata']>;
}

/**
 * Task creation parameters
 */
export interface CreateTaskParams {
  title: string;
  description?: string;
}

/**
 * Task update parameters
 */
export interface UpdateTaskParams {
  title?: string;
  description?: string;
  status?: TaskStatus;
  order?: number;
}

/**
 * Goal hierarchy information
 */
export interface GoalHierarchy {
  /** The goal itself */
  goal: Goal;
  
  /** Direct children of this goal */
  children: GoalHierarchy[];
  
  /** Depth level in the hierarchy (0 for root goals) */
  level: number;
  
  /** Path from root to this goal (array of goal IDs) */
  path: string[];
}

/**
 * Goal dependency information
 */
export interface GoalDependency {
  /** The goal that is blocked */
  blockedGoal: Goal;
  
  /** The goal that is doing the blocking */
  blockingGoal: Goal;
  
  /** Whether this is a direct or transitive dependency */
  isDirect: boolean;
}

/**
 * Bulk operation result
 */
export interface BulkOperationResult {
  /** Number of successful operations */
  successful: number;
  
  /** Number of failed operations */
  failed: number;
  
  /** Array of error messages for failed operations */
  errors: string[];
  
  /** Details of the operations performed */
  details: Array<{
    goalId: string;
    operation: string;
    success: boolean;
    error?: string;
  }>;
}