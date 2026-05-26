/**
 * autoresearch/contractEvaluator.ts — Contract mode の acceptance evaluator。
 *
 * agent ではなく contract evaluator が keep/discard/pause を決める。
 * manual acceptance は使用不可。
 */

import type { AutoresearchContractV1, BaselineNoiseSummary, LockFile } from "./contractV1.js";
import { validateWritePaths, matchesAnyPattern } from "./contractV1.js";
import { aggregateMeasurements } from "./acceptance.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Decision = "keep" | "discard" | "pause";

export interface EvaluatorInput {
	/** The contract being evaluated against */
	contract: AutoresearchContractV1;
	/** Lock file from approval */
	lock: LockFile;
	/** Current best metric (null if no previous keep) */
	bestMetric: number | null;
	/** Candidate metric value */
	candidateMetric: number | null;
	/** Whether benchmark succeeded */
	benchmarkSucceeded: boolean;
	/** Whether benchmark timed out */
	benchmarkTimedOut: boolean;
	/** Check results: name → passed */
	checkResults: Map<string, boolean>;
	/** Changed files in working tree */
	changedFiles: string[];
	/** Whether immutable read set hash matches lock */
	immutableReadSetHashMatches: boolean;
	/** Whether contract hash matches lock */
	contractHashMatches: boolean;
	/** All metric measurements from repeats (for aggregate) */
	allMeasurements: number[];
	/** Expected number of measurements (= benchmark.repeats) */
	expectedMeasurements: number;
}

