/**
 * @abdd.meta
 * path: .pi/extensions/agent-runtime.ts
 * role: エージェントのランタイムリソース制御と共有状態管理を行う拡張機能
 * why: サブエージェントとエージェントチーム間で一貫したリアルタイムのリソースビューを維持するため
 * related: .pi/extensions/subagents.ts, .pi/extensions/agent-teams.ts, .pi/lib/cross-instance-coordinator.ts, .pi/lib/task-scheduler.ts
 * public_api: AgentRuntimeLimits, RuntimeQueueEntry, RuntimeCapacityReservationRecord, AgentRuntimeState
 * invariants: アクティブLLM数およびリクエスト数はmaxTotalActiveLlm/maxTotalActiveRequestsを超えない
 * side_effects: キューへのタスク追加、リソース確保・解放、スケジューラへの状態通知
 * failure_modes: リソース枯渇によるタスクブロック、スケジューラ通信エラーによる不整合、ハートビートタイムアウトによる予約解除
 * @abdd.explain
 * overview: 分散環境におけるLLMワーカーとリクエストのリアルタイム監視および制限管理機能を提供する
 * what_it_does:
 *   - グローバルなリソース制限（AgentRuntimeLimits）の定義と適用
 *   - タスクの優先度キュー管理とキュー統計の記録
 *   - クロスインスタンスコーディネータ、動的並列度、レート制御との連携
 *   - ランタイムスナップショットの提供
 * why_it_exists:
 *   - 複数のサブエージェントやチームが並列実行される際のリソース競合を防ぐため
 *   - システム全体のスループットを最大化しつつ、プロバイダ制限を守るため
 * scope:
 *   in: タスクメタデータ、優先度、ランタイム設定、スケジューラフラグ
 *   out: リソース確保状態、キュー統計、容量予約記録、スケジューラ通知
 */

// File: .pi/extensions/agent-runtime.ts
// Description: Shares runtime counters across subagents and agent teams.
// Why: Keeps one consistent, real-time view of active LLM workers and requests.
// Related: .pi/extensions/subagents.ts, .pi/extensions/agent-teams.ts, README.md

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { randomBytes } from "node:crypto";

import {
  getEffectiveLimit,
  getSchedulerAwareLimit,
} from "../lib/adaptive-rate-controller";
import {
  getMyParallelLimit,
  isCoordinatorInitialized,
  getModelParallelLimit,
  getActiveInstancesForModel,
  getStealingStats,
  isIdle,
  findStealCandidate,
  safeStealWork,
  enhancedHeartbeat,
} from "../lib/cross-instance-coordinator";
import * as crossInstanceCoordinator from "../lib/cross-instance-coordinator";
import {
  broadcastQueueState,
  getWorkStealingSummary,
} from "../lib/cross-instance-coordinator";
import {
  getParallelismAdjuster,
  getParallelism as getDynamicParallelism,
} from "../lib/dynamic-parallelism";
import {
  TaskPriority,
  PriorityTaskQueue,
  inferPriority,
  comparePriority,
  formatPriorityQueueStats,
  type PriorityTaskMetadata,
  type PriorityQueueEntry,
} from "../lib/priority-scheduler";
import {
  getConcurrencyLimit,
  resolveLimits,
  detectTier,
} from "../lib/provider-limits";
import {
  getScheduler,
  createTaskId,
  type ScheduledTask,
  type TaskResult,
  type TaskSource,
} from "../lib/task-scheduler";
import {
  setRuntimeSnapshotProvider,
} from "../lib/unified-limit-resolver";
import {
  getRuntimeConfig,
  isStableProfile,
  type RuntimeConfig,
} from "../lib/runtime-config";

// Feature flag for scheduler-based capacity management
const USE_SCHEDULER = process.env.PI_USE_SCHEDULER === "true";

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

type RuntimeQueueClass = "interactive" | "standard" | "batch";
// RuntimeQueueEntry extends priority metadata with scheduling-specific fields.
interface RuntimeQueueEntry extends PriorityTaskMetadata {
  queueClass: RuntimeQueueClass;
  tenantKey: string;
  additionalRequests: number;
  additionalLlm: number;
  skipCount: number;
}

interface RuntimeCapacityReservationRecord {
  id: string;
  toolName: string;
  additionalRequests: number;
  additionalLlm: number;
  createdAtMs: number;
  heartbeatAtMs: number;
  expiresAtMs: number;
  consumedAtMs?: number;
}

interface AgentRuntimeState {
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
    priorityStats?: {
      critical: number;
      high: number;
      normal: number;
      low: number;
      background: number;
    };
  };
  reservations: {
    active: RuntimeCapacityReservationRecord[];
  };
  limits: AgentRuntimeLimits;
  limitsVersion: string;
}

type GlobalScopeWithRuntime = typeof globalThis & {
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
/**
  * グローバルランタイム状態を取得する
  *
  * globalThisを通じてプロセス全体で共有されるエージェントランタイム状態を返します。
  * 状態が未初期化の場合は作成し、整合性チェックを経て返却します。
  *
  * @returns エージェントランタイム状態オブジェクト
  * @example
  * // ランタイム状態の取得
  * const provider = new GlobalRuntimeStateProvider();
  * const state = provider.getState();
  */

/**
 * GlobalRuntimeStateProvider - デフォルト実装
 *
 * globalThisを使用してプロセス全体で状態を共有する
 */
class GlobalRuntimeStateProvider implements RuntimeStateProvider {
  private readonly globalScope: GlobalScopeWithRuntime;

  constructor() {
    this.globalScope = globalThis as GlobalScopeWithRuntime;
  }

  /**
   * ランタイム状態を取得
   * @summary 状態を取得
   * @returns エージェントのランタイム状態
   */
  getState(): AgentRuntimeState {
    if (!this.globalScope.__PI_SHARED_AGENT_RUNTIME_STATE__) {
      this.globalScope.__PI_SHARED_AGENT_RUNTIME_STATE__ = createInitialRuntimeState();
    }
    ensureReservationSweeper();
    const runtime = ensureRuntimeStateShape(this.globalScope.__PI_SHARED_AGENT_RUNTIME_STATE__);
    enforceRuntimeLimitConsistency(runtime);
    return runtime;
  }

  /**
   * ランタイム状態をリセット
   * @summary 状態をリセット
   * @returns 戻り値なし
   */
  resetState(): void {
    this.globalScope.__PI_SHARED_AGENT_RUNTIME_STATE__ = undefined;
  }
}

/** プロバイダーのデフォルトインスタンス（シングルトン） */
let runtimeStateProvider: RuntimeStateProvider = new GlobalRuntimeStateProvider();

/**
 * ランタイムステータスラインの表示オプション
 *
 * @property title - ステータスラインのタイトル
 * @property storedRuns - 保存された実行回数
 * @property adaptivePenalty - 適応的ペナルティの現在値
 * @property adaptivePenaltyMax - 適応的ペナルティの最大値
/**
 * @summary 状態プロバイダ設定
 * @param provider 設定するランタイム状態プロバイダー
 * @returns 戻り値なし
 */
export function setRuntimeStateProvider(provider: RuntimeStateProvider): void {
  runtimeStateProvider = provider;
}

/**
 * プロバイダを設定
 * @summary プロバイダを設定
 * @param provider 設定するランタイム状態プロバイダ
 * @returns 戻り値なし
 */
export function getRuntimeStateProvider(): RuntimeStateProvider {
  return runtimeStateProvider;
}

/**
 * プロバイダを取得
 * @summary プロバイダを取得
 * @returns ランタイム状態プロバイダインスタンス
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
  priorityStats?: {
    critical: number;
    high: number;
    normal: number;
    low: number;
    background: number;
  };
}

/**
 * @summary ランタイムステータス設定
 * @param title ステータスラインのタイトル
 * @param storedRuns 保存済み実行数
 * @param adaptivePenalty 適応的ペナルティ値
 * @param adaptivePenaltyMax ペナルティの最大値
 * @returns ランタイムステータスラインのオプションオブジェクト
 */
export interface RuntimeStatusLineOptions {
  title?: string;
  storedRuns?: number;
/**
   * 容量予約の試行結果を表すインターフェース
   *
   * 予約待機時間、試行回数、タイムアウト/中止状態、および予約リース情報を含む。
   *
   * @property waitedMs - 予約確定までの待機時間（ミリ秒）
   * @property attempts - 予約試行回数
   * @property timedOut - タイムアウトしたかどうか
   * @property aborted - 中止されたかどうか
   * @property reservation - 確保された予約リース（成功時のみ）
   */
  adaptivePenalty?: number;
  adaptivePenaltyMax?: number;
}

/**
 * @summary 容量チェック入力
 * @param additionalRequests 追加リクエスト数
 * @param additionalLlm 追加LLM呼び出し数
 * @returns 定義済みのプロパティを持つオブジェクト型
 */
export interface RuntimeCapacityCheckInput {
  additionalRequests: number;
  additionalLlm: number;
}

/**
 * @summary 容量チェック結果
 * @param allowed 実行許可フラグ
 * @param reasons 拒否理由のリスト
 * @param projectedRequests 予測リクエスト数
 * @param projectedLlm 予測LLM呼び出し数
 * @param snapshot 容量チェック時のスナップショット
 * @returns 定義済みのプロパティを持つオブジェクト型
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
 * @summary 容量待機入力
 * @param maxWaitMs - 最大待機時間（ミリ秒）
 * @param pollIntervalMs - ポーリング間隔（ミリ秒）
 * @param signal - 中断シグナル
 */

export interface RuntimeCapacityWaitInput extends RuntimeCapacityCheckInput {
  maxWaitMs?: number;
  pollIntervalMs?: number;
  signal?: AbortSignal;
}

/**
 * @summary 容量待機の結果
 * @param waitedMs - 待機時間（ミリ秒）
 * @param attempts - 試行回数
 * @param timedOut - タイムアウトしたかどうか
 */
export interface RuntimeCapacityWaitResult extends RuntimeCapacityCheck {
  waitedMs: number;
  attempts: number;
  timedOut: boolean;
}

/**
 * キャパシティ予約リース
 * @summary 予約リース
 * @interface RuntimeCapacityReservationLease
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
 * @param reservationTtlMs - 予約の有効期限（ミリ秒）
 * @param signal - 中断シグナル
 * @interface RuntimeCapacityReserveInput
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
 * @interface RuntimeCapacityReserveResult
 */
export interface RuntimeCapacityReserveResult extends RuntimeCapacityCheck {
  waitedMs: number;
  attempts: number;
  timedOut: boolean;
  aborted: boolean;
  reservation?: RuntimeCapacityReservationLease;
}

/**
 * オーケストレーションの待機入力
 * @summary 待機入力
 * @interface RuntimeOrchestrationWaitInput
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
 * @interface RuntimeOrchestrationLease
 */
export interface RuntimeOrchestrationLease {
  id: string;
  release: () => void;
}

/**
 * オーケストレーション待機結果
 * @summary 待機結果を表す
 * @property allowed 許可されたか
 * @property waitedMs 待機時間(ミリ秒)
 * @property attempts 試行回数
 * @property timedOut タイムアウトしたか
 * @property aborted 中断されたか
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

/**
 * Dispatch candidate with resource requirements.
 */
export interface RuntimeDispatchCandidate {
  additionalRequests: number;
  additionalLlm: number;
}

/**
 * Unified dispatch permit input.
 * Queue turn and capacity reservation are acquired together.
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
 * Combined lease for dispatch.
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
 * Unified dispatch permit result.
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

// Constants now come from centralized runtime-config
const DEFAULT_MAX_CONCURRENT_ORCHESTRATIONS = 4;
const DEFAULT_RESERVATION_SWEEP_MS = 5_000;
const DEFAULT_MAX_PENDING_QUEUE_ENTRIES = 1_000;
const MIN_RESERVATION_TTL_MS = 2_000;
const MAX_RESERVATION_TTL_MS = 10 * 60 * 1_000;
const BACKOFF_MAX_FACTOR = 8;
const BACKOFF_JITTER_RATIO = 0.2;
const STRICT_LIMITS_ENV = "PI_AGENT_RUNTIME_STRICT_LIMITS";
const DEBUG_RUNTIME_QUEUE =
  process.env.PI_DEBUG_RUNTIME_QUEUE === "1" ||
  process.env.PI_DEBUG_RUNTIME === "1";
let runtimeNowProvider: () => number = () => Date.now();
let runtimeQueueSequence = 0;
let runtimeReservationSequence = 0;
const RUNTIME_INSTANCE_TOKEN = randomBytes(3).toString("hex");
let runtimeReservationSweeper: NodeJS.Timeout | undefined;
const runtimeCapacityEventTarget = new EventTarget();

function logRuntimeQueueDebug(message: string): void {
  if (!DEBUG_RUNTIME_QUEUE) return;
  console.error(`[agent-runtime][queue] ${message}`);
}

function runtimeNow(): number {
  return runtimeNowProvider();
}

export function setRuntimeNowProvider(provider?: () => number): void {
  runtimeNowProvider = provider ?? (() => Date.now());
}

/**
 * Get default reservation TTL from runtime config.
 */
function getDefaultReservationTtlMs(): number {
  return isStableProfile() ? 45_000 : 60_000;
}

function normalizePositiveInt(value: unknown, fallback: number, max = 64): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed <= 0) return fallback;
  return Math.max(1, Math.min(max, Math.trunc(parsed)));
}

