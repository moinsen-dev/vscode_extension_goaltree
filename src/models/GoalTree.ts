/**
 * GoalTree container class for hierarchical goal management
 * 
 * This class provides a container for managing hierarchical goals with
 * dependency tracking and validation as specified in the PRD.
 */

import { Goal, Task, GoalStatus, TaskStatus, CreateGoalParams, CreateTaskParams, UpdateTaskParams } from './goal';
import { ValidationResult } from '../types/common';
import { validateGoal, validateTask } from '../utils/validation';

/**
 * Circular dependency error
 */
export class CircularDependencyError extends Error {
  constructor(goalId: string, dependencyChain: string[]) {
    super(`Circular dependency detected for goal ${goalId}: ${dependencyChain.join(' → ')}`);
    this.name = 'CircularDependencyError';
  }
}

/**
 * Goal not found error
 */
export class GoalNotFoundError extends Error {
  constructor(goalId: string) {
    super(`Goal with ID ${goalId} not found`);
    this.name = 'GoalNotFoundError';
  }
}

/**
 * Invalid hierarchy operation error
 */
export class InvalidHierarchyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidHierarchyError';
  }
}

/**
 * Goal hierarchy statistics
 */
export interface GoalTreeStats {
  totalGoals: number;
  rootGoals: number;
  completedGoals: number;
  blockedGoals: number;
  inProgressGoals: number;
  plannedGoals: number;
  totalTasks: number;
  completedTasks: number;
  maxDepth: number;
  averageTasksPerGoal: number;
}

/**
 * Goal with hierarchy information
 */
export interface GoalWithHierarchy extends Goal {
  children: GoalWithHierarchy[];
  depth: number;
  path: string[];
  isBlocked: boolean;
  canStart: boolean;
}

/**
 * GoalTree container class for managing hierarchical goals
 */
export class GoalTree {
  private goals: Map<string, Goal>;
  private readonly rootGoalIds: Set<string>;
  private readonly parentChildMap: Map<string, Set<string>>;
  private readonly dependencyGraph: Map<string, Set<string>>;

  constructor(initialGoals: Goal[] = []) {
    this.goals = new Map();
    this.rootGoalIds = new Set();
    this.parentChildMap = new Map();
    this.dependencyGraph = new Map();

    // Initialize with provided goals
    for (const goal of initialGoals) {
      this.addGoalInternal(goal, false); // Skip validation during initialization
    }
  }

  /**
   * Add a new goal to the tree
   */
  addGoal(goal: Goal): ValidationResult {
    const validation = validateGoal(goal);
    if (!validation.isValid) {
      return validation;
    }

    return this.addGoalInternal(goal, true);
  }

  /**
   * Internal method to add a goal
   */
  private addGoalInternal(goal: Goal, validate: boolean = true): ValidationResult {
    // Check if goal already exists
    if (this.goals.has(goal.id)) {
      return {
        isValid: false,
        errors: [`Goal with ID ${goal.id} already exists`]
      };
    }

    // Validate parent exists if specified
    if (goal.parentId) {
      if (!this.goals.has(goal.parentId)) {
        return {
          isValid: false,
          errors: [`Parent goal ${goal.parentId} not found`]
        };
      }

      // Check for circular parent relationships
      if (validate && this.wouldCreateCircularParentRelation(goal.id, goal.parentId)) {
        return {
          isValid: false,
          errors: ['Adding this goal would create a circular parent relationship']
        };
      }
    }

    // Validate dependencies exist
    for (const depId of goal.blockedByIds) {
      if (!this.goals.has(depId)) {
        return {
          isValid: false,
          errors: [`Dependency goal ${depId} not found`]
        };
      }
    }

    // Check for circular dependencies
    if (validate && this.wouldCreateCircularDependency(goal.id, goal.blockedByIds)) {
      return {
        isValid: false,
        errors: ['Adding this goal would create a circular dependency']
      };
    }

    // Add the goal
    this.goals.set(goal.id, { ...goal });

    // Update hierarchy maps
    if (goal.parentId) {
      const siblings = this.parentChildMap.get(goal.parentId) || new Set();
      siblings.add(goal.id);
      this.parentChildMap.set(goal.parentId, siblings);
    } else {
      this.rootGoalIds.add(goal.id);
    }

    // Update dependency graph
    this.dependencyGraph.set(goal.id, new Set(goal.blockedByIds));

    return { isValid: true, errors: [] };
  }

