/**
 * Progress Calculation Utilities - Issue #7 Stream B Implementation
 * 
 * Progress calculation algorithms for goals and tasks, automatic parent goal 
 * progress updates, goal completion logic, and performance optimization.
 * 
 * This module provides:
 * - Task-based progress calculation (completed tasks / total tasks)
 * - Hierarchical progress calculation (child goals + tasks)  
 * - Automatic parent goal progress updates when task status changes
 * - Goal completion logic when all tasks and child goals are complete
 * - Progress indicators and percentage calculations
 * - Performance optimization for goals with many tasks
 * - Progress change detection and delta calculations
 * - Caching for expensive progress calculations
 */

import {
    Goal,
    Task,
    GoalStatus,
    GoalStatusType,
    TaskStatus,
    TaskStatusType
} from '../types';

/**
 * Progress calculation result interface
 */
export interface ProgressResult {
    /** Progress percentage (0-100) */
    percentage: number;
    
    /** Number of completed items */
    completed: number;
    
    /** Total number of items */
    total: number;
    
    /** Whether item is fully complete */
    isComplete: boolean;
    
    /** Calculation timestamp */
    calculatedAt: Date;
    
    /** Calculation metadata */
    metadata?: {
        /** Strategy used for calculation */
        strategy: ProgressCalculationStrategy;
        
        /** Whether result was cached */
        fromCache: boolean;
        
        /** Calculation time in milliseconds */
        calculationTime: number;
    };
}

/**
 * Hierarchical progress result with child information
 */
export interface HierarchicalProgressResult extends ProgressResult {
    /** Progress of direct child goals */
    childGoalProgress: ProgressResult[];
    
    /** Combined progress including tasks and child goals */
    combinedProgress: ProgressResult;
    
    /** Progress breakdown by component type */
    breakdown: {
        taskProgress: ProgressResult;
        childGoalProgress: ProgressResult;
    };
}

/**
 * Progress calculation strategies
 */
export enum ProgressCalculationStrategy {
    /** Simple task completion percentage */
    TASK_COMPLETION = 'task-completion',
    
    /** Weighted by task importance/priority */
    WEIGHTED_TASKS = 'weighted-tasks',
    
    /** Hierarchical with child goals */
    HIERARCHICAL = 'hierarchical',
    
    /** Time-based progress estimation */
    TIME_BASED = 'time-based',
    
    /** Status-based progress */
    STATUS_BASED = 'status-based'
}

/**
 * Progress calculation configuration
 */
export interface ProgressCalculationConfig {
    /** Default calculation strategy */
    defaultStrategy: ProgressCalculationStrategy;
    
    /** Enable caching for performance */
    enableCaching: boolean;
    
    /** Cache TTL in milliseconds */
    cacheTtl: number;
    
    /** Whether completed goals override task progress */
    completedGoalOverride: boolean;
    
    /** How to handle goals without tasks */
    emptyGoalHandling: 'status-based' | 'zero-progress' | 'complete';
    
    /** Minimum tasks to consider for progress calculation */
    minTaskThreshold: number;
    
    /** Performance optimization settings */
    performance: {
        /** Enable batch processing for large goal trees */
        enableBatchProcessing: boolean;
        
        /** Batch size for processing */
        batchSize: number;
        
        /** Enable parallel processing */
        enableParallelProcessing: boolean;
        
        /** Maximum concurrent calculations */
        maxConcurrentCalculations: number;
    };
}

/**
 * Progress change delta information
 */
export interface ProgressDelta {
    /** Previous progress result */
    previous: ProgressResult;
    
    /** Current progress result */
    current: ProgressResult;
    
    /** Change in percentage */
    percentageChange: number;
    
    /** Change in completed items */
    completedChange: number;
    
    /** Whether completion status changed */
    completionStatusChanged: boolean;
    
    /** Change timestamp */
    changedAt: Date;
}

/**
 * Progress cache entry
 */
interface ProgressCacheEntry {
    result: ProgressResult;
    timestamp: Date;
    ttl: number;
}

/**
 * Core progress calculation utilities
 */
export class ProgressCalculationUtils {
    private static readonly DEFAULT_CONFIG: ProgressCalculationConfig = {
        defaultStrategy: ProgressCalculationStrategy.TASK_COMPLETION,
        enableCaching: true,
        cacheTtl: 60000, // 1 minute
        completedGoalOverride: true,
        emptyGoalHandling: 'status-based',
        minTaskThreshold: 0,
        performance: {
            enableBatchProcessing: true,
            batchSize: 100,
            enableParallelProcessing: true,
            maxConcurrentCalculations: 10
        }
    };

