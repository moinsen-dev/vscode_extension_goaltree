import { Goal } from '../models';
import { EventEmitter } from 'events';

/**
 * StateManager handles in-memory goal tree state and provides change notifications.
 * Acts as the single source of truth for goal data during runtime.
 */
export class StateManager extends EventEmitter {
    private goals: Map<string, Goal> = new Map();
    private rootGoalIds: Set<string> = new Set();

    /**
     * Initializes the state manager with goal data
     */
    initialize(goals: Goal[]): void {
        this.goals.clear();
        this.rootGoalIds.clear();

        for (const goal of goals) {
            this.goals.set(goal.id, goal);
            if (!goal.parentId) {
                this.rootGoalIds.add(goal.id);
            }
        }

        this.emit('initialized', goals);
    }

    /**
     * Adds a new goal to the state
     */
    addGoal(goal: Goal): void {
        this.goals.set(goal.id, goal);
        
        if (!goal.parentId) {
            this.rootGoalIds.add(goal.id);
        }

        this.emit('goalAdded', goal);
        this.emit('stateChanged');
    }

    /**
     * Updates an existing goal in the state
     */
    updateGoal(goal: Goal): void {
        const existingGoal = this.goals.get(goal.id);
        if (!existingGoal) {
            throw new Error(`Cannot update non-existent goal: ${goal.id}`);
        }

        // Handle parent changes
        if (existingGoal.parentId !== goal.parentId) {
            if (existingGoal.parentId === undefined) {
                this.rootGoalIds.delete(goal.id);
            }
            if (goal.parentId === undefined) {
                this.rootGoalIds.add(goal.id);
            }
        }

        this.goals.set(goal.id, goal);
        this.emit('goalUpdated', goal, existingGoal);
        this.emit('stateChanged');
    }

    /**
     * Removes a goal from the state
     */
    removeGoal(goalId: string): void {
        const goal = this.goals.get(goalId);
        if (!goal) {
            return;
        }

        this.goals.delete(goalId);
        this.rootGoalIds.delete(goalId);

        this.emit('goalRemoved', goal);
        this.emit('stateChanged');
    }

    /**
     * Gets a specific goal by ID
     */
    getGoal(goalId: string): Goal | undefined {
        return this.goals.get(goalId);
    }

    /**
     * Gets all goals as an array
     */
    getAllGoals(): Goal[] {
        return Array.from(this.goals.values());
    }

    /**
     * Gets all root goals (goals without parents)
     */
    getRootGoals(): Goal[] {
        return Array.from(this.rootGoalIds)
            .map(id => this.goals.get(id))
            .filter((goal): goal is Goal => goal !== undefined);
    }

    /**
     * Gets direct children of a goal
     */
    getChildGoals(parentId: string): Goal[] {
        return Array.from(this.goals.values())
            .filter(goal => goal.parentId === parentId);
    }

    /**
     * Gets all descendant goals (children, grandchildren, etc.)
     */
    getDescendantGoals(parentId: string): Goal[] {
        const descendants: Goal[] = [];
        const children = this.getChildGoals(parentId);
        
        for (const child of children) {
            descendants.push(child);
            descendants.push(...this.getDescendantGoals(child.id));
        }
        
        return descendants;
    }

    /**
     * Gets the parent goal of a given goal
     */
    getParentGoal(goalId: string): Goal | undefined {
        const goal = this.goals.get(goalId);
        if (!goal || !goal.parentId) {
            return undefined;
        }
        return this.goals.get(goal.parentId);
    }

    /**
     * Gets all ancestor goals (parent, grandparent, etc.)
     */
    getAncestorGoals(goalId: string): Goal[] {
        const ancestors: Goal[] = [];
        let current = this.getParentGoal(goalId);
        
        while (current) {
            ancestors.push(current);
            current = this.getParentGoal(current.id);
        }
        
        return ancestors;
    }

    /**
     * Gets goals blocked by a specific goal
     */
    getBlockedGoals(blockingGoalId: string): Goal[] {
        return Array.from(this.goals.values())
            .filter(goal => goal.blockedByIds.includes(blockingGoalId));
    }

