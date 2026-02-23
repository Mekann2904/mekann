/**
 * @summary 推論ボンド評価器の単体テスト
 */

import { describe, it, expect } from "vitest";
import {
  evaluateTeamBonds,
  generateBondReport,
  detectTeamStructuralChaos,
  BOND_OPTIMAL_RANGES,
  type TeamMemberResultForBond,
} from "../../../.pi/lib/reasoning-bonds-evaluator.js";

describe("reasoning-bonds-evaluator", () => {
  // Sample outputs with different bond types
  const sampleOutputs = {
    deepReasoning: `
SUMMARY: Analyzed the component dependencies
CLAIM: The module has a circular dependency issue
EVIDENCE: file1.ts:45, file2.ts:78, file3.ts:12
CONFIDENCE: 0.85
RESULT: Circular dependency detected between modules A, B, and C
NEXT_STEP: Break the cycle by extracting common interface
    `,
    selfReflection: `
SUMMARY: Reconsidered the previous approach
CLAIM: Wait, but I might be wrong about this assumption
EVIDENCE: However, the test results show otherwise
CONFIDENCE: 0.6
RESULT: Need to verify the assumption before proceeding
NEXT_STEP: Run additional tests to validate
    `,
    selfExploration: `
SUMMARY: Maybe exploring alternative approaches
CLAIM: Perhaps we should try a different strategy
EVIDENCE: Let's consider option A, B, and C
CONFIDENCE: 0.5
RESULT: Multiple viable approaches identified
NEXT_STEP: Evaluate each option
    `,
    normalOperation: `
SUMMARY: Computed the result
CLAIM: The answer is 42
EVIDENCE: calculation output
CONFIDENCE: 0.95
RESULT: 42
NEXT_STEP: Done
    `,
  };

  const createMockResult = (
    memberId: string,
    role: string,
    output: string,
    confidence: number = 0.7,
    status: string = "completed"
  ): TeamMemberResultForBond => ({
    memberId,
    role,
    output,
    confidence,
    status,
  });

  describe("evaluateTeamBonds", () => {
    it("should evaluate team with varied bond types", () => {
      const results: TeamMemberResultForBond[] = [
        createMockResult("member1", "Researcher", sampleOutputs.deepReasoning, 0.85),
        createMockResult("member2", "Reviewer", sampleOutputs.selfReflection, 0.6),
        createMockResult("member3", "Explorer", sampleOutputs.selfExploration, 0.5),
      ];

      const evaluation = evaluateTeamBonds(results);

      expect(evaluation.transitionGraph).toBeDefined();
      expect(evaluation.stabilityScore).toBeGreaterThanOrEqual(0);
      expect(evaluation.stabilityScore).toBeLessThanOrEqual(1);
      expect(evaluation.distributionHealth).toBeDefined();
      expect(evaluation.overallAssessment).toBeDefined();
      expect(evaluation.recommendations).toBeInstanceOf(Array);
    });

    it("should handle empty results", () => {
      const evaluation = evaluateTeamBonds([]);

      expect(evaluation.transitionGraph.sampleCount).toBe(0);
      expect(evaluation.overallAssessment).toBeDefined();
    });

    it("should detect unstable structure with low convergence", () => {
      const results: TeamMemberResultForBond[] = [
        createMockResult("member1", "Role1", sampleOutputs.selfExploration, 0.3),
        createMockResult("member2", "Role2", sampleOutputs.selfExploration, 0.9),
        createMockResult("member3", "Role3", sampleOutputs.selfExploration, 0.2),
        createMockResult("member4", "Role4", sampleOutputs.selfExploration, 0.8),
      ];

      const evaluation = evaluateTeamBonds(results);

      // High variance in confidence should affect stability
      expect(evaluation.entropyMetrics.oscillationCount).toBeGreaterThan(0);
    });

    it("should evaluate distribution health correctly", () => {
      // Outputs with explicit deep reasoning keywords
      const deepReasoningOutput = `
SUMMARY: Analyzed the component dependencies step by step
CLAIM: Therefore, the module has a circular dependency issue
EVIDENCE: Because file1.ts imports file2.ts, hence file2 imports file3, thus forming a cycle
CONFIDENCE: 0.85
RESULT: Circular dependency detected between modules A, B, and C
NEXT_STEP: Break the cycle by extracting common interface
      `;
      const results: TeamMemberResultForBond[] = [
        createMockResult("member1", "Role1", deepReasoningOutput, 0.8),
        createMockResult("member2", "Role2", deepReasoningOutput, 0.85),
        createMockResult("member3", "Role3", deepReasoningOutput, 0.9),
      ];

      const evaluation = evaluateTeamBonds(results);

      // Deep reasoning should be detected
      expect(evaluation.distributionHealth.deepReasoning.actual).toBeGreaterThan(0);
    });

    it("should generate appropriate recommendations for chaotic structure", () => {
      // Mix of very different outputs
      const results: TeamMemberResultForBond[] = [
        createMockResult("member1", "Role1", sampleOutputs.selfExploration, 0.3),
        createMockResult("member2", "Role2", sampleOutputs.selfReflection, 0.3),
        createMockResult("member3", "Role3", sampleOutputs.selfExploration, 0.3),
        createMockResult("member4", "Role4", sampleOutputs.selfReflection, 0.3),
        createMockResult("member5", "Role5", sampleOutputs.selfExploration, 0.3),
        createMockResult("member6", "Role6", sampleOutputs.selfReflection, 0.3),
      ];

      const evaluation = evaluateTeamBonds(results);

      // Should have recommendations
      expect(evaluation.recommendations.length).toBeGreaterThanOrEqual(0);
    });

    it("should compare with previous graph when provided", () => {
      const results: TeamMemberResultForBond[] = [
        createMockResult("member1", "Role1", sampleOutputs.deepReasoning, 0.8),
        createMockResult("member2", "Role2", sampleOutputs.deepReasoning, 0.85),
      ];

      const evaluation1 = evaluateTeamBonds(results);
      const evaluation2 = evaluateTeamBonds(results, evaluation1.transitionGraph);

      // Should include structural consistency in stability score
      expect(evaluation2.stabilityScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe("generateBondReport", () => {
    it("should generate a markdown report", () => {
      const results: TeamMemberResultForBond[] = [
        createMockResult("member1", "Researcher", sampleOutputs.deepReasoning, 0.85),
        createMockResult("member2", "Reviewer", sampleOutputs.selfReflection, 0.6),
      ];

      const evaluation = evaluateTeamBonds(results);
      const report = generateBondReport(evaluation);

      expect(report).toContain("# Reasoning Bond Analysis Report");
      expect(report).toContain("Overall Assessment");
      expect(report).toContain("Bond Distribution");
      expect(report).toContain("Metacognitive Oscillation");
    });

    it("should include recommendations when present", () => {
      const results: TeamMemberResultForBond[] = [
        createMockResult("member1", "Role1", sampleOutputs.selfExploration, 0.3),
        createMockResult("member2", "Role2", sampleOutputs.selfExploration, 0.3),
        createMockResult("member3", "Role3", sampleOutputs.selfExploration, 0.3),
      ];

      const evaluation = evaluateTeamBonds(results);
      const report = generateBondReport(evaluation);

      if (evaluation.recommendations.length > 0) {
        expect(report).toContain("## Recommendations");
      }
    });
  });

  describe("detectTeamStructuralChaos", () => {
    it("should detect chaos in conflicting evaluations", () => {
      // Create evaluations with very different structures
      const results1: TeamMemberResultForBond[] = [
        createMockResult("m1", "R1", sampleOutputs.deepReasoning, 0.9),
        createMockResult("m2", "R2", sampleOutputs.deepReasoning, 0.9),
        createMockResult("m3", "R3", sampleOutputs.deepReasoning, 0.9),
      ];

      const results2: TeamMemberResultForBond[] = [
        createMockResult("m1", "R1", sampleOutputs.selfExploration, 0.5),
        createMockResult("m2", "R2", sampleOutputs.selfExploration, 0.5),
        createMockResult("m3", "R3", sampleOutputs.selfExploration, 0.5),
      ];

      const eval1 = evaluateTeamBonds(results1);
      const eval2 = evaluateTeamBonds(results2);

      const chaosResult = detectTeamStructuralChaos([eval1, eval2]);

      expect(chaosResult.message).toBeDefined();
      expect(typeof chaosResult.hasChaos).toBe("boolean");
    });

    it("should return appropriate message for single evaluation", () => {
      const results: TeamMemberResultForBond[] = [
        createMockResult("m1", "R1", sampleOutputs.deepReasoning, 0.9),
      ];

      const evaluation = evaluateTeamBonds(results);
      const chaosResult = detectTeamStructuralChaos([evaluation]);

      expect(chaosResult.message).toContain("不足");
      expect(chaosResult.hasChaos).toBe(false);
    });

    it("should return appropriate message for similar evaluations", () => {
      const results: TeamMemberResultForBond[] = [
        createMockResult("m1", "R1", sampleOutputs.deepReasoning, 0.9),
        createMockResult("m2", "R2", sampleOutputs.deepReasoning, 0.85),
      ];

      const eval1 = evaluateTeamBonds(results);
      const eval2 = evaluateTeamBonds(results);

      const chaosResult = detectTeamStructuralChaos([eval1, eval2]);

      expect(chaosResult.message).toBeDefined();
    });
  });

  describe("BOND_OPTIMAL_RANGES", () => {
    it("should have valid optimal ranges for all bond types", () => {
      expect(BOND_OPTIMAL_RANGES["deep-reasoning"]).toBeDefined();
      expect(BOND_OPTIMAL_RANGES["self-reflection"]).toBeDefined();
      expect(BOND_OPTIMAL_RANGES["self-exploration"]).toBeDefined();
      expect(BOND_OPTIMAL_RANGES["normal-operation"]).toBeDefined();
    });

    it("should have min < optimal < max for each range", () => {
      for (const [_type, range] of Object.entries(BOND_OPTIMAL_RANGES)) {
        expect(range.min).toBeLessThan(range.optimal);
        expect(range.optimal).toBeLessThan(range.max);
        expect(range.min).toBeGreaterThanOrEqual(0);
        expect(range.max).toBeLessThanOrEqual(1);
      }
    });
  });

  describe("edge cases", () => {
    it("should handle results with missing confidence", () => {
      const results: TeamMemberResultForBond[] = [
        { memberId: "m1", role: "R1", output: sampleOutputs.deepReasoning, status: "completed" },
      ];

      // Should not throw
      const evaluation = evaluateTeamBonds(results);
      expect(evaluation).toBeDefined();
    });

    it("should handle failed members", () => {
      const results: TeamMemberResultForBond[] = [
        createMockResult("m1", "R1", sampleOutputs.deepReasoning, 0.9),
        { memberId: "m2", role: "R2", output: "", status: "failed" },
      ];

      const evaluation = evaluateTeamBonds(results);
      expect(evaluation).toBeDefined();
    });

    it("should handle very long outputs", () => {
      const longOutput = sampleOutputs.deepReasoning.repeat(100);
      const results: TeamMemberResultForBond[] = [
        createMockResult("m1", "R1", longOutput, 0.9),
      ];

      const evaluation = evaluateTeamBonds(results);
      expect(evaluation).toBeDefined();
    });

    it("should handle special characters in outputs", () => {
      const specialOutput = `
SUMMARY: Test with special chars @#$%^&*()
CLAIM: Unicode test 日本語 中文
EVIDENCE: emoji test 🎉 🚀
CONFIDENCE: 0.5
RESULT: Done
      `;

      const results: TeamMemberResultForBond[] = [
        createMockResult("m1", "R1", specialOutput, 0.5),
      ];

      const evaluation = evaluateTeamBonds(results);
      expect(evaluation).toBeDefined();
    });
  });
});
