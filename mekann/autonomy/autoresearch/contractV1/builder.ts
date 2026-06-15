/**
 * autoresearch/contractV1/builder.ts — init パラメータから AutoresearchContractV1 を構築する builder。
 *
 * `autoresearch_init` が契約を組み立てるために使う。plan.ts が生成するデフォルト契約と
 * 同じ V1 shape になり、`.autoresearch/plans/<planId>/contract.json` に保存される。
 *
 * legacy `buildContract` (ExperimentContract) は廃止済み。本関数が V1 側の唯一の組み立て API。
 *
 * legacy init params から V1 へのマッピング規則:
 * - acceptanceMode: legacy は manual / improvement_threshold を許可したが、V1 schema は
 *   better_than_baseline | better_than_best のみ。manual/improvement_threshold は V1 の
 *   妥当なモードに正規化する(manual → better_than_best、improvement_threshold → better_than_baseline)。
 * - aggregate: legacy は "single" を持つが V1 は持たない。single は repeats=1 と同義なので
 *   median に正規化する(1 サンプルの median はその値)。
 * - benchmarkCommand: V1 contract の benchmark.command.argv は plan.ts と同じく
 *   ["bash", "./autoresearch.sh"] とし、実際の benchmark ロジックは benchmark.sh に書かれる。
 *   指定された benchmarkCommand string は benchmark.sh の中身を生成するために layout に渡される
 *   (benchmarkScript 経由)。これにより init と plan の実行モデルが一致する。
 */

import type { AutoresearchContractV1 } from "./schema.js";

// ---------------------------------------------------------------------------
// Public params (V1-native。legacy init params を V1 に寄せた形)
// ---------------------------------------------------------------------------

export type V1AcceptanceMode = "better_than_baseline" | "better_than_best";
export type LegacyAcceptanceMode = "manual" | "improvement_threshold";
export type InitAcceptanceMode = V1AcceptanceMode | LegacyAcceptanceMode;
export type V1Aggregate = "median" | "mean" | "min" | "max";
export type MetricMethod = "wall_clock" | "stdout_metric" | "report_file";
export type ChecksMode = "script" | "command" | "none";

export interface InitContractV1Params {
	name: string;
	metricName: string;
	metricUnit: string;
	direction: "lower" | "higher";
	metricMethod: MetricMethod;
	/** benchmark.sh の中身用 raw command string。argv ではなく layout の benchmarkScript に埋め込まれる */
	benchmarkCommand: string;
	objective?: string;
	checksMode?: ChecksMode;
	checksCommand?: string;
	acceptanceMode?: InitAcceptanceMode;
	minImprovement?: number;
	repeat?: number;
	aggregate?: V1Aggregate;
	requireGit?: boolean;
	requireCleanBaseline?: boolean;
	allowedPaths?: string[];
	excludedPaths?: string[];
}

// ---------------------------------------------------------------------------
// Defaults (plan.ts と整合)
// ---------------------------------------------------------------------------

export const DEFAULT_V1_ACCEPTANCE: AutoresearchContractV1["acceptance"] = {
	mode: "better_than_baseline",
	minRelativeImprovement: 0.02,
	requireImprovementAboveNoiseFloor: true,
	requireAllChecksPass: true,
	rejectIfMetricMissing: true,
	rejectIfImmutableReadPathChanged: true,
	rejectIfForbiddenFilesChanged: true,
	rejectIfBenchmarkChanged: true,
};

export const DEFAULT_V1_LOOP: AutoresearchContractV1["loop"] = {
	maxIterations: 50,
	maxRuntimeMinutes: 120,
	maxConsecutiveNoImprovement: 3,
	maxConsecutiveFailures: 2,
};

export const DEFAULT_V1_FAILURE_POLICY: AutoresearchContractV1["failurePolicy"] = {
	onBenchmarkFailure: "discard",
	onCheckFailure: "discard",
	onMetricMissing: "discard",
	onContractViolation: "pause",
	onRevertFailure: "pause",
};

export const DEFAULT_V1_SCOPE: Pick<
	AutoresearchContractV1["scope"],
	"allowedWritePaths" | "forbiddenWritePaths" | "immutableReadPaths" | "requireGit" | "requireCleanGitWorktree"
> = {
	allowedWritePaths: ["src/**", "tests/**", "lib/**"],
	forbiddenWritePaths: [
		"autoresearch.sh", "checks.sh", "benchmarks/**", "benchmark/**",
		"fixtures/**", "test/fixtures/**", "package-lock.json",
		"pnpm-lock.yaml", "yarn.lock",
	],
	immutableReadPaths: [
		"autoresearch.sh", "checks.sh", "package.json", "package-lock.json",
		"pnpm-lock.yaml", "yarn.lock", "benchmarks/**", "benchmark/**",
		"fixtures/**", "test/fixtures/**",
	],
	requireGit: true,
	requireCleanGitWorktree: true,
};

