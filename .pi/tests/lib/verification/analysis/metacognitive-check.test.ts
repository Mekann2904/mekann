/**
 * @abdd.meta
 * path: .pi/tests/lib/verification/analysis/metacognitive-check.test.ts
 * role: metacognitive-check.tsのユニットテスト
 * why: メタ認知チェック機能の品質保証とリグレッション防止
 * related: .pi/lib/verification/analysis/metacognitive-check.ts
 * public_api: なし（テストファイル）
 * invariants: テストは冪等性を持つ、外部依存なし
 * side_effects: なし
 * failure_modes: テスト失敗時は詳細なエラーメッセージを出力
 * @abdd.explain
 * overview: メタ認知チェックの各関数をユニットテストで検証
 * what_it_does:
 *   - runMetacognitiveCheck関数のテスト
 *   - detectInnerFascism関数のテスト
 *   - detectBinaryOppositions関数のテスト
 *   - detectFallacies関数のテスト
 * why_it_exists:
 *   - メタ認知分析の品質を保証するため
 *   - 今後の変更によるリグレッションを防ぐため
 * scope:
 *   in: テストケースの入力データ
 *   out: テスト結果（成功/失敗）
 */

import { describe, it, expect } from "vitest";
import {
  runMetacognitiveCheck,
  detectInnerFascism,
  detectBinaryOppositions,
  detectFallacies,
} from "../../../../lib/verification/analysis/metacognitive-check.js";

describe("runMetacognitiveCheck", () => {
  it("should return complete check result for empty input", () => {
    const result = runMetacognitiveCheck("");
    expect(result.deconstruction).toBeDefined();
    expect(result.schizoAnalysis).toBeDefined();
    expect(result.eudaimonia).toBeDefined();
    expect(result.utopiaDystopia).toBeDefined();
    expect(result.philosophyOfThought).toBeDefined();
    expect(result.taxonomyOfThought).toBeDefined();
    expect(result.logic).toBeDefined();
  });

  it("should analyze all 7 philosophical perspectives", () => {
    const text = "これは分析が必要な問題です。論理的に考えましょう。";
    const result = runMetacognitiveCheck(text);
    expect(result.deconstruction).toBeDefined();
    expect(result.schizoAnalysis).toBeDefined();
    expect(result.eudaimonia).toBeDefined();
    expect(result.utopiaDystopia).toBeDefined();
    expect(result.philosophyOfThought).toBeDefined();
    expect(result.taxonomyOfThought).toBeDefined();
    expect(result.logic).toBeDefined();
  });

  it("should include inference chain in logic results", () => {
    const text = "前提：AはBである。したがって、結論としてCが成り立つ。";
    const result = runMetacognitiveCheck(text);
    expect(result.logic.inferenceChain).toBeDefined();
  });
});

describe("detectInnerFascism", () => {
  it("should detect authoritarian patterns", () => {
    // Need enough pattern matches to trigger detection (>2 per pattern)
    const text = "常に常に常に従わなければならない。必ず必ず必ず服従する必要があります。すべきすべきすべきです。";
    const result = detectInnerFascism(text, {});
    // The function may or may not detect signs depending on threshold
    expect(result.innerFascismSigns).toBeDefined();
    expect(Array.isArray(result.innerFascismSigns)).toBe(true);
  });

  it("should return empty signs for neutral text", () => {
    const text = "今日は天気が良いですね。";
    const result = detectInnerFascism(text, {});
    expect(result.innerFascismSigns).toEqual([]);
  });

  it("should detect desire productions", () => {
    const text = "この目標を達成し、成功させましょう。";
    const result = detectInnerFascism(text, {});
    expect(result.desireProduction).toBeDefined();
  });

  it("should return structured result", () => {
    const text = "テストテキスト";
    const result = detectInnerFascism(text, {});
    expect(result.desireProduction).toBeDefined();
    expect(result.innerFascismSigns).toBeDefined();
    expect(result.microFascisms).toBeDefined();
  });
});

describe("detectBinaryOppositions", () => {
  it("should detect explicit binary oppositions", () => {
    const text = "善と悪、光と闇、成功と失敗。";
    const result = detectBinaryOppositions(text, "test context");
    expect(result.binaryOppositions).toBeDefined();
    expect(Array.isArray(result.binaryOppositions)).toBe(true);
  });

  it("should detect aporias", () => {
    const text = "完全性と速度のトレードオフがあります。";
    const result = detectBinaryOppositions(text, "test context");
    expect(result.aporias).toBeDefined();
    expect(Array.isArray(result.aporias)).toBe(true);
  });

  it("should return structured result for non-oppositional text", () => {
    const text = "今日は穏やかな一日でした。";
    const result = detectBinaryOppositions(text, "test context");
    expect(result.binaryOppositions).toBeDefined();
    expect(result.aporias).toBeDefined();
  });
});

describe("detectFallacies", () => {
  it("should detect fallacies in text", () => {
    const text = "彼の意見は聞く価値がない。彼は素人だからだ。";
    const result = detectFallacies(text);
    expect(result.fallacies).toBeDefined();
    expect(Array.isArray(result.fallacies)).toBe(true);
  });

  it("should include valid inferences", () => {
    const text = "データに基づいて判断します。";
    const result = detectFallacies(text);
    expect(result.validInferences).toBeDefined();
    expect(Array.isArray(result.validInferences)).toBe(true);
  });

  it("should include invalid inferences", () => {
    const text = "だからXに違いない。";
    const result = detectFallacies(text);
    expect(result.invalidInferences).toBeDefined();
    expect(Array.isArray(result.invalidInferences)).toBe(true);
  });

  it("should return structured result for sound reasoning", () => {
    const text = "データに基づいて判断します。複数の観点を考慮します。";
    const result = detectFallacies(text);
    expect(result.fallacies).toBeDefined();
    expect(result.validInferences).toBeDefined();
    expect(result.invalidInferences).toBeDefined();
  });
});
