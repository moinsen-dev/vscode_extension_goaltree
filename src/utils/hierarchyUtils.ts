/**
 * Hierarchical relationship management utilities
 * 
 * This module provides utilities for managing and navigating hierarchical
 * relationships between goals in the goal tree.
 */

import { Goal, GoalHierarchy } from '../models/goal';

/**
 * Path information for a goal in the hierarchy
 */
export interface GoalPath {
  /** The goal itself */
  goal: Goal;
  /** Full path from root to this goal */
  path: Goal[];
  /** Depth in the hierarchy (0 for root) */
  depth: number;
  /** Whether this goal is a root goal */
  isRoot: boolean;
  /** Whether this goal is a leaf (has no children) */
  isLeaf: boolean;
}

/**
 * Hierarchy traversal options
 */
export interface TraversalOptions {
  /** Maximum depth to traverse (-1 for unlimited) */
  maxDepth?: number;
  /** Whether to include the starting goal in results */
  includeStart?: boolean;
  /** Filter function to include/exclude goals */
  filter?: (goal: Goal) => boolean;
  /** Sort function for child ordering */
  sortBy?: (a: Goal, b: Goal) => number;
}

/**
 * Hierarchy statistics
 */
export interface HierarchyStats {
  /** Total number of goals */
  totalGoals: number;
  /** Number of root goals */
  rootGoals: number;
  /** Maximum depth of the hierarchy */
  maxDepth: number;
  /** Average number of children per parent */
  avgChildrenPerParent: number;
  /** Number of leaf goals (goals with no children) */
  leafGoals: number;
  /** Distribution of goals by depth level */
  depthDistribution: Record<number, number>;
}

/**
 * Build a hierarchy map from a flat array of goals
 */
export function buildHierarchyMap(goals: Goal[]): {
  goalsById: Map<string, Goal>;
  childrenMap: Map<string, Goal[]>;
  parentMap: Map<string, Goal>;
  rootGoals: Goal[];
} {
  const goalsById = new Map<string, Goal>();
  const childrenMap = new Map<string, Goal[]>();
  const parentMap = new Map<string, Goal>();
  const rootGoals: Goal[] = [];

  // First pass: build the goals map
  for (const goal of goals) {
    goalsById.set(goal.id, goal);
  }

  // Second pass: build parent-child relationships
  for (const goal of goals) {
    if (goal.parentId) {
      const parent = goalsById.get(goal.parentId);
      if (parent) {
        // Add to parent's children
        const siblings = childrenMap.get(goal.parentId) || [];
        siblings.push(goal);
        childrenMap.set(goal.parentId, siblings);
        
        // Set parent reference
        parentMap.set(goal.id, parent);
      } else {
        // Parent doesn't exist, treat as root goal
        rootGoals.push(goal);
      }
    } else {
      // No parent, this is a root goal
      rootGoals.push(goal);
    }
  }

  // Sort children arrays and root goals by creation date
  const sortByCreation = (a: Goal, b: Goal) => a.createdAt.getTime() - b.createdAt.getTime();
  
  for (const children of childrenMap.values()) {
    children.sort(sortByCreation);
  }
  
  rootGoals.sort(sortByCreation);

  return { goalsById, childrenMap, parentMap, rootGoals };
}

/**
 * Get the full path from root to a specific goal
 */
export function getGoalPath(goalId: string, goalsById: Map<string, Goal>, parentMap: Map<string, Goal>): GoalPath | null {
  const goal = goalsById.get(goalId);
  if (!goal) return null;

  const path: Goal[] = [];
  let current: Goal | undefined = goal;
  
  // Build path from goal to root
  while (current) {
    path.unshift(current);
    current = current.parentId ? parentMap.get(current.id) : undefined;
  }

  return {
    goal,
    path,
    depth: path.length - 1,
    isRoot: !goal.parentId,
    isLeaf: true // Will be updated by caller if needed
  };
}

/**
 * Get all ancestors of a goal (from parent up to root)
 */
export function getAncestors(goalId: string, parentMap: Map<string, Goal>): Goal[] {
  const ancestors: Goal[] = [];
  let current = parentMap.get(goalId);
  
  while (current) {
    ancestors.push(current);
    current = parentMap.get(current.id);
  }
  
  return ancestors;
}

