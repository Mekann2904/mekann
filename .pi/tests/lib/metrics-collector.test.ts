/**
 * @file .pi/lib/metrics-collector.ts の単体テスト
 * @description スケジューラメトリクス収集システムのテスト
 * @testFramework vitest
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync, readdirSync, readFileSync } from "fs";
import { join } from "path";

import {
  initMetricsCollector,
  getMetricsCollector,
  resetMetricsCollector,
  isMetricsCollectorInitialized,
  recordStealingAttempt,
  getMetricsConfigFromEnv,
  recordParallelExecutionStart,
  recordParallelExecutionEnd,
  recordParallelWaitTime,
  recordParallelRateLimit,
  getParallelMetricsSnapshot,
  getParallelPatternStats,
  resetParallelMetrics,
} from "../../lib/metrics-collector.js";
import type {
  MetricsCollectorConfig,
  SchedulerMetrics,
  MetricsSummary,
  StealingStats,
  ParallelMetrics,
  ParallelPatternStats,
} from "../../lib/metrics-collector.js";

// ============================================================================
// Test Utilities
// ============================================================================

const TEST_METRICS_DIR = ".pi/tests/temp/metrics-collector";

function createTestConfig(overrides?: Partial<MetricsCollectorConfig>): MetricsCollectorConfig {
  return {
    metricsDir: TEST_METRICS_DIR,
    collectionIntervalMs: 1000,
    maxLogFileSizeBytes: 1024 * 1024, // 1MB
    maxLogFiles: 5,
    enableLogging: true,
    ...overrides,
  };
}

function cleanupTestDir(): void {
  try {
    rmSync(TEST_METRICS_DIR, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

function ensureTestDir(): void {
  cleanupTestDir();
  mkdirSync(TEST_METRICS_DIR, { recursive: true });
}

// ============================================================================
// Initialization Tests
// ============================================================================

describe("MetricsCollector", () => {
  beforeEach(() => {
    ensureTestDir();
    resetMetricsCollector();
    resetParallelMetrics();
    vi.useFakeTimers();
    delete process.env.PI_METRICS_DIR;
    delete process.env.PI_METRICS_INTERVAL_MS;
    delete process.env.PI_METRICS_MAX_FILE_SIZE;
    delete process.env.PI_METRICS_ENABLE_LOGGING;
  });

  afterEach(() => {
    vi.useRealTimers();
    resetMetricsCollector();
    resetParallelMetrics();
    cleanupTestDir();
    delete process.env.PI_METRICS_DIR;
    delete process.env.PI_METRICS_INTERVAL_MS;
    delete process.env.PI_METRICS_MAX_FILE_SIZE;
    delete process.env.PI_METRICS_ENABLE_LOGGING;
  });

  // ============================================================================
  // initMetricsCollector
  // ============================================================================

  describe("initMetricsCollector", () => {
    it("should_initialize_with_default_config", () => {
      // Arrange
      resetMetricsCollector();

      // Act
      initMetricsCollector();

      // Assert
      expect(isMetricsCollectorInitialized()).toBe(true);
    });

    it("should_accept_custom_config", () => {
      // Arrange
      const config = createTestConfig({ collectionIntervalMs: 5000 });

      // Act
      initMetricsCollector(config);

      // Assert
      expect(isMetricsCollectorInitialized()).toBe(true);
    });

    it("should_not_reinitialize_if_already_initialized", () => {
      // Arrange
      initMetricsCollector(createTestConfig({ maxLogFiles: 3 }));
      const collector1 = getMetricsCollector();
      collector1.recordTaskCompletion(
        { id: "task-1", source: "test", provider: "openai", model: "gpt-4", priority: "high" },
        { waitedMs: 100, executionMs: 200, success: true }
      );

      // Act: 2回目の初期化を試みる（無視されるべき）
      initMetricsCollector(createTestConfig({ maxLogFiles: 10 }));
      const collector2 = getMetricsCollector();

      // Assert: 状態が維持されている（再初期化されていない）
      const metrics = collector2.getMetrics();
      expect(metrics.avgWaitMs).toBe(100); // 最初の記録が維持されている
    });

    it("should_create_metrics_directory", () => {
      // Arrange
      const config = createTestConfig();

      // Act
      initMetricsCollector(config);

      // Assert
      expect(existsSync(TEST_METRICS_DIR)).toBe(true);
    });
  });

  // ============================================================================
  // getMetricsCollector
  // ============================================================================

  describe("getMetricsCollector", () => {
    it("should_return_collector_api", () => {
      // Arrange
      initMetricsCollector(createTestConfig());

      // Act
      const collector = getMetricsCollector();

      // Assert
      expect(collector).toBeDefined();
      expect(typeof collector.recordTaskCompletion).toBe("function");
      expect(typeof collector.recordPreemption).toBe("function");
      expect(typeof collector.recordWorkSteal).toBe("function");
      expect(typeof collector.recordRateLimitHit).toBe("function");
      expect(typeof collector.updateQueueStats).toBe("function");
      expect(typeof collector.getMetrics).toBe("function");
      expect(typeof collector.getSummary).toBe("function");
      expect(typeof collector.getStealingStats).toBe("function");
      expect(typeof collector.startCollection).toBe("function");
      expect(typeof collector.stopCollection).toBe("function");
    });

    it("should_auto_initialize_if_not_initialized", () => {
      // Arrange
      resetMetricsCollector();

      // Act
      const collector = getMetricsCollector();

      // Assert
      expect(collector).toBeDefined();
      expect(isMetricsCollectorInitialized()).toBe(true);
    });
  });

  // ============================================================================
  // recordTaskCompletion
  // ============================================================================

  describe("recordTaskCompletion", () => {
    it("should_record_successful_task_completion", () => {
      // Arrange
      initMetricsCollector(createTestConfig());
      const collector = getMetricsCollector();

      // Act
      collector.recordTaskCompletion(
        {
          id: "task-1",
          source: "test",
          provider: "openai",
          model: "gpt-4",
          priority: "high",
        },
        {
          waitedMs: 100,
          executionMs: 500,
          success: true,
        }
      );

      // Assert
      const metrics = collector.getMetrics();
      expect(metrics).toBeDefined();
    });

    it("should_record_failed_task_completion", () => {
      // Arrange
      initMetricsCollector(createTestConfig());
      const collector = getMetricsCollector();

      // Act
      collector.recordTaskCompletion(
        {
          id: "task-2",
          source: "test",
          provider: "openai",
          model: "gpt-4",
          priority: "low",
        },
        {
          waitedMs: 200,
          executionMs: 1000,
          success: false,
        }
      );

      // Assert
      const summary = collector.getSummary(60000);
      expect(summary.totalTasksCompleted).toBe(1);
    });

    it("should_update_wait_time_percentiles", () => {
      // Arrange
      initMetricsCollector(createTestConfig());
      const collector = getMetricsCollector();

      // Act: 複数のタスクを記録
      for (let i = 0; i < 100; i++) {
        collector.recordTaskCompletion(
          {
            id: `task-${i}`,
            source: "test",
            provider: "openai",
            model: "gpt-4",
            priority: "medium",
          },
          {
            waitedMs: i * 10,
            executionMs: 100,
            success: true,
          }
        );
      }

      // Assert
      const metrics = collector.getMetrics();
      expect(metrics.p50WaitMs).toBeGreaterThan(0);
      expect(metrics.p99WaitMs).toBeGreaterThan(metrics.p50WaitMs);
    });
  });

  // ============================================================================
  // recordPreemption
  // ============================================================================

  describe("recordPreemption", () => {
    it("should_record_preemption_event", () => {
      // Arrange
      initMetricsCollector(createTestConfig());
      const collector = getMetricsCollector();

      // Act
      collector.recordPreemption("task-1", "rate_limit");

      // Assert
      const metrics = collector.getMetrics();
      expect(metrics.preemptCount).toBe(1);
    });

    it("should_accumulate_preemptions", () => {
      // Arrange
      initMetricsCollector(createTestConfig());
      const collector = getMetricsCollector();

      // Act
      collector.recordPreemption("task-1", "rate_limit");
      collector.recordPreemption("task-2", "timeout");
      collector.recordPreemption("task-3", "priority");

      // Assert
      const metrics = collector.getMetrics();
      expect(metrics.preemptCount).toBe(3);
    });
  });

  // ============================================================================
  // recordWorkSteal
  // ============================================================================

  describe("recordWorkSteal", () => {
    it("should_record_work_steal_event", () => {
      // Arrange
      initMetricsCollector(createTestConfig());
      const collector = getMetricsCollector();

      // Act
      collector.recordWorkSteal("instance-1", "task-1");

      // Assert
      const metrics = collector.getMetrics();
      expect(metrics.stealCount).toBe(1);
    });

    it("should_update_stealing_stats", () => {
      // Arrange
      initMetricsCollector(createTestConfig());
      const collector = getMetricsCollector();

      // Act
      collector.recordWorkSteal("instance-1", "task-1");
      collector.recordWorkSteal("instance-2", "task-2");

      // Assert
      const stats = collector.getStealingStats();
      expect(stats.successfulSteals).toBe(2);
    });
  });

  // ============================================================================
  // recordRateLimitHit
  // ============================================================================

  describe("recordRateLimitHit", () => {
    it("should_record_rate_limit_hit", () => {
      // Arrange
      initMetricsCollector(createTestConfig());
      const collector = getMetricsCollector();

      // Act
      collector.recordRateLimitHit();

      // Assert
      const metrics = collector.getMetrics();
      expect(metrics.rateLimitHits).toBe(1);
    });

    it("should_accumulate_rate_limit_hits", () => {
      // Arrange
      initMetricsCollector(createTestConfig());
      const collector = getMetricsCollector();

      // Act
      collector.recordRateLimitHit();
      collector.recordRateLimitHit();
      collector.recordRateLimitHit();

      // Assert
      const metrics = collector.getMetrics();
      expect(metrics.rateLimitHits).toBe(3);
    });
  });

  // ============================================================================
  // updateQueueStats
  // ============================================================================

  describe("updateQueueStats", () => {
    it("should_update_queue_depth_and_active_tasks", () => {
      // Arrange
      initMetricsCollector(createTestConfig());
      const collector = getMetricsCollector();

      // Act
      collector.updateQueueStats(10, 5);

      // Assert
      const metrics = collector.getMetrics();
      expect(metrics.queueDepth).toBe(10);
      expect(metrics.activeTasks).toBe(5);
    });

    it("should_reflect_latest_values", () => {
      // Arrange
      initMetricsCollector(createTestConfig());
      const collector = getMetricsCollector();

      // Act
      collector.updateQueueStats(10, 5);
      collector.updateQueueStats(20, 8);

      // Assert
      const metrics = collector.getMetrics();
      expect(metrics.queueDepth).toBe(20);
      expect(metrics.activeTasks).toBe(8);
    });
  });

  // ============================================================================
  // getMetrics
  // ============================================================================

  describe("getMetrics", () => {
    it("should_return_current_metrics_snapshot", () => {
      // Arrange
      initMetricsCollector(createTestConfig());
      const collector = getMetricsCollector();
      collector.updateQueueStats(5, 3);

      // Act
      const metrics = collector.getMetrics();

      // Assert
      expect(metrics.timestamp).toBeGreaterThan(0);
      expect(metrics.queueDepth).toBe(5);
      expect(metrics.activeTasks).toBe(3);
      expect(typeof metrics.avgWaitMs).toBe("number");
      expect(typeof metrics.p50WaitMs).toBe("number");
      expect(typeof metrics.p99WaitMs).toBe("number");
      expect(typeof metrics.tasksCompletedPerMin).toBe("number");
    });

    it("should_calculate_throughput_correctly", () => {
      // Arrange
      initMetricsCollector(createTestConfig());
      const collector = getMetricsCollector();

      // Act: タスクを完了
      collector.recordTaskCompletion(
        {
          id: "task-1",
          source: "test",
          provider: "openai",
          model: "gpt-4",
          priority: "high",
        },
        {
          waitedMs: 100,
          executionMs: 500,
          success: true,
        }
      );

      // Assert
      const metrics = collector.getMetrics();
      expect(metrics.tasksCompletedPerMin).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================================================
  // getSummary
  // ============================================================================

  describe("getSummary", () => {
    it("should_return_metrics_summary_for_period", () => {
      // Arrange
      initMetricsCollector(createTestConfig());
      const collector = getMetricsCollector();

      // Act
      const summary = collector.getSummary(60000); // 1 minute

      // Assert
      expect(summary.periodStartMs).toBeGreaterThan(0);
      expect(summary.periodEndMs).toBeGreaterThan(0);
      expect(typeof summary.totalTasksCompleted).toBe("number");
      expect(typeof summary.successRate).toBe("number");
    });

    it("should_aggregate_by_provider", () => {
      // Arrange
      initMetricsCollector(createTestConfig());
      const collector = getMetricsCollector();

      // Act
      collector.recordTaskCompletion(
        {
          id: "task-1",
          source: "test",
          provider: "openai",
          model: "gpt-4",
          priority: "high",
        },
        {
          waitedMs: 100,
          executionMs: 500,
          success: true,
        }
      );
      collector.recordTaskCompletion(
        {
          id: "task-2",
          source: "test",
          provider: "anthropic",
          model: "claude-3",
          priority: "medium",
        },
        {
          waitedMs: 200,
          executionMs: 600,
          success: true,
        }
      );

      // Assert
      const summary = collector.getSummary(60000);
      expect(summary.byProvider["openai"]).toBeDefined();
      expect(summary.byProvider["anthropic"]).toBeDefined();
    });

    it("should_aggregate_by_priority", () => {
      // Arrange
      initMetricsCollector(createTestConfig());
      const collector = getMetricsCollector();

      // Act
      collector.recordTaskCompletion(
        {
          id: "task-1",
          source: "test",
          provider: "openai",
          model: "gpt-4",
          priority: "high",
        },
        {
          waitedMs: 100,
          executionMs: 500,
          success: true,
        }
      );
      collector.recordTaskCompletion(
        {
          id: "task-2",
          source: "test",
          provider: "openai",
          model: "gpt-4",
          priority: "low",
        },
        {
          waitedMs: 200,
          executionMs: 600,
          success: true,
        }
      );

      // Assert
      const summary = collector.getSummary(60000);
      expect(summary.byPriority["high"]).toBeDefined();
      expect(summary.byPriority["low"]).toBeDefined();
    });

    it("should_calculate_success_rate", () => {
      // Arrange
      initMetricsCollector(createTestConfig());
      const collector = getMetricsCollector();

      // Act: 3 success, 1 failure
      collector.recordTaskCompletion(
        { id: "t1", source: "test", provider: "openai", model: "gpt-4", priority: "high" },
        { waitedMs: 100, executionMs: 500, success: true }
      );
      collector.recordTaskCompletion(
        { id: "t2", source: "test", provider: "openai", model: "gpt-4", priority: "high" },
        { waitedMs: 100, executionMs: 500, success: true }
      );
      collector.recordTaskCompletion(
        { id: "t3", source: "test", provider: "openai", model: "gpt-4", priority: "high" },
        { waitedMs: 100, executionMs: 500, success: false }
      );
      collector.recordTaskCompletion(
        { id: "t4", source: "test", provider: "openai", model: "gpt-4", priority: "high" },
        { waitedMs: 100, executionMs: 500, success: true }
      );

      // Assert
      const summary = collector.getSummary(60000);
      expect(summary.successRate).toBe(0.75);
    });
  });

  // ============================================================================
  // getStealingStats
  // ============================================================================

  describe("getStealingStats", () => {
    it("should_return_stealing_statistics", () => {
      // Arrange
      initMetricsCollector(createTestConfig());
      const collector = getMetricsCollector();

      // Act
      const stats = collector.getStealingStats();

      // Assert
      expect(typeof stats.totalAttempts).toBe("number");
      expect(typeof stats.successfulSteals).toBe("number");
      expect(typeof stats.failedAttempts).toBe("number");
      expect(typeof stats.successRate).toBe("number");
    });

    it("should_reflect_stealing_attempts", () => {
      // Arrange
      initMetricsCollector(createTestConfig());
      const collector = getMetricsCollector();

      // Act
      recordStealingAttempt(true, 50);
      recordStealingAttempt(true, 100);
      recordStealingAttempt(false, 200);

      // Assert
      const stats = collector.getStealingStats();
      expect(stats.totalAttempts).toBe(3);
      expect(stats.successfulSteals).toBe(2);
      expect(stats.failedAttempts).toBe(1);
    });
  });

  // ============================================================================
  // startCollection / stopCollection
  // ============================================================================

  describe("startCollection / stopCollection", () => {
    it("should_start_periodic_collection", () => {
      // Arrange
      initMetricsCollector(createTestConfig());
      const collector = getMetricsCollector();
      collector.updateQueueStats(5, 3);

      // Act
      collector.startCollection(100);

      // Assert: エラーなく開始
      expect(collector).toBeDefined();

      // Cleanup
      collector.stopCollection();
    });

    it("should_stop_collection", () => {
      // Arrange
      initMetricsCollector(createTestConfig());
      const collector = getMetricsCollector();
      collector.startCollection(100);

      // Act
      collector.stopCollection();

      // Assert: エラーなく停止
      expect(collector).toBeDefined();
    });
  });

  // ============================================================================
  // recordStealingAttempt
  // ============================================================================

  describe("recordStealingAttempt", () => {
    it("should_record_successful_attempt", () => {
      // Arrange
      initMetricsCollector(createTestConfig());

      // Act
      recordStealingAttempt(true, 100);

      // Assert
      const stats = getMetricsCollector().getStealingStats();
      expect(stats.successfulSteals).toBe(1);
      expect(stats.successRate).toBe(1);
    });

    it("should_record_failed_attempt", () => {
      // Arrange
      initMetricsCollector(createTestConfig());

      // Act
      recordStealingAttempt(false);

      // Assert
      const stats = getMetricsCollector().getStealingStats();
      expect(stats.failedAttempts).toBe(1);
      expect(stats.successRate).toBe(0);
    });

    it("should_track_latency", () => {
      // Arrange
      initMetricsCollector(createTestConfig());

      // Act
      recordStealingAttempt(true, 100);
      recordStealingAttempt(true, 200);
      recordStealingAttempt(true, 300);

      // Assert
      const stats = getMetricsCollector().getStealingStats();
      expect(stats.avgLatencyMs).toBe(200);
    });
  });

  // ============================================================================
  // getMetricsConfigFromEnv
  // ============================================================================

  describe("getMetricsConfigFromEnv", () => {
    it("should_return_empty_config_when_no_env_vars", () => {
      // Arrange: 環境変数なし

      // Act
      const config = getMetricsConfigFromEnv();

      // Assert
      expect(Object.keys(config).length).toBe(0);
    });

    it("should_read_metrics_dir_from_env", () => {
      // Arrange
      process.env.PI_METRICS_DIR = "/custom/metrics";

      // Act
      const config = getMetricsConfigFromEnv();

      // Assert
      expect(config.metricsDir).toBe("/custom/metrics");
    });

    it("should_read_interval_from_env", () => {
      // Arrange
      process.env.PI_METRICS_INTERVAL_MS = "5000";

      // Act
      const config = getMetricsConfigFromEnv();

      // Assert
      expect(config.collectionIntervalMs).toBe(5000);
    });

    it("should_ignore_invalid_interval", () => {
      // Arrange
      process.env.PI_METRICS_INTERVAL_MS = "invalid";

      // Act
      const config = getMetricsConfigFromEnv();

      // Assert
      expect(config.collectionIntervalMs).toBeUndefined();
    });

    it("should_read_enable_logging_from_env", () => {
      // Arrange
      process.env.PI_METRICS_ENABLE_LOGGING = "false";

      // Act
      const config = getMetricsConfigFromEnv();

      // Assert
      expect(config.enableLogging).toBe(false);
    });
  });

  // ============================================================================
  // Parallel Execution Metrics
  // ============================================================================

  describe("Parallel Execution Metrics", () => {
    describe("recordParallelExecutionStart", () => {
      it("should_record_execution_start", () => {
        // Arrange
        initMetricsCollector(createTestConfig());

        // Act
        recordParallelExecutionStart("exec-1", "subagent_run_parallel", 4);

        // Assert
        const snapshot = getParallelMetricsSnapshot(10);
        expect(snapshot.activeConcurrent).toBe(1);
      });

      it("should_track_peak_concurrent", () => {
        // Arrange
        initMetricsCollector(createTestConfig());

        // Act
        recordParallelExecutionStart("exec-1", "pattern-a", 4);
        recordParallelExecutionStart("exec-2", "pattern-a", 4);
        recordParallelExecutionStart("exec-3", "pattern-a", 4);

        // Assert
        const snapshot = getParallelMetricsSnapshot(10);
        expect(snapshot.peakConcurrent).toBe(3);
      });
    });

    describe("recordParallelExecutionEnd", () => {
      it("should_record_execution_end", () => {
        // Arrange
        initMetricsCollector(createTestConfig());
        recordParallelExecutionStart("exec-1", "subagent_run_parallel", 4);

        // Act
        recordParallelExecutionEnd("exec-1", 4, true);

        // Assert
        const snapshot = getParallelMetricsSnapshot(10);
        expect(snapshot.activeConcurrent).toBe(0);
      });

      it("should_update_pattern_stats", () => {
        // Arrange
        initMetricsCollector(createTestConfig());
        recordParallelExecutionStart("exec-1", "subagent_run_parallel", 4);

        // Act
        recordParallelExecutionEnd("exec-1", 4, true);

        // Assert
        const stats = getParallelPatternStats();
        expect(stats.length).toBeGreaterThan(0);
        const pattern = stats.find((s) => s.pattern === "subagent_run_parallel");
        expect(pattern?.successCount).toBe(1);
      });

      it("should_track_failures", () => {
        // Arrange
        initMetricsCollector(createTestConfig());
        recordParallelExecutionStart("exec-1", "pattern-a", 4);

        // Act
        recordParallelExecutionEnd("exec-1", 4, false);

        // Assert
        const stats = getParallelPatternStats();
        const pattern = stats.find((s) => s.pattern === "pattern-a");
        expect(pattern?.failureCount).toBe(1);
      });
    });

    describe("recordParallelWaitTime", () => {
      it("should_record_wait_time", () => {
        // Arrange
        initMetricsCollector(createTestConfig());

        // Act
        recordParallelWaitTime(100);
        recordParallelWaitTime(200);
        recordParallelWaitTime(300);

        // Assert
        const snapshot = getParallelMetricsSnapshot(10);
        expect(snapshot.avgWaitTimeMs).toBe(200);
      });

      it("should_limit_buffer_size", () => {
        // Arrange
        initMetricsCollector(createTestConfig());

        // Act: 1000件以上記録
        for (let i = 0; i < 1100; i++) {
          recordParallelWaitTime(i);
        }

        // Assert: リングバッファで最新1000件を保持
        const snapshot = getParallelMetricsSnapshot(10);
        expect(snapshot.avgWaitTimeMs).toBeGreaterThan(0);
      });
    });

    describe("recordParallelRateLimit", () => {
      it("should_record_rate_limit_event", () => {
        // Arrange
        initMetricsCollector(createTestConfig());

        // Act
        recordParallelRateLimit();
        recordParallelRateLimit();
        recordParallelRateLimit();

        // Assert
        const snapshot = getParallelMetricsSnapshot(10);
        expect(snapshot.rateLimitHits).toBe(3);
      });
    });

    describe("getParallelMetricsSnapshot", () => {
      it("should_return_complete_snapshot", () => {
        // Arrange
        initMetricsCollector(createTestConfig());
        recordParallelExecutionStart("exec-1", "pattern-a", 4);
        recordParallelWaitTime(100);

        // Act
        const snapshot = getParallelMetricsSnapshot(10);

        // Assert
        expect(snapshot.activeConcurrent).toBe(1);
        expect(snapshot.allowedConcurrent).toBe(10);
        expect(snapshot.utilizationRatio).toBe(0.1);
        expect(typeof snapshot.avgWaitTimeMs).toBe("number");
        expect(typeof snapshot.peakConcurrent).toBe("number");
      });

      it("should_calculate_utilization_ratio", () => {
        // Arrange
        initMetricsCollector(createTestConfig());
        recordParallelExecutionStart("exec-1", "pattern-a", 4);
        recordParallelExecutionStart("exec-2", "pattern-a", 4);
        recordParallelExecutionStart("exec-3", "pattern-a", 4);

        // Act
        const snapshot = getParallelMetricsSnapshot(10);

        // Assert
        expect(snapshot.utilizationRatio).toBe(0.3);
      });
    });

    describe("getParallelPatternStats", () => {
      it("should_return_pattern_statistics", () => {
        // Arrange
        initMetricsCollector(createTestConfig());
        recordParallelExecutionStart("exec-1", "subagent_run_parallel", 4);
        recordParallelExecutionEnd("exec-1", 4, true);
        recordParallelExecutionStart("exec-2", "agent_team_run_parallel", 8);
        recordParallelExecutionEnd("exec-2", 8, true);

        // Act
        const stats = getParallelPatternStats();

        // Assert
        expect(stats.length).toBe(2);
        expect(stats.find((s) => s.pattern === "subagent_run_parallel")).toBeDefined();
        expect(stats.find((s) => s.pattern === "agent_team_run_parallel")).toBeDefined();
      });

      it("should_calculate_efficiency_score", () => {
        // Arrange
        initMetricsCollector(createTestConfig());
        recordParallelExecutionStart("exec-1", "pattern-a", 4);
        recordParallelExecutionEnd("exec-1", 2, true); // 実際は2並列

        // Act
        const stats = getParallelPatternStats();
        const pattern = stats.find((s) => s.pattern === "pattern-a");

        // Assert
        expect(pattern?.efficiencyScore).toBe(0.5); // 2/4
      });
    });

    describe("resetParallelMetrics", () => {
      it("should_reset_all_parallel_metrics", () => {
        // Arrange
        initMetricsCollector(createTestConfig());
        recordParallelExecutionStart("exec-1", "pattern-a", 4);
        recordParallelWaitTime(100);
        recordParallelRateLimit();

        // Act
        resetParallelMetrics();

        // Assert
        const snapshot = getParallelMetricsSnapshot(10);
        expect(snapshot.activeConcurrent).toBe(0);
        expect(snapshot.rateLimitHits).toBe(0);
        expect(snapshot.avgWaitTimeMs).toBe(0);
      });
    });
  });

  // ============================================================================
  // isMetricsCollectorInitialized
  // ============================================================================

  describe("isMetricsCollectorInitialized", () => {
    it("should_return_false_before_initialization", () => {
      // Arrange
      resetMetricsCollector();

      // Act
      const result = isMetricsCollectorInitialized();

      // Assert
      expect(result).toBe(false);
    });

    it("should_return_true_after_initialization", () => {
      // Arrange
      initMetricsCollector(createTestConfig());

      // Act
      const result = isMetricsCollectorInitialized();

      // Assert
      expect(result).toBe(true);
    });

    it("should_return_false_after_reset", () => {
      // Arrange
      initMetricsCollector(createTestConfig());

      // Act
      resetMetricsCollector();
      const result = isMetricsCollectorInitialized();

      // Assert
      expect(result).toBe(false);
    });
  });

  // ============================================================================
  // resetMetricsCollector
  // ============================================================================

  describe("resetMetricsCollector", () => {
    it("should_clear_all_state", () => {
      // Arrange
      initMetricsCollector(createTestConfig());
      const collector = getMetricsCollector();
      collector.recordTaskCompletion(
        { id: "t1", source: "test", provider: "openai", model: "gpt-4", priority: "high" },
        { waitedMs: 100, executionMs: 500, success: true }
      );

      // Act
      resetMetricsCollector();

      // Assert
      expect(isMetricsCollectorInitialized()).toBe(false);
    });

    it("should_stop_collection_timer", () => {
      // Arrange
      initMetricsCollector(createTestConfig());
      const collector = getMetricsCollector();
      collector.startCollection(100);

      // Act
      resetMetricsCollector();

      // Assert: エラーなくリセット
      expect(isMetricsCollectorInitialized()).toBe(false);
    });
  });

  // ============================================================================
  // Window Size Limits
  // ============================================================================

  describe("window size limits", () => {
    it("should_limit_wait_times_window", () => {
      // Arrange
      initMetricsCollector(createTestConfig());
      const collector = getMetricsCollector();

      // Act: 1000件以上記録
      for (let i = 0; i < 1100; i++) {
        collector.recordTaskCompletion(
          { id: `t${i}`, source: "test", provider: "openai", model: "gpt-4", priority: "high" },
          { waitedMs: i, executionMs: 100, success: true }
        );
      }

      // Assert: エラーなく完了
      const metrics = collector.getMetrics();
      expect(metrics).toBeDefined();
    });

    it("should_limit_event_buffers", () => {
      // Arrange
      initMetricsCollector(createTestConfig());
      const collector = getMetricsCollector();

      // Act: 1000件以上記録
      for (let i = 0; i < 1100; i++) {
        collector.recordPreemption(`task-${i}`, "test");
      }

      // Assert: エラーなく完了
      const summary = collector.getSummary(60000);
      expect(summary.totalPreemptions).toBeGreaterThan(0);
    });
  });
});
