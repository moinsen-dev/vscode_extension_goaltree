/**
 * Graph Algorithms utility for dependency management
 * 
 * Provides efficient graph traversal and analysis algorithms for dependency graphs.
 * Optimized for performance with complex goal hierarchies and large dependency networks.
 * 
 * Features:
 * - Shortest path finding (Dijkstra's algorithm)
 * - Depth-first and breadth-first traversal
 * - Topological sorting
 * - Strongly connected components detection
 * - Critical path analysis
 * - Graph metrics calculation
 * 
 * Stream 2: Graph analysis utilities for dependency resolution
 */

import { 
    DependencyGraph, 
    DependencyGraphNode, 
    DependencyGraphEdge,
    DependencyPath,
    DependencyCluster,
    DependencyGraphAnalysis,
    GraphTraversalOptions,
    GraphTraversalResult
} from '../types/DependencyGraph';
import { Dependency } from '../types/Dependency';
import { DependencyStatus } from '../types/DependencyStatus';
import { createLogger } from './logger';

/**
 * Priority queue implementation for Dijkstra's algorithm
 */
class PriorityQueue<T> {
    private items: Array<{ element: T; priority: number }> = [];
    
    enqueue(element: T, priority: number): void {
        const item = { element, priority };
        let added = false;
        
        for (let i = 0; i < this.items.length; i++) {
            if (item.priority < this.items[i].priority) {
                this.items.splice(i, 0, item);
                added = true;
                break;
            }
        }
        
        if (!added) {
            this.items.push(item);
        }
    }
    
    dequeue(): T | null {
        if (this.items.length === 0) {
            return null;
        }
        return this.items.shift()!.element;
    }
    
    isEmpty(): boolean {
        return this.items.length === 0;
    }
}

/**
 * Graph traversal result for internal use
 */
interface InternalTraversalResult {
    visited: Set<string>;
    distances: Map<string, number>;
    predecessors: Map<string, string | null>;
    paths: DependencyPath[];
}

/**
 * Graph Algorithms utility class
 */
export class GraphAlgorithms {
    private logger = createLogger('GraphAlgorithms');
    
    // ===========================================
    // Path Finding Algorithms
    // ===========================================

    /**
     * Find the shortest path between two nodes using Dijkstra's algorithm
     */
    findShortestPath(graph: DependencyGraph, sourceId: string, targetId: string): DependencyPath | null {
        try {
            this.logger.debug('[GraphAlgorithms] Finding shortest path', { sourceId, targetId });
            
            if (!graph.nodes.has(sourceId) || !graph.nodes.has(targetId)) {
                this.logger.warn('[GraphAlgorithms] Source or target node not found', { sourceId, targetId });
                return null;
            }
            
            if (sourceId === targetId) {
                return {
                    sourceId,
                    targetId,
                    path: [sourceId],
                    dependencies: [],
                    length: 0,
                    isShortestPath: true,
                    hasCycle: false
                };
            }
            
            const distances = new Map<string, number>();
            const predecessors = new Map<string, string | null>();
            const visited = new Set<string>();
            const queue = new PriorityQueue<string>();
            
            // Initialize distances
            for (const nodeId of graph.nodes.keys()) {
                distances.set(nodeId, nodeId === sourceId ? 0 : Infinity);
                predecessors.set(nodeId, null);
            }
            
            queue.enqueue(sourceId, 0);
            
            while (!queue.isEmpty()) {
                const currentNode = queue.dequeue();
                if (!currentNode || visited.has(currentNode)) {
                    continue;
                }
                
                visited.add(currentNode);
                
                if (currentNode === targetId) {
                    break; // Found target, can stop early
                }
                
                const currentDistance = distances.get(currentNode) || 0;
                
                // Check all outgoing edges (dependencies where current node is blocking)
                for (const edge of graph.edges.values()) {
                    if (edge.source === currentNode && edge.dependency.status === DependencyStatus.ACTIVE) {
                        const neighbor = edge.target;
                        const weight = edge.visual.weight || 1;
                        const newDistance = currentDistance + weight;
                        
                        if (newDistance < (distances.get(neighbor) || Infinity)) {
                            distances.set(neighbor, newDistance);
                            predecessors.set(neighbor, currentNode);
                            
                            if (!visited.has(neighbor)) {
                                queue.enqueue(neighbor, newDistance);
                            }
                        }
                    }
                }
            }
            
            // Reconstruct path
            const path = this.reconstructPath(predecessors, sourceId, targetId);
            if (path.length === 0) {
                return null; // No path found
            }
            
            // Get dependencies along the path
            const dependencies = this.getDependenciesForPath(graph, path);
            
            return {
                sourceId,
                targetId,
                path,
                dependencies,
                length: path.length - 1,
                isShortestPath: true,
                hasCycle: this.pathHasCycle(path)
            };
            
        } catch (error) {
            this.logger.error('[GraphAlgorithms] Error finding shortest path', { 
                sourceId, 
                targetId, 
                error: error instanceof Error ? error.message : error 
            });
            return null;
        }
    }

