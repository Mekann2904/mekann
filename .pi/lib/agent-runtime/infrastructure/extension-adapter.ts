/**
 * @abdd.meta
 * path: .pi/lib/agent-runtime/infrastructure/extension-adapter.ts
 * role: ランタイム拡張機能の登録
 * why: piフレームワークへの統合を提供
 * related: ../application/runtime-service.ts
 * public_api: createRuntimeTools, getSharedRuntimeService
 * invariants: ツール登録の一意性
 * side_effects: piへのツール・コマンド登録
 * failure_modes: 登録エラー
 * @abdd.explain
 * overview: pi拡張機能としてのランタイム登録
 * what_it_does:
 *   - ツール定義の作成
 *   - コマンド定義の作成
 *   - イベントハンドラーの登録
 * why_it_exists: フレームワーク詳細をビジネスロジックから分離
 * scope:
 *   in: application層
 *   out: piフレームワーク
 */

import { Type } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { RuntimeService } from "../application/runtime-service.js";
import { GlobalRuntimeStateProvider } from "../adapters/global-state-provider.js";
import type { ICapacityManager, IDispatchPermitManager } from "../application/interfaces.js";

/** 共有ランタイムサービスインスタンス */
let sharedRuntimeService: RuntimeService | null = null;

/**
 * 共有ランタイムサービスを取得
 * @summary 共有サービス取得
 * @returns ランタイムサービス
 */
export function getSharedRuntimeService(): RuntimeService {
  if (!sharedRuntimeService) {
    const stateProvider = new GlobalRuntimeStateProvider();
    const capacityManager = createCapacityManager(stateProvider);
    const dispatchManager = createDispatchManager(stateProvider, capacityManager);

    sharedRuntimeService = new RuntimeService({
      stateProvider,
      capacityManager,
      dispatchManager,
    });
  }
  return sharedRuntimeService;
}

/**
 * 容量マネージャーを作成
 * @summary 容量マネージャー作成
 * @param stateProvider - 状態プロバイダー
 * @returns 容量マネージャー
 */
function createCapacityManager(
  stateProvider: GlobalRuntimeStateProvider
): ICapacityManager {
  return {
    checkCapacity(additionalRequests: number, additionalLlm: number) {
      const state = stateProvider.getState();
      const snapshot = {
        currentRequests: state.subagents.activeRunRequests + state.teams.activeTeamRuns,
        currentLlm: state.subagents.activeAgents + state.teams.activeTeammates,
        reservedRequests: 0,
        reservedLlm: 0,
        consumedRequests: 0,
        consumedLlm: 0,
        additionalRequests,
        additionalLlm,
        limits: state.limits,
      };

      const projectedRequests =
        snapshot.currentRequests +
        snapshot.reservedRequests +
        snapshot.consumedRequests +
        snapshot.additionalRequests;

      const projectedLlm =
        snapshot.currentLlm +
        snapshot.reservedLlm +
        snapshot.consumedLlm +
        snapshot.additionalLlm;

      const reasons: string[] = [];
      if (projectedRequests > snapshot.limits.maxTotalActiveRequests) {
        reasons.push(`request上限超過: projected=${projectedRequests}, limit=${snapshot.limits.maxTotalActiveRequests}`);
      }
      if (projectedLlm > snapshot.limits.maxTotalActiveLlm) {
        reasons.push(`LLM上限超過: projected=${projectedLlm}, limit=${snapshot.limits.maxTotalActiveLlm}`);
      }

      return {
        allowed: reasons.length === 0,
        reasons,
        projectedRequests,
        projectedLlm,
      };
    },

    reserveCapacity(
      toolName: string,
      additionalRequests: number,
      additionalLlm: number,
      ttlMs?: number
    ) {
      const state = stateProvider.getState();
      const check = this.checkCapacity(additionalRequests, additionalLlm);
      if (!check.allowed) return null;

      const nowMs = Date.now();
      const reservation = {
        id: `reservation-${process.pid}-${nowMs}`,
        toolName,
        additionalRequests,
        additionalLlm,
        createdAtMs: nowMs,
        heartbeatAtMs: nowMs,
        expiresAtMs: nowMs + (ttlMs ?? 45_000),
      };

      state.reservations.active.push(reservation);

      return {
        id: reservation.id,
        toolName: reservation.toolName,
        additionalRequests: reservation.additionalRequests,
        additionalLlm: reservation.additionalLlm,
        expiresAtMs: reservation.expiresAtMs,
        consume: () => {
          reservation.createdAtMs = Date.now();
        },
        heartbeat: (ttl?: number) => {
          reservation.expiresAtMs = Date.now() + (ttl ?? 45_000);
        },
        release: () => {
          const index = state.reservations.active.findIndex((r) => r.id === reservation.id);
          if (index >= 0) {
            state.reservations.active.splice(index, 1);
          }
        },
      };
    },

    getSnapshot() {
      const state = stateProvider.getState();
      return {
        subagentActiveRequests: state.subagents.activeRunRequests,
        subagentActiveAgents: state.subagents.activeAgents,
        teamActiveRuns: state.teams.activeTeamRuns,
        teamActiveAgents: state.teams.activeTeammates,
        reservedRequests: 0,
        reservedLlm: 0,
        activeReservations: state.reservations.active.length,
        consumedReservations: 0,
        consumedRequests: 0,
        consumedLlm: 0,
        activeOrchestrations: state.queue.activeOrchestrations,
        queuedOrchestrations: state.queue.pending.length,
        queuedTools: state.queue.pending.slice(0, 16).map((e) => `${e.toolName}:${e.priority ?? "normal"}`),
        queueEvictions: state.queue.evictedEntries,
        totalActiveRequests: state.subagents.activeRunRequests + state.teams.activeTeamRuns,
        totalActiveLlm: state.subagents.activeAgents + state.teams.activeTeammates,
        limitsVersion: state.limitsVersion,
        priorityStats: { critical: 0, high: 0, normal: 0, low: 0, background: 0 },
        limits: state.limits,
      };
    },
  };
}

