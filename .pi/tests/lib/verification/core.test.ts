/**
 * @abdd.meta
 * path: .pi/tests/lib/verification/core.test.ts
 * role: core.tsのユニットテストおよび統合テスト
 * why: 検証ワークフロー中核機能の品質保証とリグレッション防止
 * related: .pi/lib/verification/core.ts
 * public_api: なし（テストファイル）
 * invariants: テストは冪等性を持つ、外部依存なし
 * side_effects: なし
 * failure_modes: テスト失敗時は詳細なエラーメッセージを出力
 * @abdd.explain
 * overview: 検証ワークフロー中核機能の各関数をテストで検証
 * what_it_does:
 *   - shouldTriggerVerification関数のテスト
 *   - synthesizeVerificationResult関数のテスト
 *   - モジュール統合のテスト
 * why_it_exists:
 *   - ワークフロー品質を保証するため
 *   - 今後の変更によるリグレッションを防ぐため
 * scope:
 *   in: テストケースの入力データ
 *   out: テスト結果（成功/失敗）
 */

import { describe, it, expect } from "vitest";
import {
  shouldTriggerVerification,
  synthesizeVerificationResult,
} from "../../../lib/verification/core.js";

describe("shouldTriggerVerification", () => {
  it("should return false when verification is disabled", () => {
    const context = { task: "test", agentId: "agent1" };
    const config = {
      enabled: false,
      triggerModes: ["post-subagent"] as const,
      minConfidenceToSkipVerification: 0.8,
    };
    const result = shouldTriggerVerification(context, config);
    expect(result).toBe(false);
  });

  it("should trigger for post-subagent mode with agentId", () => {
    const context = { task: "test", agentId: "agent1" };
    const config = {
      enabled: true,
      triggerModes: ["post-subagent"] as const,
      minConfidenceToSkipVerification: 0.8,
    };
    const result = shouldTriggerVerification(context, config);
    expect(result).toBe(true);
  });

  it("should trigger for post-team mode with teamId", () => {
    const context = { task: "test", teamId: "team1" };
    const config = {
      enabled: true,
      triggerModes: ["post-team"] as const,
      minConfidenceToSkipVerification: 0.8,
    };
    const result = shouldTriggerVerification(context, config);
    expect(result).toBe(true);
  });

  it("should trigger for low confidence", () => {
    const context = { task: "test", confidence: 0.5 };
    const config = {
      enabled: true,
      triggerModes: ["low-confidence"] as const,
      minConfidenceToSkipVerification: 0.8,
    };
    const result = shouldTriggerVerification(context, config);
    expect(result).toBe(true);
  });

  it("should not trigger for high confidence", () => {
    const context = { task: "test", confidence: 0.9 };
    const config = {
      enabled: true,
      triggerModes: ["low-confidence"] as const,
      minConfidenceToSkipVerification: 0.8,
    };
    const result = shouldTriggerVerification(context, config);
    expect(result).toBe(false);
  });

  it("should trigger for explicit request", () => {
    const context = { task: "test", explicitRequest: true };
    const config = {
      enabled: true,
      triggerModes: ["explicit"] as const,
      minConfidenceToSkipVerification: 0.8,
    };
    const result = shouldTriggerVerification(context, config);
    expect(result).toBe(true);
  });

  it("should not trigger without matching conditions", () => {
    const context = { task: "regular task" };
    const config = {
      enabled: true,
      triggerModes: ["post-subagent"] as const,
      minConfidenceToSkipVerification: 0.8,
    };
    const result = shouldTriggerVerification(context, config);
    expect(result).toBe(false);
  });
});

describe("synthesizeVerificationResult", () => {
  const mockContext = { task: "test-task", agentId: "test-agent" };

  it("should return result with verdict", () => {
    const result = synthesizeVerificationResult(
      "test output",
      0.8,
      { suspicionLevel: "low", detectedPatterns: [], summary: "No issues" },
      { overallSeverity: "low", challenges: [], summary: "No major issues" },
      mockContext
    );

    expect(result.finalVerdict).toBeDefined();
    expect(["pass", "pass-with-warnings", "needs-review", "fail", "blocked"]).toContain(result.finalVerdict);
  });

  it("should calculate confidence score", () => {
    const result = synthesizeVerificationResult(
      "test output",
      0.9,
      { suspicionLevel: "low", detectedPatterns: [], summary: "Clean" },
      { overallSeverity: "low", challenges: [], summary: "Clean" },
      mockContext
    );

    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("should reduce confidence for high suspicion", () => {
    const highSuspicionResult = synthesizeVerificationResult(
      "test output",
      0.9,
      { suspicionLevel: "high", detectedPatterns: [], summary: "Issues found" },
      undefined,
      mockContext
    );
    const lowSuspicionResult = synthesizeVerificationResult(
      "test output",
      0.9,
      { suspicionLevel: "low", detectedPatterns: [], summary: "Clean" },
      undefined,
      mockContext
    );

    expect(highSuspicionResult.confidence).toBeLessThan(lowSuspicionResult.confidence);
  });

  it("should handle undefined outputs", () => {
    const result = synthesizeVerificationResult(
      "test output",
      0.8,
      undefined,
      undefined,
      mockContext
    );

    expect(result).toBeDefined();
    expect(result.triggered).toBe(true);
  });

  it("should include warnings", () => {
    const result = synthesizeVerificationResult(
      "test output",
      0.8,
      { suspicionLevel: "medium", detectedPatterns: [], summary: "Some concerns" },
      { overallSeverity: "moderate", challenges: [], summary: "Moderate issues" },
      mockContext
    );

    expect(result.warnings).toBeDefined();
    expect(Array.isArray(result.warnings)).toBe(true);
  });
});

describe("Module Integration", () => {
  it("should import all verification modules correctly", async () => {
    const { runMetacognitiveCheck } = await import("../../../lib/verification/analysis/metacognitive-check.js");
    const { parseInferenceChain } = await import("../../../lib/verification/analysis/inference-chain.js");
    const { analyzeThinkingMode } = await import("../../../lib/verification/analysis/thinking-mode.js");
    const { assessDystopianRisk } = await import("../../../lib/verification/analysis/dystopian-risk.js");
    const { buildInspectorPrompt } = await import("../../../lib/verification/generation/prompts.js");
    const { extractCandidates } = await import("../../../lib/verification/extraction/candidates.js");
    const { assessDetectionUncertainty } = await import("../../../lib/verification/assessment/uncertainty.js");

    expect(typeof runMetacognitiveCheck).toBe("function");
    expect(typeof parseInferenceChain).toBe("function");
    expect(typeof analyzeThinkingMode).toBe("function");
    expect(typeof assessDystopianRisk).toBe("function");
    expect(typeof buildInspectorPrompt).toBe("function");
    expect(typeof extractCandidates).toBe("function");
    expect(typeof assessDetectionUncertainty).toBe("function");
  });
});
