/**
 * Tests for Output Formatting Utilities
 */

import { describe, it, expect } from "vitest";
import {
	truncateResults,
	truncateHead,
	parseFdOutput,
	formatFileCandidates,
	parseRgOutput,
	summarizeResults,
	formatCodeSearch,
	parseCtagsOutput,
	parseCtagsTraditional,
	formatSymbols,
	createErrorResponse,
	createCodeSearchError,
	formatError,
	escapeText,
	truncateText,
	relativePath,
	enhanceOutput,
	calculateSimpleConfidence,
	createSimpleHints,
	suggestNextAction,
	formatEnhancedOutput,
	type SearchHints,
	type EnhancedOutput,
} from "../../../.pi/extensions/search/utils/output.js";
import type {
	SearchResponse,
	FileCandidate,
	CodeSearchMatch,
	SymbolDefinition,
} from "../../../.pi/extensions/search/types.js";
import type { SearchMetrics } from "../../../.pi/extensions/search/utils/metrics.js";

// Helper to create mock metrics
function createMockMetrics(overrides: Partial<SearchMetrics> = {}): SearchMetrics {
	return {
		filesSearched: 10,
		durationMs: 100,
		indexHitRate: 0.5,
		...overrides,
	};
}

describe("truncateResults", () => {
	it("should not truncate when results fit within limit", () => {
		const results = [1, 2, 3, 4, 5];
		const response = truncateResults(results, 10);

		expect(response.total).toBe(5);
		expect(response.truncated).toBe(false);
		expect(response.results).toEqual(results);
	});

	it("should truncate when results exceed limit", () => {
		const results = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
		const response = truncateResults(results, 5);

		expect(response.total).toBe(10);
		expect(response.truncated).toBe(true);
		expect(response.results).toEqual([1, 2, 3, 4, 5]);
	});

	it("should handle empty results", () => {
		const response = truncateResults([], 10);

		expect(response.total).toBe(0);
		expect(response.truncated).toBe(false);
		expect(response.results).toEqual([]);
	});

	it("should handle limit of 0", () => {
		const results = [1, 2, 3];
		const response = truncateResults(results, 0);

		expect(response.total).toBe(3);
		expect(response.truncated).toBe(true);
		expect(response.results).toEqual([]);
	});

	it("should preserve object references", () => {
		const obj = { id: 1 };
		const results = [obj];
		const response = truncateResults(results, 10);

		expect(response.results[0]).toBe(obj);
	});
});

describe("truncateHead", () => {
	it("should keep last N items when results exceed limit", () => {
		const results = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
		const response = truncateHead(results, 3);

		expect(response.total).toBe(10);
		expect(response.truncated).toBe(true);
		expect(response.results).toEqual([8, 9, 10]);
	});

	it("should not truncate when results fit within limit", () => {
		const results = [1, 2, 3];
		const response = truncateHead(results, 5);

		expect(response.truncated).toBe(false);
		expect(response.results).toEqual([1, 2, 3]);
	});

	it("should handle empty results", () => {
		const response = truncateHead([], 10);

		expect(response.total).toBe(0);
		expect(response.results).toEqual([]);
	});
});

describe("parseFdOutput", () => {
	it("should parse fd output into FileCandidate array", () => {
		const stdout = "src/file1.ts\nsrc/file2.ts\nsrc/file3.ts";
		const candidates = parseFdOutput(stdout);

		expect(candidates).toHaveLength(3);
		expect(candidates[0]).toEqual({ path: "src/file1.ts", type: "file" });
		expect(candidates[1]).toEqual({ path: "src/file2.ts", type: "file" });
	});

	it("should parse directory type", () => {
		const stdout = "src\ntest";
		const candidates = parseFdOutput(stdout, "dir");

		expect(candidates[0].type).toBe("dir");
		expect(candidates[1].type).toBe("dir");
	});

	it("should handle empty output", () => {
		const candidates = parseFdOutput("");

		expect(candidates).toEqual([]);
	});

	it("should handle whitespace-only output", () => {
		const candidates = parseFdOutput("   \n  \n  ");

		expect(candidates).toEqual([]);
	});

	it("should handle paths with whitespace", () => {
		// Note: parseFdOutput uses stdout.trim() which trims the whole string
		// but not individual lines
		const stdout = "file1.ts  \nfile2.ts\n";
		const candidates = parseFdOutput(stdout);

		// stdout.trim() removes leading/trailing whitespace from whole string
		// Individual lines keep their trailing whitespace
		expect(candidates[0].path).toBe("file1.ts  ");
		expect(candidates[1].path).toBe("file2.ts");
	});
});

