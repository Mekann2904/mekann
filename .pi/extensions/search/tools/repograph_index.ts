/**
 * @abdd.meta
 * path: .pi/extensions/search/tools/repograph_index.ts
 * role: Tool for building and updating RepoGraph index
 * why: Enable line-level dependency graph construction for code navigation
 * related: .pi/extensions/search/repograph/builder.ts, .pi/extensions/search/repograph/storage.ts
 * public_api: repographIndex, repographQuery, formatRepoGraphIndex, formatRepoGraphQuery
 * invariants:
 * - Creates .pi/search/repograph/ directory if not exists
 * - Overwrites existing index on rebuild
 * side_effects:
 * - Creates/updates files in .pi/search/repograph/
 * - May take significant time for large repos
 * failure_modes:
 * - No source files found: returns empty index
 * - Parse errors: skips problematic files
 * @abdd.explain
 * overview: Tool for building RepoGraph line-level dependency index
 * what_it_does:
 * - Scan repository for source files
 * - Parse files with tree-sitter (when available) or regex fallback
 * - Build dependency graph with def/ref nodes and invoke/contain edges
 * - Persist index to .pi/search/repograph/index.json
 * why_it_exists:
 * - Pre-compute dependency graph for fast search
 * - Support code localization through graph navigation
 * scope:
 * in: path, force options
 * out: Index metadata with stats
 */

import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";
import { buildRepoGraph, getSourceFiles } from "../repograph/builder.js";
import {
	saveRepoGraph,
	loadRepoGraph,
	isRepoGraphStale,
	getRepoGraphPath,
} from "../repograph/storage.js";
import {
	findNodesBySymbol,
	findNodesByFile,
	findDefinitions,
	findReferences,
	findRelatedNodes,
	getGraphStats,
} from "../repograph/query.js";
import type { RepoGraphIndex, RepoGraphNode } from "../repograph/types.js";

// ============================================
// Types
// ============================================

/**
 * Input schema for repograph_index tool
 */
export const RepographIndexInput = Type.Object({
	/** Path to index (default: current directory) */
	path: Type.Optional(
		Type.String({
			description: "Path to index (default: current directory)",
		})
	),
	/** Force rebuild even if index is fresh */
	force: Type.Optional(
		Type.Boolean({
			description: "Force rebuild even if index exists and is fresh",
		})
	),
});

export type RepographIndexInput = Static<typeof RepographIndexInput>;

/**
 * Output schema for repograph_index tool
 */
export interface RepographIndexOutput {
	/** Whether indexing was successful */
	success: boolean;
	/** Error message if unsuccessful */
	error?: string;
	/** Index metadata */
	fileCount: number;
	nodeCount: number;
	edgeCount: number;
	outputPath: string;
}

/**
 * Input schema for repograph_query tool
 */
export const RepographQueryInput = Type.Object({
	/** Query type */
	type: Type.Union(
		[
			Type.Literal("symbol"),
			Type.Literal("file"),
			Type.Literal("definitions"),
			Type.Literal("references"),
			Type.Literal("related"),
			Type.Literal("stats"),
		],
		{ description: "Query type" }
	),
	/** Symbol name (for symbol, definitions, references queries) */
	symbol: Type.Optional(
		Type.String({ description: "Symbol name to search" })
	),
	/** File path filter (for file queries) */
	file: Type.Optional(
		Type.String({ description: "File path filter" })
	),
	/** Node ID for related queries (format: file:line) */
	nodeId: Type.Optional(
		Type.String({ description: "Node ID for related queries" })
	),
	/** Traversal depth for related queries (default: 2) */
	depth: Type.Optional(
		Type.Number({ description: "Traversal depth for related queries" })
	),
	/** Maximum results (default: 100) */
	limit: Type.Optional(
		Type.Number({ description: "Maximum results" })
	),
});

export type RepographQueryInput = Static<typeof RepographQueryInput>;

/**
 * Output schema for repograph_query tool
 */
