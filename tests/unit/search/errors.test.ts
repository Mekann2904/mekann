/**
 * Tests for Search Extension Error Types
 */

import { describe, it, expect } from "vitest";
import {
	SearchToolError,
	dependencyError,
	parameterError,
	executionError,
	timeoutError,
	indexError,
	filesystemError,
	isSearchToolError,
	isErrorCategory,
	getErrorMessage,
	ok,
	err,
	isOk,
	isErr,
	type SearchErrorCategory,
	type SearchResult,
} from "../../../.pi/extensions/search/utils/errors.js";

describe("SearchToolError", () => {
	describe("constructor", () => {
		it("should create an error with all properties", () => {
			const error = new SearchToolError(
				"Test error message",
				"dependency",
				"Install the missing tool",
				new Error("Original error")
			);

			expect(error).toBeInstanceOf(Error);
			expect(error).toBeInstanceOf(SearchToolError);
			expect(error.name).toBe("SearchToolError");
			expect(error.message).toBe("Test error message");
			expect(error.category).toBe("dependency");
			expect(error.recovery).toBe("Install the missing tool");
			expect(error.cause).toBeInstanceOf(Error);
			expect(error.cause?.message).toBe("Original error");
		});

		it("should create an error without optional properties", () => {
			const error = new SearchToolError("Test error", "parameter");

			expect(error.message).toBe("Test error");
			expect(error.category).toBe("parameter");
			expect(error.recovery).toBeUndefined();
			expect(error.cause).toBeUndefined();
		});

		it("should have a stack trace", () => {
			const error = new SearchToolError("Test error", "execution");
			expect(error.stack).toBeDefined();
			expect(error.stack).toContain("SearchToolError");
		});
	});

	describe("format", () => {
		it("should format error with recovery hint", () => {
			const error = new SearchToolError(
				"Tool not found",
				"dependency",
				"Install the tool"
			);

			const formatted = error.format();
			expect(formatted).toBe("Tool not found\nRecovery: Install the tool");
		});

		it("should format error without recovery hint", () => {
			const error = new SearchToolError("Invalid input", "parameter");

			const formatted = error.format();
			expect(formatted).toBe("Invalid input");
		});
	});

	describe("toJSON", () => {
		it("should create JSON-serializable representation", () => {
			const error = new SearchToolError(
				"Test error",
				"timeout",
				"Try again"
			);

			const json = error.toJSON();

			expect(json).toEqual({
				name: "SearchToolError",
				message: "Test error",
				category: "timeout",
				recovery: "Try again",
			});
		});

		it("should handle undefined recovery", () => {
			const error = new SearchToolError("Test", "index");

			const json = error.toJSON();

			expect(json.name).toBe("SearchToolError");
			expect(json.message).toBe("Test");
			expect(json.category).toBe("index");
			expect(json.recovery).toBeUndefined();
		});
	});
});

describe("Error Factory Functions", () => {
	describe("dependencyError", () => {
		it("should create error for missing tool", () => {
			const error = dependencyError("rg");

			expect(error.category).toBe("dependency");
			expect(error.message).toContain("rg not found");
			expect(error.recovery).toBeDefined();
			expect(error.recovery).toContain("ripgrep");
		});

		it("should provide install hints for fd", () => {
			const error = dependencyError("fd");

			expect(error.recovery).toContain("fd");
			expect(error.recovery).toContain("brew install");
		});

		it("should provide install hints for ctags", () => {
			const error = dependencyError("ctags");

			expect(error.recovery).toContain("universal-ctags");
		});

		it("should allow custom recovery message", () => {
			const error = dependencyError("custom-tool", "Custom install instructions");

			expect(error.recovery).toBe("Custom install instructions");
		});

		it("should provide generic hint for unknown tools", () => {
			const error = dependencyError("unknown-tool");

			expect(error.recovery).toContain("unknown-tool");
			expect(error.recovery).toContain("PATH");
		});
	});

	describe("parameterError", () => {
		it("should create parameter validation error", () => {
			const error = parameterError("limit", "must be positive");

			expect(error.category).toBe("parameter");
			expect(error.message).toContain("Invalid parameter 'limit'");
			expect(error.message).toContain("must be positive");
		});

		it("should include optional recovery hint", () => {
			const error = parameterError(
				"pattern",
				"cannot be empty",
				"Provide a search pattern"
			);

			expect(error.recovery).toBe("Provide a search pattern");
		});
	});

	describe("executionError", () => {
		it("should create execution error with stderr", () => {
			const error = executionError("rg pattern", "Permission denied");

			expect(error.category).toBe("execution");
			expect(error.message).toContain("rg pattern");
			expect(error.message).toContain("Permission denied");
		});

		it("should create execution error without stderr", () => {
			const error = executionError("rg pattern", "");

			expect(error.message).toBe("Command 'rg pattern' failed");
		});

		it("should include optional recovery hint", () => {
			const error = executionError(
				"rg pattern",
				"error",
				"Check file permissions"
			);

			expect(error.recovery).toBe("Check file permissions");
		});
	});

	describe("timeoutError", () => {
		it("should create timeout error with duration", () => {
			const error = timeoutError("search", 5000);

			expect(error.category).toBe("timeout");
			expect(error.message).toContain("search");
			expect(error.message).toContain("5000ms");
		});

		it("should provide default recovery hint", () => {
			const error = timeoutError("search", 5000);

			expect(error.recovery).toContain("reducing the search scope");
		});

		it("should allow custom recovery hint", () => {
			const error = timeoutError("search", 5000, "Use a smaller directory");

			expect(error.recovery).toBe("Use a smaller directory");
		});
	});

	describe("indexError", () => {
		it("should create index-related error", () => {
			const error = indexError("Index is corrupted");

			expect(error.category).toBe("index");
			expect(error.message).toBe("Index is corrupted");
		});

		it("should include optional recovery hint", () => {
			const error = indexError(
				"Index not found",
				"Run sym_index to create the index"
			);

			expect(error.recovery).toBe("Run sym_index to create the index");
		});
	});

	describe("filesystemError", () => {
		it("should create filesystem error with cause", () => {
			const cause = new Error("ENOENT");
			const error = filesystemError("read", "/path/to/file", cause);

			expect(error.category).toBe("filesystem");
			expect(error.message).toContain("read");
			expect(error.message).toContain("/path/to/file");
			expect(error.cause).toBe(cause);
		});

		it("should work without cause", () => {
			const error = filesystemError("write", "/path/to/file");

			expect(error.category).toBe("filesystem");
			expect(error.cause).toBeUndefined();
		});
	});
});

