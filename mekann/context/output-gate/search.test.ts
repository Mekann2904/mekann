import { describe, expect, it } from "vitest";
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
});
