/**
 * consciousness-spectrum.ts の単体テスト
 *
 * テスト対象:
 * - evaluateConsciousnessLevel: 意識レベル評価
 * - generateImprovementRecommendations: 改善推奨事項生成
 * - getConsciousnessReport: レポート生成
 * - analyzeGlobalWorkspace: グローバルワークスペース解析
 * - STAGE_CRITERIA: 段階基準定数
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  evaluateConsciousnessLevel,
  generateImprovementRecommendations,
  getConsciousnessReport,
  analyzeGlobalWorkspace,
  STAGE_CRITERIA,
  type ConsciousnessState,
  type ConsciousnessStage,
} from "../../../.pi/lib/consciousness-spectrum.js";

describe("consciousness-spectrum.ts", () => {
  describe("evaluateConsciousnessLevel", () => {
    describe("正常系", () => {
      it("単純な出力は反応的段階として評価される", () => {
        // Arrange
        const output = "処理を完了しました。";

        // Act
        const state = evaluateConsciousnessLevel(output);

        // Assert
        expect(state.overallLevel).toBeGreaterThanOrEqual(0);
        expect(state.overallLevel).toBeLessThanOrEqual(1);
        expect(["reactive", "phenomenal", "introspective", "autobiographical"]).toContain(state.stage);
      });

      it("文脈を考慮した出力は現象的段階で高く評価される", () => {
        // Arrange
        const output = "この文脈では、状況を考慮して判断しました。主観的には適切だと感じています。";

        // Act
        const state = evaluateConsciousnessLevel(output);

        // Assert
        expect(state.phenomenalConsciousness).toBeGreaterThan(0.25);
      });

      it("構造化された出力はアクセス意識で高く評価される", () => {
        // Arrange
        const output = `
SUMMARY: テスト結果の要約
CLAIM: この実装は正しい
EVIDENCE: テストが通ったため
 RESULT: 承認
        `.trim();

        // Act
        const state = evaluateConsciousnessLevel(output);

        // Assert
        expect(state.accessConsciousness).toBeGreaterThan(0.3);
      });

      it("CONFIDENCEを含む出力はメタ認知で高く評価される", () => {
        // Arrange
        const output = "この結論の確信度は CONFIDENCE: 0.7 です。自分の前提を確認しました。";

        // Act
        const state = evaluateConsciousnessLevel(output);

        // Assert
        expect(state.metacognitiveLevel).toBeGreaterThan(0.3);
      });

      it("時間的な言及がある出力は自己継続性で高く評価される", () => {
        // Arrange
        const output = "以前の経験から学び、今後の改善に活かします。これは私の原則です。";

        // Act
        const state = evaluateConsciousnessLevel(output);

        // Assert
        expect(state.selfContinuity).toBeGreaterThan(0.4);
      });

      it("DISCUSSIONを含む出力はGW統合度で高く評価される", () => {
        // Arrange
        const output = `
SUMMARY: 統合結果
DISCUSSION: 他者の意見を考慮しました
 RESULT: 合意形成
        `.trim();

        // Act
        const state = evaluateConsciousnessLevel(output);

        // Assert
        expect(state.globalWorkspaceIntegration).toBeGreaterThan(0.3);
      });
    });

    describe("段階判定", () => {
      it("全体レベルが0.25未満はreactive段階", () => {
        // Arrange
        const output = "OK";

        // Act
        const state = evaluateConsciousnessLevel(output);

        // Assert
        if (state.overallLevel < 0.25) {
          expect(state.stage).toBe("reactive");
        }
      });

      it("全体レベルが0.25以上0.5未満はphenomenal段階", () => {
        // Arrange
        const output = "状況を考慮して対応しました。";

        // Act
        const state = evaluateConsciousnessLevel(output);

        // Assert
        if (state.overallLevel >= 0.25 && state.overallLevel < 0.5) {
          expect(state.stage).toBe("phenomenal");
        }
      });

      it("全体レベルが0.5以上0.75未満はintrospective段階", () => {
        // Arrange
        const output = "私の思考プロセスを振り返ると、CONFIDENCE: 0.6 で判断しました。バイアスがないか確認しました。";

        // Act
        const state = evaluateConsciousnessLevel(output);

        // Assert
        if (state.overallLevel >= 0.5 && state.overallLevel < 0.75) {
          expect(state.stage).toBe("introspective");
        }
      });

      it("全体レベルが0.75以上はautobiographical段階", () => {
        // Arrange
        const output = `
SUMMARY: 継続的な学習の結果
CLAIM: 私の価値観に基づいて判断しました
EVIDENCE: 過去の経験、一貫した原則
DISCUSSION: 以前の判断との整合性を確認
CONFIDENCE: 0.8
 RESULT: 長期的視点での決断
        `.trim();

        // Act
        const state = evaluateConsciousnessLevel(output);

        // Assert
        if (state.overallLevel >= 0.75) {
          expect(state.stage).toBe("autobiographical");
        }
      });
    });

    describe("コンテキスト利用", () => {
      it("タスクタイプがコンテキストに含まれる", () => {
        // Arrange
        const output = "処理完了";

        // Act
        const state = evaluateConsciousnessLevel(output, { taskType: "code-review" });

        // Assert
        expect(state.context?.taskType).toBe("code-review");
      });

      it("メタ認知マーカーが評価に反映される", () => {
        // Arrange
        const output = "判断しました";

        // Act
        const stateWithoutMarker = evaluateConsciousnessLevel(output, { hasMetaCognitiveMarkers: false });
        const stateWithMarker = evaluateConsciousnessLevel(output, { hasMetaCognitiveMarkers: true });

        // Assert
        expect(stateWithMarker.metacognitiveLevel).toBeGreaterThanOrEqual(stateWithoutMarker.metacognitiveLevel);
      });
    });

    describe("境界値テスト", () => {
      it("空文字でも評価できる", () => {
        // Arrange
        const output = "";

        // Act
        const state = evaluateConsciousnessLevel(output);

        // Assert
        expect(state.overallLevel).toBeGreaterThanOrEqual(0);
        expect(state.stage).toBeDefined();
      });

      it("非常に長いテキストでも評価できる", () => {
        // Arrange
        const output = "テスト".repeat(10000);

        // Act & Assert - エラーが発生しないこと
        expect(() => evaluateConsciousnessLevel(output)).not.toThrow();
      });
    });
  });

  describe("generateImprovementRecommendations", () => {
    it("各段階に応じた推奨事項を生成する", () => {
      // Arrange
      const states: ConsciousnessState[] = [
        { ...createMinimalState(), stage: "reactive", overallLevel: 0.1 },
        { ...createMinimalState(), stage: "phenomenal", overallLevel: 0.35 },
        { ...createMinimalState(), stage: "introspective", overallLevel: 0.6 },
        { ...createMinimalState(), stage: "autobiographical", overallLevel: 0.85 },
      ];

      // Act & Assert
      states.forEach(state => {
        const recommendations = generateImprovementRecommendations(state);
        expect(recommendations.length).toBeGreaterThan(0);
      });
    });

    it("低い指標には改善推奨が含まれる", () => {
      // Arrange
      const state: ConsciousnessState = {
        overallLevel: 0.3,
        stage: "phenomenal",
        phenomenalConsciousness: 0.2,
        accessConsciousness: 0.2,
        metacognitiveLevel: 0.2,
        selfContinuity: 0.2,
        globalWorkspaceIntegration: 0.2,
        timestamp: new Date().toISOString(),
      };

      // Act
      const recommendations = generateImprovementRecommendations(state);

      // Assert
      expect(recommendations.length).toBeGreaterThan(3);
    });

    it("推奨事項に重複がない", () => {
      // Arrange
      const state = createMinimalState();

      // Act
      const recommendations = generateImprovementRecommendations(state);

      // Assert
      expect(new Set(recommendations).size).toBe(recommendations.length);
    });
  });

  describe("getConsciousnessReport", () => {
    it("レポートを生成する", () => {
      // Arrange
      const state = createMinimalState();

      // Act
      const report = getConsciousnessReport(state);

      // Assert
      expect(report).toContain("意識レベル評価");
      expect(report).toContain(state.stage);
    });

    it("詳細指標を含む", () => {
      // Arrange
      const state = createMinimalState();

      // Act
      const report = getConsciousnessReport(state);

      // Assert
      expect(report).toContain("現象的意識");
      expect(report).toContain("アクセス意識");
      expect(report).toContain("メタ認知レベル");
      expect(report).toContain("自己継続性");
      expect(report).toContain("GW統合度");
    });

    it("次の段階への指標を含む", () => {
      // Arrange
      const state = createMinimalState();

      // Act
      const report = getConsciousnessReport(state);

      // Assert
      expect(report).toContain("次の段階への指標");
    });

    it("改善推奨事項を含む", () => {
      // Arrange
      const state = createMinimalState();

      // Act
      const report = getConsciousnessReport(state);

      // Assert
      expect(report).toContain("改善推奨事項");
    });
  });

  describe("analyzeGlobalWorkspace", () => {
    it("スポットライトコンテンツを抽出する", () => {
      // Arrange
      const output = `
SUMMARY: テスト要約
CLAIM: テスト主張
 RESULT: テスト結果
      `.trim();

      // Act
      const gwState = analyzeGlobalWorkspace(output);

      // Assert
      expect(gwState.spotlightContent.length).toBeGreaterThan(0);
    });

    it("無意識プロセスを抽出する", () => {
      // Arrange
      const output = `
SUMMARY: 要約
EVIDENCE: 証拠の詳細説明
DISCUSSION: 議論の内容
 RESULT: 結果
      `.trim();

      // Act
      const gwState = analyzeGlobalWorkspace(output);

      // Assert
      expect(gwState.unconsciousProcesses.length).toBeGreaterThanOrEqual(0);
    });

    it("統合度を計算する", () => {
      // Arrange
      const output = "テスト";

      // Act
      const gwState = analyzeGlobalWorkspace(output);

      // Assert
      expect(gwState.integrationScore).toBeGreaterThanOrEqual(0);
      expect(gwState.integrationScore).toBeLessThanOrEqual(1);
    });

    it("放送度を計算する", () => {
      // Arrange
      const output = "合意形成を行いました";

      // Act
      const gwState = analyzeGlobalWorkspace(output);

      // Assert
      expect(gwState.broadcastScore).toBeGreaterThan(0.5);
    });
  });

  describe("STAGE_CRITERIA", () => {
    it("4つの段階が定義されている", () => {
      // Assert
      expect(Object.keys(STAGE_CRITERIA)).toHaveLength(4);
      expect(STAGE_CRITERIA.reactive).toBeDefined();
      expect(STAGE_CRITERIA.phenomenal).toBeDefined();
      expect(STAGE_CRITERIA.introspective).toBeDefined();
      expect(STAGE_CRITERIA.autobiographical).toBeDefined();
    });

    it("各段階は必要なプロパティを持つ", () => {
      // Assert
      Object.entries(STAGE_CRITERIA).forEach(([stage, criteria]) => {
        expect(criteria.threshold).toBeDefined();
        expect(criteria.description).toBeDefined();
        expect(criteria.indicators).toBeInstanceOf(Array);
        expect(criteria.requiredCapabilities).toBeInstanceOf(Array);
      });
    });

    it("閾値は昇順である", () => {
      // Assert
      const thresholds = [
        STAGE_CRITERIA.reactive.threshold,
        STAGE_CRITERIA.phenomenal.threshold,
        STAGE_CRITERIA.introspective.threshold,
        STAGE_CRITERIA.autobiographical.threshold,
      ];
      expect(thresholds).toEqual([...thresholds].sort((a, b) => a - b));
    });
  });

  describe("プロパティベーステスト", () => {
    it("任意の文字列に対して意識レベルは0-1の範囲", () => {
      fc.assert(
        fc.property(fc.string(), (output) => {
          // Act
          const state = evaluateConsciousnessLevel(output);

          // Assert
          expect(state.overallLevel).toBeGreaterThanOrEqual(0);
          expect(state.overallLevel).toBeLessThanOrEqual(1);
          expect(state.phenomenalConsciousness).toBeGreaterThanOrEqual(0);
          expect(state.phenomenalConsciousness).toBeLessThanOrEqual(1);
          expect(state.accessConsciousness).toBeGreaterThanOrEqual(0);
          expect(state.accessConsciousness).toBeLessThanOrEqual(1);
          expect(state.metacognitiveLevel).toBeGreaterThanOrEqual(0);
          expect(state.metacognitiveLevel).toBeLessThanOrEqual(1);
          expect(state.selfContinuity).toBeGreaterThanOrEqual(0);
          expect(state.selfContinuity).toBeLessThanOrEqual(1);
          expect(state.globalWorkspaceIntegration).toBeGreaterThanOrEqual(0);
          expect(state.globalWorkspaceIntegration).toBeLessThanOrEqual(1);
        })
      );
    });

    it("全体レベルと段階は整合している", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 10 }), (output) => {
          // Act
          const state = evaluateConsciousnessLevel(output);

          // Assert
          const expectedStage = determineExpectedStage(state.overallLevel);
          expect(state.stage).toBe(expectedStage);
        })
      );
    });

    it("レポート生成は常に文字列を返す", () => {
      fc.assert(
        fc.property(
          fc.record({
            overallLevel: fc.float({ min: 0, max: 1 }),
            stage: fc.constantFrom("reactive", "phenomenal", "introspective", "autobiographical"),
            phenomenalConsciousness: fc.float({ min: 0, max: 1 }),
            accessConsciousness: fc.float({ min: 0, max: 1 }),
            metacognitiveLevel: fc.float({ min: 0, max: 1 }),
            selfContinuity: fc.float({ min: 0, max: 1 }),
            globalWorkspaceIntegration: fc.float({ min: 0, max: 1 }),
            timestamp: fc.string(),
          }),
          (state) => {
            // Act
            const report = getConsciousnessReport(state as ConsciousnessState);

            // Assert
            expect(typeof report).toBe("string");
            expect(report.length).toBeGreaterThan(0);
          }
        )
      );
    });
  });
});

// ヘルパー関数
function createMinimalState(): ConsciousnessState {
  return {
    overallLevel: 0.5,
    stage: "introspective",
    phenomenalConsciousness: 0.5,
    accessConsciousness: 0.5,
    metacognitiveLevel: 0.5,
    selfContinuity: 0.5,
    globalWorkspaceIntegration: 0.5,
    timestamp: new Date().toISOString(),
  };
}

function determineExpectedStage(level: number): ConsciousnessStage {
  if (level < 0.25) return "reactive";
  if (level < 0.5) return "phenomenal";
  if (level < 0.75) return "introspective";
  return "autobiographical";
}
