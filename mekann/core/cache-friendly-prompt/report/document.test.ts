/**
 * report/document.test.ts — レポート文書の組み立てと成果物生成の focused test。
 * {@link "./document.js"} を直接 import して単体検証する。
 */
import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	buildCacheFriendlyReportArtifactsForTest,
	generateCacheFriendlyReport,
	renderReport,
	type ReportArtifact,
} from "./document.js";
import { summarize } from "./aggregate.js";

function findArtifact(artifacts: ReportArtifact[], fileName: string): ReportArtifact | undefined {
	return artifacts.find((a) => a.fileName === fileName);
}

describe("buildCacheFriendlyReportArtifactsForTest", () => {
	it("produces the core artifact set even for empty logs", () => {
		const artifacts = buildCacheFriendlyReportArtifactsForTest("", "", "2026-06-19T00:00:00.000Z", "");
		const names = artifacts.map((a) => a.fileName);
		for (const expected of ["summary.json", "trend.svg", "trend-all.svg", "cacheability-score.svg", "cacheability-score-all.svg", "actual-hit-rate.svg", "fragments.svg", "report.md"]) {
			expect(names).toContain(expected);
		}
	});

	it("report.md is a markdown document with the expected section headers", () => {
		const artifacts = buildCacheFriendlyReportArtifactsForTest("", "", "2026-06-19T00:00:00.000Z", "");
		const md = findArtifact(artifacts, "report.md")!.content;
		expect(md.startsWith("# cache-friendly-prompt レポート")).toBe(true);
		expect(md).toContain("## 1. Overview");
		expect(md).toContain("## 2. Actual provider cache hit rate");
		expect(md).toContain("## 13. Glossary");
	});

	it("parses one proxy + one actual row and reflects them in summary.json", () => {
		const proxyLine = JSON.stringify({ provider: "p", model: "m", providerPrefixHash: "h", stablePrefixHash: "s", timestamp: "2026-06-19T00:00:00.000Z" });
		const actualLine = JSON.stringify({ timestamp: "2026-06-19T00:00:00.000Z", provider: "p", model: "m", inputTotalTokens: 100, outputTokens: 5, cacheReadTokens: 60, cacheWriteTokens: 40, cacheMissTokens: 0, tokenHitRate: 0.6, cacheableReadRate: 0.6, usageSource: "pi_normalized_usage" });
		const artifacts = buildCacheFriendlyReportArtifactsForTest(proxyLine + "\n", actualLine + "\n", "2026-06-19T00:00:00.000Z", "");
		const summary = JSON.parse(findArtifact(artifacts, "summary.json")!.content);
		expect(summary.totalRequests).toBe(1);
		expect(summary.actualRequestCount).toBe(1);
		expect(summary.providers["p/m"]).toBeDefined();
	});
});

describe("renderReport", () => {
	it("renders a full document from a summary built by aggregate.summarize", () => {
		const summary = summarize([], [], "2026-06-19T00:00:00.000Z", []);
		const md = renderReport(summary, [], []);
		expect(md).toContain("# cache-friendly-prompt レポート");
		expect(md).toContain("最終更新: 2026-06-19T00:00:00.000Z");
	});
});

describe("generateCacheFriendlyReport", () => {
	it("writes the artifact files to disk and resolves", async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "report-doc-"));
		// minimal requests.jsonl so the report is generated
		fs.writeFileSync(path.join(dir, "requests.jsonl"), "", "utf8");
		await expect(generateCacheFriendlyReport(dir)).resolves.toBeUndefined();
		// core files are written
		expect(fs.existsSync(path.join(dir, "report.md"))).toBe(true);
		expect(fs.existsSync(path.join(dir, "summary.json"))).toBe(true);
	});

	it("never throws even when the directory is missing/unwritable", async () => {
		await expect(generateCacheFriendlyReport("/nonexistent-path-that-does-not-exist-xyz")).resolves.toBeUndefined();
	});
});