function normalizeReservationTtlMs(value: unknown): number {
  const fallback = getDefaultReservationTtlMs();
  const ttl = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(ttl) || ttl <= 0) return fallback;
  return Math.max(MIN_RESERVATION_TTL_MS, Math.min(MAX_RESERVATION_TTL_MS, Math.trunc(ttl)));
}

function resolveLimitFromEnv(envName: string, fallback: number, max = 64): number {
  const raw = process.env[envName];
  if (raw === undefined) return fallback;
  return normalizePositiveInt(raw, fallback, max);
}

function getLocalRuntimeUsage(runtime: AgentRuntimeState): {
  totalActiveRequests: number;
  totalActiveLlm: number;
} {
  return {
    totalActiveRequests:
      Math.max(0, runtime.subagents.activeRunRequests) +
      Math.max(0, runtime.teams.activeTeamRuns),
    totalActiveLlm:
      Math.max(0, runtime.subagents.activeAgents) +
      Math.max(0, runtime.teams.activeTeammates),
  };
}

function publishRuntimeUsageToCoordinator(): void {
  const updateRuntimeUsage = (crossInstanceCoordinator as { updateRuntimeUsage?: (activeRequests: number, activeLlm: number) => void }).updateRuntimeUsage;
  if (typeof updateRuntimeUsage !== "function") return;
  const runtime = getSharedRuntimeState();
  const usage = getLocalRuntimeUsage(runtime);
  try {
    updateRuntimeUsage(usage.totalActiveRequests, usage.totalActiveLlm);
  } catch {
    // ignore coordinator publish failures
  }
}

function getClusterUsageSafe(localUsage: { totalActiveRequests: number; totalActiveLlm: number }): {
  totalActiveRequests: number;
  totalActiveLlm: number;
} {
  const getClusterRuntimeUsage = (crossInstanceCoordinator as { getClusterRuntimeUsage?: () => { totalActiveRequests: number; totalActiveLlm: number } }).getClusterRuntimeUsage;
  if (typeof getClusterRuntimeUsage !== "function") {
    return localUsage;
  }
  try {
    const cluster = getClusterRuntimeUsage();
    const remoteRequests = Math.max(0, Math.trunc((cluster.totalActiveRequests || 0) - localUsage.totalActiveRequests));
    const remoteLlm = Math.max(0, Math.trunc((cluster.totalActiveLlm || 0) - localUsage.totalActiveLlm));
    return {
      totalActiveRequests: localUsage.totalActiveRequests + remoteRequests,
      totalActiveLlm: localUsage.totalActiveLlm + remoteLlm,
    };
  } catch {
    return localUsage;
  }
}

/**
 * 容量変更通知
 * @summary 容量変更を通知
 */
export function notifyRuntimeCapacityChanged(): void {
  publishRuntimeUsageToCoordinator();
  runtimeCapacityEventTarget.dispatchEvent(new Event("capacity-changed"));
}