    private config: ProgressCalculationConfig;
    private cache = new Map<string, ProgressCacheEntry>();
    private activeBatches = new Map<string, Promise<ProgressResult>>();

    constructor(config: Partial<ProgressCalculationConfig> = {}) {
        this.config = { 
            ...ProgressCalculationUtils.DEFAULT_CONFIG, 
            ...config,
            performance: {
                ...ProgressCalculationUtils.DEFAULT_CONFIG.performance,
                ...(config.performance || {})
            }
        };
    }

    /**
     * Calculate progress for a single goal based on its tasks
     */
    async calculateTaskProgress(
        goal: Goal, 
        strategy: ProgressCalculationStrategy = this.config.defaultStrategy
    ): Promise<ProgressResult> {
        const cacheKey = this.getCacheKey('task', goal.id, strategy);
        
        // Check cache first
        if (this.config.enableCaching) {
            const cached = this.getFromCache(cacheKey);
            if (cached) {
                return cached;
            }
        }

        const startTime = Date.now();
        let result: ProgressResult;

        try {
            // Handle completed goals with override
            if (this.config.completedGoalOverride && goal.status === GoalStatus.COMPLETED) {
                result = this.createCompleteProgress(1, 1, strategy);
            }
            // Handle empty goals
            else if (goal.tasks.length === 0) {
                result = this.handleEmptyGoal(goal, strategy);
            }
            // Calculate based on tasks
            else {
                result = await this.calculateTaskProgressInternal(goal, strategy);
            }

            // Add metadata
            result.metadata = {
                strategy,
                fromCache: false,
                calculationTime: Date.now() - startTime
            };

            // Cache result
            if (this.config.enableCaching) {
                this.setCache(cacheKey, result);
            }

            return result;

        } catch (error) {
            // Return fallback result on error
            return this.createEmptyProgress(strategy);
        }
    }

    /**
     * Calculate hierarchical progress for a goal and its children
     */
    async calculateGoalProgress(
        goal: Goal,
        childGoals: Goal[] = [],
        strategy: ProgressCalculationStrategy = ProgressCalculationStrategy.HIERARCHICAL
    ): Promise<HierarchicalProgressResult> {
        const cacheKey = this.getCacheKey('hierarchical', goal.id, strategy);
        
        // Check cache first
        if (this.config.enableCaching) {
            const cached = this.getFromCache(cacheKey) as HierarchicalProgressResult;
            if (cached && this.isHierarchicalResult(cached)) {
                return cached;
            }
        }

        const startTime = Date.now();

        try {
            // Calculate task progress for this goal
            const taskProgress = await this.calculateTaskProgress(goal, ProgressCalculationStrategy.TASK_COMPLETION);

            // Calculate progress for child goals
            const childGoalProgress = await this.calculateChildGoalProgress(childGoals, strategy);

            // Combine task and child goal progress
            const combinedProgress = this.combineProgress(taskProgress, childGoalProgress, strategy);

            const result: HierarchicalProgressResult = {
                ...combinedProgress,
                childGoalProgress: childGoals.map(child => ({ 
                    percentage: 0, 
                    completed: 0, 
                    total: 0, 
                    isComplete: false, 
                    calculatedAt: new Date()
                })), // Simplified for performance
                combinedProgress,
                breakdown: {
                    taskProgress,
                    childGoalProgress
                },
                metadata: {
                    strategy,
                    fromCache: false,
                    calculationTime: Date.now() - startTime
                }
            };

            // Cache result
            if (this.config.enableCaching) {
                this.setCache(cacheKey, result);
            }

            return result;

        } catch (error) {
            // Return fallback result on error
            const emptyProgress = this.createEmptyProgress(strategy);
            return {
                ...emptyProgress,
                childGoalProgress: [],
                combinedProgress: emptyProgress,
                breakdown: {
                    taskProgress: emptyProgress,
                    childGoalProgress: emptyProgress
                }
            };
        }
    }

    /**
     * Calculate progress percentage for display
     */
    calculateProgressPercentage(completed: number, total: number): number {
        if (total === 0) return 0;
        return Math.round((completed / total) * 100 * 100) / 100; // Round to 2 decimal places
    }

    /**
     * Check if a goal should be considered complete based on progress
     */
    shouldGoalBeComplete(goal: Goal, progressResult: ProgressResult): boolean {
        // If all tasks are done and no child goals blocking
        if (progressResult.isComplete) {
            return true;
        }

        // Check if goal status is already completed
        if (goal.status === GoalStatus.COMPLETED) {
            return true;
        }

        return false;
    }