    /**
     * Find all paths between two nodes (with depth limit)
     */
    findAllPaths(
        graph: DependencyGraph, 
        sourceId: string, 
        targetId: string, 
        maxDepth: number = 10
    ): DependencyPath[] {
        try {
            this.logger.debug('[GraphAlgorithms] Finding all paths', { sourceId, targetId, maxDepth });
            
            if (!graph.nodes.has(sourceId) || !graph.nodes.has(targetId)) {
                return [];
            }
            
            const allPaths: DependencyPath[] = [];
            const visited = new Set<string>();
            
            const dfs = (currentNode: string, currentPath: string[], depth: number) => {
                if (depth > maxDepth) {
                    return;
                }
                
                if (currentNode === targetId) {
                    const completePath = [...currentPath, currentNode];
                    const dependencies = this.getDependenciesForPath(graph, completePath);
                    
                    allPaths.push({
                        sourceId,
                        targetId,
                        path: completePath,
                        dependencies,
                        length: completePath.length - 1,
                        isShortestPath: false, // Will be determined later
                        hasCycle: this.pathHasCycle(completePath)
                    });
                    return;
                }
                
                if (visited.has(currentNode)) {
                    return; // Avoid cycles
                }
                
                visited.add(currentNode);
                
                // Explore neighbors
                for (const edge of graph.edges.values()) {
                    if (edge.source === currentNode && edge.dependency.status === DependencyStatus.ACTIVE) {
                        dfs(edge.target, [...currentPath, currentNode], depth + 1);
                    }
                }
                
                visited.delete(currentNode);
            };
            
            dfs(sourceId, [], 0);
            
            // Mark shortest paths
            if (allPaths.length > 0) {
                const minLength = Math.min(...allPaths.map(p => p.length));
                allPaths.forEach(path => {
                    path.isShortestPath = path.length === minLength;
                });
            }
            
            return allPaths;
            
        } catch (error) {
            this.logger.error('[GraphAlgorithms] Error finding all paths', { 
                sourceId, 
                targetId, 
                error: error instanceof Error ? error.message : error 
            });
            return [];
        }
    }

    // ===========================================
    // Graph Traversal Algorithms
    // ===========================================

    /**
     * Perform depth-first search traversal
     */
    depthFirstSearch(graph: DependencyGraph, options: GraphTraversalOptions): GraphTraversalResult {
        try {
            this.logger.debug('[GraphAlgorithms] Starting DFS traversal', options);
            
            const result: GraphTraversalResult = {
                visitedNodes: [],
                traversedEdges: [],
                paths: [],
                cycles: [],
                maxDepthReached: 0
            };
            
            const visited = new Set<string>();
            const recursionStack = new Set<string>();
            
            const dfs = (nodeId: string, depth: number) => {
                if (options.maxDepth && depth > options.maxDepth) {
                    return;
                }
                
                result.maxDepthReached = Math.max(result.maxDepthReached, depth);
                
                // Check for cycles
                if (recursionStack.has(nodeId)) {
                    if (options.includeCycles) {
                        // Record the cycle
                        const cycleStart = result.visitedNodes.indexOf(nodeId);
                        if (cycleStart >= 0) {
                            const cycle = result.visitedNodes.slice(cycleStart).concat([nodeId]);
                            result.cycles.push(cycle);
                        }
                    }
                    return;
                }
                
                if (visited.has(nodeId)) {
                    return;
                }
                
                const node = graph.nodes.get(nodeId);
                if (!node || (options.nodeFilter && !options.nodeFilter(node))) {
                    return;
                }
                
                visited.add(nodeId);
                recursionStack.add(nodeId);
                result.visitedNodes.push(nodeId);
                
                // Explore neighbors based on direction
                const edges = this.getEdgesForTraversal(graph, nodeId, options.direction);
                
                for (const edge of edges) {
                    if (options.edgeFilter && !options.edgeFilter(edge)) {
                        continue;
                    }
                    
                    result.traversedEdges.push(edge);
                    
                    const nextNode = options.direction === 'backward' ? edge.source : edge.target;
                    dfs(nextNode, depth + 1);
                }
                
                recursionStack.delete(nodeId);
            };
            
            dfs(options.startNodeId, 0);
            
            return result;
            
        } catch (error) {
            this.logger.error('[GraphAlgorithms] Error in DFS traversal', { 
                options, 
                error: error instanceof Error ? error.message : error 
            });
            throw error;
        }
    }

