import { describe, expect, it } from "vitest";
import { buildStructuredPreview, classifyBashOutputPolicy, detectOutputContentType } from "./preview.js";

describe("output-gate structured preview", () => {
	it("detects and summarizes JSON arrays", () => {
		const result = buildStructuredPreview(JSON.stringify([{ file: "a.ts", count: 1 }, { file: "b.ts", count: 2 }]), { toolName: "bash", maxBytes: 1000 });
		expect(result.contentType).toBe("json");
		expect(result.preview).toContain("JSON array");
		expect(result.preview).toContain("items: 2");
		expect(result.retrievalHints).toContain("file");
	});

	it("detects diffs", () => {
		const text = "diff --git a/a.ts b/a.ts\n@@ -1 +1 @@\n-old\n+new\n";
		expect(detectOutputContentType(text, "bash")).toBe("diff");
		const result = buildStructuredPreview(text, { toolName: "bash", maxBytes: 1000 });
		expect(result.preview).toContain("diff summary");
		expect(result.preview).toContain("a.ts");
	});

	it("detects ripgrep-like search results", () => {
		const text = "src/a.ts:10:hello\nsrc/a.ts:20:world\nsrc/b.ts:1:hello\n";
		const result = buildStructuredPreview(text, { toolName: "bash", maxBytes: 1000 });
		expect(result.contentType).toBe("search-results");
		expect(result.preview).toContain("search result summary");
		expect(result.preview).toContain("src/a.ts: 2");
	});

	it("keeps failing lines prominent for test output", () => {
		const text = Array.from({ length: 30 }, (_, i) => i === 20 ? "FAIL test/example.test.ts AssertionError: expected true" : `line ${i}`).join("\n");
		const result = buildStructuredPreview(text, { toolName: "bash", maxBytes: 1000 });
		expect(result.contentType).toBe("test-output");
		expect(result.preview).toContain("AssertionError");
		expect(result.retrievalHints.some((h) => h.includes("AssertionError"))).toBe(true);
	});

	it("classifies common bash commands for command-aware previews", () => {
		expect(classifyBashOutputPolicy("ls -la")).toBe("listing");
		expect(classifyBashOutputPolicy("rg TODO src")).toBe("search");
		expect(classifyBashOutputPolicy("git status --short")).toBe("git-status");
		expect(classifyBashOutputPolicy("git diff -- src/index.ts")).toBe("git-diff");
		expect(classifyBashOutputPolicy("npm test")).toBe("test");
		expect(classifyBashOutputPolicy("ruff check .")).toBe("lint");
	});

	it("builds compact command-aware preview for listing commands", () => {
		const text = Array.from({ length: 200 }, (_, i) => `file-${i}.ts`).join("\n");
		const result = buildStructuredPreview(text, { toolName: "bash", command: "ls -la", maxBytes: 5000 });
		expect(result.preview).toContain("bash output policy: listing");
		expect(result.preview).toContain("command: ls -la");
		expect(result.preview).toContain("[...120 lines omitted...]");
		expect(result.preview).toContain("file-199.ts");
	});

	it("uses command-aware search summary for rg commands", () => {
		const text = "src/a.ts:10:hello\nsrc/a.ts:20:world\nsrc/b.ts:1:hello\n";
		const result = buildStructuredPreview(text, { toolName: "bash", command: "rg hello src", maxBytes: 5000 });
		expect(result.preview).toContain("bash output policy: search");
		expect(result.preview).toContain("search result summary");
		expect(result.preview).toContain("src/a.ts: 2");
	});
});
