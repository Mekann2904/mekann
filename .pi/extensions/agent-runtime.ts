// File: .pi/extensions/agent-runtime.ts
// Description: Shares runtime counters across subagents and agent teams.
// Why: Keeps one consistent, real-time view of active LLM workers and requests.
// Related: .pi/extensions/subagents.ts, .pi/extensions/agent-teams.ts, README.md

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

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

// Feature flag for scheduler-based capacity management
const USE_SCHEDULER = process.env.PI_USE_SCHEDULER === "true";

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

interface RuntimeQueueEntry extends PriorityTaskMetadata {
  // Inherits from PriorityTaskMetadata:
  // - id: string
  // - toolName: string
  // - priority: TaskPriority
  // - estimatedDurationMs?: number
  // - estimatedRounds?: number
  // - deadlineMs?: number
  // - enqueuedAtMs: number
  // - source?: "user-interactive" | "background" | "scheduled" | "retry"
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
 * RuntimeStateProvider - DIP準拠のための抽象インターフェース
 * グローバル状態へのアクセスを抽象化し、テスト時のモック化を可能にする
 */
export interface RuntimeStateProvider {
  getState(): AgentRuntimeState;
  resetState(): void;
}

/**
 * GlobalRuntimeStateProvider - デフォルト実装
 * globalThisを使用してプロセス全体で状態を共有する
 */
class GlobalRuntimeStateProvider implements RuntimeStateProvider {
  private readonly globalScope: GlobalScopeWithRuntime;

  constructor() {
    this.globalScope = globalThis as GlobalScopeWithRuntime;
  }

  getState(): AgentRuntimeState {
    if (!this.globalScope.__PI_SHARED_AGENT_RUNTIME_STATE__) {
      this.globalScope.__PI_SHARED_AGENT_RUNTIME_STATE__ = createInitialRuntimeState();
    }
    ensureReservationSweeper();
    const runtime = ensureRuntimeStateShape(this.globalScope.__PI_SHARED_AGENT_RUNTIME_STATE__);
    enforceRuntimeLimitConsistency(runtime);
    return runtime;
  }

  resetState(): void {
    this.globalScope.__PI_SHARED_AGENT_RUNTIME_STATE__ = undefined;
  }
}

/** プロバイダーのデフォルトインスタンス（シングルトン） */
let runtimeStateProvider: RuntimeStateProvider = new GlobalRuntimeStateProvider();

/**
 * ランタイム状態プロバイダーを設定する（テスト用）
 * 本番コードでは使用せず、テストでのモック注入のみに使用すること
 */
export function setRuntimeStateProvider(provider: RuntimeStateProvider): void {
  runtimeStateProvider = provider;
}

/**
 * 現在のランタイム状態プロバイダーを取得する（テスト用）
 */
export function getRuntimeStateProvider(): RuntimeStateProvider {
  return runtimeStateProvider;
}

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

export interface RuntimeStatusLineOptions {
  title?: string;
  storedRuns?: number;
  adaptivePenalty?: number;
  adaptivePenaltyMax?: number;
}

export interface RuntimeCapacityCheckInput {
  additionalRequests: number;
  additionalLlm: number;
}

export interface RuntimeCapacityCheck {
  allowed: boolean;
  reasons: string[];
  projectedRequests: number;
  projectedLlm: number;
  snapshot: AgentRuntimeSnapshot;
}

export interface RuntimeCapacityWaitInput extends RuntimeCapacityCheckInput {
  maxWaitMs?: number;
  pollIntervalMs?: number;
  signal?: AbortSignal;
}

export interface RuntimeCapacityWaitResult extends RuntimeCapacityCheck {
  waitedMs: number;
  attempts: number;
  timedOut: boolean;
}

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

export interface RuntimeCapacityReserveInput extends RuntimeCapacityCheckInput {
  toolName?: string;
  maxWaitMs?: number;
  pollIntervalMs?: number;
  reservationTtlMs?: number;
  signal?: AbortSignal;
}

export interface RuntimeCapacityReserveResult extends RuntimeCapacityCheck {
  waitedMs: number;
  attempts: number;
  timedOut: boolean;
  aborted: boolean;
  reservation?: RuntimeCapacityReservationLease;
}

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

export interface RuntimeOrchestrationLease {
  id: string;
  release: () => void;
}

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

const STABLE_AGENT_RUNTIME_PROFILE = process.env.STABLE_RUNTIME_PROFILE === "true";
const DEFAULT_MAX_TOTAL_ACTIVE_LLM = STABLE_AGENT_RUNTIME_PROFILE ? 4 : 8;
const DEFAULT_MAX_TOTAL_ACTIVE_REQUESTS = STABLE_AGENT_RUNTIME_PROFILE ? 2 : 6;
const DEFAULT_MAX_PARALLEL_SUBAGENTS_PER_RUN = STABLE_AGENT_RUNTIME_PROFILE ? 2 : 4;
const DEFAULT_MAX_PARALLEL_TEAMS_PER_RUN = STABLE_AGENT_RUNTIME_PROFILE ? 1 : 3;
const DEFAULT_MAX_PARALLEL_TEAMMATES_PER_TEAM = STABLE_AGENT_RUNTIME_PROFILE ? 3 : 6;
const DEFAULT_MAX_CONCURRENT_ORCHESTRATIONS = 4;
const DEFAULT_CAPACITY_WAIT_MS = STABLE_AGENT_RUNTIME_PROFILE ? 12_000 : 30_000;
const DEFAULT_CAPACITY_POLL_MS = 100;
const DEFAULT_RESERVATION_TTL_MS = STABLE_AGENT_RUNTIME_PROFILE ? 45_000 : 60_000;
const DEFAULT_RESERVATION_SWEEP_MS = 5_000;
const MIN_RESERVATION_TTL_MS = 2_000;
const MAX_RESERVATION_TTL_MS = 10 * 60 * 1_000;
const BACKOFF_MAX_FACTOR = 8;
const BACKOFF_JITTER_RATIO = 0.2;
const STRICT_LIMITS_ENV = "PI_AGENT_RUNTIME_STRICT_LIMITS";
let runtimeQueueSequence = 0;
let runtimeReservationSequence = 0;
let runtimeReservationSweeper: NodeJS.Timeout | undefined;
const runtimeCapacityEventTarget = new EventTarget();

function normalizePositiveInt(value: unknown, fallback: number, max = 64): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed <= 0) return fallback;
  return Math.max(1, Math.min(max, Math.trunc(parsed)));
}

