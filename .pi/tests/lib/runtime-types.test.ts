/**
 * @abdd.meta
 * path: .pi/tests/lib/runtime-types.test.ts
 * role: runtime-types.tsの単体テスト
 * why: エージェントランタイム型定義の型安全性と整合性を検証するため
 * related: .pi/lib/runtime-types.ts
 * public_api: テストケースの実行
 * invariants: テストは型レベルの検証を主眼とする
 * side_effects: なし
 * failure_modes: 型の不整合によるコンパイルエラー
 * @abdd.explain
 * overview: エージェントランタイムの型定義が正しく構造化されていることを検証する
 */

import { describe, it, expect } from "vitest";
import type {
  AgentRuntimeLimits,
  RuntimeQueueEntry,
  RuntimeCapacityReservationRecord,
  AgentRuntimeState,
  RuntimeQueueClass,
  RuntimePriorityStats,
  AgentRuntimeSnapshot,
  RuntimeCapacityCheck,
  RuntimeCapacityWaitResult,
  RuntimeCapacityReservationLease,
  RuntimeOrchestrationWaitResult,
  RuntimeDispatchPermitResult,
  TaskPriority,
  PriorityTaskMetadata,
} from "../../lib/runtime-types.js";

describe("runtime-types", () => {
  describe("AgentRuntimeLimits型", () => {
    it("制限値オブジェクトを作成できる", () => {
      // Arrange & Act
      const limits: AgentRuntimeLimits = {
        maxTotalActiveLlm: 10,
        maxTotalActiveRequests: 20,
        maxParallelSubagentsPerRun: 5,
        maxParallelTeamsPerRun: 3,
        maxParallelTeammatesPerTeam: 4,
        maxConcurrentOrchestrations: 8,
        capacityWaitMs: 5000,
        capacityPollMs: 100,
      };

      // Assert
      expect(limits.maxTotalActiveLlm).toBe(10);
      expect(limits.maxTotalActiveRequests).toBe(20);
    });

    it("全フィールドが数値型である", () => {
      // Arrange & Act
      const limits: AgentRuntimeLimits = {
        maxTotalActiveLlm: 10,
        maxTotalActiveRequests: 20,
        maxParallelSubagentsPerRun: 5,
        maxParallelTeamsPerRun: 3,
        maxParallelTeammatesPerTeam: 4,
        maxConcurrentOrchestrations: 8,
        capacityWaitMs: 5000,
        capacityPollMs: 100,
      };

      // Assert
      expect(typeof limits.maxTotalActiveLlm).toBe("number");
      expect(typeof limits.maxTotalActiveRequests).toBe("number");
      expect(typeof limits.capacityWaitMs).toBe("number");
    });
  });

  describe("RuntimeQueueClass型", () => {
    it("有効なキュークラス値を使用できる", () => {
      // Arrange
      const classes: RuntimeQueueClass[] = ["interactive", "standard", "batch"];

      // Act & Assert
      for (const cls of classes) {
        const entry: RuntimeQueueEntry = {
          queueClass: cls,
          tenantKey: "test",
          additionalRequests: 1,
          additionalLlm: 1,
          skipCount: 0,
          priority: "normal",
          createdAt: Date.now(),
          source: "test",
        };
        expect(entry.queueClass).toBe(cls);
      }
    });
  });

  describe("RuntimeQueueEntry型", () => {
    it("PriorityTaskMetadataを継承している", () => {
      // Arrange & Act
      const entry: RuntimeQueueEntry = {
        queueClass: "standard",
        tenantKey: "tenant-1",
        additionalRequests: 2,
        additionalLlm: 1,
        skipCount: 0,
        // PriorityTaskMetadataフィールド
        priority: "high",
        createdAt: Date.now(),
        source: "subagent_run",
        estimatedRounds: 10,
        estimatedDurationMs: 30000,
      };

      // Assert
      expect(entry.priority).toBe("high");
      expect(entry.tenantKey).toBe("tenant-1");
    });
  });

  describe("RuntimeCapacityReservationRecord型", () => {
    it("予約レコードを作成できる", () => {
      // Arrange & Act
      const record: RuntimeCapacityReservationRecord = {
        id: "reservation-1",
        toolName: "subagent_run",
        additionalRequests: 2,
        additionalLlm: 1,
        createdAtMs: Date.now(),
        heartbeatAtMs: Date.now(),
        expiresAtMs: Date.now() + 60000,
      };

      // Assert
      expect(record.id).toBe("reservation-1");
      expect(record.consumedAtMs).toBeUndefined();
    });

    it("consumedAtMsを含む完全なレコードを作成できる", () => {
      // Arrange & Act
      const record: RuntimeCapacityReservationRecord = {
        id: "reservation-2",
        toolName: "agent_team_run",
        additionalRequests: 5,
        additionalLlm: 3,
        createdAtMs: Date.now(),
        heartbeatAtMs: Date.now(),
        expiresAtMs: Date.now() + 60000,
        consumedAtMs: Date.now() + 1000,
      };

      // Assert
      expect(record.consumedAtMs).toBeDefined();
    });
  });

  describe("RuntimePriorityStats型", () => {
    it("優先度別統計を作成できる", () => {
      // Arrange & Act
      const stats: RuntimePriorityStats = {
        critical: 1,
        high: 5,
        normal: 10,
        low: 3,
        background: 2,
      };

      // Assert
      expect(stats.critical + stats.high + stats.normal + stats.low + stats.background).toBe(21);
    });
  });

  describe("AgentRuntimeState型", () => {
    it("完全なランタイム状態を作成できる", () => {
      // Arrange & Act
      const state: AgentRuntimeState = {
        subagents: {
          activeRunRequests: 3,
          activeAgents: 5,
        },
        teams: {
          activeTeamRuns: 2,
          activeTeammates: 6,
        },
        queue: {
          activeOrchestrations: 4,
          pending: [],
          evictedEntries: 0,
        },
        reservations: {
          active: [],
        },
        limits: {
          maxTotalActiveLlm: 10,
          maxTotalActiveRequests: 20,
          maxParallelSubagentsPerRun: 5,
          maxParallelTeamsPerRun: 3,
          maxParallelTeammatesPerTeam: 4,
          maxConcurrentOrchestrations: 8,
          capacityWaitMs: 5000,
          capacityPollMs: 100,
        },
        limitsVersion: "1.0.0",
      };

      // Assert
      expect(state.subagents.activeRunRequests).toBe(3);
      expect(state.teams.activeTeamRuns).toBe(2);
      expect(state.queue.activeOrchestrations).toBe(4);
    });
  });

  describe("AgentRuntimeSnapshot型", () => {
    it("スナップショットを作成できる", () => {
      // Arrange & Act
      const snapshot: AgentRuntimeSnapshot = {
        subagentActiveRequests: 3,
        subagentActiveAgents: 5,
        teamActiveRuns: 2,
        teamActiveAgents: 6,
        reservedRequests: 4,
        reservedLlm: 2,
        activeReservations: 3,
        activeOrchestrations: 4,
        queuedOrchestrations: 10,
        queuedTools: ["subagent_run", "agent_team_run"],
        queueEvictions: 0,
        totalActiveRequests: 15,
        totalActiveLlm: 8,
        limits: {
          maxTotalActiveLlm: 10,
          maxTotalActiveRequests: 20,
          maxParallelSubagentsPerRun: 5,
          maxParallelTeamsPerRun: 3,
          maxParallelTeammatesPerTeam: 4,
          maxConcurrentOrchestrations: 8,
          capacityWaitMs: 5000,
          capacityPollMs: 100,
        },
        limitsVersion: "1.0.0",
      };

      // Assert
      expect(snapshot.totalActiveRequests).toBe(15);
      expect(snapshot.queuedTools).toHaveLength(2);
    });
  });

  describe("RuntimeCapacityCheck型", () => {
    it("容量チェック結果を作成できる", () => {
      // Arrange & Act
      const check: RuntimeCapacityCheck = {
        allowed: true,
        reasons: [],
        projectedRequests: 5,
        projectedLlm: 3,
        snapshot: {
          subagentActiveRequests: 3,
          subagentActiveAgents: 5,
          teamActiveRuns: 2,
          teamActiveAgents: 6,
          reservedRequests: 4,
          reservedLlm: 2,
          activeReservations: 3,
          activeOrchestrations: 4,
          queuedOrchestrations: 10,
          queuedTools: [],
          queueEvictions: 0,
          totalActiveRequests: 15,
          totalActiveLlm: 8,
          limits: {
            maxTotalActiveLlm: 10,
            maxTotalActiveRequests: 20,
            maxParallelSubagentsPerRun: 5,
            maxParallelTeamsPerRun: 3,
            maxParallelTeammatesPerTeam: 4,
            maxConcurrentOrchestrations: 8,
            capacityWaitMs: 5000,
            capacityPollMs: 100,
          },
          limitsVersion: "1.0.0",
        },
      };

      // Assert
      expect(check.allowed).toBe(true);
    });

    it("拒否された容量チェック結果を作成できる", () => {
      // Arrange & Act
      const check: RuntimeCapacityCheck = {
        allowed: false,
        reasons: ["maxTotalActiveLlm exceeded", "maxTotalActiveRequests exceeded"],
        projectedRequests: 25,
        projectedLlm: 15,
        snapshot: {} as AgentRuntimeSnapshot,
      };

      // Assert
      expect(check.allowed).toBe(false);
      expect(check.reasons).toHaveLength(2);
    });
  });

  describe("RuntimeCapacityWaitResult型", () => {
    it("待機結果を作成できる", () => {
      // Arrange & Act
      const result: RuntimeCapacityWaitResult = {
        allowed: true,
        reasons: [],
        projectedRequests: 5,
        projectedLlm: 3,
        snapshot: {} as AgentRuntimeSnapshot,
        waitedMs: 1500,
        attempts: 15,
        timedOut: false,
      };

      // Assert
      expect(result.waitedMs).toBe(1500);
      expect(result.timedOut).toBe(false);
    });

    it("タイムアウトした待機結果を作成できる", () => {
      // Arrange & Act
      const result: RuntimeCapacityWaitResult = {
        allowed: false,
        reasons: ["Timeout waiting for capacity"],
        projectedRequests: 0,
        projectedLlm: 0,
        snapshot: {} as AgentRuntimeSnapshot,
        waitedMs: 5000,
        attempts: 50,
        timedOut: true,
      };

      // Assert
      expect(result.timedOut).toBe(true);
    });
  });

  describe("TaskPriority再エクスポート", () => {
    it("優先度値を使用できる", () => {
      // Arrange
      const priorities: TaskPriority[] = ["critical", "high", "normal", "low", "background"];

      // Act & Assert
      for (const priority of priorities) {
        const metadata: PriorityTaskMetadata = {
          priority,
          createdAt: Date.now(),
          source: "test",
        };
        expect(metadata.priority).toBe(priority);
      }
    });
  });

  describe("型の不変条件", () => {
    it("数値フィールドは非負である", () => {
      // Arrange & Act
      const limits: AgentRuntimeLimits = {
        maxTotalActiveLlm: 0,
        maxTotalActiveRequests: 0,
        maxParallelSubagentsPerRun: 0,
        maxParallelTeamsPerRun: 0,
        maxParallelTeammatesPerTeam: 0,
        maxConcurrentOrchestrations: 0,
        capacityWaitMs: 0,
        capacityPollMs: 0,
      };

      // Assert
      expect(limits.maxTotalActiveLlm).toBeGreaterThanOrEqual(0);
    });
  });

  describe("RuntimeDispatchPermitResult型", () => {
    it("ディスパッチ許可結果を作成できる", () => {
      // Arrange & Act
      const result: RuntimeDispatchPermitResult = {
        allowed: true,
        waitedMs: 100,
        attempts: 2,
        timedOut: false,
        aborted: false,
        queuePosition: 1,
        queuedAhead: 0,
        orchestrationId: "orch-1",
        projectedRequests: 5,
        projectedLlm: 3,
        reasons: [],
      };

      // Assert
      expect(result.allowed).toBe(true);
      expect(result.queuePosition).toBe(1);
    });
  });
});
