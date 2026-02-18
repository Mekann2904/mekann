/**
 * @abdd.meta
 * path: .pi/lib/embeddings/utils.ts
 * role: エンベディングベクトル操作用ユーティリティ関数群
 * why: ベクトル演算（類似度計算、正規化、加減算、スカラー倍、平均）を一元管理し、埋め込みベクトルの数学的操作を再利用可能にするため
 * related: types.ts, index.ts, search.ts, embedder.ts
 * public_api: cosineSimilarity, euclideanDistance, normalizeVector, addVectors, subtractVectors, scaleVector, meanVector
 * invariants:
 *   - 全ベクトル演算関数は入力ベクトルの次元数が一致することを前提とする
 *   - cosineSimilarityとeuclideanDistanceは次元不一致時、それぞれ0とInfinityを返す
 *   - normalizeVectorはノルム0の場合、ゼロベクトルを返す
 *   - meanVectorは空配列入力時、nullを返す
 * side_effects: なし（純粋関数のみ）
 * failure_modes:
 *   - addVectors/subtractVectors: 次元不一致時にErrorをスロー
 *   - meanVector: 次元不一致時にErrorをスロー
 * @abdd.explain
 * overview: 埋め込みベクトルに対する基本演算を提供するユーティリティモジュール
 * what_it_does:
 *   - コサイン類似度とユークリッド距離の計算
 *   - ベクトルの正規化
 *   - ベクトル同士の加算・減算
 *   - ベクトルのスカラー倍
 *   - 複数ベクトルの平均を算出
 * why_it_exists:
 *   - 埋め込みベクトルを用いた類似度計算を共通化するため
 *   - ベクトル変換処理を標準化し、他モジュールから再利用可能にするため
 * scope:
 *   in: 数値配列として表現されたベクトル、ベクトルの配列
 *   out: 類似度/距離の数値、変換後のベクトル配列、null
 */

/**
 * Embeddings Module - Vector Utilities.
 * Provides vector operations for embeddings.
 */

import type { VectorSearchResult } from "./types.js";

// ============================================================================
// Vector Operations
// ============================================================================

 /**
  * 2つのベクトル間のコサイン類似度を計算
  * @param a ベクトルA
  * @param b ベクトルB
  * @returns コサイン類似度
  */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

/**
 * Calculate Euclidean distance between two vectors.
 */
export function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) return Infinity;

  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }

  return Math.sqrt(sum);
}

 /**
  * ベクトルを正規化する
  * @param vector 正規化する数値配列
  * @returns 正規化されたベクトル
  */
export function normalizeVector(vector: number[]): number[] {
  let norm = 0;
  for (const v of vector) {
    norm += v * v;
  }
  norm = Math.sqrt(norm);

  if (norm === 0) return vector.map(() => 0);

  return vector.map((v) => v / norm);
}

 /**
  * 2つのベクトルの要素ごとの和を計算する
  * @param a - 最初のベクトル
  * @param b - 2番目のベクトル
  * @returns 各要素の和からなるベクトル
  */
export function addVectors(a: number[], b: number[]): number[] {
  if (a.length !== b.length) {
    throw new Error("Vector dimensions must match");
  }
  return a.map((v, i) => v + b[i]);
}

/**
 * 2つのベクトルの要素ごとの差を計算する
 * @param a - 最初のベクトル
 * @param b - 2番目のベクトル
 * @returns 各要素の差からなる新しいベクトル
 */
export function subtractVectors(a: number[], b: number[]): number[] {
  if (a.length !== b.length) {
    throw new Error("Vector dimensions must match");
  }
  return a.map((v, i) => v - b[i]);
}

 /**
  * ベクトルをスカラー倍する
  * @param vector - ベクトル
  * @param scalar - スカラー値
  * @returns スカラー倍されたベクトル
  */
export function scaleVector(vector: number[], scalar: number): number[] {
  return vector.map((v) => v * scalar);
}

 /**
  * 複数のベクトルの平均を計算する
  * @param vectors - ベクトルの配列
  * @returns 平均ベクトル、または入力が空の場合はnull
  */
export function meanVector(vectors: number[][]): number[] | null {
  if (vectors.length === 0) return null;

  const dimensions = vectors[0].length;
  const result = new Array(dimensions).fill(0);

  for (const vector of vectors) {
    if (vector.length !== dimensions) {
      throw new Error("All vectors must have the same dimensions");
    }
    for (let i = 0; i < dimensions; i++) {
      result[i] += vector[i];
    }
  }

  return result.map((v) => v / vectors.length);
}

// ============================================================================
// Search Functions
// ============================================================================

 /**
  * クエリベクトルに類似した上位k件を検索します。
  * @param queryVector - 検索対象のベクトル
  * @param items - 検索対象のアイテムの配列
  * @param k - 取得する近傍数（デフォルト: 5）
  * @returns 類似度とアイテムの配列
  */
export function findNearestNeighbors<T extends { embedding: number[] }>(
  queryVector: number[],
  items: T[],
  k: number = 5
): VectorSearchResult<T>[] {
  const similarities = items.map((item) => ({
    item,
    similarity: cosineSimilarity(queryVector, item.embedding),
  }));

  // Sort by similarity descending
  similarities.sort((a, b) => b.similarity - a.similarity);

  return similarities.slice(0, k);
}

 /**
  * 類似度の閾値を超えるアイテムを検索
  * @param queryVector クエリベクトル
  * @param items 検索対象のアイテム配列
  * @param threshold 類似度の閾値（デフォルト: 0.5）
  * @returns 閾値を超えたアイテムと類似度の配列
  */
export function findBySimilarityThreshold<T extends { embedding: number[] }>(
  queryVector: number[],
  items: T[],
  threshold: number = 0.5
): VectorSearchResult<T>[] {
  const results: VectorSearchResult<T>[] = [];

  for (const item of items) {
    const similarity = cosineSimilarity(queryVector, item.embedding);
    if (similarity >= threshold) {
      results.push({ item, similarity });
    }
  }

  // Sort by similarity descending
  results.sort((a, b) => b.similarity - a.similarity);

  return results;
}

// ============================================================================
// Utility Functions
// ============================================================================

 /**
  * 値が有効な埋め込みベクトルか判定
  * @param value 検査対象の値
  * @returns number[]型の条件を満たす場合true
  */
export function isValidEmbedding(value: unknown): value is number[] {
  if (!Array.isArray(value)) return false;
  if (value.length === 0) return false;
  return value.every((v) => typeof v === "number" && !isNaN(v));
}

/**
 * Create a zero vector of specified dimensions.
 */
export function zeroVector(dimensions: number): number[] {
  return new Array(dimensions).fill(0);
}

/**
 * ベクトルのノルム（大きさ）を計算します。
 * @param vector 数値配列で表現されたベクトル
 * @returns ノルムの値
 */
export function vectorNorm(vector: number[]): number {
  let sum = 0;
  for (const v of vector) {
    sum += v * v;
  }
  return Math.sqrt(sum);
}

 /**
  * 2つのベクトルの内積を計算する。
  * @param a 1つ目のベクトル
  * @param b 2つ目のベクトル
  * @returns 内積
  */
export function dotProduct(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result += a[i] * b[i];
  }
  return result;
}
