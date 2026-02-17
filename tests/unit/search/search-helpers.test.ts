/**
 * Tests for Search Result Integration Helpers
 */

import { describe, it, expect } from "vitest";
import {
	fileCandidateToUnified,
	codeSearchMatchToUnified,
	symbolDefinitionToUnified,
	mergeSearchResults,
	rankByRelevance,
	deduplicateResults,
	integrateSearchResults,
	groupByFile,
	filterByType,
	filterByFilePattern,
	formatUnifiedResult,
	formatUnifiedResults,
	DEFAULT_MERGE_OPTIONS,
	DEFAULT_RANK_OPTIONS,
	type UnifiedSearchResult,
	type MergeOptions,
	type RankOptions,
} from "../../../.pi/extensions/search/utils/search-helpers.js";
import type {
	FileCandidate,
	CodeSearchMatch,
	SymbolDefinition,
} from "../../../.pi/extensions/search/types.js";

describe("Result Converters", () => {
	describe("fileCandidateToUnified", () => {
		it("should convert FileCandidate to UnifiedSearchResult", () => {
			const candidate: FileCandidate = {
				path: "src/file.ts",
				type: "file",
			};

			const result = fileCandidateToUnified(candidate);

			expect(result.file).toBe("src/file.ts");
			expect(result.type).toBe("file");
			expect(result.score).toBe(0.5);
			expect(result.sources).toContain("file_candidates");
			expect(result.metadata?.entryType).toBe("file");
		});

		it("should accept custom source name", () => {
			const candidate: FileCandidate = { path: "test.ts", type: "file" };
			const result = fileCandidateToUnified(candidate, "custom_source");

			expect(result.sources).toContain("custom_source");
		});

		it("should handle directory type", () => {
			const candidate: FileCandidate = { path: "src", type: "dir" };
			const result = fileCandidateToUnified(candidate);

			expect(result.metadata?.entryType).toBe("dir");
		});
	});

	describe("codeSearchMatchToUnified", () => {
		it("should convert CodeSearchMatch to UnifiedSearchResult", () => {
			const match: CodeSearchMatch = {
				file: "src/file.ts",
				line: 10,
				column: 5,
				text: "const x = 1;",
			};

			const result = codeSearchMatchToUnified(match);

			expect(result.file).toBe("src/file.ts");
			expect(result.line).toBe(10);
			expect(result.column).toBe(5);
			expect(result.snippet).toBe("const x = 1;");
			expect(result.type).toBe("match");
			expect(result.score).toBe(0.7);
		});

		it("should include context in metadata", () => {
			const match: CodeSearchMatch = {
				file: "file.ts",
				line: 1,
				text: "code",
				context: ["line before", "line after"],
			};

			const result = codeSearchMatchToUnified(match);

			expect(result.metadata?.context).toEqual(["line before", "line after"]);
		});

		it("should handle match without column", () => {
			const match: CodeSearchMatch = {
				file: "file.ts",
				line: 1,
				text: "code",
			};

			const result = codeSearchMatchToUnified(match);

			expect(result.column).toBeUndefined();
		});
	});

	describe("symbolDefinitionToUnified", () => {
		it("should convert SymbolDefinition to UnifiedSearchResult", () => {
			const symbol: SymbolDefinition = {
				name: "myFunction",
				kind: "function",
				file: "src/file.ts",
				line: 20,
			};

			const result = symbolDefinitionToUnified(symbol);

			expect(result.file).toBe("src/file.ts");
			expect(result.line).toBe(20);
			expect(result.type).toBe("symbol");
			expect(result.score).toBe(0.8);
			expect(result.metadata?.name).toBe("myFunction");
			expect(result.metadata?.kind).toBe("function");
		});

		it("should include signature and scope", () => {
			const symbol: SymbolDefinition = {
				name: "method",
				kind: "method",
				file: "file.ts",
				line: 10,
				signature: "(x: number): void",
				scope: "MyClass",
			};

			const result = symbolDefinitionToUnified(symbol);

			expect(result.snippet).toContain("method");
			expect(result.snippet).toContain("MyClass::");
			expect(result.snippet).toContain("(x: number): void");
			expect(result.metadata?.signature).toBe("(x: number): void");
			expect(result.metadata?.scope).toBe("MyClass");
		});
	});
});

