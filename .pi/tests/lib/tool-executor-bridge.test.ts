/**
 * @file .pi/lib/tool-executor-bridge.ts の単体テスト
 * @description tool-compilerとsubagent実行のブリッジモジュールのテスト
 * @testFramework vitest
 */

import { describe, it, expect } from "vitest";
import {
	type ToolExecutorTaskPayload,
	type SerializedFusedOperation,
	type ToolExecutorResult,
	serializeCompilation,
} from "../../lib/tool-executor-bridge.js";
import type { CompilationResult } from "../../lib/tool-compiler-types.js";

describe("ToolExecutorTaskPayload", () => {
	describe("正常系", () => {
		it("should have correct structure", () => {
			const payload: ToolExecutorTaskPayload = {
				type: "tool-executor-bridge",
				compilationId: "comp-1",
				fusedOperations: [],
			};

			expect(payload.type).toBe("tool-executor-bridge");
			expect(payload.compilationId).toBe("comp-1");
			expect(payload.fusedOperations).toEqual([]);
		});
	});
});

describe("SerializedFusedOperation", () => {
	describe("正常系", () => {
		it("should have correct structure", () => {
			const operation: SerializedFusedOperation = {
				fusedId: "fused-1",
				toolCalls: [
					{ id: "tool-1", name: "read", arguments: { path: "/test" } },
				],
				dependsOnFusedIds: [],
				canExecuteInParallel: true,
				executionStrategy: "parallel",
			};

			expect(operation.fusedId).toBe("fused-1");
			expect(operation.toolCalls).toHaveLength(1);
			expect(operation.executionStrategy).toBe("parallel");
		});
	});
});

describe("ToolExecutorResult", () => {
	describe("正常系", () => {
		it("should have correct structure for success", () => {
			const result: ToolExecutorResult = {
				compilationId: "comp-1",
				success: true,
				toolResults: {
					"tool-1": {
						toolId: "tool-1",
						toolName: "read",
						success: true,
						result: { content: "test" },
						executionTimeMs: 100,
					},
				},
			};

			expect(result.success).toBe(true);
			expect(result.toolResults["tool-1"]).toBeDefined();
		});

		it("should have correct structure for failure", () => {
			const result: ToolExecutorResult = {
				compilationId: "comp-2",
				success: false,
				toolResults: {},
				errorSummary: "Execution failed",
			};

			expect(result.success).toBe(false);
			expect(result.errorSummary).toBe("Execution failed");
		});
	});
});

describe("serializeCompilation", () => {
	describe("正常系", () => {
		it("should serialize compilation result", () => {
			const compilation: CompilationResult = {
				success: true,
				compilationId: "comp-3",
				fusedOperations: [],
				originalToolCount: 0,
				fusedOperationCount: 0,
			};

			const payload = serializeCompilation(compilation);

			expect(payload.type).toBe("tool-executor-bridge");
			expect(payload.compilationId).toBe("comp-3");
			expect(payload.fusedOperations).toEqual([]);
		});
	});
});
