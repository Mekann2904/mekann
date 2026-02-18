/**
 * @abdd.meta
 * path: .pi/extensions/search/tools/code_search.ts
 * role: ripgrepベースのコード検索ツール実装。rgが利用不可能な場合はNode.jsネイティブ実装にフォールバック
 * why: 高速なコード検索機能を提供し、ripgrep未導入環境でも検索を可能にするため
 * related: ../utils/cli.js, ../types.js, ../utils/output.js, ../utils/cache.js
 * public_api: nativeCodeSearch関数（内部フォールバック用）、コード検索実行機能
 * invariants:
 *   - 入力パターンが正規表現として不正な場合はエラー結果を返す
 *   - 結果件数はlimit * 2を上限として切り捨てる
 *   - 読み取り不可能なファイルはサイレントにスキップする
 * side_effects:
 *   - ファイルシステムからのファイル読み込み
 *   - キャッシュへの読み書き（getSearchCache経由）
 *   - 検索履歴への記録（getSearchHistory経由）
 * failure_modes:
 *   - 不正な正規表現パターン指定時はcreateCodeSearchErrorを返却
 *   - ディレクトリ読み取り権限がない場合は当該ディレクトリをスキップ
 *   - ripgrep実行失敗時はネイティブ実装へフォールバック
 * @abdd.explain
 * overview: ripgrepを優先使用し、利用不可時にNode.jsネイティブ実装でコード検索を行うツール
 * what_it_does:
 *   - 正規表現またはリテラルパターンでソースコードを検索
 *   - 大文字小文字無視、除外パターン、コンテキスト行数を指定可能
 *   - 検索結果をファイル単位で集計しサマリーを生成
 *   - 結果をキャッシュし重複検索を高速化
 * why_it_exists:
 *   - 開発者がコードベース内の関数、変数、パターンを素早く見つけるため
 *   - 外部ツール依存を最小限に抑え、環境差異を吸収するため
 *   - 検索結果の構造化と要約でAIによるコード理解を支援するため
 * scope:
 *   in: 検索パターン（正規表現/リテラル）、対象ディレクトリ、オプション（limit, ignoreCase, context, excludes）
 *   out: CodeSearchOutput（マッチ結果配列、サマリー、ヒント、エラー情報）
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
	createSimpleHints,
} from "../utils/output.js";
import { SearchToolError, isSearchToolError, getErrorMessage, parameterError } from "../utils/errors.js";
import { DEFAULT_CODE_SEARCH_LIMIT, DEFAULT_IGNORE_CASE, DEFAULT_EXCLUDES } from "../utils/constants.js";
import { getSearchCache, getCacheKey } from "../utils/cache.js";
import { getSearchHistory, extractQuery } from "../utils/history.js";

// ============================================
// Native Fallback Implementation
// ============================================

/**
 * Pure Node.js code search fallback
 */
async function nativeCodeSearch(
	input: CodeSearchInput,
	cwd: string
): Promise<CodeSearchOutput> {
	const { readdir, readFile } = await import("node:fs/promises");
	const { join, relative } = await import("node:path");

	const results: CodeSearchMatch[] = [];
	const limit = input.limit ?? DEFAULT_CODE_SEARCH_LIMIT;
	const ignoreCase = input.ignoreCase ?? DEFAULT_IGNORE_CASE;
	const summary = new Map<string, number>();

	// Build regex pattern
	let pattern: RegExp;
	try {
		const flags = ignoreCase ? "gi" : "g";
		if (input.literal) {
			const escaped = input.pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			pattern = new RegExp(escaped, flags);
		} else {
			pattern = new RegExp(input.pattern, flags);
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
					if (input.context && input.context > 0) {
						const start = Math.max(0, i - input.context);
						const end = Math.min(lines.length - 1, i + input.context);
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

			for (const entry of entries) {
				if (results.length >= limit * 2) break;

				// Skip hidden files and DEFAULT_EXCLUDES patterns
				if (entry.name.startsWith(".")) continue;
				if (shouldExclude(entry.name, DEFAULT_EXCLUDES)) continue;

				const fullPath = join(dirPath, entry.name);

				if (entry.isFile()) {
					// Type filter
					if (input.type) {
						const ext = entry.name.split(".").pop()?.toLowerCase();
						if (ext !== input.type.toLowerCase()) continue;
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

	const searchPath = input.path ? join(cwd, input.path) : cwd;
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
	const args = buildRgArgs(input);
	const limit = input.limit ?? DEFAULT_CODE_SEARCH_LIMIT;

	const result = await execute("rg", args, { cwd });

	if (result.code !== 0 && result.code !== 1) {
		// exitCode 1 means no matches, which is fine
		throw new Error(`rg command failed: ${result.stderr}`);
	}

	const { matches, summary } = parseRgOutput(result.stdout, input.context ?? 0);
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
  * rgを使用したコード検索
  * @param input 検索条件
  * @param cwd 作業ディレクトリ
  * @returns 検索結果
  */
export async function codeSearch(
	input: CodeSearchInput,
	cwd: string
): Promise<CodeSearchOutput> {
	if (!input.pattern || input.pattern.length === 0) {
		throw parameterError("pattern", "Search pattern is required", "Provide a search pattern");
	}

	const cache = getSearchCache();
	const history = getSearchHistory();
	const TOOL_NAME = "code_search";
	const CACHE_TTL = 5 * 60 * 1000; // 5 minutes for code search
	const params = input as unknown as Record<string, unknown>;

	// 1. Generate cache key
	const cacheKey = getCacheKey(TOOL_NAME, { ...input, cwd });

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
			result = await useRgCommand({ ...input, cwd }, cwd);
		} else {
			result = await nativeCodeSearch(input, cwd);
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
			result = await nativeCodeSearch(input, cwd);
		} catch (nativeError) {
			return createCodeSearchError(toolError.format());
		}
	}

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
