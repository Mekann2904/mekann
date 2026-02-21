/**
 * search/utils/errors.ts 単体テスト
 * テスト対象: SearchToolErrorクラス、エラーファクトリ関数、ユーティリティ関数
 */

import { describe, it, expect, vi } from "vitest";
import * as fc from "fast-check";
import {
	SearchToolError,
	SearchErrorCategory,
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
	type SearchResult,
} from "@ext/search/utils/errors.js";

// ============================================================================
// SearchToolError Class Tests
// ============================================================================

describe("SearchToolError", () => {
	it("エラーメッセージとカテゴリを保持する", () => {
		// Arrange
		const message = "Test error message";
		const category: SearchErrorCategory = "execution";

		// Act
		const error = new SearchToolError(message, category);

		// Assert
		expect(error.message).toBe(message);
		expect(error.category).toBe(category);
		expect(error.name).toBe("SearchToolError");
	});

	it("回復ヒントを保持する", () => {
		// Arrange
		const recovery = "Try installing the tool";

		// Act
		const error = new SearchToolError("Error", "dependency", recovery);

		// Assert
		expect(error.recovery).toBe(recovery);
	});

	it("原因エラーを保持する", () => {
		// Arrange
		const cause = new Error("Original error");

		// Act
		const error = new SearchToolError("Wrapper error", "filesystem", undefined, cause);

		// Assert
		expect(error.cause).toBe(cause);
	});

	it("formatで回復ヒントを含めたメッセージを返す", () => {
		// Arrange
		const message = "Test error";
		const recovery = "Try again";
		const error = new SearchToolError(message, "execution", recovery);

		// Act
		const formatted = error.format();

		// Assert
		expect(formatted).toBe(`${message}\nRecovery: ${recovery}`);
	});

	it("recoveryがない場合formatはメッセージのみを返す", () => {
		// Arrange
		const message = "Test error";
		const error = new SearchToolError(message, "execution");

		// Act
		const formatted = error.format();

		// Assert
		expect(formatted).toBe(message);
	});

	it("toJSONで構造化されたデータを返す", () => {
		// Arrange
		const message = "Test error";
		const category: SearchErrorCategory = "timeout";
		const recovery = "Increase timeout";
		const error = new SearchToolError(message, category, recovery);

		// Act
		const json = error.toJSON();

		// Assert
		expect(json).toEqual({
			name: "SearchToolError",
			message,
			category,
			recovery,
		});
		expect(json).not.toHaveProperty("cause");
	});

	it("recoveryがない場合toJSONはrecoveryを含めない", () => {
		// Arrange
		const error = new SearchToolError("Test error", "parameter");

		// Act
		const json = error.toJSON();

		// Assert
		expect(json.recovery).toBeUndefined();
	});

	it("すべてのエラーカテゴリで正しくインスタンス化される", () => {
		// Arrange
		const categories: SearchErrorCategory[] = [
			"dependency",
			"parameter",
			"execution",
			"timeout",
			"index",
			"filesystem",
		];

		// Act & Assert
		categories.forEach((category) => {
			const error = new SearchToolError("Test", category);
			expect(error.category).toBe(category);
		});
	});
});

// ============================================================================
// Error Factory Functions Tests
// ============================================================================

describe("dependencyError", () => {
	it("依存関係エラーを作成する", () => {
		// Arrange
		const tool = "rg";

		// Act
		const error = dependencyError(tool);

		// Assert
		expect(error.category).toBe("dependency");
		expect(error.message).toContain(tool);
		expect(error.message).toContain("not found");
	});

	it("デフォルトの回復ヒントを提供する - rg", () => {
		// Arrange
		const tool = "rg";

		// Act
		const error = dependencyError(tool);

		// Assert
		expect(error.recovery).toContain("brew install ripgrep");
		expect(error.recovery).toContain("apt install ripgrep");
	});

	it("デフォルトの回復ヒントを提供する - fd", () => {
		// Arrange
		const tool = "fd";

		// Act
		const error = dependencyError(tool);

		// Assert
		expect(error.recovery).toContain("brew install fd");
		expect(error.recovery).toContain("apt install fd-find");
	});

	it("デフォルトの回復ヒントを提供する - ctags", () => {
		// Arrange
		const tool = "ctags";

		// Act
		const error = dependencyError(tool);

		// Assert
		expect(error.recovery).toContain("brew install universal-ctags");
		expect(error.recovery).toContain("apt install universal-ctags");
	});

	it("カスタムの回復ヒントで上書きする", () => {
		// Arrange
		const tool = "rg";
		const customRecovery = "Custom recovery hint";

		// Act
		const error = dependencyError(tool, customRecovery);

		// Assert
		expect(error.recovery).toBe(customRecovery);
	});

	it("未知のツールに対してデフォルトのヒントを提供する", () => {
		// Arrange
		const tool = "unknown-tool";

		// Act
		const error = dependencyError(tool);

		// Assert
		expect(error.recovery).toContain("Please install");
	});
});

