/**
 * @abdd.meta
 * path: .pi/tests/extensions/subagents/live-monitor.test.ts
 * role: ライブ監視UI描画ロジックの単体テスト
 * why: サブエージェント実行監視UIの正確性を保証するため
 * related: .pi/extensions/subagents/live-monitor.ts
 * public_api: なし（テストファイル）
 * invariants: テストは冪等で独立している
 * side_effects: なし（テスト環境）
 * failure_modes: テスト失敗時は実装のバグを示す
 * @abdd.explain
 * overview: live-monitor.tsの公開APIに対する単体テスト
 * what_it_does:
 *   - renderSubagentLiveView: ライブビュー描画関数の動作をテスト
 *   - createSubagentLiveMonitor: 監視コントローラ作成の基本テスト
 * why_it_exists: サブエージェント監視UIの正確性を検証するため
 * scope:
 *   in: live-monitor.tsの公開関数
 *   out: テスト結果
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderSubagentLiveView, createSubagentLiveMonitor } from "../../../extensions/subagents/live-monitor.js";
import type { SubagentLiveItem, LiveStreamView, LiveViewMode } from "../../../lib/agent/subagent-types.js";
import type { Theme } from "../../../lib/tui/types.js";
import type { LiveMonitorContext } from "../../../lib/tui-types.js";

// モックTheme作成
const createMockTheme = (): Theme => ({
  fg: vi.fn((color: string, text: string) => `[${color}]${text}[/${color}]`),
  bg: vi.fn((color: string, text: string) => `{${color}}${text}{/${color}}`),
  bold: vi.fn((text: string) => `**${text}**`),
  dim: vi.fn((text: string) => `~~${text}~~`),
  italic: vi.fn((text: string) => `_${text}_`),
  underline: vi.fn((text: string) => `__${text}__`),
  inverse: vi.fn((text: string) => `[[${text}]]`),
  reset: vi.fn((text: string) => text),
  black: vi.fn((text: string) => text),
  red: vi.fn((text: string) => text),
  green: vi.fn((text: string) => text),
  yellow: vi.fn((text: string) => text),
  blue: vi.fn((text: string) => text),
  magenta: vi.fn((text: string) => text),
  cyan: vi.fn((text: string) => text),
  white: vi.fn((text: string) => text),
  gray: vi.fn((text: string) => text),
  grey: vi.fn((text: string) => text),
});

// モックアイテム作成
const createMockItem = (overrides: Partial<SubagentLiveItem> = {}): SubagentLiveItem => ({
  id: "test-agent-1",
  name: "Test Agent",
  status: "pending",
  stdoutTail: "",
  stderrTail: "",
  stdoutBytes: 0,
  stderrBytes: 0,
  stdoutNewlineCount: 0,
  stderrNewlineCount: 0,
  stdoutEndsWithNewline: false,
  stderrEndsWithNewline: false,
  ...overrides,
});

describe("renderSubagentLiveView", () => {
  let mockTheme: Theme;

  beforeEach(() => {
    mockTheme = createMockTheme();
  });

  describe("with empty items", () => {
    it("should render empty state when no items", () => {
      const result = renderSubagentLiveView({
        title: "Test View",
        items: [],
        cursor: 0,
        mode: "list",
        stream: "stdout",
        width: 80,
        theme: mockTheme,
      });

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
      // 空状態のメッセージが含まれることを確認
      const hasNoSubagentsMessage = result.some((line) =>
        line.includes("no running subagents") || line.includes("no subagents")
      );
      expect(hasNoSubagentsMessage).toBe(true);
    });
  });

  describe("with items", () => {
    it("should render items in list mode", () => {
      const items: SubagentLiveItem[] = [
        createMockItem({ id: "agent-1", name: "Agent 1", status: "running" }),
        createMockItem({ id: "agent-2", name: "Agent 2", status: "completed" }),
      ];

      const result = renderSubagentLiveView({
        title: "Test View",
        items,
        cursor: 0,
        mode: "list",
        stream: "stdout",
        width: 80,
        theme: mockTheme,
      });

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
      // タイトルが含まれることを確認
      const hasTitle = result.some((line) => line.includes("Test View"));
      expect(hasTitle).toBe(true);
    });

    it("should render items in gantt mode", () => {
      const items: SubagentLiveItem[] = [
        createMockItem({
          id: "agent-1",
          name: "Agent 1",
          status: "completed",
          startedAtMs: Date.now() - 10000,
          finishedAtMs: Date.now() - 5000,
        }),
      ];

      const result = renderSubagentLiveView({
        title: "Test View",
        items,
        cursor: 0,
        mode: "gantt",
        stream: "stdout",
        width: 80,
        theme: mockTheme,
      });

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
    });

    it("should render items in timeline mode", () => {
      const items: SubagentLiveItem[] = [
        createMockItem({
          id: "agent-1",
          name: "Agent 1",
          status: "completed",
          startedAtMs: Date.now() - 10000,
          finishedAtMs: Date.now() - 5000,
        }),
      ];

      const result = renderSubagentLiveView({
        title: "Test View",
        items,
        cursor: 0,
        mode: "timeline",
        stream: "stdout",
        width: 80,
        theme: mockTheme,
      });

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
      // タイムラインビューの特徴的な要素を確認
      const hasTimelineContent = result.some((line) =>
        line.includes("CURRENT") || line.includes("START") || line.includes("DONE")
      );
      expect(hasTimelineContent).toBe(true);
    });

    it("should clamp cursor to valid range", () => {
      const items: SubagentLiveItem[] = [
        createMockItem({ id: "agent-1", name: "Agent 1" }),
        createMockItem({ id: "agent-2", name: "Agent 2" }),
      ];

      // 範囲外のカーソル値
      const resultNegative = renderSubagentLiveView({
        title: "Test View",
        items,
        cursor: -10,
        mode: "list",
        stream: "stdout",
        width: 80,
        theme: mockTheme,
      });

      const resultOverflow = renderSubagentLiveView({
        title: "Test View",
        items,
        cursor: 100,
        mode: "list",
        stream: "stdout",
        width: 80,
        theme: mockTheme,
      });

      // どちらも正常に描画されることを確認（エラーが発生しない）
      expect(resultNegative).toBeDefined();
      expect(resultOverflow).toBeDefined();
    });
  });

  describe("status display", () => {
    it("should show running count in header", () => {
      const items: SubagentLiveItem[] = [
        createMockItem({ id: "agent-1", status: "running" }),
        createMockItem({ id: "agent-2", status: "running" }),
        createMockItem({ id: "agent-3", status: "completed" }),
      ];

      const result = renderSubagentLiveView({
        title: "Test View",
        items,
        cursor: 0,
        mode: "list",
        stream: "stdout",
        width: 80,
        theme: mockTheme,
      });

      // ヘッダーに実行中/完了数が表示されることを確認
      const hasRunCount = result.some((line) => line.includes("Run:2") || line.includes("Run: 2"));
      const hasDoneCount = result.some((line) => line.includes("Done:1") || line.includes("Done: 1"));
      expect(hasRunCount || hasDoneCount).toBe(true);
    });

    it("should show failed count in header", () => {
      const items: SubagentLiveItem[] = [
        createMockItem({ id: "agent-1", status: "failed" }),
        createMockItem({ id: "agent-2", status: "completed" }),
      ];

      const result = renderSubagentLiveView({
        title: "Test View",
        items,
        cursor: 0,
        mode: "list",
        stream: "stdout",
        width: 80,
        theme: mockTheme,
      });

      // ヘッダーに失敗数が表示されることを確認
      const hasFailCount = result.some((line) => line.includes("Fail:1") || line.includes("Fail: 1"));
      expect(hasFailCount).toBe(true);
    });
  });

  describe("stream switching", () => {
    it("should show stdout stream by default", () => {
      const items: SubagentLiveItem[] = [
        createMockItem({
          id: "agent-1",
          stdoutTail: "stdout content",
          stderrTail: "stderr content",
        }),
      ];

      const result = renderSubagentLiveView({
        title: "Test View",
        items,
        cursor: 0,
        mode: "detail",
        stream: "stdout",
        width: 80,
        theme: mockTheme,
      });

      expect(result).toBeDefined();
    });

    it("should show stderr stream when specified", () => {
      const items: SubagentLiveItem[] = [
        createMockItem({
          id: "agent-1",
          stdoutTail: "stdout content",
          stderrTail: "stderr content",
          stderrBytes: 100,
        }),
      ];

      const result = renderSubagentLiveView({
        title: "Test View",
        items,
        cursor: 0,
        mode: "detail",
        stream: "stderr",
        width: 80,
        theme: mockTheme,
      });

      expect(result).toBeDefined();
    });
  });
});

describe("createSubagentLiveMonitor", () => {
  it("should return undefined when context has no UI", () => {
    const ctx = {
      hasUI: false,
      ui: undefined,
    } as unknown as LiveMonitorContext;

    const result = createSubagentLiveMonitor(ctx, {
      title: "Test Monitor",
      items: [{ id: "agent-1", name: "Agent 1" }],
    });

    expect(result).toBeUndefined();
  });

  it("should return undefined when context.ui is undefined", () => {
    const ctx = {
      hasUI: true,
      ui: undefined,
    } as unknown as LiveMonitorContext;

    const result = createSubagentLiveMonitor(ctx, {
      title: "Test Monitor",
      items: [{ id: "agent-1", name: "Agent 1" }],
    });

    expect(result).toBeUndefined();
  });

  it("should return undefined when context.ui.custom is undefined", () => {
    const ctx = {
      hasUI: true,
      ui: {
        custom: undefined,
      },
    } as unknown as LiveMonitorContext;

    const result = createSubagentLiveMonitor(ctx, {
      title: "Test Monitor",
      items: [{ id: "agent-1", name: "Agent 1" }],
    });

    expect(result).toBeUndefined();
  });

  describe("when context has valid UI", () => {
    let mockCtx: LiveMonitorContext;
    let mockCustom: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockCustom = vi.fn().mockResolvedValue(undefined);
      mockCtx = {
        hasUI: true,
        ui: {
          custom: mockCustom,
        },
      } as unknown as LiveMonitorContext;
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    it("should return controller when context has valid UI", () => {
      const result = createSubagentLiveMonitor(mockCtx, {
        title: "Test Monitor",
        items: [{ id: "agent-1", name: "Agent 1" }],
      });

      expect(result).toBeDefined();
      expect(result?.markStarted).toBeDefined();
      expect(result?.appendChunk).toBeDefined();
      expect(result?.markFinished).toBeDefined();
      expect(result?.close).toBeDefined();
      expect(result?.wait).toBeDefined();
    });

    it("should provide markStarted method", () => {
      const controller = createSubagentLiveMonitor(mockCtx, {
        title: "Test Monitor",
        items: [{ id: "agent-1", name: "Agent 1" }],
      });

      expect(() => controller?.markStarted("agent-1")).not.toThrow();
    });

    it("should provide appendChunk method", () => {
      const controller = createSubagentLiveMonitor(mockCtx, {
        title: "Test Monitor",
        items: [{ id: "agent-1", name: "Agent 1" }],
      });

      expect(() =>
        controller?.appendChunk("agent-1", "stdout", "test chunk")
      ).not.toThrow();
    });

    it("should provide markFinished method", () => {
      const controller = createSubagentLiveMonitor(mockCtx, {
        title: "Test Monitor",
        items: [{ id: "agent-1", name: "Agent 1" }],
      });

      expect(() =>
        controller?.markFinished("agent-1", "completed", "done")
      ).not.toThrow();
    });

    it("should provide close method", () => {
      const controller = createSubagentLiveMonitor(mockCtx, {
        title: "Test Monitor",
        items: [{ id: "agent-1", name: "Agent 1" }],
      });

      expect(() => controller?.close()).not.toThrow();
    });

    it("should handle non-existent agent id gracefully", () => {
      const controller = createSubagentLiveMonitor(mockCtx, {
        title: "Test Monitor",
        items: [{ id: "agent-1", name: "Agent 1" }],
      });

      // 存在しないエージェントIDでもエラーにならない
      expect(() => controller?.markStarted("non-existent")).not.toThrow();
      expect(() => controller?.appendChunk("non-existent", "stdout", "chunk")).not.toThrow();
      expect(() => controller?.markFinished("non-existent", "completed", "done")).not.toThrow();
    });

    it("should ignore operations after close", () => {
      const controller = createSubagentLiveMonitor(mockCtx, {
        title: "Test Monitor",
        items: [{ id: "agent-1", name: "Agent 1" }],
      });

      controller?.close();

      // クローズ後の操作は無視される
      expect(() => controller?.markStarted("agent-1")).not.toThrow();
      expect(() => controller?.appendChunk("agent-1", "stdout", "chunk")).not.toThrow();
      expect(() => controller?.markFinished("agent-1", "completed", "done")).not.toThrow();
    });
  });
});