    /**
     * Perform breadth-first search traversal
     */
    breadthFirstSearch(graph: DependencyGraph, options: GraphTraversalOptions): GraphTraversalResult {
        try {
            this.logger.debug('[GraphAlgorithms] Starting BFS traversal', options);
            
            const result: GraphTraversalResult = {
                visitedNodes: [],
                traversedEdges: [],
                paths: [],
                cycles: [],
                maxDepthReached: 0
            };
            
            const visited = new Set<string>();
            const queue: Array<{ nodeId: string; depth: number }> = [];
            
            queue.push({ nodeId: options.startNodeId, depth: 0 });
            
            while (queue.length > 0) {
                const { nodeId, depth } = queue.shift()!;
                
                if (options.maxDepth && depth > options.maxDepth) {
                    continue;
                }
                
                result.maxDepthReached = Math.max(result.maxDepthReached, depth);
                
                if (visited.has(nodeId)) {
                    continue;
                }
                
                const node = graph.nodes.get(nodeId);
                if (!node || (options.nodeFilter && !options.nodeFilter(node))) {
                    continue;
                }
                
                visited.add(nodeId);
                result.visitedNodes.push(nodeId);
                
                // Explore neighbors
                const edges = this.getEdgesForTraversal(graph, nodeId, options.direction);
                
                for (const edge of edges) {
                    if (options.edgeFilter && !options.edgeFilter(edge)) {
                        continue;
                    }
                    
                    result.traversedEdges.push(edge);
                    
                    const nextNode = options.direction === 'backward' ? edge.source : edge.target;
                    if (!visited.has(nextNode)) {
                        queue.push({ nodeId: nextNode, depth: depth + 1 });
                    }
                }
            }
            
            return result;
            
        } catch (error) {
            this.logger.error('[GraphAlgorithms] Error in BFS traversal', { 
                options, 
                error: error instanceof Error ? error.message : error 
            });
            throw error;
        }
    }

    // ===========================================
    // Topological Sorting
    // ===========================================

    /**
     * Perform topological sort of the dependency graph
     * Returns nodes in dependency order (dependencies first)
     */
    topologicalSort(graph: DependencyGraph): string[] {
        try {
            this.logger.debug('[GraphAlgorithms] Performing topological sort');
            
            const inDegree = new Map<string, number>();
            const result: string[] = [];
            
            // Initialize in-degrees
            for (const nodeId of graph.nodes.keys()) {
                inDegree.set(nodeId, 0);
            }
            
            // Calculate in-degrees (number of incoming edges)
            for (const edge of graph.edges.values()) {
                if (edge.dependency.status === DependencyStatus.ACTIVE) {
                    const currentDegree = inDegree.get(edge.target) || 0;
                    inDegree.set(edge.target, currentDegree + 1);
                }
            }
            
            // Find nodes with no incoming edges
            const queue: string[] = [];
            for (const [nodeId, degree] of inDegree.entries()) {
                if (degree === 0) {
                    queue.push(nodeId);
                }
            }
            
            // Process nodes
            while (queue.length > 0) {
                const currentNode = queue.shift()!;
                result.push(currentNode);
                
                // Update in-degrees of neighbors
                for (const edge of graph.edges.values()) {
                    if (edge.source === currentNode && edge.dependency.status === DependencyStatus.ACTIVE) {
                        const neighborDegree = inDegree.get(edge.target) || 0;
                        inDegree.set(edge.target, neighborDegree - 1);
                        
                        if (neighborDegree - 1 === 0) {
                            queue.push(edge.target);
                        }
                    }
                }
            }
            
            // Check if all nodes were processed (no cycles)
            if (result.length !== graph.nodes.size) {
                this.logger.warn('[GraphAlgorithms] Topological sort incomplete - cycles detected', {
                    processed: result.length,
                    total: graph.nodes.size
                });
            }
            
            return result;
            
        } catch (error) {
            this.logger.error('[GraphAlgorithms] Error in topological sort', { 
                error: error instanceof Error ? error.message : error 
            });
            throw error;
        }
    }

