/**
 * @abdd.meta
 * path: .pi/extensions/search/tools/semantic_search.ts
 * role: 意味的コード検索エグゼキューター
 * why: ベクトル類似度に基づき、キーワードのみでは発見困難なコード断片を検索するため
 * related: ../types.js, ../utils/constants.js, ../../../lib/embeddings/utils.js
 * public_api: semanticSearch(input, cwd): Promise<SemanticSearchOutput>
 * invariants: 入力クエリは空文字ではない、検索対象インデックスは有効なJSONL形式である
 * side_effects: ファイルシステムからのインデックス読み込み（readFileSync）
 * failure_modes: インデックスファイル不在、JSONパースエラー、空のクエリ入力時は空リスト返却
 * @abdd.explain
 * overview: 事前に構築されたベクトルインデックスを用い、コサイン類似度による上位k件の検索を行う
 * what_it_does:
 *   - ディスクからsemantic-index.jsonlを読み込みCodeEmbedding配列を生成する
 *   - クエリベクトルと各コード埋め込みのコサイン類似度を計算する
 *   - 類似度が閾値以上の結果を類似度降順にソートし、上位k件を返却する
 * why_it_exists:
 *   - テキストマッチングでは不可能な「意味」に基づくコード検索を提供するため
 *   - 大規模なコードベースにおいて、関連する実装の特定を効率化するため
 * scope:
 *   in: 検索クエリ、取得件数(topK)、類似度閾値、フィルタ条件
 *   out: 検索ヒット数、切り捨てフラグ、検索結果リスト(パス、スコア等含む)、エラーメッセージ
 */

/**
 * Semantic Search Tool
 *
 * Performs semantic code search using vector similarity.
 * Requires a pre-built semantic index (use semantic_index first).
 *
 * Usage:
 *   semantic_search({ query: "function to parse JSON", topK: 10 })
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type {
	SemanticSearchInput,
	SemanticSearchOutput,
	SemanticSearchResult,
	CodeEmbedding,
} from "../types.js";
import { INDEX_DIR_NAME } from "../utils/constants.js";
import { cosineSimilarity } from "../../../lib/storage/embeddings/utils.js";

// ============================================================================
// Constants
// ============================================================================

const SEMANTIC_INDEX_FILE = "semantic-index.jsonl";
const DEFAULT_TOP_K = 10;
const DEFAULT_THRESHOLD = 0.5;

// ============================================================================
// Index Loading
// ============================================================================

function getIndexPath(cwd: string): string {
	return join(cwd, INDEX_DIR_NAME, SEMANTIC_INDEX_FILE);
}

/**
 * Load the semantic index from disk.
 * Validates embedding dimensions to prevent mismatched vectors.
 */
function loadIndex(cwd: string, expectedDimensions?: number): CodeEmbedding[] {
	const indexPath = getIndexPath(cwd);

	if (!existsSync(indexPath)) {
		return [];
	}

	const content = readFileSync(indexPath, "utf-8");
	const lines = content.trim().split("\n");

	const embeddings: CodeEmbedding[] = [];
	let skippedCount = 0;

	for (const line of lines) {
		if (!line.trim()) continue;

		try {
			const embedding = JSON.parse(line) as CodeEmbedding;

			// Validate dimensions if expected dimensions are provided
			if (expectedDimensions !== undefined && embedding.embedding.length !== expectedDimensions) {
				console.warn(
					`[semantic-search] Skipping embedding with mismatched dimensions: ` +
					`expected ${expectedDimensions}, got ${embedding.embedding.length} in ${embedding.file}`
				);
				skippedCount++;
				continue;
			}

			embeddings.push(embedding);
		} catch {
			// Skip malformed lines
			console.warn(`[semantic-search] Skipping malformed index entry`);
		}
	}

	if (skippedCount > 0) {
		console.warn(`[semantic-search] Skipped ${skippedCount} embeddings with dimension mismatch`);
	}

	return embeddings;
}

// ============================================================================
// Search Functions
// ============================================================================

