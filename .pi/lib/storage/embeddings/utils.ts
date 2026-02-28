/**
 * @abdd.meta
 * path: .pi/lib/embeddings/utils.ts
 * role: ベクトル演算ユーティリティ
 * why: 埋め込みベクトルの類似度計算、距離算出、および線形代数演算を行うため
 * related: .pi/lib/embeddings/types.js
 * public_api: cosineSimilarity, euclideanDistance, normalizeVector, addVectors, subtractVectors, scaleVector, meanVector
 * invariants: すべての関数は入力ベクトルの次元数が一致することを前提とする（結果として次元数は変わらない）
 * side_effects: なし（純粋関数）
 * failure_modes: 次元数不一致時に0またはInfinityを返す関数、またはErrorを投げる関数が存在する
 * @abdd.explain
 * overview: 埋め込みベクトル処理に必要な数学的演算（距離、正規化、四則演算）を提供するモジュール
 * what_it_does:
 *   - 2つのベクトル間のコサイン類似度またはユークリッド距離を計算する
 *   - ベクトルのL2正規化を行う
 *   - ベクトル同士の加算・減算、およびスカラー倍を行う
 *   - ベクトル集合から平均ベクトルを算出する
 * why_it_exists:
 *   - ベクトル検索や類似度計算のロジックを共通化し再利用可能にするため
 * scope:
 *   in: 数値配列（ベクトル）、スカラー値
 * out: 数値、数値配列、またはnull
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
 * コサイン類似度を計算
 * @summary コサイン類似度計算
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
 * ユークリッド距離を算出
 * @summary ユークリッド距離算出
 * @param a 比較するベクトル
 * @param b 比較するベクトル
 * @returns 二つのベクトル間の距離
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
 * ベクトルを正規化
 * @summary ベクトルを正規化
 * @param vector 正規化するベクトル
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
 * ベクトル同士の加算
 * @summary ベクトル同士の加算
 * @param a 加算されるベクトル
 * @param b 足し算するベクトル
 * @returns 各要素が和のベクトル
 */
export function addVectors(a: number[], b: number[]): number[] {
  if (a.length !== b.length) {
    throw new Error("Vector dimensions must match");
  }
  return a.map((v, i) => v + b[i]);
}

/**
 * ベクトル同士の減算
 * @summary ベクトル同士の減算
 * @param a 減算されるベクトル
 * @param b 引き算するベクトル
 * @returns 各要素が差分のベクトル
 */
export function subtractVectors(a: number[], b: number[]): number[] {
  if (a.length !== b.length) {
    throw new Error("Vector dimensions must match");
  }
  return a.map((v, i) => v - b[i]);
}

/**
 * ベクトルをスカラー倍
 * @summary ベクトルをスカラー倍
 * @param vector 対象のベクトル
 * @param scalar 乗算するスカラー値
 * @returns スカラー倍されたベクトル
 */
export function scaleVector(vector: number[], scalar: number): number[] {
  return vector.map((v) => v * scalar);
}

/**
 * ベクトル集合の平均ベクトルを計算
 * @summary 平均ベクトル計算
 * @param vectors ベクトルの配列
 * @returns 平均ベクトル。入力が空ならnull
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
 * クエリベクトルに類似した上位k件を検索
 * @summary 近傍k件検索
 * @param queryVector クエリベクトル
 * @param items 検索対象のアイテム配列
 * @param k 取得件数
 * @returns 類似度が高いk件のアイテムとスコア
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
 * @summary 類似度閾値検索
 * @param queryVector クエリベクトル
 * @param items 検索対象のアイテム配列
 * @param threshold 類似度の閾値
 * @returns 閾値を超えたアイテムとスコアの配列
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
 * 埋め込みベクトルか検証
 * @summary 埋め込みベクトル検証
 * @param value 検証対象の値
 * @returns 有効な数値配列ならtrue
 */
export function isValidEmbedding(value: unknown): value is number[] {
  if (!Array.isArray(value)) return false;
  if (value.length === 0) return false;
  return value.every((v) => typeof v === "number" && !isNaN(v));
}

/**
 * ゼロベクトルを生成
 * @summary ゼロベクトル生成
 * @param dimensions ベクトルの次元数
 * @returns すべての要素が0のベクトル
 */
export function zeroVector(dimensions: number): number[] {
  return new Array(dimensions).fill(0);
}

/**
 * ベクトルのノルムを計算
 * @summary ノルム計算
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
 * 内積を計算
 * @summary 内積を計算
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
