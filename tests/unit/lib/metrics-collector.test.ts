/**
 * metrics-collector.ts 単体テスト
 * カバレッジ分析: initMetricsCollector, getMetricsCollector, getMetrics, getSummary
 */
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import * as fc from "fast-check";

import {
  initMetricsCollector,
  getMetricsCollector,
  resetMetricsCollector,
  isMetricsCollectorInitialized,
  getMetricsConfigFromEnv,
  type SchedulerMetrics,
  type MetricsSummary,
  type TaskCompletionEvent,
} from "../../../.pi/lib/metrics-collector.js";

// ============================================================================
// initMetricsCollector テスト
// ============================================================================

describe("initMetricsCollector", () => {
  beforeEach(() => {
    resetMetricsCollector();
  });

  afterEach(() => {
    resetMetricsCollector();
  });

  it("initMetricsCollector_基本_初期化成功", () => {
    // Arrange & Act
    initMetricsCollector();

    // Assert
    expect(isMetricsCollectorInitialized()).toBe(true);
  });

  it("initMetricsCollector_設定オーバーライド_反映", () => {
    // Arrange & Act - 相対パスを使用（カレントディレクトリ内に作成）
    initMetricsCollector({
      metricsDir: ".pi/metrics-test",
      collectionIntervalMs: 30000,
    });

    // Assert
    expect(isMetricsCollectorInitialized()).toBe(true);
    resetMetricsCollector(); // クリーンアップ
  });

  it("initMetricsCollector_重複初期化_スキップ", () => {
    // Arrange
    initMetricsCollector();

    // Act - 2回目の初期化
    initMetricsCollector();

    // Assert - エラーなく完了
    expect(isMetricsCollectorInitialized()).toBe(true);
  });
});

// ============================================================================
// resetMetricsCollector テスト
// ============================================================================

describe("resetMetricsCollector", () => {
  it("resetMetricsCollector_初期化後リセット", () => {
    // Arrange
    initMetricsCollector();

    // Act
    resetMetricsCollector();

    // Assert
    expect(isMetricsCollectorInitialized()).toBe(false);
  });

  it("resetMetricsCollector_未初期化状態でリセット", () => {
    // Arrange & Act & Assert - エラーなく完了
    expect(() => resetMetricsCollector()).not.toThrow();
  });
});

// ============================================================================
// isMetricsCollectorInitialized テスト
// ============================================================================

describe("isMetricsCollectorInitialized", () => {
  beforeEach(() => {
    resetMetricsCollector();
  });

  it("isMetricsCollectorInitialized_初期化前_false", () => {
    // Arrange & Act & Assert
    expect(isMetricsCollectorInitialized()).toBe(false);
  });

  it("isMetricsCollectorInitialized_初期化後_true", () => {
    // Arrange
    initMetricsCollector();

    // Act & Assert
    expect(isMetricsCollectorInitialized()).toBe(true);
  });

  it("isMetricsCollectorInitialized_リセット後_false", () => {
    // Arrange
    initMetricsCollector();
    resetMetricsCollector();

    // Act & Assert
    expect(isMetricsCollectorInitialized()).toBe(false);
  });
});

// ============================================================================
// getMetricsCollector テスト
// ============================================================================

describe("getMetricsCollector", () => {
  beforeEach(() => {
    resetMetricsCollector();
  });

  afterEach(() => {
    resetMetricsCollector();
  });

  it("getMetricsCollector_基本_API返却", () => {
    // Arrange & Act
    const api = getMetricsCollector();

    // Assert
    expect(api).toHaveProperty("recordTaskCompletion");
    expect(api).toHaveProperty("recordPreemption");
    expect(api).toHaveProperty("recordWorkSteal");
    expect(api).toHaveProperty("recordRateLimitHit");
    expect(api).toHaveProperty("updateQueueStats");
    expect(api).toHaveProperty("getMetrics");
    expect(api).toHaveProperty("getSummary");
    expect(api).toHaveProperty("getStealingStats");
    expect(api).toHaveProperty("startCollection");
    expect(api).toHaveProperty("stopCollection");
  });

  it("getMetricsCollector_未初期化_自動初期化", () => {
    // Arrange & Act
    const api = getMetricsCollector();

    // Assert
    expect(isMetricsCollectorInitialized()).toBe(true);
  });
});

// ============================================================================
// getMetrics テスト
// ============================================================================

