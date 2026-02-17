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
 * Vector embedding for a run.
 */
export interface RunEmbedding {
  runId: string;
  embedding: number[];
  text: string; // The text that was embedded
  timestamp: string;
}

/**
 * Semantic memory storage.
 */
export interface SemanticMemoryStorage {
  version: number;
  lastUpdated: string;
  embeddings: RunEmbedding[];
  model: string;
  dimensions: number;
}

/**
 * Semantic search result.
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
 * Generate embedding for text using the configured provider.
 * @deprecated Use generateEmbedding from embeddings module directly
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  return embeddingsGenerateEmbedding(text);
}

/**
 * Generate embeddings for multiple texts in batch.
 * @deprecated Use generateEmbeddingsBatch from embeddings module directly
 */
export async function generateEmbeddingsBatch(
  texts: string[]
): Promise<(number[] | null)[]> {
  return embeddingsGenerateEmbeddingsBatch(texts);
}

/**
 * Check if semantic memory is available (any provider configured).
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
 * Get the path to the semantic memory storage file.
 */
export function getSemanticMemoryPath(cwd: string): string {
  return join(cwd, ".pi", "memory", "semantic-memory.json");
}

/**
 * Load semantic memory storage from disk.
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
 * Save semantic memory storage to disk.
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
 * Build semantic memory index from run index.
 * Generates embeddings for all runs.
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
 * Add a single run to semantic memory.
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
 * Search for similar runs using semantic similarity.
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
 * Find runs similar to a given run ID.
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
 * Get semantic memory statistics.
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
 * Clear semantic memory index.
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
