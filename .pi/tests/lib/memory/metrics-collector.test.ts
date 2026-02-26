/**
 * @abdd.meta
 * path: .pi/tests/lib/memory/metrics-collector.test.ts
 * role: metrics-collector.tsの単体テスト
 * why: 操作レベルメトリクス収集の正確性と信頼性を保証するため
 * related: .pi/lib/memory/metrics-collector.ts
 * public_api: なし（テストファイル）
 * invariants: 各テストは独立して実行可能
 * side_effects: なし（モック使用）
 * failure_modes: なし
 * @abdd.explain
 * overview: メトリクス収集機能の包括的テストスイート
 * what_it_does:
 *   - 操作開始・終了・失敗のテスト
 *   - パーセンタイル計算のテスト
 *   - コスト推定のテスト
 *   - サマリー生成のテスト
 *   - エッジケースのテスト
 * why_it_exists:
 *   - メトリクス収集の正確性を保証
 *   - 回帰を防ぐ
 *   - API契約を文書化
 * scope:
 *   in: テストケース、モックデータ
 *   out: テスト結果、カバレッジ
 */

// File: .pi/tests/lib/memory/metrics-collector.test.ts
// Description: Unit tests for metrics-collector.ts
// Why: Ensure accuracy and reliability of operation-level metrics collection.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  startOperation,
  endOperation,
  failOperation,
  getMetricsSummary,
  getMetricsHistory,
  resetMetrics,
  exportMetricsJson,
  calculatePercentile,
  estimateCost,
  updateConfig,
  getConfig,
  cleanupExpiredMetrics,
  getPhaseStatistics,
  type OperationPhase,
  type MetricsCollectorConfig,
} from "../../../lib/memory/metrics-collector.js";

// ============================================================================
// Test Setup & Teardown
// ============================================================================

