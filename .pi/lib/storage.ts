/**
 * Storage-related utilities and types.
 *
 * Aggregates all storage, memory, and embedding-related exports
 * for convenient importing without pulling in all of lib.
 *
 * Usage:
 *   import { ... } from "./lib/storage.js";
 */

// Storage base utilities (Layer 2)
export {
  type HasId,
  type BaseRunRecord,
  type BaseStoragePaths,
  type BaseStorage,
  createPathsFactory,
  createEnsurePaths,
  pruneRunArtifacts,
  mergeEntitiesById,
  mergeRunsById,
  resolveCurrentId,
  resolveDefaultsVersion,
  createStorageLoader,
  createStorageSaver,
  toId,
  mergeSubagentStorageWithDisk,
  mergeTeamStorageWithDisk,
} from "./storage-base.js";

// Run Index utilities (Layer 2)
// ALMA-inspired memory indexing for run history
export {
  type IndexedRun,
  type TaskType,
  type RunIndex,
  type SearchOptions,
  type SearchResult,
  RUN_INDEX_VERSION,
  extractKeywords,
  classifyTaskType,
  extractFiles,
  indexSubagentRun,
  indexTeamRun,
  buildRunIndex,
  getRunIndexPath,
  loadRunIndex,
  saveRunIndex,
  getOrBuildRunIndex,
  searchRuns,
  findSimilarRuns,
  getRunsByType,
  getSuccessfulPatterns,
} from "./run-index.js";

// Pattern Extraction utilities (Layer 2)
// Extract reusable patterns from run history
export {
  type ExtractedPattern,
  type PatternExample,
  type PatternStorage,
  type RunData,
  PATTERN_STORAGE_VERSION,
  extractPatternFromRun,
  getPatternStoragePath,
  loadPatternStorage,
  savePatternStorage,
  addRunToPatterns,
  extractAllPatterns,
  getPatternsForTaskType,
  getTopSuccessPatterns,
  getFailurePatternsToAvoid,
  findRelevantPatterns,
} from "./pattern-extraction.js";

// Semantic Memory utilities (Layer 2)
// OpenAI Embeddings-based semantic search for run history
export {
  type RunEmbedding,
  type SemanticMemoryStorage,
  type SemanticSearchResult,
  SEMANTIC_MEMORY_VERSION,
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
  getSemanticMemoryPath,
  loadSemanticMemory,
  saveSemanticMemory,
  buildSemanticMemoryIndex,
  addRunToSemanticMemory,
  semanticSearch,
  findSimilarRunsById,
  isSemanticMemoryAvailable,
  getSemanticMemoryStats,
  clearSemanticMemory,
} from "./semantic-memory.js";

// Embeddings Module (Layer 2)
// Unified embedding provider interface
export {
  // Types
  type EmbeddingProvider,
  type ProviderCapabilities,
  type ProviderConfig,
  type EmbeddingModuleConfig,
  type EmbeddingResult,
  type ProviderStatus,
  type VectorSearchResult,
  // Registry
  EmbeddingProviderRegistry,
  embeddingRegistry,
  getEmbeddingProvider,
  generateEmbedding,
  generateEmbeddingsBatch,
  // Utilities
  cosineSimilarity,
  euclideanDistance,
  normalizeVector,
  findNearestNeighbors,
  isValidEmbedding,
  // Providers
  OpenAIEmbeddingProvider,
  openAIEmbeddingProvider,
  getOpenAIKey,
  // Initialization
  initializeEmbeddingModule,
} from "./embeddings/index.js";