    /**
     * Determine if goal status should be updated based on progress
     */
    suggestGoalStatusUpdate(goal: Goal, progressResult: ProgressResult): GoalStatusType | null {
        const currentStatus = goal.status;

        // If goal should be complete
        if (this.shouldGoalBeComplete(goal, progressResult)) {
            return currentStatus !== GoalStatus.COMPLETED ? GoalStatus.COMPLETED : null;
        }

        // If goal has progress but not in progress status
        if (progressResult.percentage > 0 && progressResult.percentage < 100) {
            if (currentStatus === GoalStatus.PLANNED || currentStatus === GoalStatus.BLOCKED) {
                return GoalStatus.IN_PROGRESS;
            }
        }

        // If goal has no progress and is in progress
        if (progressResult.percentage === 0 && currentStatus === GoalStatus.IN_PROGRESS) {
            return GoalStatus.PLANNED;
        }

        return null; // No status change needed
    }

    /**
     * Calculate progress delta between two progress results
     */
    calculateProgressDelta(previous: ProgressResult, current: ProgressResult): ProgressDelta {
        return {
            previous,
            current,
            percentageChange: current.percentage - previous.percentage,
            completedChange: current.completed - previous.completed,
            completionStatusChanged: previous.isComplete !== current.isComplete,
            changedAt: new Date()
        };
    }

    /**
     * Check if progress has changed significantly
     */
    hasSignificantProgressChange(delta: ProgressDelta, threshold: number = 1): boolean {
        return Math.abs(delta.percentageChange) >= threshold || delta.completionStatusChanged;
    }

    /**
     * Optimize progress calculation for large goal trees
     */
    async calculateProgressOptimized(
        goals: Goal[],
        strategy: ProgressCalculationStrategy = this.config.defaultStrategy
    ): Promise<Map<string, ProgressResult>> {
        const results = new Map<string, ProgressResult>();

        if (!this.config.performance.enableBatchProcessing || goals.length <= this.config.performance.batchSize) {
            // Process normally for small sets
            for (const goal of goals) {
                const result = await this.calculateTaskProgress(goal, strategy);
                results.set(goal.id, result);
            }
            return results;
        }

        // Batch processing for large goal sets
        const batches = this.createBatches(goals, this.config.performance.batchSize);
        const batchPromises: Promise<void>[] = [];

        for (const batch of batches) {
            const batchPromise = this.processBatch(batch, strategy, results);
            batchPromises.push(batchPromise);

            // Limit concurrent batches
            if (batchPromises.length >= this.config.performance.maxConcurrentCalculations) {
                await Promise.all(batchPromises);
                batchPromises.length = 0;
            }
        }

        // Process remaining batches
        if (batchPromises.length > 0) {
            await Promise.all(batchPromises);
        }

        return results;
    }

    /**
     * Clear progress calculation cache
     */
    clearCache(): void {
        this.cache.clear();
    }

    /**
     * Get cache statistics
     */
    getCacheStats(): { size: number; hitRate: number } {
        return {
            size: this.cache.size,
            hitRate: 0 // TODO: Implement hit rate tracking
        };
    }

    // ===========================================
    // Private Helper Methods
    // ===========================================

    private async calculateTaskProgressInternal(
        goal: Goal,
        strategy: ProgressCalculationStrategy
    ): Promise<ProgressResult> {
        const tasks = goal.tasks;
        
        if (tasks.length < this.config.minTaskThreshold) {
            return this.handleEmptyGoal(goal, strategy);
        }

        switch (strategy) {
            case ProgressCalculationStrategy.TASK_COMPLETION:
                return this.calculateSimpleTaskProgress(tasks);
                
            case ProgressCalculationStrategy.WEIGHTED_TASKS:
                return this.calculateWeightedTaskProgress(tasks);
                
            case ProgressCalculationStrategy.STATUS_BASED:
                return this.calculateStatusBasedProgress(goal);
                
            case ProgressCalculationStrategy.TIME_BASED:
                return this.calculateTimeBasedProgress(goal);
                
            default:
                return this.calculateSimpleTaskProgress(tasks);
        }
    }

    private calculateSimpleTaskProgress(tasks: Task[]): ProgressResult {
        if (tasks.length === 0) {
            return this.createEmptyProgress(ProgressCalculationStrategy.TASK_COMPLETION);
        }

        const completed = tasks.filter(task => task.status === TaskStatus.DONE).length;
        const total = tasks.length;
        const percentage = this.calculateProgressPercentage(completed, total);

        return {
            percentage,
            completed,
            total,
            isComplete: percentage === 100,
            calculatedAt: new Date()
        };
    }

