/**
 * @abdd.meta
 * path: .pi/tests/lib/pattern-prompt-builder.test.ts
 * role: pattern-prompt-builder.tsの単体テスト
 * why: パターン参照プロンプト構築機能の正確性を保証するため
 * related: .pi/lib/pattern-prompt-builder.ts, .pi/lib/pattern-extraction.ts
 * public_api: テストケースの実行
 * invariants: テストは純粋関数のテストのみ
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: パターンプロンプトビルダーの単体テスト
 * what_it_does:
 *   - formatPatternForPrompt関数のテスト
 *   - buildPatternsPromptSection関数のテスト
 *   - エッジケース（空配列、undefined）のテスト
 * why_it_exists: パターン参照プロンプト構築の信頼性を保証するため
 * scope:
 *   in: .pi/lib/pattern-prompt-builder.ts
 *   out: テスト結果
 */

import { describe, it, expect } from "vitest";
import {
  formatPatternForPrompt,
  buildPatternsPromptSection,
  buildPatternsPromptSectionJa,
  buildPatternsPromptSectionEn,
  toRelevantPattern,
  type RelevantPattern,
} from "../../lib/pattern-prompt-builder.js";

// ============================================================================
// Test Data
// ============================================================================

const mockPatternSuccess: RelevantPattern = {
  patternType: "success",
  taskType: "refactoring",
  description: "Successfully refactored the authentication module",
  agentOrTeam: "core-delivery-team",
  confidence: 0.9,
  keywords: ["refactor", "auth"],
};

const mockPatternFailure: RelevantPattern = {
  patternType: "failure",
  taskType: "testing",
  description: "Failed to complete tests due to timeout",
  agentOrTeam: "test-engineering-team",
  confidence: 0.7,
  keywords: ["test", "timeout"],
};

const mockPatternApproach: RelevantPattern = {
  patternType: "approach",
  taskType: "documentation",
  description: "Used structured approach for documentation",
  agentOrTeam: "implementer",
  confidence: 0.8,
  keywords: ["docs", "structure"],
};

const mockExtractedPattern = {
  id: "pattern-001",
  patternType: "success" as const,
  taskType: "refactoring",
  description: "Test pattern description",
  agentOrTeam: "test-agent",
  confidence: 0.85,
  keywords: ["test"],
  createdAt: new Date().toISOString(),
  context: {},
  outcome: "success",
};

// ============================================================================
// Tests: toRelevantPattern
// ============================================================================

describe("toRelevantPattern", () => {
  it("ExtractedPatternをRelevantPatternに正しく変換する", () => {
    // Arrange & Act
    const result = toRelevantPattern(mockExtractedPattern);

    // Assert
    expect(result.patternType).toBe("success");
    expect(result.taskType).toBe("refactoring");
    expect(result.description).toBe("Test pattern description");
    expect(result.agentOrTeam).toBe("test-agent");
    expect(result.confidence).toBe(0.85);
    expect(result.keywords).toEqual(["test"]);
  });
});

// ============================================================================
// Tests: formatPatternForPrompt
// ============================================================================

describe("formatPatternForPrompt", () => {
  it("成功パターンを正しくフォーマットする", () => {
    // Arrange & Act
    const result = formatPatternForPrompt(mockPatternSuccess);

    // Assert
    expect(result).toContain("[core-delivery-team]");
    expect(result).toContain("Successfully refactored the authentication module");
  });

  it("日本語設定でも正しくフォーマットする", () => {
    // Arrange & Act
    const result = formatPatternForPrompt(mockPatternSuccess, "ja");

    // Assert
    expect(result).toContain("[core-delivery-team]");
    expect(result).toContain("Successfully refactored the authentication module");
  });

  it("長い説明文は80文字で切り詰められる", () => {
    // Arrange
    const longPattern: RelevantPattern = {
      ...mockPatternSuccess,
      description: "A".repeat(100),
    };

    // Act
    const result = formatPatternForPrompt(longPattern);

    // Assert
    expect(result.length).toBeLessThan(120); // プレフィックス + 80文字 + "..."
    expect(result).toContain("...");
  });
});

// ============================================================================
// Tests: buildPatternsPromptSection
// ============================================================================