  /**
   * Remove a goal and its subtree
   */
  removeGoal(goalId: string, force: boolean = false): ValidationResult {
    if (!this.goals.has(goalId)) {
      return {
        isValid: false,
        errors: [`Goal ${goalId} not found`]
      };
    }

    const children = this.getChildGoals(goalId);
    if (children.length > 0 && !force) {
      return {
        isValid: false,
        errors: [`Cannot remove goal ${goalId} because it has ${children.length} child goals. Use force=true to remove the entire subtree.`]
      };
    }

    // Check for dependencies
    const dependentGoals = this.getGoalsDependingOn(goalId);
    if (dependentGoals.length > 0 && !force) {
      const dependentIds = dependentGoals.map(g => g.id).join(', ');
      return {
        isValid: false,
        errors: [`Cannot remove goal ${goalId} because it is a dependency for: ${dependentIds}. Use force=true to remove dependencies.`]
      };
    }

    // Remove the goal and its subtree
    this.removeGoalRecursive(goalId);

    return { isValid: true, errors: [] };
  }

  /**
   * Recursively remove a goal and its subtree
   */
  private removeGoalRecursive(goalId: string): void {
    // Remove all child goals first
    const children = this.getChildGoals(goalId);
    for (const child of children) {
      this.removeGoalRecursive(child.id);
    }

    // Remove from parent-child relationships
    const goal = this.goals.get(goalId);
    if (goal?.parentId) {
      const siblings = this.parentChildMap.get(goal.parentId);
      siblings?.delete(goalId);
    } else {
      this.rootGoalIds.delete(goalId);
    }

    // Remove from dependency graphs of other goals
    for (const [otherId, deps] of this.dependencyGraph) {
      deps.delete(goalId);
    }

    // Remove the goal itself
    this.goals.delete(goalId);
    this.dependencyGraph.delete(goalId);
    this.parentChildMap.delete(goalId);
  }

  /**
   * Update an existing goal
   */
  updateGoal(goalId: string, updates: Partial<Goal>): ValidationResult {
    const existingGoal = this.goals.get(goalId);
    if (!existingGoal) {
      return {
        isValid: false,
        errors: [`Goal ${goalId} not found`]
      };
    }

    const updatedGoal = { ...existingGoal, ...updates, id: goalId };
    const validation = validateGoal(updatedGoal);
    if (!validation.isValid) {
      return validation;
    }

    // Check parent change
    if (updates.parentId !== undefined && updates.parentId !== existingGoal.parentId) {
      if (updates.parentId && !this.goals.has(updates.parentId)) {
        return {
          isValid: false,
          errors: [`Parent goal ${updates.parentId} not found`]
        };
      }

      if (updates.parentId && this.wouldCreateCircularParentRelation(goalId, updates.parentId)) {
        return {
          isValid: false,
          errors: ['Changing parent would create a circular relationship']
        };
      }

      // Update parent-child relationships
      if (existingGoal.parentId) {
        const oldSiblings = this.parentChildMap.get(existingGoal.parentId);
        oldSiblings?.delete(goalId);
      } else {
        this.rootGoalIds.delete(goalId);
      }

      if (updates.parentId) {
        const newSiblings = this.parentChildMap.get(updates.parentId) || new Set();
        newSiblings.add(goalId);
        this.parentChildMap.set(updates.parentId, newSiblings);
      } else {
        this.rootGoalIds.add(goalId);
      }
    }

    // Check dependency changes
    if (updates.blockedByIds !== undefined) {
      for (const depId of updates.blockedByIds) {
        if (!this.goals.has(depId)) {
          return {
            isValid: false,
            errors: [`Dependency goal ${depId} not found`]
          };
        }
      }

      if (this.wouldCreateCircularDependency(goalId, updates.blockedByIds)) {
        return {
          isValid: false,
          errors: ['Updating dependencies would create a circular dependency']
        };
      }

      // Update dependency graph
      this.dependencyGraph.set(goalId, new Set(updates.blockedByIds));
    }

    // Update the goal
    this.goals.set(goalId, updatedGoal);

    return { isValid: true, errors: [] };
  }

  /**
   * Get a goal by ID
   */
  getGoal(goalId: string): Goal | undefined {
    return this.goals.get(goalId);
  }

  /**
   * Get all goals
   */
  getAllGoals(): Goal[] {
    return Array.from(this.goals.values());
  }

  /**
   * Get root goals (goals without parents)
   */
  getRootGoals(): Goal[] {
    return Array.from(this.rootGoalIds)
      .map(id => this.goals.get(id))
      .filter((goal): goal is Goal => goal !== undefined);
  }

