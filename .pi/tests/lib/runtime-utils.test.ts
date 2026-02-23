/**
 * @file .pi/lib/runtime-utils.ts の単体テスト
 * @description ランタイムユーティリティのテスト
 * @testFramework vitest + fast-check
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";

// モジュールをインポート
import {
	trimForError,
	buildRateLimitKey,
	buildTraceTaskId,
	normalizeTimeoutMs,
	toConcurrencyLimit,
	toRetryOverrides,
} from "../../lib/runtime-utils.js";

// ============================================================================
// trimForError
// ============================================================================

describe("trimForError", () => {
	describe("正常系", () => {
		it("should_return_original_string_if_short", () => {
			const short = "Short message";
			expect(trimForError(short)).toBe(short);
		});

		it("should_normalize_whitespace", () => {
			expect(trimForError("  hello   world  ")).toBe("hello world");
		});

		it("should_handle_newlines", () => {
			expect(trimForError("hello\nworld\ntest")).toBe("hello world test");
		});

		it("should_handle_tabs", () => {
			expect(trimForError("hello\tworld")).toBe("hello world");
		});

		it("should_truncate_long_messages", () => {
			const long = "a".repeat(700);
			const result = trimForError(long);
			expect(result.length).toBe(603); // 600 + "..."
			expect(result.endsWith("...")).toBe(true);
		});
	});

	describe("境界条件", () => {
		it("should_handle_empty_string", () => {
			expect(trimForError("")).toBe("");
		});

		it("should_handle_whitespace_only", () => {
			expect(trimForError("   \n\t  ")).toBe("");
		});

		it("should_respect_custom_max_length", () => {
			const message = "a".repeat(100);
			const result = trimForError(message, 50);
			expect(result.length).toBe(53); // 50 + "..."
		});

		it("should_handle_exact_max_length", () => {
			const message = "a".repeat(600);
			expect(trimForError(message)).toBe(message);
		});

		it("should_handle_max_length_0", () => {
			expect(trimForError("test", 0)).toBe("...");
		});

		it("should_handle_unicode_characters", () => {
			const unicode = "日本語テスト 🎉";
			expect(trimForError(unicode)).toBe("日本語テスト 🎉");
		});
	});

	describe("プロパティベーステスト", () => {
		it("PBT: 結果は常に指定された最大長以下", () => {
			fc.assert(
				fc.property(
					fc.string({ maxLength: 1000 }),
					fc.integer({ min: 3, max: 1000 }),
					(input, maxLength) => {
						const result = trimForError(input, maxLength);
						return result.length <= maxLength + 3;
					},
				),
				{ numRuns: 50 },
			);
		});

		it("PBT: 結果に連続する空白はない", () => {
			fc.assert(
				fc.property(fc.string({ maxLength: 500 }), (input) => {
					const result = trimForError(input);
					return !result.includes("  ");
				}),
				{ numRuns: 50 },
			);
		});
	});
});

// ============================================================================
// buildRateLimitKey
// ============================================================================

describe("buildRateLimitKey", () => {
	describe("正常系", () => {
		it("should_build_key_from_provider_and_model", () => {
			expect(buildRateLimitKey("OpenAI", "GPT-4")).toBe("openai::gpt-4");
		});

		it("should_convert_to_lowercase", () => {
			expect(buildRateLimitKey("OPENAI", "GPT-4O")).toBe("openai::gpt-4o");
		});

		it("should_handle_mixed_case", () => {
			expect(buildRateLimitKey("AnThRoPiC", "ClAuDe")).toBe("anthropic::claude");
		});
	});

	describe("境界条件", () => {
		it("should_handle_empty_provider", () => {
			expect(buildRateLimitKey("", "model")).toBe("::model");
		});

		it("should_handle_empty_model", () => {
			expect(buildRateLimitKey("provider", "")).toBe("provider::");
		});

		it("should_handle_both_empty", () => {
			expect(buildRateLimitKey("", "")).toBe("::");
		});

		it("should_handle_special_characters", () => {
			expect(buildRateLimitKey("Provider-Test", "Model_v1.2")).toBe(
				"provider-test::model_v1.2",
			);
		});
	});

	describe("プロパティベーステスト", () => {
		it("PBT: 結果は常に小文字", () => {
			fc.assert(
				fc.property(
					fc.string({ minLength: 1, maxLength: 50 }),
					fc.string({ minLength: 1, maxLength: 50 }),
					(provider, model) => {
						const result = buildRateLimitKey(provider, model);
						return result === result.toLowerCase();
					},
				),
				{ numRuns: 50 },
			);
		});

		it("PBT: 結果には::が1つ含まれる", () => {
			fc.assert(
				fc.property(
					fc.string({ maxLength: 50 }),
					fc.string({ maxLength: 50 }),
					(provider, model) => {
						const result = buildRateLimitKey(provider, model);
						return result.split("::").length === 2;
					},
				),
				{ numRuns: 50 },
			);
		});
	});
});

// ============================================================================
// buildTraceTaskId
// ============================================================================

describe("buildTraceTaskId", () => {
	describe("正常系", () => {
		it("should_build_trace_id", () => {
			const result = buildTraceTaskId("trace-123", "delegate-456", 1);
			expect(result).toBe("trace-123:delegate-456:1");
		});

		it("should_handle_undefined_trace_id", () => {
			const result = buildTraceTaskId(undefined, "delegate-456", 1);
			expect(result).toBe("trace-unknown:delegate-456:1");
		});

		it("should_handle_empty_trace_id", () => {
			const result = buildTraceTaskId("", "delegate-456", 1);
			expect(result).toBe("trace-unknown:delegate-456:1");
		});

		it("should_truncate_sequence_to_positive_integer", () => {
			expect(buildTraceTaskId("trace", "delegate", -5)).toBe(
				"trace:delegate:0",
			);
			expect(buildTraceTaskId("trace", "delegate", 3.7)).toBe(
				"trace:delegate:3",
			);
		});
	});

	describe("境界条件", () => {
		it("should_handle_undefined_delegate_id", () => {
			const result = buildTraceTaskId("trace-123", undefined, 1);
			expect(result).toBe("trace-123:delegate-unknown:1");
		});

		it("should_handle_whitespace_only_ids", () => {
			// 空白のみは trim 後も空文字になり、"trace-unknown" には変換されない
			const result = buildTraceTaskId("   ", "   ", 1);
			expect(result).toBe("::1");
		});

		it("should_trim_ids", () => {
			const result = buildTraceTaskId("  trace  ", "  delegate  ", 1);
			expect(result).toBe("trace:delegate:1");
		});

		it("should_handle_large_sequence", () => {
			const result = buildTraceTaskId("trace", "delegate", 999999);
			expect(result).toBe("trace:delegate:999999");
		});
	});
});

// ============================================================================
// normalizeTimeoutMs
// ============================================================================

describe("normalizeTimeoutMs", () => {
	describe("正常系", () => {
		it("should_return_positive_integer", () => {
			expect(normalizeTimeoutMs(5000, 1000)).toBe(5000);
			expect(normalizeTimeoutMs(1000, 500)).toBe(1000);
		});

		it("should_use_fallback_for_undefined", () => {
			expect(normalizeTimeoutMs(undefined, 3000)).toBe(3000);
		});

		it("should_truncate_decimal", () => {
			expect(normalizeTimeoutMs(1500.7, 1000)).toBe(1500);
		});
	});

	describe("境界条件", () => {
		it("should_return_0_for_zero", () => {
			expect(normalizeTimeoutMs(0, 1000)).toBe(0);
		});

		it("should_return_0_for_negative", () => {
			expect(normalizeTimeoutMs(-100, 1000)).toBe(0);
		});

		it("should_return_fallback_for_NaN", () => {
			expect(normalizeTimeoutMs(NaN, 1000)).toBe(1000);
		});

		it("should_return_fallback_for_Infinity", () => {
			expect(normalizeTimeoutMs(Infinity, 1000)).toBe(1000);
			expect(normalizeTimeoutMs(-Infinity, 1000)).toBe(1000);
		});

		it("should_return_fallback_for_objects", () => {
			expect(normalizeTimeoutMs({ toString: () => "1000" }, 500)).toBe(500);
		});

		it("should_return_fallback_for_arrays", () => {
			expect(normalizeTimeoutMs([1000], 500)).toBe(500);
		});

		it("should_return_fallback_for_string", () => {
			expect(normalizeTimeoutMs("5000", 1000)).toBe(5000);
		});

		it("should_return_minimum_1_for_positive_values", () => {
			expect(normalizeTimeoutMs(0.5, 1000)).toBe(1);
		});
	});

	describe("プロパティベーステスト", () => {
		it("PBT: 結果は常に0以上の整数またはフォールバック", () => {
			fc.assert(
				fc.property(
					fc.anything(),
					fc.integer({ min: 1, max: 10000 }),
					(value, fallback) => {
						const result = normalizeTimeoutMs(value, fallback);
						return (
							(Number.isInteger(result) && result >= 0) || result === fallback
						);
					},
				),
				{ numRuns: 50 },
			);
		});
	});
});

// ============================================================================
// toConcurrencyLimit
// ============================================================================

describe("toConcurrencyLimit", () => {
	describe("正常系", () => {
		it("should_return_positive_integer", () => {
			expect(toConcurrencyLimit(5, 1)).toBe(5);
			expect(toConcurrencyLimit(10, 1)).toBe(10);
		});

		it("should_use_fallback_for_undefined", () => {
			expect(toConcurrencyLimit(undefined, 3)).toBe(3);
		});

		it("should_truncate_decimal", () => {
			expect(toConcurrencyLimit(3.9, 1)).toBe(3);
		});
	});

	describe("境界条件", () => {
		it("should_return_fallback_for_zero", () => {
			expect(toConcurrencyLimit(0, 5)).toBe(5);
		});

		it("should_return_fallback_for_negative", () => {
			expect(toConcurrencyLimit(-5, 3)).toBe(3);
		});

		it("should_return_fallback_for_NaN", () => {
			expect(toConcurrencyLimit(NaN, 2)).toBe(2);
		});

		it("should_return_fallback_for_Infinity", () => {
			expect(toConcurrencyLimit(Infinity, 4)).toBe(4);
		});

		it("should_return_fallback_for_objects", () => {
			expect(toConcurrencyLimit({ toString: () => "5" }, 2)).toBe(2);
		});

		it("should_return_fallback_for_arrays", () => {
			expect(toConcurrencyLimit([5], 2)).toBe(2);
		});

		it("should_return_1_for_small_positive_values", () => {
			// 0.5 → Math.trunc(0.5) = 0 だが、resolved > 0 なので Math.max(1, 0) = 1
			expect(toConcurrencyLimit(0.5, 5)).toBe(1);
			expect(toConcurrencyLimit(0.1, 10)).toBe(1);
		});
	});

	describe("プロパティベーステスト", () => {
		it("PBT: 結果は常に1以上", () => {
			fc.assert(
				fc.property(
					fc.anything(),
					fc.integer({ min: 1, max: 100 }),
					(value, fallback) => {
						const result = toConcurrencyLimit(value, fallback);
						return result >= 1;
					},
				),
				{ numRuns: 50 },
			);
		});
	});
});

// ============================================================================
// toRetryOverrides
// ============================================================================

describe("toRetryOverrides", () => {
	describe("正常系", () => {
		it("should_convert_valid_object", () => {
			const input = {
				maxRetries: 3,
				initialDelayMs: 100,
				maxDelayMs: 1000,
				multiplier: 2,
				jitter: "full" as const,
			};
			const result = toRetryOverrides(input);

			expect(result).toEqual(input);
		});

		it("should_return_undefined_for_null", () => {
			expect(toRetryOverrides(null)).toBeUndefined();
		});

		it("should_return_undefined_for_undefined", () => {
			expect(toRetryOverrides(undefined)).toBeUndefined();
		});

		it("should_return_undefined_for_non_object", () => {
			expect(toRetryOverrides("string")).toBeUndefined();
			expect(toRetryOverrides(123)).toBeUndefined();
		});
	});

	describe("部分オブジェクト", () => {
		it("should_handle_partial_input", () => {
			const input = { maxRetries: 3 };
			const result = toRetryOverrides(input);

			expect(result).toEqual({
				maxRetries: 3,
				initialDelayMs: undefined,
				maxDelayMs: undefined,
				multiplier: undefined,
				jitter: undefined,
			});
		});

		it("should_ignore_invalid_jitter", () => {
			const input = { jitter: "invalid" };
			const result = toRetryOverrides(input);

			expect(result?.jitter).toBeUndefined();
		});

		it("should_accept_valid_jitter_values", () => {
			for (const jitter of ["full", "partial", "none"] as const) {
				const result = toRetryOverrides({ jitter });
				expect(result?.jitter).toBe(jitter);
			}
		});

		it("should_ignore_non_number_fields", () => {
			const input = {
				maxRetries: "3",
				initialDelayMs: "100",
			};
			const result = toRetryOverrides(input);

			expect(result?.maxRetries).toBeUndefined();
			expect(result?.initialDelayMs).toBeUndefined();
		});
	});

	describe("境界条件", () => {
		it("should_handle_empty_object", () => {
			const result = toRetryOverrides({});

			expect(result).toEqual({
				maxRetries: undefined,
				initialDelayMs: undefined,
				maxDelayMs: undefined,
				multiplier: undefined,
				jitter: undefined,
			});
		});

		it("should_ignore_extra_fields", () => {
			const input = {
				maxRetries: 3,
				extraField: "should be ignored",
			};
			const result = toRetryOverrides(input);

			expect(result).toEqual({
				maxRetries: 3,
				initialDelayMs: undefined,
				maxDelayMs: undefined,
				multiplier: undefined,
				jitter: undefined,
			});
		});
	});
});
