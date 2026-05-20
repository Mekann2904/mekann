/**
 * autoresearch_log ツールの execute body を抽出したモジュール。
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";

import type { ExperimentState, RunEntry, RunStatus, EventLedgerEntry } from "../state.js";
import { isBestMetric, countByStatus, appendToJsonl, readPointer, writePointer, isBestPointerMetric } from "../state.js";
import type { ExperimentContract, AcceptanceInput } from "../contract.js";
import { validateChangedFiles } from "../contract.js";
import { evaluateAcceptance } from "../acceptance.js";
import { readState as readStateV2, writeState as writeStateV2, appendJournal } from "../layout.js";
import {
	getGitShortHash,
	gitAutoCommit,
	gitAutoRevert,
	getChangedFiles,
	isGitDirty,
	getRunArtifactDir,
} from "../runner.js";

import type { SessionStore, ToolResponse } from "./sessionStore.js";
import { STATUS_LABELS, STATUS_PREFIX } from "./sessionStore.js";
import { findRunData, ensureSessionDir } from "./sharedHelpers.js";

// ─── Types ────────────────────────────────────────────────────

export interface LogDeps {
	readCurrentPlanContract: (cwd: string) => ExperimentContract | null;
	sessionDir: (cwd: string, sid: string) => string;
	jsonlPath: (cwd: string) => string;
	eventsLedgerPath: (cwd: string, sid: string) => string;
	metricsLedgerPath: (cwd: string, sid: string) => string;
	decisionsLedgerPath: (cwd: string, sid: string) => string;
	runsLedgerPath: (cwd: string, sid: string) => string;
	latestPointerPath: (cwd: string, sid: string) => string;
	bestPointerPath: (cwd: string, sid: string) => string;
}

// ─── executeLog ───────────────────────────────────────────────

export async function executeLog(
	store: SessionStore,
	params: {
		metric: number;
		status: "keep" | "discard" | "crash" | "checks_failed";
		description: string;
		runId?: string;
		commit?: string;
		metrics?: Record<string, number>;
		memo?: string;
	},
	ctx: ExtensionContext,
	deps: LogDeps,
): Promise<ToolResponse> {
	if (!store.active) return store.INACTIVE_RESPONSE;

	const { state } = store;

	// --- P0-4: Load experiment contract from current plan (legacy root contract is fallback only) ---
	const contract = deps.readCurrentPlanContract(ctx.cwd);

	// --- Find run data ---
	let matchedPiRunId: string | undefined;
	let matchedRunData: ReturnType<typeof findRunData>;

	if (params.runId) {
		matchedRunData = findRunData(params.runId, ctx.cwd, store, state.sessionId);
		if (!matchedRunData) {
			return store.textResponse(`[ERROR] runId "${params.runId}" に対応する run が見つかりません。\nメモリにも artifact にも存在しません。正しい runId を指定してください。`);
		}
		matchedPiRunId = params.runId;
	} else if (store.lastRunResult) {
		matchedPiRunId = store.lastRunResult.piRunId;
		matchedRunData = findRunData(matchedPiRunId, ctx.cwd, store, state.sessionId);
	} else {
		if (params.status === "keep") {
			return store.textResponse("[ERROR] 対応する autoresearch_run 結果がありません。\n先に autoresearch_run を実行してから autoresearch_log を呼び出してください。");
		}
	}

	const matchedResult = matchedRunData?.result;
	const matchedChecks = matchedRunData?.checks;
	const resolvedPrimaryMetric = matchedResult
		? store.resolvePrimaryMetricValue(state.metricName, matchedResult)
		: { value: null as number | null, source: "missing" as const };
	const effectiveMetric = params.status === "keep" && resolvedPrimaryMetric.value !== null
		? resolvedPrimaryMetric.value
		: params.metric;

	// --- keep validation ---
	if (params.status === "keep") {
		const reasons: string[] = [];

		if (!matchedResult) {
			return store.textResponse("[ERROR] run 結果が存在しないため keep できません。");
		}

		if (matchedResult.timedOut) reasons.push(`timeout した run は keep できません。`);
		if (!matchedResult.passed && !matchedResult.timedOut) reasons.push(`失敗した run(exitCode: ${matchedResult.exitCode})は keep できません。`);
		if (matchedChecks && matchedChecks.passed === false) reasons.push(`checks が失敗しているため keep できません。checks 出力:\n${matchedChecks.output.slice(-500)}`);

		// P0: 主指標が stdout METRIC または duration_seconds wall-clock で解決できることを検証
		if (resolvedPrimaryMetric.value === null) {
			reasons.push(
				`主指標 "${state.metricName}" を解決できません。` +
				`stdout に METRIC ${state.metricName}=<number> を出力してください。` +
				`ただし duration_seconds の場合は autoresearch_run が測定した wall-clock durationSeconds を使用できます。`
			);
		}

		// P0: artifactFailed + stream error チェック
		if (store.runResultMap.has(matchedPiRunId ?? "")) {
			const rd = store.runResultMap.get(matchedPiRunId ?? "");
			if (rd?.artifactFailed) {
				reasons.push("artifact 保存に失敗した run は監査不能のため keep できません。");
			}
			if (rd?.result.streamError) {
				reasons.push(`stream 書き込みエラー (${rd.result.streamError})。ログが不完全な run は keep できません。`);
			}
		}

		// P0: artifactDir + manifest.json + metrics.json の存在確認
		const artifactDirPath = matchedRunData?.artifactDir
			?? getRunArtifactDir(ctx.cwd, state.sessionId, matchedPiRunId ?? "");
		if (!fs.existsSync(artifactDirPath)) {
			reasons.push("run artifact directory が存在しません。監査不能のため keep できません。");
		} else {
			if (!fs.existsSync(path.join(artifactDirPath, "manifest.json"))) {
				reasons.push("manifest.json が存在しません。監査不能のため keep できません。");
			} else {
				// manifest must have artifactComplete=true (incomplete writes don't count)
				try {
					const mf = JSON.parse(fs.readFileSync(path.join(artifactDirPath, "manifest.json"), "utf8"));
					if (mf.artifactComplete !== true) {
						reasons.push("manifest.json に artifactComplete=true がありません。artifact 書き込みが不完全な run は keep できません。");
					}
				} catch {
					reasons.push("manifest.json の読み取りに失敗しました。監査不能のため keep できません。");
				}
			}
			if (!fs.existsSync(path.join(artifactDirPath, "metrics.json"))) {
				reasons.push("metrics.json が存在しません。監査不能のため keep できません。");
			}
			if (!fs.existsSync(path.join(artifactDirPath, "result.json"))) {
				reasons.push("result.json が存在しません。監査不能のため keep できません。");
			}
		}

		if (reasons.length > 0) {
			return store.textResponse(`[ERROR] keep が拒否されました:\n${reasons.map((r, i) => `  ${i + 1}. ${r}`).join("\n")}\n\nstatus=discard または status=crash または status=checks_failed で記録してください。`);
		}

		// --- P0-2: Acceptance policy 強制 ---
		if (contract) {
			const acceptanceInput: AcceptanceInput = {
				candidateMetric: effectiveMetric,
				bestMetric: state.bestMetric,
				direction: state.direction,
				policy: contract.acceptance,
			};
			const acceptanceResult = evaluateAcceptance(acceptanceInput);

			if (!acceptanceResult.accepted) {
				return store.textDetails(`[ERROR] acceptance policy により keep が拒否されました:\n${acceptanceResult.reason}\n\ncandidate: ${effectiveMetric} vs best: ${state.bestMetric}\nacceptance mode: ${contract.acceptance.mode}\nminImprovement: ${(contract.acceptance.minImprovement * 100).toFixed(1)}%\n\nstatus=discard で記録してください。改善が不十分(noise)な場合は、別のアプローチを試してください。`, { acceptanceResult, effectiveMetric, bestMetric: state.bestMetric });
			}
		}

		// --- P0-1: 変更ファイルが safety policy に収まっているか ---
		if (contract) {
			const preChangedFiles = getChangedFiles(ctx.cwd);
			const pathViolations = validateChangedFiles(preChangedFiles, contract.safety);
			if (pathViolations.length > 0) {
				return store.textDetails(`[ERROR] 変更ファイルが safety policy に違反:\n${pathViolations.map((v, i) => `  ${i + 1}. ${v}`).join("\n")}\n\nstatus=discard で記録してください。許可されたパス内に収まるように変更してください。`, { pathViolations, changedFiles: preChangedFiles });
			}
		}
	}

	// --- Provenance ---
	const preCommit = getGitShortHash(ctx.cwd);
	const dirtyBefore = isGitDirty(ctx.cwd);
	const changedFiles = getChangedFiles(ctx.cwd);
	let commit = params.commit ?? preCommit;
	const run = state.runCount + 1;

	// P0: runSeq は run 時採番値を使用(log 順ではなく実行順)
	const runSeq = matchedRunData?.runSeq ?? run;

	const entry: RunEntry = {
		type: "run", run, runId: matchedPiRunId, piRunId: matchedPiRunId,
		commit, metric: effectiveMetric, status: params.status as RunStatus,
		description: params.description, timestamp: Date.now(),
		metrics: params.metrics, memo: params.memo,
		command: matchedResult?.command, exitCode: matchedResult?.exitCode,
		timedOut: matchedResult?.timedOut, checksPassed: matchedChecks?.passed ?? null,
		preCommit, dirtyBefore, changedFiles: changedFiles.length > 0 ? changedFiles : undefined,
		notes: params.memo,
		createdAt: matchedRunData?.createdAt, startedAt: matchedRunData?.startedAt,
		completedAt: matchedRunData?.completedAt, durationSeconds: matchedResult?.durationSeconds,
		externalRunId: matchedResult?.externalRunId ?? null,
		externalArtifactDir: matchedResult?.externalArtifactDir ?? null,
		externalSummaryPath: matchedResult?.externalSummaryPath ?? null,
		externalViewlogPath: matchedResult?.externalViewlogPath ?? null,
		externalMetricsPath: matchedResult?.externalMetricsPath ?? null,
		signal: matchedResult?.signal ?? null,
		metricSource: params.status === "keep" && resolvedPrimaryMetric.source !== "missing" ? resolvedPrimaryMetric.source : undefined,
	};

	// P0-2: git commit 失敗時は keep を成功扱いにしない。
	// state.results/runCount/bestMetric は git 成功(または non-keep の revert)後に更新する。
	if (params.status === "keep") {
		const gr = gitAutoCommit(ctx.cwd, `${params.description}\n\nResult: ${JSON.stringify({ status: params.status, [state.metricName]: effectiveMetric, metricSource: entry.metricSource })}`);
		if (gr.committed) {
			commit = gr.commit ?? commit;
		} else if (gr.error) {
			// 案A: commit できない keep は keep ではない。状態を更新せずエラーを返す。
			return store.textDetails(`[ERROR] git commit に失敗したため keep を記録できません:\n${gr.error}\n\ncommit できない keep は再現性を保証できません。\ngit の状態を確認して再度 autoresearch_log を呼び出してください。`, { gitError: gr.error });
		}
		entry.postCommit = commit;
	} else {
		// P0-6: revert エラーを致命扱いにする
		const revertResult = gitAutoRevert(ctx.cwd);
		if (!revertResult.reverted && revertResult.error) {
			// revert 失敗 → revert_failed status で記録し loop を停止
			const failedEntry: RunEntry = {
				...entry,
				status: "revert_failed",
				postCommit: getGitShortHash(ctx.cwd),
				dirtyAfter: isGitDirty(ctx.cwd),
			};
			failedEntry.commit = commit;

			state.results.push(failedEntry);
			state.runCount = run;

			// Event ledger: revert_failed
			try {
				ensureSessionDir(ctx.cwd, state.sessionId, deps.sessionDir);
				appendToJsonl(deps.eventsLedgerPath(ctx.cwd, state.sessionId), {
					schemaVersion: 1, event: "revert_failed", piRunId: matchedPiRunId ?? "",
					timestamp: Date.now(),
					details: { error: revertResult.error, originalStatus: params.status },
				} satisfies EventLedgerEntry);
			} catch { /* best effort */ }

			// Main JSONL
			try {
				const jp = deps.jsonlPath(ctx.cwd);
				fs.appendFileSync(jp, JSON.stringify({ ...failedEntry }) + "\n");
			} catch { /* best effort */ }

			// P0-6: loop を強制停止
			store.autoLoop = false;
			store.updateWidget(ctx);

			return store.textDetails(`[REVERT_FAILED] 実験 #${run} の revert に失敗しました:\n${revertResult.error}\n\n⚠️ 手動介入が必要です。git の状態を確認し、不要な変更を手動で元してください。\nautoresearch loop を停止しました。`, { run, status: "revert_failed", error: revertResult.error });
		}
		entry.postCommit = getGitShortHash(ctx.cwd);
	}
	entry.dirtyAfter = isGitDirty(ctx.cwd);
	entry.commit = commit;

	// P0-2: commit 失敗時はここに到達しないため、ここから state を更新する。
	state.results.push(entry);
	state.runCount = run;
	let updatedBest = false;
	if (params.status === "keep" && isBestMetric(state.bestMetric, effectiveMetric, state.direction)) {
		state.bestMetric = effectiveMetric;
		updatedBest = true;
	}
	const canonicalErrors: string[] = [];
	const s2 = readStateV2(ctx.cwd);
	try { appendJournal(ctx.cwd, { type: "decision", planId: s2.currentPlanId, runId: matchedPiRunId, decision: params.status, reason: params.description, metric: effectiveMetric }); }
	catch (e) { canonicalErrors.push(`canonical journal(decision): ${e instanceof Error ? e.message : String(e)}`); }
	try {
		writeStateV2(ctx.cwd, {
			...s2,
			latestRunId: matchedPiRunId ?? s2.latestRunId,
			bestRunId: updatedBest ? matchedPiRunId : s2.bestRunId,
			bestMetric: updatedBest ? { name: state.metricName, value: effectiveMetric, direction: state.direction } : s2.bestMetric,
		});
	} catch (e) { canonicalErrors.push(`canonical state(decision): ${e instanceof Error ? e.message : String(e)}`); }

	// --- Pointers & ledgers ---
	const ledgerErrors: string[] = [];
	try {
		ensureSessionDir(ctx.cwd, state.sessionId, deps.sessionDir);
	} catch (e) {
		ledgerErrors.push(`session dir: ${e instanceof Error ? e.message : String(e)}`);
	}

	// Latest pointer
	try {
		writePointer(deps.latestPointerPath(ctx.cwd, state.sessionId), {
			piRunId: matchedPiRunId ?? "", runSeq, metric: effectiveMetric,
			timestamp: entry.timestamp, gitCommit: entry.postCommit ?? preCommit,
		});
	} catch (e) { ledgerErrors.push(`latest pointer: ${e instanceof Error ? e.message : String(e)}`); }

	// Best pointer
	if (params.status === "keep") {
		try {
			const cur = readPointer(deps.bestPointerPath(ctx.cwd, state.sessionId));
			if (isBestPointerMetric(effectiveMetric, cur, state.direction)) {
				writePointer(deps.bestPointerPath(ctx.cwd, state.sessionId), {
					piRunId: matchedPiRunId ?? "", runSeq, metric: effectiveMetric,
					timestamp: entry.timestamp, gitCommit: entry.postCommit ?? preCommit,
				});
			}
		} catch (e) { ledgerErrors.push(`best pointer: ${e instanceof Error ? e.message : String(e)}`); }
	}

	// Metrics ledger
	try {
		appendToJsonl(deps.metricsLedgerPath(ctx.cwd, state.sessionId), {
			schemaVersion: 1, runSeq, piRunId: matchedPiRunId ?? "",
			externalRunId: matchedResult?.externalRunId ?? null,
			createdAt: matchedRunData?.createdAt ?? entry.timestamp,
			startedAt: matchedRunData?.startedAt ?? entry.timestamp,
			completedAt: matchedRunData?.completedAt ?? entry.timestamp,
			durationSeconds: matchedResult?.durationSeconds ?? 0,
			command: matchedResult?.command ?? "", gitCommit: entry.postCommit ?? preCommit,
			exitCode: matchedResult?.exitCode ?? null, timedOut: matchedResult?.timedOut ?? false,
			primaryMetricName: state.metricName, primaryMetricValue: effectiveMetric,
			primaryMetricSource: entry.metricSource,
			metrics: { ...(params.metrics ?? {}), [state.metricName]: effectiveMetric },
			externalArtifactDir: matchedResult?.externalArtifactDir ?? null,
			externalSummaryPath: matchedResult?.externalSummaryPath ?? null,
			externalViewlogPath: matchedResult?.externalViewlogPath ?? null,
			externalMetricsPath: matchedResult?.externalMetricsPath ?? null,
			status: params.status,
		} as unknown as Record<string, unknown>);
	} catch (e) { ledgerErrors.push(`metrics ledger: ${e instanceof Error ? e.message : String(e)}`); }

	// Decision ledger
	try {
		appendToJsonl(deps.decisionsLedgerPath(ctx.cwd, state.sessionId), {
			schemaVersion: 1, piRunId: matchedPiRunId ?? "",
			externalRunId: matchedResult?.externalRunId ?? null,
			status: params.status, metric: effectiveMetric, metricSource: entry.metricSource,
			preCommit, postCommit: entry.postCommit ?? preCommit,
			dirtyBefore, dirtyAfter: entry.dirtyAfter ?? false,
			changedFiles, timestamp: entry.timestamp,
			description: params.description, notes: params.memo,
		} as unknown as Record<string, unknown>);
	} catch (e) { ledgerErrors.push(`decision ledger: ${e instanceof Error ? e.message : String(e)}`); }

	// Event ledger
	try {
		appendToJsonl(deps.eventsLedgerPath(ctx.cwd, state.sessionId), {
			schemaVersion: 1, event: "logged", piRunId: matchedPiRunId ?? "",
			timestamp: entry.timestamp, details: { status: params.status, metric: effectiveMetric, metricSource: entry.metricSource, runSeq },
		} satisfies EventLedgerEntry);
	} catch (e) { ledgerErrors.push(`event ledger: ${e instanceof Error ? e.message : String(e)}`); }

	// --- Main JSONL ---
	const jp = deps.jsonlPath(ctx.cwd);
	try {
		const line = JSON.stringify({
			...entry,
			runId: entry.runId ?? undefined, piRunId: entry.piRunId ?? undefined,
			metrics: params.metrics ?? undefined, memo: params.memo ?? undefined,
			metricSource: entry.metricSource ?? undefined,
			command: entry.command ?? undefined, exitCode: entry.exitCode ?? undefined,
			timedOut: entry.timedOut ?? undefined, checksPassed: entry.checksPassed ?? undefined,
			preCommit, postCommit: entry.postCommit ?? undefined,
			dirtyBefore, dirtyAfter: entry.dirtyAfter ?? undefined,
			changedFiles: entry.changedFiles ?? undefined, notes: entry.notes ?? undefined,
			externalRunId: entry.externalRunId ?? undefined,
			externalArtifactDir: entry.externalArtifactDir ?? undefined,
			externalSummaryPath: entry.externalSummaryPath ?? undefined,
			externalViewlogPath: entry.externalViewlogPath ?? undefined,
			externalMetricsPath: entry.externalMetricsPath ?? undefined,
			signal: entry.signal ?? undefined,
			createdAt: entry.createdAt ?? undefined, startedAt: entry.startedAt ?? undefined,
			completedAt: entry.completedAt ?? undefined, durationSeconds: entry.durationSeconds ?? undefined,
		}) + "\n";
		fs.appendFileSync(jp, line);
	} catch (e) {
		ledgerErrors.push(`legacy jsonl: ${e instanceof Error ? e.message : String(e)}`);
	}

	store.lastLoggedRun = run;
	store.updateWidget(ctx);
	if (matchedPiRunId) store.runResultMap.delete(matchedPiRunId);

	const kept = countByStatus(state.results, "keep");
	const prefix = STATUS_PREFIX[params.status] ?? "[UNKNOWN]";
	let text = `${prefix} 実験 #${run} を記録: ${STATUS_LABELS[params.status] ?? params.status}\n`;
	text += `説明: ${params.description}\n`;
	text += `指標: ${state.metricName}=${effectiveMetric}${state.metricUnit}\n`;
	if (entry.metricSource) text += `指標ソース: ${entry.metricSource}\n`;
	text += `コミット: ${commit}\n`;
	if (entry.piRunId) text += `runId: ${entry.piRunId}\n`;
	if (entry.externalRunId) text += `外部 RUN_ID: ${entry.externalRunId}\n`;
	text += `\n累計: ${state.runCount}回 / 採用${kept}\n`;
	if (state.bestMetric !== null) text += `最良: ${state.metricName}=${state.bestMetric}${state.metricUnit}\n`;

	if (!params.runId && matchedPiRunId) text += `\n[WARNING] runId 省略。次回は明示指定してください。`;
	if (params.status === "keep") {
		// P0-2: git commit 失敗時は既に return 済みなので、ここは commit 成功時のみ
		if (entry.postCommit && entry.postCommit !== preCommit) {
			text += `\n[git] 自動 commit しました: ${entry.postCommit}`;
		} else {
			text += `\n[git] 変更なし(commit 不要)`;
		}
	} else {
		text += `\n[git] revert 完了(autoresearch.* / .pi/ は保護)`;
	}

	store.lastChecks = null;
	store.lastRunResult = null;
	store.lastRunChecks = null;

	if (canonicalErrors.length > 0) {
		text += `\n[WARNING] canonical state/history 書き込み失敗: ${canonicalErrors.join(", ")}`;
	}
	if (ledgerErrors.length > 0) {
		text += `\n[WARNING] legacy ledger 書き込み一部失敗: ${ledgerErrors.join(", ")}`;
	}

	return {
		content: [{ type: "text", text }],
		details: {
			run, runId: entry.piRunId, piRunId: entry.piRunId,
			status: params.status, metric: effectiveMetric, metricSource: entry.metricSource, bestMetric: state.bestMetric,
			kept, commit, preCommit, postCommit: entry.postCommit, changedFiles,
			externalRunId: entry.externalRunId, externalArtifactDir: entry.externalArtifactDir,
			canonicalErrors: canonicalErrors.length > 0 ? canonicalErrors : undefined,
			ledgerErrors: ledgerErrors.length > 0 ? ledgerErrors : undefined,
		},
	};
}
