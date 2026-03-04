/**
 * @abdd.meta
 * path: .pi/extensions/search/tools/locagent_index.ts
 * role: LocAgentツールの登録
 * why: LocAgent異種グラフの構築・クエリツールを提供
 * related: .pi/extensions/search/locagent/builder.ts, .pi/extensions/search/locagent/query.ts
 * public_api: locagentIndex, locagentQuery, formatLocAgentIndex, formatLocAgentQuery
 * invariants:
 * - インデックスは.pi/search/locagent/に保存
 * - クエリはグラフが存在しない場合エラーを返す
 * side_effects:
 * - インデックス構築時にファイルシステムに書き込み
 * - クエリ時にグラフをメモリに読み込み
 * failure_modes:
 * - ソースファイルが見つからない
 * - グラフの保存・読み込みエラー
 * @abdd.explain
 * overview: LocAgentツールのエントリーポイント
 * what_it_does:
 *   - locagent_index: 異種グラフを構築・保存
 *   - locagent_query: グラフをクエリ（search/traverse/retrieve）
 * why_it_exists:
 *   - LocAgent論文のツールをPI拡張機能として提供
 *   - RepoGraphとは別の粒度でコードローカライゼーションを実現
 * scope:
 *   in: パス、クエリパラメータ
 *   out: インデックスメタデータ、クエリ結果
 */

import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";
import { buildLocAgentGraph } from "../locagent/builder.js";
import {
	saveLocAgentGraph,
	loadLocAgentGraph,
	isLocAgentGraphStale,
	getLocAgentGraphPath,
	getLocAgentGraphStats,
} from "../locagent/storage.js";
import {
	searchEntities,
	traverseGraph,
	retrieveEntity,
	findNodesByName,
	findNodesByType,
	findNodeById,
} from "../locagent/query.js";
import type {
	LocAgentGraph,
	LocAgentNodeType,
	LocAgentEdgeType,
	DetailLevel,
	TraverseDirection,
} from "../locagent/types.js";

// ============================================================================
// Types
// ============================================================================

/**
 * locagent_indexツールの入力スキーマ
 */
export const LocAgentIndexInput = Type.Object({
	/** インデックス対象パス（デフォルト: カレントディレクトリ） */
	path: Type.Optional(
		Type.String({
			description: "Path to index (default: current directory)",
		})
	),
	/** 強制再構築 */
	force: Type.Optional(
		Type.Boolean({
			description: "Force rebuild even if index exists and is fresh",
		})
	),
	/** セマンティックインデックス構築（OpenAI API使用） */
	buildSemantic: Type.Optional(
		Type.Boolean({
			description: "Build semantic index (uses OpenAI API, incurs cost)",
		})
	),
});

/**
 * インデックス入力型
 */
export type LocAgentIndexInput = Static<typeof LocAgentIndexInput>;

/**
 * locagent_indexツールの出力
 */
export interface LocAgentIndexOutput {
	success: boolean;
	error?: string;
	fileCount: number;
	nodeCount: number;
	edgeCount: number;
	outputPath: string;
	/** セマンティックインデックス構築結果 */
	semanticIndex?: {
		success: boolean;
		error?: string;
		entityCount?: number;
		apiCalls?: number;
	};
}

/**
 * locagent_queryツールの入力スキーマ
 */
export const LocAgentQueryInput = Type.Object({
	/** クエリタイプ */
	type: Type.Union(
		[
			Type.Literal("search"),
			Type.Literal("traverse"),
			Type.Literal("retrieve"),
			Type.Literal("symbol"),
			Type.Literal("semantic"),
			Type.Literal("stats"),
		],
		{ description: "Query type" }
	),
	/** 検索キーワード（search用） */
	keywords: Type.Optional(
		Type.Array(Type.String(), { description: "Keywords for search" })
	),
	/** 開始ノードID（traverse/retrieve用） */
	nodeIds: Type.Optional(
		Type.Array(Type.String(), { description: "Node IDs for traverse/retrieve" })
	),
	/** ノードタイプフィルタ */
	nodeTypes: Type.Optional(
		Type.Array(Type.String(), { description: "Filter by node types" })
	),
	/** エッジタイプフィルタ */
	edgeTypes: Type.Optional(
		Type.Array(Type.String(), { description: "Filter by edge types" })
	),
	/** 探索方向（traverse用） */
	direction: Type.Optional(
		Type.String({ description: "Traversal direction: upstream, downstream, both" })
	),
	/** 探索ホップ数（traverse用） */
	hops: Type.Optional(
		Type.Number({ description: "Number of hops for traversal" })
	),
	/** 詳細レベル（search用） */
	detailLevel: Type.Optional(
		Type.String({ description: "Detail level: fold, preview, full" })
	),
	/** 最大結果数 */
	limit: Type.Optional(
		Type.Number({ description: "Maximum results" })
	),
});

