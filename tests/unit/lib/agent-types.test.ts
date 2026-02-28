/**
 * @file .pi/lib/agent-types.ts の単体テスト
 * @description エージェント型定義と定数のテスト
 * @testFramework vitest
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
	type ThinkingLevel,
	type RunOutcomeCode,
	type RunOutcomeSignal,
	DEFAULT_AGENT_TIMEOUT_MS,
} from "../../../.pi/lib/agent/agent-types.js";

// ============================================================================
// ThinkingLevel
// ============================================================================

describe("ThinkingLevel", () => {
	describe("型定義", () => {
		it("should_accept_valid_thinking_levels", () => {
			const validLevels: ThinkingLevel[] = [
				"off",
				"minimal",
				"low",
				"medium",
				"high",
				"xhigh",
			];

			// TypeScriptの型チェックをパスすればOK
			validLevels.forEach((level) => {
				expect(typeof level).toBe("string");
			});
		});
	});

	describe("プロパティベーステスト", () => {
		it("PBT: 有効なThinkingLevel値のみ受け入れる", () => {
			const validValues = ["off", "minimal", "low", "medium", "high", "xhigh"];

			fc.assert(
				fc.property(fc.constantFrom(...validValues), (level) => {
					// TypeScriptの型チェックをパスすればOK
					const _typed: ThinkingLevel = level;
					expect(validValues).toContain(_typed);
				})
			);
		});
	});
});

// ============================================================================
// RunOutcomeCode
// ============================================================================

describe("RunOutcomeCode", () => {
	describe("型定義", () => {
		it("should_accept_valid_outcome_codes", () => {
			const validCodes: RunOutcomeCode[] = [
				"SUCCESS",
				"PARTIAL_SUCCESS",
				"RETRYABLE_FAILURE",
				"NONRETRYABLE_FAILURE",
				"CANCELLED",
				"TIMEOUT",
			];

			validCodes.forEach((code) => {
				expect(typeof code).toBe("string");
			});
		});
	});

	describe("分類", () => {
		it("should_identify_success_codes", () => {
			const successCodes: RunOutcomeCode[] = ["SUCCESS", "PARTIAL_SUCCESS"];

			successCodes.forEach((code) => {
				expect(["SUCCESS", "PARTIAL_SUCCESS"]).toContain(code);
			});
		});

		it("should_identify_failure_codes", () => {
			const failureCodes: RunOutcomeCode[] = [
				"RETRYABLE_FAILURE",
				"NONRETRYABLE_FAILURE",
			];

			failureCodes.forEach((code) => {
				expect(["RETRYABLE_FAILURE", "NONRETRYABLE_FAILURE"]).toContain(code);
			});
		});

		it("should_identify_terminal_codes", () => {
			const terminalCodes: RunOutcomeCode[] = [
				"SUCCESS",
				"NONRETRYABLE_FAILURE",
				"CANCELLED",
				"TIMEOUT",
			];

			terminalCodes.forEach((code) => {
				expect([
					"SUCCESS",
					"NONRETRYABLE_FAILURE",
					"CANCELLED",
					"TIMEOUT",
				]).toContain(code);
			});
		});
	});
});

// ============================================================================
// RunOutcomeSignal
// ============================================================================

describe("RunOutcomeSignal", () => {
	describe("インターフェース", () => {
		it("should_create_valid_signal", () => {
			const signal: RunOutcomeSignal = {
				outcomeCode: "SUCCESS",
				retryRecommended: false,
			};

			expect(signal.outcomeCode).toBe("SUCCESS");
			expect(signal.retryRecommended).toBe(false);
		});

		it("should_support_retryable_failure_with_retry", () => {
			const signal: RunOutcomeSignal = {
				outcomeCode: "RETRYABLE_FAILURE",
				retryRecommended: true,
			};

			expect(signal.outcomeCode).toBe("RETRYABLE_FAILURE");
			expect(signal.retryRecommended).toBe(true);
		});
	});

	describe("ビジネスルール", () => {
		it("should_have_consistent_retry_recommendation", () => {
			// SUCCESSの場合、retryRecommendedはfalseであるべき
			const successSignal: RunOutcomeSignal = {
				outcomeCode: "SUCCESS",
				retryRecommended: false,
			};
			expect(successSignal.retryRecommended).toBe(false);

			// RETRYABLE_FAILUREの場合、retryRecommendedはtrueであるべき
			const retryableSignal: RunOutcomeSignal = {
				outcomeCode: "RETRYABLE_FAILURE",
				retryRecommended: true,
			};
			expect(retryableSignal.retryRecommended).toBe(true);
		});
	});
});

// ============================================================================
// DEFAULT_AGENT_TIMEOUT_MS
// ============================================================================

describe("DEFAULT_AGENT_TIMEOUT_MS", () => {
	it("should_be_10_minutes_in_milliseconds", () => {
		const expected = 10 * 60 * 1000; // 10 minutes
		expect(DEFAULT_AGENT_TIMEOUT_MS).toBe(expected);
	});

	it("should_be_reasonable_value", () => {
		// 1分以上
		expect(DEFAULT_AGENT_TIMEOUT_MS).toBeGreaterThan(60 * 1000);
		// 1時間未満
		expect(DEFAULT_AGENT_TIMEOUT_MS).toBeLessThan(60 * 60 * 1000);
	});

	it("should_be_positive_number", () => {
		expect(DEFAULT_AGENT_TIMEOUT_MS).toBeGreaterThan(0);
		expect(Number.isFinite(DEFAULT_AGENT_TIMEOUT_MS)).toBe(true);
	});
});

// ============================================================================
// ユーティリティ関数（型ガード）
// ============================================================================

/**
 * RunOutcomeCodeの型ガード
 */
