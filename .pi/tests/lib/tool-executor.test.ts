/**
 * @file .pi/lib/tool-executor.ts の単体テスト
 * @description 融合操作の分解・実行・結果統合を行う実行エンジンのテスト
 * @testFramework vitest
 */

import { describe, it, expect } from "vitest";
import {
	ToolExecutor,
	type ExecutionResult,
} from "../../lib/tool-executor.js";
import type { CompilationResult, FusionConfig } from "../../lib/tool-compiler-types.js";

describe("ToolExecutor", () => {
	describe("正常系", () => {
		it("should create instance with default config", () => {
			const executor = new ToolExecutor();
			expect(executor).toBeDefined();
		});

		it("should create instance with custom config", () => {
			const config: Partial<FusionConfig> = {
				maxParallelism: 5,
				debugMode: true,
			};
			const executor = new ToolExecutor(config);
			expect(executor).toBeDefined();
		});
	});

	describe("execute", () => {
		it("should return error result for failed compilation", async () => {
			const executor = new ToolExecutor();
			const failedCompilation: CompilationResult = {
				success: false,
				fusedOperations: [],
				originalToolCount: 0,
				fusedOperationCount: 0,
				error: "Test compilation error",
			};

			const result = await executor.execute(
				failedCompilation,
				async () => ({ success: true, result: {} })
			);

			expect(result.success).toBe(false);
		});

		it("should return empty result for empty compilation", async () => {
			const executor = new ToolExecutor();
			const emptyCompilation: CompilationResult = {
				success: true,
				fusedOperations: [],
				originalToolCount: 0,
				fusedOperationCount: 0,
			};

			const result = await executor.execute(
				emptyCompilation,
				async () => ({ success: true, result: {} })
			);

			expect(result.success).toBe(true);
		});
	});
});

describe("ExecutionResult", () => {
	describe("正常系", () => {
		it("should have correct structure", () => {
			const result: ExecutionResult = {
				success: true,
				executionId: "exec-1",
				results: new Map(),
				totalDurationMs: 100,
				parallelismUsed: 3,
			};

			expect(result.success).toBe(true);
			expect(result.executionId).toBe("exec-1");
			expect(result.results).toBeInstanceOf(Map);
		});
	});
});