function normalizeReservationTtlMs(value: unknown): number {
  const fallback = DEFAULT_RESERVATION_TTL_MS;
  const ttl = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(ttl) || ttl <= 0) return fallback;
  return Math.max(MIN_RESERVATION_TTL_MS, Math.min(MAX_RESERVATION_TTL_MS, Math.trunc(ttl)));
}

function resolveLimitFromEnv(envName: string, fallback: number, max = 64): number {
  const raw = process.env[envName];
  if (raw === undefined) return fallback;
  return normalizePositiveInt(raw, fallback, max);
}

export function notifyRuntimeCapacityChanged(): void {
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
  // Cross-instance coordination: if coordinator is initialized, use dynamic parallel limit
  // Priority: env var > coordinator > default
  let effectiveParallelSubagents = resolveLimitFromEnv(
    "PI_AGENT_MAX_PARALLEL_SUBAGENTS",
    DEFAULT_MAX_PARALLEL_SUBAGENTS_PER_RUN,
  );

  // Only override with coordinator if env var is NOT set and coordinator is ready
  if (!process.env.PI_AGENT_MAX_PARALLEL_SUBAGENTS && isCoordinatorInitialized()) {
    effectiveParallelSubagents = getMyParallelLimit();
  }

  let effectiveTotalLlm = resolveLimitFromEnv(
    "PI_AGENT_MAX_TOTAL_LLM",
    DEFAULT_MAX_TOTAL_ACTIVE_LLM,
  );

  // Also adjust total LLM based on coordinator if env var is not set
  if (!process.env.PI_AGENT_MAX_TOTAL_LLM && isCoordinatorInitialized()) {
    effectiveTotalLlm = getMyParallelLimit();
  }

  return {
    maxTotalActiveLlm: effectiveTotalLlm,
    maxTotalActiveRequests: resolveLimitFromEnv(
      "PI_AGENT_MAX_TOTAL_REQUESTS",
      DEFAULT_MAX_TOTAL_ACTIVE_REQUESTS,
    ),
    maxParallelSubagentsPerRun: effectiveParallelSubagents,
    maxParallelTeamsPerRun: resolveLimitFromEnv(
      "PI_AGENT_MAX_PARALLEL_TEAMS",
      DEFAULT_MAX_PARALLEL_TEAMS_PER_RUN,
    ),
    maxParallelTeammatesPerTeam: resolveLimitFromEnv(
      "PI_AGENT_MAX_PARALLEL_TEAMMATES",
      DEFAULT_MAX_PARALLEL_TEAMMATES_PER_TEAM,
    ),
    maxConcurrentOrchestrations: resolveLimitFromEnv(
      "PI_AGENT_MAX_CONCURRENT_ORCHESTRATIONS",
      DEFAULT_MAX_CONCURRENT_ORCHESTRATIONS,
      16,
    ),
    capacityWaitMs: resolveLimitFromEnv("PI_AGENT_CAPACITY_WAIT_MS", DEFAULT_CAPACITY_WAIT_MS, 3_600_000),
    capacityPollMs: resolveLimitFromEnv("PI_AGENT_CAPACITY_POLL_MS", DEFAULT_CAPACITY_POLL_MS, 60_000),
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
    runtime.queue = { activeOrchestrations: 0, pending: [] };
  }
  if (!Array.isArray(runtime.queue.pending)) {
    runtime.queue.pending = [];
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
 * 共有ランタイム状態を取得する
 * DIP準拠: 実際の状態アクセスはRuntimeStateProviderを経由する
 */
export function getSharedRuntimeState(): AgentRuntimeState {
  return runtimeStateProvider.getState();
}

function cleanupExpiredReservations(runtime: AgentRuntimeState, nowMs = Date.now()): number {
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
  const nowMs = Date.now();
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
  reservation.consumedAtMs = Date.now();
  notifyRuntimeCapacityChanged();
  return true;
}

export function getRuntimeSnapshot(): AgentRuntimeSnapshot {
  const runtime = getSharedRuntimeState();
  cleanupExpiredReservations(runtime);

  const subagentActiveRequests = Math.max(0, runtime.subagents.activeRunRequests);
  const subagentActiveAgents = Math.max(0, runtime.subagents.activeAgents);
  const teamActiveRuns = Math.max(0, runtime.teams.activeTeamRuns);
  const teamActiveAgents = Math.max(0, runtime.teams.activeTeammates);

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
    totalActiveRequests: subagentActiveRequests + teamActiveRuns,
    totalActiveLlm: subagentActiveAgents + teamActiveAgents,
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
  return `queue-${Date.now()}-${runtimeQueueSequence}`;
}

function createRuntimeReservationId(): string {
  runtimeReservationSequence += 1;
  return `reservation-${Date.now()}-${runtimeReservationSequence}`;
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
  runtime.queue.pending.sort((a, b) => {
    // Convert to PriorityQueueEntry format for comparison
    const entryA: PriorityQueueEntry = {
      ...a,
      virtualStartTime: 0,
      virtualFinishTime: 0,
      skipCount: 0,
    };
    const entryB: PriorityQueueEntry = {
      ...b,
      virtualStartTime: 0,
      virtualFinishTime: 0,
      skipCount: 0,
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
  const priorityOrder: TaskPriority[] = ["background", "low", "normal", "high", "critical"];
  let promoted = false;

  for (const entry of runtime.queue.pending) {
    const waitMs = nowMs - entry.enqueuedAtMs;
    if (waitMs > STARVATION_THRESHOLD_MS) {
      const currentIndex = priorityOrder.indexOf(entry.priority ?? "normal");
      if (currentIndex < priorityOrder.length - 1) {
        entry.priority = priorityOrder[currentIndex + 1];
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

export function checkRuntimeCapacity(input: RuntimeCapacityCheckInput): RuntimeCapacityCheck {
  const snapshot = getRuntimeSnapshot();
  return createCapacityCheck(snapshot, input);
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

  const nowMs = Date.now();
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
  const startedAt = Date.now();
  let attempts = 0;
  let latestCheck: RuntimeCapacityCheck & { reservation?: RuntimeCapacityReservationLease } =
    checkRuntimeCapacity(input);

  while (true) {
    attempts += 1;
    const waitElapsedMs = Date.now() - startedAt;
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
        waitedMs: Date.now() - startedAt,
        attempts,
        timedOut: false,
        aborted: false,
        reservation: attempted.reservation,
      };
    }

    const waitedMs = Date.now() - startedAt;
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
          waitedMs: Date.now() - startedAt,
          attempts,
          timedOut: false,
          aborted: true,
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
      return {
        ...attempted,
        waitedMs: Date.now() - startedAt,
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
  const startedAt = Date.now();
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
        // This respects both scheduler rate limits and runtime capacity
        let check = checkRuntimeCapacity(input);
        attempts++;

        // If not allowed, wait with backoff until capacity is available
        while (!check.allowed) {
          const elapsedMs = Date.now() - startedAt;
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
      timedOut: result.timedOut || (Date.now() - startedAt >= maxWaitMs && !check.allowed),
    };
  } catch (error) {
    // Fallback to existing logic on scheduler error (graceful degradation)
    const check = checkRuntimeCapacity(input);
    return {
      ...check,
      waitedMs: Date.now() - startedAt,
      attempts: Math.max(1, attempts),
      timedOut: false,
    };
  }
}

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
  const startedAt = Date.now();
  let attempts = 0;

  while (true) {
    attempts += 1;
    const check = checkRuntimeCapacity(input);
    const waitedMs = Date.now() - startedAt;

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
  const enqueuedAtMs = Date.now();

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
  };

  runtime.queue.pending.push(entry);

  // Sort by priority (higher priority first)
  sortQueueByPriority(runtime);
  updatePriorityStats(runtime);
  notifyRuntimeCapacityChanged();

  const queuedAhead = Math.max(0, runtime.queue.pending.findIndex((e) => e.id === entryId));
  let attempts = 0;

  while (true) {
    attempts += 1;
    const waitedMs = Date.now() - enqueuedAtMs;
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
    const canStart =
      index === 0 &&
      runtime.queue.activeOrchestrations < runtime.limits.maxConcurrentOrchestrations;

    if (canStart) {
      removeQueuedEntry(runtime, entryId);
      runtime.queue.activeOrchestrations += 1;
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
    promoteStarvingEntries(runtime, enqueuedAtMs);

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
          waitedMs: Date.now() - enqueuedAtMs,
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
        waitedMs: Date.now() - enqueuedAtMs,
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

export function resetRuntimeTransientState(): void {
  const runtime = getSharedRuntimeState();
  runtime.subagents.activeRunRequests = 0;
  runtime.subagents.activeAgents = 0;
  runtime.teams.activeTeamRuns = 0;
  runtime.teams.activeTeammates = 0;
  runtime.queue.activeOrchestrations = 0;
  runtime.queue.pending = [];
  runtime.reservations.active = [];
  notifyRuntimeCapacityChanged();
}

// ============================================================================
// Model-Aware Rate Limiting
// ============================================================================

/**
 * Get the effective parallelism limit for a specific model.
 * This combines:
 * 1. Provider/model preset limits
 * 2. Learned limits (from 429 errors) + predictive throttling
 * 3. Dynamic parallelism adjuster
 * 4. Cross-instance distribution
 *
 * @param provider - Provider name (e.g., "anthropic")
 * @param model - Model name (e.g., "claude-sonnet-4-20250514")
 * @returns The effective concurrency limit for this instance
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
 * Check if we should allow a parallel operation for a specific model.
 * This is a convenience function that combines limit checking.
 *
 * @param provider - Provider name
 * @param model - Model name
 * @param currentActive - Current number of active operations
 * @returns Whether the operation should be allowed
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
 * Get a summary of current limits for debugging.
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
 * Broadcast current queue state for work stealing coordination.
 */
export function broadcastCurrentQueueState(): void {
  const snapshot = getRuntimeSnapshot();

  broadcastQueueState({
    pendingTaskCount: snapshot.queuedOrchestrations,
    activeOrchestrations: snapshot.activeOrchestrations,
    stealableEntries: snapshot.queuedTools.slice(0, 10).map((tool) => ({
      id: `entry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
 * Get checkpoint manager instance (lazy initialization).
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
 * Get metrics collector instance (lazy initialization).
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
 * Record task completion in metrics.
 */
export function recordTaskCompletion(
  task: { id: string; source: string; provider: string; model: string; priority: string },
  result: { waitedMs: number; executionMs: number; success: boolean }
): void {
  const collector = getMetricsCollectorInstance();
  if (collector) {
    collector.recordTaskCompletion(task, result);
  }
}

/**
 * Record preemption event in metrics.
 */
export function recordPreemptionEvent(taskId: string, reason: string): void {
  const collector = getMetricsCollectorInstance();
  if (collector) {
    collector.recordPreemption(taskId, reason);
  }
}

/**
 * Record work steal event in metrics.
 */
export function recordWorkStealEvent(sourceInstance: string, taskId: string): void {
  const collector = getMetricsCollectorInstance();
  if (collector) {
    collector.recordWorkSteal(sourceInstance, taskId);
  }
}

/**
 * Get current scheduler metrics.
 */
export function getSchedulerMetrics(): import("../lib/metrics-collector").SchedulerMetrics | null {
  const collector = getMetricsCollectorInstance();
  if (collector) {
    return collector.getMetrics();
  }
  return null;
}

/**
 * Get checkpoint statistics.
 */
export function getCheckpointStats(): import("../lib/checkpoint-manager").CheckpointStats | null {
  const manager = getCheckpointManagerInstance();
  if (manager) {
    return manager.getStats();
  }
  return null;
}

/**
 * Attempt work stealing if enabled and idle.
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
 * Get comprehensive runtime status for monitoring.
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
 * Format comprehensive runtime status for display.
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
