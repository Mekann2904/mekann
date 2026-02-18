/**
 * Semantic Memory Module.
 * Provides semantic search over run history using embedding providers.
 * Enables "find similar tasks" functionality with vector similarity.
 *
 * This module uses the embeddings/ submodule for actual embedding generation.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  generateEmbedding as embeddingsGenerateEmbedding,
  generateEmbeddingsBatch as embeddingsGenerateEmbeddingsBatch,
  cosineSimilarity,
  getEmbeddingProvider,
  type EmbeddingProvider,
} from "./embeddings/index.js";
import { ensureDir } from "./fs-utils.js";
import { type IndexedRun, type RunIndex, getOrBuildRunIndex } from "./run-index.js";
import { atomicWriteTextFile } from "./storage-lock.js";

// ============================================================================
// Types
// ============================================================================

 /**
  * 実行のベクトル埋め込み
  * @param runId 実行ID
  * @param embedding ベクトル埋め込み
  * @param text 埋め込み対象のテキスト
  * @param timestamp タイムスタンプ
  */
export interface RunEmbedding {
  runId: string;
  embedding: number[];
  text: string; // The text that was embedded
  timestamp: string;
}

 /**
  * セマンティックメモリストレージ。
  * @param version バージョン。
  * @param lastUpdated 最終更新日時。
  * @param embeddings 実行の埋め込みリスト。
  * @param model モデル名。
  * @param dimensions ベクトルの次元数。
  */
export interface SemanticMemoryStorage {
  version: number;
  lastUpdated: string;
  embeddings: RunEmbedding[];
  model: string;
  dimensions: number;
}

 /**
  * セマンティック検索の結果
  * @param run 検索対象の実行記録
  * @param similarity 類似度スコア
  * @param embedding 対応する埋め込みベクトル
  */
export interface SemanticSearchResult {
  run: IndexedRun;
  similarity: number;
  embedding: RunEmbedding;
}

// ============================================================================
// Constants
// ============================================================================

export const SEMANTIC_MEMORY_VERSION = 1;
export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;

// ============================================================================
// Backward Compatibility Wrappers
// ============================================================================

 /**
  * テキストの埋め込みベクトルを生成する（非推奨）
  * @param text 入力テキスト
  * @returns 埋め込みベクトル、または失敗時はnull
  */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  return embeddingsGenerateEmbedding(text);
}

 /**
  * 複数テキストのベクトルを一括生成
  * @param texts テキスト配列
  * @returns ベクトル配列またはnullの配列
  */
export async function generateEmbeddingsBatch(
  texts: string[]
): Promise<(number[] | null)[]> {
  return embeddingsGenerateEmbeddingsBatch(texts);
}

 /**
  * セマンティックメモリが利用可能か確認
  * @returns 利用可能な場合はtrue
  */
export function isSemanticMemoryAvailable(): boolean {
  // This is now async in the new module, but we keep sync for backward compat
  // We check if any provider might be available
  return true; // Will be properly checked when actually generating
}

// ============================================================================
// Vector Operations (re-exported from embeddings/utils.ts)
// ============================================================================

/**
 * Find the k nearest neighbors to a query vector.
 */
export function findNearestNeighbors(
  queryVector: number[],
  embeddings: RunEmbedding[],
  k: number = 5
): Array<{ embedding: RunEmbedding; similarity: number }> {
  const similarities = embeddings.map((emb) => ({
    embedding: emb,
    similarity: cosineSimilarity(queryVector, emb.embedding),
  }));

  // Sort by similarity descending
  similarities.sort((a, b) => b.similarity - a.similarity);

  return similarities.slice(0, k);
}

// ============================================================================
// Semantic Memory Storage
// ============================================================================

 /**
  * セマンティックメモリのストレージファイルパスを取得
  * @param cwd 作業ディレクトリのパス
  * @returns セマンティックメモリファイルのパス
  */
export function getSemanticMemoryPath(cwd: string): string {
  return join(cwd, ".pi", "memory", "semantic-memory.json");
}

 /**
  * ディスクからセマンティックメモリを読み込む
  * @param cwd カレントワーキングディレクトリ
  * @returns セマンティックメモリストレージ
  */