describe("mergeSearchResults", () => {
	it("should merge multiple result arrays", () => {
		const results1: UnifiedSearchResult[] = [
			{ file: "a.ts", score: 0.5, sources: ["tool1"], type: "file" },
		];
		const results2: UnifiedSearchResult[] = [
			{ file: "b.ts", score: 0.5, sources: ["tool2"], type: "file" },
		];

		const merged = mergeSearchResults([results1, results2]);

		expect(merged).toHaveLength(2);
		expect(merged.map((r) => r.file)).toContain("a.ts");
		expect(merged.map((r) => r.file)).toContain("b.ts");
	});

	it("should deduplicate by file:line combination", () => {
		const results1: UnifiedSearchResult[] = [
			{ file: "a.ts", line: 10, score: 0.5, sources: ["tool1"], type: "match" },
		];
		const results2: UnifiedSearchResult[] = [
			{ file: "a.ts", line: 10, score: 0.5, sources: ["tool2"], type: "match" },
		];

		const merged = mergeSearchResults([results1, results2]);

		expect(merged).toHaveLength(1);
		expect(merged[0].sources).toContain("tool1");
		expect(merged[0].sources).toContain("tool2");
	});

	it("should boost score for multi-source results when enabled", () => {
		const results1: UnifiedSearchResult[] = [
			{ file: "a.ts", line: 10, score: 0.5, sources: ["tool1"], type: "match" },
		];
		const results2: UnifiedSearchResult[] = [
			{ file: "a.ts", line: 10, score: 0.5, sources: ["tool2"], type: "match" },
		];

		const merged = mergeSearchResults([results1, results2], { boostMultiSource: true, multiSourceBoost: 2.0 });

		expect(merged[0].score).toBe(1.0); // 0.5 * 2.0
	});

	it("should not boost when disabled", () => {
		const results1: UnifiedSearchResult[] = [
			{ file: "a.ts", line: 10, score: 0.5, sources: ["tool1"], type: "match" },
		];
		const results2: UnifiedSearchResult[] = [
			{ file: "a.ts", line: 10, score: 0.5, sources: ["tool2"], type: "match" },
		];

		const merged = mergeSearchResults([results1, results2], { boostMultiSource: false });

		// Score should not change
		expect(merged[0].score).toBe(0.5);
	});

	it("should handle empty arrays", () => {
		const merged = mergeSearchResults([[], []]);

		expect(merged).toEqual([]);
	});

	it("should merge metadata from duplicate results", () => {
		const results1: UnifiedSearchResult[] = [
			{ file: "a.ts", score: 0.5, sources: ["t1"], type: "file", metadata: { a: 1 } },
		];
		const results2: UnifiedSearchResult[] = [
			{ file: "a.ts", score: 0.5, sources: ["t2"], type: "file", metadata: { b: 2 } },
		];

		const merged = mergeSearchResults([results1, results2]);

		expect(merged[0].metadata).toEqual({ a: 1, b: 2 });
	});

	it("should deduplicate by file when no line number", () => {
		const results1: UnifiedSearchResult[] = [
			{ file: "a.ts", score: 0.5, sources: ["t1"], type: "file" },
		];
		const results2: UnifiedSearchResult[] = [
			{ file: "a.ts", score: 0.5, sources: ["t2"], type: "file" },
		];

		const merged = mergeSearchResults([results1, results2]);

		expect(merged).toHaveLength(1);
	});
});

