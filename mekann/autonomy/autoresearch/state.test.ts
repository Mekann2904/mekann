/**
 * autoresearch/state.test.ts — state.ts 純粋関数のユニットテスト。
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
	parseJsonlLine,
	reconstructState,
	freshState,
	isBestMetric,
	parseMetricLines,
	countByStatus,
	appendToJsonl,
	readJsonlEntries,
	writePointer,
	readPointer,
	isBestPointerMetric,
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

	it("parses METRIC: colon format", () => {
		expect(parseMetricLines("METRIC: total_ms=123.4")).toEqual({ total_ms: 123.4 });
	});

	it("parses multiple METRIC: colon format lines", () => {
		const output = "METRIC: total_ms=123.4\nMETRIC: other=10";
		expect(parseMetricLines(output)).toEqual({ total_ms: 123.4, other: 10 });
	});

	it("handles mixed METRIC and METRIC: formats", () => {
		const output = "METRIC total_ms=100\nMETRIC: other=200";
		expect(parseMetricLines(output)).toEqual({ total_ms: 100, other: 200 });
	});

	it("rejects Infinity values that would JSON-serialize to null", () => {
		const output = "METRIC good=42\nMETRIC pos_inf=Infinity\nMETRIC neg_inf=-Infinity";
		expect(parseMetricLines(output)).toEqual({ good: 42 });
	});

	it("rejects NaN and numeric overflow (1e999) values", () => {
		const output = "METRIC good=10\nMETRIC not_a_num=abc\nMETRIC overflow=1e999";
		expect(parseMetricLines(output)).toEqual({ good: 10 });
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
// Ledger functions
// ---------------------------------------------------------------------------

describe("appendToJsonl / readJsonlEntries", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = `/tmp/test-state-${Date.now()}`;
		fs.mkdirSync(tmpDir, { recursive: true });
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("appends and reads entries", () => {
		const fp = path.join(tmpDir, "test.jsonl");
		appendToJsonl(fp, { type: "a", value: 1 });
		appendToJsonl(fp, { type: "b", value: 2 });
		const entries = readJsonlEntries(fp);
		expect(entries).toHaveLength(2);
		expect(entries[0]).toMatchObject({ type: "a", value: 1 });
		expect(entries[1]).toMatchObject({ type: "b", value: 2 });
	});

	it("returns empty array for non-existent file", () => {
		const entries = readJsonlEntries("/tmp/nonexistent.jsonl");
		expect(entries).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// Pointer functions
// ---------------------------------------------------------------------------

describe("writePointer / readPointer", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = `/tmp/test-state-ptr-${Date.now()}`;
		fs.mkdirSync(tmpDir, { recursive: true });
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("writes and reads a pointer", () => {
		const fp = path.join(tmpDir, "test.pointer.json");
		const pointer = { piRunId: "run1", runSeq: 1, metric: 42, timestamp: Date.now(), gitCommit: "abc" };
		writePointer(fp, pointer);
		const read = readPointer(fp);
		expect(read).toMatchObject(pointer);
	});

	it("overwrites existing pointer", () => {
		const fp = path.join(tmpDir, "test.pointer.json");
		writePointer(fp, { piRunId: "run1", runSeq: 1, metric: 42, timestamp: 0, gitCommit: "a" });
		writePointer(fp, { piRunId: "run2", runSeq: 2, metric: 30, timestamp: 1, gitCommit: "b" });
		const read = readPointer(fp);
		expect(read?.metric).toBe(30);
	});

	it("returns null for non-existent file", () => {
		expect(readPointer("/tmp/nonexistent")).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// isBestPointerMetric
// ---------------------------------------------------------------------------

describe("isBestPointerMetric", () => {
	it("returns true when bestPointer is null", () => {
		expect(isBestPointerMetric(100, null, "lower")).toBe(true);
	});

	it("returns true for better lower value", () => {
		const best = { piRunId: "r1", runSeq: 1, metric: 100, timestamp: 0, gitCommit: "a" };
		expect(isBestPointerMetric(80, best, "lower")).toBe(true);
		expect(isBestPointerMetric(120, best, "lower")).toBe(false);
	});

	it("returns true for better higher value", () => {
		const best = { piRunId: "r1", runSeq: 1, metric: 50, timestamp: 0, gitCommit: "a" };
		expect(isBestPointerMetric(80, best, "higher")).toBe(true);
		expect(isBestPointerMetric(30, best, "higher")).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// reconstructState with new fields
// ---------------------------------------------------------------------------

describe("reconstructState with long-run fields", () => {
	it("parses piRunId and external fields", () => {
		const content = [
			JSON.stringify({ type: "config", name: "test", metricName: "ms" }),
			JSON.stringify({
				type: "run",
				run: 1,
				metric: 100,
				status: "keep",
				description: "baseline",
				commit: "abc",
				piRunId: "20260517T153000.000Z-pi-abc123-def456",
				createdAt: 1747492200000,
				startedAt: 1747492200100,
				completedAt: 1747492210100,
				durationSeconds: 10,
				externalRunId: "bench-ext-1",
				externalArtifactDir: "/tmp/artifacts/1",
				externalSummaryPath: "/tmp/artifacts/1/summary.json",
				externalViewlogPath: "/tmp/artifacts/1/viewlog.json",
				externalMetricsPath: "/tmp/artifacts/1/metrics.json",
				signal: null,
			}),
		].join("\n") + "\n";

		const state = reconstructState(content);
		expect(state.results[0]?.piRunId).toBe("20260517T153000.000Z-pi-abc123-def456");
		expect(state.results[0]?.externalRunId).toBe("bench-ext-1");
		expect(state.results[0]?.externalArtifactDir).toBe("/tmp/artifacts/1");
		expect(state.results[0]?.externalSummaryPath).toBe("/tmp/artifacts/1/summary.json");
		expect(state.results[0]?.externalViewlogPath).toBe("/tmp/artifacts/1/viewlog.json");
		expect(state.results[0]?.externalMetricsPath).toBe("/tmp/artifacts/1/metrics.json");
		expect(state.results[0]?.createdAt).toBe(1747492200000);
		expect(state.results[0]?.startedAt).toBe(1747492200100);
		expect(state.results[0]?.completedAt).toBe(1747492210100);
		expect(state.results[0]?.durationSeconds).toBe(10);
	});

	it("parses sessionId from config", () => {
		const content = JSON.stringify({ type: "config", name: "test", metricName: "ms", sessionId: "sess-123" }) + "\n";
		const state = reconstructState(content);
		expect(state.sessionId).toBe("sess-123");
	});
});

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

// ---------------------------------------------------------------------------
// Provenance fields in parseRunEntry
// ---------------------------------------------------------------------------

describe("parseRunEntry: provenance fields", () => {
	it("parses runId and command", () => {
		const content = [
			JSON.stringify({ type: "config", name: "test", metricName: "ms" }),
			JSON.stringify({
				type: "run", run: 1, metric: 100, status: "keep", description: "",
				runId: "pi-run-abc",
				command: "npm test",
			}),
		].join("\n") + "\n";
		const state = reconstructState(content);
		expect(state.results[0]?.runId).toBe("pi-run-abc");
		expect(state.results[0]?.command).toBe("npm test");
	});

	it("parses exitCode (number and null)", () => {
		const content = [
			JSON.stringify({ type: "config", name: "test", metricName: "ms" }),
			JSON.stringify({ type: "run", run: 1, metric: 100, status: "crash", description: "", exitCode: 1 }),
		].join("\n") + "\n";
		const state = reconstructState(content);
		expect(state.results[0]?.exitCode).toBe(1);
	});

	it("parses exitCode null", () => {
		const content = [
			JSON.stringify({ type: "config", name: "test", metricName: "ms" }),
			JSON.stringify({ type: "run", run: 1, metric: 100, status: "keep", description: "", exitCode: null }),
		].join("\n") + "\n";
		const state = reconstructState(content);
		expect(state.results[0]?.exitCode).toBeNull();
	});

	it("parses timedOut and checksPassed", () => {
		const content = [
			JSON.stringify({ type: "config", name: "test", metricName: "ms" }),
			JSON.stringify({ type: "run", run: 1, metric: 100, status: "keep", description: "", timedOut: true, checksPassed: true }),
		].join("\n") + "\n";
		const state = reconstructState(content);
		expect(state.results[0]?.timedOut).toBe(true);
		expect(state.results[0]?.checksPassed).toBe(true);
	});

	it("parses checksPassed null", () => {
		const content = [
			JSON.stringify({ type: "config", name: "test", metricName: "ms" }),
			JSON.stringify({ type: "run", run: 1, metric: 100, status: "keep", description: "", checksPassed: null }),
		].join("\n") + "\n";
		const state = reconstructState(content);
		expect(state.results[0]?.checksPassed).toBeNull();
	});

	it("parses git provenance fields", () => {
		const content = [
			JSON.stringify({ type: "config", name: "test", metricName: "ms" }),
			JSON.stringify({
				type: "run", run: 1, metric: 100, status: "keep", description: "",
				preCommit: "abc1234", postCommit: "def5678",
				dirtyBefore: true, dirtyAfter: false,
			}),
		].join("\n") + "\n";
		const state = reconstructState(content);
		expect(state.results[0]?.preCommit).toBe("abc1234");
		expect(state.results[0]?.postCommit).toBe("def5678");
		expect(state.results[0]?.dirtyBefore).toBe(true);
		expect(state.results[0]?.dirtyAfter).toBe(false);
	});

	it("parses changedFiles and notes", () => {
		const content = [
			JSON.stringify({ type: "config", name: "test", metricName: "ms" }),
			JSON.stringify({
				type: "run", run: 1, metric: 100, status: "keep", description: "",
				changedFiles: ["src/a.ts", "src/b.ts"],
				notes: "some notes",
			}),
		].join("\n") + "\n";
		const state = reconstructState(content);
		expect(state.results[0]?.changedFiles).toEqual(["src/a.ts", "src/b.ts"]);
		expect(state.results[0]?.notes).toBe("some notes");
	});

	it("filters non-string values in changedFiles", () => {
		const content = [
			JSON.stringify({ type: "config", name: "test", metricName: "ms" }),
			JSON.stringify({
				type: "run", run: 1, metric: 100, status: "keep", description: "",
				changedFiles: ["src/a.ts", 42, null, "src/b.ts"],
			}),
		].join("\n") + "\n";
		const state = reconstructState(content);
		expect(state.results[0]?.changedFiles).toEqual(["src/a.ts", "src/b.ts"]);
	});

	it("parses memo field", () => {
		const content = [
			JSON.stringify({ type: "config", name: "test", metricName: "ms" }),
			JSON.stringify({
				type: "run", run: 1, metric: 100, status: "keep", description: "",
				memo: "test memo",
			}),
		].join("\n") + "\n";
		const state = reconstructState(content);
		expect(state.results[0]?.memo).toBe("test memo");
	});

	it("parses signal field", () => {
		const content = [
			JSON.stringify({ type: "config", name: "test", metricName: "ms" }),
			JSON.stringify({
				type: "run", run: 1, metric: 100, status: "crash", description: "",
				signal: "SIGTERM",
			}),
		].join("\n") + "\n";
		const state = reconstructState(content);
		expect(state.results[0]?.signal).toBe("SIGTERM");
	});
});
