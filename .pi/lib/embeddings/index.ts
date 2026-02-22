/**
 * @abdd.meta
 * path: .pi/lib/embeddings/index.ts
 * role: エンベディング機能のパブリックエントリーポイント
 * why: 型定義、プロバイダー登録、ユーティリティ関数、初期化処理を単一のインターフェースで公開するため
 * related: .pi/lib/embeddings/types.ts, .pi/lib/embeddings/registry.ts, .pi/lib/embeddings/utils.ts, .pi/lib/embeddings/providers/openai.ts
 * public_api: 型エイリアス一式, EmbeddingProviderRegistry, generateEmbedding, cosineSimilarity, OpenAIEmbeddingProvider, initializeEmbeddingModule, initializeEmbeddingModuleSync
 * invariants: インポート時（同期的）にOpenAIプロバイダがレジストリに登録される
 * side_effects: モジュールロード時の自動初期化によりregistryが変更される
 * failure_modes: プロバイダ登録済みの状態で再初期化を呼ぶと重複登録される可能性がある
 * @abdd.explain
 * overview: エンベディング生成とベクトル操作に関するモジュールの統一フロントエンド
 * what_it_does:
 *   - 型定義、レジストリ、計算ユーティリティ、プロバイダー実装を再エクスポートする
 *   - デフォルトのOpenAIプロバイダーを使用してモジュールを初期化する
 * why_it_exists:
 *   - 利用者に対してモジュール構成の詳細を隠蔽し、シンプルなインポートパスを提供する
 *   - モジュール利用開始に必要な初期化処理（プロバイダ登録）を標準化する
 * scope:
 *   in: 内部モジュールからのエクスポート、OpenAIプロバイダーの定義
 *   out: エンベディング生成関数、ベクトル計算ユーティリティ、初期化関数
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
