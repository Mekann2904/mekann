/**
 * autoresearch/acceptance.test.ts — Acceptance Policy のテスト。
 */

import { describe, it, expect } from "vitest";
import {
	evaluateAcceptance,
	aggregateMeasurements,
	calculateImprovement,
	type AcceptanceInput,
} from "./acceptance.js";

describe("acceptance module", () => {
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

	// ── Acceptance evaluation ───────────────────────────────

	describe("evaluateAcceptance", () => {
		const basePolicy = { mode: "better_than_best" as const, minImprovement: 0, repeat: 1, aggregate: "single" as const };

		it("accepts first measurement as baseline", () => {
			const result = evaluateAcceptance({
				candidateMetric: 100, bestMetric: null, direction: "lower", policy: basePolicy,
			});
			expect(result.accepted).toBe(true);
			expect(result.representativeMetric).toBe(100);
		});

		it("accepts improvement in lower direction", () => {
			const result = evaluateAcceptance({
				candidateMetric: 80, bestMetric: 100, direction: "lower", policy: basePolicy,
			});
			expect(result.accepted).toBe(true);
			expect(result.representativeMetric).toBe(80);
		});

		it("rejects regression in lower direction", () => {
			const result = evaluateAcceptance({
				candidateMetric: 120, bestMetric: 100, direction: "lower", policy: basePolicy,
			});
			expect(result.accepted).toBe(false);
			expect(result.reason).toContain("悪化");
		});

		it("accepts improvement in higher direction", () => {
			const result = evaluateAcceptance({
				candidateMetric: 120, bestMetric: 100, direction: "higher", policy: basePolicy,
			});
			expect(result.accepted).toBe(true);
		});

		it("rejects regression in higher direction", () => {
			const result = evaluateAcceptance({
				candidateMetric: 80, bestMetric: 100, direction: "higher", policy: basePolicy,
			});
			expect(result.accepted).toBe(false);
		});

		it("rejects no change", () => {
			const result = evaluateAcceptance({
				candidateMetric: 100, bestMetric: 100, direction: "lower", policy: basePolicy,
			});
			expect(result.accepted).toBe(false);
		});

		it("applies minImprovement threshold", () => {
			const policy = { ...basePolicy, minImprovement: 0.05 }; // 5% minimum
			// 2% improvement → rejected
			const r1 = evaluateAcceptance({
				candidateMetric: 98, bestMetric: 100, direction: "lower", policy,
			});
			expect(r1.accepted).toBe(false);
			expect(r1.reason).toContain("閾値");

			// 6% improvement → accepted
			const r2 = evaluateAcceptance({
				candidateMetric: 94, bestMetric: 100, direction: "lower", policy,
			});
			expect(r2.accepted).toBe(true);
		});

		it("manual mode always accepts", () => {
			const policy = { ...basePolicy, mode: "manual" as const };
			const result = evaluateAcceptance({
				candidateMetric: 120, bestMetric: 100, direction: "lower", policy,
			});
			expect(result.accepted).toBe(true);
			expect(result.reason).toContain("manual");
		});

		it("uses aggregated value with multiple measurements", () => {
			const policy = { ...basePolicy, aggregate: "median" as const, repeat: 3 };
			// Median of [90, 80, 70] = 80 → improvement over 100
			const result = evaluateAcceptance({
				candidateMetric: 80, bestMetric: 100, direction: "lower", policy,
				allMeasurements: [90, 80, 70],
			});
			expect(result.accepted).toBe(true);
			expect(result.representativeMetric).toBe(80);
		});

		it("uses aggregated value that may differ from candidateMetric", () => {
			const policy = { ...basePolicy, aggregate: "median" as const };
			// Median of [120, 80, 70] = 80 → improvement
			const result = evaluateAcceptance({
				candidateMetric: 120, bestMetric: 100, direction: "lower", policy,
				allMeasurements: [120, 80, 70],
			});
			expect(result.accepted).toBe(true);
			expect(result.representativeMetric).toBe(80);
		});
	});
});
