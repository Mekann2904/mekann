/**
 * @abdd.meta
 * path: .pi/lib/agent-runtime/domain/runtime-state.ts
 * role: ランタイム状態のドメインエンティティ
 * why: ランタイム管理の中核となる状態とビジネスルールを定義
 * related: ../application/interfaces.ts
 * public_api: AgentRuntimeLimits, AgentRuntimeState, RuntimeQueueEntry
 * invariants: カウンタは負の値にならない
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: ランタイム状態のドメインエンティティ
 * what_it_does:
 *   - ランタイム制限定義
 *   - キューエントリ定義
 *   - 予約レコード定義
 * why_it_exists: ビジネスロジックをインフラから分離
 * scope:
 *   in: なし
 *   out: application層、adapters層
 */

/**
 * タスク優先度
 * @summary タスク優先度
 */
export type TaskPriority = "critical" | "high" | "normal" | "low" | "background";

/**
 * 優先度メタデータ
 * @summary 優先度メタデータ
 */
export interface PriorityTaskMetadata {
  /** 優先度 */
  priority?: TaskPriority;
  /** 推定実行時間（ミリ秒） */
  estimatedDurationMs?: number;
  /** 推定ラウンド数 */
  estimatedRounds?: number;
}

/**
 * ランタイムキュー分類
 * @summary キュー分類
 */
export type RuntimeQueueClass = "interactive" | "standard" | "batch";

/**
 * ランタイム制限
 * @summary ランタイム制限
 */
export interface AgentRuntimeLimits {
  /** 最大同時アクティブLLM数 */
  maxTotalActiveLlm: number;
  /** 最大同時アクティブリクエスト数 */
  maxTotalActiveRequests: number;
  /** 実行あたりの最大並列サブエージェント数 */
  maxParallelSubagentsPerRun: number;
  /** 実行あたりの最大並列チーム数 */
  maxParallelTeamsPerRun: number;
  /** チームあたりの最大並列メンバー数 */
  maxParallelTeammatesPerTeam: number;
  /** 最大同時オーケストレーション数 */
  maxConcurrentOrchestrations: number;
  /** 容量待機最大時間（ミリ秒） */
  capacityWaitMs: number;
  /** 容量ポーリング間隔（ミリ秒） */
  capacityPollMs: number;
}

/**
 * 優先度統計
 * @summary 優先度統計
 */
export interface RuntimePriorityStats {
  critical: number;
  high: number;
  normal: number;
  low: number;
  background: number;
}

/**
 * キューエントリ
 * @summary キューエントリ
 */
export interface RuntimeQueueEntry extends PriorityTaskMetadata {
  /** エントリID */
  id: string;
  /** ツール名 */
  toolName: string;
  /** 追加リクエスト数 */
  additionalRequests: number;
  /** 追加LLM数 */
  additionalLlm: number;
  /** ソース */
  source: string;
  /** キュー分類 */
  queueClass?: RuntimeQueueClass;
  /** エンキュー時刻（ミリ秒） */
  enqueuedAtMs: number;
  /** テナントキー */
  tenantKey?: string;
  /** 推定実行時間（ミリ秒） */
  estimatedDurationMs?: number;
  /** 推定ラウンド数 */
  estimatedRounds?: number;
}

/**
 * 予約レコード
 * @summary 予約レコード
 */
export interface RuntimeCapacityReservationRecord {
  /** 予約ID */
  id: string;
  /** ツール名 */
  toolName: string;
  /** 追加リクエスト数 */
  additionalRequests: number;
  /** 追加LLM数 */
  additionalLlm: number;
  /** 作成時刻（ミリ秒） */
  createdAtMs: number;
  /** ハートビート時刻（ミリ秒） */
  heartbeatAtMs: number;
  /** 有効期限（ミリ秒） */
  expiresAtMs: number;
  /** 消費時刻（ミリ秒） */
  consumedAtMs?: number;
}

/**
 * サブエージェント状態
 * @summary サブエージェント状態
 */
export interface SubagentRuntimeState {
  /** アクティブ実行リクエスト数 */
  activeRunRequests: number;
  /** アクティブエージェント数 */
  activeAgents: number;
}

/**
 * チーム状態
 * @summary チーム状態
 */
