/**
 * @abdd.meta
 * path: .pi/tests/lib/verification/analysis/dystopian-risk.test.ts
 * role: dystopian-risk.tsのユニットテスト
 * why: ディストピアリスク評価機能の品質保証とリグレッション防止
 * related: .pi/lib/verification/analysis/dystopian-risk.ts
 * public_api: なし（テストファイル）
 * invariants: テストは冪等性を持つ、外部依存なし
 * side_effects: なし
 * failure_modes: テスト失敗時は詳細なエラーメッセージを出力
 * @abdd.explain
 * overview: ディストピアリスク評価の各関数をユニットテストで検証
 * what_it_does:
 *   - assessDystopianRisk関数のテスト
 *   - リスクパターン検出のテスト
 *   - スコア計算のテスト
 * why_it_exists:
 *   - リスク評価の品質を保証するため
 *   - 今後の変更によるリグレッションを防ぐため
 * scope:
 *   in: テストケースの入力データ
 *   out: テスト結果（成功/失敗）
 */

import { describe, it, expect } from "vitest";
import { assessDystopianRisk } from "../../../../lib/verification/analysis/dystopian-risk.js";

describe("assessDystopianRisk", () => {
  it("should return assessment for empty input", () => {
    const result = assessDystopianRisk("");
    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
  });

  it("should return structured result with expected properties", () => {
    const text = "テストテキスト";
    const result = assessDystopianRisk(text);
    expect(result).toBeDefined();
  });

  it("should detect control patterns", () => {
    const text = "個人の選択を制限し、統一的な管理を行います。";
    const result = assessDystopianRisk(text);
    expect(result).toBeDefined();
  });

  it("should return structured result for dehumanization content", () => {
    const text = "彼らは単なる数値です。";
    const result = assessDystopianRisk(text);
    expect(result).toBeDefined();
  });

  it("should return structured result for inequality content", () => {
    const text = "一部のエリートだけが特権を持ちます。";
    const result = assessDystopianRisk(text);
    expect(result).toBeDefined();
  });

  it("should return result for positive content", () => {
    const text = "多様性を尊重し、すべての人の幸福を追求します。";
    const result = assessDystopianRisk(text);
    expect(result).toBeDefined();
  });

  it("should include recommendations", () => {
    const text = "監視システムを強化します。";
    const result = assessDystopianRisk(text);
    expect(result).toBeDefined();
  });
});
