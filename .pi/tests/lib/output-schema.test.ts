/**
 * @file .pi/lib/output-schema.ts のテスト
 * @description 出力スキーマ検証のテスト
 * @testFramework vitest
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import {
	getSchemaValidationMode,
	setSchemaValidationMode,
	resetSchemaValidationModeCache,
	parseStructuredOutput,
	validateSubagentOutputWithSchema,
	validateTeamMemberOutputWithSchema,
	generateWithSchemaEnforcement,
	buildRegenerationPrompt,
	recordSchemaViolation,
	getSchemaViolationStats,
	resetSchemaViolationStats,
	getCommunicationIdMode,
	setCommunicationIdMode,
	resetCommunicationIdModeCache,
	getStanceClassificationMode,
	setStanceClassificationMode,
	resetStanceClassificationModeCache,
	SCHEMAS,
	type SchemaValidationMode,
	type SchemaViolation,
	type ParsedStructuredOutput,
} from "../../lib/output-schema.js";

// ============================================================================
// Tests
// ============================================================================

describe("output-schema", () => {
	beforeEach(() => {
		resetSchemaValidationModeCache();
		resetSchemaViolationStats();
	});

	afterEach(() => {
		resetSchemaValidationModeCache();
		resetSchemaViolationStats();
	});

	// ========================================
	// Schema Validation Mode
	// ========================================

	describe("getSchemaValidationMode", () => {
		it("should_return_default_mode", () => {
			const mode = getSchemaValidationMode();
			expect(["legacy", "dual", "strict"]).toContain(mode);
		});

		it("should_respect_env_variable", () => {
			vi.stubEnv("PI_OUTPUT_SCHEMA_MODE", "dual");
			resetSchemaValidationModeCache();

			const mode = getSchemaValidationMode();
			expect(mode).toBe("dual");

			vi.unstubAllEnvs();
		});
	});

	describe("setSchemaValidationMode", () => {
		it("should_set_mode", () => {
			setSchemaValidationMode("strict");
			expect(getSchemaValidationMode()).toBe("strict");
		});
	});

	// ========================================
	// Communication ID Mode
	// ========================================

	describe("getCommunicationIdMode", () => {
		it("should_return_default_legacy_mode", () => {
			resetCommunicationIdModeCache();
			expect(getCommunicationIdMode()).toBe("legacy");
		});

		it("should_respect_env_variable", () => {
			vi.stubEnv("PI_COMMUNICATION_ID_MODE", "structured");
			resetCommunicationIdModeCache();

			expect(getCommunicationIdMode()).toBe("structured");

			vi.unstubAllEnvs();
		});
	});

	describe("setCommunicationIdMode", () => {
		it("should_set_mode", () => {
			setCommunicationIdMode("structured");
			expect(getCommunicationIdMode()).toBe("structured");
			resetCommunicationIdModeCache();
		});
	});

	// ========================================
	// Stance Classification Mode
	// ========================================

	describe("getStanceClassificationMode", () => {
		it("should_return_default_disabled_mode", () => {
			resetStanceClassificationModeCache();
			expect(getStanceClassificationMode()).toBe("disabled");
		});

		it("should_respect_env_variable", () => {
			vi.stubEnv("PI_STANCE_CLASSIFICATION_MODE", "heuristic");
			resetStanceClassificationModeCache();

			expect(getStanceClassificationMode()).toBe("heuristic");

			vi.unstubAllEnvs();
		});
	});

	describe("setStanceClassificationMode", () => {
		it("should_set_mode", () => {
			setStanceClassificationMode("structured");
			expect(getStanceClassificationMode()).toBe("structured");
			resetStanceClassificationModeCache();
		});
	});

	// ========================================
	// parseStructuredOutput
	// ========================================

	describe("parseStructuredOutput", () => {
		it("should_parse_required_fields", () => {
			const output = `
SUMMARY: This is a summary
RESULT:
This is the result content
NEXT_STEP: none
`;

			const parsed = parseStructuredOutput(output);

			expect(parsed.SUMMARY).toBe("This is a summary");
			expect(parsed.RESULT).toContain("This is the result content");
			expect(parsed.NEXT_STEP).toBe("none");
		});

		it("should_parse_optional_fields", () => {
			const output = `
SUMMARY: Summary text
CLAIM: This is a claim
EVIDENCE: Some evidence here
CONFIDENCE: 0.85
COUNTER_EVIDENCE: Counter evidence
DISCUSSION: Discussion text
RESULT: Result text
NEXT_STEP: next action
`;

			const parsed = parseStructuredOutput(output);

			expect(parsed.CLAIM).toBe("This is a claim");
			expect(parsed.EVIDENCE).toBe("Some evidence here");
			expect(parsed.CONFIDENCE).toBe(0.85);
			expect(parsed.COUNTER_EVIDENCE).toBe("Counter evidence");
			expect(parsed.DISCUSSION).toBe("Discussion text");
		});

		it("should_handle_missing_fields", () => {
			const output = "SUMMARY: Only summary\nRESULT: Only result";

			const parsed = parseStructuredOutput(output);

			expect(parsed.SUMMARY).toBe("Only summary");
			expect(parsed.RESULT).toBe("Only result");
			expect(parsed.CLAIM).toBeUndefined();
			expect(parsed.NEXT_STEP).toBeUndefined();
		});

		it("should_return_empty_for_invalid_input", () => {
			const parsed = parseStructuredOutput("");

			expect(parsed.SUMMARY).toBe("");
			expect(parsed.RESULT).toBe("");
		});
	});

	// ========================================
	// validateSubagentOutputWithSchema
	// ========================================

	describe("validateSubagentOutputWithSchema", () => {
		it("should_pass_valid_output", () => {
			const output = `
SUMMARY: This is a valid summary with enough length
RESULT:
This is a valid result content with enough length to pass validation.
It needs to be at least 20 characters long.
NEXT_STEP: none
`;

			const result = validateSubagentOutputWithSchema(output);

			expect(result.ok).toBe(true);
			expect(result.violations).toHaveLength(0);
		});

		it("should_fail_on_missing_required_field", () => {
			const output = "SUMMARY: Only summary";

			const result = validateSubagentOutputWithSchema(output);

			expect(result.ok).toBe(false);
			expect(result.violations.some((v) => v.field === "RESULT")).toBe(true);
		});

		it("should_fail_on_too_short_field", () => {
			const output = `
SUMMARY: Short
RESULT: Too short
NEXT_STEP: none
`;

			const result = validateSubagentOutputWithSchema(output);

			expect(result.ok).toBe(false);
			expect(result.violations.some((v) => v.violationType === "too_short")).toBe(true);
		});
	});

	// ========================================
	// validateTeamMemberOutputWithSchema
	// ========================================

	describe("validateTeamMemberOutputWithSchema", () => {
		it("should_pass_valid_output", () => {
			const output = `
SUMMARY: Valid team member summary
CLAIM: This is a valid claim statement
EVIDENCE: Evidence to support the claim
RESULT:
This is a detailed result with enough content to pass validation.
NEXT_STEP: Continue with next action
`;

			const result = validateTeamMemberOutputWithSchema(output);

			expect(result.ok).toBe(true);
		});

		it("should_fail_on_missing_claim", () => {
			const output = `
SUMMARY: Summary without claim
EVIDENCE: Some evidence
RESULT: Result content
NEXT_STEP: none
`;

			const result = validateTeamMemberOutputWithSchema(output);

			expect(result.ok).toBe(false);
			expect(result.violations.some((v) => v.field === "CLAIM")).toBe(true);
		});

		it("should_fail_on_missing_evidence", () => {
			const output = `
SUMMARY: Summary
CLAIM: A claim
RESULT: Result
NEXT_STEP: none
`;

			const result = validateTeamMemberOutputWithSchema(output);

			expect(result.ok).toBe(false);
			expect(result.violations.some((v) => v.field === "EVIDENCE")).toBe(true);
		});
	});

	// ========================================
	// generateWithSchemaEnforcement
	// ========================================

	describe("generateWithSchemaEnforcement", () => {
		it("should_return_output_on_first_success", async () => {
			const validOutput = `
SUMMARY: Valid summary output
RESULT:
This is a valid result with enough length.
NEXT_STEP: none
`;

			const generateFn = vi.fn().mockResolvedValue(validOutput);

			const result = await generateWithSchemaEnforcement(
				generateFn,
				SCHEMAS.subagent,
				{ maxRetries: 2 }
			);

			expect(result.attempts).toBe(1);
			expect(result.violations).toHaveLength(0);
			expect(result.parsed).toBeDefined();
		});

		it("should_retry_on_validation_failure", async () => {
			const invalidOutput = "SUMMARY: Short";
			const validOutput = `
SUMMARY: Valid summary after retry
RESULT:
This is a valid result after retry with enough length.
NEXT_STEP: none
`;

			const generateFn = vi
				.fn()
				.mockResolvedValueOnce(invalidOutput)
				.mockResolvedValueOnce(validOutput);

			const result = await generateWithSchemaEnforcement(
				generateFn,
				SCHEMAS.subagent,
				{ maxRetries: 2, backoffMs: 10 }
			);

			expect(result.attempts).toBe(2);
			expect(generateFn).toHaveBeenCalledTimes(2);
		});

		it("should_return_violations_after_max_retries", async () => {
			const invalidOutput = "SUMMARY: Short";

			const generateFn = vi.fn().mockResolvedValue(invalidOutput);

			const result = await generateWithSchemaEnforcement(
				generateFn,
				SCHEMAS.subagent,
				{ maxRetries: 1, backoffMs: 10 }
			);

			expect(result.attempts).toBeGreaterThan(1);
			expect(result.violations.length).toBeGreaterThan(0);
		});
	});

	// ========================================
	// buildRegenerationPrompt
	// ========================================

	describe("buildRegenerationPrompt", () => {
		it("should_include_feedback_for_missing_fields", () => {
			const violations: SchemaViolation[] = [
				{ field: "SUMMARY", violationType: "missing", expected: "required field" },
			];

			const prompt = buildRegenerationPrompt("Original prompt", violations);

			expect(prompt).toContain("SUMMARY");
			expect(prompt).toContain("欠落");
		});

		it("should_include_feedback_for_too_short_fields", () => {
			const violations: SchemaViolation[] = [
				{
					field: "RESULT",
					violationType: "too_short",
					expected: "min 20 chars",
					actual: "5 chars",
				},
			];

			const prompt = buildRegenerationPrompt("Original prompt", violations);

			expect(prompt).toContain("RESULT");
			expect(prompt).toContain("不足");
		});
	});

	// ========================================
	// Violation Tracking
	// ========================================

	describe("recordSchemaViolation", () => {
		it("should_record_violation", () => {
			const violation: SchemaViolation = {
				field: "SUMMARY",
				violationType: "missing",
				expected: "required field",
			};

			recordSchemaViolation(violation);

			const stats = getSchemaViolationStats();
			expect(stats.get("SUMMARY:missing")).toBe(1);
		});

		it("should_increment_count_for_same_violation", () => {
			const violation: SchemaViolation = {
				field: "RESULT",
				violationType: "too_short",
				expected: "min 20 chars",
			};

			recordSchemaViolation(violation);
			recordSchemaViolation(violation);

			const stats = getSchemaViolationStats();
			expect(stats.get("RESULT:too_short")).toBe(2);
		});
	});

	describe("resetSchemaViolationStats", () => {
		it("should_clear_all_stats", () => {
			recordSchemaViolation({
				field: "SUMMARY",
				violationType: "missing",
				expected: "required",
			});

			resetSchemaViolationStats();

			const stats = getSchemaViolationStats();
			expect(stats.size).toBe(0);
		});
	});

	// ========================================
	// SCHEMAS
	// ========================================

	describe("SCHEMAS", () => {
		it("should_have_subagent_schema", () => {
			expect(SCHEMAS.subagent).toBeDefined();
			expect(SCHEMAS.subagent.SUMMARY).toBeDefined();
			expect(SCHEMAS.subagent.RESULT).toBeDefined();
		});

		it("should_have_team_member_schema", () => {
			expect(SCHEMAS.teamMember).toBeDefined();
			expect(SCHEMAS.teamMember.SUMMARY).toBeDefined();
			expect(SCHEMAS.teamMember.CLAIM).toBeDefined();
			expect(SCHEMAS.teamMember.EVIDENCE).toBeDefined();
		});
	});
});
