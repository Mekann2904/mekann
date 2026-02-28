/**
 * @abdd.meta
 * path: .pi/lib/storage.ts
 * role: ストレージ関連機能の集約エントリーポイント
 * why: ストレージ、メモリ、埋め込み（Embedding）関連のモジュールを一箇所からインポート可能にするため
 * related: .pi/lib/storage-base.js, .pi/lib/run-index.js, .pi/lib/pattern-extraction.js, .pi/lib/semantic-memory.js
 * public_api: エクスポートされる全ての型、ユーティリティ関数、レジストリクラス（HasId, BaseRunRecord, buildRunIndex, generateEmbedding, EmbeddingProviderRegistry等）
 * invariants: エクスポートされるモジュールのバージョン定数（RUN_INDEX_VERSION等）と実装の整合性
 * side_effects: なし（純粋な再エクスポート）
 * failure_modes: 依存モジュールでの循環参照、型定義の不一致
 * @abdd.explain
 * overview: ストレージ基底機能、実行履歴インデックス、パターン抽出、意味的メモリ、埋め込みプロバイダを統合するバレルファイル。
 * what_it_does:
 *   - storage-base.js, run-index.js, pattern-extraction.js, semantic-memory.js, embeddingsモジュールから選択的APIを再エクスポートする
 *   - ALMAインスパイアの履歴インデキシング、OpenAI Embeddingsを用いた意味的検索、パターン抽出機能へのアクセスを提供する
 * why_it_exists:
 *   - 利用者が個々のモジュールパスを意識せず、`.pi/lib/storage` から必要な機能をインポートできるようにするため
 *   - 関連するストレージ機能のインターフェースを整理し、依存関係を明確にするため
 * scope:
 *   in: なし（外部依存なし）
 *   out: ストレージ、インデックス、パターン、エンベディングに関する型定義と操作関数
 */

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
