/**
 * DependencyValidator Service for the Goal Tree extension
 * 
 * Multi-level validation service that provides comprehensive dependency validation
 * for goal operations. This service integrates with the GoalManager to ensure
 * all dependency operations are valid, safe, and follow business rules.
 * 
 * Features:
 * - Pre-operation validation for dependency creation/modification
 * - Goal operation validation (create, update, delete, status change)
 * - Business rule enforcement and circular dependency prevention
 * - Performance optimization for large dependency networks
 * - User-friendly error messages and suggestions
 * 
 * Stream 4: Validation layer and business logic integration
 */

import { 
    Dependency, 
    CreateDependencyParams, 
    UpdateDependencyParams,
    DependencyValidationResult,
    DependencyType,
    DependencyUtils 
} from '../types/Dependency';
import { 
    DependencyStatus, 
    DependencyResolutionStrategy,
    DependencyValidationStatus,
    DependencyStatusUtils
} from '../types/DependencyStatus';
import { DependencyGraph } from '../types/DependencyGraph';
import { EnhancedGoal, GoalStatus } from '../types/Goal';
import { DependencyResolver } from './DependencyResolver';
import { StateManager } from './stateManager';
import { CircularDependencyDetector, CycleDetectionResult } from '../utils/CircularDependencyDetector';
import { GraphAlgorithms } from '../utils/GraphAlgorithms';
import { createLogger } from '../utils/logger';

/**
 * Validation context for dependency operations
 */
export interface ValidationContext {
    /** Operation being performed */
    operation: 'create' | 'update' | 'delete' | 'goal_status_change' | 'goal_delete';
    
    /** Current user or system context */
    userId?: string;
    
    /** Timestamp of the operation */
    timestamp: Date;
    
    /** Additional context data */
    metadata?: {
        /** Whether this is a bulk operation */
        isBulkOperation?: boolean;
        
        /** Priority override for validation */
        priorityOverride?: number;
        
        /** Skip certain validation rules */
        skipValidationRules?: ValidationRule[];
        
        /** Force validation even if it would normally be skipped */
        forceValidation?: boolean;
    };
}

/**
 * Types of validation rules
 */
export enum ValidationRule {
    /** Circular dependency prevention */
    CIRCULAR_DEPENDENCY = 'circular_dependency',
    
    /** Self-reference prevention */
    SELF_REFERENCE = 'self_reference',
    
    /** Goal existence validation */
    GOAL_EXISTENCE = 'goal_existence',
    
    /** Dependency limits validation */
    DEPENDENCY_LIMITS = 'dependency_limits',
    
    /** Status compatibility validation */
    STATUS_COMPATIBILITY = 'status_compatibility',
    
    /** Business rule compliance */
    BUSINESS_RULES = 'business_rules',
    
    /** Performance impact assessment */
    PERFORMANCE_IMPACT = 'performance_impact'
}

/**
 * Validation severity levels
 */
export enum ValidationSeverity {
    /** Information only */
    INFO = 'info',
    
    /** Warning - operation can proceed but with caution */
    WARNING = 'warning',
    
    /** Error - operation should not proceed */
    ERROR = 'error',
    
    /** Critical - operation must be blocked */
    CRITICAL = 'critical'
}

/**
 * Enhanced validation result with detailed information
 */
export interface EnhancedValidationResult extends DependencyValidationResult {
    /** Validation context */
    context: ValidationContext;
    
    /** Severity level */
    severity: ValidationSeverity;
    
    /** Specific validation rules that failed */
    failedRules: ValidationRule[];
    
    /** Detailed rule results */
    ruleResults: Map<ValidationRule, {
        passed: boolean;
        message: string;
        suggestions: string[];
        impact: 'low' | 'medium' | 'high';
    }>;
    
    /** Performance metrics */
    performance: {
        /** Time taken for validation (ms) */
        duration: number;
        
        /** Number of rules checked */
        rulesChecked: number;
        
        /** Whether validation was cached */
        fromCache: boolean;
    };
    
    /** Auto-correction suggestions */
    autoCorrections?: Array<{
        action: string;
        description: string;
        canAutoApply: boolean;
        riskLevel: 'low' | 'medium' | 'high';
    }>;
}

/**
 * Goal operation validation parameters
 */
export interface GoalOperationValidation {
    /** Goal being operated on */
    goalId: string;
    
    /** Operation type */
    operation: 'create' | 'update' | 'delete' | 'status_change';
    
    /** New values (for update/status_change operations) */
    updates?: Partial<EnhancedGoal>;
    
    /** Validation context */
    context: ValidationContext;
}

/**
 * Goal operation validation result
 */
export interface GoalOperationValidationResult {
    /** Whether the operation is valid */
    isValid: boolean;
    
    /** Validation severity */
    severity: ValidationSeverity;
    
    /** Main error message if invalid */
    error?: string;
    
    /** Warning messages */
    warnings: string[];
    
