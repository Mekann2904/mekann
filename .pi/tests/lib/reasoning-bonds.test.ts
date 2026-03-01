/**
 * @abdd.meta
 * @path .pi/tests/lib/reasoning-bonds.test.ts
 * @role Test suite for reasoning bond analysis
 * @why Verify bond type inference, transition graphs, and entropy convergence
 * @related ../../lib/reasoning-bonds.ts
 * @public_api Tests for exported functions and types
 * @invariants Tests should not depend on external state
 * @side_effects None expected
 * @failure_modes None expected
 */

import { describe, it, expect } from "vitest";
import {
  inferBondType,
  buildTransitionGraph,
  computeGraphSimilarity,
  computeEntropyConvergence,
  detectStructuralChaos,
  analyzeMetacognitiveOscillation,
  analyzeBondDistribution,
  detectSemanticIsomers,
  DEFAULT_BONDS,
  type ReasoningBondType,
  type BondTransitionGraph,
} from "../../lib/reasoning-bonds";

describe("reasoning-bonds", () => {
  describe("DEFAULT_BONDS", () => {
    it("DEFAULT_BONDS_hasAllBondTypes", () => {
      expect(DEFAULT_BONDS["deep-reasoning"]).toBeDefined();
      expect(DEFAULT_BONDS["self-reflection"]).toBeDefined();
      expect(DEFAULT_BONDS["self-exploration"]).toBeDefined();
      expect(DEFAULT_BONDS["normal-operation"]).toBeDefined();
    });

    it("DEFAULT_BONDS_hasValidEnergyValues", () => {
      Object.values(DEFAULT_BONDS).forEach((bond) => {
        expect(bond.energy).toBeGreaterThanOrEqual(0);
        expect(bond.energy).toBeLessThanOrEqual(1);
      });
    });
  });

  describe("inferBondType", () => {
    it("inferBondType_detectsSelfReflection", () => {
      const outputs = [
        "Wait, let me reconsider this approach.",
        "However, I should verify this assumption.",
        "Let me double-check the results.",
      ];

      outputs.forEach((output) => {
        expect(inferBondType(output)).toBe("self-reflection");
      });
    });

    it("inferBondType_detectsSelfExploration", () => {
      const outputs = [
        "Maybe we should try a different approach.",
        "Let's explore the alternatives.",
        "What if we consider this option?",
      ];

      outputs.forEach((output) => {
        expect(inferBondType(output)).toBe("self-exploration");
      });
    });

    it("inferBondType_detectsDeepReasoning", () => {
      const outputs = [
        "Therefore, the conclusion follows.",
        "Because of this, we can infer that...",
        "Step by step analysis shows the result.",
        "Thus, the logic is sound.",
      ];

      outputs.forEach((output) => {
        expect(inferBondType(output)).toBe("deep-reasoning");
      });
    });

    it("inferBondType_defaultsToNormalOperation", () => {
      // Note: "if" appears in many words, so avoid words containing "if"
      const outputs = [
        "Complete the task now.",
        "Run the process.",
        "Done.",
      ];

      outputs.forEach((output) => {
        expect(inferBondType(output)).toBe("normal-operation");
      });
    });
  });

  describe("buildTransitionGraph", () => {
    it("buildTransitionGraph_emptySequence_returnsEmptyGraph", () => {
      const graph = buildTransitionGraph([]);

      expect(graph.transitions.size).toBe(0);
      expect(graph.sampleCount).toBe(0);
    });

    it("buildTransitionGraph_singleElement_returnsEmptyTransitions", () => {
      const graph = buildTransitionGraph(["deep-reasoning"]);

      expect(graph.sampleCount).toBe(1);
      expect(graph.transitions.size).toBe(0);
    });

    it("buildTransitionGraph_multipleElements_buildsTransitions", () => {
      const sequence: ReasoningBondType[] = [
        "deep-reasoning",
        "self-reflection",
        "deep-reasoning",
        "self-reflection",
      ];

      const graph = buildTransitionGraph(sequence);

      expect(graph.sampleCount).toBe(4);
      expect(graph.transitions.size).toBeGreaterThan(0);
    });

    it("buildTransitionGraph_calculatesStabilityScore", () => {
      const stableSequence: ReasoningBondType[] = [
        "deep-reasoning",
        "deep-reasoning",
        "deep-reasoning",
      ];

      const graph = buildTransitionGraph(stableSequence);

      expect(graph.stabilityScore).toBeGreaterThanOrEqual(0);
      expect(graph.stabilityScore).toBeLessThanOrEqual(1);
    });
  });

  describe("computeGraphSimilarity", () => {
    it("computeGraphSimilarity_identicalGraphs_returnsHighSimilarity", () => {
      const sequence: ReasoningBondType[] = ["deep-reasoning", "self-reflection"];
      const graph = buildTransitionGraph(sequence);

      const similarity = computeGraphSimilarity(graph, graph);

      expect(similarity).toBe(1);
    });

    it("computeGraphSimilarity_differentGraphs_returnsLowSimilarity", () => {
      const graph1 = buildTransitionGraph(["deep-reasoning", "self-reflection"]);
      const graph2 = buildTransitionGraph(["self-exploration", "normal-operation"]);

      const similarity = computeGraphSimilarity(graph1, graph2);

      expect(similarity).toBeLessThan(1);
    });
  });

  describe("computeEntropyConvergence", () => {
    it("computeEntropyConvergence_emptySeries_returnsDefaults", () => {
      const metrics = computeEntropyConvergence([]);

      expect(metrics.initialEntropy).toBe(0);
      expect(metrics.finalEntropy).toBe(0);
    });

    it("computeEntropyConvergence_convergingSeries_detectsConvergence", () => {
      const series = [0.9, 0.7, 0.5, 0.3, 0.1];

      const metrics = computeEntropyConvergence(series);

      expect(metrics.isConverging).toBe(true);
      expect(metrics.convergenceRate).toBeGreaterThan(0);
    });

    it("computeEntropyConvergence_oscillatingSeries_detectsOscillation", () => {
      const series = [0.5, 0.9, 0.3, 0.8, 0.2, 0.7];

      const metrics = computeEntropyConvergence(series);

      expect(metrics.oscillationCount).toBeGreaterThan(0);
    });
  });

  describe("detectStructuralChaos", () => {
    it("detectStructuralChaos_singleGraph_returnsNoChaos", () => {
      const graph = buildTransitionGraph(["deep-reasoning", "self-reflection"]);

      const result = detectStructuralChaos([graph]);

      expect(result.hasChaos).toBe(false);
    });

    it("detectStructuralChaos_similarGraphs_returnsNoChaos", () => {
      const graph1 = buildTransitionGraph(["deep-reasoning", "self-reflection", "deep-reasoning"]);
      const graph2 = buildTransitionGraph(["deep-reasoning", "self-reflection", "deep-reasoning"]);

      const result = detectStructuralChaos([graph1, graph2]);

      expect(result.hasChaos).toBe(false);
    });
  });

  describe("analyzeMetacognitiveOscillation", () => {
    it("analyzeMetacognitiveOscillation_emptyArrays_returnsDefaults", () => {
      const result = analyzeMetacognitiveOscillation([], []);

      expect(result.highEntropyPhases).toEqual([]);
      expect(result.lowEntropyPhases).toEqual([]);
    });

    it("analyzeMetacognitiveOscillation_identifiesPhases", () => {
      const bondSequence: ReasoningBondType[] = [
        "deep-reasoning",
        "self-exploration",
        "deep-reasoning",
        "self-reflection",
      ];
      const entropySeries = [0.3, 0.7, 0.4, 0.2];

      const result = analyzeMetacognitiveOscillation(bondSequence, entropySeries);

      expect(result.highEntropyPhases.length + result.lowEntropyPhases.length).toBe(4);
    });
  });

  describe("analyzeBondDistribution", () => {
    it("analyzeBondDistribution_emptyOutputs_returnsDefaults", () => {
      const result = analyzeBondDistribution([]);

      expect(result.graph.sampleCount).toBe(0);
      expect(result.dominantBond).toBe("normal-operation");
    });

    it("analyzeBondDistribution_analyzesOutputs", () => {
      const outputs = [
        "Therefore, we conclude this.",
        "Wait, let me verify.",
        "Maybe we should try this.",
      ];

      const result = analyzeBondDistribution(outputs);

      expect(result.graph.sampleCount).toBe(3);
      expect(result.bondCounts.size).toBeGreaterThan(0);
    });
  });

  describe("detectSemanticIsomers", () => {
    it("detectSemanticIsomers_identicalOutputs_returnsHighSimilarity", () => {
      const outputs = ["Therefore, this follows.", "Wait, let me check."];

      const result = detectSemanticIsomers(outputs, outputs);

      expect(result.structuralSimilarity).toBe(1);
    });

    it("detectSemanticIsomers_differentOutputs_returnsLowerSimilarity", () => {
      const outputs1 = ["Therefore, this follows.", "Because of that."];
      const outputs2 = ["Maybe try this.", "What if we do that?"];

      const result = detectSemanticIsomers(outputs1, outputs2);

      expect(result.structuralSimilarity).toBeLessThan(1);
    });
  });

  describe("integration tests", () => {
    it("full bond analysis workflow", () => {
      const outputs = [
        "Therefore, step by step, we analyze this.",
        "Wait, let me reconsider the approach.",
        "Maybe we should explore alternatives.",
        "Because of this, we can conclude.",
        "However, I should verify this.",
      ];

      // Analyze distribution
      const distribution = analyzeBondDistribution(outputs);
      expect(distribution.graph.sampleCount).toBe(5);

      // Build sequence
      const bondSequence = outputs.map(inferBondType);
      expect(bondSequence.length).toBe(5);

      // Compute convergence
      const entropySeries = [0.8, 0.6, 0.7, 0.4, 0.3];
      const convergence = computeEntropyConvergence(entropySeries);
      expect(convergence.initialEntropy).toBe(0.8);
      expect(convergence.finalEntropy).toBe(0.3);

      // Analyze oscillation
      const oscillation = analyzeMetacognitiveOscillation(bondSequence, entropySeries);
      expect(oscillation.highEntropyPhases.length + oscillation.lowEntropyPhases.length).toBe(5);
    });
  });
});