/**
 * ディスパッチマネージャーを作成
 * @summary ディスパッチマネージャー作成
 * @param stateProvider - 状態プロバイダー
 * @param capacityManager - 容量マネージャー
 * @returns ディスパッチマネージャー
 */
function createDispatchManager(
  stateProvider: GlobalRuntimeStateProvider,
  capacityManager: ICapacityManager
): IDispatchPermitManager {
  return {
    async acquirePermit(input, signal) {
      const check = capacityManager.checkCapacity(
        input.additionalRequests ?? 0,
        input.additionalLlm ?? 0
      );

      if (!check.allowed) {
        return {
          allowed: false,
          reasons: check.reasons,
          waitedMs: 0,
          timedOut: false,
          aborted: false,
        };
      }

      const state = stateProvider.getState();
      const nowMs = Date.now();
      const permit = {
        id: `permit-${process.pid}-${nowMs}`,
        toolName: input.toolName,
        permittedAtMs: nowMs,
        additionalRequests: input.additionalRequests ?? 0,
        additionalLlm: input.additionalLlm ?? 0,
      };

      // リソースを消費
      state.subagents.activeRunRequests += permit.additionalRequests;
      state.subagents.activeAgents += permit.additionalLlm;

      return {
        allowed: true,
        lease: {
          ...permit,
          consume: () => {
            // 既に消費済み
          },
          release: () => {
            state.subagents.activeRunRequests = Math.max(0, state.subagents.activeRunRequests - permit.additionalRequests);
            state.subagents.activeAgents = Math.max(0, state.subagents.activeAgents - permit.additionalLlm);
          },
        },
        waitedMs: 0,
        timedOut: false,
        aborted: false,
      };
    },

    getActiveCount() {
      const state = stateProvider.getState();
      return state.subagents.activeAgents + state.teams.activeTeammates;
    },

    getMaxConcurrency() {
      const state = stateProvider.getState();
      return state.limits.maxTotalActiveLlm;
    },
  };
}

/**
 * ランタイムツールを作成して登録
 * @summary ツール作成
 * @param pi - 拡張機能API
 * @returns ランタイムサービス
 */
export function createRuntimeTools(pi: ExtensionAPI): RuntimeService {
  const service = getSharedRuntimeService();

  // runtime_status ツール
  pi.registerTool({
    name: "runtime_status",
    label: "Runtime Status",
    description: "Show current runtime capacity and active agents.",
    parameters: Type.Object({}),
    async execute() {
      const snapshot = service.getSnapshot();
      const lines = [
        `Runtime Status:`,
        `- Active LLMs: ${snapshot.totalActiveLlm}/${snapshot.limits.maxTotalActiveLlm}`,
        `- Active Requests: ${snapshot.totalActiveRequests}/${snapshot.limits.maxTotalActiveRequests}`,
        `- Subagents: ${snapshot.subagentActiveAgents} agents, ${snapshot.subagentActiveRequests} requests`,
        `- Teams: ${snapshot.teamActiveAgents} members, ${snapshot.teamActiveRuns} runs`,
        `- Queued: ${snapshot.queuedOrchestrations} orchestrations`,
      ];

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: snapshot,
      };
    },
  });

  return service;
}
