/**
 * @file .pi/lib/model-timeouts.ts の単体テスト
 * @description モデル別タイムアウト設定のテスト
 * @testFramework vitest + fast-check
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";

// モジュールをインポート
import {
	MODEL_TIMEOUT_BASE_MS,
	THINKING_LEVEL_MULTIPLIERS,
	getModelBaseTimeoutMs,
	computeModelTimeoutMs,
	computeProgressiveTimeoutMs,
	type ComputeModelTimeoutOptions,
} from "../../lib/agent/model-timeouts.js";
import type { ThinkingLevel } from "../../lib/agent/agent-types.js";

// ============================================================================
// MODEL_TIMEOUT_BASE_MS
// ============================================================================

describe("MODEL_TIMEOUT_BASE_MS", () => {
	it("should_have_default_timeout", () => {
		expect(MODEL_TIMEOUT_BASE_MS.default).toBeDefined();
		expect(MODEL_TIMEOUT_BASE_MS.default).toBeGreaterThan(0);
	});

	it("should_have_slow_model_timeouts", () => {
		// 遅いモデルはより長いタイムアウト
		expect(MODEL_TIMEOUT_BASE_MS["glm-5"]).toBeGreaterThan(
			MODEL_TIMEOUT_BASE_MS.default,
		);
		expect(MODEL_TIMEOUT_BASE_MS["glm-4"]).toBeGreaterThan(
			MODEL_TIMEOUT_BASE_MS.default,
		);
	});

	it("should_all_values_be_positive", () => {
		for (const [model, timeout] of Object.entries(MODEL_TIMEOUT_BASE_MS)) {
			expect(timeout).toBeGreaterThan(0);
		}
	});
});

// ============================================================================
// THINKING_LEVEL_MULTIPLIERS
// ============================================================================

describe("THINKING_LEVEL_MULTIPLIERS", () => {
	it("should_have_multiplier_for_all_levels", () => {
		const expectedLevels: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"];
		for (const level of expectedLevels) {
			expect(THINKING_LEVEL_MULTIPLIERS[level]).toBeDefined();
		}
	});

	it("should_increase_with_thinking_level", () => {
		expect(THINKING_LEVEL_MULTIPLIERS.off).toBeLessThan(
			THINKING_LEVEL_MULTIPLIERS.minimal,
		);
		expect(THINKING_LEVEL_MULTIPLIERS.minimal).toBeLessThan(
			THINKING_LEVEL_MULTIPLIERS.low,
		);
		expect(THINKING_LEVEL_MULTIPLIERS.low).toBeLessThan(
			THINKING_LEVEL_MULTIPLIERS.medium,
		);
		expect(THINKING_LEVEL_MULTIPLIERS.medium).toBeLessThan(
			THINKING_LEVEL_MULTIPLIERS.high,
		);
		expect(THINKING_LEVEL_MULTIPLIERS.high).toBeLessThan(
			THINKING_LEVEL_MULTIPLIERS.xhigh,
		);
	});

	it("should_all_values_be_positive", () => {
		for (const [level, multiplier] of Object.entries(
			THINKING_LEVEL_MULTIPLIERS,
		)) {
			expect(multiplier).toBeGreaterThan(0);
		}
	});
});

// ============================================================================
// getModelBaseTimeoutMs
// ============================================================================

describe("getModelBaseTimeoutMs", () => {
	describe("完全一致", () => {
		it("should_return_exact_match_timeout", () => {
			expect(getModelBaseTimeoutMs("claude-3-5-sonnet")).toBe(
				MODEL_TIMEOUT_BASE_MS["claude-3-5-sonnet"],
			);
			expect(getModelBaseTimeoutMs("gpt-4")).toBe(MODEL_TIMEOUT_BASE_MS["gpt-4"]);
		});

		it("should_be_case_insensitive", () => {
			expect(getModelBaseTimeoutMs("CLAUDE-3-5-SONNET")).toBe(
				MODEL_TIMEOUT_BASE_MS["claude-3-5-sonnet"],
			);
			expect(getModelBaseTimeoutMs("GPT-4")).toBe(MODEL_TIMEOUT_BASE_MS["gpt-4"]);
		});
	});

	describe("部分一致", () => {
		it("should_match_partial_model_id", () => {
			// gpt-4を含むモデルID
			expect(getModelBaseTimeoutMs("openai-gpt-4-turbo")).toBe(
				MODEL_TIMEOUT_BASE_MS["gpt-4"],
			);
		});

		it("should_prioritize_exact_over_partial", () => {
			// 完全一致が優先される
			const exact = getModelBaseTimeoutMs("claude-3-5-sonnet");
			const partial = getModelBaseTimeoutMs("anthropic-claude-3-5-sonnet-v2");
			expect(exact).toBe(MODEL_TIMEOUT_BASE_MS["claude-3-5-sonnet"]);
			expect(partial).toBe(MODEL_TIMEOUT_BASE_MS["claude-3-5-sonnet"]);
		});
	});

	describe("デフォルト", () => {
		it("should_return_default_for_unknown_model", () => {
			expect(getModelBaseTimeoutMs("unknown-model-xyz")).toBe(
				MODEL_TIMEOUT_BASE_MS.default,
			);
		});

		it("should_return_default_for_empty_string", () => {
			expect(getModelBaseTimeoutMs("")).toBe(MODEL_TIMEOUT_BASE_MS.default);
		});
	});

	describe("境界条件", () => {
		it("should_handle_non_string_input", () => {
			expect(getModelBaseTimeoutMs(null as unknown as string)).toBe(
				MODEL_TIMEOUT_BASE_MS.default,
			);
			expect(getModelBaseTimeoutMs(undefined as unknown as string)).toBe(
				MODEL_TIMEOUT_BASE_MS.default,
			);
			expect(getModelBaseTimeoutMs(123 as unknown as string)).toBe(
				MODEL_TIMEOUT_BASE_MS.default,
			);
		});
	});

	describe("プロパティベーステスト", () => {
		it("PBT: 常に正の整数を返す", () => {
			fc.assert(
				fc.property(fc.string({ maxLength: 100 }), (modelId) => {
					const result = getModelBaseTimeoutMs(modelId);
					return typeof result === "number" && result > 0;
				}),
				{ numRuns: 50 },
			);
		});
	});
});

// ============================================================================
// computeModelTimeoutMs
// ============================================================================

describe("computeModelTimeoutMs", () => {
	describe("ユーザー指定タイムアウト", () => {
		it("should_use_user_timeout_if_provided", () => {
			const options: ComputeModelTimeoutOptions = { userTimeoutMs: 5000 };
			const result = computeModelTimeoutMs("gpt-4", options);
			expect(result).toBe(5000);
		});

		it("should_ignore_user_timeout_if_zero", () => {
			const options: ComputeModelTimeoutOptions = { userTimeoutMs: 0 };
			const result = computeModelTimeoutMs("gpt-4", options);
			// 0は無視される
			expect(result).toBeGreaterThan(0);
		});

		it("should_ignore_user_timeout_if_negative", () => {
			const options: ComputeModelTimeoutOptions = { userTimeoutMs: -100 };
			const result = computeModelTimeoutMs("gpt-4", options);
			expect(result).toBeGreaterThan(0);
		});

		it("should_prioritize_user_timeout_over_thinking_level", () => {
			const options: ComputeModelTimeoutOptions = {
				userTimeoutMs: 5000,
				thinkingLevel: "xhigh",
			};
			const result = computeModelTimeoutMs("gpt-4", options);
			expect(result).toBe(5000);
		});
	});

	describe("思考レベル", () => {
		it("should_apply_thinking_level_multiplier", () => {
			const baseResult = computeModelTimeoutMs("gpt-4");
			const highResult = computeModelTimeoutMs("gpt-4", { thinkingLevel: "high" });

			expect(highResult).toBe(
				Math.floor(MODEL_TIMEOUT_BASE_MS["gpt-4"] * THINKING_LEVEL_MULTIPLIERS.high),
			);
			expect(highResult).toBeGreaterThan(baseResult);
		});

		it("should_use_medium_as_default_thinking_level", () => {
			const result = computeModelTimeoutMs("gpt-4");
			const expected = Math.floor(
				MODEL_TIMEOUT_BASE_MS["gpt-4"] * THINKING_LEVEL_MULTIPLIERS.medium,
			);
			expect(result).toBe(expected);
		});

		it("should_use_medium_for_default_thinking_level", () => {
			const result = computeModelTimeoutMs("gpt-4");
			const expected = Math.floor(
				MODEL_TIMEOUT_BASE_MS["gpt-4"] * THINKING_LEVEL_MULTIPLIERS.medium,
			);
			expect(result).toBe(expected);
		});
	});

	describe("オプションなし", () => {
		it("should_work_without_options", () => {
			const result = computeModelTimeoutMs("gpt-4");
			expect(result).toBeGreaterThan(0);
		});
	});

	describe("境界条件", () => {
		it("should_return_integer", () => {
			const result = computeModelTimeoutMs("gpt-4", { thinkingLevel: "high" });
			expect(Number.isInteger(result)).toBe(true);
		});

		it("should_handle_unknown_model", () => {
			const result = computeModelTimeoutMs("unknown-model");
			expect(result).toBeGreaterThan(0);
		});
	});

	describe("プロパティベーステスト", () => {
		it("PBT: 常に正の整数を返す", () => {
			fc.assert(
				fc.property(
					fc.string({ maxLength: 50 }),
					fc.option(
						fc.record({
							userTimeoutMs: fc.option(fc.integer({ min: 0, max: 1000000 }), { nil: undefined }),
							thinkingLevel: fc.option(
								fc.constantFrom<ThinkingLevel>("off", "minimal", "low", "medium", "high", "xhigh"),
								{ nil: undefined },
							),
						}),
						{ nil: undefined },
					),
					(modelId, options) => {
						const result = computeModelTimeoutMs(modelId, options);
						return typeof result === "number" && result > 0;
					},
				),
				{ numRuns: 30 },
			);
		});
	});
});

// ============================================================================
// computeProgressiveTimeoutMs
// ============================================================================

describe("computeProgressiveTimeoutMs", () => {
	describe("正常系", () => {
		it("should_return_base_for_attempt_0", () => {
			const result = computeProgressiveTimeoutMs(1000, 0);
			expect(result).toBe(1000);
		});

		it("should_increase_with_attempt", () => {
			const base = 1000;
			const attempt0 = computeProgressiveTimeoutMs(base, 0);
			const attempt1 = computeProgressiveTimeoutMs(base, 1);
			const attempt2 = computeProgressiveTimeoutMs(base, 2);

			expect(attempt1).toBeGreaterThan(attempt0);
			expect(attempt2).toBeGreaterThan(attempt1);
		});

		it("should_cap_at_2x", () => {
			const base = 1000;
			// 多くの試行回数でも2倍を超えない
			const result = computeProgressiveTimeoutMs(base, 100);
			expect(result).toBeLessThanOrEqual(base * 2);
		});
	});

	describe("増加率", () => {
		it("should_increase_by_25_percent_per_attempt", () => {
			const base = 1000;
			// 試行0: 1.0x
			expect(computeProgressiveTimeoutMs(base, 0)).toBe(1000);
			// 試行1: 1.25x
			expect(computeProgressiveTimeoutMs(base, 1)).toBe(1250);
			// 試行2: 1.5x
			expect(computeProgressiveTimeoutMs(base, 2)).toBe(1500);
			// 試行4: 2.0x (cap)
			expect(computeProgressiveTimeoutMs(base, 4)).toBe(2000);
		});
	});

	describe("境界条件", () => {
		it("should_handle_zero_base", () => {
			const result = computeProgressiveTimeoutMs(0, 5);
			expect(result).toBe(0);
		});

		it("should_handle_negative_base", () => {
			const result = computeProgressiveTimeoutMs(-1000, 5);
			expect(result).toBe(-2000); // Math.floor(-1000 * 2)
		});

		it("should_return_integer", () => {
			const result = computeProgressiveTimeoutMs(1000.5, 3);
			expect(Number.isInteger(result)).toBe(true);
		});
	});

	describe("プロパティベーステスト", () => {
		it("PBT: 結果はbase以上、base*2以下", () => {
			fc.assert(
				fc.property(
					fc.integer({ min: 1, max: 100000 }),
					fc.integer({ min: 0, max: 100 }),
					(base, attempt) => {
						const result = computeProgressiveTimeoutMs(base, attempt);
						return result >= base && result <= base * 2;
					},
				),
				{ numRuns: 50 },
			);
		});

		it("PBT: より大きな試行回数はより大きなタイムアウト", () => {
			fc.assert(
				fc.property(
					fc.integer({ min: 1, max: 100000 }),
					fc.integer({ min: 0, max: 10 }),
					fc.integer({ min: 0, max: 10 }),
					(base, attempt1, attempt2) => {
						if (attempt1 <= attempt2) {
							const result1 = computeProgressiveTimeoutMs(base, attempt1);
							const result2 = computeProgressiveTimeoutMs(base, attempt2);
							return result1 <= result2;
						}
						return true;
					},
				),
				{ numRuns: 50 },
			);
		});
	});
});

// ============================================================================
// 統合テスト
// ============================================================================

describe("統合テスト", () => {
	describe("実際のユースケース", () => {
		it("should_handle_slow_model_with_high_thinking", () => {
			const result = computeModelTimeoutMs("glm-5", { thinkingLevel: "xhigh" });
			const expected = Math.floor(
				MODEL_TIMEOUT_BASE_MS["glm-5"] * THINKING_LEVEL_MULTIPLIERS.xhigh,
			);
			expect(result).toBe(expected);
			// GLM-5 + xhigh should have very long timeout
			expect(result).toBeGreaterThan(600000); // > 10 minutes
		});

		it("should_handle_fast_model_with_low_thinking", () => {
			const result = computeModelTimeoutMs("gpt-3.5-turbo", {
				thinkingLevel: "low",
			});
			const expected = Math.floor(
				MODEL_TIMEOUT_BASE_MS["gpt-3.5-turbo"] * THINKING_LEVEL_MULTIPLIERS.low,
			);
			expect(result).toBe(expected);
		});

		it("should_respect_user_override_for_slow_model", () => {
			// ユーザーが明示的に短いタイムアウトを指定
			const result = computeModelTimeoutMs("glm-5", { userTimeoutMs: 60000 });
			expect(result).toBe(60000);
		});
	});
});
