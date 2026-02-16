/**
 * Embeddings Module - Type Definitions.
 * Provides common types for embedding providers.
 */

// ============================================================================
// Provider Types
// ============================================================================

/**
 * エンベディングプロバイダーの能力
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
 * プロバイダー設定
 */
export interface ProviderConfig {
  /** 使用するプロバイダーID */
  provider?: string;

  /** プロバイダー固有のオプション */
  options?: Record<string, unknown>;
}

/**
 * エンベディングモジュール設定
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
 * プロバイダー状態
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
 * ベクトル検索結果
 */
export interface VectorSearchResult<T> {
  /** 検索結果のアイテム */
  item: T;

  /** 類似度スコア (0-1) */
  similarity: number;
}
