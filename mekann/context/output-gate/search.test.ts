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
		expect(out).toContain("2: beta");
		expect(out).toContain("3: gamma");
		expect(out).toContain("4: delta");
		expect(out.match(/###/g)).toHaveLength(1);
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

	// literal and caseSensitive tests
	it("fallbackLineScan with caseSensitive=true matches case exactly", async () => {
		const cwd = await tmp();
		await saveArtifact({ cwd, toolName: "bash", text: "TypeError\ntypeerror\nTYPEERROR", idGenerator: () => "og_cs1_1" });
		const out = await fallbackLineScan({ cwd, query: "TypeError", caseSensitive: true, contextLines: 0 });
		expect(out).toContain("og_cs1_1");
		expect(out).toContain("1: TypeError");
		expect(out).not.toContain("2: typeerror");
		expect(out).not.toContain("3: TYPEERROR");
	});

	it("fallbackLineScan with caseSensitive=false is case-insensitive", async () => {
		const cwd = await tmp();
		await saveArtifact({ cwd, toolName: "bash", text: "TypeError\ntypeerror", idGenerator: () => "og_cs2_1" });
		const out = await fallbackLineScan({ cwd, query: "TypeError", caseSensitive: false, contextLines: 0 });
		expect(out).toContain("1: TypeError");
		expect(out).toContain("2: typeerror");
	});

	it("searchToolOutputs with literal=true treats query as fixed string via rg", async () => {
		const cwd = await tmp();
		await saveArtifact({ cwd, toolName: "bash", text: "file.txt: error\nother", idGenerator: () => "og_lit1_1" });
		await saveArtifact({ cwd, toolName: "read", text: "extra", idGenerator: () => "og_lit1_2" });
		// With literal=true (default), the dot is not a regex wildcard
		const out = await searchToolOutputs({ cwd, query: "file.txt", preferRg: true, literal: true, contextLines: 0 });
		expect(out).toContain("og_lit1_1");
		expect(out).toContain("file.txt: error");
	});

	it("searchToolOutputs with literal=false allows regex via rg", async () => {
		const cwd = await tmp();
		await saveArtifact({ cwd, toolName: "bash", text: "abc123def\nnope", idGenerator: () => "og_lit2_1" });
		await saveArtifact({ cwd, toolName: "read", text: "extra", idGenerator: () => "og_lit2_2" });
		const out = await searchToolOutputs({ cwd, query: "abc.*def", preferRg: true, literal: false, contextLines: 0 });
		expect(out).toContain("og_lit2_1");
		expect(out).toContain("abc123def");
	});

	it("searchToolOutputs with caseSensitive=true via rg", async () => {
		const cwd = await tmp();
		await saveArtifact({ cwd, toolName: "bash", text: "TypeError\ntypeerror", idGenerator: () => "og_cs3_1" });
		await saveArtifact({ cwd, toolName: "read", text: "extra", idGenerator: () => "og_cs3_2" });
		const out = await searchToolOutputs({ cwd, query: "TypeError", preferRg: true, caseSensitive: true, contextLines: 0 });
		expect(out).toContain("1: TypeError");
		expect(out).not.toContain("2: typeerror");
	});

	// Single artifact and after-context tests
	it("searchToolOutputs with preferRg=true works with a single artifact", async () => {
		const cwd = await tmp();
		await saveArtifact({ cwd, toolName: "bash", text: "hello world", idGenerator: () => "og_single_1" });
		const out = await searchToolOutputs({ cwd, query: "hello", preferRg: true, contextLines: 0 });
		expect(out).toContain("og_single_1");
		expect(out).toContain("hello world");
	});

	it("rg search preserves after-context lines", async () => {
		const cwd = await tmp();
		await saveArtifact({ cwd, toolName: "bash", text: "alpha\nbeta\ngamma\ndelta\nepsilon", idGenerator: () => "og_after_1" });
		await saveArtifact({ cwd, toolName: "read", text: "extra", idGenerator: () => "og_after_2" });
		const out = await searchToolOutputs({ cwd, query: "gamma", preferRg: true, contextLines: 1 });
		expect(out).toContain("og_after_1");
		expect(out).toContain("2: beta"); // before context
		expect(out).toContain("3: gamma"); // match
		expect(out).toContain("4: delta"); // after context
	});

	it("rg search with artifact filter works on single artifact", async () => {
		const cwd = await tmp();
		await saveArtifact({ cwd, toolName: "bash", text: "hello earth", idGenerator: () => "og_filt_1" });
		await saveArtifact({ cwd, toolName: "read", text: "hello mars", idGenerator: () => "og_filt_2" });
		const out = await searchToolOutputs({ cwd, query: "hello", artifact: "og_filt_2", preferRg: true, contextLines: 0 });
		expect(out).toContain("og_filt_2");
		expect(out).toContain("hello mars");
		expect(out).not.toContain("og_filt_1");
	});

	it("capText keeps CJK results valid UTF-8 within the byte budget (no stray U+FFFD)", async () => {
		const cwd = await tmp();
		// 3 bytes/char hiragana; force a cut mid-character at the byte boundary.
		await saveArtifact({ cwd, toolName: "bash", text: "あいうえお".repeat(200), idGenerator: () => "og_cjkcap_1" });
		const maxBytes = 80;
		const out = await searchToolOutputs({ cwd, query: "あ", preferRg: false, maxSearchResultBytes: maxBytes });
		expect(out).toContain("truncated");
		expect(out).not.toContain("\uFFFD");
		// The content portion (excluding the appended truncation marker) must fit.
		const marker = "\n[output-gate search results truncated]";
		const content = out.endsWith(marker) ? out.slice(0, out.length - marker.length) : out;
		expect(Buffer.byteLength(content, "utf8")).toBeLessThanOrEqual(maxBytes);
	});
});
