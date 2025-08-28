/**
 * GoalValidationService - Issue #4 Stream B Advanced Validation
 * 
 * Advanced validation service that provides business logic validation,
 * complex dependency validation, performance checks, and data integrity validation
 * beyond basic type checking. Works in conjunction with the basic ValidationService.
 */

import {
    Goal,
    GoalStatus,
    GoalStatusType,
    Task,
    TaskStatus,
    TaskStatusType,
    CreateGoalParams,
    UpdateGoalParams,
    GoalProgress
} from '../types';

/**
 * Advanced validation result with detailed error reporting
 */
export interface AdvancedValidationResult {
    isValid: boolean;
    errors: AdvancedValidationError[];
    warnings: AdvancedValidationWarning[];
    performanceMetrics?: ValidationPerformanceMetrics;
}

/**
 * Advanced validation error with severity and context
 */
export interface AdvancedValidationError {
    code: string;
    message: string;
    severity: 'critical' | 'error' | 'warning';
    field?: string;
    context?: Record<string, any>;
    suggestedFix?: string;
}

/**
 * Advanced validation warning
 */
export interface AdvancedValidationWarning {
    code: string;
    message: string;
    field?: string;
    context?: Record<string, any>;
    suggestion?: string;
}

/**
 * Performance metrics for validation
 */
export interface ValidationPerformanceMetrics {
    validationTime: number;
    hierarchyDepth: number;
    totalNodes: number;
    complexityScore: number;
    memoryUsage?: number;
}

/**
 * Business rule configuration
 */
export interface BusinessRuleConfig {
    /** Maximum allowed hierarchy depth */
    maxHierarchyDepth: number;
    /** Maximum number of child goals per parent */
    maxChildrenPerGoal: number;
    /** Maximum number of tasks per goal */
    maxTasksPerGoal: number;
    /** Maximum number of dependencies per goal */
    maxDependenciesPerGoal: number;
    /** Whether to allow goals with no tasks to be marked as completed */
    allowCompletionWithoutTasks: boolean;
    /** Whether to enforce parent completion after all children are done */
    enforceParentCompletionCascading: boolean;
    /** Maximum goal title length */
    maxGoalTitleLength: number;
    /** Maximum goal description length */
    maxGoalDescriptionLength: number;
    /** Performance threshold for large hierarchies (node count) */
    performanceThreshold: number;
}

/**
 * Default business rule configuration
 */
const DEFAULT_BUSINESS_RULES: BusinessRuleConfig = {
    maxHierarchyDepth: 10,
    maxChildrenPerGoal: 50,
    maxTasksPerGoal: 100,
    maxDependenciesPerGoal: 20,
    allowCompletionWithoutTasks: false,
    enforceParentCompletionCascading: true,
    maxGoalTitleLength: 200,
    maxGoalDescriptionLength: 2000,
    performanceThreshold: 1000
};

/**
 * Advanced GoalValidationService for business logic validation
 */
export class GoalValidationService {
    private readonly businessRules: BusinessRuleConfig;
    private readonly performanceCache = new Map<string, ValidationPerformanceMetrics>();

    constructor(businessRules?: Partial<BusinessRuleConfig>) {
        this.businessRules = { ...DEFAULT_BUSINESS_RULES, ...businessRules };
    }

    // ===========================================
    // Advanced Goal Validation
    // ===========================================

    /**
     * Comprehensive goal validation with business rules
     */
    async validateGoalComprehensive(goal: Goal, allGoals: Goal[]): Promise<AdvancedValidationResult> {
        const startTime = Date.now();
        const errors: AdvancedValidationError[] = [];
        const warnings: AdvancedValidationWarning[] = [];

        try {
            // Business rule validation
            const businessRuleResult = await this.validateBusinessRules(goal, allGoals);
            errors.push(...businessRuleResult.errors);
            warnings.push(...businessRuleResult.warnings);

            // Complex dependency validation
            const dependencyResult = await this.validateComplexDependencies(goal, allGoals);
            errors.push(...dependencyResult.errors);
            warnings.push(...dependencyResult.warnings);

            // Data integrity validation
            const integrityResult = await this.validateDataIntegrity(goal, allGoals);
            errors.push(...integrityResult.errors);
            warnings.push(...integrityResult.warnings);

            // Performance validation
            const performanceResult = await this.validatePerformance(goal, allGoals);
            errors.push(...performanceResult.errors);
            warnings.push(...performanceResult.warnings);

            const endTime = Date.now();
            const performanceMetrics: ValidationPerformanceMetrics = {
                validationTime: endTime - startTime,
                hierarchyDepth: this.calculateHierarchyDepth(goal, allGoals),
                totalNodes: allGoals.length,
                complexityScore: this.calculateComplexityScore(goal, allGoals)
            };

            return {
                isValid: errors.filter(e => e.severity === 'critical' || e.severity === 'error').length === 0,
                errors,
                warnings,
                performanceMetrics
            };

        } catch (error) {
            errors.push({
                code: 'VALIDATION_INTERNAL_ERROR',
                message: `Internal validation error: ${error instanceof Error ? error.message : String(error)}`,
                severity: 'critical',
                context: { goal: goal.id }
            });

            return {
                isValid: false,
                errors,
                warnings
            };
        }
    }

