/**
 * @abdd.meta
 * path: .pi/extensions/search/tools/context_explore.ts
 * role: 階層的文脈検索ツールの実装
 * why: 複数の検索ステップを一度に実行し、コンテキスト予算に基づく自動圧縮を提供するため
 * related: ../types.ts, ./sym_find.ts, ./code_search.ts, ./call_graph.ts, ../utils/output.ts
 * public_api: contextExplore, contextExploreToolDefinition
 * invariants: ステップは順序通り実行される、コンテキスト予算を超える場合は自動圧縮される
 * side_effects: 他の検索ツール（sym_find, code_search, find_callers）を内部的に呼び出す
 * failure_modes: 前のステップの結果を参照する際に$0等の参照が無効な場合、エラーを返す
 * @abdd.explain
 * overview: 複数の検索クエリをチェーンとして実行し、前のステップの結果を次のステップの入力として使用できるツール
 * what_it_does:
 *   - find_class, find_methods, search_code, get_callers の4種類のステップをサポート
 *   - 前のステップの結果を $0, $1 等の参照で次のステップの入力として使用可能
 *   - コンテキスト予算（デフォルト15000トークン）に基づき自動的に結果を圧縮
 *   - compression モード（full/signature/summary）で出力の詳細度を制御
 * why_it_exists:
 *   - エージェントが複雑な検索パターンを一度のツール呼び出しで実行できるようにするため
 *   - コンテキスト予算を意識した検索でモデルのコンテキスト消費を最適化するため
 *   - 検索ステップ間のデータ受け渡しを自動化し、エージェントの負担を減らすため
 * scope:
 *   in: ContextExploreInput（steps配列、contextBudget、compression）
 *   out: ContextExploreOutput（各ステップの結果、推定トークン数、圧縮フラグ）
 */

/**
 * context_explore Tool
 *
 * Execute a chain of search queries in sequence, passing results between steps.
 * Supports automatic compression based on context budget.
 */

import type {
	ContextExploreInput,
	ContextExploreOutput,
	ContextExploreStepResult,
	ContextExploreStep,
	SymbolDefinition,
	SearchDetails,
} from "../types.js";
import { symFind } from "./sym_find.js";
import { codeSearch } from "./code_search.js";
import { findCallersTool } from "./call_graph.js";
import {
	estimateTokens,
	estimateSymbolDefinitionTokens,
	estimateCodeSearchMatchTokens,
	DEFAULT_CONTEXT_BUDGET,
} from "../utils/output.js";

// ============================================
// Result Compression
// ============================================

/**
 * シンボル結果を圧縮
 * @summary シンボル圧縮
 * @param symbols シンボル定義配列
 * @param compression 圧縮モード
 * @returns 圧縮されたシンボル配列
 */
function compressSymbols(
	symbols: SymbolDefinition[],
	compression: "full" | "signature" | "summary"
): SymbolDefinition[] {
	if (compression === "full") {
		return symbols;
	}

	return symbols.map((sym) => {
		if (compression === "summary") {
			return {
				name: sym.name,
				kind: sym.kind,
				file: sym.file,
				line: sym.line,
			} as SymbolDefinition;
		}

		// signature mode
		return {
			name: sym.name,
			kind: sym.kind,
			file: sym.file,
			line: sym.line,
			signature: sym.signature,
			scope: sym.scope,
		} as SymbolDefinition;
	});
}

/**
 * 結果のトークン数を推定
 * @summary 結果トークン推定
 * @param results 結果配列
 * @param type 結果タイプ
 * @returns 推定トークン数
 */
function estimateStepTokens(results: unknown[], type: ContextExploreStep["type"]): number {
	if (results.length === 0) return 0;

	if (type === "find_class" || type === "find_methods") {
		return results.reduce<number>(
			(sum: number, item: unknown) => sum + estimateSymbolDefinitionTokens(item as SymbolDefinition, "signature"),
			0
		);
	}

	if (type === "search_code") {
		return results.reduce<number>(
			(sum: number, item: unknown) => sum + estimateCodeSearchMatchTokens(item as { file: string; line: number; text: string; context?: string[] }),
			0
		);
	}

	// get_callers - estimate based on string representation
	return results.reduce<number>((sum: number, item: unknown) => {
		if (typeof item === "object" && item !== null) {
			return sum + estimateTokens(JSON.stringify(item));
		}
		return sum + estimateTokens(String(item));
	}, 0);
}