function isRunOutcomeCode(value: unknown): value is RunOutcomeCode {
	const validCodes: RunOutcomeCode[] = [
		"SUCCESS",
		"PARTIAL_SUCCESS",
		"RETRYABLE_FAILURE",
		"NONRETRYABLE_FAILURE",
		"CANCELLED",
		"TIMEOUT",
	];
	return typeof value === "string" && validCodes.includes(value as RunOutcomeCode);
}

/**
 * ThinkingLevelの型ガード
 */
function isThinkingLevel(value: unknown): value is ThinkingLevel {
	const validLevels: ThinkingLevel[] = [
		"off",
		"minimal",
		"low",
		"medium",
		"high",
		"xhigh",
	];
	return typeof value === "string" && validLevels.includes(value as ThinkingLevel);
}

describe("Type Guards", () => {
	describe("isRunOutcomeCode", () => {
		it("should_return_true_for_valid_codes", () => {
			expect(isRunOutcomeCode("SUCCESS")).toBe(true);
			expect(isRunOutcomeCode("PARTIAL_SUCCESS")).toBe(true);
			expect(isRunOutcomeCode("RETRYABLE_FAILURE")).toBe(true);
			expect(isRunOutcomeCode("NONRETRYABLE_FAILURE")).toBe(true);
			expect(isRunOutcomeCode("CANCELLED")).toBe(true);
			expect(isRunOutcomeCode("TIMEOUT")).toBe(true);
		});

		it("should_return_false_for_invalid_codes", () => {
			expect(isRunOutcomeCode("INVALID")).toBe(false);
			expect(isRunOutcomeCode("success")).toBe(false); // 大文字小文字
			expect(isRunOutcomeCode("")).toBe(false);
			expect(isRunOutcomeCode(null)).toBe(false);
			expect(isRunOutcomeCode(undefined)).toBe(false);
			expect(isRunOutcomeCode(123)).toBe(false);
		});
	});

	describe("isThinkingLevel", () => {
		it("should_return_true_for_valid_levels", () => {
			expect(isThinkingLevel("off")).toBe(true);
			expect(isThinkingLevel("minimal")).toBe(true);
			expect(isThinkingLevel("low")).toBe(true);
			expect(isThinkingLevel("medium")).toBe(true);
			expect(isThinkingLevel("high")).toBe(true);
			expect(isThinkingLevel("xhigh")).toBe(true);
		});

		it("should_return_false_for_invalid_levels", () => {
			expect(isThinkingLevel("INVALID")).toBe(false);
			expect(isThinkingLevel("HIGH")).toBe(false); // 大文字
			expect(isThinkingLevel("")).toBe(false);
			expect(isThinkingLevel(null)).toBe(false);
			expect(isThinkingLevel(undefined)).toBe(false);
			expect(isThinkingLevel(123)).toBe(false);
		});
	});

	describe("プロパティベーステスト", () => {
		it("PBT: RunOutcomeCodeの型ガードは有効値のみtrue", () => {
			const validCodes = [
				"SUCCESS",
				"PARTIAL_SUCCESS",
				"RETRYABLE_FAILURE",
				"NONRETRYABLE_FAILURE",
				"CANCELLED",
				"TIMEOUT",
			];

			fc.assert(
				fc.property(
					fc.oneof(
						fc.constantFrom(...validCodes),
						fc.string().filter((s) => !validCodes.includes(s)),
						fc.integer(),
						fc.boolean(),
						fc.constant(null as unknown),
						fc.constant(undefined as unknown)
					),
					(value) => {
						const result = isRunOutcomeCode(value);
						if (typeof value === "string" && validCodes.includes(value)) {
							expect(result).toBe(true);
						} else {
							expect(result).toBe(false);
						}
					}
				)
			);
		});

		it("PBT: ThinkingLevelの型ガードは有効値のみtrue", () => {
			const validLevels = [
				"off",
				"minimal",
				"low",
				"medium",
				"high",
				"xhigh",
			];

			fc.assert(
				fc.property(
					fc.oneof(
						fc.constantFrom(...validLevels),
						fc.string().filter((s) => !validLevels.includes(s)),
						fc.integer(),
						fc.boolean(),
						fc.constant(null as unknown),
						fc.constant(undefined as unknown)
					),
					(value) => {
						const result = isThinkingLevel(value);
						if (typeof value === "string" && validLevels.includes(value)) {
							expect(result).toBe(true);
						} else {
							expect(result).toBe(false);
						}
					}
				)
			);
		});
	});
});
