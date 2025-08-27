/**
 * Circular Dependency Detector utility for dependency management
 * 
 * Specialized utility for detecting, analyzing, and providing solutions for 
 * circular dependencies in goal dependency graphs. Provides clear error messages
 * and actionable suggestions for resolving circular references.
 * 
 * Features:
 * - Fast cycle detection using DFS with coloring
 * - Detailed cycle analysis with path information
 * - Suggestion generation for breaking cycles
 * - Performance optimization for large graphs
 * - Clear, actionable error messages
 * 
 * Stream 2: Circular dependency detection with error messages
 */

import { DependencyGraph, DependencyGraphNode, DependencyGraphEdge } from '../types/DependencyGraph';
import { Dependency } from '../types/Dependency';
import { DependencyStatus } from '../types/DependencyStatus';
import { createLogger } from './logger';

/**
 * Cycle detection result with detailed information
 */
export interface CycleDetectionResult {
    /** Whether any cycles were found */
    hasCycles: boolean;
    
    /** Array of detected cycles (each cycle is an array of goal IDs) */
    cycles: string[][];
    
    /** Goal IDs that are part of any cycle */
    affectedGoalIds: string[];
    
    /** Detailed cycle information */
    cycleDetails: CycleDetail[];
}

/**
 * Detailed information about a specific cycle
 */
export interface CycleDetail {
    /** Unique identifier for this cycle */
    id: string;
    
    /** Goal IDs forming the cycle */
    goalIds: string[];
    
    /** Dependencies involved in the cycle */
    dependencies: Dependency[];
    
    /** Length of the cycle */
    length: number;
    
    /** Severity of the cycle */
    severity: CycleSeverity;
    
    /** Human-readable description */
    description: string;
    
    /** Suggestions for breaking the cycle */
    breakingSuggestions: CycleBreakingSuggestion[];
    
    /** Performance impact assessment */
    impact: CycleImpact;
}

/**
 * Severity levels for cycles
 */
export enum CycleSeverity {
    /** Simple 2-node cycle */
    LOW = 'low',
    
    /** 3-4 node cycle */
    MEDIUM = 'medium',
    
    /** 5+ node cycle or involving critical goals */
    HIGH = 'high',
    
    /** Cycle blocks critical path or involves many goals */
    CRITICAL = 'critical'
}

/**
 * Type alias for cycle severity string values
 */
export type CycleSeverityType = `${CycleSeverity}`;

/**
 * Suggestion for breaking a cycle
 */
export interface CycleBreakingSuggestion {
    /** Type of suggestion */
    type: SuggestionType;
    
    /** Dependencies that could be removed/modified */
    targetDependencies: Dependency[];
    
    /** Expected impact of this change */
    impact: 'minimal' | 'moderate' | 'significant';
    
    /** Human-readable description */
    description: string;
    
    /** Detailed reasoning */
    reasoning: string;
    
    /** Priority/ranking of this suggestion */
    priority: number;
    
    /** Alternative approaches */
    alternatives: string[];
}

/**
 * Types of cycle-breaking suggestions
 */
export enum SuggestionType {
    /** Remove a specific dependency */
    REMOVE_DEPENDENCY = 'remove_dependency',
    
    /** Change dependency to soft type */
    SOFTEN_DEPENDENCY = 'soften_dependency',
    
    /** Break down goals to eliminate dependency */
    RESTRUCTURE_GOALS = 'restructure_goals',
    
    /** Merge goals that are circularly dependent */
    MERGE_GOALS = 'merge_goals',
    
    /** Add intermediate goals to break the cycle */
    ADD_INTERMEDIATE_GOALS = 'add_intermediate_goals'
}

/**
 * Type alias for suggestion type string values
 */
export type SuggestionTypeType = `${SuggestionType}`;

/**
 * Impact assessment for cycles
 */
export interface CycleImpact {
    /** Goals that cannot progress due to this cycle */
    blockedGoals: number;
    
    /** Estimated delay caused by the cycle (in days) */
    estimatedDelay: number;
    
