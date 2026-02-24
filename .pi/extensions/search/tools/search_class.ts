/**
 * @abdd.meta
 * path: .pi/extensions/search/tools/search_class.ts
 * role: クラス定義を検索する高レベルヘルパーツール
 * why: sym_findのクラス検索を簡素化し、メソッド一覧の同時取得機能を提供するため
 * related: ./sym_find.ts, ../types.ts, ./search_method.ts
 * public_api: searchClass, searchClassToolDefinition, type SearchClassInput, type SearchClassOutput
 * invariants: 内部的にsym_findを使用、結果は関連性でソート済み
 * side_effects: なし（sym_find経由でキャッシュ・履歴に記録される場合あり）
 * failure_modes: シンボルインデックスが存在しない場合、空の結果を返す
 * @abdd.explain
 * overview: クラス定義を検索し、オプションでメソッド一覧も取得する高レベル検索ツール
 * what_it_does:
 *   - クラス名（ワイルドカード可）でクラス定義を検索
 *   - includeMethods=trueでクラス内メソッドも一括取得
 *   - detailLevelで出力の詳細度を制御
 * why_it_exists:
 *   - エージェントがクラス構造を一度の呼び出しで把握できるようにするため
 *   - sym_findのスコープフィルタを抽象化し使いやすくするため
 * scope:
 *   in: クラス名パターン、詳細レベル、メソッド含めるかどうか
 *   out: クラス定義とオプションでメソッド一覧
 */

/**
 * search_class Tool
 *
 * High-level helper for searching class definitions with optional method listing.
 */

import type { SymbolDefinition, DetailLevel, SearchDetails } from "../types.js";
import { symFind } from "./sym_find.js";

// ============================================
// Types
// ============================================

/**
 * クラス検索の入力パラメータ
 * @summary クラス検索入力
 * @param name クラス名（ワイルドカード可）
 * @param includeMethods メソッド一覧も含めるか
 * @param detailLevel 詳細レベル
 * @param file ファイルパスフィルタ
 * @param limit 結果の上限
 */
export interface SearchClassInput {
	/** Class name pattern (supports wildcards: *, ?) */
	name: string;
	/** Include method list (default: true) */
	includeMethods?: boolean;
	/** Detail level: full (default), signature, outline */
	detailLevel?: DetailLevel;
	/** File path filter */
	file?: string;
	/** Maximum results (default: 20) */
	limit?: number;
}

/**
 * クラス内メソッド情報
 * @summary メソッド情報
 */
export interface ClassMethod {
	/** Method name */
	name: string;
	/** Method signature */
	signature?: string;
	/** Line number */
	line: number;
	/** Kind (method, function) */
	kind: string;
}

/**
 * クラス検索結果の単一エントリ
 * @summary クラス検索エントリ
 */
export interface ClassSearchResult {
	/** Class name */
	name: string;
	/** Class kind (class, interface, struct) */
	kind: string;
	/** File path */
	file: string;
	/** Line number */
	line: number;
	/** Class signature (if available) */
	signature?: string;
	/** Methods within the class (if includeMethods=true) */
	methods?: ClassMethod[];
}

/**
 * クラス検索の出力結果
 * @summary クラス検索出力
 */
export interface SearchClassOutput {
	/** Total number of matches */
	total: number;
	/** Whether results were truncated */
	truncated: boolean;
	/** Search results */
	results: ClassSearchResult[];
	/** Error message if search failed */
	error?: string;
	/** Details with hints */
	details?: SearchDetails;
}

// ============================================
// Main Implementation
// ============================================

/**
 * クラス定義を検索
 * @summary クラス検索実行
 * @param input 検索入力パラメータ
 * @param cwd 作業ディレクトリ
 * @returns クラス検索結果
 */
export async function searchClass(
	input: SearchClassInput,
	cwd: string
): Promise<SearchClassOutput> {
	const limit = input.limit ?? 20;
	const includeMethods = input.includeMethods ?? true;
	const detailLevel = input.detailLevel ?? "full";

	// 1. クラス定義を検索
	const classResult = await symFind(
		{
			name: input.name,
			kind: ["class", "interface", "struct"],
			file: input.file,
			limit,
			detailLevel,
		},
		cwd
	);

	if (classResult.error) {
		return {
			total: 0,
			truncated: false,
			results: [],
			error: classResult.error,
		};
	}

	const results: ClassSearchResult[] = [];

	// 2. 各クラスについて処理
	for (const sym of classResult.results) {
		const classEntry: ClassSearchResult = {
			name: sym.name,
			kind: sym.kind,
			file: sym.file,
			line: sym.line,
			signature: sym.signature,
		};

		// 3. メソッド一覧を取得（オプション）
		if (includeMethods) {
			const methodsResult = await symFind(
				{
					scope: sym.name,
					kind: ["method", "function"],
					limit: 50,
					detailLevel: "signature",
				},
				cwd
			);

			if (!methodsResult.error && methodsResult.results.length > 0) {
				classEntry.methods = methodsResult.results.map((m) => ({
					name: m.name,
					signature: m.signature,
					line: m.line,
					kind: m.kind,
				}));
			}
		}

		results.push(classEntry);
	}

	return {
		total: classResult.total,
		truncated: classResult.truncated,
		results,
		details: classResult.details,
	};
}

/**
 * クラス検索結果をフォーマット
 * @summary 結果フォーマット
 * @param output 出力データ
 * @returns フォーマット済み文字列
 */
export function formatSearchClass(output: SearchClassOutput): string {
	const lines: string[] = [];

	if (output.error) {
		lines.push(`Error: ${output.error}`);
		return lines.join("\n");
	}

	lines.push(`Class Search: ${output.total} results${output.truncated ? " (truncated)" : ""}`);
	lines.push("");

	for (const cls of output.results) {
		lines.push(`${cls.kind} ${cls.name}`);
		lines.push(`  ${cls.file}:${cls.line}`);

		if (cls.signature) {
			lines.push(`  Signature: ${cls.signature}`);
		}

		if (cls.methods && cls.methods.length > 0) {
			lines.push(`  Methods (${cls.methods.length}):`);
			for (const method of cls.methods.slice(0, 10)) {
				const sig = method.signature ? `: ${method.signature}` : "";
				lines.push(`    - ${method.name}${sig}`);
			}
			if (cls.methods.length > 10) {
				lines.push(`    ... and ${cls.methods.length - 10} more`);
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
export const searchClassToolDefinition = {
	name: "search_class",
	label: "Search Class",
	description:
		"Search for class definitions with optional method listing. Supports wildcards in class name. Use includeMethods to get class structure overview.",
	parameters: null, // Will be set in index.ts
};
