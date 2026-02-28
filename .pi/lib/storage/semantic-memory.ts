/**
 * @abdd.meta
 * path: .pi/lib/semantic-memory.ts
 * role: 実行履歴に対するセマンティック検索機能を提供するモジュール
 * why: ベクトル埋め込みを用いて「類似タスクの検索」を実現するため
 * related: .pi/lib/embeddings/index.ts, .pi/lib/run-index.ts, .pi/lib/storage-lock.ts
 * public_api: RunEmbedding, SemanticMemoryStorage, SemanticSearchResult, generateEmbedding, findNearestNeighbors
 * invariants: ベクトルの次元数は1536固定
 * side_effects: ディスク上のセマンティックメモリストレージファイルへの書き込み
 * failure_modes: 埋め込み生成プロバイダの未構成、ディスクIOエラー、無効なベクトル形式
 * @abdd.explain
 * overview: 実行履歴のインデックスとベクトル埋め込みを組み合わせ、意味的な類似性に基づいた検索を行う
 * what_it_does:
 *   - テキストから埋め込みベクトルを生成またはバッチ生成する
 *   - クエリベクトルに対してコサイン類似度を用いた最近傍探索を行う
 *   - 実行履歴と埋め込みデータを関連付けて検索結果を返す
 *   - 埋め込みデータの永続化とバージョン管理を行う
 * why_it_exists:
 *   - キーワード検索では抽出できない、意図や文脈が似通った過去のタスクを特定するため
 *   - 過去の実行結果を再利用して効率化を図るため
 * scope:
 *   in: テキスト、実行インデックス、埋め込みプロバイダ設定
 *   out: 埋め込みベクトル、類似度スコアを含む検索結果
 */

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
import { ensureDir } from "../core/fs-utils.js";
import { type IndexedRun, type RunIndex, getOrBuildRunIndex } from "./run-index.js";
import { atomicWriteTextFile } from "./storage-lock.js";

// ============================================================================
// Types
// ============================================================================

/**
 * 実行単位の埋め込みデータ
 * @summary 実行埋め込みデータ
 */
export interface RunEmbedding {
  runId: string;
  embedding: number[];
  text: string; // The text that was embedded
  timestamp: string;
}

/**
 * セマンティックメモリのストレージ構造
 * @summary セマンティックメモリ構造
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
 * @summary セマンティック検索結果
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
 * テキストの埋め込みベクトルを生成
 * @summary 埋め込みベクトル生成
 * @param text 埋め込み対象のテキスト
 * @returns 生成された埋め込みベクトル、失敗時はnull
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  return embeddingsGenerateEmbedding(text);
}

/**
 * @summary ベクトル生成(一括)
 * @param texts ベクトル化するテキスト配列
 * @returns 生成された埋め込みベクトルの配列
 */
export async function generateEmbeddingsBatch(
  texts: string[]
): Promise<(number[] | null)[]> {
  return embeddingsGenerateEmbeddingsBatch(texts);
}

/**
 * @summary 利用可否判定
 * @returns セマンティックメモリが利用可能かどうか
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
 * @summary 類似ベクトル検索
 * @param queryVector クエリベクトル
 * @param embeddings 検索対象の埋め込みベクトル配列
 * @param k 取得する近傍数
 * @returns 類似度と埋め込みを含む配列
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
 * @summary パスを取得
 * @param cwd カレントワーキングディレクトリ
 * @returns メモリファイルの絶対パス
 */
export function getSemanticMemoryPath(cwd: string): string {
  return join(cwd, ".pi", "memory", "semantic-memory.json");
}

/**
 * @summary メモリをロード
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
 * セマンティックメモリを保存
 * @summary メモリを保存
 * @param cwd カレントワーキングディレクトリ
 * @param storage 保存対象のストレージデータ
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
 * セマンティックメモリのインデックスを構築
 * @summary インデックス構築
 * @param cwd カレントワーキングディレクトリ
 * @param batchSize バッチ処理サイズ
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
 * 実行記録をセマンティックメモリに追加
 * @summary 実行記録を追加
 * @param cwd カレントワーキングディレクトリ
 * @param run インデックス対象の実行記録
 * @returns なし
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
 * セマンティック検索を実行
 * @summary セマンティック検索
 * @param cwd カレントワーキングディレクトリ
 * @param query 検索クエリ
 * @param options 検索オプション
 * @param options.limit 取得件数の上限
 * @param options.status 実行ステータスのフィルタ
 * @param options.minSimilarity 類似度の閾値
 * @returns 検索結果の配列
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
 * 類似実行をIDで検索
 * @summary 類似実行検索
 * @param cwd カレントワーキングディレクトリ
 * @param runId 実行ID
 * @param limit 取得件数
 * @returns 類似した実行結果の配列
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
 * 意味メモリ統計取得
 * @summary 意味メモリ統計を取得
 * @param cwd - カレントワーキングディレクトリ
 * @returns 統計情報オブジェクト
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
 * 意味メモリクリア
 * @summary 意味メモリをクリア
 * @param cwd - カレントワーキングディレクトリ
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
