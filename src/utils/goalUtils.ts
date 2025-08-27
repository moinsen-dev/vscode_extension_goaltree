/**
 * goalUtils - Issue #4 Stream B Advanced Goal Utilities
 * 
 * Advanced utility functions for goal operations including bulk operations,
 * search and filtering, progress calculation, and performance optimizations
 * for large goal datasets. Integrates with GoalManager from Stream A.
 */

import {
    Goal,
    GoalStatus,
    GoalStatusType,
    Task,
    TaskStatus,
    TaskStatusType,
    GoalProgress,
    UpdateGoalParams,
    GoalOperationResult
} from '../types';

/**
 * Bulk operation result interface
 */
export interface BulkOperationResult<T = any> {
    success: boolean;
    totalProcessed: number;
    successfulOperations: number;
    failedOperations: number;
    results: Array<{
        goalId: string;
        success: boolean;
        data?: T;
        error?: string;
    }>;
    errors: string[];
    duration: number;
}

/**
 * Search filters for goal searching
 */
export interface GoalSearchFilters {
    /** Text to search in title and description */
    searchText?: string;
    /** Filter by status */
    status?: GoalStatusType | GoalStatusType[];
    /** Filter by tags */
    tags?: string[];
    /** Filter by priority range */
    priorityRange?: { min: number; max: number };
    /** Filter by date range */
    dateRange?: {
        field: 'createdAt' | 'updatedAt' | 'completedAt';
        from?: Date;
        to?: Date;
    };
    /** Filter by parent goal */
    parentId?: string | null; // null for root goals
    /** Filter by depth */
    maxDepth?: number;
    /** Filter overdue goals */
    overdue?: boolean;
    /** Filter goals with/without tasks */
    hasTasks?: boolean;
    /** Filter blocked/unblocked goals */
    blocked?: boolean;
}

/**
 * Search result with metadata
 */
export interface GoalSearchResult {
    goals: Goal[];
    totalCount: number;
    searchTime: number;
    filters: GoalSearchFilters;
    facets?: {
        statusCounts: Record<GoalStatusType, number>;
        priorityCounts: Record<number, number>;
        tagCounts: Record<string, number>;
    };
}

/**
 * Sort options for goal sorting
 */
export interface GoalSortOptions {
    field: 'title' | 'createdAt' | 'updatedAt' | 'completedAt' | 'priority' | 'status';
    direction: 'asc' | 'desc';
    secondarySort?: {
        field: 'title' | 'createdAt' | 'updatedAt' | 'priority';
        direction: 'asc' | 'desc';
    };
}

/**
 * Flattened goal tree node
 */
export interface FlatGoalNode {
    goal: Goal;
    depth: number;
    path: string[]; // Array of goal IDs from root to current
    isRoot: boolean;
    isLeaf: boolean;
    childCount: number;
    taskProgress: number;
    overallProgress: number;
}

/**
 * Performance optimization cache
 */
class GoalUtilsCache {
    private readonly cache = new Map<string, any>();
    private readonly cacheExpiry = new Map<string, number>();
    private readonly defaultTTL = 5 * 60 * 1000; // 5 minutes

    set<T>(key: string, value: T, ttl = this.defaultTTL): void {
        this.cache.set(key, value);
        this.cacheExpiry.set(key, Date.now() + ttl);
    }

    get<T>(key: string): T | null {
        const expiry = this.cacheExpiry.get(key);
        if (!expiry || Date.now() > expiry) {
            this.cache.delete(key);
            this.cacheExpiry.delete(key);
            return null;
        }
        return this.cache.get(key) || null;
    }

    clear(): void {
        this.cache.clear();
        this.cacheExpiry.clear();
    }

    has(key: string): boolean {
        return this.get(key) !== null;
    }
}

/**
 * Performance-optimized goal utilities with caching
 */
export class GoalUtils {
    private static readonly cache = new GoalUtilsCache();
    private static readonly BATCH_SIZE = 100; // For bulk operations

    // ===========================================
    // Bulk Operations
    // ===========================================

