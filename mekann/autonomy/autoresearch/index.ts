/**
 * autoresearch - Pi 拡張機能: 自律的実験ループ(日本語 UI)。
 *
 * 長時間・高コストな評価 run も安全に扱える実験コントローラ。
 *
 * Tool handler の実装は tools/ 以下に分割済み。
 * このファイルは thin orchestrator (イベントハンドラ + ツール登録配線)。
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";

import {
	reconstructState,
	isBestMetric,
	countByStatus,
	freshState,
	appendToJsonl,
	readJsonlEntries,
	readPointer,
	writePointer,
	isBestPointerMetric,
	type ExperimentState,
	type RunEntry,
	type RunStatus,
	type RunsLedgerEntry,
	type MetricsLedgerEntry,
	type DecisionLedgerEntry,
	type EventLedgerEntry,
	type PointerEntry,
} from "./state.js";
import {
	computeContractHash,
	readCurrentContract,
	readLockFile,
	currentContractPath,
	currentLockPath,
	planPath,
	validateCommandSafety,
	resolveCwdInsideRepo,
	type AutoresearchContractV1,
	type LockFile,
} from "./contractV1.js";
import {
	readContract,
	deleteContract,
	validateGitSafety,
	validateCommand,
	validateContract,
	buildContract,
	isGitRepo,
	getBaselineCommit,
	DEFAULT_SAFETY,
	type ExperimentContract,
	type AcceptanceMode,
	type MetricMethod,
	type ChecksMode,
	type AggregateMethod,
} from "./contract.js";
import {
	runCommand,
	runArgvCommand,
	runChecks,
	type ChecksResult,
	type RunResult,
	getGitShortHash,
	gitAutoCommit,
	gitAutoRevert,
	getChangedFiles,
	isGitDirty,
	generatePiRunId,
	generateRunId,
	createRunArtifactDir,
	filterSecrets,
	hasCompleteMarker,
	loopFollowUpMessage,
} from "./runner.js";
import { evaluateQueryStatically } from "./queryEvaluation.js";
import { directionLabel, type LoopInfo } from "./state.js";
import {
	createOrReusePlan,
	readState as readStateV2,
	writeState as writeStateV2,
	appendJournal,
	generateRunId as generatePlanScopedRunId,
	createRunArtifacts,
	getRunDir,
} from "./layout.js";

// Extracted orchestration helpers
import { SessionStore, DEFAULT_MAX_LOOP_ITERATIONS, NO_PROGRESS_LIMIT, DEFAULT_TIMEOUT_SECONDS } from "./tools/sessionStore.js";
import {
	appendScaleEvent,
	claimNextAction,
	nextActionMessage,
	readScaleState,
	type ScaleRuntimeStore,
} from "./scale.js";
import { projectFeatureToolSurface } from "../../settings/toolSurfaceProjection.js";
import { registerAutoresearchPromptProvider } from "./promptProvider.js";
import { registerAutoresearchCommands } from "./commands.js";
import { registerAutoresearchTools } from "./toolsRegistration.js";


// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const JSONL_FILE = "autoresearch.jsonl";
const MD_FILE = "autoresearch.md";
const AUTORESEARCH_TOOL_NAMES = [
	"autoresearch_evaluate_query",
	"autoresearch_init",
	"autoresearch_run",
	"autoresearch_log",
	"autoresearch_plan",
	"autoresearch_approve",
	"autoresearch_candidate_escrow",
	"autoresearch_list_candidates",
	"autoresearch_show_candidate",
	"autoresearch_reject_candidate",
	"autoresearch_apply_candidate",
	"autoresearch_suggest_subagents",
	"autoresearch_apply_candidate_isolated",
	"autoresearch_scale_next",
	"autoresearch_scale_complete_action",
	"autoresearch_scale_ingest",
	"autoresearch_scale_status",
	"autoresearch_run_contract",
] as const;

// ---------------------------------------------------------------------------
// Path helpers (shared with tool handlers via deps)
// ---------------------------------------------------------------------------

function jsonlPath(cwd: string): string {
	return path.join(cwd, JSONL_FILE);
}

function mdFilePath(cwd: string): string {
	return path.join(cwd, MD_FILE);
}

function sessionDir(cwd: string, sessionId: string): string {
	return path.join(cwd, ".pi", "autoresearch", sessionId);
}

function runsLedgerPath(cwd: string, sessionId: string): string {
	return path.join(sessionDir(cwd, sessionId), "runs.jsonl");
}

function metricsLedgerPath(cwd: string, sessionId: string): string {
	return path.join(sessionDir(cwd, sessionId), "metrics.jsonl");
}

function decisionsLedgerPath(cwd: string, sessionId: string): string {
	return path.join(sessionDir(cwd, sessionId), "decisions.jsonl");
}

function eventsLedgerPath(cwd: string, sessionId: string): string {
	return path.join(sessionDir(cwd, sessionId), "events.jsonl");
}

function latestPointerPath(cwd: string, sessionId: string): string {
	return path.join(sessionDir(cwd, sessionId), "latest.pointer.json");
}

function bestPointerPath(cwd: string, sessionId: string): string {
	return path.join(sessionDir(cwd, sessionId), "best.pointer.json");
}

function readCurrentPlanContract(cwd: string): ExperimentContract | null {
	const s = readStateV2(cwd);
	if (s.currentPlanDir) {
		try { return JSON.parse(fs.readFileSync(path.join(cwd, s.currentPlanDir, "contract.json"), "utf8")) as ExperimentContract; }
		catch { return null; }
	}
	return readContract(cwd);
}

// Shared deps object for tool handlers
export const toolDeps = {
	readCurrentPlanContract,
	sessionDir,
	jsonlPath,
	eventsLedgerPath,
	runsLedgerPath,
	metricsLedgerPath,
	decisionsLedgerPath,
	latestPointerPath,
	bestPointerPath,
	mdFilePath,
};

// ---------------------------------------------------------------------------
// Extension factory
// ---------------------------------------------------------------------------

export default function autoresearchExtension(pi: ExtensionAPI): void {
	const store = new SessionStore();
	const scaleStore: ScaleRuntimeStore = { active: false, promptQueued: false };

	function syncAutoresearchToolSurface(): void {
		projectFeatureToolSurface(pi, "autoresearch", AUTORESEARCH_TOOL_NAMES, "active", () => store.active || scaleStore.active);
	}

	// ─── session_start ─────────────────────────────────────────

	pi.on("session_start", async (_event, ctx) => {
		const s2 = readStateV2(ctx.cwd);

		if (s2.currentPlanDir) {
			store.state = freshState();
			store.state.sessionId = s2.sessionId ?? store.state.sessionId;

			const c = readCurrentPlanContract(ctx.cwd) as any;
			if (c) {
				store.state.name = c.name ?? store.state.name;
				store.state.metricName = c.metricName ?? c.primaryMetric?.name ?? c.evaluation?.primaryMetric?.name ?? store.state.metricName;
				store.state.metricUnit = c.metricUnit ?? c.primaryMetric?.unit ?? store.state.metricUnit;
				store.state.direction = (c.direction ?? c.primaryMetric?.direction ?? c.evaluation?.primaryMetric?.direction ?? store.state.direction) as "lower" | "higher";
			}

			if (s2.bestMetric) {
				store.state.bestMetric = s2.bestMetric.value;
				store.state.direction = (s2.bestMetric.direction ?? store.state.direction) as "lower" | "higher";
			}

			if (s2.runCount !== undefined) {
				store.state.runCount = s2.runCount;
			} else if (s2.currentPlanId) {
				try {
					const lines = fs.existsSync(path.join(ctx.cwd, ".autoresearch", "journal.jsonl")) ? fs.readFileSync(path.join(ctx.cwd, ".autoresearch", "journal.jsonl"), "utf8").trim().split(/\n+/).filter(Boolean) : [];
					store.state.runCount = lines.filter((l) => { try { const e = JSON.parse(l); return e.type === "decision" && e.planId === s2.currentPlanId; } catch { return false; } }).length;
				} catch { store.state.runCount = 0; }
			}
		} else {
			const contractV1 = readCurrentContract(ctx.cwd);
			const contractV1Lock = readLockFile(ctx.cwd);

			if (contractV1) {
				store.state = freshState();
				store.state.sessionId = s2.sessionId ?? store.state.sessionId;

				const pm = contractV1.evaluation.primaryMetric;
				store.state.metricName = pm.name;
				store.state.direction = pm.direction as "lower" | "higher";
				store.state.metricUnit = pm.unit ?? store.state.metricUnit;
				store.state.name = contractV1.objective.summary ?? store.state.name;

				if (contractV1Lock) {
					const currentHash = computeContractHash(contractV1);
					const hashMatch = currentHash === contractV1Lock.contractHash && s2.currentContractHash === currentHash;
					if (hashMatch && s2.bestMetric) {
						store.state.bestMetric = s2.bestMetric.value;
						store.state.direction = (s2.bestMetric.direction ?? store.state.direction) as "lower" | "higher";
					}
					if (hashMatch && s2.runCount !== undefined) {
						store.state.runCount = s2.runCount;
					}
				}
			} else {
				const jp = jsonlPath(ctx.cwd);
				if (fs.existsSync(jp)) {
					try { store.state = reconstructState(fs.readFileSync(jp, "utf8")); }
					catch { store.state = freshState(); }
				} else store.state = freshState();
			}
		}
		store.active = false;
		store.autoLoop = false;
		store.runningExperiment = null;
		store.runResultMap.clear();
		store.resetLoopProgress();
		const scaleState = readScaleState(ctx.cwd);
		scaleStore.active = scaleState?.status === "running" || scaleState?.status === "draining";
		scaleStore.promptQueued = false;
		syncAutoresearchToolSurface();
		store.updateWidget(ctx);
	});

	// ─── Policy provider wiring ───────────────────────────────

	registerAutoresearchPromptProvider(store, readCurrentPlanContract);

	// ─── agent loop watchdog ───────────────────────────────────

	pi.on("agent_start", async () => {
		store.loopPromptQueued = false;
		scaleStore.promptQueued = false;
		store.agentStartRunCount = store.state.runCount;
	});

	pi.on("agent_end", async (event, ctx) => {
		const scaleState = readScaleState(ctx.cwd);
		if (scaleStore.active && scaleState?.status === "running" && !scaleStore.promptQueued) {
			if (hasCompleteMarker(event)) {
				// Scale mode treats COMPLETE as exploration exhaustion, not as research stop.
				try { appendScaleEvent(ctx.cwd, { type: "exploration_exhausted", source: "complete_marker" }); } catch { /* best effort */ }
			}
			const action = claimNextAction(ctx.cwd);
			if (action) {
				scaleStore.promptQueued = true;
				pi.sendUserMessage(nextActionMessage(action), { deliverAs: "followUp" });
			}
			return;
		}
		if (!store.active || !store.autoLoop) return;
		if (store.runningExperiment || store.loopPromptQueued) return;

		if (hasCompleteMarker(event)) {
			store.autoLoop = false;
			store.loopPromptQueued = false;
			store.updateWidget(ctx);
			ctx.ui.notify("autoresearch loop を完了マーカーで停止しました", "info");
			return;
		}

		const madeProgress = store.state.runCount > store.agentStartRunCount || store.lastLoggedRun > store.agentStartRunCount;
		if (madeProgress) {
			store.noProgressAgentEnds = 0;
		} else {
			store.noProgressAgentEnds++;
			if (store.noProgressAgentEnds === NO_PROGRESS_LIMIT) {
				ctx.ui.notify(`autoresearch loop は ${NO_PROGRESS_LIMIT}回連続で benchmark/log 進捗がありません。subagent 待ち・調査・候補評価中なら継続します。停止するには <autoresearch>COMPLETE</autoresearch> または /autoresearch off を使ってください。`, "warning");
			}
		}

		if (store.maxLoopIterations !== null && store.loopIterationCount >= store.maxLoopIterations) {
			store.autoLoop = false;
			store.updateWidget(ctx);
			ctx.ui.notify(`autoresearch loop が上限 ${store.maxLoopIterations} 回に達したため停止しました`, "info");
			return;
		}

		store.loopIterationCount++;
		store.loopPromptQueued = true;
		store.updateWidget(ctx);
		pi.sendUserMessage(loopFollowUpMessage(!madeProgress), { deliverAs: "followUp" });
	});

	// ─── Commands ──────────────────────────────────────────────

	registerAutoresearchCommands(pi, store, scaleStore, syncAutoresearchToolSurface, toolDeps);

	// ─── Tools ─────────────────────────────────────────────────

	registerAutoresearchTools(pi, store, toolDeps);
}
