/**
 * @file .pi/lib/output-template.ts のテスト
 * @description 出力テンプレート適用のテスト
 * @testFramework vitest
 */

import { describe, it, expect, beforeEach } from "vitest";

import {
	applyOutputTemplate,
	formatNormalizedOutput,
	hasMinimumStructure,
	DEFAULT_OUTPUT_VALUES,
	type NormalizedOutput,
	type SchemaViolation,
} from "../../lib/output-template.js";

// ============================================================================
// Tests
// ============================================================================

describe("output-template", () => {
	// ========================================
	// DEFAULT_OUTPUT_VALUES
	// ========================================

	describe("DEFAULT_OUTPUT_VALUES", () => {
		it("should_have_all_required_fields", () => {
			expect(DEFAULT_OUTPUT_VALUES.SUMMARY).toBeDefined();
			expect(DEFAULT_OUTPUT_VALUES.RESULT).toBeDefined();
			expect(DEFAULT_OUTPUT_VALUES.NEXT_STEP).toBeDefined();
			expect(DEFAULT_OUTPUT_VALUES.CONFIDENCE).toBeDefined();
		});

		it("should_have_valid_confidence_range", () => {
			expect(DEFAULT_OUTPUT_VALUES.CONFIDENCE).toBeGreaterThanOrEqual(0);
			expect(DEFAULT_OUTPUT_VALUES.CONFIDENCE).toBeLessThanOrEqual(1);
		});
	});

	// ========================================
	// applyOutputTemplate
	// ========================================

	describe("applyOutputTemplate", () => {
		it("should_preserve_valid_fields", () => {
			const output = `
SUMMARY: This is a valid summary
RESULT:
This is a valid result with enough content.
NEXT_STEP: Continue with next action
`;

			const result = applyOutputTemplate(output, []);

			expect(result.normalized.SUMMARY).toBe("This is a valid summary");
			expect(result.normalized.RESULT).toContain("This is a valid result");
			expect(result.normalized.NEXT_STEP).toBe("Continue with next action");
			expect(result.preservedFields).toContain("SUMMARY");
			expect(result.preservedFields).toContain("RESULT");
			expect(result.preservedFields).toContain("NEXT_STEP");
		});

		it("should_fill_missing_summary", () => {
			const output = "RESULT: Only result here";
			const violations: SchemaViolation[] = [
				{ field: "SUMMARY", violationType: "missing", expected: "required field" },
			];

			const result = applyOutputTemplate(output, violations);

			expect(result.normalized.SUMMARY).toBe(DEFAULT_OUTPUT_VALUES.SUMMARY);
			expect(result.filledFields).toContain("SUMMARY");
		});

		it("should_fill_missing_result", () => {
			const output = "SUMMARY: Only summary";
			const violations: SchemaViolation[] = [
				{ field: "RESULT", violationType: "missing", expected: "required field" },
			];

			const result = applyOutputTemplate(output, violations);

			expect(result.normalized.RESULT).toBe(DEFAULT_OUTPUT_VALUES.RESULT);
			expect(result.filledFields).toContain("RESULT");
		});

		it("should_fill_missing_next_step", () => {
			const output = "SUMMARY: Summary\nRESULT: Result";
			const violations: SchemaViolation[] = [
				{ field: "NEXT_STEP", violationType: "missing", expected: "required field" },
			];

			const result = applyOutputTemplate(output, violations);

			expect(result.normalized.NEXT_STEP).toBe(DEFAULT_OUTPUT_VALUES.NEXT_STEP);
			expect(result.filledFields).toContain("NEXT_STEP");
		});

		it("should_set_default_confidence_when_missing", () => {
			const output = "SUMMARY: Summary\nRESULT: Result\nNEXT_STEP: none";

			const result = applyOutputTemplate(output, []);

			expect(result.normalized.CONFIDENCE).toBe(DEFAULT_OUTPUT_VALUES.CONFIDENCE);
			expect(result.filledFields).toContain("CONFIDENCE");
		});

		it("should_preserve_valid_confidence", () => {
			const output = `
SUMMARY: Summary
RESULT: Result
CONFIDENCE: 0.85
NEXT_STEP: none
`;

			const result = applyOutputTemplate(output, []);

			expect(result.normalized.CONFIDENCE).toBe(0.85);
			expect(result.preservedFields).toContain("CONFIDENCE");
		});

		it("should_handle_empty_output", () => {
			const violations: SchemaViolation[] = [
				{ field: "SUMMARY", violationType: "missing", expected: "required field" },
				{ field: "RESULT", violationType: "missing", expected: "required field" },
				{ field: "NEXT_STEP", violationType: "missing", expected: "required field" },
			];

			const result = applyOutputTemplate("", violations);

			expect(result.normalized.SUMMARY).toBe(DEFAULT_OUTPUT_VALUES.SUMMARY);
			expect(result.normalized.RESULT).toBe(DEFAULT_OUTPUT_VALUES.RESULT);
			expect(result.normalized.NEXT_STEP).toBe(DEFAULT_OUTPUT_VALUES.NEXT_STEP);
		});

		it("should_preserve_optional_fields", () => {
			const output = `
SUMMARY: Summary
CLAIM: This is a claim
EVIDENCE: Some evidence
RESULT: Result content
NEXT_STEP: none
`;

			const result = applyOutputTemplate(output, []);

			expect(result.normalized.CLAIM).toBe("This is a claim");
			expect(result.normalized.EVIDENCE).toBe("Some evidence");
			expect(result.preservedFields).toContain("CLAIM");
			expect(result.preservedFields).toContain("EVIDENCE");
		});

		it("should_not_fill_optional_missing_fields", () => {
			const output = "SUMMARY: Summary\nRESULT: Result\nNEXT_STEP: none";

			const result = applyOutputTemplate(output, []);

			expect(result.normalized.CLAIM).toBeUndefined();
			expect(result.normalized.EVIDENCE).toBeUndefined();
			expect(result.normalized.COUNTER_EVIDENCE).toBeUndefined();
			expect(result.normalized.DISCUSSION).toBeUndefined();
		});

		it("should_generate_formatted_output", () => {
			const output = "SUMMARY: Test\nRESULT: Result\nNEXT_STEP: none";

			const result = applyOutputTemplate(output, []);

			expect(result.formatted).toContain("SUMMARY:");
			expect(result.formatted).toContain("RESULT:");
			expect(result.formatted).toContain("NEXT_STEP:");
			expect(result.formatted).toContain("CONFIDENCE:");
		});
	});

	// ========================================
	// formatNormalizedOutput
	// ========================================

	describe("formatNormalizedOutput", () => {
		it("should_format_all_fields", () => {
			const output: NormalizedOutput = {
				SUMMARY: "Test summary",
				RESULT: "Test result",
				NEXT_STEP: "none",
				CONFIDENCE: 0.75,
				CLAIM: "Test claim",
				EVIDENCE: "Test evidence",
			};

			const formatted = formatNormalizedOutput(output);

			expect(formatted).toContain("SUMMARY: Test summary");
			expect(formatted).toContain("CLAIM: Test claim");
			expect(formatted).toContain("EVIDENCE: Test evidence");
			expect(formatted).toContain("CONFIDENCE: 0.75");
			expect(formatted).toContain("RESULT:");
			expect(formatted).toContain("Test result");
			expect(formatted).toContain("NEXT_STEP: none");
		});

		it("should_skip_empty_optional_fields", () => {
			const output: NormalizedOutput = {
				SUMMARY: "Summary",
				RESULT: "Result",
				NEXT_STEP: "none",
				CONFIDENCE: 0.5,
			};

			const formatted = formatNormalizedOutput(output);

			expect(formatted).not.toContain("CLAIM:");
			expect(formatted).not.toContain("EVIDENCE:");
			expect(formatted).not.toContain("COUNTER_EVIDENCE:");
			expect(formatted).not.toContain("DISCUSSION:");
		});

		it("should_format_confidence_with_two_decimals", () => {
			const output: NormalizedOutput = {
				SUMMARY: "Summary",
				RESULT: "Result",
				NEXT_STEP: "none",
				CONFIDENCE: 0.12345,
			};

			const formatted = formatNormalizedOutput(output);

			expect(formatted).toContain("CONFIDENCE: 0.12");
		});
	});

	// ========================================
	// hasMinimumStructure
	// ========================================

	describe("hasMinimumStructure", () => {
		it("should_return_true_for_valid_structure", () => {
			const output = "SUMMARY: Valid summary\nRESULT: Valid result";

			expect(hasMinimumStructure(output)).toBe(true);
		});

		it("should_return_false_for_missing_summary", () => {
			const output = "RESULT: Only result";

			expect(hasMinimumStructure(output)).toBe(false);
		});

		it("should_return_false_for_missing_result", () => {
			const output = "SUMMARY: Only summary";

			expect(hasMinimumStructure(output)).toBe(false);
		});

		it("should_return_false_for_empty_output", () => {
			expect(hasMinimumStructure("")).toBe(false);
		});

		it("should_return_false_for_whitespace_only", () => {
			expect(hasMinimumStructure("   \n\n   ")).toBe(false);
		});
	});

	// ========================================
	// Integration Tests
	// ========================================

	describe("integration", () => {
		it("should_handle_complete_workflow", () => {
			const rawOutput = `
SUMMARY: Complete output summary
CLAIM: This is the main claim
EVIDENCE: Evidence to support the claim
CONFIDENCE: 0.9
COUNTER_EVIDENCE: Some counter evidence
DISCUSSION: Discussion points
RESULT:
This is the complete result with all required fields.
NEXT_STEP: Proceed with implementation
`;

			const result = applyOutputTemplate(rawOutput, []);

			expect(result.normalized.SUMMARY).toBe("Complete output summary");
			expect(result.normalized.CLAIM).toBe("This is the main claim");
			expect(result.normalized.EVIDENCE).toBe("Evidence to support the claim");
			expect(result.normalized.CONFIDENCE).toBe(0.9);
			expect(result.normalized.COUNTER_EVIDENCE).toBe("Some counter evidence");
			expect(result.normalized.DISCUSSION).toBe("Discussion points");
			expect(result.filledFields).toHaveLength(0);
		});

		it("should_fill_all_missing_required_fields", () => {
			const rawOutput = "";
			const violations: SchemaViolation[] = [
				{ field: "SUMMARY", violationType: "missing", expected: "required" },
				{ field: "RESULT", violationType: "missing", expected: "required" },
				{ field: "NEXT_STEP", violationType: "missing", expected: "required" },
			];

			const result = applyOutputTemplate(rawOutput, violations);

			expect(result.normalized.SUMMARY).toBe(DEFAULT_OUTPUT_VALUES.SUMMARY);
			expect(result.normalized.RESULT).toBe(DEFAULT_OUTPUT_VALUES.RESULT);
			expect(result.normalized.NEXT_STEP).toBe(DEFAULT_OUTPUT_VALUES.NEXT_STEP);
			expect(result.normalized.CONFIDENCE).toBe(DEFAULT_OUTPUT_VALUES.CONFIDENCE);
			expect(result.filledFields).toContain("SUMMARY");
			expect(result.filledFields).toContain("RESULT");
			expect(result.filledFields).toContain("NEXT_STEP");
			expect(result.filledFields).toContain("CONFIDENCE");
		});
	});
});