    /**
     * Gets goals that are blocking a specific goal
     */
    getBlockingGoals(blockedGoalId: string): Goal[] {
        const goal = this.goals.get(blockedGoalId);
        if (!goal) {
            return [];
        }
        
        return goal.blockedByIds
            .map(id => this.goals.get(id))
            .filter((goal): goal is Goal => goal !== undefined);
    }

    /**
     * Checks if moving a goal would create a circular dependency
     */
    wouldCreateCycle(goalId: string, newParentId: string): boolean {
        // A goal cannot be its own parent
        if (goalId === newParentId) {
            return true;
        }

        // Check if the new parent is a descendant of the goal
        const descendants = this.getDescendantGoals(goalId);
        return descendants.some(descendant => descendant.id === newParentId);
    }

    /**
     * Moves a goal to a new parent
     */
    moveGoal(goalId: string, newParentId?: string): boolean {
        const goal = this.goals.get(goalId);
        if (!goal) {
            return false;
        }

        // Check for cycles
        if (newParentId && this.wouldCreateCycle(goalId, newParentId)) {
            return false;
        }

        // Validate new parent exists
        if (newParentId && !this.goals.has(newParentId)) {
            return false;
        }

        const oldParentId = goal.parentId;
        
        // Update parent references
        if (oldParentId === undefined) {
            this.rootGoalIds.delete(goalId);
        }
        if (newParentId === undefined) {
            this.rootGoalIds.add(goalId);
        }

        // Update the goal
        const updatedGoal = { ...goal, parentId: newParentId };
        this.updateGoal(updatedGoal);

        return true;
    }

    /**
     * Gets goals filtered by status
     */
    getGoalsByStatus(status: Goal['status']): Goal[] {
        return Array.from(this.goals.values())
            .filter(goal => goal.status === status);
    }

    /**
     * Searches goals by title or description
     */
    searchGoals(query: string): Goal[] {
        const lowercaseQuery = query.toLowerCase();
        return Array.from(this.goals.values())
            .filter(goal => 
                goal.title.toLowerCase().includes(lowercaseQuery) ||
                goal.description?.toLowerCase().includes(lowercaseQuery)
            );
    }

    /**
     * Gets statistics about the current state
     */
    getStatistics(): {
        totalGoals: number;
        rootGoals: number;
        completedGoals: number;
        blockedGoals: number;
        totalTasks: number;
        completedTasks: number;
    } {
        const allGoals = Array.from(this.goals.values());
        
        return {
            totalGoals: allGoals.length,
            rootGoals: this.rootGoalIds.size,
            completedGoals: allGoals.filter(g => g.status === 'completed').length,
            blockedGoals: allGoals.filter(g => g.status === 'blocked').length,
            totalTasks: allGoals.reduce((sum, goal) => sum + goal.tasks.length, 0),
            completedTasks: allGoals.reduce((sum, goal) => 
                sum + goal.tasks.filter(t => t.status === 'done').length, 0)
        };
    }

    /**
     * Validates the integrity of the current state
     */
    validateState(): { isValid: boolean; errors: string[] } {
        const errors: string[] = [];
        
        // Check for orphaned goals
        for (const goal of this.goals.values()) {
            if (goal.parentId && !this.goals.has(goal.parentId)) {
                errors.push(`Goal "${goal.title}" has non-existent parent ${goal.parentId}`);
            }
        }

        // Check for invalid blocking relationships
        for (const goal of this.goals.values()) {
            for (const blockingId of goal.blockedByIds) {
                if (!this.goals.has(blockingId)) {
                    errors.push(`Goal "${goal.title}" is blocked by non-existent goal ${blockingId}`);
                }
            }
        }

        // Check root goals consistency
        for (const rootId of this.rootGoalIds) {
            const goal = this.goals.get(rootId);
            if (!goal) {
                errors.push(`Root goal ID ${rootId} does not exist`);
            } else if (goal.parentId) {
                errors.push(`Goal "${goal.title}" is marked as root but has parent ${goal.parentId}`);
            }
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }
}