    /**
     * Bulk complete multiple goals
     */
    static async bulkCompleteGoals(
        goalIds: string[],
        updateFunction: (goalId: string, updates: UpdateGoalParams) => Promise<GoalOperationResult<Goal>>
    ): Promise<BulkOperationResult<Goal>> {
        const startTime = Date.now();
        const results: BulkOperationResult<Goal>['results'] = [];
        const errors: string[] = [];

        let successfulOperations = 0;
        let failedOperations = 0;

        // Process in batches to avoid overwhelming the system
        for (let i = 0; i < goalIds.length; i += this.BATCH_SIZE) {
            const batch = goalIds.slice(i, i + this.BATCH_SIZE);
            
            await Promise.all(batch.map(async (goalId) => {
                try {
                    const result = await updateFunction(goalId, { 
                        status: GoalStatus.COMPLETED,
                        completedAt: new Date()
                    });

                    results.push({
                        goalId,
                        success: result.success,
                        data: result.data,
                        error: result.error
                    });

                    if (result.success) {
                        successfulOperations++;
                    } else {
                        failedOperations++;
                        if (result.error) {
                            errors.push(`Goal ${goalId}: ${result.error}`);
                        }
                    }
                } catch (error) {
                    failedOperations++;
                    const errorMsg = `Goal ${goalId}: ${error instanceof Error ? error.message : String(error)}`;
                    errors.push(errorMsg);
                    results.push({
                        goalId,
                        success: false,
                        error: errorMsg
                    });
                }
            }));
        }

        return {
            success: failedOperations === 0,
            totalProcessed: goalIds.length,
            successfulOperations,
            failedOperations,
            results,
            errors,
            duration: Date.now() - startTime
        };
    }

    /**
     * Bulk update status for multiple goals
     */
    static async bulkUpdateStatus(
        goalIds: string[],
        newStatus: GoalStatusType,
        updateFunction: (goalId: string, updates: UpdateGoalParams) => Promise<GoalOperationResult<Goal>>
    ): Promise<BulkOperationResult<Goal>> {
        const startTime = Date.now();
        const results: BulkOperationResult<Goal>['results'] = [];
        const errors: string[] = [];

        let successfulOperations = 0;
        let failedOperations = 0;

        const updates: UpdateGoalParams = { status: newStatus };
        if (newStatus === GoalStatus.COMPLETED) {
            updates.completedAt = new Date();
        }

        // Process in batches
        for (let i = 0; i < goalIds.length; i += this.BATCH_SIZE) {
            const batch = goalIds.slice(i, i + this.BATCH_SIZE);
            
            await Promise.all(batch.map(async (goalId) => {
                try {
                    const result = await updateFunction(goalId, updates);

                    results.push({
                        goalId,
                        success: result.success,
                        data: result.data,
                        error: result.error
                    });

                    if (result.success) {
                        successfulOperations++;
                    } else {
                        failedOperations++;
                        if (result.error) {
                            errors.push(`Goal ${goalId}: ${result.error}`);
                        }
                    }
                } catch (error) {
                    failedOperations++;
                    const errorMsg = `Goal ${goalId}: ${error instanceof Error ? error.message : String(error)}`;
                    errors.push(errorMsg);
                    results.push({
                        goalId,
                        success: false,
                        error: errorMsg
                    });
                }
            }));
        }

        return {
            success: failedOperations === 0,
            totalProcessed: goalIds.length,
            successfulOperations,
            failedOperations,
            results,
            errors,
            duration: Date.now() - startTime
        };
    }

    /**
     * Bulk delete multiple goals
     */
    static async bulkDeleteGoals(
        goalIds: string[],
        deleteFunction: (goalId: string) => Promise<GoalOperationResult<void>>
    ): Promise<BulkOperationResult<void>> {
        const startTime = Date.now();
        const results: BulkOperationResult<void>['results'] = [];
        const errors: string[] = [];

        let successfulOperations = 0;
        let failedOperations = 0;

        // Process sequentially to handle dependencies properly
        for (const goalId of goalIds) {
            try {
                const result = await deleteFunction(goalId);

                results.push({
                    goalId,
                    success: result.success,
                    error: result.error
                });

                if (result.success) {
                    successfulOperations++;
                } else {
                    failedOperations++;
                    if (result.error) {
                        errors.push(`Goal ${goalId}: ${result.error}`);
                    }
                }
            } catch (error) {
                failedOperations++;
                const errorMsg = `Goal ${goalId}: ${error instanceof Error ? error.message : String(error)}`;
                errors.push(errorMsg);
                results.push({
                    goalId,
                    success: false,
                    error: errorMsg
                });
            }
        }

        return {
            success: failedOperations === 0,
            totalProcessed: goalIds.length,
            successfulOperations,
            failedOperations,
            results,
            errors,
            duration: Date.now() - startTime
        };
    }