async function waitForRuntimeCapacityEvent(
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<"event" | "timeout" | "aborted"> {
  if (timeoutMs <= 0) return "timeout";
  if (signal?.aborted) return "aborted";

  return await new Promise((resolve) => {
    let settled = false;
    const complete = (result: "event" | "timeout" | "aborted") => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      runtimeCapacityEventTarget.removeEventListener("capacity-changed", onEvent);
      signal?.removeEventListener("abort", onAbort);
      resolve(result);
    };

    const onEvent = () => complete("event");
    const onAbort = () => complete("aborted");
    const timeout = setTimeout(() => complete("timeout"), timeoutMs);

    runtimeCapacityEventTarget.addEventListener("capacity-changed", onEvent, { once: true });
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function createRuntimeLimits(): AgentRuntimeLimits {
  // Use centralized RuntimeConfig as the source of truth
  const config = getRuntimeConfig();

  // Cross-instance coordination: if coordinator is initialized, use dynamic parallel limit
  // Priority: env var > coordinator > runtime-config
  let effectiveParallelSubagents = resolveLimitFromEnv(
    "PI_AGENT_MAX_PARALLEL_SUBAGENTS",
    config.maxParallelSubagents,
  );

  // Only override with coordinator if env var is NOT set and coordinator is ready
  if (!process.env.PI_AGENT_MAX_PARALLEL_SUBAGENTS && isCoordinatorInitialized()) {
    effectiveParallelSubagents = getMyParallelLimit();
  }

  let effectiveTotalLlm = resolveLimitFromEnv(
    "PI_AGENT_MAX_TOTAL_LLM",
    config.totalMaxLlm,
  );

  // Also adjust total LLM based on coordinator if env var is not set
  if (!process.env.PI_AGENT_MAX_TOTAL_LLM && isCoordinatorInitialized()) {
    effectiveTotalLlm = getMyParallelLimit();
  }

  return {
    maxTotalActiveLlm: effectiveTotalLlm,
    maxTotalActiveRequests: resolveLimitFromEnv(
      "PI_AGENT_MAX_TOTAL_REQUESTS",
      config.totalMaxRequests,
    ),
    maxParallelSubagentsPerRun: effectiveParallelSubagents,
    maxParallelTeamsPerRun: resolveLimitFromEnv(
      "PI_AGENT_MAX_PARALLEL_TEAMS",
      config.maxParallelTeams,
    ),
    maxParallelTeammatesPerTeam: resolveLimitFromEnv(
      "PI_AGENT_MAX_PARALLEL_TEAMMATES",
      config.maxParallelTeammates,
    ),
    maxConcurrentOrchestrations: resolveLimitFromEnv(
      "PI_AGENT_MAX_CONCURRENT_ORCHESTRATIONS",
      config.maxConcurrentOrchestrations,
      16,
    ),
    capacityWaitMs: resolveLimitFromEnv("PI_AGENT_CAPACITY_WAIT_MS", config.capacityWaitMs, 3_600_000),
    capacityPollMs: resolveLimitFromEnv("PI_AGENT_CAPACITY_POLL_MS", config.capacityPollMs, 60_000),
  };
}

function serializeRuntimeLimits(limits: AgentRuntimeLimits): string {
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

function ensureReservationSweeper(): void {
  if (runtimeReservationSweeper) return;
  const sweepMs = resolveLimitFromEnv(
    "PI_AGENT_RESERVATION_SWEEP_MS",
    DEFAULT_RESERVATION_SWEEP_MS,
    60_000,
  );
  runtimeReservationSweeper = setInterval(() => {
    const runtime = getSharedRuntimeState();
    cleanupExpiredReservations(runtime);
  }, sweepMs);
  runtimeReservationSweeper.unref?.();
}

export function stopRuntimeReservationSweeper(): void {
  if (!runtimeReservationSweeper) return;
  clearInterval(runtimeReservationSweeper);
  runtimeReservationSweeper = undefined;
}

function createInitialRuntimeState(): AgentRuntimeState {
  const limits = createRuntimeLimits();
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
    limitsVersion: serializeRuntimeLimits(limits),
  };
}

function sanitizeRuntimeLimits(limits: AgentRuntimeLimits | undefined): AgentRuntimeLimits {
  const fallback = createRuntimeLimits();
  if (!limits) {
    return fallback;
  }
  return {
    maxTotalActiveLlm: normalizePositiveInt(limits.maxTotalActiveLlm, fallback.maxTotalActiveLlm),
    maxTotalActiveRequests: normalizePositiveInt(
      limits.maxTotalActiveRequests,
      fallback.maxTotalActiveRequests,
    ),
    maxParallelSubagentsPerRun: normalizePositiveInt(
      limits.maxParallelSubagentsPerRun,
      fallback.maxParallelSubagentsPerRun,
    ),
    maxParallelTeamsPerRun: normalizePositiveInt(
      limits.maxParallelTeamsPerRun,
      fallback.maxParallelTeamsPerRun,
    ),
    maxParallelTeammatesPerTeam: normalizePositiveInt(
      limits.maxParallelTeammatesPerTeam,
      fallback.maxParallelTeammatesPerTeam,
    ),
    maxConcurrentOrchestrations: normalizePositiveInt(
      limits.maxConcurrentOrchestrations,
      fallback.maxConcurrentOrchestrations,
      16,
    ),
    capacityWaitMs: normalizePositiveInt(limits.capacityWaitMs, fallback.capacityWaitMs, 3_600_000),
    capacityPollMs: normalizePositiveInt(limits.capacityPollMs, fallback.capacityPollMs, 60_000),
  };
}

function ensureRuntimeStateShape(runtime: AgentRuntimeState): AgentRuntimeState {
  if (!runtime.subagents) {
    runtime.subagents = { activeRunRequests: 0, activeAgents: 0 };
  }
  if (!runtime.teams) {
    runtime.teams = { activeTeamRuns: 0, activeTeammates: 0 };
  }
  if (!runtime.queue) {
    runtime.queue = {
      activeOrchestrations: 0,
      pending: [],
      consecutiveDispatchesByTenant: 0,
      evictedEntries: 0,
    };
  }
  if (!Array.isArray(runtime.queue.pending)) {
    runtime.queue.pending = [];
  }
  if (!Number.isFinite(runtime.queue.consecutiveDispatchesByTenant)) {
    runtime.queue.consecutiveDispatchesByTenant = 0;
  }
  if (!Number.isFinite(runtime.queue.evictedEntries)) {
    runtime.queue.evictedEntries = 0;
  }
  if (!runtime.reservations) {
    runtime.reservations = { active: [] };
  }
  if (!Array.isArray(runtime.reservations.active)) {
    runtime.reservations.active = [];
  }
  runtime.limits = sanitizeRuntimeLimits(runtime.limits);
  if (typeof runtime.limitsVersion !== "string" || runtime.limitsVersion.length === 0) {
    runtime.limitsVersion = serializeRuntimeLimits(runtime.limits);
  }
  return runtime;
}

function isStrictRuntimeLimitMode(): boolean {
  return process.env[STRICT_LIMITS_ENV] !== "0";
}

function enforceRuntimeLimitConsistency(runtime: AgentRuntimeState): void {
  // Detect runtime/env drift early so limits cannot silently diverge between components.
  const runtimeLimits = sanitizeRuntimeLimits(runtime.limits);
  const envLimits = sanitizeRuntimeLimits(createRuntimeLimits());
  const runtimeVersion = serializeRuntimeLimits(runtimeLimits);
  const envVersion = serializeRuntimeLimits(envLimits);

  if (runtimeVersion === envVersion) {
    runtime.limits = runtimeLimits;
    runtime.limitsVersion = runtimeVersion;
    return;
  }

  // Silently update to env limits - drift is expected when:
  // 1. Coordinator-based dynamic limits change
  // 2. Env vars change at runtime
  // Strict mode check removed as it caused false positives with dynamic coordinator limits
  runtime.limits = envLimits;
  runtime.limitsVersion = envVersion;
  notifyRuntimeCapacityChanged();
}

/**
 * 共有ランタイム状態取得
 * @summary 共有状態を取得
 * @returns エージェントランタイムの現在の状態
 */
export function getSharedRuntimeState(): AgentRuntimeState {
  return runtimeStateProvider.getState();
}

function cleanupExpiredReservations(runtime: AgentRuntimeState, nowMs = runtimeNow()): number {
  const before = runtime.reservations.active.length;
  runtime.reservations.active = runtime.reservations.active.filter(
    (reservation) => reservation.expiresAtMs > nowMs,
  );
  const expired = Math.max(0, before - runtime.reservations.active.length);
  if (expired > 0) {
    notifyRuntimeCapacityChanged();
  }
  return expired;
}

function updateReservationHeartbeat(
  runtime: AgentRuntimeState,
  reservationId: string,
  ttlMs?: number,
): number | undefined {
  cleanupExpiredReservations(runtime);
  const reservation = runtime.reservations.active.find((item) => item.id === reservationId);
  if (!reservation) return undefined;
  const nowMs = runtimeNow();
  const normalizedTtlMs = normalizeReservationTtlMs(ttlMs);
  reservation.heartbeatAtMs = nowMs;
  reservation.expiresAtMs = nowMs + normalizedTtlMs;
  return reservation.expiresAtMs;
}

function releaseReservation(runtime: AgentRuntimeState, reservationId: string): boolean {
  const index = runtime.reservations.active.findIndex((item) => item.id === reservationId);
  if (index < 0) return false;
  runtime.reservations.active.splice(index, 1);
  notifyRuntimeCapacityChanged();
  return true;
}

function consumeReservation(runtime: AgentRuntimeState, reservationId: string): boolean {
  const reservation = runtime.reservations.active.find((item) => item.id === reservationId);
  if (!reservation) return false;
  if (reservation.consumedAtMs) return true;
  reservation.consumedAtMs = runtimeNow();
  notifyRuntimeCapacityChanged();
  return true;
}

/**
 * ランタイムスナップショット取得
 * @summary スナップショットを取得
 * @returns エージェントランタイムのスナップショット
 */
export function getRuntimeSnapshot(): AgentRuntimeSnapshot {
  const runtime = getSharedRuntimeState();
  cleanupExpiredReservations(runtime);

  const subagentActiveRequests = Math.max(0, runtime.subagents.activeRunRequests);
  const subagentActiveAgents = Math.max(0, runtime.subagents.activeAgents);
  const teamActiveRuns = Math.max(0, runtime.teams.activeTeamRuns);
  const teamActiveAgents = Math.max(0, runtime.teams.activeTeammates);
  const localUsage = getLocalRuntimeUsage(runtime);
  const clusterUsage = getClusterUsageSafe(localUsage);

  const reservations = runtime.reservations.active;
  let reservedRequests = 0;
  let reservedLlm = 0;
  let activeReservations = 0;
  for (const reservation of reservations) {
    if (reservation.consumedAtMs) continue;
    activeReservations += 1;
    reservedRequests += Math.max(0, reservation.additionalRequests);
    reservedLlm += Math.max(0, reservation.additionalLlm);
  }

  const activeOrchestrations = Math.max(0, runtime.queue.activeOrchestrations);
  const queuedOrchestrations = Math.max(0, runtime.queue.pending.length);

  // Include priority in queued tools display
  const queuedTools = runtime.queue.pending.slice(0, 16).map(
    (entry) => `${entry.toolName}:${entry.priority ?? "normal"}`
  );

  // Calculate priority stats
  const priorityStats = { critical: 0, high: 0, normal: 0, low: 0, background: 0 };
  for (const entry of runtime.queue.pending) {
    priorityStats[entry.priority ?? "normal"]++;
  }

  return {
    subagentActiveRequests,
    subagentActiveAgents,
    teamActiveRuns,
    teamActiveAgents,
    reservedRequests,
    reservedLlm,
    activeReservations,
    activeOrchestrations,
    queuedOrchestrations,
    queuedTools,
    queueEvictions: Math.max(0, Math.trunc(runtime.queue.evictedEntries || 0)),
    totalActiveRequests: clusterUsage.totalActiveRequests,
    totalActiveLlm: clusterUsage.totalActiveLlm,
    limitsVersion: runtime.limitsVersion,
    priorityStats,
    limits: {
      maxTotalActiveLlm: runtime.limits.maxTotalActiveLlm,
      maxTotalActiveRequests: runtime.limits.maxTotalActiveRequests,
      maxParallelSubagentsPerRun: runtime.limits.maxParallelSubagentsPerRun,
      maxParallelTeamsPerRun: runtime.limits.maxParallelTeamsPerRun,
      maxParallelTeammatesPerTeam: runtime.limits.maxParallelTeammatesPerTeam,
      maxConcurrentOrchestrations: runtime.limits.maxConcurrentOrchestrations,
      capacityWaitMs: runtime.limits.capacityWaitMs,
      capacityPollMs: runtime.limits.capacityPollMs,
    },
  };
}

/**
 * ステータス行を生成
 * @summary ステータス行を生成
 * @param options オプション設定
 * @returns フォーマット済みのステータス文字列
 */
export function formatRuntimeStatusLine(options: RuntimeStatusLineOptions = {}): string {
  const snapshot = getRuntimeSnapshot();
  const lines: string[] = [];
  lines.push(options.title || "Subagent / Agent Team runtime");
  lines.push(`- 実行中LLM合計: ${snapshot.totalActiveLlm}`);
  lines.push(`  - Subagents: ${snapshot.subagentActiveAgents}`);
  lines.push(`  - Agent team members: ${snapshot.teamActiveAgents}`);
  lines.push(`- 実行中request合計: ${snapshot.totalActiveRequests}`);
  lines.push(`  - Subagent requests: ${snapshot.subagentActiveRequests}`);
  lines.push(`  - Agent team runs: ${snapshot.teamActiveRuns}`);
  lines.push(
    `- 予約中キャパシティ: requests=${snapshot.reservedRequests}, llm=${snapshot.reservedLlm}, reservations=${snapshot.activeReservations}`,
  );
  lines.push(
    `- 実行上限: requests=${snapshot.limits.maxTotalActiveRequests}, llm=${snapshot.limits.maxTotalActiveLlm}, subagent_parallel=${snapshot.limits.maxParallelSubagentsPerRun}, team_parallel=${snapshot.limits.maxParallelTeamsPerRun}, teammates_parallel=${snapshot.limits.maxParallelTeammatesPerTeam}, orchestration_parallel=${snapshot.limits.maxConcurrentOrchestrations}`,
  );
  lines.push(
    `- オーケストレーションキュー: active=${snapshot.activeOrchestrations}/${snapshot.limits.maxConcurrentOrchestrations}, queued=${snapshot.queuedOrchestrations}`,
  );
  lines.push(`  - queue_evictions_total: ${snapshot.queueEvictions}`);
  if (snapshot.queuedTools.length > 0) {
    lines.push(`  - queued_tools: ${snapshot.queuedTools.join(", ")}`);
  }
  // Priority statistics
  if (snapshot.priorityStats) {
    const ps = snapshot.priorityStats;
    lines.push(
      `  - priority_breakdown: critical=${ps.critical}, high=${ps.high}, normal=${ps.normal}, low=${ps.low}, background=${ps.background}`
    );
  }
  if (typeof options.adaptivePenalty === "number" && typeof options.adaptivePenaltyMax === "number") {
    const adaptivePenalty = Math.max(0, Math.trunc(options.adaptivePenalty));
    const adaptivePenaltyMax = Math.max(0, Math.trunc(options.adaptivePenaltyMax));
    lines.push(`- 自動並列抑制: penalty=${adaptivePenalty}/${adaptivePenaltyMax}`);
  }
  lines.push(`- 待機設定: max_wait_ms=${snapshot.limits.capacityWaitMs}, poll_ms=${snapshot.limits.capacityPollMs}`);
  lines.push(`- limits_version: ${snapshot.limitsVersion}`);
  if (typeof options.storedRuns === "number") {
    lines.push(`- 保存済み実行履歴: ${Math.max(0, Math.trunc(options.storedRuns))}`);
  }
  return lines.join("\n");
}

function sanitizePlannedCount(value: unknown): number {
  return Math.max(0, Math.trunc(Number(value) || 0));
}

function createRuntimeQueueEntryId(): string {
  runtimeQueueSequence += 1;
  return `queue-${process.pid}-${RUNTIME_INSTANCE_TOKEN}-${runtimeNow()}-${runtimeQueueSequence}`;
}

function clampPlannedCount(value: number): number {
  return Math.max(0, Math.trunc(Number(value) || 0));
}

function getMaxPendingQueueEntries(): number {
  return resolveLimitFromEnv(
    "PI_AGENT_MAX_PENDING_QUEUE_ENTRIES",
    DEFAULT_MAX_PENDING_QUEUE_ENTRIES,
    100_000,
  );
}

function getQueueClassRank(queueClass: RuntimeQueueClass): number {
  if (queueClass === "interactive") return 3;
  if (queueClass === "standard") return 2;
  return 1; // batch
}

function getPriorityRank(priority: TaskPriority | undefined): number {
  if (priority === "critical") return 5;
  if (priority === "high") return 4;
  if (priority === "normal") return 3;
  if (priority === "low") return 2;
  return 1; // background / undefined
}

/**
 * Keep pending queue bounded to avoid unbounded memory growth.
 * Eviction policy:
 * 1) lower queue class first (batch < standard < interactive)
 * 2) lower priority first (background < ... < critical)
 * 3) older entries first (LRU-like by enqueue timestamp)
 */
function trimPendingQueueToLimit(runtime: AgentRuntimeState): RuntimeQueueEntry | null {
  const maxPendingEntries = getMaxPendingQueueEntries();
  if (runtime.queue.pending.length < maxPendingEntries) {
    return null;
  }

  let evictionIndex = -1;
  let minClassRank = Number.POSITIVE_INFINITY;
  let minPriorityRank = Number.POSITIVE_INFINITY;
  let oldestEnqueuedAt = Number.POSITIVE_INFINITY;

  for (let i = 0; i < runtime.queue.pending.length; i += 1) {
    const entry = runtime.queue.pending[i];
    const classRank = getQueueClassRank(entry.queueClass ?? "standard");
    const priorityRank = getPriorityRank(entry.priority);
    const enqueuedAt = entry.enqueuedAtMs;
    const betterCandidate =
      classRank < minClassRank ||
      (classRank === minClassRank && priorityRank < minPriorityRank) ||
      (classRank === minClassRank && priorityRank === minPriorityRank && enqueuedAt < oldestEnqueuedAt);

    if (betterCandidate) {
      evictionIndex = i;
      minClassRank = classRank;
      minPriorityRank = priorityRank;
      oldestEnqueuedAt = enqueuedAt;
    }
  }

  if (evictionIndex < 0) return null;
  const [evicted] = runtime.queue.pending.splice(evictionIndex, 1);
  runtime.queue.evictedEntries += 1;
  if (evicted) {
    logRuntimeQueueDebug(
      `evicted id=${evicted.id} tool=${evicted.toolName} class=${evicted.queueClass} priority=${evicted.priority ?? "normal"} pending=${runtime.queue.pending.length} evictions_total=${runtime.queue.evictedEntries} limit=${maxPendingEntries}`,
    );
  }
  updatePriorityStats(runtime);
  notifyRuntimeCapacityChanged();
  return evicted ?? null;
}

function toQueueClass(input: RuntimeDispatchPermitInput): RuntimeQueueClass {
  if (input.queueClass) return input.queueClass;
  if (input.source === "user-interactive" || input.toolName === "question") return "interactive";
  if (input.source === "background") return "batch";
  return "standard";
}

function createRuntimeReservationId(): string {
  runtimeReservationSequence += 1;
  return `reservation-${process.pid}-${RUNTIME_INSTANCE_TOKEN}-${runtimeNow()}-${runtimeReservationSequence}`;
}

function removeQueuedEntry(runtime: AgentRuntimeState, entryId: string): number {
  const index = runtime.queue.pending.findIndex((entry) => entry.id === entryId);
  if (index >= 0) {
    runtime.queue.pending.splice(index, 1);
    updatePriorityStats(runtime);
    notifyRuntimeCapacityChanged();
  }
  return index;
}

/**
 * Sort queue entries by priority (higher priority first).
 */
function sortQueueByPriority(runtime: AgentRuntimeState): void {
  const queueClassOrder: Record<RuntimeQueueClass, number> = {
    interactive: 0,
    standard: 1,
    batch: 2,
  };
  runtime.queue.pending.sort((a, b) => {
    const aClass = (a as RuntimeQueueEntry & { queueClass?: RuntimeQueueClass }).queueClass ?? "standard";
    const bClass = (b as RuntimeQueueEntry & { queueClass?: RuntimeQueueClass }).queueClass ?? "standard";
    const classDiff = queueClassOrder[aClass] - queueClassOrder[bClass];
    if (classDiff !== 0) {
      return classDiff;
    }
    // Convert to PriorityQueueEntry format for comparison
    const entryA: PriorityQueueEntry = {
      ...a,
      virtualStartTime: 0,
      virtualFinishTime: 0,
      skipCount: (a as RuntimeQueueEntry & { skipCount?: number }).skipCount ?? 0,
    };
    const entryB: PriorityQueueEntry = {
      ...b,
      virtualStartTime: 0,
      virtualFinishTime: 0,
      skipCount: (b as RuntimeQueueEntry & { skipCount?: number }).skipCount ?? 0,
    };
    return comparePriority(entryA, entryB);
  });
}

/**
 * Update priority statistics for monitoring.
 */
function updatePriorityStats(runtime: AgentRuntimeState): void {
  const stats = { critical: 0, high: 0, normal: 0, low: 0, background: 0 };
  for (const entry of runtime.queue.pending) {
    stats[entry.priority ?? "normal"]++;
  }
  runtime.queue.priorityStats = stats;
}

/**
 * Promote entries that have been waiting too long (starvation prevention).
 */
function promoteStarvingEntries(runtime: AgentRuntimeState, nowMs: number): void {
  const STARVATION_THRESHOLD_MS = 60_000; // 1 minute
  const QUEUE_CLASS_PROMOTE_MS = 20_000;
  const queueClassOrder: RuntimeQueueClass[] = ["batch", "standard", "interactive"];
  const priorityOrder: TaskPriority[] = ["background", "low", "normal", "high", "critical"];
  let promoted = false;

  for (const entry of runtime.queue.pending) {
    const waitMs = nowMs - entry.enqueuedAtMs;
    const currentClass = ((entry as RuntimeQueueEntry & { queueClass?: RuntimeQueueClass }).queueClass ?? "standard");
    if (waitMs > QUEUE_CLASS_PROMOTE_MS) {
      const classIndex = queueClassOrder.indexOf(currentClass);
      if (classIndex >= 0 && classIndex < queueClassOrder.length - 1) {
        (entry as RuntimeQueueEntry & { queueClass?: RuntimeQueueClass }).queueClass = queueClassOrder[classIndex + 1];
        promoted = true;
      }
    }
    if (waitMs > STARVATION_THRESHOLD_MS) {
      const currentIndex = priorityOrder.indexOf(entry.priority ?? "normal");
      if (currentIndex < priorityOrder.length - 1) {
        entry.priority = priorityOrder[currentIndex + 1];
        (entry as RuntimeQueueEntry & { skipCount?: number }).skipCount = 0;
        promoted = true;
      }
    }
  }

  if (promoted) {
    sortQueueByPriority(runtime);
    updatePriorityStats(runtime);
  }
}

function createCapacityCheck(snapshot: AgentRuntimeSnapshot, input: RuntimeCapacityCheckInput): RuntimeCapacityCheck {
  const requestedAdditionalRequests = sanitizePlannedCount(input.additionalRequests);
  const requestedAdditionalLlm = sanitizePlannedCount(input.additionalLlm);
  const projectedRequests =
    snapshot.totalActiveRequests + snapshot.reservedRequests + requestedAdditionalRequests;
  const projectedLlm = snapshot.totalActiveLlm + snapshot.reservedLlm + requestedAdditionalLlm;
  const reasons: string[] = [];

  if (projectedRequests > snapshot.limits.maxTotalActiveRequests) {
    reasons.push(
      `request上限超過: projected=${projectedRequests}, limit=${snapshot.limits.maxTotalActiveRequests}`,
    );
  }

  if (projectedLlm > snapshot.limits.maxTotalActiveLlm) {
    reasons.push(`LLM上限超過: projected=${projectedLlm}, limit=${snapshot.limits.maxTotalActiveLlm}`);
  }

  return {
    allowed: reasons.length === 0,
    reasons,
    projectedRequests,
    projectedLlm,
    snapshot,
  };
}

 /**
  * ランタイムの容量チェックを行う
  * @param input チェック対象の入力データ
  * @returns 容量チェックの結果
  */
export function checkRuntimeCapacity(input: RuntimeCapacityCheckInput): RuntimeCapacityCheck {
  const snapshot = getRuntimeSnapshot();
  return createCapacityCheck(snapshot, input);
}

function findDispatchableQueueEntry(
  runtime: AgentRuntimeState,
): RuntimeQueueEntry | undefined {
  const MAX_CONSECUTIVE_SAME_TENANT = 2;
  const hasAlternativeTenant = runtime.queue.pending.some((entry) => {
    const tenant = ((entry as RuntimeQueueEntry & { tenantKey?: string }).tenantKey ?? "default");
    return tenant !== runtime.queue.lastDispatchedTenantKey;
  });

  for (const entry of runtime.queue.pending) {
    const additionalRequests = clampPlannedCount(
      (entry as RuntimeQueueEntry & { additionalRequests?: number }).additionalRequests ?? 0,
    );
    const additionalLlm = clampPlannedCount(
      (entry as RuntimeQueueEntry & { additionalLlm?: number }).additionalLlm ?? 0,
    );
    const check = checkRuntimeCapacity({ additionalRequests, additionalLlm });
    if (!check.allowed) continue;

    const tenant = ((entry as RuntimeQueueEntry & { tenantKey?: string }).tenantKey ?? "default");
    const shouldThrottleTenant =
      hasAlternativeTenant &&
      runtime.queue.lastDispatchedTenantKey === tenant &&
      runtime.queue.consecutiveDispatchesByTenant >= MAX_CONSECUTIVE_SAME_TENANT;
    if (shouldThrottleTenant) {
      continue;
    }

    return entry;
  }

  return undefined;
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  if (!signal) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  if (signal.aborted) {
    return Promise.reject(new Error("capacity wait aborted"));
  }
/**
 * /**
 * * ランタイムの容量を非同期で予約する
 * *
 * * 指定された入力パラメータに基づいてランタイム容量を予約します。
 * * 容量が利用可能になるまで最大待機時間までポーリングで待機します。
 * *
 * * @param
 */

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", onAbort);
      reject(new Error("capacity wait aborted"));
    };

    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function computeBackoffDelay(pollIntervalMs: number, attempts: number, remainingMs: number): number {
  const safeAttempts = Math.max(1, attempts);
  const exponent = Math.max(0, Math.min(6, safeAttempts - 1));
  const rawDelay = Math.min(
    pollIntervalMs * BACKOFF_MAX_FACTOR,
    Math.trunc(pollIntervalMs * (2 ** exponent)),
  );
  const jitterRange = Math.max(1, Math.trunc(rawDelay * BACKOFF_JITTER_RATIO));
  const jitter = Math.trunc((Math.random() * (jitterRange * 2 + 1)) - jitterRange);
  const jittered = Math.max(1, rawDelay + jitter);
  return Math.max(1, Math.min(jittered, remainingMs));
}

function createReservationLease(
  reservation: RuntimeCapacityReservationRecord,
): RuntimeCapacityReservationLease {
  const runtime = getSharedRuntimeState();
  let released = false;
  let expiresAtMs = reservation.expiresAtMs;

  return {
    id: reservation.id,
    toolName: reservation.toolName,
    additionalRequests: reservation.additionalRequests,
    additionalLlm: reservation.additionalLlm,
    get expiresAtMs() {
      return expiresAtMs;
    },
    consume: () => {
      if (released) return;
      consumeReservation(runtime, reservation.id);
    },
    heartbeat: (ttlMs?: number) => {
      if (released) return;
      const updated = updateReservationHeartbeat(runtime, reservation.id, ttlMs);
      if (typeof updated === "number") {
        expiresAtMs = updated;
      }
    },
    release: () => {
      if (released) return;
      released = true;
      releaseReservation(runtime, reservation.id);
    },
  };
}

/**
 * 容量予約を試行
 * @summary 容量予約を試行
 * @param input - 予約入力情報
 * @returns 容量チェック結果と予約リース（許可された場合）
 */
export function tryReserveRuntimeCapacity(
  input: RuntimeCapacityReserveInput,
): RuntimeCapacityCheck & { reservation?: RuntimeCapacityReservationLease } {
  const runtime = getSharedRuntimeState();
  cleanupExpiredReservations(runtime);
  const snapshot = getRuntimeSnapshot();
  const check = createCapacityCheck(snapshot, input);
  if (!check.allowed) {
    return check;
  }

  const nowMs = runtimeNow();
  const reservation: RuntimeCapacityReservationRecord = {
    id: createRuntimeReservationId(),
    toolName: String(input.toolName || "unknown"),
    additionalRequests: sanitizePlannedCount(input.additionalRequests),
    additionalLlm: sanitizePlannedCount(input.additionalLlm),
    createdAtMs: nowMs,
    heartbeatAtMs: nowMs,
    expiresAtMs: nowMs + normalizeReservationTtlMs(input.reservationTtlMs),
  };
  runtime.reservations.active.push(reservation);
  notifyRuntimeCapacityChanged();

  return {
    ...check,
    reservation: createReservationLease(reservation),
  };
}

/**
 * ランタイム容量を予約する
 * @summary 容量予約を実行
 * @param input 予約入力データ
 * @returns 予約結果を含むPromise
 */
export async function reserveRuntimeCapacity(
  input: RuntimeCapacityReserveInput,
): Promise<RuntimeCapacityReserveResult> {
  const snapshot = getRuntimeSnapshot();
  const maxWaitMs = normalizePositiveInt(input.maxWaitMs, snapshot.limits.capacityWaitMs, 3_600_000);
  const pollIntervalMs = normalizePositiveInt(
    input.pollIntervalMs,
    snapshot.limits.capacityPollMs,
    60_000,
  );
  const startedAt = runtimeNow();
  let attempts = 0;
  let latestCheck: RuntimeCapacityCheck & { reservation?: RuntimeCapacityReservationLease } =
    checkRuntimeCapacity(input);

  while (true) {
    attempts += 1;
    const waitElapsedMs = runtimeNow() - startedAt;
    if (input.signal?.aborted) {
      return {
        ...latestCheck,
        waitedMs: waitElapsedMs,
        attempts,
        timedOut: false,
        aborted: true,
      };
    }

    const attempted = tryReserveRuntimeCapacity(input);
    latestCheck = attempted;
    if (attempted.allowed && attempted.reservation) {
      return {
        ...attempted,
        waitedMs: runtimeNow() - startedAt,
        attempts,
        timedOut: false,
        aborted: false,
        reservation: attempted.reservation,
      };
    }

    const waitedMs = runtimeNow() - startedAt;
    if (waitedMs >= maxWaitMs) {
      return {
        ...attempted,
        waitedMs,
        attempts,
        timedOut: true,
        aborted: false,
      };
    }

    const remainingMs = Math.max(1, maxWaitMs - waitedMs);
    const backoffDelayMs = computeBackoffDelay(pollIntervalMs, attempts, remainingMs);
    const eventWaitMs = Math.max(1, Math.min(backoffDelayMs, pollIntervalMs));
    try {
      const eventResult = await waitForRuntimeCapacityEvent(eventWaitMs, input.signal);
      if (eventResult === "aborted") {
        return {
          ...attempted,
          waitedMs: runtimeNow() - startedAt,
          attempts,
          timedOut: false,
          aborted: true,
        };
      }
      if (eventResult === "event") {
        continue;
      }
/**
 * /**
 * * ランタイムの容量が利用可能になるまで待機する
 * *
 * * スケジューラベースの待機（USE_SCHEDULER有効時）または
 * * 従来のポーリング方式で容量確保を待機する。
 * * 最大待機時間を超えた場合はタイムアウトとして結果を返す。
 * *
 * * @param input - 待機条件（maxWaitMs等）を指定する入力オブジェクト
 * * @returns 待機結果（成功/タイムアウト、待機時間、試行回数等を含む）
 * * @example
 * * // 最大5秒間ランタイム容量を待機
 * * const result = await waitForRuntimeCapacity({ maxWaitMs: 5000 });
 * * if (!result.timedOut)
 */

      const remainingDelayMs = Math.max(0, backoffDelayMs - eventWaitMs);
      if (remainingDelayMs > 0) {
        await wait(remainingDelayMs, input.signal);
      }
    } catch {
      return {
        ...attempted,
        waitedMs: runtimeNow() - startedAt,
        attempts,
        timedOut: false,
        aborted: true,
      };
    }
  }
}

/**
 * Scheduler-based capacity wait (optional path).
 * Uses the new task scheduler for rate-limited execution.
 * Integrates with the actual runtime capacity check mechanism.
 */
async function schedulerBasedWait(
  input: RuntimeCapacityWaitInput,
): Promise<RuntimeCapacityWaitResult> {
  const snapshot = getRuntimeSnapshot();
  const maxWaitMs = normalizePositiveInt(input.maxWaitMs, snapshot.limits.capacityWaitMs, 3_600_000);
  const startedAt = runtimeNow();
  let attempts = 0;

  try {
    // Create a scheduled task that performs actual capacity wait
    const task: ScheduledTask<RuntimeCapacityCheck> = {
      id: createTaskId("capacity-wait"),
      source: "subagent_run", // Default source
      provider: "default",
      model: "default",
      priority: "normal",
      costEstimate: {
        estimatedTokens: 0,
        estimatedDurationMs: 1000, // Estimate 1s for capacity wait
      },
      execute: async () => {
        // Perform actual capacity check within scheduler context
/**
         * ランタイムオーケストレーションの実行順番を待機する
         *
         * 指定された条件でランタイムのオーケストレーション実行順番が来るまで待機します。
         * 最大待機時間とポーリング間隔を設定可能で、タイムアウトやキャンセルにも対応します。
         *
         * @param input - 待機設定を含む入力オブジェクト
         * @returns 待機結果を含むPromise
         * @example
         * const result = await waitForRuntimeOrchestrationTurn({
         *   maxWaitMs: 60000,
         *   pollIntervalMs: 5000,
         *   signal: abortController.signal,
         * });
         */
        // This respects both scheduler rate limits and runtime capacity
        let check = checkRuntimeCapacity(input);
        attempts++;

        // If not allowed, wait with backoff until capacity is available
        while (!check.allowed) {
          const elapsedMs = runtimeNow() - startedAt;
          if (elapsedMs >= maxWaitMs) {
            break; // Will return timedOut result
          }

          const remainingMs = maxWaitMs - elapsedMs;
          const waitMs = Math.min(100, remainingMs); // Poll every 100ms
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, waitMs);
            input.signal?.addEventListener("abort", () => {
              clearTimeout(timer);
              resolve();
            }, { once: true });
          });

          if (input.signal?.aborted) {
            break;
          }

          check = checkRuntimeCapacity(input);
          attempts++;
        }

        return check;
      },
      signal: input.signal,
      deadlineMs: startedAt + maxWaitMs,
    };

    const scheduler = getScheduler();
    const result = await scheduler.submit(task);

    // Use the capacity check result from execute(), or fallback
    const check = result.result ?? checkRuntimeCapacity(input);

    return {
      ...check,
      waitedMs: result.waitedMs,
      attempts,
      timedOut: result.timedOut || (runtimeNow() - startedAt >= maxWaitMs && !check.allowed),
    };
  } catch (error) {
    // Fallback to existing logic on scheduler error (graceful degradation)
    const check = checkRuntimeCapacity(input);
    return {
      ...check,
      waitedMs: runtimeNow() - startedAt,
      attempts: Math.max(1, attempts),
      timedOut: false,
    };
  }
}

 /**
  * ランタイム容量が利用可能になるまで待機する
  * @param input 待機条件を含む入力オブジェクト
  * @returns 待機結果の詳細を含むオブジェクト
  */
