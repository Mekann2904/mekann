/**
 * output-schema.ts 単体テスト
 * カバレッジ分析: parseStructuredOutput, validateSubagentOutputWithSchema, validateTeamMemberOutputWithSchema
 */
import {
  describe,
  it,
  expect,
  beforeEach,
} from "vitest";
import * as fc from "fast-check";

import {
  getSchemaValidationMode,
  setSchemaValidationMode,
  resetSchemaValidationModeCache,
  getCommunicationIdMode,
  setCommunicationIdMode,
  resetCommunicationIdModeCache,
  getStanceClassificationMode,
  setStanceClassificationMode,
  resetStanceClassificationModeCache,
  parseStructuredOutput,
  validateSubagentOutputWithSchema,
  validateTeamMemberOutputWithSchema,
  recordSchemaViolation,
  getSchemaViolationStats,
  resetSchemaViolationStats,
  SCHEMAS,
  type SchemaValidationMode,
  type ParsedStructuredOutput,
  type SchemaValidationResult,
} from "../../../.pi/lib/output-schema.js";

// ============================================================================
// スキーマ検証モード テスト
// ============================================================================

describe("getSchemaValidationMode / setSchemaValidationMode", () => {
  beforeEach(() => {
    resetSchemaValidationModeCache();
  });

  it("getSchemaValidationMode_デフォルト_strict", () => {
    // Arrange & Act
    const result = getSchemaValidationMode();

    // Assert
    expect(result).toBe("strict");
  });

  it("setSchemaValidationMode_legacy_設定反映", () => {
    // Arrange & Act
    setSchemaValidationMode("legacy");
    const result = getSchemaValidationMode();

    // Assert
    expect(result).toBe("legacy");
  });

  it("setSchemaValidationMode_dual_設定反映", () => {
    // Arrange & Act
    setSchemaValidationMode("dual");
    const result = getSchemaValidationMode();

    // Assert
    expect(result).toBe("dual");
  });

  it("resetSchemaValidationModeCache_キャッシュクリア", () => {
    // Arrange
    setSchemaValidationMode("legacy");
    resetSchemaValidationModeCache();
    const result = getSchemaValidationMode();

    // Assert - デフォルトに戻る
    expect(result).toBe("strict");
  });
});

// ============================================================================
// 通信IDモード テスト
// ============================================================================

describe("getCommunicationIdMode / setCommunicationIdMode", () => {
  beforeEach(() => {
    resetCommunicationIdModeCache();
  });

  it("getCommunicationIdMode_デフォルト_legacy", () => {
    // Arrange & Act
    const result = getCommunicationIdMode();

    // Assert
    expect(result).toBe("legacy");
  });

  it("setCommunicationIdMode_structured_設定反映", () => {
    // Arrange & Act
    setCommunicationIdMode("structured");
    const result = getCommunicationIdMode();

    // Assert
    expect(result).toBe("structured");
  });
});

// ============================================================================
// スタンス分類モード テスト
// ============================================================================

describe("getStanceClassificationMode / setStanceClassificationMode", () => {
  beforeEach(() => {
    resetStanceClassificationModeCache();
  });

  it("getStanceClassificationMode_デフォルト_disabled", () => {
    // Arrange & Act
    const result = getStanceClassificationMode();

    // Assert
    expect(result).toBe("disabled");
  });

  it("setStanceClassificationMode_heuristic_設定反映", () => {
    // Arrange & Act
    setStanceClassificationMode("heuristic");
    const result = getStanceClassificationMode();

    // Assert
    expect(result).toBe("heuristic");
  });

  it("setStanceClassificationMode_structured_設定反映", () => {
    // Arrange & Act
    setStanceClassificationMode("structured");
    const result = getStanceClassificationMode();

    // Assert
    expect(result).toBe("structured");
  });
});

// ============================================================================
// parseStructuredOutput テスト
// ============================================================================