export function loadSemanticMemory(cwd: string): SemanticMemoryStorage {
  const path = getSemanticMemoryPath(cwd);
  if (!existsSync(path)) {
    return {
      version: SEMANTIC_MEMORY_VERSION,
      lastUpdated: new Date().toISOString(),
      embeddings: [],
      model: EMBEDDING_MODEL,
      dimensions: EMBEDDING_DIMENSIONS,
    };
  }

  try {
    const content = readFileSync(path, "utf-8");
    return JSON.parse(content);
  } catch {
    return {
      version: SEMANTIC_MEMORY_VERSION,
      lastUpdated: new Date().toISOString(),
      embeddings: [],
      model: EMBEDDING_MODEL,
      dimensions: EMBEDDING_DIMENSIONS,
    };
  }
}

 /**
  * セマンティックメモリをディスクに保存する
  * @param cwd カレントワーキングディレクトリ
  * @param storage 保存するセマンティックメモリストレージ
  * @returns なし
  */
export function saveSemanticMemory(cwd: string, storage: SemanticMemoryStorage): void {
  const path = getSemanticMemoryPath(cwd);
  ensureDir(join(cwd, ".pi", "memory"));
  storage.lastUpdated = new Date().toISOString();
  atomicWriteTextFile(path, JSON.stringify(storage, null, 2));
}

// ============================================================================
// Index Building
// ============================================================================

/**
 * Build text to embed from a run.
 */
function buildEmbeddingText(run: IndexedRun): string {
  const parts = [
    `Task: ${run.task}`,
    `Summary: ${run.summary}`,
    `Type: ${run.taskType}`,
    `Status: ${run.status}`,
  ];

  if (run.keywords.length > 0) {
    parts.push(`Keywords: ${run.keywords.slice(0, 10).join(", ")}`);
  }

  return parts.join("\n");
}

 /**
  * ランインデックスからセマンティックメモリを構築
  * @param cwd 作業ディレクトリのパス
  * @param batchSize 処理バッチサイズ
  * @returns 構築されたセマンティックメモリストレージ
  */
export async function buildSemanticMemoryIndex(
  cwd: string,
  batchSize: number = 20
): Promise<SemanticMemoryStorage> {
  const runIndex = getOrBuildRunIndex(cwd);
  const storage = loadSemanticMemory(cwd);

  // Get provider info
  const provider = await getEmbeddingProvider();
  const modelName = provider?.model || EMBEDDING_MODEL;
  const dimensions = provider?.capabilities.dimensions || EMBEDDING_DIMENSIONS;

  // Track which runs are already embedded
  const embeddedRunIds = new Set(storage.embeddings.map((e) => e.runId));

  // Find runs that need embedding
  const runsToEmbed = runIndex.runs.filter((r) => !embeddedRunIds.has(r.runId));

  if (runsToEmbed.length === 0) {
    return storage;
  }

  console.log(`Generating embeddings for ${runsToEmbed.length} runs...`);

  // Update model info
  storage.model = modelName;
  storage.dimensions = dimensions;

  // Process in batches
  for (let i = 0; i < runsToEmbed.length; i += batchSize) {
    const batch = runsToEmbed.slice(i, i + batchSize);
    const texts = batch.map(buildEmbeddingText);

    const embeddings = await embeddingsGenerateEmbeddingsBatch(texts);

    for (let j = 0; j < batch.length; j++) {
      const embedding = embeddings[j];
      if (embedding) {
        storage.embeddings.push({
          runId: batch[j].runId,
          embedding,
          text: texts[j],
          timestamp: new Date().toISOString(),
        });
      }
    }

    // Save after each batch
    saveSemanticMemory(cwd, storage);
  }

  return storage;
}

 /**
  * 実行履歴をセマンティックメモリに追加
  * @param cwd 作業ディレクトリのパス
  * @param run 追加する実行履歴
  * @returns Promise<void>
  */
export async function addRunToSemanticMemory(
  cwd: string,
  run: IndexedRun
): Promise<void> {
  const storage = loadSemanticMemory(cwd);

  // Check if already embedded
  if (storage.embeddings.some((e) => e.runId === run.runId)) {
    return;
  }

  const text = buildEmbeddingText(run);
  const embedding = await embeddingsGenerateEmbedding(text);

  if (embedding) {
    storage.embeddings.push({
      runId: run.runId,
      embedding,
      text,
      timestamp: new Date().toISOString(),
    });

    saveSemanticMemory(cwd, storage);
  }
}

