/**
 * @abdd.meta
 * path: .pi/extensions/search/tools/code_search.ts
 * role: コード検索ツールの実装およびripgrepが利用不可の場合のフォールバック処理
 * why: 高速なコード検索を提供し、環境依存しない検索機能を保証するため
 * related: .pi/extensions/search/types.js, .pi/extensions/search/utils/cli.js, .pi/extensions/search/utils/output.js
 * public_api: nativeCodeSearch, normalizeCodeSearchInput
 * invariants: 検索結果の件数(limit)と行数(context)は定義された最大値以下、正規表現パターンは事前に検証される
 * side_effects: ファイルシステムの読み取り、結果に応じたエラーオブジェクトの生成
 * failure_modes: 無効な正規表現パターン、ファイルシステム読み取りエラー、制限値超過による結果の途切れ
 * @abdd.explain
 * overview: ripgrepを利用した高速コード検索と、それが利用できない場合のNode.jsネイティブ実装によるフォールバックを提供するモジュール
 * what_it_does:
 *   - 入力パラメータの制限値とコンテキスト行数を安全な範囲に正規化する
 *   - ripgrepが利用可能な場合、外部プロセスとして検索を実行する
 *   - ripgrepが利用不可の場合、Node.jsのfsモジュールでファイルを走査し正規表現マッチングを行う
 *   - マッチした行のパス、行番号、カラム位置、周辺コンテキストを含む結果を生成する
 * why_it_exists:
 *   - 外部ツールへの依存を最小限にしつつ、大規模コードベースでの検索パフォーマンスを維持するため
 *   - 実行環境によってripgrepがインストールされていない場合でも検索機能を利用可能にするため
 * scope:
 *   in: 検索パターン、パス、オプション(大文字小文字区別、リテラル検索、リミット、コンテキスト行数)
 *   out: 検索結果の配列、またはエラー情報を含む検索出力オブジェクト
 */

/**
 * code_search Tool
 *
 * Fast code search using ripgrep (rg) with JSON output and fallback support
 */

import { execute, buildRgArgs, checkToolAvailability } from "../utils/cli.js";
import type {
	CodeSearchInput,
	CodeSearchOutput,
	CodeSearchMatch,
	CodeSearchSummary,
} from "../types.js";
import {
	truncateResults,
	parseRgOutput,
	summarizeResults,
	createCodeSearchError,
	createHintsWithBudget,
	estimateCodeSearchMatchTokens,
	estimateResponseTokens,
	DEFAULT_CONTEXT_BUDGET,
} from "../utils/output.js";
import { SearchToolError, isSearchToolError, getErrorMessage, parameterError } from "../utils/errors.js";
import {
	DEFAULT_CODE_SEARCH_LIMIT,
	DEFAULT_IGNORE_CASE,
	DEFAULT_EXCLUDES,
	MAX_CODE_SEARCH_LIMIT,
	MAX_CODE_SEARCH_CONTEXT,
} from "../utils/constants.js";
import { getSearchCache, getCacheKey } from "../utils/cache.js";
import { getSearchHistory, extractQuery } from "../utils/history.js";

/**
 * Clamp code_search input values to safe bounds.
 * This prevents oversized responses that can bloat model context.
 */
function normalizeCodeSearchInput(input: CodeSearchInput): CodeSearchInput {
	const limit = Math.max(
		1,
		Math.min(
			MAX_CODE_SEARCH_LIMIT,
			Math.floor(input.limit ?? DEFAULT_CODE_SEARCH_LIMIT)
		)
	);

	const context = Math.max(
		0,
		Math.min(MAX_CODE_SEARCH_CONTEXT, Math.floor(input.context ?? 0))
	);

	return {
		...input,
		limit,
		context,
	};
}

// ============================================
// Native Fallback Implementation
// ============================================

/**
 * Pure Node.js code search fallback
 * @summary ネイティブコード検索
 * @param input 検索入力データ
 * @param cwd 作業ディレクトリパス
 * @returns 検索結果データ
 */
