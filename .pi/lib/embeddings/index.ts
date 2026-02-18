/**
 * @abdd.meta
 * path: .pi/lib/embeddings/index.ts
 * role: embeddingsモジュールの公開APIエントリーポイント
 * why: 型定義、レジストリ、ユーティリティ、プロバイダを統一的にエクスポートし、外部からの利用を簡素化するため
 * related: types.js, registry.js, utils.js, providers/openai.js
 * public_api: EmbeddingProvider, EmbeddingResult, embeddingRegistry, generateEmbedding, generateEmbeddingsBatch, cosineSimilarity, OpenAIEmbeddingProvider, initializeEmbeddingModule, initializeEmbeddingModuleSync
 * invariants: インポート時にopenAIEmbeddingProviderが自動登録される
 * side_effects: モジュール読み込み時にregistryへプロバイダ登録を実行（initializeEmbeddingModuleSyncが自動実行）
 * failure_modes: OpenAIプロバイダの登録失敗時はregistry内でハンドリングされる
 * @abdd.explain
 * overview: 埋め込みベクトル生成機能のファサードモジュール。型、レジストリ操作、ベクトル演算ユーティリティ、OpenAIプロバイダを再エクスポートする。
 * what_it_does:
 *   - types.jsから埋め込み関連型定義をエクスポート
 *   - registry.jsからプロバイダ登録・埋め込み生成関数をエクスポート
 *   - utils.jsからベクトル演算・類似度計算関数をエクスポート
 *   - providers/openai.jsからOpenAI埋め込みプロバイダをエクスポート
 *   - 初期化関数（同期/非同期）を提供し、インポート時に自動初期化を実行
 * why_it_exists:
 *   - 外部モジュールが埋め込み機能を単一のインポートパスで利用可能にする
 *   - 実装詳細を隠蔽し、安定した公開APIを提供する
 * scope:
 *   in: なし（再エクスポート専用）
 *   out: 埋め込み生成に必要なすべての型、関数、プロバイダ
 */

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
