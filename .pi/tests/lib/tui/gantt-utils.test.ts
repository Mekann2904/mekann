/**
 * path: .pi/tests/lib/tui/gantt-utils.test.ts
 * role: gantt-utils の時間軸とスケール計算の単体テスト
 * why: ライブモニターのガント表示ズレを防ぐため
 * related: .pi/lib/tui/gantt-utils.ts, .pi/extensions/subagents/live-monitor.ts, .pi/extensions/agent-teams/live-monitor.ts
 */

import { describe, expect, it, vi } from "vitest";
import {
  calculateAdaptiveScale,
  renderGanttBar,
  renderGanttView,
  renderTimeAxis,
  type GanttConfig,
  type GanttItem,
} from "../../../lib/tui/gantt-utils.js";

function createTheme() {
  return {
    fg: vi.fn((_color: string, text: string) => text),
    bold: vi.fn((text: string) => text),
  };
}

describe("gantt-utils", () => {
  it("calculateAdaptiveScale_左端が最初の開始時刻に一致する", () => {
    const base = 1_700_000_000_000;
    const items: GanttItem[] = [
      {
        id: "a",
        status: "running",
        startedAtMs: base,
        finishedAtMs: base + 5_000,
        stdoutTail: "",
        stderrTail: "",
        stdoutBytes: 0,
        stderrBytes: 0,
        stdoutNewlineCount: 0,
        stderrNewlineCount: 0,
        stdoutEndsWithNewline: false,
        stderrEndsWithNewline: false,
      },
    ];

    const result = calculateAdaptiveScale(items, 80);

    expect(result.timeStart).toBe(base);
    expect(result.timeEnd).toBe(base + 5_000);
  });

  it("renderTimeAxis_狭い幅でもtickCountが0にならない", () => {
    const theme = createTheme();
    const config: GanttConfig = {
      timeStart: 0,
      timeEnd: 2_000,
      axisWidth: 8,
    };

    const lines = renderTimeAxis(config, theme as any);

    expect(lines.length).toBe(3);
    expect(lines[0].length).toBe(8);
    expect(lines[2]).toContain("Scale:");
  });

  it("renderGanttBar_開始直後からRUNバーが描画される", () => {
    const base = 1_700_000_000_000;
    const item: GanttItem = {
      id: "runner",
      status: "running",
      startedAtMs: base,
      finishedAtMs: base + 10_000,
      stdoutTail: "",
      stderrTail: "",
      stdoutBytes: 0,
      stderrBytes: 0,
      stdoutNewlineCount: 0,
      stderrNewlineCount: 0,
      stdoutEndsWithNewline: false,
      stderrEndsWithNewline: false,
    };

    const bar = renderGanttBar(
      item,
      {
        timeStart: base,
        timeEnd: base + 10_000,
        axisWidth: 20,
      },
      createTheme() as any,
    );

    expect(bar[0]).toBe("·");
    expect(bar.replace(/·/g, "").trim()).toBe("");
  });

  it("renderGanttView_ANSI配色でも軸tickとバー開始列が一致する", () => {
    const stripAnsi = (input: string): string => input.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
    const now = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);

    const theme = {
      fg: (_color: string, text: string) => `\x1b[36m${text}\x1b[0m`,
      bold: (text: string) => `\x1b[1m${text}\x1b[0m`,
    };
    const items: GanttItem[] = [
      {
        id: "runner",
        name: "bug-war-room",
        status: "running",
        startedAtMs: now - 10_000,
        lastChunkAtMs: now,
        stdoutTail: "",
        stderrTail: "",
        stdoutBytes: 0,
        stderrBytes: 0,
        stdoutNewlineCount: 0,
        stderrNewlineCount: 0,
        stdoutEndsWithNewline: false,
        stderrEndsWithNewline: false,
      },
    ];

    const lines = renderGanttView(items, 120, 40, theme as any, false).map(stripAnsi);
    const scaleLineIndex = lines.findIndex((l) => l.includes("Scale:"));
    const axisLine = scaleLineIndex >= 2 ? lines[scaleLineIndex - 2] : undefined;
    const barLine = lines.find((l) => l.includes("bug-war-room"));
    const axisTickIndex = axisLine?.indexOf("│") ?? -1;
    const barStartIndex = barLine?.search(/[·=~:.]/) ?? -1;

    expect(axisLine).toBeDefined();
    expect(barLine).toBeDefined();
    expect(axisTickIndex).toBe(barStartIndex);
  });
});