  /**
   * Get child goals of a specific goal
   */
  getChildGoals(goalId: string): Goal[] {
    const childIds = this.parentChildMap.get(goalId) || new Set();
    return Array.from(childIds)
      .map(id => this.goals.get(id))
      .filter((goal): goal is Goal => goal !== undefined);
  }

  /**
   * Get goal hierarchy with full tree structure
   */
  getGoalHierarchy(goalId?: string): GoalWithHierarchy[] {
    if (goalId) {
      const goal = this.goals.get(goalId);
      if (!goal) throw new GoalNotFoundError(goalId);
      return [this.buildGoalHierarchy(goal, 0, [])];
    }

    return this.getRootGoals().map(goal => this.buildGoalHierarchy(goal, 0, []));
  }

  /**
   * Build hierarchy for a single goal
   */
  private buildGoalHierarchy(goal: Goal, depth: number, path: string[]): GoalWithHierarchy {
    const currentPath = [...path, goal.id];
    const children = this.getChildGoals(goal.id).map(child =>
      this.buildGoalHierarchy(child, depth + 1, currentPath)
    );

    const isBlocked = this.isGoalBlocked(goal.id);
    const canStart = this.canGoalStart(goal.id);

    return {
      ...goal,
      children,
      depth,
      path: currentPath,
      isBlocked,
      canStart
    };
  }

  /**
   * Check if a goal is blocked
   */
  isGoalBlocked(goalId: string): boolean {
    const dependencies = this.dependencyGraph.get(goalId);
    if (!dependencies || dependencies.size === 0) return false;

    return Array.from(dependencies).some(depId => {
      const depGoal = this.goals.get(depId);
      return depGoal?.status !== 'completed';
    });
  }

  /**
   * Check if a goal can start (not blocked and not already completed)
   */
  canGoalStart(goalId: string): boolean {
    const goal = this.goals.get(goalId);
    if (!goal) return false;
    
    if (goal.status === 'completed') return false;
    
    return !this.isGoalBlocked(goalId);
  }

  /**
   * Get goals that depend on a specific goal
   */
  getGoalsDependingOn(goalId: string): Goal[] {
    const dependentGoals: Goal[] = [];
    
    for (const [otherId, deps] of this.dependencyGraph) {
      if (deps.has(goalId)) {
        const goal = this.goals.get(otherId);
        if (goal) dependentGoals.push(goal);
      }
    }
    
    return dependentGoals;
  }

  /**
   * Get all goals that are currently blocked
   */
  getBlockedGoals(): Goal[] {
    return this.getAllGoals().filter(goal => this.isGoalBlocked(goal.id));
  }

  /**
   * Get all goals that can be started
   */
  getAvailableGoals(): Goal[] {
    return this.getAllGoals().filter(goal => 
      this.canGoalStart(goal.id) && goal.status === 'planned'
    );
  }

  /**
   * Check if adding a parent would create a circular relationship
   */
  private wouldCreateCircularParentRelation(goalId: string, parentId: string): boolean {
    let currentId = parentId;
    const visited = new Set<string>();
    
    while (currentId) {
      if (visited.has(currentId)) return true; // Circular reference
      if (currentId === goalId) return true; // Would create cycle
      
      visited.add(currentId);
      const parent = this.goals.get(currentId);
      currentId = parent?.parentId || '';
    }
    
    return false;
  }

