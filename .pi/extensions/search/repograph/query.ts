/**
 * @abdd.meta
 * path: .pi/extensions/search/repograph/query.ts
 * role: RepoGraph query functions for searching nodes and traversing edges
 * why: Enable efficient lookups and graph traversals for code localization
 * related: .pi/extensions/search/repograph/builder.ts, .pi/extensions/search/repograph/types.ts
 * public_api: findNodesBySymbol, findNodesByFile, findDefinitions, findReferences, findRelatedNodes
 * invariants:
 * - Searches are case-insensitive for symbol names
 * - Related node traversal respects depth limit
 * - Results are deduplicated by node ID
 * side_effects: None
 * failure_modes: None (empty results for missing data)
 * @abdd.explain
 * overview: Query functions for RepoGraph indices
 * what_it_does:
 * - Search nodes by symbol name with pattern matching
 * - Filter nodes by file path
 * - Find all definitions or references for a symbol
 * - Traverse k-hop neighborhood for related nodes
 * why_it_exists:
 * - Support code localization queries
 * - Enable context extraction for LLMs
 * - Provide efficient graph search operations
 * scope:
 * in: RepoGraphIndex, search parameters
 * out: Matching nodes and edges
 */

import type {
	RepoGraphIndex,
	RepoGraphNode,
	RepoGraphEdge,
} from "./types.js";

/**
 * Options for related node search
 */
export interface FindRelatedOptions {
	/** Maximum traversal depth (default: 2) */
	depth?: number;
	/** Maximum number of results (default: 100) */
	limit?: number;
	/** Edge types to follow (default: all) */
	edgeTypes?: string[];
	/** Include source node in results (default: true) */
	includeSource?: boolean;
}

/**
 * Result of related node search
 */
export interface RelatedNodeResult {
	/** Found nodes */
	nodes: RepoGraphNode[];
	/** Traversed edges */
	edges: RepoGraphEdge[];
	/** Source node ID */
	sourceId: string;
	/** Actual depth reached */
	depthReached: number;
}

/**
 * Find nodes by symbol name (case-insensitive partial match)
 * @summary Search nodes by symbol name
 * @param graph - RepoGraph index
 * @param symbolName - Symbol name pattern to search
 * @returns Array of matching nodes
 * @example
 * const nodes = findNodesBySymbol(graph, "parse");
 * // Returns all nodes with "parse" in symbolName
 */
export function findNodesBySymbol(
	graph: RepoGraphIndex,
	symbolName: string
): RepoGraphNode[] {
	const results: RepoGraphNode[] = [];
	const searchLower = symbolName.toLowerCase();

	for (const node of graph.nodes.values()) {
		if (node.symbolName.toLowerCase().includes(searchLower)) {
			results.push(node);
		}
	}

	return results;
}

/**
 * Find nodes by file path (exact or partial match)
 * @summary Search nodes by file path
 * @param graph - RepoGraph index
 * @param filePath - File path pattern to search
 * @returns Array of matching nodes
 * @example
 * const nodes = findNodesByFile(graph, "src/utils");
 * // Returns all nodes from files matching "src/utils"
 */
export function findNodesByFile(
	graph: RepoGraphIndex,
	filePath: string
): RepoGraphNode[] {
	const results: RepoGraphNode[] = [];

	for (const node of graph.nodes.values()) {
		if (node.file.includes(filePath)) {
			results.push(node);
		}
	}

	// Sort by line number
	results.sort((a, b) => {
		if (a.file !== b.file) return a.file.localeCompare(b.file);
		return a.line - b.line;
	});

	return results;
}

/**
 * Find all definition nodes for a symbol
 * @summary Find symbol definitions
 * @param graph - RepoGraph index
 * @param symbolName - Symbol name (exact or partial)
 * @param exact - Require exact match (default: false)
 * @returns Array of definition nodes
 * @example
 * const defs = findDefinitions(graph, "buildRepoGraph");
 * // Returns definition nodes for buildRepoGraph
 */
export function findDefinitions(
	graph: RepoGraphIndex,
	symbolName: string,
	exact: boolean = false
): RepoGraphNode[] {
	const results: RepoGraphNode[] = [];
	const searchLower = symbolName.toLowerCase();

	for (const node of graph.nodes.values()) {
		if (node.nodeType !== "def") continue;

		const matches = exact
			? node.symbolName.toLowerCase() === searchLower
			: node.symbolName.toLowerCase().includes(searchLower);

		if (matches) {
			results.push(node);
		}
	}

	return results;
}

/**
 * Find all reference nodes for a symbol
 * @summary Find symbol references
 * @param graph - RepoGraph index
 * @param symbolName - Symbol name (exact or partial)
 * @param exact - Require exact match (default: false)
 * @returns Array of reference nodes
 * @example
 * const refs = findReferences(graph, "buildRepoGraph");
 * // Returns reference (call) nodes for buildRepoGraph
 */
export function findReferences(
	graph: RepoGraphIndex,
	symbolName: string,
	exact: boolean = false
): RepoGraphNode[] {
	const results: RepoGraphNode[] = [];
	const searchLower = symbolName.toLowerCase();

	for (const node of graph.nodes.values()) {
		if (node.nodeType !== "ref") continue;

		const matches = exact
			? node.symbolName.toLowerCase() === searchLower
			: node.symbolName.toLowerCase().includes(searchLower);

		if (matches) {
			results.push(node);
		}
	}

	return results;
}