    // ===========================================
    // Strongly Connected Components
    // ===========================================

    /**
     * Find strongly connected components using Tarjan's algorithm
     */
    findStronglyConnectedComponents(graph: DependencyGraph): string[][] {
        try {
            this.logger.debug('[GraphAlgorithms] Finding strongly connected components');
            
            const indices = new Map<string, number>();
            const lowLinks = new Map<string, number>();
            const onStack = new Set<string>();
            const stack: string[] = [];
            const components: string[][] = [];
            let index = 0;
            
            const tarjan = (nodeId: string) => {
                indices.set(nodeId, index);
                lowLinks.set(nodeId, index);
                index++;
                stack.push(nodeId);
                onStack.add(nodeId);
                
                // Explore neighbors
                for (const edge of graph.edges.values()) {
                    if (edge.source === nodeId && edge.dependency.status === DependencyStatus.ACTIVE) {
                        const neighbor = edge.target;
                        
                        if (!indices.has(neighbor)) {
                            tarjan(neighbor);
                            lowLinks.set(nodeId, Math.min(
                                lowLinks.get(nodeId) || 0,
                                lowLinks.get(neighbor) || 0
                            ));
                        } else if (onStack.has(neighbor)) {
                            lowLinks.set(nodeId, Math.min(
                                lowLinks.get(nodeId) || 0,
                                indices.get(neighbor) || 0
                            ));
                        }
                    }
                }
                
                // If nodeId is a root node, pop the stack and create component
                if (lowLinks.get(nodeId) === indices.get(nodeId)) {
                    const component: string[] = [];
                    let stackNode: string;
                    
                    do {
                        stackNode = stack.pop()!;
                        onStack.delete(stackNode);
                        component.push(stackNode);
                    } while (stackNode !== nodeId);
                    
                    components.push(component);
                }
            };
            
            // Run Tarjan's algorithm on all unvisited nodes
            for (const nodeId of graph.nodes.keys()) {
                if (!indices.has(nodeId)) {
                    tarjan(nodeId);
                }
            }
            
            return components;
            
        } catch (error) {
            this.logger.error('[GraphAlgorithms] Error finding strongly connected components', { 
                error: error instanceof Error ? error.message : error 
            });
            throw error;
        }
    }

    // ===========================================
    // Graph Analysis
    // ===========================================

    /**
     * Analyze the dependency graph and provide comprehensive metrics
     */
    analyzeGraph(graph: DependencyGraph): DependencyGraphAnalysis {
        try {
            this.logger.debug('[GraphAlgorithms] Analyzing dependency graph');
            
            const analysis: DependencyGraphAnalysis = {
                statistics: this.calculateGraphStatistics(graph),
                cycles: this.analyzeCycles(graph),
                criticalPaths: this.analyzeCriticalPaths(graph),
                clusters: this.findClusters(graph),
                importance: this.calculateNodeImportance(graph)
            };
            
            return analysis;
            
        } catch (error) {
            this.logger.error('[GraphAlgorithms] Error analyzing graph', { 
                error: error instanceof Error ? error.message : error 
            });
            throw error;
        }
    }

