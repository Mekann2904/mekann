/**
 * @file .pi/lib/verification-simple.ts の単体テスト
 * @description 出力の簡易検証エンジンのテスト
 * @testFramework vitest
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// 依存モジュールをモック
vi.mock("../../lib/verification-workflow.js", () => ({
	detectClaimResultMismatch: vi.fn(),
	detectOverconfidence: vi.fn(),
	detectMissingAlternatives: vi.fn(),
	detectConfirmationBias: vi.fn(),
	isHighStakesTask: vi.fn(),
}));

import {
	verifyOutput,
	simpleVerificationHook,
	type SimpleVerificationResult,
	type SimpleVerificationConfig,
} from "../../lib/verification-simple.js";

import {
	detectClaimResultMismatch,
	detectOverconfidence,
	detectMissingAlternatives,
	detectConfirmationBias,
	isHighStakesTask,
} from "../../lib/verification-workflow.js";

// ============================================================================
// verifyOutput
// ============================================================================

describe("verifyOutput", () => {
	const mockContext = { task: "Test task" };

	beforeEach(() => {
		vi.clearAllMocks();

		// デフォルトのモック動作
		vi.mocked(detectClaimResultMismatch).mockReturnValue({ detected: false, reason: "" });
		vi.mocked(detectOverconfidence).mockReturnValue({ detected: false, reason: "" });
		vi.mocked(detectMissingAlternatives).mockReturnValue({ detected: false, reason: "" });
		vi.mocked(detectConfirmationBias).mockReturnValue({ detected: false, reason: "" });
		vi.mocked(isHighStakesTask).mockReturnValue(false);
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	describe("スキップ条件", () => {
		it("should_skip_for_high_confidence", () => {
			// Arrange
			const output = "Test output";

			// Act
			const result = verifyOutput(output, 0.99, mockContext);

			// Assert
			expect(result.triggered).toBe(false);
			expect(result.verdict).toBe("pass");
			expect(result.triggerReason).toBe("high-confidence-skip");
		});

		it("should_skip_for_empty_output", () => {
			// Arrange
			const output = "";

			// Act
			const result = verifyOutput(output, 0.5, mockContext);

			// Assert
			expect(result.triggered).toBe(false);
			expect(result.triggerReason).toBe("empty-output-skip");
		});

		it("should_skip_for_whitespace_only_output", () => {
			// Arrange
			const output = "   ";

			// Act
			const result = verifyOutput(output, 0.5, mockContext);

			// Assert
			expect(result.triggered).toBe(false);
			expect(result.triggerReason).toBe("empty-output-skip");
		});

		it("should_not_skip_for_high_stakes_even_with_high_confidence", () => {
			// Arrange
			const output = "Test output";
			vi.mocked(isHighStakesTask).mockReturnValue(true);

			// Act
			const result = verifyOutput(output, 0.99, mockContext);

			// Assert
			expect(result.triggered).toBe(true);
			expect(result.triggerReason).toBe("high-stakes-task");
		});
	});

	describe("CLAIM-RESULT不一致検出", () => {
		it("should_detect_claim_result_mismatch", () => {
			// Arrange
			const output = "CLAIM: Completed\nRESULT: Failed";
			vi.mocked(detectClaimResultMismatch).mockReturnValue({
				detected: true,
				reason: "CLAIM says completed but RESULT shows failed",
			});

			// Act
			const result = verifyOutput(output, 0.8, mockContext);

			// Assert
			expect(result.triggered).toBe(true);
			expect(result.issues).toHaveLength(1);
			expect(result.issues[0].type).toBe("claim-result-mismatch");
			expect(result.issues[0].severity).toBe("high");
			expect(result.confidenceAdjustment).toBeCloseTo(0.7);
		});
	});

	describe("過信検出", () => {
		it("should_detect_overconfidence", () => {
			// Arrange
			const output = "This is definitely correct with 100% confidence";
			vi.mocked(detectOverconfidence).mockReturnValue({
				detected: true,
				reason: "Overconfidence detected",
			});

			// Act
			const result = verifyOutput(output, 0.8, mockContext);

			// Assert
			expect(result.triggered).toBe(true);
			expect(result.issues.some(i => i.type === "overconfidence")).toBe(true);
			expect(result.confidenceAdjustment).toBeCloseTo(0.85);
		});
	});

	describe("代替解釈欠如検出", () => {
		it("should_detect_missing_alternatives", () => {
			// Arrange
			const output = "The only solution is...";
			vi.mocked(detectMissingAlternatives).mockReturnValue({
				detected: true,
				reason: "No alternatives considered",
			});

			// Act
			const result = verifyOutput(output, 0.8, mockContext);

			// Assert
			expect(result.triggered).toBe(true);
			expect(result.issues.some(i => i.type === "missing-alternatives")).toBe(true);
			expect(result.confidenceAdjustment).toBeCloseTo(0.9);
		});
	});

	describe("確認バイアス検出", () => {
		it("should_detect_confirmation_bias", () => {
			// Arrange
			const output = "This confirms my hypothesis";
			vi.mocked(detectConfirmationBias).mockReturnValue({
				detected: true,
				reason: "Confirmation bias detected",
			});

			// Act
			const result = verifyOutput(output, 0.8, mockContext);

			// Assert
			expect(result.triggered).toBe(true);
			expect(result.issues.some(i => i.type === "confirmation-bias")).toBe(true);
			expect(result.confidenceAdjustment).toBeCloseTo(0.8);
		});
	});

	describe("判定結果", () => {
		it("should_return_pass_when_no_issues", () => {
			// Arrange
			const output = "Normal output";

			// Act
			const result = verifyOutput(output, 0.8, mockContext);

			// Assert
			expect(result.verdict).toBe("pass");
			expect(result.issues).toHaveLength(0);
		});

		it("should_return_pass_with_warnings_for_low_severity", () => {
			// Arrange
			const output = "Output with minor issues";
			vi.mocked(detectMissingAlternatives).mockReturnValue({
				detected: true,
				reason: "Minor issue",
			});

			// Act
			const result = verifyOutput(output, 0.8, mockContext);

			// Assert
			expect(result.verdict).toBe("pass-with-warnings");
		});

		it("should_return_needs_review_for_high_severity", () => {
			// Arrange
			const output = "Problematic output";
			vi.mocked(detectClaimResultMismatch).mockReturnValue({
				detected: true,
				reason: "Critical mismatch",
			});

			// Act
			const result = verifyOutput(output, 0.8, mockContext);

			// Assert
			expect(result.verdict).toBe("needs-review");
		});

		it("should_return_needs_review_for_high_stakes_with_issues", () => {
			// Arrange
			const output = "Output";
			vi.mocked(isHighStakesTask).mockReturnValue(true);
			vi.mocked(detectMissingAlternatives).mockReturnValue({
				detected: true,
				reason: "Minor issue",
			});

			// Act
			const result = verifyOutput(output, 0.8, mockContext);

			// Assert
			expect(result.verdict).toBe("needs-review");
		});
	});

	describe("信頼度調整", () => {
		it("should_multiply_adjustments_for_multiple_issues", () => {
			// Arrange
			const output = "Problematic output";
			vi.mocked(detectOverconfidence).mockReturnValue({
				detected: true,
				reason: "Overconfidence",
			});
			vi.mocked(detectConfirmationBias).mockReturnValue({
				detected: true,
				reason: "Bias",
			});

			// Act
			const result = verifyOutput(output, 0.8, mockContext);

			// Assert: 0.85 * 0.8 = 0.68
			expect(result.confidenceAdjustment).toBeCloseTo(0.68);
		});
	});

	describe("設定オーバーライド", () => {
		it("should_respect_enableMismatchDetection_false", () => {
			// Arrange
			const output = "Output";
			vi.mocked(detectClaimResultMismatch).mockReturnValue({
				detected: true,
				reason: "Mismatch",
			});
			const config: Partial<SimpleVerificationConfig> = {
				enableMismatchDetection: false,
			};

			// Act
			const result = verifyOutput(output, 0.8, mockContext, config);

			// Assert
			expect(result.issues.some(i => i.type === "claim-result-mismatch")).toBe(false);
		});

		it("should_respect_skipThreshold", () => {
			// Arrange
			const output = "Output";
			const config: Partial<SimpleVerificationConfig> = {
				skipThreshold: 0.5,
			};

			// Act
			const result = verifyOutput(output, 0.6, mockContext, config);

			// Assert: skipThreshold=0.5なので、0.6ではスキップ
			expect(result.triggered).toBe(false);
			expect(result.triggerReason).toBe("high-confidence-skip");
		});
	});

	describe("エラーハンドリング", () => {
		it("should_handle_detection_error", () => {
			// Arrange
			const output = "Output";
			vi.mocked(detectClaimResultMismatch).mockImplementation(() => {
				throw new Error("Detection error");
			});

			// Act
			const result = verifyOutput(output, 0.8, mockContext);

			// Assert
			expect(result.triggered).toBe(false);
			expect(result.triggerReason).toContain("detection-error");
		});
	});
});

// ============================================================================
// simpleVerificationHook
// ============================================================================

describe("simpleVerificationHook", () => {
	const mockContext = { task: "Test task" };

	beforeEach(() => {
		vi.clearAllMocks();

		vi.mocked(detectClaimResultMismatch).mockReturnValue({ detected: false, reason: "" });
		vi.mocked(detectOverconfidence).mockReturnValue({ detected: false, reason: "" });
		vi.mocked(detectMissingAlternatives).mockReturnValue({ detected: false, reason: "" });
		vi.mocked(detectConfirmationBias).mockReturnValue({ detected: false, reason: "" });
		vi.mocked(isHighStakesTask).mockReturnValue(false);
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	it("should_return_triggered_false_for_clean_output", async () => {
		// Arrange
		const output = "Clean output";

		// Act
		const result = await simpleVerificationHook(output, 0.8, mockContext);

		// Assert
		expect(result.triggered).toBe(false);
		expect(result.result).toBeDefined();
		expect(result.error).toBeUndefined();
	});

	it("should_return_triggered_true_for_issues", async () => {
		// Arrange
		const output = "Problematic output";
		vi.mocked(detectOverconfidence).mockReturnValue({
			detected: true,
			reason: "Overconfidence",
		});

		// Act
		const result = await simpleVerificationHook(output, 0.8, mockContext);

		// Assert
		expect(result.triggered).toBe(true);
		expect(result.result?.issues).toHaveLength(1);
	});

	it("should_handle_errors_in_verifyOutput", async () => {
		// Arrange
		const output = "Output";
		vi.mocked(detectClaimResultMismatch).mockImplementation(() => {
			throw new Error("Test error");
		});

		// Act
		const result = await simpleVerificationHook(output, 0.8, mockContext);

		// Assert: verifyOutputがエラーをキャッチしてdetection-errorを返す
		expect(result.triggered).toBe(false);
		expect(result.result?.triggerReason).toContain("detection-error");
	});
});

// ============================================================================
// エッジケース
// ============================================================================

describe("エッジケース", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		vi.mocked(detectClaimResultMismatch).mockReturnValue({ detected: false, reason: "" });
		vi.mocked(detectOverconfidence).mockReturnValue({ detected: false, reason: "" });
		vi.mocked(detectMissingAlternatives).mockReturnValue({ detected: false, reason: "" });
		vi.mocked(detectConfirmationBias).mockReturnValue({ detected: false, reason: "" });
		vi.mocked(isHighStakesTask).mockReturnValue(false);
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	it("should_handle_null_task", () => {
		// Arrange
		const output = "Output";
		const context = { task: null as unknown as string };

		// Act
		const result = verifyOutput(output, 0.8, context);

		// Assert
		expect(result).toBeDefined();
	});

	it("should_handle_undefined_task", () => {
		// Arrange
		const output = "Output";
		const context = { task: undefined as unknown as string };

		// Act
		const result = verifyOutput(output, 0.8, context);

		// Assert
		expect(result).toBeDefined();
	});

	it("should_handle_boundary_confidence_values", () => {
		// Arrange
		const output = "Output";

		// confidence=0.0: 低信頼度なので検証がトリガーされる（ただし問題がなければtriggered=false）
		const resultLow = verifyOutput(output, 0.0, { task: "test" });
		expect(resultLow).toBeDefined();

		// confidence=1.0: 高信頼度なのでスキップされる
		const resultHigh = verifyOutput(output, 1.0, { task: "test" });
		expect(resultHigh.triggered).toBe(false);
		expect(resultHigh.triggerReason).toBe("high-confidence-skip");
	});
});