describe("parameterError", () => {
	it("パラメータエラーを作成する", () => {
		// Arrange
		const parameter = "limit";
		const reason = "must be positive";

		// Act
		const error = parameterError(parameter, reason);

		// Assert
		expect(error.category).toBe("parameter");
		expect(error.message).toContain(parameter);
		expect(error.message).toContain(reason);
	});

	it("カスタムの回復ヒントを含めることができる", () => {
		// Arrange
		const recovery = "Use a positive number";

		// Act
		const error = parameterError("limit", "must be positive", recovery);

		// Assert
		expect(error.recovery).toBe(recovery);
	});
});

describe("executionError", () => {
	it("stderrがある場合stderrを含むエラーを作成する", () => {
		// Arrange
		const command = "rg test";
		const stderr = "pattern not found";

		// Act
		const error = executionError(command, stderr);

		// Assert
		expect(error.category).toBe("execution");
		expect(error.message).toContain(command);
		expect(error.message).toContain(stderr);
	});

	it("stderrがない場合メッセージのみでエラーを作成する", () => {
		// Arrange
		const command = "rg test";

		// Act
		const error = executionError(command, "");

		// Assert
		expect(error.category).toBe("execution");
		expect(error.message).toContain(command);
		expect(error.message).toContain("failed");
	});
});

describe("timeoutError", () => {
	it("タイムアウトエラーを作成する", () => {
		// Arrange
		const operation = "index generation";
		const timeoutMs = 5000;

		// Act
		const error = timeoutError(operation, timeoutMs);

		// Assert
		expect(error.category).toBe("timeout");
		expect(error.message).toContain(operation);
		expect(error.message).toContain(`${timeoutMs}ms`);
	});

	it("デフォルトの回復ヒントを提供する", () => {
		// Arrange
		const error = timeoutError("test", 1000);

		// Assert
		expect(error.recovery).toBeDefined();
	});

	it("カスタムの回復ヒントで上書きする", () => {
		// Arrange
		const customRecovery = "Custom timeout recovery";

		// Act
		const error = timeoutError("test", 1000, customRecovery);

		// Assert
		expect(error.recovery).toBe(customRecovery);
	});
});

describe("indexError", () => {
	it("インデックスエラーを作成する", () => {
		// Arrange
		const message = "Index file corrupted";

		// Act
		const error = indexError(message);

		// Assert
		expect(error.category).toBe("index");
		expect(error.message).toBe(message);
	});

	it("カスタムの回復ヒントを含めることができる", () => {
		// Arrange
		const recovery = "Regenerate the index";

		// Act
		const error = indexError("Index corrupted", recovery);

		// Assert
		expect(error.recovery).toBe(recovery);
	});
});

describe("filesystemError", () => {
	it("ファイルシステムエラーを作成する", () => {
		// Arrange
		const operation = "read";
		const path = "/test/file.txt";

		// Act
		const error = filesystemError(operation, path);

		// Assert
		expect(error.category).toBe("filesystem");
		expect(error.message).toContain(operation);
		expect(error.message).toContain(path);
	});

	it("原因エラーを保持する", () => {
		// Arrange
		const cause = new Error("Permission denied");

		// Act
		const error = filesystemError("read", "/test", cause);

		// Assert
		expect(error.cause).toBe(cause);
	});
});

// ============================================================================
// Error Detection Utilities Tests
// ============================================================================

describe("isSearchToolError", () => {
	it("SearchToolErrorインスタンスを正しく検出する", () => {
		// Arrange
		const error = new SearchToolError("Test", "execution");

		// Act
		const result = isSearchToolError(error);

		// Assert
		expect(result).toBe(true);
	});

	it("通常のErrorインスタンスを除外する", () => {
		// Arrange
		const error = new Error("Test");

		// Act
		const result = isSearchToolError(error);

		// Assert
		expect(result).toBe(false);
	});

	it("nullやundefinedを除外する", () => {
		// Arrange
		// Act
		const result1 = isSearchToolError(null);
		const result2 = isSearchToolError(undefined);

		// Assert
		expect(result1).toBe(false);
		expect(result2).toBe(false);
	});
});

describe("isErrorCategory", () => {
	it("指定されたカテゴリと一致する場合trueを返す", () => {
		// Arrange
		const error = new SearchToolError("Test", "dependency");

		// Act
		const result = isErrorCategory(error, "dependency");

		// Assert
		expect(result).toBe(true);
	});

	it("指定されたカテゴリと一致しない場合falseを返す", () => {
		// Arrange
		const error = new SearchToolError("Test", "dependency");

		// Act
		const result = isErrorCategory(error, "timeout");

		// Assert
		expect(result).toBe(false);
	});

	it("SearchToolErrorではない場合falseを返す", () => {
		// Arrange
		const error = new Error("Test");

		// Act
		const result = isErrorCategory(error, "dependency");

		// Assert
		expect(result).toBe(false);
	});
});

