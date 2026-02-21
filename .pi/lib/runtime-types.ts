/**
 * @abdd.meta
 * path: .pi/lib/runtime-types.ts
 * role: エージェントランタイムの型定義を一元管理するモジュール
 * why: agent-runtime.tsから型定義を分離し、再利用性と保守性を向上させるため
 * related: .pi/extensions/agent-runtime.ts, .pi/lib/priority-scheduler.ts
 * public_api: AgentRuntimeLimits, RuntimeStateProvider, AgentRuntimeSnapshot, RuntimeCapacityCheck, RuntimeDispatchPermitResult
 * invariants: すべての型定義は純粋なTypeScript型のみ（ランタイム値に依存しない）
 * side_effects: なし（純粋な型定義モジュール）
 * failure_modes: なし
 * @abdd.explain
 * overview: エージェント実行ランタイムの型定義を集約したモジュール
 * what_it_does:
 *   - AgentRuntimeLimits, AgentRuntimeState等の状態型を定義
 *   - RuntimeCapacityCheck, RuntimeDispatchPermitResult等の操作型を定義
 *   - PriorityTaskMetadata, TaskPriorityを再エクスポート
 * why_it_exists:
 *   - 単一ファイルの肥大化を防ぎ、型定義を独立して管理するため
 *   - 他モジュールからの型参照を容易にするため
 * scope:
 *   in: なし（純粋な型定義）
 *   out: エクスポートされた型定義
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