/**
 * クエリ入力型
 */
export type LocAgentQueryInput = Static<typeof LocAgentQueryInput>;

/**
 * locagent_queryツールの出力
 */
export interface LocAgentQueryOutput {
	type: string;
	success: boolean;
	error?: string;
	total?: number;
	truncated?: boolean;
	results?: unknown;
	stats?: {
		totalNodes: number;
		totalEdges: number;
		nodeTypeCounts: Record<string, number>;
		edgeTypeCounts: Record<string, number>;
		fileCount: number;
	};
	/** キーワード検索にフォールバックしたか */
	fallback?: boolean;
	/** フォールバック理由 */
	fallbackReason?: string;
}

// ============================================================================
// Index Tool
// ============================================================================

/**
 * LocAgentインデックスを構築
 * @summary LocAgentインデックス構築
 * @param params - インデックスパラメータ
 * @param cwd - 作業ディレクトリ
 * @returns インデックス結果
 */
export async function locagentIndex(
	params: LocAgentIndexInput,
	cwd: string
): Promise<LocAgentIndexOutput> {
	const targetPath = params.path ?? ".";
	const indexPath = getLocAgentGraphPath(cwd);

	try {
		// 再構築が必要かチェック
		if (!params.force) {
			const existingGraph = await loadLocAgentGraph(cwd);
			if (existingGraph && !(await isLocAgentGraphStale(cwd, targetPath))) {
				// セマンティックインデックス構築が要求された場合
				if (params.buildSemantic) {
					const semanticResult = await buildSemanticIndex(existingGraph, cwd);
					return {
						success: semanticResult.success,
						fileCount: existingGraph.metadata.fileCount,
						nodeCount: existingGraph.metadata.nodeCount,
						edgeCount: existingGraph.metadata.edgeCount,
						outputPath: indexPath,
						semanticIndex: semanticResult,
						error: semanticResult.error,
					};
				}

				return {
					success: true,
					fileCount: existingGraph.metadata.fileCount,
					nodeCount: existingGraph.metadata.nodeCount,
					edgeCount: existingGraph.metadata.edgeCount,
					outputPath: indexPath,
				};
			}
		}

		// グラフを構築
		const graph = await buildLocAgentGraph(targetPath, cwd);

		// 保存
		await saveLocAgentGraph(graph, cwd);

		// セマンティックインデックス構築が要求された場合
		if (params.buildSemantic) {
			const semanticResult = await buildSemanticIndex(graph, cwd);
			return {
				success: semanticResult.success,
				fileCount: graph.metadata.fileCount,
				nodeCount: graph.metadata.nodeCount,
				edgeCount: graph.metadata.edgeCount,
				outputPath: indexPath,
				semanticIndex: semanticResult,
				error: semanticResult.error,
			};
		}

		return {
			success: true,
			fileCount: graph.metadata.fileCount,
			nodeCount: graph.metadata.nodeCount,
			edgeCount: graph.metadata.edgeCount,
			outputPath: indexPath,
		};
	} catch (error: unknown) {
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
 * セマンティックインデックスを構築
 * @summary セマンティックインデックス構築
 * @param graph - LocAgentグラフ
 * @param cwd - 作業ディレクトリ
 * @returns 構築結果
 */
async function buildSemanticIndex(
	graph: LocAgentGraph,
	cwd: string
): Promise<{
	success: boolean;
	error?: string;
	entityCount?: number;
	apiCalls?: number;
}> {
	try {
		const { generateEmbedding, generateEmbeddingsBatch, embeddingRegistry } = await import("../../../lib/storage/embeddings/index.js");
		const { buildLocAgentSemanticIndex } = await import("../locagent/semantic.js");

		const available = await embeddingRegistry.getAvailable();
		if (!available) {
			return {
				success: false,
				error: "OpenAI API key not configured. Set OPENAI_API_KEY environment variable or configure ~/.pi/agent/auth.json",
			};
		}

		const getEmbedding = async (text: string): Promise<number[]> => {
			const result = await generateEmbedding(text);
			return result || [];
		};

		const getEmbeddingsBatch = async (texts: string[]): Promise<(number[] | null)[]> => {
			return generateEmbeddingsBatch(texts);
		};

		const result = await buildLocAgentSemanticIndex(graph, cwd, getEmbedding, getEmbeddingsBatch);

		return {
			success: result.success,
			error: result.error,
			entityCount: result.entityCount,
			apiCalls: result.apiCalls,
		};
	} catch (error: unknown) {
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

/**
 * インデックス結果をフォーマット
 * @summary インデックス結果フォーマット
 * @param output - インデックス出力
 * @returns フォーマットされたテキスト
 */
export function formatLocAgentIndex(output: LocAgentIndexOutput): string {
	if (!output.success) {
		return `## Error\n\n${output.error}`;
	}

	let result = `## LocAgent Index Built

| Metric | Value |
|--------|-------|
| Files indexed | ${output.fileCount} |
| Nodes | ${output.nodeCount} |
| Edges | ${output.edgeCount} |
| Index path | \`${output.outputPath}\``;

	// セマンティックインデックス情報を追加
	if (output.semanticIndex) {
		if (output.semanticIndex.success) {
			result += `

### Semantic Index

| Metric | Value |
|--------|-------|
| Entities embedded | ${output.semanticIndex.entityCount} |
| API calls | ${output.semanticIndex.apiCalls} |`;
		} else {
			result += `

### Semantic Index Failed

${output.semanticIndex.error}`;
		}
	}

	result += `

Use \`locagent_query\` to search the index.`;

	return result;
}

// ============================================================================
// Query Tool
// ============================================================================

/**
 * LocAgentインデックスをクエリ
 * @summary LocAgentクエリ実行
 * @param params - クエリパラメータ
 * @param cwd - 作業ディレクトリ
 * @returns クエリ結果
 */
export async function locagentQuery(
	params: LocAgentQueryInput,
	cwd: string
): Promise<LocAgentQueryOutput> {
	let graph = await loadLocAgentGraph(cwd);

	// オンデマンド自動構築（グラフインデックスのみ）
	if (!graph) {
		console.log("[LocAgent] Index not found. Building automatically...");
		const indexResult = await locagentIndex({ path: ".", force: false }, cwd);
		if (!indexResult.success) {
			return {
				type: params.type,
				success: false,
				error: `Failed to build index: ${indexResult.error}`,
			};
		}
		graph = await loadLocAgentGraph(cwd);
	}

	if (!graph) {
		return {
			type: params.type,
			success: false,
			error: "LocAgent index not found. Run locagent_index first.",
		};
	}

	try {
		switch (params.type) {
			case "search": {
				if (!params.keywords || params.keywords.length === 0) {
					return {
						type: params.type,
						success: false,
						error: "keywords parameter required for search query",
					};
				}

				const results = searchEntities(graph, params.keywords, {
					nodeTypes: params.nodeTypes as LocAgentNodeType[] | undefined,
					limit: params.limit ?? 50,
					detailLevel: (params.detailLevel as DetailLevel) ?? "preview",
				});

				return {
					type: params.type,
					success: true,
					total: results.length,
					truncated: results.length >= (params.limit ?? 50),
					results: results.map((r) => ({
						id: r.entity.id,
						name: r.entity.name,
						type: r.entity.nodeType,
						file: r.entity.filePath,
						line: r.entity.line,
						score: r.score,
						snippet: r.codeSnippet.substring(0, 200),
					})),
				};
			}

			case "traverse": {
				if (!params.nodeIds || params.nodeIds.length === 0) {
					return {
						type: params.type,
						success: false,
						error: "nodeIds parameter required for traverse query",
					};
				}

				const result = traverseGraph(graph, params.nodeIds, {
					direction: (params.direction as TraverseDirection) ?? "downstream",
					hops: params.hops ?? 2,
					nodeTypes: params.nodeTypes as LocAgentNodeType[] | undefined,
					edgeTypes: params.edgeTypes as LocAgentEdgeType[] | undefined,
					limit: params.limit ?? 100,
				});

				return {
					type: params.type,
					success: true,
					total: result.nodes.length,
					truncated: result.nodes.length >= (params.limit ?? 100),
					results: {
						nodes: result.nodes.map((n) => ({
							id: n.id,
							name: n.name,
							type: n.nodeType,
							file: n.filePath,
							line: n.line,
						})),
						edges: result.edges.map((e) => ({
							source: e.source,
							target: e.target,
							type: e.type,
						})),
						format: result.format,
					},
				};
			}

			case "retrieve": {
				if (!params.nodeIds || params.nodeIds.length === 0) {
					return {
						type: params.type,
						success: false,
						error: "nodeIds parameter required for retrieve query",
					};
				}

				const results = retrieveEntity(graph, params.nodeIds);

				return {
					type: params.type,
					success: true,
					total: results.length,
					results: results.map((r) => ({
						id: r.entity.id,
						name: r.entity.name,
						type: r.entity.nodeType,
						file: r.entity.filePath,
						line: r.entity.line,
						signature: r.entity.signature,
						docstring: r.entity.docstring,
						code: r.fullCode,
					})),
				};
			}

			case "symbol": {
				if (!params.keywords || params.keywords.length === 0) {
					return {
						type: params.type,
						success: false,
						error: "keywords parameter required for symbol query",
					};
				}

				// シンボル名で検索
				const symbolName = params.keywords[0];
				const results = findNodesByName(graph, symbolName);

				return {
					type: params.type,
					success: true,
					total: results.length,
					truncated: results.length >= (params.limit ?? 50),
					results: results.slice(0, params.limit ?? 50).map((n) => ({
						id: n.id,
						name: n.name,
						type: n.nodeType,
						file: n.filePath,
						line: n.line,
						signature: n.signature,
					})),
				};
			}

			case "semantic": {
				// セマンティック検索（埋め込みベース）
				if (!params.keywords || params.keywords.length === 0) {
					return {
						type: params.type,
						success: false,
						error: "keywords parameter required for semantic query",
					};
				}

				const query = params.keywords.join(" ");

				try {
					// 埋め込みモジュールを動的インポート
					const { embeddingRegistry, generateEmbedding } = await import("../../../lib/storage/embeddings/index.js");
					const { searchLocAgentEntities, hasSemanticIndex } = await import("../locagent/semantic.js");

					// セマンティックインデックスが存在するかチェック
					if (!hasSemanticIndex(cwd)) {
						return {
							type: params.type,
							success: false,
							error: "Semantic index not found. Run locagent_index with buildSemantic=true first.",
						};
					}

					// 埋め込みプロバイダーを取得
					const available = await embeddingRegistry.getAvailable();
					if (!available) {
						return {
							type: params.type,
							success: false,
							error: "OpenAI API key not configured. Set OPENAI_API_KEY environment variable or configure ~/.pi/agent/auth.json",
						};
					}

					// 埋め込み生成関数
					const getEmbedding = async (text: string): Promise<number[]> => {
						const result = await generateEmbedding(text);
						return result || [];
					};

					// セマンティック検索を実行
					const results = await searchLocAgentEntities(query, graph, cwd, getEmbedding, {
						nodeTypes: params.nodeTypes,
						limit: params.limit ?? 10,
						threshold: 0.5,
					});

					return {
						type: params.type,
						success: true,
						total: results.length,
						truncated: results.length >= (params.limit ?? 10),
						results: results.map((r) => ({
							id: r.entity.id,
							name: r.entity.name,
							type: r.entity.nodeType,
							file: r.entity.filePath,
							line: r.entity.line,
							score: r.score,
							query,
						})),
					};
				} catch (error: unknown) {
					// エラー時はキーワード検索にフォールバック
					const results = searchEntities(graph, params.keywords, {
						nodeTypes: params.nodeTypes as LocAgentNodeType[] | undefined,
						limit: params.limit ?? 10,
						detailLevel: "preview",
					});

					return {
						type: params.type,
						success: true,
						total: results.length,
						truncated: results.length >= (params.limit ?? 10),
						results: results.map((r) => ({
							id: r.entity.id,
							name: r.entity.name,
							type: r.entity.nodeType,
							file: r.entity.filePath,
							line: r.entity.line,
							score: r.score,
							snippet: r.codeSnippet.substring(0, 200),
							query,
						})),
						fallback: true,
						fallbackReason: error instanceof Error ? error.message : "Semantic search failed",
					};
				}
			}

			case "stats": {
				const stats = getLocAgentGraphStats(graph);

				return {
					type: params.type,
					success: true,
					stats,
				};
			}

			default:
				return {
					type: params.type,
					success: false,
					error: `Unknown query type: ${params.type}`,
				};
		}
	} catch (error: unknown) {
		return {
			type: params.type,
			success: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

/**
 * クエリ結果をフォーマット
 * @summary クエリ結果フォーマット
 * @param output - クエリ出力
 * @returns フォーマットされたテキスト
 */
export function formatLocAgentQuery(output: LocAgentQueryOutput): string {
	if (!output.success) {
		return `## Error\n\n${output.error}`;
	}

	switch (output.type) {
		case "search":
		case "symbol": {
			const results = output.results as Array<{
				id: string;
				name: string;
				type: string;
				file: string;
				line: number;
				score?: number;
				snippet?: string;
				signature?: string;
			}>;

			if (results.length === 0) {
				return `## No Results\n\nNo entities found.`;
			}

			const lines: string[] = [];
			lines.push(`## LocAgent Search Results`);
			lines.push(``);
			lines.push(`**Total**: ${output.total} entities${output.truncated ? " (truncated)" : ""}`);
			lines.push(``);

			for (const r of results) {
				lines.push(`### ${r.name} (${r.type})`);
				lines.push(`- **ID**: \`${r.id}\``);
				if (r.file) {
					lines.push(`- **File**: ${r.file}:${r.line}`);
				}
				if (r.score !== undefined) {
					lines.push(`- **Score**: ${r.score}`);
				}
				if (r.snippet) {
					lines.push(`- **Snippet**: \`${r.snippet}\``);
				}
				if (r.signature) {
					lines.push(`- **Signature**: \`${r.signature}\``);
				}
				lines.push(``);
			}

			return lines.join("\n");
		}

		case "traverse": {
			const result = output.results as unknown as {
				nodes: Array<{ id: string; name: string; type: string }>;
				edges: Array<{ source: string; target: string; type: string }>;
				format: string;
			};

			const lines: string[] = [];
			lines.push(`## LocAgent Traverse Results`);
			lines.push(``);
			lines.push(`**Nodes**: ${result.nodes.length}, **Edges**: ${result.edges.length}`);
			lines.push(``);
			lines.push("```");
			lines.push(result.format);
			lines.push("```");

			return lines.join("\n");
		}

		case "retrieve": {
			const results = output.results as Array<{
				id: string;
				name: string;
				type: string;
				file: string;
				line: number;
				signature?: string;
				docstring?: string;
				code: string;
			}>;

			if (results.length === 0) {
				return `## No Results\n\nNo entities found.`;
			}

			const lines: string[] = [];
			lines.push(`## LocAgent Entity Details`);
			lines.push(``);

			for (const r of results) {
				lines.push(`### ${r.name} (${r.type})`);
				lines.push(`- **ID**: \`${r.id}\``);
				if (r.file) {
					lines.push(`- **Location**: ${r.file}:${r.line}`);
				}
				if (r.signature) {
					lines.push(`- **Signature**: \`${r.signature}\``);
				}
				if (r.docstring) {
					lines.push(`- **Docstring**: ${r.docstring.substring(0, 200)}...`);
				}
				lines.push(``);
				lines.push("**Code**:");
				lines.push("```typescript");
				lines.push(r.code.substring(0, 500));
				lines.push("```");
				lines.push(``);
			}

			return lines.join("\n");
		}

		case "semantic": {
			const results = output.results as Array<{
				id: string;
				name: string;
				type: string;
				file: string;
				line: number;
				score: number;
				snippet?: string;
				query?: string;
			}>;

			if (results.length === 0) {
				return `## No Results\n\nNo semantically similar entities found.`;
			}

			const lines: string[] = [];
			lines.push(`## LocAgent Semantic Search Results`);
			lines.push(``);
			if (results[0]?.query) {
				lines.push(`**Query**: ${results[0].query}`);
				lines.push(``);
			}
			lines.push(`**Total**: ${output.total} entities${output.truncated ? " (truncated)" : ""}`);
			lines.push(``);

			for (const r of results) {
				lines.push(`### ${r.name} (${r.type})`);
				lines.push(`- **ID**: \`${r.id}\``);
				if (r.file) {
					lines.push(`- **File**: ${r.file}:${r.line}`);
				}
				lines.push(`- **Score**: ${r.score.toFixed(3)}`);
				if (r.snippet) {
					lines.push(`- **Snippet**: \`${r.snippet}\``);
				}
				lines.push(``);
			}

			return lines.join("\n");
		}

		case "stats": {
			const stats = output.stats!;
			const lines: string[] = [];

			lines.push(`## LocAgent Graph Stats`);
			lines.push(``);
			lines.push(`| Metric | Value |`);
			lines.push(`|--------|-------|`);
			lines.push(`| Total nodes | ${stats.totalNodes} |`);
			lines.push(`| Total edges | ${stats.totalEdges} |`);
			lines.push(`| Files | ${stats.fileCount} |`);
			lines.push(``);
			lines.push(`**Node Types**:`);
			for (const [type, count] of Object.entries(stats.nodeTypeCounts)) {
				lines.push(`- ${type}: ${count}`);
			}
			lines.push(``);
			lines.push(`**Edge Types**:`);
			for (const [type, count] of Object.entries(stats.edgeTypeCounts)) {
				lines.push(`- ${type}: ${count}`);
			}

			return lines.join("\n");
		}

		default:
			return `## Unknown Query Type\n\n${output.type}`;
	}
}
