/**
 * @abdd.meta
 * path: .pi/extensions/search/tools/merge_results.ts
 * role: 検索結果統合ツールの実装
 * why: 複数の検索手法（semantic, symbol, code）の結果を統合し、ランキング精度を向上させるため
 * related: ../types.ts, ./sym_find.ts, ./code_search.ts, ./semantic_search.ts, ../utils/output.ts
 * public_api: mergeResults, formatMergeResults, mergeResultsToolDefinition
 * invariants: スコアは0.0-1.0の範囲、結果はスコア降順でソート
 * side_effects: sym_find, code_search, semantic_searchを内部的に呼び出す
 * failure_modes: いずれかのソースでエラーが発生した場合、エラーメッセージを含める
 * @abdd.explain
 * overview: 複数の検索手法の結果を統合し、Rank Fusionや加重平均でランキングを改善するツール
 * what_it_does:
 *   - semantic_search（意味検索）、sym_find（シンボル検索）、code_search（コード検索）を並列実行
 *   - 各ソースの結果に重み付けを行い、統合スコアを計算
 *   - 重複除去（ファイル+行番号ベース）を実施
 *   - weighted（加重平均）、rank_fusion（RRF）、interleave（交互配置）の3つのマージ戦略をサポート
 * why_it_exists:
 *   - 単一の検索手法では見逃される結果を減らすため
 *   - 複数の検索手法の結果を組み合わせて精度を向上させるため
 *   - エージェントが複数のツールを個別に呼び出す負担を減らすため
 * scope:
 *   in: MergeResultsInput（ソース配列、重複除去フラグ、上限、マージ戦略）
 *   out: MergeResultsResult（統合結果、統計情報）
 */

/**
 * merge_results Tool
 *
 * Merge results from multiple search methods with ranking improvements.
 * Supports weighted, rank_fusion, and interleave strategies.
 */

import type {
	MergeResultsInput,
	MergeResultsResult,
	MergedResult,
	MergeSource,
	SearchSourceType,
	MergeStrategy,
	SymbolDefinition,
	CodeSearchMatch,
} from "../types.js";
import { symFind } from "./sym_find.js";
import { codeSearch } from "./code_search.js";
import { semanticSearch } from "./semantic_search.js";

// ============================================
// Internal Result Types
// ============================================

/**
 * 内部検索結果
 * @summary 内部結果型
 */
interface InternalResult {
	file: string;
	line?: number;
	content: string;
	sourceType: SearchSourceType;
	rank: number;
	score: number;
}

// ============================================
// Source Execution
// ============================================

/**
 * 単一ソースの検索を実行
 * @summary ソース検索実行
 * @param source 検索ソース
 * @param cwd 作業ディレクトリ
 * @returns 内部結果配列
 */
async function executeSource(
	source: MergeSource,
	cwd: string
): Promise<InternalResult[]> {
	const results: InternalResult[] = [];

	try {
		switch (source.type) {
			case "semantic": {
				const output = await semanticSearch(
					{
						query: source.query,
						topK: 30,
					},
					cwd
				);

				if (output.results) {
					for (let i = 0; i < output.results.length; i++) {
						const r = output.results[i];
						results.push({
							file: r.file,
							line: r.line,
							content: r.code,
							sourceType: "semantic",
							rank: i + 1,
							score: r.similarity,
						});
					}
				}
				break;
			}

			case "symbol": {
				const output = await symFind(
					{
						name: source.query,
						limit: 30,
					},
					cwd
				);

				if (output.results) {
					for (let i = 0; i < output.results.length; i++) {
						const r = output.results[i];
						results.push({
							file: r.file,
							line: r.line,
							content: r.signature ?? `${r.kind} ${r.name}`,
							sourceType: "symbol",
							rank: i + 1,
							score: 1.0 - (i / output.results.length) * 0.5, // Decay from 1.0 to 0.5
						});
					}
				}
				break;
			}

			case "code": {
				const output = await codeSearch(
					{
						pattern: source.query,
						limit: 30,
					},
					cwd
				);

				if (output.results) {
					for (let i = 0; i < output.results.length; i++) {
						const r = output.results[i];
						results.push({
							file: r.file,
							line: r.line,
							content: r.text,
							sourceType: "code",
							rank: i + 1,
							score: 1.0 - (i / output.results.length) * 0.5, // Decay from 1.0 to 0.5
						});
					}
				}
				break;
			}
		}
	} catch (error) {
		// Log error but continue with other sources
		console.error(`merge_results: ${source.type} search failed:`, error);
	}

	return results;
}

// ============================================
// Deduplication
// ============================================

