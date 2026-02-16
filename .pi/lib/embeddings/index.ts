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
  setOpenAIKey,
  removeOpenAIKey,
  saveAuthConfig,
  maskApiKey,
  isValidOpenAIKeyFormat,
} from "./providers/openai.js";

// ============================================================================
// Initialization
// ============================================================================

import { embeddingRegistry } from "./registry.js";
import { openAIEmbeddingProvider } from "./providers/openai.js";

/**
 * Initialize the embedding module with default providers.
 */
export function initializeEmbeddingModule(): void {
  // Register default providers
  embeddingRegistry.register(openAIEmbeddingProvider);
}

// Auto-initialize on import
initializeEmbeddingModule();