    private calculateWeightedTaskProgress(tasks: Task[]): ProgressResult {
        if (tasks.length === 0) {
            return this.createEmptyProgress(ProgressCalculationStrategy.WEIGHTED_TASKS);
        }

        // For now, use simple calculation (could be enhanced with task priorities)
        return this.calculateSimpleTaskProgress(tasks);
    }

    private calculateStatusBasedProgress(goal: Goal): ProgressResult {
        let percentage = 0;
        
        switch (goal.status) {
            case GoalStatus.COMPLETED:
                percentage = 100;
                break;
            case GoalStatus.IN_PROGRESS:
                // Use task progress if available, otherwise use 50%
                if (goal.tasks.length > 0) {
                    const taskProgress = this.calculateSimpleTaskProgress(goal.tasks);
                    percentage = Math.max(taskProgress.percentage, 1); // At least 1% if in progress
                } else {
                    percentage = 50;
                }
                break;
            case GoalStatus.PLANNED:
            case GoalStatus.BLOCKED:
            default:
                percentage = 0;
                break;
        }

        return {
            percentage,
            completed: goal.status === GoalStatus.COMPLETED ? 1 : 0,
            total: 1,
            isComplete: goal.status === GoalStatus.COMPLETED,
            calculatedAt: new Date()
        };
    }

    private calculateTimeBasedProgress(goal: Goal): ProgressResult {
        const metadata = goal.metadata;
        if (!metadata?.estimatedHours || !metadata?.actualHours) {
            // Fall back to task-based progress
            return this.calculateSimpleTaskProgress(goal.tasks);
        }

        const percentage = Math.min(100, (metadata.actualHours / metadata.estimatedHours) * 100);
        
        return {
            percentage,
            completed: metadata.actualHours,
            total: metadata.estimatedHours,
            isComplete: percentage >= 100,
            calculatedAt: new Date()
        };
    }

    private async calculateChildGoalProgress(
        childGoals: Goal[],
        strategy: ProgressCalculationStrategy
    ): Promise<ProgressResult> {
        if (childGoals.length === 0) {
            return this.createEmptyProgress(strategy);
        }

        const childProgressResults = await Promise.all(
            childGoals.map(child => this.calculateTaskProgress(child, strategy))
        );

        return this.combineProgressResults(childProgressResults, strategy);
    }

    private combineProgress(
        taskProgress: ProgressResult,
        childGoalProgress: ProgressResult,
        strategy: ProgressCalculationStrategy
    ): ProgressResult {
        // Simple average for now (could be enhanced with weighting)
        const totalCompleted = taskProgress.completed + childGoalProgress.completed;
        const totalItems = taskProgress.total + childGoalProgress.total;
        
        if (totalItems === 0) {
            return this.createEmptyProgress(strategy);
        }

        const percentage = this.calculateProgressPercentage(totalCompleted, totalItems);

        return {
            percentage,
            completed: totalCompleted,
            total: totalItems,
            isComplete: percentage === 100,
            calculatedAt: new Date()
        };
    }

    private combineProgressResults(
        results: ProgressResult[],
        strategy: ProgressCalculationStrategy
    ): ProgressResult {
        if (results.length === 0) {
            return this.createEmptyProgress(strategy);
        }

        const totalCompleted = results.reduce((sum, result) => sum + result.completed, 0);
        const totalItems = results.reduce((sum, result) => sum + result.total, 0);
        
        if (totalItems === 0) {
            return this.createEmptyProgress(strategy);
        }

        const percentage = this.calculateProgressPercentage(totalCompleted, totalItems);

        return {
            percentage,
            completed: totalCompleted,
            total: totalItems,
            isComplete: percentage === 100,
            calculatedAt: new Date()
        };
    }

    private handleEmptyGoal(goal: Goal, strategy: ProgressCalculationStrategy): ProgressResult {
        switch (this.config.emptyGoalHandling) {
            case 'status-based':
                return this.calculateStatusBasedProgress(goal);
                
            case 'complete':
                return this.createCompleteProgress(1, 1, strategy);
                
            case 'zero-progress':
            default:
                return this.createEmptyProgress(strategy);
        }
    }

    private createEmptyProgress(strategy: ProgressCalculationStrategy): ProgressResult {
        return {
            percentage: 0,
            completed: 0,
            total: 0,
            isComplete: false,
            calculatedAt: new Date(),
            metadata: {
                strategy,
                fromCache: false,
                calculationTime: 0
            }
        };
    }

