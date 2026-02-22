/**
 * @file sym_find.ts の単体テスト
 * @description シンボル検索ツールのテスト
 * @testFramework vitest
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { SymFindInput, SymbolIndexEntry } from "@ext/search/types.js";

// モック化
vi.mock("@ext/search/tools/sym_index.js", async () => ({
	symIndex: vi.fn(),
	readSymbolIndex: vi.fn(),
}));

vi.mock("@ext/search/utils/cache.js", () => ({
	getSearchCache: vi.fn(() => ({
		getCached: vi.fn(() => undefined),
		setCache: vi.fn(),
	})),
	getCacheKey: vi.fn((tool, params) => `${tool}-${JSON.stringify(params)}`),
}));

vi.mock("@ext/search/utils/history.js", () => ({
	getSearchHistory: vi.fn(() => ({
		addHistoryEntry: vi.fn(),
	})),
	extractQuery: vi.fn(() => ""),
}));

import { filterSymbols, sortSymbols, wildcardToRegex } from "../../../../../.pi/extensions/search/tools/sym_find.js";
import { symIndex, readSymbolIndex } from "../../../../../.pi/extensions/search/tools/sym_index.js";

describe("sym_find", () => {
	const mockEntries: SymbolIndexEntry[] = [
		{
			name: "testFunction",
			kind: "function",
			file: "src/utils.ts",
			line: 10,
			signature: "testFunction(): void",
			scope: "",
		},
		{
			name: "TestClass",
			kind: "class",
			file: "src/models.ts",
			line: 5,
			signature: "class TestClass",
			scope: "",
		},
		{
			name: "testVariable",
			kind: "variable",
			file: "src/constants.ts",
			line: 1,
			signature: "const testVariable = 1",
			scope: "",
		},
		{
			name: "helperFunction",
			kind: "function",
			file: "src/utils.ts",
			line: 20,
			signature: "helperFunction(): void",
			scope: "",
		},
	];

	describe("filterSymbols", () => {
		it("名前でフィルタリングできる", () => {
			const input: SymFindInput = {
				name: "test",
			};

			const result = filterSymbols(mockEntries, input);

			expect(result.length).toBeGreaterThan(0);
			result.forEach((r) => {
				expect(r.name.toLowerCase()).toContain("test");
			});
		});

		it("完全一致でフィルタリングできる", () => {
			const input: SymFindInput = {
				name: "testFunction",
			};

			const result = filterSymbols(mockEntries, input);

			expect(result.length).toBe(1);
			expect(result[0].name).toBe("testFunction");
		});

		it("kindでフィルタリングできる", () => {
			const input: SymFindInput = {
				kind: ["function"],
			};

			const result = filterSymbols(mockEntries, input);

			expect(result.length).toBeGreaterThan(0);
			result.forEach((r) => {
				expect(r.kind.toLowerCase()).toBe("function");
			});
		});

		it("複数のkindでフィルタリングできる", () => {
			const input: SymFindInput = {
				kind: ["function", "class"],
			};

			const result = filterSymbols(mockEntries, input);

			expect(result.length).toBeGreaterThan(0);
			result.forEach((r) => {
				expect(["function", "class"]).toContain(r.kind.toLowerCase());
			});
		});

		it("ファイルパスでフィルタリングできる", () => {
			const input: SymFindInput = {
				file: "utils",
			};

			const result = filterSymbols(mockEntries, input);

			expect(result.length).toBeGreaterThan(0);
			result.forEach((r) => {
				expect(r.file).toContain("utils");
			});
		});

		it("複数の条件を組み合わせてフィルタリングできる", () => {
			const input: SymFindInput = {
				name: "test",
				kind: ["function"],
				file: "utils",
			};

			const result = filterSymbols(mockEntries, input);

			expect(result.length).toBe(1);
			expect(result[0].name).toBe("testFunction");
		});

		it("条件に一致するシンボルがない場合、空配列を返す", () => {
			const input: SymFindInput = {
				name: "nonexistent",
			};

			const result = filterSymbols(mockEntries, input);

			expect(result.length).toBe(0);
		});
	});

	describe("sortSymbols", () => {
		it("完全一致が優先される", () => {
			const input: SymFindInput = {
				name: "testFunction",
			};

			const symbols = [
				{ name: "helperFunction", kind: "function", file: "a.ts", line: 1 },
				{ name: "testFunction", kind: "function", file: "b.ts", line: 2 },
				{ name: "testFunction2", kind: "function", file: "c.ts", line: 3 },
			] as any[];

			sortSymbols(symbols, input);

			expect(symbols[0].name).toBe("testFunction");
		});

		it("関数が優先される", () => {
			const input: SymFindInput = {
				name: "test",
			};

			const symbols = [
				{ name: "testVariable", kind: "variable", file: "a.ts", line: 1 },
				{ name: "testClass", kind: "class", file: "b.ts", line: 2 },
				{ name: "testFunction", kind: "function", file: "c.ts", line: 3 },
			] as any[];

			sortSymbols(symbols, input);

			expect(symbols[0].kind).toBe("function");
		});

		it("種類の優先順位が正しい", () => {
			const input: SymFindInput = {};

			const symbols = [
				{ name: "a", kind: "variable", file: "a.ts", line: 1 },
				{ name: "b", kind: "constant", file: "b.ts", line: 2 },
				{ name: "c", kind: "struct", file: "c.ts", line: 3 },
				{ name: "d", kind: "interface", file: "d.ts", line: 4 },
				{ name: "e", kind: "class", file: "e.ts", line: 5 },
				{ name: "f", kind: "method", file: "f.ts", line: 6 },
				{ name: "g", kind: "function", file: "g.ts", line: 7 },
			] as any[];

			sortSymbols(symbols, input);

			// function, method, class, interface, struct, variable, constant
			expect(symbols[0].kind).toBe("function");
			expect(symbols[1].kind).toBe("method");
			expect(symbols[2].kind).toBe("class");
		});

		it("同じ種類の場合はファイルパス順でソートされる", () => {
			const input: SymFindInput = {};

			const symbols = [
				{ name: "a", kind: "function", file: "z.ts", line: 1 },
				{ name: "b", kind: "function", file: "a.ts", line: 2 },
				{ name: "c", kind: "function", file: "m.ts", line: 3 },
			] as any[];

			sortSymbols(symbols, input);

			expect(symbols[0].file).toBe("a.ts");
			expect(symbols[1].file).toBe("m.ts");
			expect(symbols[2].file).toBe("z.ts");
		});
	});

	describe("wildcardToRegex", () => {
		it("アスタリスクが任意の文字列にマッチする", () => {
			const regex = wildcardToRegex("test*");

			expect(regex.test("test")).toBe(true);
			expect(regex.test("testFunction")).toBe(true);
			expect(regex.test("test123")).toBe(true);
			expect(regex.test("hello")).toBe(false);
		});

		it("クエスチョンマークが任意の1文字にマッチする", () => {
			const regex = wildcardToRegex("test?");

			expect(regex.test("test1")).toBe(true);
			expect(regex.test("testA")).toBe(true);
			expect(regex.test("test")).toBe(false);
			expect(regex.test("test123")).toBe(false);
		});

		it("複数のワイルドカードを組み合わせられる", () => {
			const regex = wildcardToRegex("test*Function?");

			expect(regex.test("testFunction1")).toBe(true);
			expect(regex.test("testHelperFunctionA")).toBe(true);
			expect(regex.test("testFunction")).toBe(false);
		});

		it("特殊文字がエスケープされる", () => {
			const regex = wildcardToRegex("test.value");

			expect(regex.test("test.value")).toBe(true);
			expect(regex.test("testXvalue")).toBe(false); // ドットはリテラル
		});

		it("大文字小文字を区別しない", () => {
			const regex = wildcardToRegex("test");

			expect(regex.test("test")).toBe(true);
			expect(regex.test("TEST")).toBe(true);
			expect(regex.test("Test")).toBe(true);
		});
	});

	describe("symFind（メインエントリーポイント）", () => {
		beforeEach(() => {
			vi.clearAllMocks();
			vi.resetModules();
		});

		it("インデックスが存在する場合、検索が実行される", async () => {
			const input: SymFindInput = {
				name: "test",
			};

			vi.mocked(readSymbolIndex).mockResolvedValue(mockEntries);

			const { symFind } = await import("../../../../../.pi/extensions/search/tools/sym_find.js");
			const result = await symFind(input, "/test/cwd");

			expect(result.results.length).toBeGreaterThan(0);
		});

		it("インデックスが存在しない場合、自動的に生成される", async () => {
			const input: SymFindInput = {
				name: "test",
			};

			// First call returns empty (no index), second call returns entries
			vi.mocked(readSymbolIndex)
				.mockResolvedValueOnce([])
				.mockResolvedValueOnce(mockEntries);

			vi.mocked(symIndex as any).mockResolvedValue({
				total: mockEntries.length,
				truncated: false,
				results: mockEntries,
			});

			const { symFind } = await import("../../../../../.pi/extensions/search/tools/sym_find.js");
			const result = await symFind(input, "/test/cwd");

			expect(symIndex).toHaveBeenCalled();
		});

		it("limitが指定された場合、結果数が制限される", async () => {
			const input: SymFindInput = {
				name: "test",
				limit: 2,
			};

			vi.mocked(readSymbolIndex).mockResolvedValue(mockEntries);

			const { symFind } = await import("../../../../../.pi/extensions/search/tools/sym_find.js");
			const result = await symFind(input, "/test/cwd");

			expect(result.results.length).toBeLessThanOrEqual(2);
		});
	});

	describe("エラーハンドリング", () => {
		it("インデックス生成失敗時にエラーが返される", async () => {
			const input: SymFindInput = {
				name: "test",
			};

			vi.mocked(readSymbolIndex).mockResolvedValue([]);
			vi.mocked(symIndex as any).mockResolvedValue({
				error: "Failed to generate index",
			});

			const { symFind } = await import("@ext/search/tools/sym_find.js");
			const result = await symFind(input, "/test/cwd");

			expect(result.error).toBeDefined();
		});
	});
});
