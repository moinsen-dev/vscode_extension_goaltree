import { Goal } from '../models/goal';
import { StorageData, StorageMetadata } from '../models/storage';

/**
 * Storage transformation utilities
 */
export interface DataTransformResult<T = any> {
    success: boolean;
    data?: T;
    warnings: string[];
    errors: string[];
}

/**
 * Extended storage file metadata for utility functions
 */
export interface ExtendedStorageMetadata extends StorageMetadata {
    goalCount: number;
    taskCount: number;
    backupCount?: number;
}

/**
 * Data integrity check result
 */
export interface IntegrityCheckResult {
    isValid: boolean;
    issues: Array<{
        type: 'error' | 'warning';
        field: string;
        message: string;
        goalId?: string;
        taskId?: string;
    }>;
    summary: {
        totalGoals: number;
        validGoals: number;
        totalTasks: number;
        validTasks: number;
        orphanedGoals: number;
        circularDependencies: string[];
    };
}

/**
 * Storage statistics
 */
export interface StorageStats {
    fileSize: number;
    goalCount: number;
    taskCount: number;
    hierarchyDepth: number;
    dependencyCount: number;
    completedGoals: number;
    activeGoals: number;
    avgTasksPerGoal: number;
}

/**
 * StorageUtils provides utility functions for data transformation, 
 * integrity checking, and storage operations support
 */
export class StorageUtils {
    /**
     * Current storage format version
     */
    static readonly CURRENT_VERSION = '1.0.0';

    /**
     * Transforms raw goal data into proper StorageData format
     */
    static transformToStorageFormat(goals: Goal[]): DataTransformResult<StorageData> {
        const warnings: string[] = [];
        const errors: string[] = [];
        const now = new Date().toISOString();

        try {
            // Basic validation
            if (!Array.isArray(goals)) {
                return {
                    success: false,
                    warnings,
                    errors: ['Input must be an array of goals']
                };
            }

            // Count tasks
            let taskCount = 0;
            for (const goal of goals) {
                if (goal.tasks && Array.isArray(goal.tasks)) {
                    taskCount += goal.tasks.length;
                }
            }

            // Create storage data
            const storageData: StorageData = {
                version: this.CURRENT_VERSION,
                lastSaved: new Date(now),
                goals: goals,
                metadata: {
                    saveCount: 1,
                    extensionVersion: this.CURRENT_VERSION,
                    checksum: this.calculateChecksum(goals)
                }
            };

            return {
                success: true,
                data: storageData,
                warnings,
                errors
            };
        } catch (error) {
            return {
                success: false,
                warnings,
                errors: [`Failed to transform data: ${error}`]
            };
        }
    }

    /**
     * Extracts goals from StorageData format with validation
     */
    static extractGoalsFromStorage(data: any): DataTransformResult<Goal[]> {
        const warnings: string[] = [];
        const errors: string[] = [];

        try {
            // Handle direct goal array (legacy format)
            if (Array.isArray(data)) {
                warnings.push('Using legacy format - consider migrating to structured format');
                return {
                    success: true,
                    data,
                    warnings,
                    errors
                };
            }

            // Handle StorageData format
            if (data && typeof data === 'object' && Array.isArray(data.goals)) {
                // Check version compatibility
                if (data.version && data.version !== this.CURRENT_VERSION) {
                    warnings.push(`Data version ${data.version} differs from current ${this.CURRENT_VERSION}`);
                }

                return {
                    success: true,
                    data: data.goals,
                    warnings,
                    errors
                };
            }

            return {
                success: false,
                warnings,
                errors: ['Invalid storage format - expected goals array or StorageData object']
            };
        } catch (error) {
            return {
                success: false,
                warnings,
                errors: [`Failed to extract goals: ${error}`]
            };
        }
    }

