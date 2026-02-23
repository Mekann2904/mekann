/**
 * @abdd.meta
 * path: .pi/tests/lib/perspective-scorer.test.ts
 * role: perspective-scorer.tsの単体テスト
 * why: 7つの哲学的視座に基づく評価機能の正確性を保証するため
 * related: .pi/lib/perspective-scorer.ts, .pi/lib/consciousness-spectrum.ts
 * public_api: テストケースの実行
 * invariants: テストは純粋関数のテストのみ
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: 哲学的視座スコアリング機能の単体テスト
 * what_it_does:
 *   - scoreAllPerspectives関数のテスト
 *   - getImprovementPriority関数のテスト
 *   - getPerspectiveReport関数のテスト
 *   - formatScoresForOutput関数のテスト
 * why_it_exists: 視座スコアリング機能の信頼性を保証するため
 * scope:
 *   in: .pi/lib/perspective-scorer.ts
 *   out: テスト結果
 */

import { describe, it, expect } from "vitest";
import {
  scoreAllPerspectives,
  getImprovementPriority,
  getPerspectiveReport,
  formatScoresForOutput,
  getDefaultScores,
  PERSPECTIVE_NAMES,
  PERSPECTIVE_CRITERIA,
  type Perspective,
  type PerspectiveScores,
} from "../../lib/perspective-scorer.js";

// ============================================================================
// Tests: PERSPECTIVE_NAMES
// ============================================================================

describe("PERSPECTIVE_NAMES", () => {
  it("7つの視座が定義されている", () => {
    // Assert
    expect(Object.keys(PERSPECTIVE_NAMES).length).toBe(7);
  });

  it("日本語名が正しくマッピングされている", () => {
    // Assert
    expect(PERSPECTIVE_NAMES.deconstruction).toBe("脱構築");
    expect(PERSPECTIVE_NAMES.schizoAnalysis).toBe("スキゾ分析");
    expect(PERSPECTIVE_NAMES.eudaimonia).toBe("幸福論");
    expect(PERSPECTIVE_NAMES.utopiaDystopia).toBe("ユートピア/ディストピア");
    expect(PERSPECTIVE_NAMES.philosophyOfThought).toBe("思考哲学");
    expect(PERSPECTIVE_NAMES.taxonomyOfThought).toBe("思考分類学");
    expect(PERSPECTIVE_NAMES.logic).toBe("論理学");
  });
});

// ============================================================================
// Tests: PERSPECTIVE_CRITERIA
// ============================================================================