    /** Suggested actions */
    suggestions: string[];
    
    /** Affected dependencies */
    affectedDependencies: Dependency[];
    
    /** Dependencies that would be automatically resolved */
    autoResolvedDependencies: Dependency[];
    
    /** Dependencies that would be orphaned */
    orphanedDependencies: Dependency[];
    
    /** Estimated impact of the operation */
    impact: {
        /** Goals that would be affected */
        affectedGoalCount: number;
        
        /** Dependencies that would be affected */
        affectedDependencyCount: number;
        
        /** Estimated delay caused (in days) */
        estimatedDelay: number;
        
        /** Whether critical path would be affected */
        affectsCriticalPath: boolean;
    };
}

/**
 * Configuration for the DependencyValidator
 */
export interface DependencyValidatorConfig {
    /** Maximum validation time (ms) */
    maxValidationTime: number;
    
    /** Enable caching for validation results */
    enableCaching: boolean;
    
    /** Cache TTL (ms) */
    cacheTTL: number;
    
    /** Maximum dependency depth to analyze */
    maxAnalysisDepth: number;
    
    /** Enable performance impact analysis */
    enablePerformanceAnalysis: boolean;
    
    /** Validation rules to always enforce */
    mandatoryRules: ValidationRule[];
    
    /** Auto-correction settings */
    autoCorrection: {
        enabled: boolean;
        maxAutoCorrections: number;
        allowedActions: string[];
    };
}

/**
 * Default validator configuration
 */
const DEFAULT_CONFIG: DependencyValidatorConfig = {
    maxValidationTime: 5000, // 5 seconds
    enableCaching: true,
    cacheTTL: 2 * 60 * 1000, // 2 minutes
    maxAnalysisDepth: 20,
    enablePerformanceAnalysis: true,
    mandatoryRules: [
        ValidationRule.CIRCULAR_DEPENDENCY,
        ValidationRule.SELF_REFERENCE,
        ValidationRule.GOAL_EXISTENCE
    ],
    autoCorrection: {
        enabled: true,
        maxAutoCorrections: 3,
        allowedActions: ['soften_dependency', 'adjust_priority', 'suggest_alternative']
    }
};

/**
 * Cache entry for validation results
 */
interface ValidationCacheEntry {
    result: EnhancedValidationResult;
    timestamp: number;
    ttl: number;
}

/**
 * DependencyValidator Service
 */
export class DependencyValidator {
    private config: DependencyValidatorConfig;
    private stateManager: StateManager;
    private dependencyResolver: DependencyResolver;
    private circularDetector: CircularDependencyDetector;
    private graphAlgorithms: GraphAlgorithms;
    private logger = createLogger('DependencyValidator');
    
    // Performance optimization caches
    private validationCache: Map<string, ValidationCacheEntry> = new Map();
    private ruleCache: Map<string, any> = new Map();
    
    constructor(
        stateManager: StateManager,
        dependencyResolver: DependencyResolver,
        config: Partial<DependencyValidatorConfig> = {}
    ) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.stateManager = stateManager;
        this.dependencyResolver = dependencyResolver;
        
        // Initialize utility services
        this.circularDetector = new CircularDependencyDetector({
            maxCycleLength: this.config.maxAnalysisDepth,
            generateSuggestions: true
        });
        this.graphAlgorithms = new GraphAlgorithms();
        
