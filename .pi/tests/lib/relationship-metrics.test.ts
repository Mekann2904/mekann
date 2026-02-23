import { describe, it, expect } from "vitest";
import {
	evaluateTriangularTheory,
	evaluateMotivationBalance,
	detectImbalance,
	classifyLoveType,
	calculateOverallScore,
	generateRecommendations,
	evaluateRelationship,
	LOVE_TYPE_DESCRIPTIONS,
	type TriangularTheoryScores,
	type MotivationBalanceScores,
	type LoveType,
} from "../../lib/relationship-metrics.js";

describe("relationship-metrics", () => {
	describe("evaluateTriangularTheory", () => {
		it("should return scores in 0-1 range", () => {
			const result = evaluateTriangularTheory(0.5, 0.5, 0.5);
			expect(result.intimacy).toBe(0.5);
			expect(result.passion).toBe(0.5);
			expect(result.commitment).toBe(0.5);
		});

		it("should clamp values to 0-1 range", () => {
			const result = evaluateTriangularTheory(2, -1, 1.5);
			expect(result.intimacy).toBe(1);
			expect(result.passion).toBe(0);
			expect(result.commitment).toBe(1);
		});

		it("should use default values for undefined", () => {
			const result = evaluateTriangularTheory(undefined as any, undefined as any, undefined as any);
			expect(result.intimacy).toBe(0.5);
			expect(result.passion).toBe(0.5);
			expect(result.commitment).toBe(0.5);
		});
	});

	describe("evaluateMotivationBalance", () => {
		it("should return default scores for empty input", () => {
			const result = evaluateMotivationBalance({});
			expect(result.storge).toBe(0.5);
			expect(result.philia).toBe(0.5);
			expect(result.eros).toBe(0.5);
			expect(result.philautia).toBe(0.5);
			expect(result.xenia).toBe(0.5);
			expect(result.agape).toBe(0.5);
		});

		it("should use provided scores", () => {
			const result = evaluateMotivationBalance({ storge: 0.8, eros: 0.9 });
			expect(result.storge).toBe(0.8);
			expect(result.eros).toBe(0.9);
			expect(result.philia).toBe(0.5); // default
		});
	});

	describe("detectImbalance", () => {
		it("should detect no imbalance for balanced scores", () => {
			const balance: MotivationBalanceScores = {
				storge: 0.5,
				philia: 0.5,
				eros: 0.5,
				philautia: 0.5,
				xenia: 0.5,
				agape: 0.5,
			};
			const result = detectImbalance(balance);
			expect(result).toHaveLength(0);
		});

		it("should detect imbalance for high scores", () => {
			const balance: MotivationBalanceScores = {
				storge: 0.9,
				philia: 0.5,
				eros: 0.85,
				philautia: 0.5,
				xenia: 0.5,
				agape: 0.5,
			};
			const result = detectImbalance(balance, 0.8);
			expect(result).toHaveLength(2);
			expect(result.map((r) => r.type)).toContain("storge");
			expect(result.map((r) => r.type)).toContain("eros");
		});

		it("should include warnings for imbalances", () => {
			const balance: MotivationBalanceScores = {
				storge: 0.9,
				philia: 0.5,
				eros: 0.5,
				philautia: 0.5,
				xenia: 0.5,
				agape: 0.5,
			};
			const result = detectImbalance(balance, 0.8);
			expect(result[0].warning).toContain("抵抗");
		});
	});

	describe("classifyLoveType", () => {
		it("should classify non-love", () => {
			const scores: TriangularTheoryScores = {
				intimacy: 0.3,
				passion: 0.3,
				commitment: 0.3,
			};
			expect(classifyLoveType(scores)).toBe("non-love");
		});

		it("should classify consummate love", () => {
			const scores: TriangularTheoryScores = {
				intimacy: 0.7,
				passion: 0.7,
				commitment: 0.7,
			};
			expect(classifyLoveType(scores)).toBe("consummate");
		});

		it("should classify liking", () => {
			const scores: TriangularTheoryScores = {
				intimacy: 0.7,
				passion: 0.3,
				commitment: 0.3,
			};
			expect(classifyLoveType(scores)).toBe("liking");
		});

		it("should classify infatuation", () => {
			const scores: TriangularTheoryScores = {
				intimacy: 0.3,
				passion: 0.7,
				commitment: 0.3,
			};
			expect(classifyLoveType(scores)).toBe("infatuation");
		});

		it("should classify empty-love", () => {
			const scores: TriangularTheoryScores = {
				intimacy: 0.3,
				passion: 0.3,
				commitment: 0.7,
			};
			expect(classifyLoveType(scores)).toBe("empty-love");
		});

		it("should classify romantic love", () => {
			const scores: TriangularTheoryScores = {
				intimacy: 0.7,
				passion: 0.7,
				commitment: 0.3,
			};
			expect(classifyLoveType(scores)).toBe("romantic");
		});

		it("should classify companionate love", () => {
			const scores: TriangularTheoryScores = {
				intimacy: 0.7,
				passion: 0.3,
				commitment: 0.7,
			};
			expect(classifyLoveType(scores)).toBe("companionate");
		});

		it("should classify fatuous love", () => {
			const scores: TriangularTheoryScores = {
				intimacy: 0.3,
				passion: 0.7,
				commitment: 0.7,
			};
			expect(classifyLoveType(scores)).toBe("fatuous");
		});
	});

	describe("calculateOverallScore", () => {
		it("should calculate weighted average", () => {
			const triangular: TriangularTheoryScores = {
				intimacy: 0.6,
				passion: 0.6,
				commitment: 0.6,
			};
			const motivation: MotivationBalanceScores = {
				storge: 0.4,
				philia: 0.4,
				eros: 0.4,
				philautia: 0.4,
				xenia: 0.4,
				agape: 0.4,
			};
			const result = calculateOverallScore(triangular, motivation, {
				triangular: 0.6,
				motivation: 0.4,
			});
			// triangular avg = 0.6, motivation avg = 0.4
			// 0.6 * 0.6 + 0.4 * 0.4 = 0.36 + 0.16 = 0.52
			expect(result).toBeCloseTo(0.52, 2);
		});
	});

	describe("generateRecommendations", () => {
		it("should generate recommendations for low intimacy", () => {
			const triangular: TriangularTheoryScores = {
				intimacy: 0.3,
				passion: 0.7,
				commitment: 0.7,
			};
			const motivation: MotivationBalanceScores = {
				storge: 0.5,
				philia: 0.5,
				eros: 0.5,
				philautia: 0.5,
				xenia: 0.5,
				agape: 0.5,
			};
			const result = generateRecommendations(triangular, motivation);
			expect(result.some((r) => r.includes("コンテキスト"))).toBe(true);
		});

		it("should generate warning for dangerous love types", () => {
			const triangular: TriangularTheoryScores = {
				intimacy: 0.3,
				passion: 0.7,
				commitment: 0.7,
			};
			const motivation: MotivationBalanceScores = {
				storge: 0.5,
				philia: 0.5,
				eros: 0.5,
				philautia: 0.5,
				xenia: 0.5,
				agape: 0.5,
			};
			const result = generateRecommendations(triangular, motivation);
			expect(result.some((r) => r.includes("危険"))).toBe(true);
		});

		it("should detect imbalance warnings", () => {
			const triangular: TriangularTheoryScores = {
				intimacy: 0.7,
				passion: 0.7,
				commitment: 0.7,
			};
			const motivation: MotivationBalanceScores = {
				storge: 0.9,
				philia: 0.5,
				eros: 0.5,
				philautia: 0.5,
				xenia: 0.5,
				agape: 0.5,
			};
			const result = generateRecommendations(triangular, motivation);
			expect(result.some((r) => r.includes("storge"))).toBe(true);
		});
	});

	describe("evaluateRelationship", () => {
		it("should return complete relationship score", () => {
			const result = evaluateRelationship({
				context: 0.7,
				creativity: 0.7,
				consistency: 0.7,
			});

			expect(result.triangular.intimacy).toBe(0.7);
			expect(result.triangular.passion).toBe(0.7);
			expect(result.triangular.commitment).toBe(0.7);
			expect(result.loveType).toBe("consummate");
			expect(result.overall).toBeGreaterThan(0.5);
			expect(result.recommendations).toBeDefined();
		});

		it("should use default values for missing input", () => {
			const result = evaluateRelationship({});

			expect(result.triangular.intimacy).toBe(0.5);
			expect(result.triangular.passion).toBe(0.5);
			expect(result.triangular.commitment).toBe(0.5);
		});
	});

	describe("LOVE_TYPE_DESCRIPTIONS", () => {
		it("should have descriptions for all love types", () => {
			const types: LoveType[] = [
				"non-love",
				"liking",
				"infatuation",
				"empty-love",
				"romantic",
				"companionate",
				"fatuous",
				"consummate",
			];

			for (const type of types) {
				expect(LOVE_TYPE_DESCRIPTIONS[type]).toBeDefined();
				expect(LOVE_TYPE_DESCRIPTIONS[type].length).toBeGreaterThan(0);
			}
		});
	});
});
