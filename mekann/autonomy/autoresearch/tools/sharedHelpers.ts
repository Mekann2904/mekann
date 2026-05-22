/**
 * 複数 tool handler で共有する helper functions。
 * SessionStore に依存しない pure function 群。
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ChecksResult, RunResult } from "../runner.js";
import { runArgvCommand as _runArgvCommand, getChangedFiles, loadRunFromArtifact } from "../runner.js";
import { readJsonlEntries } from "../state.js";
import { readState as readStateV2, getRunDir } from "../layout.js";
import { filterInternalPaths, checkPhase as _checkPhase, resolveCwdInsideRepo as _resolveCwdInsideRepo, type AutoresearchContractV1 } from "../contractV1.js";
import { isGitRepo } from "../contract.js";
import type { SessionStore, RunData } from "./sessionStore.js";

// ─── resolvePrimaryMetricFromRun ──────────────────────────────

/** Run all contract checks for a given phase, returning results map. */
export async function runContractChecksForPhase(
	contract: AutoresearchContractV1,
	phase: "pre_benchmark" | "post_benchmark",
	evaluationCwd: string,
	signal: AbortSignal | undefined,
	onCheckComplete: (name: string, phase: string, passed: boolean, exitCode: number | null, timedOut: boolean) => void,
): Promise<Map<string, boolean>> {
	const checkResults = new Map<string, boolean>();
	for (const check of contract.evaluation.checks.filter((c) => _checkPhase(c) === phase)) {
		const checkCwd = _resolveCwdInsideRepo(evaluationCwd, check.command.cwd);
		const checkResult = await _runArgvCommand(
			{ argv: check.command.argv, cwd: checkCwd, env: check.command.env },
			check.timeoutSeconds * 1000,
			signal,
		);
		checkResults.set(check.name, checkResult.passed);
		onCheckComplete(check.name, phase, checkResult.passed, checkResult.exitCode, checkResult.timedOut);
	}
	return checkResults;
}

/** Validate git repo requirement and set metric direction from contract. */
export function validateContractPreconditions(
	contract: AutoresearchContractV1,
	cwd: string,
	store: SessionStore,
): string | null {
	if (contract.scope.requireGit && !isGitRepo(cwd)) {
		return "not a git repository";
	}
	store.state.direction = contract.evaluation.primaryMetric.direction;
	return null;
}

export function resolvePrimaryMetricFromRun(
	primaryMetric: AutoresearchContractV1["evaluation"]["primaryMetric"],
	runResult: { durationSeconds: number; parsedMetrics: Record<string, number> | null },
): number | null {
	if (primaryMetric.source.type === "metric_line") {
		const parsed = runResult.parsedMetrics?.[primaryMetric.name];
		if (typeof parsed === "number" && Number.isFinite(parsed)) {
			return parsed;
		}
		if (primaryMetric.source.fallback === "wall_clock") {
			return runResult.durationSeconds;
		}
		return null;
	} else if (primaryMetric.source.type === "wall_clock") {
		return runResult.durationSeconds;
	}
	return null;
}

// ─── Working tree helpers ─────────────────────────────────────

export function isWorkingTreeCleanForContract(cwd: string): boolean {
	return filterInternalPaths(getChangedFiles(cwd)).length === 0;
}

export function getContractRelevantChangedFiles(cwd: string): string[] {
	return filterInternalPaths(getChangedFiles(cwd));
}

// ─── Session directory ────────────────────────────────────────