export async function waitForRuntimeCapacity(
  input: RuntimeCapacityWaitInput,
): Promise<RuntimeCapacityWaitResult> {
  // Scheduler-based path (optional, disabled by default for backward compatibility)
  if (USE_SCHEDULER) {
    return schedulerBasedWait(input);
  }

  // Existing logic (unchanged)
  const snapshot = getRuntimeSnapshot();
  const maxWaitMs = normalizePositiveInt(input.maxWaitMs, snapshot.limits.capacityWaitMs, 3_600_000);
  const pollIntervalMs = normalizePositiveInt(
    input.pollIntervalMs,
    snapshot.limits.capacityPollMs,
    60_000,
  );
  const startedAt = runtimeNow();
  let attempts = 0;

  while (true) {
    attempts += 1;
    const check = checkRuntimeCapacity(input);
    const waitedMs = runtimeNow() - startedAt;

    if (check.allowed) {
      return {
        ...check,
        waitedMs,
        attempts,
        timedOut: false,
      };
    }

    if (waitedMs >= maxWaitMs) {
      return {
        ...check,
        waitedMs,
        attempts,
        timedOut: true,
      };
    }

    const remainingMs = Math.max(1, maxWaitMs - waitedMs);
    const backoffDelayMs = computeBackoffDelay(pollIntervalMs, attempts, remainingMs);
    const eventWaitMs = Math.max(1, Math.min(backoffDelayMs, pollIntervalMs));
    const eventResult = await waitForRuntimeCapacityEvent(eventWaitMs, input.signal);
    if (eventResult === "aborted") {
      throw new Error("capacity wait aborted");
    }
    if (eventResult === "event") {
      continue;
    }
    const remainingDelayMs = Math.max(0, backoffDelayMs - eventWaitMs);
    if (remainingDelayMs > 0) {
      await wait(remainingDelayMs, input.signal);
    }
  }
}

 /**
  * ランタイムのオーケストレーション実行を待機する
  * @param input 待機設定を含む入力オブジェクト
  * @returns オーケストレーション実行結果
  */
