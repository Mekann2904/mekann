/**
 * @abdd.meta
 * path: .pi/extensions/search/tools/file_candidates.ts
 * role: ファイル候補列挙ツールの実装（fd優先・Node.jsフォールバック付き）
 * why: 高速なファイル検索を提供しつつ、fd未導入環境でも動作保証するため
 * related: cli.js, output.js, constants.ts, cache.js
 * public_api: nativeFileCandidates（内部フォールバック関数）
 * invariants: limit未指定時はDEFAULT_LIMITを使用、結果は常にlimitで打ち切り
 * side_effects: ファイルシステム走査（readdir/stat）、キャッシュ操作（getSearchCache経由）
 * failure_modes: アクセス権限のないディレクトリは無視して継続、fd実行失敗時はnativeフォールバックへ移行
 * @abdd.explain
 * overview: fdコマンドベースのファイル列挙と、純粋Node.js実装のフォールバックを提供
 * what_it_does:
 *   - globパターン/拡張子/タイプ/除外パターンによるファイルフィルタリング
 *   - maxDepthによる再帰深度制限とlimitによる結果数制限
 *   - 隠しファイル（.始まり）の自動除外
 *   - DEFAULT_EXCLUDESによるnode_modules等の標準除外
 * why_it_exists:
 *   - fdコマンドの高速性を活用しつつ環境依存を吸収
 *   - 検索ツール群で再利用可能なファイル列挙ロジックの提供
 * scope:
 *   in: FileCandidatesInput（pattern, extension, type, limit, maxDepth, exclude）
 *   out: FileCandidatesOutput（FileCandidate配列）
 */

/**
 * file_candidates Tool
 *
 * Fast file enumeration using fd with fallback support
 */

import { execute, buildFdArgs, checkToolAvailability } from "../utils/cli.js";
import type { FileCandidatesInput, FileCandidatesOutput, FileCandidate } from "../types.js";
import { truncateResults, parseFdOutput, createErrorResponse, relativePath, createSimpleHints } from "../utils/output.js";
import { SearchToolError, isSearchToolError, getErrorMessage } from "../utils/errors.js";
import { DEFAULT_LIMIT, DEFAULT_EXCLUDES } from "../utils/constants.js";
import { getSearchCache, getCacheKey } from "../utils/cache.js";
import { getSearchHistory, extractQuery } from "../utils/history.js";

/**
 * Check if a name should be excluded based on exclude patterns.
 * Supports both exact matches and glob patterns (e.g., *.min.js).
 */
function shouldExclude(name: string, excludes: readonly string[]): boolean {
	for (const exc of excludes) {
		if (exc.startsWith("*.")) {
			// Glob pattern: match extension
			const ext = exc.slice(1); // *.min.js -> .min.js
			if (name.endsWith(ext)) return true;
		} else {
			// Exact or substring match
			if (name === exc || name.includes(exc)) return true;
		}
	}
	return false;
}

// ============================================
// Native Fallback Implementation
// ============================================

/**
 * Pure Node.js file enumeration fallback
 */
async function nativeFileCandidates(
	input: FileCandidatesInput,
	cwd: string
): Promise<FileCandidatesOutput> {
	const { readdir, stat } = await import("node:fs/promises");
	const { join } = await import("node:path");

	const results: FileCandidate[] = [];
	const limit = input.limit ?? DEFAULT_LIMIT;
	const maxDepth = input.maxDepth;

	// Apply DEFAULT_EXCLUDES if not explicitly provided
	const excludes = input.exclude ?? [...DEFAULT_EXCLUDES];

	async function scan(dirPath: string, depth: number): Promise<void> {
		if (results.length >= limit * 2) return; // Collect more than needed for filtering
		if (maxDepth !== undefined && depth > maxDepth) return;

		try {
			const entries = await readdir(dirPath, { withFileTypes: true });

			for (const entry of entries) {
				if (results.length >= limit * 2) break;

				// Skip hidden files
				if (entry.name.startsWith(".")) continue;

				// Skip excluded patterns using shouldExclude helper
				if (shouldExclude(entry.name, excludes)) {
					continue;
				}

				const fullPath = join(dirPath, entry.name);
				const relative = relativePath(fullPath, cwd);

				if (entry.isFile()) {
					// Apply type filter
					if (input.type && input.type !== "file") continue;

					// Apply extension filter
					if (input.extension && input.extension.length > 0) {
						const ext = entry.name.split(".").pop()?.toLowerCase();
						if (!ext || !input.extension.map((e) => e.toLowerCase()).includes(ext)) {
							continue;
						}
					}

					// Apply pattern filter
					if (input.pattern) {
						const regex = new RegExp(
							input.pattern.replace(/\./g, "\\.").replace(/\*/g, ".*").replace(/\?/g, ".")
						);
						if (!regex.test(entry.name)) continue;
					}

					results.push({ path: relative, type: "file" });
				} else if (entry.isDirectory()) {
					if (input.type === "file") {
						// Still scan directories for files
						await scan(fullPath, depth + 1);
					} else if (input.type === "dir") {
						results.push({ path: relative, type: "dir" });
						await scan(fullPath, depth + 1);
					} else {
						// No type filter, scan for both
						await scan(fullPath, depth + 1);
					}
				}
			}
		} catch {
			// Skip inaccessible directories
		}
	}

	await scan(cwd, 0);
	return truncateResults(results, limit);
}

