import { Goal, Task, GoalStatus, TaskStatus } from '../models';
import { EnhancedGoal } from '../types/Goal';
import { StorageService } from './storageService';
import { StateManager } from './stateManager';
import { DependencyService } from './dependencyService';
import { DependencyResolver } from './DependencyResolver';
import { DependencyValidator, ValidationContext, ValidationSeverity, GoalOperationValidation } from './DependencyValidator';
import { generateId } from '../utils';
import { createLogger } from '../utils/logger';

/**
 * Enhanced GoalManager with dependency validation and business logic integration
 * 
 * Handles all business logic related to goal operations with comprehensive
 * dependency validation, chain analysis, and user-friendly error handling.
 * 
 * Features:
 * - Integrated dependency validation for all goal operations
 * - Pre-operation validation with clear error messages and suggestions
 * - Business rule enforcement and circular dependency prevention
 * - Performance optimization and impact analysis
 * - Seamless integration with existing goal management workflows
 */
export class GoalManager {
    private storageService: StorageService;
    private stateManager: StateManager;
    private dependencyService: DependencyService;
    private dependencyResolver: DependencyResolver;
    private dependencyValidator: DependencyValidator;
    private logger = createLogger('GoalManager');

    constructor(
        storageService: StorageService,
        stateManager: StateManager,
        dependencyService: DependencyService,
        dependencyResolver: DependencyResolver,
        dependencyValidator: DependencyValidator
    ) {
        this.storageService = storageService;
        this.stateManager = stateManager;
        this.dependencyService = dependencyService;
        this.dependencyResolver = dependencyResolver;
        this.dependencyValidator = dependencyValidator;
        
        this.logger.info('[GoalManager] Enhanced GoalManager initialized with dependency validation');
    }

    /**
     * Creates a new goal with the specified title and optional parent
     * Includes validation for dependency impact and business rules
     */
    async createGoal(title: string, description?: string, parentId?: string, userId?: string): Promise<Goal> {
        this.logger.debug('[GoalManager] Creating new goal', { title, parentId, userId });

        try {
            const goal: Goal = {
                id: generateId(),
                title,
                description,
                status: 'planned',
                parentId,
                blockedByIds: [],
                tasks: [],
                createdAt: new Date(),
            };

            // Validate goal creation with dependency context
            const validationContext: ValidationContext = {
                operation: 'create',
                userId,
                timestamp: new Date(),
                metadata: {
                    isBulkOperation: false
                }
            };

            const validation = await this.dependencyValidator.validateGoalOperation({
                goalId: goal.id,
                operation: 'create',
                updates: goal as Partial<EnhancedGoal>,
                context: validationContext
            });

            // Handle validation warnings
            if (validation.warnings.length > 0) {
                this.logger.warn('[GoalManager] Goal creation has warnings', {
                    goalId: goal.id,
                    warnings: validation.warnings
                });
            }

            // Validation errors should not block goal creation (it's a new goal)
            // but we log any suggestions for the user
            if (validation.suggestions.length > 0) {
                this.logger.info('[GoalManager] Goal creation suggestions', {
                    goalId: goal.id,
                    suggestions: validation.suggestions
                });
            }

            // Add to state and persist
            this.stateManager.addGoal(goal);
            await this.storageService.saveGoals(this.stateManager.getAllGoals());

            this.logger.info('[GoalManager] Goal created successfully', { 
                goalId: goal.id,
                title: goal.title 
            });

            return goal;

        } catch (error) {
            this.logger.error('[GoalManager] Failed to create goal', {
                title,
                parentId,
                error: error instanceof Error ? error.message : error
            });
            throw error;
        }
    }

