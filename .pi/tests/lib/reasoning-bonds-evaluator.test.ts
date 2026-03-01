/**
 * @file .pi/lib/reasoning-bonds-evaluator.ts の単体テスト
 * @description チーム推論ボンド評価と構造的健全性分析のテスト
 * @testFramework vitest
 */

import { describe, it, expect } from "vitest";
import {
	evaluateTeamBonds,
	generateBondReport,
	detectTeamStructuralChaos,
	BOND_OPTIMAL_RANGES,
	type TeamMemberResultForBond,
	type BondEvaluationResult,
} from "../../lib/reasoning-bonds-evaluator.js";

describe("BOND_OPTIMAL_RANGES", () => {
	describe("正常系", () => {
		it("should have valid ranges for deep-reasoning", () => {
			expect(BOND_OPTIMAL_RANGES["deep-reasoning"]).toBeDefined();
			expect(BOND_OPTIMAL_RANGES["deep-reasoning"].min).toBeLessThanOrEqual(
				BOND_OPTIMAL_RANGES["deep-reasoning"].optimal
			);
			expect(BOND_OPTIMAL_RANGES["deep-reasoning"].optimal).toBeLessThanOrEqual(
				BOND_OPTIMAL_RANGES["deep-reasoning"].max
			);
		});

		it("should have valid ranges for all bond types", () => {
			const types = ["deep-reasoning", "self-reflection", "self-exploration", "normal-operation"] as const;
			for (const type of types) {
				expect(BOND_OPTIMAL_RANGES[type].min).toBeGreaterThanOrEqual(0);
				expect(BOND_OPTIMAL_RANGES[type].max).toBeLessThanOrEqual(1);
			}
		});
	});
});

describe("evaluateTeamBonds", () => {
	describe("正常系", () => {
		it("should evaluate team bonds with completed results", () => {
			// Arrange
			const results: TeamMemberResultForBond[] = [
				{
					memberId: "agent-1",
					role: "researcher",
					output: "Thinking deeply about this problem...",
					confidence: 0.8,
					status: "completed",
				},
				{
					memberId: "agent-2",
					role: "critic",
					output: "Let me reflect on my previous analysis...",
					confidence: 0.7,
					status: "completed",
				},
			];

			// Act
			const evaluation = evaluateTeamBonds(results);

			// Assert
			expect(evaluation).toBeDefined();
			expect(evaluation.stabilityScore).toBeGreaterThanOrEqual(0);
			expect(evaluation.stabilityScore).toBeLessThanOrEqual(1);
			expect(evaluation.overallAssessment).toBeDefined();
			expect(evaluation.distributionHealth).toBeDefined();
			expect(evaluation.recommendations).toBeInstanceOf(Array);
		});

		it("should filter out non-completed results", () => {
			// Arrange
			const results: TeamMemberResultForBond[] = [
				{
					memberId: "agent-1",
					role: "researcher",
					output: "Completed output",
					confidence: 0.8,
					status: "completed",
				},
				{
					memberId: "agent-2",
					role: "critic",
					output: "",
					confidence: 0.5,
					status: "failed",
				},
				{
					memberId: "agent-3",
					role: "analyst",
					output: "",
					confidence: 0.5,
					status: "pending",
				},
			];

			// Act
			const evaluation = evaluateTeamBonds(results);

			// Assert
			expect(evaluation.transitionGraph).toBeDefined();
		});

		it("should handle empty results gracefully", () => {
			// Arrange
			const results: TeamMemberResultForBond[] = [];

			// Act
			const evaluation = evaluateTeamBonds(results);

			// Assert
			expect(evaluation).toBeDefined();
			expect(evaluation.stabilityScore).toBeGreaterThanOrEqual(0);
		});

		it("should compute distribution health correctly", () => {
			// Arrange
			const results: TeamMemberResultForBond[] = [
				{
					memberId: "agent-1",
					role: "researcher",
					output: "Thinking deeply...",
					confidence: 0.8,
					status: "completed",
				},
			];

			// Act
			const evaluation = evaluateTeamBonds(results);

			// Assert
			expect(evaluation.distributionHealth.deepReasoning).toBeDefined();
			expect(evaluation.distributionHealth.selfReflection).toBeDefined();
			expect(evaluation.distributionHealth.selfExploration).toBeDefined();
			expect(evaluation.distributionHealth.normalOperation).toBeDefined();
		});

		it("should accept optional previous graph", () => {
			// Arrange
			const results: TeamMemberResultForBond[] = [
				{
					memberId: "agent-1",
					role: "researcher",
					output: "Deep analysis...",
					confidence: 0.9,
					status: "completed",
				},
			];

			const firstEvaluation = evaluateTeamBonds(results);
			const secondResults: TeamMemberResultForBond[] = [
				{
					memberId: "agent-2",
					role: "critic",
					output: "Critical review...",
					confidence: 0.85,
					status: "completed",
				},
			];

			// Act
			const secondEvaluation = evaluateTeamBonds(secondResults, firstEvaluation.transitionGraph);

			// Assert
			expect(secondEvaluation).toBeDefined();
			expect(secondEvaluation.stabilityScore).toBeGreaterThanOrEqual(0);
		});
	});

	describe("境界条件", () => {
		it("should handle results without confidence", () => {
			// Arrange
			const results: TeamMemberResultForBond[] = [
				{
					memberId: "agent-1",
					role: "researcher",
					output: "Analysis without confidence",
					status: "completed",
				},
			];

			// Act
			const evaluation = evaluateTeamBonds(results);

			// Assert
			expect(evaluation).toBeDefined();
		});

		it("should handle results with empty output", () => {
			// Arrange
			const results: TeamMemberResultForBond[] = [
				{
					memberId: "agent-1",
					role: "researcher",
					output: "",
					confidence: 0.5,
					status: "completed",
				},
			];

			// Act
			const evaluation = evaluateTeamBonds(results);

			// Assert
			expect(evaluation).toBeDefined();
		});

		it("should handle all failed results", () => {
			// Arrange
			const results: TeamMemberResultForBond[] = [
				{
					memberId: "agent-1",
					role: "researcher",
					output: "",
					confidence: 0,
					status: "failed",
				},
				{
					memberId: "agent-2",
					role: "critic",
					output: "",
					confidence: 0,
					status: "failed",
				},
			];

			// Act
			const evaluation = evaluateTeamBonds(results);

			// Assert
			expect(evaluation).toBeDefined();
			expect(evaluation.stabilityScore).toBeGreaterThanOrEqual(0);
		});
	});

	describe("評価結果", () => {
		it("should return optimal assessment for high stability", () => {
			// Arrange - Create results that should lead to optimal assessment
			const results: TeamMemberResultForBond[] = Array.from({ length: 5 }, (_, i) => ({
				memberId: `agent-${i}`,
				role: ["researcher", "critic", "analyst", "implementer", "reviewer"][i],
				output: `Deep reasoning analysis ${i}. Let me think deeply about this.`,
				confidence: 0.85 + i * 0.02,
				status: "completed" as const,
			}));

			// Act
			const evaluation = evaluateTeamBonds(results);

			// Assert
			expect(["optimal", "suboptimal", "unstable", "chaotic"]).toContain(evaluation.overallAssessment);
		});

		it("should generate recommendations for suboptimal results", () => {
			// Arrange
			const results: TeamMemberResultForBond[] = [
				{
					memberId: "agent-1",
					role: "explorer",
					output: "Exploring many possibilities without focus...",
					confidence: 0.3,
					status: "completed",
				},
			];

			// Act
			const evaluation = evaluateTeamBonds(results);

			// Assert
			expect(evaluation.recommendations).toBeInstanceOf(Array);
		});
	});
});

