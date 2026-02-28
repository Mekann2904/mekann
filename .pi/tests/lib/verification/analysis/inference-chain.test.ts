/**
 * @abdd.meta
 * path: .pi/tests/lib/verification/analysis/inference-chain.test.ts
 * role: inference-chain.tsのユニットテスト
 * why: 推論チェーン解析機能の品質保証とリグレッション防止
 * related: .pi/lib/verification/analysis/inference-chain.ts
 * public_api: なし（テストファイル）
 * invariants: テストは冪等性を持つ、外部依存なし
 * side_effects: なし
 * failure_modes: テスト失敗時は詳細なエラーメッセージを出力
 * @abdd.explain
 * overview: 推論チェーン解析の各関数をユニットテストで検証
 * what_it_does:
 *   - parseInferenceChain関数のテスト
 *   - detectAporiaAvoidanceTemptation関数のテスト
 *   - connectInferenceSteps関数のテスト
 *   - calculateChainQualityScore関数のテスト
 * why_it_exists:
 *   - 推論解析の品質を保証するため
 *   - 今後の変更によるリグレッションを防ぐため
 * scope:
 *   in: テストケースの入力データ
 *   out: テスト結果（成功/失敗）
 */

import { describe, it, expect } from "vitest";
import {
  parseInferenceChain,
  detectAporiaAvoidanceTemptation,
  connectInferenceSteps,
  calculateChainQualityScore,
  type InferenceChain,
} from "../../../../lib/verification/analysis/inference-chain.js";

describe("parseInferenceChain", () => {
  it("should return empty chain for empty input", () => {
    const result = parseInferenceChain("");
    expect(result.premises).toEqual([]);
    expect(result.steps).toEqual([]);
    expect(result.conclusion).toBe("");
    expect(result.validity).toBe("uncertain");
  });

  it("should extract premises from Japanese text", () => {
    const text = "前提：ユーザーは特定のファイルを修正したいと考えています。";
    const result = parseInferenceChain(text);
    expect(result.premises.length).toBeGreaterThan(0);
    expect(result.premises[0]).toContain("ユーザー");
  });

  it("should extract premises from English text", () => {
    const text = "Given: The user wants to modify a specific file.";
    const result = parseInferenceChain(text);
    expect(result.premises.length).toBeGreaterThan(0);
  });

  it("should extract conclusion from text", () => {
    const text = "したがって、ファイルを編集する必要があります。";
    const result = parseInferenceChain(text);
    expect(result.conclusion).toBeTruthy();
  });

  it("should detect fallacies in chain", () => {
    const text = "だからXに違いない。結論：Xは正しい。";
    const result = parseInferenceChain(text);
    expect(result.validity).toBe("invalid");
  });

  it("should identify valid chain with premises and conclusion", () => {
    const text = `
前提：すべての人間は死すべき存在である。
前提：ソクラテスは人間である。
したがって、ソクラテスは死すべき存在である。
    `;
    const result = parseInferenceChain(text);
    expect(result.premises.length).toBeGreaterThanOrEqual(1);
    expect(result.validity).not.toBe("invalid");
  });
});

describe("detectAporiaAvoidanceTemptation", () => {
  it("should detect synthesis temptation", () => {
    const aporias = [{ description: "安全性 vs 速度", tensionLevel: 0.8 }];
    const output = "この問題は統合して解決できます。";
    const result = detectAporiaAvoidanceTemptation(aporias, output);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toContain("統合");
  });

  it("should detect case-by-case evasion", () => {
    const aporias = [{ description: "完全性 vs 効率性", tensionLevel: 0.6 }];
    const output = "状況による判断が必要です。";
    const result = detectAporiaAvoidanceTemptation(aporias, output);
    expect(result.some(r => r.includes("文脈"))).toBe(true);
  });

  it("should return empty array for no temptations", () => {
    const aporias = [{ description: "対立A vs B", tensionLevel: 0.3 }];
    const output = "これは単なる事実の記述です。";
    const result = detectAporiaAvoidanceTemptation(aporias, output);
    expect(result).toEqual([]);
  });
});

describe("connectInferenceSteps", () => {
  it("should connect steps with premises", () => {
    const chain: InferenceChain = {
      premises: ["Premise 1"],
      steps: [
        { stepNumber: 1, input: "", inferenceType: "deductive", output: "Step 1 output", isValid: true },
        { stepNumber: 2, input: "", inferenceType: "deductive", output: "Step 2 output", isValid: true },
      ],
      conclusion: "Final conclusion",
      validity: "valid",
      gaps: [],
    };
    const result = connectInferenceSteps(chain);
    expect(result.steps[0].input).toBe("Premise 1");
    expect(result.steps[1].input).toBe("Step 1 output");
  });

  it("should handle empty steps", () => {
    const chain: InferenceChain = {
      premises: ["Premise"],
      steps: [],
      conclusion: "Conclusion",
      validity: "uncertain",
      gaps: [],
    };
    const result = connectInferenceSteps(chain);
    expect(result.steps).toEqual([]);
  });
});

describe("calculateChainQualityScore", () => {
  it("should return base score for empty chain", () => {
    const chain: InferenceChain = {
      premises: [],
      steps: [],
      conclusion: "",
      validity: "uncertain",
      gaps: [],
    };
    const score = calculateChainQualityScore(chain);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("should increase score for valid chain with premises", () => {
    const chain: InferenceChain = {
      premises: ["P1", "P2"],
      steps: [{ stepNumber: 1, input: "P1", inferenceType: "deductive", output: "S1", isValid: true }],
      conclusion: "C",
      validity: "valid",
      gaps: [],
    };
    const score = calculateChainQualityScore(chain);
    expect(score).toBeGreaterThan(0.5);
  });

  it("should decrease score for gaps", () => {
    const chainWithGaps: InferenceChain = {
      premises: ["P"],
      steps: [],
      conclusion: "C",
      validity: "uncertain",
      gaps: ["Gap 1", "Gap 2"],
    };
    const chainWithoutGaps: InferenceChain = {
      premises: ["P"],
      steps: [],
      conclusion: "C",
      validity: "uncertain",
      gaps: [],
    };
    const scoreWithGaps = calculateChainQualityScore(chainWithGaps);
    const scoreWithoutGaps = calculateChainQualityScore(chainWithoutGaps);
    expect(scoreWithoutGaps).toBeGreaterThan(scoreWithGaps);
  });
});
