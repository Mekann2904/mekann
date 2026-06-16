/**
 * autoresearch/acceptance.test.ts — V1 Acceptance Policy のテスト。
 *
 * V1 acceptance shape (better_than_baseline | better_than_best + minRelativeImprovement)
 * に基づく acceptance 評価を検証する。manual/improvement_threshold は V1 schema で禁止済み。
 */

import { describe, it, expect } from "vitest";
import {
	evaluateAcceptance,
	aggregateMeasurements,
	calculateImprovement,
	DEFAULT_V1_ACCEPTANCE,
	type AcceptanceInput,
} from "./acceptance.js";

function v1Policy(overrides?: Partial<typeof DEFAULT_V1_ACCEPTANCE>): typeof DEFAULT_V1_ACCEPTANCE {
	return { ...DEFAULT_V1_ACCEPTANCE, ...overrides };
}

describe("acceptance module (V1)", () => {
	// ── Aggregation ─────────────────────────────────────────

	describe("aggregateMeasurements", () => {
		it("returns single value for single-element array", () => {
			expect(aggregateMeasurements([42], "single")).toBe(42);
			expect(aggregateMeasurements([42], "median")).toBe(42);
			expect(aggregateMeasurements([42], "mean")).toBe(42);
		});

		it("computes median for odd-length arrays", () => {
			expect(aggregateMeasurements([1, 3, 5], "median")).toBe(3);
			expect(aggregateMeasurements([5, 1, 3], "median")).toBe(3);
		});

		it("computes median for even-length arrays", () => {
			expect(aggregateMeasurements([1, 2, 3, 4], "median")).toBe(2.5);
		});

		it("computes mean", () => {
			expect(aggregateMeasurements([1, 2, 3], "mean")).toBeCloseTo(2);
			expect(aggregateMeasurements([10, 20, 30], "mean")).toBeCloseTo(20);
		});

		it("computes min", () => {
			expect(aggregateMeasurements([5, 1, 3], "min")).toBe(1);
		});

		it("computes max", () => {
			expect(aggregateMeasurements([5, 1, 3], "max")).toBe(5);
		});

		it("returns null for empty array", () => {
			expect(aggregateMeasurements([], "median")).toBeNull();
		});
	});

	// ── Improvement calculation ─────────────────────────────

	describe("calculateImprovement", () => {
		it("returns Infinity improvementRate for first measurement", () => {
			const result = calculateImprovement(100, null, "lower");
			expect(result.improvement).toBe(0);
			expect(result.improvementRate).toBe(Infinity);
		});

		it("calculates improvement for lower direction", () => {
			const result = calculateImprovement(80, 100, "lower");
			expect(result.improvement).toBe(20);
			expect(result.improvementRate).toBeCloseTo(0.2);
		});

		it("calculates regression for lower direction", () => {
			const result = calculateImprovement(120, 100, "lower");
			expect(result.improvement).toBe(-20);
			expect(result.improvementRate).toBeCloseTo(-0.2);
		});

		it("calculates improvement for higher direction", () => {
			const result = calculateImprovement(120, 100, "higher");
			expect(result.improvement).toBe(20);
			expect(result.improvementRate).toBeCloseTo(0.2);
		});

		it("calculates regression for higher direction", () => {
			const result = calculateImprovement(80, 100, "higher");
			expect(result.improvement).toBe(-20);
			expect(result.improvementRate).toBeCloseTo(-0.2);
		});
	});

	// ── Acceptance evaluation (V1) ─────────────────────────

	describe("evaluateAcceptance", () => {
		const baselinePolicy = v1Policy({ mode: "better_than_baseline", minRelativeImprovement: 0 });

		it("accepts first measurement when reference is null (baseline establishment)", () => {
			const input: AcceptanceInput = {
				candidateMetric: 100, bestMetric: null, baselineMetric: null,
				direction: "lower", policy: baselinePolicy,
			};
			const result = evaluateAcceptance(input);
			expect(result.accepted).toBe(true);
			expect(result.representativeMetric).toBe(100);
		});

		it("accepts improvement in lower direction (better_than_baseline)", () => {
			const input: AcceptanceInput = {
				candidateMetric: 80, bestMetric: null, baselineMetric: 100,
				direction: "lower", policy: baselinePolicy,
			};
			const result = evaluateAcceptance(input);
			expect(result.accepted).toBe(true);
			expect(result.representativeMetric).toBe(80);
		});

		it("rejects regression in lower direction", () => {
			const input: AcceptanceInput = {
				candidateMetric: 120, bestMetric: null, baselineMetric: 100,
				direction: "lower", policy: baselinePolicy,
			};
			const result = evaluateAcceptance(input);
			expect(result.accepted).toBe(false);
			expect(result.reason).toContain("悪化");
		});

		it("accepts improvement in higher direction", () => {
			const input: AcceptanceInput = {
				candidateMetric: 120, bestMetric: null, baselineMetric: 100,
				direction: "higher", policy: baselinePolicy,
			};
			const result = evaluateAcceptance(input);
			expect(result.accepted).toBe(true);
		});

		it("rejects regression in higher direction", () => {
			const input: AcceptanceInput = {
				candidateMetric: 80, bestMetric: null, baselineMetric: 100,
				direction: "higher", policy: baselinePolicy,
			};
			const result = evaluateAcceptance(input);
			expect(result.accepted).toBe(false);
		});

		it("rejects no change", () => {
			const input: AcceptanceInput = {
				candidateMetric: 100, bestMetric: null, baselineMetric: 100,
				direction: "lower", policy: baselinePolicy,
			};
			const result = evaluateAcceptance(input);
			expect(result.accepted).toBe(false);
		});

		it("applies minRelativeImprovement threshold", () => {
			const policy = v1Policy({ mode: "better_than_baseline", minRelativeImprovement: 0.05 });
			// 2% improvement → rejected
			const r1 = evaluateAcceptance({
				candidateMetric: 98, bestMetric: null, baselineMetric: 100,
				direction: "lower", policy,
			});
			expect(r1.accepted).toBe(false);
			expect(r1.reason).toContain("閾値");

			// 6% improvement → accepted
			const r2 = evaluateAcceptance({
				candidateMetric: 94, bestMetric: null, baselineMetric: 100,
				direction: "lower", policy,
			});
			expect(r2.accepted).toBe(true);
		});

		it("better_than_best uses bestMetric as reference when available", () => {
			const policy = v1Policy({ mode: "better_than_best", minRelativeImprovement: 0 });
			const result = evaluateAcceptance({
				candidateMetric: 80, bestMetric: 90, baselineMetric: 100,
				direction: "lower", policy,
			});
			expect(result.accepted).toBe(true);
		});

		it("better_than_best falls back to baseline when best is null", () => {
			const policy = v1Policy({ mode: "better_than_best", minRelativeImprovement: 0 });
			const result = evaluateAcceptance({
				candidateMetric: 90, bestMetric: null, baselineMetric: 100,
				direction: "lower", policy,
			});
			expect(result.accepted).toBe(true);
		});

		it("requireImprovementAboveNoiseFloor adds noise to threshold", () => {
			const policy = v1Policy({
				mode: "better_than_baseline",
				minRelativeImprovement: 0.02,
				requireImprovementAboveNoiseFloor: true,
			});
			// noise=0.10 → required=0.10。3% improvement → rejected (below noise floor)
			const r1 = evaluateAcceptance({
				candidateMetric: 97, bestMetric: null, baselineMetric: 100,
				direction: "lower", policy, baselineNoiseRelativeRange: 0.10,
			});
			expect(r1.accepted).toBe(false);
			// 12% improvement → accepted (above noise floor 0.10)
			const r2 = evaluateAcceptance({
				candidateMetric: 88, bestMetric: null, baselineMetric: 100,
				direction: "lower", policy, baselineNoiseRelativeRange: 0.10,
			});
			expect(r2.accepted).toBe(true);
		});

		// C-007 regression: evaluateAcceptance は input.aggregate に従う(以前は "single" hardcode だった)。
		it("respects aggregate method when multiple measurements are provided (C-007)", () => {
			const policy = v1Policy({ mode: "better_than_baseline", minRelativeImprovement: 0 });
			// [100, 30, 30] の single(values[0]=100) と median(sorted [30,30,100]→30) は異なる。
			const result = evaluateAcceptance({
				candidateMetric: 100, bestMetric: null, baselineMetric: 100,
				direction: "lower", policy,
				allMeasurements: [100, 30, 30],
				aggregate: "median",
			});
			// median=30 が baseline 100 を下回るため改善 = accepted
			expect(result.representativeMetric).toBe(30);
			expect(result.accepted).toBe(true);
		});

		it("defaults to single (first measurement) when aggregate is omitted", () => {
			const policy = v1Policy({ mode: "better_than_baseline", minRelativeImprovement: 0 });
			const result = evaluateAcceptance({
				candidateMetric: 100, bestMetric: null, baselineMetric: 200,
				direction: "lower", policy,
				allMeasurements: [100, 50, 50],
				// aggregate 省略 → "single" → values[0] = 100
			});
			expect(result.representativeMetric).toBe(100);
			expect(result.accepted).toBe(true);
		});
	});
});
