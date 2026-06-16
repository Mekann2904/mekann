/**
 * Feature audit tests — ContractEvaluator acceptance threshold boundaries.
 *
 * Validates AR-08-T1 and AR-08-T2 from the feature list:
 * - 2% min improvement, direction=lower
 * - baseline 100ms → 98ms (2% improvement) → keep
 * - baseline 100ms → 99.5ms (0.5% improvement) → discard
 */

import { describe, expect, it } from "vitest";
import { evaluateContract, type EvaluatorInput } from "./contractEvaluator.js";
import { type AutoresearchContractV1, type LockFile } from "./contractV1.js";

function makeContract(overrides: Partial<AutoresearchContractV1> = {}): AutoresearchContractV1 {
	return {
		schemaVersion: "autoresearch/v1",
		objective: { summary: "test", successDefinition: "test" },
		scope: {
			allowedWritePaths: ["src/"],
			forbiddenWritePaths: [],
			immutableReadPaths: [],
			requireGit: true,
			requireCleanGitWorktree: true,
		},
		evaluation: {
			benchmark: {
				command: { argv: ["echo", "METRIC x=1"], cwd: "." },
				timeoutSeconds: 10,
				repeats: 1,
				aggregate: "median",
			},
			primaryMetric: {
				name: "total_ms",
				direction: "lower",
				source: { type: "metric_line", format: "METRIC <name>=<number>" },
			},
			checks: [],
		},
		acceptance: {
			mode: "better_than_baseline",
			minRelativeImprovement: 0.02, // 2%
			requireImprovementAboveNoiseFloor: false,
			requireAllChecksPass: true,
			rejectIfMetricMissing: true,
			rejectIfImmutableReadPathChanged: true,
			rejectIfForbiddenFilesChanged: true,
			rejectIfBenchmarkChanged: true,
		},
		loop: {
			maxIterations: 10,
			maxRuntimeMinutes: 30,
			maxConsecutiveNoImprovement: 3,
			maxConsecutiveFailures: 2,
		},
		failurePolicy: {
			onBenchmarkFailure: "discard",
			onCheckFailure: "discard",
			onMetricMissing: "discard",
			onContractViolation: "pause",
			onRevertFailure: "pause",
		},
		...overrides,
	} as AutoresearchContractV1;
}

function makeLock(baselineValue: number): LockFile {
	return {
		schemaVersion: "autoresearch-lock/v1",
		contractId: "threshold-test",
		contractHash: "sha256:test",
		approvedAt: Date.now(),
		approvedBy: "user",
		baseline: {
			gitCommit: "abc",
			runs: [{ runId: "r1", metric: baselineValue, durationSeconds: 1 }],
			aggregate: "median",
			primaryMetricValue: baselineValue,
			noise: {
				samples: [baselineValue],
				aggregate: baselineValue,
				min: baselineValue,
				max: baselineValue,
				mean: baselineValue,
				stddev: 0,
				relativeRange: 0,
			},
		},
		environment: {
			platform: "test",
			arch: "test",
			nodeVersion: "test",
			npmVersion: "test",
			timezone: "UTC",
			packageJsonHash: "sha256:none",
			packageLockHash: "sha256:none",
			immutableReadSetHash: "sha256:immutable",
		},
	};
}

function makeInput(overrides: Partial<EvaluatorInput> = {}): EvaluatorInput {
	const contract = makeContract();
	const lock = makeLock(100); // baseline = 100ms
	return {
		contract,
		lock,
		bestMetric: null,
		candidateMetric: 95,
		benchmarkSucceeded: true,
		benchmarkTimedOut: false,
		checkResults: new Map(),
		changedFiles: ["src/a.ts"],
		immutableReadSetHashMatches: true,
		contractHashMatches: true,
		allMeasurements: [95],
		expectedMeasurements: 1,
		...overrides,
	};
}

