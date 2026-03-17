/**
 * @abdd.meta
 * path: .pi/tests/lib/analytics/behavior-storage.test.ts
 * role: behavior-storage.jsの入力検証テスト
 * why: createAndRecordMetricsのnull安全性を確保するため
 * related: .pi/extensions/web-ui/lib/analytics/behavior-storage.js
 * public_api: なし（テストファイル）
 * invariants: null入力時は早期returnしてnullを返す
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: createAndRecordMetrics関数の防御的検証をテストする。
 * what_it_does:
 *   - prompt.textが未定義の場合のスキップを確認
 *   - output.textが未定義の場合のスキップを確認
 *   - 正常入力時の動作を確認
 * why_it_exists: 本番環境でのサイレントテレメトリ損失を防ぐため
 * scope:
 *   in: null/undefined入力、正常入力
 *   out: null（スキップ時）、レコードオブジェクト（正常時）
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createAndRecordMetrics,
} from "../../../extensions/web-ui/lib/analytics/behavior-storage.js";

// モック: ファイルシステム操作
vi.mock("node:fs", () => ({
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn(() => true),
  readdirSync: vi.fn(() => []),
  readFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  statSync: vi.fn(),
}));

// モック: agent-utils
vi.mock("../../../extensions/web-ui/lib/agent/agent-utils.js", () => ({
  createRunId: () => "test-run-id",
}));

describe("createAndRecordMetrics", () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  describe("入力検証", () => {
    it("paramsがnullの場合はnullを返す", () => {
      const result = createAndRecordMetrics(null as any);
      expect(result).toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "[metrics] Missing prompt.text, skipping metrics"
      );
    });

    it("params.promptが未定義の場合はnullを返す", () => {
      const result = createAndRecordMetrics({
        output: { text: "test output" },
        execution: { durationMs: 100, retryCount: 0, outcomeCode: "SUCCESS", modelUsed: "test", thinkingLevel: "medium" },
        context: { task: "test", agentId: "test" },
      } as any);
      expect(result).toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "[metrics] Missing prompt.text, skipping metrics"
      );
    });

    it("params.prompt.textが空文字の場合はnullを返す", () => {
      const result = createAndRecordMetrics({
        source: "test",
        prompt: { text: "" },
        output: { text: "test output" },
        execution: { durationMs: 100, retryCount: 0, outcomeCode: "SUCCESS", modelUsed: "test", thinkingLevel: "medium" },
        context: { task: "test", agentId: "test" },
      });
      expect(result).toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "[metrics] Missing prompt.text, skipping metrics"
      );
    });

    it("params.outputが未定義の場合はnullを返す", () => {
      const result = createAndRecordMetrics({
        source: "test",
        prompt: { text: "test prompt" },
        execution: { durationMs: 100, retryCount: 0, outcomeCode: "SUCCESS", modelUsed: "test", thinkingLevel: "medium" },
        context: { task: "test", agentId: "test" },
      } as any);
      expect(result).toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "[metrics] Missing output.text, skipping metrics"
      );
    });

    it("params.output.textが空文字の場合はnullを返す", () => {
      const result = createAndRecordMetrics({
        source: "test",
        prompt: { text: "test prompt" },
        output: { text: "" },
        execution: { durationMs: 100, retryCount: 0, outcomeCode: "SUCCESS", modelUsed: "test", thinkingLevel: "medium" },
        context: { task: "test", agentId: "test" },
      });
      expect(result).toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "[metrics] Missing output.text, skipping metrics"
      );
    });
  });

  describe("正常系", () => {
    it("有効な入力の場合はレコードを返す", () => {
      const result = createAndRecordMetrics({
        source: "test",
        prompt: { text: "test prompt", skills: [], hasSystemPrompt: false, hasExamples: false },
        output: { text: "test output", isValid: true },
        execution: { durationMs: 100, retryCount: 0, outcomeCode: "SUCCESS", modelUsed: "test", thinkingLevel: "medium" },
        context: { task: "test task", agentId: "test-agent" },
      });

      expect(result).not.toBeNull();
      expect(result?.id).toBe("test-run-id");
      expect(result?.source).toBe("test");
      expect(result?.prompt).toBeDefined();
      expect(result?.output).toBeDefined();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });
});