// ============================================================================
// Semantic Search
// ============================================================================

 /**
  * 類似した実行をセマンティック検索します。
  * @param cwd 作業ディレクトリ
  * @param query 検索クエリ
  * @param options 検索オプション
  * @returns セマンティック検索結果の配列
  */
export async function semanticSearch(
  cwd: string,
  query: string,
  options: {
    limit?: number;
    status?: "completed" | "failed";
    minSimilarity?: number;
  } = {}
): Promise<SemanticSearchResult[]> {
  const { limit = 5, status, minSimilarity = 0.5 } = options;

  // Generate embedding for query
  const queryEmbedding = await embeddingsGenerateEmbedding(query);
  if (!queryEmbedding) {
    return [];
  }

  // Load semantic memory and run index
  const semanticMemory = loadSemanticMemory(cwd);
  const runIndex = getOrBuildRunIndex(cwd);

  // Find nearest neighbors
  const neighbors = findNearestNeighbors(queryEmbedding, semanticMemory.embeddings, limit * 2);

  // Build results with run data
  const results: SemanticSearchResult[] = [];
  const runMap = new Map(runIndex.runs.map((r) => [r.runId, r]));

  for (const neighbor of neighbors) {
    if (neighbor.similarity < minSimilarity) continue;

    const run = runMap.get(neighbor.embedding.runId);
    if (!run) continue;

    // Filter by status if specified
    if (status && run.status !== status) continue;

    results.push({
      run,
      similarity: neighbor.similarity,
      embedding: neighbor.embedding,
    });

    if (results.length >= limit) break;
  }

  return results;
}

 /**
  * 指定された実行IDに類似した実行を検索する。
  * @param cwd 作業ディレクトリのパス
  * @param runId 検索基準となる実行ID
  * @param limit 返す結果の最大件数（デフォルト: 5）
  * @returns 類似した実行の検索結果リスト
  */
export function findSimilarRunsById(
  cwd: string,
  runId: string,
  limit: number = 5
): SemanticSearchResult[] {
  const semanticMemory = loadSemanticMemory(cwd);
  const runIndex = getOrBuildRunIndex(cwd);

  // Find the source embedding
  const sourceEmbedding = semanticMemory.embeddings.find((e) => e.runId === runId);
  if (!sourceEmbedding) {
    return [];
  }

  // Find nearest neighbors (excluding self)
  const neighbors = findNearestNeighbors(
    sourceEmbedding.embedding,
    semanticMemory.embeddings.filter((e) => e.runId !== runId),
    limit
  );

  // Build results
  const results: SemanticSearchResult[] = [];
  const runMap = new Map(runIndex.runs.map((r) => [r.runId, r]));

  for (const neighbor of neighbors) {
    const run = runMap.get(neighbor.embedding.runId);
    if (!run) continue;

    results.push({
      run,
      similarity: neighbor.similarity,
      embedding: neighbor.embedding,
    });
  }

  return results;
}

// ============================================================================
// Utility Functions
// ============================================================================

 /**
  * セマンティックメモリの統計情報を取得する
  * @param cwd 作業ディレクトリのパス
  * @returns 総エンベディング数、最終更新日時、モデル名、利用可否を含むオブジェクト
  */
export function getSemanticMemoryStats(cwd: string): {
  totalEmbeddings: number;
  lastUpdated: string;
  model: string;
  isAvailable: boolean;
} {
  const storage = loadSemanticMemory(cwd);
  return {
    totalEmbeddings: storage.embeddings.length,
    lastUpdated: storage.lastUpdated,
    model: storage.model,
    isAvailable: storage.embeddings.length > 0,
  };
}

 /**
  * セマンティックメモリをクリアする。
  * @param cwd 作業ディレクトリのパス
  * @returns なし
  */
export function clearSemanticMemory(cwd: string): void {
  const storage: SemanticMemoryStorage = {
    version: SEMANTIC_MEMORY_VERSION,
    lastUpdated: new Date().toISOString(),
    embeddings: [],
    model: EMBEDDING_MODEL,
    dimensions: EMBEDDING_DIMENSIONS,
  };
  saveSemanticMemory(cwd, storage);
}
