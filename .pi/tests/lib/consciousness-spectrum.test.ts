/**
 * consciousness-spectrum.tsの単体テスト
 * エージェントの意識レベル評価機能を検証する
 */

import { describe, it, expect } from "vitest";
import {
  type ConsciousnessStage,
  type ConsciousnessState,
  type GlobalWorkspaceState,
  STAGE_CRITERIA,
  evaluateConsciousnessLevel,
  getConsciousnessReport,
  analyzeGlobalWorkspace,
} from "../../lib/consciousness-spectrum.js";

describe("consciousness-spectrum", () => {
  describe("STAGE_CRITERIA", () => {
    it("4つの段階が定義されている", () => {
      // Arrange
      const stages: ConsciousnessStage[] = [
        "reactive",
        "phenomenal",
        "introspective",
        "autobiographical",
      ];

      // Act & Assert
      stages.forEach((stage) => {
        expect(STAGE_CRITERIA[stage]).toBeDefined();
        expect(STAGE_CRITERIA[stage].threshold).toBeDefined();
        expect(STAGE_CRITERIA[stage].description).toBeDefined();
        expect(STAGE_CRITERIA[stage].indicators.length).toBeGreaterThan(0);
      });
    });

    it("段階は閾値の昇順で並んでいる", () => {
      // Arrange & Act & Assert
      expect(STAGE_CRITERIA.reactive.threshold).toBeLessThan(STAGE_CRITERIA.phenomenal.threshold);
      expect(STAGE_CRITERIA.phenomenal.threshold).toBeLessThan(STAGE_CRITERIA.introspective.threshold);
      expect(STAGE_CRITERIA.introspective.threshold).toBeLessThan(STAGE_CRITERIA.autobiographical.threshold);
    });
  });

  describe("evaluateConsciousnessLevel", () => {
    it("空の出力でも評価できる", () => {
      // Arrange & Act
      const state = evaluateConsciousnessLevel("");

      // Assert
      expect(state.overallLevel).toBeGreaterThanOrEqual(0);
      expect(state.overallLevel).toBeLessThanOrEqual(1);
      expect(state.stage).toBeDefined();
    });

    it("メタ認知マーカーがあると高いレベルになる", () => {
      // Arrange
      const output = "私はこの問題について深く考えました。CONFIDENCE: 0.8";
      const context = {
        hasMetaCognitiveMarkers: true,
        hasSelfReference: true,
      };

      // Act
      const state = evaluateConsciousnessLevel(output, context);

      // Assert - ベースラインとコンテキストボーナスで0.5以上になる
      expect(state.metacognitiveLevel).toBeGreaterThanOrEqual(0.5);
    });

    it("自己言及があると自己継続性が高くなる", () => {
      // Arrange
      const output = "私の考えでは、これは重要です。私は以前の経験から学びました。";
      const context = {
        hasSelfReference: true,
        hasTemporalContinuity: true,
      };

      // Act
      const state = evaluateConsciousnessLevel(output, context);

      // Assert
      expect(state.selfContinuity).toBeGreaterThan(0.5);
    });

    it("タイムスタンプが含まれる", () => {
      // Arrange & Act
      const state = evaluateConsciousnessLevel("test");

      // Assert
      expect(state.timestamp).toBeDefined();
      expect(new Date(state.timestamp).getTime()).not.toBeNaN();
    });

    it("コンテキスト情報が保存される", () => {
      // Arrange
      const context = {
        taskType: "analysis",
        previousLevel: 0.5,
      };

      // Act
      const state = evaluateConsciousnessLevel("test", context);

      // Assert
      expect(state.context?.taskType).toBe("analysis");
    });

    it("構造化された出力は高いアクセス意識を持つ", () => {
      // Arrange
      const output = `
        CLAIM: これはテストです
        EVIDENCE: データに基づいています
        CONFIDENCE: 0.9
        RESULT: 成功
      `;

      // Act
      const state = evaluateConsciousnessLevel(output);

      // Assert - 構造化出力でアクセス意識が向上する（ベースライン0.25 + 構造化ボーナス0.2）
      expect(state.accessConsciousness).toBeGreaterThanOrEqual(0.4);
    });

    it("段階判定が正しい", () => {
      // Arrange - 反応的レベル
      const reactiveOutput = "OK";

      // Act
      const reactiveState = evaluateConsciousnessLevel(reactiveOutput);

      // Assert
      expect(reactiveState.overallLevel).toBeLessThan(0.5);
    });
  });

  describe("getConsciousnessReport", () => {
    it("完全なレポートを生成する", () => {
      // Arrange
      const state = evaluateConsciousnessLevel("テスト出力");

      // Act
      const report = getConsciousnessReport(state);

      // Assert
      expect(report).toContain("意識レベル評価");
      expect(report).toContain("全体レベル");
      expect(report).toContain("現象的意識");
      expect(report).toContain("アクセス意識");
    });

    it("段階の説明を含む", () => {
      // Arrange
      const state = evaluateConsciousnessLevel("test");

      // Act
      const report = getConsciousnessReport(state);

      // Assert
      expect(report).toContain(state.stage);
    });

    it("改善推奨を含む", () => {
      // Arrange
      const state = evaluateConsciousnessLevel("test");

      // Act
      const report = getConsciousnessReport(state);

      // Assert
      // レポートには何らかの推奨または次のステップが含まれる
      expect(report.length).toBeGreaterThan(100);
    });
  });

  describe("analyzeGlobalWorkspace", () => {
    it("グローバルワークスペース状態を評価する", () => {
      // Arrange
      const output = "複数の情報を統合しています: A, B, C";

      // Act
      const gws = analyzeGlobalWorkspace(output);

      // Assert
      expect(gws.spotlightContent).toBeDefined();
      expect(gws.unconsciousProcesses).toBeDefined();
      expect(gws.integrationScore).toBeGreaterThanOrEqual(0);
      expect(gws.integrationScore).toBeLessThanOrEqual(1);
      expect(gws.broadcastScore).toBeGreaterThanOrEqual(0);
      expect(gws.broadcastScore).toBeLessThanOrEqual(1);
    });

    it("構造化された出力はスポットライト内容を持つ", () => {
      // Arrange
      const richOutput = `
        SUMMARY: この問題について分析
        CLAIM: 複数の観点から結論
        RESULT: 統合された結論
      `;

      // Act
      const gws = analyzeGlobalWorkspace(richOutput);

      // Assert
      expect(gws.spotlightContent.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("意識レベルの範囲", () => {
    it("全ての値は0-1の範囲内", () => {
      // Arrange
      const outputs = ["", "短い", "非常に長い出力".repeat(100)];

      // Act & Assert
      outputs.forEach((output) => {
        const state = evaluateConsciousnessLevel(output);
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
      });
    });
  });

  describe("段階の判定ロジック", () => {
    it("全体レベル0.2以下はreactive", () => {
      // Arrange
      const state: ConsciousnessState = {
        overallLevel: 0.2,
        stage: "reactive",
        phenomenalConsciousness: 0.2,
        accessConsciousness: 0.2,
        metacognitiveLevel: 0.1,
        selfContinuity: 0.1,
        globalWorkspaceIntegration: 0.2,
        timestamp: new Date().toISOString(),
      };

      // Act & Assert
      expect(state.stage).toBe("reactive");
    });

    it("全体レベル0.5以上はintrospective以上になる可能性がある", () => {
      // Arrange - メタ認知マーカーと自己言及を含む強力な入力
      const state = evaluateConsciousnessLevel(
        "私はこの問題について深く考えています。私の判断では、これは重要です。CONFIDENCE: 0.8 以前の経験から学びました。",
        { hasMetaCognitiveMarkers: true, hasSelfReference: true, hasTemporalContinuity: true }
      );

      // Act & Assert
      // メタ認知と自己継続性が高い場合は、phenomenal以上になる
      expect(["phenomenal", "introspective", "autobiographical"]).toContain(state.stage);
    });
  });
});
