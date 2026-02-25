/**
 * @abdd.meta
 * path: .pi/extensions/search/tools/search_method.ts
 * role: メソッド定義を検索する高レベルヘルパーツール
 * why: sym_findのメソッド検索を簡素化し、実装の取得機能を提供するため
 * related: ./sym_find.ts, ../types.ts, ./search_class.ts, ./code_search.ts
 * public_api: searchMethod, searchMethodToolDefinition, type SearchMethodInput, type SearchMethodOutput
 * invariants: 内部的にsym_findとcode_searchを使用、結果は関連性でソート済み
 * side_effects: なし（sym_find経由でキャッシュ・履歴に記録される場合あり）
 * failure_modes: シンボルインデックスが存在しない場合、空の結果を返す
 * @abdd.explain
 * overview: メソッド定義を検索し、オプションで実装コードも取得する高レベル検索ツール
 * what_it_does:
 *   - メソッド名（ワイルドカード可）でメソッド定義を検索
 *   - classNameで特定クラス内のメソッドにフィルタ
 *   - includeImplementation=trueで実装コードも取得
 * why_it_exists:
 *   - エージェントがメソッドのシグネチャと実装を一度の呼び出しで把握できるようにするため
 *   - sym_findのスコープフィルタとcode_searchを組み合わせて使いやすくするため
 * scope:
 *   in: メソッド名パターン、クラス名フィルタ、実装含めるかどうか
 *   out: メソッド定義とオプションで実装コード
 */

/**
 * search_method Tool
 *
 * High-level helper for searching method definitions with optional implementation.
 */

import type { SymbolDefinition, DetailLevel, SearchDetails } from "../types.js";
import { symFind } from "./sym_find.js";
import { codeSearch } from "./code_search.js";

// ============================================
// Types
// ============================================

/**
 * メソッド検索の入力パラメータ
 * @summary メソッド検索入力
 * @param method メソッド名（ワイルドカード可）
 * @param className クラス名でフィルタ
 * @param includeImplementation 実装を含めるか
 * @param detailLevel 詳細レベル
 * @param file ファイルパスフィルタ
 * @param limit 結果の上限
 */
export interface SearchMethodInput {
	/** Method name pattern (supports wildcards: *, ?) */
	method: string;
	/** Filter by class name */
	className?: string;
	/** Include implementation code (default: false) */
	includeImplementation?: boolean;
	/** Detail level: full (default), signature, outline */
	detailLevel?: DetailLevel;
	/** File path filter */
	file?: string;
	/** Maximum results (default: 30) */
	limit?: number;
}

/**
 * メソッド検索結果の単一エントリ
 * @summary メソッド検索エントリ
 */
export interface MethodSearchResult {
	/** Method name */
	name: string;
	/** Method kind (method, function) */
	kind: string;
	/** File path */
	file: string;
	/** Line number */
	line: number;
	/** Method signature */
	signature?: string;
	/** Containing class/scope */
	scope?: string;
	/** Implementation code (if includeImplementation=true) */
	implementation?: string;
}

/**
 * メソッド検索の出力結果
 * @summary メソッド検索出力
 */
export interface SearchMethodOutput {
	/** Total number of matches */
	total: number;
	/** Whether results were truncated */
	truncated: boolean;
	/** Search results */
	results: MethodSearchResult[];
	/** Error message if search failed */
	error?: string;
	/** Details with hints */
	details?: SearchDetails;
}

// ============================================
// Constants
// ============================================

const DEFAULT_METHOD_LIMIT = 30;
const MAX_IMPLEMENTATION_LINES = 50;

// ============================================
// Main Implementation
// ============================================

/**
 * メソッド定義を検索
 * @summary メソッド検索実行
 * @param input 検索入力パラメータ
 * @param cwd 作業ディレクトリ
 * @returns メソッド検索結果
 */
