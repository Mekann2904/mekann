/**
 * @abdd.meta
 * path: .pi/core/domain/agent.ts
 * role: エージェントのドメインモデル（Enterprise Business Rules）
 * why: エージェントに関するビジネスルールを一箇所に集約し、他の層から独立させるため
 * related: application/use-cases/subagent, adapters/repositories/subagent-repository
 * public_api: Agent, AgentId, AgentStatus, ThinkingLevel, RunOutcome
 * invariants: AgentIdは空文字でない、AgentStatusは定義された状態遷移に従う
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: エージェントのドメインモデルを定義する
 * what_it_does:
 *   - エージェントの識別子（AgentId）を定義する
 *   - エージェントの状態（AgentStatus）を定義する
 *   - 推論レベル（ThinkingLevel）を定義する
 *   - 実行結果（RunOutcome）を定義する
 *   - エージェント集約（Agent）を定義する
 * why_it_exists:
 *   - ビジネスルールをインフラストラクチャから分離するため
 *   - エージェントに関する変更理由を一箇所に集約するため（CCP）
 * scope:
 *   in: なし（純粋なドメインモデル）
 *   out: application層、adapters層への型エクスポート
 */

// ============================================================================
// Value Objects (値オブジェクト)
// ============================================================================

/**
 * エージェント識別子
 * @summary エージェントID
 */
export type AgentId = string & { readonly brand: unique symbol };

/**
 * エージェントIDを作成する
 * @summary ID作成
 * @param value - 識別子文字列
 * @returns AgentId
 */
export function createAgentId(value: string): AgentId {
  if (!value || value.trim() === "") {
    throw new Error("AgentId cannot be empty");
  }
  return value as AgentId;
}

/**
 * 実行ID
 * @summary 実行ID
 */
export type RunId = string & { readonly brand: unique symbol };

/**
 * 実行IDを作成する
 * @summary 実行ID作成
 * @param value - 識別子文字列
 * @returns RunId
 */
export function createRunId(value: string): RunId {
  if (!value || value.trim() === "") {
    throw new Error("RunId cannot be empty");
  }
  return value as RunId;
}

// ============================================================================
// Enums (列挙型)
// ============================================================================

/**
 * モデルの推論レベル
 * @summary 推論レベル
 */
export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

/**
 * エージェントの状態
 * @summary エージェント状態
 */
export type AgentStatus =
  | "idle"
  | "queued"
  | "running"
  | "waiting"
  | "completed"
  | "failed"
  | "cancelled"
  | "timeout";

/**
 * 実行結果コード
 * @summary 実行結果コード
 */
export type RunOutcomeCode =
  | "SUCCESS"
  | "PARTIAL_SUCCESS"
  | "RETRYABLE_FAILURE"
  | "NONRETRYABLE_FAILURE"
  | "CANCELLED"
  | "TIMEOUT";

// ============================================================================
// Entities (エンティティ)
// ============================================================================

/**
 * 実行結果シグナル
 * @summary 実行結果シグナル
 */
export interface RunOutcome {
  /** 結果コード */
  outcomeCode: RunOutcomeCode;
  /** 再試行推奨フラグ */
  retryRecommended: boolean;
  /** エラーメッセージ（失敗時） */
  errorMessage?: string;
  /** 実行時間（ミリ秒） */
  durationMs?: number;
}

/**
 * エージェント定義
 * @summary エージェント定義
 */
export interface AgentDefinition {
  /** エージェントID */
  id: AgentId;
  /** 表示名 */
  name: string;
  /** 説明 */
  description: string;
  /** システムプロンプト */
  systemPrompt: string;
  /** プロバイダー（オプション） */
  provider?: string;
  /** モデル（オプション） */
  model?: string;
  /** 有効フラグ */
  enabled: boolean;
  /** 作成日時 */
  createdAt: Date;
  /** 更新日時 */
  updatedAt: Date;
}

/**
 * エージェント実行記録
 * @summary 実行記録
 */
export interface AgentRunRecord {
  /** 実行ID */
  runId: RunId;
  /** エージェントID */
  agentId: AgentId;
  /** タスク説明 */
  task: string;
  /** 状態 */
  status: AgentStatus;
  /** 結果 */
  outcome?: RunOutcome;
  /** 出力 */
  output?: string;
  /** 開始時刻 */
  startedAt: Date;
  /** 終了時刻 */
  finishedAt?: Date;
  /** タイムアウト（ミリ秒） */
  timeoutMs: number;
  /** 推論レベル */
  thinkingLevel: ThinkingLevel;
}

/**
 * エージェント集約
 * @summary エージェント集約
 *
 * エージェントに関するすべての情報を含む集約ルート。
 */
export interface Agent {
  /** 定義 */
  definition: AgentDefinition;
  /** 実行履歴 */
  runs: AgentRunRecord[];
  /** 現在の状態 */
  currentStatus: AgentStatus;
}

// ============================================================================
// Domain Services (ドメインサービス)
// ============================================================================

/**
 * 実行結果から再試行推奨を判定する
 * @summary 再試行判定
 * @param outcomeCode - 結果コード
 * @returns 再試行推奨フラグ
 */
export function shouldRetry(outcomeCode: RunOutcomeCode): boolean {
  return outcomeCode === "RETRYABLE_FAILURE" || outcomeCode === "TIMEOUT";
}

/**
 * 実行が完了状態かどうかを判定する
 * @summary 完了判定
 * @param status - エージェント状態
 * @returns 完了状態かどうか
 */
export function isTerminalStatus(status: AgentStatus): boolean {
  return ["completed", "failed", "cancelled", "timeout"].includes(status);
}

/**
 * デフォルトタイムアウト（ミリ秒）
 * 10分 - 複雑な操作のための保守的なデフォルト
 */
export const DEFAULT_AGENT_TIMEOUT_MS = 10 * 60 * 1000;
