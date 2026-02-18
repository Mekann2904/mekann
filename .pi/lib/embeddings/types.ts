/**
 * @abdd.meta
 * path: .pi/lib/embeddings/types.ts
 * role: エンベディングプロバイダーとモジュール設定の型定義
 * why: プロバイダー実装のインターフェース統一、設定データの型安全性確保
 * related: .pi/lib/embeddings/provider.ts, .pi/lib/embeddings/openai.ts, .pi/lib/embeddings/module.ts
 * public_api: ProviderCapabilities, EmbeddingProvider, ProviderConfig, EmbeddingModuleConfig
 * invariants: capabilities.dimensions は正の整数, fallbackOrder は空でない配列
 * side_effects: なし（純粋な型定義）
 * failure_modes: 型定義不整合による実行時エラー
 * @abdd.explain
 * overview: エンベディング機能に関する共通インターフェースと設定型を定義する
 * what_it_does:
 *   - プロバイダーの能力制限と実装要件を定義 (EmbeddingProvider, ProviderCapabilities)
 *   - モジュール全体の初期化設定とプロバイダー選択ロジック用データ構造を定義 (EmbeddingModuleConfig)
 *   - 単一プロバイダー設定スキーマを定義 (ProviderConfig)
 * why_it_exists:
 *   - 異なるエンベディングプロバイダー（OpenAI, Local, Mock等）を同一インターフェースで扱うため
 *   - 設定ファイルや依存性注入における型安全性を担保するため
 * scope:
 *   in: 外部からのプロバイダー実装、設定オブジェクト
 *   out: TypeScript型情報
 */

/**
 * Embeddings Module - Type Definitions.
 * Provides common types for embedding providers.
 */

// ============================================================================
// Provider Types
// ============================================================================

/**
 * @summary プロバイダ能力定義
 * @description エンベディングプロバイダーの能力を定義します。
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
 * プロバイダー設定を定義
 * @summary プロバイダー設定
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
 * @summary 埋め込み結果
 * @description 埋め込みベクトル生成の結果を表します。
 * @param {number[]} embedding 生成されたベクトル
 * @param {string} provider プロバイダー名
 * @param {string} model モデル名
 * @param {number} dimensions ベクトル次元数
 * @param {number} [tokens] 使用トークン数
 * @returns {EmbeddingResult} 埋め込み結果オブジェクト
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
 * @summary ステータス定義
 * @description プロバイダーの現在のステータス情報を表します。
 * @param {string} id プロバイダーID
 * @param {string} name プロバイダー名
 * @param {string} model モデル名
 * @param {boolean} available 利用可能か
 * @param {string} [unavailableReason] 利用不可の理由
 * @returns {ProviderStatus} ステータス情報
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
 * @summary 検索結果保持
 * @description ベクトル検索の結果を表します。
 * @param {T} item 検索対象アイテム
 * @param {number} similarity 類似度スコア
 * @returns {VectorSearchResult<T>} 検索結果オブジェクト
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
 * @summary プロバイダー登録
 * @description ベクトル検索や埋め込み生成を行うプロバイダーを管理します。
 * @param {string} id プロバイダーID
 * @param {EmbeddingProvider} provider プロバイダーインスタンス
 * @returns {void}
 */
export interface VectorSearchResult<T> {
  /** 検索結果のアイテム */
  item: T;

  /** 類似度スコア (0-1) */
  similarity: number;
}