describe("formatFileCandidates", () => {
	it("should format file candidates for display", () => {
		const output: SearchResponse<FileCandidate> = {
			total: 3,
			truncated: false,
			results: [
				{ path: "src/file.ts", type: "file" },
				{ path: "src/dir", type: "dir" },
			],
		};

		const formatted = formatFileCandidates(output);

		expect(formatted).toContain("Found 3 entries");
		expect(formatted).toContain("[F] src/file.ts");
		expect(formatted).toContain("[D] src/dir");
	});

	it("should show truncated indicator", () => {
		const output: SearchResponse<FileCandidate> = {
			total: 100,
			truncated: true,
			results: [{ path: "file.ts", type: "file" }],
		};

		const formatted = formatFileCandidates(output);

		expect(formatted).toContain("(truncated)");
	});

	it("should format error response", () => {
		const output: SearchResponse<FileCandidate> = {
			total: 0,
			truncated: false,
			results: [],
			error: "Command failed",
		};

		const formatted = formatFileCandidates(output);

		expect(formatted).toContain("Error: Command failed");
	});
});

describe("parseRgOutput", () => {
	it("should parse ripgrep JSON output", () => {
		const stdout = JSON.stringify({
			type: "match",
			data: {
				path: { text: "file.ts" },
				line_number: 10,
				lines: { text: "const x = 1;" },
				submatches: [{ start: 6, end: 7 }],
			},
		});

		const { matches, summary } = parseRgOutput(stdout);

		expect(matches).toHaveLength(1);
		expect(matches[0].file).toBe("file.ts");
		expect(matches[0].line).toBe(10);
		expect(matches[0].text).toBe("const x = 1;");
		expect(matches[0].column).toBe(7); // start + 1 for 1-indexed
	});

	it("should track file summary counts", () => {
		const match1 = JSON.stringify({
			type: "match",
			data: {
				path: { text: "file1.ts" },
				line_number: 1,
				lines: { text: "code" },
				submatches: [],
			},
		});
		const match2 = JSON.stringify({
			type: "match",
			data: {
				path: { text: "file1.ts" },
				line_number: 2,
				lines: { text: "code" },
				submatches: [],
			},
		});
		const match3 = JSON.stringify({
			type: "match",
			data: {
				path: { text: "file2.ts" },
				line_number: 1,
				lines: { text: "code" },
				submatches: [],
			},
		});

		const { summary } = parseRgOutput(`${match1}\n${match2}\n${match3}`);

		expect(summary.get("file1.ts")).toBe(2);
		expect(summary.get("file2.ts")).toBe(1);
	});

	it("should handle empty output", () => {
		const { matches, summary } = parseRgOutput("");

		expect(matches).toEqual([]);
		expect(summary.size).toBe(0);
	});

	it("should skip malformed JSON lines", () => {
		const stdout = `invalid json
${JSON.stringify({
	type: "match",
	data: {
		path: { text: "file.ts" },
		line_number: 1,
		lines: { text: "code" },
		submatches: [],
	},
})}`;

		const { matches } = parseRgOutput(stdout);

		expect(matches).toHaveLength(1);
	});
});

describe("summarizeResults", () => {
	it("should convert map to sorted array", () => {
		const summaryMap = new Map([
			["file1.ts", 5],
			["file2.ts", 10],
			["file3.ts", 3],
		]);

		const summary = summarizeResults(summaryMap);

		expect(summary).toEqual([
			{ file: "file2.ts", count: 10 },
			{ file: "file1.ts", count: 5 },
			{ file: "file3.ts", count: 3 },
		]);
	});

	it("should handle empty map", () => {
		const summary = summarizeResults(new Map());

		expect(summary).toEqual([]);
	});
});

describe("parseCtagsOutput", () => {
	it("should parse ctags JSON output", () => {
		const stdout = JSON.stringify({
			name: "myFunction",
			path: "file.ts",
			line: 10,
			kind: "function",
			signature: "(x: number): void",
			scope: "MyClass",
		});

		const symbols = parseCtagsOutput(stdout);

		expect(symbols).toHaveLength(1);
		expect(symbols[0]).toEqual({
			name: "myFunction",
			file: "file.ts",
			line: 10,
			kind: "function",
			signature: "(x: number): void",
			scope: "MyClass",
		});
	});

	it("should handle missing optional fields", () => {
		const stdout = JSON.stringify({
			name: "myVar",
			path: "file.ts",
			line: 5,
			kind: "variable",
		});

		const symbols = parseCtagsOutput(stdout);

		expect(symbols[0].signature).toBeUndefined();
		expect(symbols[0].scope).toBeUndefined();
	});

	it("should skip malformed lines", () => {
		const stdout = `invalid
${JSON.stringify({ name: "func", path: "file.ts", line: 1, kind: "f" })}`;

		const symbols = parseCtagsOutput(stdout);

		expect(symbols).toHaveLength(1);
	});

	it("should handle empty output", () => {
		const symbols = parseCtagsOutput("");

		expect(symbols).toEqual([]);
	});
});

