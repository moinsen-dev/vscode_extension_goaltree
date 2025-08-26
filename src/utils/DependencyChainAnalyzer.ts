/**
 * Dependency Chain Analyzer utility for dependency management
 * 
 * Specialized utility for analyzing dependency chains, paths, and relationships
 * in goal dependency networks. Provides detailed analysis of blocking paths,
 * critical chains, and optimization suggestions.
 * 
 * Features:
 * - Dependency chain path finding and analysis
 * - Blocking path identification and visualization
 * - Critical path analysis for goal completion
 * - Chain optimization suggestions
 * - Performance impact assessment
 * - User-friendly chain descriptions and visualizations
 * 
 * Stream 4: Dependency chain analysis utilities
 */

import { 
    Dependency, 
    DependencyRelationship,
    DependencyUtils
} from '../types/Dependency';
import { 
    DependencyStatus, 
    DependencyResolutionStrategy 
} from '../types/DependencyStatus';
import { 
    DependencyGraph, 
    DependencyGraphNode, 
    DependencyGraphEdge,
    DependencyPath
} from '../types/DependencyGraph';
import { EnhancedGoal, GoalStatus } from '../types/Goal';
import { GraphAlgorithms } from './GraphAlgorithms';
import { createLogger } from './logger';

/**
 * Chain analysis result with detailed path information
 */
export interface ChainAnalysisResult {
    /** The analyzed dependency chain */
    chain: DependencyChain;
    
    /** Analysis metrics */
    metrics: ChainMetrics;
    
    /** Blocking analysis */
    blocking: BlockingAnalysis;
    
    /** Optimization suggestions */
    optimizations: ChainOptimization[];
    
    /** Visual representation data */
    visualization: ChainVisualization;
}

/**
 * Dependency chain representation
 */
export interface DependencyChain {
    /** Unique identifier for this chain */
    id: string;
    
    /** Source goal (starting point) */
    sourceGoalId: string;
    
    /** Target goal (end point) */
    targetGoalId: string;
    
    /** Goals in the chain (ordered) */
    goalIds: string[];
    
    /** Dependencies linking the goals */
    dependencies: Dependency[];
    
    /** Chain length (number of dependencies) */
    length: number;
    
    /** Chain type */
    type: ChainType;
    
    /** Chain status */
    status: ChainStatus;
    
    /** Creation timestamp */
    createdAt: Date;
    
    /** Last analysis timestamp */
    analyzedAt: Date;
}

/**
 * Types of dependency chains
 */
export enum ChainType {
    /** Simple linear chain */
    LINEAR = 'linear',
    
    /** Chain with branches/convergence */
    BRANCHED = 'branched',
    
    /** Circular dependency chain */
    CIRCULAR = 'circular',
    
    /** Critical path chain */
    CRITICAL_PATH = 'critical_path',
    
    /** Parallel execution chain */
    PARALLEL = 'parallel'
}

/**
 * Chain status based on blocking state
 */
export enum ChainStatus {
    /** No blocking dependencies */
    CLEAR = 'clear',
    
    /** Some dependencies are blocking */
    PARTIALLY_BLOCKED = 'partially_blocked',
    
    /** Chain is fully blocked */
    FULLY_BLOCKED = 'fully_blocked',
    
    /** Chain has been resolved */
    RESOLVED = 'resolved',
    
    /** Chain is invalid (broken links) */
    INVALID = 'invalid'
}

/**
 * Chain analysis metrics
 */
export interface ChainMetrics {
    /** Total goals in the chain */
    totalGoals: number;
    
    /** Total dependencies in the chain */
    totalDependencies: number;
    
    /** Completed goals */
    completedGoals: number;
    
    /** Active (blocking) dependencies */
    activeDependencies: number;
    
    /** Chain depth (longest path) */
    depth: number;
    
    /** Estimated completion time (in days) */
    estimatedCompletion: number;
    
    /** Progress percentage */
    progressPercentage: number;
    
    /** Complexity score */
    complexityScore: number;
    
    /** Priority score (highest priority in chain) */
    priorityScore: number;
}

/**
 * Blocking analysis for a chain
 */
export interface BlockingAnalysis {
    /** Whether the chain is currently blocked */
    isBlocked: boolean;
    
    /** Goals that are blocked */
    blockedGoals: string[];
    
    /** Dependencies causing blocks */
    blockingDependencies: Dependency[];
    
    /** Next goals that could be unblocked */
    nextUnblockableGoals: string[];
    