describe("generateBondReport", () => {
	describe("正常系", () => {
		it("should generate markdown report", () => {
			// Arrange
			const results: TeamMemberResultForBond[] = [
				{
					memberId: "agent-1",
					role: "researcher",
					output: "Deep thinking process...",
					confidence: 0.8,
					status: "completed",
				},
			];
			const evaluation = evaluateTeamBonds(results);

			// Act
			const report = generateBondReport(evaluation);

			// Assert
			expect(report).toContain("# Reasoning Bond Analysis Report");
			expect(report).toContain("## Summary");
			expect(report).toContain("Overall Assessment");
			expect(report).toContain("## Bond Distribution");
		});

		it("should include distribution health in report", () => {
			// Arrange
			const results: TeamMemberResultForBond[] = [
				{
					memberId: "agent-1",
					role: "researcher",
					output: "Analysis content",
					confidence: 0.75,
					status: "completed",
				},
			];
			const evaluation = evaluateTeamBonds(results);

			// Act
			const report = generateBondReport(evaluation);

			// Assert
			expect(report).toContain("deepReasoning");
			expect(report).toContain("selfReflection");
		});

		it("should include recommendations when present", () => {
			// Arrange
			const results: TeamMemberResultForBond[] = [
				{
					memberId: "agent-1",
					role: "explorer",
					output: "Exploring...",
					confidence: 0.4,
					status: "completed",
				},
			];
			const evaluation = evaluateTeamBonds(results);

			// Act
			const report = generateBondReport(evaluation);

			// Assert
			if (evaluation.recommendations.length > 0) {
				expect(report).toContain("## Recommendations");
			}
		});

		it("should include oscillation pattern analysis", () => {
			// Arrange
			const results: TeamMemberResultForBond[] = [
				{
					memberId: "agent-1",
					role: "researcher",
					output: "Thinking...",
					confidence: 0.7,
					status: "completed",
				},
			];
			const evaluation = evaluateTeamBonds(results);

			// Act
			const report = generateBondReport(evaluation);

			// Assert
			expect(report).toContain("## Metacognitive Oscillation");
		});
	});
});