/**
 * 結果のキーを生成
 * @summary キー生成
 * @param result 内部結果
 * @returns 一意キー
 */
function getResultKey(result: InternalResult): string {
	return `${result.file}:${result.line ?? 0}`;
}

/**
 * 結果を重複除去
 * @summary 重複除去
 * @param allResults 全結果配列
 * @returns 重複除去済み結果マップ
 */
function deduplicateResults(
	allResults: InternalResult[]
): Map<string, InternalResult[]> {
	const grouped = new Map<string, InternalResult[]>();

	for (const result of allResults) {
		const key = getResultKey(result);
		if (!grouped.has(key)) {
			grouped.set(key, []);
		}
		grouped.get(key)!.push(result);
	}

	return grouped;
}

// ============================================
// Merge Strategies
// ============================================

/**
 * 加重平均でスコアを計算
 * @summary 加重平均計算
 * @param results 同一キーの結果配列
 * @param sourceWeights ソースの重みマップ
 * @returns 統合スコア
 */
function calculateWeightedScore(
	results: InternalResult[],
	sourceWeights: Map<SearchSourceType, number>
): number {
	let totalWeight = 0;
	let weightedSum = 0;

	for (const result of results) {
		const weight = sourceWeights.get(result.sourceType) ?? 1.0;
		weightedSum += result.score * weight;
		totalWeight += weight;
	}

	return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

/**
 * Rank Fusion (RRF) でスコアを計算
 * @summary RRFスコア計算
 * @param results 同一キーの結果配列
 * @param k RRF定数（デフォルト60）
 * @returns RRFスコア
 */
function calculateRRFScore(results: InternalResult[], k = 60): number {
	let rrfScore = 0;

	for (const result of results) {
		rrfScore += 1 / (k + result.rank);
	}

	return rrfScore;
}

/**
 * 加重平均戦略でマージ
 * @summary 加重マージ
 * @param grouped 重複除去済み結果マップ
 * @param sourceWeights ソースの重みマップ
 * @returns 統合結果配列
 */
function mergeWeighted(
	grouped: Map<string, InternalResult[]>,
	sourceWeights: Map<SearchSourceType, number>
): MergedResult[] {
	const merged: MergedResult[] = [];

	for (const [key, results] of grouped) {
		const bestResult = results[0];
		const score = calculateWeightedScore(results, sourceWeights);
		const sources = [...new Set(results.map((r) => r.sourceType))];

		merged.push({
			file: bestResult.file,
			line: bestResult.line,
			content: bestResult.content,
			score,
			sources,
		});
	}

	// Sort by score descending
	merged.sort((a, b) => b.score - a.score);

	return merged;
}

/**
 * Rank Fusion戦略でマージ
 * @summary RRFマージ
 * @param grouped 重複除去済み結果マップ
 * @returns 統合結果配列
 */
function mergeRankFusion(
	grouped: Map<string, InternalResult[]>
): MergedResult[] {
	const merged: MergedResult[] = [];

	for (const [key, results] of grouped) {
		const bestResult = results[0];
		const score = calculateRRFScore(results);
		const sources = [...new Set(results.map((r) => r.sourceType))];

		merged.push({
			file: bestResult.file,
			line: bestResult.line,
			content: bestResult.content,
			score,
			sources,
		});
	}

	// Sort by score descending
	merged.sort((a, b) => b.score - a.score);

	return merged;
}

/**
 * インターリーブ戦略でマージ
 * @summary インターリーブ
 * @param allResults 全結果配列（ソース順）
 * @param sourceWeights ソースの重みマップ
 * @param limit 上限
 * @returns 統合結果配列
 */
function mergeInterleave(
	allResults: InternalResult[],
	sourceWeights: Map<SearchSourceType, number>,
	limit: number
): MergedResult[] {
	// Group by source type
	const bySource = new Map<SearchSourceType, InternalResult[]>();
	for (const result of allResults) {
		if (!bySource.has(result.sourceType)) {
			bySource.set(result.sourceType, []);
		}
		bySource.get(result.sourceType)!.push(result);
	}

	// Sort each source by weight (highest first)
	const sortedSources = [...bySource.entries()].sort(
		(a, b) => (sourceWeights.get(b[0]) ?? 1.0) - (sourceWeights.get(a[0]) ?? 1.0)
	);

	const merged: MergedResult[] = [];
	const seen = new Set<string>();
	const indices = new Map<SearchSourceType, number>();

	// Initialize indices
	for (const [sourceType] of sortedSources) {
		indices.set(sourceType, 0);
	}

	// Interleave results
	while (merged.length < limit) {
		let addedAny = false;

		for (const [sourceType, results] of sortedSources) {
			const idx = indices.get(sourceType) ?? 0;
			if (idx >= results.length) continue;

			const result = results[idx];
			const key = getResultKey(result);

			if (!seen.has(key)) {
				seen.add(key);
				merged.push({
					file: result.file,
					line: result.line,
					content: result.content,
					score: result.score,
					sources: [sourceType],
				});
				addedAny = true;

				if (merged.length >= limit) break;
			}

			indices.set(sourceType, idx + 1);
		}

		if (!addedAny) break;
	}

	return merged;
}

// ============================================
// Main Entry Point
// ============================================

/**
 * 検索結果統合を実行
 * @summary 統合検索実行
 * @param input 入力パラメータ
 * @param cwd 作業ディレクトリ
 * @returns 統合検索結果
 */
export async function mergeResults(
	input: MergeResultsInput,
	cwd: string
): Promise<MergeResultsResult> {
	const deduplicate = input.deduplicate ?? true;
	const limit = input.limit ?? 20;
	const mergeStrategy = input.mergeStrategy ?? "weighted";

	if (!input.sources || input.sources.length === 0) {
		return {
			merged: [],
			stats: {
				totalSources: 0,
				totalResults: 0,
				duplicatesRemoved: 0,
			},
			error: "sources array is required",
		};
	}

	// Build source weights map
	const sourceWeights = new Map<SearchSourceType, number>();
	for (const source of input.sources) {
		const weight = source.weight ?? 1.0;
		// If same source type appears multiple times, use the max weight
		const existing = sourceWeights.get(source.type) ?? 0;
		sourceWeights.set(source.type, Math.max(existing, weight));
	}

	// Execute all sources in parallel
	const sourcePromises = input.sources.map((source) => executeSource(source, cwd));
	const sourceResults = await Promise.all(sourcePromises);

	// Flatten all results
	const allResults: InternalResult[] = [];
	for (const results of sourceResults) {
		allResults.push(...results);
	}

	const totalResults = allResults.length;

	// Deduplicate
	let grouped: Map<string, InternalResult[]>;
	let duplicatesRemoved = 0;

	if (deduplicate) {
		grouped = deduplicateResults(allResults);
		duplicatesRemoved = totalResults - grouped.size;
	} else {
		grouped = new Map();
		for (const result of allResults) {
			const key = getResultKey(result);
			if (!grouped.has(key)) {
				grouped.set(key, []);
			}
			grouped.get(key)!.push(result);
		}
	}

	// Apply merge strategy
	let merged: MergedResult[];

	switch (mergeStrategy) {
		case "rank_fusion":
			merged = mergeRankFusion(grouped);
			break;

		case "interleave":
			merged = mergeInterleave(allResults, sourceWeights, limit);
			break;

		case "weighted":
		default:
			merged = mergeWeighted(grouped, sourceWeights);
			break;
	}

	// Apply limit
	const limited = merged.slice(0, limit);

	return {
		merged: limited,
		stats: {
			totalSources: input.sources.length,
			totalResults,
			duplicatesRemoved,
		},
	};
}

// ============================================
// Formatting
// ============================================

/**
 * 統合検索結果をフォーマット
 * @summary 結果フォーマット
 * @param result 統合検索結果
 * @returns フォーマット済み文字列
 */
export function formatMergeResults(result: MergeResultsResult): string {
	if (result.error) {
		return `Error: ${result.error}`;
	}

	const lines: string[] = [];

	lines.push(`Merged Results: ${result.merged.length} items`);
	lines.push(`Sources: ${result.stats.totalSources}, Total: ${result.stats.totalResults}, Duplicates removed: ${result.stats.duplicatesRemoved}`);
	lines.push("");

	for (let i = 0; i < result.merged.length; i++) {
		const item = result.merged[i];
		const lineNum = item.line ? `:${item.line}` : "";
		const sources = item.sources.join(", ");
		const score = item.score.toFixed(3);

		lines.push(`${i + 1}. ${item.file}${lineNum} (score: ${score}) [${sources}]`);
		lines.push(`   ${item.content.slice(0, 100)}${item.content.length > 100 ? "..." : ""}`);
		lines.push("");
	}

	return lines.join("\n");
}

/**
 * Tool definition for pi.registerTool
 */
export const mergeResultsToolDefinition = {
	name: "merge_results",
	label: "Merge Results",
	description:
		"Merge results from multiple search methods (semantic, symbol, code) with ranking improvements. Supports weighted, rank_fusion, and interleave strategies.",
	parameters: null, // Will be set in index.ts
};
