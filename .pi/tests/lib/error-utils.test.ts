/**
 * @file .pi/lib/error-utils.ts の単体テスト
 * @description エラー処理共通ユーティリティのテスト
 * @testFramework vitest + fast-check
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// モジュールをインポート
import {
	toErrorMessage,
	extractStatusCodeFromMessage,
	classifyPressureError,
	isCancelledErrorMessage,
	isTimeoutErrorMessage,
	type PressureErrorType,
} from "../../lib/error-utils.js";

// ============================================================================
// toErrorMessage
// ============================================================================

describe("toErrorMessage", () => {
	describe("正常系 - Errorオブジェクト", () => {
		it("should_return_message_from_Error", () => {
			const error = new Error("Test error message");
			const result = toErrorMessage(error);
			expect(result).toBe("Test error message");
		});

		it("should_return_message_from_custom_Error_subclass", () => {
			class CustomError extends Error {
				constructor(message: string) {
					super(message);
					this.name = "CustomError";
				}
			}
			const error = new CustomError("Custom error");
			const result = toErrorMessage(error);
			expect(result).toBe("Custom error");
		});
	});

	describe("境界条件 - オブジェクト型", () => {
		it("should_stringify_plain_object", () => {
			const error = { code: 500, message: "Server error" };
			const result = toErrorMessage(error);
			expect(result).toBe('{"code":500,"message":"Server error"}');
		});

		it("should_stringify_nested_object", () => {
			const error = {
				cause: {
					message: "Inner error",
					code: 404,
				},
			};
			const result = toErrorMessage(error);
			expect(result).toBe('{"cause":{"message":"Inner error","code":404}}');
		});
	});

	describe("異常系 - 特殊値", () => {
		it("should_handle_null", () => {
			const result = toErrorMessage(null);
			expect(result).toBe("null");
		});

		it("should_handle_undefined", () => {
			const result = toErrorMessage(undefined);
			expect(result).toBe("undefined");
		});

		it("should_handle_string", () => {
			const result = toErrorMessage("String error");
			expect(result).toBe("String error");
		});

		it("should_handle_number", () => {
			const result = toErrorMessage(404);
			expect(result).toBe("404");
		});

		it("should_handle_boolean", () => {
			const result = toErrorMessage(true);
			expect(result).toBe("true");
		});

		it("should_handle_object_with_toString", () => {
			const error = {
				toString: () => "Custom toString",
			};
			const result = toErrorMessage(error);
			// 現実装はオブジェクトを優先してJSON.stringifyするため "{}" になる
			expect(result).toBe("{}");
		});
	});

	describe("境界条件 - JSONシリアライズ例外", () => {
		it("should_handle_circular_reference", () => {
			const error: Record<string, unknown> = { name: "Circular" };
			error.self = error;
			const result = toErrorMessage(error);
			// 循環参照の場合は "[object Object]" になる
			expect(result).toBe("[object Object]");
		});
	});
});

// ============================================================================
// extractStatusCodeFromMessage
// ============================================================================

describe("extractStatusCodeFromMessage", () => {
	describe("正常系 - HTTPステータスコード", () => {
		it("should_extract_429_status", () => {
			const error = new Error("Rate limit exceeded (429)");
			const result = extractStatusCodeFromMessage(error);
			expect(result).toBe(429);
		});

		it("should_extract_500_status", () => {
			const error = new Error("Internal server error (500)");
			const result = extractStatusCodeFromMessage(error);
			expect(result).toBe(500);
		});

		it("should_extract_503_status", () => {
			const error = new Error("Service unavailable (503)");
			const result = extractStatusCodeFromMessage(error);
			expect(result).toBe(503);
		});
	});

	describe("境界条件 - ステータスコードなし", () => {
		it("should_return_undefined_when_no_status_code", () => {
			const error = new Error("Generic error");
			const result = extractStatusCodeFromMessage(error);
			expect(result).toBeUndefined();
		});

		it("should_return_undefined_for_empty_message", () => {
			const error = new Error("");
			const result = extractStatusCodeFromMessage(error);
			expect(result).toBeUndefined();
		});
	});

	describe("異常系 - 特殊入力", () => {
		it("should_handle_null_input", () => {
			const result = extractStatusCodeFromMessage(null);
			expect(result).toBeUndefined();
		});

		it("should_handle_string_input", () => {
			const result = extractStatusCodeFromMessage("Error 429 occurred");
			expect(result).toBe(429);
		});

		it("should_ignore_3xx_codes", () => {
			const error = new Error("Redirect 301");
			const result = extractStatusCodeFromMessage(error);
			expect(result).toBeUndefined();
		});

		it("should_ignore_4xx_codes_except_429", () => {
			const error = new Error("Not found 404");
			const result = extractStatusCodeFromMessage(error);
			expect(result).toBeUndefined();
		});

		it("should_extract_429_only", () => {
			const error = new Error("429");
			const result = extractStatusCodeFromMessage(error);
			expect(result).toBe(429);
		});
	});

	describe("プロパティベーステスト", () => {
		it("PBT: 抽出されたコードは429または5xxの範囲である", () => {
			fc.assert(
				fc.property(fc.string(), (message) => {
					const error = new Error(message);
					const code = extractStatusCodeFromMessage(error);
					if (code === undefined) return true;
					return code === 429 || (code >= 500 && code < 600);
				}),
				{ numRuns: 100 },
			);
		});
	});
});

// ============================================================================
// classifyPressureError
// ============================================================================

describe("classifyPressureError", () => {
	describe("正常系 - rate_limit", () => {
		it("should_classify_rate_limit_429", () => {
			const error = new Error("Rate limit exceeded (429)");
			const result = classifyPressureError(error);
			expect(result).toBe("rate_limit");
		});

		it("should_classify_rate_limit_text", () => {
			const error = new Error("too many requests");
			const result = classifyPressureError(error);
			expect(result).toBe("rate_limit");
		});

		it("should_classify_rate_limit_case_insensitive", () => {
			const error = new Error("RATE LIMIT");
			const result = classifyPressureError(error);
			expect(result).toBe("rate_limit");
		});
	});

	describe("正常系 - timeout", () => {
		it("should_classify_timeout", () => {
			const error = new Error("Request timed out");
			const result = classifyPressureError(error);
			expect(result).toBe("timeout");
		});

		it("should_classify_timed_out", () => {
			const error = new Error("Request timed out");
			const result = classifyPressureError(error);
			expect(result).toBe("timeout");
		});

		it("should_classify_timeout_case_insensitive", () => {
			const error = new Error("TIMEOUT");
			const result = classifyPressureError(error);
			expect(result).toBe("timeout");
		});
	});

	describe("正常系 - capacity", () => {
		it("should_classify_capacity_limit_reached", () => {
			const error = new Error("runtime limit reached");
			const result = classifyPressureError(error);
			expect(result).toBe("capacity");
		});

		it("should_classify_capacity_word", () => {
			const error = new Error("Capacity exceeded");
			const result = classifyPressureError(error);
			expect(result).toBe("capacity");
		});
	});

	describe("境界条件 - other", () => {
		it("should_classify_generic_error_as_other", () => {
			const error = new Error("Something went wrong");
			const result = classifyPressureError(error);
			expect(result).toBe("other");
		});

		it("should_classify_500_error_as_other", () => {
			const error = new Error("Internal server error (500)");
			const result = classifyPressureError(error);
			expect(result).toBe("other");
		});

		it("should_classify_empty_error_as_other", () => {
			const error = new Error("");
			const result = classifyPressureError(error);
			expect(result).toBe("other");
		});
	});

	describe("異常系", () => {
		it("should_handle_null_input", () => {
			const result = classifyPressureError(null);
			expect(result).toBe("other");
		});

		it("should_handle_string_input", () => {
			const result = classifyPressureError("Rate limit");
			expect(result).toBe("rate_limit");
		});

		it("should_handle_object_input", () => {
			const error = { message: "Rate limit exceeded" };
			const result = classifyPressureError(error);
			expect(result).toBe("rate_limit");
		});
	});

	describe("プロパティベーステスト", () => {
		it("PBT: 分類結果は有効なPressureErrorTypeである", () => {
			const validTypes: PressureErrorType[] = ["rate_limit", "timeout", "capacity", "other"];

			fc.assert(
				fc.property(fc.string(), (message) => {
					const error = new Error(message);
					const result = classifyPressureError(error);
					return validTypes.includes(result);
				}),
				{ numRuns: 100 },
			);
		});

		it("PBT: rate_limitキーワードを含むメッセージはrate_limitに分類される", () => {
			fc.assert(
				fc.property(
					fc.tuple(fc.string(), fc.constantFrom("rate limit", "RATE LIMIT", "Rate Limit"), fc.string()),
					([prefix, keyword, suffix]) => {
						const message = `${prefix}${keyword}${suffix}`;
						const error = new Error(message);
						const result = classifyPressureError(error);
						return result === "rate_limit";
					},
				),
				{ numRuns: 50 },
			);
		});
	});
});

// ============================================================================
// isCancelledErrorMessage
// ============================================================================

describe("isCancelledErrorMessage", () => {
	describe("正常系 - キャンセル判定", () => {
		it("should_detect_aborted", () => {
			const error = new Error("Request aborted");
			expect(isCancelledErrorMessage(error)).toBe(true);
		});

		it("should_detect_cancelled", () => {
			const error = new Error("Operation cancelled");
			expect(isCancelledErrorMessage(error)).toBe(true);
		});

		it("should_detect_canceled", () => {
			const error = new Error("Process canceled");
			expect(isCancelledErrorMessage(error)).toBe(true);
		});

		it("should_detect_japanese_cancelled", () => {
			const error = new Error("中断しました");
			expect(isCancelledErrorMessage(error)).toBe(true);
		});

		it("should_detect_japanese_cancelled_2", () => {
			const error = new Error("キャンセルされました");
			expect(isCancelledErrorMessage(error)).toBe(true);
		});
	});

	describe("境界条件 - 非キャンセル", () => {
		it("should_return_false_for_other_errors", () => {
			const error = new Error("Generic error");
			expect(isCancelledErrorMessage(error)).toBe(false);
		});

		it("should_return_false_for_timeout", () => {
			const error = new Error("Request timed out");
			expect(isCancelledErrorMessage(error)).toBe(false);
		});

		it("should_return_false_for_empty_message", () => {
			const error = new Error("");
			expect(isCancelledErrorMessage(error)).toBe(false);
		});

		it("should_return_false_case_insensitive_true", () => {
			const error = new Error("ABORTED");
			expect(isCancelledErrorMessage(error)).toBe(true);
		});
	});

	describe("異常系", () => {
		it("should_handle_null_input", () => {
			expect(isCancelledErrorMessage(null)).toBe(false);
		});

		it("should_handle_string_input", () => {
			expect(isCancelledErrorMessage("Request aborted")).toBe(true);
		});
	});

	describe("プロパティベーステスト", () => {
		it("PBT: 結果は常にbooleanである", () => {
			fc.assert(
				fc.property(fc.string(), (message) => {
					const error = new Error(message);
					const result = isCancelledErrorMessage(error);
					return typeof result === "boolean";
				}),
				{ numRuns: 100 },
			);
		});
	});
});

// ============================================================================
// isTimeoutErrorMessage
// ============================================================================

describe("isTimeoutErrorMessage", () => {
	describe("正常系 - タイムアウト判定", () => {
		it("should_detect_timed_out", () => {
			const error = new Error("Request timed out");
			expect(isTimeoutErrorMessage(error)).toBe(true);
		});

		it("should_detect_timeout", () => {
			const error = new Error("Request timeout");
			expect(isTimeoutErrorMessage(error)).toBe(true);
		});

		it("should_detect_time_out", () => {
			const error = new Error("Request time out");
			expect(isTimeoutErrorMessage(error)).toBe(true);
		});

		it("should_detect_japanese_timeout", () => {
			const error = new Error("時間切れ");
			expect(isTimeoutErrorMessage(error)).toBe(true);
		});

		it("should_detect_japanese_timeout_2", () => {
			const error = new Error("タイムアウト");
			expect(isTimeoutErrorMessage(error)).toBe(true);
		});
	});

	describe("境界条件 - 非タイムアウト", () => {
		it("should_return_false_for_other_errors", () => {
			const error = new Error("Generic error");
			expect(isTimeoutErrorMessage(error)).toBe(false);
		});

		it("should_return_false_for_cancelled", () => {
			const error = new Error("Request cancelled");
			expect(isTimeoutErrorMessage(error)).toBe(false);
		});

		it("should_return_false_for_empty_message", () => {
			const error = new Error("");
			expect(isTimeoutErrorMessage(error)).toBe(false);
		});

		it("should_return_false_case_insensitive_true", () => {
			const error = new Error("TIMEOUT");
			expect(isTimeoutErrorMessage(error)).toBe(true);
		});
	});

	describe("異常系", () => {
		it("should_handle_null_input", () => {
			expect(isTimeoutErrorMessage(null)).toBe(false);
		});

		it("should_handle_string_input", () => {
			expect(isTimeoutErrorMessage("Request timed out")).toBe(true);
		});
	});

	describe("プロパティベーステスト", () => {
		it("PBT: 結果は常にbooleanである", () => {
			fc.assert(
				fc.property(fc.string(), (message) => {
					const error = new Error(message);
					const result = isTimeoutErrorMessage(error);
					return typeof result === "boolean";
				}),
				{ numRuns: 100 },
			);
		});

		it("PBT: タイムアウトキーワードを含むメッセージはtrueを返す", () => {
			const timeoutKeywords = ["timeout", "timed out", "time out", "時間切れ", "タイムアウト"];

			fc.assert(
				fc.property(fc.constantFrom(...timeoutKeywords), (keyword) => {
					const error = new Error(`Request ${keyword}`);
					return isTimeoutErrorMessage(error) === true;
				}),
				{ numRuns: 10 },
			);
		});
	});
});
