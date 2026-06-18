/**
 * report/svg.test.ts — SVG レンダラと sampling helper の focused test。
 * {@link "./svg.js"} を直接 import して単体検証する。
 */
import { describe, expect, it } from "vitest";
import type { ParsedActualUsageLog, ParsedLog } from "../reportTypes.js";
import {
	actualGraphSlug,
	MAX_POINTS,
	renderActualHitRateSvg,
	renderCacheabilitySvg,
	renderFragmentsSvg,
	renderSvg,
	sampleLabel,
	sampleRows,
} from "./svg.js";

describe("constants", () => {
	it("MAX_POINTS is a sane default cap", () => {
		expect(MAX_POINTS).toBeGreaterThan(0);
		expect(typeof MAX_POINTS).toBe("number");
	});
});

describe("actualGraphSlug", () => {
	it("slugifies keys for filenames", () => {
		expect(actualGraphSlug("OpenAI/GPT-4o")).toBe("openai-gpt-4o");
		expect(actualGraphSlug("   ")).toBe("unknown");
	});
});

describe("sampleRows / sampleLabel", () => {
	it("keeps all rows when under the cap", () => {
		const rows = [1, 2, 3];
		expect(sampleRows(rows, 10)).toEqual([1, 2, 3]);
		expect(sampleRows(rows, "all")).toEqual([1, 2, 3]);
	});
	it("keeps the tail when over the cap", () => {
		expect(sampleRows([1, 2, 3, 4, 5], 2)).toEqual([4, 5]);
	});
	it("labels the sampled window", () => {
		expect(sampleLabel([1, 2, 3], 3)).toContain("3");
		expect(sampleLabel([1, 2], "all")).toContain("全");
	});
});

describe("renderSvg", () => {
	it("emits an SVG skeleton with axis and legend", () => {
		const rows = [
			{ stablePrefixChars: 10, providerPrefixChars: 20, totalPromptChars: 30, providerPrefixHash: "h", line: 1 },
		] as unknown as ParsedLog[];
		const svg = renderSvg(rows, "all");
		expect(svg.startsWith("<?xml")).toBe(true);
		expect(svg).toContain("<svg");
		expect(svg).toContain("totalPromptChars");
	});
});

describe("renderCacheabilitySvg", () => {
	it("renders a percentage-axis cacheability chart", () => {
		const rows = [{ providerPrefixHash: "h", line: 1 }, { providerPrefixHash: "h", line: 2 }] as unknown as ParsedLog[];
		const svg = renderCacheabilitySvg(rows, "all");
		expect(svg).toContain("100%");
		expect(svg).toContain("adjacent prefix proxy");
	});
});

describe("renderActualHitRateSvg", () => {
	it("renders null markers for rows with null hit rate", () => {
		const rows = [{ tokenHitRate: null }, { tokenHitRate: 0.9, cacheableReadRate: 0.8 }] as unknown as ParsedActualUsageLog[];
		const svg = renderActualHitRateSvg(rows, "all", "test title");
		expect(svg).toContain("test title");
		expect(svg).toContain("tokenHitRate");
	});
});

describe("renderFragmentsSvg", () => {
	it("emits the empty-state note when there is no fragment size data", () => {
		const svg = renderFragmentsSvg([{ fragmentHashes: [], line: 1 }] as unknown as ParsedLog[]);
		expect(svg).toContain("fragment chars");
	});
});