describe("PERSPECTIVE_CRITERIA", () => {
  it("全視座の評価基準が定義されている", () => {
    // Assert
    const perspectives: Perspective[] = [
      "deconstruction", "schizoAnalysis", "eudaimonia", "utopiaDystopia",
      "philosophyOfThought", "taxonomyOfThought", "logic"
    ];
    
    for (const p of perspectives) {
      expect(PERSPECTIVE_CRITERIA[p]).toBeDefined();
      expect(PERSPECTIVE_CRITERIA[p].name).toBeDefined();
      expect(PERSPECTIVE_CRITERIA[p].description).toBeDefined();
      expect(PERSPECTIVE_CRITERIA[p].scoringFactors.positive.length).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// Tests: scoreAllPerspectives
// ============================================================================

describe("scoreAllPerspectives", () => {
  it("基本的なスコアを計算する", () => {
    // Arrange
    const output = "これは通常のテスト出力です。";

    // Act
    const scores = scoreAllPerspectives(output);

    // Assert
    expect(scores.total).toBeGreaterThanOrEqual(0);
    expect(scores.total).toBeLessThanOrEqual(700);
    expect(scores.average).toBeGreaterThanOrEqual(0);
    expect(scores.average).toBeLessThanOrEqual(100);
    expect(scores.timestamp).toBeDefined();
  });

  it("脱構築の肯定的パターンを検出する", () => {
    // Arrange
    const output = "この前提を再考する必要があります。バイアスが含まれています。";

    // Act
    const scores = scoreAllPerspectives(output);

    // Assert
    expect(scores.deconstruction).toBeGreaterThan(50);
  });

  it("論理学の肯定的パターンを検出する", () => {
    // Arrange
    const output = "したがって、この結論が導かれます。なぜなら、根拠があるからです。";

    // Act
    const scores = scoreAllPerspectives(output);

    // Assert
    expect(scores.logic).toBeGreaterThan(50);
  });

  it("幸福論の肯定的パターンを検出する", () => {
    // Arrange
    const output = "品質を向上させ、成長を目指します。";

    // Act
    const scores = scoreAllPerspectives(output);

    // Assert
    expect(scores.eudaimonia).toBeGreaterThan(50);
  });

  it("否定的パターンはスコアを下げる", () => {
    // Arrange
    const output = "当然、これは明らかに正しい唯一の方法です。";

    // Act
    const scores = scoreAllPerspectives(output);

    // Assert
    // 「当然」「明らかに」「唯一」は否定的要因
    expect(scores.deconstruction).toBeLessThan(50);
  });

  it("構造化された論証を高く評価する", () => {
    // Arrange
    const output = "CLAIM: テスト結果\nEVIDENCE: データに基づく\nRESULT: 成功";

    // Act
    const scores = scoreAllPerspectives(output);

    // Assert
    expect(scores.logic).toBeGreaterThan(50);
  });

  it("空の出力でもエラーにならない", () => {
    // Arrange & Act
    const scores = scoreAllPerspectives("");

    // Assert
    expect(scores).toBeDefined();
    expect(scores.total).toBeGreaterThanOrEqual(0);
  });

  it("各視座のスコアは0-100の範囲", () => {
    // Arrange
    const output = "長い文章で、多くのパターンを含んでいる可能性のある内容。" +
      "前提、根拠、理由、分析、創造、多様、開かれた、思考、判断など多くのキーワードを含む。";

    // Act
    const scores = scoreAllPerspectives(output);

    // Assert
    const perspectives: Perspective[] = [
      "deconstruction", "schizoAnalysis", "eudaimonia", "utopiaDystopia",
      "philosophyOfThought", "taxonomyOfThought", "logic"
    ];
    
    for (const p of perspectives) {
      expect(scores[p]).toBeGreaterThanOrEqual(0);
      expect(scores[p]).toBeLessThanOrEqual(100);
    }
  });

  it("コンテキストがある場合は意識レベルを含む", () => {
    // Arrange
    const output = "メタ認知的な思考";
    const context = {
      consciousnessContext: {
        hasMetaCognitiveMarkers: true,
        hasSelfReference: true,
      }
    };

    // Act
    const scores = scoreAllPerspectives(output, context);

    // Assert
    expect(scores.consciousnessLevel).toBeDefined();
  });
});

// ============================================================================
// Tests: getImprovementPriority
// ============================================================================

describe("getImprovementPriority", () => {
  it("改善が必要な視座の優先順位を返す", () => {
    // Arrange
    const scores = getDefaultScores(); // 全て50点（目標75点との差は25）

    // Act
    const priorities = getImprovementPriority(scores);

    // Assert
    expect(priorities.length).toBeGreaterThan(0);
    expect(priorities[0].priority).toBeDefined();
  });

  it("高スコアの視座は優先順位に含まれない", () => {
    // Arrange
    const scores: PerspectiveScores = {
      ...getDefaultScores(),
      deconstruction: 80,
      logic: 85,
    };

    // Act
    const priorities = getImprovementPriority(scores);
    const perspectiveNames = priorities.map(p => p.perspective);

    // Assert
    expect(perspectiveNames).not.toContain("deconstruction");
    expect(perspectiveNames).not.toContain("logic");
  });

  it("優先度でソートされる", () => {
    // Arrange
    const scores: PerspectiveScores = {
      ...getDefaultScores(),
      deconstruction: 20, // critical
      logic: 50,          // high
      eudaimonia: 60,     // medium
    };

    // Act
    const priorities = getImprovementPriority(scores);

    // Assert
    // criticalが最初に来る
    const criticalCount = priorities.filter(p => p.priority === "critical").length;
    if (criticalCount > 0) {
      expect(priorities[0].priority).toBe("critical");
    }
  });

  it("各優先順位項目に推奨事項が含まれる", () => {
    // Arrange
    const scores = getDefaultScores();

    // Act
    const priorities = getImprovementPriority(scores);

    // Assert
    for (const p of priorities) {
      expect(p.recommendations.length).toBeGreaterThan(0);
      expect(p.name).toBeDefined();
      expect(p.gap).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// Tests: getPerspectiveReport
// ============================================================================

describe("getPerspectiveReport", () => {
  it("レポートを生成できる", () => {
    // Arrange
    const scores = getDefaultScores();

    // Act
    const report = getPerspectiveReport(scores);

    // Assert
    expect(report).toContain("7つの哲学的視座 評価レポート");
    expect(report).toContain("総合スコア");
    expect(report).toContain("視座別スコア");
  });

  it("視座名が含まれる", () => {
    // Arrange
    const scores = getDefaultScores();

    // Act
    const report = getPerspectiveReport(scores);

    // Assert
    expect(report).toContain("脱構築");
    expect(report).toContain("スキゾ分析");
    expect(report).toContain("幸福論");
    expect(report).toContain("論理学");
  });

  it("改善優先順位が含まれる", () => {
    // Arrange
    const scores = getDefaultScores();

    // Act
    const report = getPerspectiveReport(scores);

    // Assert
    expect(report).toContain("改善優先順位");
  });

  it("評価時刻が含まれる", () => {
    // Arrange
    const scores = getDefaultScores();

    // Act
    const report = getPerspectiveReport(scores);

    // Assert
    expect(report).toContain("評価時刻");
  });

  it("意識レベルがある場合は含まれる", () => {
    // Arrange
    const scores: PerspectiveScores = {
      ...getDefaultScores(),
      consciousnessLevel: {
        overallLevel: 0.5,
        stage: "responsive",
        phenomenalConsciousness: 0.5,
        accessConsciousness: 0.5,
        metacognitiveLevel: 0.5,
        selfContinuity: 0.5,
        globalWorkspaceIntegration: 0.5,
        timestamp: new Date().toISOString(),
      }
    };

    // Act
    const report = getPerspectiveReport(scores);

    // Assert
    expect(report).toContain("意識レベル評価");
  });
});

// ============================================================================
// Tests: formatScoresForOutput
// ============================================================================

describe("formatScoresForOutput", () => {
  it("出力フォーマット用の文字列を生成する", () => {
    // Arrange
    const scores = getDefaultScores();

    // Act
    const formatted = formatScoresForOutput(scores);

    // Assert
    expect(formatted).toContain("PERSPECTIVE_SCORES:");
    expect(formatted).toContain("脱構築: 50");
    expect(formatted).toContain("論理学: 50");
  });

  it("各視座のスコアが含まれる", () => {
    // Arrange
    const scores = getDefaultScores();

    // Act
    const formatted = formatScoresForOutput(scores);

    // Assert
    expect(formatted).toContain("スキゾ分析");
    expect(formatted).toContain("幸福論");
    expect(formatted).toContain("ユートピア/ディストピア");
    expect(formatted).toContain("思考哲学");
    expect(formatted).toContain("思考分類学");
  });
});

// ============================================================================
// Tests: getDefaultScores
// ============================================================================

describe("getDefaultScores", () => {
  it("デフォルトスコアを返す", () => {
    // Act
    const scores = getDefaultScores();

    // Assert
    expect(scores.deconstruction).toBe(50);
    expect(scores.schizoAnalysis).toBe(50);
    expect(scores.eudaimonia).toBe(50);
    expect(scores.total).toBe(350);
    expect(scores.average).toBe(50);
  });

  it("タイムスタンプが設定される", () => {
    // Act
    const scores = getDefaultScores();

    // Assert
    expect(scores.timestamp).toBeDefined();
    expect(new Date(scores.timestamp).getTime()).not.toBeNaN();
  });
});