    /**
     * Updates an existing goal with comprehensive dependency validation
     * Validates impact on dependency relationships and provides actionable feedback
     */
    async updateGoal(goalId: string, updates: Partial<Goal>, userId?: string): Promise<Goal> {
        this.logger.debug('[GoalManager] Updating goal', { goalId, updates, userId });

        try {
            const existingGoal = this.stateManager.getGoal(goalId);
            if (!existingGoal) {
                throw new Error(`Goal with id ${goalId} not found`);
            }

            // Validate goal update with dependency context
            const validationContext: ValidationContext = {
                operation: updates.status !== existingGoal.status ? 'goal_status_change' : 'update',
                userId,
                timestamp: new Date(),
                metadata: {
                    isBulkOperation: false
                }
            };

            // Validate the update operation
            const validation = await this.dependencyValidator.validateGoalOperation({
                goalId,
                operation: updates.status !== existingGoal.status ? 'status_change' : 'update',
                updates: updates as Partial<EnhancedGoal>,
                context: validationContext
            });

            // Check if validation failed
            if (!validation.isValid) {
                const error = new Error(validation.error || 'Goal update validation failed');
                this.logger.error('[GoalManager] Goal update validation failed', {
                    goalId,
                    updates,
                    error: validation.error,
                    warnings: validation.warnings,
                    suggestions: validation.suggestions
                });
                
                // Enhanced error with validation context
                (error as any).validationResult = validation;
                throw error;
            }

            // Log warnings and suggestions
            if (validation.warnings.length > 0) {
                this.logger.warn('[GoalManager] Goal update has warnings', {
                    goalId,
                    warnings: validation.warnings
                });
            }

            if (validation.suggestions.length > 0) {
                this.logger.info('[GoalManager] Goal update suggestions', {
                    goalId,
                    suggestions: validation.suggestions
                });
            }

            const updatedGoal: Goal = { ...existingGoal, ...updates };
            
            // Handle status changes with dependency processing
            if (updates.status === 'completed' && existingGoal.status !== 'completed') {
                updatedGoal.completedAt = new Date();
                
                // Process dependency resolution with the new DependencyResolver
                this.logger.info('[GoalManager] Processing goal completion for dependencies', { goalId });
                
                try {
                    const unblockingResult = await this.dependencyResolver.processGoalCompletion(goalId);
                    
                    if (unblockingResult.unblockedGoals.length > 0) {
                        this.logger.info('[GoalManager] Goals unblocked due to completion', {
                            completedGoalId: goalId,
                            unblockedGoals: unblockingResult.unblockedGoals,
                            updatedDependencies: unblockingResult.updatedDependencies.length
                        });
                    }
                } catch (dependencyError) {
                    this.logger.error('[GoalManager] Failed to process dependency resolution', {
                        goalId,
                        error: dependencyError instanceof Error ? dependencyError.message : dependencyError
                    });
                    // Don't block the goal update, but log the issue
                }

                // Also use the legacy dependency service for backward compatibility
                try {
                    await this.dependencyService.unblockDependentGoals(goalId);
                } catch (legacyError) {
                    this.logger.warn('[GoalManager] Legacy dependency service failed', {
                        goalId,
                        error: legacyError instanceof Error ? legacyError.message : legacyError
                    });
                }
            }

            // Handle status change to in-progress - validate no blocking dependencies
            if (updates.status === 'in-progress' && existingGoal.status !== 'in-progress') {
                // The validation above should have caught any blocking dependencies
                // This is just a double-check and logging
                const dependencies = await this.dependencyResolver.getDependenciesForGoal(goalId);
                const activeBlockers = dependencies.blockedBy.filter(d => d.status === 'active');
                
                if (activeBlockers.length > 0) {
                    this.logger.warn('[GoalManager] Goal set to in-progress despite active blockers', {
                        goalId,
                        activeBlockers: activeBlockers.length
                    });
                }
            }

            this.stateManager.updateGoal(updatedGoal);
            await this.storageService.saveGoals(this.stateManager.getAllGoals());

            this.logger.info('[GoalManager] Goal updated successfully', { 
                goalId,
                updatedFields: Object.keys(updates),
                statusChange: updates.status !== existingGoal.status,
                impactedGoals: validation.impact.affectedGoalCount
            });

            return updatedGoal;

        } catch (error) {
            this.logger.error('[GoalManager] Failed to update goal', {
                goalId,
                updates,
                error: error instanceof Error ? error.message : error
            });
            throw error;
        }
    }