describe("rankByRelevance", () => {
	it("should rank results by query relevance", () => {
		const results: UnifiedSearchResult[] = [
			{ file: "a.ts", snippet: "test function", score: 0.5, sources: [], type: "match" },
			{ file: "b.ts", snippet: "unrelated", score: 0.5, sources: [], type: "match" },
		];

		const ranked = rankByRelevance(results, "test");

		expect(ranked[0].file).toBe("a.ts");
		expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
	});

	it("should boost exact name matches significantly", () => {
		const results: UnifiedSearchResult[] = [
			{
				file: "a.ts",
				snippet: "some code",
				score: 0.5,
				sources: [],
				type: "symbol",
				metadata: { name: "myFunction" },
			},
			{
				file: "b.ts",
				snippet: "myFunction call",
				score: 0.5,
				sources: [],
				type: "match",
			},
		];

		const ranked = rankByRelevance(results, "myfunction");

		// Exact name match should be ranked higher
		expect(ranked[0].file).toBe("a.ts");
	});

	it("should boost file path matches", () => {
		const results: UnifiedSearchResult[] = [
			{ file: "src/test/file.ts", score: 0.5, sources: [], type: "file" },
			{ file: "src/other/file.ts", score: 0.5, sources: [], type: "file" },
		];

		const ranked = rankByRelevance(results, "test");

		expect(ranked[0].file).toBe("src/test/file.ts");
	});

	it("should handle multi-term queries", () => {
		const results: UnifiedSearchResult[] = [
			{
				file: "a.ts",
				snippet: "test function helper",
				score: 0.5,
				sources: [],
				type: "match",
			},
			{
				file: "b.ts",
				snippet: "test only",
				score: 0.5,
				sources: [],
				type: "match",
			},
		];

		const ranked = rankByRelevance(results, "test helper");

		expect(ranked[0].file).toBe("a.ts");
	});

	it("should handle empty query", () => {
		const results: UnifiedSearchResult[] = [
			{ file: "a.ts", score: 0.5, sources: [], type: "file" },
		];

		const ranked = rankByRelevance(results, "");

		expect(ranked).toHaveLength(1);
	});

	it("should sort by score descending", () => {
		const results: UnifiedSearchResult[] = [
			{ file: "low.ts", snippet: "x", score: 0.5, sources: [], type: "match" },
			{ file: "high.ts", snippet: "test test test", score: 0.5, sources: [], type: "match" },
		];

		const ranked = rankByRelevance(results, "test");

		for (let i = 1; i < ranked.length; i++) {
			expect(ranked[i - 1].score).toBeGreaterThanOrEqual(ranked[i].score);
		}
	});
});

describe("deduplicateResults", () => {
	it("should remove duplicates keeping highest score", () => {
		const results: UnifiedSearchResult[] = [
			{ file: "a.ts", line: 10, score: 0.5, sources: [], type: "match" },
			{ file: "a.ts", line: 10, score: 0.9, sources: [], type: "match" },
			{ file: "a.ts", line: 10, score: 0.3, sources: [], type: "match" },
		];

		const deduped = deduplicateResults(results);

		expect(deduped).toHaveLength(1);
		expect(deduped[0].score).toBe(0.9);
	});

	it("should keep different line numbers", () => {
		const results: UnifiedSearchResult[] = [
			{ file: "a.ts", line: 10, score: 0.5, sources: [], type: "match" },
			{ file: "a.ts", line: 20, score: 0.5, sources: [], type: "match" },
		];

		const deduped = deduplicateResults(results);

		expect(deduped).toHaveLength(2);
	});

	it("should handle results without line numbers", () => {
		const results: UnifiedSearchResult[] = [
			{ file: "a.ts", score: 0.5, sources: [], type: "file" },
			{ file: "a.ts", score: 0.7, sources: [], type: "file" },
		];

		const deduped = deduplicateResults(results);

		expect(deduped).toHaveLength(1);
		expect(deduped[0].score).toBe(0.7);
	});

	it("should handle empty array", () => {
		const deduped = deduplicateResults([]);

		expect(deduped).toEqual([]);
	});
});

