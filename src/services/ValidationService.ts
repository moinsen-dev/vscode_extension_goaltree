/**
 * ValidationService - Comprehensive goal and task validation
 * 
 * This service provides validation for all goal operations including creation,
 * updates, deletion, status transitions, and dependency management.
 * It ensures data integrity and enforces business rules.
 */

import {
    Goal,
    CreateGoalParams,
    UpdateGoalParams,
    Task,
    CreateTaskParams,
    UpdateTaskParams,
    GoalStatus,
    GoalStatusType,
    TaskStatus,
    TaskStatusType,
    GoalStatusUtils
} from '../types';
import { GoalValidators } from '../utils/GoalValidators';

/**
 * Validation result interface
 */
export interface ValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
}

/**
 * Status transition validation result
 */
export interface StatusTransitionResult extends ValidationResult {
    allowedTransitions: GoalStatusType[];
}

/**
 * Goal deletion validation result
 */
export interface DeletionValidationResult extends ValidationResult {
    affectedGoals: string[];
    orphanedDependencies: string[];
}

/**
 * ValidationService class for goal and task validation
 */
export class ValidationService {
    
    // ===========================================
    // Goal Validation Methods
    // ===========================================

    /**
     * Validate goal creation parameters
     */
    validateGoalCreation(params: CreateGoalParams): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Validate title
        if (!GoalValidators.isValidTitle(params.title)) {
            errors.push('Goal title is required and must be between 1-200 characters');
        }

        // Validate description if provided
        if (params.description && !GoalValidators.isValidDescription(params.description)) {
            errors.push('Goal description must be less than 2000 characters');
        }

        // Validate metadata if provided
        if (params.metadata) {
            const metadataValidation = this.validateGoalMetadata(params.metadata);
            errors.push(...metadataValidation.errors);
            warnings.push(...metadataValidation.warnings);
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Validate goal update parameters
     */
    validateGoalUpdate(existingGoal: Goal, updates: UpdateGoalParams): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Validate title if being updated
        if (updates.title !== undefined && !GoalValidators.isValidTitle(updates.title)) {
            errors.push('Goal title must be between 1-200 characters');
        }

        // Validate description if being updated
        if (updates.description !== undefined && !GoalValidators.isValidDescription(updates.description)) {
            errors.push('Goal description must be less than 2000 characters');
        }

        // Validate parent ID if being updated
        if (updates.parentId !== undefined) {
            if (updates.parentId === existingGoal.id) {
                errors.push('Goal cannot be its own parent');
            }
        }

        // Validate blocked by IDs if being updated
        if (updates.blockedByIds !== undefined) {
            for (const blockedById of updates.blockedByIds) {
                if (blockedById === existingGoal.id) {
                    errors.push('Goal cannot be blocked by itself');
                }
            }
        }

        // Validate metadata if being updated
        if (updates.metadata !== undefined) {
            const metadataValidation = this.validateGoalMetadata(updates.metadata);
            errors.push(...metadataValidation.errors);
            warnings.push(...metadataValidation.warnings);
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Validate goal status transition
     */
    validateStatusTransition(currentStatus: GoalStatusType, newStatus: GoalStatusType): StatusTransitionResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        const allowedTransitions = GoalStatusUtils.getValidTransitions(currentStatus);

        if (!allowedTransitions.includes(newStatus)) {
            errors.push(
                `Invalid status transition from ${GoalStatusUtils.getDisplayName(currentStatus)} ` +
                `to ${GoalStatusUtils.getDisplayName(newStatus)}`
            );
        }

        // Add warnings for certain transitions
        if (currentStatus === GoalStatus.COMPLETED && newStatus !== GoalStatus.COMPLETED) {
            warnings.push('Reopening a completed goal may affect dependent goals');
        }

        if (newStatus === GoalStatus.BLOCKED && currentStatus === GoalStatus.IN_PROGRESS) {
            warnings.push('Blocking an in-progress goal may impact timelines');
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings,
            allowedTransitions
        };
    }

    /**
     * Validate goal deletion
     */
    validateGoalDeletion(goal: Goal, allGoals: Goal[]): DeletionValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];
        const affectedGoals: string[] = [];
        const orphanedDependencies: string[] = [];

