/**
 * output-template.ts 単体テスト
 * カバレッジ分析: applyOutputTemplate, formatNormalizedOutput, hasMinimumStructure
 */
import {
  describe,
  it,
  expect,
} from "vitest";

import {
  applyOutputTemplate,
  formatNormalizedOutput,
  hasMinimumStructure,
  DEFAULT_OUTPUT_VALUES,
  type NormalizedOutput,
} from "../../../.pi/lib/output-template.js";
import type { SchemaViolation } from "../../../.pi/lib/output-schema.js";

// ============================================================================
// applyOutputTemplate テスト
// ============================================================================

describe("applyOutputTemplate", () => {
  it("applyOutputTemplate_有効な出力_そのまま返却", () => {
    // Arrange
    const output = `
SUMMARY: Valid summary with enough length
CONFIDENCE: 0.75
RESULT: Valid result with sufficient content to meet requirements
NEXT_STEP: Continue with implementation
`;

    // Act
    const result = applyOutputTemplate(output, []);

    // Assert
    expect(result.normalized.SUMMARY).toBe("Valid summary with enough length");
    expect(result.normalized.RESULT).toBe("Valid result with sufficient content to meet requirements");
    expect(result.normalized.NEXT_STEP).toBe("Continue with implementation");
    expect(result.normalized.CONFIDENCE).toBe(0.75);
    expect(result.filledFields).toHaveLength(0);
  });

  it("applyOutputTemplate_SUMMARY欠損_デフォルト補完", () => {
    // Arrange
    const output = "RESULT: Valid result\nNEXT_STEP: none";
    const violations: SchemaViolation[] = [
      { field: "SUMMARY", violationType: "missing", expected: "required field" },
    ];

    // Act
    const result = applyOutputTemplate(output, violations);

    // Assert
    expect(result.normalized.SUMMARY).toBe(DEFAULT_OUTPUT_VALUES.SUMMARY);
    expect(result.filledFields).toContain("SUMMARY");
  });

  it("applyOutputTemplate_RESULT欠損_デフォルト補完", () => {
    // Arrange
    const output = "SUMMARY: Valid summary\nNEXT_STEP: none";
    const violations: SchemaViolation[] = [
      { field: "RESULT", violationType: "missing", expected: "required field" },
    ];

    // Act
    const result = applyOutputTemplate(output, violations);

    // Assert
    expect(result.normalized.RESULT).toBe(DEFAULT_OUTPUT_VALUES.RESULT);
    expect(result.filledFields).toContain("RESULT");
  });

  it("applyOutputTemplate_空出力_全フィールド補完", () => {
    // Arrange
    const violations: SchemaViolation[] = [
      { field: "SUMMARY", violationType: "missing", expected: "required field" },
      { field: "RESULT", violationType: "missing", expected: "required field" },
    ];

    // Act
    const result = applyOutputTemplate("", violations);

    // Assert
    expect(result.normalized.SUMMARY).toBe(DEFAULT_OUTPUT_VALUES.SUMMARY);
    expect(result.normalized.RESULT).toBe(DEFAULT_OUTPUT_VALUES.RESULT);
    expect(result.normalized.NEXT_STEP).toBe(DEFAULT_OUTPUT_VALUES.NEXT_STEP);
    expect(result.normalized.CONFIDENCE).toBe(DEFAULT_OUTPUT_VALUES.CONFIDENCE);
    expect(result.filledFields.length).toBeGreaterThanOrEqual(3);
  });

  it("applyOutputTemplate_CONFIDENCE有効_保持", () => {
    // Arrange
    const output = `
SUMMARY: Summary
RESULT: Result
CONFIDENCE: 0.85
`;

    // Act
    const result = applyOutputTemplate(output, []);

    // Assert
    expect(result.normalized.CONFIDENCE).toBe(0.85);
    expect(result.preservedFields).toContain("CONFIDENCE");
  });

  it("applyOutputTemplate_CONFIDENCE 無効_デフォルト補完", () => {
    // Arrange
    const output = `
SUMMARY: Summary
RESULT: Result
CONFIDENCE: invalid
`;

    // Act
    const result = applyOutputTemplate(output, []);

    // Assert
    expect(result.normalized.CONFIDENCE).toBe(DEFAULT_OUTPUT_VALUES.CONFIDENCE);
    expect(result.filledFields).toContain("CONFIDENCE");
  });

  it("applyOutputTemplate_任意フィールド_保持", () => {
    // Arrange
    const output = `
SUMMARY: Summary
CLAIM: Test claim
EVIDENCE: Test evidence
COUNTER_EVIDENCE: Counter evidence
DISCUSSION: Discussion text
RESULT: Result
NEXT_STEP: none
`;

    // Act
    const result = applyOutputTemplate(output, []);

    // Assert
    expect(result.normalized.CLAIM).toBe("Test claim");
    expect(result.normalized.EVIDENCE).toBe("Test evidence");
    expect(result.normalized.COUNTER_EVIDENCE).toBe("Counter evidence");
    expect(result.normalized.DISCUSSION).toBe("Discussion text");
    expect(result.preservedFields).toContain("CLAIM");
    expect(result.preservedFields).toContain("EVIDENCE");
  });
});

