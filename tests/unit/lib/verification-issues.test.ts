/**
 * 偽陽性/偽陰性のパターンを検証するテスト
 * 検出ロジックの信頼性問題を明確にする
 */

import { describe, it, expect } from "vitest";
import {
  detectClaimResultMismatch,
  detectOverconfidence,
  detectMissingAlternatives,
  detectConfirmationBias,
} from "../../../.pi/lib/verification-workflow.js";

describe("偽陽性/偽陰性の検証", () => {
  describe("detectClaimResultMismatch: 偽陰性", () => {
    it("形式が異なる場合に検出できない（日本語ラベル）", () => {
      const output = "主張: 実装完了\n結果: 削除が必要";
      const result = detectClaimResultMismatch(output);
      // 偽陰性: 形式が違うため検出されない
      expect(result.detected).toBe(false);
    });

    it("小文字のラベルを使用すると検出できない", () => {
      const output = "claim: 実装完了\nresult: 削除が必要";
      const result = detectClaimResultMismatch(output);
      // iフラグがあるので検出されるはず
      expect(result.detected).toBe(true);
    });

    it("スペースがない場合に検出できない可能性", () => {
      const output = "CLAIM:実装完了\nRESULT:削除が必要";
      const result = detectClaimResultMismatch(output);
      // 正規表現が \s* なので検出されるはず
      expect(result.detected).toBe(true);
    });

    it("コロンの代わりに別の記号を使うと検出できない", () => {
      const output = "CLAIM = 実装完了\nRESULT = 削除が必要";
      const result = detectClaimResultMismatch(output);
      // 偽陰性: コロンではないため検出されない
      expect(result.detected).toBe(false);
    });
  });

  describe("detectClaimResultMismatch: 偽陽性", () => {
    it("否定語が一致している場合に偽陽性になる可能性", () => {
      // "not" が両方にあるが意味的に矛盾していない
      const output = "CLAIM: This is not an error\nRESULT: This is not a bug, it's a feature";
      const result = detectClaimResultMismatch(output);
      // 両方に否定があるため、検出されない可能性があるが
      // 重要語の共通性が低いと検出される可能性
      // 実際の挙動を確認
      console.log("Result:", result);
    });

    it("専門用語が異なるだけで内容的に一致している場合", () => {
      const output = "CLAIM: API is functioning correctly\nRESULT: Endpoint responds as expected";
      const result = detectClaimResultMismatch(output);
      // "API" と "Endpoint" は同義だが、重要語が異なるため偽陽性の可能性
      console.log("Result:", result);
    });
  });

  describe("detectOverconfidence: 境界値の問題", () => {
    it("証拠が99文字の場合は過信と判定される", () => {
      const evidence = "a".repeat(99);
      const output = `CONFIDENCE: 0.91\nEVIDENCE: ${evidence}`;
      const result = detectOverconfidence(output);
      expect(result.detected).toBe(true);
    });

    it("証拠が100文字の場合は過信と判定されない", () => {
      const evidence = "a".repeat(100);
      const output = `CONFIDENCE: 0.91\nEVIDENCE: ${evidence}`;
      const result = detectOverconfidence(output);
      expect(result.detected).toBe(false);
    });

    it("証拠の文字数だけでの判断は不適切（数学的証明など）", () => {
      const output = `CONFIDENCE: 0.95
EVIDENCE: By Fermat's Little Theorem, a^(p-1) ≡ 1 (mod p) for prime p.`;
      const result = detectOverconfidence(output);
      // 証拠は短いが、数学的証明は十分な根拠
      // 偽陽性: 具体性スコア（ファイル参照なし）で過信と判定される可能性
      expect(result.detected).toBe(true); // 現在の実装では偽陽性
    });

    it("ファイル参照がなくても正当な証拠がある場合", () => {
      const output = `CONFIDENCE: 0.93
EVIDENCE: Unit tests verify all edge cases: null input, empty string, maximum length, unicode characters.`;
      const result = detectOverconfidence(output);
      // 具体性スコア: ファイル参照なし(0) + 行番号なし(0) + コード参照なし(0) = 0 < 2
      // 偽陽性の可能性
      console.log("Overconfidence result:", result);
    });
  });

  describe("detectMissingAlternatives: 言語依存", () => {
    it("英語キーワード「alternatively」で代替解釈を検出", () => {
      const output = `CONCLUSION: Use algorithm A
Alternatively, algorithm B could work
CONFIDENCE: 0.85`;
      const result = detectMissingAlternatives(output);
      expect(result.detected).toBe(false);
    });

    it("日本語キーワード「あるいは」で代替解釈を検出", () => {
      const output = `CONCLUSION: アルゴリズムAを使用
あるいはアルゴリズムBも動作する
CONFIDENCE: 0.85`;
      const result = detectMissingAlternatives(output);
      expect(result.detected).toBe(false);
    });

    it("代替解釈の記述がない高信頼度の結論", () => {
      const output = `CONCLUSION: この方法が最適です
CONFIDENCE: 0.86`;
      const result = detectMissingAlternatives(output);
      expect(result.detected).toBe(true);
    });

    it("DISCUSSIONセクションがある場合は代替解釈ありとみなす", () => {
      const output = `CONCLUSION: 完了
DISCUSSION: 他者と協議済み
CONFIDENCE: 0.86`;
      const result = detectMissingAlternatives(output);
      expect(result.detected).toBe(false);
    });
  });

  describe("detectConfirmationBias: 偽陽性のリスク", () => {
    it("全テストが成功した場合に偽陽性になる可能性", () => {
      const output = `EVIDENCE: 成功: テストA, 成功: テストB, 成功: テストC, 成功: テストD`;
      const result = detectConfirmationBias(output);
      // 全て成功しているのは事実だが、確認バイアスと判定される可能性
      console.log("Confirmation bias result:", result);
    });

    it("反証を探したが見つからなかった場合の記述", () => {
      const output = `EVIDENCE: 成功: テストA, 成功: テストB, 成功: テストC
反例を探したが見つからなかった`;
      const result = detectConfirmationBias(output);
      // 「反例」キーワードがあるため検出されないはず
      expect(result.detected).toBe(false);
    });
  });

  describe("表記依存のまとめ", () => {
    it("標準形式でないと検出できない問題", () => {
      const cases = [
        { input: "CLAIM: A\nRESULT: B", expected: "検出可能" },
        { input: "claim: A\nresult: B", expected: "検出可能（iフラグ）" },
        { input: "主張: A\n結果: B", expected: "検出不可（偽陰性）" },
        { input: "Claim - A\nResult - B", expected: "検出不可（偽陰性）" },
        { input: "C: A\nR: B", expected: "検出不可（偽陰性）" },
      ];

      console.log("表記依存の問題:");
      for (const c of cases) {
        const result = detectClaimResultMismatch(c.input);
        console.log(`  "${c.input}" -> detected: ${result.detected}, expected: ${c.expected}`);
      }
    });
  });
});