// ============================================
// Step Execution
// ============================================

/**
 * 参照を解決（$0, $1等を実際の値に置換）
 * @summary 参照解決
 * @param value 値文字列
 * @param previousResults 前のステップの結果
 * @returns 解決された値
 */
function resolveReferences(
	value: string | undefined,
	previousResults: ContextExploreStepResult[]
): string | undefined {
	if (!value) return value;

	// Replace $0, $1, etc. with actual values from previous results
	return value.replace(/\$(\d+)/g, (match, indexStr) => {
		const index = parseInt(indexStr, 10);
		if (index >= previousResults.length) {
			return match; // Keep original if reference is invalid
		}

		const refResult = previousResults[index];
		if (!refResult || refResult.results.length === 0) {
			return match;
		}

		// Get the first result's name if it's a symbol
		const firstResult = refResult.results[0] as { name?: string };
		return firstResult.name ?? match;
	});
}

/**
 * 単一ステップを実行
 * @summary ステップ実行
 * @param step ステップ定義
 * @param previousResults 前のステップの結果
 * @param cwd 作業ディレクトリ
 * @returns ステップ実行結果
 */
async function executeStep(
	step: ContextExploreStep,
	previousResults: ContextExploreStepResult[],
	cwd: string
): Promise<ContextExploreStepResult> {
	const resolvedQuery = resolveReferences(step.query, previousResults);
	const resolvedClassRef = resolveReferences(step.classRef, previousResults);

	switch (step.type) {
		case "find_class": {
			const result = await symFind(
				{
					name: resolvedQuery,
					kind: ["class", "interface", "struct"],
					limit: 10,
				},
				cwd
			);

			const results = result.results;
			return {
				stepIndex: previousResults.length,
				type: step.type,
				count: results.length,
				estimatedTokens: estimateStepTokens(results, step.type),
				results,
			};
		}

		case "find_methods": {
			const classRef = resolvedClassRef ?? resolvedQuery;
			const result = await symFind(
				{
					scope: classRef,
					kind: ["method", "function"],
					limit: 20,
				},
				cwd
			);

			const results = result.results;
			return {
				stepIndex: previousResults.length,
				type: step.type,
				count: results.length,
				estimatedTokens: estimateStepTokens(results, step.type),
				results,
			};
		}

		case "search_code": {
			const result = await codeSearch(
				{
					pattern: resolvedQuery ?? "",
					path: step.scope,
					limit: 20,
				},
				cwd
			);

			const results = result.results;
			return {
				stepIndex: previousResults.length,
				type: step.type,
				count: results.length,
				estimatedTokens: estimateStepTokens(results, step.type),
				results,
			};
		}

		case "get_callers": {
			const result = await findCallersTool(
				{
					symbolName: resolvedQuery ?? "",
					depth: 1,
					limit: 20,
				},
				cwd
			);

			const results = result.results;
			return {
				stepIndex: previousResults.length,
				type: step.type,
				count: results.length,
				estimatedTokens: estimateStepTokens(results, step.type),
				results,
			};
		}

		default:
			throw new Error(`Unknown step type: ${(step as { type: string }).type}`);
	}
}

// ============================================
// Main Entry Point
// ============================================

/**
 * 階層的文脈検索を実行
 * @summary 文脈検索実行
 * @param input 入力パラメータ
 * @param cwd 作業ディレクトリ
 * @returns 検索結果
 */