    /**
     * Deletes a goal and all its children with comprehensive dependency validation
     * Analyzes impact on dependency relationships and provides clear warnings
     */
    async deleteGoal(goalId: string, userId?: string): Promise<void> {
        this.logger.debug('[GoalManager] Deleting goal', { goalId, userId });

        try {
            const existingGoal = this.stateManager.getGoal(goalId);
            if (!existingGoal) {
                throw new Error(`Goal with id ${goalId} not found`);
            }

            // Validate goal deletion with dependency context
            const validationContext: ValidationContext = {
                operation: 'goal_delete',
                userId,
                timestamp: new Date(),
                metadata: {
                    isBulkOperation: false
                }
            };

            // Validate the deletion operation
            const validation = await this.dependencyValidator.validateGoalOperation({
                goalId,
                operation: 'delete',
                context: validationContext
            });

            // Check if validation has critical warnings
            if (validation.severity === ValidationSeverity.ERROR) {
                const error = new Error(validation.error || 'Goal deletion validation failed');
                this.logger.error('[GoalManager] Goal deletion validation failed', {
                    goalId,
                    error: validation.error,
                    warnings: validation.warnings,
                    suggestions: validation.suggestions
                });
                
                // Enhanced error with validation context
                (error as any).validationResult = validation;
                throw error;
            }

            // Log warnings and impact information
            if (validation.warnings.length > 0) {
                this.logger.warn('[GoalManager] Goal deletion has significant impact', {
                    goalId,
                    warnings: validation.warnings,
                    affectedGoals: validation.impact.affectedGoalCount,
                    orphanedDependencies: validation.orphanedDependencies.length
                });
            }

            if (validation.suggestions.length > 0) {
                this.logger.info('[GoalManager] Goal deletion suggestions', {
                    goalId,
                    suggestions: validation.suggestions
                });
            }

            // Get all child goals for deletion
            const childGoals = this.stateManager.getChildGoals(goalId);
            
            this.logger.info('[GoalManager] Starting goal deletion process', {
                goalId,
                childGoalCount: childGoals.length,
                impactedGoals: validation.impact.affectedGoalCount,
                orphanedDependencies: validation.orphanedDependencies.length
            });

            // Delete children recursively (each will go through validation)
            for (const childGoal of childGoals) {
                await this.deleteGoal(childGoal.id, userId);
            }

            // Remove dependencies using the new DependencyResolver
            try {
                const dependencies = await this.dependencyResolver.getDependenciesForGoal(goalId);
                const allDependencies = [...dependencies.blockedBy, ...dependencies.blocking];
                
                for (const dependency of allDependencies) {
                    await this.dependencyResolver.deleteDependency(dependency.id);
                }
                
                this.logger.info('[GoalManager] Dependencies removed for goal', {
                    goalId,
                    removedDependencies: allDependencies.length
                });
            } catch (dependencyError) {
                this.logger.error('[GoalManager] Failed to remove dependencies with DependencyResolver', {
                    goalId,
                    error: dependencyError instanceof Error ? dependencyError.message : dependencyError
                });
                
                // Fallback to legacy dependency service
                try {
                    await this.dependencyService.removeAllDependencies(goalId);
                    this.logger.info('[GoalManager] Used legacy dependency service as fallback', { goalId });
                } catch (legacyError) {
                    this.logger.error('[GoalManager] Legacy dependency service also failed', {
                        goalId,
                        error: legacyError instanceof Error ? legacyError.message : legacyError
                    });
                    // Continue with goal deletion anyway to avoid orphaned goals
                }
            }

            // Delete the goal itself
            this.stateManager.removeGoal(goalId);
            await this.storageService.saveGoals(this.stateManager.getAllGoals());

            this.logger.info('[GoalManager] Goal deleted successfully', { 
                goalId,
                childrenDeleted: childGoals.length,
                impactedDependencies: validation.impact.affectedDependencyCount
            });

        } catch (error) {
            this.logger.error('[GoalManager] Failed to delete goal', {
                goalId,
                error: error instanceof Error ? error.message : error
            });
            throw error;
        }
    }

    /**
     * Adds a task to a goal
     */
    async addTask(goalId: string, title: string): Promise<Task> {
        const goal = this.stateManager.getGoal(goalId);
        if (!goal) {
            throw new Error(`Goal with id ${goalId} not found`);
        }

        const task: Task = {
            id: generateId(),
            title,
            status: 'todo',
            order: goal.tasks.length,
            createdAt: new Date(),
        };

        goal.tasks.push(task);
        this.stateManager.updateGoal(goal);
        await this.storageService.saveGoals(this.stateManager.getAllGoals());

        return task;
    }

