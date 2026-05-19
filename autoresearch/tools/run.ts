/**
 * autoresearch_run ツールハンドラの execute body。
 * index.ts の closure 変数は SessionStore 経由でアクセスする。
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";

import { appendToJsonl, type EventLedgerEntry, type RunsLedgerEntry } from "../state.js";
import {
	validateCommand,
	type ExperimentContract,
} from "../contract.js";
import {
	runCommand,
	runArgvCommand,
	runChecks,
	type ChecksResult,
	type RunResult,
	getGitShortHash,
	createRunArtifactDir,
	writeRunArtifacts,
	writeChecksArtifacts,
	markArtifactComplete,
	filterSecrets,
} from "../runner.js";
import {
	readState as readStateV2,
	writeState as writeStateV2,
	appendJournal,
	generateRunId as generatePlanScopedRunId,
	createRunArtifacts,
} from "../layout.js";

import type { SessionStore, ToolResponse } from "./sessionStore.js";
import { DEFAULT_TIMEOUT_SECONDS } from "./sessionStore.js";
import { ensureSessionDir, nextRunSeq } from "./sharedHelpers.js";

// ─── executeRun ───────────────────────────────────────────────

export async function executeRun(
	store: SessionStore,
	params: { command: string; timeout_seconds?: number; checks_timeout_seconds?: number },
	signal: any,
	ctx: ExtensionContext,
	deps: {
		readCurrentPlanContract: (cwd: string) => ExperimentContract | null;
		sessionDir: (cwd: string, sessionId: string) => string;
		eventsLedgerPath: (cwd: string, sessionId: string) => string;
		runsLedgerPath: (cwd: string, sessionId: string) => string;
		jsonlPath: (cwd: string) => string;
	},
): Promise<ToolResponse> {
	if (!store.active) return store.INACTIVE_RESPONSE;

	// --- P0-7: Command policy チェック ---
	const contract = deps.readCurrentPlanContract(ctx.cwd);
	if (contract) {
		const cmdViolations = validateCommand(params.command, contract.safety);
		if (cmdViolations.length > 0) {
			return store.textDetails(
				`[ERROR] コマンドが safety policy に違反しています:\n${cmdViolations.map((v: string, i: number) => `  ${i + 1}. ${v}`).join("\n")}`,
				{ violations: cmdViolations },
			);
		}
	}

	const timeoutMs = (params.timeout_seconds ?? DEFAULT_TIMEOUT_SECONDS) * 1000;
	let v2State = readStateV2(ctx.cwd);
	if (!v2State.currentPlanId || !v2State.currentPlanDir) {
		const planId = "plan-legacy-implicit";
		const planDir = path.join(".autoresearch", "plans", planId);
		fs.mkdirSync(path.join(ctx.cwd, planDir, "runs"), { recursive: true });
		if (!fs.existsSync(path.join(ctx.cwd, planDir, "plan.md")))
			fs.writeFileSync(path.join(ctx.cwd, planDir, "plan.md"), "# Legacy autoresearch run\n", "utf8");
		writeStateV2(ctx.cwd, {
			...v2State,
			sessionId: store.state.sessionId,
			currentPlanId: planId,
			currentPlanDir: planDir,
			latestRunId: undefined,
			bestRunId: undefined,
			bestMetric: undefined,
			runCount: undefined,
			currentContractHash: undefined,
		});
		appendJournal(ctx.cwd, { type: "plan_selected", planId, legacy: true });
		v2State = readStateV2(ctx.cwd);
	}
	const runId = generatePlanScopedRunId(ctx.cwd);
	const piRunId = runId; // legacy alias accepted by older callers
	const createdAt = Date.now();
	const preCommit = getGitShortHash(ctx.cwd);

	store.runningExperiment = { startedAt: Date.now(), command: params.command };
	store.updateWidget(ctx);

	// Create plan-scoped artifact dir BEFORE execution so streaming logs go to the canonical location.
	let artifactDir: string | undefined;
	let legacyArtifactDir: string | undefined;
	let artifactFailed = false;
	try {
		artifactDir = createRunArtifacts(ctx.cwd, v2State.currentPlanId!, runId).runDir;
		fs.writeFileSync(path.join(artifactDir, "command.txt"), params.command + "\n", "utf8");
		try {
			ensureSessionDir(ctx.cwd, store.state.sessionId, deps.sessionDir);
			legacyArtifactDir = createRunArtifactDir(
				ctx.cwd, store.state.sessionId, runId, params.command, store.runningExperiment!.startedAt,
			);
		} catch { /* legacy mirror is best-effort */ }
	} catch (e) {
		artifactFailed = true;
	}

	// P0: artifact dir 作成失敗時は benchmark を実行しない(fail-fast)
	if (!artifactDir || artifactFailed) {
		store.runningExperiment = null;
		store.updateWidget(ctx);
		return store.textResponse(
			`[ERROR] artifact directory を作成できないため benchmark を実行しません。\n長時間 run の監査不能を防ぐため、先に修正してください。\nエラー詳細: ディレクトリ .autoresearch/plans/${v2State.currentPlanId}/runs/${piRunId} の作成に失敗しました。`,
		);
	}

	const runLedgerErrors: string[] = [];
	// Events ledger: started (canonical journal is fatal; legacy .pi ledger is warning-only)
	appendJournal(ctx.cwd, { type: "run_started", planId: v2State.currentPlanId, runId: piRunId, command: params.command });
	try {
		appendToJsonl(deps.eventsLedgerPath(ctx.cwd, store.state.sessionId), {
			schemaVersion: 1, event: "started", piRunId, timestamp: createdAt,
			details: { command: params.command },
		} satisfies EventLedgerEntry);
	} catch (e) {
		runLedgerErrors.push(`legacy event ledger(started): ${e instanceof Error ? e.message : String(e)}`);
	}

	// Execute - pass logDir for streaming stdout/stderr
	const result = await runCommand(params.command, ctx.cwd, timeoutMs, signal, artifactDir);
	const completedAt = Date.now();
	const startedAt = store.runningExperiment!.startedAt;
	store.runningExperiment = null;
	store.updateWidget(ctx);

	// Events ledger: completed / timed_out
	appendJournal(ctx.cwd, { type: "run_finished", planId: v2State.currentPlanId, runId: piRunId, exitCode: result.exitCode, durationSeconds: result.durationSeconds, timedOut: result.timedOut });
	try {
		appendToJsonl(deps.eventsLedgerPath(ctx.cwd, store.state.sessionId), {
			schemaVersion: 1, event: result.timedOut ? "timed_out" : "completed",
			piRunId, timestamp: completedAt,
			details: { exitCode: result.exitCode, durationSeconds: result.durationSeconds, timedOut: result.timedOut, signal: result.signal },
		} satisfies EventLedgerEntry);
	} catch (e) {
		runLedgerErrors.push(`legacy event ledger(completed): ${e instanceof Error ? e.message : String(e)}`);
	}

	// Checks: use current plan checks.sh directly; root wrapper is human/legacy entrypoint only.
	let checks: ChecksResult;
	if (result.passed) {
		const planChecks = path.join(ctx.cwd, v2State.currentPlanDir!, "checks.sh");
		if (fs.existsSync(planChecks)) {
			const cr = await runArgvCommand(
				{ argv: ["bash", planChecks], cwd: ctx.cwd },
				(params.checks_timeout_seconds ?? 300) * 1000,
				signal,
			);
			checks = {
				passed: cr.passed, timedOut: cr.timedOut,
				output: cr.output.split("\n").slice(-80).join("\n"),
				stdout: cr.stdout, stderr: cr.stderr, durationSeconds: cr.durationSeconds,
			};
		} else {
			checks = await runChecks(ctx.cwd, signal, params.checks_timeout_seconds); // legacy fallback
		}
	} else {
		checks = { passed: null, timedOut: false, output: "", stdout: "", stderr: "", durationSeconds: 0 };
	}
	store.lastChecks = checks;
	store.lastRunResult = { ...result, piRunId };
	store.lastRunChecks = checks;

	// Runs ledger - use runs.jsonl line count for runSeq (not state.runCount)
	const runSeq = nextRunSeq(ctx.cwd, store.state.sessionId, deps.runsLedgerPath);

	// Write remaining artifacts (manifest, result.json, metrics.json, checks)
	// P0: 書き込み失敗時は artifactFailed を確実に記録
	if (artifactDir) {
		try {
			writeRunArtifacts(artifactDir, result, piRunId, startedAt, completedAt, runSeq);
			if (checks.passed !== null) {
				writeChecksArtifacts(artifactDir, checks);
			} else {
				// No checks to run - mark artifact complete now
				markArtifactComplete(artifactDir);
			}
		} catch {
			artifactFailed = true;
		}
	}
	if (!artifactDir) artifactFailed = true;

	const metrics = result.parsedMetrics ?? (store.state.metricName === "duration_seconds" ? { duration_seconds: result.durationSeconds } : {});
	try {
		fs.writeFileSync(
			path.join(artifactDir, "git.status.txt"),
			execFileSync("git", ["status", "--short"], { cwd: ctx.cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }),
			"utf8",
		);
		fs.writeFileSync(
			path.join(artifactDir, "git.diff"),
			execFileSync("git", ["diff", "--"], { cwd: ctx.cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }),
			"utf8",
		);
		if (legacyArtifactDir) {
			for (const f of ["manifest.json", "command.txt", "stdout.log", "stderr.log", "metrics.json", "result.json", "git.status.txt", "git.diff", "checks.result.json", "checks.stdout.log", "checks.stderr.log"]) {
				const src = path.join(artifactDir, f);
				if (fs.existsSync(src)) fs.copyFileSync(src, path.join(legacyArtifactDir, f));
			}
		}
	} catch (e) {
		runLedgerErrors.push(`artifact enrichment/mirror: ${e instanceof Error ? e.message : String(e)}`);
	}

	const canonicalErrors: string[] = [];
	try {
		appendJournal(ctx.cwd, { type: "metrics_recorded", planId: v2State.currentPlanId, runId: piRunId, metrics });
	} catch (e) {
		canonicalErrors.push(`canonical journal(metrics_recorded): ${e instanceof Error ? e.message : String(e)}`);
	}
	try {
		writeStateV2(ctx.cwd, { ...readStateV2(ctx.cwd), latestRunId: piRunId });
	} catch (e) {
		canonicalErrors.push(`canonical state(latestRunId): ${e instanceof Error ? e.message : String(e)}`);
	}

	// Store in memory map AFTER artifact write - artifactFailed reflects actual status
	store.runResultMap.set(piRunId, { result, checks, startedAt, completedAt, createdAt, artifactDir, artifactFailed, runSeq });

	try {
		appendToJsonl(deps.runsLedgerPath(ctx.cwd, store.state.sessionId), {
			schemaVersion: 1, runSeq, piRunId,
			externalRunId: result.externalRunId,
			createdAt, startedAt, completedAt,
			durationSeconds: result.durationSeconds,
			command: result.command,
			exitCode: result.exitCode,
			timedOut: result.timedOut,
			signal: result.signal,
			gitCommit: preCommit,
		} satisfies RunsLedgerEntry);
	} catch (e) {
		runLedgerErrors.push(`legacy runs ledger: ${e instanceof Error ? e.message : String(e)}`);
	}

	// Build response text
	let text = "";
	if (result.timedOut) text = `[TIMEOUT] タイムアウト(${params.timeout_seconds ?? DEFAULT_TIMEOUT_SECONDS}秒)\n`;
	else if (!result.passed) text = `[FAIL] 失敗(終了コード: ${result.exitCode})\n`;
	else text = `[OK] 完了\n`;
	const safeCommand = filterSecrets(result.command);
	text += `実行時間: ${result.durationSeconds.toFixed(1)}秒\n`;
	text += `コマンド: ${safeCommand}\n`;
	text += `runId: ${runId}\n`;

	if (result.externalRunId) text += `外部 RUN_ID: ${result.externalRunId}\n`;
	if (result.externalArtifactDir) text += `外部 ARTIFACT_DIR: ${result.externalArtifactDir}\n`;
	if (result.externalSummaryPath) text += `外部 SUMMARY_PATH: ${result.externalSummaryPath}\n`;
	if (result.externalViewlogPath) text += `外部 VIEWLOG_PATH: ${result.externalViewlogPath}\n`;
	if (result.externalMetricsPath) text += `外部 METRICS_PATH: ${result.externalMetricsPath}\n`;

	if (artifactFailed) text += `[WARNING] artifact 保存に失敗しました。この run は keep できません。\n`;
	if (canonicalErrors.length > 0) text += `[WARNING] canonical state/history 書き込み失敗: ${canonicalErrors.join(", ")}\n`;
	if (runLedgerErrors.length > 0) text += `[WARNING] legacy ledger/artifact 書き込み一部失敗: ${runLedgerErrors.join(", ")}\n`;

	if (checks.passed === true) text += `checks: 成功(${checks.durationSeconds.toFixed(1)}秒)\n`;
	else if (checks.passed === false) {
		text += `checks: 失敗\n`;
		if (checks.output) text += `checks 出力:\n${checks.output}\n`;
		text += `status=checks_failed で記録してください。\n`;
	}

	if (result.parsedMetrics) {
		text += `\n測定指標:\n`;
		for (const [n, v] of Object.entries(result.parsedMetrics)) text += `  METRIC ${n}=${v}\n`;
		const primary = result.parsedMetrics[store.state.metricName];
		if (primary !== undefined) text += `\n主指標 ${store.state.metricName}=${primary}${store.state.metricUnit} を autoresearch_log に報告してください。`;
	}
	if (!(result.parsedMetrics && store.state.metricName in result.parsedMetrics) && store.state.metricName === "duration_seconds") {
		text += `\n主指標 duration_seconds=${result.durationSeconds}${store.state.metricUnit} (wall_clock) を autoresearch_log に報告できます。`;
	}

	const safeOutput = filterSecrets(result.output);
	if (safeOutput) text += `\n出力(末尾):\n${safeOutput}`;
	text += `\nrunId: ${runId}(autoresearch_log の runId に渡してください)`;

	return {
		content: [{ type: "text", text }],
		details: {
			command: safeCommand,
			exitCode: result.exitCode,
			durationSeconds: result.durationSeconds,
			timedOut: result.timedOut,
			passed: result.passed,
			output: safeOutput,
			parsedMetrics: result.parsedMetrics,
			signal: result.signal,
			logFilesWritten: result.logFilesWritten,
			streamError: result.streamError,
			externalRunId: result.externalRunId,
			externalArtifactDir: result.externalArtifactDir,
			externalSummaryPath: result.externalSummaryPath,
			externalViewlogPath: result.externalViewlogPath,
			externalMetricsPath: result.externalMetricsPath,
			runId,
			piRunId: runId,
			checks: {
				passed: checks.passed,
				timedOut: checks.timedOut,
				durationSeconds: checks.durationSeconds,
				output: filterSecrets(checks.output),
			},
			preCommit,
			startedAt,
			completedAt,
			createdAt,
			artifactDir,
			artifactFailed,
			ledgerErrors: runLedgerErrors.length > 0 ? runLedgerErrors : undefined,
			canonicalErrors: canonicalErrors.length > 0 ? canonicalErrors : undefined,
		},
	};
}