  /**
   * Check if adding dependencies would create a circular dependency
   */
  private wouldCreateCircularDependency(goalId: string, dependencyIds: string[]): boolean {
    for (const depId of dependencyIds) {
      if (this.hasTransitiveDependency(depId, goalId)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if goalA has a transitive dependency on goalB
   */
  private hasTransitiveDependency(goalA: string, goalB: string): boolean {
    if (goalA === goalB) return true;
    
    const visited = new Set<string>();
    const queue = [goalA];
    
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      
      visited.add(current);
      const dependencies = this.dependencyGraph.get(current);
      
      if (dependencies) {
        for (const dep of dependencies) {
          if (dep === goalB) return true;
          if (!visited.has(dep)) queue.push(dep);
        }
      }
    }
    
    return false;
  }

  /**
   * Add a task to a goal
   */
  addTask(goalId: string, task: Task): ValidationResult {
    const goal = this.goals.get(goalId);
    if (!goal) {
      return {
        isValid: false,
        errors: [`Goal ${goalId} not found`]
      };
    }

    const validation = validateTask(task);
    if (!validation.isValid) {
      return validation;
    }

    // Check if task ID already exists in this goal
    if (goal.tasks.some(t => t.id === task.id)) {
      return {
        isValid: false,
        errors: [`Task with ID ${task.id} already exists in goal ${goalId}`]
      };
    }

    const updatedGoal = {
      ...goal,
      tasks: [...goal.tasks, task]
    };

    this.goals.set(goalId, updatedGoal);

    return { isValid: true, errors: [] };
  }

  /**
   * Update a task in a goal
   */
  updateTask(goalId: string, taskId: string, updates: UpdateTaskParams): ValidationResult {
    const goal = this.goals.get(goalId);
    if (!goal) {
      return {
        isValid: false,
        errors: [`Goal ${goalId} not found`]
      };
    }

    const taskIndex = goal.tasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) {
      return {
        isValid: false,
        errors: [`Task ${taskId} not found in goal ${goalId}`]
      };
    }

    const existingTask = goal.tasks[taskIndex];
    const updatedTask = { ...existingTask, ...updates, id: taskId };
    const validation = validateTask(updatedTask);
    
    if (!validation.isValid) {
      return validation;
    }

    const updatedTasks = [...goal.tasks];
    updatedTasks[taskIndex] = updatedTask;

    const updatedGoal = {
      ...goal,
      tasks: updatedTasks
    };

    this.goals.set(goalId, updatedGoal);

    return { isValid: true, errors: [] };
  }

  /**
   * Remove a task from a goal
   */
  removeTask(goalId: string, taskId: string): ValidationResult {
    const goal = this.goals.get(goalId);
    if (!goal) {
      return {
        isValid: false,
        errors: [`Goal ${goalId} not found`]
      };
    }

    const taskExists = goal.tasks.some(t => t.id === taskId);
    if (!taskExists) {
      return {
        isValid: false,
        errors: [`Task ${taskId} not found in goal ${goalId}`]
      };
    }

    const updatedGoal = {
      ...goal,
      tasks: goal.tasks.filter(t => t.id !== taskId)
    };

    this.goals.set(goalId, updatedGoal);

    return { isValid: true, errors: [] };
  }

  /**
   * Get statistics about the goal tree
   */
  getStats(): GoalTreeStats {
    const goals = this.getAllGoals();
    const tasks = goals.flatMap(g => g.tasks);
    
    const statusCounts = goals.reduce((acc, goal) => {
      acc[goal.status] = (acc[goal.status] || 0) + 1;
      return acc;
    }, {} as Record<GoalStatus, number>);

    const maxDepth = Math.max(0, ...this.getRootGoals().map(goal => 
      this.calculateMaxDepth(goal.id, 0)
    ));

    return {
      totalGoals: goals.length,
      rootGoals: this.rootGoalIds.size,
      completedGoals: statusCounts.completed || 0,
      blockedGoals: statusCounts.blocked || 0,
      inProgressGoals: statusCounts['in-progress'] || 0,
      plannedGoals: statusCounts.planned || 0,
      totalTasks: tasks.length,
      completedTasks: tasks.filter(t => t.status === 'done').length,
      maxDepth,
      averageTasksPerGoal: goals.length > 0 ? tasks.length / goals.length : 0
    };
  }

  /**
   * Calculate maximum depth from a given goal
   */
  private calculateMaxDepth(goalId: string, currentDepth: number): number {
    const children = this.getChildGoals(goalId);
    if (children.length === 0) return currentDepth;
    
    return Math.max(...children.map(child => 
      this.calculateMaxDepth(child.id, currentDepth + 1)
    ));
  }

  /**
   * Clear all goals from the tree
   */
  clear(): void {
    this.goals.clear();
    this.rootGoalIds.clear();
    this.parentChildMap.clear();
    this.dependencyGraph.clear();
  }

  /**
   * Get a deep copy of all goals for serialization
   */
  toJSON(): Goal[] {
    return this.getAllGoals().map(goal => ({
      ...goal,
      createdAt: goal.createdAt,
      completedAt: goal.completedAt,
      tasks: goal.tasks.map(task => ({
        ...task,
        createdAt: task.createdAt,
        completedAt: task.completedAt
      }))
    }));
  }

  /**
   * Create a new GoalTree from JSON data
   */
  static fromJSON(data: Goal[]): GoalTree {
    return new GoalTree(data);
  }
}