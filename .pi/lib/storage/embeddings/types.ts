/**
 * @abdd.meta
 * path: .pi/lib/embeddings/types.ts
 * role: エンベディングプロバイダーとモジュールの設定および能力を定義する型宣言ファイル
 * why: エンベディング機能の実装と利用において、データ構造と契約を統一するため
 * related: .pi/lib/embeddings/index.ts, .pi/lib/embeddings/openai.ts, .pi/lib/embeddings/local.ts, .pi/config.ts
 * public_api: ProviderCapabilities, EmbeddingProvider, ProviderConfig, EmbeddingModuleConfig
 * invariants:
 *   - EmbeddingProviderのcapabilities.dimensionsは生成されるベクトルの次元数と一致する
 *   - generateEmbeddingsBatchの戻り値配列長は入力textsの配列長と一致する
 *   - generateEmbeddingがnullを返す場合、プロバイダーは処理に失敗している
 * side_effects: なし（型定義のみ）
 * failure_modes:
 *   - プロバイダー実装がインターフェースの契約（戻り値型や次元数）を満たさない場合
 *   - maxTokensやmaxBatchSizeの設定がプロバイダーの実際の制限を超えている場合
 * @abdd.explain
 * overview: エンベディング生成機能（OpenAI等）共通のデータ型とインターフェースを定義
 * what_it_does:
 *   - プロバイダーの処理能力（トークン数、次元数、バッチ対応）を型定義する
 *   - プロバイダー実装が満たすべきインターフェース（生成、初期化、破棄）を規定する
 *   - プロバイダー選択およびオプション設定の構造を定義する
 *   - モジュール全体の設定構造（バージョン、デフォルトプロバイダー）を定義する
 * why_it_exists:
 *   - 異なるエンベディングプロバイダー（OpenAI、ローカル等）を同一インターフェースで扱うため
 *   - 型安全性を保証し、実装時のミス（次元数不一致など）を防ぐため
 *   - 設定値の構造を明確にし、外部設定ファイル等との連携を容易にするため
 * scope:
 *   in: なし
 *   out: ProviderCapabilities, EmbeddingProvider, ProviderConfig, EmbeddingModuleConfig
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
