/**
 * @file .pi/lib/errors.ts の単体テスト
 * @description pi-plugin共通エラークラスのテスト
 * @testFramework vitest
 */

import { describe, it, expect } from "vitest";
import {
	PiError,
	RuntimeLimitError,
	RuntimeQueueWaitError,
	SchemaValidationError,
	type PiErrorCode,
} from "../../lib/errors.js";

describe("PiError", () => {
	describe("正常系", () => {
		it("should construct with message and default code", () => {
			const error = new PiError("Test error");

			expect(error.message).toBe("Test error");
			expect(error.code).toBe("UNKNOWN_ERROR");
			expect(error.name).toBe("PiError");
			expect(error.retryable).toBe(false);
			expect(error.timestamp).toBeTypeOf("number");
			expect(error).toBeInstanceOf(Error);
			expect(error).toBeInstanceOf(PiError);
		});

		it("should construct with custom code", () => {
			const error = new PiError("Test error", "TIMEOUT_ERROR");

			expect(error.code).toBe("TIMEOUT_ERROR");
		});

		it("should construct with retryable option", () => {
			const error = new PiError("Test error", "RATE_LIMIT_ERROR", {
				retryable: true,
			});

			expect(error.retryable).toBe(true);
		});

		it("should construct with cause option", () => {
			const cause = new Error("Original error");
			const error = new PiError("Test error", "UNKNOWN_ERROR", { cause });

			expect(error.cause).toBe(cause);
		});

		it("should return true from is() when code matches", () => {
			const error = new PiError("Test error", "TIMEOUT_ERROR");

			expect(error.is("TIMEOUT_ERROR")).toBe(true);
			expect(error.is("UNKNOWN_ERROR")).toBe(false);
		});

		it("should serialize to JSON with all properties", () => {
			const cause = new Error("Original error");
			const error = new PiError("Test error", "RATE_LIMIT_ERROR", {
				retryable: true,
				cause,
			});

			const json = error.toJSON();

			expect(json).toMatchObject({
				name: "PiError",
				message: "Test error",
				code: "RATE_LIMIT_ERROR",
				retryable: true,
				cause: "Original error",
			});
			expect(json.timestamp).toBeTypeOf("number");
			expect(json.stack).toBeTypeOf("string");
		});
	});

	describe("境界条件", () => {
		it("should handle empty message", () => {
			const error = new PiError("");

			expect(error.message).toBe("");
			expect(error.code).toBe("UNKNOWN_ERROR");
		});

		it("should handle undefined options", () => {
			const error = new PiError("Test error", "UNKNOWN_ERROR", undefined);

			expect(error.retryable).toBe(false);
			expect(error.cause).toBeUndefined();
		});

		it("should handle partial options", () => {
			const error = new PiError("Test error", "UNKNOWN_ERROR", {
				retryable: true,
			});

			expect(error.retryable).toBe(true);
			expect(error.cause).toBeUndefined();
		});

		it("should have valid timestamp close to Date.now()", () => {
			const before = Date.now();
			const error = new PiError("Test error");
			const after = Date.now();

			expect(error.timestamp).toBeGreaterThanOrEqual(before);
			expect(error.timestamp).toBeLessThanOrEqual(after);
		});
	});
});

describe("RuntimeLimitError", () => {
	describe("正常系", () => {
		it("should construct with message", () => {
			const error = new RuntimeLimitError("Runtime limit reached");

			expect(error.message).toBe("Runtime limit reached");
			expect(error.code).toBe("RUNTIME_LIMIT_REACHED");
			expect(error.name).toBe("RuntimeLimitError");
			expect(error.retryable).toBe(false);
			expect(error).toBeInstanceOf(PiError);
			expect(error).toBeInstanceOf(Error);
		});

		it("should construct with currentCount and maxCount", () => {
			const error = new RuntimeLimitError("Limit reached", {
				currentCount: 5,
				maxCount: 4,
			});

			expect(error.currentCount).toBe(5);
			expect(error.maxCount).toBe(4);
		});

		it("should construct with cause", () => {
			const cause = new Error("Original error");
			const error = new RuntimeLimitError("Limit reached", { cause });

			expect(error.cause).toBe(cause);
		});

		it("should serialize to JSON with count properties", () => {
			const error = new RuntimeLimitError("Limit reached", {
				currentCount: 5,
				maxCount: 4,
			});

			const json = error.toJSON();

			expect(json.currentCount).toBe(5);
			expect(json.maxCount).toBe(4);
			expect(json.code).toBe("RUNTIME_LIMIT_REACHED");
		});
	});

	describe("境界条件", () => {
		it("should handle undefined options", () => {
			const error = new RuntimeLimitError("Limit reached", undefined);

			expect(error.currentCount).toBeUndefined();
			expect(error.maxCount).toBeUndefined();
		});

		it("should handle partial options", () => {
			const error = new RuntimeLimitError("Limit reached", {
				currentCount: 5,
			});

			expect(error.currentCount).toBe(5);
			expect(error.maxCount).toBeUndefined();
		});
	});
});

