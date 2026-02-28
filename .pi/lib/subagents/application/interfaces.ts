/**
 * @abdd.meta
 * path: .pi/lib/subagents/application/interfaces.ts
 * role: Application層のインターフェース定義
 * why: 依存関係逆転の原則（DIP）に従い、詳細に依存しないため
 * related: ./subagent-service.ts
 * public_api: ISubagentRepository, IRuntimeCoordinator, ISubagentExecutor
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: Application層のポート（インターフェース）
 * what_it_does:
 *   - リポジトリインターフェース定義
 *   - ランタイムコーディネーターIF
 *   - サブエージェント実行IF
 * why_it_exists: DIPにより、ビジネスロジックをインフラストラクチャから分離
 * scope:
 *   in: domain層
 *   out: adapters層の実装
 */

import type { SubagentDefinition, SubagentStorage, SubagentRunRecord } from "../domain/subagent-definition.js";

/**
 * サブエージェントリポジトリインターフェース
 * @summary リポジトリIF
 */
export interface ISubagentRepository {
  /**
   * ストレージを読み込む
   * @returns サブエージェントストレージ
   */
  load(): Promise<SubagentStorage>;

  /**
   * ストレージを保存
   * @param storage - サブエージェントストレージ
   */
  save(storage: SubagentStorage): Promise<void>;

  /**
   * 実行履歴を追加
   * @param record - 実行履歴レコード
   */
  addRunRecord(record: SubagentRunRecord): Promise<void>;

  /**
   * 実行履歴を取得
   * @param limit - 取得件数
   */
  getRunRecords(limit?: number): Promise<SubagentRunRecord[]>;
}

/**
 * サブエージェント実行結果
 * @summary 実行結果
 */
export interface SubagentExecutionResult {
  /** 成功フラグ */
  success: boolean;
  /** 出力テキスト */
  output?: string;
  /** エラーメッセージ */
  error?: string;
  /** 実行時間（ミリ秒） */
  durationMs?: number;
  /** トークン使用量 */
  tokenUsage?: {
    input: number;
    output: number;
  };
}

/**
 * サブエージェント実行オプション
 * @summary 実行オプション
 */
export interface SubagentExecutionOptions {
  /** タイムアウト（ミリ秒） */
  timeoutMs?: number;
  /** 追加コンテキスト */
  extraContext?: string;
  /** 再試行設定 */
  retry?: {
    maxRetries: number;
    initialDelayMs: number;
    maxDelayMs: number;
  };
  /** UL Workflow タスクID */
  ulTaskId?: string;
}

/**
 * サブエージェント実行インターフェース
 * @summary 実行IF
 */
export interface ISubagentExecutor {
  /**
   * サブエージェントを実行
   * @param subagent - サブエージェント定義
   * @param task - タスク内容
   * @param options - 実行オプション
   */
  execute(
    subagent: SubagentDefinition,
    task: string,
    options?: SubagentExecutionOptions
  ): Promise<SubagentExecutionResult>;
}

/**
 * ランタイムコーディネーターインターフェース
 * @summary ランタイムIF
 */
export interface IRuntimeCoordinator {
  /**
   * 実行許可を取得
   * @param subagentId - サブエージェントID
   */
  acquirePermit(subagentId: string): Promise<RuntimePermit | null>;

  /**
   * 実行許可を解放
   * @param permit - 実行許可
   */
  releasePermit(permit: RuntimePermit): void;

  /**
   * 現在の同時実行数を取得
   */
  getActiveCount(): number;

  /**
   * 最大同時実行数を取得
   */
  getMaxConcurrency(): number;
}

/**
 * ランタイム実行許可
 * @summary 実行許可
 */
export interface RuntimePermit {
  /** 許可ID */
  id: string;
  /** サブエージェントID */
  subagentId: string;
  /** 取得時刻 */
  acquiredAt: Date;
}

/**
 * サブエージェントサービスの依存関係
 * @summary サービス依存
 */
export interface SubagentServiceDependencies {
  repository: ISubagentRepository;
  executor: ISubagentExecutor;
  runtimeCoordinator: IRuntimeCoordinator;
}

/**
 * サブエージェント選択結果
 * @summary 選択結果
 */
export interface SubagentSelectionResult {
  success: boolean;
  subagent?: SubagentDefinition;
  error?: string;
}