    // ===========================================
    // Search and Filtering
    // ===========================================

    /**
     * Advanced goal search with multiple filters
     */
    static searchGoals(goals: Goal[], filters: GoalSearchFilters): GoalSearchResult {
        const startTime = Date.now();
        let filteredGoals = [...goals];

        // Text search
        if (filters.searchText && filters.searchText.trim()) {
            const searchText = filters.searchText.toLowerCase().trim();
            filteredGoals = filteredGoals.filter(goal =>
                goal.title.toLowerCase().includes(searchText) ||
                (goal.description && goal.description.toLowerCase().includes(searchText)) ||
                goal.metadata?.tags?.some(tag => tag.toLowerCase().includes(searchText))
            );
        }

        // Status filter
        if (filters.status) {
            const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
            filteredGoals = filteredGoals.filter(goal => statuses.includes(goal.status));
        }

        // Tags filter
        if (filters.tags && filters.tags.length > 0) {
            filteredGoals = filteredGoals.filter(goal =>
                goal.metadata?.tags?.some(tag => filters.tags!.includes(tag))
            );
        }

        // Priority filter
        if (filters.priorityRange) {
            filteredGoals = filteredGoals.filter(goal => {
                const priority = goal.metadata?.priority ?? 3;
                return priority >= filters.priorityRange!.min && priority <= filters.priorityRange!.max;
            });
        }

        // Date range filter
        if (filters.dateRange && (filters.dateRange.from || filters.dateRange.to)) {
            filteredGoals = filteredGoals.filter(goal => {
                const field = filters.dateRange!.field;
                const fieldValue = goal[field];
                
                if (!fieldValue) return false;
                
                const date = fieldValue instanceof Date ? fieldValue : new Date(fieldValue);
                
                if (filters.dateRange!.from && date < filters.dateRange!.from) return false;
                if (filters.dateRange!.to && date > filters.dateRange!.to) return false;
                
                return true;
            });
        }

        // Parent filter
        if (filters.parentId !== undefined) {
            filteredGoals = filteredGoals.filter(goal => goal.parentId === filters.parentId);
        }

        // Max depth filter
        if (filters.maxDepth !== undefined) {
            const goalDepths = this.calculateGoalDepths(goals);
            filteredGoals = filteredGoals.filter(goal => 
                (goalDepths.get(goal.id) ?? 0) <= filters.maxDepth!
            );
        }

        // Overdue filter
        if (filters.overdue !== undefined) {
            filteredGoals = filteredGoals.filter(goal => {
                const isOverdue = goal.metadata?.dueDate && 
                    new Date() > new Date(goal.metadata.dueDate) && 
                    goal.status !== GoalStatus.COMPLETED;
                return filters.overdue ? isOverdue : !isOverdue;
            });
        }

        // Has tasks filter
        if (filters.hasTasks !== undefined) {
            filteredGoals = filteredGoals.filter(goal => 
                filters.hasTasks ? goal.tasks.length > 0 : goal.tasks.length === 0
            );
        }

        // Blocked filter
        if (filters.blocked !== undefined) {
            filteredGoals = filteredGoals.filter(goal => {
                const isBlocked = goal.blockedByIds.length > 0 || goal.status === GoalStatus.BLOCKED;
                return filters.blocked ? isBlocked : !isBlocked;
            });
        }

        // Calculate facets
        const facets = this.calculateSearchFacets(filteredGoals);

        return {
            goals: filteredGoals,
            totalCount: filteredGoals.length,
            searchTime: Date.now() - startTime,
            filters,
            facets
        };
    }

