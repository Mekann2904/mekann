/**
 * @file .pi/lib/output-validation.ts の単体テスト
 * @description 出力検証ユーティリティのテスト
 * @testFramework vitest
 *
 * モック/スタブ戦略:
 * - output-schema モジュールをモック化
 * - 純粋な正規表現ベースの検証はモック不要
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";
import {
  hasNonEmptyResultSection,
  validateSubagentOutput,
  validateTeamMemberOutput,
  validateSubagentOutputEnhanced,
  validateTeamMemberOutputEnhanced,
  type SubagentValidationOptions,
  type TeamMemberValidationOptions,
} from "@lib/output-validation";

// ============================================================================
// モック設定
// ============================================================================

vi.mock("@lib/output-schema.js", () => ({
  getSchemaValidationMode: vi.fn(() => "legacy"),
  validateSubagentOutputWithSchema: vi.fn(() => ({
    ok: true,
    violations: [],
  })),
  validateTeamMemberOutputWithSchema: vi.fn(() => ({
    ok: true,
    violations: [],
  })),
  recordSchemaViolation: vi.fn(),
}));

// ============================================================================
// テスト用ユーティリティ
// ============================================================================

/**
 * 有効なサブエージェント出力を作成
 */
function createValidSubagentOutput(overrides: Partial<string> = {}): string {
  return `
SUMMARY: テスト用の要約
CLAIM: これは主張です
EVIDENCE: evidence1.md:10, evidence2.ts:20
RESULT:
テスト結果の内容がここに入ります。
複数行の結果も可能です。
NEXT_STEP: 次のアクション
`.trim();
}

/**
 * 有効なチームメンバー出力を作成
 */
function createValidTeamMemberOutput(): string {
  return `
SUMMARY: チームメンバー用の要約
CLAIM: チームメンバーの主張
EVIDENCE: evidence.md:10
DISCUSSION: 他メンバーとの議論内容
RESULT:
チームメンバーの結果内容
複数行で記述
NEXT_STEP: 次のアクション
`.trim();
}

// ============================================================================
// hasNonEmptyResultSection
// ============================================================================

