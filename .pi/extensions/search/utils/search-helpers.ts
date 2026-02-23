/**
 * @abdd.meta
 * path: .pi/extensions/search/utils/search-helpers.ts
 * role: 検索結果の統合・ランク付け・重複排除を行うユーティリティ
 * why: 複数の検索ツールから異なる形式で返却される結果を統一し、関連順に並べ替えて提示するため
 * related: ../types, search-core.ts, result-merger.ts
 * public_api: UnifiedSearchResult, MergeOptions, RankOptions
 * invariants: UnifiedSearchResultのscoreは数値、fileは必須、sourcesは文字列配列
 * side_effects: なし（純粋関数として機能）
 * failure_modes: 不正なスコア値によるランク付け崩壊、重複排除ロジックの不整合
 * @abdd.explain
 * overview: 異なる検索ツールの結果をマージし、一意の統一フォーマットでスコアリングするための型定義とヘルパー関数
 * what_it_does:
 *   - 複数の検索ソースからの結果を UnifiedSearchResult インターフェースに正規化する
 *   - MergeOptions に基づき、マルチソースでのヒットをスコアに反映する
 *   - RankOptions を用い、クエリとの完全一致・部分一致・パス一致に基づき結果を並べ替える
 *   - ファイル、マッチ、シンボルといった異なる種類の結果を共通の構造で扱う
 * why_it_exists:
 *   - 検索ツールごとに異なるレスポンス形式を吸収し、UI層での表示処理を単純化するため
 *   - 複数の検索エンジンを利用した場合の精度向上（重複排除・スコア強化）を実現するため
 * scope:
 *   in: 検索ツールからの生データ（CodeSearchMatch, SymbolDefinition, FileCandidate等）、マージ/ランク付けオプション
 *   out: 統一された UnifiedSearchResult の配列
 */

/**
 * Search Result Integration Helpers
 *
 * Utilities for merging and ranking results from multiple search tools:
 * - Unified result format
 * - Relevance ranking
 * - Deduplication
 */

import type { CodeSearchMatch, SymbolDefinition, FileCandidate } from "../types";

// ============================================
// Types
// ============================================

/**
 * 統合検索結果
 * @summary 検索結果定義
 * @param file ファイルパス
 * @param line 行番号
 * @param column 列番号
 * @param snippet コードスニペット
 * @param score スコア
 */
export interface UnifiedSearchResult {
	/**
	 * File path (always present).
	 */
	file: string;

	/**
	 * Line number (if applicable).
	 */
	line?: number;

	/**
	 * Column number (if applicable).
	 */
	column?: number;

	/**
	 * Code snippet or symbol name.
	 */
	snippet?: string;

	/**
	 * Relevance score (higher is more relevant).
	 */
	score: number;

	/**
	 * Tools that found this result.
	 */
	sources: string[];

	/**
	 * Result type.
	 */
	type: "file" | "match" | "symbol";

	/**
	 * Additional metadata.
	 */
	metadata?: Record<string, unknown>;
}

/**
 * マージオプション定義
 * @summary オプション定義
 * @param type 検索タイプ
 * @param boostMultiSource マルチソース強化
 * @param multiSourceBoost ソースブースト値
 * @param limit 上限数
 */
export interface MergeOptions {
	/**
	 * Whether to boost results found by multiple tools.
	 */
	boostMultiSource: boolean;

	/**
	 * Multiplier for multi-source boost.
	 */
	multiSourceBoost: number;

	/**
	 * Maximum results to return.
	 */
	limit: number;
}

/**
 * ランク付けオプション
 * @summary ランク付けオプション
 * @param query ランク付け対象のクエリ文字列
 * @param exactMatchWeight 完全一致の重み
 * @param partialMatchWeight 部分一致の重み
 */
export interface RankOptions {
	/**
	 * Query to rank against.
	 */
	query: string;

	/**
	 * Weight for exact matches.
	 */
	exactMatchWeight: number;

	/**
	 * Weight for partial matches.
	 */
	partialMatchWeight: number;

	/**
	 * Weight for file path matches.
	 */
	pathMatchWeight: number;
}

// ============================================
// Default Configuration
// ============================================

/**
 * Default merge options.
 */
export const DEFAULT_MERGE_OPTIONS: MergeOptions = {
	boostMultiSource: true,
	multiSourceBoost: 1.5,
	limit: 100,
};

/**
 * Default ranking options.
 */
export const DEFAULT_RANK_OPTIONS: RankOptions = {
	query: "",
	exactMatchWeight: 1.0,
	partialMatchWeight: 0.5,
	pathMatchWeight: 0.3,
};

// ============================================
// Result Converters
// ============================================

/**
 * @summary 変換処理実行
 * @param candidate 変換対象の候補ファイル情報
 * @param source 検索結果のソース
 * @returns 統合された検索結果オブジェクト
 */