/**
 * Find the k nearest neighbors to a query vector.
 */
function findNearestNeighbors(
	queryVector: number[],
	items: CodeEmbedding[],
	k: number,
	threshold: number
): Array<{ item: CodeEmbedding; similarity: number }> {
	const similarities = items.map((item) => ({
		item,
		similarity: cosineSimilarity(queryVector, item.embedding),
	}));

	// Filter by threshold and sort by similarity descending
	const filtered = similarities.filter((s) => s.similarity >= threshold);
	filtered.sort((a, b) => b.similarity - a.similarity);

	return filtered.slice(0, k);
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * 意味的検索を実行する
 * @summary 意味的検索実行
 * @param input 検索入力データ
 * @param cwd 作業ディレクトリ
 * @returns 検索出力データ
 */
export async function semanticSearch(
	input: SemanticSearchInput,
	cwd: string
): Promise<SemanticSearchOutput> {
	const {
		query,
		topK = DEFAULT_TOP_K,
		threshold = DEFAULT_THRESHOLD,
		language,
		kind,
	} = input;

	try {
		// Validate input
		if (!query || query.trim().length === 0) {
			return {
				total: 0,
				truncated: false,
				results: [],
				error: "Query is required",
			};
		}

		// Load index
		const index = loadIndex(cwd);

		if (index.length === 0) {
			return {
				total: 0,
				truncated: false,
				results: [],
				error: "No semantic index found. Run semantic_index first.",
			};
		}

		// Import embeddings module
		const { generateEmbedding } = await import("../../../lib/storage/embeddings/index.js");

		// Generate query embedding
		const queryEmbedding = await generateEmbedding(query);

		if (!queryEmbedding) {
			return {
				total: 0,
				truncated: false,
				results: [],
				error: "Failed to generate embedding for query. Check embedding provider availability.",
			};
		}

		// Filter index by language and kind if specified
		let filteredIndex = index;
		if (language) {
			filteredIndex = filteredIndex.filter(
				(e) => e.metadata.language.toLowerCase() === language.toLowerCase()
			);
		}
		if (kind && kind.length > 0) {
			filteredIndex = filteredIndex.filter(
				(e) => e.metadata.kind && kind.includes(e.metadata.kind)
			);
		}

		// Find nearest neighbors
		const nearest = findNearestNeighbors(queryEmbedding, filteredIndex, topK, threshold);

		// Format results
		const results: SemanticSearchResult[] = nearest.map(({ item, similarity }) => ({
			file: item.file,
			line: item.line,
			code: item.code,
			similarity,
			metadata: item.metadata,
		}));

		return {
			total: nearest.length,
			truncated: nearest.length === topK && filteredIndex.length > topK,
			results,
		};
	} catch (error: unknown) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		console.error(`[semantic-search] Error:`, errorMessage);
		return {
			total: 0,
			truncated: false,
			results: [],
			error: errorMessage,
		};
	}
}

/**
 * 検索結果を整形する
 * @summary 検索結果整形
 * @param result 検索結果オブジェクト
 * @returns 整形された文字列
 */
export function formatSemanticSearch(result: SemanticSearchOutput): string {
	if (result.error) {
		return `Error: ${result.error}`;
	}

	if (result.results.length === 0) {
		return "No results found. Try lowering the threshold or using different query terms.";
	}

	const lines: string[] = [];
	lines.push(`Found ${result.total} results${result.truncated ? " (truncated)" : ""}`);
	lines.push("");

	for (const item of result.results) {
		const similarity = (item.similarity * 100).toFixed(1);
		lines.push(`[${similarity}%] ${item.file}:${item.line}`);

		// Show first few lines of code
		const codeLines = item.code.split("\n").slice(0, 5);
		for (const codeLine of codeLines) {
			lines.push(`  ${codeLine}`);
		}

		if (item.code.split("\n").length > 5) {
			lines.push("  ...");
		}

		lines.push("");
	}

	return lines.join("\n");
}