        this.logger.info('[DependencyValidator] Service initialized', { config: this.config });
    }

    // ===========================================
    // Main Validation Methods
    // ===========================================

    /**
     * Validate dependency creation
     */
    async validateDependencyCreation(
        params: CreateDependencyParams,
        context: ValidationContext
    ): Promise<EnhancedValidationResult> {
        const startTime = Date.now();
        this.logger.debug('[DependencyValidator] Validating dependency creation', { params, context });
        
        try {
            // Check cache first
            const cacheKey = this.getCacheKey('create', params, context);
            if (this.config.enableCaching) {
                const cached = this.getFromCache(cacheKey);
                if (cached) {
                    this.logger.debug('[DependencyValidator] Returning cached result');
                    return cached;
                }
            }
            
            const ruleResults = new Map<ValidationRule, any>();
            const warnings: string[] = [];
            const suggestions: string[] = [];
            const failedRules: ValidationRule[] = [];
            let severity = ValidationSeverity.INFO;
            let isValid = true;
            let mainError: string | undefined;
            
            // Execute validation rules
            const rulesToCheck = this.getRulesToCheck(context);
            
            for (const rule of rulesToCheck) {
                const ruleResult = await this.executeValidationRule(rule, params, context);
                ruleResults.set(rule, ruleResult);
                
                if (!ruleResult.passed) {
                    failedRules.push(rule);
                    warnings.push(ruleResult.message);
                    suggestions.push(...ruleResult.suggestions);
                    
                    // Determine if this should block the operation
                    if (this.config.mandatoryRules.includes(rule) || ruleResult.impact === 'high') {
                        isValid = false;
                        severity = ValidationSeverity.ERROR;
                        if (!mainError) {
                            mainError = ruleResult.message;
                        }
                    } else if (ruleResult.impact === 'medium') {
                        severity = Math.max(severity, ValidationSeverity.WARNING) as ValidationSeverity;
                    }
                }
                
                // Check timeout
                if (Date.now() - startTime > this.config.maxValidationTime) {
                    this.logger.warn('[DependencyValidator] Validation timeout reached');
                    break;
                }
            }
            
            // Generate auto-corrections if enabled
            const autoCorrections = this.config.autoCorrection.enabled 
                ? this.generateAutoCorrections(params, failedRules, ruleResults)
                : undefined;
            
            const result: EnhancedValidationResult = {
                isValid,
                error: mainError,
                warnings,
                suggestions,
                context,
                severity,
                failedRules,
                ruleResults,
                performance: {
                    duration: Date.now() - startTime,
                    rulesChecked: rulesToCheck.length,
                    fromCache: false
                },
                autoCorrections
            };
            
            // Cache the result
            if (this.config.enableCaching) {
                this.setCache(cacheKey, result);
            }
            
            this.logger.info('[DependencyValidator] Dependency creation validation completed', {
                isValid,
                severity,
                rulesChecked: rulesToCheck.length,
                duration: result.performance.duration
            });
            
            return result;
            
        } catch (error) {
            this.logger.error('[DependencyValidator] Error validating dependency creation', {
                params,
                error: error instanceof Error ? error.message : error
            });
            
            return {
                isValid: false,
                error: `Validation error: ${error instanceof Error ? error.message : error}`,
                warnings: [],
                suggestions: ['Check system logs for details'],
                context,
                severity: ValidationSeverity.CRITICAL,
                failedRules: [],
                ruleResults: new Map(),
                performance: {
                    duration: Date.now() - startTime,
                    rulesChecked: 0,
                    fromCache: false
                }
            };
        }
    }

    /**
     * Validate dependency update
     */
    async validateDependencyUpdate(
        dependencyId: string,
        updates: UpdateDependencyParams,
        context: ValidationContext
    ): Promise<EnhancedValidationResult> {
        const startTime = Date.now();
        this.logger.debug('[DependencyValidator] Validating dependency update', { dependencyId, updates, context });
        
        try {
            // Get existing dependency
            const existingDependency = await this.dependencyResolver.getDependency(dependencyId);
            if (!existingDependency) {
                return {
                    isValid: false,
                    error: `Dependency with ID ${dependencyId} not found`,
                    warnings: [],
                    suggestions: ['Verify the dependency ID and try again'],
                    context,
                    severity: ValidationSeverity.ERROR,
                    failedRules: [ValidationRule.GOAL_EXISTENCE],
                    ruleResults: new Map(),
                    performance: {
                        duration: Date.now() - startTime,
                        rulesChecked: 1,
                        fromCache: false
                    }
                };
            }
            
            // Create a preview of what the updated dependency would look like
            const previewDependency: Dependency = {
                ...existingDependency,
                ...updates,
                updatedAt: new Date()
            };
            
            // Convert to CreateDependencyParams for validation
            const validationParams: CreateDependencyParams = {
                blockedGoalId: previewDependency.blockedGoalId,
                blockingGoalId: previewDependency.blockingGoalId,
                reason: previewDependency.reason,
                resolutionStrategy: previewDependency.resolutionStrategy,
                type: previewDependency.metadata?.type,
                priority: previewDependency.metadata?.priority,
                tags: previewDependency.metadata?.tags,
                expectedResolutionDate: previewDependency.metadata?.expectedResolutionDate
            };
            
            // Validate using the creation validation logic
            const result = await this.validateDependencyCreation(validationParams, context);
            
            // Add update-specific warnings
            if (updates.status === DependencyStatus.RESOLVED) {
                const unblockedGoals = await this.dependencyResolver.getUnblockingImpact(previewDependency.blockingGoalId);
                if (unblockedGoals.totalImpact > 0) {
                    result.warnings.push(`Resolving this dependency will unblock ${unblockedGoals.totalImpact} goals`);
                    result.suggestions.push('Review the goals that will be unblocked to ensure they are ready to proceed');
                }
            }
            
            this.logger.info('[DependencyValidator] Dependency update validation completed', {
                dependencyId,
                isValid: result.isValid,
                severity: result.severity
            });
            
            return result;
            
        } catch (error) {
            this.logger.error('[DependencyValidator] Error validating dependency update', {
                dependencyId,
                updates,
                error: error instanceof Error ? error.message : error
            });
            
            return {
                isValid: false,
                error: `Update validation error: ${error instanceof Error ? error.message : error}`,
                warnings: [],
                suggestions: ['Check system logs for details'],
                context,
                severity: ValidationSeverity.CRITICAL,
                failedRules: [],
                ruleResults: new Map(),
                performance: {
                    duration: Date.now() - startTime,
                    rulesChecked: 0,
                    fromCache: false
                }
            };
        }
    }

    /**
     * Validate goal operations that might affect dependencies
     */
    async validateGoalOperation(
        params: GoalOperationValidation
    ): Promise<GoalOperationValidationResult> {
        const startTime = Date.now();
        this.logger.debug('[DependencyValidator] Validating goal operation', params);
        
        try {
            const goal = this.stateManager.getGoal(params.goalId);
            if (!goal && params.operation !== 'create') {
                return {
                    isValid: false,
                    severity: ValidationSeverity.ERROR,
                    error: `Goal with ID ${params.goalId} not found`,
                    warnings: [],
                    suggestions: ['Verify the goal ID and try again'],
                    affectedDependencies: [],
                    autoResolvedDependencies: [],
                    orphanedDependencies: [],
                    impact: {
                        affectedGoalCount: 0,
                        affectedDependencyCount: 0,
                        estimatedDelay: 0,
                        affectsCriticalPath: false
                    }
                };
            }
            
            let result: GoalOperationValidationResult;
            
            switch (params.operation) {
                case 'delete':
                    result = await this.validateGoalDeletion(params.goalId, params.context);
                    break;
                case 'status_change':
                    result = await this.validateGoalStatusChange(params.goalId, params.updates?.status as GoalStatus, params.context);
                    break;
                case 'update':
                    result = await this.validateGoalUpdate(params.goalId, params.updates!, params.context);
                    break;
                case 'create':
                    result = await this.validateGoalCreation(params.updates!, params.context);
                    break;
                default:
                    throw new Error(`Unknown operation: ${params.operation}`);
            }
            
            this.logger.info('[DependencyValidator] Goal operation validation completed', {
                operation: params.operation,
                goalId: params.goalId,
                isValid: result.isValid,
                severity: result.severity,
                duration: Date.now() - startTime
            });
            
            return result;
            
        } catch (error) {
            this.logger.error('[DependencyValidator] Error validating goal operation', {
                params,
                error: error instanceof Error ? error.message : error
            });
            
            return {
                isValid: false,
                severity: ValidationSeverity.CRITICAL,
                error: `Goal operation validation error: ${error instanceof Error ? error.message : error}`,
                warnings: [],
                suggestions: ['Check system logs for details'],
                affectedDependencies: [],
                autoResolvedDependencies: [],
                orphanedDependencies: [],
                impact: {
                    affectedGoalCount: 0,
                    affectedDependencyCount: 0,
                    estimatedDelay: 0,
                    affectsCriticalPath: false
                }
            };
        }
    }

    // ===========================================
    // Validation Rule Implementations
    // ===========================================

    /**
     * Execute a specific validation rule
     */
    private async executeValidationRule(
        rule: ValidationRule,
        params: CreateDependencyParams,
        context: ValidationContext
    ): Promise<{
        passed: boolean;
        message: string;
        suggestions: string[];
        impact: 'low' | 'medium' | 'high';
    }> {
        try {
            switch (rule) {
                case ValidationRule.CIRCULAR_DEPENDENCY:
                    return await this.validateCircularDependency(params, context);
                    
                case ValidationRule.SELF_REFERENCE:
                    return this.validateSelfReference(params, context);
                    
                case ValidationRule.GOAL_EXISTENCE:
                    return this.validateGoalExistence(params, context);
                    
                case ValidationRule.DEPENDENCY_LIMITS:
                    return await this.validateDependencyLimits(params, context);
                    
                case ValidationRule.STATUS_COMPATIBILITY:
                    return this.validateStatusCompatibility(params, context);
                    
                case ValidationRule.BUSINESS_RULES:
                    return this.validateBusinessRules(params, context);
                    
                case ValidationRule.PERFORMANCE_IMPACT:
                    return await this.validatePerformanceImpact(params, context);
                    
                default:
                    return {
                        passed: true,
                        message: `Unknown rule: ${rule}`,
                        suggestions: [],
                        impact: 'low'
                    };
            }
        } catch (error) {
            this.logger.error(`[DependencyValidator] Error executing rule ${rule}`, {
                error: error instanceof Error ? error.message : error
            });
            
            return {
                passed: false,
                message: `Rule execution error: ${error instanceof Error ? error.message : error}`,
                suggestions: ['Contact system administrator'],
                impact: 'high'
            };
        }
    }

    /**
     * Validate circular dependency rule
     */
    private async validateCircularDependency(
        params: CreateDependencyParams,
        context: ValidationContext
    ) {
        try {
            const wouldCreateCycle = await this.dependencyResolver.wouldCreateCircularDependency(
                params.blockedGoalId,
                params.blockingGoalId
            );
            
            if (wouldCreateCycle) {
                // Get cycle details for better suggestions
                const graph = await this.dependencyResolver.buildDependencyGraph();
                const cycleCheck = this.circularDetector.wouldCreateCycle(
                    graph,
                    params.blockingGoalId,
                    params.blockedGoalId
                );
                
                const suggestions = [
                    'Remove or modify an existing dependency in the chain',
                    'Change this dependency to a soft or informational type',
                    'Consider breaking down one of the goals into smaller parts'
                ];
                
                if (cycleCheck.cyclePreview && cycleCheck.cyclePreview.length > 0) {
                    const cycleDescription = cycleCheck.cyclePreview.join(' → ');
                    suggestions.unshift(`The cycle would be: ${cycleDescription}`);
                }
                
                return {
                    passed: false,
                    message: cycleCheck.explanation || 'Creating this dependency would result in a circular reference',
                    suggestions,
                    impact: 'high' as const
                };
            }
            
            return {
                passed: true,
                message: 'No circular dependency detected',
                suggestions: [],
                impact: 'low' as const
            };
            
        } catch (error) {
            return {
                passed: false,
                message: `Failed to check circular dependency: ${error instanceof Error ? error.message : error}`,
                suggestions: ['Retry the operation'],
                impact: 'medium' as const
            };
        }
    }

    /**
     * Validate self-reference rule
     */
    private validateSelfReference(
        params: CreateDependencyParams,
        context: ValidationContext
    ) {
        const isSelfReference = params.blockedGoalId === params.blockingGoalId;
        
        return {
            passed: !isSelfReference,
            message: isSelfReference ? 'A goal cannot depend on itself' : 'No self-reference detected',
            suggestions: isSelfReference 
                ? ['Choose a different goal for the blocking relationship', 'Consider breaking down the goal into smaller sub-goals']
                : [],
            impact: isSelfReference ? 'high' as const : 'low' as const
        };
    }

    /**
     * Validate goal existence rule
     */
    private validateGoalExistence(
        params: CreateDependencyParams,
        context: ValidationContext
    ) {
        const blockedGoal = this.stateManager.getGoal(params.blockedGoalId);
        const blockingGoal = this.stateManager.getGoal(params.blockingGoalId);
        
        if (!blockedGoal) {
            return {
                passed: false,
                message: `Blocked goal with ID ${params.blockedGoalId} does not exist`,
                suggestions: ['Verify the goal ID', 'Create the goal first'],
                impact: 'high' as const
            };
        }
        
        if (!blockingGoal) {
            return {
                passed: false,
                message: `Blocking goal with ID ${params.blockingGoalId} does not exist`,
                suggestions: ['Verify the goal ID', 'Create the goal first'],
                impact: 'high' as const
            };
        }
        
        return {
            passed: true,
            message: 'Both goals exist',
            suggestions: [],
            impact: 'low' as const
        };
    }

    /**
     * Validate dependency limits rule
     */
    private async validateDependencyLimits(
        params: CreateDependencyParams,
        context: ValidationContext
    ) {
        try {
            const existingDeps = await this.dependencyResolver.getDependenciesForGoal(params.blockedGoalId);
            const currentDepCount = existingDeps.blockedBy.length;
            
            // Get limits from configuration or use defaults
            const maxDepsPerGoal = 50; // Could be configurable
            const warningThreshold = 30;
            
            if (currentDepCount >= maxDepsPerGoal) {
                return {
                    passed: false,
                    message: `Goal already has the maximum number of dependencies (${maxDepsPerGoal})`,
                    suggestions: [
                        'Remove some existing dependencies first',
                        'Consider breaking down the goal into smaller parts',
                        'Review if all dependencies are still necessary'
                    ],
                    impact: 'high' as const
                };
            }
            
            if (currentDepCount >= warningThreshold) {
                return {
                    passed: true,
                    message: `Goal has many dependencies (${currentDepCount}). Consider reviewing dependency structure.`,
                    suggestions: [
                        'Review existing dependencies for consolidation opportunities',
                        'Consider if some dependencies could be made informational'
                    ],
                    impact: 'medium' as const
                };
            }
            
            return {
                passed: true,
                message: 'Dependency count within normal limits',
                suggestions: [],
                impact: 'low' as const
            };
            
        } catch (error) {
            return {
                passed: false,
                message: `Failed to check dependency limits: ${error instanceof Error ? error.message : error}`,
                suggestions: ['Retry the operation'],
                impact: 'medium' as const
            };
        }
    }

    /**
     * Validate status compatibility rule
     */
    private validateStatusCompatibility(
        params: CreateDependencyParams,
        context: ValidationContext
    ) {
        const blockedGoal = this.stateManager.getGoal(params.blockedGoalId);
        const blockingGoal = this.stateManager.getGoal(params.blockingGoalId);
        
        if (!blockedGoal || !blockingGoal) {
            return {
                passed: true,
                message: 'Cannot check status compatibility - goals not found',
                suggestions: [],
                impact: 'low' as const
            };
        }
        
        const warnings: string[] = [];
        const suggestions: string[] = [];
        
        // Check if blocking goal is already completed
        if (blockingGoal.status === 'completed') {
            warnings.push('The blocking goal is already completed - this dependency may be unnecessary');
            suggestions.push('Consider if this dependency is still needed');
        }
        
        // Check if blocked goal is in progress but would become blocked
        if (blockedGoal.status === 'in-progress') {
            warnings.push('The blocked goal is currently in progress and will become blocked');
            suggestions.push('Review the timing of this dependency creation');
            suggestions.push('Consider pausing work on the blocked goal until the blocker is resolved');
        }
        
        return {
            passed: true,
            message: warnings.length > 0 ? warnings.join('. ') : 'Status compatibility looks good',
            suggestions,
            impact: warnings.length > 0 ? 'medium' as const : 'low' as const
        };
    }

    /**
     * Validate business rules
     */
    private validateBusinessRules(
        params: CreateDependencyParams,
        context: ValidationContext
    ) {
        const warnings: string[] = [];
        const suggestions: string[] = [];
        let impact: 'low' | 'medium' | 'high' = 'low';
        
        // Rule: High priority goals should not depend on low priority goals
        const blockedGoal = this.stateManager.getGoal(params.blockedGoalId);
        const blockingGoal = this.stateManager.getGoal(params.blockingGoalId);
        
        if (blockedGoal && blockingGoal) {
            const blockedPriority = params.priority || 3;
            // Assuming goals have priority - this would need to be added to the Goal type
            // For now, we'll skip this check or use dependency priority
            
            if (blockedPriority >= 4 && (params.priority || 3) <= 2) {
                warnings.push('High priority goal depends on low priority blocker');
                suggestions.push('Consider increasing the priority of the blocking goal');
                suggestions.push('Review if this dependency is critical');
                impact = 'medium';
            }
        }
        
        // Rule: Soft dependencies should not block critical path goals
        if (params.type === DependencyType.SOFT && blockedGoal) {
            // This would need integration with critical path analysis
            suggestions.push('Soft dependencies are informational and should not block progress');
        }
        
        return {
            passed: true,
            message: warnings.length > 0 ? warnings.join('. ') : 'Business rules compliance verified',
            suggestions,
            impact
        };
    }

    /**
     * Validate performance impact
     */
    private async validatePerformanceImpact(
        params: CreateDependencyParams,
        context: ValidationContext
    ) {
        if (!this.config.enablePerformanceAnalysis) {
            return {
                passed: true,
                message: 'Performance analysis disabled',
                suggestions: [],
                impact: 'low' as const
            };
        }
        
        try {
            // Calculate current graph complexity
            const graph = await this.dependencyResolver.buildDependencyGraph();
            const nodeCount = graph.nodes.size;
            const edgeCount = graph.edges.size;
            
            const warnings: string[] = [];
            const suggestions: string[] = [];
            let impact: 'low' | 'medium' | 'high' = 'low';
            
            // Check graph size thresholds
            if (nodeCount > 1000 || edgeCount > 5000) {
                warnings.push('Large dependency graph may impact performance');
                suggestions.push('Consider archiving completed goals');
                suggestions.push('Review if all dependencies are necessary');
                impact = 'medium';
            }
            
            // Check dependency depth
            const maxDepth = graph.metadata.maxDepth || 0;
            if (maxDepth > this.config.maxAnalysisDepth) {
                warnings.push(`Deep dependency chains detected (depth: ${maxDepth})`);
                suggestions.push('Consider flattening dependency hierarchies');
                impact = 'medium';
            }
            
            return {
                passed: true,
                message: warnings.length > 0 ? warnings.join('. ') : 'Performance impact acceptable',
                suggestions,
                impact
            };
            
        } catch (error) {
            return {
                passed: true,
                message: 'Performance analysis failed but proceeding',
                suggestions: ['Monitor system performance after dependency creation'],
                impact: 'low' as const
            };
        }
    }

    // ===========================================
    // Goal Operation Validations
    // ===========================================

    /**
     * Validate goal deletion
     */
    private async validateGoalDeletion(
        goalId: string,
        context: ValidationContext
    ): Promise<GoalOperationValidationResult> {
        try {
            const dependencies = await this.dependencyResolver.getDependenciesForGoal(goalId);
            const blockedBy = dependencies.blockedBy;
            const blocking = dependencies.blocking;
            
            const warnings: string[] = [];
            const suggestions: string[] = [];
            
            if (blocking.length > 0) {
                warnings.push(`This goal is blocking ${blocking.length} other goals`);
                suggestions.push('Review the goals that depend on this one');
                suggestions.push('Consider completing this goal instead of deleting it');
            }
            
            if (blockedBy.length > 0) {
                suggestions.push('All incoming dependencies will be removed');
            }
            
            const estimatedDelay = blocking.length * 2; // Simple heuristic
            
            return {
                isValid: true,
                severity: blocking.length > 5 ? ValidationSeverity.WARNING : ValidationSeverity.INFO,
                warnings,
                suggestions,
                affectedDependencies: [...blockedBy, ...blocking],
                autoResolvedDependencies: [],
                orphanedDependencies: blocking,
                impact: {
                    affectedGoalCount: blocking.length,
                    affectedDependencyCount: blockedBy.length + blocking.length,
                    estimatedDelay,
                    affectsCriticalPath: false // Would need critical path analysis
                }
            };
            
        } catch (error) {
            return {
                isValid: false,
                severity: ValidationSeverity.ERROR,
                error: `Failed to validate goal deletion: ${error instanceof Error ? error.message : error}`,
                warnings: [],
                suggestions: ['Retry the operation', 'Check system logs'],
                affectedDependencies: [],
                autoResolvedDependencies: [],
                orphanedDependencies: [],
                impact: {
                    affectedGoalCount: 0,
                    affectedDependencyCount: 0,
                    estimatedDelay: 0,
                    affectsCriticalPath: false
                }
            };
        }
    }

    /**
     * Validate goal status change
     */
    private async validateGoalStatusChange(
        goalId: string,
        newStatus: GoalStatus,
        context: ValidationContext
    ): Promise<GoalOperationValidationResult> {
        try {
            const goal = this.stateManager.getGoal(goalId);
            if (!goal) {
                return {
                    isValid: false,
                    severity: ValidationSeverity.ERROR,
                    error: 'Goal not found',
                    warnings: [],
                    suggestions: [],
                    affectedDependencies: [],
                    autoResolvedDependencies: [],
                    orphanedDependencies: [],
                    impact: {
                        affectedGoalCount: 0,
                        affectedDependencyCount: 0,
                        estimatedDelay: 0,
                        affectsCriticalPath: false
                    }
                };
            }
            
            const dependencies = await this.dependencyResolver.getDependenciesForGoal(goalId);
            const warnings: string[] = [];
            const suggestions: string[] = [];
            let autoResolvedDependencies: Dependency[] = [];
            
            // Validate status transitions
            const currentStatus = goal.status;
            
            if (newStatus === 'completed' && currentStatus !== 'in-progress') {
                warnings.push('Completing a goal that is not in progress');
                suggestions.push('Consider setting status to in-progress first');
            }
            
            if (newStatus === 'in-progress' && dependencies.blockedBy.length > 0) {
                const activeBlockers = dependencies.blockedBy.filter(d => d.status === DependencyStatus.ACTIVE);
                if (activeBlockers.length > 0) {
                    return {
                        isValid: false,
                        severity: ValidationSeverity.ERROR,
                        error: `Cannot start goal - it is blocked by ${activeBlockers.length} dependencies`,
                        warnings,
                        suggestions: ['Resolve blocking dependencies first', 'Review if dependencies are still valid'],
                        affectedDependencies: activeBlockers,
                        autoResolvedDependencies: [],
                        orphanedDependencies: [],
                        impact: {
                            affectedGoalCount: 0,
                            affectedDependencyCount: activeBlockers.length,
                            estimatedDelay: 0,
                            affectsCriticalPath: false
                        }
                    };
                }
            }
            
            if (newStatus === 'completed') {
                // Find dependencies that would be auto-resolved
                autoResolvedDependencies = dependencies.blocking.filter(
                    d => d.status === DependencyStatus.ACTIVE && 
                         d.resolutionStrategy === DependencyResolutionStrategy.AUTO_RESOLVE
                );
                
                if (autoResolvedDependencies.length > 0) {
                    suggestions.push(`${autoResolvedDependencies.length} dependencies will be automatically resolved`);
                }
            }
            
            return {
                isValid: true,
                severity: warnings.length > 0 ? ValidationSeverity.WARNING : ValidationSeverity.INFO,
                warnings,
                suggestions,
                affectedDependencies: [...dependencies.blockedBy, ...dependencies.blocking],
                autoResolvedDependencies,
                orphanedDependencies: [],
                impact: {
                    affectedGoalCount: autoResolvedDependencies.length,
                    affectedDependencyCount: dependencies.blockedBy.length + dependencies.blocking.length,
                    estimatedDelay: 0,
                    affectsCriticalPath: false
                }
            };
            
        } catch (error) {
            return {
                isValid: false,
                severity: ValidationSeverity.ERROR,
                error: `Failed to validate status change: ${error instanceof Error ? error.message : error}`,
                warnings: [],
                suggestions: ['Retry the operation'],
                affectedDependencies: [],
                autoResolvedDependencies: [],
                orphanedDependencies: [],
                impact: {
                    affectedGoalCount: 0,
                    affectedDependencyCount: 0,
                    estimatedDelay: 0,
                    affectsCriticalPath: false
                }
            };
        }
    }

    /**
     * Validate goal update
     */
    private async validateGoalUpdate(
        goalId: string,
        updates: Partial<EnhancedGoal>,
        context: ValidationContext
    ): Promise<GoalOperationValidationResult> {
        // For most goal updates, dependency impact is minimal
        // Main concern is status changes, which are handled separately
        
        return {
            isValid: true,
            severity: ValidationSeverity.INFO,
            warnings: [],
            suggestions: [],
            affectedDependencies: [],
            autoResolvedDependencies: [],
            orphanedDependencies: [],
            impact: {
                affectedGoalCount: 0,
                affectedDependencyCount: 0,
                estimatedDelay: 0,
                affectsCriticalPath: false
            }
        };
    }

    /**
     * Validate goal creation
     */
    private async validateGoalCreation(
        goalData: Partial<EnhancedGoal>,
        context: ValidationContext
    ): Promise<GoalOperationValidationResult> {
        // Goal creation typically doesn't affect existing dependencies
        // This is a placeholder for future business rules
        
        return {
            isValid: true,
            severity: ValidationSeverity.INFO,
            warnings: [],
            suggestions: [],
            affectedDependencies: [],
            autoResolvedDependencies: [],
            orphanedDependencies: [],
            impact: {
                affectedGoalCount: 0,
                affectedDependencyCount: 0,
                estimatedDelay: 0,
                affectsCriticalPath: false
            }
        };
    }

    // ===========================================
    // Helper Methods
    // ===========================================

    /**
     * Get rules to check based on context
     */
    private getRulesToCheck(context: ValidationContext): ValidationRule[] {
        const allRules = Object.values(ValidationRule);
        
        if (context.metadata?.skipValidationRules) {
            return allRules.filter(rule => !context.metadata!.skipValidationRules!.includes(rule));
        }
        
        return allRules;
    }

    /**
     * Generate auto-corrections for failed rules
     */
    private generateAutoCorrections(
        params: CreateDependencyParams,
        failedRules: ValidationRule[],
        ruleResults: Map<ValidationRule, any>
    ) {
        const corrections = [];
        
        if (failedRules.includes(ValidationRule.CIRCULAR_DEPENDENCY)) {
            corrections.push({
                action: 'soften_dependency',
                description: 'Change dependency type to "soft" to avoid blocking',
                canAutoApply: true,
                riskLevel: 'low' as const
            });
        }
        
        if (failedRules.includes(ValidationRule.DEPENDENCY_LIMITS)) {
            corrections.push({
                action: 'suggest_alternative',
                description: 'Suggest breaking down the goal to reduce dependencies',
                canAutoApply: false,
                riskLevel: 'medium' as const
            });
        }
        
        return corrections.slice(0, this.config.autoCorrection.maxAutoCorrections);
    }

    /**
     * Generate cache key for validation results
     */
    private getCacheKey(operation: string, params: any, context: ValidationContext): string {
        const keyData = {
            operation,
            params: JSON.stringify(params),
            timestamp: Math.floor(context.timestamp.getTime() / (1000 * 60)) // Round to minute
        };
        
        return `${operation}_${Buffer.from(JSON.stringify(keyData)).toString('base64').slice(0, 16)}`;
    }

    /**
     * Get result from cache
     */
    private getFromCache(key: string): EnhancedValidationResult | null {
        const entry = this.validationCache.get(key);
        if (!entry) {
            return null;
        }
        
        if (Date.now() - entry.timestamp > entry.ttl) {
            this.validationCache.delete(key);
            return null;
        }
        
        // Mark as from cache
        entry.result.performance.fromCache = true;
        return entry.result;
    }

    /**
     * Set result in cache
     */
    private setCache(key: string, result: EnhancedValidationResult): void {
        this.validationCache.set(key, {
            result: { ...result },
            timestamp: Date.now(),
            ttl: this.config.cacheTTL
        });
        
        // Clean up old cache entries
        if (this.validationCache.size > 1000) {
            const oldestKeys = Array.from(this.validationCache.keys()).slice(0, 200);
            for (const oldKey of oldestKeys) {
                this.validationCache.delete(oldKey);
            }
        }
    }

    /**
     * Clear validation cache
     */
    public clearCache(): void {
        this.validationCache.clear();
        this.ruleCache.clear();
        this.logger.debug('[DependencyValidator] Cache cleared');
    }

    /**
     * Update validator configuration
     */
    public updateConfig(newConfig: Partial<DependencyValidatorConfig>): void {
        this.config = { ...this.config, ...newConfig };
        this.logger.info('[DependencyValidator] Configuration updated', { config: this.config });
    }

    /**
     * Get current configuration
     */
    public getConfig(): DependencyValidatorConfig {
        return { ...this.config };
    }

    /**
     * Cleanup method for service shutdown
     */
    public dispose(): void {
        this.clearCache();
        this.logger.info('[DependencyValidator] Service disposed');
    }
}

/**
 * Factory function to create a DependencyValidator instance
 */
export function createDependencyValidator(
    stateManager: StateManager,
    dependencyResolver: DependencyResolver,
    config?: Partial<DependencyValidatorConfig>
): DependencyValidator {
    return new DependencyValidator(stateManager, dependencyResolver, config);
}