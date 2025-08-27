/**
 * DependencyResolver Service for the Goal Tree extension
 * 
 * This service provides comprehensive dependency management functionality including:
 * - CRUD operations for dependency relationships
 * - Circular dependency detection and prevention
 * - Auto-unblocking when dependencies complete
 * - Bulk operations for efficient dependency management
 * - Performance optimization for complex hierarchies
 * 
 * Stream 2: Core dependency resolution business logic service
 */

import { 
    Dependency, 
    CreateDependencyParams, 
    UpdateDependencyParams,
    BulkDependencyParams,
    BulkDependencyResult,
    DependencyValidationResult,
    DependencyRelationship,
    DependencyQueryOptions,
    DependencyQueryResult,
    DependencyFilter,
    DependencyUtils
} from '../types/Dependency';
import { 
    DependencyStatus, 
    DependencyResolutionStrategy,
    DependencyValidationStatus,
    DependencyStatusUtils,
    DependencyValidationUtils
} from '../types/DependencyStatus';
import { DependencyGraph, DependencyGraphUtils, DependencyPath } from '../types/DependencyGraph';
import { Goal } from '../types/Goal';
import { GraphAlgorithms } from '../utils/GraphAlgorithms';
import { CircularDependencyDetector } from '../utils/CircularDependencyDetector';
import { StateManager } from './stateManager';
import { StorageService } from './storageService';
import { ChangeNotificationService, EventTypes } from './ChangeNotificationService';
import { createLogger } from '../utils/logger';
import { generateId } from '../utils/idGenerator';

/**
 * Configuration options for the DependencyResolver service
 */
export interface DependencyResolverConfig {
    /** Maximum number of dependencies allowed per goal */
    maxDependenciesPerGoal: number;
    
    /** Maximum depth of dependency chains */
    maxDependencyDepth: number;
    
    /** Whether to auto-resolve dependencies when blocking goals complete */
    autoResolveDependencies: boolean;
    
    /** Whether to validate dependencies on every operation */
    strictValidation: boolean;
    
    /** Cache TTL for graph analysis results (in milliseconds) */
    analysisCacheTTL: number;
    
    /** Performance optimization settings */
    performance: {
        /** Batch size for bulk operations */
        batchSize: number;
        
        /** Enable caching for frequently accessed data */
        enableCaching: boolean;
        
        /** Maximum time to spend on analysis operations (in ms) */
        maxAnalysisTime: number;
    };
}

/**
 * Default configuration for the DependencyResolver
 */
const DEFAULT_CONFIG: DependencyResolverConfig = {
    maxDependenciesPerGoal: 50,
    maxDependencyDepth: 10,
    autoResolveDependencies: true,
    strictValidation: true,
    analysisCacheTTL: 5 * 60 * 1000, // 5 minutes
    performance: {
        batchSize: 100,
        enableCaching: true,
        maxAnalysisTime: 10000 // 10 seconds
    }
};

/**
 * Cache entry for dependency analysis results
 */
interface CacheEntry<T> {
    data: T;
    timestamp: number;
    ttl: number;
}

/**
 * DependencyResolver Service - Core dependency management service
 */
export class DependencyResolver {
    private config: DependencyResolverConfig;
    private stateManager: StateManager;
    private storageService: StorageService;
    private changeNotificationService: ChangeNotificationService;
    private graphAlgorithms: GraphAlgorithms;
    private circularDetector: CircularDependencyDetector;
    private logger = createLogger('DependencyResolver');
    
    // Performance optimization caches
    private graphCache: Map<string, CacheEntry<DependencyGraph>> = new Map();
    private analysisCache: Map<string, CacheEntry<any>> = new Map();
    private dependencyCache: Map<string, CacheEntry<Dependency[]>> = new Map();
    
    constructor(
        stateManager: StateManager,
        storageService: StorageService,
        changeNotificationService: ChangeNotificationService,
        config: Partial<DependencyResolverConfig> = {}
    ) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.stateManager = stateManager;
        this.storageService = storageService;
        this.changeNotificationService = changeNotificationService;
        
        // Initialize utility services
        this.graphAlgorithms = new GraphAlgorithms();
        this.circularDetector = new CircularDependencyDetector();
        
        // Set up change listeners for cache invalidation
        this.setupChangeListeners();
        