export async function waitForRuntimeOrchestrationTurn(
  input: RuntimeOrchestrationWaitInput,
): Promise<RuntimeOrchestrationWaitResult> {
  const snapshot = getRuntimeSnapshot();
  const maxWaitMs = normalizePositiveInt(input.maxWaitMs, snapshot.limits.capacityWaitMs, 3_600_000);
  const pollIntervalMs = normalizePositiveInt(
    input.pollIntervalMs,
    snapshot.limits.capacityPollMs,
    60_000,
  );
  const runtime = getSharedRuntimeState();
  const entryId = createRuntimeQueueEntryId();
  const enqueuedAtMs = runtimeNow();

  // Infer or use provided priority
  const priority = input.priority ?? inferPriority(input.toolName, {
    isInteractive: input.source === "user-interactive",
    isBackground: input.source === "background",
    isRetry: input.source === "retry",
  });

  // Create queue entry with priority metadata
  const entry: RuntimeQueueEntry = {
    id: entryId,
    toolName: String(input.toolName || "unknown"),
    priority,
    enqueuedAtMs,
    estimatedDurationMs: input.estimatedDurationMs,
    estimatedRounds: input.estimatedRounds,
    deadlineMs: input.deadlineMs,
    source: input.source,
    queueClass: input.source === "user-interactive" ? "interactive" : input.source === "background" ? "batch" : "standard",
    tenantKey: "legacy",
    additionalRequests: 0,
    additionalLlm: 0,
    skipCount: 0,
  };

  trimPendingQueueToLimit(runtime);
  runtime.queue.pending.push(entry);

  // Sort by priority (higher priority first)
  sortQueueByPriority(runtime);
  updatePriorityStats(runtime);
  notifyRuntimeCapacityChanged();
/**
 * ランタイムの一時的な状態をリセットする
 *
 * アクティブなサブエージェント数、チーム実行数、キューデータ、
 * 予約情報などの実行時一時状態を初期値にリセットします。
 *
 * @returns 戻り値なし
 * @example
 * // 実行時状態をクリアする
 * resetRuntimeTransientState();
 */

  const queuedAhead = Math.max(0, runtime.queue.pending.findIndex((e) => e.id === entryId));
  let attempts = 0;

  while (true) {
    attempts += 1;
    const waitedMs = runtimeNow() - enqueuedAtMs;
    const index = runtime.queue.pending.findIndex((e) => e.id === entryId);

    if (index < 0) {
      return {
        allowed: false,
        waitedMs,
        attempts,
        timedOut: false,
        aborted: false,
        queuePosition: 0,
        queuedAhead,
        orchestrationId: entryId,
      };
    }

    const queuePosition = index + 1;

    // Check if this task is at the front of the priority queue
    const dispatchable = findDispatchableQueueEntry(runtime);
    const canStart =
      dispatchable?.id === entryId &&
      runtime.queue.activeOrchestrations < runtime.limits.maxConcurrentOrchestrations;

    if (canStart) {
      removeQueuedEntry(runtime, entryId);
      runtime.queue.activeOrchestrations += 1;
      runtime.queue.lastDispatchedTenantKey = "legacy";
      runtime.queue.consecutiveDispatchesByTenant += 1;
      updatePriorityStats(runtime);
      notifyRuntimeCapacityChanged();
      let released = false;
      const lease: RuntimeOrchestrationLease = {
        id: entryId,
        release: () => {
          if (released) return;
          released = true;
          runtime.queue.activeOrchestrations = Math.max(
            0,
            runtime.queue.activeOrchestrations - 1,
          );
          notifyRuntimeCapacityChanged();
        },
      };
      return {
        allowed: true,
        waitedMs,
        attempts,
        timedOut: false,
        aborted: false,
        queuePosition: 1,
        queuedAhead,
        orchestrationId: entryId,
        lease,
      };
    }

    // Starvation prevention: promote long-waiting tasks
    promoteStarvingEntries(runtime, runtimeNow());
    for (const pending of runtime.queue.pending) {
      (pending as RuntimeQueueEntry & { skipCount?: number }).skipCount =
        ((pending as RuntimeQueueEntry & { skipCount?: number }).skipCount ?? 0) + 1;
    }

    if (input.signal?.aborted) {
      removeQueuedEntry(runtime, entryId);
      return {
        allowed: false,
        waitedMs,
        attempts,
        timedOut: false,
        aborted: true,
        queuePosition,
        queuedAhead,
        orchestrationId: entryId,
      };
    }

    if (waitedMs >= maxWaitMs) {
      removeQueuedEntry(runtime, entryId);
      return {
        allowed: false,
        waitedMs,
        attempts,
        timedOut: true,
        aborted: false,
        queuePosition,
        queuedAhead,
        orchestrationId: entryId,
      };
    }

    const remainingMs = Math.max(1, maxWaitMs - waitedMs);
    try {
      const backoffDelayMs = computeBackoffDelay(pollIntervalMs, attempts, remainingMs);
      const eventWaitMs = Math.max(1, Math.min(backoffDelayMs, pollIntervalMs));
      const eventResult = await waitForRuntimeCapacityEvent(eventWaitMs, input.signal);
      if (eventResult === "aborted") {
        removeQueuedEntry(runtime, entryId);
        return {
          allowed: false,
          waitedMs: runtimeNow() - enqueuedAtMs,
          attempts,
          timedOut: false,
          aborted: true,
          queuePosition,
          queuedAhead,
          orchestrationId: entryId,
        };
      }
      if (eventResult === "event") {
        continue;
      }

      const remainingDelayMs = Math.max(0, backoffDelayMs - eventWaitMs);
      if (remainingDelayMs > 0) {
        await wait(remainingDelayMs, input.signal);
      }
    } catch {
      removeQueuedEntry(runtime, entryId);
      return {
        allowed: false,
        waitedMs: runtimeNow() - enqueuedAtMs,
        attempts,
        timedOut: false,
        aborted: true,
        queuePosition,
        queuedAhead,
        orchestrationId: entryId,
      };
    }
  }
}