    /**
     * Validate goal creation with advanced rules
     */
    async validateGoalCreationAdvanced(params: CreateGoalParams, allGoals: Goal[]): Promise<AdvancedValidationResult> {
        const errors: AdvancedValidationError[] = [];
        const warnings: AdvancedValidationWarning[] = [];

        // Title validation
        if (params.title.length > this.businessRules.maxGoalTitleLength) {
            errors.push({
                code: 'TITLE_TOO_LONG',
                message: `Goal title exceeds maximum length of ${this.businessRules.maxGoalTitleLength} characters`,
                severity: 'error',
                field: 'title',
                suggestedFix: `Trim title to ${this.businessRules.maxGoalTitleLength} characters`
            });
        }

        // Description validation
        if (params.description && params.description.length > this.businessRules.maxGoalDescriptionLength) {
            errors.push({
                code: 'DESCRIPTION_TOO_LONG',
                message: `Goal description exceeds maximum length of ${this.businessRules.maxGoalDescriptionLength} characters`,
                severity: 'error',
                field: 'description',
                suggestedFix: `Trim description to ${this.businessRules.maxGoalDescriptionLength} characters`
            });
        }

        // Parent validation
        if (params.parentId) {
            const parent = allGoals.find(g => g.id === params.parentId);
            if (!parent) {
                errors.push({
                    code: 'PARENT_NOT_FOUND',
                    message: `Parent goal with ID ${params.parentId} not found`,
                    severity: 'error',
                    field: 'parentId'
                });
            } else {
                // Check parent's child count
                const siblingCount = allGoals.filter(g => g.parentId === params.parentId).length;
                if (siblingCount >= this.businessRules.maxChildrenPerGoal) {
                    errors.push({
                        code: 'TOO_MANY_CHILDREN',
                        message: `Parent goal already has maximum allowed children (${this.businessRules.maxChildrenPerGoal})`,
                        severity: 'error',
                        field: 'parentId',
                        context: { parentId: params.parentId, currentChildCount: siblingCount }
                    });
                }

                // Check hierarchy depth
                const depth = this.calculateGoalDepth(params.parentId, allGoals);
                if (depth >= this.businessRules.maxHierarchyDepth) {
                    errors.push({
                        code: 'MAX_HIERARCHY_DEPTH',
                        message: `Adding goal would exceed maximum hierarchy depth of ${this.businessRules.maxHierarchyDepth}`,
                        severity: 'error',
                        field: 'parentId',
                        context: { currentDepth: depth, maxDepth: this.businessRules.maxHierarchyDepth }
                    });
                }

                // Check if parent is completed
                if (parent.status === GoalStatus.COMPLETED) {
                    warnings.push({
                        code: 'PARENT_COMPLETED',
                        message: 'Adding a child to a completed goal may require the parent to be reopened',
                        field: 'parentId',
                        context: { parentStatus: parent.status },
                        suggestion: 'Consider if the parent goal should still be marked as completed'
                    });
                }
            }
        }

        // Duplicate title check (warning)
        const duplicateTitles = allGoals.filter(g => 
            g.title.toLowerCase().trim() === params.title.toLowerCase().trim() &&
            g.parentId === params.parentId
        );
        if (duplicateTitles.length > 0) {
            warnings.push({
                code: 'DUPLICATE_TITLE',
                message: 'A goal with similar title already exists in the same parent',
                field: 'title',
                context: { existingGoals: duplicateTitles.map(g => g.id) },
                suggestion: 'Consider using a more specific title to avoid confusion'
            });
        }

        return {
            isValid: errors.filter(e => e.severity === 'critical' || e.severity === 'error').length === 0,
            errors,
            warnings
        };
    }

    // ===========================================
    // Business Rule Validation
    // ===========================================

