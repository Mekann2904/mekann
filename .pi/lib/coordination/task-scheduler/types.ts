/**
 * @abdd.meta
 * path: .pi/lib/coordination/task-scheduler/types.ts
 * role: タスクスケジューラの型定義
 * why: 型安全性を確保し、モジュール間の契約を明確にするため
 * related: ./scheduler.ts, ./preemption.ts, ./hybrid-scoring.ts
 * public_api: 全ての型定義
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: タスクスケジューラで使用されるすべての型定義
 * what_it_does:
 *   - タスクのメタデータ型を定義
 *   - スケジューラ設定型を定義
 *   - 実行結果型を定義
 * why_it_exists: 型安全性を確保し、コンパイル時エラーを防ぐため
 * scope:
 *   in: なし
 *   out: 型定義のみ
 */

import type { TaskPriority } from '../priority-scheduler.js';

// ============================================================================
// タスク発生元
// ============================================================================

/**
 * タスク発生元
 * @summary タスクの実行元の種別を定義する型
 */
export type TaskSource =
  | "subagent_run"
  | "subagent_run_parallel"
  | "agent_team_run"
  | "agent_team_run_parallel";

// ============================================================================
// コスト見積もり
// ============================================================================

/**
 * コスト見積もり
 * @summary タスクの推定コストを表すインターフェース
 */
export interface TaskCostEstimate {
  /** 推定トークン数 */
  estimatedTokens: number;
  /** 推定実行時間（ミリ秒） */
  estimatedDurationMs: number;
}

// ============================================================================
// スケジュール済みタスク
// ============================================================================

/**
 * スケジュール済みタスク
 * @summary タスクのメタデータ情報を定義するインターフェース
 */
export interface ScheduledTask<TResult = unknown> {
  /** タスクの一意なID */
  id: string;
  /** タスクの発生元 */
  source: TaskSource;
  /** 実行プロバイダ（例: "anthropic"） */
  provider: string;
  /** 使用モデル（例: "claude-sonnet-4"） */
  model: string;
  /** タスク優先度 */
  priority: TaskPriority;
  /** レート制限用のコスト見積もり */
  costEstimate: TaskCostEstimate;
  /** タスク実行関数 */
  execute: () => Promise<TResult>;
  /** キャンセル用のAbortSignal（オプション） */
  signal?: AbortSignal;
  /** デッドラインタイムスタンプ（ミリ秒、オプション） */
  deadlineMs?: number;
}

// ============================================================================
// タスク実行結果
// ============================================================================

/**
 * タスク実行結果
 * @summary タスクの実行結果を表すインターフェース
 */
export interface TaskResult<TResult = unknown> {
  /** タスクID */
  taskId: string;
  /** タスクが正常に完了したかどうか */
  success: boolean;
  /** タスク結果（成功時） */
  result?: TResult;
  /** エラーメッセージ（失敗時） */
  error?: string;
  /** 実行前のキュー待機時間（ミリ秒） */
  waitedMs: number;
  /** 実際の実行時間（ミリ秒） */
  executionMs: number;
  /** タスクがタイムアウトしたかどうか */
  timedOut: boolean;
  /** タスクが中断されたかどうか */
  aborted: boolean;
}

// ============================================================================
// キュー統計情報
// ============================================================================

/**
 * キュー統計情報
 * @summary キューの統計情報を表すインターフェース
 */
export interface QueueStats {
  /** 総待機タスク数 */
  totalQueued: number;
  /** 優先度別のタスク数 */
  byPriority: Record<TaskPriority, number>;
  /** プロバイダー別のタスク数 */
  byProvider: Record<string, number>;
  /** 平均待機時間（ミリ秒） */
  avgWaitMs: number;
  /** 最大待機時間（ミリ秒） */
  maxWaitMs: number;
  /** スターベーション状態のタスク数 */
  starvingCount: number;
  /** アクティブな実行数 */
  activeExecutions: number;
}

// ============================================================================
// スケジューラ設定
// ============================================================================

/**
 * スケジューラ設定
 * @summary スケジューラの動作設定を表すインターフェース
 */
export interface SchedulerConfig {
  /** プロバイダー/モデルごとの最大同時実行数 */
  maxConcurrentPerModel: number;
  /** 全体の最大同時実行数 */
  maxTotalConcurrent: number;
  /** タスクのデフォルトタイムアウト（ミリ秒） */
  defaultTimeoutMs: number;
  /** スターベーションしきい値（ミリ秒） */
  starvationThresholdMs: number;
  /** 昇格前の最大スキップ回数 */
  maxSkipCount: number;
}

// ============================================================================
// ハイブリッドスケジューラ設定
// ============================================================================

/**
 * ハイブリッドスケジューラ設定
 * @summary ハイブリッドスケジューリングの重み付け設定
 */
export interface HybridSchedulerConfig {
  /** 優先度コンポーネントの重み（0.0 - 1.0） */
  priorityWeight: number;
  /** SJF（最短処理時間）コンポーネントの重み（0.0 - 1.0） */
  sjfWeight: number;
  /** 公平キューコンポーネントの重み（0.0 - 1.0） */
  fairQueueWeight: number;
  /** 正規化用の最大実行時間（ミリ秒） */
  maxDurationForNormalization: number;
  /** スキップごとのスターベーションペナルティ */
  starvationPenaltyPerSkip: number;
  /** 最大スターベーションペナルティ */
  maxStarvationPenalty: number;
}

// ============================================================================
// 内部型
// ============================================================================

/**
 * 内部用のキューエントリ
 * @summary キュー内部で使用されるタスクエントリ
 */
export interface TaskQueueEntry {
  /** スケジュール済みタスク */
  task: ScheduledTask<unknown>;
  /** エンキュー時刻（ミリ秒） */
  enqueuedAtMs: number;
  /** 実行開始時刻（ミリ秒、オプション） */
  startedAtMs?: number;
  /** 完了時刻（ミリ秒、オプション） */
  completedAtMs?: number;
  /** スキップ回数 */
  skipCount: number;
}

// ============================================================================
// 再エクスポート
// ============================================================================

/**
 * TaskPriorityを再エクスポート
 * 注: TaskPriorityには"background"レベルが含まれるようになった
 */
export type { TaskPriority } from '../priority-scheduler.js';
