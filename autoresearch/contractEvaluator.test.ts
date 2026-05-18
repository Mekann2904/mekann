/**
 * autoresearch/contractEvaluator.test.ts - Contract evaluator tests.
 */

import { describe, it, expect } from "vitest";
import { evaluateContract, type EvaluatorInput } from "./contractEvaluator.js";
import { type AutoresearchContractV1, type LockFile } from "./contractV1.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeContract(overrides: Partial<AutoresearchContractV1> = {}): AutoresearchContractV1 {
	return {
		schemaVersion: "autoresearch/v1",
		objective: { summary: "test", successDefinition: "test" },
		scope: {
			allowedWritePaths: [],
			forbiddenWritePaths: [".env"],
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
				name: "x",
				direction: "lower",
				source: { type: "metric_line", format: "METRIC <name>=<number>" },
			},
			checks: [],
		},
		acceptance: {
			mode: "better_than_baseline",
			minRelativeImprovement: 0.02,
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

function makeLock(baselineValue = 100): LockFile {
	return {
		schemaVersion: "autoresearch-lock/v1",
		contractId: "0001",
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
	const lock = makeLock(100);
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
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("contractEvaluator", () => {
	describe("contract hash mismatch", () => {
		it("pauses when contract hash does not match lock", () => {
			const input = makeInput({ contractHashMatches: false });
			const result = evaluateContract(input);
			expect(result.decision).toBe("pause");
			expect(result.reason).toContain("contract hash");
		});
	});

	describe("immutable read paths", () => {
		it("pauses when immutable read paths hash changed", () => {
			const contract = makeContract({
				scope: {
					...makeContract().scope,
					immutableReadPaths: ["package.json"],
				},
			});
			const input = makeInput({ contract, immutableReadSetHashMatches: false });
			const result = evaluateContract(input);
			expect(result.decision).toBe("pause");
			expect(result.reason).toContain("immutableReadPaths");
		});
	});

	describe("write path validation", () => {
		it("pauses when forbidden files changed", () => {
			const contract = makeContract({
				scope: {
					...makeContract().scope,
					allowedWritePaths: ["src/"],
					forbiddenWritePaths: [".env"],
				},
			});
			const input = makeInput({ contract, changedFiles: [".env"] });
			const result = evaluateContract(input);
			expect(result.decision).toBe("pause");
			expect(result.reason).toContain("forbidden");
		});

		it("discards when file outside allowedWritePaths changed", () => {
			const contract = makeContract({
				scope: {
					...makeContract().scope,
					allowedWritePaths: ["src/"],
					forbiddenWritePaths: [],
				},
			});
			const input = makeInput({ contract, changedFiles: ["lib/outside.ts"] });
			const result = evaluateContract(input);
			expect(result.decision).toBe("discard");
			expect(result.reason).toContain("write path violations");
		});

		it("allows files within allowedWritePaths", () => {
			const contract = makeContract({
				scope: {
					...makeContract().scope,
					allowedWritePaths: ["src/"],
					forbiddenWritePaths: [],
				},
			});
			const input = makeInput({
				contract,
				changedFiles: ["src/index.ts"],
				candidateMetric: 90,
				allMeasurements: [90],
			});
			const result = evaluateContract(input);
			expect(result.decision).toBe("keep");
		});
	});

	describe("benchmark failure", () => {
		it("discards when benchmark fails and policy is discard", () => {
			const input = makeInput({ benchmarkSucceeded: false });
			const result = evaluateContract(input);
			expect(result.decision).toBe("discard");
			expect(result.reason).toContain("benchmark");
		});

		it("pauses when benchmark fails and policy is pause", () => {
			const contract = makeContract({
				failurePolicy: {
					...makeContract().failurePolicy,
					onBenchmarkFailure: "pause",
				},
			});
			const input = makeInput({ contract, benchmarkSucceeded: false });
			const result = evaluateContract(input);
			expect(result.decision).toBe("pause");
		});

		it("discards when benchmark times out", () => {
			const input = makeInput({ benchmarkTimedOut: true });
			const result = evaluateContract(input);
			expect(result.decision).toBe("discard");
			expect(result.reason).toContain("timed out");
		});
	});

	describe("checks", () => {
		it("discards when required checks fail and policy is discard", () => {
			const contract = makeContract({
				evaluation: {
					...makeContract().evaluation,
					checks: [{
						name: "typecheck",
						command: { argv: ["tsc"], cwd: "." },
						timeoutSeconds: 60,
						required: true,
					}],
				},
			});
			const checkResults = new Map([["typecheck", false]]);
			const input = makeInput({ contract, checkResults });
			const result = evaluateContract(input);
			expect(result.decision).toBe("discard");
			expect(result.reason).toContain("typecheck");
		});

		it("does not fail when required checks pass", () => {
			const contract = makeContract({
				evaluation: {
					...makeContract().evaluation,
					checks: [{
						name: "typecheck",
						command: { argv: ["tsc"], cwd: "." },
						timeoutSeconds: 60,
						required: true,
					}],
				},
			});
			const checkResults = new Map([["typecheck", true]]);
			const input = makeInput({ contract, checkResults, candidateMetric: 90, allMeasurements: [90] });
			const result = evaluateContract(input);
			expect(result.decision).toBe("keep");
		});
	});

	describe("metric missing", () => {
		it("discards when metric is missing and policy is discard", () => {
			const input = makeInput({ candidateMetric: null, allMeasurements: [] });
			const result = evaluateContract(input);
			expect(result.decision).toBe("discard");
			expect(result.reason).toContain("Primary metric");
		});
	});

	describe("acceptance threshold", () => {
		it("keeps when improvement exceeds threshold", () => {
			const input = makeInput({
				candidateMetric: 90,
				allMeasurements: [90],
			});
			const result = evaluateContract(input);
			expect(result.decision).toBe("keep");
			expect(result.representativeMetric).toBe(90);
			expect(result.improvementRate).toBeCloseTo(0.1, 1); // 10% improvement
		});

		it("discards when improvement is below threshold", () => {
			const input = makeInput({
				candidateMetric: 99,
				allMeasurements: [99],
			});
			const result = evaluateContract(input);
			expect(result.decision).toBe("discard");
			expect(result.reason).toContain("below minimum threshold");
		});

		it("discards when metric regresses", () => {
			const input = makeInput({
				candidateMetric: 110,
				allMeasurements: [110],
			});
			const result = evaluateContract(input);
			expect(result.decision).toBe("discard");
			expect(result.reason).toContain("regressed");
		});

		it("uses baseline noise when requireImprovementAboveNoiseFloor is true", () => {
			const lock = makeLock(100);
			lock.baseline.noise.relativeRange = 0.1; // 10% noise
			const contract = makeContract({
				acceptance: {
					...makeContract().acceptance,
					minRelativeImprovement: 0.02,
					requireImprovementAboveNoiseFloor: true,
				},
			});
			// 8% improvement > 2% minThreshold but < 10% noise
			const input = makeInput({
				contract,
				lock,
				candidateMetric: 92,
				allMeasurements: [92],
			});
			const result = evaluateContract(input);
			expect(result.decision).toBe("discard");
			expect(result.reason).toContain("below minimum threshold");

			// 15% improvement > 10% noise
			const input2 = makeInput({
				contract,
				lock,
				candidateMetric: 85,
				allMeasurements: [85],
			});
			const result2 = evaluateContract(input2);
			expect(result2.decision).toBe("keep");
		});

		it("better_than_best uses best metric as reference", () => {
			const contract = makeContract({
				acceptance: {
					...makeContract().acceptance,
					mode: "better_than_best",
				},
			});
			// best metric is 95, baseline is 100
			const input = makeInput({
				contract,
				bestMetric: 95,
				candidateMetric: 90,
				allMeasurements: [90],
			});
			const result = evaluateContract(input);
			expect(result.decision).toBe("keep");
			// improvement is 90 vs 95 = 5.26%
			expect(result.reference).toBe(95);
		});

		it("better_than_best falls back to baseline when no best", () => {
			const contract = makeContract({
				acceptance: {
					...makeContract().acceptance,
					mode: "better_than_best",
				},
			});
			const input = makeInput({
				contract,
				bestMetric: null,
				candidateMetric: 90,
				allMeasurements: [90],
			});
			const result = evaluateContract(input);
			expect(result.decision).toBe("keep");
			expect(result.reference).toBe(100); // baseline
		});
	});

	describe("higher direction", () => {
		it("keeps when higher metric improves", () => {
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
				candidateMetric: 110,
				allMeasurements: [110],
			});
			const result = evaluateContract(input);
			expect(result.decision).toBe("keep");
		});
	});

	describe("does not accept agent-provided keep status", () => {
		it("decision is always from evaluator, not from agent", () => {
			// The evaluator never takes input from agent about keep/discard.
			// It always computes the decision from contract rules.
			const input = makeInput({
				candidateMetric: 99, // below threshold
				allMeasurements: [99],
			});
			const result = evaluateContract(input);
			// Even though the agent might want to keep, the evaluator says discard
			expect(result.decision).toBe("discard");
		});
	});

	describe("aggregate methods", () => {
		it("computes median from multiple measurements", () => {
			const contract = makeContract({
				evaluation: {
					...makeContract().evaluation,
					benchmark: {
						...makeContract().evaluation.benchmark,
						aggregate: "median",
						repeats: 3,
					},
				},
			});
			const input = makeInput({
				contract,
				allMeasurements: [90, 92, 94], // median = 92
			});
			const result = evaluateContract(input);
			expect(result.decision).toBe("keep");
			expect(result.representativeMetric).toBe(92);
		});
	});
});
