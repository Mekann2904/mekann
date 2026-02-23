/**
 * @abdd.meta
 * path: .pi/lib/runtime-types.ts
 * role: エージェントランタイムの型定義集約モジュール
 * why: agent-runtime.tsから抽出した型定義を一元管理し、再利用性と保守性を向上させるため
 * related: .pi/extensions/agent-runtime.ts, .pi/lib/priority-scheduler.ts
 * public_api: AgentRuntimeLimits, RuntimeQueueEntry, RuntimeCapacityReservationRecord, AgentRuntimeState, GlobalScopeWithRuntime, RuntimeStateProvider, TaskPriority, PriorityTaskMetadata
 * invariants: RuntimeQueueEntryはPriorityTaskMetadataを継承し、優先度情報を含む; AgentRuntimeStateは全サブシステム(subagents, teams, queue, reservations)の現在値を保持する
 * side_effects: なし（純粋な型定義モジュール）
 * failure_modes: 型定義と実装の不整合によるランタイムエラー、GlobalScopeWithRuntimeの型アサーション失敗
 * @abdd.explain
 * overview: エージェント実行環境におけるリソース制限、キュー管理、状態監視、および容量予約に関するデータ構造を定義する
 * what_it_does:
 *   - TaskPriorityやPriorityTaskMetadataを再エクスポートする
 *   - エージェントの並列実行数や待機時間などの制限値を定義する
 *   - 優先度キューのエントリ、容量予約、統計情報の型を定義する
 *   - ランタイム全体の状態（サブエージェント、チーム、キュー、予約）を表す型を定義する
 *   - globalThisへランタイム状態を格納するための型拡張を定義する
 * why_it_exists:
 *   - ランタイムの複雑な状態管理に関する型情報を単一のソースにまとめるため
 *   - 型の変更を一箇所で行い、関連モジュールへ波及させるため
 * scope:
 *   in: なし（依存なし、priority-schedulerからの型インポートのみ）
 * out: エージェントランタイム実装モジュール、スケジューラ、状態へアクセスするクライアントコード
 */

// File: .pi/lib/runtime-types.ts
// Description: Type definitions for agent runtime.
// Why: Centralize type definitions extracted from agent-runtime.ts for reusability.
// Related: .pi/extensions/agent-runtime.ts, .pi/lib/priority-scheduler.ts

import type { TaskPriority, PriorityTaskMetadata } from "./priority-scheduler.js";

// ============================================================================
// Re-exports from priority-scheduler
// ============================================================================

export type { TaskPriority, PriorityTaskMetadata };

// ============================================================================
// Core Types
// ============================================================================

/**
 * エージェント実行制限値
 * @summary 制限値定義
 */
export interface AgentRuntimeLimits {
  maxTotalActiveLlm: number;
  maxTotalActiveRequests: number;
  maxParallelSubagentsPerRun: number;
  maxParallelTeamsPerRun: number;
  maxParallelTeammatesPerTeam: number;
  maxConcurrentOrchestrations: number;
  capacityWaitMs: number;
  capacityPollMs: number;
}

/**
 * ランタイムキュークラス
 * @summary キュー分類
 */
export type RuntimeQueueClass = "interactive" | "standard" | "batch";

/**
 * ランタイムキューエントリ
 * @summary キューエントリ定義
 * @description 優先度メタデータを拡張し、スケジューリング固有フィールドを追加
 */
export interface RuntimeQueueEntry extends PriorityTaskMetadata {
  queueClass: RuntimeQueueClass;
  tenantKey: string;
  additionalRequests: number;
  additionalLlm: number;
  skipCount: number;
}

/**
 * 容量予約レコード
 * @summary 予約記録
 */
export interface RuntimeCapacityReservationRecord {
  id: string;
  toolName: string;
  additionalRequests: number;
  additionalLlm: number;
  createdAtMs: number;
  heartbeatAtMs: number;
  expiresAtMs: number;
  consumedAtMs?: number;
}

/**
 * 優先度統計
 * @summary 優先度別キュー数
 */
export interface RuntimePriorityStats {
  critical: number;
  high: number;
  normal: number;
  low: number;
  background: number;
}

/**
 * エージェントランタイム状態
 * @summary ランタイム状態
 */
export interface AgentRuntimeState {
  subagents: {
    activeRunRequests: number;
    activeAgents: number;
  };
  teams: {
    activeTeamRuns: number;
    activeTeammates: number;
  };
  queue: {
    activeOrchestrations: number;
    pending: RuntimeQueueEntry[];
    lastDispatchedTenantKey?: string;
    consecutiveDispatchesByTenant: number;
    evictedEntries: number;
    /** Priority queue statistics (updated on enqueue/dequeue) */
    priorityStats?: RuntimePriorityStats;
  };
  reservations: {
    active: RuntimeCapacityReservationRecord[];
  };
  limits: AgentRuntimeLimits;
  limitsVersion: string;
}

/**
 * グローバルスコープ拡張型
 * @summary グローバル状態型
 */
export type GlobalScopeWithRuntime = typeof globalThis & {
  __PI_SHARED_AGENT_RUNTIME_STATE__?: AgentRuntimeState;
};

/**
 * ランタイム状態を提供
 * @summary 状態提供
 */
export interface RuntimeStateProvider {
  getState(): AgentRuntimeState;
  resetState(): void;
}

/**
 * ランタイムスナップショット
 * @summary スナップショット定義
 */
export interface AgentRuntimeSnapshot {
  subagentActiveRequests: number;
  subagentActiveAgents: number;
  teamActiveRuns: number;
  teamActiveAgents: number;
  reservedRequests: number;
  reservedLlm: number;
  activeReservations: number;
  activeOrchestrations: number;
  queuedOrchestrations: number;
  queuedTools: string[];
  queueEvictions: number;
  totalActiveRequests: number;
  totalActiveLlm: number;
  limits: AgentRuntimeLimits;
  limitsVersion: string;
  /** Priority queue statistics */
  priorityStats?: RuntimePriorityStats;
}

