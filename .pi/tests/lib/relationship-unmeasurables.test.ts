import { describe, it, expect } from "vitest";
import {
	createMeasurabilityWarning,
	UNMEASURABLE_VALUES,
	SCHIZOANALYTIC_SELF_QUESTIONS,
	LOVE_ETHICS_APORIAS,
	type MeasurabilityWarning,
} from "../../lib/relationship-unmeasurables.js";

describe("relationship-unmeasurables", () => {
	describe("createMeasurabilityWarning", () => {
		it("should always return commodification_of_desire warning", () => {
			const result = createMeasurabilityWarning(0.3);
			expect(
				result.some((w) => w.type === "commodification_of_desire"),
			).toBe(true);
		});

		it("should return self-surveillance and territorialization warnings for high scores", () => {
			const result = createMeasurabilityWarning(0.9);
			expect(result.some((w) => w.type === "self-surveillance")).toBe(true);
			expect(result.some((w) => w.type === "territorialization")).toBe(true);
		});

		it("should return reduction_of_complexity warning for medium scores", () => {
			const result = createMeasurabilityWarning(0.6);
			expect(
				result.some((w) => w.type === "reduction_of_complexity"),
			).toBe(true);
		});

		it("should not return reduction_of_complexity for low scores", () => {
			const result = createMeasurabilityWarning(0.3);
			expect(
				result.some((w) => w.type === "reduction_of_complexity"),
			).toBe(false);
		});

		it("should include schizoanalytic implication and suggested attitude", () => {
			const result = createMeasurabilityWarning(0.8);
			for (const warning of result) {
				expect(warning.message).toBeDefined();
				expect(warning.schizoanalyticImplication).toBeDefined();
				expect(warning.suggestedAttitude).toBeDefined();
			}
		});
	});

	describe("UNMEASURABLE_VALUES", () => {
		it("should have momentThatResistsMeasurement values", () => {
			expect(UNMEASURABLE_VALUES.momentThatResistsMeasurement.length).toBeGreaterThan(0);
		});

		it("should have linesOfFlight values", () => {
			expect(UNMEASURABLE_VALUES.linesOfFlight.length).toBeGreaterThan(0);
		});

		it("should have productivityOfDesire questions", () => {
			expect(UNMEASURABLE_VALUES.productivityOfDesire.length).toBeGreaterThan(0);
		});
	});

	describe("SCHIZOANALYTIC_SELF_QUESTIONS", () => {
		it("should have three categories", () => {
			expect(SCHIZOANALYTIC_SELF_QUESTIONS.length).toBe(3);
		});

		it("should include desire self-analysis category", () => {
			expect(
				SCHIZOANALYTIC_SELF_QUESTIONS.some(
					(q) => q.category === "欲望の自己分析",
				),
			).toBe(true);
		});

		it("should include deterritorialization category", () => {
			expect(
				SCHIZOANALYTIC_SELF_QUESTIONS.some(
					(q) => q.category === "脱領土化の確認",
				),
			).toBe(true);
		});

		it("should include inner fascism detection category", () => {
			expect(
				SCHIZOANALYTIC_SELF_QUESTIONS.some(
					(q) => q.category === "内なるファシズムの検出",
				),
			).toBe(true);
		});

		it("should have questions in each category", () => {
			for (const category of SCHIZOANALYTIC_SELF_QUESTIONS) {
				expect(category.questions.length).toBeGreaterThan(0);
			}
		});
	});

	describe("LOVE_ETHICS_APORIAS", () => {
		it("should have three aporias", () => {
			expect(LOVE_ETHICS_APORIAS.length).toBe(3);
		});

		it("should include measurability aporia", () => {
			expect(
				LOVE_ETHICS_APORIAS.some(
					(a) => a.pole1 === "測定可能性" && a.pole2 === "測定不可能性",
				),
			).toBe(true);
		});

		it("should include self-improvement aporia", () => {
			expect(
				LOVE_ETHICS_APORIAS.some(
					(a) => a.pole1 === "自己改善" && a.pole2 === "自己受容",
				),
			).toBe(true);
		});

		it("should include relationship quality aporia", () => {
			expect(
				LOVE_ETHICS_APORIAS.some(
					(a) => a.pole1 === "関係性の質" && a.pole2 === "関係性の自然さ",
				),
			).toBe(true);
		});

		it("should have tension and attitude for each aporia", () => {
			for (const aporia of LOVE_ETHICS_APORIAS) {
				expect(aporia.pole1).toBeDefined();
				expect(aporia.pole2).toBeDefined();
				expect(aporia.tension).toBeDefined();
				expect(aporia.attitude).toBeDefined();
			}
		});
	});
});
