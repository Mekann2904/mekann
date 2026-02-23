/**
 * @abdd.meta
 * path: .pi/extensions/search/tools/sym_find.ts
 * role: シンボル定義のフィルタリングおよびソート機能の実装
 * why: ctagsインデックスに対し、名前や種別による効率的な検索・抽出を行うため
 * related: ../types.js, ./sym_index.js, ../utils/output.js, ../utils/errors.js
 * public_api: wildcardToRegex, filterSymbols, sortSymbols
 * invariants: 正規表現変換時の特殊文字はエスケープされる、ソートは副作用を伴わず配列を直接操作する
 * side_effects: 引数で渡された配列（sortSymbolsの第1引数）の順序が変更される
 * failure_modes: 不正な正規表現パターンによる実行時エラー、定義されていない種別によるフィルタリング漏れ
 * @abdd.explain
 * overview: ctagsが生成したインデックスエントリに対して、ワイルドカードパターンや種別を用いたフィルタリングと、関連性に基づくソートを提供するモジュールである。
 * what_it_does:
 *   - ワイルドカード（*, ?）を含むパターン文字列を正規表現オブジェクトに変換する
 *   - シンボル名、種別、ファイルパスを条件としてインデックスエントリをフィルタリングする
 *   - 検索クエリへの一致度（完全一致優先）や種別に基づき、シンボル定義の配列をソートする
 * why_it_exists:
 *   - ユーザーの検索意图を柔軟なパターンマッチングで表現し、検索精度を高めるため
 *   - 大量のシンボル定義の中から関連性の高い結果を順序良く提示するため
 *   - ファイル間の依存関係を分離し、検索ロジックを再利用可能にするため
 * scope:
 *   in: 検索クエリ（SymFindInput）、シンボルインデックスエントリ配列
 *   out: フィルタリングおよびソート済みのシンボル定義配列、または正規表現オブジェクト
 */

/**
 * sym_find Tool
 *
 * Search symbol definitions from the ctags-generated index
 */

import type { SymFindInput, SymFindOutput, SymbolDefinition, SymbolIndexEntry } from "../types.js";
import { truncateResults, createErrorResponse, createSimpleHints } from "../utils/output.js";
import { SearchToolError, isSearchToolError, getErrorMessage, indexError } from "../utils/errors.js";
import { DEFAULT_SYMBOL_LIMIT } from "../utils/constants.js";
import { symIndex, readSymbolIndex } from "./sym_index.js";
import { getSearchCache, getCacheKey } from "../utils/cache.js";
import { getSearchHistory, extractQuery } from "../utils/history.js";

// ============================================
// Filtering
// ============================================

/**
 * Escape regex special characters
 * @summary 正規表現特殊文字をエスケープ
 * @param str 入力文字列
 * @returns エスケープされた文字列
 */
function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Convert wildcard pattern to regex
 * @summary ワイルドカードパターンを正規表現に変換
 * @param pattern ワイルドカードパターン
 * @param exactMatch 完全一致モード（デフォルト: false）
 * @returns 正規表現オブジェクト
 */
export function wildcardToRegex(pattern: string, exactMatch = false): RegExp {
	const escaped = escapeRegex(pattern);
	const regexStr = escaped.replace(/\\\*/g, ".*").replace(/\\\?/g, ".");

	// ワイルドカードを含まない場合は部分一致モードにする
	const hasWildcard = pattern.includes("*") || pattern.includes("?");
	const anchorStart = exactMatch || hasWildcard ? "^" : ".*";
	const anchorEnd = exactMatch || hasWildcard ? "$" : ".*";

	return new RegExp(`${anchorStart}${regexStr}${anchorEnd}`, "i");
}

/**
 * Filter symbols by criteria
 * @summary シンボルを条件でフィルタリング
 * @param entries シンボルインデックスエントリの配列
 * @param input 検索入力データ
 * @returns フィルタリングされたシンボル定義の配列
 */
export function filterSymbols(
	entries: SymbolIndexEntry[],
	input: SymFindInput
): SymbolDefinition[] {
	// Build name pattern regex
	let nameRegex: RegExp | null = null;
	if (input.name && input.name.length > 0) {
		nameRegex = wildcardToRegex(input.name);
	}

	// Normalize kinds for comparison
	const kinds = input.kind?.map((k) => k.toLowerCase());

	const results: SymbolDefinition[] = [];

	for (const entry of entries) {
		// Name filter
		if (nameRegex && !nameRegex.test(entry.name)) {
			continue;
		}

		// Kind filter
		if (kinds && kinds.length > 0) {
			const entryKind = entry.kind?.toLowerCase();
			if (!entryKind || !kinds.includes(entryKind)) {
				continue;
			}
		}

		// File filter
		if (input.file && input.file.length > 0) {
			if (!entry.file.includes(input.file)) {
				continue;
			}
		}

		results.push({
			name: entry.name,
			kind: entry.kind,
			file: entry.file,
			line: entry.line,
			signature: entry.signature,
			scope: entry.scope,
		});
	}

	return results;
}