/**
 * Find nodes related to a source node via graph edges
 * @summary Traverse k-hop neighborhood
 * @param graph - RepoGraph index
 * @param nodeId - Source node ID
 * @param options - Search options
 * @returns Related nodes and edges
 * @example
 * const result = findRelatedNodes(graph, "src/index.ts:10", { depth: 2 });
 * // Returns nodes within 2 hops of the source
 */
export function findRelatedNodes(
	graph: RepoGraphIndex,
	nodeId: string,
	options: FindRelatedOptions = {}
): RelatedNodeResult {
	const {
		depth = 2,
		limit = 100,
		edgeTypes,
		includeSource = true,
	} = options;

	const visited = new Set<string>();
	const resultNodes: RepoGraphNode[] = [];
	const resultEdges: RepoGraphEdge[] = [];

	// Build adjacency lists for efficient traversal
	const outgoing = new Map<string, RepoGraphEdge[]>();
	const incoming = new Map<string, RepoGraphEdge[]>();

	for (const edge of graph.edges) {
		// Filter by edge types if specified
		if (edgeTypes && !edgeTypes.includes(edge.type)) continue;

		// Skip low-confidence edges
		if (edge.confidence < 0.5) continue;

		if (!outgoing.has(edge.source)) {
			outgoing.set(edge.source, []);
		}
		outgoing.get(edge.source)!.push(edge);

		if (!incoming.has(edge.target)) {
			incoming.set(edge.target, []);
		}
		incoming.get(edge.target)!.push(edge);
	}

	// BFS traversal
	const queue: Array<{ id: string; d: number }> = [{ id: nodeId, d: 0 }];
	let maxDepth = 0;

	while (queue.length > 0 && resultNodes.length < limit) {
		const { id, d } = queue.shift()!;

		if (visited.has(id)) continue;
		visited.add(id);

		if (d > depth) continue;

		const node = graph.nodes.get(id);
		if (node) {
			if (includeSource || id !== nodeId) {
				resultNodes.push(node);
			}
			maxDepth = Math.max(maxDepth, d);
		}

		// Add outgoing neighbors
		const outEdges = outgoing.get(id) || [];
		for (const edge of outEdges) {
			if (!visited.has(edge.target)) {
				resultEdges.push(edge);
				queue.push({ id: edge.target, d: d + 1 });
			}
		}

		// Add incoming neighbors
		const inEdges = incoming.get(id) || [];
		for (const edge of inEdges) {
			if (!visited.has(edge.source)) {
				resultEdges.push(edge);
				queue.push({ id: edge.source, d: d + 1 });
			}
		}
	}

	return {
		nodes: resultNodes,
		edges: resultEdges,
		sourceId: nodeId,
		depthReached: maxDepth,
	};
}

/**
 * Find all edges connected to a node
 * @summary Get edges for a node
 * @param graph - RepoGraph index
 * @param nodeId - Node ID
 * @returns Array of connected edges
 */
export function findEdgesForNode(
	graph: RepoGraphIndex,
	nodeId: string
): RepoGraphEdge[] {
	return graph.edges.filter(
		(edge) => edge.source === nodeId || edge.target === nodeId
	);
}

/**
 * Find call edges (invoke type) for a symbol
 * @summary Find call edges for symbol
 * @param graph - RepoGraph index
 * @param symbolName - Symbol name
 * @returns Array of invoke edges
 */
export function findCallEdges(
	graph: RepoGraphIndex,
	symbolName: string
): RepoGraphEdge[] {
	const symbolNodes = findDefinitions(graph, symbolName, true);
	const nodeIds = new Set(symbolNodes.map((n) => n.id));

	return graph.edges.filter(
		(edge) =>
			edge.type === "invoke" &&
			(nodeIds.has(edge.source) || nodeIds.has(edge.target))
	);
}

/**
 * Get statistics about the graph
 * @summary Calculate graph statistics
 * @param graph - RepoGraph index
 * @returns Statistics object
 */
export function getGraphStats(graph: RepoGraphIndex): {
	totalNodes: number;
	totalEdges: number;
	nodesByType: Record<string, number>;
	edgesByType: Record<string, number>;
	uniqueFiles: number;
	uniqueSymbols: number;
} {
	const nodesByType: Record<string, number> = {};
	const edgesByType: Record<string, number> = {};
	const files = new Set<string>();
	const symbols = new Set<string>();

	for (const node of graph.nodes.values()) {
		nodesByType[node.nodeType] = (nodesByType[node.nodeType] || 0) + 1;
		files.add(node.file);
		symbols.add(node.symbolName);
	}

	for (const edge of graph.edges) {
		edgesByType[edge.type] = (edgesByType[edge.type] || 0) + 1;
	}

	return {
		totalNodes: graph.nodes.size,
		totalEdges: graph.edges.length,
		nodesByType,
		edgesByType,
		uniqueFiles: files.size,
		uniqueSymbols: symbols.size,
	};
}