/**
 * Acquire queue turn and capacity reservation atomically.
 */
export async function acquireRuntimeDispatchPermit(
  input: RuntimeDispatchPermitInput,
): Promise<RuntimeDispatchPermitResult> {
  const snapshot = getRuntimeSnapshot();
  const maxWaitMs = normalizePositiveInt(input.maxWaitMs, snapshot.limits.capacityWaitMs, 3_600_000);
  const pollIntervalMs = normalizePositiveInt(
    input.pollIntervalMs,
    snapshot.limits.capacityPollMs,
    60_000,
  );
  const additionalRequests = clampPlannedCount(input.candidate.additionalRequests);
  const additionalLlm = clampPlannedCount(input.candidate.additionalLlm);

  // Admission control: requests that can never fit should fail fast.
  if (additionalRequests > snapshot.limits.maxTotalActiveRequests) {
    return {
      allowed: false,
      waitedMs: 0,
      attempts: 1,
      timedOut: false,
      aborted: false,
      queuePosition: 0,
      queuedAhead: 0,
      orchestrationId: createRuntimeQueueEntryId(),
      projectedRequests: additionalRequests,
      projectedLlm: additionalLlm,
      reasons: [
        `request上限超過(永続): requested=${additionalRequests}, limit=${snapshot.limits.maxTotalActiveRequests}`,
      ],
    };
  }
  if (additionalLlm > snapshot.limits.maxTotalActiveLlm) {
    return {
      allowed: false,
      waitedMs: 0,
      attempts: 1,
      timedOut: false,
      aborted: false,
      queuePosition: 0,
      queuedAhead: 0,
      orchestrationId: createRuntimeQueueEntryId(),
      projectedRequests: additionalRequests,
      projectedLlm: additionalLlm,
      reasons: [
        `LLM上限超過(永続): requested=${additionalLlm}, limit=${snapshot.limits.maxTotalActiveLlm}`,
      ],
    };
  }

  const runtime = getSharedRuntimeState();
  const entryId = createRuntimeQueueEntryId();
  const enqueuedAtMs = runtimeNow();
  const priority = input.priority ?? inferPriority(input.toolName, {
    isInteractive: input.source === "user-interactive",
    isBackground: input.source === "background",
    isRetry: input.source === "retry",
  });
  const entry: RuntimeQueueEntry = {
    id: entryId,
    toolName: String(input.toolName || "unknown"),
    priority,
    enqueuedAtMs,
    estimatedDurationMs: input.estimatedDurationMs,
    estimatedRounds: input.estimatedRounds,
    deadlineMs: input.deadlineMs,
    source: input.source,
    queueClass: toQueueClass(input),
    tenantKey: String(input.tenantKey || input.toolName || "default"),
    additionalRequests,
    additionalLlm,
    skipCount: 0,
  };

  trimPendingQueueToLimit(runtime);
  runtime.queue.pending.push(entry);
  sortQueueByPriority(runtime);
  updatePriorityStats(runtime);
  notifyRuntimeCapacityChanged();

  const queuedAhead = Math.max(0, runtime.queue.pending.findIndex((e) => e.id === entryId));
  let attempts = 0;

  while (true) {
    attempts += 1;
    const waitedMs = runtimeNow() - enqueuedAtMs;
    const index = runtime.queue.pending.findIndex((e) => e.id === entryId);

    if (index < 0) {
      return {
        allowed: false,
        waitedMs,
        attempts,
        timedOut: false,
        aborted: false,
        queuePosition: 0,
        queuedAhead,
        orchestrationId: entryId,
        projectedRequests: 0,
        projectedLlm: 0,
        reasons: ["queue entry removed before dispatch"],
      };
    }

    const queuePosition = index + 1;
    const dispatchable = findDispatchableQueueEntry(runtime);
    const canStart =
      dispatchable?.id === entryId &&
      runtime.queue.activeOrchestrations < runtime.limits.maxConcurrentOrchestrations;

    if (canStart) {
      const reservationAttempt = tryReserveRuntimeCapacity({
        toolName: input.toolName,
        additionalRequests,
        additionalLlm,
        reservationTtlMs: input.reservationTtlMs,
      });
      if (reservationAttempt.allowed && reservationAttempt.reservation) {
        removeQueuedEntry(runtime, entryId);
        runtime.queue.activeOrchestrations += 1;
        const tenant = String((entry as RuntimeQueueEntry & { tenantKey?: string }).tenantKey || "default");
        if (runtime.queue.lastDispatchedTenantKey === tenant) {
          runtime.queue.consecutiveDispatchesByTenant += 1;
        } else {
          runtime.queue.lastDispatchedTenantKey = tenant;
          runtime.queue.consecutiveDispatchesByTenant = 1;
        }
        notifyRuntimeCapacityChanged();

        let released = false;
        let consumed = false;
        const lease: RuntimeDispatchPermitLease = {
          id: entryId,
          toolName: input.toolName,
          additionalRequests,
          additionalLlm,
          get expiresAtMs() {
            return reservationAttempt.reservation?.expiresAtMs ?? 0;
          },
          consume: () => {
            if (consumed) return;
            consumed = true;
            reservationAttempt.reservation?.consume();
          },
          heartbeat: (ttlMs?: number) => {
            reservationAttempt.reservation?.heartbeat(ttlMs);
          },
          release: () => {
            if (released) return;
            released = true;
            runtime.queue.activeOrchestrations = Math.max(0, runtime.queue.activeOrchestrations - 1);
            reservationAttempt.reservation?.release();
            notifyRuntimeCapacityChanged();
          },
        };

        return {
          allowed: true,
          waitedMs,
          attempts,
          timedOut: false,
          aborted: false,
          queuePosition: 1,
          queuedAhead,
          orchestrationId: entryId,
          projectedRequests: reservationAttempt.projectedRequests,
          projectedLlm: reservationAttempt.projectedLlm,
          reasons: [],
          lease,
        };
      }
    }

    promoteStarvingEntries(runtime, runtimeNow());
    for (const pending of runtime.queue.pending) {
      (pending as RuntimeQueueEntry & { skipCount?: number }).skipCount =
        ((pending as RuntimeQueueEntry & { skipCount?: number }).skipCount ?? 0) + 1;
    }

    if (input.signal?.aborted) {
      removeQueuedEntry(runtime, entryId);
      return {
        allowed: false,
        waitedMs,
        attempts,
        timedOut: false,
        aborted: true,
        queuePosition,
        queuedAhead,
        orchestrationId: entryId,
        projectedRequests: 0,
        projectedLlm: 0,
        reasons: ["dispatch aborted"],
      };
    }

    if (waitedMs >= maxWaitMs) {
      const capacityCheck = checkRuntimeCapacity({ additionalRequests, additionalLlm });
      removeQueuedEntry(runtime, entryId);
      return {
        allowed: false,
        waitedMs,
        attempts,
        timedOut: true,
        aborted: false,
        queuePosition,
        queuedAhead,
        orchestrationId: entryId,
        projectedRequests: capacityCheck.projectedRequests,
        projectedLlm: capacityCheck.projectedLlm,
        reasons: capacityCheck.reasons.length > 0 ? capacityCheck.reasons : ["dispatch timed out"],
      };
    }

    const remainingMs = Math.max(1, maxWaitMs - waitedMs);
    try {
      const backoffDelayMs = computeBackoffDelay(pollIntervalMs, attempts, remainingMs);
      const eventWaitMs = Math.max(1, Math.min(backoffDelayMs, pollIntervalMs));
      const eventResult = await waitForRuntimeCapacityEvent(eventWaitMs, input.signal);
      if (eventResult === "aborted") {
        removeQueuedEntry(runtime, entryId);
        return {
          allowed: false,
          waitedMs: runtimeNow() - enqueuedAtMs,
          attempts,
          timedOut: false,
          aborted: true,
          queuePosition,
          queuedAhead,
          orchestrationId: entryId,
          projectedRequests: 0,
          projectedLlm: 0,
          reasons: ["dispatch aborted"],
        };
      }
      if (eventResult === "event") {
        continue;
      }

      const remainingDelayMs = Math.max(0, backoffDelayMs - eventWaitMs);
      if (remainingDelayMs > 0) {
        await wait(remainingDelayMs, input.signal);
      }
    } catch {
      removeQueuedEntry(runtime, entryId);
      return {
        allowed: false,
        waitedMs: runtimeNow() - enqueuedAtMs,
        attempts,
        timedOut: false,
        aborted: true,
        queuePosition,
        queuedAhead,
        orchestrationId: entryId,
        projectedRequests: 0,
        projectedLlm: 0,
        reasons: ["dispatch aborted"],
      };
    }
  }
}