    /** Estimated time to next unblock */
    timeToNextUnblock: number;
    
    /** Critical blockers (high impact) */
    criticalBlockers: Array<{
        dependencyId: string;
        impact: 'low' | 'medium' | 'high';
        reason: string;
        suggestedAction: string;
    }>;
    
    /** Parallel work opportunities */
    parallelOpportunities: Array<{
        goalId: string;
        canStartNow: boolean;
        reason: string;
    }>;
}

/**
 * Chain optimization suggestions
 */
export interface ChainOptimization {
    /** Type of optimization */
    type: OptimizationType;
    
    /** Priority of this optimization */
    priority: number;
    
    /** Title/summary */
    title: string;
    
    /** Detailed description */
    description: string;
    
    /** Estimated impact */
    impact: {
        /** Time savings (days) */
        timeSavings: number;
        
        /** Complexity reduction */
        complexityReduction: number;
        
        /** Risk level */
        riskLevel: 'low' | 'medium' | 'high';
    };
    
    /** Specific actions to take */
    actions: OptimizationAction[];
    
    /** Prerequisites for this optimization */
    prerequisites: string[];
}

/**
 * Types of chain optimizations
 */
export enum OptimizationType {
    /** Parallelize independent work */
    PARALLELIZE = 'parallelize',
    
    /** Remove unnecessary dependencies */
    REMOVE_REDUNDANT = 'remove_redundant',
    
    /** Reorder for efficiency */
    REORDER = 'reorder',
    
    /** Split complex goals */
    SPLIT_GOALS = 'split_goals',
    
    /** Merge related goals */
    MERGE_GOALS = 'merge_goals',
    
    /** Change dependency types */
    SOFTEN_DEPENDENCIES = 'soften_dependencies',
    
    /** Add intermediate milestones */
    ADD_MILESTONES = 'add_milestones'
}

/**
 * Specific optimization action
 */
export interface OptimizationAction {
    /** Action type */
    action: string;
    
    /** Target dependency or goal */
    targetId: string;
    
    /** Action description */
    description: string;
    
    /** Whether this can be automated */
    canAutomate: boolean;
    
    /** Estimated effort */
    effort: 'low' | 'medium' | 'high';
}

/**
 * Chain visualization data
 */
export interface ChainVisualization {
    /** Nodes for visualization */
    nodes: VisualizationNode[];
    
    /** Edges for visualization */
    edges: VisualizationEdge[];
    
    /** Layout hints */
    layout: {
        type: 'linear' | 'tree' | 'force' | 'circular';
        direction: 'horizontal' | 'vertical';
        spacing: number;
    };
    
    /** Color scheme */
    colors: {
        completed: string;
        inProgress: string;
        blocked: string;
        planned: string;
        critical: string;
    };
    
    /** Highlighting information */
    highlights: {
        criticalPath: string[];
        blockers: string[];
        nextActions: string[];
    };
}

/**
 * Visualization node
 */
export interface VisualizationNode {
    id: string;
    title: string;
    status: GoalStatus;
    position: { x: number; y: number };
    size: number;
    color: string;
    shape: 'circle' | 'square' | 'diamond';
    labels: string[];
}

/**
 * Visualization edge
 */
export interface VisualizationEdge {
    id: string;
    source: string;
    target: string;
    dependency: Dependency;
    color: string;
    width: number;
    style: 'solid' | 'dashed' | 'dotted';
    labels: string[];
}

/**
 * Configuration for chain analysis
 */
export interface ChainAnalyzerConfig {
    /** Maximum chain depth to analyze */
    maxDepth: number;
    
    /** Maximum analysis time (ms) */
    maxAnalysisTime: number;
    
    /** Enable optimization suggestions */
    enableOptimizations: boolean;
    
    /** Enable visualization data generation */
    enableVisualization: boolean;
    
    /** Parallel work detection threshold */
    parallelThreshold: number;
    
    /** Complexity scoring weights */
    complexityWeights: {
        depth: number;
        branching: number;
        cycles: number;
        dependencies: number;
    };
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: ChainAnalyzerConfig = {
    maxDepth: 50,
    maxAnalysisTime: 10000, // 10 seconds
    enableOptimizations: true,
    enableVisualization: true,
    parallelThreshold: 0.7,
    complexityWeights: {
        depth: 0.3,
        branching: 0.2,
        cycles: 0.4,
        dependencies: 0.1
    }
};

/**
 * Dependency Chain Analyzer class
 */
export class DependencyChainAnalyzer {
    private config: ChainAnalyzerConfig;
    private graphAlgorithms: GraphAlgorithms;
    private logger = createLogger('DependencyChainAnalyzer');
    
