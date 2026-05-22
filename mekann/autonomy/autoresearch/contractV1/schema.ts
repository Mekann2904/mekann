/**
 * autoresearch/contractV1/schema.ts — AutoresearchContractV1 型・TypeBox schema・validation。
 *
 * 新しい contract mode の正本。schemaVersion = "autoresearch/v1"。
 * manual acceptance は禁止。command は argv array。
 */

import { Type, Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// TypeBox schemas
// ---------------------------------------------------------------------------

const CommandSchema = Type.Object(
	{
		argv: Type.Array(Type.String(), { minItems: 1 }),
		cwd: Type.String(),
		env: Type.Optional(
			Type.Object(
				{
					allow: Type.Optional(Type.Array(Type.String())),
					set: Type.Optional(Type.Record(Type.String(), Type.String())),
				},
				{ additionalProperties: false },
			),
		),
	},
	{ additionalProperties: false },
);

const MetricLineSourceSchema = Type.Object(
	{
		type: Type.Literal("metric_line"),
		format: Type.Literal("METRIC <name>=<number>"),
		fallback: Type.Optional(Type.Union([Type.Literal("wall_clock"), Type.Literal("none")])),
		producer: Type.Optional(
			Type.Union([Type.Literal("benchmark_harness"), Type.Literal("runner")]),
		),
	},
	{ additionalProperties: false },
);

const WallClockSourceSchema = Type.Object(
	{
		type: Type.Literal("wall_clock"),
	},
	{ additionalProperties: false },
);

const PrimaryMetricSchema = Type.Object(
	{
		name: Type.String(),
		direction: Type.Union([Type.Literal("lower"), Type.Literal("higher")]),
		unit: Type.Optional(Type.String()),
		source: Type.Union([MetricLineSourceSchema, WallClockSourceSchema]),
	},
	{ additionalProperties: false },
);

const CheckSchema = Type.Object(
	{
		name: Type.String(),
		command: CommandSchema,
		timeoutSeconds: Type.Number({ minimum: 1 }),
		required: Type.Boolean(),
		visibility: Type.Optional(Type.Union([Type.Literal("agent_visible"), Type.Literal("evaluator_only")])),
		phase: Type.Optional(Type.Union([Type.Literal("pre_benchmark"), Type.Literal("post_benchmark")])),
	},
	{ additionalProperties: false },
);

const BenchmarkSchema = Type.Object(
	{
		command: CommandSchema,
		timeoutSeconds: Type.Number({ minimum: 1 }),
		repeats: Type.Number({ minimum: 1 }),
		aggregate: Type.Union([
			Type.Literal("median"),
			Type.Literal("mean"),
			Type.Literal("min"),
			Type.Literal("max"),
		]),
	},
	{ additionalProperties: false },
);

const EvaluationSchema = Type.Object(
	{
		benchmark: BenchmarkSchema,
		primaryMetric: PrimaryMetricSchema,
		checks: Type.Array(CheckSchema),
	},
	{ additionalProperties: false },
);

const AcceptanceSchema = Type.Object(
	{
		mode: Type.Union([
			Type.Literal("better_than_baseline"),
			Type.Literal("better_than_best"),
		]),
		minRelativeImprovement: Type.Number({ minimum: 0 }),
		requireImprovementAboveNoiseFloor: Type.Boolean(),
		requireAllChecksPass: Type.Boolean(),
		rejectIfMetricMissing: Type.Boolean(),
		rejectIfImmutableReadPathChanged: Type.Boolean(),
		rejectIfForbiddenFilesChanged: Type.Boolean(),
		rejectIfBenchmarkChanged: Type.Boolean(),
	},
	{ additionalProperties: false },
);

const ScopeSchema = Type.Object(
	{
		allowedWritePaths: Type.Array(Type.String()),
		forbiddenWritePaths: Type.Array(Type.String()),
		immutableReadPaths: Type.Array(Type.String()),
		requireGit: Type.Boolean(),
		requireCleanGitWorktree: Type.Boolean(),
	},
	{ additionalProperties: false },
);

const ObjectiveSchema = Type.Object(
	{
		summary: Type.String(),
		successDefinition: Type.String(),
	},
	{ additionalProperties: false },
);

const LoopSchema = Type.Object(
	{
		maxIterations: Type.Number({ minimum: 1 }),
		maxRuntimeMinutes: Type.Number({ minimum: 1 }),
		maxConsecutiveNoImprovement: Type.Number({ minimum: 0 }),
		maxConsecutiveFailures: Type.Number({ minimum: 0 }),
	},
	{ additionalProperties: false },
);

const FailurePolicySchema = Type.Object(
	{
		onBenchmarkFailure: Type.Union([Type.Literal("discard"), Type.Literal("pause")]),
		onCheckFailure: Type.Union([Type.Literal("discard"), Type.Literal("pause")]),
		onMetricMissing: Type.Union([Type.Literal("discard"), Type.Literal("pause")]),
		onContractViolation: Type.Literal("pause"),
		onRevertFailure: Type.Literal("pause"),
	},
	{ additionalProperties: false },
);

const ScalingSchema = Type.Object(
	{
		population: Type.Object(
			{
				initialHypotheses: Type.Number({ minimum: 1 }),
				candidatesPerGeneration: Type.Number({ minimum: 1 }),
				survivorsPerGeneration: Type.Number({ minimum: 0 }),
				baselineSlots: Type.Array(Type.String()),
				objectiveDerivedSlots: Type.Array(Type.String()),
			},
			{ additionalProperties: false },
		),
		roles: Type.Object(
			{
				scouts: Type.Number({ minimum: 0 }),
				proposers: Type.Number({ minimum: 0 }),
				critics: Type.Number({ minimum: 0 }),
				historians: Type.Number({ minimum: 0 }),
			},
			{ additionalProperties: false },
		),
		generation: Type.Object(
			{
				proposalMapping: Type.Literal("one_hypothesis_one_proposal"),
				evaluationOrder: Type.Literal("slot_diversity_round_robin"),
				survivorKinds: Type.Array(Type.Union([Type.Literal("candidate"), Type.Literal("hypothesis"), Type.Literal("strategy")])),
			},
			{ additionalProperties: false },
		),
		scoring: Type.Object(
			{
				method: Type.Literal("rules_with_critic_comments"),
				ranking: Type.Literal("hard_gate_then_primary_metric"),
			},
			{ additionalProperties: false },
		),
		resources: Type.Object(
			{
				respectSubagentConcurrencyLimit: Type.Boolean(),
				maxConcurrentEvaluations: Type.Number({ minimum: 1 }),
				maxActiveWorktrees: Type.Number({ minimum: 1 }),
			},
			{ additionalProperties: false },
		),
		evidence: Type.Object(
			{
				preferMechanicalEvidence: Type.Boolean(),
				recordFailedCandidates: Type.Boolean(),
				recordPatterns: Type.Array(Type.String()),
			},
			{ additionalProperties: false },
		),
		stopPolicy: Type.Object(
			{
				stopCommand: Type.Literal("/autoresearch-scale stop"),
				gracefulStopBoundary: Type.Literal("candidate"),
				internalState: Type.Literal("draining"),
				uiState: Type.Literal("graceful stopping"),
				completeMarkerBehavior: Type.Literal("record_exploration_exhaustion"),
			},
			{ additionalProperties: false },
		),
	},
	{ additionalProperties: false },
);

export const AutoresearchContractV1Schema = Type.Object(
	{
		schemaVersion: Type.Literal("autoresearch/v1"),
		mode: Type.Optional(Type.Literal("test_time_scaling")),
		objective: ObjectiveSchema,
		scope: ScopeSchema,
		evaluation: EvaluationSchema,
		acceptance: AcceptanceSchema,
		loop: LoopSchema,
		failurePolicy: FailurePolicySchema,
		scaling: Type.Optional(ScalingSchema),
	},
	{ additionalProperties: false },
);

export type AutoresearchContractV1 = Static<typeof AutoresearchContractV1Schema>;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ContractV1ValidationResult {
	valid: boolean;
	errors: string[];
	warnings: string[];
}

/**
 * Validate a value against AutoresearchContractV1Schema.
 * Returns all TypeBox validation errors as human-readable strings.
 * Also adds semantic validations beyond schema.
 */
export function validateContractV1(value: unknown): ContractV1ValidationResult {
	const errors: string[] = [];
	const warnings: string[] = [];

	// TypeBox structural validation
	const tbErrors = [...Value.Errors(AutoresearchContractV1Schema, value)];
	for (const err of tbErrors) {
		errors.push((err.path || "/") + ": " + err.message);
	}

	// Semantic validation (only if structural validation passed)
	if (errors.length === 0) {
		const contract = value as AutoresearchContractV1;

		// Reject manual acceptance mode (this is already enforced by the schema union,
		// but double-check for clarity)
		if ((contract.acceptance as any).mode === "manual") {
			errors.push("acceptance.mode: manual は autoresearch/v1 contract で禁止されています");
		}

		// Scaling mode requires the supervisor policy to be present, and the
		// policy is meaningful only in scaling mode.
		if ((contract as any).mode === "test_time_scaling" && !(contract as any).scaling) {
			errors.push("mode=test_time_scaling requires scaling supervisor policy");
		}
		if ((contract as any).scaling && (contract as any).mode !== "test_time_scaling") {
			errors.push("scaling supervisor policy requires mode=test_time_scaling");
		}

		// Warn if no checks defined
		if (contract.evaluation.checks.length === 0) {
			warnings.push("checks が空です。benchmark の妥当性検証なしで実験が進みます。");
		}

		// Warn if single repeat with wall_clock
		if (
			contract.evaluation.benchmark.repeats === 1 &&
			contract.evaluation.primaryMetric.source.type === "wall_clock"
		) {
			warnings.push(
				"wall_clock 指標を単発測定しています。ノイズが大きい場合、repeats ≥ 3 と aggregate='median' を推奨します。",
			);
		}

		// Warn if minRelativeImprovement is 0
		if (contract.acceptance.minRelativeImprovement === 0) {
			warnings.push(
				"minRelativeImprovement=0: わずかな改善でも accept されます。ノイズに注意してください。",
			);
		}

		if (contract.acceptance.mode === "better_than_best") {
			warnings.push(
				"acceptance.mode=better_than_best is experimental in contract v1/P1. " +
				"Prefer better_than_baseline for P0 contract mode unless best-metric ledger recovery is acceptable.",
			);
		}

		// Check command argv safety
		const allCommands = [
			contract.evaluation.benchmark.command,
			...contract.evaluation.checks.map((c) => c.command),
		];
		for (const cmd of allCommands) {
			for (const arg of cmd.argv) {
				// Reject shell metacharacters in argv (should not contain shell expansion)
				if (new RegExp(String.fromCharCode(96) + "$").test(arg) && cmd.argv.length === 1) {
					warnings.push(
						"command argv contains shell-like characters in single-element argv: \"" + arg + "\". " +
						"argv execution does not expand shell variables.",
					);
				}
			}
		}

		// Validate path patterns
		const allPatterns = [
			...contract.scope.allowedWritePaths,
			...contract.scope.forbiddenWritePaths,
			...contract.scope.immutableReadPaths,
		];
		for (const p of allPatterns) {
			if (p.includes("..")) {
				errors.push('path pattern "' + p + '" contains ".." (path traversal rejected)');
			}
			if (path.isAbsolute(p)) {
				errors.push('path pattern "' + p + '" is absolute (must be relative to repo root)');
			}
		}

		// rejectIfBenchmarkChanged requires benchmark/fixture paths in immutableReadPaths
		if (contract.acceptance.rejectIfBenchmarkChanged) {
			if (contract.scope.immutableReadPaths.length === 0) {
				errors.push(
					"rejectIfBenchmarkChanged=true requires non-empty immutableReadPaths. " +
					"Add benchmark-related files to immutableReadPaths for drift detection.",
				);
			} else {
				const hasBenchmarkImmutablePath = contract.scope.immutableReadPaths.some((p) => {
					const normalized = p.replace(/\\/g, "/");
					return normalized.startsWith("benchmark/") || normalized.startsWith("benchmarks/") ||
						normalized.startsWith("fixtures/") || normalized.startsWith("test/fixtures/");
				});
				if (!hasBenchmarkImmutablePath) {
					errors.push(
						"rejectIfBenchmarkChanged=true requires benchmark or fixture paths in immutableReadPaths " +
						"(for example: benchmarks/**, benchmark/**, fixtures/**, test/fixtures/**).",
					);
				}
			}
		}
	}

	return {
		valid: errors.length === 0,
		errors,
		warnings,
	};
}
