/**
 * @abdd.meta
 * path: .pi/lib/storage.ts
 * role: ストレージ・メモリ・埋め込み機能のエクスポート集約モジュール
 * why: lib配下の個別モジュールをインポートせず、単一のエントリポイントから関連機能を利用するため
 * related: .pi/lib/storage-base.ts, .pi/lib/run-index.ts, .pi/lib/pattern-extraction.ts
 * public_api: ストレージ基底ユーティリティ、実行インデックス、パターン抽出、セマンティックメモリ、埋め込みプロバイダ関連の型・関数
 * invariants: エクスポートされるシンボルは各ソースファイルから直接再エクスポートされる
 * side_effects: なし（純粋なエクスポート集約）
 * failure_modes: 依存モジュールで型エラーまたは循環参照が発生した場合にコンパイルが失敗する
 * @abdd.explain
 * overview: 実行履歴の管理、検索、パターン抽出、およびベクトル埋め込みに関連するモジュールを一箇所に集約するバレルファイル。
 * what_it_does:
 *   - ストレージ基底型・関数の再エクスポート
 *   - 実行インデックス作成・検索機能の再エクスポート
 *   - パターン抽出・ストレージ機能の再エクスポート
 *   - セマンティックメモリ（埋め込み）機能の再エクスポート
 *   - 埋め込みプロバイダインターフェースとレジストリの再エクスポート
 * why_it_exists:
 *   - 利用者が個別のモジュールパスを覚える負担を軽減するため
 *   - lib配下すべてをインポートせず、必要なストレージ機能群のみを選択的にロードするため
 * scope:
 *   in: なし（内部実装を持たない）
 *   out: ストレージ、インデックス、パターン、セマンティックメモリ、埋め込みプロバイダに関連するすべての公開API
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
