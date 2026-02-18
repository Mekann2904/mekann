/**
 * @abdd.meta
 * path: .pi/lib/storage.ts
 * role: ストレージ関連モジュールの統合エクスポートポイント（バレルファイル）
 * why: storage-base、run-index、pattern-extraction、semantic-memory、embeddingsへの統一アクセスを提供し、個別インポートの手間を削減するため
 * related: storage-base.ts, run-index.ts, pattern-extraction.ts, semantic-memory.ts
 * public_api: HasId, BaseRunRecord, BaseStorage, createStorageLoader, createStorageSaver, IndexedRun, RunIndex, searchRuns, findSimilarRuns, ExtractedPattern, PatternStorage, extractPatternFromRun, RunEmbedding, SemanticMemoryStorage, semanticSearch, EmbeddingProvider, generateEmbedding, cosineSimilarity
 * invariants: 再エクスポートのみを行い、独自の実装を持たない、Layer 2のモジュールのみを集約する
 * side_effects: なし（純粋な再エクスポート）
 * failure_modes: 元モジュールが存在しない場合にインポートエラーが発生する、循環依存による読み込み失敗
 * @abdd.explain
 * overview: ストレージ、メモリ、エンベディング関連の5つのサブモジュールを集約し、単一のエントリポイントから一括インポート可能にするバレルファイル
 * what_it_does:
 *   - storage-baseからストレージ基本型とCRUDユーティリティを再エクスポート
 *   - run-indexからALMAベースの実行履歴インデックス機能を再エクスポート
 *   - pattern-extractionから実行履歴からのパターン抽出機能を再エクスポート
 *   - semantic-memoryからOpenAI Embeddingsベースの意味検索機能を再エクスポート
 *   - embeddingsから統一エンベディングプロバイダインターフェースを再エクスポート
 * why_it_exists:
 *   - 利用者が複数のストレージ関連モジュールを個別にインポートする負担を軽減するため
 *   - lib全体をインポートせずにストレージ機能のみを選択的に利用可能にするため
 *   - ストレージ関連APIの公開インターフェースを一箇所で管理するため
 * scope:
 *   in: storage-base.ts, run-index.ts, pattern-extraction.ts, semantic-memory.ts, embeddings関連モジュール
 *   out: これら以外のlib配下モジュール、Layer 1の低レベルユーティリティ
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