describe("RuntimeQueueWaitError", () => {
	describe("正常系", () => {
		it("should construct with message", () => {
			const error = new RuntimeQueueWaitError("Queue wait timeout");

			expect(error.message).toBe("Queue wait timeout");
			expect(error.code).toBe("RUNTIME_QUEUE_WAIT");
			expect(error.name).toBe("RuntimeQueueWaitError");
			expect(error.retryable).toBe(true);
			expect(error).toBeInstanceOf(PiError);
		});

		it("should construct with waitTimeMs and maxWaitMs", () => {
			const error = new RuntimeQueueWaitError("Queue wait timeout", {
				waitTimeMs: 30000,
				maxWaitMs: 25000,
			});

			expect(error.waitTimeMs).toBe(30000);
			expect(error.maxWaitMs).toBe(25000);
		});

		it("should serialize to JSON with wait time properties", () => {
			const error = new RuntimeQueueWaitError("Queue wait timeout", {
				waitTimeMs: 30000,
				maxWaitMs: 25000,
			});

			const json = error.toJSON();

			expect(json.waitTimeMs).toBe(30000);
			expect(json.maxWaitMs).toBe(25000);
			expect(json.code).toBe("RUNTIME_QUEUE_WAIT");
		});
	});

	describe("境界条件", () => {
		it("should handle undefined options", () => {
			const error = new RuntimeQueueWaitError("Queue wait timeout", undefined);

			expect(error.waitTimeMs).toBeUndefined();
			expect(error.maxWaitMs).toBeUndefined();
		});
	});
});

describe("SchemaValidationError", () => {
	describe("正常系", () => {
		it("should construct with message", () => {
			const error = new SchemaValidationError("Schema validation failed");

			expect(error.message).toBe("Schema validation failed");
			expect(error.code).toBe("SCHEMA_VIOLATION");
			expect(error.name).toBe("SchemaValidationError");
			expect(error.retryable).toBe(true);
			expect(error).toBeInstanceOf(PiError);
		});

		it("should construct with violations array", () => {
			const error = new SchemaValidationError("Validation failed", {
				violations: ["Missing required field: summary", "Invalid type for param"],
			});

			expect(error.violations).toHaveLength(2);
			expect(error.violations[0]).toBe("Missing required field: summary");
		});

		it("should construct with field option", () => {
			const error = new SchemaValidationError("Validation failed", {
				violations: ["Required"],
				field: "summary",
			});

			expect(error.field).toBe("summary");
		});

		it("should serialize to JSON with violations", () => {
			const error = new SchemaValidationError("Validation failed", {
				violations: ["Required field missing"],
				field: "summary",
			});

			const json = error.toJSON();

			expect(json.violations).toHaveLength(1);
			expect(json.code).toBe("SCHEMA_VIOLATION");
			expect(json.field).toBe("summary");
		});
	});

	describe("境界条件", () => {
		it("should handle undefined options", () => {
			const error = new SchemaValidationError("Validation failed", undefined);

			expect(error.violations).toEqual([]);
			expect(error.field).toBeUndefined();
		});

		it("should handle empty violations array", () => {
			const error = new SchemaValidationError("Validation failed", {
				violations: [],
			});

			expect(error.violations).toHaveLength(0);
		});
	});
});

describe("Error Code Types", () => {
	it("should accept all valid PiErrorCode values", () => {
		const validCodes: PiErrorCode[] = [
			"UNKNOWN_ERROR",
			"RUNTIME_LIMIT_REACHED",
			"RUNTIME_QUEUE_WAIT",
			"SCHEMA_VIOLATION",
			"VALIDATION_ERROR",
			"TIMEOUT_ERROR",
			"CANCELLED_ERROR",
			"RATE_LIMIT_ERROR",
			"CAPACITY_ERROR",
			"PARSING_ERROR",
		];

		for (const code of validCodes) {
			const error = new PiError("Test", code);
			expect(error.code).toBe(code);
		}
	});
});
