import { describe, it, expect } from "vitest";
import {
	analyzeWithSixHats,
	detectThinkingBias,
	recommendThinkingMode,
	generateThinkingPrompt,
	THINKING_MODES,
	type ThinkingInsight,
	type ThinkingBiasResult,
} from "../../lib/love-thinking-modes.js";

describe("love-thinking-modes", () => {
	describe("THINKING_MODES", () => {
		it("should have six thinking modes", () => {
			expect(Object.keys(THINKING_MODES).length).toBe(6);
		});

		it("should have all required properties for each mode", () => {
			for (const [mode, info] of Object.entries(THINKING_MODES)) {
				expect(info.name).toBeDefined();
				expect(info.description).toBeDefined();
				expect(info.focusQuestions).toBeInstanceOf(Array);
				expect(info.cognitiveStyle).toBeDefined();
				expect(["system1", "system2", "integrated"]).toContain(
					info.systemType,
				);
			}
		});
	});

	describe("analyzeWithSixHats", () => {
		it("should return analysis results with all six hats", () => {
			const result = analyzeWithSixHats("ユーザーとの対話");

			expect(result.factualInsights.length).toBeGreaterThan(0);
			expect(result.emotionalInsights.length).toBeGreaterThan(0);
			expect(result.criticalInsights.length).toBeGreaterThan(0);
			expect(result.optimisticInsights.length).toBeGreaterThan(0);
			expect(result.creativeInsights.length).toBeGreaterThan(0);
			expect(result.integrativeInsights.length).toBeGreaterThan(0);
		});

		it("should include bias detection", () => {
			const result = analyzeWithSixHats("ユーザーとの対話");

			expect(result.biasDetection).toBeDefined();
			expect(result.biasDetection.system1Ratio).toBeGreaterThanOrEqual(0);
			expect(result.biasDetection.system1Ratio).toBeLessThanOrEqual(1);
			expect(result.biasDetection.system2Ratio).toBeGreaterThanOrEqual(0);
			expect(result.biasDetection.system2Ratio).toBeLessThanOrEqual(1);
		});

		it("should include synthesis", () => {
			const result = analyzeWithSixHats("ユーザーとの対話");

			expect(result.synthesis).toBeDefined();
			expect(result.synthesis.length).toBeGreaterThan(0);
		});

		it("should include known facts in factual insights when provided", () => {
			const result = analyzeWithSixHats("ユーザーとの対話", {
				overallScore: 0.75,
				loveType: "consummate",
			});

			const hasScoreInsight = result.factualInsights.some((i) =>
				i.insight.includes("75.0%"),
			);
			expect(hasScoreInsight).toBe(true);
		});
	});

	describe("detectThinkingBias", () => {
		it("should detect system2 bias when system2 ratio is high", () => {
			const insights: ThinkingInsight[] = [
				{
					mode: "white",
					modeName: "事実の思考帽",
					insight: "test",
					systemType: "system2",
				},
				{
					mode: "white",
					modeName: "事実の思考帽",
					insight: "test",
					systemType: "system2",
				},
				{
					mode: "white",
					modeName: "事実の思考帽",
					insight: "test",
					systemType: "system2",
				},
				{
					mode: "red",
					modeName: "感情の思考帽",
					insight: "test",
					systemType: "system1",
				},
			];

			const result = detectThinkingBias(insights);

			expect(result.system2Ratio).toBe(0.75);
			expect(result.detectedBiases.length).toBeGreaterThan(0);
			expect(
				result.detectedBiases.some((b) => b.includes("分析的思考")),
			).toBe(true);
		});

		it("should detect system1 bias when system1 ratio is high", () => {
			const insights: ThinkingInsight[] = [
				{
					mode: "red",
					modeName: "感情の思考帽",
					insight: "test",
					systemType: "system1",
				},
				{
					mode: "red",
					modeName: "感情の思考帽",
					insight: "test",
					systemType: "system1",
				},
				{
					mode: "yellow",
					modeName: "楽観の思考帽",
					insight: "test",
					systemType: "system1",
				},
				{
					mode: "white",
					modeName: "事実の思考帽",
					insight: "test",
					systemType: "system2",
				},
			];

			const result = detectThinkingBias(insights);

			expect(result.system1Ratio).toBe(0.75);
			expect(result.detectedBiases.length).toBeGreaterThan(0);
			expect(
				result.detectedBiases.some((b) => b.includes("直観的思考")),
			).toBe(true);
		});

		it("should detect lack of integrated thinking", () => {
			const insights: ThinkingInsight[] = [
				{
					mode: "white",
					modeName: "事実の思考帽",
					insight: "test",
					systemType: "system2",
				},
				{
					mode: "red",
					modeName: "感情の思考帽",
					insight: "test",
					systemType: "system1",
				},
			];

			const result = detectThinkingBias(insights);

			expect(result.integratedRatio).toBe(0);
			expect(
				result.detectedBiases.some((b) => b.includes("統合的思考")),
			).toBe(true);
		});

		it("should recommend adjustment when bias is detected", () => {
			const insights: ThinkingInsight[] = [
				{
					mode: "white",
					modeName: "事実の思考帽",
					insight: "test",
					systemType: "system2",
				},
				{
					mode: "white",
					modeName: "事実の思考帽",
					insight: "test",
					systemType: "system2",
				},
				{
					mode: "white",
					modeName: "事実の思考帽",
					insight: "test",
					systemType: "system2",
				},
				{
					mode: "red",
					modeName: "感情の思考帽",
					insight: "test",
					systemType: "system1",
				},
			];

			const result = detectThinkingBias(insights);

			expect(result.recommendedAdjustments.length).toBeGreaterThan(0);
		});
	});

	describe("recommendThinkingMode", () => {
		it("should recommend red mode when system2 bias is high", () => {
			const bias: ThinkingBiasResult = {
				system1Ratio: 0.2,
				system2Ratio: 0.7,
				integratedRatio: 0.1,
				detectedBiases: [],
				recommendedAdjustments: [],
			};

			expect(recommendThinkingMode(bias)).toBe("red");
		});

		it("should recommend black mode when system1 bias is high", () => {
			const bias: ThinkingBiasResult = {
				system1Ratio: 0.7,
				system2Ratio: 0.2,
				integratedRatio: 0.1,
				detectedBiases: [],
				recommendedAdjustments: [],
			};

			expect(recommendThinkingMode(bias)).toBe("black");
		});

		it("should recommend green mode when integrated thinking is low", () => {
			const bias: ThinkingBiasResult = {
				system1Ratio: 0.45,
				system2Ratio: 0.45,
				integratedRatio: 0.1,
				detectedBiases: [],
				recommendedAdjustments: [],
			};

			expect(recommendThinkingMode(bias)).toBe("green");
		});

		it("should recommend blue mode when thinking is balanced", () => {
			const bias: ThinkingBiasResult = {
				system1Ratio: 0.4,
				system2Ratio: 0.4,
				integratedRatio: 0.2,
				detectedBiases: [],
				recommendedAdjustments: [],
			};

			expect(recommendThinkingMode(bias)).toBe("blue");
		});
	});

	describe("generateThinkingPrompt", () => {
		it("should generate prompt for each mode", () => {
			for (const mode of Object.keys(THINKING_MODES) as Array<
				keyof typeof THINKING_MODES
			>) {
				const prompt = generateThinkingPrompt(
					mode,
					"テスト文脈",
				);

				expect(prompt).toContain(THINKING_MODES[mode].name);
				expect(prompt).toContain(THINKING_MODES[mode].cognitiveStyle);
				expect(prompt).toContain("テスト文脈");
			}
		});

		it("should include focus questions in the prompt", () => {
			const prompt = generateThinkingPrompt("white", "テスト文脈");

			expect(prompt).toContain("どのようなデータがあるか？");
		});

		it("should include system type information", () => {
			const prompt1 = generateThinkingPrompt("red", "テスト文脈");
			const prompt2 = generateThinkingPrompt("white", "テスト文脈");
			const prompt3 = generateThinkingPrompt("green", "テスト文脈");

			expect(prompt1).toContain("直観的・感情的");
			expect(prompt2).toContain("分析的・論理的");
			expect(prompt3).toContain("統合的");
		});
	});
});