    // Analysis caches for performance
    private chainCache: Map<string, ChainAnalysisResult> = new Map();
    private metricsCache: Map<string, ChainMetrics> = new Map();
    
    constructor(config: Partial<ChainAnalyzerConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.graphAlgorithms = new GraphAlgorithms();
        
        this.logger.debug('[DependencyChainAnalyzer] Initialized with config', this.config);
    }

    // ===========================================
    // Main Analysis Methods
    // ===========================================

    /**
     * Analyze a dependency chain between two goals
     */
    async analyzeChain(
        graph: DependencyGraph,
        sourceGoalId: string,
        targetGoalId: string
    ): Promise<ChainAnalysisResult | null> {
        const startTime = Date.now();
        
        try {
            this.logger.debug('[DependencyChainAnalyzer] Analyzing chain', { 
                sourceGoalId, 
                targetGoalId 
            });
            
            // Check cache first
            const cacheKey = `${sourceGoalId}-${targetGoalId}`;
            if (this.chainCache.has(cacheKey)) {
                const cached = this.chainCache.get(cacheKey)!;
                if (Date.now() - cached.chain.analyzedAt.getTime() < 60000) { // 1 minute cache
                    return cached;
                }
            }
            
            // Find the dependency path
            const path = this.graphAlgorithms.findShortestPath(graph, sourceGoalId, targetGoalId);
            if (!path) {
                this.logger.debug('[DependencyChainAnalyzer] No path found between goals');
                return null;
            }
            
            // Build the dependency chain
            const chain = this.buildDependencyChain(graph, path);
            
            // Analyze metrics
            const metrics = this.calculateChainMetrics(graph, chain);
            
            // Analyze blocking
            const blocking = this.analyzeBlocking(graph, chain);
            
            // Generate optimizations
            const optimizations = this.config.enableOptimizations 
                ? this.generateOptimizations(graph, chain, metrics, blocking)
                : [];
            
            // Generate visualization
            const visualization = this.config.enableVisualization
                ? this.generateVisualization(graph, chain)
                : this.getEmptyVisualization();
            
            const result: ChainAnalysisResult = {
                chain,
                metrics,
                blocking,
                optimizations,
                visualization
            };
            
            // Cache the result
            this.chainCache.set(cacheKey, result);
            
            this.logger.info('[DependencyChainAnalyzer] Chain analysis completed', {
                sourceGoalId,
                targetGoalId,
                chainLength: chain.length,
                duration: Date.now() - startTime
            });
            
            return result;
            
        } catch (error) {
            this.logger.error('[DependencyChainAnalyzer] Error analyzing chain', {
                sourceGoalId,
                targetGoalId,
                error: error instanceof Error ? error.message : error
            });
            return null;
        }
    }

    /**
     * Analyze all chains from a goal
     */
    async analyzeGoalChains(
        graph: DependencyGraph,
        goalId: string
    ): Promise<ChainAnalysisResult[]> {
        try {
            this.logger.debug('[DependencyChainAnalyzer] Analyzing all chains from goal', { goalId });
            
            const results: ChainAnalysisResult[] = [];
            
            // Find all reachable goals from this goal
            const traversal = this.graphAlgorithms.breadthFirstSearch(graph, {
                startNodeId: goalId,
                direction: 'forward',
                maxDepth: this.config.maxDepth
            });
            
            // Analyze chains to each reachable goal
            for (const targetGoalId of traversal.visitedNodes) {
                if (targetGoalId === goalId) continue;
                
                const chainResult = await this.analyzeChain(graph, goalId, targetGoalId);
                if (chainResult) {
                    results.push(chainResult);
                }
                
                // Check timeout
                if (results.length > 100) {
                    this.logger.warn('[DependencyChainAnalyzer] Too many chains found, truncating');
                    break;
                }
            }
            
            // Sort by importance (blocked goals first, then by length)
            results.sort((a, b) => {
                if (a.blocking.isBlocked && !b.blocking.isBlocked) return -1;
                if (!a.blocking.isBlocked && b.blocking.isBlocked) return 1;
                return b.metrics.priorityScore - a.metrics.priorityScore;
            });
            
            return results;
            
        } catch (error) {
            this.logger.error('[DependencyChainAnalyzer] Error analyzing goal chains', {
                goalId,
                error: error instanceof Error ? error.message : error
            });
            return [];
        }
    }