    /**
     * Calculate basic graph statistics
     */
    private calculateGraphStatistics(graph: DependencyGraph) {
        const nodeCount = graph.nodes.size;
        const edgeCount = graph.edges.size;
        const maxPossibleEdges = nodeCount * (nodeCount - 1);
        
        // Calculate average degree
        const degrees = new Map<string, number>();
        for (const nodeId of graph.nodes.keys()) {
            degrees.set(nodeId, 0);
        }
        
        for (const edge of graph.edges.values()) {
            const sourceDegree = degrees.get(edge.source) || 0;
            const targetDegree = degrees.get(edge.target) || 0;
            degrees.set(edge.source, sourceDegree + 1);
            degrees.set(edge.target, targetDegree + 1);
        }
        
        const totalDegree = Array.from(degrees.values()).reduce((sum, degree) => sum + degree, 0);
        const averageDegree = nodeCount > 0 ? totalDegree / nodeCount : 0;
        
        // Calculate longest chain
        const longestChain = this.findLongestChain(graph);
        
        return {
            nodeCount,
            edgeCount,
            density: maxPossibleEdges > 0 ? edgeCount / maxPossibleEdges : 0,
            averageDegree,
            longestChain
        };
    }

    /**
     * Analyze cycles in the graph
     */
    private analyzeCycles(graph: DependencyGraph) {
        const components = this.findStronglyConnectedComponents(graph);
        const cycleList = components.filter(component => component.length > 1);
        
        const breakingSuggestions = cycleList.flatMap(cycle => {
            // For each cycle, suggest the least impactful edge to remove
            const cycleEdges: DependencyGraphEdge[] = [];
            
            for (let i = 0; i < cycle.length; i++) {
                const currentNode = cycle[i];
                const nextNode = cycle[(i + 1) % cycle.length];
                
                for (const edge of graph.edges.values()) {
                    if (edge.source === currentNode && edge.target === nextNode) {
                        cycleEdges.push(edge);
                        break;
                    }
                }
            }
            
            return cycleEdges.map(edge => ({
                dependency: edge.dependency,
                impact: this.assessDependencyImpact(graph, edge) as 'low' | 'medium' | 'high',
                reason: `Removing this dependency would break the cycle: ${cycle.join(' → ')}`
            }));
        });
        
        return {
            hasCycles: cycleList.length > 0,
            cycleList,
            breakingSuggestions
        };
    }

    /**
     * Analyze critical paths in the graph
     */
    private analyzeCriticalPaths(graph: DependencyGraph) {
        const longestPaths: DependencyPath[] = [];
        const criticalDependencies: Dependency[] = [];
        const bottlenecks: string[] = [];
        
        // Find nodes with high in-degree (bottlenecks)
        const inDegrees = new Map<string, number>();
        for (const nodeId of graph.nodes.keys()) {
            inDegrees.set(nodeId, 0);
        }
        
        for (const edge of graph.edges.values()) {
            const currentDegree = inDegrees.get(edge.target) || 0;
            inDegrees.set(edge.target, currentDegree + 1);
        }
        
        const averageInDegree = Array.from(inDegrees.values()).reduce((sum, degree) => sum + degree, 0) / graph.nodes.size;
        
        for (const [nodeId, degree] of inDegrees.entries()) {
            if (degree > averageInDegree * 2) {
                bottlenecks.push(nodeId);
            }
        }
        
        // Find longest paths from root nodes
        const rootNodes = graph.metadata.rootNodes;
        for (const rootNode of rootNodes) {
            const paths = this.findLongestPathsFromNode(graph, rootNode);
            longestPaths.push(...paths);
        }
        
        // Identify critical dependencies (on longest paths)
        for (const path of longestPaths) {
            criticalDependencies.push(...path.dependencies);
        }
        
        return {
            longestPaths,
            criticalDependencies,
            bottlenecks
        };
    }