    /** Whether cycle affects critical path */
    affectsCriticalPath: boolean;
    
    /** Ripple effect - goals indirectly affected */
    indirectlyAffectedGoals: number;
}

/**
 * Configuration for cycle detection
 */
export interface CycleDetectorConfig {
    /** Maximum cycle length to report (performance optimization) */
    maxCycleLength: number;
    
    /** Maximum number of cycles to analyze in detail */
    maxCyclesAnalyzed: number;
    
    /** Whether to include soft dependencies in cycle detection */
    includeSoftDependencies: boolean;
    
    /** Whether to generate breaking suggestions */
    generateSuggestions: boolean;
    
    /** Maximum time to spend on analysis (in milliseconds) */
    maxAnalysisTime: number;
}

/**
 * Node state during DFS traversal
 */
enum NodeState {
    /** Not yet visited */
    WHITE = 'white',
    
    /** Currently being processed */
    GRAY = 'gray',
    
    /** Completely processed */
    BLACK = 'black'
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: CycleDetectorConfig = {
    maxCycleLength: 20,
    maxCyclesAnalyzed: 10,
    includeSoftDependencies: false,
    generateSuggestions: true,
    maxAnalysisTime: 5000 // 5 seconds
};

/**
 * Circular Dependency Detector class
 */
export class CircularDependencyDetector {
    private config: CycleDetectorConfig;
    private logger = createLogger('CircularDependencyDetector');
    
    constructor(config: Partial<CycleDetectorConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        
        this.logger.debug('[CircularDependencyDetector] Initialized with config', this.config);
    }

    // ===========================================
    // Main Detection Methods
    // ===========================================

    /**
     * Detect cycles in a dependency graph
     */
    detectCycles(graph: DependencyGraph): CycleDetectionResult {
        const startTime = Date.now();
        
        try {
            this.logger.debug('[CircularDependencyDetector] Starting cycle detection', {
                nodeCount: graph.nodes.size,
                edgeCount: graph.edges.size
            });
            
            const nodeStates = new Map<string, NodeState>();
            const parent = new Map<string, string | null>();
            const discoveredCycles: string[][] = [];
            const visitedInCurrentPath = new Set<string>();
            
            // Initialize all nodes as unvisited
            for (const nodeId of graph.nodes.keys()) {
                nodeStates.set(nodeId, NodeState.WHITE);
                parent.set(nodeId, null);
            }
            
            // Run DFS from each unvisited node
            for (const nodeId of graph.nodes.keys()) {
                if (nodeStates.get(nodeId) === NodeState.WHITE) {
                    this.dfsDetectCycle(
                        graph,
                        nodeId,
                        nodeStates,
                        parent,
                        visitedInCurrentPath,
                        discoveredCycles,
                        startTime
                    );
                    
                    // Check timeout
                    if (Date.now() - startTime > this.config.maxAnalysisTime) {
                        this.logger.warn('[CircularDependencyDetector] Analysis timeout reached');
                        break;
                    }
                }
            }
            
            // Process discovered cycles
            const uniqueCycles = this.removeDuplicateCycles(discoveredCycles);
            const affectedGoalIds = this.getAffectedGoalIds(uniqueCycles);
            
            // Generate detailed cycle information
            const cycleDetails = this.config.generateSuggestions 
                ? this.analyzeCyclesDetailed(graph, uniqueCycles)
                : [];
            
            const result: CycleDetectionResult = {
                hasCycles: uniqueCycles.length > 0,
                cycles: uniqueCycles,
                affectedGoalIds,
                cycleDetails
            };
            
            this.logger.info('[CircularDependencyDetector] Cycle detection completed', {
                hasCycles: result.hasCycles,
                cycleCount: uniqueCycles.length,
                affectedGoals: affectedGoalIds.length,
                duration: Date.now() - startTime
            });
            
            return result;
            
        } catch (error) {
            this.logger.error('[CircularDependencyDetector] Error during cycle detection', {
                error: error instanceof Error ? error.message : error
            });
            
            // Return safe fallback result
            return {
                hasCycles: false,
                cycles: [],
                affectedGoalIds: [],
                cycleDetails: []
            };
        }
    }

