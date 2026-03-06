/**
 * @abdd.meta
 * path: .pi/extensions/search/tools/semantic_search.ts
 * role: 意味的コード検索エグゼキューター
 * why: ベクトル類似度に基づき、キーワードのみでは発見困難なコード断片を検索するため
 * related: ../types.js, ../../../lib/storage/embeddings/utils.js, ./semantic_index.ts
 * public_api: semanticSearch(input, cwd): Promise<SemanticSearchOutput>
 * invariants: 入力クエリは空文字ではない、検索対象インデックスはSQLiteに保存される
 * side_effects: SQLiteからのインデックス読み込み
 * failure_modes: SQLite未利用時エラー、空のクエリ入力時は空リスト返却
 * @abdd.explain
 * overview: SQLiteに保存されたベクトルインデックスを用い、コサイン類似度で上位k件を検索する
 */

import type {
  SemanticSearchInput,
  SemanticSearchOutput,
  SemanticSearchResult,
  CodeEmbedding,
} from "../types.js";
import { cosineSimilarity } from "../../../lib/storage/embeddings/utils.js";
import { readStrictJsonState } from "../../../lib/storage/sqlite-state-store-strict.js";

const DEFAULT_TOP_K = 10;
const DEFAULT_THRESHOLD = 0.5;

function getSemanticIndexStateKey(cwd: string): string {
  return `semantic_code_index:${cwd}`;
}

function loadIndex(cwd: string, expectedDimensions?: number): CodeEmbedding[] {
  const index = readStrictJsonState<CodeEmbedding[]>(getSemanticIndexStateKey(cwd)) || [];
  if (expectedDimensions === undefined) return index;

  return index.filter((embedding) => embedding.embedding.length === expectedDimensions);
}

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

  const filtered = similarities.filter((s) => s.similarity >= threshold);
  filtered.sort((a, b) => b.similarity - a.similarity);
  return filtered.slice(0, k);
}

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
    if (!query || query.trim().length === 0) {
      return {
        total: 0,
        truncated: false,
        results: [],
        error: "Query is required",
      };
    }

    const index = loadIndex(cwd);
    if (index.length === 0) {
      return {
        total: 0,
        truncated: false,
        results: [],
        error: "No semantic index found. Run semantic_index first.",
      };
    }

    const { generateEmbedding } = await import("../../../lib/storage/embeddings/index.js");
    const queryEmbedding = await generateEmbedding(query);

    if (!queryEmbedding) {
      return {
        total: 0,
        truncated: false,
        results: [],
        error: "OpenAI API key not configured. Set OPENAI_API_KEY environment variable or configure ~/.pi/agent/auth.json",
      };
    }

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

    const nearest = findNearestNeighbors(queryEmbedding, filteredIndex, topK, threshold);
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
