/**
 * autoresearch_approve ツールハンドラの execute body。
 * index.ts から抽出された contract 承認・baseline 測定ロジック。
 */

import * as fs from "node:fs";
import * as crypto from "node:crypto";

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

import type { ToolResponse, SessionStore } from "./sessionStore.js";
import {
	validateContractV1,
	extractContractBlockFromPlan,
	parseJsonc,
	computeContractHash,
	computeImmutableReadSetHash,
	collectEnvironmentFingerprint,
	computeBaselineNoise,
	writeCurrentContract,
	writeLockFile,
	currentContractPath,
	currentLockPath,
	planPath,
	ensureAutoresearchDir,
	appendEvent,
	validateCommandSafety,
	resolveCwdInsideRepo,
	checkPhase,
	type AutoresearchContractV1,
	type LockFile,
} from "../contractV1.js";
import { isGitRepo, getBaselineCommit } from "../git.js";
import { runArgvCommand, generatePiRunId } from "../runner.js";
import { readState as readStateV2, writeState as writeStateV2 } from "../layout.js";
import { isWorkingTreeCleanForContract, getContractRelevantChangedFiles, resolvePrimaryMetricFromRun, runContractChecksForPhase, validateContractPreconditions } from "./sharedHelpers.js";

// ─── Params type ──────────────────────────────────────────────

export type ApproveParams = { plan_path?: string };

// ─── Execute ──────────────────────────────────────────────────