export interface EvaluatorResult {
	decision: Decision;
	reason: string;
	representativeMetric: number | null;
	improvement: number | null;
	improvementRate: number | null;
	reference: number | null;
	details: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

/**
 * Contract evaluator: determine keep/discard/pause based on contract rules.
 *
 * Evaluation priority (first hit wins):
 * 1. Contract hash mismatch → pause
 * 2. Immutable read set hash mismatch → pause
 * 3. Forbidden write paths violated → pause
 * 4. Benchmark failure → discard/pause per failurePolicy
 * 5. Required checks failed → discard/pause per failurePolicy
 * 6. Metric missing → discard/pause per failurePolicy
 * 7. Acceptance threshold check → keep/discard
 */
export function evaluateContract(input: EvaluatorInput): EvaluatorResult {
	const { contract, lock } = input;

	// 1. Contract hash mismatch
	if (!input.contractHashMatches) {
		return {
			decision: "pause",
			reason: "contract hash does not match lock file. Contract was modified after approval.",
			representativeMetric: null,
			improvement: null,
			improvementRate: null,
			reference: null,
			details: { expectedHash: lock.contractHash },
		};
	}

	// 2. Immutable read set hash mismatch (also covers rejectIfBenchmarkChanged
	//    when benchmark files are listed in immutableReadPaths)
	if (!input.immutableReadSetHashMatches) {
		if (contract.acceptance.rejectIfImmutableReadPathChanged || contract.acceptance.rejectIfBenchmarkChanged) {
			return {
				decision: "pause",
				reason: "immutableReadPaths hash changed since approval. Read-only files were modified." +
					(contract.acceptance.rejectIfBenchmarkChanged ? " (includes benchmark change detection via immutableReadPaths)" : ""),
				representativeMetric: null,
				improvement: null,
				improvementRate: null,
				reference: null,
				details: {},
			};
		}
	}

	// 3. Write path validation (allowed + forbidden)
	const writeValidation = validateWritePaths(
		input.changedFiles,
		contract.scope.allowedWritePaths,
		contract.scope.forbiddenWritePaths,
	);
	if (writeValidation.violations.length > 0) {
		const hasForbidden = contract.scope.forbiddenWritePaths.length > 0 &&
			input.changedFiles.some((f) => matchesAnyPattern(f, contract.scope.forbiddenWritePaths));
		const decision = hasForbidden ? "pause" : "discard";
		return {
			decision,
			reason: `write path violations detected: ${writeValidation.violations.join(", ")}`,
			representativeMetric: null,
			improvement: null,
			improvementRate: null,
			reference: null,
			details: { violations: writeValidation.violations },
		};
	}

	// 4. Benchmark failure
	if (!input.benchmarkSucceeded || input.benchmarkTimedOut) {
		const policy = input.benchmarkTimedOut
			? (contract.failurePolicy.onBenchmarkTimeout ?? contract.failurePolicy.onBenchmarkFailure)
			: contract.failurePolicy.onBenchmarkFailure;
		return {
			decision: policy,
			reason: input.benchmarkTimedOut
				? "benchmark timed out"
				: `benchmark failed`,
			representativeMetric: null,
			improvement: null,
			improvementRate: null,
			reference: null,
			details: { benchmarkSucceeded: input.benchmarkSucceeded, benchmarkTimedOut: input.benchmarkTimedOut },
		};
	}

	// 5. Required checks
	const requiredChecks = contract.evaluation.checks.filter((c) => c.required);
	const failedRequiredChecks: string[] = [];
	for (const check of requiredChecks) {
		if (input.checkResults.get(check.name) === false) {
			failedRequiredChecks.push(check.name);
		}
	}
	if (failedRequiredChecks.length > 0 && contract.acceptance.requireAllChecksPass) {
		return {
			decision: contract.failurePolicy.onCheckFailure,
			reason: `Required checks failed: ${failedRequiredChecks.join(", ")}`,
			representativeMetric: input.candidateMetric,
			improvement: null,
			improvementRate: null,
			reference: null,
			details: { failedRequiredChecks },
		};
	}

	// 6. Metric missing (complete or partial)
	const metricComplete = input.allMeasurements.length === input.expectedMeasurements;
	const totalMissing = input.expectedMeasurements - input.allMeasurements.length;

	if (input.candidateMetric === null || input.allMeasurements.length === 0) {
		// All repeats missing
		if (contract.acceptance.rejectIfMetricMissing) {
			return {
				decision: contract.failurePolicy.onMetricMissing,
				reason: "Primary metric not found in any repeat. Ensure stdout contains METRIC <name>=<number>.",
				representativeMetric: null,
				improvement: null,
				improvementRate: null,
				reference: null,
				details: { expectedMeasurements: input.expectedMeasurements, actualMeasurements: 0 },
			};
		}
	} else if (!metricComplete) {
		// Partial metric missing: some repeats missing metric
		if (contract.acceptance.rejectIfMetricMissing) {
			return {
				decision: contract.failurePolicy.onMetricMissing,
				reason: "Primary metric missing in " + totalMissing + " of " + input.expectedMeasurements + " repeats. " +
					"Partial measurements cannot produce a reliable aggregate.",
				representativeMetric: input.candidateMetric,
				improvement: null,
				improvementRate: null,
				reference: null,
				details: { expectedMeasurements: input.expectedMeasurements, actualMeasurements: input.allMeasurements.length, missing: totalMissing },
			};
		}
	}

	// 7. Compute aggregate metric. Never coerce an empty measurement set to 0:
	// even when rejectIfMetricMissing=false, an absent metric is not a valid score.
	const aggregateMethod = contract.evaluation.benchmark.aggregate;
	const representative = aggregateMeasurements(input.allMeasurements, aggregateMethod);
	if (representative === null) {
		return {
			decision: contract.failurePolicy.onMetricMissing,
			reason: "Primary metric not found; empty measurements cannot be evaluated as 0.",
			representativeMetric: null,
			improvement: null,
			improvementRate: null,
			reference: null,
			details: { expectedMeasurements: input.expectedMeasurements, actualMeasurements: 0 },
		};
	}

	// 8. Determine reference value. Contract v1 forbids manual acceptance;
	// if a malformed/legacy contract reaches the evaluator, pause instead of
	// silently applying threshold semantics.
	let reference: number;
	if (contract.acceptance.mode === "better_than_baseline") {
		reference = lock.baseline.primaryMetricValue;
	} else if (contract.acceptance.mode === "better_than_best") {
		reference = input.bestMetric ?? lock.baseline.primaryMetricValue;
	} else {
		return {
			decision: "pause",
			reason: `Unsupported acceptance mode for contract evaluator: ${(contract.acceptance as any).mode}`,
			representativeMetric: representative,
			improvement: null,
			improvementRate: null,
			reference: null,
			details: { acceptanceMode: (contract.acceptance as any).mode },
		};
	}

	// 9. Compute required improvement
	let requiredImprovement = contract.acceptance.minRelativeImprovement;
	if (contract.acceptance.requireImprovementAboveNoiseFloor) {
		const noiseRange = lock.baseline.noise.relativeRange;
		requiredImprovement = Math.max(requiredImprovement, noiseRange);
	}

	// 10. Check improvement
	const direction = contract.evaluation.primaryMetric.direction;
	const isImprovement =
		direction === "lower"
			? representative < reference
			: representative > reference;

	if (!isImprovement) {
		return {
			decision: "discard",
			reason: `Metric regressed or unchanged: ${representative} vs reference ${reference} (direction=${direction})`,
			representativeMetric: representative,
			improvement: null,
			improvementRate: null,
			reference,
			details: {},
		};
	}

	// Check if improvement exceeds threshold
	const improvementAbs = Math.abs(representative - reference);
	const improvementRate = reference === 0
		? (improvementAbs > 0 ? Infinity : 0)
		: improvementAbs / Math.abs(reference);

	if (improvementRate < requiredImprovement) {
		return {
			decision: "discard",
			reason: `Improvement rate ${(improvementRate * 100).toFixed(2)}% is below minimum threshold ${(requiredImprovement * 100).toFixed(2)}% . This may be noise.`,
			representativeMetric: representative,
			improvement: direction === "lower" ? reference - representative : representative - reference,
			improvementRate,
			reference,
			details: { requiredImprovement },
		};
	}

	return {
		decision: "keep",
		reason: `Metric improved: ${representative} vs reference ${reference} (Improvement rate ${(improvementRate * 100).toFixed(2)}%)`,
		representativeMetric: representative,
		improvement: direction === "lower" ? reference - representative : representative - reference,
		improvementRate,
		reference,
		details: { requiredImprovement, aggregateMethod },
	};
}