export function fileCandidateToUnified(
	candidate: FileCandidate,
	source: string = "file_candidates"
): UnifiedSearchResult {
	return {
		file: candidate.path,
		score: 0.5, // Base score for file matches
		sources: [source],
		type: "file",
		metadata: {
			entryType: candidate.type,
		},
	};
}

/**
 * 検索結果を変換
 * @summary 変換
 * @param match 変換対象のコード検索結果
 * @param source ソース識別子（デフォルト: "code_search"）
 * @returns 統合検索結果
 */
export function codeSearchMatchToUnified(
	match: CodeSearchMatch,
	source: string = "code_search"
): UnifiedSearchResult {
	return {
		file: match.file,
		line: match.line,
		column: match.column,
		snippet: match.text,
		score: 0.7, // Base score for code matches
		sources: [source],
		type: "match",
		metadata: {
			context: match.context,
		},
	};
}

/**
 * シンボル定義を変換
 * @summary シンボル定義を変換
 * @param symbol 変換対象のシンボル定義
 * @param source 検索ソース（デフォルト: "sym_find"）
 * @returns 変換後の統合検索結果
 */
export function symbolDefinitionToUnified(
	symbol: SymbolDefinition,
	source: string = "sym_find"
): UnifiedSearchResult {
	return {
		file: symbol.file,
		line: symbol.line,
		snippet: `${symbol.kind} ${symbol.scope ? symbol.scope + "::" : ""}${symbol.name}${symbol.signature || ""}`,
		score: 0.8, // Base score for symbol matches
		sources: [source],
		type: "symbol",
		metadata: {
			name: symbol.name,
			kind: symbol.kind,
			signature: symbol.signature,
			scope: symbol.scope,
		},
	};
}

// ============================================
// Result Merging
// ============================================

 /**
  * 複数の検索結果をマージする
  * @param resultArrays マージする検索結果の配列
  * @param options マージオプション
  * @returns マージ後の検索結果
  */
export function mergeSearchResults(
	resultArrays: UnifiedSearchResult[][],
	options: Partial<MergeOptions> = {}
): UnifiedSearchResult[] {
	const opts = { ...DEFAULT_MERGE_OPTIONS, ...options };
	const merged = new Map<string, UnifiedSearchResult>();

	for (const results of resultArrays) {
		for (const result of results) {
			// Create a unique key for deduplication
			const key = createResultKey(result);

			const existing = merged.get(key);
			if (existing) {
				// Combine sources
				for (const source of result.sources) {
					if (!existing.sources.includes(source)) {
						existing.sources.push(source);
					}
				}

				// Boost score for multi-source results
				if (opts.boostMultiSource && existing.sources.length > 1) {
					existing.score = existing.score * opts.multiSourceBoost;
				}

				// Merge metadata
				if (result.metadata) {
					existing.metadata = {
						...existing.metadata,
						...result.metadata,
					};
				}
			} else {
				merged.set(key, { ...result });
			}
		}
	}

	return Array.from(merged.values());
}

/**
 * Create a unique key for a result.
 * Uses file + line + column for uniqueness.
 */
function createResultKey(result: UnifiedSearchResult): string {
	if (result.line !== undefined) {
		return `${result.file}:${result.line}:${result.column ?? 0}`;
	}
	return result.file;
}

// ============================================
// Result Ranking
// ============================================

/**
 * クエリに関連度で順位付け
 * @summary 関連度で順位付け
 * @param results 検索結果のリスト
 * @param query 検索クエリ
 * @returns 順位付けされた検索結果
 */
export function rankByRelevance(
	results: UnifiedSearchResult[],
	query: string
): UnifiedSearchResult[] {
	const normalizedQuery = query.toLowerCase();
	const queryTerms = normalizedQuery.split(/\s+/).filter(Boolean);

	// Score each result
	const scored = results.map((result) => ({
		...result,
		score: result.score + calculateRelevanceScore(result, normalizedQuery, queryTerms),
	}));

	// Sort by score descending
	return scored.sort((a, b) => b.score - a.score);
}

/**
 * Calculate relevance score for a result.
 */
function calculateRelevanceScore(
	result: UnifiedSearchResult,
	normalizedQuery: string,
	queryTerms: string[]
): number {
	let score = 0;

	// Check snippet for matches
	if (result.snippet) {
		const normalizedSnippet = result.snippet.toLowerCase();

		// Exact query match
		if (normalizedSnippet.includes(normalizedQuery)) {
			score += 1.0;
		}

		// Individual term matches
		for (const term of queryTerms) {
			if (normalizedSnippet.includes(term)) {
				score += 0.2;
			}
		}
	}

	// Check file path for matches
	const normalizedFile = result.file.toLowerCase();
	if (normalizedFile.includes(normalizedQuery)) {
		score += 0.5;
	}

	// Check metadata (symbol name, etc.)
	if (result.metadata?.name) {
		const normalizedName = String(result.metadata.name).toLowerCase();
		if (normalizedName === normalizedQuery) {
			score += 2.0; // Exact name match is very relevant
		} else if (normalizedName.includes(normalizedQuery)) {
			score += 0.8;
		}
	}

	return score;
}