/**
 * Get all descendants of a goal (children, grandchildren, etc.)
 */
export function getDescendants(
  goalId: string, 
  childrenMap: Map<string, Goal[]>,
  options: TraversalOptions = {}
): Goal[] {
  const { maxDepth = -1, filter } = options;
  const descendants: Goal[] = [];
  
  function traverse(currentId: string, currentDepth: number) {
    if (maxDepth >= 0 && currentDepth >= maxDepth) return;
    
    const children = childrenMap.get(currentId) || [];
    
    for (const child of children) {
      if (!filter || filter(child)) {
        descendants.push(child);
      }
      traverse(child.id, currentDepth + 1);
    }
  }
  
  traverse(goalId, 0);
  return descendants;
}

/**
 * Get all siblings of a goal (goals with the same parent)
 */
export function getSiblings(
  goalId: string,
  goal: Goal,
  childrenMap: Map<string, Goal[]>
): Goal[] {
  if (!goal.parentId) {
    // Root goal - return other root goals
    return [];
  }
  
  const siblings = childrenMap.get(goal.parentId) || [];
  return siblings.filter(sibling => sibling.id !== goalId);
}

/**
 * Check if one goal is an ancestor of another
 */
export function isAncestor(
  potentialAncestorId: string,
  goalId: string,
  parentMap: Map<string, Goal>
): boolean {
  let current = parentMap.get(goalId);
  
  while (current) {
    if (current.id === potentialAncestorId) {
      return true;
    }
    current = parentMap.get(current.id);
  }
  
  return false;
}

/**
 * Check if one goal is a descendant of another
 */
export function isDescendant(
  potentialDescendantId: string,
  goalId: string,
  childrenMap: Map<string, Goal[]>
): boolean {
  const descendants = getDescendants(goalId, childrenMap);
  return descendants.some(desc => desc.id === potentialDescendantId);
}

/**
 * Find the lowest common ancestor of two goals
 */
export function findLowestCommonAncestor(
  goalId1: string,
  goalId2: string,
  goalsById: Map<string, Goal>,
  parentMap: Map<string, Goal>
): Goal | null {
  const path1 = getGoalPath(goalId1, goalsById, parentMap);
  const path2 = getGoalPath(goalId2, goalsById, parentMap);
  
  if (!path1 || !path2) return null;
  
  // Find the last common goal in both paths
  let lca: Goal | null = null;
  const minLength = Math.min(path1.path.length, path2.path.length);
  
  for (let i = 0; i < minLength; i++) {
    if (path1.path[i].id === path2.path[i].id) {
      lca = path1.path[i];
    } else {
      break;
    }
  }
  
  return lca;
}

/**
 * Calculate hierarchy statistics
 */
export function calculateHierarchyStats(
  goals: Goal[],
  childrenMap: Map<string, Goal[]>
): HierarchyStats {
  const totalGoals = goals.length;
  const rootGoals = goals.filter(g => !g.parentId).length;
  const depthDistribution: Record<number, number> = {};
  
  let maxDepth = 0;
  let leafGoals = 0;
  let totalChildren = 0;
  let parentsWithChildren = 0;
  
  for (const goal of goals) {
    const children = childrenMap.get(goal.id) || [];
    const depth = calculateGoalDepth(goal.id, goals);
    
    // Update max depth
    maxDepth = Math.max(maxDepth, depth);
    
    // Update depth distribution
    depthDistribution[depth] = (depthDistribution[depth] || 0) + 1;
    
    // Count leaf goals
    if (children.length === 0) {
      leafGoals++;
    } else {
      totalChildren += children.length;
      parentsWithChildren++;
    }
  }
  
  const avgChildrenPerParent = parentsWithChildren > 0 ? totalChildren / parentsWithChildren : 0;
  
  return {
    totalGoals,
    rootGoals,
    maxDepth,
    avgChildrenPerParent,
    leafGoals,
    depthDistribution
  };
}

/**
 * Calculate the depth of a goal in the hierarchy
 */
