/**
 * report/tables.test.ts — Markdown 表・行レンダラの focused test。
 * {@link "./tables.js"} を直接 import して単体検証する。
 */
import { describe, expect, it } from "vitest";
import type { ActualProviderSummary, ParsedActualUsageLog } from "../reportTypes.js";
import {
	formatUnknownRoleNote,
	renderActualSummaryRows,
	renderLowHitRows,
	renderMetricRows,
	renderWarningBreakdownRows,
	renderWarningCategoryRows,
} from "./tables.js";

describe("formatUnknownRoleNote", () => {
	it("returns empty string for no data", () => {
		expect(formatUnknownRoleNote(0, 0)).toBe("");
	});
	it("flags ratios at or above 10%", () => {
		expect(formatUnknownRoleNote(10, 100)).toContain("above 10% target");
		expect(formatUnknownRoleNote(9, 100)).not.toContain("above 10% target");
	});
});

describe("renderMetricRows", () => {
	it("renders one markdown table row per metric, escaping pipes via names", () => {
		const out = renderMetricRows([["a", 1], ["b<", 2]]);
		expect(out).toBe("| a | 1 |\n| b&lt; | 2 |");
	});
});

describe("renderActualSummaryRows", () => {
	it("falls back to a placeholder row when empty", () => {
		expect(renderActualSummaryRows({})).toContain("| なし |");
	});
	it("sorts by input tokens descending", () => {
		const byKey: Record<string, ActualProviderSummary> = {
			small: { requests: 1, inputTotalTokens: 10, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, cacheMissTokens: 0, averageTokenHitRate: null, weightedTokenHitRate: null, averageCacheableReadRate: null, weightedCacheableReadRate: null },
			big: { requests: 2, inputTotalTokens: 1000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, cacheMissTokens: 0, averageTokenHitRate: null, weightedTokenHitRate: null, averageCacheableReadRate: null, weightedCacheableReadRate: null },
		};
		const out = renderActualSummaryRows(byKey);
		expect(out.indexOf("big")).toBeLessThan(out.indexOf("small"));
	});
});

describe("renderLowHitRows", () => {
	it("includes only rows below the 80% threshold", () => {
		const rows = [
			{ tokenHitRate: 0.9, timestamp: "t1" },
			{ tokenHitRate: 0.5, timestamp: "t2" },
		] as unknown as ParsedActualUsageLog[];
		const out = renderLowHitRows(rows);
		expect(out).toContain("t2");
		expect(out).not.toContain("t1");
	});
	it("falls back to a placeholder when nothing qualifies", () => {
		expect(renderLowHitRows([{ tokenHitRate: 0.95 } as unknown as ParsedActualUsageLog[]])).toContain("なし");
	});
});

describe("renderWarningCategoryRows / renderWarningBreakdownRows", () => {
	it("renders category rows including the total line", () => {
		const out = renderWarningCategoryRows({ baseSystem: 1, fragment: 2, other: 0, total: 3 }, { baseSystem: 2, fragment: 4, other: 1, total: 7 });
		expect(out).toContain("base system");
		expect(out).toContain("total");
		expect(out.split("\n").length).toBe(4);
	});
	it("renders a placeholder when there are no breakdown entries", () => {
		expect(renderWarningBreakdownRows([])).toContain("_なし_");
	});
});