    /**
     * Filter goals by status
     */
    static filterByStatus(goals: Goal[], status: GoalStatusType): Goal[] {
        return goals.filter(goal => goal.status === status);
    }

    /**
     * Filter goals by date range
     */
    static filterByDate(
        goals: Goal[],
        field: 'createdAt' | 'updatedAt' | 'completedAt',
        from?: Date,
        to?: Date
    ): Goal[] {
        return goals.filter(goal => {
            const fieldValue = goal[field];
            if (!fieldValue) return false;

            const date = fieldValue instanceof Date ? fieldValue : new Date(fieldValue);
            
            if (from && date < from) return false;
            if (to && date > to) return false;
            
            return true;
        });
    }

    /**
     * Filter overdue goals
     */
    static filterOverdueGoals(goals: Goal[]): Goal[] {
        const now = new Date();
        return goals.filter(goal => {
            if (!goal.metadata?.dueDate || goal.status === GoalStatus.COMPLETED) {
                return false;
            }
            const dueDate = goal.metadata.dueDate instanceof Date ? 
                goal.metadata.dueDate : new Date(goal.metadata.dueDate);
            return now > dueDate;
        });
    }

    // ===========================================
    // Progress Calculation
    // ===========================================

    /**
     * Calculate comprehensive goal progress
     */
    static calculateGoalProgress(goal: Goal, allGoals?: Goal[]): GoalProgress {
        const now = new Date();
        const createdAt = goal.createdAt instanceof Date ? goal.createdAt : new Date(goal.createdAt);
        const updatedAt = goal.updatedAt ? 
            (goal.updatedAt instanceof Date ? goal.updatedAt : new Date(goal.updatedAt)) : 
            createdAt;

        // Task progress
        const completedTasks = goal.tasks.filter(task => task.status === TaskStatus.DONE).length;
        const totalTasks = goal.tasks.length;
        const taskProgress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

        // Check if overdue
        const isOverdue = goal.metadata?.dueDate ? 
            now > new Date(goal.metadata.dueDate) && goal.status !== GoalStatus.COMPLETED : 
            false;

        // Calculate days
        const daysSinceCreated = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
        const daysSinceUpdated = Math.floor((now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60 * 24));

        // Estimate completion (simple heuristic based on current progress and time)
        let estimatedCompletion: Date | undefined;
        if (goal.status !== GoalStatus.COMPLETED && taskProgress > 0) {
            const progressRate = taskProgress / daysSinceCreated;
            if (progressRate > 0) {
                const remainingProgress = 100 - taskProgress;
                const estimatedDaysToCompletion = remainingProgress / progressRate;
                estimatedCompletion = new Date(now.getTime() + estimatedDaysToCompletion * 24 * 60 * 60 * 1000);
            }
        }

        return {
            goal,
            taskProgress,
            completedTasks,
            totalTasks,
            isOverdue,
            daysSinceCreated,
            daysSinceUpdated,
            estimatedCompletion
        };
    }

    /**
     * Get completion percentage for a goal including child goals
     */
    static getCompletionPercentage(goal: Goal, allGoals: Goal[]): number {
        const cacheKey = `completion_${goal.id}_${allGoals.length}`;
        const cached = this.cache.get<number>(cacheKey);
        if (cached !== null) return cached;

        let totalWeight = 0;
        let completedWeight = 0;

        // Task completion weight (50% if has tasks, 0% if no tasks but has children)
        const childGoals = allGoals.filter(g => g.parentId === goal.id);
        const hasChildren = childGoals.length > 0;
        
        if (goal.tasks.length > 0) {
            const taskWeight = hasChildren ? 0.5 : 1.0;
            totalWeight += taskWeight;
            
            const completedTasks = goal.tasks.filter(t => t.status === TaskStatus.DONE).length;
            const taskCompletion = goal.tasks.length > 0 ? completedTasks / goal.tasks.length : 0;
            completedWeight += taskCompletion * taskWeight;
        }

        // Child goals completion weight (50% if has children)
        if (hasChildren) {
            const childWeight = goal.tasks.length > 0 ? 0.5 : 1.0;
            totalWeight += childWeight;
            
            let childCompletionSum = 0;
            for (const child of childGoals) {
                childCompletionSum += this.getCompletionPercentage(child, allGoals);
            }
            const avgChildCompletion = childCompletionSum / childGoals.length / 100;
            completedWeight += avgChildCompletion * childWeight;
        }

        // If no tasks and no children, use status
        if (totalWeight === 0) {
            totalWeight = 1;
            completedWeight = goal.status === GoalStatus.COMPLETED ? 1 : 0;
        }

        const percentage = Math.round((completedWeight / totalWeight) * 100);
        this.cache.set(cacheKey, percentage);
        return percentage;
    }