    /**
     * Find blocking paths for a goal
     */
    async findBlockingPaths(
        graph: DependencyGraph,
        goalId: string
    ): Promise<DependencyPath[]> {
        try {
            this.logger.debug('[DependencyChainAnalyzer] Finding blocking paths for goal', { goalId });
            
            const blockingPaths: DependencyPath[] = [];
            
            // Find all goals that are blocking this goal (directly or indirectly)
            const traversal = this.graphAlgorithms.breadthFirstSearch(graph, {
                startNodeId: goalId,
                direction: 'backward',
                maxDepth: this.config.maxDepth,
                edgeFilter: (edge) => edge.dependency.status === DependencyStatus.ACTIVE
            });
            
            // For each blocking goal, find the path to our target goal
            for (const blockingGoalId of traversal.visitedNodes) {
                if (blockingGoalId === goalId) continue;
                
                const path = this.graphAlgorithms.findShortestPath(graph, blockingGoalId, goalId);
                if (path) {
                    blockingPaths.push(path);
                }
            }
            
            // Sort by path length (shortest first - most direct blockers)
            blockingPaths.sort((a, b) => a.length - b.length);
            
            return blockingPaths;
            
        } catch (error) {
            this.logger.error('[DependencyChainAnalyzer] Error finding blocking paths', {
                goalId,
                error: error instanceof Error ? error.message : error
            });
            return [];
        }
    }

    /**
     * Analyze critical paths in the graph
     */
    async analyzeCriticalPaths(graph: DependencyGraph): Promise<DependencyPath[]> {
        try {
            this.logger.debug('[DependencyChainAnalyzer] Analyzing critical paths');
            
            const criticalPaths: DependencyPath[] = [];
            
            // Get root nodes (no incoming dependencies)
            const rootNodes = graph.metadata.rootNodes;
            const leafNodes = graph.metadata.leafNodes;
            
            // Find longest paths from each root to each leaf
            for (const rootNode of rootNodes) {
                for (const leafNode of leafNodes) {
                    if (rootNode === leafNode) continue;
                    
                    // Find all paths and select the longest
                    const allPaths = this.graphAlgorithms.findAllPaths(graph, rootNode, leafNode);
                    if (allPaths.length > 0) {
                        const longestPath = allPaths.reduce((longest, current) => 
                            current.length > longest.length ? current : longest
                        );
                        
                        criticalPaths.push(longestPath);
                    }
                }
            }
            
            // Sort by length (longest first)
            criticalPaths.sort((a, b) => b.length - a.length);
            
            // Return top critical paths
            return criticalPaths.slice(0, 10);
            
        } catch (error) {
            this.logger.error('[DependencyChainAnalyzer] Error analyzing critical paths', {
                error: error instanceof Error ? error.message : error
            });
            return [];
        }
    }

    // ===========================================
    // Chain Building and Analysis
    // ===========================================

    /**
     * Build a dependency chain from a path
     */
    private buildDependencyChain(graph: DependencyGraph, path: DependencyPath): DependencyChain {
        const now = new Date();
        
        // Determine chain type
        let chainType = ChainType.LINEAR;
        if (path.hasCycle) {
            chainType = ChainType.CIRCULAR;
        } else if (this.hasMultiplePaths(graph, path.sourceId, path.targetId)) {
            chainType = ChainType.BRANCHED;
        }
        
        // Determine chain status
        const status = this.determineChainStatus(path.dependencies);
        
        return {
            id: `chain_${path.sourceId}_${path.targetId}_${now.getTime()}`,
            sourceGoalId: path.sourceId,
            targetGoalId: path.targetId,
            goalIds: path.path,
            dependencies: path.dependencies,
            length: path.length,
            type: chainType,
            status,
            createdAt: now,
            analyzedAt: now
        };
    }

