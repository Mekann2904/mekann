/**
 * @file .pi/lib/dag-errors.ts の単体テスト
 * @description DAG実行に関連するエラー型定義のテスト
 * @testFramework vitest
 */

import { describe, it, expect } from "vitest";
import {
	DagExecutionError,
	TaskValidationError,
	type DagErrorCode,
} from "../../lib/dag-errors.js";

describe("DagExecutionError", () => {
	describe("正常系", () => {
		it("should construct with message and code", () => {
			const error = new DagExecutionError(
				"Cycle detected in DAG",
				"CYCLE_DETECTED"
			);

			expect(error.message).toBe("Cycle detected in DAG");
			expect(error.code).toBe("CYCLE_DETECTED");
			expect(error.name).toBe("DagExecutionError");
			expect(error).toBeInstanceOf(Error);
		});

		it("should construct with taskId", () => {
			const error = new DagExecutionError(
				"Task failed",
				"TASK_FAILED",
				"task-1"
			);

			expect(error.taskId).toBe("task-1");
		});

		it("should format toString correctly", () => {
			const error1 = new DagExecutionError("Test", "VALIDATION_FAILED");
			expect(error1.toString()).toBe("DagExecutionError[VALIDATION_FAILED]: Test");

			const error2 = new DagExecutionError("Test", "TASK_FAILED", "task-2");
			expect(error2.toString()).toBe("DagExecutionError[TASK_FAILED] (task: task-2): Test");
		});

		it("should serialize to JSON correctly", () => {
			const error = new DagExecutionError(
				"Test error",
				"ABORTED",
				"task-3"
			);

			const json = error.toJSON();

			expect(json.name).toBe("DagExecutionError");
			expect(json.code).toBe("ABORTED");
			expect(json.message).toBe("Test error");
			expect(json.taskId).toBe("task-3");
		});
	});

	describe("境界条件", () => {
		it("should accept all DagErrorCode values", () => {
			const codes: DagErrorCode[] = [
				"CYCLE_DETECTED",
				"VALIDATION_FAILED",
				"TASK_FAILED",
				"ABORTED",
				"MISSING_DEPENDENCY",
				"DUPLICATE_TASK_ID",
			];

			for (const code of codes) {
				const error = new DagExecutionError("Test", code);
				expect(error.code).toBe(code);
			}
		});

		it("should work without taskId", () => {
			const error = new DagExecutionError("No task ID", "VALIDATION_FAILED");

			expect(error.taskId).toBeUndefined();
		});
	});
});

describe("TaskValidationError", () => {
	describe("正常系", () => {
		it("should construct with taskId and reason", () => {
			const error = new TaskValidationError(
				"task-1",
				"Invalid dependencies"
			);

			expect(error.taskId).toBe("task-1");
			expect(error.reason).toBe("Invalid dependencies");
			expect(error.name).toBe("TaskValidationError");
			expect(error).toBeInstanceOf(Error);
		});

		it("should format toString correctly", () => {
			const error = new TaskValidationError("task-2", "Missing field");

			expect(error.toString()).toContain("task-2");
			expect(error.toString()).toContain("Missing field");
		});

		it("should serialize to JSON correctly", () => {
			const error = new TaskValidationError("task-3", "Empty dependencies");

			const json = error.toJSON();

			expect(json.name).toBe("TaskValidationError");
			expect(json.taskId).toBe("task-3");
			expect(json.reason).toBe("Empty dependencies");
		});
	});

	describe("境界条件", () => {
		it("should accept empty reason", () => {
			const error = new TaskValidationError("task-4", "");

			expect(error.reason).toBe("");
		});
	});
});