describe("Error Detection Utilities", () => {
	describe("isSearchToolError", () => {
		it("should return true for SearchToolError instances", () => {
			const error = new SearchToolError("Test", "dependency");
			expect(isSearchToolError(error)).toBe(true);
		});

		it("should return false for regular Error instances", () => {
			const error = new Error("Test");
			expect(isSearchToolError(error)).toBe(false);
		});

		it("should return false for non-error values", () => {
			expect(isSearchToolError(null)).toBe(false);
			expect(isSearchToolError(undefined)).toBe(false);
			expect(isSearchToolError("error")).toBe(false);
			expect(isSearchToolError(123)).toBe(false);
		});
	});

	describe("isErrorCategory", () => {
		it("should return true for matching category", () => {
			const error = new SearchToolError("Test", "dependency");
			expect(isErrorCategory(error, "dependency")).toBe(true);
		});

		it("should return false for non-matching category", () => {
			const error = new SearchToolError("Test", "dependency");
			expect(isErrorCategory(error, "timeout")).toBe(false);
		});

		it("should return false for non-SearchToolError", () => {
			const error = new Error("Test");
			expect(isErrorCategory(error, "dependency")).toBe(false);
		});

		it("should work with all error categories", () => {
			const categories: SearchErrorCategory[] = [
				"dependency",
				"parameter",
				"execution",
				"timeout",
				"index",
				"filesystem",
			];

			for (const category of categories) {
				const error = new SearchToolError("Test", category);
				expect(isErrorCategory(error, category)).toBe(true);
			}
		});
	});

	describe("getErrorMessage", () => {
		it("should format SearchToolError", () => {
			const error = new SearchToolError(
				"Test error",
				"dependency",
				"Recovery hint"
			);

			expect(getErrorMessage(error)).toBe("Test error\nRecovery: Recovery hint");
		});

		it("should return message for regular Error", () => {
			const error = new Error("Regular error");
			expect(getErrorMessage(error)).toBe("Regular error");
		});

		it("should convert non-error values to string", () => {
			expect(getErrorMessage("string error")).toBe("string error");
			expect(getErrorMessage(123)).toBe("123");
			expect(getErrorMessage(null)).toBe("null");
			expect(getErrorMessage(undefined)).toBe("undefined");
		});
	});
});

describe("Result Type Helpers", () => {
	describe("ok", () => {
		it("should create successful result", () => {
			const result = ok("value");

			expect(result.ok).toBe(true);
			expect(result).toHaveProperty("value", "value");
		});

		it("should work with various value types", () => {
			expect(ok(42)).toEqual({ ok: true, value: 42 });
			expect(ok({ name: "test" })).toEqual({ ok: true, value: { name: "test" } });
			expect(ok([1, 2, 3])).toEqual({ ok: true, value: [1, 2, 3] });
			expect(ok(null)).toEqual({ ok: true, value: null });
		});
	});

	describe("err", () => {
		it("should create failed result", () => {
			const error = new SearchToolError("Test", "dependency");
			const result = err(error);

			expect(result.ok).toBe(false);
			expect(result).toHaveProperty("error", error);
		});

		it("should work with custom error types", () => {
			const result = err(new Error("Custom error"));

			expect(result.ok).toBe(false);
			expect(result.error).toBeInstanceOf(Error);
		});
	});

	describe("isOk", () => {
		it("should return true for successful results", () => {
			const result = ok("value");
			expect(isOk(result)).toBe(true);
		});

		it("should return false for failed results", () => {
			const result = err(new SearchToolError("Test", "dependency"));
			expect(isOk(result)).toBe(false);
		});

		it("should narrow type correctly", () => {
			const result: SearchResult<string> = ok("value");

			if (isOk(result)) {
				// TypeScript should know result.value exists here
				expect(result.value.length).toBe(5);
			}
		});
	});

	describe("isErr", () => {
		it("should return true for failed results", () => {
			const result = err(new SearchToolError("Test", "dependency"));
			expect(isErr(result)).toBe(true);
		});

		it("should return false for successful results", () => {
			const result = ok("value");
			expect(isErr(result)).toBe(false);
		});

		it("should narrow type correctly", () => {
			const result: SearchResult<string> = err(new SearchToolError("Test", "dependency"));

			if (isErr(result)) {
				// TypeScript should know result.error exists here
				expect(result.error.category).toBe("dependency");
			}
		});
	});
});

describe("Edge cases", () => {
	it("should handle all error categories", () => {
		const categories: SearchErrorCategory[] = [
			"dependency",
			"parameter",
			"execution",
			"timeout",
			"index",
			"filesystem",
		];

		for (const category of categories) {
			const error = new SearchToolError(`Test ${category}`, category);
			expect(error.category).toBe(category);
		}
	});

	it("should handle empty strings", () => {
		const error = new SearchToolError("", "parameter", "");
		expect(error.message).toBe("");
		expect(error.recovery).toBe("");
	});
});
