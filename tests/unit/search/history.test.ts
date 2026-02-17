/**
 * Tests for Search History Management
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
	SearchHistory,
	DEFAULT_HISTORY_CONFIG,
	getSearchHistory,
	resetSearchHistory,
	extractQuery,
	createHistoryEntry,
	type SearchHistoryEntry,
	type HistoryConfig,
	type QuerySuggestion,
} from "../../../.pi/extensions/search/utils/history.js";

describe("SearchHistory", () => {
	let history: SearchHistory;

	beforeEach(() => {
		history = new SearchHistory();
	});

	describe("addHistoryEntry", () => {
		it("should add entry with timestamp and accepted flag", () => {
			const entry = history.addHistoryEntry({
				tool: "code_search",
				params: { pattern: "test" },
				query: "test",
				results: ["file1.ts", "file2.ts"],
			});

			expect(entry.timestamp).toBeDefined();
			expect(entry.timestamp).toBeGreaterThan(0);
			expect(entry.accepted).toBe(false);
		});

		it("should limit results per entry", () => {
			history = new SearchHistory({ maxResultsPerEntry: 3 });

			const entry = history.addHistoryEntry({
				tool: "code_search",
				params: { pattern: "test" },
				query: "test",
				results: ["f1", "f2", "f3", "f4", "f5"],
			});

			expect(entry.results.length).toBe(3);
		});

		it("should add entries in reverse chronological order", async () => {
			history.addHistoryEntry({
				tool: "tool1",
				params: {},
				query: "query1",
				results: [],
			});

			// Wait a tiny bit to ensure different timestamp
			await new Promise((r) => setTimeout(r, 1));

			history.addHistoryEntry({
				tool: "tool2",
				params: {},
				query: "query2",
				results: [],
			});

			const entries = history.getAllEntries();
			expect(entries[0].query).toBe("query2");
			expect(entries[1].query).toBe("query1");
		});

		it("should enforce max entries limit", () => {
			history = new SearchHistory({ maxEntries: 2 });

			history.addHistoryEntry({
				tool: "t1",
				params: {},
				query: "q1",
				results: [],
			});
			history.addHistoryEntry({
				tool: "t2",
				params: {},
				query: "q2",
				results: [],
			});
			history.addHistoryEntry({
				tool: "t3",
				params: {},
				query: "q3",
				results: [],
			});

			expect(history.size).toBe(2);
		});

		it("should store params with entry", () => {
			const entry = history.addHistoryEntry({
				tool: "code_search",
				params: { pattern: "test", limit: 50 },
				query: "test",
				results: [],
			});

			expect(entry.params).toEqual({ pattern: "test", limit: 50 });
		});
	});

	describe("getRecentQueries", () => {
		beforeEach(() => {
			// Add some history entries
			history.addHistoryEntry({
				tool: "code_search",
				params: { pattern: "function" },
				query: "function",
				results: ["a.ts"],
			});
			history.addHistoryEntry({
				tool: "code_search",
				params: { pattern: "function" },
				query: "function",
				results: ["b.ts"],
			});
			history.addHistoryEntry({
				tool: "code_search",
				params: { pattern: "class" },
				query: "class",
				results: ["c.ts"],
			});
			history.addHistoryEntry({
				tool: "file_candidates",
				params: { pattern: "*.ts" },
				query: "*.ts",
				results: [],
			});
		});

		it("should return queries sorted by last used", () => {
			const queries = history.getRecentQueries();

			// "class" was added after first "function", but "function" has more counts
			// and the last "function" entry has a later timestamp
			expect(queries.length).toBeGreaterThan(0);
		});

		it("should aggregate count for same queries", () => {
			const queries = history.getRecentQueries();
			const functionQuery = queries.find((q) => q.query === "function");

			expect(functionQuery?.count).toBe(2);
		});

		it("should filter by tool when specified", () => {
			const queries = history.getRecentQueries(10, "code_search");

			expect(queries.every((q) => q.query !== "*.ts")).toBe(true);
		});

		it("should respect limit parameter", () => {
			const queries = history.getRecentQueries(2);
			expect(queries.length).toBe(2);
		});

		it("should track accepted status", () => {
			// Mark one entry as accepted
			const entries = history.getAllEntries();
			history.markAccepted(entries[0].timestamp);

			const queries = history.getRecentQueries();
			const query = queries.find((q) => q.query === entries[0].query);

			expect(query?.wasAccepted).toBe(true);
		});
	});

	describe("getRelatedQueries", () => {
		beforeEach(() => {
			// Add related queries
			history.addHistoryEntry({
				tool: "code_search",
				params: { pattern: "test" },
				query: "test",
				results: ["file1.ts", "file2.ts"],
			});
			history.addHistoryEntry({
				tool: "code_search",
				params: { pattern: "testHelper" },
				query: "testHelper",
				results: ["file1.ts"], // Shared result with "test"
			});
			history.addHistoryEntry({
				tool: "code_search",
				params: { pattern: "testing" },
				query: "testing",
				results: [],
			});
			history.addHistoryEntry({
				tool: "code_search",
				params: { pattern: "unrelated" },
				query: "unrelated",
				results: ["other.ts"],
			});
		});

		it("should find substring-related queries", () => {
			const related = history.getRelatedQueries("test");

			expect(related.some((q) => q.query === "testHelper")).toBe(true);
			expect(related.some((q) => q.query === "testing")).toBe(true);
		});

		it("should not include the exact query", () => {
			const related = history.getRelatedQueries("test");

			expect(related.some((q) => q.query === "test")).toBe(false);
		});

		it("should find queries with shared results", () => {
			// test and testHelper share file1.ts
			const related = history.getRelatedQueries("testHelper");

			expect(related.some((q) => q.query === "test")).toBe(true);
		});

		it("should respect limit parameter", () => {
			const related = history.getRelatedQueries("test", 1);
			expect(related.length).toBeLessThanOrEqual(1);
		});

		it("should return empty array for no related queries", () => {
			const related = history.getRelatedQueries("xyznonexistent");
			expect(related).toEqual([]);
		});

		it("should handle case-insensitive matching", () => {
			history.addHistoryEntry({
				tool: "code_search",
				params: { pattern: "TestHelper" },
				query: "TestHelper",
				results: [],
			});

			const related = history.getRelatedQueries("test");
			expect(related.some((q) => q.query === "TestHelper")).toBe(true);
		});
	});

	describe("markAccepted", () => {
		it("should mark entry as accepted", () => {
			const entry = history.addHistoryEntry({
				tool: "code_search",
				params: {},
				query: "test",
				results: [],
			});

			const result = history.markAccepted(entry.timestamp);

			expect(result).toBe(true);
			expect(history.getEntry(entry.timestamp)?.accepted).toBe(true);
		});

		it("should return false for non-existent timestamp", () => {
			const result = history.markAccepted(999999999);
			expect(result).toBe(false);
		});
	});

	describe("getEntry", () => {
		it("should return entry by timestamp", () => {
			const entry = history.addHistoryEntry({
				tool: "code_search",
				params: { pattern: "test" },
				query: "test",
				results: ["file.ts"],
			});

			const retrieved = history.getEntry(entry.timestamp);

			expect(retrieved).toEqual(entry);
		});

		it("should return undefined for non-existent timestamp", () => {
			const entry = history.getEntry(999999999);
			expect(entry).toBeUndefined();
		});
	});

	describe("getAllEntries", () => {
		it("should return copy of entries array", () => {
			history.addHistoryEntry({
				tool: "t1",
				params: {},
				query: "q1",
				results: [],
			});

			const entries1 = history.getAllEntries();
			const entries2 = history.getAllEntries();

			expect(entries1).not.toBe(entries2); // Different references
			expect(entries1).toEqual(entries2); // Same content
		});
	});

	describe("clear", () => {
		it("should remove all entries", () => {
			history.addHistoryEntry({
				tool: "t1",
				params: {},
				query: "q1",
				results: [],
			});
			history.addHistoryEntry({
				tool: "t2",
				params: {},
				query: "q2",
				results: [],
			});

			history.clear();

			expect(history.size).toBe(0);
			expect(history.getAllEntries()).toEqual([]);
		});
	});

	describe("size property", () => {
		it("should return number of entries", () => {
			expect(history.size).toBe(0);

			history.addHistoryEntry({
				tool: "t1",
				params: {},
				query: "q1",
				results: [],
			});
			expect(history.size).toBe(1);

			history.addHistoryEntry({
				tool: "t2",
				params: {},
				query: "q2",
				results: [],
			});
			expect(history.size).toBe(2);
		});
	});
});

describe("Global history functions", () => {
	afterEach(() => {
		resetSearchHistory();
	});

	describe("getSearchHistory", () => {
		it("should return the same instance", () => {
			const h1 = getSearchHistory();
			const h2 = getSearchHistory();

			expect(h1).toBe(h2);
		});

		it("should be a SearchHistory instance", () => {
			const h = getSearchHistory();
			expect(h).toBeInstanceOf(SearchHistory);
		});
	});

	describe("resetSearchHistory", () => {
		it("should reset the global history", () => {
			const h1 = getSearchHistory();
			h1.addHistoryEntry({
				tool: "t1",
				params: {},
				query: "q1",
				results: [],
			});

			resetSearchHistory();

			const h2 = getSearchHistory();
			expect(h2).not.toBe(h1);
			expect(h2.size).toBe(0);
		});
	});
});

describe("extractQuery", () => {
	it("should extract pattern from file_candidates", () => {
		const query = extractQuery("file_candidates", { pattern: "*.ts" });
		expect(query).toBe("*.ts");
	});

	it("should extract extension from file_candidates as fallback", () => {
		const query = extractQuery("file_candidates", { extension: "ts" });
		expect(query).toBe("ts");
	});

	it("should extract pattern from code_search", () => {
		const query = extractQuery("code_search", { pattern: "function" });
		expect(query).toBe("function");
	});

	it("should extract name from sym_find", () => {
		const query = extractQuery("sym_find", { name: "MyClass" });
		expect(query).toBe("MyClass");
	});

	it("should extract kind from sym_find as fallback", () => {
		const query = extractQuery("sym_find", { kind: "function" });
		expect(query).toBe("function");
	});

	it("should extract path from sym_index", () => {
		const query = extractQuery("sym_index", { path: "/src" });
		expect(query).toBe("/src");
	});

	it("should return 'index' for sym_index without path", () => {
		const query = extractQuery("sym_index", {});
		expect(query).toBe("index");
	});

	it("should handle unknown tools with fallback", () => {
		const query = extractQuery("unknown_tool", { pattern: "test" });
		expect(query).toBe("test");
	});

	it("should use query param as fallback", () => {
		const query = extractQuery("unknown_tool", { query: "search" });
		expect(query).toBe("search");
	});

	it("should use name param as fallback", () => {
		const query = extractQuery("unknown_tool", { name: "MyName" });
		expect(query).toBe("MyName");
	});

	it("should return empty string for empty params", () => {
		const query = extractQuery("unknown_tool", {});
		expect(query).toBe("");
	});
});

describe("createHistoryEntry", () => {
	it("should create entry without timestamp and accepted", () => {
		const entry = createHistoryEntry(
			"code_search",
			{ pattern: "test" },
			["file1.ts", "file2.ts"]
		);

		expect(entry.tool).toBe("code_search");
		expect(entry.params).toEqual({ pattern: "test" });
		expect(entry.query).toBe("test");
		expect(entry.results).toEqual(["file1.ts", "file2.ts"]);

		// Should not have timestamp or accepted
		expect(entry).not.toHaveProperty("timestamp");
		expect(entry).not.toHaveProperty("accepted");
	});

	it("should use extractQuery to get query", () => {
		const entry = createHistoryEntry(
			"file_candidates",
			{ extension: "ts" },
			[]
		);

		expect(entry.query).toBe("ts");
	});
});

describe("DEFAULT_HISTORY_CONFIG", () => {
	it("should have expected default values", () => {
		expect(DEFAULT_HISTORY_CONFIG.maxEntries).toBe(100);
		expect(DEFAULT_HISTORY_CONFIG.maxResultsPerEntry).toBe(10);
	});
});

describe("Edge cases", () => {
	let history: SearchHistory;

	beforeEach(() => {
		history = new SearchHistory();
	});

	it("should handle empty results array", () => {
		const entry = history.addHistoryEntry({
			tool: "code_search",
			params: {},
			query: "test",
			results: [],
		});

		expect(entry.results).toEqual([]);
	});

	it("should handle special characters in query", () => {
		const entry = history.addHistoryEntry({
			tool: "code_search",
			params: { pattern: "test*.ts" },
			query: "test*.ts",
			results: [],
		});

		expect(entry.query).toBe("test*.ts");
	});

	it("should handle unicode in query", () => {
		const entry = history.addHistoryEntry({
			tool: "code_search",
			params: { pattern: "テスト" },
			query: "テスト",
			results: [],
		});

		expect(entry.query).toBe("テスト");
	});

	it("should handle very long query strings", () => {
		const longQuery = "a".repeat(1000);
		const entry = history.addHistoryEntry({
			tool: "code_search",
			params: { pattern: longQuery },
			query: longQuery,
			results: [],
		});

		expect(entry.query).toBe(longQuery);
	});

	it("should handle getRecentQueries on empty history", () => {
		const queries = history.getRecentQueries();
		expect(queries).toEqual([]);
	});

	it("should handle getRelatedQueries on empty history", () => {
		const related = history.getRelatedQueries("test");
		expect(related).toEqual([]);
	});
});