describe("getErrorMessage", () => {
	it("SearchToolErrorのformatメソッドを呼び出す", () => {
		// Arrange
		const error = new SearchToolError("Test error", "execution", "Fix it");

		// Act
		const message = getErrorMessage(error);

		// Assert
		expect(message).toBe("Test error\nRecovery: Fix it");
	});

	it("通常のErrorのメッセージを取得する", () => {
		// Arrange
		const error = new Error("Standard error");

		// Act
		const message = getErrorMessage(error);

		// Assert
		expect(message).toBe("Standard error");
	});

	it("文字列をそのまま返す", () => {
		// Arrange
		const error = "String error";

		// Act
		const message = getErrorMessage(error);

		// Assert
		expect(message).toBe("String error");
	});
});

// ============================================================================
// Result Type Helpers Tests
// ============================================================================

describe("ok", () => {
	it("成功結果を作成する", () => {
		// Arrange
		const value = 42;

		// Act
		const result = ok(value);

		// Assert
		expect(result.ok).toBe(true);
		expect(result.value).toBe(value);
		expect(isOk(result)).toBe(true);
	});
});

describe("err", () => {
	it("失敗結果を作成する", () => {
		// Arrange
		const error = new SearchToolError("Test", "execution");

		// Act
		const result = err(error);

		// Assert
		expect(result.ok).toBe(false);
		expect(result.error).toBe(error);
		expect(isErr(result)).toBe(true);
	});
});

describe("isOk", () => {
	it("成功結果に対してtrueを返す", () => {
		// Arrange
		const result = ok(42);

		// Act
		const isResultOk = isOk(result);

		// Assert
		expect(isResultOk).toBe(true);
	});

	it("失敗結果に対してfalseを返す", () => {
		// Arrange
		const result = err(new SearchToolError("Test", "execution"));

		// Act
		const isResultOk = isOk(result);

		// Assert
		expect(isResultOk).toBe(false);
	});
});

describe("isErr", () => {
	it("失敗結果に対してtrueを返す", () => {
		// Arrange
		const result = err(new SearchToolError("Test", "execution"));

		// Act
		const isResultErr = isErr(result);

		// Assert
		expect(isResultErr).toBe(true);
	});

	it("成功結果に対してfalseを返す", () => {
		// Arrange
		const result = ok(42);

		// Act
		const isResultErr = isErr(result);

		// Assert
		expect(isResultErr).toBe(false);
	});
});

// ============================================================================
// Property-Based Tests
// ============================================================================

describe("SearchToolError プロパティベーステスト", () => {
	it("すべてのカテゴリでエラーが正しく作成される", () => {
		fc.assert(
			fc.property(
				fc.string(),
				fc.constantFrom<SearchErrorCategory>(
					"dependency",
					"parameter",
					"execution",
					"timeout",
					"index",
					"filesystem"
				),
				(message, category) => {
					const error = new SearchToolError(message, category);
					return error.message === message && error.category === category;
				}
			)
		);
	});

	it("toJSONは再現可能で、逆シリアライズ可能", () => {
		fc.assert(
			fc.property(
				fc.string(),
				fc.constantFrom<SearchErrorCategory>(
					"dependency",
					"parameter",
					"execution",
					"timeout",
					"index",
					"filesystem"
				),
				fc.option(fc.string(), { nil: undefined }),
				(message, category, recovery) => {
					const error = new SearchToolError(message, category, recovery);
					const json = error.toJSON();

					return (
						json.name === "SearchToolError" &&
						json.message === message &&
						json.category === category &&
						json.recovery === recovery
					);
				}
			)
		);
	});

	it("isSearchToolErrorは型ガードとして正しく動作する", () => {
		fc.assert(
			fc.property(
				fc.boolean(),
				(isSearchError) => {
					const error = isSearchError
						? new SearchToolError("Test", "execution")
						: new Error("Test");
					return isSearchToolError(error) === isSearchError;
				}
			)
		);
	});
});

describe("SearchResult プロパティベーステスト", () => {
	it("okとerrは排他的である", () => {
		fc.assert(
			fc.property(fc.integer(), (value) => {
				const success = ok(value);
				const failure = err(new SearchToolError("Test", "execution"));

				return success.ok !== failure.ok;
			})
		);
	});

	it("isOkとisErrは排他的である", () => {
		fc.assert(
			fc.property(fc.integer(), (value) => {
				const success = ok(value);
				const failure = err(new SearchToolError("Test", "execution"));

				return isOk(success) !== isOk(failure) &&
					   isErr(success) !== isErr(failure);
			})
		);
	});
});
