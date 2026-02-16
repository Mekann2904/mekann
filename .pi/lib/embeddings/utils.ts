/**
 * Embeddings Module - Vector Utilities.
 * Provides vector operations for embeddings.
 */

import type { VectorSearchResult } from "./types.js";

// ============================================================================
// Vector Operations
// ============================================================================

/**
 * Calculate cosine similarity between two vectors.
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
 * Normalize a vector to unit length.
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
 * Add two vectors element-wise.
 */
export function addVectors(a: number[], b: number[]): number[] {
  if (a.length !== b.length) {
    throw new Error("Vector dimensions must match");
  }
  return a.map((v, i) => v + b[i]);
}

/**
 * Subtract two vectors element-wise.
 */
export function subtractVectors(a: number[], b: number[]): number[] {
  if (a.length !== b.length) {
    throw new Error("Vector dimensions must match");
  }
  return a.map((v, i) => v - b[i]);
}

/**
 * Scale a vector by a scalar.
 */
export function scaleVector(vector: number[], scalar: number): number[] {
  return vector.map((v) => v * scalar);
}

/**
 * Calculate the mean of multiple vectors.
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
 * Find the k nearest neighbors to a query vector.
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
 * Find items above a similarity threshold.
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
 * Check if a value is a valid embedding vector.
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
 * Calculate the norm (magnitude) of a vector.
 */
export function vectorNorm(vector: number[]): number {
  let sum = 0;
  for (const v of vector) {
    sum += v * v;
  }
  return Math.sqrt(sum);
}

/**
 * Calculate dot product of two vectors.
 */
export function dotProduct(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result += a[i] * b[i];
  }
  return result;
}
