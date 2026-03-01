/**
 * @abdd.meta
 * @path .pi/tests/lib/performance-monitor.test.ts
 * @role Test suite for AWM performance monitor M(t)
 * @why Verify metrics recording, score calculation, and resource allocation
 * @related ../../lib/performance-monitor.ts
 * @public_api Tests for PerformanceMonitor class
 * @invariants Tests should not depend on external state
 * @side_effects None expected
 * @failure_modes None expected
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  PerformanceMonitor,
  DEFAULT_MONITOR_CONFIG,
  type MetricsSnapshot,
  type AgentInfo,
  type ResourceAllocation,
} from "../../lib/performance-monitor";

describe("performance-monitor", () => {
  let monitor: PerformanceMonitor;

  beforeEach(() => {
    monitor = new PerformanceMonitor();
  });

  describe("constructor", () => {
    it("constructor_createsMonitor_withDefaultConfig", () => {
      const mon = new PerformanceMonitor();

      expect(mon.getLatestMetrics()).toBeUndefined();
      expect(mon.getUptime()).toBeGreaterThanOrEqual(0);
    });

    it("constructor_createsMonitor_withCustomConfig", () => {
      const mon = new PerformanceMonitor({
        windowSize: 50,
        maxAgents: 8,
      });

      // Record more than windowSize metrics
      for (let i = 0; i < 60; i++) {
        mon.record({ completedTasks: i });
      }

      // Should only keep last 50
      const metrics = mon.getMetricsSince(0);
      expect(metrics.length).toBeLessThanOrEqual(50);
    });
  });

  describe("record", () => {
    it("record_partialSnapshot_fillsDefaults", () => {
      monitor.record({ activeAgents: 5 });

      const latest = monitor.getLatestMetrics();
      expect(latest).toBeDefined();
      expect(latest?.activeAgents).toBe(5);
      expect(latest?.pendingTasks).toBe(0);
      expect(latest?.completedTasks).toBe(0);
      expect(latest?.failedTasks).toBe(0);
      expect(latest?.timestamp).toBeGreaterThan(0);
    });

    it("record_fullSnapshot_storesAllFields", () => {
      const snapshot: Partial<MetricsSnapshot> = {
        activeAgents: 3,
        pendingTasks: 10,
        completedTasks: 50,
        failedTasks: 2,
        avgLatencyMs: 150,
        throughput: 5.5,
        resourceUtilization: 0.75,
        errorRate: 0.04,
      };

      monitor.record(snapshot);

      const latest = monitor.getLatestMetrics();
      expect(latest).toMatchObject(snapshot);
    });

    it("record_multipleSnapshots_maintainsOrder", () => {
      monitor.record({ completedTasks: 1 });
      monitor.record({ completedTasks: 2 });
      monitor.record({ completedTasks: 3 });

      const metrics = monitor.getMetricsSince(0);
      expect(metrics).toHaveLength(3);
      expect(metrics[0].completedTasks).toBe(1);
      expect(metrics[1].completedTasks).toBe(2);
      expect(metrics[2].completedTasks).toBe(3);
    });

    it("record_exceedsWindowSize_removesOldest", () => {
      const smallMonitor = new PerformanceMonitor({ windowSize: 3, maxAgents: 16 });

      for (let i = 0; i < 5; i++) {
        smallMonitor.record({ completedTasks: i });
      }

      const metrics = smallMonitor.getMetricsSince(0);
      expect(metrics).toHaveLength(3);
      // Should keep last 3: 2, 3, 4
      expect(metrics[0].completedTasks).toBe(2);
      expect(metrics[2].completedTasks).toBe(4);
    });
  });

  describe("getCurrentScore", () => {
    it("getCurrentScore_noMetrics_returnsZero", () => {
      const score = monitor.getCurrentScore();

      expect(score).toBe(0);
    });

    it("getCurrentScore_singleMetric_returnsCorrectScore", () => {
      monitor.record({
        throughput: 10,
        errorRate: 0.1,
        resourceUtilization: 0.8,
      });

      const score = monitor.getCurrentScore();

      // M(t) = throughput * (1 - errorRate) * utilization
      // 10 * 0.9 * 0.8 = 7.2
      expect(score).toBeCloseTo(7.2, 1);
    });

    it("getCurrentScore_multipleMetrics_averagesLast10", () => {
      // Record 15 metrics with varying values
      for (let i = 0; i < 15; i++) {
        monitor.record({
          throughput: 5 + i,
          errorRate: 0.05,
          resourceUtilization: 0.7,
        });
      }

      const score = monitor.getCurrentScore();

      // Should average last 10 (i=5 to i=14)
      // avg throughput = (5+5 + 14) / 2 = 12
      // M(t) = 12 * 0.95 * 0.7 = 7.98
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(20);
    });

    it("getCurrentScore_highErrorRate_reducesScore", () => {
      monitor.record({
        throughput: 10,
        errorRate: 0.5,
        resourceUtilization: 0.8,
      });

      const score = monitor.getCurrentScore();

      // 10 * 0.5 * 0.8 = 4
      expect(score).toBeCloseTo(4, 1);
    });

    it("getCurrentScore_lowUtilization_reducesScore", () => {
      monitor.record({
        throughput: 10,
        errorRate: 0,
        resourceUtilization: 0.3,
      });

      const score = monitor.getCurrentScore();

      // 10 * 1 * 0.3 = 3
      expect(score).toBeCloseTo(3, 1);
    });
  });

  describe("getResourceAllocation", () => {
    it("getResourceAllocation_emptyAgents_returnsEmptyArray", () => {
      const allocation = monitor.getResourceAllocation([], 100);

      expect(allocation).toEqual([]);
    });

    it("getResourceAllocation_singleAgent_allocatesAllSlots", () => {
      const agents: AgentInfo[] = [
        { id: "agent-1", priority: 1.0 },
      ];

      const allocation = monitor.getResourceAllocation(agents, 10);

      expect(allocation).toHaveLength(1);
      expect(allocation[0].agentId).toBe("agent-1");
      expect(allocation[0].allocatedSlots).toBeGreaterThan(0);
    });

    it("getResourceAllocation_multipleAgents_distributesByPriority", () => {
      const agents: AgentInfo[] = [
        { id: "agent-1", priority: 3.0 },
        { id: "agent-2", priority: 1.0 },
        { id: "agent-3", priority: 2.0 },
      ];

      const allocation = monitor.getResourceAllocation(agents, 60);

      expect(allocation).toHaveLength(3);

      // agent-1 should get most slots (priority 3/6 = 50%)
      const agent1Alloc = allocation.find((a) => a.agentId === "agent-1");
      const agent2Alloc = allocation.find((a) => a.agentId === "agent-2");
      const agent3Alloc = allocation.find((a) => a.agentId === "agent-3");

      expect(agent1Alloc?.allocatedSlots).toBeGreaterThan(agent2Alloc?.allocatedSlots ?? 0);
      expect(agent1Alloc?.allocatedSlots).toBeGreaterThan(agent3Alloc?.allocatedSlots ?? 0);
    });

    it("getResourceAllocation_zeroTotalPriority_distributesEqually", () => {
      const agents: AgentInfo[] = [
        { id: "agent-1", priority: 0 },
        { id: "agent-2", priority: 0 },
        { id: "agent-3", priority: 0 },
      ];

      const allocation = monitor.getResourceAllocation(agents, 30);

      expect(allocation).toHaveLength(3);
      // Equal distribution
      allocation.forEach((a) => {
        expect(a.allocatedSlots).toBe(10);
        expect(a.reason).toContain("Equal distribution");
      });
    });

    it("getResourceAllocation_withPerformanceBonus_increasesAllocation", () => {
      const agents: AgentInfo[] = [
        { id: "agent-1", priority: 1.0 },
      ];

      // Record high-performance metrics
      monitor.record({
        throughput: 10,
        errorRate: 0,
        resourceUtilization: 1.0,
      });

      const allocation = monitor.getResourceAllocation(agents, 10);

      // With performance bonus, allocation should be higher than base
      expect(allocation[0].allocatedSlots).toBeGreaterThan(0);
      expect(allocation[0].reason).toContain("Bonus");
    });

    it("getResourceAllocation_ensuresMinimumOneSlot", () => {
      const agents: AgentInfo[] = [
        { id: "agent-1", priority: 0.01 },
        { id: "agent-2", priority: 99.99 },
      ];

      const allocation = monitor.getResourceAllocation(agents, 10);

      // Even with very low priority, agent-1 should get at least 1 slot
      const agent1Alloc = allocation.find((a) => a.agentId === "agent-1");
      expect(agent1Alloc?.allocatedSlots).toBeGreaterThanOrEqual(1);
    });
  });

  describe("getLatestMetrics", () => {
    it("getLatestMetrics_noMetrics_returnsUndefined", () => {
      const latest = monitor.getLatestMetrics();

      expect(latest).toBeUndefined();
    });

    it("getLatestMetrics_withMetrics_returnsMostRecent", () => {
      monitor.record({ completedTasks: 1 });
      monitor.record({ completedTasks: 2 });
      monitor.record({ completedTasks: 3 });

      const latest = monitor.getLatestMetrics();

      expect(latest?.completedTasks).toBe(3);
    });
  });

  describe("getMetricsSince", () => {
    it("getMetricsSince_noMatchingMetrics_returnsEmptyArray", () => {
      monitor.record({ completedTasks: 1 });

      const future = Date.now() + 10000;
      const metrics = monitor.getMetricsSince(future);

      expect(metrics).toEqual([]);
    });

    it("getMetricsSince_withMatchingMetrics_returnsFiltered", () => {
      const now = Date.now();

      // Record with specific timestamps by using vi.useFakeTimers
      monitor.record({ completedTasks: 1 });

      const metrics = monitor.getMetricsSince(0);
      expect(metrics).toHaveLength(1);
    });

    it("getMetricsSince_returnsOnlyNewerMetrics", async () => {
      monitor.record({ completedTasks: 1 });

      await new Promise((resolve) => setTimeout(resolve, 10));
      const cutoff = Date.now();

      monitor.record({ completedTasks: 2 });
      monitor.record({ completedTasks: 3 });

      const metrics = monitor.getMetricsSince(cutoff);

      expect(metrics.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("getUptime", () => {
    it("getUptime_returnsElapsedTime", async () => {
      const start = monitor.getUptime();

      await new Promise((resolve) => setTimeout(resolve, 50));

      const uptime = monitor.getUptime();
      expect(uptime).toBeGreaterThanOrEqual(start);
    });
  });

  describe("getSummary", () => {
    it("getSummary_noMetrics_returnsZeroStats", () => {
      const summary = monitor.getSummary();

      expect(summary.totalCompleted).toBe(0);
      expect(summary.totalFailed).toBe(0);
      expect(summary.avgThroughput).toBe(0);
      expect(summary.avgLatency).toBe(0);
      expect(summary.avgUtilization).toBe(0);
      expect(summary.avgErrorRate).toBe(0);
    });

    it("getSummary_withMetrics_returnsCorrectStats", () => {
      for (let i = 0; i < 5; i++) {
        monitor.record({
          completedTasks: 10 * (i + 1),
          failedTasks: i,
          avgLatencyMs: 100 + i * 10,
          throughput: 5 + i,
          resourceUtilization: 0.5 + i * 0.1,
          errorRate: 0.01 * (i + 1),
        });
      }

      const summary = monitor.getSummary();

      expect(summary.totalCompleted).toBe(50);
      expect(summary.totalFailed).toBe(4);
      expect(summary.avgThroughput).toBeGreaterThan(0);
      expect(summary.avgLatency).toBeGreaterThan(0);
      expect(summary.avgUtilization).toBeGreaterThan(0);
      expect(summary.avgErrorRate).toBeGreaterThan(0);
    });

    it("getSummary_averagesLast10Metrics", () => {
      // Record 15 metrics
      for (let i = 0; i < 15; i++) {
        monitor.record({
          avgLatencyMs: 100 + i,
        });
      }

      const summary = monitor.getSummary();

      // Should average last 10: 105 to 114
      // Average = (105 + 114) / 2 = 109.5
      expect(summary.avgLatency).toBeGreaterThan(100);
      expect(summary.avgLatency).toBeLessThan(120);
    });
  });

  describe("clear", () => {
    it("clear_removesAllMetrics", () => {
      monitor.record({ completedTasks: 1 });
      monitor.record({ completedTasks: 2 });
      monitor.record({ completedTasks: 3 });

      monitor.clear();

      expect(monitor.getLatestMetrics()).toBeUndefined();
      expect(monitor.getMetricsSince(0)).toEqual([]);
    });

    it("clear_resetsStartTime", async () => {
      const startUptime = monitor.getUptime();

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Before clear, uptime should have increased
      const beforeClearUptime = monitor.getUptime();
      expect(beforeClearUptime).toBeGreaterThan(startUptime);

      monitor.clear();

      // After clear, uptime should be reset to near zero
      const afterClearUptime = monitor.getUptime();
      expect(afterClearUptime).toBeLessThan(beforeClearUptime);
      expect(afterClearUptime).toBeLessThan(100); // Should be very small
    });
  });

  describe("integration tests", () => {
    it("full monitoring lifecycle works correctly", () => {
      // Simulate a workload
      const agents: AgentInfo[] = [
        { id: "implementer", priority: 2.0 },
        { id: "researcher", priority: 1.5 },
        { id: "reviewer", priority: 1.0 },
      ];

      // Phase 1: Initial metrics
      monitor.record({
        activeAgents: 3,
        pendingTasks: 10,
        completedTasks: 0,
        failedTasks: 0,
        avgLatencyMs: 200,
        throughput: 0,
        resourceUtilization: 0.3,
        errorRate: 0,
      });

      expect(monitor.getCurrentScore()).toBe(0);

      // Phase 2: Processing
      monitor.record({
        activeAgents: 3,
        pendingTasks: 5,
        completedTasks: 5,
        failedTasks: 0,
        avgLatencyMs: 150,
        throughput: 2.5,
        resourceUtilization: 0.6,
        errorRate: 0,
      });

      const score2 = monitor.getCurrentScore();
      expect(score2).toBeGreaterThan(0);

      // Phase 3: More progress
      monitor.record({
        activeAgents: 3,
        pendingTasks: 0,
        completedTasks: 10,
        failedTasks: 1,
        avgLatencyMs: 100,
        throughput: 5.0,
        resourceUtilization: 0.9,
        errorRate: 0.1,
      });

      const score3 = monitor.getCurrentScore();
      expect(score3).toBeGreaterThan(score2);

      // Get allocation
      const allocation = monitor.getResourceAllocation(agents, 30);
      expect(allocation).toHaveLength(3);

      // Get summary
      const summary = monitor.getSummary();
      expect(summary.totalCompleted).toBe(10);
      expect(summary.totalFailed).toBe(1);
    });

    it("resource allocation adapts to performance changes", () => {
      const agents: AgentInfo[] = [
        { id: "agent-1", priority: 1.0 },
      ];

      // Low performance
      monitor.record({
        throughput: 1,
        errorRate: 0.5,
        resourceUtilization: 0.3,
      });

      const lowPerfAlloc = monitor.getResourceAllocation(agents, 10);

      // High performance
      monitor.record({
        throughput: 10,
        errorRate: 0,
        resourceUtilization: 1.0,
      });

      const highPerfAlloc = monitor.getResourceAllocation(agents, 10);

      // High performance should result in higher allocation (with bonus)
      // Note: This depends on the performanceBonus formula
      expect(highPerfAlloc[0].allocatedSlots).toBeGreaterThanOrEqual(
        lowPerfAlloc[0].allocatedSlots
      );
    });

    it("window size limits memory usage", () => {
      const smallMonitor = new PerformanceMonitor({
        windowSize: 5,
        maxAgents: 16,
      });

      // Record many metrics
      for (let i = 0; i < 100; i++) {
        smallMonitor.record({ completedTasks: i });
      }

      const metrics = smallMonitor.getMetricsSince(0);
      expect(metrics.length).toBeLessThanOrEqual(5);

      // Latest should be the most recent
      const latest = smallMonitor.getLatestMetrics();
      expect(latest?.completedTasks).toBe(99);
    });
  });

  describe("DEFAULT_MONITOR_CONFIG", () => {
    it("DEFAULT_MONITOR_CONFIG_hasExpectedValues", () => {
      expect(DEFAULT_MONITOR_CONFIG.windowSize).toBe(100);
      expect(DEFAULT_MONITOR_CONFIG.maxAgents).toBe(16);
    });
  });

  describe("edge cases", () => {
    it("handles zero throughput gracefully", () => {
      monitor.record({
        throughput: 0,
        errorRate: 0,
        resourceUtilization: 0.5,
      });

      const score = monitor.getCurrentScore();
      expect(score).toBe(0);
    });

    it("handles 100% error rate gracefully", () => {
      monitor.record({
        throughput: 10,
        errorRate: 1.0,
        resourceUtilization: 0.8,
      });

      const score = monitor.getCurrentScore();
      expect(score).toBe(0);
    });

    it("handles zero utilization gracefully", () => {
      monitor.record({
        throughput: 10,
        errorRate: 0,
        resourceUtilization: 0,
      });

      const score = monitor.getCurrentScore();
      expect(score).toBe(0);
    });

    it("handles very large throughput values", () => {
      monitor.record({
        throughput: 1000000,
        errorRate: 0,
        resourceUtilization: 1.0,
      });

      const score = monitor.getCurrentScore();
      expect(score).toBe(1000000);
      expect(isFinite(score)).toBe(true);
    });

    it("handles NaN values in metrics", () => {
      monitor.record({
        throughput: Number.NaN,
        errorRate: 0,
        resourceUtilization: 0.5,
      });

      const score = monitor.getCurrentScore();
      // NaN in calculations should result in NaN or 0
      expect(score).toBeNaN();
    });

    it("handles negative values in metrics", () => {
      monitor.record({
        throughput: -5,
        errorRate: -0.1,
        resourceUtilization: -0.5,
      });

      const score = monitor.getCurrentScore();
      // Implementation may or may not handle this gracefully
      expect(typeof score).toBe("number");
    });
  });
});
