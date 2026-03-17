/**
 * path: tests/unit/extensions/observability-data.test.ts
 * role: observability-data拡張機能のユニットテスト
 * why: pi-events.jsonl読み込み機能を含む全クエリ機能の動作を保証するため
 * related: .pi/extensions/observability-data.ts, .pi/lib/comprehensive-logger-types.ts
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { queryObservabilityData, parsePiEventsFile, parseMetricsFile } from "../../../.pi/extensions/observability-data.js";

const createdRoots: string[] = [];

function createTempRoot(): string {
  const root = join(process.cwd(), ".tmp-observability-data", `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(root, { recursive: true });
  createdRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of createdRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("observability-data", () => {
  describe("parsePiEventsFile", () => {
    it("message_startイベントからLLMメトリクスを抽出する", () => {
      const trialDir = createTempRoot();
      mkdirSync(join(trialDir, "agent"), { recursive: true });

      const eventsPath = join(trialDir, "agent", "pi-events.jsonl");
      writeFileSync(eventsPath, JSON.stringify({
        type: "message_start",
        message: {
          role: "assistant",
          usage: {
            input: 1000,
            output: 500,
            totalTokens: 1500,
            cacheRead: 100,
            cacheWrite: 50,
            cost: { total: 0.0123 },
          },
        },
      }) + "\n");

      const result = parsePiEventsFile(trialDir);

      expect(result.events.length).toBe(1);
      expect(result.events[0]?.eventType).toBe("llm_response");
      expect(result.events[0]?.data?.inputTokens).toBe(1000);
      expect(result.events[0]?.data?.outputTokens).toBe(500);
      expect(result.events[0]?.data?.totalTokens).toBe(1500);
    });

    it("message_updateイベントからLLMメトリクスを抽出する", () => {
      const trialDir = createTempRoot();
      mkdirSync(join(trialDir, "agent"), { recursive: true });

      const eventsPath = join(trialDir, "agent", "pi-events.jsonl");
      writeFileSync(eventsPath, JSON.stringify({
        type: "message_update",
        assistantMessageEvent: {
          type: "text_delta",
          partial: {
            usage: {
              input: 2000,
              output: 800,
              totalTokens: 2800,
            },
          },
        },
      }) + "\n");

      const result = parsePiEventsFile(trialDir);

      expect(result.events.length).toBe(1);
      expect(result.events[0]?.eventType).toBe("llm_response");
      expect(result.events[0]?.data?.inputTokens).toBe(2000);
      expect(result.events[0]?.data?.outputTokens).toBe(800);
    });

    it("usageがないイベントはスキップする", () => {
      const trialDir = createTempRoot();
      mkdirSync(join(trialDir, "agent"), { recursive: true });

      const eventsPath = join(trialDir, "agent", "pi-events.jsonl");
      writeFileSync(eventsPath, JSON.stringify({
        type: "agent_start",
      }) + "\n" + JSON.stringify({
        type: "message_start",
        message: { role: "user" },
      }) + "\n");

      const result = parsePiEventsFile(trialDir);

      expect(result.events.length).toBe(0);
    });

    it("pi-events.jsonlが存在しない場合は空を返す", () => {
      const trialDir = createTempRoot();

      const result = parsePiEventsFile(trialDir);

      expect(result.events.length).toBe(0);
    });

    it("複数のイベントを正しく処理する", () => {
      const trialDir = createTempRoot();
      mkdirSync(join(trialDir, "agent"), { recursive: true });

      const eventsPath = join(trialDir, "agent", "pi-events.jsonl");
      writeFileSync(eventsPath, [
        JSON.stringify({
          type: "message_start",
          message: {
            role: "assistant",
            usage: { input: 1000, output: 500 },
          },
        }),
        JSON.stringify({
          type: "message_update",
          assistantMessageEvent: {
            partial: { usage: { input: 2000, output: 1000 } },
          },
        }),
        JSON.stringify({
          type: "message_start",
          message: {
            role: "assistant",
            usage: { input: 500, output: 300 },
          },
        }),
      ].join("\n") + "\n");

      const result = parsePiEventsFile(trialDir);

      expect(result.events.length).toBe(3);
    });
  });

  describe("queryObservabilityData with trialDir", () => {
    it("trialDirを指定してpi-events.jsonlからクエリする", () => {
      const trialDir = createTempRoot();
      mkdirSync(join(trialDir, "agent"), { recursive: true });

      const eventsPath = join(trialDir, "agent", "pi-events.jsonl");
      writeFileSync(eventsPath, JSON.stringify({
        type: "message_start",
        message: {
          role: "assistant",
          usage: {
            input: 1000,
            output: 500,
            totalTokens: 1500,
          },
        },
      }) + "\n");

      const result = queryObservabilityData({
        trialDir,
        includeStats: true,
        includeMetrics: false, // trialDirテストではメトリクスを除外
      });

      expect(result.events.length).toBe(1);
      expect(result.filesRead[0]).toContain("pi-events.jsonl");
      expect(result.stats?.llmCallsCount).toBe(1);
    });

    it("eventTypesフィルタが正しく動作する", () => {
      const trialDir = createTempRoot();
      mkdirSync(join(trialDir, "agent"), { recursive: true });

      const eventsPath = join(trialDir, "agent", "pi-events.jsonl");
      writeFileSync(eventsPath, JSON.stringify({
        type: "message_start",
        message: {
          role: "assistant",
          usage: { input: 1000, output: 500 },
        },
      }) + "\n");

      const result = queryObservabilityData({
        trialDir,
        eventTypes: ["llm_response"],
        includeMetrics: false, // trialDirテストではメトリクスを除外
      });

      expect(result.events.length).toBe(1);

      const resultEmpty = queryObservabilityData({
        trialDir,
        eventTypes: ["tool_call"],
        includeMetrics: false, // trialDirテストではメトリクスを除外
      });

      expect(resultEmpty.events.length).toBe(0);
    });
  });

  describe("parseMetricsFile", () => {
    it("preemptionイベントをLogEvent形式に変換する", () => {
      const metricsDir = createTempRoot();
      mkdirSync(metricsDir, { recursive: true });

      const metricsPath = join(metricsDir, "scheduler-metrics-2026-03-17.jsonl");
      writeFileSync(metricsPath, JSON.stringify({
        type: "preemption",
        taskId: "task-123",
        reason: "rate_limit",
        timestamp: Date.now(),
      }) + "\n");

      const result = parseMetricsFile(metricsPath);

      expect(result.events.length).toBe(1);
      expect(result.events[0].eventType).toBe("preemption");
      expect(result.events[0].data.taskId).toBe("task-123");
      expect(result.events[0].data.reason).toBe("rate_limit");
    });

    it("work_stealイベントをLogEvent形式に変換する", () => {
      const metricsDir = createTempRoot();
      mkdirSync(metricsDir, { recursive: true });

      const metricsPath = join(metricsDir, "scheduler-metrics-2026-03-17.jsonl");
      writeFileSync(metricsPath, JSON.stringify({
        type: "work_steal",
        sourceInstance: "instance-1",
        taskId: "task-456",
        timestamp: Date.now(),
      }) + "\n");

      const result = parseMetricsFile(metricsPath);

      expect(result.events.length).toBe(1);
      expect(result.events[0].eventType).toBe("work_steal");
      expect(result.events[0].data.sourceInstance).toBe("instance-1");
      expect(result.events[0].data.taskId).toBe("task-456");
    });

    it("task_completionイベントをLogEvent形式に変換する", () => {
      const metricsDir = createTempRoot();
      mkdirSync(metricsDir, { recursive: true });

      const metricsPath = join(metricsDir, "scheduler-metrics-2026-03-17.jsonl");
      writeFileSync(metricsPath, JSON.stringify({
        type: "task_completion",
        taskId: "task-789",
        source: "test",
        provider: "anthropic",
        model: "claude-3",
        priority: "high",
        waitedMs: 100,
        executionMs: 500,
        success: true,
        timestamp: Date.now(),
      }) + "\n");

      const result = parseMetricsFile(metricsPath);

      expect(result.events.length).toBe(1);
      expect(result.events[0].eventType).toBe("task_completion");
      expect(result.events[0].data.taskId).toBe("task-789");
      expect(result.events[0].data.provider).toBe("anthropic");
      expect(result.events[0].data.success).toBe(true);
    });

    it("複数のイベントを正しく処理する", () => {
      const metricsDir = createTempRoot();
      mkdirSync(metricsDir, { recursive: true });

      const metricsPath = join(metricsDir, "scheduler-metrics-2026-03-17.jsonl");
      writeFileSync(
        metricsPath,
        JSON.stringify({ type: "preemption", taskId: "task-1", reason: "test", timestamp: Date.now() }) + "\n" +
        JSON.stringify({ type: "work_steal", sourceInstance: "inst-1", taskId: "task-2", timestamp: Date.now() }) + "\n" +
        JSON.stringify({ type: "task_completion", taskId: "task-3", source: "test", provider: "test", model: "test", priority: "medium", waitedMs: 0, executionMs: 100, success: true, timestamp: Date.now() }) + "\n"
      );

      const result = parseMetricsFile(metricsPath);

      expect(result.events.length).toBe(3);
      expect(result.events.find(e => e.eventType === "preemption")).toBeDefined();
      expect(result.events.find(e => e.eventType === "work_steal")).toBeDefined();
      expect(result.events.find(e => e.eventType === "task_completion")).toBeDefined();
    });

    it("metricsDirが存在しない場合は空を返す", () => {
      const result = parseMetricsFile("/nonexistent/path/scheduler-metrics-2026-03-17.jsonl");
      expect(result.events.length).toBe(0);
      expect(result.parseErrors).toBe(0);
    });
  });
});