describe("MetricsCollector", () => {
  beforeEach(() => {
    // Reset state before each test
    resetMetrics();
    updateConfig({
      enabled: true,
      sampleRate: 1.0,
      storagePath: ".pi/data/metrics/",
      retentionDays: 30,
    });
    // Mock performance.now() for consistent timing
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetMetrics();
  });

  // ==========================================================================
  // Basic Operation Tracking
  // ==========================================================================

  describe("startOperation / endOperation", () => {
    it("should start and end an operation successfully", () => {
      const opId = startOperation("retrieval", "test-query");
      expect(opId).toBeTruthy();
      expect(opId).toMatch(/^op_\d+_\d+$/);

      // Simulate some time passing
      vi.advanceTimersByTime(100);

      endOperation(opId);

      const history = getMetricsHistory();
      expect(history).toHaveLength(1);
      expect(history[0].phase).toBe("retrieval");
      expect(history[0].operationName).toBe("test-query");
      expect(history[0].durationMs).toBe(100);
      expect(history[0].success).toBe(true);
    });

    it("should track tokens when provided", () => {
      const opId = startOperation("generation", "test-gen");
      vi.advanceTimersByTime(50);

      endOperation(opId, { input: 100, output: 50, total: 150 });

      const history = getMetricsHistory();
      expect(history[0].tokensUsed).toEqual({
        input: 100,
        output: 50,
        total: 150,
      });
    });

    it("should handle multiple concurrent operations", () => {
      const opId1 = startOperation("retrieval", "query1");
      const opId2 = startOperation("generation", "query2");
      const opId3 = startOperation("maintenance", "update");

      vi.advanceTimersByTime(100);
      endOperation(opId1);
      vi.advanceTimersByTime(50);
      endOperation(opId2);
      vi.advanceTimersByTime(25);
      endOperation(opId3);

      const history = getMetricsHistory();
      expect(history).toHaveLength(3);
      expect(history[0].durationMs).toBe(100);
      expect(history[1].durationMs).toBe(150);
      expect(history[2].durationMs).toBe(175);
    });

    it("should ignore endOperation for invalid operation ID", () => {
      startOperation("retrieval", "test");
      endOperation("invalid-id");

      const history = getMetricsHistory();
      expect(history).toHaveLength(0);
    });

    it("should ignore operations when disabled", () => {
      updateConfig({ enabled: false });
      const opId = startOperation("retrieval", "test");
      expect(opId).toBe("");
    });

    it("should sample operations based on sampleRate", () => {
      updateConfig({ sampleRate: 0 });
      const opId = startOperation("retrieval", "test");
      expect(opId).toBe("");
    });
  });

  describe("failOperation", () => {
    it("should record failed operation with error message", () => {
      const opId = startOperation("retrieval", "failing-query");
      vi.advanceTimersByTime(200);

      failOperation(opId, "Connection timeout");

      const history = getMetricsHistory();
      expect(history).toHaveLength(1);
      expect(history[0].success).toBe(false);
      expect(history[0].errorMessage).toBe("Connection timeout");
      expect(history[0].durationMs).toBe(200);
    });

    it("should ignore failOperation for invalid operation ID", () => {
      startOperation("retrieval", "test");
      failOperation("invalid-id", "error");

      const history = getMetricsHistory();
      expect(history).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Metrics Summary
  // ==========================================================================

  describe("getMetricsSummary", () => {
    it("should return empty summary when no operations", () => {
      const summary = getMetricsSummary();

      expect(summary.totalOperations).toBe(0);
      expect(summary.avgRetrievalLatencyMs).toBe(0);
      expect(summary.avgGenerationLatencyMs).toBe(0);
      expect(summary.totalTokens).toBe(0);
    });

    it("should calculate phase-specific latencies", () => {
      // Add retrieval operations
      const r1 = startOperation("retrieval", "r1");
      vi.advanceTimersByTime(100);
      endOperation(r1);

      const r2 = startOperation("retrieval", "r2");
      vi.advanceTimersByTime(200);
      endOperation(r2);

      // Add generation operations
      const g1 = startOperation("generation", "g1");
      vi.advanceTimersByTime(150);
      endOperation(g1);

      const summary = getMetricsSummary();

      expect(summary.totalOperations).toBe(3);
      expect(summary.avgRetrievalLatencyMs).toBe(150); // (100 + 200) / 2
      expect(summary.avgGenerationLatencyMs).toBe(150);
      expect(summary.avgTotalUserLatencyMs).toBe(300); // 150 + 150
    });

    it("should calculate maintenance metrics", () => {
      const m1 = startOperation("maintenance", "m1");
      vi.advanceTimersByTime(500);
      endOperation(m1);

      const m2 = startOperation("maintenance", "m2");
      vi.advanceTimersByTime(300);
      endOperation(m2);

      const summary = getMetricsSummary();

      expect(summary.avgMaintenanceLatencyMs).toBe(400); // (500 + 300) / 2
      expect(summary.totalMaintenanceTimeMs).toBe(800);
    });

    it("should calculate percentiles", () => {
      // Create operations with varying durations
      const durations = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      durations.forEach((d) => {
        const opId = startOperation("retrieval", `op-${d}`);
        vi.advanceTimersByTime(d);
        endOperation(opId);
      });

      const summary = getMetricsSummary();

      // p50 should be around 55 (between 50 and 60)
      expect(summary.p50LatencyMs).toBeGreaterThanOrEqual(50);
      expect(summary.p50LatencyMs).toBeLessThanOrEqual(60);

      // p95 should be around 95.5 (between 90 and 100)
      expect(summary.p95LatencyMs).toBeGreaterThanOrEqual(95);
      expect(summary.p95LatencyMs).toBeLessThanOrEqual(100);

      // p99 should be around 99.1 (between 90 and 100)
      expect(summary.p99LatencyMs).toBeGreaterThanOrEqual(99);
      expect(summary.p99LatencyMs).toBeLessThanOrEqual(100);
    });

    it("should calculate token totals and cost", () => {
      const op1 = startOperation("generation", "gen1");
      vi.advanceTimersByTime(50);
      endOperation(op1, { input: 1000, output: 500, total: 1500 });

      const op2 = startOperation("generation", "gen2");
      vi.advanceTimersByTime(50);
      endOperation(op2, { input: 2000, output: 1000, total: 3000 });

      const summary = getMetricsSummary();

      expect(summary.totalInputTokens).toBe(3000);
      expect(summary.totalOutputTokens).toBe(1500);
      expect(summary.totalTokens).toBe(4500);
      expect(summary.estimatedCostUsd).toBeGreaterThan(0);
    });

    it("should determine throughput health", () => {
      // Create many fast operations
      for (let i = 0; i < 100; i++) {
        const opId = startOperation("retrieval", `fast-${i}`);
        vi.advanceTimersByTime(10);
        endOperation(opId);
      }

      const summary = getMetricsSummary();
      expect(summary.throughputHealth).toBe("healthy");
    });

    it("should detect degraded throughput", () => {
      // Create mix of fast and slow operations for degraded state
      // Need: opsPerSec >= 1 but < 10, AND p95Latency > 1000ms but <= 5000ms
      
      // 18 fast operations at 50ms each
      for (let i = 0; i < 18; i++) {
        const opId = startOperation("retrieval", `fast-${i}`);
        vi.advanceTimersByTime(50);
        endOperation(opId);
      }
      
      // 2 slow operations at 2000ms each (will affect p95)
      for (let i = 0; i < 2; i++) {
        const opId = startOperation("retrieval", `slow-${i}`);
        vi.advanceTimersByTime(2000);
        endOperation(opId);
      }

      const summary = getMetricsSummary();
      // 20 ops / 4900ms = 4.08 ops/sec (degraded: < 10 but >= 1)
      // p95 latency: ~2000ms (degraded: > 1000ms but <= 5000ms)
      expect(summary.throughputHealth).toBe("degraded");
    });
  });

  // ==========================================================================
  // Utility Functions
  // ==========================================================================

  describe("calculatePercentile", () => {
    it("should return 0 for empty array", () => {
      expect(calculatePercentile([], 50)).toBe(0);
    });

    it("should return single value for single-element array", () => {
      expect(calculatePercentile([42], 50)).toBe(42);
    });

    it("should calculate median correctly", () => {
      const values = [10, 20, 30, 40, 50];
      expect(calculatePercentile(values, 50)).toBe(30);
    });

    it("should calculate p0 and p100 correctly", () => {
      const values = [10, 20, 30, 40, 50];
      expect(calculatePercentile(values, 0)).toBe(10);
      expect(calculatePercentile(values, 100)).toBe(50);
    });

    it("should use linear interpolation", () => {
      const values = [0, 100];
      const p25 = calculatePercentile(values, 25);
      const p75 = calculatePercentile(values, 75);

      expect(p25).toBe(25);
      expect(p75).toBe(75);
    });

    it("should handle even-length arrays", () => {
      const values = [10, 20, 30, 40];
      const p50 = calculatePercentile(values, 50);

      expect(p50).toBeGreaterThanOrEqual(20);
      expect(p50).toBeLessThanOrEqual(30);
    });
  });

  describe("estimateCost", () => {
    it("should calculate cost for GPT-4", () => {
      const cost = estimateCost(1000, 1000, "gpt-4");
      // GPT-4: $0.03/1K input, $0.06/1K output
      // 1000 input * 0.03 + 1000 output * 0.06 = 0.03 + 0.06 = 0.09
      expect(cost).toBe(0.09);
    });

    it("should calculate cost for GPT-3.5-turbo", () => {
      const cost = estimateCost(1000, 1000, "gpt-3.5-turbo");
      // GPT-3.5: $0.0005/1K input, $0.0015/1K output
      expect(cost).toBeCloseTo(0.002, 4);
    });

    it("should use default pricing for unknown models", () => {
      const cost = estimateCost(1000, 1000, "unknown-model");
      expect(cost).toBeGreaterThan(0);
    });

    it("should handle zero tokens", () => {
      const cost = estimateCost(0, 0, "gpt-4");
      expect(cost).toBe(0);
    });

    it("should handle large token counts", () => {
      const cost = estimateCost(1000000, 500000, "gpt-4");
      // 1M input * 0.03 + 500K output * 0.06 = 30 + 30 = 60
      expect(cost).toBe(60);
    });
  });

  // ==========================================================================
  // History & Export
  // ==========================================================================

  describe("getMetricsHistory", () => {
    it("should return operations in order", () => {
      const op1 = startOperation("retrieval", "first");
      vi.advanceTimersByTime(10);
      endOperation(op1);

      const op2 = startOperation("generation", "second");
      vi.advanceTimersByTime(10);
      endOperation(op2);

      const history = getMetricsHistory();

      expect(history[0].operationName).toBe("first");
      expect(history[1].operationName).toBe("second");
    });

    it("should respect limit parameter", () => {
      for (let i = 0; i < 150; i++) {
        const opId = startOperation("retrieval", `op-${i}`);
        vi.advanceTimersByTime(10);
        endOperation(opId);
      }

      const history = getMetricsHistory(50);
      expect(history).toHaveLength(50);
    });

    it("should return all operations when limit exceeds count", () => {
      for (let i = 0; i < 10; i++) {
        const opId = startOperation("retrieval", `op-${i}`);
        vi.advanceTimersByTime(10);
        endOperation(opId);
      }

      const history = getMetricsHistory(100);
      expect(history).toHaveLength(10);
    });
  });

  describe("exportMetricsJson", () => {
    it("should export valid JSON", () => {
      const opId = startOperation("retrieval", "test");
      vi.advanceTimersByTime(100);
      endOperation(opId, { input: 100, output: 50, total: 150 });

      const json = exportMetricsJson();
      const parsed = JSON.parse(json);

      expect(parsed.summary).toBeDefined();
      expect(parsed.history).toBeDefined();
      expect(parsed.config).toBeDefined();
      expect(parsed.exportedAt).toBeDefined();
    });

    it("should include summary in export", () => {
      const opId = startOperation("generation", "test");
      vi.advanceTimersByTime(50);
      endOperation(opId);

      const json = exportMetricsJson();
      const parsed = JSON.parse(json);

      expect(parsed.summary.totalOperations).toBe(1);
      expect(parsed.summary.avgGenerationLatencyMs).toBe(50);
    });
  });

  // ==========================================================================
  // Configuration
  // ==========================================================================

  describe("updateConfig / getConfig", () => {
    it("should update configuration", () => {
      updateConfig({ sampleRate: 0.5 });
      const cfg = getConfig();

      expect(cfg.sampleRate).toBe(0.5);
      expect(cfg.enabled).toBe(true); // Should preserve other values
    });

    it("should preserve unmodified config values", () => {
      const original = getConfig();
      updateConfig({ retentionDays: 7 });
      const updated = getConfig();

      expect(updated.storagePath).toBe(original.storagePath);
      expect(updated.retentionDays).toBe(7);
    });
  });

  // ==========================================================================
  // Cleanup & Phase Statistics
  // ==========================================================================

  describe("cleanupExpiredMetrics", () => {
    it("should remove expired metrics", () => {
      // Create operations with time span exceeding retention
      // First batch: old operations
      for (let i = 0; i < 3; i++) {
        const opId = startOperation("retrieval", `old-op-${i}`);
        vi.advanceTimersByTime(10);
        endOperation(opId);
      }

      // Simulate passage of time (more than retention period)
      vi.advanceTimersByTime(31 * 24 * 60 * 60 * 1000); // 31 days in ms

      // Second batch: recent operations
      for (let i = 0; i < 2; i++) {
        const opId = startOperation("retrieval", `new-op-${i}`);
        vi.advanceTimersByTime(10);
        endOperation(opId);
      }

      // With 30 day retention, only the 2 recent ops should remain
      const removed = cleanupExpiredMetrics(30);
      expect(removed).toBe(3);
      expect(getMetricsHistory()).toHaveLength(2);
    });

    it("should preserve recent metrics", () => {
      for (let i = 0; i < 5; i++) {
        const opId = startOperation("retrieval", `op-${i}`);
        vi.advanceTimersByTime(10);
        endOperation(opId);
      }

      // With relative time-based cleanup, metrics within retention period are preserved
      // 50ms total span is well within 30 days
      const removed = cleanupExpiredMetrics(30);
      expect(removed).toBe(0);
      expect(getMetricsHistory()).toHaveLength(5);
    });
  });

  describe("getPhaseStatistics", () => {
    it("should return statistics for each phase", () => {
      const r1 = startOperation("retrieval", "r1");
      vi.advanceTimersByTime(100);
      endOperation(r1);

      const g1 = startOperation("generation", "g1");
      vi.advanceTimersByTime(200);
      endOperation(g1);

      const m1 = startOperation("maintenance", "m1");
      vi.advanceTimersByTime(300);
      endOperation(m1);

      const stats = getPhaseStatistics();

      expect(stats.retrieval.count).toBe(1);
      expect(stats.retrieval.avgDurationMs).toBe(100);

      expect(stats.generation.count).toBe(1);
      expect(stats.generation.avgDurationMs).toBe(200);

      expect(stats.maintenance.count).toBe(1);
      expect(stats.maintenance.avgDurationMs).toBe(300);
    });

    it("should calculate success rate", () => {
      const r1 = startOperation("retrieval", "r1");
      vi.advanceTimersByTime(100);
      endOperation(r1);

      const r2 = startOperation("retrieval", "r2");
      vi.advanceTimersByTime(100);
      failOperation(r2, "error");

      const stats = getPhaseStatistics();

      expect(stats.retrieval.count).toBe(2);
      expect(stats.retrieval.successRate).toBe(0.5);
    });

    it("should return zero values for phases with no operations", () => {
      const r1 = startOperation("retrieval", "r1");
      vi.advanceTimersByTime(100);
      endOperation(r1);

      const stats = getPhaseStatistics();

      expect(stats.generation.count).toBe(0);
      expect(stats.generation.avgDurationMs).toBe(0);
      expect(stats.maintenance.count).toBe(0);
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe("edge cases", () => {
    it("should handle empty operation name", () => {
      const opId = startOperation("retrieval", "");
      vi.advanceTimersByTime(100);
      endOperation(opId);

      const history = getMetricsHistory();
      expect(history[0].operationName).toBe("");
    });

    it("should handle zero duration operations", () => {
      const opId = startOperation("retrieval", "instant");
      endOperation(opId); // No time advancement

      const history = getMetricsHistory();
      expect(history[0].durationMs).toBe(0);
    });

    it("should handle very large token counts", () => {
      const opId = startOperation("generation", "large");
      vi.advanceTimersByTime(100);
      endOperation(opId, {
        input: Number.MAX_SAFE_INTEGER / 2,
        output: Number.MAX_SAFE_INTEGER / 2,
        total: Number.MAX_SAFE_INTEGER,
      });

      const summary = getMetricsSummary();
      expect(summary.totalTokens).toBe(Number.MAX_SAFE_INTEGER);
    });

    it("should handle special characters in operation name", () => {
      const opId = startOperation("retrieval", "test-\n\t\r-特殊文字");
      vi.advanceTimersByTime(100);
      endOperation(opId);

      const json = exportMetricsJson();
      expect(() => JSON.parse(json)).not.toThrow();
    });

    it("should handle ending same operation twice", () => {
      const opId = startOperation("retrieval", "test");
      vi.advanceTimersByTime(100);
      endOperation(opId);
      endOperation(opId); // Second end should be ignored

      const history = getMetricsHistory();
      expect(history).toHaveLength(1);
    });
  });
});