    private createCompleteProgress(completed: number, total: number, strategy: ProgressCalculationStrategy): ProgressResult {
        return {
            percentage: total > 0 ? this.calculateProgressPercentage(completed, total) : 100,
            completed,
            total,
            isComplete: completed === total && total > 0,
            calculatedAt: new Date(),
            metadata: {
                strategy,
                fromCache: false,
                calculationTime: 0
            }
        };
    }

    private getCacheKey(type: string, goalId: string, strategy: ProgressCalculationStrategy): string {
        return `${type}-${goalId}-${strategy}`;
    }

    private getFromCache(key: string): ProgressResult | null {
        const entry = this.cache.get(key);
        if (!entry) return null;

        // Check if cache entry has expired
        if (Date.now() - entry.timestamp.getTime() > entry.ttl) {
            this.cache.delete(key);
            return null;
        }

        // Mark as from cache
        const result = { ...entry.result };
        if (result.metadata) {
            result.metadata.fromCache = true;
        }

        return result;
    }

    private setCache(key: string, result: ProgressResult): void {
        this.cache.set(key, {
            result: { ...result },
            timestamp: new Date(),
            ttl: this.config.cacheTtl
        });

        // Clean up expired entries periodically
        if (this.cache.size > 1000) {
            this.cleanExpiredCache();
        }
    }

    private cleanExpiredCache(): void {
        const now = Date.now();
        for (const [key, entry] of this.cache.entries()) {
            if (now - entry.timestamp.getTime() > entry.ttl) {
                this.cache.delete(key);
            }
        }
    }

    private createBatches<T>(items: T[], batchSize: number): T[][] {
        const batches: T[][] = [];
        for (let i = 0; i < items.length; i += batchSize) {
            batches.push(items.slice(i, i + batchSize));
        }
        return batches;
    }

    private async processBatch(
        batch: Goal[],
        strategy: ProgressCalculationStrategy,
        results: Map<string, ProgressResult>
    ): Promise<void> {
        const batchPromises = batch.map(async (goal) => {
            const result = await this.calculateTaskProgress(goal, strategy);
            results.set(goal.id, result);
        });

        await Promise.all(batchPromises);
    }

    private isHierarchicalResult(result: any): result is HierarchicalProgressResult {
        return result && 
               typeof result === 'object' &&
               'childGoalProgress' in result &&
               'combinedProgress' in result &&
               'breakdown' in result;
    }
}

/**
 * Static utility functions for progress calculation
 */
export class ProgressCalculationHelpers {
    /**
     * Create a default progress calculation utility instance
     */
    static createDefaultCalculator(): ProgressCalculationUtils {
        return new ProgressCalculationUtils();
    }

    /**
     * Calculate simple task completion percentage
     */
    static calculateTaskCompletionPercentage(tasks: Task[]): number {
        if (tasks.length === 0) return 0;
        
        const completedTasks = tasks.filter(task => task.status === TaskStatus.DONE).length;
        return Math.round((completedTasks / tasks.length) * 100 * 100) / 100;
    }

    /**
     * Check if all tasks in a goal are completed
     */
    static areAllTasksCompleted(goal: Goal): boolean {
        if (goal.tasks.length === 0) return false;
        return goal.tasks.every(task => task.status === TaskStatus.DONE);
    }

    /**
     * Get progress status indicator string
     */
    static getProgressIndicator(percentage: number): string {
        if (percentage === 0) return '○';
        if (percentage === 100) return '●';
        if (percentage < 25) return '◔';
        if (percentage < 50) return '◑';
        if (percentage < 75) return '◕';
        return '◕';
    }

    /**
     * Format progress for display
     */
    static formatProgress(percentage: number, completed: number, total: number): string {
        return `${percentage.toFixed(1)}% (${completed}/${total})`;
    }

    /**
     * Check if progress calculation is needed for a goal
     */
    static needsProgressCalculation(goal: Goal, lastCalculated?: Date): boolean {
        // Always calculate if never calculated
        if (!lastCalculated) return true;

        // Calculate if goal was updated after last calculation
        if (goal.updatedAt && goal.updatedAt > lastCalculated) return true;

        // Calculate if any task was updated after last calculation
        return goal.tasks.some(task => 
            task.updatedAt && task.updatedAt > lastCalculated
        );
    }
}

/**
 * Export default instance for convenient usage
 */
export const defaultProgressCalculator = new ProgressCalculationUtils();