export async function executeApprove(
    store: SessionStore,
    params: ApproveParams,
    signal: any,
    ctx: ExtensionContext,
    deps: {
        sessionDir: (cwd: string, sid: string) => string;
        eventsLedgerPath: (cwd: string, sid: string) => string;
    },
): Promise<ToolResponse> {
	const pp = params.plan_path ?? planPath(ctx.cwd);
	if (!fs.existsSync(pp)) {
		return store.textResponse(`[ERROR] plan file が見つかりません: ${pp}\n先に autoresearch_plan で plan を生成してください。`);
	}

	const planMarkdown = fs.readFileSync(pp, "utf8");

	let jsonc: string;
	try {
		const block = extractContractBlockFromPlan(planMarkdown);
		jsonc = block.jsonc;
	} catch (e) {
		return store.textResponse(`[ERROR] contract block の抽出に失敗: ${e instanceof Error ? e.message : String(e)}`);
	}

	let contractObj: unknown;
	try {
		contractObj = parseJsonc(jsonc);
	} catch (e) {
		return store.textResponse(`[ERROR] JSONC の parse に失敗: ${e instanceof Error ? e.message : String(e)}`);
	}

	const validation = validateContractV1(contractObj);
	if (!validation.valid) {
		return store.textDetails(`[ERROR] contract の検証に失敗:\n${validation.errors.map((e, i) => `  ${i + 1}. ${e}`).join("\n")}`, { errors: validation.errors });
	}

	const contract = contractObj as AutoresearchContractV1;

	const allCommands = [
		contract.evaluation.benchmark.command,
		...contract.evaluation.checks.map((c) => c.command),
	];
	for (const cmd of allCommands) {
		if (!cmd.argv || cmd.argv.length === 0) {
			return store.textResponse(`[ERROR] command.argv が空です: ${JSON.stringify(cmd)}`);
		}
	}

	// Command safety validation
	const safetyErrors = validateCommandSafety(allCommands, ctx.cwd);
	if (safetyErrors.length > 0) {
		return store.textDetails(`[ERROR] command safety validation failed:\n${safetyErrors.map((e, i) => `  ${i + 1}. ${e}`).join("\n")}`, { safetyErrors });
	}

	const precondError = validateContractPreconditions(contract, ctx.cwd, store);
	if (precondError) {
		return store.textResponse(`[ERROR] ${precondError}`);
	}
	if (contract.scope.requireCleanGitWorktree && !isWorkingTreeCleanForContract(ctx.cwd)) {
		const relevantChangedFiles = getContractRelevantChangedFiles(ctx.cwd);
		return store.textDetails(`[ERROR] working tree に contract-relevant な未コミット変更があります。contract で requireCleanGitWorktree=true が指定されています。\n対象: ${relevantChangedFiles.join(", ")}\n先に commit または stash してください。`, { changedFiles: relevantChangedFiles });
	}

	const contractHash = computeContractHash(contract);
	// Collision-resistant contractId: Date.now() + contractHash prefix + a
	// cryptographic random suffix. Two concurrent approves in the same
	// millisecond previously collided on the `Date.now()`-`hash8` prefix
	// (IC-180); the random suffix makes parallel collision negligible.
	const contractId = `contract-${Date.now()}-${contractHash.slice(7, 15)}-${crypto.randomBytes(4).toString("hex")}`;
	ensureAutoresearchDir(ctx.cwd);

	function logEvent(event: string, details: Record<string, unknown> = {}): void {
		appendEvent(ctx.cwd, { timestamp: Date.now(), contractId, contractHash, event, details });
	}

	logEvent("approve_started");

	const immutableResult = await computeImmutableReadSetHash(
		ctx.cwd,
		contract.scope.immutableReadPaths,
	);

	const envFingerprint = await collectEnvironmentFingerprint(
		ctx.cwd,
		immutableResult.hash,
	);

	const preCheckResults = await runContractChecksForPhase(contract, "pre_benchmark", ctx.cwd, signal,
		(name, phase, passed, exitCode, timedOut) => {
			logEvent("baseline_check_completed", { name, phase, exitCode, passed, timedOut });
			const check = contract.evaluation.checks.find((c) => c.name === name);
			if (check?.required && !passed) return store.textDetails(`[ERROR] baseline ${phase} check failed: ${name}`, { check: name, phase, exitCode, timedOut });
			return undefined as unknown as void;
		},
	);
	// Check required failures
	for (const [name, passed] of preCheckResults) {
		const check = contract.evaluation.checks.find((c) => c.name === name);
		if (check?.required && !passed) return store.textDetails(`[ERROR] baseline pre_benchmark check failed: ${name}`, { check: name, phase: "pre_benchmark" });
	}

	const baselineCommand = contract.evaluation.benchmark.command;
	const benchmarkCwd = resolveCwdInsideRepo(ctx.cwd, baselineCommand.cwd);
	const baselineRuns: Array<{ runId: string; metric: number; durationSeconds: number }> = [];

	for (let i = 0; i < contract.evaluation.benchmark.repeats; i++) {
		const runId = generatePiRunId(ctx.cwd);
		const runResult = await runArgvCommand(
			{ argv: baselineCommand.argv, cwd: benchmarkCwd, env: baselineCommand.env },
			contract.evaluation.benchmark.timeoutSeconds * 1000,
			signal,
		);

		// --- P0: Reject baseline on failure/timeout ---
		if (!runResult.passed || runResult.timedOut) {
			logEvent("baseline_run_failed", { runIndex: i, runId, exitCode: runResult.exitCode, timedOut: runResult.timedOut });
			return store.textDetails(`[ERROR] baseline run ${i + 1}/${contract.evaluation.benchmark.repeats} failed.${runResult.timedOut ? " Timed out." : ""} exitCode=${runResult.exitCode}\nBaseline cannot be established from failed benchmark. Fix the benchmark command and retry.`, { runIndex: i, exitCode: runResult.exitCode, timedOut: runResult.timedOut });
		}

		const metricValue = resolvePrimaryMetricFromRun(contract.evaluation.primaryMetric, runResult);

		// --- P0: Reject when metric missing unless explicit wall_clock fallback ---
		if (metricValue === null) {
			const source = contract.evaluation.primaryMetric.source;
			const hasWallClockFallback = source.type === "metric_line" && source.fallback === "wall_clock";
			const isWallClock = source.type === "wall_clock";
			if (!hasWallClockFallback && !isWallClock) {
				logEvent("baseline_metric_missing", { runIndex: i, runId, metricName: contract.evaluation.primaryMetric.name });
				return store.textDetails(`[ERROR] Primary metric "${contract.evaluation.primaryMetric.name}" not found in baseline run ${i + 1}.\nMetric source is "${source.type}" with no wall_clock fallback.\nEnsure the benchmark outputs METRIC ${contract.evaluation.primaryMetric.name}=<number> to stdout.`, { metricName: contract.evaluation.primaryMetric.name, sourceType: source.type });
			}
		}

		baselineRuns.push({ runId, metric: metricValue ?? runResult.durationSeconds, durationSeconds: runResult.durationSeconds });
		logEvent("baseline_run_completed", { runIndex: i, runId, exitCode: runResult.exitCode, metric: metricValue, durationSeconds: runResult.durationSeconds, timedOut: runResult.timedOut });
	}

	const postCheckResults = await runContractChecksForPhase(contract, "post_benchmark", ctx.cwd, signal,
		(name, phase, passed, exitCode, timedOut) => logEvent("baseline_check_completed", { name, phase, exitCode, passed, timedOut }),
	);
	const allCheckResults = new Map([...preCheckResults, ...postCheckResults]);
	// Check required failures in post-benchmark
	for (const [name, passed] of postCheckResults) {
		const check = contract.evaluation.checks.find((c) => c.name === name);
		if (check?.required && !passed) return store.textDetails(`[ERROR] baseline post_benchmark check failed: ${name}`, { check: name, phase: "post_benchmark" });
	}

	const immutableAfterBaseline = await computeImmutableReadSetHash(
		ctx.cwd,
		contract.scope.immutableReadPaths,
	);
	if (immutableAfterBaseline.hash !== immutableResult.hash) {
		logEvent("baseline_immutable_drift", { before: immutableResult.hash, after: immutableAfterBaseline.hash });
		return store.textDetails(`[ERROR] baseline benchmark mutated immutableReadPaths.\nBenchmark/read-only files changed during approve; fix the benchmark harness before locking the contract.`, { beforeHash: immutableResult.hash, afterHash: immutableAfterBaseline.hash, warnings: immutableAfterBaseline.warnings });
	}

	const postBaselineChangedFiles = getContractRelevantChangedFiles(ctx.cwd);
	if (postBaselineChangedFiles.length > 0) {
		logEvent("baseline_dirty_worktree", { changedFiles: postBaselineChangedFiles });
		return store.textDetails(`[ERROR] baseline benchmark created contract-relevant dirty files.\n対象: ${postBaselineChangedFiles.join(", ")}\nFix the benchmark so approve leaves the candidate worktree clean.`, { changedFiles: postBaselineChangedFiles });
	}

	const baselineMetrics = baselineRuns.map((r) => r.metric);
	const noise = computeBaselineNoise(baselineMetrics, contract.evaluation.benchmark.aggregate);
	const gitCommit = getBaselineCommit(ctx.cwd) ?? "unknown";

	const lock: LockFile = {
		schemaVersion: "autoresearch-lock/v1",
		contractId,
		contractHash,
		approvedAt: Date.now(),
		approvedBy: "user",
		baseline: {
			gitCommit,
			runs: baselineRuns,
			aggregate: contract.evaluation.benchmark.aggregate,
			primaryMetricValue: noise.aggregate,
			noise,
		},
		environment: envFingerprint,
	};

	writeCurrentContract(ctx.cwd, contract);
	writeLockFile(ctx.cwd, lock);

	// Initialize in-memory state for contract mode
	store.state.name = contract.objective.summary ?? store.state.name;
	store.state.metricName = contract.evaluation.primaryMetric.name;
	store.state.metricUnit = contract.evaluation.primaryMetric.unit ?? "";
	store.state.direction = contract.evaluation.primaryMetric.direction;
	store.state.bestMetric = null;
	store.state.runCount = 0;

	// Persist contract-mode state for candidate escrow and run_contract recovery.
	try {
		writeStateV2(ctx.cwd, {
			...readStateV2(ctx.cwd),
			currentPlanId: undefined,
			currentPlanDir: undefined,
			latestRunId: undefined,
			bestRunId: undefined,
			bestMetric: undefined,
			runCount: 0,
			currentContractHash: contractHash,
		});
	} catch {
		/* best effort for legacy contract-mode state */
	}

	logEvent("approve_completed", { baselineValue: noise.aggregate, noiseRange: noise.relativeRange, samples: noise.samples.length, checkResults: Object.fromEntries(allCheckResults) });

	let text = `[OK] contract を承認し、baseline を測定しました\n`;
	text += `\n### Baseline\n`;
	text += `aggregate (${contract.evaluation.benchmark.aggregate}): ${noise.aggregate.toFixed(4)}\n`;
	text += `samples: ${noise.samples.length}\n`;
	text += `min: ${noise.min.toFixed(4)}\n`;
	text += `max: ${noise.max.toFixed(4)}\n`;
	text += `mean: ${noise.mean.toFixed(4)}\n`;
	text += `stddev: ${noise.stddev.toFixed(4)}\n`;
	text += `relativeRange: ${(noise.relativeRange * 100).toFixed(2)}%\n`;
	text += `\n### Files\n`;
	text += `contract: ${currentContractPath(ctx.cwd)}\n`;
	text += `lock: ${currentLockPath(ctx.cwd)}\n`;
	text += `\n### Acceptance\n`;
	text += `mode: ${contract.acceptance.mode}\n`;
	text += `minRelativeImprovement: ${(contract.acceptance.minRelativeImprovement * 100).toFixed(1)}%\n`;
	if (contract.acceptance.requireImprovementAboveNoiseFloor) {
		const effective = Math.max(contract.acceptance.minRelativeImprovement, noise.relativeRange);
		text += `effective threshold (with noise floor): ${(effective * 100).toFixed(2)}%\n`;
	}
	if (validation.warnings.length > 0) {
		text += `\n### Warnings\n`;
		for (const w of validation.warnings) text += `- ${w}\n`;
	}
	if (immutableResult.warnings.length > 0) {
		text += `\n### Immutable Read Set Warnings\n`;
		for (const w of immutableResult.warnings) text += `- ${w}\n`;
	}
	text += `\nautoresearch_run_contract で実験を開始できます。`;

	return store.textDetails(text, { contractPath: currentContractPath(ctx.cwd), lockPath: currentLockPath(ctx.cwd), baseline: noise, contractHash, gitCommit });
}