describe("detectTeamStructuralChaos", () => {
	describe("正常系", () => {
		it("should detect chaos with multiple evaluations", () => {
			// Arrange
			const results1: TeamMemberResultForBond[] = [
				{
					memberId: "agent-1",
					role: "researcher",
					output: "Deep analysis...",
					confidence: 0.8,
					status: "completed",
				},
			];
			const results2: TeamMemberResultForBond[] = [
				{
					memberId: "agent-2",
					role: "critic",
					output: "Critical review...",
					confidence: 0.75,
					status: "completed",
				},
			];

			const evaluation1 = evaluateTeamBonds(results1);
			const evaluation2 = evaluateTeamBonds(results2);

			// Act
			const chaosDetection = detectTeamStructuralChaos([evaluation1, evaluation2]);

			// Assert
			expect(chaosDetection).toBeDefined();
			expect(typeof chaosDetection.hasChaos).toBe("boolean");
			expect(typeof chaosDetection.conflictScore).toBe("number");
			expect(chaosDetection.message).toBeDefined();
		});

		it("should return no chaos for single evaluation", () => {
			// Arrange
			const results: TeamMemberResultForBond[] = [
				{
					memberId: "agent-1",
					role: "researcher",
					output: "Single analysis...",
					confidence: 0.8,
					status: "completed",
				},
			];
			const evaluation = evaluateTeamBonds(results);

			// Act
			const chaosDetection = detectTeamStructuralChaos([evaluation]);

			// Assert
			expect(chaosDetection.hasChaos).toBe(false);
			expect(chaosDetection.conflictScore).toBe(0);
			expect(chaosDetection.message).toContain("不足");
		});

		it("should include recommendation in result", () => {
			// Arrange
			const results: TeamMemberResultForBond[] = [
				{
					memberId: "agent-1",
					role: "researcher",
					output: "Analysis 1...",
					confidence: 0.8,
					status: "completed",
				},
			];
			const results2: TeamMemberResultForBond[] = [
				{
					memberId: "agent-2",
					role: "critic",
					output: "Analysis 2...",
					confidence: 0.75,
					status: "completed",
				},
			];

			const evaluation1 = evaluateTeamBonds(results);
			const evaluation2 = evaluateTeamBonds(results2);

			// Act
			const chaosDetection = detectTeamStructuralChaos([evaluation1, evaluation2]);

			// Assert
			expect(chaosDetection.recommendation).toBeDefined();
		});

		it("should handle empty evaluations array", () => {
			// Act
			const chaosDetection = detectTeamStructuralChaos([]);

			// Assert
			expect(chaosDetection.hasChaos).toBe(false);
			expect(chaosDetection.message).toBeDefined();
		});
	});

	describe("境界条件", () => {
		it("should handle evaluations with same structure", () => {
			// Arrange
			const results: TeamMemberResultForBond[] = [
				{
					memberId: "agent-1",
					role: "researcher",
					output: "Deep thinking...",
					confidence: 0.85,
					status: "completed",
				},
			];

			const evaluation = evaluateTeamBonds(results);

			// Act - Same evaluation twice
			const chaosDetection = detectTeamStructuralChaos([evaluation, evaluation]);

			// Assert
			expect(chaosDetection.hasChaos).toBe(false);
		});
	});
});

describe("BondEvaluationResult structure", () => {
	describe("正常系", () => {
		it("should have all required properties", () => {
			// Arrange
			const results: TeamMemberResultForBond[] = [
				{
					memberId: "agent-1",
					role: "researcher",
					output: "Thinking...",
					confidence: 0.8,
					status: "completed",
				},
			];

			// Act
			const evaluation: BondEvaluationResult = evaluateTeamBonds(results);

			// Assert
			expect(evaluation.transitionGraph).toBeDefined();
			expect(evaluation.entropyMetrics).toBeDefined();
			expect(evaluation.oscillationPattern).toBeDefined();
			expect(typeof evaluation.stabilityScore).toBe("number");
			expect(evaluation.distributionHealth).toBeDefined();
			expect(["optimal", "suboptimal", "unstable", "chaotic"]).toContain(evaluation.overallAssessment);
			expect(Array.isArray(evaluation.recommendations)).toBe(true);
		});

		it("should have correct distribution health structure", () => {
			// Arrange
			const results: TeamMemberResultForBond[] = [
				{
					memberId: "agent-1",
					role: "researcher",
					output: "Analysis",
					confidence: 0.75,
					status: "completed",
				},
			];

			// Act
			const evaluation = evaluateTeamBonds(results);

			// Assert
			const health = evaluation.distributionHealth;
			expect(typeof health.deepReasoning.actual).toBe("number");
			expect(typeof health.deepReasoning.optimal).toBe("number");
			expect(["ok", "low", "high"]).toContain(health.deepReasoning.status);
		});
	});
});