export async function nativeCodeSearch(
	input: CodeSearchInput,
	cwd: string
): Promise<CodeSearchOutput> {
	const safeInput = normalizeCodeSearchInput(input);
	const { readdir, readFile } = await import("node:fs/promises");
	const { join, relative } = await import("node:path");

	const results: CodeSearchMatch[] = [];
	const limit = safeInput.limit ?? DEFAULT_CODE_SEARCH_LIMIT;
	const ignoreCase = safeInput.ignoreCase ?? DEFAULT_IGNORE_CASE;
	const summary = new Map<string, number>();

	// Build regex pattern
	let pattern: RegExp;
	try {
		const flags = ignoreCase ? "gi" : "g";
		if (safeInput.literal) {
			const escaped = safeInput.pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			pattern = new RegExp(escaped, flags);
		} else {
			pattern = new RegExp(safeInput.pattern, flags);
		}
	} catch (e) {
		return createCodeSearchError(`Invalid pattern: ${e}`);
	}

	async function searchFile(filePath: string): Promise<void> {
		try {
			const content = await readFile(filePath, "utf-8");
			const lines = content.split("\n");

			for (let i = 0; i < lines.length; i++) {
				if (results.length >= limit * 2) break;

				const line = lines[i];
				const match = pattern.exec(line);

				if (match) {
					const relPath = relative(cwd, filePath);
					const result: CodeSearchMatch = {
						file: relPath,
						line: i + 1,
						column: match.index + 1,
						text: line.trimEnd(),
					};

					// Context lines
					if (safeInput.context && safeInput.context > 0) {
						const start = Math.max(0, i - safeInput.context);
						const end = Math.min(lines.length - 1, i + safeInput.context);
						result.context = lines.slice(start, end + 1).map((l) => l.trimEnd());
					}

					results.push(result);
					summary.set(relPath, (summary.get(relPath) || 0) + 1);
				}

				// Reset regex lastIndex for global flag
				pattern.lastIndex = 0;
			}
		} catch {
			// Skip files that can't be read
		}
	}

	/**
	 * Check if a name matches any exclusion pattern.
	 * Supports both exact matches and glob-style patterns (e.g., *.min.js).
	 */
	function shouldExclude(name: string, patterns: readonly string[]): boolean {
		for (const pattern of patterns) {
			if (pattern.startsWith("*.")) {
				// Glob pattern: check extension match
				const ext = pattern.slice(1); // *.min.js -> .min.js
				if (name.endsWith(ext)) return true;
			} else {
				// Exact match
				if (name === pattern) return true;
			}
		}
		return false;
	}

	async function scanDir(dirPath: string): Promise<void> {
		try {
			const entries = await readdir(dirPath, { withFileTypes: true });
			// Combine DEFAULT_EXCLUDES with input.exclude
			const excludePatterns = safeInput.exclude
				? [...(DEFAULT_EXCLUDES as readonly string[]), ...safeInput.exclude] as readonly string[]
				: DEFAULT_EXCLUDES;

			for (const entry of entries) {
				if (results.length >= limit * 2) break;

				// Skip hidden files and exclude patterns
				if (entry.name.startsWith(".")) continue;
				if (shouldExclude(entry.name, excludePatterns)) continue;

				const fullPath = join(dirPath, entry.name);

				if (entry.isFile()) {
					// Type filter
					if (safeInput.type) {
						const ext = entry.name.split(".").pop()?.toLowerCase();
						if (ext !== safeInput.type.toLowerCase()) continue;
					}

					await searchFile(fullPath);
				} else if (entry.isDirectory()) {
					await scanDir(fullPath);
				}
			}
		} catch {
			// Skip inaccessible directories
		}
	}

	const searchPath = safeInput.path ? join(cwd, safeInput.path) : cwd;
	await scanDir(searchPath);

	const truncated = truncateResults(results, limit);
	return {
		total: truncated.total,
		truncated: truncated.truncated,
		summary: summarizeResults(summary),
		results: truncated.results,
	};
}

