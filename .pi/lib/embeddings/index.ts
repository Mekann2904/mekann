/**
 * Embeddings Module - Public API.
 * Provides a unified interface for embedding generation.
 */

// ============================================================================
// Types
// ============================================================================

export type {
  EmbeddingProvider,
  ProviderCapabilities,
  ProviderConfig,
  EmbeddingModuleConfig,
  EmbeddingResult,
  ProviderStatus,
  VectorSearchResult,
} from "./types.js";

// ============================================================================
// Registry
// ============================================================================

export {
  EmbeddingProviderRegistry,
  embeddingRegistry,
  getEmbeddingProvider,
  generateEmbedding,
  generateEmbeddingsBatch,
} from "./registry.js";

// ============================================================================
// Utilities
// ============================================================================

export {
  cosineSimilarity,
  euclideanDistance,
  normalizeVector,
  addVectors,
  subtractVectors,
  scaleVector,
  meanVector,
  findNearestNeighbors,
  findBySimilarityThreshold,
  isValidEmbedding,
  zeroVector,
  vectorNorm,
  dotProduct,
} from "./utils.js";

// ============================================================================
// Providers
// ============================================================================

export {
  OpenAIEmbeddingProvider,
  openAIEmbeddingProvider,
  getOpenAIKey,
} from "./providers/openai.js";

// ============================================================================
// Initialization
// ============================================================================

import { embeddingRegistry } from "./registry.js";
import { openAIEmbeddingProvider } from "./providers/openai.js";

 /**
  * デフォルトプロバイダで埋め込みモジュールを初期化
  * @returns {Promise<void>}
  */
export async function initializeEmbeddingModule(): Promise<void> {
  embeddingRegistry.register(openAIEmbeddingProvider);
}

 /**
  * 非同期コンテキスト用の同期初期化
  * @returns 戻り値なし
  */
export function initializeEmbeddingModuleSync(): void {
  embeddingRegistry.register(openAIEmbeddingProvider);
}

// Auto-initialize on import (sync version for backward compatibility)
initializeEmbeddingModuleSync();
