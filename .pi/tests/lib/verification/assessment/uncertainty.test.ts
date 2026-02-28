/**
 * @abdd.meta
 * path: .pi/tests/lib/verification/assessment/uncertainty.test.ts
 * role: uncertainty.tsのユニットテスト
 * why: 不確実性評価機能の品質保証とリグレッション防止
 * related: .pi/lib/verification/assessment/uncertainty.ts
 * public_api: なし（テストファイル）
 * invariants: テストは冪等性を持つ、外部依存なし
 * side_effects: なし
 * failure_modes: テスト失敗時は詳細なエラーメッセージを出力
 * @abdd.explain
 * overview: 不確実性評価の各関数をユニットテストで検証
 * what_it_does:
 *   - assessDetectionUncertainty関数のテスト
 *   - generateUncertaintySummary関数のテスト
 * why_it_exists:
 *   - 不確実性評価の品質を保証するため
 *   - 今後の変更によるリグレッションを防ぐため
 * scope:
 *   in: テストケースの入力データ
 *   out: テスト結果（成功/失敗）
 */

import { describe, it, expect } from "vitest";
import {
  assessDetectionUncertainty,
  generateUncertaintySummary,
} from "../../../../lib/verification/assessment/uncertainty.js";

describe("assessDetectionUncertainty", () => {
  it("should return assessment for output string", () => {
    const result = assessDetectionUncertainty("test output");
    expect(result).toBeDefined();
    expect(result.targetOutput).toBe("test output");
  });

  it("should include detection summary", () => {
    const result = assessDetectionUncertainty("test output");
    expect(result.detectionSummary).toBeDefined();
    expect(result.detectionSummary.claimResultMismatch).toBeDefined();
    expect(result.detectionSummary.overconfidence).toBeDefined();
  });

  it("should include detection limitations", () => {
    const result = assessDetectionUncertainty("test output");
    expect(result.detectionLimitations).toBeDefined();
    expect(Array.isArray(result.detectionLimitations)).toBe(true);
  });

  it("should include negative result confidence", () => {
    const result = assessDetectionUncertainty("test output");
    expect(result.negativeResultConfidence).toBeGreaterThanOrEqual(0);
    expect(result.negativeResultConfidence).toBeLessThanOrEqual(1);
  });

  it("should include alternative format risk", () => {
    const result = assessDetectionUncertainty("test output");
    expect(result.alternativeFormatRisk).toBeDefined();
  });

  it("should include potentially missed issues", () => {
    const result = assessDetectionUncertainty("test output");
    expect(result.potentiallyMissedIssues).toBeDefined();
    expect(Array.isArray(result.potentiallyMissedIssues)).toBe(true);
  });

  it("should include recommended additional checks", () => {
    const result = assessDetectionUncertainty("test output");
    expect(result.recommendedAdditionalChecks).toBeDefined();
    expect(Array.isArray(result.recommendedAdditionalChecks)).toBe(true);
  });
});

describe("generateUncertaintySummary", () => {
  it("should return string summary", () => {
    const assessment = assessDetectionUncertainty("test output");
    const result = generateUncertaintySummary(assessment);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("should include uncertainty level description", () => {
    const assessment = assessDetectionUncertainty("complex analytical output with multiple claims");
    const result = generateUncertaintySummary(assessment);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("should handle low uncertainty", () => {
    const assessment = assessDetectionUncertainty("simple factual statement");
    const result = generateUncertaintySummary(assessment);
    expect(typeof result).toBe("string");
  });

  it("should handle empty output", () => {
    const assessment = assessDetectionUncertainty("");
    const result = generateUncertaintySummary(assessment);
    expect(typeof result).toBe("string");
  });
});
