/**
 * @file semantic_search.ts の単体テスト
 * @description セマンティック検索ツールのテスト
 * @testFramework vitest
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type {
	SemanticSearchInput,
	CodeEmbedding,
} from "@ext/search/types.js";

// モック化
vi.mock("node:fs");
vi.mock("node:path");
vi.mock("@ext/search/utils/constants.js", () => ({
	INDEX_DIR_NAME: ".pi/search",
}));

vi.mock("@lib/embeddings/index.js", () => ({
	generateEmbedding: vi.fn(),
}));

vi.mock("@lib/embeddings/utils.js", () => ({
	cosineSimilarity: vi.fn(),
}));

import { semanticSearch, formatSemanticSearch } from "@ext/search/tools/semantic_search.js";
import { generateEmbedding } from "@lib/embeddings/index.js";
import { cosineSimilarity } from "@lib/embeddings/utils.js";

describe("semantic_search", () => {
	const mockCwd = "/test/project";
	const mockIndexPath = "/test/project/.pi/search/semantic-index.jsonl";

	const mockEmbedding: CodeEmbedding[] = [
		{
			file: "src/utils.ts",
			line: 10,
			code: "function parseJSON(text: string): any { return JSON.parse(text); }",
			embedding: [0.1, 0.2, 0.3],
			metadata: {
				language: "typescript",
				kind: "function",
			},
		},
		{
			file: "src/helpers.ts",
			line: 5,
			code: "function stringifyJSON(obj: any): string { return JSON.stringify(obj); }",
			embedding: [0.2, 0.3, 0.4],
			metadata: {
				language: "typescript",
				kind: "function",
			},
		},
		{
			file: "src/index.py",
			line: 1,
			code: "def parse_json(text: str) -> Any: return json.loads(text)",
			embedding: [0.3, 0.4, 0.5],
			metadata: {
				language: "python",
				kind: "function",
			},
		},
	];

	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(join).mockReturnValue(mockIndexPath);
	});

	describe("基本的な検索", () => {
		it("クエリでセマンティック検索が実行される", async () => {
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFileSync).mockReturnValue(
				mockEmbedding.map((e) => JSON.stringify(e)).join("\n")
			);
			vi.mocked(generateEmbedding).mockResolvedValue([0.1, 0.2, 0.3]);
			vi.mocked(cosineSimilarity).mockReturnValue(0.8);

			const input: SemanticSearchInput = {
				query: "parse JSON data",
			};

			const result = await semanticSearch(input, mockCwd);

			expect(result.results.length).toBeGreaterThan(0);
		});

		it("topKオプションで結果数が制限される", async () => {
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFileSync).mockReturnValue(
				mockEmbedding.map((e) => JSON.stringify(e)).join("\n")
			);
			vi.mocked(generateEmbedding).mockResolvedValue([0.1, 0.2, 0.3]);
			vi.mocked(cosineSimilarity).mockReturnValue(0.8);

			const input: SemanticSearchInput = {
				query: "test",
				topK: 1,
			};

			const result = await semanticSearch(input, mockCwd);

			expect(result.results.length).toBeLessThanOrEqual(1);
		});

		it("thresholdオプションで類似度がフィルタリングされる", async () => {
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFileSync).mockReturnValue(
				mockEmbedding.map((e) => JSON.stringify(e)).join("\n")
			);
			vi.mocked(generateEmbedding).mockResolvedValue([0.1, 0.2, 0.3]);
			vi.mocked(cosineSimilarity).mockImplementation((a, b) => 0.3); // 低い類似度

			const input: SemanticSearchInput = {
				query: "test",
				threshold: 0.5,
			};

			const result = await semanticSearch(input, mockCwd);

			expect(result.results.length).toBe(0);
		});
	});

	describe("言語フィルタリング", () => {
		it("languageオプションで指定言語のみが検索される", async () => {
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFileSync).mockReturnValue(
				mockEmbedding.map((e) => JSON.stringify(e)).join("\n")
			);
			vi.mocked(generateEmbedding).mockResolvedValue([0.1, 0.2, 0.3]);
			vi.mocked(cosineSimilarity).mockReturnValue(0.8);

			const input: SemanticSearchInput = {
				query: "parse",
				language: "typescript",
			};

			const result = await semanticSearch(input, mockCwd);

			result.results.forEach((r) => {
				expect(r.metadata.language.toLowerCase()).toBe("typescript");
			});
		});

		it("大文字小文字を区別せずに言語フィルタが機能する", async () => {
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFileSync).mockReturnValue(
				mockEmbedding.map((e) => JSON.stringify(e)).join("\n")
			);
			vi.mocked(generateEmbedding).mockResolvedValue([0.1, 0.2, 0.3]);
			vi.mocked(cosineSimilarity).mockReturnValue(0.8);

			const input: SemanticSearchInput = {
				query: "parse",
				language: "TypeScript",
			};

			const result = await semanticSearch(input, mockCwd);

			result.results.forEach((r) => {
				expect(r.metadata.language.toLowerCase()).toBe("typescript");
			});
		});
	});

	describe("種類フィルタリング", () => {
		it("kindオプションで指定種類のみが検索される", async () => {
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFileSync).mockReturnValue(
				mockEmbedding.map((e) => JSON.stringify(e)).join("\n")
			);
			vi.mocked(generateEmbedding).mockResolvedValue([0.1, 0.2, 0.3]);
			vi.mocked(cosineSimilarity).mockReturnValue(0.8);

			const input: SemanticSearchInput = {
				query: "parse",
				kind: ["function"],
			};

			const result = await semanticSearch(input, mockCwd);

			result.results.forEach((r) => {
				expect(r.metadata.kind).toBe("function");
			});
		});
	});

	describe("結果の構造", () => {
		it("結果に類似度が含まれる", async () => {
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFileSync).mockReturnValue(
				mockEmbedding.map((e) => JSON.stringify(e)).join("\n")
			);
			vi.mocked(generateEmbedding).mockResolvedValue([0.1, 0.2, 0.3]);
			vi.mocked(cosineSimilarity).mockReturnValue(0.8);

			const input: SemanticSearchInput = {
				query: "test",
			};

			const result = await semanticSearch(input, mockCwd);

			expect(result.results[0].similarity).toBe(0.8);
		});

		it("結果にファイルパスと行番号が含まれる", async () => {
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFileSync).mockReturnValue(
				mockEmbedding.map((e) => JSON.stringify(e)).join("\n")
			);
			vi.mocked(generateEmbedding).mockResolvedValue([0.1, 0.2, 0.3]);
			vi.mocked(cosineSimilarity).mockReturnValue(0.8);

			const input: SemanticSearchInput = {
				query: "test",
			};

			const result = await semanticSearch(input, mockCwd);

			expect(result.results[0].file).toBeDefined();
			expect(result.results[0].line).toBeDefined();
		});

		it("結果にコードが含まれる", async () => {
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFileSync).mockReturnValue(
				mockEmbedding.map((e) => JSON.stringify(e)).join("\n")
			);
			vi.mocked(generateEmbedding).mockResolvedValue([0.1, 0.2, 0.3]);
			vi.mocked(cosineSimilarity).mockReturnValue(0.8);

			const input: SemanticSearchInput = {
				query: "test",
			};

			const result = await semanticSearch(input, mockCwd);

			expect(result.results[0].code).toBeDefined();
		});

		it("類似度の降順で結果が返される", async () => {
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFileSync).mockReturnValue(
				mockEmbedding.map((e) => JSON.stringify(e)).join("\n")
			);
			vi.mocked(generateEmbedding).mockResolvedValue([0.1, 0.2, 0.3]);
			vi.mocked(cosineSimilarity)
				.mockReturnValueOnce(0.9)
				.mockReturnValueOnce(0.7)
				.mockReturnValueOnce(0.8);

			const input: SemanticSearchInput = {
				query: "test",
			};

			const result = await semanticSearch(input, mockCwd);

			expect(result.results[0].similarity).toBeGreaterThan(result.results[1].similarity);
		});
	});

	describe("エラーハンドリング", () => {
		it("空のクエリでエラーが返される", async () => {
			const input: SemanticSearchInput = {
				query: "",
			};

			const result = await semanticSearch(input, mockCwd);

			expect(result.error).toBeDefined();
			expect(result.error).toContain("Query is required");
		});

		it("インデックスが存在しない場合、エラーが返される", async () => {
			vi.mocked(existsSync).mockReturnValue(false);

			const input: SemanticSearchInput = {
				query: "test",
			};

			const result = await semanticSearch(input, mockCwd);

			expect(result.error).toBeDefined();
			expect(result.error).toContain("No semantic index found");
		});

		it("埋め込み生成失敗時にエラーが返される", async () => {
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFileSync).mockReturnValue(
				mockEmbedding.map((e) => JSON.stringify(e)).join("\n")
			);
			vi.mocked(generateEmbedding).mockResolvedValue(null);

			const input: SemanticSearchInput = {
				query: "test",
			};

			const result = await semanticSearch(input, mockCwd);

			expect(result.error).toBeDefined();
			expect(result.error).toContain("Failed to generate embedding");
		});
	});

	describe("formatSemanticSearch", () => {
		it("エラー結果が正しくフォーマットされる", () => {
			const result = {
				total: 0,
				truncated: false,
				results: [],
				error: "Test error",
			};

			const formatted = formatSemanticSearch(result);

			expect(formatted).toContain("Error: Test error");
		});

		it("空の結果が正しくフォーマットされる", () => {
			const result = {
				total: 0,
				truncated: false,
				results: [],
			};

			const formatted = formatSemanticSearch(result);

			expect(formatted).toContain("No results found");
		});

		it("成功した結果が正しくフォーマットされる", () => {
			const result = {
				total: 2,
				truncated: false,
				results: [
					{
						file: "test.ts",
						line: 10,
						code: "function test() {}",
						similarity: 0.85,
						metadata: { language: "typescript" },
					},
					{
						file: "test2.ts",
						line: 20,
						code: "function test2() {}",
						similarity: 0.75,
						metadata: { language: "typescript" },
					},
				],
			};

			const formatted = formatSemanticSearch(result);

			expect(formatted).toContain("Found 2 results");
			expect(formatted).toContain("85.0%");
			expect(formatted).toContain("test.ts:10");
		});

		it("切り詰められた結果が正しくフォーマットされる", () => {
			const result = {
				total: 10,
				truncated: true,
				results: [
					{
						file: "test.ts",
						line: 10,
						code: "function test() {}",
						similarity: 0.85,
						metadata: { language: "typescript" },
					},
				],
			};

			const formatted = formatSemanticSearch(result);

			expect(formatted).toContain("(truncated)");
		});

		it("長いコードが省略される", () => {
			const longCode = Array.from({ length: 10 }, (_, i) => `line ${i}`).join("\n");
			const result = {
				total: 1,
				truncated: false,
				results: [
					{
						file: "test.ts",
						line: 10,
						code: longCode,
						similarity: 0.85,
						metadata: { language: "typescript" },
					},
				],
			};

			const formatted = formatSemanticSearch(result);

			expect(formatted).toContain("...");
		});
	});

	describe("デフォルト値", () => {
		it("topKが指定されない場合、デフォルト値が使用される", async () => {
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFileSync).mockReturnValue(
				mockEmbedding.map((e) => JSON.stringify(e)).join("\n")
			);
			vi.mocked(generateEmbedding).mockResolvedValue([0.1, 0.2, 0.3]);
			vi.mocked(cosineSimilarity).mockReturnValue(0.8);

			const input: SemanticSearchInput = {
				query: "test",
			};

			const result = await semanticSearch(input, mockCwd);

			// デフォルトのtopK (10)
			expect(result.results.length).toBeLessThanOrEqual(10);
		});

		it("thresholdが指定されない場合、デフォルト値が使用される", async () => {
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFileSync).mockReturnValue(
				mockEmbedding.map((e) => JSON.stringify(e)).join("\n")
			);
			vi.mocked(generateEmbedding).mockResolvedValue([0.1, 0.2, 0.3]);
			vi.mocked(cosineSimilarity).mockReturnValue(0.8);

			const input: SemanticSearchInput = {
				query: "test",
			};

			const result = await semanticSearch(input, mockCwd);

			// デフォルトのthreshold (0.5)
			expect(result.results.length).toBeGreaterThan(0);
		});
	});
});