    /**
     * Updates a task within a goal
     */
    async updateTask(goalId: string, taskId: string, updates: Partial<Task>): Promise<Task> {
        const goal = this.stateManager.getGoal(goalId);
        if (!goal) {
            throw new Error(`Goal with id ${goalId} not found`);
        }

        const taskIndex = goal.tasks.findIndex(t => t.id === taskId);
        if (taskIndex === -1) {
            throw new Error(`Task with id ${taskId} not found in goal ${goalId}`);
        }

        const updatedTask: Task = { ...goal.tasks[taskIndex], ...updates };
        
        // Handle completion
        if (updates.status === 'done' && goal.tasks[taskIndex].status !== 'done') {
            updatedTask.completedAt = new Date();
        }

        goal.tasks[taskIndex] = updatedTask;
        this.stateManager.updateGoal(goal);
        await this.storageService.saveGoals(this.stateManager.getAllGoals());

        return updatedTask;
    }

    /**
     * Removes a task from a goal
     */
    async removeTask(goalId: string, taskId: string): Promise<void> {
        const goal = this.stateManager.getGoal(goalId);
        if (!goal) {
            throw new Error(`Goal with id ${goalId} not found`);
        }

        goal.tasks = goal.tasks.filter(t => t.id !== taskId);
        this.stateManager.updateGoal(goal);
        await this.storageService.saveGoals(this.stateManager.getAllGoals());
    }

    /**
     * Reorders tasks within a goal
     */
    async reorderTasks(goalId: string, taskId: string, newOrder: number): Promise<void> {
        const goal = this.stateManager.getGoal(goalId);
        if (!goal) {
            throw new Error(`Goal with id ${goalId} not found`);
        }

        const taskIndex = goal.tasks.findIndex(t => t.id === taskId);
        if (taskIndex === -1) {
            throw new Error(`Task with id ${taskId} not found in goal ${goalId}`);
        }

        // Remove task from current position
        const [task] = goal.tasks.splice(taskIndex, 1);
        
        // Insert at new position
        goal.tasks.splice(newOrder, 0, task);
        
        // Update order values
        goal.tasks.forEach((t, index) => {
            t.order = index;
        });

        this.stateManager.updateGoal(goal);
        await this.storageService.saveGoals(this.stateManager.getAllGoals());
    }

    /**
     * Gets the completion progress for a goal
     */
    getGoalProgress(goalId: string): { completed: number; total: number; percentage: number } {
        const goal = this.stateManager.getGoal(goalId);
        if (!goal) {
            return { completed: 0, total: 0, percentage: 0 };
        }

        const childGoals = this.stateManager.getChildGoals(goalId);
        const completedTasks = goal.tasks.filter(t => t.status === 'done').length;
        const completedChildGoals = childGoals.filter(g => g.status === 'completed').length;
        
        const totalTasks = goal.tasks.length;
        const totalChildGoals = childGoals.length;
        const total = totalTasks + totalChildGoals;
        const completed = completedTasks + completedChildGoals;
        
        return {
            completed,
            total,
            percentage: total > 0 ? Math.round((completed / total) * 100) : 0
        };
    }

    // ===========================================
    // Enhanced Methods with Dependency Validation
    // ===========================================