export function ensureSessionDir(cwd: string, sessionId: string, sessionDirFn: (cwd: string, sid: string) => string): void {
	const dir = sessionDirFn(cwd, sessionId);
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ─── nextRunSeq ───────────────────────────────────────────────

export function nextRunSeq(
	cwd: string,
	sessionId: string,
	runsLedgerPathFn: (cwd: string, sid: string) => string,
): number {
	try {
		const jp = path.join(cwd, ".autoresearch", "journal.jsonl");
		if (fs.existsSync(jp)) {
			const currentPlanId = readStateV2(cwd).currentPlanId;
			const n = fs.readFileSync(jp, "utf8").trim().split(/\n+/).filter(Boolean).filter((l) => {
				try { const e = JSON.parse(l); return e.type === "run_started" && (!currentPlanId || e.planId === currentPlanId); } catch { return false; }
			}).length;
			if (n > 0) return n;
		}
	} catch { /* legacy fallback */ }
	const rlp = runsLedgerPathFn(cwd, sessionId);
	const entries = readJsonlEntries(rlp);
	return entries.length + 1;
}

// ─── loadRunFromPlanArtifact ──────────────────────────────────

export function loadRunFromPlanArtifact(
	cwd: string,
	runId: string,
	planId?: string,
): {
	result: RunResult; checks: ChecksResult;
	startedAt: number; completedAt: number; createdAt: number;
	artifactDir?: string; runSeq?: number;
} | null {
	const candidates: string[] = [];
	if (planId) candidates.push(getRunDir(cwd, planId, runId));
	const plansRoot = path.join(cwd, ".autoresearch", "plans");
	try {
		for (const p of fs.readdirSync(plansRoot)) candidates.push(path.join(plansRoot, p, "runs", runId));
	} catch { /* no plans */ }
	for (const runDir of candidates) {
		const manifestPath = path.join(runDir, "manifest.json");
		if (!fs.existsSync(manifestPath)) continue;
		try {
			const m = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
			let checks: ChecksResult = { passed: null, timedOut: false, output: "", stdout: "", stderr: "", durationSeconds: 0 };
			for (const f of ["checks-result.json", "checks.result.json"]) {
				const cp = path.join(runDir, f);
				if (fs.existsSync(cp)) { checks = JSON.parse(fs.readFileSync(cp, "utf8")); break; }
			}
			let parsedMetrics: Record<string, number> | null = null;
			const mp = path.join(runDir, "metrics.json");
			if (fs.existsSync(mp)) { const parsed = JSON.parse(fs.readFileSync(mp, "utf8")); if (Object.keys(parsed).length > 0) parsedMetrics = parsed; }
			const result: RunResult = {
				command: m.command ?? "", exitCode: m.exitCode ?? null, durationSeconds: m.durationSeconds ?? 0,
				timedOut: m.timedOut ?? false, passed: (m.exitCode === 0) && !m.timedOut, output: "",
				parsedMetrics, checks, stdout: "", stderr: "", signal: m.signal ?? null,
				externalRunId: m.externalRunId ?? null, externalArtifactDir: m.externalArtifactDir ?? null,
				externalSummaryPath: m.externalSummaryPath ?? null, externalViewlogPath: m.externalViewlogPath ?? null,
				externalMetricsPath: m.externalMetricsPath ?? null, logFilesWritten: m.logFilesWritten ?? false,
				streamError: m.streamError ?? null,
			};
			return { result, checks, startedAt: m.startedAt ?? 0, completedAt: m.completedAt ?? 0, createdAt: m.startedAt ?? 0, artifactDir: runDir, runSeq: m.runSeq };
		} catch { /* try next */ }
	}
	return null;
}

// ─── findRunData ──────────────────────────────────────────────

export function findRunData(
	piRunId: string,
	cwd: string,
	store: SessionStore,
	sessionId: string,
): RunData | undefined {
	// 1. Memory map
	const mem = store.runResultMap.get(piRunId);
	if (mem) return mem;

	// 2. Fallback: load from canonical plan artifact (survives process restarts)
	const s2 = readStateV2(cwd);
	let loaded = loadRunFromPlanArtifact(cwd, piRunId, s2.currentPlanId);
	// 3. Legacy .pi fallback
	if (!loaded) loaded = loadRunFromArtifact(cwd, sessionId, piRunId) as ReturnType<typeof loadRunFromPlanArtifact>;
	if (loaded) {
		return {
			result: loaded.result,
			checks: loaded.result.checks,
			startedAt: loaded.startedAt,
			completedAt: loaded.completedAt,
			createdAt: loaded.createdAt,
			artifactDir: loaded.artifactDir,
			runSeq: loaded.runSeq,
		};
	}
	return undefined;
}