export async function contextExplore(
	input: ContextExploreInput,
	cwd: string
): Promise<ContextExploreOutput> {
	const contextBudget = input.contextBudget ?? DEFAULT_CONTEXT_BUDGET;
	const compression = input.compression ?? "full";

	if (!input.steps || input.steps.length === 0) {
		return {
			total: 0,
			compressed: false,
			estimatedTokens: 0,
			contextBudget,
			steps: [],
			error: "No steps provided",
		};
	}

	const stepResults: ContextExploreStepResult[] = [];
	let totalTokens = 0;

	try {
		for (const step of input.steps) {
			const result = await executeStep(step, stepResults, cwd);
			stepResults.push(result);
			totalTokens += result.estimatedTokens;

			// Early termination if budget exceeded
			if (totalTokens > contextBudget * 1.5) {
				break;
			}
		}
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		return {
			total: stepResults.reduce((sum, r) => sum + r.count, 0),
			compressed: false,
			estimatedTokens: totalTokens,
			contextBudget,
			steps: stepResults,
			error: errorMessage,
		};
	}

	// Apply compression if needed
	let compressed = false;
	if (totalTokens > contextBudget && compression !== "full") {
		compressed = true;
		for (const stepResult of stepResults) {
			if (stepResult.type === "find_class" || stepResult.type === "find_methods") {
				stepResult.results = compressSymbols(
					stepResult.results as SymbolDefinition[],
					compression
				);
				stepResult.estimatedTokens = estimateStepTokens(stepResult.results, stepResult.type);
			}
		}
		totalTokens = stepResults.reduce((sum, r) => sum + r.estimatedTokens, 0);
	}

	// Calculate hints
	const totalCount = stepResults.reduce((sum, r) => sum + r.count, 0);
	const ratio = totalTokens / contextBudget;
	const hints: SearchDetails["hints"] = {
		confidence: totalCount > 0 ? Math.min(0.9, 0.5 + totalCount * 0.02) : 0.1,
		estimatedTokens: totalTokens,
		contextBudgetWarning: ratio >= 1 ? "exceeds_recommended" : ratio >= 0.8 ? "approaching" : "ok",
	};

	return {
		total: totalCount,
		compressed,
		estimatedTokens: totalTokens,
		contextBudget,
		steps: stepResults,
		details: { hints },
	};
}

/**
 * context_exploreの結果をフォーマット
 * @summary 結果フォーマット
 * @param output 出力データ
 * @returns フォーマット済み文字列
 */
export function formatContextExplore(output: ContextExploreOutput): string {
	const lines: string[] = [];

	if (output.error) {
		lines.push(`Error: ${output.error}`);
		return lines.join("\n");
	}

	lines.push(`Context Explore: ${output.total} results across ${output.steps.length} steps`);
	lines.push(`Estimated tokens: ${output.estimatedTokens} / ${output.contextBudget} budget`);
	if (output.compressed) {
		lines.push("(Results compressed to fit budget)");
	}
	lines.push("");

	for (const step of output.steps) {
		lines.push(`Step ${step.stepIndex + 1}: ${step.type}`);
		lines.push(`  Count: ${step.count}, Tokens: ~${step.estimatedTokens}`);

		// Show first few results
		const previewCount = Math.min(3, step.results.length);
		for (let i = 0; i < previewCount; i++) {
			const result = step.results[i];
			if (typeof result === "object" && result !== null && "name" in result) {
				const sym = result as { name: string; kind?: string; file?: string; line?: number };
				lines.push(`    - ${sym.name} (${sym.kind ?? "unknown"})`);
				if (sym.file) {
					lines.push(`      ${sym.file}:${sym.line ?? 0}`);
				}
			} else if (typeof result === "object" && result !== null && "text" in result) {
				const match = result as { file?: string; line?: number; text: string };
				lines.push(`    - ${match.file}:${match.line ?? 0}`);
				lines.push(`      ${match.text.slice(0, 60)}${match.text.length > 60 ? "..." : ""}`);
			}
		}

		if (step.results.length > previewCount) {
			lines.push(`    ... and ${step.results.length - previewCount} more`);
		}

		lines.push("");
	}

	// Show hints if budget warning
	if (output.details?.hints?.contextBudgetWarning !== "ok") {
		lines.push("--- Budget Warning ---");
		lines.push(`Token usage: ${output.details?.hints?.contextBudgetWarning}`);
		if (output.details?.hints?.suggestedNextAction) {
			lines.push(`Suggestion: ${output.details.hints.suggestedNextAction}`);
		}
	}

	return lines.join("\n");
}

/**
 * Tool definition for pi.registerTool
 */
export const contextExploreToolDefinition = {
	name: "context_explore",
	label: "Context Explore",
	description:
		"Execute a chain of search queries in sequence. Supports find_class, find_methods, search_code, and get_callers steps. Results from previous steps can be referenced using $0, $1, etc.",
	parameters: null, // Will be set in index.ts
};