// ============================================
// Deduplication
// ============================================

/**
 * 検索結果の重複を排除する
 * @summary 重複を排除する
 * @param results 検索結果のリスト
 * @returns 重複排除後の検索結果
 */
export function deduplicateResults(results: UnifiedSearchResult[]): UnifiedSearchResult[] {
	const seen = new Map<string, UnifiedSearchResult>();

	for (const result of results) {
		const key = createResultKey(result);
		const existing = seen.get(key);

		if (!existing || result.score > existing.score) {
			seen.set(key, result);
		}
	}

	return Array.from(seen.values());
}

// ============================================
// Complete Integration Pipeline
// ============================================

/**
 * 検索結果を統合してソート済みリストを返す
 * @summary 統合してソート済みリストを返す
 * @param fileCandidates ファイル候補のリスト
 * @param codeMatches コード一致のリスト
 * @param symbols シンボル定義のリスト
 * @param query 検索クエリ
 * @param options マージオプション
 * @returns 統合・ソートされた検索結果
 */
export function integrateSearchResults(
	fileCandidates: FileCandidate[] = [],
	codeMatches: CodeSearchMatch[] = [],
	symbols: SymbolDefinition[] = [],
	query: string = "",
	options: Partial<MergeOptions> = {}
): UnifiedSearchResult[] {
	const opts = { ...DEFAULT_MERGE_OPTIONS, ...options };

	// Convert all results to unified format
	const unifiedFile = fileCandidates.map((c) => fileCandidateToUnified(c));
	const unifiedCode = codeMatches.map((m) => codeSearchMatchToUnified(m));
	const unifiedSymbols = symbols.map((s) => symbolDefinitionToUnified(s));

	// Merge
	const merged = mergeSearchResults(
		[unifiedFile, unifiedCode, unifiedSymbols],
		opts
	);

	// Rank
	const ranked = rankByRelevance(merged, query);

	// Deduplicate (in case ranking changed order)
	const deduped = deduplicateResults(ranked);

	// Apply limit
	return deduped.slice(0, opts.limit);
}

// ============================================
// Utility Functions
// ============================================

/**
 * 検索結果をファイルごとにグループ化
 * @summary ファイルごとにグループ化
 * @param results 検索結果のリスト
 * @returns ファイルパスをキーとした結果のマップ
 */
export function groupByFile(results: UnifiedSearchResult[]): Map<string, UnifiedSearchResult[]> {
	const grouped = new Map<string, UnifiedSearchResult[]>();

	for (const result of results) {
		const list = grouped.get(result.file) || [];
		list.push(result);
		grouped.set(result.file, list);
	}

	return grouped;
}

/**
 * 検索結果をタイプでフィルタ
 * @summary タイプでフィルタ
 * @param results 検索結果のリスト
 * @param type フィルタするタイプ
 * @returns フィルタ後の検索結果
 */
export function filterByType(
	results: UnifiedSearchResult[],
	type: "file" | "match" | "symbol"
): UnifiedSearchResult[] {
	return results.filter((r) => r.type === type);
}

/**
 * ファイルパターンで抽出
 * @summary パターンで抽出
 * @param results 統合検索結果の配列
 * @param pattern ファイルパターン（正規表現互換）
 * @returns フィルタリングされた結果配列
 */
export function filterByFilePattern(
	results: UnifiedSearchResult[],
	pattern: string
): UnifiedSearchResult[] {
	const regex = new RegExp(pattern.replace(/\*/g, ".*"));
	return results.filter((r) => regex.test(r.file));
}

/**
 * 統合結果をフォーマット
 * @summary 統合結果をフォーマット
 * @param result 統合検索結果
 * @returns フォーマット済み文字列
 */
export function formatUnifiedResult(result: UnifiedSearchResult): string {
	const parts: string[] = [];

	// File and line
	if (result.line !== undefined) {
		parts.push(`${result.file}:${result.line}`);
	} else {
		parts.push(result.file);
	}

	// Type
	parts.push(`[${result.type}]`);

	// Sources
	parts.push(`(from: ${result.sources.join(", ")})`);

	// Score
	parts.push(`score: ${result.score.toFixed(2)}`);

	// Snippet
	if (result.snippet) {
		parts.push(`- ${result.snippet}`);
	}

	return parts.join(" ");
}

/**
 * 統合結果を整形する
 * @summary 統合結果を整形
 * @param results 統合検索結果の配列
 * @returns 整形された文字列
 */
export function formatUnifiedResults(results: UnifiedSearchResult[]): string {
	const lines: string[] = [];

	lines.push(`Found ${results.length} unified results`);
	lines.push("");

	for (const result of results) {
		lines.push(formatUnifiedResult(result));
	}

	return lines.join("\n");
}