        // Find child goals
        const childGoals = allGoals.filter(g => g.parentId === goal.id);
        if (childGoals.length > 0) {
            warnings.push(`Deleting this goal will also delete ${childGoals.length} child goal(s)`);
            affectedGoals.push(...childGoals.map(g => g.id));
        }

        // Find goals blocked by this goal
        const dependentGoals = allGoals.filter(g => g.blockedByIds.includes(goal.id));
        if (dependentGoals.length > 0) {
            warnings.push(`${dependentGoals.length} goal(s) are blocked by this goal and will be unblocked`);
            orphanedDependencies.push(...dependentGoals.map(g => g.id));
        }

        // Check if goal has incomplete tasks
        const incompleteTasks = goal.tasks.filter(t => t.status !== TaskStatus.DONE);
        if (incompleteTasks.length > 0) {
            warnings.push(`Goal has ${incompleteTasks.length} incomplete task(s) that will be deleted`);
        }

        // Prevent deletion of goals that are critical to the system
        if (goal.metadata?.priority === 5) {
            warnings.push('This is a high-priority goal - deletion may impact important work');
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings,
            affectedGoals,
            orphanedDependencies
        };
    }

    // ===========================================
    // Task Validation Methods
    // ===========================================

    /**
     * Validate task creation parameters
     */
    validateTaskCreation(params: CreateTaskParams): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Validate title
        if (!GoalValidators.isValidTitle(params.title)) {
            errors.push('Task title is required and must be between 1-200 characters');
        }

        // Validate description if provided
        if (params.description && !GoalValidators.isValidDescription(params.description)) {
            errors.push('Task description must be less than 1000 characters');
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Validate task update parameters
     */
    validateTaskUpdate(existingTask: Task, updates: UpdateTaskParams): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Validate title if being updated
        if (updates.title !== undefined && !GoalValidators.isValidTitle(updates.title)) {
            errors.push('Task title must be between 1-200 characters');
        }

        // Validate description if being updated
        if (updates.description !== undefined && !GoalValidators.isValidDescription(updates.description)) {
            errors.push('Task description must be less than 1000 characters');
        }

        // Validate order if being updated
        if (updates.order !== undefined && !GoalValidators.isValidOrder(updates.order)) {
            errors.push('Task order must be a non-negative integer');
        }

        // Validate status transition if being updated
        if (updates.status !== undefined) {
            const validTransitions = this.getValidTaskStatusTransitions(existingTask.status);
            if (!validTransitions.includes(updates.status)) {
                errors.push(
                    `Invalid task status transition from ${existingTask.status} to ${updates.status}`
                );
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    // ===========================================
    // Dependency Validation Methods
    // ===========================================

    /**
     * Validate circular dependency
     */
    validateCircularDependency(goalId: string, potentialBlockerId: string, allGoals: Goal[]): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        if (this.wouldCreateCircularDependency(goalId, potentialBlockerId, allGoals)) {
            errors.push('This dependency would create a circular dependency chain');
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Validate dependency chain depth
     */
    validateDependencyDepth(goalId: string, allGoals: Goal[], maxDepth: number = 10): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        const depth = this.calculateDependencyDepth(goalId, allGoals);
        if (depth > maxDepth) {
            warnings.push(`Dependency chain is very deep (${depth} levels) - consider simplifying`);
        }

        if (depth > maxDepth * 2) {
            errors.push(`Dependency chain is too deep (${depth} levels) - maximum allowed is ${maxDepth * 2}`);
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    // ===========================================
    // Business Rule Validation Methods
    // ===========================================

    /**
     * Validate business rules for goal completion
     */
    validateGoalCompletion(goal: Goal): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Check if all tasks are completed
        const incompleteTasks = goal.tasks.filter(t => t.status !== TaskStatus.DONE);
        if (incompleteTasks.length > 0) {
            warnings.push(`Goal has ${incompleteTasks.length} incomplete task(s)`);
        }

        // Check if goal has a description for completed goals
        if (!goal.description) {
            warnings.push('Completed goals should have a description documenting what was accomplished');
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Validate goal hierarchy constraints
     */
    validateHierarchyConstraints(goal: Goal, allGoals: Goal[]): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Check maximum hierarchy depth
        const depth = this.calculateHierarchyDepth(goal, allGoals);
        if (depth > 5) {
            warnings.push(`Goal hierarchy is very deep (${depth} levels) - consider flattening`);
        }

        if (depth > 10) {
            errors.push(`Goal hierarchy is too deep (${depth} levels) - maximum allowed is 10`);
        }

        // Check for too many children
        const childGoals = allGoals.filter(g => g.parentId === goal.id);
        if (childGoals.length > 20) {
            warnings.push(`Goal has many child goals (${childGoals.length}) - consider grouping`);
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    // ===========================================
    // Private Helper Methods
    // ===========================================

    private validateGoalMetadata(metadata: Goal['metadata']): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        if (metadata?.priority !== undefined) {
            if (!GoalValidators.isValidPriority(metadata.priority)) {
                errors.push('Priority must be between 1 and 5');
            }
        }

        if (metadata?.estimatedHours !== undefined) {
            if (!GoalValidators.isValidHours(metadata.estimatedHours)) {
                errors.push('Estimated hours must be a positive number');
            }
        }

        if (metadata?.actualHours !== undefined) {
            if (!GoalValidators.isValidHours(metadata.actualHours)) {
                errors.push('Actual hours must be a positive number');
            }
            if (metadata.estimatedHours && metadata.actualHours > metadata.estimatedHours * 2) {
                warnings.push('Actual hours significantly exceed estimated hours');
            }
        }

        if (metadata?.dueDate !== undefined) {
            if (!GoalValidators.isValidDate(metadata.dueDate)) {
                errors.push('Due date must be a valid date');
            } else if (metadata.dueDate < new Date()) {
                warnings.push('Due date is in the past');
            }
        }

        if (metadata?.tags !== undefined) {
            if (!GoalValidators.isValidTags(metadata.tags)) {
                errors.push('Tags must be an array of non-empty strings');
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    private getValidTaskStatusTransitions(currentStatus: TaskStatusType): TaskStatusType[] {
        switch (currentStatus) {
            case TaskStatus.TODO:
                return [TaskStatus.IN_PROGRESS, TaskStatus.DONE];
            case TaskStatus.IN_PROGRESS:
                return [TaskStatus.TODO, TaskStatus.DONE];
            case TaskStatus.DONE:
                return [TaskStatus.TODO, TaskStatus.IN_PROGRESS];
            default:
                return [];
        }
    }

    private wouldCreateCircularDependency(goalId: string, potentialBlockerId: string, allGoals: Goal[]): boolean {
        const visited = new Set<string>();
        
        const checkCircular = (currentId: string): boolean => {
            if (visited.has(currentId)) return false;
            if (currentId === goalId) return true;
            
            visited.add(currentId);
            const goal = allGoals.find(g => g.id === currentId);
            if (!goal) return false;
            
            return goal.blockedByIds.some(blockerId => checkCircular(blockerId));
        };
        
        return checkCircular(potentialBlockerId);
    }

    private calculateDependencyDepth(goalId: string, allGoals: Goal[]): number {
        const visited = new Set<string>();
        
        const calculateDepth = (currentId: string): number => {
            if (visited.has(currentId)) return 0;
            
            visited.add(currentId);
            const goal = allGoals.find(g => g.id === currentId);
            if (!goal || goal.blockedByIds.length === 0) return 0;
            
            const depths = goal.blockedByIds.map(blockerId => calculateDepth(blockerId));
            return Math.max(...depths) + 1;
        };
        
        return calculateDepth(goalId);
    }

    private calculateHierarchyDepth(goal: Goal, allGoals: Goal[]): number {
        const visited = new Set<string>();
        
        const calculateDepth = (currentGoal: Goal): number => {
            if (visited.has(currentGoal.id)) return 0;
            
            visited.add(currentGoal.id);
            if (!currentGoal.parentId) return 0;
            
            const parent = allGoals.find(g => g.id === currentGoal.parentId);
            if (!parent) return 0;
            
            return calculateDepth(parent) + 1;
        };
        
        return calculateDepth(goal);
    }
}