/**
 * 一時状態をリセット
 * @summary 一時状態をリセット
 * @returns {void}
 */
export function resetRuntimeTransientState(): void {
  const runtime = getSharedRuntimeState();
  runtime.subagents.activeRunRequests = 0;
  runtime.subagents.activeAgents = 0;
  runtime.teams.activeTeamRuns = 0;
  runtime.teams.activeTeammates = 0;
  runtime.queue.activeOrchestrations = 0;
  runtime.queue.pending = [];
  runtime.queue.lastDispatchedTenantKey = undefined;
  runtime.queue.consecutiveDispatchesByTenant = 0;
  runtime.reservations.active = [];
  stopRuntimeReservationSweeper();
  notifyRuntimeCapacityChanged();
}

// ============================================================================
// Model-Aware Rate Limiting
// ============================================================================

/**
 * 並列制限数を取得
 * @summary 並列制限数を取得
 * @param {string} provider プロバイダ
 * @param {string} model モデル
 * @returns {number} 制限数
 */
export function getModelAwareParallelLimit(provider: string, model: string): number {
  // Get preset limit for this model
  const tier = detectTier(provider, model);
  const presetLimit = getConcurrencyLimit(provider, model, tier);

  // Apply scheduler-aware limit (includes adaptive learning + predictive throttling)
  const schedulerLimit = getSchedulerAwareLimit(provider, model, presetLimit);

  // Apply dynamic parallelism adjuster
  const dynamicLimit = getDynamicParallelism(provider, model);

  // Take the minimum of scheduler limit and dynamic limit
  let effectiveLimit = Math.min(schedulerLimit, dynamicLimit);

  // Distribute across instances using the same model
  if (isCoordinatorInitialized()) {
    effectiveLimit = getModelParallelLimit(provider, model, effectiveLimit);
  }

  return effectiveLimit;
}

/**
 * 並列実行許可判定
 * @summary 並列実行許可判定
 * @param {string} provider プロバイダ
 * @param {string} model モデル
 * @param {number} currentActive 現在のアクティブ数
 * @returns {boolean} 許可するか
 */
export function shouldAllowParallelForModel(
  provider: string,
  model: string,
  currentActive: number
): boolean {
  const limit = getModelAwareParallelLimit(provider, model);
  return currentActive < limit;
}

/**
 * 制限サマリを取得
 * @summary 制限サマリを取得
 * @param {string} [provider] プロバイダ
 * @param {string} [model] モデル
 * @returns {string} サマリ文字列
 */
export function getLimitsSummary(provider?: string, model?: string): string {
  const lines: string[] = [];
  const snapshot = getRuntimeSnapshot();

  lines.push("Runtime Limits:");
  lines.push(`  maxTotalActiveLlm: ${snapshot.limits.maxTotalActiveLlm}`);
  lines.push(`  maxParallelSubagentsPerRun: ${snapshot.limits.maxParallelSubagentsPerRun}`);
  lines.push(`  maxParallelTeamsPerRun: ${snapshot.limits.maxParallelTeamsPerRun}`);

  if (provider && model) {
    const modelLimit = getModelAwareParallelLimit(provider, model);
    const instances = isCoordinatorInitialized() ? getActiveInstancesForModel(provider, model) : 1;
    const dynamicLimit = getDynamicParallelism(provider, model);
    lines.push("");
    lines.push(`Model-Specific (${provider}/${model}):`);
    lines.push(`  effective_limit: ${modelLimit}`);
    lines.push(`  dynamic_limit: ${dynamicLimit}`);
    lines.push(`  instances_using: ${instances}`);
  }

  lines.push("");
  lines.push("Current State:");
  lines.push(`  activeSubagentAgents: ${snapshot.subagentActiveAgents}`);
  lines.push(`  activeTeamRuns: ${snapshot.teamActiveRuns}`);
  lines.push(`  activeReservations: ${snapshot.activeReservations}`);

  // Work stealing summary
  if (isCoordinatorInitialized()) {
    const stealingSummary = getWorkStealingSummary();
    lines.push("");
    lines.push("Work Stealing:");
    lines.push(`  remote_instances: ${stealingSummary.remoteInstances}`);
    lines.push(`  total_pending_tasks: ${stealingSummary.totalPendingTasks}`);
    lines.push(`  stealable_tasks: ${stealingSummary.stealableTasks}`);
    lines.push(`  idle_instances: ${stealingSummary.idleInstances}`);
  }

  return lines.join("\n");
}

/**
 * キュー状態を配信
 * @summary キュー状態を配信
 * @returns {void}
 */