    /**
     * Performs comprehensive data integrity checks
     */
    static performIntegrityCheck(goals: Goal[]): IntegrityCheckResult {
        const issues: IntegrityCheckResult['issues'] = [];
        let validGoals = 0;
        let validTasks = 0;
        let totalTasks = 0;
        const goalIds = new Set<string>();
        const parentIds = new Set<string>();
        const dependencyMap = new Map<string, string[]>();

        // First pass: collect IDs and basic validation
        for (const goal of goals) {
            let goalValid = true;

            // Check basic goal structure
            if (!goal.id) {
                issues.push({
                    type: 'error',
                    field: 'id',
                    message: 'Goal is missing ID',
                    goalId: goal.id || 'unknown'
                });
                goalValid = false;
            } else {
                // Check for duplicate IDs
                if (goalIds.has(goal.id)) {
                    issues.push({
                        type: 'error',
                        field: 'id',
                        message: 'Duplicate goal ID found',
                        goalId: goal.id
                    });
                    goalValid = false;
                } else {
                    goalIds.add(goal.id);
                }
            }

            if (!goal.title || goal.title.trim().length === 0) {
                issues.push({
                    type: 'error',
                    field: 'title',
                    message: 'Goal is missing title',
                    goalId: goal.id
                });
                goalValid = false;
            }

            if (!['planned', 'in-progress', 'blocked', 'completed'].includes(goal.status)) {
                issues.push({
                    type: 'error',
                    field: 'status',
                    message: `Invalid goal status: ${goal.status}`,
                    goalId: goal.id
                });
                goalValid = false;
            }

            // Collect parent relationships
            if (goal.parentId) {
                parentIds.add(goal.parentId);
            }

            // Collect dependencies
            if (goal.blockedByIds && goal.blockedByIds.length > 0) {
                dependencyMap.set(goal.id, goal.blockedByIds);
            }

            // Validate tasks
            if (goal.tasks) {
                if (!Array.isArray(goal.tasks)) {
                    issues.push({
                        type: 'error',
                        field: 'tasks',
                        message: 'Tasks must be an array',
                        goalId: goal.id
                    });
                    goalValid = false;
                } else {
                    const taskIds = new Set<string>();
                    for (const task of goal.tasks) {
                        totalTasks++;
                        let taskValid = true;

                        if (!task.id) {
                            issues.push({
                                type: 'error',
                                field: 'id',
                                message: 'Task is missing ID',
                                goalId: goal.id,
                                taskId: task.id || 'unknown'
                            });
                            taskValid = false;
                        } else if (taskIds.has(task.id)) {
                            issues.push({
                                type: 'error',
                                field: 'id',
                                message: 'Duplicate task ID within goal',
                                goalId: goal.id,
                                taskId: task.id
                            });
                            taskValid = false;
                        } else {
                            taskIds.add(task.id);
                        }

                        if (!task.title || task.title.trim().length === 0) {
                            issues.push({
                                type: 'error',
                                field: 'title',
                                message: 'Task is missing title',
                                goalId: goal.id,
                                taskId: task.id
                            });
                            taskValid = false;
                        }

                        if (!['todo', 'in-progress', 'done'].includes(task.status)) {
                            issues.push({
                                type: 'error',
                                field: 'status',
                                message: `Invalid task status: ${task.status}`,
                                goalId: goal.id,
                                taskId: task.id
                            });
                            taskValid = false;
                        }

                        if (taskValid) {
                            validTasks++;
                        }
                    }
                }
            }

            if (goalValid) {
                validGoals++;
            }
        }

        // Second pass: check references
        const orphanedGoals: string[] = [];
        for (const parentId of parentIds) {
            if (!goalIds.has(parentId)) {
                orphanedGoals.push(parentId);
                issues.push({
                    type: 'warning',
                    field: 'parentId',
                    message: `Parent goal ID not found: ${parentId}`
                });
            }
        }

        // Check for invalid dependencies
        for (const [goalId, dependencies] of dependencyMap.entries()) {
            for (const depId of dependencies) {
                if (!goalIds.has(depId)) {
                    issues.push({
                        type: 'warning',
                        field: 'blockedByIds',
                        message: `Dependency goal ID not found: ${depId}`,
                        goalId
                    });
                }
            }
        }

        // Check for circular dependencies
        const circularDependencies = this.findCircularDependencies(dependencyMap);

        return {
            isValid: issues.filter(i => i.type === 'error').length === 0,
            issues,
            summary: {
                totalGoals: goals.length,
                validGoals,
                totalTasks,
                validTasks,
                orphanedGoals: orphanedGoals.length,
                circularDependencies
            }
        };
    }