describe("buildPatternsPromptSection", () => {
  it("空配列の場合は空文字列を返す", () => {
    // Arrange & Act
    const result = buildPatternsPromptSection([]);

    // Assert
    expect(result).toBe("");
  });

  it("undefinedの場合は空文字列を返す", () => {
    // Arrange & Act
    const result = buildPatternsPromptSection(undefined);

    // Assert
    expect(result).toBe("");
  });

  it("成功パターンを含むセクションを構築する（英語）", () => {
    // Arrange & Act
    const result = buildPatternsPromptSection([mockPatternSuccess]);

    // Assert
    expect(result).toContain("Patterns from past executions");
    expect(result).toContain("Previously successful");
    expect(result).toContain("[core-delivery-team]");
    expect(result).toContain("dialogue partners, not constraints");
  });

  it("成功パターンを含むセクションを構築する（日本語）", () => {
    // Arrange & Act
    const result = buildPatternsPromptSection([mockPatternSuccess], "ja");

    // Assert
    expect(result).toContain("過去の実行パターン");
    expect(result).toContain("以前に成功したアプローチ");
    expect(result).toContain("対話相手、制約ではない");
  });

  it("失敗パターンを含むセクションを構築する（英語）", () => {
    // Arrange & Act
    const result = buildPatternsPromptSection([mockPatternFailure]);

    // Assert
    expect(result).toContain("Previously challenging");
    expect(result).toContain("[test-engineering-team]");
    expect(result).toContain("Failed to complete tests");
  });

  it("失敗パターンを含むセクションを構築する（日本語）", () => {
    // Arrange & Act
    const result = buildPatternsPromptSection([mockPatternFailure], "ja");

    // Assert
    expect(result).toContain("以前に課題があったアプローチ");
  });

  it("アプローチパターンを含むセクションを構築する（英語）", () => {
    // Arrange & Act
    const result = buildPatternsPromptSection([mockPatternApproach]);

    // Assert
    expect(result).toContain("Relevant approaches");
    expect(result).toContain("[implementer]");
  });

  it("アプローチパターンを含むセクションを構築する（日本語）", () => {
    // Arrange & Act
    const result = buildPatternsPromptSection([mockPatternApproach], "ja");

    // Assert
    expect(result).toContain("関連するアプローチ");
  });

  it("複数パターンを含むセクションを構築する", () => {
    // Arrange & Act
    const result = buildPatternsPromptSection([
      mockPatternSuccess,
      mockPatternFailure,
      mockPatternApproach,
    ]);

    // Assert
    expect(result).toContain("Previously successful");
    expect(result).toContain("Previously challenging");
    expect(result).toContain("Relevant approaches");
  });

  it("各タイプ最大2件まで表示する", () => {
    // Arrange
    const patterns: RelevantPattern[] = [
      { ...mockPatternSuccess, description: "Success 1" },
      { ...mockPatternSuccess, description: "Success 2" },
      { ...mockPatternSuccess, description: "Success 3" },
    ];

    // Act
    const result = buildPatternsPromptSection(patterns);

    // Assert
    expect(result).toContain("Success 1");
    expect(result).toContain("Success 2");
    expect(result).not.toContain("Success 3");
  });

  it("考慮事項の問いかけを含む（英語）", () => {
    // Arrange & Act
    const result = buildPatternsPromptSection([mockPatternSuccess]);

    // Assert
    expect(result).toContain("Consider:");
    expect(result).toContain("Do these patterns apply to THIS task?");
  });

  it("考慮事項の問いかけを含む（日本語）", () => {
    // Arrange & Act
    const result = buildPatternsPromptSection([mockPatternSuccess], "ja");

    // Assert
    expect(result).toContain("考慮事項:");
    expect(result).toContain("今回のタスクに適用できるか");
  });
});

// ============================================================================
// Tests: buildPatternsPromptSectionJa / En
// ============================================================================

describe("buildPatternsPromptSectionJa", () => {
  it("日本語でセクションを構築する", () => {
    // Arrange & Act
    const result = buildPatternsPromptSectionJa([mockPatternSuccess]);

    // Assert
    expect(result).toContain("過去の実行パターン");
    expect(result).not.toContain("Patterns from past executions");
  });
});

describe("buildPatternsPromptSectionEn", () => {
  it("英語でセクションを構築する", () => {
    // Arrange & Act
    const result = buildPatternsPromptSectionEn([mockPatternSuccess]);

    // Assert
    expect(result).toContain("Patterns from past executions");
    expect(result).not.toContain("過去の実行パターン");
  });
});
