/**
 * path: tests/unit/extensions/observability-data.test.ts
 * role: observability-data拡張機能のユニットテスト
 * why: pi-events.jsonl読み込み機能を含む全クエリ機能の動作を保証するため
 * related: .pi/extensions/observability-data.ts, .pi/lib/comprehensive-logger-types.ts
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { queryObservabilityData, parsePiEventsFile } from "../../../.pi/extensions/observability-data.js";

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
      });

      expect(result.events.length).toBe(1);

      const resultEmpty = queryObservabilityData({
        trialDir,
        eventTypes: ["tool_call"],
      });

      expect(resultEmpty.events.length).toBe(0);
    });
  });
});