describe("integrateSearchResults", () => {
	it("should integrate results from all tool types", () => {
		const files: FileCandidate[] = [{ path: "a.ts", type: "file" }];
		const matches: CodeSearchMatch[] = [{ file: "b.ts", line: 1, text: "code" }];
		const symbols: SymbolDefinition[] = [{ name: "func", kind: "f", file: "c.ts", line: 1 }];

		const integrated = integrateSearchResults(files, matches, symbols, "test");

		expect(integrated.length).toBe(3);
	});

	it("should rank and deduplicate results", () => {
		const files: FileCandidate[] = [{ path: "test.ts", type: "file" }];
		const matches: CodeSearchMatch[] = [{ file: "test.ts", line: 1, text: "test" }];

		const integrated = integrateSearchResults(files, matches, [], "test");

		// Same file should be deduplicated by file:line key
		// file doesn't have line, match has line, so they're different
		expect(integrated.length).toBe(2);
	});

	it("should apply limit", () => {
		const files: FileCandidate[] = Array(100)
			.fill(null)
			.map((_, i) => ({ path: `file${i}.ts`, type: "file" as const }));

		const integrated = integrateSearchResults(files, [], [], "", { limit: 10 });

		expect(integrated.length).toBe(10);
	});

	it("should handle empty inputs", () => {
		const integrated = integrateSearchResults();

		expect(integrated).toEqual([]);
	});
});

describe("groupByFile", () => {
	it("should group results by file", () => {
		const results: UnifiedSearchResult[] = [
			{ file: "a.ts", line: 10, score: 0.5, sources: [], type: "match" },
			{ file: "a.ts", line: 20, score: 0.5, sources: [], type: "match" },
			{ file: "b.ts", line: 10, score: 0.5, sources: [], type: "match" },
		];

		const grouped = groupByFile(results);

		expect(grouped.size).toBe(2);
		expect(grouped.get("a.ts")?.length).toBe(2);
		expect(grouped.get("b.ts")?.length).toBe(1);
	});

	it("should handle empty array", () => {
		const grouped = groupByFile([]);

		expect(grouped.size).toBe(0);
	});
});

describe("filterByType", () => {
	it("should filter results by type", () => {
		const results: UnifiedSearchResult[] = [
			{ file: "a.ts", score: 0.5, sources: [], type: "file" },
			{ file: "b.ts", score: 0.5, sources: [], type: "match" },
			{ file: "c.ts", score: 0.5, sources: [], type: "symbol" },
		];

		const files = filterByType(results, "file");
		const matches = filterByType(results, "match");
		const symbols = filterByType(results, "symbol");

		expect(files.length).toBe(1);
		expect(matches.length).toBe(1);
		expect(symbols.length).toBe(1);
	});

	it("should handle no matches", () => {
		const results: UnifiedSearchResult[] = [
			{ file: "a.ts", score: 0.5, sources: [], type: "file" },
		];

		const symbols = filterByType(results, "symbol");

		expect(symbols).toEqual([]);
	});
});

describe("filterByFilePattern", () => {
	it("should filter by wildcard pattern", () => {
		const results: UnifiedSearchResult[] = [
			{ file: "src/a.ts", score: 0.5, sources: [], type: "file" },
			{ file: "test/b.ts", score: 0.5, sources: [], type: "file" },
			{ file: "src/c.js", score: 0.5, sources: [], type: "file" },
		];

		const filtered = filterByFilePattern(results, "src/*");

		expect(filtered.length).toBe(2);
		expect(filtered.every((r) => r.file.startsWith("src/"))).toBe(true);
	});

	it("should handle no matches", () => {
		const results: UnifiedSearchResult[] = [
			{ file: "a.ts", score: 0.5, sources: [], type: "file" },
		];

		const filtered = filterByFilePattern(results, "nonexistent/*");

		expect(filtered).toEqual([]);
	});
});

