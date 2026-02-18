/**
 * @abdd.meta
 * path: .pi/extensions/search/tools/call_graph.ts
 * role: 呼び出しグラフ操作のツール関数エクスポート層
 * why: 呼び出しグラフのインデックス生成・検索機能への統一インターフェースを提供する
 * related: ../call-graph/builder.js, ../call-graph/query.js, ./sym_index.js, ../call-graph/types.js
 * public_api: callGraphIndex, findCallersTool, findCalleesTool
 * invariants:
 *   - callGraphIndexは呼び出しグラフ構築前にシンボルインデックスの存在を保証する
 *   - シンボルインデックスが空の場合はnodeCount=0, edgeCount=0のエラー結果を返す
 *   - 既存インデックスが有効かつforce=falseの場合は再構築をスキップする
 * side_effects:
 *   - ファイルシステムへのインデックス書き込み
 *   - シンボルインデックスの自動生成
 * failure_modes:
 *   - ctags未動作またはソースファイル不在によりシンボルインデックスが空
 *   - インデックス読み書き時のファイルシステムエラー
 *   - symbolName未指定による検索エラー
 * @abdd.explain
 * overview: 呼び出しグラフのインデックス構築・クエリ実行を提供するツールモジュール
 * what_it_does:
 *   - callGraphIndex: シンボルインデックス依存確認後、呼び出しグラフを構築・キャッシュ・保存
 *   - findCallersTool: 指定シンボルを呼び出す関数一覧を返却
 *   - findCalleesTool: 指定シンボルが呼び出す関数一覧を返却
 * why_it_exists:
 *   - builder/queryモジュールの低レベルAPIを高レベルツールとして統合
 *   - インデックス鮮度判定とキャッシュ再利用ロジックの集約
 *   - 検索拡張機能からの呼び出しグラフ機能利用の簡素化
 * scope:
 *   in: CallGraphIndexInput, FindCallersInput, FindCalleesInput, cwd文字列
 *   out: CallGraphIndexOutput, FindCallersOutput, FindCalleesOutput
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
  * 呼び出しグラフのインデックスを生成または更新
  * @param input 入力設定
  * @param cwd 作業ディレクトリ
  * @returns 出力結果
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
	} catch (error) {
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
  * 指定されたシンボルを呼び出す関数を検索します。
  * @param input 検索条件を含む入力オブジェクト
  * @param cwd カレントワーキングディレクトリ
  * @returns 検索結果を含むオブジェクト
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
  * コールグラフのインデックス結果をフォーマット
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
  * 呼び出し元の検索結果を整形して文字列で返す
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