describe("parseCtagsTraditional", () => {
	it("should parse traditional ctags format", () => {
		const stdout = "myFunction\tfile.ts\t/^function myFunction/;\"\tf";

		const symbols = parseCtagsTraditional(stdout);

		expect(symbols).toHaveLength(1);
		expect(symbols[0].name).toBe("myFunction");
		expect(symbols[0].file).toBe("file.ts");
		expect(symbols[0].kind).toBe("f");
	});

	it("should skip comment lines", () => {
		const stdout = `!_TAG_FILE_FORMAT	2
myFunction	file.ts	/^function/	f`;

		const symbols = parseCtagsTraditional(stdout);

		expect(symbols).toHaveLength(1);
	});

	it("should handle line number format", () => {
		// ctags format: name\tfile\tline;\tkind
		// Note: line number field ends with just ';' not ';"'
		const stdout = "myFunction\tfile.ts\t10;\tf";

		const symbols = parseCtagsTraditional(stdout);

		expect(symbols[0].line).toBe(10);
	});

	it("should handle empty output", () => {
		const symbols = parseCtagsTraditional("");

		expect(symbols).toEqual([]);
	});
});

describe("formatSymbols", () => {
	it("should format symbols grouped by kind", () => {
		const output: SearchResponse<SymbolDefinition> = {
			total: 3,
			truncated: false,
			results: [
				{ name: "func1", kind: "function", file: "a.ts", line: 1 },
				{ name: "func2", kind: "function", file: "b.ts", line: 2 },
				{ name: "MyClass", kind: "class", file: "c.ts", line: 10 },
			],
		};

		const formatted = formatSymbols(output);

		expect(formatted).toContain("Found 3 symbols");
		expect(formatted).toContain("function:");
		expect(formatted).toContain("class:");
	});

	it("should show scope and signature", () => {
		const output: SearchResponse<SymbolDefinition> = {
			total: 1,
			truncated: false,
			results: [
				{
					name: "method",
					kind: "method",
					file: "a.ts",
					line: 5,
					scope: "MyClass",
					signature: "()",
				},
			],
		};

		const formatted = formatSymbols(output);

		expect(formatted).toContain("MyClass::method");
	});
});

describe("createErrorResponse", () => {
	it("should create error response", () => {
		const response = createErrorResponse<string>("Something went wrong");

		expect(response.total).toBe(0);
		expect(response.truncated).toBe(false);
		expect(response.results).toEqual([]);
		expect(response.error).toBe("Something went wrong");
	});
});

describe("createCodeSearchError", () => {
	it("should create code search error response", () => {
		const response = createCodeSearchError("Search failed");

		expect(response.total).toBe(0);
		expect(response.truncated).toBe(false);
		expect(response.summary).toEqual([]);
		expect(response.results).toEqual([]);
		expect(response.error).toBe("Search failed");
	});
});

describe("formatError", () => {
	it("should format Error instances", () => {
		const formatted = formatError("code_search", new Error("Not found"));

		expect(formatted).toBe("code_search error: Not found");
	});

	it("should format non-Error values", () => {
		const formatted = formatError("tool", "string error");

		expect(formatted).toBe("tool error: string error");
	});
});

describe("escapeText", () => {
	it("should escape newline", () => {
		expect(escapeText("line1\nline2")).toBe("line1\\nline2");
	});

	it("should escape carriage return", () => {
		expect(escapeText("text\rmore")).toBe("text\\rmore");
	});

	it("should escape tab", () => {
		expect(escapeText("col1\tcol2")).toBe("col1\\tcol2");
	});

	it("should handle text without special chars", () => {
		expect(escapeText("normal text")).toBe("normal text");
	});
});

describe("truncateText", () => {
	it("should not truncate short text", () => {
		expect(truncateText("short", 10)).toBe("short");
	});

	it("should truncate long text with ellipsis", () => {
		expect(truncateText("this is a long text", 10)).toBe("this is...");
	});

	it("should handle exact length", () => {
		expect(truncateText("12345", 5)).toBe("12345");
	});
});

describe("relativePath", () => {
	it("should convert absolute path to relative", () => {
		const result = relativePath("/home/user/project/file.ts", "/home/user/project");

		expect(result).toBe("file.ts");
	});

	it("should handle subdirectory paths", () => {
		const result = relativePath("/home/user/project/src/file.ts", "/home/user/project");

		expect(result).toBe("src/file.ts");
	});

	it("should return original path if not under cwd", () => {
		const result = relativePath("/other/path/file.ts", "/home/user/project");

		expect(result).toBe("/other/path/file.ts");
	});
});

