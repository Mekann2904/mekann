/**
 * cross-instance-coordinator.ts 単体テスト
 * カバレッジ分析: registerInstance, unregisterInstance, updateHeartbeat,
 * getActiveInstanceCount, getMyParallelLimit, getDynamicParallelLimit
 *
 * 注意: ファイルシステム操作を伴うため、モックを使用
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from "vitest";
import * as fc from "fast-check";

// Node.jsモジュールのモック
vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(() => []),
  readFileSync: vi.fn(() => "{}"),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  renameSync: vi.fn(),
  openSync: vi.fn(() => 1),
  closeSync: vi.fn(),
  writeSync: vi.fn(),
}));

vi.mock("node:process", () => ({
  pid: 12345,
}));

vi.mock("./runtime-config.js", () => ({
  getRuntimeConfig: vi.fn(() => ({
    totalMaxLlm: 12,
    heartbeatIntervalMs: 15000,
    heartbeatTimeoutMs: 60000,
  })),
}));

import {
  registerInstance,
  unregisterInstance,
  setCoordinatorNowProvider,
  updateHeartbeat,
  cleanupDeadInstances,
  getActiveInstanceCount,
  getActiveInstances,
  getMyParallelLimit,
  getDynamicParallelLimit,
  getCoordinatorStatus,
  isCoordinatorInitialized,
  getTotalMaxLlm,
  getEnvOverrides,
  setActiveModel,
  clearActiveModel,
  clearAllActiveModels,
  broadcastQueueState,
  getRemoteQueueStates,
  getClusterRuntimeUsage,
  getWorkStealingSummary,
  isIdle,
  getStealingStats,
  resetStealingStats,
  updateRuntimeUsage,
  resetHeartbeatDebounce,
} from "../../../.pi/lib/cross-instance-coordinator.js";

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";

// ============================================================================
// モックリセット
// ============================================================================

describe("cross-instance-coordinator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setCoordinatorNowProvider();
    // テスト間でインスタンス状態をリセット
    try {
      unregisterInstance();
    } catch {
      // ignore
    }
  });

  afterEach(() => {
    setCoordinatorNowProvider();
    try {
      unregisterInstance();
    } catch {
      // ignore
    }
  });

  // ==========================================================================
  // registerInstance テスト
  // ==========================================================================

  describe("registerInstance", () => {
    it("registerInstance_新規登録_ディレクトリ作成", () => {
      // Arrange
      vi.mocked(existsSync).mockReturnValue(false);

      // Act
      registerInstance("test-session", "/test/cwd");

      // Assert
      expect(mkdirSync).toHaveBeenCalled();
      expect(writeFileSync).toHaveBeenCalled();
    });

    it("registerInstance_2回目_ハートビート更新のみ", () => {
      // Arrange
      vi.mocked(existsSync).mockReturnValue(false);
      registerInstance("test-session", "/test/cwd");
      vi.clearAllMocks();

      // Act
      registerInstance("test-session", "/test/cwd");

      // Assert - 2回目はwriteFileSyncが呼ばれる（ハートビート更新）
      expect(writeFileSync).toHaveBeenCalled();
    });

    it("registerInstance_設定オーバーライド適用", () => {
      // Arrange
      vi.mocked(existsSync).mockReturnValue(false);

      // Act
      registerInstance("test-session", "/test/cwd", {
        totalMaxLlm: 10,
      });

      // Assert
      expect(writeFileSync).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // unregisterInstance テスト
  // ==========================================================================

  describe("unregisterInstance", () => {
    it("unregisterInstance_未登録_エラーなし", () => {
      // Arrange & Act & Assert
      expect(() => unregisterInstance()).not.toThrow();
    });

    it("unregisterInstance_登録済み_正常終了", () => {
      // Arrange
      vi.mocked(existsSync).mockReturnValue(false);
      registerInstance("test-session", "/test/cwd");

      // Act & Assert - エラーにならないことを確認
      expect(() => unregisterInstance()).not.toThrow();
    });
  });

  // ==========================================================================
  // updateHeartbeat テスト
  // ==========================================================================

  describe("updateHeartbeat", () => {
    it("updateHeartbeat_未登録_エラーなし", () => {
      // Arrange & Act & Assert
      expect(() => updateHeartbeat()).not.toThrow();
    });

    it("updateHeartbeat_登録済み_ファイル更新", () => {
      // Arrange
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        instanceId: "test-id",
        pid: 12345,
        sessionId: "test-session",
        startedAt: new Date().toISOString(),
        lastHeartbeat: new Date().toISOString(),
        cwd: "/test",
        activeModels: [],
      }));
      registerInstance("test-session", "/test/cwd");
      vi.clearAllMocks();
      resetHeartbeatDebounce();

      // Act
      updateHeartbeat();

      // Assert
      expect(writeFileSync).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // getActiveInstanceCount テスト
  // ==========================================================================

  describe("getActiveInstanceCount", () => {
    it("getActiveInstanceCount_未登録_1返却", () => {
      // Arrange & Act
      const result = getActiveInstanceCount();

      // Assert
      expect(result).toBe(1);
    });

    it("getActiveInstanceCount_登録済み_アクティブ数返却", () => {
      // Arrange
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(readdirSync).mockReturnValue([]);
      registerInstance("test-session", "/test/cwd");

      // Act
      const result = getActiveInstanceCount();

      // Assert
      expect(result).toBeGreaterThanOrEqual(1);
    });
  });

  // ==========================================================================
  // getMyParallelLimit テスト
  // ==========================================================================

  describe("getMyParallelLimit", () => {
    it("getMyParallelLimit_未登録_1返却", () => {
      // Arrange & Act
      const result = getMyParallelLimit();

      // Assert
      expect(result).toBe(1);
    });

    it("getMyParallelLimit_登録済み_計算された制限返却", () => {
      // Arrange
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(readdirSync).mockReturnValue([]);
      registerInstance("test-session", "/test/cwd");

      // Act
      const result = getMyParallelLimit();

      // Assert
      expect(result).toBeGreaterThanOrEqual(1);
    });

    it("getMyParallelLimit_複数インスタンス_分割", () => {
      // Arrange
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(readdirSync).mockReturnValue([
        "inst1.lock",
        "inst2.lock",
        "inst3.lock",
      ]);
      vi.mocked(readFileSync).mockImplementation((path: string) => {
        return JSON.stringify({
          instanceId: path.includes("inst1") ? "inst1" : "inst2",
          pid: 12345,
          sessionId: "session",
          startedAt: new Date().toISOString(),
          lastHeartbeat: new Date().toISOString(),
          cwd: "/test",
          activeModels: [],
        });
      });
      registerInstance("test-session", "/test/cwd", { totalMaxLlm: 12 });

      // Act
      const result = getMyParallelLimit();

      // Assert
      expect(result).toBeGreaterThanOrEqual(1);
    });
  });

  // ==========================================================================
  // getDynamicParallelLimit テスト
  // ==========================================================================

  describe("getDynamicParallelLimit", () => {
    it("getDynamicParallelLimit_未登録_1返却", () => {
      // Arrange & Act
      const result = getDynamicParallelLimit(0);

      // Assert
      expect(result).toBe(1);
    });

    it("getDynamicParallelLimit_登録済み_計算返却", () => {
      // Arrange
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(readdirSync).mockReturnValue([]);
      registerInstance("test-session", "/test/cwd");

      // Act
      const result = getDynamicParallelLimit(5);

      // Assert
      expect(result).toBeGreaterThanOrEqual(1);
    });
  });

  // ==========================================================================
  // getCoordinatorStatus テスト
  // ==========================================================================

  describe("getCoordinatorStatus", () => {
    it("getCoordinatorStatus_未登録_未登録状態返却", () => {
      // Arrange & Act
      const result = getCoordinatorStatus();

      // Assert
      expect(result.registered).toBe(false);
      expect(result.myInstanceId).toBeNull();
    });

    it("getCoordinatorStatus_登録済み_詳細返却", () => {
      // Arrange
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(readdirSync).mockReturnValue([]);
      registerInstance("test-session", "/test/cwd");

      // Act
      const result = getCoordinatorStatus();

      // Assert
      expect(result.registered).toBe(true);
      expect(result.myInstanceId).not.toBeNull();
      expect(result.config).not.toBeNull();
    });
  });

  // ==========================================================================
  // isCoordinatorInitialized テスト
  // ==========================================================================

  describe("isCoordinatorInitialized", () => {
    it("isCoordinatorInitialized_未登録_false返却", () => {
      // Arrange & Act
      const result = isCoordinatorInitialized();

      // Assert
      expect(result).toBe(false);
    });

    it("isCoordinatorInitialized_登録済み_true返却", () => {
      // Arrange
      vi.mocked(existsSync).mockReturnValue(false);
      registerInstance("test-session", "/test/cwd");

      // Act
      const result = isCoordinatorInitialized();

      // Assert
      expect(result).toBe(true);
    });
  });

  // ==========================================================================
  // getTotalMaxLlm テスト
  // ==========================================================================

  describe("getTotalMaxLlm", () => {
    it("getTotalMaxLlm_未登録_デフォルト返却", () => {
      // Arrange & Act
      const result = getTotalMaxLlm();

      // Assert
      expect(result).toBe(12); // runtime-configのデフォルト
    });

    it("getTotalMaxLlm_登録済み_設定値返却", () => {
      // Arrange
      vi.mocked(existsSync).mockReturnValue(false);
      registerInstance("test-session", "/test/cwd", { totalMaxLlm: 10 });

      // Act
      const result = getTotalMaxLlm();

      // Assert
      expect(result).toBe(10);
    });
  });

  // ==========================================================================
  // getEnvOverrides テスト
  // ==========================================================================

  describe("getEnvOverrides", () => {
    it("getEnvOverrides_環境変数なし_空オブジェクト", () => {
      // Arrange - 環境変数なし

      // Act
      const result = getEnvOverrides();

      // Assert
      expect(Object.keys(result)).toHaveLength(0);
    });

    it("getEnvOverrides_環境変数あり_パース", () => {
      // Arrange
      const originalEnv = process.env.PI_TOTAL_MAX_LLM;
      process.env.PI_TOTAL_MAX_LLM = "8";

      // Act
      const result = getEnvOverrides();

      // Assert
      expect(result.totalMaxLlm).toBe(8);

      // Cleanup
      if (originalEnv === undefined) {
        delete process.env.PI_TOTAL_MAX_LLM;
      } else {
        process.env.PI_TOTAL_MAX_LLM = originalEnv;
      }
    });
  });

  // ==========================================================================
  // setActiveModel / clearActiveModel テスト
  // ==========================================================================

  describe("setActiveModel / clearActiveModel", () => {
    beforeEach(() => {
      vi.mocked(existsSync).mockReturnValue(false);
      registerInstance("test-session", "/test/cwd");
    });

    it("setActiveModel_モデル追加", () => {
      // Arrange
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        instanceId: "test-id",
        pid: 12345,
        sessionId: "test-session",
        startedAt: new Date().toISOString(),
        lastHeartbeat: new Date().toISOString(),
        cwd: "/test",
        activeModels: [],
      }));

      // Act
      setActiveModel("openai", "gpt-4");

      // Assert
      expect(writeFileSync).toHaveBeenCalled();
    });

    it("clearActiveModel_モデル削除", () => {
      // Arrange
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        instanceId: "test-id",
        pid: 12345,
        sessionId: "test-session",
        startedAt: new Date().toISOString(),
        lastHeartbeat: new Date().toISOString(),
        cwd: "/test",
        activeModels: [{ provider: "openai", model: "gpt-4", since: new Date().toISOString() }],
      }));

      // Act
      clearActiveModel("openai", "gpt-4");

      // Assert
      expect(writeFileSync).toHaveBeenCalled();
    });

    it("clearAllActiveModels_全削除", () => {
      // Arrange
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        instanceId: "test-id",
        pid: 12345,
        sessionId: "test-session",
        startedAt: new Date().toISOString(),
        lastHeartbeat: new Date().toISOString(),
        cwd: "/test",
        activeModels: [
          { provider: "openai", model: "gpt-4", since: new Date().toISOString() },
          { provider: "anthropic", model: "claude", since: new Date().toISOString() },
        ],
      }));

      // Act
      clearAllActiveModels();

      // Assert
      expect(writeFileSync).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // broadcastQueueState / getRemoteQueueStates テスト
  // ==========================================================================

  describe("broadcastQueueState / getRemoteQueueStates", () => {
    beforeEach(() => {
      vi.mocked(existsSync).mockReturnValue(false);
      registerInstance("test-session", "/test/cwd");
    });

    it("broadcastQueueState_状態書き込み", () => {
      // Arrange & Act
      broadcastQueueState({
        pendingTaskCount: 5,
        activeOrchestrations: 2,
      });

      // Assert
      expect(writeFileSync).toHaveBeenCalled();
    });

    it("getRemoteQueueStates_未登録_空配列", () => {
      // Arrange
      unregisterInstance();

      // Act
      const result = getRemoteQueueStates();

      // Assert
      expect(result).toHaveLength(0);
    });

    it("getRemoteQueueStates_heartbeatIntervalOverrideで古い状態を除外", () => {
      // heartbeatIntervalMs=1000ms の場合、5秒前の更新は stale 扱い
      unregisterInstance();
      vi.mocked(existsSync).mockReturnValue(false);
      const fixedNow = 1_700_000_005_000;
      setCoordinatorNowProvider(() => fixedNow);
      registerInstance("test-session", "/test/cwd", { heartbeatIntervalMs: 1000 });

      vi.mocked(readdirSync).mockReturnValue(["remote-instance.json"] as any);
      vi.mocked(readFileSync).mockImplementation((path: any) => {
        const pathText = String(path);
        if (pathText.includes("remote-instance.json")) {
          return JSON.stringify({
            instanceId: "remote-1",
            timestamp: new Date(fixedNow - 5000).toISOString(),
            pendingTaskCount: 3,
            activeOrchestrations: 1,
            stealableEntries: [],
          });
        }
        return JSON.stringify({});
      });

      const result = getRemoteQueueStates();
      expect(result).toHaveLength(0);
    });
  });

  // ==========================================================================
  // getWorkStealingSummary テスト
  // ==========================================================================

  describe("getWorkStealingSummary", () => {
    it("getWorkStealingSummary_未登録_0返却", () => {
      // Arrange & Act
      const result = getWorkStealingSummary();

      // Assert
      expect(result.remoteInstances).toBe(0);
      expect(result.totalPendingTasks).toBe(0);
    });
  });

  describe("updateRuntimeUsage / getClusterRuntimeUsage", () => {
    it("updateRuntimeUsage_書き込み呼び出し", () => {
      vi.mocked(existsSync).mockReturnValue(false);
      registerInstance("test-session", "/test/cwd");

      updateRuntimeUsage(3, 2);

      expect(writeFileSync).toHaveBeenCalled();
    });

    it("getClusterRuntimeUsage_集計返却", () => {
      vi.mocked(existsSync).mockReturnValue(false);
      registerInstance("test-session", "/test/cwd");
      vi.mocked(readdirSync).mockReturnValue(["inst1.lock", "inst2.lock"] as any);
      vi.mocked(readFileSync).mockImplementation((path: any) => {
        const file = String(path);
        if (file.includes("inst1.lock")) {
          return JSON.stringify({
            instanceId: "inst1",
            pid: 1,
            sessionId: "s1",
            startedAt: new Date().toISOString(),
            lastHeartbeat: new Date().toISOString(),
            cwd: "/tmp",
            activeModels: [],
            activeRequestCount: 2,
            activeLlmCount: 1,
          });
        }
        return JSON.stringify({
          instanceId: "inst2",
          pid: 2,
          sessionId: "s2",
          startedAt: new Date().toISOString(),
          lastHeartbeat: new Date().toISOString(),
          cwd: "/tmp",
          activeModels: [],
          activeRequestCount: 4,
          activeLlmCount: 3,
        });
      });

      const usage = getClusterRuntimeUsage();
      expect(usage.totalActiveRequests).toBe(6);
      expect(usage.totalActiveLlm).toBe(4);
      expect(usage.instanceCount).toBe(2);
    });
  });

  // ==========================================================================
  // isIdle テスト
  // ==========================================================================

  describe("isIdle", () => {
    it("isIdle_未登録_true返却", () => {
      // Arrange & Act
      const result = isIdle();

      // Assert
      expect(result).toBe(true);
    });

    it("isIdle_登録済み_状態確認", () => {
      // Arrange
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        instanceId: "test-id",
        pid: 12345,
        sessionId: "test-session",
        startedAt: new Date().toISOString(),
        lastHeartbeat: new Date().toISOString(),
        cwd: "/test",
        activeModels: [],
        pendingTaskCount: 0,
      }));
      registerInstance("test-session", "/test/cwd");

      // Act
      const result = isIdle();

      // Assert
      expect(result).toBe(true);
    });
  });

  // ==========================================================================
  // getStealingStats / resetStealingStats テスト
  // ==========================================================================

  describe("getStealingStats / resetStealingStats", () => {
    it("getStealingStats_初期状態_0返却", () => {
      // Arrange & Act
      const result = getStealingStats();

      // Assert
      expect(result.totalAttempts).toBe(0);
      expect(result.successfulSteals).toBe(0);
    });

    it("resetStealingStats_リセット", () => {
      // Arrange & Act
      resetStealingStats();
      const result = getStealingStats();

      // Assert
      expect(result.totalAttempts).toBe(0);
    });
  });
});

// ============================================================================
// プロパティベーステスト
// ============================================================================

describe("プロパティベーステスト", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    try {
      unregisterInstance();
    } catch {
      // ignore
    }
  });

  afterEach(() => {
    try {
      unregisterInstance();
    } catch {
      // ignore
    }
  });

  it("getMyParallelLimit_常に1以上", () => {
    // fast-checkの複数回実行に対応するため、各反復でクリーンアップ
    const results: boolean[] = [];
    
    for (const totalMaxLlm of [1, 5, 10, 15, 20]) {
      try {
        unregisterInstance();
      } catch {
        // ignore
      }
      
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(readdirSync).mockReturnValue([]);
      registerInstance("test-session", "/test/cwd", { totalMaxLlm });

      const result = getMyParallelLimit();
      results.push(result >= 1 && result <= totalMaxLlm);
    }
    
    expect(results.every(r => r)).toBe(true);
  });
});

// ============================================================================
// 境界値テスト
// ============================================================================

describe("境界値テスト", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    try {
      unregisterInstance();
    } catch {
      // ignore
    }
  });

  afterEach(() => {
    try {
      unregisterInstance();
    } catch {
      // ignore
    }
  });

  it("totalMaxLlm_1_最小並列", () => {
    // Arrange
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readdirSync).mockReturnValue([]);
    registerInstance("test-session", "/test/cwd", { totalMaxLlm: 1 });

    // Act
    const result = getMyParallelLimit();

    // Assert
    expect(result).toBe(1);
  });

  it("大量のインスタンス_並列分割", () => {
    // Arrange
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readdirSync).mockReturnValue(
      Array(100).fill(null).map((_, i) => `inst${i}.lock`)
    );
    vi.mocked(readFileSync).mockImplementation((path: string) => {
      return JSON.stringify({
        instanceId: path.toString(),
        pid: 12345,
        sessionId: "session",
        startedAt: new Date().toISOString(),
        lastHeartbeat: new Date().toISOString(),
        cwd: "/test",
        activeModels: [],
      });
    });
    registerInstance("test-session", "/test/cwd", { totalMaxLlm: 100 });

    // Act
    const result = getMyParallelLimit();

    // Assert
    expect(result).toBeGreaterThanOrEqual(1);
  });
});