    /**
     * Validate business rules for goals
     */
    private async validateBusinessRules(goal: Goal, allGoals: Goal[]): Promise<AdvancedValidationResult> {
        const errors: AdvancedValidationError[] = [];
        const warnings: AdvancedValidationWarning[] = [];

        // Task count validation
        if (goal.tasks.length > this.businessRules.maxTasksPerGoal) {
            errors.push({
                code: 'TOO_MANY_TASKS',
                message: `Goal has ${goal.tasks.length} tasks, exceeding maximum of ${this.businessRules.maxTasksPerGoal}`,
                severity: 'error',
                field: 'tasks',
                context: { currentCount: goal.tasks.length, maxCount: this.businessRules.maxTasksPerGoal }
            });
        }

        // Dependencies count validation
        if (goal.blockedByIds.length > this.businessRules.maxDependenciesPerGoal) {
            errors.push({
                code: 'TOO_MANY_DEPENDENCIES',
                message: `Goal has ${goal.blockedByIds.length} dependencies, exceeding maximum of ${this.businessRules.maxDependenciesPerGoal}`,
                severity: 'error',
                field: 'blockedByIds',
                context: { currentCount: goal.blockedByIds.length, maxCount: this.businessRules.maxDependenciesPerGoal }
            });
        }

        // Completion without tasks validation
        if (goal.status === GoalStatus.COMPLETED && 
            goal.tasks.length === 0 && 
            !this.businessRules.allowCompletionWithoutTasks) {
            const childGoals = allGoals.filter(g => g.parentId === goal.id);
            if (childGoals.length === 0) {
                errors.push({
                    code: 'COMPLETION_WITHOUT_WORK',
                    message: 'Goal marked as completed but has no tasks or child goals',
                    severity: 'warning',
                    field: 'status',
                    suggestedFix: 'Add tasks or child goals, or change business rule configuration'
                });
            }
        }

        // Parent completion cascading validation
        if (this.businessRules.enforceParentCompletionCascading && goal.parentId) {
            const parent = allGoals.find(g => g.id === goal.parentId);
            const siblings = allGoals.filter(g => g.parentId === goal.parentId);
            
            if (parent && goal.status === GoalStatus.COMPLETED) {
                const allSiblingsCompleted = siblings.every(s => s.status === GoalStatus.COMPLETED);
                if (allSiblingsCompleted && parent.status !== GoalStatus.COMPLETED) {
                    warnings.push({
                        code: 'PARENT_SHOULD_BE_COMPLETED',
                        message: 'All child goals are completed, but parent goal is not marked as completed',
                        field: 'status',
                        context: { parentId: goal.parentId, parentStatus: parent.status },
                        suggestion: 'Consider marking the parent goal as completed'
                    });
                }
            }
        }

        // Status transition validation
        if (goal.status === GoalStatus.IN_PROGRESS && goal.blockedByIds.length > 0) {
            const blockingGoals = allGoals.filter(g => goal.blockedByIds.includes(g.id));
            const uncompletedBlockers = blockingGoals.filter(g => g.status !== GoalStatus.COMPLETED);
            
            if (uncompletedBlockers.length > 0) {
                errors.push({
                    code: 'BLOCKED_GOAL_IN_PROGRESS',
                    message: 'Goal cannot be in progress while blocked by uncompleted goals',
                    severity: 'error',
                    field: 'status',
                    context: { 
                        blockingGoals: uncompletedBlockers.map(g => ({ id: g.id, title: g.title, status: g.status }))
                    },
                    suggestedFix: 'Complete blocking goals first or remove dependencies'
                });
            }
        }

        return { isValid: errors.length === 0, errors, warnings };
    }

    // ===========================================
    // Complex Dependency Validation
    // ===========================================