// ============================================
// fd Command Implementation
// ============================================

/**
 * Use fd command for file enumeration
 */
async function useFdCommand(
	input: FileCandidatesInput,
	cwd: string
): Promise<FileCandidatesOutput> {
	const args = buildFdArgs(input);
	const limit = input.limit ?? DEFAULT_LIMIT;

	// Use input.cwd as search directory, fallback to cwd parameter
	const searchDir = input.cwd || cwd;

	const result = await execute("fd", args, { cwd: searchDir });

	if (result.code !== 0) {
		throw new Error(`fd command failed: ${result.stderr}`);
	}

	const candidates = parseFdOutput(result.stdout, input.type ?? "file");
	return truncateResults(candidates, limit);
}

// ============================================
// Helper Functions
// ============================================

/**
 * Extract file paths from results for history recording.
 */
function extractResultPaths(results: FileCandidate[]): string[] {
	return results.map((r) => r.path).filter(Boolean);
}

// ============================================
// Main Entry Point
// ============================================

 /**
  * fdまたはフォールバックでファイル候補を列挙
  * @param input 検索入力データ
  * @param cwd カレントワーキングディレクトリ
  * @returns ファイル候補の出力データ
  */
export async function fileCandidates(
	input: FileCandidatesInput,
	cwd: string
): Promise<FileCandidatesOutput> {
	const cache = getSearchCache();
	const history = getSearchHistory();
	const TOOL_NAME = "file_candidates";
	const CACHE_TTL = 10 * 60 * 1000; // 10 minutes for file enumeration
	const params = input as unknown as Record<string, unknown>;

	// 1. Generate cache key
	const cacheKey = getCacheKey(TOOL_NAME, { ...input, cwd });

	// 2. Check cache
	const cached = cache.getCached<FileCandidatesOutput>(cacheKey);
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
	let result: FileCandidatesOutput;
	try {
		const availability = await checkToolAvailability();

		if (availability.fd) {
			result = await useFdCommand({ ...input, cwd }, cwd);
		} else {
			result = await nativeFileCandidates(input, cwd);
		}
	} catch (error) {
		// Wrap error in SearchToolError if not already
		const toolError = isSearchToolError(error)
			? error
			: new SearchToolError(
					getErrorMessage(error),
					"execution",
					"Try using a different search pattern or reducing the scope"
				);

		// Fallback to native on error
		try {
			result = await nativeFileCandidates(input, cwd);
		} catch (nativeError) {
			return createErrorResponse<FileCandidate>(toolError.format());
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
	cache.setCache(cacheKey, { ...result, hints } as FileCandidatesOutput, CACHE_TTL);

	// 7. Return with hints in details
	return {
		...result,
		details: {
			hints,
		},
	} as FileCandidatesOutput;
}

/**
 * Tool definition for pi.registerTool
 */
export const fileCandidatesToolDefinition = {
	name: "file_candidates",
	label: "File Candidates",
	description:
		"Enumerate files and directories using fd with fast glob and extension filtering. Returns up to 100 results by default.",
	parameters: null, // Will be set in index.ts
};
