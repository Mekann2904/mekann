/**
 * @abdd.meta
 * path: .pi/extensions/search/repograph/egograph.ts
 * role: k-hop egograph extraction for RepoGraph
 * why: Enable localized subgraph extraction around keywords for code navigation
 * related: .pi/extensions/search/repograph/types.ts, .pi/extensions/search/repograph/query.ts
 * public_api: extractEgograph, formatEgograph, EgographOptions, EgographResult
 * invariants:
 * - extractEgograph always returns nodes within maxNodes limit
 * - Root nodes are always included in result
 * side_effects: None (pure function)
 * failure_modes:
 * - Returns empty result if graph is empty
 * - Returns empty result if no keywords match
 * @abdd.explain
 * overview: k-hop subgraph extraction around keywords from RepoGraph index
 * what_it_does:
 * - Find seed nodes matching keywords
 * - Expand k hops from seed nodes using BFS
 * - Support flattening and summarization of results
 * why_it_exists:
 * - Provide localized context for code understanding
 * - Support RepoGraph-based code localization
 * scope:
 * in: RepoGraphIndex, keywords, options
 * out: EgographResult with nodes, edges, summary
 */

import type { RepoGraphIndex, RepoGraphNode, RepoGraphEdge } from "./types.js";

// ============================================
// Types
// ============================================

/**
 * Options for egograph extraction
 */
export interface EgographOptions {
	/** Keywords to search for seed nodes */
	keywords: string[];
	/** Number of hops from seed nodes (default: 2) */
	k?: number;
	/** Maximum nodes in result (default: 100) */
	maxNodes?: number;
	/** Maximum edges in result (default: 200) */
	maxEdges?: number;
	/** Return flat list vs nested graph */
	flatten?: boolean;
	/** Include LLM-ready summary */
	summarize?: boolean;
	/** Edge types to follow (default: all) */
	edgeTypes?: string[];
}

/**
 * Result of egograph extraction
 */
export interface EgographResult {
	/** Nodes in the extracted subgraph */
	nodes: RepoGraphNode[];
	/** Edges in the extracted subgraph */
	edges: RepoGraphEdge[];
	/** IDs of root/seed nodes */
	rootNodeIds: string[];
	/** Optional summary for LLM context */
	summary?: string;
	/** Extraction metadata */
	metadata: {
		keywordCount: number;
		hops: number;
		totalNodesInGraph: number;
		totalEdgesInGraph: number;
		extractedAt: number;
	};
}

// ============================================
// Main Functions
// ============================================

/**
 * Extract k-hop egograph around keywords
 * @summary キーワード周辺のk-hopサブグラフを抽出
 * @param graph - RepoGraph index
 * @param options - Extraction options
 * @returns Egograph extraction result
 */
export function extractEgograph(
	graph: RepoGraphIndex,
	options: EgographOptions
): EgographResult {
	const {
		keywords,
		k = 2,
		maxNodes = 100,
		maxEdges = 200,
		edgeTypes,
	} = options;

	// Step 1: Find seed nodes matching keywords
	const seedNodeIds = findSeedNodes(graph, keywords);

	// Step 2: BFS expansion k hops
	const { nodes, edges, visitedNodes } = expandKHops(
		graph,
		seedNodeIds,
		{ k, maxNodes, maxEdges, edgeTypes }
	);

	// Step 3: Build summary if requested
	const summary = options.summarize
		? summarizeGraph(nodes, edges, seedNodeIds)
		: undefined;

	return {
		nodes,
		edges,
		rootNodeIds: seedNodeIds,
		summary,
		metadata: {
			keywordCount: keywords.length,
			hops: k,
			totalNodesInGraph: graph.nodes.size,
			totalEdgesInGraph: graph.edges.length,
			extractedAt: Date.now(),
		},
	};
}

/**
 * Format egograph result as human-readable text
 * @summary エゴグラフ結果をテキスト形式でフォーマット
 * @param result - Egograph extraction result
 * @returns Formatted text output
 */
export function formatEgograph(result: EgographResult): string {
	const lines: string[] = [];

	// Header
	lines.push(`# Egograph Extraction Result`);
	lines.push(``);
	lines.push(`- **Root Keywords**: ${result.rootNodeIds.length} seed nodes`);
	lines.push(`- **Nodes**: ${result.nodes.length} / ${result.metadata.totalNodesInGraph}`);
	lines.push(`- **Edges**: ${result.edges.length} / ${result.metadata.totalEdgesInGraph}`);
	lines.push(`- **Hops**: ${result.metadata.hops}`);
	lines.push(``);

	// Summary
	if (result.summary) {
		lines.push(`## Summary`);
		lines.push(``);
		lines.push(result.summary);
		lines.push(``);
	}

	// Root nodes
	lines.push(`## Root Nodes`);
	lines.push(``);
	for (const nodeId of result.rootNodeIds.slice(0, 10)) {
		const node = result.nodes.find(n => n.id === nodeId);
		if (node) {
			lines.push(`- \`${node.file}:${node.line}\` [${node.nodeType}] ${node.symbolName}`);
		}
	}
	if (result.rootNodeIds.length > 10) {
		lines.push(`  ... and ${result.rootNodeIds.length - 10} more`);
	}
	lines.push(``);

	// Definitions
	const defs = result.nodes.filter(n => n.nodeType === "def");
	if (defs.length > 0) {
		lines.push(`## Definitions (${defs.length})`);
		lines.push(``);
		for (const def of defs.slice(0, 15)) {
			lines.push(`- \`${def.file}:${def.line}\` **${def.symbolName}** (${def.symbolKind})`);
		}
		if (defs.length > 15) {
			lines.push(`  ... and ${defs.length - 15} more`);
		}
		lines.push(``);
	}

	// References
	const refs = result.nodes.filter(n => n.nodeType === "ref");
	if (refs.length > 0) {
		lines.push(`## References (${refs.length})`);
		lines.push(``);
		for (const ref of refs.slice(0, 15)) {
			lines.push(`- \`${ref.file}:${ref.line}\` → ${ref.symbolName}`);
		}
		if (refs.length > 15) {
			lines.push(`  ... and ${refs.length - 15} more`);
		}
		lines.push(``);
	}

	return lines.join("\n");
}

