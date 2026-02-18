/**
 * @abdd.meta
 * path: .pi/extensions/search/tools/semantic_search.ts
 * role: 意味的コード検索ツール。ベクトル類似度を用いてクエリに一致するコードを検索する
 * why: キーワード検索では発見困難な、意図や機能に基づくコード検索を実現するため
 * related: ../types.js, ../utils/constants.js, ../../../lib/embeddings/utils.js, ./semantic_index.ts
 * public_api: semanticSearch(input, cwd): Promise<SemanticSearchOutput>
 * invariants:
 *   - クエリが空または空白のみの場合、total=0, results=[], error="Query is required"を返す
 *   - インデックスが存在しない場合、total=0, results=[]を返す
 *   - 類似度はthreshold以上の結果のみ返す
 *   - 結果は類似度降順でソート済み
 * side_effects:
 *   - ファイルシステムからsemantic-index.jsonlを読み込む（読み取り専用）
 * failure_modes:
 *   - インデックスファイルが存在しない場合に空の結果を返す
 *   - インデックスファイルのJSONパースに失敗した場合に例外をスローする可能性がある
 * @abdd.explain
 * overview: 事前構築済みのセマンティックインデックスを使用し、ベクトル類似度によるコード検索を実行する
 * what_it_does:
 *   - ディスクからJSONL形式のセマンティックインデックスを読み込む
 *   - クエリベクトルとインデックス内エンベディング間のコサイン類似度を計算する
 *   - 類似度threshold以上の結果を類似度降順でtopK件返す
 *   - language/kindによるフィルタリングパラメータを受け取る（入力定義に基づく）
 * why_it_exists:
 *   - 関数名や変数名を正確に知らなくても、機能や意図に基づいてコードを発見できるようにする
 *   - semantic_index.tsで構築されたインデックスを活用して高速な意味検索を提供する
 * scope:
 *   in: クエリ文字列、topK（デフォルト10）、threshold（デフォルト0.5）、language、kind、作業ディレクトリパス
 *   out: 検索結果配列（各結果はコードスニペット、ファイルパス、類似度スコアを含む）、総件数、truncatedフラグ、エラーメッセージ
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
  * コードの意味検索を行う
  * @param input 検索クエリや上位K件などの入力パラメータ
  * @param cwd 作業ディレクトリのパス
  * @returns 検索結果を含む出力オブジェクト
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
  * セマンティック検索の結果を整形します。
  * @param result セマンティック検索の出力結果
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
