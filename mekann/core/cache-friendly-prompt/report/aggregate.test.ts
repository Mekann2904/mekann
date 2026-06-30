/**
 * report/aggregate.test.ts — 集計・統計ヘルパの focused test。
 * {@link "./aggregate.js"} を直接 import して単体検証する。
 * 行オブジェクトは必要なフィールドだけ持つ fixture をキャストして使う。
 */
import { describe, expect, it } from "vitest";
import type { ParsedActualUsageLog, ParsedLog } from "../reportTypes.js";
import {
	countUniqueScopedReuseKeys,
	mean,
	percentile,
	percentiles,
	rate,
	scopedReuseKey,
	summarize,
	summarizeActualGroup,
} from "./aggregate.js";

describe("rate", () => {
	it("returns num/den when den > 0", () => {
		expect(rate(1, 4)).toBeCloseTo(0.25);
	});
	it("returns null when den is 0", () => {
		expect(rate(5, 0)).toBeNull();
	});
});

describe("mean", () => {
	it("averages finite numbers and ignores null/undefined", () => {
		expect(mean([1, 2, null, undefined, 3])).toBeCloseTo(2);
	});
	it("returns null for an empty/all-null input", () => {
		expect(mean([])).toBeNull();
		expect(mean([null, undefined])).toBeNull();
	});
});

describe("percentile / percentiles", () => {
	it("percentile picks the ceiling-index element", () => {
		expect(percentile([10, 20, 30, 40], 50)).toBe(20);
	});
	it("percentile returns null for empty input", () => {
		expect(percentile([], 90)).toBeNull();
	});
	it("percentiles exposes p50/p90/p99", () => {
		const p = percentiles([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
		expect(p.p50).toBe(5);
		expect(p.p99).toBe(10);
	});
});

describe("scopedReuseKey / countUniqueScopedReuseKeys", () => {
	it("uses provider/model + first available reuse hash", () => {
		const row = { provider: "p", model: "m", providerPrefixHash: "hashA", line: 1 } as unknown as ParsedLog;
		expect(scopedReuseKey(row)).toBe("p:m:hashA");
		const row2 = { provider: "p", model: "m", featureCacheablePrefixHash: "hashB", line: 2 } as unknown as ParsedLog;
		expect(scopedReuseKey(row2)).toBe("p:m:hashB");
	});
	it("counts distinct scoped keys, uncacheable rows keyed by line", () => {
		const rows = [
			{ provider: "p", model: "m", providerPrefixHash: "h", line: 1 },
			{ provider: "p", model: "m", providerPrefixHash: "h", line: 2 },
			{ provider: "p", model: "m", line: 3 },
		] as unknown as ParsedLog[];
		// two distinct keys: p:m:h and uncacheable:3 (the two h rows collapse)
		expect(countUniqueScopedReuseKeys(rows)).toBe(2);
	});
});

describe("summarizeActualGroup", () => {
	it("aggregates token totals and weighted hit rate", () => {
		const rows = [
			{ inputTotalTokens: 100, outputTokens: 10, cacheReadTokens: 80, cacheWriteTokens: 20, cacheMissTokens: 0, tokenHitRate: 0.8, cacheableReadRate: 0.8 },
			{ inputTotalTokens: 200, outputTokens: 20, cacheReadTokens: 100, cacheWriteTokens: 100, cacheMissTokens: 0, tokenHitRate: 0.5, cacheableReadRate: 0.5 },
		] as unknown as ParsedActualUsageLog[];
		const g = summarizeActualGroup(rows);
		expect(g.requests).toBe(2);
		expect(g.inputTotalTokens).toBe(300);
		expect(g.cacheReadTokens).toBe(180);
		expect(g.weightedTokenHitRate).toBeCloseTo(180 / 300);
		expect(g.averageTokenHitRate).toBeCloseTo(0.65);
	});
});

describe("summarize (end-to-end on empty input)", () => {
	it("returns a well-formed summary with zero totals and null proxy rates", () => {
		const s = summarize([], [], "2026-06-19T00:00:00.000Z", []);
		expect(s.totalRequests).toBe(0);
		expect(s.generatedAt).toBe("2026-06-19T00:00:00.000Z");
		expect(s.adjacentPrefixReuseRate).toBeNull();
		expect(s.uniqueScopedReuseKeyCount).toBe(0);
		expect(s.actualRequestCount).toBe(0);
		expect(s.providers).toEqual({});
		expect(s.warningCount).toBe(0);
	});
});