describe("getMetrics", () => {
  beforeEach(() => {
    resetMetricsCollector();
  });

  afterEach(() => {
    resetMetricsCollector();
  });

  it("getMetrics_基本_メトリクス返却", () => {
    // Arrange
    const api = getMetricsCollector();

    // Act
    const result = api.getMetrics();

    // Assert
    expect(result).toHaveProperty("timestamp");
    expect(result).toHaveProperty("queueDepth");
    expect(result).toHaveProperty("activeTasks");
    expect(result).toHaveProperty("avgWaitMs");
    expect(result).toHaveProperty("p50WaitMs");
    expect(result).toHaveProperty("p99WaitMs");
    expect(result).toHaveProperty("tasksCompletedPerMin");
    expect(result).toHaveProperty("rateLimitHits");
    expect(result).toHaveProperty("preemptCount");
    expect(result).toHaveProperty("stealCount");
  });

  it("getMetrics_初期状態_ゼロ値", () => {
    // Arrange
    const api = getMetricsCollector();

    // Act
    const result = api.getMetrics();

    // Assert
    expect(result.queueDepth).toBe(0);
    expect(result.activeTasks).toBe(0);
    expect(result.rateLimitHits).toBe(0);
    expect(result.preemptCount).toBe(0);
    expect(result.stealCount).toBe(0);
  });

  it("getMetrics_タイムスタンプ_現在時刻付近", () => {
    // Arrange
    const api = getMetricsCollector();
    const before = Date.now();

    // Act
    const result = api.getMetrics();
    const after = Date.now();

    // Assert
    expect(result.timestamp).toBeGreaterThanOrEqual(before);
    expect(result.timestamp).toBeLessThanOrEqual(after);
  });
});

// ============================================================================
// recordTaskCompletion テスト
// ============================================================================

describe("recordTaskCompletion", () => {
  beforeEach(() => {
    resetMetricsCollector();
  });

  afterEach(() => {
    resetMetricsCollector();
  });

  it("recordTaskCompletion_基本_記録成功", () => {
    // Arrange
    const api = getMetricsCollector();

    // Act
    api.recordTaskCompletion(
      { id: "task-1", source: "test", provider: "openai", model: "gpt-4", priority: "high" },
      { waitedMs: 1000, executionMs: 5000, success: true }
    );

    // Assert
    const metrics = api.getMetrics();
    expect(metrics.tasksCompletedPerMin).toBeGreaterThanOrEqual(0);
  });

  it("recordTaskCompletion_失敗タスク_記録", () => {
    // Arrange
    const api = getMetricsCollector();

    // Act
    api.recordTaskCompletion(
      { id: "task-1", source: "test", provider: "openai", model: "gpt-4", priority: "high" },
      { waitedMs: 1000, executionMs: 5000, success: false }
    );

    // Assert - エラーなく完了
    const metrics = api.getMetrics();
    expect(metrics).toBeDefined();
  });
});

// ============================================================================
// recordPreemption テスト
// ============================================================================

describe("recordPreemption", () => {
  beforeEach(() => {
    resetMetricsCollector();
  });

  afterEach(() => {
    resetMetricsCollector();
  });

  it("recordPreemption_基本_記録成功", () => {
    // Arrange
    const api = getMetricsCollector();

    // Act
    api.recordPreemption("task-1", "rate-limit");

    // Assert
    const metrics = api.getMetrics();
    expect(metrics.preemptCount).toBe(1);
  });

  it("recordPreemption_複数回_カウント増加", () => {
    // Arrange
    const api = getMetricsCollector();

    // Act
    api.recordPreemption("task-1", "rate-limit");
    api.recordPreemption("task-2", "timeout");
    api.recordPreemption("task-3", "capacity");

    // Assert
    const metrics = api.getMetrics();
    expect(metrics.preemptCount).toBe(3);
  });
});

// ============================================================================
// recordWorkSteal テスト
// ============================================================================

describe("recordWorkSteal", () => {
  beforeEach(() => {
    resetMetricsCollector();
  });

  afterEach(() => {
    resetMetricsCollector();
  });

  it("recordWorkSteal_基本_記録成功", () => {
    // Arrange
    const api = getMetricsCollector();

    // Act
    api.recordWorkSteal("instance-1", "task-1");

    // Assert
    const metrics = api.getMetrics();
    expect(metrics.stealCount).toBe(1);
  });
});

// ============================================================================
// recordRateLimitHit テスト
// ============================================================================

describe("recordRateLimitHit", () => {
  beforeEach(() => {
    resetMetricsCollector();
  });

  afterEach(() => {
    resetMetricsCollector();
  });

  it("recordRateLimitHit_基本_記録成功", () => {
    // Arrange
    const api = getMetricsCollector();

    // Act
    api.recordRateLimitHit();

    // Assert
    const metrics = api.getMetrics();
    expect(metrics.rateLimitHits).toBe(1);
  });

  it("recordRateLimitHit_複数回_カウント増加", () => {
    // Arrange
    const api = getMetricsCollector();

    // Act
    api.recordRateLimitHit();
    api.recordRateLimitHit();
    api.recordRateLimitHit();

    // Assert
    const metrics = api.getMetrics();
    expect(metrics.rateLimitHits).toBe(3);
  });
});