    /**
     * Calculate chain metrics
     */
    private calculateChainMetrics(graph: DependencyGraph, chain: DependencyChain): ChainMetrics {
        const totalGoals = chain.goalIds.length;
        const totalDependencies = chain.dependencies.length;
        
        // Count completed goals
        let completedGoals = 0;
        for (const goalId of chain.goalIds) {
            const node = graph.nodes.get(goalId);
            if (node && node.status === 'completed') {
                completedGoals++;
            }
        }
        
        // Count active dependencies
        const activeDependencies = chain.dependencies.filter(
            d => d.status === DependencyStatus.ACTIVE
        ).length;
        
        // Calculate progress
        const progressPercentage = totalGoals > 0 ? Math.round((completedGoals / totalGoals) * 100) : 0;
        
        // Calculate complexity score
        const complexityScore = this.calculateComplexityScore(chain, graph);
        
        // Calculate priority score
        const priorityScore = Math.max(
            ...chain.dependencies.map(d => d.metadata?.priority || 3)
        );
        
        // Estimate completion time (simple heuristic)
        const remainingGoals = totalGoals - completedGoals;
        const estimatedCompletion = remainingGoals * 2; // 2 days per goal average
        
        return {
            totalGoals,
            totalDependencies,
            completedGoals,
            activeDependencies,
            depth: chain.length,
            estimatedCompletion,
            progressPercentage,
            complexityScore,
            priorityScore
        };
    }

    /**
     * Analyze blocking for a chain
     */
    private analyzeBlocking(graph: DependencyGraph, chain: DependencyChain): BlockingAnalysis {
        const blockingDependencies = chain.dependencies.filter(
            d => d.status === DependencyStatus.ACTIVE
        );
        
        const isBlocked = blockingDependencies.length > 0;
        
        // Find blocked goals
        const blockedGoals: string[] = [];
        for (const dep of blockingDependencies) {
            if (!blockedGoals.includes(dep.blockedGoalId)) {
                blockedGoals.push(dep.blockedGoalId);
            }
        }
        
        // Find next unblockable goals
        const nextUnblockableGoals = this.findNextUnblockableGoals(graph, chain);
        
        // Analyze critical blockers
        const criticalBlockers = this.analyzeCriticalBlockers(blockingDependencies);
        
        // Find parallel opportunities
        const parallelOpportunities = this.findParallelOpportunities(graph, chain);
        
        return {
            isBlocked,
            blockedGoals,
            blockingDependencies,
            nextUnblockableGoals,
            timeToNextUnblock: this.estimateTimeToNextUnblock(blockingDependencies),
            criticalBlockers,
            parallelOpportunities
        };
    }

    /**
     * Generate optimization suggestions
     */
    private generateOptimizations(
        graph: DependencyGraph,
        chain: DependencyChain,
        metrics: ChainMetrics,
        blocking: BlockingAnalysis
    ): ChainOptimization[] {
        const optimizations: ChainOptimization[] = [];
        
        // Parallelize independent work
        if (blocking.parallelOpportunities.length > 0) {
            optimizations.push({
                type: OptimizationType.PARALLELIZE,
                priority: 1,
                title: 'Parallelize Independent Work',
                description: `${blocking.parallelOpportunities.length} goals can be worked on in parallel`,
                impact: {
                    timeSavings: Math.min(5, blocking.parallelOpportunities.length),
                    complexityReduction: 0.2,
                    riskLevel: 'low'
                },
                actions: blocking.parallelOpportunities.map(opp => ({
                    action: 'start_parallel_work',
                    targetId: opp.goalId,
                    description: `Start work on ${opp.goalId}: ${opp.reason}`,
                    canAutomate: false,
                    effort: 'low'
                })),
                prerequisites: []
            });
        }
        
        // Remove redundant dependencies
        const redundantDeps = this.findRedundantDependencies(graph, chain);
        if (redundantDeps.length > 0) {
            optimizations.push({
                type: OptimizationType.REMOVE_REDUNDANT,
                priority: 2,
                title: 'Remove Redundant Dependencies',
                description: `${redundantDeps.length} dependencies appear to be redundant`,
                impact: {
                    timeSavings: redundantDeps.length * 0.5,
                    complexityReduction: 0.3,
                    riskLevel: 'medium'
                },
                actions: redundantDeps.map(dep => ({
                    action: 'remove_dependency',
                    targetId: dep.id,
                    description: `Remove redundant dependency: ${dep.blockingGoalId} → ${dep.blockedGoalId}`,
                    canAutomate: false,
                    effort: 'low'
                })),
                prerequisites: ['Verify dependencies are truly redundant']
            });
        }
        
        // Soften hard dependencies where possible
        const hardenableDeps = chain.dependencies.filter(
            d => d.metadata?.type === 'hard' && d.status === DependencyStatus.ACTIVE
        );
        if (hardenableDeps.length > 2) {
            optimizations.push({
                type: OptimizationType.SOFTEN_DEPENDENCIES,
                priority: 3,
                title: 'Soften Hard Dependencies',
                description: 'Convert some hard dependencies to soft to allow parallel work',
                impact: {
                    timeSavings: 2,
                    complexityReduction: 0.1,
                    riskLevel: 'low'
                },
                actions: hardenableDeps.slice(0, 2).map(dep => ({
                    action: 'soften_dependency',
                    targetId: dep.id,
                    description: `Change dependency to soft type`,
                    canAutomate: true,
                    effort: 'low'
                })),
                prerequisites: []
            });
        }
        
        // Sort by priority
        return optimizations.sort((a, b) => a.priority - b.priority);
    }

