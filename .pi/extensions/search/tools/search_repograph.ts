/**
 * @abdd.meta
 * path: .pi/extensions/search/tools/search_repograph.ts
 * role: Tool for searching RepoGraph with k-hop egograph extraction
 * why: Provide code localization through dependency graph navigation
 * related: .pi/extensions/search/repograph/egograph.ts, .pi/extensions/search/repograph/storage.ts
 * public_api: searchRepograph, SearchRepographInput, SearchRepographOutput
 * invariants:
 * - Returns error if RepoGraph index not found
 * - Respects maxNodes and maxEdges limits
 * side_effects: None (read-only operation)
 * failure_modes:
 * - Index not found: returns error message
 * - No matching nodes: returns empty result
 * @abdd.explain
 * overview: Search tool for RepoGraph k-hop subgraph extraction
 * what_it_does:
 * - Load RepoGraph index from storage
 * - Extract k-hop egograph around keywords
 * - Return formatted result with nodes and edges
 * why_it_exists:
 * - Enable code localization through graph navigation
 * - Provide structured context for LLM reasoning
 * scope:
 * in: keywords, k, maxNodes, flatten, summarize options
 * out: Formatted egograph result with nodes, edges, summary
 */

import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";
import { loadRepoGraph, getRepoGraphPath } from "../repograph/storage.js";
import { extractEgograph, formatEgograph } from "../repograph/egograph.js";
import type { EgographOptions, EgographResult } from "../repograph/egograph.js";

// ============================================
// Types
// ============================================

/**
 * Input schema for search_repograph tool
 */
export const SearchRepographInput = Type.Object({
	/** Keywords to search for seed nodes */
	keywords: Type.Array(Type.String(), {
		description: "Keywords to search in symbol names and code text",
		minItems: 1,
	}),
	/** Number of hops from seed nodes */
	k: Type.Optional(Type.Number({
		description: "Number of hops (default: 2)",
		minimum: 1,
		maximum: 5,
	})),
	/** Maximum nodes in result */
	maxNodes: Type.Optional(Type.Number({
		description: "Maximum nodes to return (default: 100)",
		minimum: 10,
		maximum: 500,
	})),
	/** Maximum edges in result */
	maxEdges: Type.Optional(Type.Number({
		description: "Maximum edges to return (default: 200)",
		minimum: 10,
		maximum: 1000,
	})),
	/** Include LLM-ready summary */
	summarize: Type.Optional(Type.Boolean({
		description: "Include summary for LLM context (default: true)",
	})),
	/** Edge types to follow */
	edgeTypes: Type.Optional(Type.Array(Type.String(), {
		description: "Edge types to follow (invoke, contain, reference, next)",
	})),
});

/**
 * 検索入力定義
 * @summary 検索入力
 * @param summarize LLM用サマリーを含めるかどうか (デフォルト: true)
 * @param followEdgeTypes たどるエッジタイプ
 * @returns 検証済みの静的入力型
 */
export type SearchRepographInput = Static<typeof SearchRepographInput>;

/**
 * Output schema for search_repograph tool
 */
export interface SearchRepographOutput {
	/** Whether the search was successful */
	success: boolean;
	/** Error message if unsuccessful */
	error?: string;
	/** Egograph extraction result */
	result?: EgographResult;
	/** Index path */
	indexPath?: string;
}

// ============================================
// Main Function
// ============================================

/**
 * Search RepoGraph with k-hop egograph extraction
 * @summary RepoGraphからk-hopエゴグラフを抽出
 * @param params - Search parameters
 * @param cwd - Current working directory
 * @returns Search result with egograph
 */
export async function searchRepograph(
	params: SearchRepographInput,
	cwd: string
): Promise<SearchRepographOutput> {
	const indexPath = getRepoGraphPath(cwd);

	// Load RepoGraph index
	const graph = await loadRepoGraph(cwd);

	if (!graph) {
		return {
			success: false,
			error: `RepoGraph index not found at ${indexPath}. Run repograph_index first to build the index.`,
			indexPath,
		};
	}

	// Build options
	const options: EgographOptions = {
		keywords: params.keywords,
		k: params.k ?? 2,
		maxNodes: params.maxNodes ?? 100,
		maxEdges: params.maxEdges ?? 200,
		summarize: params.summarize ?? true,
		edgeTypes: params.edgeTypes,
	};

	// Extract egograph
	const result = extractEgograph(graph, options);

	return {
		success: true,
		result,
		indexPath,
	};
}

/**
 * Format search result for display
 * @summary 検索結果をフォーマット
 * @param output - Search output
 * @returns Formatted text
 */
export function formatSearchResult(output: SearchRepographOutput): string {
	if (!output.success) {
		return `## Error\n\n${output.error}`;
	}

	if (!output.result) {
		return `## No Result\n\nNo egograph extracted.`;
	}

	return formatEgograph(output.result);
}

// ============================================
// Tool Definition
// ============================================

/**
 * Tool definition for pi registration
 */
export const searchRepographToolDefinition = {
	name: "search_repograph",
	label: "Search RepoGraph",
	description: `Extract k-hop subgraph around keywords from the RepoGraph index. Useful for code localization and understanding code dependencies.

The RepoGraph is a line-level dependency graph where:
- Nodes represent code lines (definitions, references, imports)
- Edges represent relationships (invoke, contain, reference, next)

Use this tool to:
1. Find related code around a function/class name
2. Understand call chains and dependencies
3. Localize bugs by exploring related code
4. Get structured context for code changes

Example:
- keywords: ["parseConfig", "loadSettings"]
- k: 2 (2 hops from matching nodes)
- maxNodes: 50 (limit result size)`,
	parameters: SearchRepographInput,
};