/**
 * Sort symbols by relevance
 * @summary シンボルを関連性でソート
 * @param symbols シンボル定義の配列
 * @param input 検索入力データ
 */
export function sortSymbols(symbols: SymbolDefinition[], input: SymFindInput): void {
	symbols.sort((a, b) => {
		// Exact name match priority
		if (input.name) {
			const aExact = a.name.toLowerCase() === input.name.toLowerCase() ? 0 : 1;
			const bExact = b.name.toLowerCase() === input.name.toLowerCase() ? 0 : 1;
			if (aExact !== bExact) return aExact - bExact;
		}

		// Then by kind (functions first)
		const kindOrder: Record<string, number> = {
			function: 1,
			method: 2,
			class: 3,
			interface: 4,
			struct: 5,
			variable: 6,
			constant: 7,
		};
		const aKind = kindOrder[a.kind?.toLowerCase()] ?? 99;
		const bKind = kindOrder[b.kind?.toLowerCase()] ?? 99;
		if (aKind !== bKind) return aKind - bKind;

		// Then by file path
		return a.file.localeCompare(b.file);
	});
}

// ============================================
// Helper Functions
// ============================================

/**
 * Extract file paths from results for history recording.
 */
function extractResultPaths(results: SymbolDefinition[]): string[] {
	return results.map((r) => r.file).filter(Boolean);
}

// ============================================
// Main Entry Point
// ============================================

/**
 * シンボル検索を行う
 * @summary シンボル検索実行
 * @param input 検索入力データ
 * @param cwd 作業ディレクトリ
 * @returns シンボル検索出力データ
 */
export async function symFind(
	input: SymFindInput,
	cwd: string
): Promise<SymFindOutput> {
	const cache = getSearchCache();
	const history = getSearchHistory();
	const TOOL_NAME = "sym_find";
	const CACHE_TTL = 5 * 60 * 1000; // 5 minutes for symbol search
	const limit = input.limit ?? DEFAULT_SYMBOL_LIMIT;
	const params = input as unknown as Record<string, unknown>;

	// 1. Generate cache key
	const cacheKey = getCacheKey(TOOL_NAME, { ...input, cwd });

	// 2. Check cache
	const cached = cache.getCached<SymFindOutput>(cacheKey);
	if (cached) {
		// Record to history even on cache hit
		history.addHistoryEntry({
			tool: TOOL_NAME,
			params,
			query: extractQuery(TOOL_NAME, params),
			results: extractResultPaths(cached.results),
		});
		return cached;
	}

	// 3. Try to read existing index
	let entries = await readSymbolIndex(cwd);

	// If no index exists, try to generate one
	if (!entries || entries.length === 0) {
		try {
			const indexResult = await symIndex({ force: false, cwd }, cwd);

			// Check for error
			if (indexResult.error) {
				throw indexError(indexResult.error, "Run sym_index to generate the symbol index");
			}

			entries = await readSymbolIndex(cwd);
		} catch (error) {
			const toolError = isSearchToolError(error)
				? error
				: indexError(getErrorMessage(error));
			return createErrorResponse<SymbolDefinition>(toolError.format());
		}
	}

	if (!entries || entries.length === 0) {
		return {
			total: 0,
			truncated: false,
			results: [],
		};
	}

	// Filter entries
	const filtered = filterSymbols(entries, input);

	// Sort by relevance
	sortSymbols(filtered, input);

	// Truncate to limit
	const result = truncateResults(filtered, limit);

	// 4. Generate hints
	const hints = createSimpleHints(
		TOOL_NAME,
		result.results.length,
		result.truncated,
		extractQuery(TOOL_NAME, params)
	);

	// 5. Record to history
	history.addHistoryEntry({
		tool: TOOL_NAME,
		params,
		query: extractQuery(TOOL_NAME, params),
		results: extractResultPaths(result.results).slice(0, 10),
	});

	// 6. Save to cache
	cache.setCache(cacheKey, { ...result, hints } as SymFindOutput, CACHE_TTL);

	// 7. Return with hints in details
	return {
		...result,
		details: {
			hints,
		},
	} as SymFindOutput;
}

/**
 * Tool definition for pi.registerTool
 */
export const symFindToolDefinition = {
	name: "sym_find",
	label: "Symbol Find",
	description:
		"Search for symbol definitions (functions, classes, variables) from the ctags index. Supports pattern matching on name and filtering by kind.",
	parameters: null, // Will be set in index.ts
};
