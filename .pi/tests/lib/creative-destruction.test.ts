/**
 * creative-destruction.tsの単体テスト
 * 自己前提破壊メカニズムを検証する
 */

import { describe, it, expect } from "vitest";
import {
  type Premise,
  type PremiseType,
  type DestructionMethod,
  type DestructionResult,
  type CreativeDestructionEngine,
  type DestructionChain,
  type ParetoOptimalDestruction,
  createCreativeDestructionEngine,
  registerPremise,
  performDestruction,
  performChainDestruction,
  optimizeDestruction,
  resetEngine,
  generateDestructionReport,
  getDestructionMethods,
  getRecommendedMethod,
} from "../../lib/creative-destruction.js";

describe("creative-destruction", () => {
  describe("createCreativeDestructionEngine", () => {
    it("デフォルト設定でエンジンを作成する", () => {
      // Arrange & Act
      const engine = createCreativeDestructionEngine();

      // Assert
      expect(engine.premises.size).toBe(0);
      expect(engine.destructionMethods.length).toBeGreaterThan(0);
      expect(engine.destructionHistory.length).toBe(0);
      expect(engine.statistics.totalDestructions).toBe(0);
    });

    it("カスタム設定でエンジンを作成する", () => {
      // Arrange & Act
      const engine = createCreativeDestructionEngine({
        maxDestructionDepth: 5,
        destructionIntensity: 0.9,
      });

      // Assert
      expect(engine.config.maxDestructionDepth).toBe(5);
      expect(engine.config.destructionIntensity).toBe(0.9);
    });
  });

  describe("registerPremise", () => {
    it("前提を登録する", () => {
      // Arrange
      const engine = createCreativeDestructionEngine();

      // Act
      const premise = registerPremise(engine, "テスト前提", "contextual", 0.5);

      // Assert
      expect(premise.id).toBeDefined();
      expect(premise.content).toBe("テスト前提");
      expect(premise.type).toBe("contextual");
      expect(premise.solidity).toBe(0.5);
      expect(engine.premises.size).toBe(1);
    });

    it("強度は0-1の範囲にクランプされる", () => {
      // Arrange
      const engine = createCreativeDestructionEngine();

      // Act
      const premise1 = registerPremise(engine, "高い強度", "normative", 1.5);
      const premise2 = registerPremise(engine, "低い強度", "normative", -0.5);

      // Assert
      expect(premise1.solidity).toBe(1);
      expect(premise2.solidity).toBe(0);
    });

    it("統計が更新される", () => {
      // Arrange
      const engine = createCreativeDestructionEngine();

      // Act
      registerPremise(engine, "前提1", "contextual", 0.5);
      registerPremise(engine, "前提2", "normative", 0.7);

      // Assert
      expect(engine.statistics.premisesCurrentlyHeld).toBe(2);
    });
  });

  describe("performDestruction", () => {
    it("前提を破壊する", () => {
      // Arrange
      const engine = createCreativeDestructionEngine();
      const premise = registerPremise(engine, "これは正しいべき", "normative", 0.8);

      // Act
      const result = performDestruction(engine, premise.id);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.originalPremise.id).toBe(premise.id);
      expect(result?.method).toBeDefined();
      expect(result?.remnants.length).toBeGreaterThan(0);
      expect(engine.statistics.totalDestructions).toBe(1);
    });

    it("存在しない前提IDはnullを返す", () => {
      // Arrange
      const engine = createCreativeDestructionEngine();

      // Act
      const result = performDestruction(engine, "nonexistent");

      // Assert
      expect(result).toBeNull();
    });

    it("特定の破壊方法を指定できる", () => {
      // Arrange
      const engine = createCreativeDestructionEngine();
      const premise = registerPremise(engine, "同一性の前提", "ontological", 0.9);
      const methods = getDestructionMethods();
      const deleuzianMethod = methods.find(m => m.name === "deleuzian-differentiation")!;

      // Act
      const result = performDestruction(engine, premise.id, deleuzianMethod);

      // Assert
      expect(result?.method.name).toBe("deleuzian-differentiation");
    });
  });

  describe("performChainDestruction", () => {
    it("連鎖破壊を実行する", () => {
      // Arrange
      const engine = createCreativeDestructionEngine();
      const premise = registerPremise(engine, "開始前提", "contextual", 0.7);

      // Act
      const chain = performChainDestruction(engine, premise.id, 2);

      // Assert
      expect(chain.id).toBeDefined();
      expect(chain.sequence.length).toBeGreaterThan(0);
      expect(chain.statistics.totalPremisesDestroyed).toBeGreaterThan(0);
    });

    it("破壊履歴に記録される", () => {
      // Arrange
      const engine = createCreativeDestructionEngine();
      const premise = registerPremise(engine, "履歴テスト", "contextual", 0.5);

      // Act
      performChainDestruction(engine, premise.id, 1);

      // Assert
      expect(engine.destructionHistory.length).toBe(1);
    });
  });

  describe("optimizeDestruction", () => {
    it("パレート最適戦略を返す", () => {
      // Arrange
      const engine = createCreativeDestructionEngine();
      registerPremise(engine, "戦略1", "normative", 0.8);
      registerPremise(engine, "戦略2", "ontological", 0.9);

      // Act
      const strategies = optimizeDestruction(engine);

      // Assert
      expect(strategies.length).toBeGreaterThan(0);
      strategies.forEach(s => {
        expect(s.targetPremises.length).toBeGreaterThan(0);
        expect(s.expectedEffects).toBeDefined();
        expect(s.paretoPosition).toBeDefined();
      });
    });

    it("空のエンジンでも動作する", () => {
      // Arrange
      const engine = createCreativeDestructionEngine();

      // Act
      const strategies = optimizeDestruction(engine);

      // Assert
      expect(strategies).toEqual([]);
    });
  });

  describe("resetEngine", () => {
    it("エンジンをリセットする", () => {
      // Arrange
      const engine = createCreativeDestructionEngine();
      registerPremise(engine, "リセット対象", "contextual", 0.5);
      performChainDestruction(engine, Array.from(engine.premises.keys())[0], 1);

      // Act
      resetEngine(engine);

      // Assert
      expect(engine.premises.size).toBe(0);
      expect(engine.destructionHistory.length).toBe(0);
      expect(engine.statistics.totalDestructions).toBe(0);
    });
  });

  describe("generateDestructionReport", () => {
    it("レポートを生成する", () => {
      // Arrange
      const engine = createCreativeDestructionEngine();

      // Act
      const report = generateDestructionReport(engine);

      // Assert
      expect(report).toContain("創造的破壊エンジン レポート");
      expect(report).toContain("統計情報");
    });

    it("前提と履歴を含む", () => {
      // Arrange
      const engine = createCreativeDestructionEngine();
      registerPremise(engine, "報告対象", "normative", 0.6);
      performChainDestruction(engine, Array.from(engine.premises.keys())[0], 1);

      // Act
      const report = generateDestructionReport(engine);

      // Assert
      expect(report).toContain("保持している前提");
      expect(report).toContain("破壊チェーン");
    });
  });

  describe("getDestructionMethods", () => {
    it("破壊方法のリストを返す", () => {
      // Arrange & Act
      const methods = getDestructionMethods();

      // Assert
      expect(methods.length).toBeGreaterThan(0);
      expect(methods.some(m => m.name === "nietzschean-inversion")).toBe(true);
      expect(methods.some(m => m.name === "deleuzian-differentiation")).toBe(true);
      expect(methods.some(m => m.name === "derridean-deconstruction")).toBe(true);
    });
  });

  describe("getRecommendedMethod", () => {
    it("前提タイプに応じた推奨方法を返す", () => {
      // Arrange & Act & Assert
      expect(getRecommendedMethod("normative").name).toBe("nietzschean-inversion");
      expect(getRecommendedMethod("ontological").name).toBe("heideggerian-ontological-difference");
    });
  });

  describe("破壊方法の適用", () => {
    it("ニーチェ的転倒は規範的前提に適用可能", () => {
      // Arrange
      const engine = createCreativeDestructionEngine();
      const premise = registerPremise(engine, "これは正しいべき", "normative", 0.8);
      const methods = getDestructionMethods();
      const nietzschean = methods.find(m => m.name === "nietzschean-inversion")!;

      // Act
      const isApplicable = nietzschean.applicableWhen(premise);

      // Assert
      expect(isApplicable).toBe(true);
    });

    it("ドゥルーズ的差異化は同一性に適用可能", () => {
      // Arrange
      const engine = createCreativeDestructionEngine();
      const premise = registerPremise(engine, "同一性のテスト", "ontological", 0.9);
      const methods = getDestructionMethods();
      const deleuzian = methods.find(m => m.name === "deleuzian-differentiation")!;

      // Act
      const isApplicable = deleuzian.applicableWhen(premise);

      // Assert
      expect(isApplicable).toBe(true);
    });

    it("仏教的空性は高強度の前提に適用可能", () => {
      // Arrange
      const engine = createCreativeDestructionEngine();
      const premise = registerPremise(engine, "絶対的な確実性", "epistemic", 0.95);
      const methods = getDestructionMethods();
      const buddhist = methods.find(m => m.name === "buddhist-emptiness")!;

      // Act
      const isApplicable = buddhist.applicableWhen(premise);

      // Assert
      expect(isApplicable).toBe(true);
    });
  });

  describe("再構築", () => {
    it("破壊後に再構築が生成される", () => {
      // Arrange
      const engine = createCreativeDestructionEngine({ autoReconstruction: true });
      const premise = registerPremise(engine, "再構築テスト", "normative", 0.7);
      const methods = getDestructionMethods();
      const method = methods.find(m => m.name === "nietzschean-inversion")!;

      // Act
      const result = performDestruction(engine, premise.id, method);
      const reconstructions = method.reconstruct(result!);

      // Assert
      expect(reconstructions.length).toBeGreaterThan(0);
      expect(reconstructions[0].description).toBeDefined();
      expect(reconstructions[0].creativityScore).toBeGreaterThan(0);
    });
  });
});