export function calculateGoalDepth(goalId: string, goals: Goal[]): number {
  const goal = goals.find(g => g.id === goalId);
  if (!goal) return -1;
  
  let depth = 0;
  let currentGoal = goal;
  
  while (currentGoal.parentId) {
    const parent = goals.find(g => g.id === currentGoal.parentId);
    if (!parent) break; // Broken hierarchy
    
    currentGoal = parent;
    depth++;
    
    // Prevent infinite loops in case of circular references
    if (depth > goals.length) break;
  }
  
  return depth;
}

/**
 * Validate hierarchy integrity
 */
export function validateHierarchyIntegrity(goals: Goal[]): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const goalIds = new Set(goals.map(g => g.id));
  
  for (const goal of goals) {
    // Check parent exists
    if (goal.parentId && !goalIds.has(goal.parentId)) {
      errors.push(`Goal '${goal.title}' (${goal.id}) references non-existent parent: ${goal.parentId}`);
    }
    
    // Check for self-parent reference
    if (goal.parentId === goal.id) {
      errors.push(`Goal '${goal.title}' (${goal.id}) cannot be its own parent`);
    }
  }
  
  // Check for circular references
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  
  function detectCycle(goalId: string): boolean {
    if (recursionStack.has(goalId)) return true;
    if (visited.has(goalId)) return false;
    
    visited.add(goalId);
    recursionStack.add(goalId);
    
    const goal = goals.find(g => g.id === goalId);
    if (goal?.parentId && detectCycle(goal.parentId)) {
      return true;
    }
    
    recursionStack.delete(goalId);
    return false;
  }
  
  for (const goal of goals) {
    if (detectCycle(goal.id)) {
      errors.push(`Circular parent reference detected involving goal '${goal.title}' (${goal.id})`);
    }
  }
  
  // Check for orphaned goals (goals with parents that don't exist)
  const orphanedGoals = goals.filter(goal => 
    goal.parentId && !goals.some(parent => parent.id === goal.parentId)
  );
  
  if (orphanedGoals.length > 0) {
    warnings.push(`Found ${orphanedGoals.length} orphaned goals with missing parents`);
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Flatten a hierarchical goal structure into a breadth-first ordered array
 */
export function flattenHierarchy(
  rootGoals: Goal[],
  childrenMap: Map<string, Goal[]>
): Goal[] {
  const result: Goal[] = [];
  const queue = [...rootGoals];
  
  while (queue.length > 0) {
    const current = queue.shift()!;
    result.push(current);
    
    const children = childrenMap.get(current.id) || [];
    queue.push(...children);
  }
  
  return result;
}

/**
 * Create a hierarchical structure from flat goals
 */
export function createHierarchyStructure(goals: Goal[]): GoalHierarchy[] {
  const { childrenMap, rootGoals } = buildHierarchyMap(goals);
  
  function buildNode(goal: Goal, depth: number, path: string[]): GoalHierarchy {
    const currentPath = [...path, goal.id];
    const children = childrenMap.get(goal.id) || [];
    
    return {
      goal,
      children: children.map(child => buildNode(child, depth + 1, currentPath)),
      level: depth,
      path: currentPath
    };
  }
  
  return rootGoals.map(root => buildNode(root, 0, []));
}

/**
 * Find goals at a specific depth level
 */
export function findGoalsAtDepth(goals: Goal[], targetDepth: number): Goal[] {
  return goals.filter(goal => calculateGoalDepth(goal.id, goals) === targetDepth);
}

/**
 * Sort goals maintaining parent-child relationships
 */
export function sortHierarchically(
  goals: Goal[],
  sortFn: (a: Goal, b: Goal) => number
): Goal[] {
  const { childrenMap, rootGoals } = buildHierarchyMap(goals);
  const result: Goal[] = [];
  
  function addGoalAndChildren(goal: Goal) {
    result.push(goal);
    const children = (childrenMap.get(goal.id) || []).sort(sortFn);
    children.forEach(addGoalAndChildren);
  }
  
  const sortedRoots = rootGoals.sort(sortFn);
  sortedRoots.forEach(addGoalAndChildren);
  
  return result;
}