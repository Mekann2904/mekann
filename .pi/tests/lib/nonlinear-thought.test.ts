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
  createThoughtSeed,
  createNonLinearThoughtEngine,
  generateAssociation,
  generateAssociationChain,
  findConvergencePoint,
  evaluateInsight,
  extractEmergentInsights,
} from "../../lib/nonlinear-thought.js";

describe("nonlinear-thought", () => {
  describe("createThoughtSeed", () => {
    it("思考の種を作成する", () => {
      // Arrange & Act
      const seed = createThoughtSeed("テスト概念", "concept");

      // Assert
      expect(seed.id).toBeDefined();
      expect(seed.content).toBe("テスト概念");
      expect(seed.type).toBe("concept");
      expect(seed.emotionalValence).toBeGreaterThanOrEqual(-1);
      expect(seed.emotionalValence).toBeLessThanOrEqual(1);
    });

    it("オプションパラメータを設定できる", () => {
      // Arrange & Act
      const seed = createThoughtSeed("テスト", "metaphor", {
        emotionalValence: 0.5,
        abstractionLevel: 0.8,
        relatedConcepts: ["関連1", "関連2"],
      });

      // Assert
      expect(seed.emotionalValence).toBe(0.5);
      expect(seed.abstractionLevel).toBe(0.8);
      expect(seed.relatedConcepts).toEqual(["関連1", "関連2"]);
    });
  });

  describe("createNonLinearThoughtEngine", () => {
    it("エンジンを作成する", () => {
      // Arrange & Act
      const engine = createNonLinearThoughtEngine();

      // Assert
      expect(engine.seeds.size).toBe(0);
      expect(engine.chains).toEqual([]);
      expect(engine.insights).toEqual([]);
    });

    it("初期シードを設定できる", () => {
      // Arrange
      const seeds = [
        createThoughtSeed("シード1", "concept"),
        createThoughtSeed("シード2", "question"),
      ];

      // Act
      const engine = createNonLinearThoughtEngine({ initialSeeds: seeds });

      // Assert
      expect(engine.seeds.size).toBe(2);
    });
  });

  describe("generateAssociation", () => {
    it("連想を生成する", () => {
      // Arrange
      const seed = createThoughtSeed("木", "concept");
      const engine = createNonLinearThoughtEngine();

      // Act
      const association = generateAssociation(seed, engine);

      // Assert
      expect(association).toBeDefined();
      expect(association.content).toBeDefined();
      expect(association.type).toBeDefined();
      expect(association.strength).toBeGreaterThanOrEqual(0);
      expect(association.strength).toBeLessThanOrEqual(1);
    });

    it("連想タイプは有効な値", () => {
      // Arrange
      const seed = createThoughtSeed("テスト", "concept");
      const engine = createNonLinearThoughtEngine();

      // Act
      const association = generateAssociation(seed, engine);

      // Assert
      const validTypes = ["semantic", "phonetic", "visual", "emotional", "temporal", "spatial", "metaphorical", "random"];
      expect(validTypes).toContain(association.type);
    });
  });

  describe("generateAssociationChain", () => {
    it("連想チェーンを生成する", () => {
      // Arrange
      const seed = createThoughtSeed("海", "concept");
      const engine = createNonLinearThoughtEngine();

      // Act
      const chain = generateAssociationChain(seed, engine, 3);

      // Assert
      expect(chain.associations.length).toBeLessThanOrEqual(3);
      expect(chain.startingSeed.id).toBe(seed.id);
    });

    it("深さ0は空のチェーンを返す", () => {
      // Arrange
      const seed = createThoughtSeed("テスト", "concept");
      const engine = createNonLinearThoughtEngine();

      // Act
      const chain = generateAssociationChain(seed, engine, 0);

      // Assert
      expect(chain.associations.length).toBe(0);
    });

    it("チェーンは履歴に追加される", () => {
      // Arrange
      const seed = createThoughtSeed("テスト", "concept");
      const engine = createNonLinearThoughtEngine();

      // Act
      generateAssociationChain(seed, engine, 2);

      // Assert
      expect(engine.chains.length).toBe(1);
    });
  });

  describe("findConvergencePoint", () => {
    it("複数のチェーンから収束点を見つける", () => {
      // Arrange
      const engine = createNonLinearThoughtEngine();
      const seed1 = createThoughtSeed("スタート1", "concept");
      const seed2 = createThoughtSeed("スタート2", "concept");

      const chain1 = generateAssociationChain(seed1, engine, 3);
      const chain2 = generateAssociationChain(seed2, engine, 3);

      // Act
      const convergence = findConvergencePoint([chain1, chain2], engine);

      // Assert
      // 収束点が見つかる場合と見つからない場合がある
      if (convergence) {
        expect(convergence.content).toBeDefined();
        expect(convergence.confidence).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe("evaluateInsight", () => {
    it("洞察を評価する", () => {
      // Arrange
      const insight = "新しい視点: つながりが見えた";
      const engine = createNonLinearThoughtEngine();

      // Act
      const score = evaluateInsight(insight, engine);

      // Assert
      expect(score.novelty).toBeGreaterThanOrEqual(0);
      expect(score.novelty).toBeLessThanOrEqual(1);
      expect(score.relevance).toBeGreaterThanOrEqual(0);
      expect(score.relevance).toBeLessThanOrEqual(1);
      expect(score.overallScore).toBeGreaterThanOrEqual(0);
      expect(score.overallScore).toBeLessThanOrEqual(1);
    });
  });

  describe("extractEmergentInsights", () => {
    it("チェーンから洞察を抽出する", () => {
      // Arrange
      const engine = createNonLinearThoughtEngine();
      const seed = createThoughtSeed("探索", "question");
      const chain = generateAssociationChain(seed, engine, 3);

      // Act
      const insights = extractEmergentInsights([chain], engine);

      // Assert
      expect(Array.isArray(insights)).toBe(true);
    });

    it("複数のチェーンから洞察を抽出する", () => {
      // Arrange
      const engine = createNonLinearThoughtEngine();
      const seed1 = createThoughtSeed("問い1", "question");
      const seed2 = createThoughtSeed("問い2", "question");

      const chain1 = generateAssociationChain(seed1, engine, 3);
      const chain2 = generateAssociationChain(seed2, engine, 3);

      // Act
      const insights = extractEmergentInsights([chain1, chain2], engine);

      // Assert
      expect(Array.isArray(insights)).toBe(true);
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

      // Act & Assert
      types.forEach((type) => {
        const seed = createThoughtSeed("テスト", type);
        expect(seed.type).toBe(type);
      });
    });
  });

  describe("活性化強度", () => {
    it("活性化強度は0-1の範囲", () => {
      // Arrange & Act
      const seed = createThoughtSeed("テスト", "concept");

      // Assert
      expect(seed.activationStrength).toBeGreaterThanOrEqual(0);
      expect(seed.activationStrength).toBeLessThanOrEqual(1);
    });
  });

  describe("連想の意味的距離", () => {
    it("意味的距離は0-1の範囲", () => {
      // Arrange
      const seed = createThoughtSeed("テスト", "concept");
      const engine = createNonLinearThoughtEngine();

      // Act
      const association = generateAssociation(seed, engine);

      // Assert
      expect(association.semanticDistance).toBeGreaterThanOrEqual(0);
      expect(association.semanticDistance).toBeLessThanOrEqual(1);
    });
  });

  describe("驚き度", () => {
    it("驚き度は0-1の範囲", () => {
      // Arrange
      const seed = createThoughtSeed("テスト", "concept");
      const engine = createNonLinearThoughtEngine();

      // Act
      const association = generateAssociation(seed, engine);

      // Assert
      expect(association.surpriseLevel).toBeGreaterThanOrEqual(0);
      expect(association.surpriseLevel).toBeLessThanOrEqual(1);
    });
  });
});
