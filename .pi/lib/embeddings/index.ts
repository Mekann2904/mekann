/**
 * @abdd.meta
 * path: .pi/lib/embeddings/index.ts
 * role: 埋め込みモジュールのパブリックエントリポイント
 * why: モジュール利用者に対し、型定義、レジストリ、ユーティリティ、プロバイダ、初期化関数を統一的なインターフェースで提供するため
 * related: .pi/lib/embeddings/types.ts, .pi/lib/embeddings/registry.ts, .pi/lib/embeddings/utils.ts, .pi/lib/embeddings/providers/openai.ts
 * public_api: 型定義一式, EmbeddingProviderRegistry, generateEmbedding, cosineSimilarity, OpenAIEmbeddingProvider, LocalEmbeddingProvider, initializeEmbeddingModule
 * invariants: モジュールインポート時に同期的初期化が完了し、デフォルトプロバイダが登録済である状態を維持する
 * side_effects: モジュールインポート時、`initializeEmbeddingModuleSync()` が実行されレジストリへのプロバイダ登録が行われる
 * failure_modes: 内部モジュールの循環参照、登録処理時の例外発生時、プロバイダ初期化の失敗
 * @abdd.explain
 * overview: 埋め込み生成およびベクトル操作に関する機能を集約したバレルファイル（Barrel File）
 * what_it_does:
 *   - 型定義、レジストリ操作、数学的ユーティリティ、各種プロバイダ実装を再エクスポートする
 *   - 非同期と同期の2種類のモジュール初期化関数を公開する
 *   - インポート時にデフォルトのプロバイダ（OpenAI, Local）を自動的に登録する
 * why_it_exists:
 *   - 利用者が複数の内部ファイルパスを意識せず、単一のエントリポイントから機能を利用可能にするため
 *   - バージョン互換性を保つために、インポート時の同期初期化を実行するため
 * scope:
 *   in: 内部モジュールからのエクスポート（types, registry, utils, providers）
 *   out: パブリックAPIとしての型、クラス、関数、およびモジュール初期化処理の実行
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

export {
  LocalEmbeddingProvider,
  createLocalEmbeddingProvider,
} from "./providers/local.js";

// ============================================================================
// Initialization
// ============================================================================

import { embeddingRegistry } from "./registry.js";
import { openAIEmbeddingProvider } from "./providers/openai.js";
import { createLocalEmbeddingProvider } from "./providers/local.js";

/**
 * @summary モジュール初期化
 * 埋め込みモジュールを非同期に初期化する
 * @returns {Promise<void>}
 */
export async function initializeEmbeddingModule(): Promise<void> {
  embeddingRegistry.register(openAIEmbeddingProvider);
  embeddingRegistry.register(createLocalEmbeddingProvider());
}

/**
 * @summary モジュール初期化
 * 埋め込みモジュールを同期的に初期化する
 * @returns {void}
 */
export function initializeEmbeddingModuleSync(): void {
  embeddingRegistry.register(openAIEmbeddingProvider);
  embeddingRegistry.register(createLocalEmbeddingProvider());
}

// Auto-initialize on import (sync version for backward compatibility)
initializeEmbeddingModuleSync();
