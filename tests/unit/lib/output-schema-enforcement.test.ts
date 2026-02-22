/**
 * generateWithSchemaEnforcement 関数の単体テスト
 * Layer 1: 構造化出力強制（再生成メカニズム）
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
} from "vitest";

import {
  generateWithSchemaEnforcement,
  buildRegenerationPrompt,
  SCHEMAS,
  type RegenerationConfig,
  type SchemaViolation,
} from "../../../.pi/lib/output-schema.js";

// ============================================================================
// generateWithSchemaEnforcement テスト
// ============================================================================

describe("generateWithSchemaEnforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generateWithSchemaEnforcement_初回成功_そのまま返却", async () => {
    // Arrange
    const validOutput = `
SUMMARY: Valid summary with enough length
RESULT: Valid result with sufficient content to meet the minimum length requirement
`;
    const generateFn = vi.fn().mockResolvedValue(validOutput);

    // Act
    const result = await generateWithSchemaEnforcement(
      generateFn,
      SCHEMAS.subagent,
      { maxRetries: 2, backoffMs: 10 }
    );

    // Assert
    expect(result.attempts).toBe(1);
    expect(result.violations).toHaveLength(0);
    expect(result.parsed).toBeDefined();
    expect(result.parsed?.SUMMARY).toBe("Valid summary with enough length");
    expect(generateFn).toHaveBeenCalledTimes(1);
  });

  it("generateWithSchemaEnforcement_再生成成功_試行回数増加", async () => {
    // Arrange
    const invalidOutput = "Invalid output without structure";
    const validOutput = `
SUMMARY: Valid summary after regeneration
RESULT: Valid result with enough content after retry
`;
    const generateFn = vi.fn()
      .mockResolvedValueOnce(invalidOutput)
      .mockResolvedValueOnce(validOutput);

    const onRegenerate = vi.fn();

    // Act
    const result = await generateWithSchemaEnforcement(
      generateFn,
      SCHEMAS.subagent,
      { maxRetries: 2, backoffMs: 10, onRegenerate }
    );

    // Assert
    expect(result.attempts).toBe(2);
    expect(result.violations).toHaveLength(0);
    expect(result.parsed?.SUMMARY).toBe("Valid summary after regeneration");
    expect(generateFn).toHaveBeenCalledTimes(2);
    expect(onRegenerate).toHaveBeenCalledTimes(1);
  });

  it("generateWithSchemaEnforcement_最大再試行超過_違反返却", async () => {
    // Arrange
    const invalidOutput = "Invalid output";
    const generateFn = vi.fn().mockResolvedValue(invalidOutput);

    // Act
    const result = await generateWithSchemaEnforcement(
      generateFn,
      SCHEMAS.subagent,
      { maxRetries: 1, backoffMs: 10 }
    );

    // Assert
    expect(result.attempts).toBe(2); // 初回 + 1回再試行
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.parsed).toBeUndefined();
    expect(generateFn).toHaveBeenCalledTimes(2);
  });

  it("generateWithSchemaEnforcement_生成エラー_再試行継続", async () => {
    // Arrange
    const validOutput = `
SUMMARY: Valid summary
RESULT: Valid result with enough content
`;
    const generateFn = vi.fn()
      .mockRejectedValueOnce(new Error("Temporary error"))
      .mockResolvedValueOnce(validOutput);

    // Act
    const result = await generateWithSchemaEnforcement(
      generateFn,
      SCHEMAS.subagent,
      { maxRetries: 2, backoffMs: 10 }
    );

    // Assert
    expect(result.attempts).toBe(2);
    expect(result.violations).toHaveLength(0);
    expect(generateFn).toHaveBeenCalledTimes(2);
  });

  it("generateWithSchemaEnforcement_生成エラー最大超過_例外送出", async () => {
    // Arrange
    const generateFn = vi.fn().mockRejectedValue(new Error("Permanent error"));

    // Act & Assert
    await expect(
      generateWithSchemaEnforcement(
        generateFn,
        SCHEMAS.subagent,
        { maxRetries: 1, backoffMs: 10 }
      )
    ).rejects.toThrow("Permanent error");

    expect(generateFn).toHaveBeenCalledTimes(2); // 初回 + 1回再試行
  });

  it("generateWithSchemaEnforcement_コールバック呼び出し確認", async () => {
    // Arrange
    const invalidOutput = "Invalid";
    const validOutput = `
SUMMARY: Valid summary with enough length
RESULT: Valid result with enough content
`;
    const generateFn = vi.fn()
      .mockResolvedValueOnce(invalidOutput)
      .mockResolvedValueOnce(validOutput);

    const onRegenerate = vi.fn();

    // Act
    await generateWithSchemaEnforcement(
      generateFn,
      SCHEMAS.subagent,
      { maxRetries: 2, backoffMs: 10, onRegenerate }
    );

    // Assert
    expect(onRegenerate).toHaveBeenCalledWith(1, expect.any(Array));
    expect(onRegenerate).toHaveBeenCalledTimes(1);
  });
});

// ============================================================================
// buildRegenerationPrompt テスト
// ============================================================================

describe("buildRegenerationPrompt", () => {
  it("buildRegenerationPrompt_違反あり_フィードバック追加", () => {
    // Arrange
    const originalPrompt = "Original task prompt";
    const violations: SchemaViolation[] = [
      { field: "SUMMARY", violationType: "missing", expected: "required field" },
      { field: "RESULT", violationType: "too_short", expected: "min 20 chars", actual: "5 chars" },
    ];

    // Act
    const result = buildRegenerationPrompt(originalPrompt, violations);

    // Assert
    expect(result).toContain(originalPrompt);
    expect(result).toContain("前回の出力に問題がありました");
    expect(result).toContain("SUMMARY");
    expect(result).toContain("RESULT");
    expect(result).toContain("必須フィールドが欠落");
    expect(result).toContain("文字数が不足");
  });

  it("buildRegenerationPrompt_空違反_元プロンプトのみ", () => {
    // Arrange
    const originalPrompt = "Original task prompt";
    const violations: SchemaViolation[] = [];

    // Act
    const result = buildRegenerationPrompt(originalPrompt, violations);

    // Assert
    expect(result).toContain(originalPrompt);
    expect(result).toContain("前回の出力に問題がありました");
  });

  it("buildRegenerationPrompt_範囲外違反_適切なメッセージ", () => {
    // Arrange
    const originalPrompt = "Task prompt";
    const violations: SchemaViolation[] = [
      { field: "CONFIDENCE", violationType: "out_of_range", expected: ">= 0", actual: "-1" },
    ];

    // Act
    const result = buildRegenerationPrompt(originalPrompt, violations);

    // Assert
    expect(result).toContain("CONFIDENCE");
    expect(result).toContain("範囲外");
  });
});
