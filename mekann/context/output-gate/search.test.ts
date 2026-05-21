import { describe, expect, it, vi } from "vitest";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { saveArtifact } from "./store.js";
import { fallbackLineScan, searchToolOutputs } from "./search.js";

async function tmp(): Promise<string> { return fsp.mkdtemp(path.join(os.tmpdir(), "og-search-")); }

describe("search output-gate artifacts", () => {
	it("fallback line scan finds case-insensitive matches", async () => {
		const cwd = await tmp();
		await saveArtifact({ cwd, toolName: "bash", text: "one\nTypeError here\nthree", idGenerator: () => "og_case_1" });
		const out = await fallbackLineScan({ cwd, query: "typeerror", contextLines: 0 });
		expect(out).toContain("og_case_1");
		expect(out).toContain("2: TypeError here");
	});

	it("contextLines works", async () => {
		const cwd = await tmp();
		await saveArtifact({ cwd, toolName: "bash", text: "a\nb\nneedle\nd", idGenerator: () => "og_ctx_1" });
		const out = await fallbackLineScan({ cwd, query: "needle", contextLines: 1 });
		expect(out).toContain("2: b");
		expect(out).toContain("4: d");
	});

	it("maxResults works", async () => {
		const cwd = await tmp();
		await saveArtifact({ cwd, toolName: "bash", text: "needle\nx\nneedle", idGenerator: () => "og_max_1" });
		const out = await fallbackLineScan({ cwd, query: "needle", maxResults: 1, contextLines: 0 });
		expect(out.match(/###/g)).toHaveLength(1);
	});

	it("maxSearchResultBytes cap works", async () => {
		const cwd = await tmp();
		await saveArtifact({ cwd, toolName: "bash", text: `needle ${"x".repeat(1000)}`, idGenerator: () => "og_cap_1" });
		const out = await searchToolOutputs({ cwd, query: "needle", maxSearchResultBytes: 80, preferRg: false });
		expect(Buffer.byteLength(out, "utf8")).toBeLessThanOrEqual(130);
		expect(out).toContain("truncated");
	});

	it("artifact filter works", async () => {
		const cwd = await tmp();
		await saveArtifact({ cwd, toolName: "bash", text: "needle", idGenerator: () => "og_one_1" });
		await saveArtifact({ cwd, toolName: "bash", text: "needle", idGenerator: () => "og_two_1" });
		const out = await fallbackLineScan({ cwd, query: "needle", artifact: "og_two_1" });
		expect(out).toContain("og_two_1");
		expect(out).not.toContain("og_one_1");
	});

	it("no matches returns No matches", async () => {
		const cwd = await tmp();
		await saveArtifact({ cwd, toolName: "bash", text: "abc", idGenerator: () => "og_none_1" });
		expect(await fallbackLineScan({ cwd, query: "zzz" })).toBe("No matches.");
	});

	it("searchToolOutputs returns Query is required for empty query", async () => {
		const cwd = await tmp();
		await saveArtifact({ cwd, toolName: "bash", text: "hello", idGenerator: () => "og_emptyq_1" });
		expect(await searchToolOutputs({ cwd, query: "   " })).toBe("Query is required.");
	});

	it("searchToolOutputs falls back to line scan when rg returns empty", async () => {
		const cwd = await tmp();
		await saveArtifact({ cwd, toolName: "bash", text: "hello world", idGenerator: () => "og_rgfb_1" });
		// rg is available but returns empty (exit 1) for no match; test with preferRg=false
		const out = await searchToolOutputs({ cwd, query: "hello", preferRg: false });
		expect(out).toContain("og_rgfb_1");
		expect(out).toContain("hello");
	});

	it("searchToolOutputs with preferRg false uses line scan directly", async () => {
		const cwd = await tmp();
		await saveArtifact({ cwd, toolName: "bash", text: "findme", idGenerator: () => "og_nrg_1" });
		const out = await searchToolOutputs({ cwd, query: "findme", preferRg: false });
		expect(out).toContain("og_nrg_1");
	});

	it("searchToolOutputs with artifact filter returns only matched artifact", async () => {
		const cwd = await tmp();
		await saveArtifact({ cwd, toolName: "bash", text: "hello world", idGenerator: () => "og_art_a1" });
		await saveArtifact({ cwd, toolName: "bash", text: "hello earth", idGenerator: () => "og_art_b1" });
		const out = await searchToolOutputs({ cwd, query: "hello", artifact: "og_art_a1", preferRg: false });
		expect(out).toContain("og_art_a1");
		expect(out).not.toContain("og_art_b1");
	});

	it("fallbackLineScan returns No stored tool outputs when no manifest", async () => {
		const cwd = await tmp();
		const out = await fallbackLineScan({ cwd, query: "x" });
		expect(out).toBe("No stored tool outputs.");
	});

	it("fallbackLineScan returns No matches when artifact filter yields no files", async () => {
		const cwd = await tmp();
		await saveArtifact({ cwd, toolName: "bash", text: "hello", idGenerator: () => "og_fbf_1" });
		const out = await fallbackLineScan({ cwd, query: "hello", artifact: "og_nonexistent" });
		expect(out).toBe("No matches.");
	});

	it("searchToolOutputs returns No matches when no results found", async () => {
		const cwd = await tmp();
		await saveArtifact({ cwd, toolName: "bash", text: "hello", idGenerator: () => "og_nm_1" });
		const out = await searchToolOutputs({ cwd, query: "nonexistent", preferRg: false });
		expect(out).toBe("No matches.");
	});

	it("searchToolOutputs with maxSearchResultBytes caps large results", async () => {
		const cwd = await tmp();
		const bigText = "needle " + "x".repeat(5000);
		await saveArtifact({ cwd, toolName: "bash", text: bigText, idGenerator: () => "og_cap2_1" });
		const out = await searchToolOutputs({ cwd, query: "needle", preferRg: false, maxSearchResultBytes: 100 });
		expect(out).toContain("truncated");
	});

	it("fallbackLineScan respects maxResults and stops early", async () => {
		const cwd = await tmp();
		await saveArtifact({ cwd, toolName: "bash", text: "needle\nneedle\nneedle\nneedle\nneedle", idGenerator: () => "og_maxr_1" });
		const out = await fallbackLineScan({ cwd, query: "needle", maxResults: 1, contextLines: 0 });
		const headers = out.match(/###/g);
		expect(headers).toHaveLength(1);
	});

	it("searchToolOutput passes non-default contextLines and maxResults", async () => {
		const cwd = await tmp();
		await saveArtifact({ cwd, toolName: "bash", text: "a\nb\nneedle\nc\nd", idGenerator: () => "og_ctxp_1" });
		const out = await fallbackLineScan({ cwd, query: "needle", contextLines: 2, maxResults: 5 });
		expect(out).toContain("needle");
	});

	it("searchToolOutputs with preferRg=true uses rg to find matches", async () => {
		const cwd = await tmp();
		await saveArtifact({ cwd, toolName: "bash", text: "hello world\ngoodbye world", idGenerator: () => "og_rgt1_1" });
		// Need 2+ artifacts so rg includes file paths in output
		await saveArtifact({ cwd, toolName: "read", text: "other file content", idGenerator: () => "og_rgt1_2" });
		const out = await searchToolOutputs({ cwd, query: "hello", preferRg: true });
		expect(out).toContain("og_rgt1_1");
		expect(out).toContain("hello");
	});

	it("searchToolOutputs with preferRg=true and context lines", async () => {
		const cwd = await tmp();
		await saveArtifact({ cwd, toolName: "bash", text: "alpha\nbeta\ngamma\ndelta", idGenerator: () => "og_rgt2_1" });
		await saveArtifact({ cwd, toolName: "read", text: "extra content", idGenerator: () => "og_rgt2_2" });
		const out = await searchToolOutputs({ cwd, query: "gamma", preferRg: true, contextLines: 1 });
		expect(out).toContain("og_rgt2_1");
		expect(out).toContain("gamma");
	});

	it("searchToolOutputs with preferRg=true respects maxResults", async () => {
		const cwd = await tmp();
		await saveArtifact({ cwd, toolName: "bash", text: "match\nother\nmatch\nother\nmatch", idGenerator: () => "og_rgt3_1" });
		await saveArtifact({ cwd, toolName: "read", text: "extra", idGenerator: () => "og_rgt3_2" });
		const out = await searchToolOutputs({ cwd, query: "match", preferRg: true, maxResults: 1 });
		const headers = out.match(/###/g);
		expect(headers).toHaveLength(1);
	});

	it("searchToolOutputs with preferRg=true returns No matches when not found", async () => {
		const cwd = await tmp();
		await saveArtifact({ cwd, toolName: "bash", text: "alpha beta gamma", idGenerator: () => "og_rgt4_1" });
		const out = await searchToolOutputs({ cwd, query: "nonexistent", preferRg: true });
		expect(out).toBe("No matches.");
	});

	it("searchToolOutputs with preferRg=true caps large results", async () => {
		const cwd = await tmp();
		await saveArtifact({ cwd, toolName: "bash", text: "match " + "x".repeat(5000), idGenerator: () => "og_rgt5_1" });
		await saveArtifact({ cwd, toolName: "read", text: "extra content", idGenerator: () => "og_rgt5_2" });
		const out = await searchToolOutputs({ cwd, query: "match", preferRg: true, maxSearchResultBytes: 100 });
		expect(out).toContain("truncated");
	});
});
