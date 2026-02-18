/**
 * @abdd.meta
 * path: .pi/extensions/search/utils/search-helpers.ts
 * role: 複数検索ツールの結果を統合・正規化・ランク付けするユーティリティモジュール
 * why: 異なる検索ツール（コード検索、シンボル検索、ファイル検索）の結果を統一形式でマージし、重複排除と関連度順ソートを実現するため
 * related: .pi/extensions/search/types.ts, .pi/extensions/search/index.ts, .pi/extensions/search/tools/code-search.ts, .pi/extensions/search/tools/symbol-search.ts
 * public_api: UnifiedSearchResult, MergeOptions, RankOptions
 * invariants: UnifiedSearchResult.scoreは数値、UnifiedSearchResult.sourcesは空配列でない文字列配列、typeは"file"|"match"|"symbol"のいずれか
 * side_effects: なし（純粋関数・型定義のみ）
 * failure_modes: 不正な入力型によるランタイムエラー、score計算時の数値オーバーフロー、空のsources配列による整合性違反
 * @abdd.explain
 * overview: 検索拡張機能において、複数の検索ツールから返される結果を統一的な形式に変換し、マージ・重複排除・関連度ランク付けを行うための型定義とヘルパー関数を提供する
 * what_it_does:
 *   - CodeSearchMatch, SymbolDefinition, FileCandidate等の異なる結果型をUnifiedSearchResultに正規化
 *   - 複数ツールで見つかった同一結果の重複排除とsources配列への追跡
 *   - クエリに対する関連度スコア計算（完全一致、部分一致、パス一致の重み付け）
 *   - マージ時のマルチソースブースト適用と結果数制限
 * why_it_exists:
 *   - 検索ツールごとに異なる結果形式を統一し、UI層での一貫した表示を実現するため
 *   - 複数ツールの結果を組み合わせることで検索精度を向上させるため
 *   - スコアリングロジックを一箇所に集約し、保守性を確保するため
 * scope:
 *   in: CodeSearchMatch, SymbolDefinition, FileCandidate, MergeOptions, RankOptions
 *   out: UnifiedSearchResult, マージ・ランク付け済みの検索結果配列
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
  * 全ツール共通の検索結果形式
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
  * 結果をマージするためのオプション
  * @param boostMultiSource 複数のツールで見つかった結果をブーストするかどうか
  * @param multiSourceBoost 複数ソースブーストの乗数
  * @param limit 返す結果の最大数
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
  * 検索結果のランク付けオプション
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
  * FileCandidateをUnifiedSearchResultに変換する。
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
  * CodeSearchMatchをUnifiedSearchResultに変換する
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
  * SymbolDefinitionをUnifiedSearchResultに変換
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
  * クエリに関連性で検索結果をランク付けする
  * @param results 検索結果の配列
  * @param query 検索クエリ文字列
  * @returns 関連性スコアでソートされた検索結果
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
  * 重複を削除しスコアが高い結果を保持
  * @param results - 統合検索結果の配列
  * @returns 重複が排除された結果の配列
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
  * @param fileCandidates ファイル候補のリスト
  * @param codeMatches コード一致のリスト
  * @param symbols シンボル定義のリスト
  * @param query 検索クエリ文字列
  * @param options マージオプション
  * @returns 統合およびランク付けされた検索結果のリスト
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
 * Group results by file.
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
  * 検索結果をタイプで絞り込む
  * @param results - 検索結果の配列
  * @param type - 絞り込み対象のタイプ
  * @returns 指定されたタイプに一致する結果の配列
  */
export function filterByType(
	results: UnifiedSearchResult[],
	type: "file" | "match" | "symbol"
): UnifiedSearchResult[] {
	return results.filter((r) => r.type === type);
}

 /**
  * ファイルパスのパターンで結果をフィルタする。
  * @param results 検索結果の配列
  * @param pattern ファイルパターン（ワイルドカード*使用可）
  * @returns フィルタされた検索結果
  */
export function filterByFilePattern(
	results: UnifiedSearchResult[],
	pattern: string
): UnifiedSearchResult[] {
	const regex = new RegExp(pattern.replace(/\*/g, ".*"));
	return results.filter((r) => regex.test(r.file));
}

 /**
  * 検索結果を表示用にフォーマットします。
  * @param result 統合検索結果
  * @returns フォーマットされた文字列
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
  * 統合検索結果をフォーマットします
  * @param results 統合検索結果の配列
  * @returns フォーマットされた文字列
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