// ============================================================================
// updateQueueStats テスト
// ============================================================================

describe("updateQueueStats", () => {
  beforeEach(() => {
    resetMetricsCollector();
  });

  afterEach(() => {
    resetMetricsCollector();
  });

  it("updateQueueStats_基本_更新成功", () => {
    // Arrange
    const api = getMetricsCollector();

    // Act
    api.updateQueueStats(5, 3);

    // Assert
    const metrics = api.getMetrics();
    expect(metrics.queueDepth).toBe(5);
    expect(metrics.activeTasks).toBe(3);
  });

  it("updateQueueStats_複数回_最新値反映", () => {
    // Arrange
    const api = getMetricsCollector();

    // Act
    api.updateQueueStats(5, 3);
    api.updateQueueStats(10, 7);

    // Assert
    const metrics = api.getMetrics();
    expect(metrics.queueDepth).toBe(10);
    expect(metrics.activeTasks).toBe(7);
  });
});

// ============================================================================
// getSummary テスト
// ============================================================================

describe("getSummary", () => {
  beforeEach(() => {
    resetMetricsCollector();
  });

  afterEach(() => {
    resetMetricsCollector();
  });

  it("getSummary_基本_サマリー返却", () => {
    // Arrange
    const api = getMetricsCollector();

    // Act
    const result = api.getSummary(60000); // 1分間

    // Assert
    expect(result).toHaveProperty("periodStartMs");
    expect(result).toHaveProperty("periodEndMs");
    expect(result).toHaveProperty("totalTasksCompleted");
    expect(result).toHaveProperty("successRate");
    expect(result).toHaveProperty("avgWaitMs");
    expect(result).toHaveProperty("avgExecutionMs");
    expect(result).toHaveProperty("p50WaitMs");
    expect(result).toHaveProperty("p99WaitMs");
    expect(result).toHaveProperty("byProvider");
    expect(result).toHaveProperty("byPriority");
  });

  it("getSummary_初期状態_ゼロ値", () => {
    // Arrange
    const api = getMetricsCollector();

    // Act
    const result = api.getSummary(60000);

    // Assert
    expect(result.totalTasksCompleted).toBe(0);
    expect(result.successRate).toBe(0);
    expect(result.totalPreemptions).toBe(0);
    expect(result.totalSteals).toBe(0);
  });

  it("getSummary_タスク完了後_集計反映", () => {
    // Arrange
    const api = getMetricsCollector();
    api.recordTaskCompletion(
      { id: "task-1", source: "test", provider: "openai", model: "gpt-4", priority: "high" },
      { waitedMs: 1000, executionMs: 5000, success: true }
    );

    // Act
    const result = api.getSummary(60000);

    // Assert
    expect(result.totalTasksCompleted).toBe(1);
    expect(result.successRate).toBe(1);
  });
});

// ============================================================================
// getStealingStats テスト
// ============================================================================

describe("getStealingStats", () => {
  beforeEach(() => {
    resetMetricsCollector();
  });

  afterEach(() => {
    resetMetricsCollector();
  });

  it("getStealingStats_基本_統計返却", () => {
    // Arrange
    const api = getMetricsCollector();

    // Act
    const result = api.getStealingStats();

    // Assert
    expect(result).toHaveProperty("totalAttempts");
    expect(result).toHaveProperty("successfulSteals");
    expect(result).toHaveProperty("failedAttempts");
    expect(result).toHaveProperty("successRate");
    expect(result).toHaveProperty("avgLatencyMs");
    expect(result).toHaveProperty("lastStealAt");
  });

  it("getStealingStats_初期状態_ゼロ値", () => {
    // Arrange
    const api = getMetricsCollector();

    // Act
    const result = api.getStealingStats();

    // Assert
    expect(result.totalAttempts).toBe(0);
    expect(result.successfulSteals).toBe(0);
    expect(result.lastStealAt).toBeNull();
  });
});

// ============================================================================
// getMetricsConfigFromEnv テスト
// ============================================================================