    /**
     * Quick check if adding a dependency would create a cycle
     */
    wouldCreateCycle(
        graph: DependencyGraph,
        fromGoalId: string,
        toGoalId: string
    ): {
        wouldCreateCycle: boolean;
        cyclePreview?: string[];
        explanation?: string;
    } {
        try {
            this.logger.debug('[CircularDependencyDetector] Checking potential cycle', {
                from: fromGoalId,
                to: toGoalId
            });
            
            // Quick self-reference check
            if (fromGoalId === toGoalId) {
                return {
                    wouldCreateCycle: true,
                    cyclePreview: [fromGoalId, toGoalId],
                    explanation: 'A goal cannot depend on itself'
                };
            }
            
            // Check if there's already a path from toGoalId back to fromGoalId
            const pathBack = this.findPathBetweenNodes(graph, toGoalId, fromGoalId);
            
            if (pathBack && pathBack.length > 0) {
                const cyclePreview = [...pathBack, toGoalId];
                
                return {
                    wouldCreateCycle: true,
                    cyclePreview,
                    explanation: `Adding this dependency would create a cycle: ${cyclePreview.join(' → ')}`
                };
            }
            
            return {
                wouldCreateCycle: false
            };
            
        } catch (error) {
            this.logger.error('[CircularDependencyDetector] Error checking potential cycle', {
                from: fromGoalId,
                to: toGoalId,
                error: error instanceof Error ? error.message : error
            });
            
            // Conservative approach: assume it would create a cycle
            return {
                wouldCreateCycle: true,
                explanation: 'Unable to verify cycle safety'
            };
        }
    }

    /**
     * Analyze a specific cycle and provide breaking suggestions
     */
    analyzeCycle(graph: DependencyGraph, cycle: string[]): CycleDetail {
        try {
            this.logger.debug('[CircularDependencyDetector] Analyzing specific cycle', { cycle });
            
            // Get dependencies involved in the cycle
            const dependencies = this.getDependenciesInCycle(graph, cycle);
            
            // Calculate severity
            const severity = this.calculateCycleSeverity(graph, cycle, dependencies);
            
            // Generate description
            const description = this.generateCycleDescription(graph, cycle);
            
            // Generate breaking suggestions
            const breakingSuggestions = this.generateBreakingSuggestions(graph, cycle, dependencies);
            
            // Assess impact
            const impact = this.assessCycleImpact(graph, cycle);
            
            const detail: CycleDetail = {
                id: `cycle_${cycle.join('_')}`,
                goalIds: cycle,
                dependencies,
                length: cycle.length,
                severity: severity as CycleSeverity,
                description,
                breakingSuggestions,
                impact
            };
            
            return detail;
            
        } catch (error) {
            this.logger.error('[CircularDependencyDetector] Error analyzing cycle', {
                cycle,
                error: error instanceof Error ? error.message : error
            });
            
            // Return minimal detail
            return {
                id: `cycle_error_${Date.now()}`,
                goalIds: cycle,
                dependencies: [],
                length: cycle.length,
                severity: CycleSeverity.MEDIUM,
                description: `Circular dependency detected involving ${cycle.length} goals`,
                breakingSuggestions: [],
                impact: {
                    blockedGoals: cycle.length,
                    estimatedDelay: 0,
                    affectsCriticalPath: false,
                    indirectlyAffectedGoals: 0
                }
            };
        }
    }

    // ===========================================
    // Private Helper Methods
    // ===========================================

