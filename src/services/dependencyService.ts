import { Goal } from '../models';
import { StateManager } from './stateManager';

/**
 * DependencyService handles goal blocking relationships and dependency validation.
 * Ensures data integrity and prevents circular dependencies.
 */
export class DependencyService {
    private stateManager: StateManager;

    constructor(stateManager: StateManager) {
        this.stateManager = stateManager;
    }

    /**
     * Adds a blocking relationship between goals
     */
    async addBlockingRelationship(blockedGoalId: string, blockingGoalId: string): Promise<boolean> {
        const blockedGoal = this.stateManager.getGoal(blockedGoalId);
        const blockingGoal = this.stateManager.getGoal(blockingGoalId);

        if (!blockedGoal || !blockingGoal) {
            throw new Error('Both goals must exist to create blocking relationship');
        }

        // Check if relationship already exists
        if (blockedGoal.blockedByIds.includes(blockingGoalId)) {
            return false; // Already exists
        }

        // Check for circular dependencies
        if (this.wouldCreateCircularDependency(blockedGoalId, blockingGoalId)) {
            throw new Error('Creating this blocking relationship would result in a circular dependency');
        }

        // Add the blocking relationship
        const updatedGoal: Goal = {
            ...blockedGoal,
            blockedByIds: [...blockedGoal.blockedByIds, blockingGoalId],
            status: blockedGoal.status === 'in-progress' ? 'blocked' : blockedGoal.status
        };

        this.stateManager.updateGoal(updatedGoal);
        return true;
    }

    /**
     * Removes a blocking relationship between goals
     */
    async removeBlockingRelationship(blockedGoalId: string, blockingGoalId: string): Promise<boolean> {
        const blockedGoal = this.stateManager.getGoal(blockedGoalId);
        
        if (!blockedGoal) {
            return false;
        }

        const blockingIndex = blockedGoal.blockedByIds.indexOf(blockingGoalId);
        if (blockingIndex === -1) {
            return false; // Relationship doesn't exist
        }

        // Remove the blocking relationship
        const updatedBlockedByIds = [...blockedGoal.blockedByIds];
        updatedBlockedByIds.splice(blockingIndex, 1);

        const updatedGoal: Goal = {
            ...blockedGoal,
            blockedByIds: updatedBlockedByIds
        };

        // Update status if no longer blocked
        if (updatedBlockedByIds.length === 0 && blockedGoal.status === 'blocked') {
            updatedGoal.status = 'planned';
        }

        this.stateManager.updateGoal(updatedGoal);
        return true;
    }

    /**
     * Removes all blocking relationships for a goal (when deleting)
     */
    async removeAllDependencies(goalId: string): Promise<void> {
        // Remove this goal from all goals that it was blocking
        const blockedGoals = this.stateManager.getBlockedGoals(goalId);
        for (const blockedGoal of blockedGoals) {
            await this.removeBlockingRelationship(blockedGoal.id, goalId);
        }

        // Remove all goals blocking this goal
        const goal = this.stateManager.getGoal(goalId);
        if (goal) {
            for (const blockingId of [...goal.blockedByIds]) {
                await this.removeBlockingRelationship(goalId, blockingId);
            }
        }
    }

    /**
     * Automatically unblocks goals when their blocking goal is completed
     */
    async unblockDependentGoals(completedGoalId: string): Promise<void> {
        const dependentGoals = this.stateManager.getBlockedGoals(completedGoalId);
        
        for (const dependentGoal of dependentGoals) {
            await this.removeBlockingRelationship(dependentGoal.id, completedGoalId);
        }
    }

    /**
     * Checks if adding a blocking relationship would create a circular dependency
     */
    wouldCreateCircularDependency(blockedGoalId: string, blockingGoalId: string): boolean {
        // A goal cannot block itself
        if (blockedGoalId === blockingGoalId) {
            return true;
        }

        // Check if the blocking goal is transitively dependent on the blocked goal
        return this.isTransitivelyDependentOn(blockingGoalId, blockedGoalId, new Set());
    }

    /**
     * Recursively checks if goalA is transitively dependent on goalB
     */
    private isTransitivelyDependentOn(goalA: string, goalB: string, visited: Set<string>): boolean {
        if (visited.has(goalA)) {
            return true; // Cycle detected
        }

        visited.add(goalA);

        const goalAObj = this.stateManager.getGoal(goalA);
        if (!goalAObj) {
            return false;
        }

        // Check direct dependencies
        if (goalAObj.blockedByIds.includes(goalB)) {
            return true;
        }

        // Check transitive dependencies
        for (const blockingId of goalAObj.blockedByIds) {
            if (this.isTransitivelyDependentOn(blockingId, goalB, new Set(visited))) {
                return true;
            }
        }

        return false;
    }

