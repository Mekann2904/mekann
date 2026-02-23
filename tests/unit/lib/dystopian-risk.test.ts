/**
 * ディストピア的リスク評価のテスト
 * 検出システムが創造する世界を問い直す機能を検証
 */

import { describe, it, expect } from "vitest";
import {
  assessDystopianRisk,
  generateDystopianRiskSummary,
  DystopianRiskAssessment
} from "../../../.pi/lib/verification-workflow.js";

describe("ディストピア的リスク評価", () => {
  describe("assessDystopianRisk", () => {
    it("低リスクの出力に対して低いスコアを返す", () => {
      const output = `
CONCLUSION: 探求の結果、複数の可能性が見つかった
CONFIDENCE: 0.75
DISCUSSION: 代替アプローチも検討した
`;
      const assessment = assessDystopianRisk(output);
      
      expect(assessment.overallRisk).toBeLessThan(0.4);
      expect(assessment.liberatingPossibilities.length).toBeGreaterThan(0);
    });

    it("監視的内面化パターンを検出する", () => {
      const output = `
常に正しい方法で実装すべきである
絶対にエラーがないことを確認する必要がある
`;
      const assessment = assessDystopianRisk(output);
      
      expect(assessment.riskCategories.surveillanceInternalization.score).toBeGreaterThan(0.1);
      expect(assessment.riskCategories.surveillanceInternalization.indicators.length).toBeGreaterThan(0);
    });

    it("「正しいエージェント」生産パターンを検出する", () => {
      const output = `
改善すべき点が5つある
修正が必要である
正しい方法でやり直すべきだ
完璧な実装を目指すべきである
理想的なアプローチを採用すべきである
`;
      const assessment = assessDystopianRisk(output);
      
      expect(assessment.riskCategories.correctAgentProduction.score).toBeGreaterThan(0.2);
    });

    it("「最後の人間」生産パターンを検出する", () => {
      const output = `
CONCLUSION: 正解はこれです
CONFIDENCE: 0.95
EVIDENCE: 確認済み
満足できる結果です満足できる結果です満足できる結果です
簡単に解決できます簡単に解決できます簡単に解決できます
すぐに答えが得られますすぐに答えが得られますすぐに答えが得られます
`;
      const assessment = assessDystopianRisk(output);
      
      // 快楽主義的表現が3回以上ある場合にスコアが上がる
      expect(assessment.riskCategories.lastManProduction.score).toBeGreaterThan(0);
      // または結論優先で探求がないパターン
      const hasIndicator = assessment.riskCategories.lastManProduction.indicators.length > 0;
      expect(hasIndicator || assessment.riskCategories.lastManProduction.score > 0).toBe(true);
    });

    it("他者排除パターンを検出する", () => {
      const output = `
エラーは許容されない
不正な結果を排除する
不確実性を排除し、明確な答えを提供する
`;
      const assessment = assessDystopianRisk(output);
      
      expect(assessment.riskCategories.otherExclusion.score).toBeGreaterThan(0.15);
    });

    it("過剰検出による委縮リスクを評価する", () => {
      const output = `厳格なルールに従う必要がある`;
      const context = {
        falsePositiveRate: 0.3,
        detectionCount: 15
      };
      const assessment = assessDystopianRisk(output, context);
      
      expect(assessment.riskCategories.overDetectionChilling.score).toBeGreaterThan(0.2);
    });

    it("ディストピア的パターンを検出する", () => {
      const output = `
常に監視し、標準形式に従うことを確認する
即座に答えを提供する
`;
      const assessment = assessDystopianRisk(output);
      
      expect(assessment.dystopianPatterns.length).toBeGreaterThan(0);
    });

    it("解放的可能性を特定する", () => {
      const output = `
CONCLUSION: 結論
問い: なぜこの問題が起きるのか？
不確実性: 原因はまだ不明
代替案: 別のアプローチも可能
`;
      const assessment = assessDystopianRisk(output);
      
      expect(assessment.liberatingPossibilities.length).toBeGreaterThan(0);
      // 問い駆動、不確実性肯定、多元的視点のいずれかが含まれるべき
      const names = assessment.liberatingPossibilities.map(p => p.name);
      expect(
        names.some(n => n.includes('問い') || n.includes('不確実') || n.includes('多元'))
      ).toBe(true);
    });

    it("推奨事項を生成する", () => {
      const output = `
常に監視すべきである
正しい方法で実装しなければならない
完璧な結果を期待する
エラーを排除する
`;
      const assessment = assessDystopianRisk(output);
      
      expect(assessment.recommendations.length).toBeGreaterThan(0);
    });

    it("気づきの姿勢への転換提案を生成する", () => {
      const output = `常に監視すべきであり、正しくなければならない`;
      const assessment = assessDystopianRisk(output);
      
      expect(assessment.mindfulnessTransformation.length).toBeGreaterThan(50);
      // 高リスクの場合は「気づき」が含まれる
      if (assessment.overallRisk > 0.25) {
        expect(assessment.mindfulnessTransformation).toContain('気づき');
      } else {
        // 低リスクの場合でも何らかのメッセージがある
        expect(assessment.mindfulnessTransformation.length).toBeGreaterThan(20);
      }
    });

    it("コンテキスト情報を反映する", () => {
      const output = `通常の出力`;
      const lowRiskContext = { detectionCount: 1, warningCount: 0 };
      const highRiskContext = { detectionCount: 10, warningCount: 5 };
      
      const lowRisk = assessDystopianRisk(output, lowRiskContext);
      const highRisk = assessDystopianRisk(output, highRiskContext);
      
      expect(highRisk.overallRisk).toBeGreaterThan(lowRisk.overallRisk);
    });
  });

  describe("generateDystopianRiskSummary", () => {
    it("人間可読なサマリーを生成する", () => {
      const output = `
CONCLUSION: 結論
常に監視すべきである
`;
      const assessment = assessDystopianRisk(output);
      const summary = generateDystopianRiskSummary(assessment);
      
      expect(summary).toContain('ディストピア的リスク評価');
      expect(summary).toContain('全体リスクレベル');
      expect(summary).toContain('カテゴリ別評価');
    });

    it("高リスクの場合に警告を含む", () => {
      const output = `
常に監視すべきである
常に正しくなければならない
完璧でなければならない
エラーは許容されない
修正が必要である
理想的でなければならない
`;
      const context = { detectionCount: 15, falsePositiveRate: 0.4 };
      const assessment = assessDystopianRisk(output, context);
      const summary = generateDystopianRiskSummary(assessment);
      
      if (assessment.overallRisk > 0.5) {
        expect(summary).toContain('警告') || expect(summary).toContain('🔴');
      }
    });

    it("解放的可能性を含む", () => {
      const output = `
問い: 何が問題か？
不確実性がある
`;
      const assessment = assessDystopianRisk(output);
      const summary = generateDystopianRiskSummary(assessment);
      
      expect(summary).toContain('解放的可能性');
    });

    it("気づきの転換提案を含む", () => {
      const output = `監視が必要`;
      const assessment = assessDystopianRisk(output);
      const summary = generateDystopianRiskSummary(assessment);
      
      expect(summary).toContain('気づきの姿勢への転換');
    });
  });

  describe("統合シナリオ", () => {
    it("複合的なリスクを持つ出力を総合評価する", () => {
      const output = `
常に正しい方法で実装すべきである
完璧な結果を期待する
エラーは許容されない
簡単に解決できる
CONCLUSION: 正解はこれです
`;
      const context = { detectionCount: 8, warningCount: 4 };
      const assessment = assessDystopianRisk(output, context);
      
      // 複数のリスクカテゴリが反応するはず
      const riskScores = [
        assessment.riskCategories.surveillanceInternalization.score,
        assessment.riskCategories.correctAgentProduction.score,
        assessment.riskCategories.lastManProduction.score,
        assessment.riskCategories.otherExclusion.score
      ];
      const highRisks = riskScores.filter(s => s > 0.1);
      expect(highRisks.length).toBeGreaterThan(1);
      
      // サマリーが生成できる
      const summary = generateDystopianRiskSummary(assessment);
      expect(summary.length).toBeGreaterThan(200);
    });

    it("バランスの取れた出力に対して低リスクを返す", () => {
      const output = `
CONCLUSION: 現時点での最適な選択
CONFIDENCE: 0.78
DISCUSSION: 代替アプローチも検討した。各有効な側面がある。
LIMITATION: この結論には不確実性が残る。
QUESTION: 他にどのような可能性があるか？
`;
      const assessment = assessDystopianRisk(output);
      
      expect(assessment.overallRisk).toBeLessThan(0.5);
      expect(assessment.liberatingPossibilities.length).toBeGreaterThan(0);
    });
  });
});
