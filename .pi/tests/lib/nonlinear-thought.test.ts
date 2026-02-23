/**
 * nonlinear-thought.tsの単体テスト
 * 非線形思考生成器を検証する
 */

import { describe, it, expect } from "vitest";
import {
  type ThoughtSeed,
  type SeedType,
  type Association,
  type AssociationChain,
  type NonLinearThoughtEngine,
  type InsightKind,
  createNonLinearThoughtEngine,
  registerSeed,
  generateNonLinearThoughts,
  generateParallelThoughts,
  optimizeAssociation,
  getParetoOptimalInsights,
  generateNonLinearThoughtReport,
  resetEngine,
  extractSeedsFromText,
} from "../../lib/nonlinear-thought.js";

describe("nonlinear-thought", () => {
  describe("createNonLinearThoughtEngine", () => {
    it("エンジンを作成する", () => {
      // Arrange & Act
      const engine = createNonLinearThoughtEngine();

      // Assert
      expect(engine.seeds.size).toBe(0);
      expect(engine.chains).toEqual([]);
      expect(engine.insights).toEqual([]);
      expect(engine.convergencePoints).toEqual([]);
    });

    it("デフォルト設定が適用される", () => {
      // Arrange & Act
      const engine = createNonLinearThoughtEngine();

      // Assert
      expect(engine.config.defaultParameters.maxDepth).toBe(5);
      expect(engine.config.defaultParameters.breadth).toBe(3);
      expect(engine.config.minInsightQuality).toBe(0.5);
    });

    it("カスタム設定を適用できる", () => {
      // Arrange & Act
      const engine = createNonLinearThoughtEngine({
        minInsightQuality: 0.7,
        parallelChains: 5,
      });

      // Assert
      expect(engine.config.minInsightQuality).toBe(0.7);
      expect(engine.config.parallelChains).toBe(5);
    });
  });

  describe("registerSeed", () => {
    it("思考の種を登録する", () => {
      // Arrange
      const engine = createNonLinearThoughtEngine();

      // Act
      const seed = registerSeed(engine, "テスト概念", "concept");

      // Assert
      expect(seed.id).toBeDefined();
      expect(seed.content).toBe("テスト概念");
      expect(seed.type).toBe("concept");
      expect(seed.emotionalValence).toBeGreaterThanOrEqual(-1);
      expect(seed.emotionalValence).toBeLessThanOrEqual(1);
    });

    it("デフォルトタイプはconcept", () => {
      // Arrange
      const engine = createNonLinearThoughtEngine();

      // Act
      const seed = registerSeed(engine, "テスト");

      // Assert
      expect(seed.type).toBe("concept");
    });

    it("登録されたシードはエンジンに保存される", () => {
      // Arrange
      const engine = createNonLinearThoughtEngine();

      // Act
      registerSeed(engine, "シード1");
      registerSeed(engine, "シード2");

      // Assert
      expect(engine.seeds.size).toBe(2);
    });

    it("活性化強度は初期値1.0", () => {
      // Arrange
      const engine = createNonLinearThoughtEngine();

      // Act
      const seed = registerSeed(engine, "テスト");

      // Assert
      expect(seed.activationStrength).toBe(1.0);
    });

    it("抽象度は初期値0.5", () => {
      // Arrange
      const engine = createNonLinearThoughtEngine();

      // Act
      const seed = registerSeed(engine, "テスト");

      // Assert
      expect(seed.abstractionLevel).toBe(0.5);
    });
  });

  describe("generateNonLinearThoughts", () => {
    it("連想チェーンを生成する", () => {
      // Arrange
      const engine = createNonLinearThoughtEngine();
      registerSeed(engine, "思考");

      // Act
      const chain = generateNonLinearThoughts(engine);

      // Assert
      expect(chain).toBeDefined();
      expect(chain.id).toBeDefined();
      expect(chain.seed).toBeDefined();
      expect(chain.associations).toBeDefined();
    });

    it("チェーンはエンジンに保存される", () => {
      // Arrange
      const engine = createNonLinearThoughtEngine();
      registerSeed(engine, "思考");

      // Act
      generateNonLinearThoughts(engine);

      // Assert
      expect(engine.chains.length).toBe(1);
    });

    it("統計情報が更新される", () => {
      // Arrange
      const engine = createNonLinearThoughtEngine();
      registerSeed(engine, "思考");

      // Act
      generateNonLinearThoughts(engine);

      // Assert
      expect(engine.statistics.totalChains).toBe(1);
    });

    it("シードIDを指定して生成できる", () => {
      // Arrange
      const engine = createNonLinearThoughtEngine();
      const seed = registerSeed(engine, "創造");

      // Act
      const chain = generateNonLinearThoughts(engine, seed.id);

      // Assert
      expect(chain.seed.id).toBe(seed.id);
    });

    it("シードがない場合はデフォルトシードが作成される", () => {
      // Arrange
      const engine = createNonLinearThoughtEngine();

      // Act
      const chain = generateNonLinearThoughts(engine);

      // Assert
      expect(chain.seed.content).toBe("思考");
      expect(engine.seeds.size).toBe(1);
    });

    it("パラメータをカスタマイズできる", () => {
      // Arrange
      const engine = createNonLinearThoughtEngine();
      registerSeed(engine, "思考");

      // Act
      const chain = generateNonLinearThoughts(engine, undefined, {
        maxDepth: 2,
        breadth: 2,
      });

      // Assert
      expect(chain.associations.length).toBeLessThanOrEqual(2);
    });
  });

  describe("generateParallelThoughts", () => {
    it("複数のチェーンを並列生成する", () => {
      // Arrange
      const engine = createNonLinearThoughtEngine();
      const seed1 = registerSeed(engine, "思考");
      const seed2 = registerSeed(engine, "創造");

      // Act
      const chains = generateParallelThoughts(engine, [seed1.id, seed2.id]);

      // Assert
      expect(chains.length).toBe(2);
    });

    it("各チェーンは異なるシードから開始する", () => {
      // Arrange
      const engine = createNonLinearThoughtEngine();
      const seed1 = registerSeed(engine, "思考");
      const seed2 = registerSeed(engine, "創造");

      // Act
      const chains = generateParallelThoughts(engine, [seed1.id, seed2.id]);

      // Assert
      expect(chains[0].seed.id).toBe(seed1.id);
      expect(chains[1].seed.id).toBe(seed2.id);
    });
  });

  describe("optimizeAssociation", () => {
    it("最適化されたパラメータを返す", () => {
      // Arrange
      const engine = createNonLinearThoughtEngine();

      // Act
      const params = optimizeAssociation(engine, "connection");

      // Assert
      expect(params.maxDepth).toBeGreaterThan(0);
      expect(params.breadth).toBeGreaterThan(0);
      expect(params.randomnessWeight).toBeGreaterThanOrEqual(0);
      expect(params.randomnessWeight).toBeLessThanOrEqual(1);
    });

    it("成功した洞察がない場合はデフォルトパラメータを返す", () => {
      // Arrange
      const engine = createNonLinearThoughtEngine();

      // Act
      const params = optimizeAssociation(engine);

      // Assert
      expect(params.maxDepth).toBe(5);
      expect(params.breadth).toBe(3);
    });
  });

  describe("getParetoOptimalInsights", () => {
    it("パレート最適な洞察を返す", () => {
      // Arrange
      const engine = createNonLinearThoughtEngine();
      registerSeed(engine, "思考");

      // Act
      generateNonLinearThoughts(engine);
      const optimal = getParetoOptimalInsights(engine);

      // Assert
      expect(Array.isArray(optimal)).toBe(true);
    });

    it("洞察がない場合は空配列を返す", () => {
      // Arrange
      const engine = createNonLinearThoughtEngine();

      // Act
      const optimal = getParetoOptimalInsights(engine);

      // Assert
      expect(optimal).toEqual([]);
    });
  });

  describe("generateNonLinearThoughtReport", () => {
    it("レポートを生成する", () => {
      // Arrange
      const engine = createNonLinearThoughtEngine();

      // Act
      const report = generateNonLinearThoughtReport(engine);

      // Assert
      expect(report).toContain("非線形思考エンジン レポート");
      expect(report).toContain("統計情報");
    });

    it("洞察がある場合は洞察情報を含む", () => {
      // Arrange
      const engine = createNonLinearThoughtEngine();
      registerSeed(engine, "思考");
      generateNonLinearThoughts(engine);

      // Act
      const report = generateNonLinearThoughtReport(engine);

      // Assert
      expect(report).toContain("総チェーン数: 1");
    });
  });

  describe("resetEngine", () => {
    it("エンジンをリセットする", () => {
      // Arrange
      const engine = createNonLinearThoughtEngine();
      registerSeed(engine, "思考");
      generateNonLinearThoughts(engine);

      // Act
      resetEngine(engine);

      // Assert
      expect(engine.seeds.size).toBe(0);
      expect(engine.chains).toEqual([]);
      expect(engine.insights).toEqual([]);
      expect(engine.statistics.totalChains).toBe(0);
    });
  });

  describe("extractSeedsFromText", () => {
    it("テキストからシードを抽出する", () => {
      // Arrange
      const engine = createNonLinearThoughtEngine();
      const text = "思考とは何か？創造の本質を探る。";

      // Act
      const seeds = extractSeedsFromText(engine, text);

      // Assert
      expect(seeds.length).toBeGreaterThan(0);
    });

    it("問いを抽出する", () => {
      // Arrange
      const engine = createNonLinearThoughtEngine();
      const text = "これは問いでしょうか？もう一つの問い？";

      // Act
      const seeds = extractSeedsFromText(engine, text);

      // Assert
      const questionSeeds = seeds.filter(s => s.type === "question");
      expect(questionSeeds.length).toBeGreaterThan(0);
    });
  });

  describe("思考の種のタイプ", () => {
    it("すべての種類タイプが有効", () => {
      // Arrange
      const types: SeedType[] = [
        "concept",
        "image",
        "emotion",
        "question",
        "paradox",
        "metaphor",
        "memory",
        "random",
      ];
      const engine = createNonLinearThoughtEngine();

      // Act & Assert
      types.forEach((type) => {
        const seed = registerSeed(engine, "テスト", type);
        expect(seed.type).toBe(type);
      });
    });
  });

  describe("連想チェーンの統計", () => {
    it("統計情報が正しく計算される", () => {
      // Arrange
      const engine = createNonLinearThoughtEngine();
      registerSeed(engine, "思考");

      // Act
      const chain = generateNonLinearThoughts(engine);

      // Assert
      expect(chain.statistics.totalLength).toBe(chain.associations.length);
      expect(chain.statistics.averageStrength).toBeGreaterThanOrEqual(0);
      expect(chain.statistics.averageSurprise).toBeGreaterThanOrEqual(0);
    });

    it("タイプ分布が記録される", () => {
      // Arrange
      const engine = createNonLinearThoughtEngine();
      registerSeed(engine, "思考");

      // Act
      const chain = generateNonLinearThoughts(engine);

      // Assert
      expect(chain.statistics.typeDistribution).toBeDefined();
      expect(chain.statistics.typeDistribution.semantic).toBeDefined();
    });
  });

  describe("多様性スコア", () => {
    it("多様性は0-1の範囲", () => {
      // Arrange
      const engine = createNonLinearThoughtEngine();
      registerSeed(engine, "思考");

      // Act
      const chain = generateNonLinearThoughts(engine);

      // Assert
      expect(chain.diversity).toBeGreaterThanOrEqual(0);
      expect(chain.diversity).toBeLessThanOrEqual(1);
    });
  });

  describe("洞察の種類", () => {
    it("すべての洞察種類が有効", () => {
      // Arrange
      const kinds: InsightKind[] = [
        "connection",
        "pattern",
        "analogy",
        "reframe",
        "synthesis",
        "question",
        "contradiction",
      ];

      // Act & Assert - 型チェック
      expect(kinds.length).toBe(7);
    });
  });
});
