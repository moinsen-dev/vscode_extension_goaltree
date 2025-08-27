/**
 * Dependency graph representation types for the Goal Tree extension
 * Defines structures for visualizing and analyzing dependency relationships
 */

import { Dependency } from './Dependency';
import { ID } from './common';

/**
 * Node in a dependency graph representing a goal
 */
export interface DependencyGraphNode {
  /** Goal ID */
  id: string;
  
  /** Goal title for display */
  title: string;
  
  /** Goal status */
  status: string;
  
  /** Visual properties for rendering */
  visual: {
    /** X coordinate for layout */
    x?: number;
    
    /** Y coordinate for layout */
    y?: number;
    
    /** Color for the node */
    color?: string;
    
    /** Size of the node */
    size?: number;
    
    /** Shape of the node */
    shape?: 'circle' | 'square' | 'diamond' | 'triangle';
    
    /** Whether the node is selected */
    selected?: boolean;
    
    /** Whether the node is highlighted */
    highlighted?: boolean;
  };
  
  /** Additional metadata */
  metadata?: {
    /** Number of direct dependencies */
    dependencyCount: number;
    
    /** Number of goals this blocks */
    blockingCount: number;
    
    /** Depth in the dependency hierarchy */
    depth: number;
    
    /** Whether this node is part of a cycle */
    isInCycle?: boolean;
    
    /** Priority level */
    priority?: number;
    
    /** Due date */
    dueDate?: Date;
  };
}

/**
 * Edge in a dependency graph representing a blocking relationship
 */
export interface DependencyGraphEdge {
  /** Unique identifier for this edge */
  id: string;
  
  /** Source node (blocking goal) */
  source: string;
  
  /** Target node (blocked goal) */
  target: string;
  
  /** Associated dependency relationship */
  dependency: Dependency;
  
  /** Visual properties for rendering */
  visual: {
    /** Color of the edge */
    color?: string;
    
    /** Thickness/weight of the edge */
    weight?: number;
    
    /** Style of the line */
    style?: 'solid' | 'dashed' | 'dotted';
    
    /** Arrow type */
    arrowType?: 'arrow' | 'triangle' | 'circle';
    
    /** Whether the edge is selected */
    selected?: boolean;
    
    /** Whether the edge is highlighted */
    highlighted?: boolean;
  };
  
  /** Additional metadata */
  metadata?: {
    /** Whether this is a direct or transitive dependency */
    isDirect: boolean;
    
    /** Length of the dependency path */
    pathLength: number;
    
    /** Whether this edge is part of a critical path */
    isCritical?: boolean;
    
    /** Estimated impact of removing this dependency */
    impact?: 'low' | 'medium' | 'high';
  };
}

/**
 * Complete dependency graph structure
 */
export interface DependencyGraph {
  /** All nodes in the graph */
  nodes: Map<string, DependencyGraphNode>;
  
  /** All edges in the graph */
  edges: Map<string, DependencyGraphEdge>;
  
  /** Graph metadata */
  metadata: {
    /** Total number of nodes */
    nodeCount: number;
    
    /** Total number of edges */
    edgeCount: number;
    
    /** Whether the graph has cycles */
    hasCycles: boolean;
    
    /** List of detected cycles */
    cycles: string[][];
    
    /** Maximum depth in the graph */
    maxDepth: number;
    
    /** Root nodes (no dependencies) */
    rootNodes: string[];
    
    /** Leaf nodes (no blocking relationships) */
    leafNodes: string[];
    
    /** When the graph was last updated */
    lastUpdated: Date;
  };
  
  /** Layout information */
  layout?: {
    /** Type of layout algorithm used */
    algorithm: 'hierarchical' | 'force' | 'circular' | 'tree' | 'manual';
    
    /** Layout-specific parameters */
    parameters?: Record<string, any>;
    
    /** Bounding box of the layout */
    bounds?: {
      minX: number;
      minY: number;
      maxX: number;
      maxY: number;
    };
  };
}

/**
 * Dependency path between two goals
 */
export interface DependencyPath {
  /** Source goal ID */
  sourceId: string;
  
  /** Target goal ID */
  targetId: string;
  
  /** Array of goal IDs in the path */
  path: string[];
  
  /** Array of dependency relationships in the path */
  dependencies: Dependency[];
  
  /** Total length of the path */
  length: number;
  
  /** Whether this is the shortest path */
  isShortestPath: boolean;
  
  /** Whether this path contains cycles */
  hasCycle: boolean;
  
  /** Estimated time to resolve this path */
  estimatedResolutionTime?: number;
}

/**
 * Dependency cluster - group of highly connected goals
 */
export interface DependencyCluster {
  /** Unique identifier for the cluster */
  id: string;
  
  /** Goal IDs in this cluster */
  goalIds: string[];
  
  /** Dependency relationships within the cluster */
  internalDependencies: Dependency[];
  
  /** Dependencies from outside the cluster */
  incomingDependencies: Dependency[];
  
  /** Dependencies to outside the cluster */
  outgoingDependencies: Dependency[];
  
  /** Cluster metadata */
  metadata: {
    /** Density of connections within cluster */
    density: number;
    
    /** Centrality score */
    centrality: number;
    
    /** Whether this cluster is critical */
    isCritical: boolean;
  };
}

