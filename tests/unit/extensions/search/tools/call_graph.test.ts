/**
 * @file call_graph.ts の単体テスト
 * @description 呼び出しグラフトールのテスト
 * @testFramework vitest
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type {
	CallGraphIndexInput,
	FindCallersInput,
	FindCalleesInput,
	CallGraphIndex,
} from "@ext/search/call-graph/types.js";

// モック化
vi.mock("@ext/search/call-graph/builder.js", () => ({
	buildCallGraph: vi.fn(),
	saveCallGraphIndex: vi.fn(),
	readCallGraphIndex: vi.fn(),
	isCallGraphIndexStale: vi.fn(),
}));

vi.mock("@ext/search/call-graph/query.js", () => ({
	findCallers: vi.fn(),
	findCallees: vi.fn(),
}));

// sym_index.tsをモック（必要な関数のみ）
vi.mock("@ext/search/tools/sym_index.js", () => ({
	symIndex: vi.fn(),
	readSymbolIndex: vi.fn(),
}));

import {
	callGraphIndex,
	findCallersTool,
	findCalleesTool,
} from "@ext/search/tools/call_graph.js";
import {
	buildCallGraph,
	saveCallGraphIndex,
	readCallGraphIndex,
	isCallGraphIndexStale,
} from "@ext/search/call-graph/builder.js";
import { findCallers, findCallees } from "@ext/search/call-graph/query.js";
import { symIndex, readSymbolIndex } from "@ext/search/tools/sym_index.js";

describe("call_graph tools", () => {
	const mockCwd = "/test/project";

	const mockIndex: CallGraphIndex = {
		version: 1,
		metadata: {
			nodeCount: 10,
			edgeCount: 20,
			timestamp: Date.now(),
			sourceFiles: ["file1.ts", "file2.ts"],
		},
		nodes: [
			{
				id: "node1",
				name: "function1",
				kind: "function",
				file: "file1.ts",
				line: 10,
			},
		],
		edges: [
			{
				from: "node1",
				to: "node2",
				type: "call",
			},
		],
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("callGraphIndex", () => {
		it("シンボルインデックスが存在しない場合、自動生成される", async () => {
			const input: CallGraphIndexInput = {
				force: false,
			};

			// readSymbolIndexを呼び出し回数に応じて異なる値を返すように設定
			vi.mocked(readSymbolIndex)
				.mockResolvedValueOnce([])  // 1回目: 空配列（symIndexを呼び出す）
				.mockResolvedValueOnce([{}]);  // 2回目: 空でない配列

			vi.mocked(symIndex as any).mockResolvedValue({
				indexed: 5,
				outputPath: ".pi/search/symbols.jsonl",
			});
			vi.mocked(isCallGraphIndexStale).mockResolvedValue(true);
			vi.mocked(readCallGraphIndex).mockResolvedValue(null);
			vi.mocked(buildCallGraph).mockResolvedValue(mockIndex);
			vi.mocked(saveCallGraphIndex).mockResolvedValue(".pi/search/call-graph/index.json");

			const result = await callGraphIndex(input, mockCwd);

			expect(symIndex).toHaveBeenCalled();
			expect(buildCallGraph).toHaveBeenCalled();
		});

		it("force=trueの場合、再構築が実行される", async () => {
			const input: CallGraphIndexInput = {
				force: true,
			};

			vi.mocked(readSymbolIndex).mockResolvedValue([{}]);
			vi.mocked(isCallGraphIndexStale).mockResolvedValue(false);
			vi.mocked(readCallGraphIndex).mockResolvedValue(mockIndex);
			vi.mocked(buildCallGraph).mockResolvedValue(mockIndex);
			vi.mocked(saveCallGraphIndex).mockResolvedValue(undefined);

			const result = await callGraphIndex(input, mockCwd);

			expect(buildCallGraph).toHaveBeenCalled();
			expect(saveCallGraphIndex).toHaveBeenCalled();
		});

		it("インデックスが最新の場合、既存のインデックスが返される", async () => {
			const input: CallGraphIndexInput = {
				force: false,
			};

			vi.mocked(readSymbolIndex).mockResolvedValue([{}]);
			vi.mocked(isCallGraphIndexStale).mockResolvedValue(false);
			vi.mocked(readCallGraphIndex).mockResolvedValue(mockIndex);

			const result = await callGraphIndex(input, mockCwd);

			expect(buildCallGraph).not.toHaveBeenCalled();
			expect(result.nodeCount).toBe(mockIndex.metadata.nodeCount);
			expect(result.edgeCount).toBe(mockIndex.metadata.edgeCount);
		});

		it("シンボルが見つからない場合、エラーが返される", async () => {
			const input: CallGraphIndexInput = {
				force: false,
			};

			vi.mocked(readSymbolIndex).mockResolvedValue([]);
			vi.mocked(symIndex as any).mockResolvedValue({
				indexed: 0,
				outputPath: ".pi/search/symbols.jsonl",
			});
			vi.mocked(readSymbolIndex).mockResolvedValue([]);

			const result = await callGraphIndex(input, mockCwd);

			expect(result.error).toBeDefined();
			expect(result.error).toContain("No symbols found");
		});

		it("pathオプションで検索パスが指定される", async () => {
			const input: CallGraphIndexInput = {
				path: "src",
				force: false,
			};

			vi.mocked(readSymbolIndex).mockResolvedValue([{}]);
			vi.mocked(isCallGraphIndexStale).mockResolvedValue(true);
			vi.mocked(readCallGraphIndex).mockResolvedValue(null);
			vi.mocked(buildCallGraph).mockResolvedValue(mockIndex);
			vi.mocked(saveCallGraphIndex).mockResolvedValue(".pi/search/call-graph/index.json");

			const result = await callGraphIndex(input, mockCwd);

			expect(buildCallGraph).toHaveBeenCalledWith(expect.anything(), mockCwd);
		});
	});

	describe("findCallersTool", () => {
		it("指定シンボルの呼び出し元が返される", async () => {
			const input: FindCallersInput = {
				symbolName: "testFunction",
			};

			const mockCallers = [
				{
					node: {
						name: "caller1",
						file: "caller1.ts",
						line: 10,
						kind: "function",
					},
					depth: 0,
					confidence: 1.0,
				},
			];

			vi.mocked(readCallGraphIndex).mockResolvedValue(mockIndex);
			vi.mocked(isCallGraphIndexStale).mockResolvedValue(false);
			vi.mocked(findCallers).mockReturnValue(mockCallers);

			const result = await findCallersTool(input, mockCwd);

			expect(findCallers).toHaveBeenCalled();
			expect(result.results).toEqual(mockCallers);
		});

		it("depthオプションで間接的な呼び出し元も検索される", async () => {
			const input: FindCallersInput = {
				symbolName: "testFunction",
				depth: 2,
			};

			const mockCallers = [
				{
					node: { name: "caller1", file: "caller1.ts", line: 10, kind: "function" },
					depth: 0,
					confidence: 1.0,
				},
				{
					node: { name: "caller2", file: "caller2.ts", line: 5, kind: "function" },
					depth: 1,
					confidence: 1.0,
				},
			];

			vi.mocked(readCallGraphIndex).mockResolvedValue(mockIndex);
			vi.mocked(isCallGraphIndexStale).mockResolvedValue(false);
			vi.mocked(findCallers).mockReturnValue(mockCallers);

			const result = await findCallersTool(input, mockCwd);

			expect(findCallers).toHaveBeenCalledWith(expect.anything(), "testFunction", 2, 50);
		});

		it("limitオプションで結果数が制限される", async () => {
			const input: FindCallersInput = {
				symbolName: "testFunction",
				limit: 5,
			};

			const allMockCallers = Array.from({ length: 100 }, (_, i) => ({
				node: {
					name: `caller${i}`,
					file: `caller${i}.ts`,
					line: i,
					kind: "function",
				},
				depth: 0,
				confidence: 1.0,
			}));

			// findCallersを実際にlimitを適用するようにモック
			vi.mocked(readCallGraphIndex).mockResolvedValue(mockIndex);
			vi.mocked(isCallGraphIndexStale).mockResolvedValue(false);
			vi.mocked(findCallers).mockImplementation((index, name, depth, limit) => {
				return allMockCallers.slice(0, limit || allMockCallers.length);
			});

			const result = await findCallersTool(input, mockCwd);

			expect(result.results.length).toBe(5);
		});
	});

	describe("findCalleesTool", () => {
		it("指定シンボルの呼び出し先が返される", async () => {
			const input: FindCalleesInput = {
				symbolName: "testFunction",
			};

			const mockCallees = [
				{
					node: {
						name: "callee1",
						file: "callee1.ts",
						line: 10,
						kind: "function",
					},
					depth: 0,
					confidence: 1.0,
				},
			];

			vi.mocked(readCallGraphIndex).mockResolvedValue(mockIndex);
			vi.mocked(isCallGraphIndexStale).mockResolvedValue(false);
			vi.mocked(findCallees).mockReturnValue(mockCallees);

			const result = await findCalleesTool(input, mockCwd);

			expect(findCallees).toHaveBeenCalled();
			expect(result.results).toEqual(mockCallees);
		});

		it("depthオプションで間接的な呼び出し先も検索される", async () => {
			const input: FindCalleesInput = {
				symbolName: "testFunction",
				depth: 2,
			};

			const mockCallees = [
				{
					node: { name: "callee1", file: "callee1.ts", line: 10, kind: "function" },
					depth: 0,
					confidence: 1.0,
				},
				{
					node: { name: "callee2", file: "callee2.ts", line: 5, kind: "function" },
					depth: 1,
					confidence: 1.0,
				},
			];

			vi.mocked(readCallGraphIndex).mockResolvedValue(mockIndex);
			vi.mocked(isCallGraphIndexStale).mockResolvedValue(false);
			vi.mocked(findCallees).mockReturnValue(mockCallees);

			const result = await findCalleesTool(input, mockCwd);

			expect(findCallees).toHaveBeenCalledWith(expect.anything(), "testFunction", 2, 50);
		});

		it("limitオプションで結果数が制限される", async () => {
			const input: FindCalleesInput = {
				symbolName: "testFunction",
				limit: 5,
			};

			const allMockCallees = Array.from({ length: 100 }, (_, i) => ({
				node: {
					name: `callee${i}`,
					file: `callee${i}.ts`,
					line: i,
					kind: "function",
				},
				depth: 0,
				confidence: 1.0,
			}));

			// findCalleesを実際にlimitを適用するようにモック
			vi.mocked(readCallGraphIndex).mockResolvedValue(mockIndex);
			vi.mocked(isCallGraphIndexStale).mockResolvedValue(false);
			vi.mocked(findCallees).mockImplementation((index, name, depth, limit) => {
				return allMockCallees.slice(0, limit || allMockCallees.length);
			});

			const result = await findCalleesTool(input, mockCwd);

			expect(result.results.length).toBe(5);
		});
	});

	describe("エラーハンドリング", () => {
		it("シンボルインデックス読み取りエラーが処理される", async () => {
			const input: CallGraphIndexInput = {
				force: false,
			};

			vi.mocked(readSymbolIndex).mockRejectedValue(new Error("Read error"));

			const result = await callGraphIndex(input, mockCwd);

			expect(result.error).toBeDefined();
		});

		it("呼び出しグラフ構築エラーが処理される", async () => {
			const input: CallGraphIndexInput = {
				force: true,
			};

			vi.mocked(readSymbolIndex).mockResolvedValue([{}]);
			vi.mocked(isCallGraphIndexStale).mockResolvedValue(true);
			vi.mocked(readCallGraphIndex).mockResolvedValue(null);
			vi.mocked(buildCallGraph).mockRejectedValue(new Error("Build error"));

			const result = await callGraphIndex(input, mockCwd);

			expect(result.error).toBeDefined();
		});
	});
});
