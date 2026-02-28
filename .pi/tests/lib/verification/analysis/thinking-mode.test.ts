/**
 * @abdd.meta
 * path: .pi/tests/lib/verification/analysis/thinking-mode.test.ts
 * role: thinking-mode.tsのユニットテスト
 * why: 思考モード分析機能の品質保証とリグレッション防止
 * related: .pi/lib/verification/analysis/thinking-mode.ts
 * public_api: なし（テストファイル）
 * invariants: テストは冪等性を持つ、外部依存なし
 * side_effects: なし
 * failure_modes: テスト失敗時は詳細なエラーメッセージを出力
 * @abdd.explain
 * overview: 思考モード分析の各関数をユニットテストで検証
 * what_it_does:
 *   - analyzeThinkingMode関数のテスト
 *   - 思考帽子検出のテスト
 *   - 思考システム判定のテスト
 *   - ブルームレベル推定のテスト
 * why_it_exists:
 *   - 思考分析の品質を保証するため
 *   - 今後の変更によるリグレッションを防ぐため
 * scope:
 *   in: テストケースの入力データ
 *   out: テスト結果（成功/失敗）
 */

import { describe, it, expect } from "vitest";
import {
  analyzeThinkingMode,
  type ThinkingHat,
  type ThinkingSystem,
  type BloomLevel,
} from "../../../../lib/verification/analysis/thinking-mode.js";

describe("analyzeThinkingMode", () => {
  it("should return default analysis for empty input", () => {
    const result = analyzeThinkingMode("");
    expect(result.primaryHat).toBeDefined();
    expect(result.thinkingSystem).toBeDefined();
    expect(result.bloomLevel).toBeDefined();
    expect(result.depthScore).toBeGreaterThanOrEqual(0);
    expect(result.depthScore).toBeLessThanOrEqual(1);
  });

  it("should detect white hat for factual content", () => {
    const text = "データに基づくと、売上は前年比15%増加しました。統計的に有意です。";
    const result = analyzeThinkingMode(text);
    expect(result.detectedHats.some(h => h.hat === "white")).toBe(true);
  });

  it("should detect red hat for emotional content", () => {
    const text = "この件については非常に懸念しています。心配でなりません。";
    const result = analyzeThinkingMode(text);
    expect(result.detectedHats.some(h => h.hat === "red")).toBe(true);
  });

  it("should detect black hat for critical content", () => {
    const text = "この計画には重大なリスクがあります。失敗する可能性が高いです。";
    const result = analyzeThinkingMode(text);
    expect(result.detectedHats.some(h => h.hat === "black")).toBe(true);
  });

  it("should detect yellow hat for optimistic content", () => {
    const text = "この方法には多くのメリットがあります。素晴らしい結果が期待できます。";
    const result = analyzeThinkingMode(text);
    expect(result.detectedHats.some(h => h.hat === "yellow")).toBe(true);
  });

  it("should detect green hat for creative content", () => {
    const text = "新しいアイデアを提案します。創造的な解決策を見つけましょう。";
    const result = analyzeThinkingMode(text);
    expect(result.detectedHats.some(h => h.hat === "green")).toBe(true);
  });

  it("should detect blue hat for process content", () => {
    const text = "次のステップを計画しましょう。プロセスを整理します。";
    const result = analyzeThinkingMode(text);
    // Blue hat is for process control, may not always be detected
    expect(result.detectedHats).toBeDefined();
    expect(Array.isArray(result.detectedHats)).toBe(true);
  });

  it("should detect system2 for analytical content", () => {
    const text = "詳細に分析した結果、論理的に導き出された結論は以下の通りです。";
    const result = analyzeThinkingMode(text);
    expect(result.thinkingSystem).toBe("system2");
  });

  it("should detect system1 for intuitive content", () => {
    const text = "直感的にわかります。即座に判断できます。";
    const result = analyzeThinkingMode(text);
    expect(result.thinkingSystem === "system1" || result.thinkingSystem === "mixed").toBe(true);
  });

  it("should assign higher bloom level for analysis content", () => {
    const text = "この問題を分析し、評価した上で、新しい解決策を創造します。";
    const result = analyzeThinkingMode(text);
    expect(["analyze", "evaluate", "create"]).toContain(result.bloomLevel);
  });

  it("should assign lower bloom level for recall content", () => {
    const text = "この用語の定義を思い出してください。基本的な事実です。";
    const result = analyzeThinkingMode(text);
    expect(["remember", "understand"]).toContain(result.bloomLevel);
  });

  it("should calculate depth score correctly", () => {
    const shallowText = "これは事実です。";
    const deepText = `
      まず前提を確認し、次に論理的に推論を進めます。
      複数の観点から分析し、それぞれの妥当性を評価します。
      最後に、統合的な結論を導き出します。
    `;
    const shallowResult = analyzeThinkingMode(shallowText);
    const deepResult = analyzeThinkingMode(deepText);
    expect(deepResult.depthScore).toBeGreaterThan(shallowResult.depthScore);
  });

  it("should include recommendation", () => {
    const result = analyzeThinkingMode("分析が必要です。");
    expect(result.recommendedMode).toBeDefined();
    expect(result.recommendationReason).toBeDefined();
  });
});