    /**
     * Validate if a goal can be started (no blocking dependencies)
     */
    async validateGoalCanStart(goalId: string, userId?: string): Promise<{
        canStart: boolean;
        reason?: string;
        blockingDependencies?: Array<{ id: string; title?: string; reason?: string }>;
        suggestions: string[];
    }> {
        try {
            this.logger.debug('[GoalManager] Validating if goal can start', { goalId });

            const validationContext: ValidationContext = {
                operation: 'goal_status_change',
                userId,
                timestamp: new Date()
            };

            const validation = await this.dependencyValidator.validateGoalOperation({
                goalId,
                operation: 'status_change',
                updates: { status: 'in-progress' as GoalStatus },
                context: validationContext
            });

            if (!validation.isValid) {
                const blockingDeps = await this.dependencyResolver.getDependenciesForGoal(goalId);
                const activeBlockers = blockingDeps.blockedBy.filter(d => d.status === 'active');

                return {
                    canStart: false,
                    reason: validation.error,
                    blockingDependencies: activeBlockers.map(d => ({
                        id: d.id,
                        title: this.stateManager.getGoal(d.blockingGoalId)?.title,
                        reason: d.reason
                    })),
                    suggestions: validation.suggestions
                };
            }

            return {
                canStart: true,
                suggestions: validation.suggestions
            };

        } catch (error) {
            this.logger.error('[GoalManager] Failed to validate goal start', {
                goalId,
                error: error instanceof Error ? error.message : error
            });

            return {
                canStart: false,
                reason: 'Validation failed - check system logs',
                suggestions: ['Contact system administrator']
            };
        }
    }

    /**
     * Get comprehensive dependency information for a goal
     */
    async getGoalDependencyInfo(goalId: string): Promise<{
        dependencies: {
            blockedBy: Array<{ dependency: any; goalTitle: string; status: string }>;
            blocking: Array<{ dependency: any; goalTitle: string; status: string }>;
        };
        analysis: {
            isBlocked: boolean;
            canStart: boolean;
            nextUnblockable: string[];
            chainDepth: number;
            estimatedUnblockDate?: Date;
        };
        warnings: string[];
        suggestions: string[];
    }> {
        try {
            this.logger.debug('[GoalManager] Getting dependency info for goal', { goalId });

            // Get dependencies from resolver
            const dependencies = await this.dependencyResolver.getDependenciesForGoal(goalId);
            
            // Build detailed dependency information
            const blockedBy = dependencies.blockedBy.map(dep => ({
                dependency: dep,
                goalTitle: this.stateManager.getGoal(dep.blockingGoalId)?.title || dep.blockingGoalId,
                status: this.stateManager.getGoal(dep.blockingGoalId)?.status || 'unknown'
            }));

            const blocking = dependencies.blocking.map(dep => ({
                dependency: dep,
                goalTitle: this.stateManager.getGoal(dep.blockedGoalId)?.title || dep.blockedGoalId,
                status: this.stateManager.getGoal(dep.blockedGoalId)?.status || 'unknown'
            }));

            // Analyze current state
            const activeBlockers = dependencies.blockedBy.filter(d => d.status === 'active');
            const isBlocked = activeBlockers.length > 0;
            
            // Check if goal can start
            const startValidation = await this.validateGoalCanStart(goalId);
            const canStart = startValidation.canStart;

            // Get unblocking impact
            const unblockingImpact = await this.dependencyResolver.getUnblockingImpact(goalId);

            // Calculate chain depth (simple approximation)
            const chainDepth = this.calculateDependencyChainDepth(goalId, dependencies.blockedBy);

            // Estimate unblock date (simple heuristic)
            let estimatedUnblockDate: Date | undefined;
            if (isBlocked) {
                const expectedDates = activeBlockers
                    .map(d => d.metadata?.expectedResolutionDate)
                    .filter((date): date is Date => date instanceof Date);
                
                if (expectedDates.length > 0) {
                    estimatedUnblockDate = new Date(Math.max(...expectedDates.map(d => d.getTime())));
                }
            }

            // Generate warnings and suggestions
            const warnings: string[] = [];
            const suggestions: string[] = [];

            if (activeBlockers.length > 5) {
                warnings.push(`Goal has many blocking dependencies (${activeBlockers.length})`);
                suggestions.push('Consider if all dependencies are necessary');
            }

            if (chainDepth > 5) {
                warnings.push(`Deep dependency chain (depth: ${chainDepth})`);
                suggestions.push('Consider flattening the dependency structure');
            }

            const overdueBlockers = activeBlockers.filter(d => {
                const expectedDate = d.metadata?.expectedResolutionDate;
                return expectedDate && new Date() > expectedDate;
            });

            if (overdueBlockers.length > 0) {
                warnings.push(`${overdueBlockers.length} dependencies are overdue`);
                suggestions.push('Review overdue blocking goals');
            }

            return {
                dependencies: {
                    blockedBy,
                    blocking
                },
                analysis: {
                    isBlocked,
                    canStart,
                    nextUnblockable: unblockingImpact.directlyUnblocked,
                    chainDepth,
                    estimatedUnblockDate
                },
                warnings,
                suggestions
            };

        } catch (error) {
            this.logger.error('[GoalManager] Failed to get dependency info', {
                goalId,
                error: error instanceof Error ? error.message : error
            });
            throw error;
        }
    }