    /**
     * DFS-based cycle detection with coloring
     */
    private dfsDetectCycle(
        graph: DependencyGraph,
        nodeId: string,
        nodeStates: Map<string, NodeState>,
        parent: Map<string, string | null>,
        visitedInCurrentPath: Set<string>,
        discoveredCycles: string[][],
        startTime: number
    ): void {
        // Check timeout
        if (Date.now() - startTime > this.config.maxAnalysisTime) {
            return;
        }
        
        nodeStates.set(nodeId, NodeState.GRAY);
        visitedInCurrentPath.add(nodeId);
        
        // Explore all neighbors
        for (const edge of graph.edges.values()) {
            if (!this.shouldConsiderEdge(edge)) {
                continue;
            }
            
            if (edge.source === nodeId) {
                const neighbor = edge.target;
                const neighborState = nodeStates.get(neighbor);
                
                if (neighborState === NodeState.GRAY) {
                    // Back edge found - cycle detected
                    const cycle = this.extractCycle(visitedInCurrentPath, neighbor, nodeId);
                    
                    if (cycle.length <= this.config.maxCycleLength) {
                        discoveredCycles.push(cycle);
                        
                        if (discoveredCycles.length >= this.config.maxCyclesAnalyzed) {
                            this.logger.warn('[CircularDependencyDetector] Maximum cycles analyzed limit reached');
                            return;
                        }
                    }
                } else if (neighborState === NodeState.WHITE) {
                    parent.set(neighbor, nodeId);
                    this.dfsDetectCycle(
                        graph,
                        neighbor,
                        nodeStates,
                        parent,
                        visitedInCurrentPath,
                        discoveredCycles,
                        startTime
                    );
                }
            }
        }
        
        nodeStates.set(nodeId, NodeState.BLACK);
        visitedInCurrentPath.delete(nodeId);
    }

    /**
     * Extract cycle from the current DFS path
     */
    private extractCycle(visitedInCurrentPath: Set<string>, cycleStart: string, cycleEnd: string): string[] {
        const pathArray = Array.from(visitedInCurrentPath);
        const startIndex = pathArray.indexOf(cycleStart);
        const endIndex = pathArray.indexOf(cycleEnd);
        
        if (startIndex === -1 || endIndex === -1) {
            return [];
        }
        
        const cycle = pathArray.slice(startIndex, endIndex + 1);
        cycle.push(cycleStart); // Complete the cycle
        
        return cycle;
    }

    /**
     * Check if an edge should be considered in cycle detection
     */
    private shouldConsiderEdge(edge: DependencyGraphEdge): boolean {
        // Only consider active dependencies
        if (edge.dependency.status !== DependencyStatus.ACTIVE) {
            return false;
        }
        
        // Check if soft dependencies should be included
        if (!this.config.includeSoftDependencies) {
            const dependencyType = edge.dependency.metadata?.type;
            if (dependencyType === 'soft' || dependencyType === 'informational') {
                return false;
            }
        }
        
        return true;
    }

    /**
     * Remove duplicate cycles from the discovered list
     */
    private removeDuplicateCycles(cycles: string[][]): string[][] {
        const uniqueCycles: string[][] = [];
        const seenCycles = new Set<string>();
        
        for (const cycle of cycles) {
            // Normalize cycle (start from smallest node to make comparison consistent)
            const normalized = this.normalizeCycle(cycle);
            const cycleKey = normalized.join('->');
            
            if (!seenCycles.has(cycleKey)) {
                seenCycles.add(cycleKey);
                uniqueCycles.push(normalized);
            }
        }
        
        return uniqueCycles;
    }

    /**
     * Normalize a cycle to start from the lexicographically smallest node
     */
    private normalizeCycle(cycle: string[]): string[] {
        if (cycle.length <= 1) {
            return cycle;
        }
        
        // Remove the duplicate last element if it's the same as first
        let normalizedCycle = [...cycle];
        if (normalizedCycle.length > 1 && normalizedCycle[0] === normalizedCycle[normalizedCycle.length - 1]) {
            normalizedCycle = normalizedCycle.slice(0, -1);
        }
        
        // Find the index of the smallest element
        let minIndex = 0;
        for (let i = 1; i < normalizedCycle.length; i++) {
            if (normalizedCycle[i] < normalizedCycle[minIndex]) {
                minIndex = i;
            }
        }
        
        // Rotate the array to start from the smallest element
        return [
            ...normalizedCycle.slice(minIndex),
            ...normalizedCycle.slice(0, minIndex)
        ];
    }