    /**
     * Calculates storage statistics for goals data
     */
    static calculateStorageStats(goals: Goal[], fileSize?: number): StorageStats {
        let totalTasks = 0;
        let dependencyCount = 0;
        let completedGoals = 0;
        let activeGoals = 0;
        let maxDepth = 0;

        // Build hierarchy map to calculate depth
        const parentMap = new Map<string, string[]>();
        for (const goal of goals) {
            if (goal.parentId) {
                if (!parentMap.has(goal.parentId)) {
                    parentMap.set(goal.parentId, []);
                }
                parentMap.get(goal.parentId)!.push(goal.id);
            }
        }

        // Calculate statistics
        for (const goal of goals) {
            // Count tasks
            if (goal.tasks) {
                totalTasks += goal.tasks.length;
            }

            // Count dependencies
            if (goal.blockedByIds) {
                dependencyCount += goal.blockedByIds.length;
            }

            // Count by status
            if (goal.status === 'completed') {
                completedGoals++;
            } else if (goal.status === 'in-progress') {
                activeGoals++;
            }

            // Calculate depth for this goal
            const depth = this.calculateGoalDepth(goal.id, parentMap, new Set());
            if (depth > maxDepth) {
                maxDepth = depth;
            }
        }

        return {
            fileSize: fileSize || 0,
            goalCount: goals.length,
            taskCount: totalTasks,
            hierarchyDepth: maxDepth,
            dependencyCount,
            completedGoals,
            activeGoals,
            avgTasksPerGoal: goals.length > 0 ? totalTasks / goals.length : 0
        };
    }

    /**
     * Creates a simple checksum for data integrity verification
     */
    static calculateChecksum(data: any): string {
        const str = JSON.stringify(data, Object.keys(data).sort());
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(16);
    }

    /**
     * Verifies data checksum
     */
    static verifyChecksum(data: any, expectedChecksum: string): boolean {
        const actualChecksum = this.calculateChecksum(data);
        return actualChecksum === expectedChecksum;
    }

    /**
     * Cleans and optimizes goal data for storage
     */
    static optimizeForStorage(goals: Goal[]): DataTransformResult<Goal[]> {
        const warnings: string[] = [];
        const errors: string[] = [];
        const optimizedGoals: Goal[] = [];

        try {
            for (const goal of goals) {
                const optimizedGoal: Goal = {
                    ...goal,
                    title: goal.title?.trim() || '',
                    description: goal.description?.trim() || undefined,
                    // Ensure dates are proper Date objects or ISO strings
                    createdAt: new Date(goal.createdAt),
                    completedAt: goal.completedAt ? new Date(goal.completedAt) : undefined,
                    // Clean up empty arrays
                    blockedByIds: goal.blockedByIds?.filter(id => id && id.trim()) || [],
                    tasks: goal.tasks?.map(task => ({
                        ...task,
                        title: task.title?.trim() || '',
                        description: task.description?.trim() || undefined,
                        createdAt: new Date(task.createdAt),
                        completedAt: task.completedAt ? new Date(task.completedAt) : undefined
                    })) || []
                };

                // Remove empty descriptions
                if (!optimizedGoal.description) {
                    delete optimizedGoal.description;
                }

                optimizedGoals.push(optimizedGoal);
            }

            return {
                success: true,
                data: optimizedGoals,
                warnings,
                errors
            };
        } catch (error) {
            return {
                success: false,
                warnings,
                errors: [`Failed to optimize data: ${error}`]
            };
        }
    }

    /**
     * Finds circular dependencies in goal dependency graph
     */
    private static findCircularDependencies(dependencyMap: Map<string, string[]>): string[] {
        const circular: string[] = [];
        const visited = new Set<string>();
        const recursionStack = new Set<string>();

        const dfs = (goalId: string, path: string[]): void => {
            if (recursionStack.has(goalId)) {
                const cycleStart = path.indexOf(goalId);
                if (cycleStart >= 0) {
                    circular.push(path.slice(cycleStart).join(' → ') + ' → ' + goalId);
                }
                return;
            }

            if (visited.has(goalId)) {
                return;
            }

            visited.add(goalId);
            recursionStack.add(goalId);

            const dependencies = dependencyMap.get(goalId) || [];
            for (const depId of dependencies) {
                dfs(depId, [...path, goalId]);
            }

            recursionStack.delete(goalId);
        };

        for (const goalId of dependencyMap.keys()) {
            if (!visited.has(goalId)) {
                dfs(goalId, []);
            }
        }

        return circular;
    }

    /**
     * Calculates the depth of a goal in the hierarchy
     */
    private static calculateGoalDepth(
        goalId: string, 
        parentMap: Map<string, string[]>, 
        visited: Set<string>
    ): number {
        if (visited.has(goalId)) {
            return 0; // Prevent infinite recursion
        }

        visited.add(goalId);
        
        const children = parentMap.get(goalId) || [];
        if (children.length === 0) {
            visited.delete(goalId);
            return 0;
        }

        let maxChildDepth = 0;
        for (const childId of children) {
            const childDepth = this.calculateGoalDepth(childId, parentMap, visited);
            if (childDepth > maxChildDepth) {
                maxChildDepth = childDepth;
            }
        }

        visited.delete(goalId);
        return maxChildDepth + 1;
    }
}