export interface TeamRuntimeState {
  /** アクティブチーム実行数 */
  activeTeamRuns: number;
  /** アクティブチームメイト数 */
  activeTeammates: number;
}

/**
 * キュー状態
 * @summary キュー状態
 */
export interface QueueRuntimeState {
  /** アクティブオーケストレーション数 */
  activeOrchestrations: number;
  /** 待機中エントリ */
  pending: RuntimeQueueEntry[];
  /** 同一テナント連続ディスパッチ数 */
  consecutiveDispatchesByTenant: number;
  /** 最後にディスパッチされたテナントキー */
  lastDispatchedTenantKey?: string;
  /** 退避エントリ総数 */
  evictedEntries: number;
  /** 優先度統計 */
  priorityStats?: RuntimePriorityStats;
}

/**
 * 予約状態
 * @summary 予約状態
 */
export interface ReservationRuntimeState {
  /** アクティブ予約 */
  active: RuntimeCapacityReservationRecord[];
}

/**
 * エージェントランタイム状態
 * @summary ランタイム状態
 */
export interface AgentRuntimeState {
  /** サブエージェント状態 */
  subagents: SubagentRuntimeState;
  /** チーム状態 */
  teams: TeamRuntimeState;
  /** キュー状態 */
  queue: QueueRuntimeState;
  /** 予約状態 */
  reservations: ReservationRuntimeState;
  /** 制限 */
  limits: AgentRuntimeLimits;
  /** 制限バージョン */
  limitsVersion: string;
}

/**
 * デフォルト制限を作成
 * @summary デフォルト制限作成
 * @returns デフォルト制限
 */
export function createDefaultLimits(): AgentRuntimeLimits {
  return {
    maxTotalActiveLlm: 4,
    maxTotalActiveRequests: 2,
    maxParallelSubagentsPerRun: 2,
    maxParallelTeamsPerRun: 1,
    maxParallelTeammatesPerTeam: 3,
    maxConcurrentOrchestrations: 4,
    capacityWaitMs: 30_000,
    capacityPollMs: 250,
  };
}

/**
 * 初期ランタイム状態を作成
 * @summary 初期状態作成
 * @param limits - ランタイム制限（省略時はデフォルト）
 * @returns 初期ランタイム状態
 */
export function createInitialRuntimeState(
  limits: AgentRuntimeLimits = createDefaultLimits()
): AgentRuntimeState {
  return {
    subagents: {
      activeRunRequests: 0,
      activeAgents: 0,
    },
    teams: {
      activeTeamRuns: 0,
      activeTeammates: 0,
    },
    queue: {
      activeOrchestrations: 0,
      pending: [],
      consecutiveDispatchesByTenant: 0,
      evictedEntries: 0,
    },
    reservations: {
      active: [],
    },
    limits,
    limitsVersion: serializeLimits(limits),
  };
}

/**
 * 制限をシリアライズ
 * @summary 制限シリアライズ
 * @param limits - ランタイム制限
 * @returns シリアライズされた文字列
 */
export function serializeLimits(limits: AgentRuntimeLimits): string {
  return [
    limits.maxTotalActiveLlm,
    limits.maxTotalActiveRequests,
    limits.maxParallelSubagentsPerRun,
    limits.maxParallelTeamsPerRun,
    limits.maxParallelTeammatesPerTeam,
    limits.maxConcurrentOrchestrations,
    limits.capacityWaitMs,
    limits.capacityPollMs,
  ].join(":");
}

/**
 * 優先度ランクを取得
 * @summary 優先度ランク取得
 * @param priority - タスク優先度
 * @returns 優先度ランク（大きいほど高い）
 */
export function getPriorityRank(priority: TaskPriority | undefined): number {
  switch (priority) {
    case "critical": return 5;
    case "high": return 4;
    case "normal": return 3;
    case "low": return 2;
    case "background": return 1;
    default: return 3;
  }
}

/**
 * キュー分類ランクを取得
 * @summary 分類ランク取得
 * @param queueClass - キュー分類
 * @returns 分類ランク（大きいほど高い）
 */
export function getQueueClassRank(queueClass: RuntimeQueueClass): number {
  switch (queueClass) {
    case "interactive": return 3;
    case "standard": return 2;
    case "batch": return 1;
  }
}