    /**
     * Get all goal IDs affected by any cycle
     */
    private getAffectedGoalIds(cycles: string[][]): string[] {
        const affectedIds = new Set<string>();
        
        for (const cycle of cycles) {
            for (const goalId of cycle) {
                affectedIds.add(goalId);
            }
        }
        
        return Array.from(affectedIds);
    }

    /**
     * Analyze cycles in detail
     */
    private analyzeCyclesDetailed(graph: DependencyGraph, cycles: string[][]): CycleDetail[] {
        const details: CycleDetail[] = [];
        
        for (const cycle of cycles) {
            const detail = this.analyzeCycle(graph, cycle);
            details.push(detail);
        }
        
        // Sort by severity and impact
        details.sort((a, b) => {
            const severityOrder = {
                [CycleSeverity.CRITICAL]: 4,
                [CycleSeverity.HIGH]: 3,
                [CycleSeverity.MEDIUM]: 2,
                [CycleSeverity.LOW]: 1
            };
            
            const aSeverity = severityOrder[a.severity as CycleSeverity];
            const bSeverity = severityOrder[b.severity as CycleSeverity];
            
            if (aSeverity !== bSeverity) {
                return bSeverity - aSeverity; // Higher severity first
            }
            
            return b.impact.blockedGoals - a.impact.blockedGoals; // More blocked goals first
        });
        
        return details;
    }

    /**
     * Find path between two nodes using BFS
     */
    private findPathBetweenNodes(graph: DependencyGraph, startId: string, endId: string): string[] | null {
        if (startId === endId) {
            return [startId];
        }
        
        const queue: Array<{ nodeId: string; path: string[] }> = [{ nodeId: startId, path: [startId] }];
        const visited = new Set<string>();
        
        while (queue.length > 0) {
            const { nodeId, path } = queue.shift()!;
            
            if (visited.has(nodeId)) {
                continue;
            }
            
            visited.add(nodeId);
            
            // Explore neighbors
            for (const edge of graph.edges.values()) {
                if (edge.source === nodeId && this.shouldConsiderEdge(edge)) {
                    const neighbor = edge.target;
                    
                    if (neighbor === endId) {
                        return [...path, neighbor];
                    }
                    
                    if (!visited.has(neighbor)) {
                        queue.push({
                            nodeId: neighbor,
                            path: [...path, neighbor]
                        });
                    }
                }
            }
        }
        
        return null; // No path found
    }

    /**
     * Get dependencies involved in a cycle
     */
    private getDependenciesInCycle(graph: DependencyGraph, cycle: string[]): Dependency[] {
        const dependencies: Dependency[] = [];
        
        for (let i = 0; i < cycle.length - 1; i++) {
            const source = cycle[i];
            const target = cycle[i + 1];
            
            for (const edge of graph.edges.values()) {
                if (edge.source === source && edge.target === target) {
                    dependencies.push(edge.dependency);
                    break;
                }
            }
        }
        
        return dependencies;
    }

    /**
     * Calculate severity of a cycle
     */
    private calculateCycleSeverity(
        graph: DependencyGraph,
        cycle: string[],
        dependencies: Dependency[]
    ): CycleSeverityType {
        // Factor 1: Cycle length
        if (cycle.length >= 6) {
            return CycleSeverity.CRITICAL;
        }
        
        // Factor 2: Priority of involved dependencies
        const maxPriority = Math.max(...dependencies.map(d => d.metadata?.priority || 3));
        if (maxPriority >= 5) {
            return CycleSeverity.HIGH;
        }
        
        // Factor 3: Number of goals blocked by this cycle
        let blockedGoalsCount = 0;
        for (const goalId of cycle) {
            for (const edge of graph.edges.values()) {
                if (edge.source === goalId && edge.dependency.status === DependencyStatus.ACTIVE) {
                    blockedGoalsCount++;
                }
            }
        }
        
        if (blockedGoalsCount > 10) {
            return CycleSeverity.CRITICAL;
        } else if (blockedGoalsCount > 5) {
            return CycleSeverity.HIGH;
        }
        
        // Factor 4: Cycle complexity
        if (cycle.length >= 4) {
            return CycleSeverity.MEDIUM;
        }
        
        return CycleSeverity.LOW;
    }

