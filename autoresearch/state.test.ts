/**
 * autoresearch/state.test.ts — state.ts 純粋関数のユニットテスト。
 */

import { describe, it, expect } from "vitest";
import {
	parseJsonlLine,
	reconstructState,
	freshState,
	isBestMetric,
	parseMetricLines,
	countByStatus,
} from "./state.js";

// ---------------------------------------------------------------------------
// parseJsonlLine
// ---------------------------------------------------------------------------

describe("parseJsonlLine", () => {
	it("parses valid JSON object", () => {
		expect(parseJsonlLine('{"type":"config","name":"test"}')).toEqual({
			type: "config",
			name: "test",
		});
	});

	it("returns null for empty line", () => {
		expect(parseJsonlLine("")).toBeNull();
		expect(parseJsonlLine("  ")).toBeNull();
	});

	it("returns null for invalid JSON", () => {
		expect(parseJsonlLine("not json")).toBeNull();
	});

	it("returns null for JSON array", () => {
		expect(parseJsonlLine("[1,2,3]")).toBeNull();
	});

	it("returns null for JSON primitive", () => {
		expect(parseJsonlLine("42")).toBeNull();
		expect(parseJsonlLine('"hello"')).toBeNull();
	});

	it("returns null for null literal", () => {
		expect(parseJsonlLine("null")).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// freshState
// ---------------------------------------------------------------------------

describe("freshState", () => {
	it("returns default state", () => {
		const state = freshState();
		expect(state.name).toBeNull();
		expect(state.metricName).toBe("metric");
		expect(state.metricUnit).toBe("");
		expect(state.direction).toBe("lower");
		expect(state.bestMetric).toBeNull();
		expect(state.results).toHaveLength(0);
		expect(state.runCount).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// reconstructState
// ---------------------------------------------------------------------------

describe("reconstructState", () => {
	it("returns default state for empty content", () => {
		const state = reconstructState("");
		expect(state.name).toBeNull();
		expect(state.runCount).toBe(0);
	});

	it("parses config entry", () => {
		const content =
			JSON.stringify({
				type: "config",
				name: "テスト最適化",
				metricName: "total_ms",
				metricUnit: "ms",
				direction: "lower",
			}) + "\n";
		const state = reconstructState(content);
		expect(state.name).toBe("テスト最適化");
		expect(state.metricName).toBe("total_ms");
		expect(state.metricUnit).toBe("ms");
		expect(state.direction).toBe("lower");
	});

	it("parses run entries and tracks best metric (lower)", () => {
		const content = [
			JSON.stringify({ type: "config", name: "test", metricName: "ms", metricUnit: "ms", direction: "lower" }),
			JSON.stringify({ type: "run", run: 1, commit: "abc1234", metric: 100.5, status: "keep", description: "baseline" }),
			JSON.stringify({ type: "run", run: 2, commit: "def5678", metric: 95.0, status: "keep", description: "改善" }),
		].join("\n") + "\n";

		const state = reconstructState(content);
		expect(state.runCount).toBe(2);
		expect(state.results).toHaveLength(2);
		expect(state.bestMetric).toBe(95.0);
	});

	it("parses run entries and tracks best metric (higher)", () => {
		const content = [
			JSON.stringify({ type: "config", name: "test", metricName: "score", metricUnit: "", direction: "higher" }),
			JSON.stringify({ type: "run", run: 1, commit: "a", metric: 80, status: "keep", description: "" }),
			JSON.stringify({ type: "run", run: 2, commit: "b", metric: 95, status: "keep", description: "" }),
			JSON.stringify({ type: "run", run: 3, commit: "c", metric: 90, status: "keep", description: "" }),
		].join("\n") + "\n";

		const state = reconstructState(content);
		expect(state.bestMetric).toBe(95);
	});

	it("ignores discard and crash for best metric", () => {
		const content = [
			JSON.stringify({ type: "config", name: "test", metricName: "ms", direction: "lower" }),
			JSON.stringify({ type: "run", run: 1, metric: 100, status: "keep", description: "" }),
			JSON.stringify({ type: "run", run: 2, metric: 50, status: "discard", description: "" }),
			JSON.stringify({ type: "run", run: 3, metric: 30, status: "crash", description: "" }),
		].join("\n") + "\n";

		const state = reconstructState(content);
		expect(state.bestMetric).toBe(100);
	});

	it("ignores broken JSONL lines", () => {
		const content = [
			JSON.stringify({ type: "config", name: "test", metricName: "ms" }),
			"this is not json",
			JSON.stringify({ type: "run", run: 1, metric: 100, status: "keep", description: "" }),
			"",
		].join("\n") + "\n";

		const state = reconstructState(content);
		expect(state.runCount).toBe(1);
		expect(state.results).toHaveLength(1);
	});

	it("resets on new config header (segment)", () => {
		const content = [
			JSON.stringify({ type: "config", name: "test1", metricName: "ms" }),
			JSON.stringify({ type: "run", run: 1, metric: 100, status: "keep", description: "" }),
			JSON.stringify({ type: "config", name: "test2", metricName: "kb", direction: "higher" }),
			JSON.stringify({ type: "run", run: 1, metric: 500, status: "keep", description: "" }),
		].join("\n") + "\n";

		const state = reconstructState(content);
		expect(state.name).toBe("test2");
		expect(state.metricName).toBe("kb");
		expect(state.direction).toBe("higher");
		expect(state.runCount).toBe(1);
		expect(state.bestMetric).toBe(500);
	});

	it("parses run entry with metrics and memo", () => {
		const content = [
			JSON.stringify({ type: "config", name: "test", metricName: "ms" }),
			JSON.stringify({
				type: "run",
				run: 1,
				metric: 100,
				status: "keep",
				description: "baseline",
				commit: "abc",
				metrics: { compile_ms: 40, render_ms: 60 },
				memo: "初回ベースライン",
			}),
		].join("\n") + "\n";

		const state = reconstructState(content);
		expect(state.results[0]?.metrics).toEqual({ compile_ms: 40, render_ms: 60 });
		expect(state.results[0]?.memo).toBe("初回ベースライン");
	});

	it("handles missing fields with defaults", () => {
		const content = [
			JSON.stringify({ type: "config" }),
			JSON.stringify({ type: "run", run: 1 }),
		].join("\n") + "\n";

		const state = reconstructState(content);
		expect(state.name).toBeNull();
		expect(state.metricName).toBe("metric");
		const run = state.results[0]!;
		expect(run.commit).toBe("unknown");
		expect(run.metric).toBe(0);
		expect(run.status).toBe("crash");
		expect(run.description).toBe("");
	});
});

// ---------------------------------------------------------------------------
// isBestMetric
// ---------------------------------------------------------------------------

describe("isBestMetric", () => {
	it("returns true when best is null", () => {
		expect(isBestMetric(null, 100, "lower")).toBe(true);
		expect(isBestMetric(null, 100, "higher")).toBe(true);
	});

	it("returns true for better lower value", () => {
		expect(isBestMetric(100, 90, "lower")).toBe(true);
		expect(isBestMetric(100, 100, "lower")).toBe(false);
		expect(isBestMetric(100, 110, "lower")).toBe(false);
	});

	it("returns true for better higher value", () => {
		expect(isBestMetric(80, 90, "higher")).toBe(true);
		expect(isBestMetric(80, 80, "higher")).toBe(false);
		expect(isBestMetric(80, 70, "higher")).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// parseMetricLines
// ---------------------------------------------------------------------------

describe("parseMetricLines", () => {
	it("parses single METRIC line", () => {
		const output = "Some output\nMETRIC total_ms=123.4\nMore output";
		expect(parseMetricLines(output)).toEqual({ total_ms: 123.4 });
	});

	it("parses multiple METRIC lines", () => {
		const output = "METRIC total_ms=123.4\nMETRIC compile_ms=45.6\nMETRIC render_ms=77.8";
		expect(parseMetricLines(output)).toEqual({
			total_ms: 123.4,
			compile_ms: 45.6,
			render_ms: 77.8,
		});
	});

	it("returns empty object for no METRIC lines", () => {
		expect(parseMetricLines("Running tests...\nAll passed")).toEqual({});
	});

	it("returns empty object for empty string", () => {
		expect(parseMetricLines("")).toEqual({});
	});

	it("ignores METRIC with no equals sign", () => {
		expect(parseMetricLines("METRIC broken")).toEqual({});
	});

	it("ignores METRIC with non-numeric value", () => {
		expect(parseMetricLines("METRIC name=abc")).toEqual({});
	});

	it("parses integer value", () => {
		expect(parseMetricLines("METRIC count=42")).toEqual({ count: 42 });
	});

	it("handles whitespace around METRIC", () => {
		expect(parseMetricLines("  METRIC  x = 1.5  ")).toEqual({ x: 1.5 });
	});
});

// ---------------------------------------------------------------------------
// countByStatus
// ---------------------------------------------------------------------------

describe("countByStatus", () => {
	const results = [
		{ type: "run" as const, run: 1, commit: "a", metric: 1, status: "keep" as const, description: "", timestamp: 0 },
		{ type: "run" as const, run: 2, commit: "b", metric: 2, status: "discard" as const, description: "", timestamp: 0 },
		{ type: "run" as const, run: 3, commit: "c", metric: 3, status: "keep" as const, description: "", timestamp: 0 },
		{ type: "run" as const, run: 4, commit: "d", metric: 4, status: "crash" as const, description: "", timestamp: 0 },
		{ type: "run" as const, run: 5, commit: "e", metric: 5, status: "checks_failed" as const, description: "", timestamp: 0 },
	];

	it("counts keep", () => {
		expect(countByStatus(results, "keep")).toBe(2);
	});

	it("counts discard", () => {
		expect(countByStatus(results, "discard")).toBe(1);
	});

	it("counts crash", () => {
		expect(countByStatus(results, "crash")).toBe(1);
	});

	it("counts checks_failed", () => {
		expect(countByStatus(results, "checks_failed")).toBe(1);
	});

	it("returns 0 for empty results", () => {
		expect(countByStatus([], "keep")).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// checks_failed status
// ---------------------------------------------------------------------------

describe("checks_failed status", () => {
	it("is parsed from JSONL", () => {
		const content = [
			JSON.stringify({ type: "config", name: "test", metricName: "ms" }),
			JSON.stringify({ type: "run", run: 1, metric: 100, status: "checks_failed", description: "テスト失敗" }),
		].join("\n") + "\n";
		const state = reconstructState(content);
		expect(state.results[0]?.status).toBe("checks_failed");
		expect(state.runCount).toBe(1);
	});

	it("is not counted as best metric", () => {
		const content = [
			JSON.stringify({ type: "config", name: "test", metricName: "ms", direction: "lower" }),
			JSON.stringify({ type: "run", run: 1, metric: 100, status: "keep", description: "" }),
			JSON.stringify({ type: "run", run: 2, metric: 50, status: "checks_failed", description: "" }),
		].join("\n") + "\n";
		const state = reconstructState(content);
		expect(state.bestMetric).toBe(100);
	});

	it("unknown status defaults to crash", () => {
		const content = [
			JSON.stringify({ type: "config", name: "test", metricName: "ms" }),
			JSON.stringify({ type: "run", run: 1, metric: 100, status: "unknown_status", description: "" }),
		].join("\n") + "\n";
		const state = reconstructState(content);
		expect(state.results[0]?.status).toBe("crash");
	});

	it("skips run entry without numeric run field", () => {
		const content = [
			JSON.stringify({ type: "config", name: "test", metricName: "ms" }),
			JSON.stringify({ type: "run", run: "not-a-number", metric: 100, status: "keep", description: "" }),
			JSON.stringify({ type: "run", metric: 200, status: "keep", description: "" }),
		].join("\n") + "\n";
		const state = reconstructState(content);
		expect(state.runCount).toBe(0);
		expect(state.results).toHaveLength(0);
	});

	it("filters out non-numeric values in metrics", () => {
		const content = [
			JSON.stringify({ type: "config", name: "test", metricName: "ms" }),
			JSON.stringify({
				type: "run",
				run: 1,
				metric: 100,
				status: "keep",
				description: "",
				metrics: { valid: 42, invalid: "not-a-number", also_valid: 0 },
			}),
		].join("\n") + "\n";
		const state = reconstructState(content);
		expect(state.results[0]?.metrics).toEqual({ valid: 42, also_valid: 0 });
	});

	it("omits metrics when all values are non-numeric", () => {
		const content = [
			JSON.stringify({ type: "config", name: "test", metricName: "ms" }),
			JSON.stringify({
				type: "run",
				run: 1,
				metric: 100,
				status: "keep",
				description: "",
				metrics: { a: "x", b: true },
			}),
		].join("\n") + "\n";
		const state = reconstructState(content);
		expect(state.results[0]?.metrics).toBeUndefined();
	});
});