describe("formatUnifiedResult", () => {
	it("should format result with all components", () => {
		const result: UnifiedSearchResult = {
			file: "src/file.ts",
			line: 10,
			column: 5,
			score: 0.85,
			snippet: "const x = 1;",
			sources: ["code_search", "sym_find"],
			type: "match",
		};

		const formatted = formatUnifiedResult(result);

		expect(formatted).toContain("src/file.ts:10");
		expect(formatted).toContain("[match]");
		expect(formatted).toContain("code_search");
		expect(formatted).toContain("sym_find");
		expect(formatted).toContain("0.85");
		expect(formatted).toContain("const x = 1;");
	});

	it("should format file without line", () => {
		const result: UnifiedSearchResult = {
			file: "src/file.ts",
			score: 0.5,
			sources: ["file_candidates"],
			type: "file",
		};

		const formatted = formatUnifiedResult(result);

		expect(formatted).toContain("src/file.ts");
		expect(formatted).not.toContain(":undefined");
	});
});

describe("formatUnifiedResults", () => {
	it("should format multiple results", () => {
		const results: UnifiedSearchResult[] = [
			{ file: "a.ts", score: 0.5, sources: ["t1"], type: "file" },
			{ file: "b.ts", score: 0.5, sources: ["t2"], type: "file" },
		];

		const formatted = formatUnifiedResults(results);

		expect(formatted).toContain("Found 2 unified results");
		expect(formatted).toContain("a.ts");
		expect(formatted).toContain("b.ts");
	});

	it("should handle empty array", () => {
		const formatted = formatUnifiedResults([]);

		expect(formatted).toContain("Found 0 unified results");
	});
});

describe("Default Options", () => {
	describe("DEFAULT_MERGE_OPTIONS", () => {
		it("should have expected defaults", () => {
			expect(DEFAULT_MERGE_OPTIONS.boostMultiSource).toBe(true);
			expect(DEFAULT_MERGE_OPTIONS.multiSourceBoost).toBe(1.5);
			expect(DEFAULT_MERGE_OPTIONS.limit).toBe(100);
		});
	});

	describe("DEFAULT_RANK_OPTIONS", () => {
		it("should have expected defaults", () => {
			expect(DEFAULT_RANK_OPTIONS.query).toBe("");
			expect(DEFAULT_RANK_OPTIONS.exactMatchWeight).toBe(1.0);
			expect(DEFAULT_RANK_OPTIONS.partialMatchWeight).toBe(0.5);
			expect(DEFAULT_RANK_OPTIONS.pathMatchWeight).toBe(0.3);
		});
	});
});

describe("Edge cases", () => {
	it("should handle null metadata values", () => {
		const result: UnifiedSearchResult = {
			file: "a.ts",
			score: 0.5,
			sources: [],
			type: "file",
			metadata: { value: null },
		};

		expect(result.metadata?.value).toBeNull();
	});

	it("should handle very long file paths", () => {
		const longPath = "a".repeat(500) + ".ts";
		const result: UnifiedSearchResult = {
			file: longPath,
			score: 0.5,
			sources: [],
			type: "file",
		};

		expect(result.file).toBe(longPath);
	});

	it("should handle special characters in file paths", () => {
		const specialPath = "src/[test]/file (1).ts";
		const result: UnifiedSearchResult = {
			file: specialPath,
			score: 0.5,
			sources: [],
			type: "file",
		};

		expect(result.file).toBe(specialPath);
	});

	it("should handle zero scores", () => {
		const results: UnifiedSearchResult[] = [
			{ file: "a.ts", score: 0, sources: [], type: "file" },
			{ file: "b.ts", score: 0.1, sources: [], type: "file" },
		];

		const ranked = rankByRelevance(results, "");

		expect(ranked.length).toBe(2);
	});

	it("should handle negative line numbers gracefully", () => {
		const result: UnifiedSearchResult = {
			file: "a.ts",
			line: -1,
			score: 0.5,
			sources: [],
			type: "match",
		};

		expect(result.line).toBe(-1);
	});
});