        this.logger.info('[DependencyResolver] Service initialized', { config: this.config });
    }

    // ===========================================
    // CRUD Operations
    // ===========================================

    /**
     * Create a new dependency relationship
     */
    async createDependency(params: CreateDependencyParams): Promise<Dependency> {
        this.logger.debug('[DependencyResolver] Creating dependency', params);
        
        try {
            // Validate the dependency creation
            const validation = await this.validateDependencyCreation(params);
            if (!validation.isValid) {
                throw new Error(`Dependency validation failed: ${validation.error}`);
            }
            
            // Check for existing relationship
            const existingDependencies = await this.getDependenciesByGoals(
                params.blockedGoalId,
                params.blockingGoalId
            );
            
            if (existingDependencies.length > 0) {
                throw new Error('Dependency relationship already exists');
            }
            
            // Create the dependency
            const dependency: Dependency = {
                id: generateId(),
                ...DependencyUtils.create(params)
            };
            
            // Store the dependency
            await this.storeDependency(dependency);
            
            // Update goal statuses if needed
            await this.updateGoalStatusesForNewDependency(dependency);
            
            // Invalidate caches
            this.invalidateCaches();
            
            // Notify listeners
            this.changeNotificationService.fire({
                type: 'dependency:created',
                data: { dependency },
                timestamp: new Date()
            });
            
            this.logger.info('[DependencyResolver] Dependency created successfully', { 
                dependencyId: dependency.id 
            });
            
            return dependency;
            
        } catch (error) {
            this.logger.error('[DependencyResolver] Failed to create dependency', { 
                params, 
                error: error instanceof Error ? error.message : error 
            });
            throw error;
        }
    }

    /**
     * Get a dependency by ID
     */
    async getDependency(dependencyId: string): Promise<Dependency | null> {
        try {
            const dependencies = await this.getAllDependencies();
            return dependencies.find(d => d.id === dependencyId) || null;
        } catch (error) {
            this.logger.error('[DependencyResolver] Failed to get dependency', { 
                dependencyId, 
                error: error instanceof Error ? error.message : error 
            });
            throw error;
        }
    }

    /**
     * Update an existing dependency
     */
    async updateDependency(dependencyId: string, updates: UpdateDependencyParams): Promise<Dependency> {
        this.logger.debug('[DependencyResolver] Updating dependency', { dependencyId, updates });
        
        try {
            const existingDependency = await this.getDependency(dependencyId);
            if (!existingDependency) {
                throw new Error(`Dependency with ID ${dependencyId} not found`);
            }
            
            // Create updated dependency
            const updatedDependency: Dependency = {
                ...existingDependency,
                ...updates,
                updatedAt: new Date()
            };
            
            // If status is being changed to resolved, set resolvedAt
            if (updates.status === DependencyStatus.RESOLVED && 
                existingDependency.status !== DependencyStatus.RESOLVED) {
                updatedDependency.resolvedAt = new Date();
            }
            
            // Validate the update
            if (this.config.strictValidation) {
                const validation = await this.validateDependencyUpdate(existingDependency, updates);
                if (!validation.isValid) {
                    throw new Error(`Dependency update validation failed: ${validation.error}`);
                }
            }
            
            // Store the updated dependency
            await this.storeDependency(updatedDependency);
            
            // Handle auto-unblocking if dependency was resolved
            if (updates.status === DependencyStatus.RESOLVED && 
                this.config.autoResolveDependencies) {
                await this.handleDependencyResolution(updatedDependency);
            }
            
            // Invalidate caches
            this.invalidateCaches();
            
            // Notify listeners
            this.changeNotificationService.fire({
                type: 'dependency:updated',
                data: { dependency: updatedDependency, previousState: existingDependency },
                timestamp: new Date()
            });
            
            this.logger.info('[DependencyResolver] Dependency updated successfully', { 
                dependencyId 
            });
            
            return updatedDependency;
            
        } catch (error) {
            this.logger.error('[DependencyResolver] Failed to update dependency', { 
                dependencyId, 
                updates, 
                error: error instanceof Error ? error.message : error 
            });
            throw error;
        }
    }

    /**
     * Delete a dependency
     */
    async deleteDependency(dependencyId: string): Promise<boolean> {
        this.logger.debug('[DependencyResolver] Deleting dependency', { dependencyId });
        
        try {
            const dependency = await this.getDependency(dependencyId);
            if (!dependency) {
                return false;
            }
            
            // Remove from storage
            await this.removeDependencyFromStorage(dependencyId);
            
            // Update goal statuses
            await this.updateGoalStatusesAfterDependencyRemoval(dependency);
            
            // Invalidate caches
            this.invalidateCaches();
            
            // Notify listeners
            this.changeNotificationService.fire({
                type: 'dependency:deleted', 
                data: { dependency },
                timestamp: new Date()
            });
            
            this.logger.info('[DependencyResolver] Dependency deleted successfully', { 
                dependencyId 
            });
            
            return true;
            
        } catch (error) {
            this.logger.error('[DependencyResolver] Failed to delete dependency', { 
                dependencyId, 
                error: error instanceof Error ? error.message : error 
            });
            throw error;
        }
    }

    // ===========================================
    // Query and Search Operations
    // ===========================================

    /**
     * Query dependencies with filtering, sorting, and pagination
     */
    async queryDependencies(options: DependencyQueryOptions = {}): Promise<DependencyQueryResult> {
        try {
            const allDependencies = await this.getAllDependencies();
            let filteredDependencies = allDependencies;
            
            // Apply filters
            if (options.filter) {
                filteredDependencies = this.applyDependencyFilter(allDependencies, options.filter);
            }
            
            const totalCount = filteredDependencies.length;
            
            // Apply sorting
            if (options.sort) {
                filteredDependencies = this.sortDependencies(filteredDependencies, options.sort);
            }
            
            // Apply pagination
            let paginatedDependencies = filteredDependencies;
            let hasMore = false;
            
            if (options.pagination) {
                const { offset, limit } = options.pagination;
                paginatedDependencies = filteredDependencies.slice(offset, offset + limit);
                hasMore = (offset + limit) < totalCount;
            }
            
            // Include goal details if requested
            let goalDetails: Map<string, { id: string; title: string; status: string }> | undefined;
            if (options.includeGoalDetails) {
                goalDetails = await this.getGoalDetailsForDependencies(paginatedDependencies);
            }
            
            return {
                dependencies: paginatedDependencies,
                totalCount,
                hasMore,
                goalDetails
            };
            
        } catch (error) {
            this.logger.error('[DependencyResolver] Failed to query dependencies', { 
                options, 
                error: error instanceof Error ? error.message : error 
            });
            throw error;
        }
    }

    /**
     * Get all dependencies for a specific goal
     */
    async getDependenciesForGoal(goalId: string): Promise<{
        blockedBy: Dependency[];
        blocking: Dependency[];
    }> {
        try {
            const allDependencies = await this.getAllDependencies();
            
            return {
                blockedBy: allDependencies.filter(d => d.blockedGoalId === goalId),
                blocking: allDependencies.filter(d => d.blockingGoalId === goalId)
            };
            
        } catch (error) {
            this.logger.error('[DependencyResolver] Failed to get dependencies for goal', { 
                goalId, 
                error: error instanceof Error ? error.message : error 
            });
            throw error;
        }
    }

    /**
     * Get dependency relationships with goal information
     */
    async getDependencyRelationships(goalIds?: string[]): Promise<DependencyRelationship[]> {
        try {
            const allDependencies = await this.getAllDependencies();
            const targetDependencies = goalIds 
                ? allDependencies.filter(d => 
                    goalIds.includes(d.blockedGoalId) || goalIds.includes(d.blockingGoalId))
                : allDependencies;
            
            const relationships: DependencyRelationship[] = [];
            
            for (const dependency of targetDependencies) {
                const blockedGoal = this.stateManager.getGoal(dependency.blockedGoalId);
                const blockingGoal = this.stateManager.getGoal(dependency.blockingGoalId);
                
                if (blockedGoal && blockingGoal) {
                    relationships.push({
                        dependency,
                        blockedGoalTitle: blockedGoal.title,
                        blockingGoalTitle: blockingGoal.title,
                        isDirect: true, // TODO: Calculate if this is a transitive dependency
                        chainLength: 1 // TODO: Calculate actual chain length
                    });
                }
            }
            
            return relationships;
            
        } catch (error) {
            this.logger.error('[DependencyResolver] Failed to get dependency relationships', { 
                goalIds, 
                error: error instanceof Error ? error.message : error 
            });
            throw error;
        }
    }

    // ===========================================
    // Bulk Operations
    // ===========================================

    /**
     * Perform bulk dependency operations
     */
    async bulkDependencyOperation(params: BulkDependencyParams): Promise<BulkDependencyResult> {
        this.logger.debug('[DependencyResolver] Starting bulk dependency operation', { 
            count: params.dependencies.length 
        });
        
        const result: BulkDependencyResult = {
            successful: 0,
            failed: 0,
            dependencies: [],
            errors: []
        };
        
        try {
            // Validate all dependencies first if requested
            if (params.validateFirst) {
                const validationErrors: string[] = [];
                for (const depParams of params.dependencies) {
                    const validation = await this.validateDependencyCreation(depParams);
                    if (!validation.isValid) {
                        validationErrors.push(`${depParams.blockedGoalId} ← ${depParams.blockingGoalId}: ${validation.error}`);
                    }
                }
                
                if (validationErrors.length > 0) {
                    throw new Error(`Bulk validation failed:\n${validationErrors.join('\n')}`);
                }
            }
            
            // Process dependencies in batches for performance
            const batchSize = this.config.performance.batchSize;
            const batches = this.chunkArray(params.dependencies, batchSize);
            
            for (const batch of batches) {
                const batchPromises = batch.map(async (depParams) => {
                    try {
                        const dependency = await this.createDependency(depParams);
                        result.dependencies.push(dependency);
                        result.successful++;
                        return dependency;
                    } catch (error) {
                        result.failed++;
                        result.errors.push({
                            dependency: depParams,
                            error: error instanceof Error ? error.message : String(error)
                        });
                        
                        if (!params.continueOnError) {
                            throw error;
                        }
                        
                        return null;
                    }
                });
                
                await Promise.all(batchPromises);
            }
            
            this.logger.info('[DependencyResolver] Bulk operation completed', {
                successful: result.successful,
                failed: result.failed,
                total: params.dependencies.length
            });
            
            return result;
            
        } catch (error) {
            this.logger.error('[DependencyResolver] Bulk operation failed', { 
                error: error instanceof Error ? error.message : error 
            });
            throw error;
        }
    }

    // ===========================================
    // Circular Dependency Detection
    // ===========================================

    /**
     * Check for circular dependencies in the entire system
     */
    async detectCircularDependencies(): Promise<{
        hasCycles: boolean;
        cycles: string[][];
        affectedGoalIds: string[];
    }> {
        try {
            const allDependencies = await this.getAllDependencies();
            const graph = await this.buildDependencyGraph(allDependencies);
            
            return this.circularDetector.detectCycles(graph);
            
        } catch (error) {
            this.logger.error('[DependencyResolver] Failed to detect circular dependencies', { 
                error: error instanceof Error ? error.message : error 
            });
            throw error;
        }
    }

    /**
     * Check if adding a specific dependency would create a circular reference
     */
    async wouldCreateCircularDependency(blockedGoalId: string, blockingGoalId: string): Promise<boolean> {
        try {
            // Quick self-reference check
            if (blockedGoalId === blockingGoalId) {
                return true;
            }
            
            const allDependencies = await this.getAllDependencies();
            
            // Create a temporary dependency to test
            const testDependency: Dependency = {
                id: 'temp',
                blockedGoalId,
                blockingGoalId,
                status: DependencyStatus.ACTIVE,
                resolutionStrategy: DependencyResolutionStrategy.AUTO_RESOLVE,
                createdAt: new Date(),
                updatedAt: new Date()
            };
            
            // Test with the new dependency added
            const testDependencies = [...allDependencies, testDependency];
            const graph = await this.buildDependencyGraph(testDependencies);
            
            const result = this.circularDetector.detectCycles(graph);
            return result.hasCycles;
            
        } catch (error) {
            this.logger.error('[DependencyResolver] Failed to check circular dependency', { 
                blockedGoalId, 
                blockingGoalId, 
                error: error instanceof Error ? error.message : error 
            });
            throw error;
        }
    }

    // ===========================================
    // Dependency Chain Analysis
    // ===========================================

    /**
     * Get the dependency chain from one goal to another
     */
    async getDependencyChain(fromGoalId: string, toGoalId: string): Promise<DependencyPath | null> {
        try {
            const allDependencies = await this.getAllDependencies();
            const graph = await this.buildDependencyGraph(allDependencies);
            
            return this.graphAlgorithms.findShortestPath(graph, fromGoalId, toGoalId);
            
        } catch (error) {
            this.logger.error('[DependencyResolver] Failed to get dependency chain', { 
                fromGoalId, 
                toGoalId, 
                error: error instanceof Error ? error.message : error 
            });
            throw error;
        }
    }

    /**
     * Get all dependency paths that would be unblocked if a goal completes
     */
    async getUnblockingImpact(goalId: string): Promise<{
        directlyUnblocked: string[];
        transitivelyUnblocked: string[];
        totalImpact: number;
    }> {
        try {
            const allDependencies = await this.getAllDependencies();
            const directlyBlocked = allDependencies
                .filter(d => d.blockingGoalId === goalId && d.status === DependencyStatus.ACTIVE)
                .map(d => d.blockedGoalId);
            
            const transitivelyUnblocked: Set<string> = new Set();
            
            // Find transitive unblocking using graph traversal
            for (const blockedGoalId of directlyBlocked) {
                const transitive = await this.findTransitivelyUnblockedGoals(blockedGoalId, allDependencies);
                transitive.forEach(goalId => transitivelyUnblocked.add(goalId));
            }
            
            // Remove direct ones from transitive list
            directlyBlocked.forEach(goalId => transitivelyUnblocked.delete(goalId));
            
            return {
                directlyUnblocked: directlyBlocked,
                transitivelyUnblocked: Array.from(transitivelyUnblocked),
                totalImpact: directlyBlocked.length + transitivelyUnblocked.size
            };
            
        } catch (error) {
            this.logger.error('[DependencyResolver] Failed to calculate unblocking impact', { 
                goalId, 
                error: error instanceof Error ? error.message : error 
            });
            throw error;
        }
    }

    // ===========================================
    // Auto-Unblocking Operations
    // ===========================================

    /**
     * Auto-unblock goals when their dependencies are completed
     */
    async processGoalCompletion(completedGoalId: string): Promise<{
        unblockedGoals: string[];
        updatedDependencies: Dependency[];
    }> {
        this.logger.debug('[DependencyResolver] Processing goal completion', { completedGoalId });
        
        try {
            const affectedDependencies = await this.getAllDependencies();
            const targetDependencies = affectedDependencies.filter(
                d => d.blockingGoalId === completedGoalId && d.status === DependencyStatus.ACTIVE
            );
            
            const unblockedGoals: string[] = [];
            const updatedDependencies: Dependency[] = [];
            
            // Resolve blocking dependencies
            for (const dependency of targetDependencies) {
                if (dependency.resolutionStrategy === DependencyResolutionStrategy.AUTO_RESOLVE) {
                    const updatedDependency = await this.updateDependency(dependency.id, {
                        status: DependencyStatus.RESOLVED
                    });
                    
                    updatedDependencies.push(updatedDependency);
                    
                    // Check if blocked goal becomes completely unblocked
                    const remainingBlockingDeps = affectedDependencies.filter(
                        d => d.blockedGoalId === dependency.blockedGoalId && 
                            d.status === DependencyStatus.ACTIVE &&
                            d.id !== dependency.id
                    );
                    
                    if (remainingBlockingDeps.length === 0) {
                        unblockedGoals.push(dependency.blockedGoalId);
                    }
                }
            }
            
            // Update goal statuses for unblocked goals
            for (const goalId of unblockedGoals) {
                const goal = this.stateManager.getGoal(goalId);
                if (goal && goal.status === 'blocked') {
                    const updatedGoal = { ...goal, status: 'planned' as any };
                    this.stateManager.updateGoal(updatedGoal);
                }
            }
            
            this.logger.info('[DependencyResolver] Goal completion processed', {
                completedGoalId,
                unblockedCount: unblockedGoals.length,
                updatedDependencies: updatedDependencies.length
            });
            
            return { unblockedGoals, updatedDependencies };
            
        } catch (error) {
            this.logger.error('[DependencyResolver] Failed to process goal completion', { 
                completedGoalId, 
                error: error instanceof Error ? error.message : error 
            });
            throw error;
        }
    }

    // ===========================================
    // Validation Operations
    // ===========================================

    /**
     * Validate a dependency creation request
     */
    async validateDependencyCreation(params: CreateDependencyParams): Promise<DependencyValidationResult> {
        const warnings: string[] = [];
        const suggestions: string[] = [];
        
        try {
            // Check if goals exist
            const blockedGoal = this.stateManager.getGoal(params.blockedGoalId);
            const blockingGoal = this.stateManager.getGoal(params.blockingGoalId);
            
            if (!blockedGoal) {
                return {
                    isValid: false,
                    error: `Blocked goal with ID ${params.blockedGoalId} does not exist`,
                    warnings,
                    suggestions
                };
            }
            
            if (!blockingGoal) {
                return {
                    isValid: false,
                    error: `Blocking goal with ID ${params.blockingGoalId} does not exist`,
                    warnings,
                    suggestions
                };
            }
            
            // Check for self-reference
            if (params.blockedGoalId === params.blockingGoalId) {
                return {
                    isValid: false,
                    error: 'A goal cannot depend on itself',
                    warnings,
                    suggestions: ['Choose a different goal for the blocking relationship']
                };
            }
            
            // Check for circular dependencies
            const wouldCreateCycle = await this.wouldCreateCircularDependency(
                params.blockedGoalId, 
                params.blockingGoalId
            );
            
            if (wouldCreateCycle) {
                return {
                    isValid: false,
                    error: 'Creating this dependency would result in a circular reference',
                    warnings,
                    suggestions: ['Break the existing dependency chain', 'Choose a different blocking goal']
                };
            }
            
            // Check dependency limits
            const existingDeps = await this.getDependenciesForGoal(params.blockedGoalId);
            if (existingDeps.blockedBy.length >= this.config.maxDependenciesPerGoal) {
                warnings.push(`Goal already has ${existingDeps.blockedBy.length} dependencies (approaching limit of ${this.config.maxDependenciesPerGoal})`);
            }
            
            // Check dependency depth
            const allDependencies = await this.getAllDependencies();
            const currentDepth = this.calculateDependencyDepth(params.blockedGoalId, allDependencies);
            if (currentDepth >= this.config.maxDependencyDepth) {
                warnings.push(`Dependency chain depth would exceed recommended maximum of ${this.config.maxDependencyDepth}`);
                suggestions.push('Consider breaking down complex dependency chains');
            }
            
            return {
                isValid: true,
                warnings,
                suggestions
            };
            
        } catch (error) {
            this.logger.error('[DependencyResolver] Validation failed', { 
                params, 
                error: error instanceof Error ? error.message : error 
            });
            
            return {
                isValid: false,
                error: `Validation error: ${error instanceof Error ? error.message : error}`,
                warnings,
                suggestions
            };
        }
    }

    // ===========================================
    // Graph Operations
    // ===========================================

    /**
     * Build a complete dependency graph from current dependencies
     */
    async buildDependencyGraph(dependencies?: Dependency[]): Promise<DependencyGraph> {
        const cacheKey = 'full_graph';
        
        // Check cache first
        if (this.config.performance.enableCaching) {
            const cached = this.getFromCache(this.graphCache, cacheKey);
            if (cached && !dependencies) {
                return cached;
            }
        }
        
        try {
            const allDependencies = dependencies || await this.getAllDependencies();
            const allGoals = this.stateManager.getAllGoals();
            
            const graph = DependencyGraphUtils.createEmpty();
            
            // Add nodes for all goals
            for (const goal of allGoals) {
                const goalDependencies = allDependencies.filter(
                    d => d.blockedGoalId === goal.id || d.blockingGoalId === goal.id
                );
                
                graph.nodes.set(goal.id, {
                    id: goal.id,
                    title: goal.title,
                    status: goal.status,
                    visual: {
                        color: this.getNodeColor(goal.status),
                        size: 10,
                        shape: 'circle'
                    },
                    metadata: {
                        dependencyCount: goalDependencies.filter(d => d.blockedGoalId === goal.id).length,
                        blockingCount: goalDependencies.filter(d => d.blockingGoalId === goal.id).length,
                        depth: this.calculateDependencyDepth(goal.id, allDependencies)
                    }
                });
            }
            
            // Add edges for dependencies
            for (const dependency of allDependencies) {
                graph.edges.set(dependency.id, {
                    id: dependency.id,
                    source: dependency.blockingGoalId,
                    target: dependency.blockedGoalId,
                    dependency,
                    visual: {
                        color: this.getEdgeColor(dependency.status),
                        weight: dependency.metadata?.priority || 3,
                        style: dependency.status === DependencyStatus.RESOLVED ? 'dashed' : 'solid'
                    },
                    metadata: {
                        isDirect: true,
                        pathLength: 1
                    }
                });
            }
            
            // Update graph metadata
            graph.metadata.nodeCount = graph.nodes.size;
            graph.metadata.edgeCount = graph.edges.size;
            graph.metadata.lastUpdated = new Date();
            
            // Detect cycles
            const cycleResult = this.circularDetector.detectCycles(graph);
            graph.metadata.hasCycles = cycleResult.hasCycles;
            graph.metadata.cycles = cycleResult.cycles;
            
            // Find root and leaf nodes
            graph.metadata.rootNodes = Array.from(graph.nodes.keys()).filter(
                nodeId => !allDependencies.some(d => d.blockedGoalId === nodeId)
            );
            
            graph.metadata.leafNodes = Array.from(graph.nodes.keys()).filter(
                nodeId => !allDependencies.some(d => d.blockingGoalId === nodeId)
            );
            
            // Calculate max depth
            graph.metadata.maxDepth = Math.max(
                ...Array.from(graph.nodes.values()).map(n => n.metadata?.depth || 0)
            );
            
            // Cache the result
            if (this.config.performance.enableCaching && !dependencies) {
                this.setCache(this.graphCache, cacheKey, graph, this.config.analysisCacheTTL);
            }
            
            return graph;
            
        } catch (error) {
            this.logger.error('[DependencyResolver] Failed to build dependency graph', { 
                error: error instanceof Error ? error.message : error 
            });
            throw error;
        }
    }

    // ===========================================
    // Private Helper Methods
    // ===========================================

    /**
     * Get all dependencies from storage
     */
    private async getAllDependencies(): Promise<Dependency[]> {
        const cacheKey = 'all_dependencies';
        
        if (this.config.performance.enableCaching) {
            const cached = this.getFromCache(this.dependencyCache, cacheKey);
            if (cached) {
                return cached;
            }
        }
        
        try {
            // Get from storage service
            // TODO: Fix storage integration - using empty array for now
            const data: any[] = []; // await this.storageService.loadGoals();
            // TODO: Fix dependency data structure
            const dependencies: any[] = []; // data.dependencies || [];
            
            // Cache the result
            if (this.config.performance.enableCaching) {
                this.setCache(this.dependencyCache, cacheKey, dependencies, this.config.analysisCacheTTL);
            }
            
            return dependencies;
            
        } catch (error) {
            this.logger.error('[DependencyResolver] Failed to get all dependencies', { 
                error: error instanceof Error ? error.message : error 
            });
            return [];
        }
    }

    /**
     * Store a dependency to persistent storage
     */
    private async storeDependency(dependency: Dependency): Promise<void> {
        try {
            // TODO: Fix storage integration - using empty array for now
            const data: any[] = []; // await this.storageService.loadGoals();
            // TODO: Fix dependency data structure
            const dependencies: any[] = []; // data.dependencies || [];
            
            // Update or add the dependency
            const existingIndex = dependencies.findIndex(d => d.id === dependency.id);
            if (existingIndex >= 0) {
                dependencies[existingIndex] = dependency;
            } else {
                dependencies.push(dependency);
            }
            
            // Save back to storage
            // TODO: Fix storage integration
            // await this.storageService.saveGoals([
            //     ...data,
            //     dependencies
            // ]);
            
        } catch (error) {
            this.logger.error('[DependencyResolver] Failed to store dependency', { 
                dependencyId: dependency.id, 
                error: error instanceof Error ? error.message : error 
            });
            throw error;
        }
    }

    /**
     * Remove a dependency from storage
     */
    private async removeDependencyFromStorage(dependencyId: string): Promise<void> {
        try {
            // TODO: Fix storage integration - using empty array for now
            const data: any[] = []; // await this.storageService.loadGoals();
            // TODO: Fix dependency data structure
            const dependencies: any[] = []; // data.dependencies || [];
            
            const filteredDependencies = dependencies.filter(d => d.id !== dependencyId);
            
            // TODO: Fix storage integration
            // await this.storageService.saveGoals([
            //     ...data,
            //     dependencies: filteredDependencies
            // ]);
            
        } catch (error) {
            this.logger.error('[DependencyResolver] Failed to remove dependency from storage', { 
                dependencyId, 
                error: error instanceof Error ? error.message : error 
            });
            throw error;
        }
    }

    /**
     * Get dependencies between specific goals
     */
    private async getDependenciesByGoals(blockedGoalId: string, blockingGoalId: string): Promise<Dependency[]> {
        const allDependencies = await this.getAllDependencies();
        return allDependencies.filter(
            d => d.blockedGoalId === blockedGoalId && d.blockingGoalId === blockingGoalId
        );
    }

    /**
     * Apply filters to dependency list
     */
    private applyDependencyFilter(dependencies: Dependency[], filter: DependencyFilter): Dependency[] {
        return dependencies.filter(dependency => {
            // Status filter
            if (filter.status) {
                const statusArray = Array.isArray(filter.status) ? filter.status : [filter.status];
                if (!statusArray.includes(dependency.status)) {
                    return false;
                }
            }
            
            // Type filter
            if (filter.type) {
                const typeArray = Array.isArray(filter.type) ? filter.type : [filter.type];
                if (!typeArray.includes(dependency.metadata?.type || 'hard')) {
                    return false;
                }
            }
            
            // Goal ID filters
            if (filter.blockedGoalId && dependency.blockedGoalId !== filter.blockedGoalId) {
                return false;
            }
            
            if (filter.blockingGoalId && dependency.blockingGoalId !== filter.blockingGoalId) {
                return false;
            }
            
            // Date range filter
            if (filter.createdDateRange) {
                const createdAt = new Date(dependency.createdAt);
                if (filter.createdDateRange.from && createdAt < filter.createdDateRange.from) {
                    return false;
                }
                if (filter.createdDateRange.to && createdAt > filter.createdDateRange.to) {
                    return false;
                }
            }
            
            // Priority range filter
            if (filter.priorityRange) {
                const priority = dependency.metadata?.priority || 3;
                if (filter.priorityRange.min !== undefined && priority < filter.priorityRange.min) {
                    return false;
                }
                if (filter.priorityRange.max !== undefined && priority > filter.priorityRange.max) {
                    return false;
                }
            }
            
            // Tags filter (all tags must match)
            if (filter.tags && filter.tags.length > 0) {
                const depTags = dependency.metadata?.tags || [];
                if (!filter.tags.every(tag => depTags.includes(tag))) {
                    return false;
                }
            }
            
            // Any tags filter (at least one tag must match)
            if (filter.anyTags && filter.anyTags.length > 0) {
                const depTags = dependency.metadata?.tags || [];
                if (!filter.anyTags.some(tag => depTags.includes(tag))) {
                    return false;
                }
            }
            
            return true;
        });
    }

    /**
     * Sort dependencies based on sort criteria
     */
    private sortDependencies(
        dependencies: Dependency[], 
        sort: { field: keyof Dependency; direction: 'asc' | 'desc' }
    ): Dependency[] {
        return [...dependencies].sort((a, b) => {
            const aValue = a[sort.field];
            const bValue = b[sort.field];
            
            // Handle undefined values
            if (aValue === undefined && bValue === undefined) return 0;
            if (aValue === undefined) return 1;  // Put undefined values at end
            if (bValue === undefined) return -1;
            
            let comparison = 0;
            
            if (aValue < bValue) {
                comparison = -1;
            } else if (aValue > bValue) {
                comparison = 1;
            }
            
            return sort.direction === 'desc' ? -comparison : comparison;
        });
    }

    /**
     * Get goal details for a list of dependencies
     */
    private async getGoalDetailsForDependencies(
        dependencies: Dependency[]
    ): Promise<Map<string, { id: string; title: string; status: string }>> {
        const goalIds = new Set<string>();
        
        dependencies.forEach(d => {
            goalIds.add(d.blockedGoalId);
            goalIds.add(d.blockingGoalId);
        });
        
        const goalDetails = new Map<string, { id: string; title: string; status: string }>();
        
        for (const goalId of goalIds) {
            const goal = this.stateManager.getGoal(goalId);
            if (goal) {
                goalDetails.set(goalId, {
                    id: goal.id,
                    title: goal.title,
                    status: goal.status
                });
            }
        }
        
        return goalDetails;
    }

    /**
     * Update goal statuses when a new dependency is created
     */
    private async updateGoalStatusesForNewDependency(dependency: Dependency): Promise<void> {
        if (dependency.status === DependencyStatus.ACTIVE) {
            const blockedGoal = this.stateManager.getGoal(dependency.blockedGoalId);
            if (blockedGoal && blockedGoal.status === 'in-progress') {
                const updatedGoal = { ...blockedGoal, status: 'blocked' as any };
                this.stateManager.updateGoal(updatedGoal);
            }
        }
    }

    /**
     * Update goal statuses when a dependency is removed
     */
    private async updateGoalStatusesAfterDependencyRemoval(dependency: Dependency): Promise<void> {
        const blockedGoal = this.stateManager.getGoal(dependency.blockedGoalId);
        if (blockedGoal && blockedGoal.status === 'blocked') {
            // Check if there are any remaining blocking dependencies
            const allDependencies = await this.getAllDependencies();
            const remainingBlockingDeps = allDependencies.filter(
                d => d.blockedGoalId === dependency.blockedGoalId && 
                    d.status === DependencyStatus.ACTIVE &&
                    d.id !== dependency.id
            );
            
            if (remainingBlockingDeps.length === 0) {
                const updatedGoal = { ...blockedGoal, status: 'planned' as any };
                this.stateManager.updateGoal(updatedGoal);
            }
        }
    }

    /**
     * Handle dependency resolution (auto-unblocking)
     */
    private async handleDependencyResolution(resolvedDependency: Dependency): Promise<void> {
        const unblockedGoalId = resolvedDependency.blockedGoalId;
        
        // Check if goal becomes completely unblocked
        const allDependencies = await this.getAllDependencies();
        const remainingBlockingDeps = allDependencies.filter(
            d => d.blockedGoalId === unblockedGoalId && 
                d.status === DependencyStatus.ACTIVE &&
                d.id !== resolvedDependency.id
        );
        
        if (remainingBlockingDeps.length === 0) {
            const goal = this.stateManager.getGoal(unblockedGoalId);
            if (goal && goal.status === 'blocked') {
                const updatedGoal = { ...goal, status: 'planned' as any };
                this.stateManager.updateGoal(updatedGoal);
                
                // Emit unblock event
                this.changeNotificationService.fire({
                    type: 'goal:unblocked',
                    data: { goalId: unblockedGoalId, resolvedDependency },
                    timestamp: new Date()
                });
            }
        }
    }

    /**
     * Validate dependency update
     */
    private async validateDependencyUpdate(
        existingDependency: Dependency, 
        updates: UpdateDependencyParams
    ): Promise<DependencyValidationResult> {
        // Basic validation - can be extended based on business rules
        return {
            isValid: true,
            warnings: [],
            suggestions: []
        };
    }

    /**
     * Find transitively unblocked goals
     */
    private async findTransitivelyUnblockedGoals(
        startingGoalId: string, 
        allDependencies: Dependency[]
    ): Promise<string[]> {
        const result: string[] = [];
        const visited = new Set<string>();
        
        const traverse = (goalId: string) => {
            if (visited.has(goalId)) {
                return;
            }
            
            visited.add(goalId);
            
            // Find goals blocked by this goal
            const blockedGoals = allDependencies
                .filter(d => d.blockingGoalId === goalId && d.status === DependencyStatus.ACTIVE)
                .map(d => d.blockedGoalId);
            
            for (const blockedGoalId of blockedGoals) {
                // Check if this blocked goal would become completely unblocked
                const otherBlockers = allDependencies.filter(
                    d => d.blockedGoalId === blockedGoalId && 
                        d.status === DependencyStatus.ACTIVE &&
                        d.blockingGoalId !== goalId
                );
                
                if (otherBlockers.length === 0) {
                    result.push(blockedGoalId);
                    traverse(blockedGoalId); // Continue the chain
                }
            }
        };
        
        traverse(startingGoalId);
        return result;
    }

    /**
     * Calculate dependency depth for a goal
     */
    private calculateDependencyDepth(goalId: string, dependencies: Dependency[]): number {
        const visited = new Set<string>();
        
        const traverse = (currentGoalId: string): number => {
            if (visited.has(currentGoalId)) {
                return 0; // Avoid cycles
            }
            
            visited.add(currentGoalId);
            
            const blockingDeps = dependencies.filter(
                d => d.blockedGoalId === currentGoalId && d.status === DependencyStatus.ACTIVE
            );
            
            if (blockingDeps.length === 0) {
                return 0;
            }
            
            let maxDepth = 0;
            for (const dep of blockingDeps) {
                const depth = traverse(dep.blockingGoalId);
                maxDepth = Math.max(maxDepth, depth + 1);
            }
            
            return maxDepth;
        };
        
        return traverse(goalId);
    }

    /**
     * Get node color based on goal status
     */
    private getNodeColor(status: string): string {
        switch (status) {
            case 'completed': return '#4CAF50';
            case 'in-progress': return '#2196F3';
            case 'blocked': return '#F44336';
            case 'planned': return '#FF9800';
            default: return '#9E9E9E';
        }
    }

    /**
     * Get edge color based on dependency status
     */
    private getEdgeColor(status: string): string {
        switch (status) {
            case 'resolved': return '#4CAF50';
            case 'active': return '#2196F3';
            case 'disabled': return '#9E9E9E';
            case 'invalid': return '#F44336';
            default: return '#000000';
        }
    }

    /**
     * Utility to chunk array into batches
     */
    private chunkArray<T>(array: T[], chunkSize: number): T[][] {
        const chunks: T[][] = [];
        for (let i = 0; i < array.length; i += chunkSize) {
            chunks.push(array.slice(i, i + chunkSize));
        }
        return chunks;
    }

    /**
     * Setup change listeners for cache invalidation
     */
    private setupChangeListeners(): void {
        this.changeNotificationService.event((payload) => {
            if (payload.type.includes('goal:') || payload.type.includes('dependency:')) {
                this.invalidateCaches();
            }
        });
    }

    /**
     * Invalidate all caches
     */
    private invalidateCaches(): void {
        this.graphCache.clear();
        this.analysisCache.clear();
        this.dependencyCache.clear();
    }

    /**
     * Get value from cache if still valid
     */
    private getFromCache<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
        const entry = cache.get(key);
        if (!entry) {
            return null;
        }
        
        if (Date.now() - entry.timestamp > entry.ttl) {
            cache.delete(key);
            return null;
        }
        
        return entry.data;
    }

    /**
     * Set cache value with TTL
     */
    private setCache<T>(cache: Map<string, CacheEntry<T>>, key: string, data: T, ttl: number): void {
        cache.set(key, {
            data,
            timestamp: Date.now(),
            ttl
        });
    }

    /**
     * Cleanup method for service shutdown
     */
    public dispose(): void {
        this.invalidateCaches();
        this.logger.info('[DependencyResolver] Service disposed');
    }
}

/**
 * Factory function to create a DependencyResolver instance
 */
export function createDependencyResolver(
    stateManager: StateManager,
    storageService: StorageService,
    changeNotificationService: ChangeNotificationService,
    config?: Partial<DependencyResolverConfig>
): DependencyResolver {
    return new DependencyResolver(stateManager, storageService, changeNotificationService, config);
}