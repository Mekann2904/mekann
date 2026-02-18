/**
 * @abdd.meta
 * path: .pi/lib/embeddings/types.ts
 * role: エンベディングモジュールの型定義ファイル
 * why: 複数のエンベディングプロバイダーを統一的に扱うための契約を定義し、プロバイダー実装の差異を吸収する
 * related: .pi/lib/embeddings/index.ts, .pi/lib/embeddings/providers/openai.ts, .pi/lib/embeddings/providers/local.ts, .pi/lib/embeddings/config.ts
 * public_api: ProviderCapabilities, EmbeddingProvider, ProviderConfig, EmbeddingModuleConfig
 * invariants:
 *   - EmbeddingProvider.idは不変（readonly）
 *   - dimensionsは正の整数
 *   - maxTokensは正の整数
 *   - maxBatchSizeはsupportsBatch=true時のみ意味を持つ
 * side_effects: なし（純粋な型定義）
 * failure_modes: なし（型定義のため実行時エラーは発生しない）
 * @abdd.explain
 * overview: エンベディングプロバイダーのインターフェースと設定型を定義するTypeScript型定義ファイル
 * what_it_does:
 *   - プロバイダーの能力（maxTokens, dimensions, supportsBatch等）を表現するProviderCapabilities型を定義
 *   - プロバイダー共通インターフェースEmbeddingProviderを定義（generateEmbedding, generateEmbeddingsBatch等）
 *   - プロバイダー設定とモジュール全体設定の型を定義
 *   - ライフサイクルメソッド（initialize, dispose）をオプション定義
 * why_it_exists:
 *   - OpenAI、ローカル、モック等の複数プロバイダーを統一インターフェースで扱うため
 *   - フォールバック機構を実現するための共通契約を提供
 *   - プロバイダー実装者に必要なメソッド実装を強制
 * scope:
 *   in: なし（型定義のみ）
 *   out: 4つのexportされたinterface型
 */

/**
 * Embeddings Module - Type Definitions.
 * Provides common types for embedding providers.
 */

// ============================================================================
// Provider Types
// ============================================================================

/**
 * エンベディングプロバイダーの能力定義
 * @param maxTokens 最大入力トークン数
 * @param dimensions エンベディング次元数
 * @param supportsBatch バッチリクエスト対応
 * @param maxBatchSize 最大バッチサイズ
 * @param offlineCapable オフライン動作可能
 */
export interface ProviderCapabilities {
  /** 最大入力トークン数 */
  maxTokens: number;
  /** エンベディング次元数 */
  dimensions: number;
  /** バッチリクエスト対応 */
  supportsBatch: boolean;
  /** 最大バッチサイズ */
  maxBatchSize: number;
  /** オフライン動作可能 */
  offlineCapable: boolean;
}

 /**
  * エンベディングプロバイダーインターフェース
  * @param id プロバイダー識別子 (openai, local, mock)
  * @param name 表示名
  * @param model モデル名
  * @param capabilities 能力情報
  */
export interface EmbeddingProvider {
  /** プロバイダー識別子 (openai, local, mock) */
  readonly id: string;

  /** 表示名 */
  readonly name: string;

  /** モデル名 */
  readonly model: string;

  /** 能力情報 */
  readonly capabilities: ProviderCapabilities;

  /**
   * プロバイダーが利用可能か確認
   * - API Key設定済み
   * - 必要な依存関係インストール済み
   * - ネットワーク接続（オンラインプロバイダーの場合）
   */
  isAvailable(): Promise<boolean>;

  /**
   * 単一テキストのエンベディング生成
   * @param text 入力テキスト
   * @returns エンベディングベクトル、失敗時null
   */
  generateEmbedding(text: string): Promise<number[] | null>;

  /**
   * 複数テキストのバッチエンベディング生成
   * @param texts 入力テキスト配列
   * @returns 各テキストのエンベディング（失敗時null）
   */
  generateEmbeddingsBatch(texts: string[]): Promise<(number[] | null)[]>;

  /**
   * プロバイダー固有の初期化（オプション）
   * モデルロード等の重い処理用
   */
  initialize?(): Promise<void>;

  /**
   * リソース解放（オプション）
   */
  dispose?(): Promise<void>;
}

// ============================================================================
// Configuration Types
// ============================================================================

 /**
  * プロバイダー設定を定義します。
  * @param provider 使用するプロバイダーID
  * @param options プロバイダー固有のオプション
  */
export interface ProviderConfig {
  /** 使用するプロバイダーID */
  provider?: string;

  /** プロバイダー固有のオプション */
  options?: Record<string, unknown>;
}

 /**
  * エンベディングモジュール設定
  * @param version バージョン
  * @param defaultProvider デフォルトプロバイダーID
  * @param fallbackOrder フォールバック順序
  * @param providerOptions プロバイダー固有オプション
  */
export interface EmbeddingModuleConfig {
  /** バージョン */
  version: number;

  /** デフォルトプロバイダーID */
  defaultProvider: string | null;

  /** フォールバック順序 */
  fallbackOrder: string[];

  /** プロバイダー固有オプション */
  providerOptions?: Record<string, Record<string, unknown>>;
}

// ============================================================================
// Result Types
// ============================================================================

 /**
  * エンベディング生成結果
  * @param embedding エンベディングベクトル
  * @param provider 使用したプロバイダーID
  * @param model 使用したモデル名
  * @param dimensions 次元数
  * @param tokens トークン使用量（利用可能な場合）
  */
export interface EmbeddingResult {
  /** エンベディングベクトル */
  embedding: number[];

  /** 使用したプロバイダーID */
  provider: string;

  /** 使用したモデル名 */
  model: string;

  /** 次元数 */
  dimensions: number;

  /** トークン使用量（利用可能な場合） */
  tokens?: number;
}

 /**
  * プロバイダーの状態
  * @param id プロバイダーID
  * @param name 表示名
  * @param model モデル名
  * @param available 利用可能か
  * @param unavailableReason 利用不可の理由
  */
export interface ProviderStatus {
  /** プロバイダーID */
  id: string;

  /** 表示名 */
  name: string;

  /** モデル名 */
  model: string;

  /** 利用可能か */
  available: boolean;

  /** 利用不可の理由 */
  unavailableReason?: string;

  /** 能力情報 */
  capabilities: ProviderCapabilities;
}

// ============================================================================
// Utility Types
// ============================================================================

 /**
  * ベクトル検索結果の型定義
  * @template T アイテムの型
  * @param item 検索結果のアイテム
  * @param similarity 類似度スコア (0-1)
  */
export interface VectorSearchResult<T> {
  /** 検索結果のアイテム */
  item: T;

  /** 類似度スコア (0-1) */
  similarity: number;
}
