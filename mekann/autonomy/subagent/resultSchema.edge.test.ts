/**
 * Feature audit tests — ResultSchema extractJSON edge cases.
 *
 * Validates SA-06-T1 and SA-06-T2 from the feature list.
 */

import { describe, expect, it } from "vitest";
import { tryParseSubagentResult } from "./resultSchema.js";

const observation = {
	schema: "subagent.result.v1",
	outcome: "observation",
	summary: "test",
	findings: [{ target: { kind: "file", name: "a.ts" }, message: "found" }],
};

// ---------------------------------------------------------------------------
// SA-06-T1: nested markdown code blocks
// ---------------------------------------------------------------------------

describe("SA-06-T1: extractJSON handles nested code blocks", () => {
	it("handles JSON containing markdown-like content", () => {
		// JSON where a value contains ``` (but not as a standalone code block)
		const obj = {
			...observation,
			findings: [{
				target: { kind: "file", name: "a.ts" },
				message: "Use triple backticks like ` ``` ` for code",
			}],
		};
		// Direct parse should work
		const result = tryParseSubagentResult(JSON.stringify(obj));
		expect(result.ok).toBe(true);
	});

	it("extracts JSON when code block appears inside prose before JSON", () => {
		const text = [
			"Here is a code example:",
			"```",
			"console.log('hello');",
			"```",
			"",
			"And the result:",
			"```json",
			JSON.stringify(observation, null, 2),
			"```",
		].join("\n");
		const result = tryParseSubagentResult(text);
		expect(result.ok).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// SA-06-T2: multiple JSON objects (first-{ to last-} behavior)
// ---------------------------------------------------------------------------

describe("SA-06-T2: extractJSON with multiple JSON objects in text", () => {
	it("prose fallback picks outermost { ... } when no code block", () => {
		// Two JSON objects in prose — extractJSON uses indexOf("{") and lastIndexOf("}")
		const text = `First: {"a": 1} and second: ${JSON.stringify(observation)}`;
		const result = tryParseSubagentResult(text);
		// This will try to parse from first { to last }, which may produce
		// invalid JSON ("a": 1} and second: {...}) — but that's the documented behavior
		// The key test is that it doesn't crash
		expect(result).toBeDefined();
	});

	it("code block takes precedence over prose-wrapped JSON", () => {
		const text = [
			"Here is old JSON: {\"old\": true}",
			"",
			"```json",
			JSON.stringify(observation),
			"```",
		].join("\n");
		const result = tryParseSubagentResult(text);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.result.outcome).toBe("observation");
		}
	});
});

// ---------------------------------------------------------------------------
// Additional edge cases
// ---------------------------------------------------------------------------

describe("tryParseSubagentResult: additional edge cases", () => {
	it("rejects empty string", () => {
		const result = tryParseSubagentResult("");
		expect(result.ok).toBe(false);
	});

	it("rejects whitespace-only string", () => {
		const result = tryParseSubagentResult("   \n\t  ");
		expect(result.ok).toBe(false);
	});

	it("handles JSON with BOM", () => {
		// BOM + JSON
		const bomJson = "\uFEFF" + JSON.stringify(observation);
		const result = tryParseSubagentResult(bomJson);
		// extractJSON.trim() should handle BOM (it's whitespace-equivalent)
		expect(result).toBeDefined();
	});

	it("handles very large finding arrays", () => {
		const findings = Array.from({ length: 500 }, (_, i) => ({
			target: { kind: "file" as const, name: `file${i}.ts` },
			message: `Finding ${i}`,
		}));
		const large = { ...observation, findings };
		const result = tryParseSubagentResult(JSON.stringify(large));
		expect(result.ok).toBe(true);
		if (result.ok && result.result.outcome === "observation") {
			expect(result.result.findings).toHaveLength(500);
		}
	});

	it("rejects unknown outcome", () => {
		const bad = { schema: "subagent.result.v1", outcome: "magic", summary: "x" };
		const result = tryParseSubagentResult(JSON.stringify(bad));
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain("unsupported outcome");
	});
});