    /**
     * Find clusters in the graph
     */
    private findClusters(graph: DependencyGraph): DependencyCluster[] {
        const components = this.findStronglyConnectedComponents(graph);
        const clusters: DependencyCluster[] = [];
        
        for (let i = 0; i < components.length; i++) {
            const component = components[i];
            if (component.length < 2) continue; // Skip single-node clusters
            
            const internalDependencies: Dependency[] = [];
            const incomingDependencies: Dependency[] = [];
            const outgoingDependencies: Dependency[] = [];
            
            for (const edge of graph.edges.values()) {
                const sourceInCluster = component.includes(edge.source);
                const targetInCluster = component.includes(edge.target);
                
                if (sourceInCluster && targetInCluster) {
                    internalDependencies.push(edge.dependency);
                } else if (sourceInCluster && !targetInCluster) {
                    outgoingDependencies.push(edge.dependency);
                } else if (!sourceInCluster && targetInCluster) {
                    incomingDependencies.push(edge.dependency);
                }
            }
            
            const possibleInternalEdges = component.length * (component.length - 1);
            const density = possibleInternalEdges > 0 ? internalDependencies.length / possibleInternalEdges : 0;
            
            clusters.push({
                id: `cluster_${i}`,
                goalIds: component,
                internalDependencies,
                incomingDependencies,
                outgoingDependencies,
                metadata: {
                    density,
                    centrality: this.calculateClusterCentrality(graph, component),
                    isCritical: density > 0.5 || component.length > 5
                }
            });
        }
        
        return clusters;
    }

    /**
     * Calculate node importance rankings
     */
    private calculateNodeImportance(graph: DependencyGraph) {
        const importance: Array<{ goalId: string; score: number; reasons: string[] }> = [];
        
        for (const nodeId of graph.nodes.keys()) {
            const node = graph.nodes.get(nodeId)!;
            const reasons: string[] = [];
            let score = 0;
            
            // Factor 1: Number of dependencies (blocking others)
            const blockingCount = node.metadata?.blockingCount || 0;
            score += blockingCount * 2;
            if (blockingCount > 0) {
                reasons.push(`Blocks ${blockingCount} other goals`);
            }
            
            // Factor 2: Being blocked by many goals
            const dependencyCount = node.metadata?.dependencyCount || 0;
            score += dependencyCount;
            if (dependencyCount > 0) {
                reasons.push(`Depends on ${dependencyCount} goals`);
            }
            
            // Factor 3: Depth in hierarchy
            const depth = node.metadata?.depth || 0;
            score += depth * 0.5;
            if (depth > 2) {
                reasons.push(`Deep in dependency chain (depth ${depth})`);
            }
            
            // Factor 4: Part of cycles
            if (node.metadata?.isInCycle) {
                score += 5;
                reasons.push('Part of circular dependency');
            }
            
            // Factor 5: Priority
            const priority = node.metadata?.priority || 3;
            score += priority;
            if (priority > 3) {
                reasons.push(`High priority (${priority})`);
            }
            
            importance.push({ goalId: nodeId, score, reasons });
        }
        
        // Sort by importance score (descending)
        importance.sort((a, b) => b.score - a.score);
        
        return importance;
    }

    // ===========================================
    // Helper Methods
    // ===========================================

    /**
     * Reconstruct path from predecessors map
     */
    private reconstructPath(
        predecessors: Map<string, string | null>, 
        sourceId: string, 
        targetId: string
    ): string[] {
        const path: string[] = [];
        let currentNode: string | null = targetId;
        
        while (currentNode !== null) {
            path.unshift(currentNode);
            currentNode = predecessors.get(currentNode) || null;
            
            if (currentNode === sourceId) {
                path.unshift(sourceId);
                break;
            }
        }
        
        return path[0] === sourceId ? path : [];
    }