    /**
     * Validate complex dependencies including circular references and deep chains
     */
    private async validateComplexDependencies(goal: Goal, allGoals: Goal[]): Promise<AdvancedValidationResult> {
        const errors: AdvancedValidationError[] = [];
        const warnings: AdvancedValidationWarning[] = [];

        // Circular dependency detection
        const circularResult = this.detectCircularDependencies(goal, allGoals);
        if (circularResult.hasCircular) {
            errors.push({
                code: 'CIRCULAR_DEPENDENCY',
                message: `Circular dependency detected: ${circularResult.path?.join(' -> ')}`,
                severity: 'critical',
                field: 'blockedByIds',
                context: { circularPath: circularResult.path },
                suggestedFix: 'Remove one or more dependencies to break the circular chain'
            });
        }

        // Deep dependency chain validation
        const maxChainLength = 10; // Configurable threshold
        for (const blockerId of goal.blockedByIds) {
            const chainLength = this.calculateDependencyChainLength(blockerId, allGoals);
            if (chainLength > maxChainLength) {
                warnings.push({
                    code: 'DEEP_DEPENDENCY_CHAIN',
                    message: `Deep dependency chain detected (length: ${chainLength})`,
                    field: 'blockedByIds',
                    context: { blockerId, chainLength, maxRecommended: maxChainLength },
                    suggestion: 'Consider simplifying the dependency structure'
                });
            }
        }

        // Invalid dependency references
        for (const blockerId of goal.blockedByIds) {
            const blocker = allGoals.find(g => g.id === blockerId);
            if (!blocker) {
                errors.push({
                    code: 'INVALID_DEPENDENCY_REFERENCE',
                    message: `Dependency references non-existent goal: ${blockerId}`,
                    severity: 'error',
                    field: 'blockedByIds',
                    context: { invalidId: blockerId },
                    suggestedFix: 'Remove the invalid dependency reference'
                });
            }
        }

        // Self-dependency check
        if (goal.blockedByIds.includes(goal.id)) {
            errors.push({
                code: 'SELF_DEPENDENCY',
                message: 'Goal cannot be dependent on itself',
                severity: 'error',
                field: 'blockedByIds',
                suggestedFix: 'Remove self-reference from dependencies'
            });
        }

        return { isValid: errors.length === 0, errors, warnings };
    }

    // ===========================================
    // Data Integrity Validation
    // ===========================================

    /**
     * Validate data integrity across goal relationships
     */
    private async validateDataIntegrity(goal: Goal, allGoals: Goal[]): Promise<AdvancedValidationResult> {
        const errors: AdvancedValidationError[] = [];
        const warnings: AdvancedValidationWarning[] = [];

        // Parent-child consistency
        if (goal.parentId) {
            const parent = allGoals.find(g => g.id === goal.parentId);
            if (!parent) {
                errors.push({
                    code: 'ORPHANED_GOAL',
                    message: `Goal references non-existent parent: ${goal.parentId}`,
                    severity: 'error',
                    field: 'parentId',
                    suggestedFix: 'Remove parent reference or restore parent goal'
                });
            }
        }

        // Task data integrity
        for (const task of goal.tasks) {
            if (task.goalId !== goal.id) {
                errors.push({
                    code: 'TASK_GOAL_MISMATCH',
                    message: `Task ${task.id} has incorrect goalId reference`,
                    severity: 'error',
                    field: 'tasks',
                    context: { taskId: task.id, expectedGoalId: goal.id, actualGoalId: task.goalId }
                });
            }
        }

        // Date consistency validation
        if (goal.completedAt && goal.status !== GoalStatus.COMPLETED) {
            errors.push({
                code: 'COMPLETION_DATE_STATUS_MISMATCH',
                message: 'Goal has completion date but is not marked as completed',
                severity: 'error',
                field: 'completedAt',
                suggestedFix: 'Either remove completion date or update status to completed'
            });
        }

        if (goal.status === GoalStatus.COMPLETED && !goal.completedAt) {
            warnings.push({
                code: 'MISSING_COMPLETION_DATE',
                message: 'Completed goal is missing completion date',
                field: 'completedAt',
                suggestion: 'Set completion date for better tracking'
            });
        }

        // Date order validation
        if (goal.updatedAt && goal.createdAt && goal.updatedAt < goal.createdAt) {
            errors.push({
                code: 'INVALID_DATE_ORDER',
                message: 'Updated date is earlier than created date',
                severity: 'error',
                field: 'updatedAt'
            });
        }

        return { isValid: errors.length === 0, errors, warnings };
    }

    // ===========================================
    // Performance Validation
    // ===========================================

    /**
     * Validate performance aspects for large hierarchies
     */
    private async validatePerformance(goal: Goal, allGoals: Goal[]): Promise<AdvancedValidationResult> {
        const errors: AdvancedValidationError[] = [];
        const warnings: AdvancedValidationWarning[] = [];

        // Large hierarchy warning
        if (allGoals.length > this.businessRules.performanceThreshold) {
            warnings.push({
                code: 'LARGE_HIERARCHY',
                message: `Goal tree has ${allGoals.length} nodes, performance may be impacted`,
                context: { nodeCount: allGoals.length, threshold: this.businessRules.performanceThreshold },
                suggestion: 'Consider archiving completed goals or optimizing hierarchy structure'
            });
        }

        // Deep nesting warning
        const depth = this.calculateHierarchyDepth(goal, allGoals);
        if (depth > 7) { // Recommended UI depth limit
            warnings.push({
                code: 'DEEP_NESTING',
                message: `Goal hierarchy depth of ${depth} may impact user experience`,
                context: { depth, recommendedMax: 7 },
                suggestion: 'Consider flattening the hierarchy structure'
            });
        }

        // Wide branching warning
        if (goal.parentId) {
            const siblingCount = allGoals.filter(g => g.parentId === goal.parentId).length;
            if (siblingCount > 20) {
                warnings.push({
                    code: 'WIDE_BRANCHING',
                    message: `Parent has ${siblingCount} child goals, consider grouping`,
                    context: { siblingCount, recommendedMax: 20 },
                    suggestion: 'Group related goals under intermediate parent goals'
                });
            }
        }

        return { isValid: true, errors, warnings };
    }