    /**
     * Calculate progress for multiple goals efficiently
     */
    static calculateBulkProgress(goals: Goal[], allGoals: Goal[]): GoalProgress[] {
        return goals.map(goal => this.calculateGoalProgress(goal, allGoals));
    }

    // ===========================================
    // Utility Functions
    // ===========================================

    /**
     * Flatten goal tree into array with depth information
     */
    static flattenGoalTree(goals: Goal[]): FlatGoalNode[] {
        const cacheKey = `flatten_${goals.length}_${goals.map(g => g.id).join(',')}`;
        const cached = this.cache.get<FlatGoalNode[]>(cacheKey);
        if (cached) return cached;

        const flattened: FlatGoalNode[] = [];
        const goalMap = new Map(goals.map(g => [g.id, g]));
        const processed = new Set<string>();

        const traverse = (goal: Goal, depth: number, path: string[]): void => {
            if (processed.has(goal.id)) return; // Prevent cycles
            processed.add(goal.id);

            const childGoals = goals.filter(g => g.parentId === goal.id);
            const taskProgress = goal.tasks.length > 0 ? 
                (goal.tasks.filter(t => t.status === TaskStatus.DONE).length / goal.tasks.length) * 100 : 0;

            flattened.push({
                goal,
                depth,
                path: [...path, goal.id],
                isRoot: !goal.parentId,
                isLeaf: childGoals.length === 0,
                childCount: childGoals.length,
                taskProgress,
                overallProgress: this.getCompletionPercentage(goal, goals)
            });

            // Sort children by creation date or order
            const sortedChildren = [...childGoals].sort((a, b) => {
                const dateA = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
                const dateB = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
                return dateA.getTime() - dateB.getTime();
            });

            for (const child of sortedChildren) {
                traverse(child, depth + 1, [...path, goal.id]);
            }
        };

        // Start with root goals
        const rootGoals = goals.filter(g => !g.parentId).sort((a, b) => {
            const dateA = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
            const dateB = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
            return dateA.getTime() - dateB.getTime();
        });

        for (const root of rootGoals) {
            traverse(root, 0, []);
        }

        this.cache.set(cacheKey, flattened, 10 * 60 * 1000); // 10 minute cache
        return flattened;
    }

    /**
     * Get maximum depth of a goal hierarchy
     */
    static getGoalDepth(goalId: string, goals: Goal[]): number {
        const cacheKey = `depth_${goalId}`;
        const cached = this.cache.get<number>(cacheKey);
        if (cached !== null) return cached;

        const goal = goals.find(g => g.id === goalId);
        if (!goal) return 0;

        let depth = 0;
        let currentGoal = goal;

        const visited = new Set<string>();
        while (currentGoal.parentId && !visited.has(currentGoal.id)) {
            visited.add(currentGoal.id);
            depth++;
            const parent = goals.find(g => g.id === currentGoal.parentId);
            if (!parent) break;
            currentGoal = parent;
            
            // Safety check to prevent infinite loops
            if (depth > 50) break;
        }

        this.cache.set(cacheKey, depth);
        return depth;
    }

    /**
     * Sort goals by priority (highest first)
     */
    static sortGoalsByPriority(goals: Goal[]): Goal[] {
        return [...goals].sort((a, b) => {
            const priorityA = a.metadata?.priority ?? 3;
            const priorityB = b.metadata?.priority ?? 3;
            return priorityB - priorityA; // Highest first
        });
    }

