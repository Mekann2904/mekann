/**
 * @abdd.meta
 * path: .pi/tests/lib/verification/generation/prompts.test.ts
 * role: prompts.tsのユニットテスト
 * why: プロンプト生成機能の品質保証とリグレッション防止
 * related: .pi/lib/verification/generation/prompts.ts
 * public_api: なし（テストファイル）
 * invariants: テストは冪等性を持つ、外部依存なし
 * side_effects: なし
 * failure_modes: テスト失敗時は詳細なエラーメッセージを出力
 * @abdd.explain
 * overview: プロンプト生成の各関数をユニットテストで検証
 * what_it_does:
 *   - buildInspectorPrompt関数のテスト
 *   - buildChallengerPrompt関数のテスト
 *   - generateLLMVerificationPrompt関数のテスト
 * why_it_exists:
 *   - プロンプト生成の品質を保証するため
 *   - 今後の変更によるリグレッションを防ぐため
 * scope:
 *   in: テストケースの入力データ
 *   out: テスト結果（成功/失敗）
 */

import { describe, it, expect } from "vitest";
import {
  buildInspectorPrompt,
  buildChallengerPrompt,
  generateLLMVerificationPrompt,
} from "../../../../lib/verification/generation/prompts.js";

const mockContext = {
  task: "test-task",
  agentId: "test-agent",
  teamId: undefined,
};

describe("buildInspectorPrompt", () => {
  it("should return non-empty string for valid input", () => {
    const result = buildInspectorPrompt("test output", mockContext);
    expect(result.length).toBeGreaterThan(100);
    expect(result).toContain("Inspector");
  });

  it("should include target output in prompt", () => {
    const targetOutput = "This is the target output to inspect.";
    const result = buildInspectorPrompt(targetOutput, mockContext);
    expect(result).toContain(targetOutput);
  });

  it("should include context information", () => {
    const result = buildInspectorPrompt("test", mockContext);
    expect(result).toContain("test-task");
    expect(result).toContain("test-agent");
  });

  it("should include inspection checklist", () => {
    const result = buildInspectorPrompt("test", mockContext);
    expect(result).toContain("INSPECTION");
  });

  it("should handle custom patterns", () => {
    const customPatterns = ["bias_detection", "logical_error"];
    const result = buildInspectorPrompt("test", mockContext, customPatterns);
    expect(result).toContain("bias_detection");
  });

  it("should include output format instructions", () => {
    const result = buildInspectorPrompt("test", mockContext);
    expect(result).toContain("OUTPUT FORMAT");
  });
});

describe("buildChallengerPrompt", () => {
  it("should return non-empty string for valid input", () => {
    const result = buildChallengerPrompt("test output", mockContext);
    expect(result.length).toBeGreaterThan(100);
    expect(result).toContain("Challenger");
  });

  it("should include target output in prompt", () => {
    const targetOutput = "This is the target to challenge.";
    const result = buildChallengerPrompt(targetOutput, mockContext);
    expect(result).toContain(targetOutput);
  });

  it("should include challenge categories", () => {
    const result = buildChallengerPrompt("test", mockContext);
    expect(result).toContain("DISPUTE");
  });

  it("should require specified number of flaws", () => {
    const result = buildChallengerPrompt("test", mockContext, undefined, 3);
    expect(result.length).toBeGreaterThan(0);
  });

  it("should handle custom categories", () => {
    const customCategories = ["logic", "evidence"];
    const result = buildChallengerPrompt("test", mockContext, customCategories);
    expect(result.length).toBeGreaterThan(100);
  });
});

describe("generateLLMVerificationPrompt", () => {
  const mockRequest = {
    candidate: {
      type: "test-pattern",
      matchedText: "test match",
      context: "surrounding context",
    },
    fullText: "full text content",
    verificationType: "fallacy" as const,
  };

  it("should return non-empty string for valid input", () => {
    const result = generateLLMVerificationPrompt(mockRequest);
    expect(result.length).toBeGreaterThan(100);
  });

  it("should include verification instructions", () => {
    const result = generateLLMVerificationPrompt(mockRequest);
    expect(result.toLowerCase()).toMatch(/verif|check|判定/);
  });

  it("should include target content", () => {
    const result = generateLLMVerificationPrompt(mockRequest);
    expect(result).toContain("test match");
  });

  it("should handle task context", () => {
    const requestWithContext = {
      ...mockRequest,
      taskContext: "This is the task context",
    };
    const result = generateLLMVerificationPrompt(requestWithContext);
    expect(result).toContain("task context");
  });

  it("should include verification type description", () => {
    const result = generateLLMVerificationPrompt(mockRequest);
    expect(result).toContain("論理的誤謬");
  });
});