describe("getMetricsConfigFromEnv", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("getMetricsConfigFromEnv_環境変数なし_空オブジェクト", () => {
    // Arrange
    delete process.env.PI_METRICS_DIR;
    delete process.env.PI_METRICS_INTERVAL_MS;
    delete process.env.PI_METRICS_MAX_FILE_SIZE;
    delete process.env.PI_METRICS_ENABLE_LOGGING;

    // Act
    const result = getMetricsConfigFromEnv();

    // Assert
    expect(Object.keys(result).length).toBe(0);
  });

  it("getMetricsConfigFromEnv_環境変数あり_反映", () => {
    // Arrange
    process.env.PI_METRICS_DIR = "/custom/metrics";
    process.env.PI_METRICS_INTERVAL_MS = "30000";
    process.env.PI_METRICS_MAX_FILE_SIZE = "5242880";
    process.env.PI_METRICS_ENABLE_LOGGING = "false";

    // Act
    const result = getMetricsConfigFromEnv();

    // Assert
    expect(result.metricsDir).toBe("/custom/metrics");
    expect(result.collectionIntervalMs).toBe(30000);
    expect(result.maxLogFileSizeBytes).toBe(5242880);
    expect(result.enableLogging).toBe(false);
  });

  it("getMetricsConfigFromEnv_無効な数値_無視", () => {
    // Arrange
    process.env.PI_METRICS_INTERVAL_MS = "invalid";

    // Act
    const result = getMetricsConfigFromEnv();

    // Assert
    expect(result.collectionIntervalMs).toBeUndefined();
  });

  it("getMetricsConfigFromEnv_負の数値_無視", () => {
    // Arrange
    process.env.PI_METRICS_INTERVAL_MS = "-1000";

    // Act
    const result = getMetricsConfigFromEnv();

    // Assert
    expect(result.collectionIntervalMs).toBeUndefined();
  });
});

// ============================================================================
// startCollection / stopCollection テスト
// ============================================================================

describe("startCollection / stopCollection", () => {
  beforeEach(() => {
    resetMetricsCollector();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetMetricsCollector();
  });

  it("startCollection_タイマー開始", () => {
    // Arrange
    const api = getMetricsCollector();

    // Act
    api.startCollection(1000);

    // Assert - エラーなく完了
    expect(true).toBe(true);
  });

  it("stopCollection_タイマー停止", () => {
    // Arrange
    const api = getMetricsCollector();
    api.startCollection(1000);

    // Act & Assert - エラーなく完了
    api.stopCollection();
    expect(true).toBe(true);
  });

  it("stopCollection_タイマーなし_エラーなし", () => {
    // Arrange
    const api = getMetricsCollector();

    // Act & Assert - エラーなく完了
    api.stopCollection();
    expect(true).toBe(true);
  });
});

// ============================================================================
// プロパティベーステスト
// ============================================================================

describe("プロパティベーステスト", () => {
  beforeEach(() => {
    resetMetricsCollector();
  });

  afterEach(() => {
    resetMetricsCollector();
  });

  it("getMetrics_常に有効な構造", () => {
    fc.assert(
      fc.property(fc.constant(undefined), () => {
        resetMetricsCollector();
        const api = getMetricsCollector();
        const metrics = api.getMetrics();

        return (
          typeof metrics.timestamp === "number" &&
          typeof metrics.queueDepth === "number" &&
          typeof metrics.activeTasks === "number" &&
          typeof metrics.rateLimitHits === "number"
        );
      })
    );
  });

  it("getSummary_常に有効な構造", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1000, max: 3600000 }),
        (periodMs) => {
          resetMetricsCollector();
          const api = getMetricsCollector();
          const summary = api.getSummary(periodMs);

          return (
            typeof summary.totalTasksCompleted === "number" &&
            typeof summary.successRate === "number" &&
            typeof summary.byProvider === "object" &&
            typeof summary.byPriority === "object"
          );
        }
      )
    );
  });
});

// ============================================================================
// 境界値テスト
// ============================================================================

describe("境界値テスト", () => {
  beforeEach(() => {
    resetMetricsCollector();
  });

  afterEach(() => {
    resetMetricsCollector();
  });

  it("getSummary_ゼロ期間_処理可能", () => {
    // Arrange
    const api = getMetricsCollector();

    // Act
    const result = api.getSummary(0);

    // Assert
    expect(result).toBeDefined();
  });

  it("getSummary_非常に長い期間_処理可能", () => {
    // Arrange
    const api = getMetricsCollector();

    // Act
    const result = api.getSummary(365 * 24 * 60 * 60 * 1000); // 1年

    // Assert
    expect(result).toBeDefined();
  });

  it("updateQueueStats_大きな値_処理可能", () => {
    // Arrange
    const api = getMetricsCollector();

    // Act
    api.updateQueueStats(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);

    // Assert
    const metrics = api.getMetrics();
    expect(metrics.queueDepth).toBe(Number.MAX_SAFE_INTEGER);
  });
});
