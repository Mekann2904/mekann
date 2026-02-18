/**
 * @abdd.meta
 * path: .pi/extensions/search/tools/semantic_search.ts
 * role: ベクトル類似度に基づくコード意味検索ツール
 * why: 事前構築されたインデックスを利用し、自然語クエリやコード断片に対して意味的に近いコード箇所を特定するため
 * related: .pi/extensions/search/types.ts, .pi/extensions/search/utils/constants.ts, .pi/lib/embeddings/utils.ts
 * public_api: semanticSearch(input, cwd): Promise<SemanticSearchOutput>
 * invariants:
 *   - 入力クエリは空文字ではない
 *   - topKは正の整数である
 *   - thresholdは0以上1以下である
 *   - インデックスファイルが存在しない場合、空の配列を返す
 * side_effects: ファイルシステムからインデックスファイルを読み込む
 * failure_modes:
 *   - インデックスファイルが破損している場合、JSON.parseで例外が発生する
 *   - クエリベクトルの生成失敗（呼び出し元依存）
 * @abdd.explain
 * overview: ディスク上のセマンティックインデックスを読み込み、クエリベクトルとコード埋め込みのコサイン類似度を計算して上位k件を返すモジュール
 * what_it_does:
 *   - semantic-index.jsonlファイルの読み込みとパース
 *   - クエリ埋め込みとインデックス内の埋め込みのコサイン類似度計算
 *   - 類似度によるフィルタリングと降順ソート
 *   - 指定された件数（topK）への結果切り詰め
 * why_it_exists:
 *   - キーワード一致のみでは検出できない、意味的に関連するコードの発見を支援するため
 *   - 大規模なコードベースにおいて、特定の機能や実装パターンを素早く特定するため
 * scope:
 *   in: SemanticSearchInput(クエリ、topK、閾値、フィルタ条件)、作業ディレクトリパス
 *   out: SemanticSearchOutput(ヒット数、切り詰めフラグ、検索結果リスト、エラー情報)
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
import { cosineSimilarity } from "../../../lib/embeddings/utils.js";

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
 */
function loadIndex(cwd: string): CodeEmbedding[] {
	const indexPath = getIndexPath(cwd);

	if (!existsSync(indexPath)) {
		return [];
	}

	const content = readFileSync(indexPath, "utf-8");
	const lines = content.trim().split("\n");

	return lines
		.filter((line) => line.trim())
		.map((line) => JSON.parse(line) as CodeEmbedding);
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
		const { generateEmbedding } = await import("../../../lib/embeddings/index.js");

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
	} catch (error) {
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