describe("AR-08: acceptance threshold boundary tests", () => {
	// AR-08-T1: baseline 100ms → 98ms (2% improvement) → keep
	it("AR-08-T1: keeps at exactly 2% improvement (100 → 98)", () => {
		const input = makeInput({
			candidateMetric: 98,
			allMeasurements: [98],
		});
		const result = evaluateContract(input);
		expect(result.decision).toBe("keep");
		expect(result.representativeMetric).toBe(98);
		expect(result.improvementRate).toBeCloseTo(0.02, 2);
	});

	// AR-08-T2: baseline 100ms → 99.5ms (0.5% improvement) → discard
	it("AR-08-T2: discards at 0.5% improvement (100 → 99.5)", () => {
		const input = makeInput({
			candidateMetric: 99.5,
			allMeasurements: [99.5],
		});
		const result = evaluateContract(input);
		expect(result.decision).toBe("discard");
		expect(result.reason).toContain("below minimum threshold");
	});

	// Boundary: exactly at 0% improvement (no change)
	it("discards at 0% improvement (100 → 100)", () => {
		const input = makeInput({
			candidateMetric: 100,
			allMeasurements: [100],
		});
		const result = evaluateContract(input);
		expect(result.decision).toBe("discard");
	});

	// Boundary: slight improvement but below threshold
	it("discards at 1.9% improvement (100 → 98.1)", () => {
		const input = makeInput({
			candidateMetric: 98.1,
			allMeasurements: [98.1],
		});
		const result = evaluateContract(input);
		expect(result.decision).toBe("discard");
	});

	// Direction=higher: baseline 100 → 102 (2% improvement)
	it("keeps at exactly 2% improvement in higher direction (100 → 102)", () => {
		const contract = makeContract({
			evaluation: {
				...makeContract().evaluation,
				primaryMetric: {
					name: "throughput",
					direction: "higher",
					source: { type: "metric_line", format: "METRIC <name>=<number>" },
				},
			},
		});
		const input = makeInput({
			contract,
			candidateMetric: 102,
			allMeasurements: [102],
		});
		const result = evaluateContract(input);
		expect(result.decision).toBe("keep");
	});

	// better_than_best mode: best=98, candidate=96 (2.04% improvement)
	it("better_than_best: keeps at just above 2% improvement vs best", () => {
		const contract = makeContract({
			acceptance: {
				...makeContract().acceptance,
				mode: "better_than_best",
			},
		});
		const input = makeInput({
			contract,
			bestMetric: 98,
			candidateMetric: 96, // 96/98 = 2.04% improvement
			allMeasurements: [96],
		});
		const result = evaluateContract(input);
		expect(result.decision).toBe("keep");
	});

	// better_than_best: best=98, candidate=96.5 (1.53% improvement)
	it("better_than_best: discards at 1.53% improvement vs best", () => {
		const contract = makeContract({
			acceptance: {
				...makeContract().acceptance,
				mode: "better_than_best",
			},
		});
		const input = makeInput({
			contract,
			bestMetric: 98,
			candidateMetric: 96.5,
			allMeasurements: [96.5],
		});
		const result = evaluateContract(input);
		expect(result.decision).toBe("discard");
	});

	// Regression: baseline 100 → 110 (worse)
	it("discards regression (100 → 110)", () => {
		const input = makeInput({
			candidateMetric: 110,
			allMeasurements: [110],
		});
		const result = evaluateContract(input);
		expect(result.decision).toBe("discard");
		expect(result.reason).toContain("regressed");
	});

	// Large improvement: baseline 100 → 50 (50% improvement)
	it("keeps large improvement (100 → 50)", () => {
		const input = makeInput({
			candidateMetric: 50,
			allMeasurements: [50],
		});
		const result = evaluateContract(input);
		expect(result.decision).toBe("keep");
		expect(result.improvementRate).toBeCloseTo(0.5, 1);
	});

	// contract v1 forbids manual mode; malformed legacy values should pause.
	it("manual mode pauses as unsupported contract mode", () => {
		const contract = makeContract({
			acceptance: {
				...makeContract().acceptance,
				mode: "manual",
			},
		});
		const input = makeInput({
			contract,
			candidateMetric: 90,
			allMeasurements: [90],
		});
		const result = evaluateContract(input);
		expect(result.decision).toBe("pause");
		expect(result.reason).toContain("Unsupported acceptance mode");
	});
});
