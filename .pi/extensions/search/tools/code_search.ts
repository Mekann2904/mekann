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
import { resolveProbeLimit } from "../../../lib/tool-policy-engine.js";
import { getToolTelemetryStore } from "../../../lib/tool-telemetry-store.js";
import { getLogger } from "../../../lib/comprehensive-logger.js";
import {
	buildInputFingerprint,
	buildNormalizedSignature,
	createTelemetryId,
	estimateOutputBytes,
	summarizeOutput,
} from "../../../lib/tool-telemetry.js";

const CODE_SEARCH_PROBE_LIMIT = 20;
const NATIVE_CODE_SEARCH_TOOL_NAME = "native_code_search";

/**
 * 入力値を安全な範囲に正規化
 * @summary 入力値を正規化
 * @param input コード検索入力
 * @returns 正規化された入力
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

/**
 * パストラバーサル攻撃を防止
 * @summary パスを検証
 * @param path 検証対象のパス
 * @param cwd 基準ディレクトリ
 * @returns 検証結果（true: 安全, false: 危険）
 */
function isPathSafe(path: string | undefined, cwd: string): boolean {
	if (!path) return true;

	// 絶対パスへのアクセスを禁止（cwd外へのアクセス防止）
	if (path.startsWith("/")) return false;

	// Windowsの絶対パスも禁止
	if (/^[a-zA-Z]:/.test(path)) return false;

	// 親ディレクトリへの参照を禁止
	if (path.includes("..")) return false;

	// nullバイト攻撃を防止
	if (path.includes("\0")) return false;

	return true;
}

/**
 * エラーの種類を分類
 * @summary エラーを分類
 * @param error エラーオブジェクト
 * @returns エラーカテゴリ
 */