    /**
     * Gets all goals that would be affected if a goal is deleted (dependency chain)
     */
    getAffectedGoalsOnDeletion(goalId: string): {
        directlyBlocked: Goal[];
        transitivelyBlocked: Goal[];
    } {
        const directlyBlocked = this.stateManager.getBlockedGoals(goalId);
        const transitivelyBlocked: Goal[] = [];

        // Find goals that would become unblocked transitively
        for (const directGoal of directlyBlocked) {
            const remainingBlockers = directGoal.blockedByIds.filter(id => id !== goalId);
            if (remainingBlockers.length === 0) {
                // This goal would become completely unblocked
                const transitiveGoals = this.stateManager.getBlockedGoals(directGoal.id);
                transitivelyBlocked.push(...transitiveGoals);
            }
        }

        return { directlyBlocked, transitivelyBlocked };
    }

    /**
     * Gets the dependency path between two goals
     */
    getDependencyPath(fromGoalId: string, toGoalId: string): string[] | null {
        return this.findDependencyPath(fromGoalId, toGoalId, new Set(), []);
    }

    private findDependencyPath(currentGoalId: string, targetGoalId: string, visited: Set<string>, path: string[]): string[] | null {
        if (visited.has(currentGoalId)) {
            return null; // Avoid cycles
        }

        if (currentGoalId === targetGoalId) {
            return [...path, currentGoalId];
        }

        visited.add(currentGoalId);
        const currentGoal = this.stateManager.getGoal(currentGoalId);
        
        if (!currentGoal) {
            return null;
        }

        // Explore each blocking goal
        for (const blockingId of currentGoal.blockedByIds) {
            const result = this.findDependencyPath(blockingId, targetGoalId, new Set(visited), [...path, currentGoalId]);
            if (result) {
                return result;
            }
        }

        return null;
    }

    /**
     * Gets all goals in the dependency tree starting from a root goal
     */
    getDependencyTree(rootGoalId: string): {
        goal: Goal;
        blockedGoals: Array<{
            goal: Goal;
            blockedGoals: any; // Recursive structure
        }>;
    } | null {
        const rootGoal = this.stateManager.getGoal(rootGoalId);
        if (!rootGoal) {
            return null;
        }

        const buildTree = (goalId: string, visited: Set<string>): any => {
            if (visited.has(goalId)) {
                return null; // Prevent infinite recursion
            }

            visited.add(goalId);
            const goal = this.stateManager.getGoal(goalId);
            if (!goal) {
                return null;
            }

            const blockedGoals = this.stateManager.getBlockedGoals(goalId)
                .map(blockedGoal => buildTree(blockedGoal.id, new Set(visited)))
                .filter(tree => tree !== null);

            return {
                goal,
                blockedGoals
            };
        };

        return buildTree(rootGoalId, new Set());
    }

    /**
     * Validates all dependencies in the system for integrity
     */
    validateAllDependencies(): { isValid: boolean; errors: string[] } {
        const errors: string[] = [];
        const allGoals = this.stateManager.getAllGoals();

        for (const goal of allGoals) {
            // Check each blocking relationship
            for (const blockingId of goal.blockedByIds) {
                const blockingGoal = this.stateManager.getGoal(blockingId);
                
                if (!blockingGoal) {
                    errors.push(`Goal "${goal.title}" is blocked by non-existent goal ${blockingId}`);
                    continue;
                }

                // Check for self-blocking
                if (goal.id === blockingId) {
                    errors.push(`Goal "${goal.title}" is blocking itself`);
                }

                // Check for circular dependencies
                if (this.isTransitivelyDependentOn(blockingId, goal.id, new Set())) {
                    errors.push(`Circular dependency detected between "${goal.title}" and "${blockingGoal.title}"`);
                }
            }
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Gets dependency statistics
     */
    getDependencyStatistics(): {
        totalBlockingRelationships: number;
        goalsWithDependencies: number;
        blockedGoals: number;
        averageDependenciesPerGoal: number;
        maxDependencyDepth: number;
    } {
        const allGoals = this.stateManager.getAllGoals();
        const totalRelationships = allGoals.reduce((sum, goal) => sum + goal.blockedByIds.length, 0);
        const goalsWithDeps = allGoals.filter(goal => goal.blockedByIds.length > 0).length;
        const blockedGoals = allGoals.filter(goal => goal.status === 'blocked').length;

        let maxDepth = 0;
        for (const goal of allGoals) {
            const depth = this.getDependencyDepth(goal.id);
            maxDepth = Math.max(maxDepth, depth);
        }

        return {
            totalBlockingRelationships: totalRelationships,
            goalsWithDependencies: goalsWithDeps,
            blockedGoals,
            averageDependenciesPerGoal: allGoals.length > 0 ? totalRelationships / allGoals.length : 0,
            maxDependencyDepth: maxDepth
        };
    }

    /**
     * Gets the maximum dependency depth for a goal
     */
    private getDependencyDepth(goalId: string, visited: Set<string> = new Set()): number {
        if (visited.has(goalId)) {
            return 0; // Avoid infinite recursion
        }

        visited.add(goalId);
        const goal = this.stateManager.getGoal(goalId);
        
        if (!goal || goal.blockedByIds.length === 0) {
            return 0;
        }

        let maxDepth = 0;
        for (const blockingId of goal.blockedByIds) {
            const depth = this.getDependencyDepth(blockingId, new Set(visited));
            maxDepth = Math.max(maxDepth, depth + 1);
        }

        return maxDepth;
    }
}