export interface RepographQueryOutput {
	/** Query type */
	type: string;
	/** Total results */
	total: number;
	/** Whether results were truncated */
	truncated: boolean;
	/** Matching nodes */
	nodes: RepoGraphNode[];
	/** Error message if any */
	error?: string;
}

// ============================================
// Index Functions
// ============================================

/**
 * Build or update RepoGraph index
 * @summary RepoGraphインデックスを構築・更新
 * @param params - Index parameters
 * @param cwd - Current working directory
 * @returns Index result with stats
 */
export async function repographIndex(
	params: RepographIndexInput,
	cwd: string
): Promise<RepographIndexOutput> {
	const targetPath = params.path ?? cwd;
	const indexPath = getRepoGraphPath(cwd);

	try {
		// Check if rebuild is needed
		if (!params.force) {
			const existingIndex = await loadRepoGraph(cwd);
			if (existingIndex && !(await isRepoGraphStale(cwd, targetPath))) {
				return {
					success: true,
					fileCount: existingIndex.metadata.fileCount,
					nodeCount: existingIndex.metadata.nodeCount,
					edgeCount: existingIndex.metadata.edgeCount,
					outputPath: indexPath,
				};
			}
		}

		// Get source files with default extensions
		const extensions = ["ts", "tsx", "js", "jsx", "py"];
		const files = await getSourceFiles(targetPath, cwd);

		if (files.length === 0) {
			return {
				success: false,
				fileCount: 0,
				nodeCount: 0,
				edgeCount: 0,
				outputPath: indexPath,
				error: `No source files found with extensions: ${extensions.join(", ")}`,
			};
		}

		// Build graph
		const graph = await buildRepoGraph(targetPath, cwd);

		// Save index
		await saveRepoGraph(graph, cwd);

		return {
			success: true,
			fileCount: graph.metadata.fileCount,
			nodeCount: graph.metadata.nodeCount,
			edgeCount: graph.metadata.edgeCount,
			outputPath: indexPath,
		};
	} catch (error) {
		return {
			success: false,
			fileCount: 0,
			nodeCount: 0,
			edgeCount: 0,
			outputPath: indexPath,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

/**
 * Format index result for display
 * @summary インデックス結果をフォーマット
 * @param output - Index output
 * @returns Formatted text
 */
export function formatRepoGraphIndex(output: RepographIndexOutput): string {
	if (!output.success) {
		return `## Error\n\n${output.error}`;
	}

	return `## RepoGraph Index Built

| Metric | Value |
|--------|-------|
| Files indexed | ${output.fileCount} |
| Nodes | ${output.nodeCount} |
| Edges | ${output.edgeCount} |
| Index path | \`${output.outputPath}\` |

Use \`repograph_query\` to search the index.`;
}

// ============================================
// Query Functions
// ============================================

/**
 * Query RepoGraph index
 * @summary RepoGraphインデックスをクエリ
 * @param params - Query parameters
 * @param cwd - Current working directory
 * @returns Query result
 */
export async function repographQuery(
	params: RepographQueryInput,
	cwd: string
): Promise<RepographQueryOutput> {
	const graph = await loadRepoGraph(cwd);

	if (!graph) {
		return {
			type: params.type,
			total: 0,
			truncated: false,
			nodes: [],
			error: "RepoGraph index not found. Run repograph_index first.",
		};
	}

	const limit = params.limit ?? 100;

	try {
		let nodes: RepoGraphNode[] = [];

		switch (params.type) {
			case "symbol":
				if (!params.symbol) {
					return {
						type: params.type,
						total: 0,
						truncated: false,
						nodes: [],
						error: "symbol parameter required for symbol query",
					};
				}
				nodes = findNodesBySymbol(graph, params.symbol);
				break;

			case "file":
				if (!params.file) {
					return {
						type: params.type,
						total: 0,
						truncated: false,
						nodes: [],
						error: "file parameter required for file query",
					};
				}
				nodes = findNodesByFile(graph, params.file);
				break;

			case "definitions":
				if (!params.symbol) {
					nodes = Array.from(graph.nodes.values()).filter(
						(n) => n.nodeType === "def"
					);
				} else {
					nodes = findDefinitions(graph, params.symbol);
				}
				break;

			case "references":
				if (!params.symbol) {
					nodes = Array.from(graph.nodes.values()).filter(
						(n) => n.nodeType === "ref"
					);
				} else {
					nodes = findReferences(graph, params.symbol);
				}
				break;

			case "related":
				if (!params.nodeId) {
					return {
						type: params.type,
						total: 0,
						truncated: false,
						nodes: [],
						error: "nodeId parameter required for related query",
					};
				}
				const related = findRelatedNodes(
					graph,
					params.nodeId,
					{ depth: params.depth ?? 2, limit }
				);
				nodes = related.nodes;
				break;

			case "stats":
				const stats = getGraphStats(graph);
				return {
					type: params.type,
					total: 1,
					truncated: false,
					nodes: [
						{
							id: "stats",
							file: "",
							line: 0,
							nodeType: "def",
							symbolName: "graph-stats",
							symbolKind: "variable",
							text: JSON.stringify(stats),
						},
					],
				};

			default:
				return {
					type: params.type,
					total: 0,
					truncated: false,
					nodes: [],
					error: `Unknown query type: ${params.type}`,
				};
		}

		const truncated = nodes.length > limit;
		const limitedNodes = truncated ? nodes.slice(0, limit) : nodes;

		return {
			type: params.type,
			total: nodes.length,
			truncated,
			nodes: limitedNodes,
		};
	} catch (error) {
		return {
			type: params.type,
			total: 0,
			truncated: false,
			nodes: [],
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

/**
 * Format query result for display
 * @summary クエリ結果をフォーマット
 * @param output - Query output
 * @returns Formatted text
 */
export function formatRepoGraphQuery(output: RepographQueryOutput): string {
	if (output.error) {
		return `## Error\n\n${output.error}`;
	}

	if (output.nodes.length === 0) {
		return `## No Results\n\nNo nodes found for query type: ${output.type}`;
	}

	// Special handling for stats
	if (output.type === "stats" && output.nodes[0]?.text) {
		try {
			const stats = JSON.parse(output.nodes[0].text);
			return `## Graph Stats

| Metric | Value |
|--------|-------|
| Total nodes | ${stats.totalNodes} |
| Total edges | ${stats.totalEdges} |
| Definitions | ${stats.defCount} |
| References | ${stats.refCount} |
| Imports | ${stats.importCount} |
| Files | ${stats.fileCount} |
| Edge types | ${Object.entries(stats.edgeTypeCounts || {})
				.map(([k, v]) => `${k}: ${v}`)
				.join(", ")} `;
		} catch {
			// Fall through to regular output
		}
	}

	const lines: string[] = [];
	lines.push(`## RepoGraph Query: ${output.type}`);
	lines.push(``);
	lines.push(`**Total**: ${output.total} nodes${output.truncated ? " (truncated)" : ""}`);
	lines.push(``);

	// Group by file
	const byFile = new Map<string, RepoGraphNode[]>();
	for (const node of output.nodes) {
		const file = node.file || "unknown";
		if (!byFile.has(file)) {
			byFile.set(file, []);
		}
		byFile.get(file)!.push(node);
	}

	for (const [file, nodes] of byFile) {
		lines.push(`### ${file}`);
		lines.push(``);
		for (const node of nodes.slice(0, 20)) {
			const typeIcon = node.nodeType === "def" ? "D" : node.nodeType === "ref" ? "R" : "I";
			lines.push(`- \`${node.line}\` [${typeIcon}] ${node.symbolName} (${node.symbolKind})`);
		}
		if (nodes.length > 20) {
			lines.push(`  ... and ${nodes.length - 20} more`);
		}
		lines.push(``);
	}

	return lines.join("\n");
}
