/**
 * @file .pi/lib/dag-generator.ts の単体テスト
 * @description Task-to-DAG conversion のテスト
 * @testFramework vitest
 */

import { describe, it, expect } from "vitest";
import {
	DagGenerationError,
	type DagGenerationOptions,
} from "../../lib/dag-generator.js";

describe("DagGenerationError", () => {
	describe("正常系", () => {
		it("should construct with message and code", () => {
			const error = new DagGenerationError("Generation failed", "TIMEOUT");

			expect(error.message).toBe("Generation failed");
			expect(error.code).toBe("TIMEOUT");
			expect(error.name).toBe("DagGenerationError");
			expect(error).toBeInstanceOf(Error);
		});

		it("should construct with cause", () => {
			const cause = new Error("Original error");
			const error = new DagGenerationError("Wrapped error", "PARSE_ERROR", cause);

			expect(error.cause).toBe(cause);
		});
	});
});

describe("DagGenerationOptions", () => {
	describe("正常系", () => {
		it("should accept empty options", () => {
			const options: DagGenerationOptions = {};

			expect(options.maxDepth).toBeUndefined();
			expect(options.maxTasks).toBeUndefined();
		});

		it("should accept all options", () => {
			const options: DagGenerationOptions = {
				maxDepth: 5,
				maxTasks: 15,
				defaultAgent: "implementer",
				contextFiles: ["src/main.ts"],
				timeoutMs: 10000,
			};

			expect(options.maxDepth).toBe(5);
			expect(options.maxTasks).toBe(15);
			expect(options.defaultAgent).toBe("implementer");
			expect(options.contextFiles).toHaveLength(1);
			expect(options.timeoutMs).toBe(10000);
		});
	});

	describe("境界条件", () => {
		it("should accept zero values", () => {
			const options: DagGenerationOptions = {
				maxDepth: 0,
				maxTasks: 0,
				timeoutMs: 0,
			};

			expect(options.maxDepth).toBe(0);
			expect(options.maxTasks).toBe(0);
		});
	});
});