function categorizeError(error: unknown): "pattern" | "permission" | "timeout" | "unknown" {
	if (!(error instanceof Error)) return "unknown";

	const message = error.message.toLowerCase();

	// 正規表現パターンエラー（フォールバックしても同じエラーになる）
	if (message.includes("invalid pattern") ||
	    message.includes("invalid regex") ||
	    message.includes("syntax error") ||
	    message.includes("unterminated")) {
		return "pattern";
	}

	// 権限エラー（フォールバックしても同じエラーになる可能性が高い）
	if (message.includes("permission denied") ||
	    message.includes("eacces") ||
	    message.includes("access is denied")) {
		return "permission";
	}

	// タイムアウト（ネイティブ実装は遅いのでフォールバックしない方が良い）
	if (message.includes("timeout") ||
	    message.includes("timed out") ||
	    message.includes("etimedout")) {
		return "timeout";
	}

	return "unknown";
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
	cwd: string,
	executionMode: "probe" | "full" = "full"
): Promise<CodeSearchOutput> {
	const safeInput = normalizeCodeSearchInput(input);
	const telemetry = getToolTelemetryStore();
	const telemetryPayload = { ...safeInput, cwd };
	const inputFingerprint = buildInputFingerprint(NATIVE_CODE_SEARCH_TOOL_NAME, telemetryPayload);
	const normalizedSignature = buildNormalizedSignature(
		NATIVE_CODE_SEARCH_TOOL_NAME,
		telemetryPayload,
		["limit"]
	);
	const duplicate = telemetry.findRecentExactDuplicate(inputFingerprint);

	if (duplicate?.success && duplicate.metadata?.result) {
		const reusedResult = duplicate.metadata.result as CodeSearchOutput;
		telemetry.finish({
			id: createTelemetryId(`${NATIVE_CODE_SEARCH_TOOL_NAME}-reuse`),
			toolName: NATIVE_CODE_SEARCH_TOOL_NAME,
			startedAtMs: Date.now(),
			finishedAtMs: Date.now(),
			durationMs: 0,
			timeoutMs: 0,
			success: true,
			timedOut: false,
			aborted: false,
			retryCount: 0,
			outputBytes: estimateOutputBytes(reusedResult),
			inputFingerprint,
			normalizedSignature,
			duplicateOfId: duplicate.id,
			reusedPreviousResult: true,
			executionMode,
			resultSummary: summarizeOutput(reusedResult),
			metadata: {
				cwd,
				result: reusedResult,
			},
		});
		return reusedResult;
	}

	const pending = telemetry.start({
		id: createTelemetryId(NATIVE_CODE_SEARCH_TOOL_NAME),
		toolName: NATIVE_CODE_SEARCH_TOOL_NAME,
		startedAtMs: Date.now(),
		timeoutMs: 0,
		retryCount: 0,
		inputFingerprint,
		normalizedSignature,
		executionMode,
		metadata: { cwd, input: safeInput },
	});

	function finishNativeExecution(
		result: CodeSearchOutput,
		success: boolean,
		errorType?: "validation" | "execution" | "permission" | "unknown",
		errorMessage?: string
	): CodeSearchOutput {
		telemetry.finish({
			id: pending.id,
			toolName: NATIVE_CODE_SEARCH_TOOL_NAME,
			startedAtMs: pending.startedAtMs,
			finishedAtMs: Date.now(),
			durationMs: Date.now() - pending.startedAtMs,
			timeoutMs: 0,
			success,
			timedOut: false,
			aborted: false,
			retryCount: 0,
			outputBytes: estimateOutputBytes(result),
			inputFingerprint,
			normalizedSignature,
			executionMode,
			resultSummary: summarizeOutput(result),
			errorType,
			errorMessage,
			metadata: {
				cwd,
				input: safeInput,
				result,
			},
		});
		return result;
	}

	// パストラバーサル攻撃を防止
	if (!isPathSafe(safeInput.path, cwd)) {
		return finishNativeExecution(
			createCodeSearchError("Path traversal detected: path contains forbidden patterns"),
			false,
			"validation",
			"Path traversal detected"
		);
	}

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
		return finishNativeExecution(
			createCodeSearchError(`Invalid pattern: ${e}`),
			false,
			"validation",
			String(e)
		);
	}

	async function searchFile(filePath: string): Promise<void> {
		try {
			const content = await readFile(filePath, "utf-8");
			const lines = content.split("\n");

			for (let i = 0; i < lines.length; i++) {
				if (results.length >= limit * 2) break;

				const line = lines[i];

				// 1行内の全マッチを取得（matchAllを使用）
				const matches = Array.from(line.matchAll(pattern));

				for (const match of matches) {
					if (results.length >= limit * 2) break;

					const relPath = relative(cwd, filePath);
					const result: CodeSearchMatch = {
						file: relPath,
						line: i + 1,
						column: match.index! + 1,
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
				// limit * 2 まで収集する理由:
				// - truncateResultsでlimit件に切り詰める際、ファイル単位の要約情報を保持するため
				// - limitに達する前に収集を停止すると、サマリー情報が不正確になる
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

	// パストラバーサル検証済みの安全なパスを使用
	const searchPath = safeInput.path ? join(cwd, safeInput.path) : cwd;
	await scanDir(searchPath);

	const truncated = truncateResults(results, limit);
	return finishNativeExecution({
		total: truncated.total,
		truncated: truncated.truncated,
		summary: summarizeResults(summary),
		results: truncated.results,
	}, true);
}

// ============================================
// rg Command Implementation
// ============================================

/**
 * Use ripgrep command for code search
 */
async function useRgCommand(
	input: CodeSearchInput,
	cwd: string,
	executionMode: "probe" | "full" = "full"
): Promise<CodeSearchOutput> {
	const safeInput = normalizeCodeSearchInput(input);
	const args = buildRgArgs(safeInput);
	const limit = safeInput.limit ?? DEFAULT_CODE_SEARCH_LIMIT;

	const result = await execute("rg", args, { cwd, executionMode });

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

/**
 * まず小さいlimitで探索し、全量実行が本当に必要な時だけ再実行する。
 */
function buildProbeCodeSearchInput(input: CodeSearchInput): CodeSearchInput | null {
	const requestedLimit = input.limit ?? DEFAULT_CODE_SEARCH_LIMIT;
	const probeLimit = resolveProbeLimit({
		toolName: "rg",
		requestedLimit,
		minimumProbeLimit: 5,
		maximumProbeLimit: CODE_SEARCH_PROBE_LIMIT,
		metadata: {
			outputSizeEstimate: input.context && input.context > 0 ? "large" : "medium",
			requiresProbe: true,
		},
	});

	if (requestedLimit <= probeLimit) {
		return null;
	}

	return {
		...input,
		limit: probeLimit,
	};
}

/**
 * probe結果が完全なら、そのまま返してよい。
 */
function shouldRunFullCodeSearch(
	probeResult: CodeSearchOutput,
	requestedInput: CodeSearchInput,
	probeInput: CodeSearchInput
): boolean {
	const requestedLimit = requestedInput.limit ?? DEFAULT_CODE_SEARCH_LIMIT;
	const probeLimit = probeInput.limit ?? CODE_SEARCH_PROBE_LIMIT;

	if (probeResult.error) {
		return false;
	}

	if (requestedLimit <= probeLimit) {
		return false;
	}

	return probeResult.truncated;
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

	// パストラバーサル攻撃を防止
	if (!isPathSafe(safeInput.path, cwd)) {
		throw parameterError(
			"path",
			"Path traversal detected: path contains forbidden patterns",
			"Use a relative path without '..' or absolute path components"
		);
	}

	if (!safeInput.pattern || safeInput.pattern.length === 0) {
		throw parameterError("pattern", "Search pattern is required", "Provide a search pattern");
	}

	const cache = getSearchCache();
	const history = getSearchHistory();
	const TOOL_NAME = "code_search";
	const CACHE_TTL = 5 * 60 * 1000; // 5 minutes for code search
	const params = safeInput as unknown as Record<string, unknown>;
	const startTime = Date.now();

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
		const probeInput = buildProbeCodeSearchInput(safeInput);

		if (availability.rg) {
			if (probeInput) {
				const probeResult = await useRgCommand({ ...probeInput, cwd }, cwd, "probe");
				if (!shouldRunFullCodeSearch(probeResult, safeInput, probeInput)) {
					result = probeResult;
				} else {
					result = await useRgCommand({ ...safeInput, cwd }, cwd, "full");
				}
			} else {
				result = await useRgCommand({ ...safeInput, cwd }, cwd, "full");
			}
		} else {
			if (probeInput) {
				const probeResult = await nativeCodeSearch(probeInput, cwd, "probe");
				if (!shouldRunFullCodeSearch(probeResult, safeInput, probeInput)) {
					result = probeResult;
				} else {
					result = await nativeCodeSearch(safeInput, cwd, "full");
				}
			} else {
				result = await nativeCodeSearch(safeInput, cwd, "full");
			}
		}
	} catch (error: unknown) {
		// エラーを分類して、フォールバックの必要性を判断
		const errorCategory = categorizeError(error);

		// パターンエラーと権限エラーはフォールバックしても同じ結果になるためスキップ
		if (errorCategory === "pattern") {
			return createCodeSearchError(`Invalid regex pattern: ${error instanceof Error ? error.message : String(error)}`);
		}

		if (errorCategory === "permission") {
			return createCodeSearchError(`Permission denied: ${error instanceof Error ? error.message : String(error)}`);
		}

		// タイムアウトはネイティブ実装が遅いため、フォールバックせずエラーを返す
		if (errorCategory === "timeout") {
			return createCodeSearchError(`Search timed out. Try narrowing the search scope or using a more specific pattern.`);
		}

		// 不明なエラーの場合のみフォールバックを試行
		try {
			result = await nativeCodeSearch(safeInput, cwd, "full");
		} catch (nativeError) {
			const toolError = isSearchToolError(error)
				? error
				: new SearchToolError(
						getErrorMessage(error),
						"execution",
						"Try simplifying the search pattern or using literal mode"
					);
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

	// 5.5 Emit search metrics to observability for autoresearch tracking
	const logger = getLogger();
	logger.logToolResult(TOOL_NAME, {
		status: 'success',
		durationMs: Date.now() - startTime,
		outputType: 'inline',
		output: `${result.results.length} matches`,
		outputSize: estimateOutputBytes(result),
	});

	// 5.6 Emit token estimates to observability
	if (estimatedTokens > 0) {
		logger.logMetricsSnapshot({
			memoryUsageMB: 0,
			cpuPercent: 0,
			eventsTotal: 0,
			tasksCompleted: 0,
			operationsCompleted: 1,
			toolCallsTotal: 1,
			tokensTotal: estimatedTokens,
			errorRate: 0,
			avgResponseTimeMs: Date.now() - startTime,
			p95ResponseTimeMs: Date.now() - startTime,
		});
	}
	logger.flush().catch(() => { /* best effort */ });

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
