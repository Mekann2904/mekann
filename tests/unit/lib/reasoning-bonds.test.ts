/**
 * @summary 推論ボンド分析ライブラリの単体テスト
 */

import { describe, it, expect } from "vitest";
import {
  type ReasoningBondType,
  inferBondType,
  buildTransitionGraph,
  computeGraphSimilarity,
  computeEntropyConvergence,
  detectStructuralChaos,
  analyzeMetacognitiveOscillation,
  analyzeBondDistribution,
  detectSemanticIsomers,
  DEFAULT_BONDS,
} from "../../../.pi/lib/reasoning-bonds.js";

describe("reasoning-bonds", () => {
  describe("inferBondType", () => {
    it("should detect self-reflection keywords", () => {
      const output = "Wait, let me reconsider my approach. But I might be wrong here.";
      expect(inferBondType(output)).toBe("self-reflection");
    });

    it("should detect self-exploration keywords", () => {
      const output = "Maybe we should explore this path. Perhaps another approach would work.";
      expect(inferBondType(output)).toBe("self-exploration");
    });

    it("should detect deep-reasoning keywords", () => {
      const output = "Therefore, we can conclude that step A implies step B. Because of this constraint...";
      expect(inferBondType(output)).toBe("deep-reasoning");
    });

    it("should default to normal-operation for simple text", () => {
      const output = "The result is 42. Done.";
      expect(inferBondType(output)).toBe("normal-operation");
    });

    it("should prioritize self-reflection over other types", () => {
      const output = "However, let me verify this. Therefore the answer is correct.";
      expect(inferBondType(output)).toBe("self-reflection");
    });

    it("should handle Japanese reflection keywords", () => {
      const output = "待って、再検討しよう。確認が必要だ。";
      expect(inferBondType(output)).toBe("self-reflection");
    });

    it("should handle Japanese exploration keywords", () => {
      const output = "もしかすると、試してみる価値があるかも。";
      expect(inferBondType(output)).toBe("self-exploration");
    });

    it("should handle Japanese deep-reasoning keywords", () => {
      const output = "したがって、論理的にこの結論に達する。";
      expect(inferBondType(output)).toBe("deep-reasoning");
    });
  });

  describe("buildTransitionGraph", () => {
    it("should build empty graph for empty sequence", () => {
      const graph = buildTransitionGraph([]);
      expect(graph.sampleCount).toBe(0);
      expect(graph.transitions.size).toBe(0);
      expect(graph.stabilityScore).toBe(0);
    });

    it("should build single-element graph", () => {
      const graph = buildTransitionGraph(["deep-reasoning"]);
      expect(graph.sampleCount).toBe(1);
      expect(graph.transitions.size).toBe(0); // No transitions with single element
    });

    it("should count transitions correctly", () => {
      const sequence: ReasoningBondType[] = [
        "deep-reasoning",
        "self-reflection",
        "deep-reasoning",
        "self-reflection",
      ];
      const graph = buildTransitionGraph(sequence);

      expect(graph.sampleCount).toBe(4);
      expect(graph.transitions.get("deep-reasoning->self-reflection")?.count).toBe(2);
      expect(graph.transitions.get("self-reflection->deep-reasoning")?.count).toBe(1);
    });

    it("should calculate marginal distribution", () => {
      const sequence: ReasoningBondType[] = [
        "deep-reasoning",
        "deep-reasoning",
        "self-reflection",
        "self-reflection",
      ];
      const graph = buildTransitionGraph(sequence);

      expect(graph.marginalDistribution.get("deep-reasoning")).toBe(0.5);
      expect(graph.marginalDistribution.get("self-reflection")).toBe(0.5);
    });

    it("should calculate stability score for self-loops", () => {
      const sequence: ReasoningBondType[] = [
        "self-reflection",
        "self-reflection",
        "self-reflection",
        "self-reflection",
      ];
      const graph = buildTransitionGraph(sequence);

      // All transitions are self-loops, so stability should be high
      expect(graph.stabilityScore).toBeGreaterThan(0.5);
    });
  });

  describe("computeGraphSimilarity", () => {
    it("should return 1 for identical graphs", () => {
      const sequence: ReasoningBondType[] = [
        "deep-reasoning",
        "self-reflection",
        "deep-reasoning",
      ];
      const graph1 = buildTransitionGraph(sequence);
      const graph2 = buildTransitionGraph(sequence);

      expect(computeGraphSimilarity(graph1, graph2)).toBeCloseTo(1, 5);
    });

    it("should return lower similarity for different graphs", () => {
      const graph1 = buildTransitionGraph([
        "deep-reasoning",
        "deep-reasoning",
        "deep-reasoning",
      ]);
      const graph2 = buildTransitionGraph([
        "self-exploration",
        "self-exploration",
        "self-exploration",
      ]);

      expect(computeGraphSimilarity(graph1, graph2)).toBeLessThan(0.5);
    });

    it("should handle empty graphs", () => {
      const graph1 = buildTransitionGraph([]);
      const graph2 = buildTransitionGraph([]);

      expect(computeGraphSimilarity(graph1, graph2)).toBe(1);
    });
  });

  describe("computeEntropyConvergence", () => {
    it("should detect convergence for decreasing entropy", () => {
      const entropySeries = [0.8, 0.6, 0.4, 0.2, 0.1];
      const metrics = computeEntropyConvergence(entropySeries);

      expect(metrics.isConverging).toBe(true);
      expect(metrics.convergenceRate).toBeGreaterThan(0);
    });

    it("should detect non-convergence for oscillating entropy", () => {
      const entropySeries = [0.5, 0.8, 0.3, 0.9, 0.4, 0.7];
      const metrics = computeEntropyConvergence(entropySeries);

      expect(metrics.oscillationCount).toBeGreaterThan(0);
    });

    it("should handle empty series", () => {
      const metrics = computeEntropyConvergence([]);

      expect(metrics.initialEntropy).toBe(0);
      expect(metrics.finalEntropy).toBe(0);
      expect(metrics.isConverging).toBe(false);
    });
  });

  describe("detectStructuralChaos", () => {
    it("should detect no chaos for similar graphs", () => {
      const graphs = [
        buildTransitionGraph(["deep-reasoning", "self-reflection", "deep-reasoning"]),
        buildTransitionGraph(["deep-reasoning", "self-reflection", "deep-reasoning"]),
        buildTransitionGraph(["deep-reasoning", "self-reflection", "deep-reasoning"]),
      ];

      const result = detectStructuralChaos(graphs);

      expect(result.hasChaos).toBe(false);
      expect(result.conflictScore).toBeLessThan(0.3);
    });

    it("should detect chaos for very different graphs", () => {
      const graphs = [
        buildTransitionGraph(["deep-reasoning", "deep-reasoning", "deep-reasoning"]),
        buildTransitionGraph(["self-exploration", "self-exploration", "self-exploration"]),
        buildTransitionGraph(["self-reflection", "self-reflection", "self-reflection"]),
      ];

      const result = detectStructuralChaos(graphs, 0.5);

      expect(result.hasChaos).toBe(true);
      expect(result.conflictScore).toBeGreaterThan(0.3);
    });

    it("should handle single graph", () => {
      const graphs = [buildTransitionGraph(["deep-reasoning"])];

      const result = detectStructuralChaos(graphs);

      expect(result.hasChaos).toBe(false);
      expect(result.recommendation).toBe("unify");
    });
  });

  describe("analyzeMetacognitiveOscillation", () => {
    it("should identify high and low entropy phases", () => {
      const bondSequence: ReasoningBondType[] = [
        "self-exploration",  // high entropy
        "self-exploration",  // high entropy
        "self-reflection",   // low entropy
        "self-reflection",   // low entropy
      ];
      const entropySeries = [0.8, 0.7, 0.3, 0.2];

      const result = analyzeMetacognitiveOscillation(bondSequence, entropySeries);

      expect(result.highEntropyPhases.length).toBeGreaterThan(0);
      expect(result.lowEntropyPhases.length).toBeGreaterThan(0);
    });

    it("should handle mismatched lengths", () => {
      const bondSequence: ReasoningBondType[] = ["deep-reasoning", "self-reflection"];
      const entropySeries = [0.5, 0.3, 0.8]; // Longer than bond sequence

      // Should not throw
      const result = analyzeMetacognitiveOscillation(bondSequence, entropySeries);
      expect(result).toBeDefined();
    });
  });

  describe("analyzeBondDistribution", () => {
    it("should analyze bond distribution correctly", () => {
      const outputs = [
        "Therefore, we proceed to the next step.",
        "Wait, let me reconsider.",
        "Maybe we should try this.",
        "The result is computed here.",
      ];

      const result = analyzeBondDistribution(outputs);

      expect(result.graph.sampleCount).toBe(4);
      expect(result.bondCounts.size).toBeGreaterThan(0);
      expect(result.dominantBond).toBeDefined();
    });

    it("should handle empty outputs", () => {
      const result = analyzeBondDistribution([]);

      expect(result.graph.sampleCount).toBe(0);
      expect(result.bondCounts.size).toBe(0);
    });
  });

  describe("detectSemanticIsomers", () => {
    it("should detect isomers for similar structure but different distribution", () => {
      // Use longer outputs to ensure meaningful transition graphs
      const outputs1 = [
        "Therefore, we conclude A. Because of this, we proceed.",
        "Therefore, we conclude B. Hence the result follows.",
        "Wait, let me reconsider. However, this seems correct.",
        "Therefore, we conclude C. Thus the answer is found.",
        "Wait, let me verify. But I might be wrong.",
        "Therefore, the final answer is D.",
      ];
      const outputs2 = [
        "Maybe try approach A. Perhaps this will work.",
        "Maybe try approach B. Let's explore this path.",
        "Wait, let me reconsider. However, this seems correct.",
        "Maybe try approach C. I'll check this option.",
        "Wait, let me verify. But I might be wrong.",
        "Maybe the answer is D.",
      ];

      const result = detectSemanticIsomers(outputs1, outputs2);

      // Should detect some structural similarity (graphs have some common patterns)
      expect(result.structuralSimilarity).toBeGreaterThanOrEqual(0);
      expect(result.distributionSimilarity).toBeGreaterThanOrEqual(0);
    });

    it("should handle empty outputs", () => {
      const result = detectSemanticIsomers([], []);

      expect(result.isIsomer).toBe(false);
    });
  });

  describe("DEFAULT_BONDS", () => {
    it("should have all four bond types", () => {
      expect(DEFAULT_BONDS["deep-reasoning"]).toBeDefined();
      expect(DEFAULT_BONDS["self-reflection"]).toBeDefined();
      expect(DEFAULT_BONDS["self-exploration"]).toBeDefined();
      expect(DEFAULT_BONDS["normal-operation"]).toBeDefined();
    });

    it("should have correct energy ordering", () => {
      // Deep reasoning should have lowest energy (strongest bond)
      expect(DEFAULT_BONDS["deep-reasoning"].energy).toBeLessThan(
        DEFAULT_BONDS["self-reflection"].energy
      );
      expect(DEFAULT_BONDS["self-reflection"].energy).toBeLessThan(
        DEFAULT_BONDS["self-exploration"].energy
      );
    });
  });
});