describe("parseStructuredOutput", () => {
  it("parseStructuredOutput_必須フィールド_抽出", () => {
    // Arrange
    const output = `
SUMMARY: This is a test summary
RESULT: This is the result
`;

    // Act
    const result = parseStructuredOutput(output);

    // Assert
    expect(result.SUMMARY).toBe("This is a test summary");
    expect(result.RESULT).toBe("This is the result");
  });

  it("parseStructuredOutput_全フィールド_抽出", () => {
    // Arrange
    const output = `
SUMMARY: Summary text
CLAIM: Claim text
EVIDENCE: Evidence text
CONFIDENCE: 0.85
DISCUSSION: Discussion text
RESULT: Result text
NEXT_STEP: Next step text
`;

    // Act
    const result = parseStructuredOutput(output);

    // Assert
    expect(result.SUMMARY).toBe("Summary text");
    expect(result.CLAIM).toBe("Claim text");
    expect(result.EVIDENCE).toBe("Evidence text");
    expect(result.CONFIDENCE).toBe(0.85);
    expect(result.DISCUSSION).toBe("Discussion text");
    expect(result.RESULT).toBe("Result text");
    expect(result.NEXT_STEP).toBe("Next step text");
  });

  it("parseStructuredOutput_必須フィールドなし_空文字", () => {
    // Arrange
    const output = "No structured output";

    // Act
    const result = parseStructuredOutput(output);

    // Assert
    expect(result.SUMMARY).toBe("");
    expect(result.RESULT).toBe("");
  });

  it("parseStructuredOutput_CONFIDENCE_0_1範囲_数値化", () => {
    // Arrange
    const output = "CONFIDENCE: 0.75\nRESULT: Result";

    // Act
    const result = parseStructuredOutput(output);

    // Assert
    expect(result.CONFIDENCE).toBe(0.75);
  });

  it("parseStructuredOutput_空文字_空フィールド", () => {
    // Arrange & Act
    const result = parseStructuredOutput("");

    // Assert
    expect(result.SUMMARY).toBe("");
    expect(result.RESULT).toBe("");
  });
});

// ============================================================================
// validateSubagentOutputWithSchema テスト
// ============================================================================

