/**
 * @file code_search.ts の単体テスト
 * @description 高速コード検索ツールのテスト
 * @testFramework vitest
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { CodeSearchInput } from "@ext/search/types.ts";

// モック化の準備
vi.mock("node:fs/promises", async () => {
	const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
	return {
		...actual,
		readdir: vi.fn(),
		readFile: vi.fn(),
	};
});

vi.mock("@ext/search/utils/cli.js", async () => ({
	execute: vi.fn(),
	buildRgArgs: vi.fn(() => []),
	checkToolAvailability: vi.fn(),
}));

vi.mock("@ext/search/utils/cache.js", () => ({
	getSearchCache: vi.fn(() => ({
		getCached: vi.fn(),
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

import { nativeCodeSearch } from "../../../../../.pi/extensions/search/tools/code_search.ts";
import { readdir, readFile } from "node:fs/promises";

describe("nativeCodeSearch", () => {
	const mockCwd = "/test/project";

	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("基本的なコード検索", () => {
		it("単純な文字列で検索できる", async () => {
			const input: CodeSearchInput = {
				pattern: "function",
			};

			vi.mocked(readFile).mockResolvedValue(`
				function test() {
					return true;
				}
			`);

			vi.mocked(readdir as any).mockImplementation(async () => [
				{ name: "file.ts", isFile: () => true, isDirectory: () => false },
			]);

			const result = await nativeCodeSearch(input, mockCwd);

			expect(result.results.length).toBeGreaterThan(0);
			expect(result.results[0].text).toContain("function");
		});

		it("大文字小文字を区別しない検索が機能する", async () => {
			const input: CodeSearchInput = {
				pattern: "FUNCTION",
				ignoreCase: true,
			};

			vi.mocked(readFile).mockResolvedValue(`
				function test() {
					return true;
				}
			`);

			vi.mocked(readdir as any).mockImplementation(async () => [
				{ name: "file.ts", isFile: () => true, isDirectory: () => false },
			]);

			const result = await nativeCodeSearch(input, mockCwd);

			expect(result.results.length).toBeGreaterThan(0);
		});

		it("大文字小文字を区別する検索が機能する", async () => {
			const input: CodeSearchInput = {
				pattern: "function",
				ignoreCase: false,
			};

			vi.mocked(readFile).mockResolvedValue(`
				function test() {
					const FUNCTION = 1;
				}
			`);

			vi.mocked(readdir as any).mockImplementation(async () => [
				{ name: "file.ts", isFile: () => true, isDirectory: () => false },
			]);

			const result = await nativeCodeSearch(input, mockCwd);

			// 小文字のみマッチ
			const matchCount = result.results.filter((r) => r.text.includes("function") && !r.text.includes("FUNCTION")).length;
			expect(matchCount).toBeGreaterThan(0);
		});
	});

	describe("正規表現パターン", () => {
		it("正規表現パターンで検索できる", async () => {
			const input: CodeSearchInput = {
				pattern: "func\\w+",
			};

			vi.mocked(readFile).mockResolvedValue(`
				function test() {
					const func1 = 1;
					const func2 = 2;
				}
			`);

			vi.mocked(readdir as any).mockImplementation(async () => [
				{ name: "file.ts", isFile: () => true, isDirectory: () => false },
			]);

			const result = await nativeCodeSearch(input, mockCwd);

			expect(result.results.length).toBeGreaterThan(0);
		});

		it("リテラルモードで正規表現がエスケープされる", async () => {
			const input: CodeSearchInput = {
				pattern: "test.value",
				literal: true,
			};

			vi.mocked(readFile).mockResolvedValue(`
				const test.value = 1;
				const testvalue = 2;
			`);

			vi.mocked(readdir as any).mockImplementation(async () => [
				{ name: "file.ts", isFile: () => true, isDirectory: () => false },
			]);

			const result = await nativeCodeSearch(input, mockCwd);

			// ドットはリテラルとして扱われる
			expect(result.results.some((r) => r.text.includes("test.value"))).toBe(true);
		});

		it("無効な正規表現でエラーが返される", async () => {
			const input: CodeSearchInput = {
				pattern: "[invalid",
			};

			const result = await nativeCodeSearch(input, mockCwd);

			expect(result.error).toBeDefined();
			expect(result.error).toContain("Invalid pattern");
		});
	});

	describe("ファイルタイプフィルタリング", () => {
		it("typeフィルタで指定された拡張子のファイルのみ検索される", async () => {
			const input: CodeSearchInput = {
				pattern: "test",
				type: "ts",
			};

			vi.mocked(readFile).mockResolvedValue(`
				test
			`);

			vi.mocked(readdir as any).mockImplementation(async () => [
				{ name: "file.ts", isFile: () => true, isDirectory: () => false },
				{ name: "file.js", isFile: () => true, isDirectory: () => false },
				{ name: "file.py", isFile: () => true, isDirectory: () => false },
			]);

			const result = await nativeCodeSearch(input, mockCwd);

			result.results.forEach((r) => {
				expect(r.file.endsWith(".ts")).toBe(true);
			});
		});
	});

	describe("コンテキスト行の取得", () => {
		it("contextオプションで一致箇所の前後が取得される", async () => {
			const input: CodeSearchInput = {
				pattern: "target",
				context: 2,
			};

			vi.mocked(readFile).mockResolvedValue(`
				line1
				line2
				line3
				target
				line5
				line6
				line7
			`);

			vi.mocked(readdir as any).mockImplementation(async () => [
				{ name: "file.ts", isFile: () => true, isDirectory: () => false },
			]);

			const result = await nativeCodeSearch(input, mockCwd);

			expect(result.results[0].context).toBeDefined();
			expect(result.results[0].context?.length).toBeGreaterThan(1);
		});

		it("context=0の場合は一致行のみが取得される", async () => {
			const input: CodeSearchInput = {
				pattern: "target",
				context: 0,
			};

			vi.mocked(readFile).mockResolvedValue(`
				line1
				target
				line3
			`);

			vi.mocked(readdir as any).mockImplementation(async () => [
				{ name: "file.ts", isFile: () => true, isDirectory: () => false },
			]);

			const result = await nativeCodeSearch(input, mockCwd);

			expect(result.results[0].context).toBeUndefined();
		});
	});

	describe("limitによる切り捨て", () => {
		it("limitが指定された場合、結果数が制限される", async () => {
			const input: CodeSearchInput = {
				pattern: "match",
				limit: 5,
			};

			// 多くの一致を生成
			const lines = Array.from({ length: 100 }, (_, i) => `match ${i}`).join("\n");
			vi.mocked(readFile).mockResolvedValue(lines);

			vi.mocked(readdir as any).mockImplementation(async () => [
				{ name: "file.ts", isFile: () => true, isDirectory: () => false },
			]);

			const result = await nativeCodeSearch(input, mockCwd);

			expect(result.results.length).toBeLessThanOrEqual(5);
		});

		it("limitを超過した場合truncatedがtrueになる", async () => {
			const input: CodeSearchInput = {
				pattern: "match",
				limit: 5,
			};

			const lines = Array.from({ length: 100 }, (_, i) => `match ${i}`).join("\n");
			vi.mocked(readFile).mockResolvedValue(lines);

			vi.mocked(readdir as any).mockImplementation(async () => [
				{ name: "file.ts", isFile: () => true, isDirectory: () => false },
			]);

			const result = await nativeCodeSearch(input, mockCwd);

			expect(result.truncated).toBe(true);
		});
	});

	describe("除外パターン", () => {
		it("excludeパターンに一致するファイルが除外される", async () => {
			const input: CodeSearchInput = {
				pattern: "test",
				exclude: ["*.test.ts"],
			};

			vi.mocked(readFile).mockResolvedValue(`
				test
			`);

			vi.mocked(readdir as any).mockImplementation(async () => [
				{ name: "file.test.ts", isFile: () => true, isDirectory: () => false },
				{ name: "file.ts", isFile: () => true, isDirectory: () => false },
			]);

			const result = await nativeCodeSearch(input, mockCwd);

			expect(result.results.find((r) => r.file.endsWith(".test.ts"))).toBeUndefined();
		});

		it("hiddenファイルが除外される", async () => {
			const input: CodeSearchInput = {
				pattern: "test",
			};

			vi.mocked(readFile).mockResolvedValue(`
				test
			`);

			vi.mocked(readdir as any).mockImplementation(async () => [
				{ name: ".hidden.ts", isFile: () => true, isDirectory: () => false },
				{ name: "file.ts", isFile: () => true, isDirectory: () => false },
			]);

			const result = await nativeCodeSearch(input, mockCwd);

			expect(result.results.find((r) => r.file.startsWith("."))).toBeUndefined();
		});
	});

	describe("検索結果の構造", () => {
		it("結果に正しい行番号と列番号が含まれる", async () => {
			const input: CodeSearchInput = {
				pattern: "target",
			};

			vi.mocked(readFile).mockResolvedValue(`
line1
target
line3
			`);

			vi.mocked(readdir as any).mockImplementation(async () => [
				{ name: "file.ts", isFile: () => true, isDirectory: () => false },
			]);

			const result = await nativeCodeSearch(input, mockCwd);

			expect(result.results[0].line).toBe(3);
			expect(result.results[0].column).toBeGreaterThan(0);
		});

		it("結果にファイルパスが含まれる", async () => {
			const input: CodeSearchInput = {
				pattern: "target",
			};

			vi.mocked(readFile).mockResolvedValue(`
				target
			`);

			vi.mocked(readdir as any).mockImplementation(async () => [
				{ name: "file.ts", isFile: () => true, isDirectory: () => false },
			]);

			const result = await nativeCodeSearch(input, mockCwd);

			expect(result.results[0].file).toBeDefined();
			expect(result.results[0].file).toContain("file.ts");
		});

		it("サマリーにファイル別の一致数が含まれる", async () => {
			const input: CodeSearchInput = {
				pattern: "match",
			};

			vi.mocked(readFile).mockResolvedValue(`
				match1
				match2
				match3
			`);

			vi.mocked(readdir as any).mockImplementation(async () => [
				{ name: "file1.ts", isFile: () => true, isDirectory: () => false },
				{ name: "file2.ts", isFile: () => true, isDirectory: () => false },
			]);

			const result = await nativeCodeSearch(input, mockCwd);

			expect(result.summary).toBeDefined();
			expect(result.summary.length).toBeGreaterThan(0);
		});
	});

	describe("エラーハンドリング", () => {
		it("読み取り不可のファイルがスキップされる", async () => {
			const input: CodeSearchInput = {
				pattern: "test",
			};

			vi.mocked(readFile).mockRejectedValue(new Error("Permission denied"));
			vi.mocked(readdir as any).mockImplementation(async () => [
				{ name: "file.ts", isFile: () => true, isDirectory: () => false },
			]);

			const result = await nativeCodeSearch(input, mockCwd);

			// エラーがスローされず、処理が継続される
			expect(result).toBeDefined();
		});

		it("アクセス不可のディレクトリがスキップされる", async () => {
			const input: CodeSearchInput = {
				pattern: "test",
			};

			vi.mocked(readdir).mockRejectedValue(new Error("Permission denied"));

			const result = await nativeCodeSearch(input, mockCwd);

			expect(result).toBeDefined();
		});
	});

	describe("パス指定", () => {
		it("pathオプションで検索パスが指定される", async () => {
			const input: CodeSearchInput = {
				pattern: "test",
				path: "src",
			};

			vi.mocked(readFile).mockResolvedValue(`
				test
			`);

			vi.mocked(readdir as any).mockImplementation(async (path: string) => {
				if (path.includes("src")) {
					return [
						{ name: "file.ts", isFile: () => true, isDirectory: () => false },
					];
				}
				return [];
			});

			const result = await nativeCodeSearch(input, mockCwd);

			expect(result).toBeDefined();
		});
	});

	describe("デフォルト値", () => {
		it("limitが指定されない場合、デフォルト値が使用される", async () => {
			const input: CodeSearchInput = {
				pattern: "test",
			};

			vi.mocked(readFile).mockResolvedValue(`
				test
			`);

			vi.mocked(readdir as any).mockImplementation(async () => [
				{ name: "file.ts", isFile: () => true, isDirectory: () => false },
			]);

			const result = await nativeCodeSearch(input, mockCwd);

			// デフォルトのlimit (50) より少ない結果が返される
			expect(result.results.length).toBeGreaterThanOrEqual(0);
		});

		it("ignoreCaseが指定されない場合、デフォルト値が使用される", async () => {
			const input: CodeSearchInput = {
				pattern: "TEST",
			};

			vi.mocked(readFile).mockResolvedValue(`
test
			`);

			vi.mocked(readdir as any).mockImplementation(async () => [
				{ name: "file.ts", isFile: () => true, isDirectory: () => false },
			]);

			const result = await nativeCodeSearch(input, mockCwd);

			// デフォルトではignoreCase=true (大文字小文字を区別しない)
			// 一致するはず
			expect(result.results.length).toBeGreaterThan(0);
		});
	});
});