    /**
     * Generate human-readable description for a cycle
     */
    private generateCycleDescription(graph: DependencyGraph, cycle: string[]): string {
        const goalTitles: string[] = [];
        
        for (const goalId of cycle) {
            const node = graph.nodes.get(goalId);
            goalTitles.push(node?.title || goalId);
        }
        
        if (cycle.length === 2) {
            return `Mutual dependency between "${goalTitles[0]}" and "${goalTitles[1]}"`;
        } else {
            return `Circular dependency chain: ${goalTitles.join(' → ')} → ${goalTitles[0]}`;
        }
    }

    /**
     * Generate suggestions for breaking a cycle
     */
    private generateBreakingSuggestions(
        graph: DependencyGraph,
        cycle: string[],
        dependencies: Dependency[]
    ): CycleBreakingSuggestion[] {
        const suggestions: CycleBreakingSuggestion[] = [];
        
        // Suggestion 1: Remove the weakest dependency
        const weakestDependency = this.findWeakestDependency(dependencies);
        if (weakestDependency) {
            suggestions.push({
                type: SuggestionType.REMOVE_DEPENDENCY,
                targetDependencies: [weakestDependency],
                impact: 'minimal',
                description: `Remove the dependency from "${this.getGoalTitle(graph, weakestDependency.blockingGoalId)}" to "${this.getGoalTitle(graph, weakestDependency.blockedGoalId)}"`,
                reasoning: 'This dependency has the lowest priority or least impact on the overall workflow',
                priority: 1,
                alternatives: ['Change to a soft dependency instead of removing completely']
            });
        }
        
        // Suggestion 2: Soften dependencies
        const hardDependencies = dependencies.filter(d => d.metadata?.type === 'hard' || !d.metadata?.type);
        if (hardDependencies.length > 0) {
            suggestions.push({
                type: SuggestionType.SOFTEN_DEPENDENCY,
                targetDependencies: hardDependencies,
                impact: 'moderate',
                description: 'Convert hard dependencies to soft dependencies to allow parallel work',
                reasoning: 'Soft dependencies provide guidance without strictly blocking progress',
                priority: 2,
                alternatives: ['Use informational dependencies for awareness only']
            });
        }
        
        // Suggestion 3: Restructure goals
        if (cycle.length <= 4) {
            suggestions.push({
                type: SuggestionType.RESTRUCTURE_GOALS,
                targetDependencies: dependencies,
                impact: 'significant',
                description: 'Break down one or more goals into smaller, independent tasks',
                reasoning: 'Smaller goals often have clearer dependencies and are less likely to create cycles',
                priority: 3,
                alternatives: ['Merge related goals to eliminate internal dependencies']
            });
        }
        
        // Suggestion 4: Add intermediate goals
        if (cycle.length === 2) {
            suggestions.push({
                type: SuggestionType.ADD_INTERMEDIATE_GOALS,
                targetDependencies: dependencies,
                impact: 'moderate',
                description: 'Add intermediate goals to create a clear sequence instead of circular dependency',
                reasoning: 'Breaking the direct cycle with intermediate steps often reveals the natural order',
                priority: 4,
                alternatives: ['Define shared prerequisites that both goals depend on']
            });
        }
        
        // Sort suggestions by priority
        suggestions.sort((a, b) => a.priority - b.priority);
        
        return suggestions;
    }

