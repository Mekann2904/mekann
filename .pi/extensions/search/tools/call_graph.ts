/**
 * @abdd.meta
 * path: .pi/extensions/search/tools/call_graph.ts
 * role: 呼び出しグラフの生成、永続化、検索機能を提供するツールセット
 * why: コード解析のためのシンボル間の依存関係を可視化し、定義元と参照元の追跡を可能にするため
 * related: .pi/extensions/search/tools/sym_index.ts, .pi/extensions/search/call-graph/builder.js, .pi/extensions/search/call-graph/query.js, .pi/extensions/search/call-graph/types.ts
 * public_api: callGraphIndex, findCallersTool
 * invariants: シンボル索引が存在しない場合は先に生成される、索引が有効な場合は再生成をスキップする
 * side_effects: ディスク上の呼び出しグラフ索引ファイル(.pi/search/call-graph/index.json)を作成または更新する
 * failure_modes: シンボル索引が見つからない、索引作成中のエラー、必須パラメータの欠如
 * @abdd.explain
 * overview: 呼び出しグラフを構築して索引化し、特定のシンボルの呼び出し元や呼び出し先を問い合わせる機能を外部に提供するアダプタ層
 * what_it_does:
 *   - シンボル索引の存在確認と必要に応じた生成
 *   - 呼び出しグラフ索引の鮮度判定と再構築
 *   - グラフデータのJSON形式での保存
 *   - 指定されたシンボル名に基づく呼び出し元の検索
 * why_it_exists:
 *   - コードベースの静的解析ツールとしての機能統一
 *   - 高頻度な問い合わせに対して事前計算されたグラフ構造を利用するため
 *   - シンボル検索と呼び出し関係検索のワークフローを連携させるため
 * scope:
 *   in: プロジェクトのパス、作業ディレクトリ、検索対象のシンボル名、再構築フラグ
 * out: ノード数、エッジ数、出力パス、検索結果リスト、エラーメッセージ
 */

/**
 * Call Graph Tools
 *
 * Tools for call graph index generation and querying.
 */

import type {
	CallGraphIndexInput,
	CallGraphIndexOutput,
	FindCallersInput,
	FindCalleesInput,
	FindCallersOutput,
	FindCalleesOutput,
	CallGraphIndex,
} from "../call-graph/types.js";
import {
	buildCallGraph,
	saveCallGraphIndex,
	readCallGraphIndex,
	isCallGraphIndexStale,
} from "../call-graph/builder.js";
import { findCallers, findCallees } from "../call-graph/query.js";
import { symIndex, readSymbolIndex } from "./sym_index.js";

// ============================================
// Call Graph Index Tool
// ============================================

/**
 * 呼び出しグラフを索引付け
 * @summary 呼び出しグラフ索引付け
 * @param input 索引付け入力データ
 * @param cwd 作業ディレクトリパス
 * @returns 索引付け結果データ
 */
export async function callGraphIndex(
	input: CallGraphIndexInput,
	cwd: string
): Promise<CallGraphIndexOutput> {
	try {
		// Ensure symbol index exists first
		let symIndexExists = await readSymbolIndex(cwd);
		if (!symIndexExists || symIndexExists.length === 0) {
			await symIndex({ force: false, cwd }, cwd);
			symIndexExists = await readSymbolIndex(cwd);
		}

		if (!symIndexExists || symIndexExists.length === 0) {
			return {
				nodeCount: 0,
				edgeCount: 0,
				outputPath: "",
				error: "No symbols found. Ensure source files exist and ctags is working.",
			};
		}

		// Check if we need to rebuild
		const shouldRebuild = input.force || (await isCallGraphIndexStale(cwd));

		if (!shouldRebuild) {
			const existing = await readCallGraphIndex(cwd);
			if (existing) {
				return {
					nodeCount: existing.metadata.nodeCount,
					edgeCount: existing.metadata.edgeCount,
					outputPath: `.pi/search/call-graph/index.json`,
				};
			}
		}

		// Build call graph
		const targetPath = input.path || cwd;
		const index = await buildCallGraph(targetPath, cwd);

		// Save index
		const outputPath = await saveCallGraphIndex(index, cwd);

		return {
			nodeCount: index.metadata.nodeCount,
			edgeCount: index.metadata.edgeCount,
			outputPath,
		};
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			nodeCount: 0,
			edgeCount: 0,
			outputPath: "",
			error: message,
		};
	}
}

// ============================================
// Find Callers Tool
// ============================================

/**
 * 呼び出し元を検索
 * @summary 呼び出し元検索
 * @param input 検索入力データ
 * @param cwd 作業ディレクトリパス
 * @returns 検索結果データ
 */
export async function findCallersTool(
	input: FindCallersInput,
	cwd: string
): Promise<FindCallersOutput> {
	if (!input.symbolName || input.symbolName.length === 0) {
		return {
			symbolName: "",
			total: 0,
			truncated: false,
			results: [],
			error: "symbolName is required",
		};
	}

	try {
		// Ensure index exists
		let index = await readCallGraphIndex(cwd);
		if (!index || (await isCallGraphIndexStale(cwd))) {
			const result = await callGraphIndex({ force: false, cwd }, cwd);
			if (result.error) {
				return {
					symbolName: input.symbolName,
					total: 0,
					truncated: false,
					results: [],
					error: result.error,
				};
			}
			index = await readCallGraphIndex(cwd);
		}

		if (!index) {
			return {
				symbolName: input.symbolName,
				total: 0,
				truncated: false,
				results: [],
				error: "Failed to load call graph index",
			};
		}

		const depth = input.depth ?? 1;
		const limit = input.limit ?? 50;
		const results = findCallers(index, input.symbolName, depth, limit);

		return {
			symbolName: input.symbolName,
			total: results.length,
			truncated: results.length >= limit,
			results,
		};
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			symbolName: input.symbolName,
			total: 0,
			truncated: false,
			results: [],
			error: message,
		};
	}
}