    /**
     * Bulk operation to update multiple goals with validation
     */
    async bulkUpdateGoals(
        updates: Array<{ goalId: string; updates: Partial<Goal> }>,
        userId?: string
    ): Promise<{
        successful: Array<{ goalId: string; goal: Goal }>;
        failed: Array<{ goalId: string; error: string; suggestions: string[] }>;
        warnings: string[];
    }> {
        this.logger.debug('[GoalManager] Starting bulk goal update', { 
            count: updates.length, 
            userId 
        });

        const result = {
            successful: [] as Array<{ goalId: string; goal: Goal }>,
            failed: [] as Array<{ goalId: string; error: string; suggestions: string[] }>,
            warnings: [] as string[]
        };

        const validationContext: ValidationContext = {
            operation: 'update',
            userId,
            timestamp: new Date(),
            metadata: {
                isBulkOperation: true
            }
        };

        // Validate all operations first
        for (const update of updates) {
            try {
                const validation = await this.dependencyValidator.validateGoalOperation({
                    goalId: update.goalId,
                    operation: 'update',
                    updates: update.updates as Partial<EnhancedGoal>,
                    context: validationContext
                });

                if (!validation.isValid) {
                    result.failed.push({
                        goalId: update.goalId,
                        error: validation.error || 'Validation failed',
                        suggestions: validation.suggestions
                    });
                    continue;
                }

                if (validation.warnings.length > 0) {
                    result.warnings.push(...validation.warnings.map(w => `${update.goalId}: ${w}`));
                }

            } catch (error) {
                result.failed.push({
                    goalId: update.goalId,
                    error: error instanceof Error ? error.message : 'Unknown validation error',
                    suggestions: ['Check system logs', 'Try updating the goal individually']
                });
            }
        }

        // Execute updates that passed validation
        const validUpdates = updates.filter(update => 
            !result.failed.some(failed => failed.goalId === update.goalId)
        );

        for (const update of validUpdates) {
            try {
                const updatedGoal = await this.updateGoal(update.goalId, update.updates, userId);
                result.successful.push({
                    goalId: update.goalId,
                    goal: updatedGoal
                });
            } catch (error) {
                result.failed.push({
                    goalId: update.goalId,
                    error: error instanceof Error ? error.message : 'Update execution failed',
                    suggestions: ['Try updating the goal individually', 'Check for conflicting changes']
                });
            }
        }

        this.logger.info('[GoalManager] Bulk update completed', {
            total: updates.length,
            successful: result.successful.length,
            failed: result.failed.length,
            warnings: result.warnings.length
        });

        return result;
    }

    // ===========================================
    // Private Helper Methods
    // ===========================================

    /**
     * Calculate dependency chain depth for a goal
     */
    private calculateDependencyChainDepth(
        goalId: string, 
        dependencies: any[], 
        visited: Set<string> = new Set()
    ): number {
        if (visited.has(goalId)) {
            return 0; // Avoid cycles
        }

        visited.add(goalId);
        
        const blockers = dependencies
            .filter(d => d.blockedGoalId === goalId && d.status === 'active')
            .map(d => d.blockingGoalId);

        if (blockers.length === 0) {
            return 0;
        }

        let maxDepth = 0;
        for (const blockerId of blockers) {
            const depth = this.calculateDependencyChainDepth(blockerId, dependencies, new Set(visited));
            maxDepth = Math.max(maxDepth, depth + 1);
        }

        return maxDepth;
    }

    /**
     * Cleanup method for service shutdown
     */
    public dispose(): void {
        this.dependencyValidator?.dispose();
        this.logger.info('[GoalManager] Service disposed');
    }
}