// ============================================================================
// formatNormalizedOutput テスト
// ============================================================================

describe("formatNormalizedOutput", () => {
  it("formatNormalizedOutput_必須フィールドのみ_フォーマット", () => {
    // Arrange
    const output: NormalizedOutput = {
      SUMMARY: "Test summary",
      RESULT: "Test result",
      NEXT_STEP: "none",
      CONFIDENCE: 0.5,
    };

    // Act
    const formatted = formatNormalizedOutput(output);

    // Assert
    expect(formatted).toContain("SUMMARY: Test summary");
    expect(formatted).toContain("CONFIDENCE: 0.50");
    expect(formatted).toContain("RESULT:");
    expect(formatted).toContain("Test result");
    expect(formatted).toContain("NEXT_STEP: none");
  });

  it("formatNormalizedOutput_全フィールド_フォーマット", () => {
    // Arrange
    const output: NormalizedOutput = {
      SUMMARY: "Test summary",
      CLAIM: "Test claim",
      EVIDENCE: "Test evidence",
      CONFIDENCE: 0.85,
      COUNTER_EVIDENCE: "Counter evidence",
      DISCUSSION: "Discussion",
      RESULT: "Test result",
      NEXT_STEP: "Continue",
    };

    // Act
    const formatted = formatNormalizedOutput(output);

    // Assert
    expect(formatted).toContain("CLAIM: Test claim");
    expect(formatted).toContain("EVIDENCE: Test evidence");
    expect(formatted).toContain("COUNTER_EVIDENCE: Counter evidence");
    expect(formatted).toContain("DISCUSSION: Discussion");
  });
});

// ============================================================================
// hasMinimumStructure テスト
// ============================================================================

describe("hasMinimumStructure", () => {
  it("hasMinimumStructure_有効な構造_true", () => {
    // Arrange
    const output = `
SUMMARY: Valid summary
RESULT: Valid result
`;

    // Act & Assert
    expect(hasMinimumStructure(output)).toBe(true);
  });

  it("hasMinimumStructure_SUMMARY欠損_false", () => {
    // Arrange
    const output = "RESULT: Result only";

    // Act & Assert
    expect(hasMinimumStructure(output)).toBe(false);
  });

  it("hasMinimumStructure_RESULT欠損_false", () => {
    // Arrange
    const output = "SUMMARY: Summary only";

    // Act & Assert
    expect(hasMinimumStructure(output)).toBe(false);
  });

  it("hasMinimumStructure_空文字_false", () => {
    // Act & Assert
    expect(hasMinimumStructure("")).toBe(false);
  });

  it("hasMinimumStructure_構造なしテキスト_false", () => {
    // Arrange
    const output = "This is just plain text without structure.";

    // Act & Assert
    expect(hasMinimumStructure(output)).toBe(false);
  });
});

// ============================================================================
// DEFAULT_OUTPUT_VALUES テスト
// ============================================================================

describe("DEFAULT_OUTPUT_VALUES", () => {
  it("DEFAULT_OUTPUT_VALUES_全キー存在", () => {
    // Assert
    expect(DEFAULT_OUTPUT_VALUES.SUMMARY).toBeDefined();
    expect(DEFAULT_OUTPUT_VALUES.CLAIM).toBeDefined();
    expect(DEFAULT_OUTPUT_VALUES.EVIDENCE).toBeDefined();
    expect(DEFAULT_OUTPUT_VALUES.CONFIDENCE).toBeDefined();
    expect(DEFAULT_OUTPUT_VALUES.COUNTER_EVIDENCE).toBeDefined();
    expect(DEFAULT_OUTPUT_VALUES.DISCUSSION).toBeDefined();
    expect(DEFAULT_OUTPUT_VALUES.RESULT).toBeDefined();
    expect(DEFAULT_OUTPUT_VALUES.NEXT_STEP).toBeDefined();
  });

  it("DEFAULT_OUTPUT_VALUES_CONFIDENCE_範囲内", () => {
    // Assert
    expect(DEFAULT_OUTPUT_VALUES.CONFIDENCE).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_OUTPUT_VALUES.CONFIDENCE).toBeLessThanOrEqual(1);
  });
});