export function broadcastCurrentQueueState(): void {
  const snapshot = getRuntimeSnapshot();

  broadcastQueueState({
    pendingTaskCount: snapshot.queuedOrchestrations,
    activeOrchestrations: snapshot.activeOrchestrations,
    stealableEntries: snapshot.queuedTools.slice(0, 10).map((tool) => ({
      id: `entry-${runtimeNow()}-${Math.random().toString(36).slice(2, 8)}`,
      toolName: tool.split(":")[0],
      priority: tool.split(":")[1] ?? "normal",
      instanceId: "self",
      enqueuedAt: new Date().toISOString(),
    })),
  });
}

// ============================================================================
// Checkpoint Manager Integration
// ============================================================================

/**
 * Feature flags for advanced features.
 */
export const ENABLE_PREEMPTION = process.env.PI_ENABLE_PREEMPTION !== "false";
export const ENABLE_WORK_STEALING = process.env.PI_ENABLE_WORK_STEALING !== "false";
export const ENABLE_CHECKPOINTS = process.env.PI_ENABLE_CHECKPOINTS !== "false";
export const ENABLE_METRICS = process.env.PI_ENABLE_METRICS !== "false";

/**
 * Lazy-loaded checkpoint manager instance.
 */
let _checkpointManager: ReturnType<typeof import("../lib/checkpoint-manager").getCheckpointManager> | null = null;

/**
 * チェックポイントマネージャーのインスタンスを取得
 * @summary マネージャー取得
 * @returns {ReturnType<typeof import("../lib/checkpoint-manager").getCheckpointManager> | null} マネージャーインスタンス
 */
export function getCheckpointManagerInstance(): ReturnType<typeof import("../lib/checkpoint-manager").getCheckpointManager> | null {
  if (!ENABLE_CHECKPOINTS) return null;

  if (!_checkpointManager) {
    const { getCheckpointManager, initCheckpointManager, getCheckpointConfigFromEnv } =
      require("../lib/checkpoint-manager") as typeof import("../lib/checkpoint-manager");

    const envConfig = getCheckpointConfigFromEnv();
    initCheckpointManager(envConfig);
    _checkpointManager = getCheckpointManager();
  }

  return _checkpointManager;
}

/**
 * Lazy-loaded metrics collector instance.
 */
let _metricsCollector: ReturnType<typeof import("../lib/metrics-collector").getMetricsCollector> | null = null;

/**
 * メトリクスコレクタのインスタンスを取得
 * @summary コレクタ取得
 * @returns {ReturnType<typeof import("../lib/metrics-collector").getMetricsCollector> | null} コレクタインスタンス
 */
export function getMetricsCollectorInstance(): ReturnType<typeof import("../lib/metrics-collector").getMetricsCollector> | null {
  if (!ENABLE_METRICS) return null;

  if (!_metricsCollector) {
    const { getMetricsCollector, initMetricsCollector, getMetricsConfigFromEnv } =
      require("../lib/metrics-collector") as typeof import("../lib/metrics-collector");

    const envConfig = getMetricsConfigFromEnv();
    initMetricsCollector(envConfig);
    _metricsCollector = getMetricsCollector();
  }

  return _metricsCollector;
}

/**
 * タスク完了を記録
 * @summary タスク完了記録
 * @param task タスク情報
 * @param result 実行結果情報
 * @returns {void}
 */
export function recordTaskCompletion(
  task: { id: string; source: string; provider: string; model: string; priority: string },
  result: { waitedMs: number; executionMs: number; success: boolean }
): void {
/**
   * エージェントランタイム拡張を登録・初期化する
   *
   * ランタイム状態管理、リザベーションスイーパー、並列度調整器、
   * チェックポイントマネージャーなどのコンポーネントを初期化する。
   *
   * @param _pi - 拡張APIインターフェースのインスタンス
   * @returns なし
   * @example
   * // 拡張の登録
   * registerAgentRuntimeExtension(extensionAPI);
   */
  const collector = getMetricsCollectorInstance();
  if (collector) {
    collector.recordTaskCompletion(task, result);
  }
}

/**
 * プリエンプションイベントを記録
 * @summary プリエンプション記録
 * @param taskId タスクID
 * @param reason プリエンプション理由
 * @returns {void}
 */
export function recordPreemptionEvent(taskId: string, reason: string): void {
  const collector = getMetricsCollectorInstance();
  if (collector) {
    collector.recordPreemption(taskId, reason);
  }
}

/**
 * ワークスチールイベントを記録
 * @summary ワークスチール記録
 * @param sourceInstance 移譲元インスタンスID
 * @param taskId タスクID
 * @returns {void}
 */
export function recordWorkStealEvent(sourceInstance: string, taskId: string): void {
  const collector = getMetricsCollectorInstance();
  if (collector) {
    collector.recordWorkSteal(sourceInstance, taskId);
  }
}

/**
 * メトリクスを取得
 * @summary メトリクス取得
 * @returns 現在のスケジューラメトリクス、または null
 */
export function getSchedulerMetrics(): import("../lib/metrics-collector").SchedulerMetrics | null {
  const collector = getMetricsCollectorInstance();
  if (collector) {
    return collector.getMetrics();
  }
  return null;
}

 /**
  * チェックポイント統計を取得する。
  * @returns チェックポイント統計情報、または取得できない場合はnull。
  */
export function getCheckpointStats(): import("../lib/checkpoint-manager").CheckpointStats | null {
  const manager = getCheckpointManagerInstance();
  if (manager) {
    return manager.getStats();
  }
  return null;
}

/**
 * ワークスチーリングを試行
 * @summary ワークスチーリング試行
 * @returns 盗まれたキューのエントリ、またはnull
 */
export async function attemptWorkStealing(): Promise<import("../lib/cross-instance-coordinator").StealableQueueEntry | null> {
  if (!ENABLE_WORK_STEALING) return null;

  // Only steal if we're idle
  if (!isIdle()) return null;

  const entry = await safeStealWork();

  if (entry) {
    recordWorkStealEvent(entry.instanceId, entry.id);
  }

  return entry;
}

/**
 * ランタイム包括ステータス取得
 * @summary ステータス取得
 * @returns ランタイムスナップショット、メトリクス、チェックポイント、スチーリング統計、および機能フラグを含むオブジェクト
 */
export function getComprehensiveRuntimeStatus(): {
  runtime: AgentRuntimeSnapshot;
  metrics: import("../lib/metrics-collector").SchedulerMetrics | null;
  checkpoints: import("../lib/checkpoint-manager").CheckpointStats | null;
  stealing: import("../lib/cross-instance-coordinator").StealingStats | null;
  features: {
    preemption: boolean;
    workStealing: boolean;
    checkpoints: boolean;
    metrics: boolean;
  };
} {
  return {
    runtime: getRuntimeSnapshot(),
    metrics: getSchedulerMetrics(),
    checkpoints: getCheckpointStats(),
    stealing: isCoordinatorInitialized() ? getStealingStats() : null,
    features: {
      preemption: ENABLE_PREEMPTION,
      workStealing: ENABLE_WORK_STEALING,
      checkpoints: ENABLE_CHECKPOINTS,
      metrics: ENABLE_METRICS,
    },
  };
}

/**
 * ランタイム状態を整形
 * @summary ランタイム状態を整形
 * @returns 整形されたステータス文字列
 */
export function formatComprehensiveRuntimeStatus(): string {
  const status = getComprehensiveRuntimeStatus();
  const lines: string[] = [];

  lines.push("Runtime Status:");
  lines.push(`  Active LLM: ${status.runtime.totalActiveLlm}`);
  lines.push(`  Active Requests: ${status.runtime.totalActiveRequests}`);
  lines.push(`  Queue: active=${status.runtime.activeOrchestrations}, queued=${status.runtime.queuedOrchestrations}`);

  lines.push("");
  lines.push("Feature Flags:");
  lines.push(`  Preemption: ${status.features.preemption ? "enabled" : "disabled"}`);
  lines.push(`  Work Stealing: ${status.features.workStealing ? "enabled" : "disabled"}`);
  lines.push(`  Checkpoints: ${status.features.checkpoints ? "enabled" : "disabled"}`);
  lines.push(`  Metrics: ${status.features.metrics ? "enabled" : "disabled"}`);

  if (status.metrics) {
    lines.push("");
    lines.push("Metrics:");
    lines.push(`  Queue Depth: ${status.metrics.queueDepth}`);
    lines.push(`  Avg Wait: ${status.metrics.avgWaitMs}ms`);
    lines.push(`  P99 Wait: ${status.metrics.p99WaitMs}ms`);
    lines.push(`  Throughput: ${status.metrics.tasksCompletedPerMin}/min`);
    lines.push(`  Preemptions: ${status.metrics.preemptCount}`);
    lines.push(`  Steals: ${status.metrics.stealCount}`);
  }

  if (status.checkpoints) {
    lines.push("");
    lines.push("Checkpoints:");
    lines.push(`  Total: ${status.checkpoints.totalCount}`);
    lines.push(`  Expired: ${status.checkpoints.expiredCount}`);
    lines.push(`  Size: ${Math.round(status.checkpoints.totalSizeBytes / 1024)}KB`);
  }

  if (status.stealing) {
    lines.push("");
    lines.push("Work Stealing Stats:");
    lines.push(`  Attempts: ${status.stealing.totalAttempts}`);
    lines.push(`  Success: ${status.stealing.successfulSteals}`);
    lines.push(`  Success Rate: ${Math.round(status.stealing.successRate * 100)}%`);
  }

  return lines.join("\n");
}

 /**
  * エージェントランタイム拡張を登録する
  * @param _pi 拡張API
  * @returns なし
  */
export default function registerAgentRuntimeExtension(_pi: ExtensionAPI) {
  getSharedRuntimeState();
  ensureReservationSweeper();

  // Initialize dynamic parallelism adjuster
  getParallelismAdjuster();

  // Initialize checkpoint manager (if enabled)
  if (ENABLE_CHECKPOINTS) {
    getCheckpointManagerInstance();
  }

  // Initialize metrics collector (if enabled)
  if (ENABLE_METRICS) {
    const collector = getMetricsCollectorInstance();
    if (collector) {
      collector.startCollection();
    }
  }

  // DIP Compliance: Inject runtime snapshot provider into unified-limit-resolver
  // This allows lib layer to depend on abstraction, not concrete implementation
  setRuntimeSnapshotProvider(() => {
    const snapshot = getRuntimeSnapshot();
    return {
      totalActiveLlm: snapshot.totalActiveLlm,
      totalActiveRequests: snapshot.totalActiveRequests,
      subagentActiveCount: snapshot.subagentActiveAgents,
      teamActiveCount: snapshot.teamActiveRuns,
    };
  });
}