export async function searchMethod(
	input: SearchMethodInput,
	cwd: string
): Promise<SearchMethodOutput> {
	const limit = input.limit ?? DEFAULT_METHOD_LIMIT;
	const includeImplementation = input.includeImplementation ?? false;
	const detailLevel = input.detailLevel ?? "full";

	// 1. メソッド定義を検索
	const methodResult = await symFind(
		{
			name: input.method,
			kind: ["method", "function"],
			scope: input.className,
			file: input.file,
			limit,
			detailLevel,
		},
		cwd
	);

	if (methodResult.error) {
		return {
			total: 0,
			truncated: false,
			results: [],
			error: methodResult.error,
		};
	}

	const results: MethodSearchResult[] = [];

	// 2. 各メソッドについて処理
	for (const sym of methodResult.results) {
		const methodEntry: MethodSearchResult = {
			name: sym.name,
			kind: sym.kind,
			file: sym.file,
			line: sym.line,
			signature: sym.signature,
			scope: sym.scope,
		};

		// 3. 実装を取得（オプション）
		if (includeImplementation && sym.file && sym.line) {
			const impl = await getMethodImplementation(sym, cwd);
			if (impl) {
				methodEntry.implementation = impl;
			}
		}

		results.push(methodEntry);
	}

	return {
		total: methodResult.total,
		truncated: methodResult.truncated,
		results,
		details: methodResult.details,
	};
}

/**
 * メソッドの実装を取得
 * @summary 実装取得
 * @param sym シンボル定義
 * @param cwd 作業ディレクトリ
 * @returns 実装コード文字列
 */
async function getMethodImplementation(
	sym: SymbolDefinition,
	cwd: string
): Promise<string | undefined> {
	// シグネチャから関数定義のパターンを抽出
	const pattern = sym.signature
		? escapeRegexForGrep(sym.signature.slice(0, 50)) // 最初の50文字を使用
		: `function\\s+${escapeRegexForGrep(sym.name)}|${escapeRegexForGrep(sym.name)}\\s*\\(`;

	try {
		const codeResult = await codeSearch(
			{
				pattern,
				path: sym.file,
				context: 10,
				limit: 1,
			},
			cwd
		);

		if (codeResult.results.length > 0) {
			const match = codeResult.results[0];
			if (match.context && match.context.length > 0) {
				// コンテキスト行を制限
				const lines = match.context.slice(0, MAX_IMPLEMENTATION_LINES);
				return lines.join("\n");
			}
			return match.text;
		}
	} catch {
		// エラーは無視して実装なしで続行
	}

	return undefined;
}

/**
 * ripgrep用に正規表現特殊文字をエスケープ
 * @summary 正規表現エスケープ
 * @param str 入力文字列
 * @returns エスケープされた文字列
 */
function escapeRegexForGrep(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * メソッド検索結果をフォーマット
 * @summary 結果フォーマット
 * @param output 出力データ
 * @returns フォーマット済み文字列
 */
export function formatSearchMethod(output: SearchMethodOutput): string {
	const lines: string[] = [];

	if (output.error) {
		lines.push(`Error: ${output.error}`);
		return lines.join("\n");
	}

	lines.push(`Method Search: ${output.total} results${output.truncated ? " (truncated)" : ""}`);
	lines.push("");

	for (const method of output.results) {
		const scope = method.scope ? `${method.scope}.` : "";
		lines.push(`${scope}${method.name} (${method.kind})`);
		lines.push(`  ${method.file}:${method.line}`);

		if (method.signature) {
			lines.push(`  Signature: ${method.signature}`);
		}

		if (method.implementation) {
			lines.push("  Implementation:");
			const implLines = method.implementation.split("\n").slice(0, 15);
			for (const implLine of implLines) {
				lines.push(`    ${implLine}`);
			}
			if (method.implementation.split("\n").length > 15) {
				lines.push("    ... (truncated)");
			}
		}

		lines.push("");
	}

	// ヒント情報
	if (output.details?.hints) {
		const hints = output.details.hints;
		if (hints.suggestedNextAction) {
			lines.push(`Suggestion: ${hints.suggestedNextAction}`);
		}
		if (hints.alternativeTools && hints.alternativeTools.length > 0) {
			lines.push(`Alternative tools: ${hints.alternativeTools.join(", ")}`);
		}
	}

	return lines.join("\n");
}

/**
 * Tool definition for pi.registerTool
 */
export const searchMethodToolDefinition = {
	name: "search_method",
	label: "Search Method",
	description:
		"Search for method definitions with optional implementation code. Supports wildcards in method name. Use className to filter by containing class.",
	parameters: null, // Will be set in index.ts
};