    /**
     * Sort goals with flexible options
     */
    static sortGoals(goals: Goal[], options: GoalSortOptions): Goal[] {
        return [...goals].sort((a, b) => {
            let result = this.compareGoalsByField(a, b, options.field, options.direction);
            
            // Apply secondary sort if primary values are equal
            if (result === 0 && options.secondarySort) {
                result = this.compareGoalsByField(
                    a, b, 
                    options.secondarySort.field, 
                    options.secondarySort.direction
                );
            }
            
            return result;
        });
    }

    /**
     * Group goals by status
     */
    static groupGoalsByStatus(goals: Goal[]): Record<GoalStatusType, Goal[]> {
        const grouped = {} as Record<GoalStatusType, Goal[]>;
        
        // Initialize with empty arrays
        Object.values(GoalStatus).forEach(status => {
            grouped[status] = [];
        });
        
        // Group goals
        goals.forEach(goal => {
            grouped[goal.status].push(goal);
        });
        
        return grouped;
    }

    /**
     * Find orphaned goals (parent doesn't exist)
     */
    static findOrphanedGoals(goals: Goal[]): Goal[] {
        const goalIds = new Set(goals.map(g => g.id));
        return goals.filter(goal => 
            goal.parentId && !goalIds.has(goal.parentId)
        );
    }

    /**
     * Find goals with circular dependencies
     */
    static findGoalsWithCircularDependencies(goals: Goal[]): Goal[] {
        const problematicGoals: Goal[] = [];

        for (const goal of goals) {
            if (this.hasCircularDependency(goal, goals)) {
                problematicGoals.push(goal);
            }
        }

        return problematicGoals;
    }

    // ===========================================
    // Performance Optimizations
    // ===========================================

    /**
     * Create indices for faster goal lookups
     */
    static createGoalIndices(goals: Goal[]): {
        byId: Map<string, Goal>;
        byParent: Map<string, Goal[]>;
        byStatus: Map<GoalStatusType, Goal[]>;
        byTag: Map<string, Goal[]>;
    } {
        const byId = new Map<string, Goal>();
        const byParent = new Map<string, Goal[]>();
        const byStatus = new Map<GoalStatusType, Goal[]>();
        const byTag = new Map<string, Goal[]>();

        // Initialize status groups
        Object.values(GoalStatus).forEach(status => {
            byStatus.set(status, []);
        });

        for (const goal of goals) {
            // ID index
            byId.set(goal.id, goal);

            // Parent index
            const parentId = goal.parentId || 'ROOT';
            if (!byParent.has(parentId)) {
                byParent.set(parentId, []);
            }
            byParent.get(parentId)!.push(goal);

            // Status index
            byStatus.get(goal.status)!.push(goal);

            // Tag index
            if (goal.metadata?.tags) {
                for (const tag of goal.metadata.tags) {
                    if (!byTag.has(tag)) {
                        byTag.set(tag, []);
                    }
                    byTag.get(tag)!.push(goal);
                }
            }
        }

        return { byId, byParent, byStatus, byTag };
    }

    /**
     * Get goals in batches for memory-efficient processing
     */
    static* batchGoals(goals: Goal[], batchSize = 100): Generator<Goal[]> {
        for (let i = 0; i < goals.length; i += batchSize) {
            yield goals.slice(i, i + batchSize);
        }
    }

    /**
     * Clear utility cache
     */
    static clearCache(): void {
        this.cache.clear();
    }

    // ===========================================
    // Private Helper Methods
    // ===========================================

    private static calculateGoalDepths(goals: Goal[]): Map<string, number> {
        const depths = new Map<string, number>();
        const goalMap = new Map(goals.map(g => [g.id, g]));

        const calculateDepth = (goalId: string, visited = new Set<string>()): number => {
            if (depths.has(goalId)) return depths.get(goalId)!;
            if (visited.has(goalId)) return 0; // Circular reference

            visited.add(goalId);
            const goal = goalMap.get(goalId);
            if (!goal || !goal.parentId) {
                depths.set(goalId, 0);
                return 0;
            }

            const depth = 1 + calculateDepth(goal.parentId, visited);
            depths.set(goalId, depth);
            return depth;
        };

        for (const goal of goals) {
            calculateDepth(goal.id);
        }

        return depths;
    }