// ============================================
// Helper Functions
// ============================================

/**
 * Find seed nodes matching keywords
 */
function findSeedNodes(graph: RepoGraphIndex, keywords: string[]): string[] {
	const seeds: string[] = [];
	const lowerKeywords = keywords.map(k => k.toLowerCase());

	for (const [id, node] of graph.nodes) {
		for (const keyword of lowerKeywords) {
			const symbolMatch = node.symbolName.toLowerCase().includes(keyword);
			const textMatch = node.text.toLowerCase().includes(keyword);

			if (symbolMatch || textMatch) {
				seeds.push(id);
				break;
			}
		}
	}

	return seeds;
}

/**
 * Expand k hops from seed nodes using BFS
 */
function expandKHops(
	graph: RepoGraphIndex,
	seedNodeIds: string[],
	options: {
		k: number;
		maxNodes: number;
		maxEdges: number;
		edgeTypes?: string[];
	}
): {
	nodes: RepoGraphNode[];
	edges: RepoGraphEdge[];
	visitedNodes: Set<string>;
} {
	const { k, maxNodes, maxEdges, edgeTypes } = options;
	const visitedNodes = new Set<string>();
	const visitedEdges = new Set<string>();
	const resultNodes: RepoGraphNode[] = [];
	const resultEdges: RepoGraphEdge[] = [];

	// BFS queue: [nodeId, depth]
	const queue: Array<{ nodeId: string; depth: number }> =
		seedNodeIds.map(id => ({ nodeId: id, depth: 0 }));

	while (queue.length > 0 && resultNodes.length < maxNodes) {
		const { nodeId, depth } = queue.shift()!;

		if (visitedNodes.has(nodeId)) continue;
		visitedNodes.add(nodeId);

		const node = graph.nodes.get(nodeId);
		if (node) {
			resultNodes.push(node);
		}

		if (depth < k) {
			// Add neighbors via edges
			for (const edge of graph.edges) {
				// Filter by edge type if specified
				if (edgeTypes && edgeTypes.length > 0 && !edgeTypes.includes(edge.type)) {
					continue;
				}

				let neighborId: string | null = null;

				if (edge.source === nodeId && !visitedNodes.has(edge.target)) {
					neighborId = edge.target;
				} else if (edge.target === nodeId && !visitedNodes.has(edge.source)) {
					neighborId = edge.source;
				}

				if (neighborId) {
					// Add edge if not already added
					const edgeKey = `${edge.source}->${edge.target}:${edge.type}`;
					if (!visitedEdges.has(edgeKey) && resultEdges.length < maxEdges) {
						visitedEdges.add(edgeKey);
						resultEdges.push(edge);
					}

					queue.push({ nodeId: neighborId, depth: depth + 1 });
				}
			}
		}
	}

	return { nodes: resultNodes, edges: resultEdges, visitedNodes };
}

/**
 * Generate summary for LLM context
 */
function summarizeGraph(
	nodes: RepoGraphNode[],
	edges: RepoGraphEdge[],
	rootNodeIds: string[]
): string {
	const defs = nodes.filter(n => n.nodeType === "def");
	const refs = nodes.filter(n => n.nodeType === "ref");
	const imports = nodes.filter(n => n.nodeType === "import");

	// Count edge types
	const edgeTypeCounts = new Map<string, number>();
	for (const edge of edges) {
		edgeTypeCounts.set(edge.type, (edgeTypeCounts.get(edge.type) || 0) + 1);
	}

	// Extract unique files
	const files = new Set(nodes.map(n => n.file));

	// Get key symbols
	const keySymbols = defs
		.slice(0, 10)
		.map(d => d.symbolName)
		.filter((v, i, a) => a.indexOf(v) === i);

	const parts: string[] = [];

	parts.push(`Found ${defs.length} definitions, ${refs.length} references, ${imports.length} imports across ${files.size} files.`);

	if (keySymbols.length > 0) {
		parts.push(`Key symbols: ${keySymbols.join(", ")}.`);
	}

	const invokeCount = edgeTypeCounts.get("invoke") || 0;
	if (invokeCount > 0) {
		parts.push(`${invokeCount} call relationships identified.`);
	}

	return parts.join(" ");
}