    /**
     * Generate visualization data
     */
    private generateVisualization(graph: DependencyGraph, chain: DependencyChain): ChainVisualization {
        const nodes: VisualizationNode[] = [];
        const edges: VisualizationEdge[] = [];
        
        // Create nodes
        for (let i = 0; i < chain.goalIds.length; i++) {
            const goalId = chain.goalIds[i];
            const node = graph.nodes.get(goalId);
            
            if (node) {
                nodes.push({
                    id: goalId,
                    title: node.title,
                    status: node.status as GoalStatus,
                    position: { x: i * 150, y: 0 }, // Linear layout
                    size: 30,
                    color: this.getNodeColor(node.status as GoalStatus),
                    shape: 'circle',
                    labels: [node.title]
                });
            }
        }
        
        // Create edges
        for (const dependency of chain.dependencies) {
            edges.push({
                id: dependency.id,
                source: dependency.blockingGoalId,
                target: dependency.blockedGoalId,
                dependency,
                color: this.getEdgeColor(dependency.status),
                width: dependency.metadata?.priority || 3,
                style: dependency.status === DependencyStatus.RESOLVED ? 'dashed' : 'solid',
                labels: dependency.reason ? [dependency.reason] : []
            });
        }
        
        return {
            nodes,
            edges,
            layout: {
                type: 'linear',
                direction: 'horizontal',
                spacing: 150
            },
            colors: {
                completed: '#4CAF50',
                inProgress: '#2196F3',
                blocked: '#F44336',
                planned: '#FF9800',
                critical: '#9C27B0'
            },
            highlights: {
                criticalPath: chain.type === ChainType.CRITICAL_PATH ? chain.goalIds : [],
                blockers: chain.dependencies
                    .filter(d => d.status === DependencyStatus.ACTIVE)
                    .map(d => d.blockingGoalId),
                nextActions: this.findNextUnblockableGoals(graph, chain)
            }
        };
    }

    // ===========================================
    // Helper Methods
    // ===========================================

    /**
     * Determine chain status based on dependencies
     */
    private determineChainStatus(dependencies: Dependency[]): ChainStatus {
        const activeDeps = dependencies.filter(d => d.status === DependencyStatus.ACTIVE);
        const resolvedDeps = dependencies.filter(d => d.status === DependencyStatus.RESOLVED);
        
        if (activeDeps.length === 0) {
            return resolvedDeps.length > 0 ? ChainStatus.RESOLVED : ChainStatus.CLEAR;
        }
        
        if (activeDeps.length === dependencies.length) {
            return ChainStatus.FULLY_BLOCKED;
        }
        
        return ChainStatus.PARTIALLY_BLOCKED;
    }

    /**
     * Check if there are multiple paths between two nodes
     */
    private hasMultiplePaths(graph: DependencyGraph, sourceId: string, targetId: string): boolean {
        try {
            const allPaths = this.graphAlgorithms.findAllPaths(graph, sourceId, targetId, 5);
            return allPaths.length > 1;
        } catch {
            return false;
        }
    }

    /**
     * Calculate complexity score for a chain
     */
    private calculateComplexityScore(chain: DependencyChain, graph: DependencyGraph): number {
        const weights = this.config.complexityWeights;
        
        let score = 0;
        
        // Depth factor
        score += (chain.length / 10) * weights.depth;
        
        // Branching factor
        const branching = this.calculateBranchingFactor(chain, graph);
        score += branching * weights.branching;
        
        // Cycle factor
        if (chain.type === ChainType.CIRCULAR) {
            score += weights.cycles;
        }
        
        // Dependencies factor
        score += (chain.dependencies.length / 20) * weights.dependencies;
        
        return Math.min(1.0, score);
    }