describe("hasNonEmptyResultSection", () => {
  describe("正常系", () => {
    it("should_return_true_for_non_empty_result_section", () => {
      // Arrange
      const output = "RESULT:\nSome content here";

      // Act
      const result = hasNonEmptyResultSection(output);

      // Assert
      expect(result).toBe(true);
    });

    it("should_return_true_for_inline_result", () => {
      // Arrange
      const output = "RESULT: Inline content";

      // Act
      const result = hasNonEmptyResultSection(output);

      // Assert
      expect(result).toBe(true);
    });

    it("should_return_false_for_empty_result_section", () => {
      // Arrange
      const output = "RESULT:\n\nNEXT_STEP: Something";

      // Act
      const result = hasNonEmptyResultSection(output);

      // Assert
      expect(result).toBe(false);
    });

    it("should_return_false_for_missing_result_section", () => {
      // Arrange
      const output = "SUMMARY: Test\nNEXT_STEP: Done";

      // Act
      const result = hasNonEmptyResultSection(output);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe("境界値", () => {
    it("should_handle_case_insensitive_result", () => {
      // Arrange
      const output = "result: lowercase content";

      // Act
      const result = hasNonEmptyResultSection(output);

      // Assert
      expect(result).toBe(true);
    });

    it("should_handle_result_with_whitespace", () => {
      // Arrange
      const output = "  RESULT  :\n  Content with spaces  ";

      // Act
      const result = hasNonEmptyResultSection(output);

      // Assert
      expect(result).toBe(true);
    });

    it("should_stop_at_next_label", () => {
      // Arrange
      const output = "RESULT:\n\nNEXT_STEP: Action";

      // Act
      const result = hasNonEmptyResultSection(output);

      // Assert
      expect(result).toBe(false);
    });

    it("should_handle_multiline_result", () => {
      // Arrange
      const output = "RESULT:\nLine 1\nLine 2\nLine 3\n\nNEXT_STEP: Done";

      // Act
      const result = hasNonEmptyResultSection(output);

      // Assert
      expect(result).toBe(true);
    });

    it("should_return_false_for_empty_string", () => {
      // Arrange
      const output = "";

      // Act
      const result = hasNonEmptyResultSection(output);

      // Assert
      expect(result).toBe(false);
    });
  });
});

// ============================================================================
// validateSubagentOutput
// ============================================================================

describe("validateSubagentOutput", () => {
  describe("正常系", () => {
    it("should_pass_valid_subagent_output", () => {
      // Arrange
      const output = createValidSubagentOutput();

      // Act
      const result = validateSubagentOutput(output);

      // Assert
      expect(result.ok).toBe(true);
    });

    it("should_pass_with_custom_options", () => {
      // Arrange
      const output = "SUMMARY: Short\nRESULT: Content\nNEXT_STEP: Done";
      const options: Partial<SubagentValidationOptions> = {
        minChars: 10,
        requiredLabels: ["SUMMARY:", "RESULT:"],
      };

      // Act
      const result = validateSubagentOutput(output, options);

      // Assert
      expect(result.ok).toBe(true);
    });
  });

  describe("エラー検出", () => {
    it("should_fail_for_empty_output", () => {
      // Arrange
      const output = "";

      // Act
      const result = validateSubagentOutput(output);

      // Assert
      expect(result.ok).toBe(false);
      expect(result.reason).toContain("empty");
    });

    it("should_fail_for_too_short_output", () => {
      // Arrange
      const output = "Short";

      // Act
      const result = validateSubagentOutput(output);

      // Assert
      expect(result.ok).toBe(false);
      expect(result.reason).toContain("short");
    });

    it("should_fail_for_missing_required_labels", () => {
      // Arrange
      const output = "Some output without required labels but with enough characters to pass min length check";

      // Act
      const result = validateSubagentOutput(output);

      // Assert
      expect(result.ok).toBe(false);
      expect(result.reason).toContain("missing");
    });

    it("should_fail_for_empty_result_section", () => {
      // Arrange
      // minChars=48なので、48文字以上の長さを確保
      const output = `
SUMMARY: Test summary with enough characters to pass min length
RESULT:
NEXT_STEP: Done
`.trim();

      // Act
      const result = validateSubagentOutput(output);

      // Assert
      expect(result.ok).toBe(false);
      expect(result.reason).toContain("empty RESULT");
    });
  });

  describe("境界値", () => {
    it("should_pass_at_min_chars_boundary", () => {
      // Arrange - minChars=48 so output must be >= 48 chars
      const output = "SUMMARY:" + "x".repeat(40) + "\nRESULT: Content\nNEXT_STEP: Done";

      // Act
      const result = validateSubagentOutput(output);

      // Assert
      expect(result.ok).toBe(true);
    });

    it("should_handle_whitespace_only_result", () => {
      // Arrange
      const output = `
SUMMARY: Test
RESULT:

NEXT_STEP: Done
`.trim();

      // Act
      const result = validateSubagentOutput(output);

      // Assert
      expect(result.ok).toBe(false);
    });
  });

  describe("プロパティベーステスト", () => {
    it("should_always_return_ok_boolean", () => {
      fc.assert(
        fc.property(fc.string(), (output) => {
          // Act
          const result = validateSubagentOutput(output);

          // Assert
          expect(typeof result.ok).toBe("boolean");
          if (!result.ok) {
            expect(typeof result.reason).toBe("string");
          }
        })
      );
    });
  });
});

// ============================================================================
// validateTeamMemberOutput
// ============================================================================

describe("validateTeamMemberOutput", () => {
  describe("正常系", () => {
    it("should_pass_valid_team_member_output", () => {
      // Arrange
      const output = createValidTeamMemberOutput();

      // Act
      const result = validateTeamMemberOutput(output);

      // Assert
      expect(result.ok).toBe(true);
    });

    it("should_require_more_labels_than_subagent", () => {
      // Arrange
      // サブエージェント用の出力（CLAIM, EVIDENCEなし、かつminChars=80以上）
      const output = `
SUMMARY: サブエージェント用の十分に長い要約テキストを記述しています
RESULT: チームメンバー検証テスト用の結果内容を記述しています
NEXT_STEP: 完了
`.trim();

      // Act
      const result = validateTeamMemberOutput(output);

      // Assert
      expect(result.ok).toBe(false);
      expect(result.reason).toContain("missing");
    });
  });

  describe("エラー検出", () => {
    it("should_fail_for_empty_output", () => {
      // Arrange
      const output = "";

      // Act
      const result = validateTeamMemberOutput(output);

      // Assert
      expect(result.ok).toBe(false);
      expect(result.reason).toContain("empty");
    });

    it("should_fail_for_too_short_output", () => {
      // Arrange
      const output = "Short";

      // Act
      const result = validateTeamMemberOutput(output);

      // Assert
      expect(result.ok).toBe(false);
      expect(result.reason).toContain("short");
    });

    it("should_fail_for_missing_claim_label", () => {
      // Arrange
      // minChars=80以上の長さを確保し、CLAIMを欠く
      const output = `
SUMMARY: Test summary with enough characters to meet minimum length requirement
EVIDENCE: test.ts:10
RESULT: Content for the result section
NEXT_STEP: Done
`.trim();

      // Act
      const result = validateTeamMemberOutput(output);

      // Assert
      expect(result.ok).toBe(false);
      expect(result.reason).toContain("CLAIM");
    });
  });

  describe("境界値", () => {
    it("should_pass_at_min_chars_boundary", () => {
      // Arrange - minChars=80 so output must be >= 80 chars
      const output = "SUMMARY:" + "x".repeat(72) + "\nCLAIM: Test\nEVIDENCE: test\nRESULT: Content\nNEXT_STEP: Done";

      // Act
      const result = validateTeamMemberOutput(output);

      // Assert
      expect(result.ok).toBe(true);
    });
  });
});

// ============================================================================
// validateSubagentOutputEnhanced
// ============================================================================

describe("validateSubagentOutputEnhanced", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("正常系", () => {
    it("should_return_enhanced_validation_result", () => {
      // Arrange
      const output = createValidSubagentOutput();

      // Act
      const result = validateSubagentOutputEnhanced(output);

      // Assert
      expect(result).toHaveProperty("ok");
      expect(result).toHaveProperty("mode");
      expect(result).toHaveProperty("legacyOk");
      expect(result).toHaveProperty("fallbackUsed");
    });

    it("should_use_legacy_mode_by_default", () => {
      // Arrange
      const output = createValidSubagentOutput();

      // Act
      const result = validateSubagentOutputEnhanced(output);

      // Assert
      expect(result.mode).toBe("legacy");
      expect(result.legacyOk).toBe(true);
    });
  });

  describe("エラー検出", () => {
    it("should_report_empty_output", () => {
      // Arrange
      const output = "";

      // Act
      const result = validateSubagentOutputEnhanced(output);

      // Assert
      expect(result.ok).toBe(false);
      expect(result.legacyOk).toBe(false);
      expect(result.legacyReason).toContain("empty");
    });
  });
});

// ============================================================================
// validateTeamMemberOutputEnhanced
// ============================================================================

describe("validateTeamMemberOutputEnhanced", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("正常系", () => {
    it("should_return_enhanced_validation_result", () => {
      // Arrange
      const output = createValidTeamMemberOutput();

      // Act
      const result = validateTeamMemberOutputEnhanced(output);

      // Assert
      expect(result).toHaveProperty("ok");
      expect(result).toHaveProperty("mode");
      expect(result).toHaveProperty("legacyOk");
    });
  });
});

// ============================================================================
// 統合テスト
// ============================================================================

describe("統合テスト", () => {
  it("should_validate_complete_output_format", () => {
    // Arrange
    const completeOutput = `
SUMMARY: 完全な出力フォーマットのテスト
CLAIM: このテストは完全な出力フォーマットを検証する
EVIDENCE: test-output.test.ts:50, validation.test.ts:100
DISCUSSION: 他のテストケースとの一貫性を確認済み
RESULT:
テスト結果の内容:
1. すべてのラベルが存在
2. RESULTセクションが非空
3. 十分な文字数
NEXT_STEP: 統合テストを実行する
`.trim();

    // Act
    const subagentResult = validateSubagentOutput(completeOutput);
    const teamResult = validateTeamMemberOutput(completeOutput);

    // Assert
    expect(subagentResult.ok).toBe(true);
    expect(teamResult.ok).toBe(true);
  });

  it("should_distinguish_subagent_vs_team_requirements", () => {
    // Arrange - subagent output (no CLAIM, EVIDENCE) with >= 48 chars
    const subagentOutput = `
SUMMARY: サブエージェント出力です。最低文字数を満たすために少し長めに書きます。
RESULT: 内容
NEXT_STEP: 完了
`.trim();

    // Act
    const subagentResult = validateSubagentOutput(subagentOutput);
    const teamResult = validateTeamMemberOutput(subagentOutput);

    // Assert
    expect(subagentResult.ok).toBe(true);
    expect(teamResult.ok).toBe(false); // CLAIM, EVIDENCE不足
  });
});