describe("validateSubagentOutputWithSchema", () => {
  beforeEach(() => {
    resetSchemaViolationStats();
    setSchemaValidationMode("strict");
  });

  it("validateSubagentOutputWithSchema_有効な出力_ok", () => {
    // Arrange
    const output = `
SUMMARY: This is a valid summary with enough length
RESULT: This is a valid result with sufficient content to meet the minimum length requirement
`;

    // Act
    const result = validateSubagentOutputWithSchema(output);

    // Assert
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("validateSubagentOutputWithSchema_SUMMARY不足_ng", () => {
    // Arrange
    const output = `
SUMMARY: Short
RESULT: This is a valid result with sufficient content to meet the minimum length requirement
`;

    // Act
    const result = validateSubagentOutputWithSchema(output);

    // Assert
    expect(result.ok).toBe(false);
    expect(result.violations.some(v => v.field === "SUMMARY")).toBe(true);
  });

  it("validateSubagentOutputWithSchema_RESULT不足_ng", () => {
    // Arrange
    const output = `
SUMMARY: This is a valid summary with enough length
RESULT: Short result
`;

    // Act
    const result = validateSubagentOutputWithSchema(output);

    // Assert
    expect(result.ok).toBe(false);
    expect(result.violations.some(v => v.field === "RESULT")).toBe(true);
  });

  it("validateSubagentOutputWithSchema_SUMMARY超過_ng", () => {
    // Arrange
    const output = `
SUMMARY: ${"a".repeat(501)}
RESULT: This is a valid result with sufficient content
`;

    // Act
    const result = validateSubagentOutputWithSchema(output);

    // Assert
    expect(result.ok).toBe(false);
    expect(result.violations.some(v => v.field === "SUMMARY" && v.violationType === "too_long")).toBe(true);
  });

  it("validateSubagentOutputWithSchema_RESULT超過_ng", () => {
    // Arrange
    const output = `
SUMMARY: Valid summary
RESULT: ${"a".repeat(10001)}
`;

    // Act
    const result = validateSubagentOutputWithSchema(output);

    // Assert
    expect(result.ok).toBe(false);
    expect(result.violations.some(v => v.field === "RESULT" && v.violationType === "too_long")).toBe(true);
  });

  it("validateSubagentOutputWithSchema_NEXT_STEP任意_省略可能", () => {
    // Arrange
    const output = `
SUMMARY: Valid summary with enough length
RESULT: Valid result with sufficient content
`;

    // Act
    const result = validateSubagentOutputWithSchema(output);

    // Assert
    expect(result.ok).toBe(true);
  });

  it("validateSubagentOutputWithSchema_成功時_parsed返却", () => {
    // Arrange
    const output = `
SUMMARY: Valid summary
RESULT: Valid result with enough content here
`;

    // Act
    const result = validateSubagentOutputWithSchema(output);

    // Assert
    expect(result.parsed).toBeDefined();
    expect(result.parsed?.SUMMARY).toBe("Valid summary");
  });
});

// ============================================================================
// validateTeamMemberOutputWithSchema テスト
// ============================================================================

describe("validateTeamMemberOutputWithSchema", () => {
  beforeEach(() => {
    resetSchemaViolationStats();
    setSchemaValidationMode("strict");
  });

  it("validateTeamMemberOutputWithSchema_有効な出力_ok", () => {
    // Arrange
    const output = `
SUMMARY: Valid summary with enough length
CLAIM: Valid claim with enough length
EVIDENCE: Valid evidence with enough length
RESULT: Valid result with sufficient content to meet requirements
NEXT_STEP: Valid next step
`;

    // Act
    const result = validateTeamMemberOutputWithSchema(output);

    // Assert
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("validateTeamMemberOutputWithSchema_CLAIM不足_ng", () => {
    // Arrange
    const output = `
SUMMARY: Valid summary
CLAIM: Short
EVIDENCE: Valid evidence
RESULT: Valid result with enough content
NEXT_STEP: Valid step
`;

    // Act
    const result = validateTeamMemberOutputWithSchema(output);

    // Assert
    expect(result.ok).toBe(false);
    expect(result.violations.some(v => v.field === "CLAIM")).toBe(true);
  });

  it("validateTeamMemberOutputWithSchema_EVIDENCE不足_ng", () => {
    // Arrange - EVIDENCEの最小長は5文字
    const output = `
SUMMARY: Valid summary
CLAIM: Valid claim
EVIDENCE: Abcd
RESULT: Valid result with enough content
NEXT_STEP: Valid step
`;

    // Act
    const result = validateTeamMemberOutputWithSchema(output);

    // Assert
    expect(result.ok).toBe(false);
    expect(result.violations.some(v => v.field === "EVIDENCE" && v.violationType === "too_short")).toBe(true);
  });

  it("validateTeamMemberOutputWithSchema_NEXT_STEP必須_ng", () => {
    // Arrange
    const output = `
SUMMARY: Valid summary
CLAIM: Valid claim
EVIDENCE: Valid evidence
RESULT: Valid result with enough content
`;

    // Act
    const result = validateTeamMemberOutputWithSchema(output);

    // Assert
    expect(result.ok).toBe(false);
    expect(result.violations.some(v => v.field === "NEXT_STEP")).toBe(true);
  });

  it("validateTeamMemberOutputWithSchema_DISCUSSION任意_ok", () => {
    // Arrange
    const output = `
SUMMARY: Valid summary
CLAIM: Valid claim
EVIDENCE: Valid evidence
DISCUSSION: Optional discussion
RESULT: Valid result with enough content
NEXT_STEP: Valid step
`;

    // Act
    const result = validateTeamMemberOutputWithSchema(output);

    // Assert
    expect(result.ok).toBe(true);
  });
});

// ============================================================================
// 違反統計テスト
// ============================================================================

describe("Schema Violation Stats", () => {
  beforeEach(() => {
    resetSchemaViolationStats();
  });

  it("recordSchemaViolation_記録_統計更新", () => {
    // Arrange
    const violation = {
      field: "SUMMARY",
      violationType: "too_short" as const,
      expected: "min 10 chars",
    };

    // Act
    recordSchemaViolation(violation);
    const stats = getSchemaViolationStats();

    // Assert
    expect(stats.get("SUMMARY:too_short")).toBe(1);
  });

  it("recordSchemaViolation_複数回_カウント増加", () => {
    // Arrange
    const violation = {
      field: "SUMMARY",
      violationType: "too_short" as const,
      expected: "min 10 chars",
    };

    // Act
    recordSchemaViolation(violation);
    recordSchemaViolation(violation);
    recordSchemaViolation(violation);
    const stats = getSchemaViolationStats();

    // Assert
    expect(stats.get("SUMMARY:too_short")).toBe(3);
  });

  it("resetSchemaViolationStats_リセット_空マップ", () => {
    // Arrange
    recordSchemaViolation({
      field: "RESULT",
      violationType: "missing" as const,
      expected: "required field",
    });

    // Act
    resetSchemaViolationStats();
    const stats = getSchemaViolationStats();

    // Assert
    expect(stats.size).toBe(0);
  });
});

// ============================================================================
// SCHEMAS 定数テスト
// ============================================================================

describe("SCHEMAS", () => {
  it("SCHEMAS_subagent_存在", () => {
    // Arrange & Act & Assert
    expect(SCHEMAS.subagent).toBeDefined();
    expect(SCHEMAS.subagent.SUMMARY).toBeDefined();
    expect(SCHEMAS.subagent.RESULT).toBeDefined();
  });

  it("SCHEMAS_teamMember_存在", () => {
    // Arrange & Act & Assert
    expect(SCHEMAS.teamMember).toBeDefined();
    expect(SCHEMAS.teamMember.SUMMARY).toBeDefined();
    expect(SCHEMAS.teamMember.CLAIM).toBeDefined();
    expect(SCHEMAS.teamMember.EVIDENCE).toBeDefined();
  });
});

// ============================================================================
// プロパティベーステスト
// ============================================================================

describe("プロパティベーステスト", () => {
  it("parseStructuredOutput_任意の文字列_必須フィールド存在", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 10000 }), (output) => {
        const result = parseStructuredOutput(output);
        return "SUMMARY" in result && "RESULT" in result;
      })
    );
  });

  it("validateSubagentOutputWithSchema_任意の文字列_有効な結果構造", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 5000 }), (output) => {
        const result = validateSubagentOutputWithSchema(output);
        return (
          typeof result.ok === "boolean" &&
          Array.isArray(result.violations) &&
          typeof result.fallbackUsed === "boolean"
        );
      })
    );
  });
});
