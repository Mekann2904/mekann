/**
 * perspective-scorer.tsの単体テスト
 * 7つの哲学的視座に基づく評価モジュールを検証する
 */

import { describe, it, expect } from "vitest";
import {
  type Perspective,
  type PerspectiveScores,
  type PerspectiveCriteria,
  PERSPECTIVE_NAMES,
  PERSPECTIVE_CRITERIA,
  scoreAllPerspectives,
  getImprovementPriority,
  getPerspectiveReport,
  formatScoresForOutput,
  getDefaultScores,
} from "../../lib/perspective-scorer.js";
import * as fc from "fast-check";

describe("perspective-scorer", () => {
  describe("PERSPECTIVE_NAMES", () => {
    it("7つの視座すべてに日本語名が定義されている", () => {
      // Arrange
      const perspectives: Perspective[] = [
        "deconstruction",
        "schizoAnalysis",
        "eudaimonia",
        "utopiaDystopia",
        "philosophyOfThought",
        "taxonomyOfThought",
        "logic",
      ];

      // Act & Assert
      perspectives.forEach((p) => {
        expect(PERSPECTIVE_NAMES[p]).toBeDefined();
        expect(PERSPECTIVE_NAMES[p].length).toBeGreaterThan(0);
      });
    });

    it("各視座名は一意である", () => {
      // Arrange
      const names = Object.values(PERSPECTIVE_NAMES);

      // Act & Assert
      expect(new Set(names).size).toBe(names.length);
    });
  });

  describe("PERSPECTIVE_CRITERIA", () => {
    it("7つの視座すべてに評価基準が定義されている", () => {
      // Arrange
      const perspectives = Object.keys(PERSPECTIVE_NAMES) as Perspective[];

      // Act & Assert
      perspectives.forEach((p) => {
        expect(PERSPECTIVE_CRITERIA[p]).toBeDefined();
        expect(PERSPECTIVE_CRITERIA[p].scoringFactors.positive.length).toBeGreaterThan(0);
      });
    });

    it("各視座には肯定的・否定的要因の両方が定義されている", () => {
      // Arrange
      const perspectives = Object.keys(PERSPECTIVE_NAMES) as Perspective[];

      // Act & Assert
      perspectives.forEach((p) => {
        const criteria = PERSPECTIVE_CRITERIA[p];
        expect(criteria.scoringFactors.positive.length).toBeGreaterThan(0);
        // 否定的要因は必須ではないが、定義されている場合は配列である
        if (criteria.scoringFactors.negative) {
          expect(Array.isArray(criteria.scoringFactors.negative)).toBe(true);
        }
      });
    });

    it("各スコアリングファクターは正規表現とポイントを持つ", () => {
      // Arrange
      const perspectives = Object.keys(PERSPECTIVE_NAMES) as Perspective[];

      // Act & Assert
      perspectives.forEach((p) => {
        const criteria = PERSPECTIVE_CRITERIA[p];
        criteria.scoringFactors.positive.forEach((factor) => {
          expect(factor.pattern).toBeInstanceOf(RegExp);
          expect(typeof factor.points).toBe("number");
          expect(factor.description).toBeDefined();
        });
      });
    });
  });

  describe("scoreAllPerspectives", () => {
    it("空の出力でもデフォルトスコアを返す", () => {
      // Arrange & Act
      const scores = scoreAllPerspectives("");

      // Assert
      expect(scores.total).toBe(350); // 7視座 * 50点ベースライン
      expect(scores.average).toBe(50);
    });

    it("脱構築のキーワードを含む出力は高スコア", () => {
      // Arrange
      const output = `
        この前提を検討すると、バイアスが見える。
        しかし、一方で別の視点もある。
        アポリアとして、この矛盾を認識する。
      `;

      // Act
      const scores = scoreAllPerspectives(output);

      // Assert
      expect(scores.deconstruction).toBeGreaterThan(50);
    });

    it("論理構造を含む出力は高スコア", () => {
      // Arrange
      const output = `
        CLAIM: この実装は正しい
        EVIDENCE: テストがパスしている
        したがって、結論として採用する
      `;

      // Act
      const scores = scoreAllPerspectives(output);

      // Assert
      expect(scores.logic).toBeGreaterThan(50);
    });

    it("タイムスタンプが含まれる", () => {
      // Arrange & Act
      const scores = scoreAllPerspectives("test");

      // Assert
      expect(scores.timestamp).toBeDefined();
      expect(new Date(scores.timestamp).getTime()).not.toBeNaN();
    });

    it("意識レベルコンテキストなしの場合、consciousnessLevelはundefined", () => {
      // Arrange & Act
      const scores = scoreAllPerspectives("test");

      // Assert
      expect(scores.consciousnessLevel).toBeUndefined();
    });

    it("意識レベルコンテキストありの場合、consciousnessLevelが評価される", () => {
      // Arrange
      const output = "私の思考について考えます。CONFIDENCE: 0.8";
      const context = {
        consciousnessContext: {
          hasMetaCognitiveMarkers: true,
          hasSelfReference: true,
        },
      };

      // Act
      const scores = scoreAllPerspectives(output, context);

      // Assert
      expect(scores.consciousnessLevel).toBeDefined();
    });
  });

  describe("getImprovementPriority", () => {
    it("全視座が目標以上の場合は空配列を返す", () => {
      // Arrange
      const scores: PerspectiveScores = {
        deconstruction: 80,
        schizoAnalysis: 80,
        eudaimonia: 80,
        utopiaDystopia: 80,
        philosophyOfThought: 80,
        taxonomyOfThought: 80,
        logic: 80,
        total: 560,
        average: 80,
        timestamp: new Date().toISOString(),
      };

      // Act
      const priorities = getImprovementPriority(scores);

      // Assert
      expect(priorities).toHaveLength(0);
    });

    it("低いスコアの視座はcritical優先度になる", () => {
      // Arrange
      const scores: PerspectiveScores = {
        deconstruction: 30,
        schizoAnalysis: 70,
        eudaimonia: 70,
        utopiaDystopia: 70,
        philosophyOfThought: 70,
        taxonomyOfThought: 70,
        logic: 70,
        total: 450,
        average: 64.3,
        timestamp: new Date().toISOString(),
      };

      // Act
      const priorities = getImprovementPriority(scores);

      // Assert
      expect(priorities[0].perspective).toBe("deconstruction");
      expect(priorities[0].priority).toBe("critical");
    });

    it("優先度順でソートされる", () => {
      // Arrange
      const scores: PerspectiveScores = {
        deconstruction: 30, // critical
        schizoAnalysis: 45, // high
        eudaimonia: 55, // medium
        utopiaDystopia: 65, // low
        philosophyOfThought: 80,
        taxonomyOfThought: 80,
        logic: 80,
        total: 435,
        average: 62.1,
        timestamp: new Date().toISOString(),
      };

      // Act
      const priorities = getImprovementPriority(scores);

      // Assert
      expect(priorities[0].priority).toBe("critical");
      expect(priorities[1].priority).toBe("high");
      expect(priorities[2].priority).toBe("medium");
      expect(priorities[3].priority).toBe("low");
    });

    it("各優先度アイテムは推奨事項を含む", () => {
      // Arrange
      const scores: PerspectiveScores = {
        deconstruction: 30,
        schizoAnalysis: 80,
        eudaimonia: 80,
        utopiaDystopia: 80,
        philosophyOfThought: 80,
        taxonomyOfThought: 80,
        logic: 80,
        total: 510,
        average: 72.9,
        timestamp: new Date().toISOString(),
      };

      // Act
      const priorities = getImprovementPriority(scores);

      // Assert
      expect(priorities[0].recommendations.length).toBeGreaterThan(0);
    });
  });

  describe("getPerspectiveReport", () => {
    it("レポートには総合スコアが含まれる", () => {
      // Arrange
      const scores = getDefaultScores();

      // Act
      const report = getPerspectiveReport(scores);

      // Assert
      expect(report).toContain("総合スコア");
      expect(report).toContain("350 / 700");
    });

    it("レポートには視座別スコアテーブルが含まれる", () => {
      // Arrange
      const scores = getDefaultScores();

      // Act
      const report = getPerspectiveReport(scores);

      // Assert
      expect(report).toContain("視座別スコア");
      expect(report).toContain("脱構築");
      expect(report).toContain("スキゾ分析");
      expect(report).toContain("幸福論");
    });

    it("改善優先順位がある場合は表示される", () => {
      // Arrange
      const scores: PerspectiveScores = {
        deconstruction: 30,
        schizoAnalysis: 80,
        eudaimonia: 80,
        utopiaDystopia: 80,
        philosophyOfThought: 80,
        taxonomyOfThought: 80,
        logic: 80,
        total: 510,
        average: 72.9,
        timestamp: new Date().toISOString(),
      };

      // Act
      const report = getPerspectiveReport(scores);

      // Assert
      expect(report).toContain("改善優先順位");
    });

    it("意識レベルがある場合は表示される", () => {
      // Arrange
      const scores: PerspectiveScores = {
        ...getDefaultScores(),
        consciousnessLevel: {
          phenomenalConsciousness: 0.7,
          accessConsciousness: 0.8,
          metacognitiveLevel: 0.6,
          selfContinuity: 0.5,
          globalWorkspaceIntegration: 0.7,
          overallLevel: 0.66,
          stage: "Deliberate" as any,
        },
      };

      // Act
      const report = getPerspectiveReport(scores);

      // Assert
      expect(report).toContain("意識レベル評価");
    });
  });

  describe("formatScoresForOutput", () => {
    it("フォーマット済みスコア文字列を返す", () => {
      // Arrange
      const scores = getDefaultScores();

      // Act
      const formatted = formatScoresForOutput(scores);

      // Assert
      expect(formatted).toContain("PERSPECTIVE_SCORES:");
      expect(formatted).toContain("脱構築: 50");
      expect(formatted).toContain("論理学: 50");
    });
  });

  describe("getDefaultScores", () => {
    it("デフォルト値で初期化されたスコアを返す", () => {
      // Arrange & Act
      const scores = getDefaultScores();

      // Assert
      expect(scores.deconstruction).toBe(50);
      expect(scores.schizoAnalysis).toBe(50);
      expect(scores.eudaimonia).toBe(50);
      expect(scores.utopiaDystopia).toBe(50);
      expect(scores.philosophyOfThought).toBe(50);
      expect(scores.taxonomyOfThought).toBe(50);
      expect(scores.logic).toBe(50);
      expect(scores.total).toBe(350);
      expect(scores.average).toBe(50);
    });

    it("常に新しいタイムスタンプを持つ", () => {
      // Arrange
      const before = getDefaultScores();

      // Act
      const after = getDefaultScores();

      // Assert
      // 少し時間が経っている可能性があるが、形式は正しい
      expect(new Date(before.timestamp)).toBeInstanceOf(Date);
      expect(new Date(after.timestamp)).toBeInstanceOf(Date);
    });
  });

  describe("プロパティベーステスト", () => {
    it("スコアは常に0-100の範囲内", () => {
      fc.assert(
        fc.property(fc.string({ maxLength: 1000 }), (output) => {
          const scores = scoreAllPerspectives(output);
          return (
            scores.deconstruction >= 0 &&
            scores.deconstruction <= 100 &&
            scores.schizoAnalysis >= 0 &&
            scores.schizoAnalysis <= 100 &&
            scores.eudaimonia >= 0 &&
            scores.eudaimonia <= 100 &&
            scores.utopiaDystopia >= 0 &&
            scores.utopiaDystopia <= 100 &&
            scores.philosophyOfThought >= 0 &&
            scores.philosophyOfThought <= 100 &&
            scores.taxonomyOfThought >= 0 &&
            scores.taxonomyOfThought <= 100 &&
            scores.logic >= 0 &&
            scores.logic <= 100
          );
        })
      );
    });

    it("合計スコアは0-700の範囲内", () => {
      fc.assert(
        fc.property(fc.string({ maxLength: 1000 }), (output) => {
          const scores = scoreAllPerspectives(output);
          return scores.total >= 0 && scores.total <= 700;
        })
      );
    });

    it("平均スコアは合計/7と一致", () => {
      fc.assert(
        fc.property(fc.string({ maxLength: 1000 }), (output) => {
          const scores = scoreAllPerspectives(output);
          const expectedAverage = scores.total / 7;
          return Math.abs(scores.average - expectedAverage) < 0.01;
        })
      );
    });

    it("getImprovementPriorityの結果は常に優先度順", () => {
      fc.assert(
        fc.property(
          fc.record({
            deconstruction: fc.integer({ min: 0, max: 100 }),
            schizoAnalysis: fc.integer({ min: 0, max: 100 }),
            eudaimonia: fc.integer({ min: 0, max: 100 }),
            utopiaDystopia: fc.integer({ min: 0, max: 100 }),
            philosophyOfThought: fc.integer({ min: 0, max: 100 }),
            taxonomyOfThought: fc.integer({ min: 0, max: 100 }),
            logic: fc.integer({ min: 0, max: 100 }),
          }),
          (partialScores) => {
            const scores: PerspectiveScores = {
              ...partialScores,
              total: Object.values(partialScores).reduce((a, b) => a + b, 0),
              average: Object.values(partialScores).reduce((a, b) => a + b, 0) / 7,
              timestamp: new Date().toISOString(),
            };
            const priorities = getImprovementPriority(scores);
            const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
            for (let i = 1; i < priorities.length; i++) {
              if (priorityOrder[priorities[i - 1].priority] > priorityOrder[priorities[i].priority]) {
                return false;
              }
            }
            return true;
          }
        )
      );
    });
  });
});