// ============================================
// Find Callees Tool
// ============================================

 /**
  * 指定されたシンボルが呼び出す関数を検索
  * @param input 検索条件
  * @param cwd 作業ディレクトリ
  * @returns 呼び出し先関数のリスト
  */
export async function findCalleesTool(
	input: FindCalleesInput,
	cwd: string
): Promise<FindCalleesOutput> {
	if (!input.symbolName || input.symbolName.length === 0) {
		return {
			symbolName: "",
			total: 0,
			truncated: false,
			results: [],
			error: "symbolName is required",
		};
	}

	try {
		// Ensure index exists
		let index = await readCallGraphIndex(cwd);
		if (!index || (await isCallGraphIndexStale(cwd))) {
			const result = await callGraphIndex({ force: false, cwd }, cwd);
			if (result.error) {
				return {
					symbolName: input.symbolName,
					total: 0,
					truncated: false,
					results: [],
					error: result.error,
				};
			}
			index = await readCallGraphIndex(cwd);
		}

		if (!index) {
			return {
				symbolName: input.symbolName,
				total: 0,
				truncated: false,
				results: [],
				error: "Failed to load call graph index",
			};
		}

		const depth = input.depth ?? 1;
		const limit = input.limit ?? 50;
		const results = findCallees(index, input.symbolName, depth, limit);

		return {
			symbolName: input.symbolName,
			total: results.length,
			truncated: results.length >= limit,
			results,
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			symbolName: input.symbolName,
			total: 0,
			truncated: false,
			results: [],
			error: message,
		};
	}
}

// ============================================
// Output Formatting
// ============================================

/**
 * @summary インデックスをフォーマット
 * @param result コールグラフの出力結果
 * @returns フォーマットされた文字列
 */
export function formatCallGraphIndex(result: CallGraphIndexOutput): string {
	if (result.error) {
		return `Error: ${result.error}`;
	}

	return [
		`Call Graph Index Generated`,
		`  Nodes (functions): ${result.nodeCount}`,
		`  Edges (calls): ${result.edgeCount}`,
		`  Output: ${result.outputPath}`,
	].join("\n");
}

/**
 * @summary 呼び出し元を整形
 * @param result 呼び出し元の検索結果
 * @returns 整形された文字列
 */
export function formatCallers(result: FindCallersOutput): string {
	if (result.error) {
		return `Error: ${result.error}`;
	}

	if (result.results.length === 0) {
		return `No callers found for "${result.symbolName}"`;
	}

	const lines: string[] = [`Callers of "${result.symbolName}" (${result.total} found):`];

	for (const item of result.results) {
		const { node, depth, callSite, confidence } = item;
		const depthIndent = "  ".repeat(depth);
		const confidenceStr = confidence < 0.8 ? ` (${(confidence * 100).toFixed(0)}%)` : "";
		const location = callSite
			? ` at ${callSite.file}:${callSite.line}`
			: "";

		lines.push(
			`${depthIndent}- ${node.name} [${node.kind}] (${node.file}:${node.line})${location}${confidenceStr}`
		);
	}

	if (result.truncated) {
		lines.push("  (results truncated, use --limit to see more)");
	}

	return lines.join("\n");
}

 /**
  * 呼び出し先の検索結果をフォーマットする
  * @param result 検索結果
  * @returns フォーマット済みの文字列
  */
export function formatCallees(result: FindCalleesOutput): string {
	if (result.error) {
		return `Error: ${result.error}`;
	}

	if (result.results.length === 0) {
		return `No callees found for "${result.symbolName}"`;
	}

	const lines: string[] = [`Callees of "${result.symbolName}" (${result.total} found):`];

	for (const item of result.results) {
		const { node, depth, callSite, confidence } = item;
		const depthIndent = "  ".repeat(depth);
		const confidenceStr = confidence < 0.8 ? ` (${(confidence * 100).toFixed(0)}%)` : "";
		const external = node.file === "(external)" ? " [external]" : "";
		const location = callSite && !external
			? ` called at ${callSite.file}:${callSite.line}`
			: "";

		lines.push(
			`${depthIndent}- ${node.name}${external} [${node.kind}]${location}${confidenceStr}`
		);
	}

	if (result.truncated) {
		lines.push("  (results truncated, use --limit to see more)");
	}

	return lines.join("\n");
}

// ============================================
// Tool Definitions
// ============================================

export const callGraphIndexToolDefinition = {
	name: "call_graph_index",
	label: "Call Graph Index",
	description:
		"Generate a call graph index showing function call relationships. Uses ctags and ripgrep for analysis.",
	parameters: null,
};

export const findCallersToolDefinition = {
	name: "find_callers",
	label: "Find Callers",
	description:
		"Find all functions that call the specified symbol. Supports depth-based traversal to find indirect callers.",
	parameters: null,
};

export const findCalleesToolDefinition = {
	name: "find_callees",
	label: "Find Callees",
	description:
		"Find all functions called by the specified symbol. Supports depth-based traversal to find indirect callees.",
	parameters: null,
};