const DEFAULT_BENCHMARK_TIMEOUT_SECONDS = 600;
const DEFAULT_CHECK_TIMEOUT_SECONDS = 300;

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/**
 * Normalize a legacy acceptance mode into a V1-valid mode.
 * - manual → better_than_best (loosest V1 mode)
 * - improvement_threshold → better_than_baseline (threshold semantics)
 * - already V1-valid modes pass through
 */
export function normalizeAcceptanceMode(mode: InitAcceptanceMode | string | undefined): V1AcceptanceMode {
	if (mode === "better_than_best") return "better_than_best";
	if (mode === "better_than_baseline") return "better_than_baseline";
	// legacy manual は「agent の判断を信頼する = 最も緩い」のため better_than_best に正規化。
	// legacy improvement_threshold / undefined / unknown は baseline 比較が妥当なので better_than_baseline。
	if (mode === "manual") return "better_than_best";
	return "better_than_baseline";
}

/**
 * Normalize a legacy aggregate method into a V1-valid aggregate.
 * - "single" → "median" (single sample; median of 1 = the value)
 * - already V1-valid aggregates pass through
 */
export function normalizeAggregate(method: string | undefined): V1Aggregate {
	if (method === "mean" || method === "min" || method === "max") return method;
	return "median";
}

/**
 * init パラメータから AutoresearchContractV1 を構築する。
 */
export function buildContractV1(params: InitContractV1Params): AutoresearchContractV1 {
	const acceptanceMode = normalizeAcceptanceMode(params.acceptanceMode);
	const aggregate = normalizeAggregate(params.aggregate);
	const repeats = params.repeat && params.repeat >= 1 ? Math.floor(params.repeat) : 3;
	const minRelativeImprovement =
		typeof params.minImprovement === "number" && params.minImprovement >= 0
			? params.minImprovement
			: DEFAULT_V1_ACCEPTANCE.minRelativeImprovement;

	const requireGit = params.requireGit ?? DEFAULT_V1_SCOPE.requireGit;
	const requireCleanGitWorktree = params.requireCleanBaseline ?? DEFAULT_V1_SCOPE.requireCleanGitWorktree;

	// metric source: wall_clock は専用 source、それ以外は metric_line
	const source: AutoresearchContractV1["evaluation"]["primaryMetric"]["source"] =
		params.metricMethod === "wall_clock"
			? { type: "wall_clock" }
			: { type: "metric_line", format: "METRIC <name>=<number>", fallback: "wall_clock" };

	// checks: script/command モードなら checks.sh を実行する単一 check、none なら空
	const checksMode = params.checksMode ?? "script";
	const checks: AutoresearchContractV1["evaluation"]["checks"] =
		checksMode === "none"
			? []
			: [{
				name: "default-checks",
				command: { argv: ["bash", "./checks.sh"], cwd: "." },
				timeoutSeconds: DEFAULT_CHECK_TIMEOUT_SECONDS,
				required: true,
			}];

	return {
		schemaVersion: "autoresearch/v1",
		objective: {
			summary: params.objective ?? params.name,
			successDefinition: `${params.metricName} improves in ${params.direction} direction`,
		},
		scope: {
			// init フロー: ユーザが明示的に指定しない限り全許可 (legacy DEFAULT_SAFETY.allowedPaths=[] と整合)。
			// plan.ts (contract mode) は厳格なデフォルト (src/** 等) を使うが、init は緩いデフォルトが適切。
			allowedWritePaths: params.allowedPaths ?? [],
			forbiddenWritePaths: params.excludedPaths ?? [],
			immutableReadPaths: DEFAULT_V1_SCOPE.immutableReadPaths,
			requireGit,
			requireCleanGitWorktree,
		},
		evaluation: {
			benchmark: {
				command: { argv: ["bash", "./autoresearch.sh"], cwd: "." },
				timeoutSeconds: DEFAULT_BENCHMARK_TIMEOUT_SECONDS,
				repeats,
				aggregate,
			},
			primaryMetric: {
				name: params.metricName,
				direction: params.direction,
				unit: params.metricUnit || undefined,
				source,
			},
			checks,
		},
		acceptance: {
			...DEFAULT_V1_ACCEPTANCE,
			mode: acceptanceMode,
			minRelativeImprovement,
		},
		loop: { ...DEFAULT_V1_LOOP },
		failurePolicy: { ...DEFAULT_V1_FAILURE_POLICY },
	};
}
