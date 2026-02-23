/**
 * creative-destruction.ts の単体テスト
 *
 * テスト対象:
 * - createCreativeDestructionEngine: エンジン作成
 * - registerPremise: 前提登録
 * - performDestruction: 破壊実行
 * - performChainDestruction: 連鎖破壊
 * - optimizeDestruction: パレート最適破壊
 * - resetEngine: エンジンリセット
 * - generateDestructionReport: レポート生成
 * - getDestructionMethods: 破壊方法取得
 * - getRecommendedMethod: 推奨方法取得
 */

import { describe, it, expect, beforeEach } from "vitest";
import * as fc from "fast-check";
import {
  createCreativeDestructionEngine,
  registerPremise,
  performDestruction,
  performChainDestruction,
  optimizeDestruction,
  resetEngine,
  generateDestructionReport,
  getDestructionMethods,
  getRecommendedMethod,
  type CreativeDestructionEngine,
  type PremiseType,
} from "../../../.pi/lib/creative-destruction.js";

describe("creative-destruction.ts", () => {
  let engine: CreativeDestructionEngine;

  beforeEach(() => {
    engine = createCreativeDestructionEngine();
  });

  describe("createCreativeDestructionEngine", () => {
    it("デフォルト設定でエンジンを作成する", () => {
      // Assert
      expect(engine.premises.size).toBe(0);
      expect(engine.destructionMethods.length).toBe(5);
      expect(engine.destructionHistory.length).toBe(0);
      expect(engine.statistics.totalDestructions).toBe(0);
    });

    it("カスタム設定でエンジンを作成する", () => {
      // Act
      const customEngine = createCreativeDestructionEngine({
        maxDestructionDepth: 5,
        destructionIntensity: 0.9,
        autoReconstruction: false,
      });

      // Assert
      expect(customEngine.config.maxDestructionDepth).toBe(5);
      expect(customEngine.config.destructionIntensity).toBe(0.9);
      expect(customEngine.config.autoReconstruction).toBe(false);
    });

    it("統計情報が初期化されている", () => {
      // Assert
      expect(engine.statistics.totalDestructions).toBe(0);
      expect(engine.statistics.successfulReconstructions).toBe(0);
      expect(engine.statistics.averageCreativityGain).toBe(0);
      expect(engine.statistics.premisesCurrentlyHeld).toBe(0);
    });
  });

  describe("registerPremise", () => {
    it("前提を登録する", () => {
      // Act
      const premise = registerPremise(engine, "テスト前提");

      // Assert
      expect(premise.id).toBeDefined();
      expect(premise.content).toBe("テスト前提");
      expect(premise.type).toBe("contextual");
      expect(engine.premises.size).toBe(1);
    });

    it("タイプを指定して前提を登録する", () => {
      // Act
      const premise = registerPremise(engine, "規範的前提", "normative");

      // Assert
      expect(premise.type).toBe("normative");
    });

    it("強度を指定して前提を登録する", () => {
      // Act
      const premise = registerPremise(engine, "強い前提", "epistemic", 0.9);

      // Assert
      expect(premise.solidity).toBe(0.9);
    });

    it("強度は0-1の範囲に制限される", () => {
      // Act
      const premise1 = registerPremise(engine, "強度上限", "contextual", 1.5);
      const premise2 = registerPremise(engine, "強度下限", "contextual", -0.5);

      // Assert
      expect(premise1.solidity).toBe(1);
      expect(premise2.solidity).toBe(0);
    });

    it("一意のIDが生成される", () => {
      // Act
      const premise1 = registerPremise(engine, "前提1");
      const premise2 = registerPremise(engine, "前提2");

      // Assert
      expect(premise1.id).not.toBe(premise2.id);
    });

    it("統計が更新される", () => {
      // Act
      registerPremise(engine, "前提1");
      registerPremise(engine, "前提2");

      // Assert
      expect(engine.statistics.premisesCurrentlyHeld).toBe(2);
    });
  });

  describe("performDestruction", () => {
    it("前提を破壊する", () => {
      // Arrange
      const premise = registerPremise(engine, "これは正しいべき", "normative");

      // Act
      const result = performDestruction(engine, premise.id);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.originalPremise.id).toBe(premise.id);
      expect(result?.method).toBeDefined();
      expect(result?.remnants.length).toBeGreaterThan(0);
    });

    it("存在しないIDはnullを返す", () => {
      // Act
      const result = performDestruction(engine, "non-existent-id");

      // Assert
      expect(result).toBeNull();
    });

    it("破壊回数がカウントされる", () => {
      // Arrange
      const premise = registerPremise(engine, "テスト前提", "normative");

      // Act
      performDestruction(engine, premise.id);

      // Assert
      expect(engine.statistics.totalDestructions).toBe(1);
    });

    it("自動再構築が実行される（設定が有効な場合）", () => {
      // Arrange
      const premise = registerPremise(engine, "善と悪", "normative");

      // Act
      const result = performDestruction(engine, premise.id);

      // Assert
      expect(result?.nextTargets).toBeDefined();
    });
  });

  describe("performChainDestruction", () => {
    it("連鎖破壊を実行する", () => {
      // Arrange
      const premise = registerPremise(engine, "同一性の前提", "ontological", 0.9);

      // Act
      const chain = performChainDestruction(engine, premise.id, 2);

      // Assert
      expect(chain.id).toBeDefined();
      expect(chain.sequence.length).toBeGreaterThan(0);
      expect(chain.statistics.totalPremisesDestroyed).toBeGreaterThan(0);
    });

    it("深さを指定できる", () => {
      // Arrange
      const premise = registerPremise(engine, "テスト前提", "ontological");

      // Act
      const chain = performChainDestruction(engine, premise.id, 1);

      // Assert
      expect(chain.sequence.length).toBeLessThanOrEqual(1);
    });

    it("破壊履歴に記録される", () => {
      // Arrange
      const premise = registerPremise(engine, "テスト前提");

      // Act
      performChainDestruction(engine, premise.id);

      // Assert
      expect(engine.destructionHistory.length).toBe(1);
    });
  });

  describe("optimizeDestruction", () => {
    it("パレート最適戦略を計算する", () => {
      // Arrange
      registerPremise(engine, "テスト前提1", "normative");
      registerPremise(engine, "テスト前提2", "epistemic");

      // Act
      const strategies = optimizeDestruction(engine);

      // Assert
      expect(strategies.length).toBeGreaterThan(0);
    });

    it("各戦略は期待効果を持つ", () => {
      // Arrange
      registerPremise(engine, "価値判断の前提", "normative");

      // Act
      const strategies = optimizeDestruction(engine);

      // Assert
      strategies.forEach(strategy => {
        expect(strategy.expectedEffects.creativityIncrease).toBeGreaterThanOrEqual(0);
        expect(strategy.expectedEffects.creativityIncrease).toBeLessThanOrEqual(1);
        expect(strategy.expectedEffects.stabilityDecrease).toBeGreaterThanOrEqual(0);
        expect(strategy.expectedEffects.stabilityDecrease).toBeLessThanOrEqual(1);
      });
    });

    it("前提がない場合は空配列を返す", () => {
      // Act
      const strategies = optimizeDestruction(engine);

      // Assert
      expect(strategies.length).toBe(0);
    });
  });

  describe("resetEngine", () => {
    it("エンジンをリセットする", () => {
      // Arrange
      registerPremise(engine, "テスト前提");
      performDestruction(engine, engine.premises.keys().next().value ?? "");

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
      registerPremise(engine, "テスト前提");

      // Act
      const report = generateDestructionReport(engine);

      // Assert
      expect(report).toContain("# 創造的破壊エンジン レポート");
      expect(report).toContain("統計情報");
    });

    it("前提が含まれる", () => {
      // Arrange
      registerPremise(engine, "重要な前提", "normative");

      // Act
      const report = generateDestructionReport(engine);

      // Assert
      expect(report).toContain("重要な前提");
    });

    it("破壊履歴が含まれる", () => {
      // Arrange
      const premise = registerPremise(engine, "破壊対象", "normative");
      performChainDestruction(engine, premise.id);

      // Act
      const report = generateDestructionReport(engine);

      // Assert
      expect(report).toContain("最近の破壊チェーン");
    });
  });

  describe("getDestructionMethods", () => {
    it("破壊方法のリストを返す", () => {
      // Act
      const methods = getDestructionMethods();

      // Assert
      expect(methods.length).toBe(5);
      expect(methods.some(m => m.name === "nietzschean-inversion")).toBe(true);
      expect(methods.some(m => m.name === "deleuzian-differentiation")).toBe(true);
      expect(methods.some(m => m.name === "derridean-deconstruction")).toBe(true);
      expect(methods.some(m => m.name === "heideggerian-ontological-difference")).toBe(true);
      expect(methods.some(m => m.name === "buddhist-emptiness")).toBe(true);
    });

    it("各破壊方法は必要なプロパティを持つ", () => {
      // Act
      const methods = getDestructionMethods();

      // Assert
      methods.forEach(method => {
        expect(method.name).toBeDefined();
        expect(method.description).toBeDefined();
        expect(method.philosophicalBasis).toBeDefined();
        expect(typeof method.applicableWhen).toBe("function");
        expect(typeof method.apply).toBe("function");
        expect(typeof method.reconstruct).toBe("function");
      });
    });
  });

  describe("getRecommendedMethod", () => {
    it("前提タイプに応じた推奨方法を返す", () => {
      // Assert
      expect(getRecommendedMethod("normative").name).toBe("nietzschean-inversion");
      expect(getRecommendedMethod("ontological").name).toBe("heideggerian-ontological-difference");
      expect(getRecommendedMethod("epistemic").name).toBe("derridean-deconstruction");
      expect(getRecommendedMethod("methodological").name).toBe("deleuzian-differentiation");
      expect(getRecommendedMethod("implicit").name).toBe("buddhist-emptiness");
    });
  });

  describe("破壊方法の適用", () => {
    it("ニーチェ的転倒が規範的前提に適用される", () => {
      // Arrange
      const premise = registerPremise(engine, "これは正すべきことだ", "normative");

      // Act
      const result = performDestruction(engine, premise.id);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.method.philosophicalBasis).toBe("nietzschean");
    });

    it("ドゥルーズ的差異化が同一性に適用される", () => {
      // Arrange
      const premise = registerPremise(engine, "AとBは同じである", "epistemic", 0.9);

      // Act
      const result = performDestruction(engine, premise.id);

      // Assert
      expect(result).not.toBeNull();
    });

    it("仏教的空性が確実性に適用される", () => {
      // Arrange
      const premise = registerPremise(engine, "これは絶対に確実だ", "epistemic", 1.0);

      // Act
      const result = performDestruction(engine, premise.id);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.depth).toBeGreaterThan(0.5);
    });
  });

  describe("プロパティベーステスト", () => {
    it("任意の前提登録は成功する", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }),
          fc.constantFrom("epistemic", "normative", "ontological", "methodological", "contextual", "implicit"),
          fc.float({ min: 0, max: 1 }),
          (content, type, solidity) => {
            // Act
            const premise = registerPremise(engine, content, type, solidity);

            // Assert
            expect(premise.content).toBe(content);
            expect(premise.type).toBe(type);
            expect(premise.solidity).toBeGreaterThanOrEqual(0);
            expect(premise.solidity).toBeLessThanOrEqual(1);
          }
        )
      );
    });

    it("破壊結果は有効な構造を持つ", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          fc.constantFrom("epistemic", "normative", "ontological"),
          fc.float({ min: Math.fround(0.1), max: Math.fround(1) }),
          (content, type, solidity) => {
            // Arrange
            const premise = registerPremise(engine, content, type, solidity);

            // Act
            const result = performDestruction(engine, premise.id);

            // Assert
            if (result !== null) {
              expect(result.depth).toBeGreaterThanOrEqual(0);
              expect(result.depth).toBeLessThanOrEqual(1);
              expect(result.completeness).toBeGreaterThanOrEqual(0);
              expect(result.completeness).toBeLessThanOrEqual(1);
              expect(Array.isArray(result.remnants)).toBe(true);
              expect(Array.isArray(result.exposed)).toBe(true);
            }
          }
        )
      );
    });

    it("連鎖破壊の統計は一貫している", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          fc.integer({ min: 1, max: 3 }),
          (content, depth) => {
            // Arrange
            const testEngine = createCreativeDestructionEngine({ maxDestructionDepth: 5 });
            const premise = registerPremise(testEngine, content, "normative");

            // Act
            const chain = performChainDestruction(testEngine, premise.id, depth);

            // Assert
            expect(chain.statistics.totalPremisesDestroyed).toBe(chain.sequence.length);
            expect(chain.statistics.maxDepth).toBeGreaterThanOrEqual(0);
          }
        )
      );
    });
  });
});