    // ===========================================
    // Helper Methods
    // ===========================================

    /**
     * Calculate hierarchy depth for a goal
     */
    private calculateHierarchyDepth(goal: Goal, allGoals: Goal[]): number {
        let depth = 0;
        let currentGoal = goal;

        while (currentGoal.parentId) {
            depth++;
            const parent = allGoals.find(g => g.id === currentGoal.parentId);
            if (!parent) break;
            currentGoal = parent;
            
            // Prevent infinite loops
            if (depth > 50) break;
        }

        return depth;
    }

    /**
     * Calculate depth from a specific goal ID
     */
    private calculateGoalDepth(goalId: string, allGoals: Goal[]): number {
        const goal = allGoals.find(g => g.id === goalId);
        if (!goal) return 0;
        return this.calculateHierarchyDepth(goal, allGoals);
    }

    /**
     * Calculate dependency chain length
     */
    private calculateDependencyChainLength(goalId: string, allGoals: Goal[], visited = new Set<string>()): number {
        if (visited.has(goalId)) return 0; // Circular reference protection
        visited.add(goalId);

        const goal = allGoals.find(g => g.id === goalId);
        if (!goal || goal.blockedByIds.length === 0) return 0;

        let maxChainLength = 0;
        for (const blockerId of goal.blockedByIds) {
            const chainLength = 1 + this.calculateDependencyChainLength(blockerId, allGoals, new Set(visited));
            maxChainLength = Math.max(maxChainLength, chainLength);
        }

        return maxChainLength;
    }

    /**
     * Detect circular dependencies
     */
    private detectCircularDependencies(goal: Goal, allGoals: Goal[]): { hasCircular: boolean; path?: string[] } {
        const visited = new Set<string>();
        const recursionStack = new Set<string>();
        const path: string[] = [];

        const dfs = (currentId: string): boolean => {
            if (recursionStack.has(currentId)) {
                // Found circular dependency
                const cycleStartIndex = path.indexOf(currentId);
                const cyclePath = path.slice(cycleStartIndex).concat(currentId);
                return true;
            }

            if (visited.has(currentId)) {
                return false;
            }

            visited.add(currentId);
            recursionStack.add(currentId);
            path.push(currentId);

            const currentGoal = allGoals.find(g => g.id === currentId);
            if (currentGoal) {
                for (const blockerId of currentGoal.blockedByIds) {
                    if (dfs(blockerId)) {
                        return true;
                    }
                }
            }

            recursionStack.delete(currentId);
            path.pop();
            return false;
        };

        const hasCircular = dfs(goal.id);
        return { hasCircular, path: hasCircular ? path : undefined };
    }

    /**
     * Calculate complexity score for performance assessment
     */
    private calculateComplexityScore(goal: Goal, allGoals: Goal[]): number {
        let score = 0;
        
        // Base complexity
        score += 1;
        
        // Task complexity
        score += goal.tasks.length * 0.1;
        
        // Dependency complexity
        score += goal.blockedByIds.length * 0.5;
        
        // Hierarchy complexity
        const depth = this.calculateHierarchyDepth(goal, allGoals);
        score += depth * 0.3;
        
        // Child complexity
        const childCount = allGoals.filter(g => g.parentId === goal.id).length;
        score += childCount * 0.2;
        
        return Math.round(score * 100) / 100;
    }

    /**
     * Update business rules configuration
     */
    updateBusinessRules(updates: Partial<BusinessRuleConfig>): void {
        Object.assign(this.businessRules, updates);
    }

    /**
     * Get current business rules configuration
     */
    getBusinessRules(): BusinessRuleConfig {
        return { ...this.businessRules };
    }

    /**
     * Clear performance cache
     */
    clearPerformanceCache(): void {
        this.performanceCache.clear();
    }
}

/**
 * Factory function to create GoalValidationService with custom rules
 */
export function createGoalValidationService(businessRules?: Partial<BusinessRuleConfig>): GoalValidationService {
    return new GoalValidationService(businessRules);
}

/**
 * Default instance for immediate use
 */
export const defaultGoalValidationService = new GoalValidationService();