describe("calculateSimpleConfidence", () => {
	it("should return low confidence for zero results", () => {
		expect(calculateSimpleConfidence(0, false)).toBe(0.1);
	});

	it("should return high confidence for many results", () => {
		expect(calculateSimpleConfidence(51, false)).toBe(0.9);
		expect(calculateSimpleConfidence(10, true)).toBe(0.9);
	});

	it("should increase with count", () => {
		const low = calculateSimpleConfidence(5, false);
		const high = calculateSimpleConfidence(20, false);

		expect(high).toBeGreaterThan(low);
	});

	it("should cap at maximum", () => {
		const conf = calculateSimpleConfidence(100, false);

		expect(conf).toBeLessThanOrEqual(1);
	});
});

describe("createSimpleHints", () => {
	it("should create hints with confidence", () => {
		const hints = createSimpleHints("tool", 10, false);

		expect(hints.confidence).toBeGreaterThan(0);
		expect(hints.confidence).toBeLessThanOrEqual(1);
	});

	it("should suggest refine_pattern for zero results", () => {
		const hints = createSimpleHints("tool", 0, false);

		expect(hints.suggestedNextAction).toBe("refine_pattern");
		expect(hints.alternativeTools).toBeDefined();
	});

	it("should suggest increase_limit for truncated results", () => {
		const hints = createSimpleHints("tool", 100, true);

		expect(hints.suggestedNextAction).toBe("increase_limit");
	});

	it("should not suggest action for good results", () => {
		const hints = createSimpleHints("tool", 10, false);

		expect(hints.suggestedNextAction).toBeUndefined();
	});

	it("should generate related queries for empty results", () => {
		const hints = createSimpleHints("tool", 0, false, "test-pattern");

		expect(hints.relatedQueries).toBeDefined();
	});
});

describe("suggestNextAction", () => {
	it("should suggest expand_scope for no results", () => {
		const response: SearchResponse<string> = {
			total: 0,
			truncated: false,
			results: [],
		};

		expect(suggestNextAction(response)).toBe("expand_scope");
	});

	it("should suggest refine_pattern for heavily truncated results", () => {
		const response: SearchResponse<string> = {
			total: 250, // More than DEFAULT_LIMIT * 2
			truncated: true,
			results: [],
		};

		expect(suggestNextAction(response)).toBe("refine_pattern");
	});

	it("should suggest increase_limit for moderately truncated results", () => {
		const response: SearchResponse<string> = {
			total: 150,
			truncated: true,
			results: [],
		};

		expect(suggestNextAction(response)).toBe("increase_limit");
	});

	it("should return undefined for good results", () => {
		const response: SearchResponse<string> = {
			total: 50,
			truncated: false,
			results: [],
		};

		expect(suggestNextAction(response)).toBeUndefined();
	});
});

describe("enhanceOutput", () => {
	it("should enhance basic response with hints and stats", () => {
		const response: SearchResponse<string> = {
			total: 10,
			truncated: false,
			results: ["a", "b", "c"],
		};
		const metrics = createMockMetrics();

		const enhanced = enhanceOutput(response, metrics);

		expect(enhanced.total).toBe(10);
		expect(enhanced.truncated).toBe(false);
		expect(enhanced.results).toEqual(["a", "b", "c"]);
		expect(enhanced.hints).toBeDefined();
		expect(enhanced.hints.confidence).toBeGreaterThan(0);
		expect(enhanced.stats.filesSearched).toBe(10);
		expect(enhanced.stats.durationMs).toBe(100);
	});

	it("should handle error response", () => {
		const response: SearchResponse<string> = {
			total: 0,
			truncated: false,
			results: [],
			error: "Failed",
		};
		const metrics = createMockMetrics();

		const enhanced = enhanceOutput(response, metrics);

		expect(enhanced.error).toBe("Failed");
		// When total is 0, confidence is 0.1 (total check comes before error check)
		expect(enhanced.hints.confidence).toBe(0.1);
	});

	it("should allow overriding hints", () => {
		const response: SearchResponse<string> = {
			total: 5,
			truncated: false,
			results: [],
		};
		const metrics = createMockMetrics();

		const enhanced = enhanceOutput(response, metrics, {
			suggestedNextAction: "regenerate_index",
		});

		expect(enhanced.hints.suggestedNextAction).toBe("regenerate_index");
	});
});

describe("Edge cases", () => {
	it("should handle null values in results", () => {
		const results = [null, "value", null];
		const response = truncateResults(results as string[], 10);

		expect(response.results).toEqual(results);
	});

	it("should handle very long text in truncateText", () => {
		const text = "a".repeat(10000);
		const truncated = truncateText(text, 100);

		expect(truncated.length).toBe(100);
		expect(truncated.endsWith("...")).toBe(true);
	});

	it("should handle empty strings", () => {
		expect(escapeText("")).toBe("");
		expect(truncateText("", 10)).toBe("");
		expect(relativePath("", "/cwd")).toBe("");
	});
});
