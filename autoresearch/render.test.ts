import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { directionLabel, directionArrow, renderWidget } from "./render.js";
import type { ExperimentState } from "./state.js";

// ---------------------------------------------------------------------------
// directionLabel
// ---------------------------------------------------------------------------
describe("directionLabel", () => {
  it("returns lower label for 'lower'", () => {
    expect(directionLabel("lower")).toBe("低い方が良い (min)");
  });

  it("returns higher label for 'higher'", () => {
    expect(directionLabel("higher")).toBe("高い方が良い (max)");
  });
});

// ---------------------------------------------------------------------------
// directionArrow
// ---------------------------------------------------------------------------
describe("directionArrow", () => {
  it("returns (min) for 'lower'", () => {
    expect(directionArrow("lower")).toBe("(min)");
  });

  it("returns (max) for 'higher'", () => {
    expect(directionArrow("higher")).toBe("(max)");
  });
});

// ---------------------------------------------------------------------------
// renderWidget
// ---------------------------------------------------------------------------
describe("renderWidget", () => {
  const baseState: ExperimentState = {
    name: "test",
    metricName: "time_ms",
    metricUnit: "ms",
    direction: "lower",
    bestMetric: null,
    results: [],
    runCount: 0,
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:30.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns undefined when isActive is false", () => {
    expect(renderWidget(baseState, false)).toBeUndefined();
  });

  it("returns running message when runningInfo is provided", () => {
    const startedAt = Date.now() - 12_500; // 12.5s ago
    const result = renderWidget(baseState, true, {
      startedAt,
      command: "npm test",
    });
    expect(result).toEqual(["autoresearch: 実験実行中 12.5秒 / npm test"]);
  });

  it("returns waiting-for-baseline message when runCount is 0", () => {
    const result = renderWidget(baseState, true);
    expect(result).toEqual(["autoresearch: 初期化済み / ベースライン測定待ち"]);
  });

  it("shows 未測定 when bestMetric is null with results", () => {
    const state: ExperimentState = {
      ...baseState,
      runCount: 2,
      results: [
        { type: "run", run: 1, commit: "a", metric: 10, status: "discard", description: "", timestamp: 0 },
        { type: "run", run: 2, commit: "b", metric: 20, status: "crash", description: "", timestamp: 0 },
      ],
    };
    const result = renderWidget(state, true);
    expect(result).toBeDefined();
    expect(result![0]).toContain("最良 未測定");
  });

  it("shows best metric value when bestMetric is set", () => {
    const state: ExperimentState = {
      ...baseState,
      runCount: 3,
      bestMetric: 42,
      results: [
        { type: "run", run: 1, commit: "a", metric: 50, status: "keep", description: "", timestamp: 0 },
        { type: "run", run: 2, commit: "b", metric: 45, status: "discard", description: "", timestamp: 0 },
        { type: "run", run: 3, commit: "c", metric: 42, status: "keep", description: "", timestamp: 0 },
      ],
    };
    const result = renderWidget(state, true);
    expect(result).toBeDefined();
    expect(result![0]).toContain("最良 time_ms=42ms (min)");
    expect(result![0]).toContain("採用2");
    expect(result![0]).toContain("3回");
  });

  it("counts kept results correctly with mixed statuses", () => {
    const state: ExperimentState = {
      ...baseState,
      direction: "higher",
      metricName: "score",
      metricUnit: "pt",
      runCount: 5,
      bestMetric: 99,
      results: [
        { type: "run", run: 1, commit: "a", metric: 80, status: "keep", description: "", timestamp: 0 },
        { type: "run", run: 2, commit: "b", metric: 70, status: "discard", description: "", timestamp: 0 },
        { type: "run", run: 3, commit: "c", metric: 90, status: "keep", description: "", timestamp: 0 },
        { type: "run", run: 4, commit: "d", metric: 60, status: "crash", description: "", timestamp: 0 },
        { type: "run", run: 5, commit: "e", metric: 99, status: "keep", description: "", timestamp: 0 },
      ],
    };
    const result = renderWidget(state, true);
    expect(result).toBeDefined();
    expect(result![0]).toContain("採用3");
    expect(result![0]).toContain("最良 score=99pt (max)");
    expect(result![0]).toContain("5回");
    expect(result![0]).toContain("待機中");
  });

  it("handles single keep result", () => {
    const state: ExperimentState = {
      ...baseState,
      runCount: 1,
      bestMetric: 100,
      results: [
        { type: "run", run: 1, commit: "a", metric: 100, status: "keep", description: "", timestamp: 0 },
      ],
    };
    const result = renderWidget(state, true);
    expect(result).toEqual([
      "autoresearch: 1回 / 採用1 / 最良 time_ms=100ms (min) / 待機中",
    ]);
  });

  it("shows loop ON status when loopInfo is provided", () => {
    const result = renderWidget(baseState, true, undefined, {
      enabled: true,
      iteration: 3,
      maxIterations: 50,
      noProgress: 1,
      noProgressLimit: 2,
    });
    expect(result).toEqual([
      "autoresearch: 初期化済み / ベースライン測定待ち / loop ON 3/50 / no progress 1/2",
    ]);
  });

  it("shows paused loop status", () => {
    const result = renderWidget(baseState, true, undefined, {
      enabled: false,
      iteration: 3,
      maxIterations: null,
      noProgress: 0,
      noProgressLimit: 2,
    });
    expect(result).toEqual([
      "autoresearch: 初期化済み / ベースライン測定待ち / loop paused",
    ]);
  });
});