    /**
     * Get dependencies for a path
     */
    private getDependenciesForPath(graph: DependencyGraph, path: string[]): Dependency[] {
        const dependencies: Dependency[] = [];
        
        for (let i = 0; i < path.length - 1; i++) {
            const source = path[i];
            const target = path[i + 1];
            
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
     * Check if a path has cycles
     */
    private pathHasCycle(path: string[]): boolean {
        const seen = new Set<string>();
        for (const nodeId of path) {
            if (seen.has(nodeId)) {
                return true;
            }
            seen.add(nodeId);
        }
        return false;
    }

    /**
     * Get edges for traversal based on direction
     */
    private getEdgesForTraversal(
        graph: DependencyGraph, 
        nodeId: string, 
        direction: 'forward' | 'backward' | 'both'
    ): DependencyGraphEdge[] {
        const edges: DependencyGraphEdge[] = [];
        
        for (const edge of graph.edges.values()) {
            if (direction === 'forward' || direction === 'both') {
                if (edge.source === nodeId) {
                    edges.push(edge);
                }
            }
            
            if (direction === 'backward' || direction === 'both') {
                if (edge.target === nodeId) {
                    edges.push(edge);
                }
            }
        }
        
        return edges;
    }

    /**
     * Find the longest chain in the graph
     */
    private findLongestChain(graph: DependencyGraph): number {
        let maxChain = 0;
        
        for (const nodeId of graph.nodes.keys()) {
            const chainLength = this.calculateChainLength(graph, nodeId);
            maxChain = Math.max(maxChain, chainLength);
        }
        
        return maxChain;
    }

    /**
     * Calculate chain length from a specific node
     */
    private calculateChainLength(graph: DependencyGraph, startNodeId: string): number {
        const visited = new Set<string>();
        
        const dfs = (nodeId: string): number => {
            if (visited.has(nodeId)) {
                return 0; // Avoid cycles
            }
            
            visited.add(nodeId);
            let maxLength = 0;
            
            for (const edge of graph.edges.values()) {
                if (edge.source === nodeId && edge.dependency.status === DependencyStatus.ACTIVE) {
                    const length = dfs(edge.target);
                    maxLength = Math.max(maxLength, length);
                }
            }
            
            visited.delete(nodeId);
            return maxLength + 1;
        };
        
        return dfs(startNodeId) - 1; // Subtract 1 because we count edges, not nodes
    }

    /**
     * Find longest paths from a node
     */
    private findLongestPathsFromNode(graph: DependencyGraph, startNodeId: string): DependencyPath[] {
        const paths: DependencyPath[] = [];
        const visited = new Set<string>();
        
        const dfs = (nodeId: string, currentPath: string[]) => {
            if (visited.has(nodeId)) {
                return; // Avoid cycles
            }
            
            visited.add(nodeId);
            let hasOutgoing = false;
            
            for (const edge of graph.edges.values()) {
                if (edge.source === nodeId && edge.dependency.status === DependencyStatus.ACTIVE) {
                    hasOutgoing = true;
                    dfs(edge.target, [...currentPath, nodeId]);
                }
            }
            
            // If no outgoing edges, this is a leaf - record the path
            if (!hasOutgoing && currentPath.length > 0) {
                const completePath = [...currentPath, nodeId];
                const dependencies = this.getDependenciesForPath(graph, completePath);
                
                paths.push({
                    sourceId: startNodeId,
                    targetId: nodeId,
                    path: completePath,
                    dependencies,
                    length: completePath.length - 1,
                    isShortestPath: false,
                    hasCycle: false
                });
            }
            
            visited.delete(nodeId);
        };
        
        dfs(startNodeId, []);
        
        // Sort by length and return top paths
        return paths.sort((a, b) => b.length - a.length).slice(0, 5);
    }

    /**
     * Assess the impact of removing a dependency
     */
    private assessDependencyImpact(graph: DependencyGraph, edge: DependencyGraphEdge): string {
        // Simple heuristic: base impact on priority and connection count
        const priority = edge.dependency.metadata?.priority || 3;
        
        let connectionCount = 0;
        for (const otherEdge of graph.edges.values()) {
            if (otherEdge.source === edge.source || otherEdge.target === edge.target) {
                connectionCount++;
            }
        }
        
        if (priority >= 4 || connectionCount > 5) {
            return 'high';
        } else if (priority >= 3 || connectionCount > 2) {
            return 'medium';
        } else {
            return 'low';
        }
    }

    /**
     * Calculate centrality for a cluster
     */
    private calculateClusterCentrality(graph: DependencyGraph, clusterNodes: string[]): number {
        let totalCentrality = 0;
        
        for (const nodeId of clusterNodes) {
            let nodeCentrality = 0;
            
            // Count connections to this node
            for (const edge of graph.edges.values()) {
                if (edge.source === nodeId || edge.target === nodeId) {
                    nodeCentrality++;
                }
            }
            
            totalCentrality += nodeCentrality;
        }
        
        return clusterNodes.length > 0 ? totalCentrality / clusterNodes.length : 0;
    }
}

/**
 * Factory function to create a GraphAlgorithms instance
 */
export function createGraphAlgorithms(): GraphAlgorithms {
    return new GraphAlgorithms();
}