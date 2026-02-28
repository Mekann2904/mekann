/**
 * @abdd.meta
 * path: .pi/lib/agent-runtime/adapters/global-state-provider.ts
 * role: グローバル状態プロバイダーの実装
 * why: IRuntimeStateProviderインターフェースの具体実装を提供
 * related: ../application/interfaces.ts
 * public_api: GlobalRuntimeStateProvider
 * invariants: グローバル状態の一意性
 * side_effects: globalThisへの読み書き
 * failure_modes: なし
 * @abdd.explain
 * overview: globalThisを使用した状態プロバイダー実装
 * what_it_does:
 *   - プロセス全体で状態を共有
 *   - atomic初期化
 *   - 状態整合性チェック
 * why_it_exists: インフラストラクチャ詳細をApplication層から分離
 * scope:
 *   in: Application層のインターフェース
 *   out: globalThis
 */

import { Mutex } from "async-mutex";
import type { IRuntimeStateProvider } from "../application/interfaces.js";
import type { AgentRuntimeState, AgentRuntimeLimits } from "../domain/runtime-state.js";
import { createInitialRuntimeState, createDefaultLimits, serializeLimits } from "../domain/runtime-state.js";

/**
 * グローバルスコープ型定義
 * @summary グローバルスコープ型
 */
interface GlobalScopeWithRuntime {
  __PI_SHARED_AGENT_RUNTIME_STATE__?: AgentRuntimeState;
  __PI_SHARED_AGENT_RUNTIME_STATE_INITIALIZED__?: boolean;
}

/**
 * グローバル状態プロバイダー
 * @summary グローバル状態プロバイダー
 */
export class GlobalRuntimeStateProvider implements IRuntimeStateProvider {
  private readonly globalScope: GlobalScopeWithRuntime;
  private readonly initMutex = new Mutex();
  private initializationPromise: Promise<void> | null = null;

  constructor() {
    this.globalScope = globalThis as GlobalScopeWithRuntime;
  }

  /**
   * 状態を取得
   * @summary 状態取得
   * @returns ランタイム状態
   */
  getState(): AgentRuntimeState {
    const global = this.globalScope;

    // atomic初期化パターン
    if (!global.__PI_SHARED_AGENT_RUNTIME_STATE__) {
      Object.defineProperty(global, "__PI_SHARED_AGENT_RUNTIME_STATE__", {
        value: createInitialRuntimeState(),
        writable: false,
        configurable: false,
        enumerable: false,
      });
    }

    const runtime = global.__PI_SHARED_AGENT_RUNTIME_STATE__ as AgentRuntimeState;
    this.ensureRuntimeStateShape(runtime);
    this.enforceLimitConsistency(runtime);
    return runtime;
  }

  /**
   * 状態を非同期で取得
   * @summary 状態非同期取得
   * @returns ランタイム状態のPromise
   */
  async getStateAsync(): Promise<AgentRuntimeState> {
    const global = this.globalScope;

    if (!global.__PI_SHARED_AGENT_RUNTIME_STATE__) {
      Object.defineProperty(global, "__PI_SHARED_AGENT_RUNTIME_STATE__", {
        value: createInitialRuntimeState(),
        writable: false,
        configurable: false,
        enumerable: false,
      });
    }

    const runtime = global.__PI_SHARED_AGENT_RUNTIME_STATE__ as AgentRuntimeState;
    this.ensureRuntimeStateShape(runtime);
    this.enforceLimitConsistency(runtime);
    return runtime;
  }

  /**
   * 状態をリセット
   * @summary 状態リセット
   */
  resetState(): void {
    Object.defineProperty(this.globalScope, "__PI_SHARED_AGENT_RUNTIME_STATE__", {
      value: undefined,
      writable: true,
      configurable: true,
      enumerable: false,
    });
    this.initializationPromise = null;
  }

  /**
   * 状態の形状を保証
   * @summary 状態形状保証
   * @param runtime - ランタイム状態
   */
  private ensureRuntimeStateShape(runtime: AgentRuntimeState): void {
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
    if (!runtime.reservations) {
      runtime.reservations = { active: [] };
    }
    if (!Array.isArray(runtime.reservations.active)) {
      runtime.reservations.active = [];
    }
    runtime.limits = this.sanitizeLimits(runtime.limits);
    if (typeof runtime.limitsVersion !== "string" || runtime.limitsVersion.length === 0) {
      runtime.limitsVersion = serializeLimits(runtime.limits);
    }
  }

  /**
   * 制限の整合性を強制
   * @summary 制限整合性強制
   * @param runtime - ランタイム状態
   */
  private enforceLimitConsistency(runtime: AgentRuntimeState): void {
    const runtimeLimits = this.sanitizeLimits(runtime.limits);
    const envLimits = this.sanitizeLimits(createDefaultLimits());
    const runtimeVersion = serializeLimits(runtimeLimits);
    const envVersion = serializeLimits(envLimits);

    if (runtimeVersion !== envVersion) {
      runtime.limits = envLimits;
      runtime.limitsVersion = envVersion;
    }
  }

  /**
   * 制限をサニタイズ
   * @summary 制限サニタイズ
   * @param limits - ランタイム制限
   * @returns サニタイズされた制限
   */
  private sanitizeLimits(limits: AgentRuntimeLimits | undefined): AgentRuntimeLimits {
    const fallback = createDefaultLimits();
    if (!limits) return fallback;

    return {
      maxTotalActiveLlm: this.normalizePositiveInt(limits.maxTotalActiveLlm, fallback.maxTotalActiveLlm),
      maxTotalActiveRequests: this.normalizePositiveInt(limits.maxTotalActiveRequests, fallback.maxTotalActiveRequests),
      maxParallelSubagentsPerRun: this.normalizePositiveInt(limits.maxParallelSubagentsPerRun, fallback.maxParallelSubagentsPerRun),
      maxParallelTeamsPerRun: this.normalizePositiveInt(limits.maxParallelTeamsPerRun, fallback.maxParallelTeamsPerRun),
      maxParallelTeammatesPerTeam: this.normalizePositiveInt(limits.maxParallelTeammatesPerTeam, fallback.maxParallelTeammatesPerTeam),
      maxConcurrentOrchestrations: this.normalizePositiveInt(limits.maxConcurrentOrchestrations, fallback.maxConcurrentOrchestrations, 16),
      capacityWaitMs: this.normalizePositiveInt(limits.capacityWaitMs, fallback.capacityWaitMs, 3_600_000),
      capacityPollMs: this.normalizePositiveInt(limits.capacityPollMs, fallback.capacityPollMs, 60_000),
    };
  }

  /**
   * 正の整数に正規化
   * @summary 正規化
   * @param value - 値
   * @param fallback - フォールバック値
   * @param max - 最大値
   * @returns 正規化された値
   */
  private normalizePositiveInt(value: unknown, fallback: number, max = 64): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    if (parsed <= 0) return fallback;
    return Math.max(1, Math.min(max, Math.trunc(parsed)));
  }
}