    private static calculateSearchFacets(goals: Goal[]) {
        const statusCounts = {} as Record<GoalStatusType, number>;
        const priorityCounts = {} as Record<number, number>;
        const tagCounts = {} as Record<string, number>;

        // Initialize status counts
        Object.values(GoalStatus).forEach(status => {
            statusCounts[status] = 0;
        });

        for (const goal of goals) {
            // Status counts
            statusCounts[goal.status]++;

            // Priority counts
            const priority = goal.metadata?.priority ?? 3;
            priorityCounts[priority] = (priorityCounts[priority] || 0) + 1;

            // Tag counts
            if (goal.metadata?.tags) {
                for (const tag of goal.metadata.tags) {
                    tagCounts[tag] = (tagCounts[tag] || 0) + 1;
                }
            }
        }

        return { statusCounts, priorityCounts, tagCounts };
    }

    private static compareGoalsByField(
        a: Goal, 
        b: Goal, 
        field: GoalSortOptions['field'], 
        direction: 'asc' | 'desc'
    ): number {
        let valueA: any;
        let valueB: any;

        switch (field) {
            case 'title':
                valueA = a.title.toLowerCase();
                valueB = b.title.toLowerCase();
                break;
            case 'createdAt':
                valueA = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
                valueB = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
                break;
            case 'updatedAt':
                valueA = a.updatedAt ? (a.updatedAt instanceof Date ? a.updatedAt : new Date(a.updatedAt)) : new Date(0);
                valueB = b.updatedAt ? (b.updatedAt instanceof Date ? b.updatedAt : new Date(b.updatedAt)) : new Date(0);
                break;
            case 'completedAt':
                valueA = a.completedAt ? (a.completedAt instanceof Date ? a.completedAt : new Date(a.completedAt)) : new Date(0);
                valueB = b.completedAt ? (b.completedAt instanceof Date ? b.completedAt : new Date(b.completedAt)) : new Date(0);
                break;
            case 'priority':
                valueA = a.metadata?.priority ?? 3;
                valueB = b.metadata?.priority ?? 3;
                break;
            case 'status':
                // Define status order
                const statusOrder = {
                    [GoalStatus.IN_PROGRESS]: 0,
                    [GoalStatus.PLANNED]: 1,
                    [GoalStatus.BLOCKED]: 2,
                    [GoalStatus.COMPLETED]: 3
                };
                valueA = statusOrder[a.status];
                valueB = statusOrder[b.status];
                break;
            default:
                return 0;
        }

        let result: number;
        if (valueA < valueB) {
            result = -1;
        } else if (valueA > valueB) {
            result = 1;
        } else {
            result = 0;
        }

        return direction === 'desc' ? -result : result;
    }

    private static hasCircularDependency(goal: Goal, goals: Goal[]): boolean {
        const visited = new Set<string>();
        const recursionStack = new Set<string>();

        const dfs = (currentId: string): boolean => {
            if (recursionStack.has(currentId)) return true;
            if (visited.has(currentId)) return false;

            visited.add(currentId);
            recursionStack.add(currentId);

            const currentGoal = goals.find(g => g.id === currentId);
            if (currentGoal) {
                for (const blockerId of currentGoal.blockedByIds) {
                    if (dfs(blockerId)) return true;
                }
            }

            recursionStack.delete(currentId);
            return false;
        };

        return dfs(goal.id);
    }
}

/**
 * Legacy function aliases for backward compatibility
 */
export const goalUtils = GoalUtils;
export const bulkCompleteGoals = GoalUtils.bulkCompleteGoals;
export const bulkUpdateStatus = GoalUtils.bulkUpdateStatus;
export const bulkDeleteGoals = GoalUtils.bulkDeleteGoals;
export const searchGoals = GoalUtils.searchGoals;
export const filterByStatus = GoalUtils.filterByStatus;
export const filterByDate = GoalUtils.filterByDate;
export const calculateGoalProgress = GoalUtils.calculateGoalProgress;
export const getCompletionPercentage = GoalUtils.getCompletionPercentage;
export const flattenGoalTree = GoalUtils.flattenGoalTree;
export const getGoalDepth = GoalUtils.getGoalDepth;
export const sortGoalsByPriority = GoalUtils.sortGoalsByPriority;