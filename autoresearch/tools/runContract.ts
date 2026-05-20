/**
 * autoresearch_run_contract ツールハンドラの execute body。
 * index.ts から抽出された contract mode 実験実行ロジック。
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
	computeContractHash,
	computeImmutableReadSetHash,
	readCurrentContract,
	readLockFile,
	appendEvent,
	appendDecision,
	appendContractRun,
	appendContractMetric,
	filterInternalPaths,
	resolveCwdInsideRepo,
	checkVisibility,
	checkPhase,
	type AutoresearchContractV1,
} from "../contractV1.js";
import { isGitRepo } from "../contract.js";
import { aggregateMeasurements } from "../acceptance.js";
import { evaluateContract, type EvaluatorInput } from "../contractEvaluator.js";
import {
	runArgvCommand,
	getGitShortHash,
	gitAutoCommit,
	gitAutoRevert,
	getChangedFiles,
} from "../runner.js";
import { assertCandidateReadyForRun, candidateChangedFiles, candidateDiffIdentityHash, candidateDir, candidateEvaluationCwd, readCandidate, removeCandidateWorktree, replayCandidateToMain, updateCandidateStatus } from "../candidate.js";
import { SubagentResultStore } from "../../subagent/resultStore.js";
import { isBestMetric } from "../state.js";
import { appendToJsonl, type RunsLedgerEntry } from "../state.js";
import { readState as readStateV2, writeState as writeStateV2 } from "../layout.js";
import { resolvePrimaryMetricFromRun, ensureSessionDir, nextRunSeq } from "./sharedHelpers.js";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ToolResponse, SessionStore } from "./sessionStore.js";

// ─── Params type ──────────────────────────────────────────────

export type RunContractParams = { reason?: string; iteration_label?: string; candidate_id?: string };

// ─── Execute ──────────────────────────────────────────────────

export async function executeRunContract(
    store: SessionStore,
    params: RunContractParams,
    signal: any,
    ctx: ExtensionContext,
    deps: {
        sessionDir: (cwd: string, sid: string) => string;
        eventsLedgerPath: (cwd: string, sid: string) => string;
        runsLedgerPath: (cwd: string, sid: string) => string;
        metricsLedgerPath: (cwd: string, sid: string) => string;
    },
): Promise<ToolResponse> {
	const contract: AutoresearchContractV1 | null = readCurrentContract(ctx.cwd);
	const lock = readLockFile(ctx.cwd);

	if (!contract) {
		return store.textResponse(`[ERROR] current contract が見つかりません。\n先に autoresearch_approve を実行してください。`);
	}
	if (!lock) {
		return store.textResponse(`[ERROR] lock file が見つかりません。\n先に autoresearch_approve を実行してください。`);
	}

	const currentHash = computeContractHash(contract);
	const logRunEvent = (event: string, details: Record<string, unknown> = {}): void =>
		appendEvent(ctx.cwd, { timestamp: Date.now(), contractId: lock.contractId, contractHash: currentHash, event, details });
	const contractHashMatches = currentHash === lock.contractHash;

	if (!contractHashMatches) {
		appendDecision(ctx.cwd, {
			timestamp: Date.now(),
			contractId: lock.contractId,
			contractHash: currentHash,
			decision: "pause",
			reason: "contract hash mismatch",
			metric: null,
			reference: null,
			details: { expected: lock.contractHash, actual: currentHash },
		});
		return store.textDetails(`[PAUSE] contract hash が lock と一致しません。\nexpected: ${lock.contractHash}\nactual: ${currentHash}\ncontract が承認後に変更されました。`, { decision: "pause" });
	}

	if (contract.scope.requireGit && !isGitRepo(ctx.cwd)) {
		return store.textResponse(`[ERROR] git repo ではありません。`);
	}

	let candidate = null as ReturnType<typeof readCandidate> | null;
	if (params.candidate_id) {
		try {
			candidate = assertCandidateReadyForRun(ctx.cwd, contract, lock, params.candidate_id);
			updateCandidateStatus(ctx.cwd, params.candidate_id, "evaluating");
		} catch (e) {
			try { updateCandidateStatus(ctx.cwd, params.candidate_id, "paused_dirty", { reason: e instanceof Error ? e.message : String(e) }); } catch { /* best effort */ }
			return store.textDetails(`[PAUSE] candidate precondition failed: ${e instanceof Error ? e.message : String(e)}`, { decision: "pause", candidate_id: params.candidate_id });
		}
	}

	const evaluationCwd = candidate ? candidateEvaluationCwd(ctx.cwd, candidate) : ctx.cwd;

	// Pre-check state (logged for diagnostics only)
	const preChangedFiles = getChangedFiles(evaluationCwd);

	logRunEvent("contract_run_started", { reason: params.reason, iterationLabel: params.iteration_label, candidate_id: params.candidate_id, preChangedFilesCount: preChangedFiles.length });

	// --- Run checks by phase ---
	const checkResults = new Map<string, boolean>();
	const runChecksForPhase = async (phase: "pre_benchmark" | "post_benchmark"): Promise<void> => {
		for (const check of contract.evaluation.checks.filter((c) => checkPhase(c) === phase)) {
			const checkCwd = resolveCwdInsideRepo(evaluationCwd, check.command.cwd);
			const checkResult = await runArgvCommand(
				{ argv: check.command.argv, cwd: checkCwd, env: check.command.env },
				check.timeoutSeconds * 1000,
				signal,
			);
			checkResults.set(check.name, checkResult.passed);
			logRunEvent("check_run_completed", { name: check.name, visibility: checkVisibility(check), phase, passed: checkResult.passed, exitCode: checkResult.exitCode, timedOut: checkResult.timedOut });
		}
	};
	await runChecksForPhase("pre_benchmark");

	// --- Run benchmark repeats ---
	const benchmarkCwd = resolveCwdInsideRepo(evaluationCwd, contract.evaluation.benchmark.command.cwd);
	const measurements: number[] = [];
	let benchmarkSucceeded = true;
	let benchmarkTimedOut = false;

	for (let i = 0; i < contract.evaluation.benchmark.repeats; i++) {
		const result = await runArgvCommand(
			{ argv: contract.evaluation.benchmark.command.argv, cwd: benchmarkCwd, env: contract.evaluation.benchmark.command.env },
			contract.evaluation.benchmark.timeoutSeconds * 1000,
			signal,
		);

		if (!result.passed) benchmarkSucceeded = false;
		if (result.timedOut) benchmarkTimedOut = true;

		const metricValue = resolvePrimaryMetricFromRun(contract.evaluation.primaryMetric, result);
		if (metricValue !== null) measurements.push(metricValue);

		logRunEvent("benchmark_run_completed", { runIndex: i, exitCode: result.exitCode, metric: metricValue, durationSeconds: result.durationSeconds, timedOut: result.timedOut });
	}

	await runChecksForPhase("post_benchmark");

	// --- POST state: re-check changed files and immutable hash AFTER benchmark/checks ---
	// This catches mutations made by checks or benchmark scripts.
	// Filter internal paths (.autoresearch/**, .pi/**) from changedFiles
	// since these are audit artifacts, not candidate patches.
	const changedFiles = filterInternalPaths(getChangedFiles(evaluationCwd));
	const immutableResult = await computeImmutableReadSetHash(evaluationCwd, contract.scope.immutableReadPaths);
	const immutableReadSetHashMatches = immutableResult.hash === lock.environment.immutableReadSetHash;

	logRunEvent("post_state_captured", { candidate_id: params.candidate_id, postChangedFilesCount: changedFiles.length, immutableHashMatch: immutableReadSetHashMatches });

	if (candidate) {
		const expected = [...candidate.touched_paths].sort();
		const actual = candidateChangedFiles(evaluationCwd);
		const currentDiffHash = candidateDiffIdentityHash(evaluationCwd);
		if (candidate.trial?.applied_diff_sha256 && currentDiffHash !== candidate.trial.applied_diff_sha256) {
			updateCandidateStatus(ctx.cwd, candidate.candidate_id, "paused_dirty");
			appendDecision(ctx.cwd, { timestamp: Date.now(), contractId: lock.contractId, contractHash: currentHash, decision: "pause", reason: "candidate diff identity mismatch", metric: null, reference: null, details: { candidate_id: candidate.candidate_id, expected: candidate.trial.applied_diff_sha256, actual: currentDiffHash } });
			return store.textDetails(`[PAUSE] candidate diff identity mismatch`, { decision: "pause", candidate_id: candidate.candidate_id });
		}
		if (JSON.stringify(expected) !== JSON.stringify(actual)) {
			updateCandidateStatus(ctx.cwd, candidate.candidate_id, "paused_dirty");
			appendDecision(ctx.cwd, {
				timestamp: Date.now(), contractId: lock.contractId, contractHash: currentHash,
				decision: "pause", reason: "candidate changed files mismatch", metric: null, reference: null,
				details: { candidate_id: candidate.candidate_id, expected, actual },
			});
			return store.textDetails(`[PAUSE] candidate changed files mismatch\nexpected: ${expected.join(", ")}\nactual: ${actual.join(", ")}`, { decision: "pause", candidate_id: candidate.candidate_id });
		}
	}

	const aggregateMethod = contract.evaluation.benchmark.aggregate;
	const candidateMetric = measurements.length > 0
		? aggregateMeasurements(measurements, aggregateMethod)
		: null;

	const evaluatorInput: EvaluatorInput = {
		contract,
		lock,
		bestMetric: store.state.bestMetric,
		candidateMetric,
		benchmarkSucceeded,
		benchmarkTimedOut,
		checkResults,
		changedFiles,
		immutableReadSetHashMatches,
		contractHashMatches,
		allMeasurements: measurements,
		expectedMeasurements: contract.evaluation.benchmark.repeats,
	};

	const evaluatorResult = evaluateContract(evaluatorInput);

	appendDecision(ctx.cwd, {
		timestamp: Date.now(),
		contractId: lock.contractId,
		contractHash: currentHash,
		decision: evaluatorResult.decision,
		reason: evaluatorResult.reason,
		metric: evaluatorResult.representativeMetric,
		reference: evaluatorResult.reference,
		details: { ...evaluatorResult.details, measurements, changedFiles, reason: params.reason, iterationLabel: params.iteration_label, candidate_id: params.candidate_id, checks: contract.evaluation.checks.map((c) => ({ name: c.name, visibility: checkVisibility(c), phase: checkPhase(c) })) },
	});

	// --- Append to runs.jsonl and metrics.jsonl for audit ---
	try {
		ensureSessionDir(ctx.cwd, store.state.sessionId, deps.sessionDir);
		const runSeq = nextRunSeq(ctx.cwd, store.state.sessionId, deps.runsLedgerPath);
		const now = Date.now();
		const postCommit = getGitShortHash(ctx.cwd);
		appendToJsonl(deps.runsLedgerPath(ctx.cwd, store.state.sessionId), {
			schemaVersion: 1, runSeq,
			piRunId: "contract-" + lock.contractId + "-" + runSeq,
			externalRunId: null,
			createdAt: now, startedAt: now, completedAt: now,
			durationSeconds: 0,
			command: JSON.stringify(contract.evaluation.benchmark.command.argv),
			exitCode: evaluatorResult.decision === "keep" ? 0 : 1,
			timedOut: benchmarkTimedOut,
			signal: null,
			gitCommit: postCommit,
		} satisfies RunsLedgerEntry);
		appendToJsonl(deps.metricsLedgerPath(ctx.cwd, store.state.sessionId), {
			schemaVersion: 1, runSeq,
			piRunId: "contract-" + lock.contractId + "-" + runSeq,
			externalRunId: null,
			createdAt: now, startedAt: now, completedAt: now,
			durationSeconds: 0,
			command: JSON.stringify(contract.evaluation.benchmark.command.argv),
			gitCommit: postCommit,
			exitCode: evaluatorResult.decision === "keep" ? 0 : 1,
			timedOut: benchmarkTimedOut,
			primaryMetricName: contract.evaluation.primaryMetric.name,
			primaryMetricValue: evaluatorResult.representativeMetric,
			primaryMetricSource: "contract_evaluator",
			metrics: measurements.length > 0 ? { [contract.evaluation.primaryMetric.name]: evaluatorResult.representativeMetric } : {},
			status: evaluatorResult.decision,
		} as unknown as Record<string, unknown>);
	} catch { /* best effort */ }

	// --- Also append to .autoresearch/runs.jsonl and .autoresearch/metrics.jsonl ---
	try {
		const now = Date.now();
		appendContractRun(ctx.cwd, {
			timestamp: now,
			contractId: lock.contractId,
			contractHash: currentHash,
			iteration: store.state.runCount + 1,
			decision: evaluatorResult.decision,
			measurements,
			representativeMetric: evaluatorResult.representativeMetric,
			reference: evaluatorResult.reference,
			changedFiles,
			checkResults: Object.fromEntries(checkResults),
			durationSeconds: 0,
			details: { candidate_id: params.candidate_id },
		});
		appendContractMetric(ctx.cwd, {
			timestamp: now,
			contractId: lock.contractId,
			contractHash: currentHash,
			iteration: store.state.runCount + 1,
			metricName: contract.evaluation.primaryMetric.name,
			metricValue: evaluatorResult.representativeMetric,
			allMeasurements: measurements,
			aggregateMethod: contract.evaluation.benchmark.aggregate,
			decision: evaluatorResult.decision,
			details: { candidate_id: params.candidate_id },
		});
	} catch { /* best effort */ }

	if (evaluatorResult.decision === "keep") {
		if (candidate?.trial?.mode === "isolated_worktree") {
			try { replayCandidateToMain(ctx.cwd, contract, candidate.candidate_id); }
			catch (e) { updateCandidateStatus(ctx.cwd, candidate.candidate_id, "paused_dirty", { reason: e instanceof Error ? e.message : String(e) }); return store.textDetails(`[PAUSE] isolated candidate replay failed: ${e instanceof Error ? e.message : String(e)}`, { decision: "pause", candidate_id: candidate.candidate_id }); }
		}
		const gr = gitAutoCommit(
			ctx.cwd,
			`[autoresearch] ${params.reason ?? "contract run"}\n\nDecision: keep\nMetric: ${evaluatorResult.representativeMetric}\nImprovement: ${evaluatorResult.improvement}\nRate: ${evaluatorResult.improvementRate}`,
		);
		if (gr.error) {
			if (candidate) updateCandidateStatus(ctx.cwd, candidate.candidate_id, "paused_dirty", { reason: "git commit failed", metric: evaluatorResult.representativeMetric });
			logRunEvent("decision_pause", { reason: "git commit failed", error: gr.error });
			return store.textDetails(`[PAUSE] git commit に失敗しました: ${gr.error}`, { decision: "pause", error: gr.error });
		}

		store.state.runCount++;
		// Sync direction from contract to ensure consistent best comparison
		store.state.direction = contract.evaluation.primaryMetric.direction;
		const updatedBest = candidateMetric !== null && isBestMetric(store.state.bestMetric, candidateMetric, store.state.direction);
		if (updatedBest) {
			store.state.bestMetric = candidateMetric;
		}

		// Persist bestMetric and runCount to .autoresearch/state.json for contract mode
		// so that bestMetric survives process restarts.
		try {
			const s2 = readStateV2(ctx.cwd);
			writeStateV2(ctx.cwd, {
				...s2,
				runCount: store.state.runCount,
				currentContractHash: currentHash,
				bestMetric: updatedBest
					? { name: contract.evaluation.primaryMetric.name, value: candidateMetric!, direction: contract.evaluation.primaryMetric.direction }
					: s2.bestMetric,
			});
		} catch { /* best effort: in-memory state is still valid for this session */ }

		if (candidate) {
			const latestCandidate = updateCandidateStatus(ctx.cwd, candidate.candidate_id, "kept", { metric: evaluatorResult.representativeMetric, reason: evaluatorResult.reason, commit: gr.commit });
			if (latestCandidate.trial?.mode === "isolated_worktree") removeCandidateWorktree(ctx.cwd, latestCandidate);
			try {
				const source = JSON.parse(fs.readFileSync(path.join(candidateDir(ctx.cwd, candidate.candidate_id), "source-result.json"), "utf8"));
				if (source.result?.outcome === "patch") {
					new SubagentResultStore(ctx.cwd).appendSemanticLog({ result_id: source.result_id, agent_path: source.agent_path, applied_at: Date.now(), candidate_id: candidate.candidate_id, materialized_commit: gr.commit, materialized_by: "autoresearch", reads: source.result.semantic.reads, writes: source.result.semantic.writes, assumptions: source.result.semantic.assumptions, effects: source.result.semantic.effects, public_surface_delta: source.result.semantic.public_surface_delta, validation_result: { ok: true, output: `autoresearch candidate kept: ${candidate.candidate_id}` } });
				}
			} catch { /* best effort */ }
		}

		logRunEvent("decision_keep", { candidate_id: params.candidate_id, metric: evaluatorResult.representativeMetric, commit: gr.commit });
		store.updateWidget(ctx);

		let text = `[KEEP] 改善が承認されました\n`;
		text += `metric: ${evaluatorResult.representativeMetric}\n`;
		text += `reference: ${evaluatorResult.reference}\n`;
		text += `improvement: ${evaluatorResult.improvement}\n`;
		text += `rate: ${((evaluatorResult.improvementRate ?? 0) * 100).toFixed(2)}%\n`;
		text += `reason: ${evaluatorResult.reason}\n`;
		if (gr.committed) text += `commit: ${gr.commit}\n`;
		text += `\n次の候補を実装して、再度 autoresearch_run_contract を実行してください。`;
		return store.textDetails(text, { decision: "keep", metric: evaluatorResult.representativeMetric, reference: evaluatorResult.reference, improvement: evaluatorResult.improvement, improvementRate: evaluatorResult.improvementRate, commit: gr.commit });
	} else if (evaluatorResult.decision === "discard") {
		if (candidate?.trial?.mode === "isolated_worktree") {
			removeCandidateWorktree(ctx.cwd, candidate);
		} else {
			const rv = gitAutoRevert(ctx.cwd);
			if (!rv.reverted) {
				if (candidate) updateCandidateStatus(ctx.cwd, candidate.candidate_id, "paused_dirty", { reason: "git revert failed", metric: evaluatorResult.representativeMetric });
				logRunEvent("revert_failed", { error: rv.error });
				return store.textDetails(`[PAUSE] revert に失敗しました: ${rv.error}\n手動介入が必要です。`, { decision: "pause", error: rv.error });
			}
		}

		store.state.runCount++;

		// Persist runCount and currentContractHash for contract mode
		try {
			const s2 = readStateV2(ctx.cwd);
			writeStateV2(ctx.cwd, {
				...s2,
				runCount: store.state.runCount,
				currentContractHash: currentHash,
			});
		} catch { /* best effort */ }

		if (candidate) updateCandidateStatus(ctx.cwd, candidate.candidate_id, "discarded", { metric: evaluatorResult.representativeMetric, reason: evaluatorResult.reason });

		logRunEvent("decision_discard", { candidate_id: params.candidate_id, metric: evaluatorResult.representativeMetric, reason: evaluatorResult.reason });
		store.updateWidget(ctx);

		let text = `[DISCARD] 改善不十分のため棄却しました\n`;
		text += `metric: ${evaluatorResult.representativeMetric}\n`;
		text += `reference: ${evaluatorResult.reference}\n`;
		text += `reason: ${evaluatorResult.reason}\n`;
		text += `\nrevert 完了。次の候補を実装して、再度 autoresearch_run_contract を実行してください。`;
		return store.textDetails(text, { decision: "discard", metric: evaluatorResult.representativeMetric, reference: evaluatorResult.reference, reason: evaluatorResult.reason });
	} else {
		if (candidate) updateCandidateStatus(ctx.cwd, candidate.candidate_id, "paused_dirty", { metric: evaluatorResult.representativeMetric, reason: evaluatorResult.reason });
		logRunEvent("decision_pause", { candidate_id: params.candidate_id, reason: evaluatorResult.reason });
		let text = `[PAUSE] 実験を一時停止しました\n`;
		text += `reason: ${evaluatorResult.reason}\n`;
		text += `\n変更は working tree に残っています。問題を解決してから再開してください。`;
		return store.textDetails(text, { decision: "pause", reason: evaluatorResult.reason });
	}
}