    /**
     * Calculate branching factor
     */
    private calculateBranchingFactor(chain: DependencyChain, graph: DependencyGraph): number {
        let totalBranches = 0;
        
        for (const goalId of chain.goalIds) {
            let outDegree = 0;
            let inDegree = 0;
            
            for (const edge of graph.edges.values()) {
                if (edge.source === goalId) outDegree++;
                if (edge.target === goalId) inDegree++;
            }
            
            totalBranches += Math.max(outDegree, inDegree) - 1;
        }
        
        return totalBranches / chain.goalIds.length;
    }

    /**
     * Find next unblockable goals in chain
     */
    private findNextUnblockableGoals(graph: DependencyGraph, chain: DependencyChain): string[] {
        const nextUnblockable: string[] = [];
        
        for (const goalId of chain.goalIds) {
            const node = graph.nodes.get(goalId);
            if (!node || node.status === 'completed') continue;
            
            // Check if this goal has any active blocking dependencies
            const hasBlockers = chain.dependencies.some(
                d => d.blockedGoalId === goalId && d.status === DependencyStatus.ACTIVE
            );
            
            if (!hasBlockers && !nextUnblockable.includes(goalId)) {
                nextUnblockable.push(goalId);
            }
        }
        
        return nextUnblockable;
    }

    /**
     * Analyze critical blockers
     */
    private analyzeCriticalBlockers(blockingDependencies: Dependency[]) {
        return blockingDependencies.map(dep => {
            const priority = dep.metadata?.priority || 3;
            const impact = priority >= 4 ? 'high' : priority >= 3 ? 'medium' : 'low';
            
            return {
                dependencyId: dep.id,
                impact: impact as 'low' | 'medium' | 'high',
                reason: this.getCriticalBlockerReason(dep),
                suggestedAction: this.getSuggestedAction(dep)
            };
        });
    }

    /**
     * Get critical blocker reason
     */
    private getCriticalBlockerReason(dependency: Dependency): string {
        if (dependency.metadata?.priority && dependency.metadata.priority >= 4) {
            return 'High priority dependency';
        }
        
        if (dependency.metadata?.type === 'hard') {
            return 'Hard dependency prevents parallel work';
        }
        
        const age = DependencyUtils.getAge(dependency);
        if (age > 30) {
            return 'Long-standing dependency';
        }
        
        return 'Active blocking dependency';
    }

    /**
     * Get suggested action for dependency
     */
    private getSuggestedAction(dependency: Dependency): string {
        if (dependency.resolutionStrategy === DependencyResolutionStrategy.MANUAL_RESOLVE) {
            return 'Review and manually resolve';
        }
        
        if (dependency.metadata?.type === 'hard') {
            return 'Consider softening to allow parallel work';
        }
        
        return 'Complete blocking goal to auto-resolve';
    }

    /**
     * Find parallel work opportunities
     */
    private findParallelOpportunities(graph: DependencyGraph, chain: DependencyChain) {
        const opportunities = [];
        
        for (const goalId of chain.goalIds) {
            const node = graph.nodes.get(goalId);
            if (!node || node.status === 'completed' || node.status === 'in-progress') {
                continue;
            }
            
            // Check if this goal can start now (no active hard dependencies)
            const hardBlockers = chain.dependencies.filter(
                d => d.blockedGoalId === goalId && 
                    d.status === DependencyStatus.ACTIVE &&
                    (d.metadata?.type === 'hard' || !d.metadata?.type)
            );
            
            const canStartNow = hardBlockers.length === 0;
            
            opportunities.push({
                goalId,
                canStartNow,
                reason: canStartNow ? 
                    'No hard dependencies blocking' : 
                    `Blocked by ${hardBlockers.length} hard dependencies`
            });
        }
        
        return opportunities;
    }