/**
 * ランタイムステータスラインの表示オプション
 * @summary ステータスオプション
 */
export interface RuntimeStatusLineOptions {
  title?: string;
  storedRuns?: number;
  adaptivePenalty?: number;
  adaptivePenaltyMax?: number;
}

// ============================================================================
// Capacity Check Types
// ============================================================================

/**
 * 容量チェック入力
 * @summary 容量チェック入力
 */
export interface RuntimeCapacityCheckInput {
  additionalRequests: number;
  additionalLlm: number;
}

/**
 * 容量チェック結果
 * @summary 容量チェック結果
 */
export interface RuntimeCapacityCheck {
  allowed: boolean;
  reasons: string[];
  projectedRequests: number;
  projectedLlm: number;
  /** Current runtime snapshot */
  snapshot: AgentRuntimeSnapshot;
}

/**
 * 容量待機入力
 * @summary 容量待機入力
 */
export interface RuntimeCapacityWaitInput extends RuntimeCapacityCheckInput {
  maxWaitMs?: number;
  pollIntervalMs?: number;
  signal?: AbortSignal;
}

/**
 * 容量待機の結果
 * @summary 容量待機結果
 */
export interface RuntimeCapacityWaitResult extends RuntimeCapacityCheck {
  waitedMs: number;
  attempts: number;
  timedOut: boolean;
}

// ============================================================================
// Reservation Types
// ============================================================================

/**
 * キャパシティ予約リース
 * @summary 予約リース
 */
export interface RuntimeCapacityReservationLease {
  id: string;
  toolName: string;
  additionalRequests: number;
  additionalLlm: number;
  expiresAtMs: number;
  consume: () => void;
  heartbeat: (ttlMs?: number) => void;
  release: () => void;
}

/**
 * キャパシティ予約入力
 * @summary 予約入力
 */
export interface RuntimeCapacityReserveInput extends RuntimeCapacityCheckInput {
  toolName?: string;
  maxWaitMs?: number;
  pollIntervalMs?: number;
  reservationTtlMs?: number;
  signal?: AbortSignal;
}

/**
 * キャパシティ予約結果
 * @summary 予約結果
 */
export interface RuntimeCapacityReserveResult extends RuntimeCapacityCheck {
  waitedMs: number;
  attempts: number;
  timedOut: boolean;
  aborted: boolean;
  reservation?: RuntimeCapacityReservationLease;
}

// ============================================================================
// Orchestration Types
// ============================================================================

/**
 * オーケストレーションの待機入力
 * @summary 待機入力
 */
export interface RuntimeOrchestrationWaitInput {
  toolName: string;
  /** Optional priority override. If not specified, inferred from toolName. */
  priority?: TaskPriority;
  /** Estimated duration in milliseconds (for SRT optimization). */
  estimatedDurationMs?: number;
  /** Estimated rounds from agent-estimation skill. */
  estimatedRounds?: number;
  /** Deadline timestamp in milliseconds. */
  deadlineMs?: number;
  /** Source context for priority inference. */
  source?: PriorityTaskMetadata["source"];
  maxWaitMs?: number;
  pollIntervalMs?: number;
  signal?: AbortSignal;
}

/**
 * オーケストレーションのリース情報
 * @summary リース情報
 */
export interface RuntimeOrchestrationLease {
  id: string;
  release: () => void;
}

/**
 * オーケストレーション待機結果
 * @summary 待機結果
 */
export interface RuntimeOrchestrationWaitResult {
  allowed: boolean;
  waitedMs: number;
  attempts: number;
  timedOut: boolean;
  aborted: boolean;
  queuePosition: number;
  queuedAhead: number;
  orchestrationId: string;
  lease?: RuntimeOrchestrationLease;
}

// ============================================================================
// Dispatch Types
// ============================================================================

/**
 * ディスパッチ候補
 * @summary ディスパッチ候補
 * @description リソース要件を持つディスパッチ候補
 */
export interface RuntimeDispatchCandidate {
  additionalRequests: number;
  additionalLlm: number;
}

/**
 * 統合ディスパッチ許可入力
 * @summary ディスパッチ入力
 * @description キューターンと容量予約を一緒に取得する統合インターフェース
 */
export interface RuntimeDispatchPermitInput {
  toolName: string;
  candidate: RuntimeDispatchCandidate;
  source?: PriorityTaskMetadata["source"];
  priority?: TaskPriority;
  queueClass?: RuntimeQueueClass;
  tenantKey?: string;
  estimatedDurationMs?: number;
  estimatedRounds?: number;
  deadlineMs?: number;
  maxWaitMs?: number;
  pollIntervalMs?: number;
  reservationTtlMs?: number;
  signal?: AbortSignal;
}

/**
 * 統合ディスパッチリース
 * @summary ディスパッチリース
 */
export interface RuntimeDispatchPermitLease {
  id: string;
  toolName: string;
  additionalRequests: number;
  additionalLlm: number;
  expiresAtMs: number;
  consume: () => void;
  heartbeat: (ttlMs?: number) => void;
  release: () => void;
}

/**
 * 統合ディスパッチ許可結果
 * @summary ディスパッチ結果
 */
export interface RuntimeDispatchPermitResult {
  allowed: boolean;
  waitedMs: number;
  attempts: number;
  timedOut: boolean;
  aborted: boolean;
  queuePosition: number;
  queuedAhead: number;
  orchestrationId: string;
  projectedRequests: number;
  projectedLlm: number;
  reasons: string[];
  lease?: RuntimeDispatchPermitLease;
}
