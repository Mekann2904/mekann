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

export {
  LocalEmbeddingProvider,
  localEmbeddingProvider,
} from "./providers/local.js";

// ============================================================================
// Initialization
// ============================================================================

import { embeddingRegistry } from "./registry.js";
import { openAIEmbeddingProvider } from "./providers/openai.js";
import { localEmbeddingProvider } from "./providers/local.js";

/**
 * Initialize the embedding module with default providers.
 * Registers providers in fallback order: openai -> local
 */
export async function initializeEmbeddingModule(): Promise<void> {
  // Register OpenAI provider (sync registration)
  embeddingRegistry.register(openAIEmbeddingProvider);

  // Register Local provider if available (async check)
  if (await localEmbeddingProvider.isAvailable()) {
    embeddingRegistry.register(localEmbeddingProvider);
  }
}

/**
 * Synchronous initialization for non-async contexts.
 * Local provider will be registered lazily on first use.
 */
export function initializeEmbeddingModuleSync(): void {
  embeddingRegistry.register(openAIEmbeddingProvider);
  // Note: local provider needs async check, will be registered on first use if available
}

// Auto-initialize on import (sync version for backward compatibility)
initializeEmbeddingModuleSync();