    /**
     * Estimate time to next unblock
     */
    private estimateTimeToNextUnblock(blockingDependencies: Dependency[]): number {
        if (blockingDependencies.length === 0) return 0;
        
        // Simple heuristic: average 3 days to resolve a dependency
        return Math.min(...blockingDependencies.map(dep => {
            const expectedDate = dep.metadata?.expectedResolutionDate;
            if (expectedDate) {
                const daysUntil = Math.max(0, 
                    Math.ceil((expectedDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                );
                return daysUntil;
            }
            return 3; // Default estimate
        }));
    }

    /**
     * Find redundant dependencies in chain
     */
    private findRedundantDependencies(graph: DependencyGraph, chain: DependencyChain): Dependency[] {
        const redundant: Dependency[] = [];
        
        // Look for transitive dependencies that could be removed
        for (const dep of chain.dependencies) {
            // Check if there's an alternative path from blocker to blocked goal
            const alternatePaths = this.graphAlgorithms.findAllPaths(
                graph, 
                dep.blockingGoalId, 
                dep.blockedGoalId, 
                5
            );
            
            if (alternatePaths.length > 1) {
                // Check if removing this dependency would still maintain connectivity
                const otherPaths = alternatePaths.filter(path => 
                    !path.dependencies.some(d => d.id === dep.id)
                );
                
                if (otherPaths.length > 0) {
                    redundant.push(dep);
                }
            }
        }
        
        return redundant;
    }

    /**
     * Get node color based on status
     */
    private getNodeColor(status: GoalStatus): string {
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
     * Get empty visualization for cases where visualization is disabled
     */
    private getEmptyVisualization(): ChainVisualization {
        return {
            nodes: [],
            edges: [],
            layout: {
                type: 'linear',
                direction: 'horizontal',
                spacing: 150
            },
            colors: {
                completed: '#4CAF50',
                inProgress: '#2196F3',
                blocked: '#F44336',
                planned: '#FF9800',
                critical: '#9C27B0'
            },
            highlights: {
                criticalPath: [],
                blockers: [],
                nextActions: []
            }
        };
    }

    /**
     * Clear analysis caches
     */
    public clearCache(): void {
        this.chainCache.clear();
        this.metricsCache.clear();
        this.logger.debug('[DependencyChainAnalyzer] Cache cleared');
    }

    /**
     * Update analyzer configuration
     */
    public updateConfig(newConfig: Partial<ChainAnalyzerConfig>): void {
        this.config = { ...this.config, ...newConfig };
        this.logger.debug('[DependencyChainAnalyzer] Configuration updated', this.config);
    }

    /**
     * Get current configuration
     */
    public getConfig(): ChainAnalyzerConfig {
        return { ...this.config };
    }
}

/**
 * Factory function to create a DependencyChainAnalyzer instance
 */
export function createDependencyChainAnalyzer(config?: Partial<ChainAnalyzerConfig>): DependencyChainAnalyzer {
    return new DependencyChainAnalyzer(config);
}

/**
 * Utility functions for working with dependency chains
 */
export const ChainAnalysisUtils = {
    /**
     * Format chain for display
     */
    formatChainForDisplay(chain: DependencyChain): string {
        const statusEmoji = {
            [ChainStatus.CLEAR]: '🟢',
            [ChainStatus.PARTIALLY_BLOCKED]: '🟡',
            [ChainStatus.FULLY_BLOCKED]: '🔴',
            [ChainStatus.RESOLVED]: '✅',
            [ChainStatus.INVALID]: '❌'
        };
        
        return `${statusEmoji[chain.status]} ${chain.sourceGoalId} → ${chain.targetGoalId} (${chain.length} steps)`;
    },
    
    /**
     * Get human-readable chain summary
     */
    getChainSummary(result: ChainAnalysisResult): string {
        const { chain, metrics, blocking } = result;
        
        const progressText = `${metrics.completedGoals}/${metrics.totalGoals} goals completed (${metrics.progressPercentage}%)`;
        const blockingText = blocking.isBlocked 
            ? `${blocking.blockingDependencies.length} active blockers`
            : 'No active blockers';
        
        return `Chain: ${chain.sourceGoalId} → ${chain.targetGoalId}\n${progressText}\n${blockingText}`;
    },
    
    /**
     * Get next action recommendations
     */
    getNextActions(result: ChainAnalysisResult): string[] {
        const actions: string[] = [];
        
        if (result.blocking.nextUnblockableGoals.length > 0) {
            actions.push(`Start work on: ${result.blocking.nextUnblockableGoals.join(', ')}`);
        }
        
        if (result.blocking.parallelOpportunities.length > 0) {
            const canStart = result.blocking.parallelOpportunities
                .filter(opp => opp.canStartNow)
                .map(opp => opp.goalId);
            
            if (canStart.length > 0) {
                actions.push(`Can work in parallel: ${canStart.join(', ')}`);
            }
        }
        
        if (result.optimizations.length > 0) {
            const topOptimization = result.optimizations[0];
            actions.push(`Optimization: ${topOptimization.title}`);
        }
        
        return actions;
    }
};