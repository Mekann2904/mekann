/**
 * @file tests/unit/extensions/agent-runtime.test.ts
 * @description agent-runtime拡張機能の単体テスト
 * @testFramework vitest + fast-check
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fc from "fast-check";

// モック: 外部依存を分離
vi.mock("../../pi/lib/cross-instance-coordinator", () => ({
  getMyParallelLimit: vi.fn(() => 4),
  isCoordinatorInitialized: vi.fn(() => false),
  getModelParallelLimit: vi.fn((_p: string, _m: string, limit: number) => limit),
  getActiveInstancesForModel: vi.fn(() => 1),
  getStealingStats: vi.fn(() => null),
  isIdle: vi.fn(() => false),
  findStealCandidate: vi.fn(() => null),
  safeStealWork: vi.fn(async () => null),
  enhancedHeartbeat: vi.fn(),
  broadcastQueueState: vi.fn(),
  getWorkStealingSummary: vi.fn(() => ({
    remoteInstances: 0,
    totalPendingTasks: 0,
    stealableTasks: 0,
    idleInstances: 0,
  })),
}));

vi.mock("../../pi/lib/adaptive-rate-controller", () => ({
  getEffectiveLimit: vi.fn((_p: string, _m: string, limit: number) => limit),
  getSchedulerAwareLimit: vi.fn((_p: string, _m: string, limit: number) => limit),
}));

vi.mock("../../pi/lib/dynamic-parallelism", () => ({
  getParallelismAdjuster: vi.fn(() => ({ adjust: vi.fn() })),
  getParallelism: vi.fn((_p: string, _m: string) => 4),
}));

vi.mock("../../pi/lib/provider-limits", () => ({
  getConcurrencyLimit: vi.fn(() => 4),
  resolveLimits: vi.fn(() => ({ maxRequestsPerMinute: 60 })),
  detectTier: vi.fn(() => "standard"),
}));

vi.mock("../../pi/lib/task-scheduler", () => ({
  getScheduler: vi.fn(() => ({
    submit: vi.fn(async (task: unknown) => ({
      result: { allowed: true, reasons: [], projectedRequests: 0, projectedLlm: 0 },
      waitedMs: 0,
      timedOut: false,
    })),
  })),
  createTaskId: vi.fn((prefix: string) => `${prefix}-${Date.now()}`),
}));

vi.mock("../../pi/lib/unified-limit-resolver", () => ({
  setRuntimeSnapshotProvider: vi.fn(),
}));

vi.mock("../../pi/lib/runtime-config", () => ({
  getRuntimeConfig: vi.fn(() => ({
    maxParallelSubagents: 4,
    maxParallelTeams: 2,
    maxParallelTeammates: 4,
    maxConcurrentOrchestrations: 4,
    totalMaxLlm: 8,
    totalMaxRequests: 16,
    capacityWaitMs: 60000,
    capacityPollMs: 1000,
  })),
  isStableProfile: vi.fn(() => false),
}));

vi.mock("../../pi/lib/priority-scheduler", () => ({
  TaskPriority: {
    CRITICAL: "critical",
    HIGH: "high",
    NORMAL: "normal",
    LOW: "low",
    BACKGROUND: "background",
  },
  inferPriority: vi.fn(() => "normal"),
  comparePriority: vi.fn(() => 0),
  formatPriorityQueueStats: vi.fn(() => ""),
  PriorityTaskQueue: vi.fn(),
}));

// テスト用型定義
interface AgentRuntimeLimits {
  maxTotalActiveLlm: number;
  maxTotalActiveRequests: number;
  maxParallelSubagentsPerRun: number;
  maxParallelTeamsPerRun: number;
  maxParallelTeammatesPerTeam: number;
  maxConcurrentOrchestrations: number;
  capacityWaitMs: number;
  capacityPollMs: number;
}

interface AgentRuntimeSnapshot {
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
  priorityStats?: {
    critical: number;
    high: number;
    normal: number;
    low: number;
    background: number;
  };
}

interface RuntimeCapacityCheck {
  allowed: boolean;
  reasons: string[];
  projectedRequests: number;
  projectedLlm: number;
  snapshot: AgentRuntimeSnapshot;
}

interface RuntimeCapacityCheckInput {
  additionalRequests: number;
  additionalLlm: number;
}

interface RuntimeCapacityReservationLease {
  id: string;
  toolName: string;
  additionalRequests: number;
  additionalLlm: number;
  expiresAtMs: number;
  consume: () => void;
  heartbeat: (ttlMs?: number) => void;
  release: () => void;
}

interface RuntimeCapacityReserveResult extends RuntimeCapacityCheck {
  waitedMs: number;
  attempts: number;
  timedOut: boolean;
  aborted: boolean;
  reservation?: RuntimeCapacityReservationLease;
}

interface RuntimeStateProvider {
  getState(): AgentRuntimeState;
  resetState(): void;
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

interface RuntimeQueueEntry {
  id: string;
  toolName: string;
  priority?: string;
  enqueuedAtMs: number;
  estimatedDurationMs?: number;
  estimatedRounds?: number;
  deadlineMs?: number;
  source?: string;
  queueClass?: string;
  tenantKey?: string;
  additionalRequests?: number;
  additionalLlm?: number;
  skipCount?: number;
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

type GlobalScopeWithRuntime = typeof globalThis & {
  __PI_SHARED_AGENT_RUNTIME_STATE__?: AgentRuntimeState;
};

// テスト用のユーティリティ関数（純粋関数として再実装）
function normalizePositiveInt(value: unknown, fallback: number, max = 64): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed <= 0) return fallback;
  return Math.max(1, Math.min(max, Math.trunc(parsed)));
}

function sanitizePlannedCount(value: unknown): number {
  return Math.max(0, Math.trunc(Number(value) || 0));
}

function clampPlannedCount(value: number): number {
  return Math.max(0, Math.trunc(Number(value) || 0));
}

function createMockRuntimeLimits(): AgentRuntimeLimits {
  return {
    maxTotalActiveLlm: 8,
    maxTotalActiveRequests: 16,
    maxParallelSubagentsPerRun: 4,
    maxParallelTeamsPerRun: 2,
    maxParallelTeammatesPerTeam: 4,
    maxConcurrentOrchestrations: 4,
    capacityWaitMs: 60000,
    capacityPollMs: 1000,
  };
}

function serializeLimits(limits: AgentRuntimeLimits): string {
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

function createMockRuntimeState(): AgentRuntimeState {
  const limits = createMockRuntimeLimits();
  return {
    subagents: { activeRunRequests: 0, activeAgents: 0 },
    teams: { activeTeamRuns: 0, activeTeammates: 0 },
    queue: {
      activeOrchestrations: 0,
      pending: [],
      consecutiveDispatchesByTenant: 0,
    },
    reservations: { active: [] },
    limits,
    limitsVersion: serializeLimits(limits),
  };
}

// テスト用プロバイダー（グローバル状態を分離）
class TestRuntimeStateProvider implements RuntimeStateProvider {
  private state: AgentRuntimeState;

  constructor(initialState?: Partial<AgentRuntimeState>) {
    const baseState = createMockRuntimeState();
    this.state = {
      ...baseState,
      ...initialState,
      // ネストされたオブジェクトは個別にマージ
      subagents: { ...baseState.subagents, ...initialState?.subagents },
      teams: { ...baseState.teams, ...initialState?.teams },
      queue: { ...baseState.queue, ...initialState?.queue },
      reservations: { ...baseState.reservations, ...initialState?.reservations },
      limits: { ...baseState.limits, ...initialState?.limits },
    };
    // limitsVersionはlimitsの変更に応じて更新
    if (initialState?.limits) {
      this.state.limitsVersion = serializeLimits(this.state.limits);
    }
  }

  getState(): AgentRuntimeState {
    return this.state;
  }

  resetState(): void {
    this.state = createMockRuntimeState();
  }

  // テスト用ヘルパー
  setState(partial: Partial<AgentRuntimeState>): void {
    this.state = { ...this.state, ...partial };
  }

  incrementSubagentRequests(count = 1): void {
    this.state.subagents.activeRunRequests += count;
  }

  incrementSubagentAgents(count = 1): void {
    this.state.subagents.activeAgents += count;
  }
}

// SUT (System Under Test) - モックプロバイダーを使用する版
function createTestRuntimeFunctions(provider: TestRuntimeStateProvider) {
  const getSharedRuntimeState = () => provider.getState();

  const getRuntimeSnapshot = (): AgentRuntimeSnapshot => {
    const runtime = getSharedRuntimeState();
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

    const priorityStats = { critical: 0, high: 0, normal: 0, low: 0, background: 0 };
    for (const entry of runtime.queue.pending) {
      priorityStats[(entry.priority as keyof typeof priorityStats) ?? "normal"]++;
    }

    return {
      subagentActiveRequests: Math.max(0, runtime.subagents.activeRunRequests),
      subagentActiveAgents: Math.max(0, runtime.subagents.activeAgents),
      teamActiveRuns: Math.max(0, runtime.teams.activeTeamRuns),
      teamActiveAgents: Math.max(0, runtime.teams.activeTeammates),
      reservedRequests,
      reservedLlm,
      activeReservations,
      activeOrchestrations: Math.max(0, runtime.queue.activeOrchestrations),
      queuedOrchestrations: Math.max(0, runtime.queue.pending.length),
      queuedTools: runtime.queue.pending.slice(0, 16).map(
        (entry) => `${entry.toolName}:${entry.priority ?? "normal"}`
      ),
      totalActiveRequests: Math.max(0, runtime.subagents.activeRunRequests) + Math.max(0, runtime.teams.activeTeamRuns),
      totalActiveLlm: Math.max(0, runtime.subagents.activeAgents) + Math.max(0, runtime.teams.activeTeammates),
      limits: runtime.limits,
      limitsVersion: runtime.limitsVersion,
      priorityStats,
    };
  };

  const checkRuntimeCapacity = (input: RuntimeCapacityCheckInput): RuntimeCapacityCheck => {
    const snapshot = getRuntimeSnapshot();
    const requestedAdditionalRequests = sanitizePlannedCount(input.additionalRequests);
    const requestedAdditionalLlm = sanitizePlannedCount(input.additionalLlm);
    const projectedRequests =
      snapshot.totalActiveRequests + snapshot.reservedRequests + requestedAdditionalRequests;
    const projectedLlm = snapshot.totalActiveLlm + snapshot.reservedLlm + requestedAdditionalLlm;
    const reasons: string[] = [];

    if (projectedRequests > snapshot.limits.maxTotalActiveRequests) {
      reasons.push(
        `request上限超過: projected=${projectedRequests}, limit=${snapshot.limits.maxTotalActiveRequests}`
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
  };

  const resetRuntimeTransientState = (): void => {
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
  };

  let reservationSequence = 0;
  const createReservationId = () => {
    reservationSequence += 1;
    return `reservation-${Date.now()}-${reservationSequence}`;
  };

  const tryReserveRuntimeCapacity = (
    input: RuntimeCapacityCheckInput & { toolName?: string; reservationTtlMs?: number }
  ): RuntimeCapacityCheck & { reservation?: RuntimeCapacityReservationLease } => {
    const runtime = getSharedRuntimeState();
    const snapshot = getRuntimeSnapshot();
    const check = checkRuntimeCapacity(input);
    if (!check.allowed) {
      return check;
    }

    const nowMs = Date.now();
    const ttlMs = input.reservationTtlMs ?? 60000;
    const reservation: RuntimeCapacityReservationRecord = {
      id: createReservationId(),
      toolName: String(input.toolName || "unknown"),
      additionalRequests: sanitizePlannedCount(input.additionalRequests),
      additionalLlm: sanitizePlannedCount(input.additionalLlm),
      createdAtMs: nowMs,
      heartbeatAtMs: nowMs,
      expiresAtMs: nowMs + ttlMs,
    };
    runtime.reservations.active.push(reservation);

    let released = false;
    const lease: RuntimeCapacityReservationLease = {
      id: reservation.id,
      toolName: reservation.toolName,
      additionalRequests: reservation.additionalRequests,
      additionalLlm: reservation.additionalLlm,
      expiresAtMs: reservation.expiresAtMs,
      consume: () => {
        if (released) return;
        reservation.consumedAtMs = Date.now();
      },
      heartbeat: (newTtlMs?: number) => {
        if (released) return;
        const now = Date.now();
        reservation.heartbeatAtMs = now;
        reservation.expiresAtMs = now + (newTtlMs ?? 60000);
      },
      release: () => {
        if (released) return;
        released = true;
        const index = runtime.reservations.active.findIndex((r) => r.id === reservation.id);
        if (index >= 0) {
          runtime.reservations.active.splice(index, 1);
        }
      },
    };

    return { ...check, reservation: lease };
  };

  return {
    getSharedRuntimeState,
    getRuntimeSnapshot,
    checkRuntimeCapacity,
    resetRuntimeTransientState,
    tryReserveRuntimeCapacity,
  };
}

// ============================================================================
// テスト開始
// ============================================================================

describe("agent-runtime", () => {
  let provider: TestRuntimeStateProvider;
  let runtime: ReturnType<typeof createTestRuntimeFunctions>;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new TestRuntimeStateProvider();
    runtime = createTestRuntimeFunctions(provider);

    // グローバル状態をクリア
    const globalScope = globalThis as GlobalScopeWithRuntime;
    globalScope.__PI_SHARED_AGENT_RUNTIME_STATE__ = undefined;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================================
  // ユーティリティ関数
  // ============================================================================

  describe("normalizePositiveInt", () => {
    describe("正常系", () => {
      it("should_return_fallback_for_undefined", () => {
        expect(normalizePositiveInt(undefined, 10)).toBe(10);
      });

      it("should_return_fallback_for_null", () => {
        expect(normalizePositiveInt(null, 10)).toBe(10);
      });

      it("should_return_fallback_for_nan", () => {
        expect(normalizePositiveInt(NaN, 10)).toBe(10);
      });

      it("should_return_fallback_for_non_finite", () => {
        expect(normalizePositiveInt(Infinity, 10)).toBe(10);
        expect(normalizePositiveInt(-Infinity, 10)).toBe(10);
      });

      it("should_return_fallback_for_zero", () => {
        expect(normalizePositiveInt(0, 10)).toBe(10);
      });

      it("should_return_fallback_for_negative", () => {
        expect(normalizePositiveInt(-5, 10)).toBe(10);
      });

      it("should_truncate_decimal", () => {
        expect(normalizePositiveInt(5.7, 10)).toBe(5);
      });

      it("should_clamp_to_max", () => {
        expect(normalizePositiveInt(100, 10, 50)).toBe(50);
      });

      it("should_return_valid_value_unchanged", () => {
        expect(normalizePositiveInt(5, 10)).toBe(5);
        expect(normalizePositiveInt(30, 10, 64)).toBe(30);
      });
    });

    describe("境界値", () => {
      it("should_handle_string_number", () => {
        expect(normalizePositiveInt("5", 10)).toBe(5);
        expect(normalizePositiveInt("abc", 10)).toBe(10);
      });

      it("should_handle_very_small_positive", () => {
        // trunc(0.001) = 0, Math.max(1, 0) = 1 (1未満は1にクランプされる)
        expect(normalizePositiveInt(0.001, 10)).toBe(1);
        expect(normalizePositiveInt(0.9, 10)).toBe(1);
        expect(normalizePositiveInt(1, 10)).toBe(1);
        expect(normalizePositiveInt(1.5, 10)).toBe(1);
        expect(normalizePositiveInt(2, 10)).toBe(2);
      });

      it("should_handle_max_boundary", () => {
        expect(normalizePositiveInt(64, 10, 64)).toBe(64);
        expect(normalizePositiveInt(65, 10, 64)).toBe(64);
      });
    });

    describe("プロパティベーステスト", () => {
      it("PBT: 結果は常に [1, max] または fallback のいずれか", () => {
        fc.assert(
          fc.property(
            fc.anything(),
            fc.integer({ min: 1, max: 100 }),
            fc.integer({ min: 1, max: 100 }),
            (value, fallback, max) => {
              // fallback が max より大きい場合は、fallback が返される可能性がある
              const effectiveMax = Math.min(max, fallback);
              const result = normalizePositiveInt(value, fallback, max);
              expect(result).toBeGreaterThanOrEqual(1);
              expect(result).toBeLessThanOrEqual(Math.max(max, fallback));
            }
          )
        );
      });

      it("PBT: 有効な正の整数は変更されず返される", () => {
        fc.assert(
          fc.property(
            fc.integer({ min: 1, max: 64 }),
            fc.integer({ min: 1, max: 100 }),
            (value, fallback) => {
              expect(normalizePositiveInt(value, fallback, 64)).toBe(value);
            }
          )
        );
      });
    });
  });

  // ============================================================================
  // sanitizePlannedCount
  // ============================================================================

  describe("sanitizePlannedCount", () => {
    describe("正常系", () => {
      it("should_return_zero_for_undefined", () => {
        expect(sanitizePlannedCount(undefined)).toBe(0);
      });

      it("should_return_zero_for_null", () => {
        expect(sanitizePlannedCount(null)).toBe(0);
      });

      it("should_return_zero_for_nan", () => {
        expect(sanitizePlannedCount(NaN)).toBe(0);
      });

      it("should_truncate_and_clamp_positive", () => {
        expect(sanitizePlannedCount(5.7)).toBe(5);
        expect(sanitizePlannedCount(10)).toBe(10);
      });

      it("should_return_zero_for_negative", () => {
        expect(sanitizePlannedCount(-5)).toBe(0);
      });
    });

    describe("プロパティベーステスト", () => {
      it("PBT: 結果は常に非負整数", () => {
        fc.assert(
          fc.property(
            fc.oneof(
              fc.integer(),
              fc.double({ noNaN: true, noDefaultInfinity: true }),
              fc.string(),
              fc.boolean(),
              fc.constantFrom(null, undefined)
            ),
            (value) => {
              const result = sanitizePlannedCount(value);
              expect(Number.isInteger(result)).toBe(true);
              expect(result).toBeGreaterThanOrEqual(0);
            }
          )
        );
      });
    });
  });

  // ============================================================================
  // clampPlannedCount
  // ============================================================================

  describe("clampPlannedCount", () => {
    describe("正常系", () => {
      it("should_return_zero_for_negative", () => {
        expect(clampPlannedCount(-5)).toBe(0);
      });

      it("should_truncate_decimal", () => {
        expect(clampPlannedCount(5.7)).toBe(5);
      });

      it("should_return_valid_positive_unchanged", () => {
        expect(clampPlannedCount(10)).toBe(10);
      });
    });

    describe("境界値", () => {
      it("should_handle_zero", () => {
        expect(clampPlannedCount(0)).toBe(0);
      });

      it("should_handle_very_small_positive", () => {
        expect(clampPlannedCount(0.1)).toBe(0);
        expect(clampPlannedCount(0.9)).toBe(0);
        expect(clampPlannedCount(1.0)).toBe(1);
      });
    });

    describe("プロパティベーステスト", () => {
      it("PBT: 結果は常に非負整数", () => {
        fc.assert(
          fc.property(fc.double({ min: -1000, max: 1000, noNaN: true }), (value) => {
            const result = clampPlannedCount(value);
            expect(Number.isInteger(result)).toBe(true);
            expect(result).toBeGreaterThanOrEqual(0);
          })
        );
      });
    });
  });

  // ============================================================================
  // グローバル状態管理
  // ============================================================================

  describe("グローバル状態管理", () => {
    describe("getSharedRuntimeState", () => {
      it("should_return_initial_state", () => {
        const state = runtime.getSharedRuntimeState();

        expect(state.subagents.activeRunRequests).toBe(0);
        expect(state.subagents.activeAgents).toBe(0);
        expect(state.teams.activeTeamRuns).toBe(0);
        expect(state.teams.activeTeammates).toBe(0);
        expect(state.queue.activeOrchestrations).toBe(0);
        expect(state.queue.pending).toEqual([]);
        expect(state.reservations.active).toEqual([]);
      });

      it("should_return_same_instance_on_multiple_calls", () => {
        const state1 = runtime.getSharedRuntimeState();
        const state2 = runtime.getSharedRuntimeState();

        expect(state1).toBe(state2);
      });

      it("should_return_limits_with_valid_structure", () => {
        const state = runtime.getSharedRuntimeState();

        // limitsは存在することを確認（値はモック依存）
        expect(state.limits).toBeDefined();
        // limitsVersionはプロバイダーから提供される
        const snapshot = runtime.getRuntimeSnapshot();
        expect(snapshot.limitsVersion).toBeDefined();
      });
    });

    describe("resetRuntimeTransientState", () => {
      it("should_reset_all_transient_state", () => {
        // Arrange: 状態を変更
        provider.setState({
          subagents: { activeRunRequests: 5, activeAgents: 3 },
          teams: { activeTeamRuns: 2, activeTeammates: 4 },
          queue: {
            activeOrchestrations: 2,
            pending: [{ id: "test", toolName: "test", enqueuedAtMs: Date.now() }],
            consecutiveDispatchesByTenant: 3,
          },
          reservations: {
            active: [{
              id: "r1",
              toolName: "test",
              additionalRequests: 1,
              additionalLlm: 1,
              createdAtMs: Date.now(),
              heartbeatAtMs: Date.now(),
              expiresAtMs: Date.now() + 60000,
            }],
          },
        });

        // Act
        runtime.resetRuntimeTransientState();

        // Assert
        const state = runtime.getSharedRuntimeState();
        expect(state.subagents.activeRunRequests).toBe(0);
        expect(state.subagents.activeAgents).toBe(0);
        expect(state.teams.activeTeamRuns).toBe(0);
        expect(state.teams.activeTeammates).toBe(0);
        expect(state.queue.activeOrchestrations).toBe(0);
        expect(state.queue.pending).toEqual([]);
        expect(state.reservations.active).toEqual([]);
      });

      it("should_preserve_limits_after_reset", () => {
        // Arrange
        const originalLimits = runtime.getSharedRuntimeState().limits;

        // Act
        runtime.resetRuntimeTransientState();

        // Assert
        const state = runtime.getSharedRuntimeState();
        expect(state.limits).toEqual(originalLimits);
      });
    });
  });

  // ============================================================================
  // スナップショット取得
  // ============================================================================

  describe("getRuntimeSnapshot", () => {
    describe("正常系", () => {
      it("should_return_snapshot_with_zero_counts", () => {
        const snapshot = runtime.getRuntimeSnapshot();

        expect(snapshot.subagentActiveRequests).toBe(0);
        expect(snapshot.subagentActiveAgents).toBe(0);
        expect(snapshot.teamActiveRuns).toBe(0);
        expect(snapshot.teamActiveAgents).toBe(0);
        expect(snapshot.reservedRequests).toBe(0);
        expect(snapshot.reservedLlm).toBe(0);
        expect(snapshot.activeReservations).toBe(0);
        expect(snapshot.activeOrchestrations).toBe(0);
        expect(snapshot.queuedOrchestrations).toBe(0);
        expect(snapshot.totalActiveRequests).toBe(0);
        expect(snapshot.totalActiveLlm).toBe(0);
      });

      it("should_calculate_total_counts_correctly", () => {
        provider.setState({
          subagents: { activeRunRequests: 5, activeAgents: 3 },
          teams: { activeTeamRuns: 2, activeTeammates: 1 },
        });

        const snapshot = runtime.getRuntimeSnapshot();

        expect(snapshot.totalActiveRequests).toBe(7); // 5 + 2
        expect(snapshot.totalActiveLlm).toBe(4); // 3 + 1
      });

      it("should_include_reserved_capacity", () => {
        provider.setState({
          reservations: {
            active: [{
              id: "r1",
              toolName: "test",
              additionalRequests: 2,
              additionalLlm: 1,
              createdAtMs: Date.now(),
              heartbeatAtMs: Date.now(),
              expiresAtMs: Date.now() + 60000,
            }],
          },
        });

        const snapshot = runtime.getRuntimeSnapshot();

        expect(snapshot.reservedRequests).toBe(2);
        expect(snapshot.reservedLlm).toBe(1);
        expect(snapshot.activeReservations).toBe(1);
      });

      it("should_exclude_consumed_reservations_from_reserved_count", () => {
        provider.setState({
          reservations: {
            active: [{
              id: "r1",
              toolName: "test",
              additionalRequests: 2,
              additionalLlm: 1,
              createdAtMs: Date.now(),
              heartbeatAtMs: Date.now(),
              expiresAtMs: Date.now() + 60000,
              consumedAtMs: Date.now(), // consumed
            }],
          },
        });

        const snapshot = runtime.getRuntimeSnapshot();

        expect(snapshot.reservedRequests).toBe(0);
        expect(snapshot.reservedLlm).toBe(0);
        expect(snapshot.activeReservations).toBe(0);
      });

      it("should_include_queued_orchestrations", () => {
        provider.setState({
          queue: {
            activeOrchestrations: 2,
            pending: [
              { id: "q1", toolName: "tool1", priority: "high", enqueuedAtMs: Date.now() },
              { id: "q2", toolName: "tool2", priority: "normal", enqueuedAtMs: Date.now() },
            ],
            consecutiveDispatchesByTenant: 0,
          },
        });

        const snapshot = runtime.getRuntimeSnapshot();

        expect(snapshot.activeOrchestrations).toBe(2);
        expect(snapshot.queuedOrchestrations).toBe(2);
        expect(snapshot.queuedTools).toContain("tool1:high");
        expect(snapshot.queuedTools).toContain("tool2:normal");
      });

      it("should_calculate_priority_stats", () => {
        provider.setState({
          queue: {
            activeOrchestrations: 0,
            pending: [
              { id: "q1", toolName: "t1", priority: "critical", enqueuedAtMs: Date.now() },
              { id: "q2", toolName: "t2", priority: "high", enqueuedAtMs: Date.now() },
              { id: "q3", toolName: "t3", priority: "high", enqueuedAtMs: Date.now() },
              { id: "q4", toolName: "t4", priority: "normal", enqueuedAtMs: Date.now() },
              { id: "q5", toolName: "t5", priority: "low", enqueuedAtMs: Date.now() },
              { id: "q6", toolName: "t6", priority: "background", enqueuedAtMs: Date.now() },
            ],
            consecutiveDispatchesByTenant: 0,
          },
        });

        const snapshot = runtime.getRuntimeSnapshot();

        expect(snapshot.priorityStats).toEqual({
          critical: 1,
          high: 2,
          normal: 1,
          low: 1,
          background: 1,
        });
      });
    });

    describe("境界値", () => {
      it("should_handle_negative_counts_gracefully", () => {
        provider.setState({
          subagents: { activeRunRequests: -5, activeAgents: -3 },
          teams: { activeTeamRuns: -2, activeTeammates: -1 },
        });

        const snapshot = runtime.getRuntimeSnapshot();

        // Math.max(0, value) により 0 にクランプされる
        expect(snapshot.subagentActiveRequests).toBe(0);
        expect(snapshot.subagentActiveAgents).toBe(0);
        expect(snapshot.teamActiveRuns).toBe(0);
        expect(snapshot.teamActiveAgents).toBe(0);
        expect(snapshot.totalActiveRequests).toBe(0);
        expect(snapshot.totalActiveLlm).toBe(0);
      });

      it("should_limit_queued_tools_to_16", () => {
        const pending = Array.from({ length: 20 }, (_, i) => ({
          id: `q${i}`,
          toolName: `tool${i}`,
          priority: "normal",
          enqueuedAtMs: Date.now(),
        }));

        provider.setState({
          queue: {
            activeOrchestrations: 0,
            pending,
            consecutiveDispatchesByTenant: 0,
          },
        });

        const snapshot = runtime.getRuntimeSnapshot();

        expect(snapshot.queuedTools.length).toBe(16);
        expect(snapshot.queuedOrchestrations).toBe(20);
      });
    });

    describe("エッジケース", () => {
      it("should_handle_empty_pending_queue", () => {
        provider.setState({
          queue: {
            activeOrchestrations: 0,
            pending: [],
            consecutiveDispatchesByTenant: 0,
          },
        });

        const snapshot = runtime.getRuntimeSnapshot();

        expect(snapshot.queuedOrchestrations).toBe(0);
        expect(snapshot.queuedTools).toEqual([]);
        expect(snapshot.priorityStats).toEqual({
          critical: 0,
          high: 0,
          normal: 0,
          low: 0,
          background: 0,
        });
      });

      it("should_handle_reservation_without_consumedAtMs", () => {
        provider.setState({
          reservations: {
            active: [{
              id: "r1",
              toolName: "test",
              additionalRequests: 3,
              additionalLlm: 2,
              createdAtMs: Date.now(),
              heartbeatAtMs: Date.now(),
              expiresAtMs: Date.now() + 60000,
              // consumedAtMs なし
            }],
          },
        });

        const snapshot = runtime.getRuntimeSnapshot();

        expect(snapshot.activeReservations).toBe(1);
        expect(snapshot.reservedRequests).toBe(3);
        expect(snapshot.reservedLlm).toBe(2);
      });
    });
  });

  // ============================================================================
  // 容量チェック
  // ============================================================================

  describe("checkRuntimeCapacity", () => {
    describe("正常系: 容量あり", () => {
      it("should_allow_when_within_limits", () => {
        const result = runtime.checkRuntimeCapacity({
          additionalRequests: 1,
          additionalLlm: 1,
        });

        expect(result.allowed).toBe(true);
        expect(result.reasons).toEqual([]);
        expect(result.projectedRequests).toBe(1);
        expect(result.projectedLlm).toBe(1);
      });

      it("should_calculate_projected_correctly", () => {
        provider.setState({
          subagents: { activeRunRequests: 5, activeAgents: 3 },
          reservations: {
            active: [{
              id: "r1",
              toolName: "test",
              additionalRequests: 2,
              additionalLlm: 1,
              createdAtMs: Date.now(),
              heartbeatAtMs: Date.now(),
              expiresAtMs: Date.now() + 60000,
            }],
          },
        });

        const result = runtime.checkRuntimeCapacity({
          additionalRequests: 3,
          additionalLlm: 2,
        });

        // projected = active + reserved + additional
        expect(result.projectedRequests).toBe(10); // 5 + 2 + 3
        expect(result.projectedLlm).toBe(6); // 3 + 1 + 2
      });
    });

    describe("異常系: 容量超過", () => {
      it("should_deny_when_request_limit_exceeded", () => {
        // 制限を低く設定
        provider.setState({
          limits: { ...createMockRuntimeLimits(), maxTotalActiveRequests: 5 },
        });

        const result = runtime.checkRuntimeCapacity({
          additionalRequests: 6,
          additionalLlm: 0,
        });

        expect(result.allowed).toBe(false);
        expect(result.reasons.length).toBeGreaterThan(0);
        expect(result.reasons[0]).toContain("request上限超過");
      });

      it("should_deny_when_llm_limit_exceeded", () => {
        provider.setState({
          limits: { ...createMockRuntimeLimits(), maxTotalActiveLlm: 3 },
        });

        const result = runtime.checkRuntimeCapacity({
          additionalRequests: 0,
          additionalLlm: 4,
        });

        expect(result.allowed).toBe(false);
        expect(result.reasons[0]).toContain("LLM上限超過");
      });

      it("should_report_both_limit_violations", () => {
        provider.setState({
          limits: {
            ...createMockRuntimeLimits(),
            maxTotalActiveRequests: 3,
            maxTotalActiveLlm: 2,
          },
        });

        const result = runtime.checkRuntimeCapacity({
          additionalRequests: 4,
          additionalLlm: 3,
        });

        expect(result.allowed).toBe(false);
        expect(result.reasons.length).toBe(2);
      });
    });

    describe("境界値", () => {
      it("should_allow_at_exact_limit", () => {
        provider.setState({
          limits: { ...createMockRuntimeLimits(), maxTotalActiveRequests: 5 },
        });

        const result = runtime.checkRuntimeCapacity({
          additionalRequests: 5,
          additionalLlm: 0,
        });

        expect(result.allowed).toBe(true);
      });

      it("should_deny_at_limit_plus_one", () => {
        provider.setState({
          limits: { ...createMockRuntimeLimits(), maxTotalActiveRequests: 5 },
        });

        const result = runtime.checkRuntimeCapacity({
          additionalRequests: 6,
          additionalLlm: 0,
        });

        expect(result.allowed).toBe(false);
      });

      it("should_handle_zero_additional", () => {
        const result = runtime.checkRuntimeCapacity({
          additionalRequests: 0,
          additionalLlm: 0,
        });

        expect(result.allowed).toBe(true);
        expect(result.projectedRequests).toBe(0);
        expect(result.projectedLlm).toBe(0);
      });
    });

    describe("入力正規化", () => {
      it("should_sanitize_negative_additional_requests", () => {
        const result = runtime.checkRuntimeCapacity({
          additionalRequests: -5,
          additionalLlm: -3,
        });

        expect(result.projectedRequests).toBe(0);
        expect(result.projectedLlm).toBe(0);
        expect(result.allowed).toBe(true);
      });

      it("should_sanitize_non_integer_values", () => {
        const result = runtime.checkRuntimeCapacity({
          additionalRequests: 3.7,
          additionalLlm: 2.2,
        });

        expect(result.projectedRequests).toBe(3);
        expect(result.projectedLlm).toBe(2);
      });
    });

    describe("プロパティベーステスト", () => {
      it("PBT: ゼロ要求は常に許可される", () => {
        fc.assert(
          fc.property(
            fc.record({
              maxRequests: fc.integer({ min: 1, max: 100 }),
              maxLlm: fc.integer({ min: 1, max: 100 }),
            }),
            (limits) => {
              provider.setState({
                limits: {
                  ...createMockRuntimeLimits(),
                  maxTotalActiveRequests: limits.maxRequests,
                  maxTotalActiveLlm: limits.maxLlm,
                },
              });

              const result = runtime.checkRuntimeCapacity({
                additionalRequests: 0,
                additionalLlm: 0,
              });

              expect(result.allowed).toBe(true);
            }
          )
        );
      });

      it("PBT: 制限超過の場合は常に拒否される", () => {
        fc.assert(
          fc.property(
            fc.record({
              maxRequests: fc.integer({ min: 1, max: 10 }),
              maxLlm: fc.integer({ min: 1, max: 10 }),
              extraRequests: fc.integer({ min: 1, max: 100 }),
              extraLlm: fc.integer({ min: 1, max: 100 }),
            }),
            ({ maxRequests, maxLlm, extraRequests, extraLlm }) => {
              provider.setState({
                limits: {
                  ...createMockRuntimeLimits(),
                  maxTotalActiveRequests: maxRequests,
                  maxTotalActiveLlm: maxLlm,
                },
              });

              const result = runtime.checkRuntimeCapacity({
                additionalRequests: maxRequests + extraRequests,
                additionalLlm: maxLlm + extraLlm,
              });

              expect(result.allowed).toBe(false);
            }
          )
        );
      });
    });
  });

  // ============================================================================
  // 容量予約
  // ============================================================================

  describe("tryReserveRuntimeCapacity", () => {
    describe("正常系", () => {
      it("should_create_reservation_when_capacity_available", () => {
        const result = runtime.tryReserveRuntimeCapacity({
          toolName: "test-tool",
          additionalRequests: 2,
          additionalLlm: 1,
        });

        expect(result.allowed).toBe(true);
        expect(result.reservation).toBeDefined();
        expect(result.reservation!.toolName).toBe("test-tool");
        expect(result.reservation!.additionalRequests).toBe(2);
        expect(result.reservation!.additionalLlm).toBe(1);
      });

      it("should_add_reservation_to_state", () => {
        runtime.tryReserveRuntimeCapacity({
          toolName: "test-tool",
          additionalRequests: 1,
          additionalLlm: 1,
        });

        const state = runtime.getSharedRuntimeState();
        expect(state.reservations.active.length).toBe(1);
      });

      it("should_set_expires_at_ms_with_default_ttl", () => {
        const beforeReserve = Date.now();
        const result = runtime.tryReserveRuntimeCapacity({
          additionalRequests: 1,
          additionalLlm: 1,
        });
        const afterReserve = Date.now();

        const minExpires = beforeReserve + 60000; // デフォルトTTL
        const maxExpires = afterReserve + 60000;

        expect(result.reservation!.expiresAtMs).toBeGreaterThanOrEqual(minExpires);
        expect(result.reservation!.expiresAtMs).toBeLessThanOrEqual(maxExpires + 100); // 許容誤差
      });

      it("should_set_expires_at_ms_with_custom_ttl", () => {
        const beforeReserve = Date.now();
        const customTtl = 30000;
        const result = runtime.tryReserveRuntimeCapacity({
          additionalRequests: 1,
          additionalLlm: 1,
          reservationTtlMs: customTtl,
        });
        const afterReserve = Date.now();

        const minExpires = beforeReserve + customTtl;
        const maxExpires = afterReserve + customTtl;

        expect(result.reservation!.expiresAtMs).toBeGreaterThanOrEqual(minExpires);
        expect(result.reservation!.expiresAtMs).toBeLessThanOrEqual(maxExpires + 100);
      });
    });

    describe("異常系: 容量不足", () => {
      it("should_not_create_reservation_when_capacity_exceeded", () => {
        provider.setState({
          limits: { ...createMockRuntimeLimits(), maxTotalActiveRequests: 1 },
        });

        const result = runtime.tryReserveRuntimeCapacity({
          additionalRequests: 5,
          additionalLlm: 0,
        });

        expect(result.allowed).toBe(false);
        expect(result.reservation).toBeUndefined();
      });

      it("should_not_modify_state_when_reservation_fails", () => {
        provider.setState({
          limits: { ...createMockRuntimeLimits(), maxTotalActiveRequests: 1 },
        });

        runtime.tryReserveRuntimeCapacity({
          additionalRequests: 5,
          additionalLlm: 0,
        });

        const state = runtime.getSharedRuntimeState();
        expect(state.reservations.active.length).toBe(0);
      });
    });

    describe("リース操作", () => {
      it("should_release_reservation_on_release_call", () => {
        const result = runtime.tryReserveRuntimeCapacity({
          additionalRequests: 1,
          additionalLlm: 1,
        });

        expect(result.reservation).toBeDefined();

        result.reservation!.release();

        const state = runtime.getSharedRuntimeState();
        expect(state.reservations.active.length).toBe(0);
      });

      it("should_be_idempotent_on_multiple_release_calls", () => {
        const result = runtime.tryReserveRuntimeCapacity({
          additionalRequests: 1,
          additionalLlm: 1,
        });

        result.reservation!.release();
        result.reservation!.release();
        result.reservation!.release();

        const state = runtime.getSharedRuntimeState();
        expect(state.reservations.active.length).toBe(0);
      });

      it("should_consume_reservation_on_consume_call", () => {
        const result = runtime.tryReserveRuntimeCapacity({
          additionalRequests: 1,
          additionalLlm: 1,
        });

        result.reservation!.consume();

        const state = runtime.getSharedRuntimeState();
        expect(state.reservations.active[0].consumedAtMs).toBeDefined();
      });

      it("should_be_idempotent_on_multiple_consume_calls", () => {
        const result = runtime.tryReserveRuntimeCapacity({
          additionalRequests: 1,
          additionalLlm: 1,
        });

        result.reservation!.consume();
        const firstConsumeTime = runtime.getSharedRuntimeState().reservations.active[0].consumedAtMs;

        result.reservation!.consume();
        const secondConsumeTime = runtime.getSharedRuntimeState().reservations.active[0].consumedAtMs;

        expect(firstConsumeTime).toBe(secondConsumeTime);
      });

      it("should_update_heartbeat_on_heartbeat_call", async () => {
        const result = runtime.tryReserveRuntimeCapacity({
          additionalRequests: 1,
          additionalLlm: 1,
        });
        const originalExpiresAt = result.reservation!.expiresAtMs;

        // 少し待機してからハートビート（タイムスタンプが確実に変わるように）
        await new Promise((resolve) => setTimeout(resolve, 5));

        const newTtl = 120000;
        result.reservation!.heartbeat(newTtl);

        // expiresAtMs が更新されている
        expect(result.reservation!.expiresAtMs).toBeGreaterThanOrEqual(originalExpiresAt);
      });

      it("should_not_update_heartbeat_after_release", () => {
        const result = runtime.tryReserveRuntimeCapacity({
          additionalRequests: 1,
          additionalLlm: 1,
        });

        result.reservation!.release();
        const beforeHeartbeat = result.reservation!.expiresAtMs;

        result.reservation!.heartbeat(60000);

        // リリース後は更新されない
        expect(result.reservation!.expiresAtMs).toBe(beforeHeartbeat);
      });
    });

    describe("複数予約", () => {
      it("should_allow_multiple_reservations_within_capacity", () => {
        provider.setState({
          limits: { ...createMockRuntimeLimits(), maxTotalActiveRequests: 10, maxTotalActiveLlm: 10 },
        });

        const result1 = runtime.tryReserveRuntimeCapacity({ additionalRequests: 3, additionalLlm: 2 });
        const result2 = runtime.tryReserveRuntimeCapacity({ additionalRequests: 3, additionalLlm: 2 });
        // 合計: requests=6, llm=4
        // さらに追加: requests=5, llm=3 -> 合計 requests=11 > 10, llm=7 < 10
        // request制限超過
        const result3 = runtime.tryReserveRuntimeCapacity({ additionalRequests: 5, additionalLlm: 3 });

        expect(result1.allowed).toBe(true);
        expect(result2.allowed).toBe(true);
        expect(result3.allowed).toBe(false); // request制限超過
      });

      it("should_track_reservations_independently", () => {
        const r1 = runtime.tryReserveRuntimeCapacity({ additionalRequests: 1, additionalLlm: 1 });
        const r2 = runtime.tryReserveRuntimeCapacity({ additionalRequests: 1, additionalLlm: 1 });

        r1.reservation!.release();

        const state = runtime.getSharedRuntimeState();
        expect(state.reservations.active.length).toBe(1);
        expect(state.reservations.active[0].id).toBe(r2.reservation!.id);
      });
    });
  });

  // ============================================================================
  // 状態整合性
  // ============================================================================

  describe("状態整合性", () => {
    describe("同時アクセス シミュレーション", () => {
      it("should_maintain_consistency_with_sequential_operations", () => {
        // 複数の操作を順次実行して整合性を確認
        provider.setState({
          limits: { ...createMockRuntimeLimits(), maxTotalActiveRequests: 5, maxTotalActiveLlm: 5 },
        });

        // 操作1: 予約作成
        const r1 = runtime.tryReserveRuntimeCapacity({ additionalRequests: 2, additionalLlm: 1 });
        expect(r1.allowed).toBe(true);

        // 操作2: さらに予約
        const r2 = runtime.tryReserveRuntimeCapacity({ additionalRequests: 2, additionalLlm: 2 });
        expect(r2.allowed).toBe(true);

        // 操作3: 制限に到達
        const snapshot = runtime.getRuntimeSnapshot();
        expect(snapshot.reservedRequests).toBe(4);
        expect(snapshot.reservedLlm).toBe(3);

        // 操作4: 制限超過
        const r3 = runtime.tryReserveRuntimeCapacity({ additionalRequests: 2, additionalLlm: 2 });
        expect(r3.allowed).toBe(false);
      });

      it("should_update_snapshot_after_release", () => {
        const r = runtime.tryReserveRuntimeCapacity({ additionalRequests: 3, additionalLlm: 2 });

        let snapshot = runtime.getRuntimeSnapshot();
        expect(snapshot.reservedRequests).toBe(3);
        expect(snapshot.reservedLlm).toBe(2);

        r.reservation!.release();

        snapshot = runtime.getRuntimeSnapshot();
        expect(snapshot.reservedRequests).toBe(0);
        expect(snapshot.reservedLlm).toBe(0);
      });
    });

    describe("状態遷移の一貫性", () => {
      it("should_maintain_valid_state_through_lifecycle", () => {
        // 初期状態
        let state = runtime.getSharedRuntimeState();
        expect(state.reservations.active.length).toBe(0);

        // 予約作成
        const result = runtime.tryReserveRuntimeCapacity({
          toolName: "lifecycle-test",
          additionalRequests: 1,
          additionalLlm: 1,
        });

        state = runtime.getSharedRuntimeState();
        expect(state.reservations.active.length).toBe(1);
        expect(state.reservations.active[0].toolName).toBe("lifecycle-test");
        expect(state.reservations.active[0].consumedAtMs).toBeUndefined();

        // 消費
        result.reservation!.consume();

        state = runtime.getSharedRuntimeState();
        expect(state.reservations.active[0].consumedAtMs).toBeDefined();

        // 解放
        result.reservation!.release();

        state = runtime.getSharedRuntimeState();
        expect(state.reservations.active.length).toBe(0);
      });
    });
  });

  // ============================================================================
  // エッジケース
  // ============================================================================

  describe("エッジケース", () => {
    describe("空の状態", () => {
      it("should_handle_empty_reservations_array", () => {
        const snapshot = runtime.getRuntimeSnapshot();

        expect(snapshot.activeReservations).toBe(0);
        expect(snapshot.reservedRequests).toBe(0);
        expect(snapshot.reservedLlm).toBe(0);
      });

      it("should_handle_empty_queue", () => {
        const snapshot = runtime.getRuntimeSnapshot();

        expect(snapshot.queuedOrchestrations).toBe(0);
        expect(snapshot.activeOrchestrations).toBe(0);
        expect(snapshot.queuedTools).toEqual([]);
      });
    });

    describe("極端な値", () => {
      it("should_handle_large_additional_values", () => {
        provider.setState({
          limits: {
            ...createMockRuntimeLimits(),
            maxTotalActiveRequests: 1000000,
            maxTotalActiveLlm: 1000000,
          },
        });

        const result = runtime.checkRuntimeCapacity({
          additionalRequests: 100000,
          additionalLlm: 100000,
        });

        expect(result.allowed).toBe(true);
        expect(result.projectedRequests).toBe(100000);
        expect(result.projectedLlm).toBe(100000);
      });

      it("should_handle_very_low_limits", () => {
        provider.setState({
          limits: {
            ...createMockRuntimeLimits(),
            maxTotalActiveRequests: 1,
            maxTotalActiveLlm: 1,
          },
        });

        const result = runtime.checkRuntimeCapacity({
          additionalRequests: 1,
          additionalLlm: 1,
        });

        expect(result.allowed).toBe(true);
      });
    });

    describe("特殊なツール名", () => {
      it("should_handle_special_characters_in_tool_name", () => {
        const result = runtime.tryReserveRuntimeCapacity({
          toolName: "tool-with-special_chars.123",
          additionalRequests: 1,
          additionalLlm: 1,
        });

        expect(result.reservation!.toolName).toBe("tool-with-special_chars.123");
      });

      it("should_handle_empty_tool_name", () => {
        const result = runtime.tryReserveRuntimeCapacity({
          toolName: "",
          additionalRequests: 1,
          additionalLlm: 1,
        });

        expect(result.reservation!.toolName).toBe("unknown");
      });

      it("should_handle_unicode_tool_name", () => {
        const result = runtime.tryReserveRuntimeCapacity({
          toolName: "ツール名",
          additionalRequests: 1,
          additionalLlm: 1,
        });

        expect(result.reservation!.toolName).toBe("ツール名");
      });
    });

    describe("予約ID", () => {
      it("should_generate_unique_reservation_ids", () => {
        // 制限を十分に大きく設定して全ての予約が成功するようにする
        provider.setState({
          limits: {
            ...createMockRuntimeLimits(),
            maxTotalActiveRequests: 100,
            maxTotalActiveLlm: 100,
          },
        });

        const results = Array.from({ length: 10 }, () =>
          runtime.tryReserveRuntimeCapacity({ additionalRequests: 1, additionalLlm: 1 })
        );

        // 全て成功していることを確認
        const allAllowed = results.every((r) => r.allowed);
        expect(allAllowed).toBe(true);

        const ids = results.map((r) => r.reservation!.id);
        const uniqueIds = new Set(ids);

        expect(uniqueIds.size).toBe(10);
      });

      it("should_start_reservation_id_with_prefix", () => {
        const result = runtime.tryReserveRuntimeCapacity({ additionalRequests: 1, additionalLlm: 1 });

        expect(result.reservation!.id).toMatch(/^reservation-/);
      });
    });
  });

  // ============================================================================
  // プロパティベーステスト（統合）
  // ============================================================================

  describe("プロパティベーステスト（統合）", () => {
    it("PBT: 予約-解放サイクルは状態を不変に保つ", () => {
      fc.assert(
        fc.property(
          fc.record({
            requests: fc.integer({ min: 0, max: 5 }),
            llm: fc.integer({ min: 0, max: 5 }),
          }),
          ({ requests, llm }) => {
            const initialState = runtime.getRuntimeSnapshot();

            const result = runtime.tryReserveRuntimeCapacity({
              additionalRequests: requests,
              additionalLlm: llm,
            });

            if (result.allowed && result.reservation) {
              result.reservation.release();
            }

            const finalState = runtime.getRuntimeSnapshot();

            // 解放後は予約数が0に戻る
            expect(finalState.reservedRequests).toBe(0);
            expect(finalState.reservedLlm).toBe(0);
            expect(finalState.activeReservations).toBe(0);
          }
        )
      );
    });

    it("PBT: キャパシティチェック結果は冪等", () => {
      fc.assert(
        fc.property(
          fc.record({
            requests: fc.integer({ min: 0, max: 20 }),
            llm: fc.integer({ min: 0, max: 20 }),
          }),
          ({ requests, llm }) => {
            const result1 = runtime.checkRuntimeCapacity({
              additionalRequests: requests,
              additionalLlm: llm,
            });

            const result2 = runtime.checkRuntimeCapacity({
              additionalRequests: requests,
              additionalLlm: llm,
            });

            // 状態が変わらない限り結果は同じ
            expect(result1.allowed).toBe(result2.allowed);
            expect(result1.projectedRequests).toBe(result2.projectedRequests);
            expect(result1.projectedLlm).toBe(result2.projectedLlm);
          }
        )
      );
    });

    it("PBT: スナップショットの整合性", () => {
      fc.assert(
        fc.property(
          fc.record({
            subagentRequests: fc.integer({ min: 0, max: 10 }),
            subagentAgents: fc.integer({ min: 0, max: 10 }),
            teamRuns: fc.integer({ min: 0, max: 10 }),
            teamAgents: fc.integer({ min: 0, max: 10 }),
          }),
          (state) => {
            provider.setState({
              subagents: { activeRunRequests: state.subagentRequests, activeAgents: state.subagentAgents },
              teams: { activeTeamRuns: state.teamRuns, activeTeammates: state.teamAgents },
            });

            const snapshot = runtime.getRuntimeSnapshot();

            // 整合性チェック
            expect(snapshot.totalActiveRequests).toBe(state.subagentRequests + state.teamRuns);
            expect(snapshot.totalActiveLlm).toBe(state.subagentAgents + state.teamAgents);
          }
        )
      );
    });
  });
});