// ============================================
// rg Command Implementation
// ============================================

/**
 * Use ripgrep command for code search
 */
async function useRgCommand(
	input: CodeSearchInput,
	cwd: string
): Promise<CodeSearchOutput> {
	const safeInput = normalizeCodeSearchInput(input);
	const args = buildRgArgs(safeInput);
	const limit = safeInput.limit ?? DEFAULT_CODE_SEARCH_LIMIT;

	const result = await execute("rg", args, { cwd });

	if (result.code !== 0 && result.code !== 1) {
		// exitCode 1 means no matches, which is fine
		throw new Error(`rg command failed: ${result.stderr}`);
	}

	const { matches, summary } = parseRgOutput(result.stdout, safeInput.context ?? 0);
	const truncated = truncateResults(matches, limit);

	return {
		total: truncated.total,
		truncated: truncated.truncated,
		summary: summarizeResults(summary),
		results: truncated.results,
	};
}

// ============================================
// Helper Functions
// ============================================

/**
 * Extract file paths from results for history recording.
 */
function extractResultPaths(results: CodeSearchMatch[]): string[] {
	return results.map((r) => r.file).filter(Boolean);
}

// ============================================
// Main Entry Point
// ============================================

/**
 * コードを検索
 * @summary コード検索
 * @param input 検索入力データ
 * @param cwd 作業ディレクトリパス
 * @returns 検索結果データ
 */
export async function codeSearch(
	input: CodeSearchInput,
	cwd: string
): Promise<CodeSearchOutput> {
	const safeInput = normalizeCodeSearchInput(input);

	if (!safeInput.pattern || safeInput.pattern.length === 0) {
		throw parameterError("pattern", "Search pattern is required", "Provide a search pattern");
	}

	const cache = getSearchCache();
	const history = getSearchHistory();
	const TOOL_NAME = "code_search";
	const CACHE_TTL = 5 * 60 * 1000; // 5 minutes for code search
	const params = safeInput as unknown as Record<string, unknown>;

	// 1. Generate cache key
	const cacheKey = getCacheKey(TOOL_NAME, { ...safeInput, cwd });

	// 2. Check cache
	const cached = cache.getCached<CodeSearchOutput>(cacheKey);
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

	// 3. Execute search
	let result: CodeSearchOutput;
	try {
		const availability = await checkToolAvailability();

		if (availability.rg) {
			result = await useRgCommand({ ...safeInput, cwd }, cwd);
		} else {
			result = await nativeCodeSearch(safeInput, cwd);
		}
	} catch (error) {
		// Wrap error in SearchToolError if not already
		const toolError = isSearchToolError(error)
			? error
			: new SearchToolError(
					getErrorMessage(error),
					"execution",
					"Try simplifying the search pattern or using literal mode"
				);

		// Fallback to native on error
		try {
			result = await nativeCodeSearch(safeInput, cwd);
		} catch (nativeError) {
			return createCodeSearchError(toolError.format());
		}
	}

	// 4. Estimate tokens and generate hints with budget
	const estimatedTokens = estimateResponseTokens(result, estimateCodeSearchMatchTokens);
	const hints = createHintsWithBudget(
		TOOL_NAME,
		result.results.length,
		result.truncated,
		estimatedTokens,
		DEFAULT_CONTEXT_BUDGET,
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
	cache.setCache(cacheKey, { ...result, hints } as CodeSearchOutput, CACHE_TTL);

	// 7. Return with hints in details
	return {
		...result,
		details: {
			hints,
		},
	} as CodeSearchOutput;
}

/**
 * Tool definition for pi.registerTool
 */
export const codeSearchToolDefinition = {
	name: "code_search",
	label: "Code Search",
	description:
		"Search code patterns using ripgrep (rg) with regex support. Returns matches with file, line, and context. Up to 50 results by default.",
	parameters: null, // Will be set in index.ts
};
