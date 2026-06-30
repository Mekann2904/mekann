import { describe, expect, it } from "vitest";
import { buildStructuredPreview, detectOutputContentType } from "./preview.js";

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
});

describe("lineFocusedPreview — symmetric context window (issue #166 / IC-196)", () => {
	// The output-gate defaultContextLines default is 3, so the focused window is
	// symmetric hit-3..hit+3 (previously an undocumented asymmetric hit-2..hit+3).
	it("keeps a symmetric window around the matched line", () => {
		const lines = Array.from({ length: 30 }, (_, i) => i === 15 ? "ERROR boom" : `line ${i}`);
		const text = lines.join("\n");
		const result = buildStructuredPreview(text, { toolName: "bash", maxBytes: 8000 });
		expect(result.contentType).toBe("log");
		// hit is at 0-based index 15 → kept lines are 12..18 → displayed as 13..19.
		expect(result.preview).toContain("13: line 12");
		expect(result.preview).toContain("19: line 18");
		expect(result.preview).not.toContain("12: line 11");
		expect(result.preview).not.toContain("20: line 19");
	});
});