    /**
     * Find the weakest dependency in a set
     */
    private findWeakestDependency(dependencies: Dependency[]): Dependency | null {
        if (dependencies.length === 0) {
            return null;
        }
        
        // Score dependencies based on priority, type, and age
        let lowestScore = Infinity;
        let weakestDependency: Dependency | null = null;
        
        for (const dependency of dependencies) {
            let score = 0;
            
            // Lower priority = weaker dependency
            score += (dependency.metadata?.priority || 3) * 2;
            
            // Soft dependencies are weaker
            if (dependency.metadata?.type === 'soft') {
                score -= 2;
            } else if (dependency.metadata?.type === 'informational') {
                score -= 4;
            }
            
            // Newer dependencies might be less critical
            const ageInDays = (Date.now() - new Date(dependency.createdAt).getTime()) / (1000 * 60 * 60 * 24);
            if (ageInDays < 7) {
                score -= 1;
            }
            
            if (score < lowestScore) {
                lowestScore = score;
                weakestDependency = dependency;
            }
        }
        
        return weakestDependency;
    }

    /**
     * Assess the impact of a cycle
     */
    private assessCycleImpact(graph: DependencyGraph, cycle: string[]): CycleImpact {
        let blockedGoals = cycle.length; // At minimum, all goals in the cycle are blocked
        let indirectlyAffectedGoals = 0;
        let affectsCriticalPath = false;
        
        // Count goals blocked by cycle participants
        for (const goalId of cycle) {
            for (const edge of graph.edges.values()) {
                if (edge.source === goalId && edge.dependency.status === DependencyStatus.ACTIVE) {
                    if (!cycle.includes(edge.target)) {
                        indirectlyAffectedGoals++;
                    }
                }
            }
        }
        
        // Check if any cycle participants are on critical paths
        const rootNodes = graph.metadata.rootNodes || [];
        const leafNodes = graph.metadata.leafNodes || [];
        
        for (const goalId of cycle) {
            if (rootNodes.includes(goalId) || leafNodes.includes(goalId)) {
                affectsCriticalPath = true;
                break;
            }
        }
        
        // Estimate delay (simple heuristic)
        const estimatedDelay = cycle.length * 2; // Assume 2 days per goal to resolve
        
        return {
            blockedGoals,
            estimatedDelay,
            affectsCriticalPath,
            indirectlyAffectedGoals
        };
    }

    /**
     * Get goal title for display
     */
    private getGoalTitle(graph: DependencyGraph, goalId: string): string {
        const node = graph.nodes.get(goalId);
        return node?.title || goalId;
    }

    // ===========================================
    // Public Configuration Methods
    // ===========================================

    /**
     * Update detector configuration
     */
    updateConfig(newConfig: Partial<CycleDetectorConfig>): void {
        this.config = { ...this.config, ...newConfig };
        this.logger.debug('[CircularDependencyDetector] Configuration updated', this.config);
    }

    /**
     * Get current configuration
     */
    getConfig(): CycleDetectorConfig {
        return { ...this.config };
    }
}

/**
 * Factory function to create a CircularDependencyDetector instance
 */
export function createCircularDependencyDetector(config?: Partial<CycleDetectorConfig>): CircularDependencyDetector {
    return new CircularDependencyDetector(config);
}

/**
 * Utility functions for working with cycles
 */
export const CycleUtils = {
    /**
     * Check if a cycle is critical based on its properties
     */
    isCriticalCycle(cycleDetail: CycleDetail): boolean {
        return cycleDetail.severity === CycleSeverity.CRITICAL || 
               cycleDetail.impact.affectsCriticalPath ||
               cycleDetail.impact.blockedGoals > 10;
    },
    
    /**
     * Get the most impactful suggestion for breaking a cycle
     */
    getBestBreakingSuggestion(cycleDetail: CycleDetail): CycleBreakingSuggestion | null {
        if (cycleDetail.breakingSuggestions.length === 0) {
            return null;
        }
        
        // Return the highest priority (lowest number) suggestion
        return cycleDetail.breakingSuggestions.reduce((best, current) => 
            current.priority < best.priority ? current : best
        );
    },
    
    /**
     * Format cycle for display
     */
    formatCycleForDisplay(cycleDetail: CycleDetail): string {
        const severity = cycleDetail.severity.toUpperCase();
        const length = cycleDetail.length;
        const blockedCount = cycleDetail.impact.blockedGoals;
        
        return `[${severity}] ${length}-node cycle blocking ${blockedCount} goals: ${cycleDetail.description}`;
    }
};