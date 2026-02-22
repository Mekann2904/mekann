/**
 * 検出不確実性評価のテスト
 * 「何が検出されなかったか」を認識する能力を検証
 */

import { describe, it, expect } from "vitest";
import {
  assessDetectionUncertainty,
  generateUncertaintySummary,
  DetectionUncertaintyAssessment
} from "../../../.pi/lib/verification-workflow.js";

describe("検出不確実性評価", () => {
  describe("assessDetectionUncertainty", () => {
    it("標準形式の出力に対して高信頼度を返す", () => {
      const output = `
CLAIM: Implementation is complete
RESULT: Tests pass and code is deployed
CONFIDENCE: 0.85
EVIDENCE: Unit tests in test/unit/foo.test.ts all pass (lines 45-120).
DISCUSSION: Considered alternative approaches but chose current implementation.
`;
      const assessment = assessDetectionUncertainty(output);
      
      expect(assessment.negativeResultConfidence).toBeGreaterThan(0.6);
      expect(assessment.detectionLimitations.length).toBeLessThan(3);
      expect(assessment.alternativeFormatRisk.risk).toBeLessThan(0.3);
    });

    it("日本語ラベルのみの出力に対して形式リスクを検出", () => {
      const output = `
主張: 実装は完了した
結果: テストが通った
信頼度: 0.9
証拠: テストが成功した
`;
      const assessment = assessDetectionUncertainty(output);
      
      expect(assessment.alternativeFormatRisk.risk).toBeGreaterThan(0.2);
      expect(assessment.detectionLimitations.some(l => l.type === 'language-dependency')).toBe(true);
      expect(assessment.negativeResultConfidence).toBeLessThan(0.8);
    });

    it("省略形ラベル（C:/R:）に対して見落とし候補を検出", () => {
      const output = `
C: 実装完了
R: 削除が必要
CONFIDENCE: 0.95
EVIDENCE: 短い証拠
`;
      const assessment = assessDetectionUncertainty(output);
      
      // 省略形が検出されないため、見落とし候補に含まれるべき
      const missedMismatch = assessment.potentiallyMissedIssues.find(
        m => m.issueType === 'CLAIM-RESULT mismatch'
      );
      expect(missedMismatch).toBeDefined();
      expect(missedMismatch?.probability).toBeGreaterThan(0.3);
    });

    it("境界値付近の証拠長に対して限界を検出", () => {
      const evidence = "a".repeat(98);
      const output = `
CONFIDENCE: 0.91
EVIDENCE: ${evidence}
`;
      const assessment = assessDetectionUncertainty(output);
      
      expect(assessment.detectionLimitations.some(
        l => l.type === 'threshold-arbitrariness'
      )).toBe(true);
    });

    it("構造化されていない長文に対してパターン網羅性の限界を検出", () => {
      const output = "a".repeat(600); // 長文だが構造化なし
      
      const assessment = assessDetectionUncertainty(output);
      
      expect(assessment.detectionLimitations.some(
        l => l.type === 'pattern-coverage'
      )).toBe(true);
    });

    it("高信頼度だが代替解釈なしの場合に見落とし候補を検出", () => {
      const output = `
CONCLUSION: この方法が最適です
CONFIDENCE: 0.92
EVIDENCE: テストが全て成功した
`;
      const assessment = assessDetectionUncertainty(output);
      
      const missedAlternative = assessment.potentiallyMissedIssues.find(
        m => m.issueType === 'Missing alternatives'
      );
      expect(missedAlternative).toBeDefined();
      expect(missedAlternative?.probability).toBeGreaterThan(0.3);
    });

    it("肯定的証拠のみの場合に確認バイアスの見落とし候補を検出", () => {
      const output = `
EVIDENCE: 成功: テストA, 成功: テストB, 成功: テストC, 成功: テストD
CONCLUSION: 実装は問題ない
CONFIDENCE: 0.88
`;
      const assessment = assessDetectionUncertainty(output);
      
      const missedBias = assessment.potentiallyMissedIssues.find(
        m => m.issueType === 'Confirmation bias'
      );
      expect(missedBias).toBeDefined();
    });

    it("推奨される追加検証を生成する", () => {
      const output = `
主張: 実装完了
結果: テスト成功
信頼度: 0.95
証拠: テスト通過
`;
      const assessment = assessDetectionUncertainty(output);
      
      expect(assessment.recommendedAdditionalChecks.length).toBeGreaterThan(0);
      // 形式リスクがある場合、標準形式への変換が推奨されるべき
      expect(assessment.recommendedAdditionalChecks.some(
        c => c.includes('標準形式') || c.includes('Format')
      )).toBe(true);
    });
  });

  describe("generateUncertaintySummary", () => {
    it("人間可読なサマリーを生成する", () => {
      const output = `
CLAIM: Test
RESULT: Pass
CONFIDENCE: 0.85
EVIDENCE: Tests pass
`;
      const assessment = assessDetectionUncertainty(output);
      const summary = generateUncertaintySummary(assessment);
      
      expect(summary).toContain('検出不確実性評価');
      expect(summary).toContain('検出結果と信頼度');
      expect(summary).toContain('「検出なし」への信頼度');
    });

    it("低信頼度の場合に警告を含む", () => {
      const output = `
主張: テスト
結果: 成功
`;
      const assessment = assessDetectionUncertainty(output);
      const summary = generateUncertaintySummary(assessment);
      
      if (assessment.negativeResultConfidence < 0.6) {
        expect(summary).toContain('警告');
      }
    });

    it("見落とし候補がある場合に詳細を含む", () => {
      const output = `
C: 実装完了
R: 削除が必要
CONFIDENCE: 0.95
EVIDENCE: 短い
`;
      const assessment = assessDetectionUncertainty(output);
      const summary = generateUncertaintySummary(assessment);
      
      if (assessment.potentiallyMissedIssues.length > 0) {
        expect(summary).toContain('見落としの可能性');
      }
    });
  });

  describe("統合シナリオ", () => {
    it("複合的な問題を持つ出力を総合評価する", () => {
      const output = `
主張: このアプローチが最適である
結果: 実装を完了した
信頼度: 0.95
証拠: テストが成功した
結論: 問題ない
`;
      const assessment = assessDetectionUncertainty(output);
      
      // 複数の問題があるはず
      expect(assessment.detectionLimitations.length).toBeGreaterThan(0);
      expect(assessment.alternativeFormatRisk.risk).toBeGreaterThan(0);
      expect(assessment.negativeResultConfidence).toBeLessThan(0.9);
      
      // サマリーが生成できる
      const summary = generateUncertaintySummary(assessment);
      expect(summary.length).toBeGreaterThan(100);
    });

    it("完璧な形式の出力でも限界を認識する", () => {
      const output = `
CLAIM: Implementation verified
RESULT: All tests pass
CONFIDENCE: 0.88
EVIDENCE: Unit tests in src/test/foo.test.ts:45-120 all pass. Integration tests verify edge cases.
DISCUSSION: Alternative approach B was considered but rejected due to performance concerns.
LIMITATION: Edge case for empty input needs manual verification.
`;
      const assessment = assessDetectionUncertainty(output);
      
      // 高品質な出力でも何らかの評価がされる
      expect(assessment.negativeResultConfidence).toBeGreaterThan(0.5);
      
      // 検出サマリーが正しく生成される
      expect(assessment.detectionSummary.claimResultMismatch).toBeDefined();
      expect(assessment.detectionSummary.overconfidence).toBeDefined();
    });
  });
});