/**
 * Graph analysis result
 */
export interface DependencyGraphAnalysis {
  /** Basic statistics */
  statistics: {
    /** Total nodes */
    nodeCount: number;
    
    /** Total edges */
    edgeCount: number;
    
    /** Graph density (edges / possible edges) */
    density: number;
    
    /** Average degree (connections per node) */
    averageDegree: number;
    
    /** Longest dependency chain */
    longestChain: number;
  };
  
  /** Cycle detection results */
  cycles: {
    /** Whether cycles exist */
    hasCycles: boolean;
    
    /** All detected cycles */
    cycleList: string[][];
    
    /** Suggestions for breaking cycles */
    breakingSuggestions: Array<{
      dependency: Dependency;
      impact: 'low' | 'medium' | 'high';
      reason: string;
    }>;
  };
  
  /** Critical path analysis */
  criticalPaths: {
    /** Longest paths in the graph */
    longestPaths: DependencyPath[];
    
    /** Most critical dependencies */
    criticalDependencies: Dependency[];
    
    /** Bottleneck nodes */
    bottlenecks: string[];
  };
  
  /** Clustering results */
  clusters: DependencyCluster[];
  
  /** Node importance rankings */
  importance: Array<{
    goalId: string;
    score: number;
    reasons: string[];
  }>;
}

/**
 * Graph traversal options
 */
export interface GraphTraversalOptions {
  /** Starting node ID */
  startNodeId: string;
  
  /** Traversal direction */
  direction: 'forward' | 'backward' | 'both';
  
  /** Maximum depth to traverse */
  maxDepth?: number;
  
  /** Filter function for nodes */
  nodeFilter?: (node: DependencyGraphNode) => boolean;
  
  /** Filter function for edges */
  edgeFilter?: (edge: DependencyGraphEdge) => boolean;
  
  /** Whether to include cycles in traversal */
  includeCycles?: boolean;
}

/**
 * Graph traversal result
 */
export interface GraphTraversalResult {
  /** Visited nodes in order */
  visitedNodes: string[];
  
  /** Traversed edges */
  traversedEdges: DependencyGraphEdge[];
  
  /** Paths found */
  paths: DependencyPath[];
  
  /** Cycles encountered */
  cycles: string[][];
  
  /** Maximum depth reached */
  maxDepthReached: number;
}

/**
 * Graph layout options
 */
export interface GraphLayoutOptions {
  /** Layout algorithm to use */
  algorithm: 'hierarchical' | 'force' | 'circular' | 'tree' | 'manual';
  
  /** Algorithm-specific parameters */
  parameters?: {
    /** Force layout parameters */
    force?: {
      linkDistance?: number;
      linkStrength?: number;
      nodeStrength?: number;
      iterations?: number;
    };
    
    /** Hierarchical layout parameters */
    hierarchical?: {
      direction?: 'top-down' | 'bottom-up' | 'left-right' | 'right-left';
      levelSeparation?: number;
      nodeSeparation?: number;
      rankSeparation?: number;
    };
    
    /** Circular layout parameters */
    circular?: {
      radius?: number;
      startAngle?: number;
      clockwise?: boolean;
    };
  };
  
  /** Layout constraints */
  constraints?: {
    /** Fixed positions for specific nodes */
    fixedPositions?: Map<string, { x: number; y: number }>;
    
    /** Minimum distance between nodes */
    minNodeDistance?: number;
    
    /** Canvas bounds */
    bounds?: { width: number; height: number };
  };
}

/**
 * Helper functions for working with dependency graphs
 */
export const DependencyGraphUtils = {
  /**
   * Create an empty dependency graph
   */
  createEmpty(): DependencyGraph {
    return {
      nodes: new Map(),
      edges: new Map(),
      metadata: {
        nodeCount: 0,
        edgeCount: 0,
        hasCycles: false,
        cycles: [],
        maxDepth: 0,
        rootNodes: [],
        leafNodes: [],
        lastUpdated: new Date()
      }
    };
  },

  /**
   * Check if a graph has cycles
   */
  hasCycles(graph: DependencyGraph): boolean {
    return graph.metadata.hasCycles;
  },

  /**
   * Get all paths between two nodes
   */
  getAllPaths(graph: DependencyGraph, sourceId: string, targetId: string): DependencyPath[] {
    // Implementation would use graph traversal algorithms
    // This is a placeholder for the actual implementation
    return [];
  },

  /**
   * Calculate graph density
   */
  calculateDensity(graph: DependencyGraph): number {
    const nodeCount = graph.metadata.nodeCount;
    const edgeCount = graph.metadata.edgeCount;
    
    if (nodeCount <= 1) return 0;
    
    const maxPossibleEdges = nodeCount * (nodeCount - 1);
    return edgeCount / maxPossibleEdges;
  },

  /**
   * Find strongly connected components
   */
  findStronglyConnectedComponents(graph: DependencyGraph): string[][] {
    // Implementation would use Tarjan's algorithm
    // This is a placeholder for the actual implementation
    return [];
  },

  /**
   * Get node centrality scores
   */
  calculateCentrality(graph: DependencyGraph): Map<string, number> {
    // Implementation would calculate betweenness or PageRank centrality
    // This is a placeholder for the actual implementation
    return new Map();
  }
};