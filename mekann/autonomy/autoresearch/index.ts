/**
 * autoresearch - Pi 拡張機能: 自律的実験ループ(日本語 UI)。
 *
 * 長時間・高コストな評価 run も安全に扱える実験コントローラ。
 *
 * Tool handler の実装は tools/ 以下に分割済み。
 * このファイルは thin orchestrator (イベントハンドラ + ツール登録配線)。
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@earendil-works/pi-ai";
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
	COMPLETE_MARKER,
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

// Extracted tool handlers
import { SessionStore, DEFAULT_MAX_LOOP_ITERATIONS, NO_PROGRESS_LIMIT, DEFAULT_TIMEOUT_SECONDS } from "./tools/sessionStore.js";
import { executeEvaluateQuery } from "./tools/evaluateQuery.js";
import { executePlan } from "./tools/plan.js";
import { executeInit } from "./tools/init.js";
import { executeRun } from "./tools/run.js";
import { executeLog } from "./tools/log.js";
import { executeApprove } from "./tools/approve.js";
import { executeRunContract } from "./tools/runContract.js";
import { executeApplyCandidate, executeApplyCandidateIsolated, executeCandidateEscrow, executeListCandidates, executeRejectCandidate, executeShowCandidate } from "./tools/candidates.js";
import { handleCommand } from "./tools/commandHandler.js";
import { buildActiveContext } from "./activeContext.js";
import { suggestSubagents } from "./subagentPlanning.js";
import {
	appendScaleEvent,
	buildScalingPlan,
	claimNextAction,
	completeScaleAction,
	ingestScaleAction,
	createPlanningScaleState,
	nextActionMessage,
	requestScaleStop,
	startScale,
	statusText as scaleStatusText,
	readScaleState,
	type ScaleRuntimeStore,
} from "./scale.js";
import { registerPromptProvider } from "../../core/prompt-core/index.js";
import { projectFeatureToolSurface } from "../../settings/toolSurfaceProjection.js";
import { registerContextTool } from "../../context/observations.js";


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
const toolDeps = {
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
// System prompt extra
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT_EXTRA = [
	"",
	"## autoresearch モード(アクティブ)",
	"",
	"- まず下記の dynamic autoresearch context を読み、現在の目的・指標・進捗・未探索領域を把握する。autoresearch.md だけに依存せず、state / current.plan / journal / plan contract も確認する。",
	"- 目的に沿って実験を繰り返す。未初期化なら autoresearch_init/plan/approve 系 tool で契約を整える。",
	"- autoresearch_run 後は必ず autoresearch_log または contract evaluator で記録する。autoresearch_log は自動で git commit / revert するため手動 git 操作はしない。",
	"- 長時間コマンドには timeout を明示し、webui/watch など終了しないコマンドは使わない。",
	"- 自然文目的が曖昧なら run 前に autoresearch_evaluate_query で不足事項を確認する。ready_for_run 以外では run に進まない。",
	"- autoresearch 中の subagent patch は直接 apply せず candidate escrow → apply_candidate → run_contract で評価する。",
	"- 改善余地・未検証候補・不確実性が残る場合は継続する。早期 COMPLETE を避ける。",
	"- subagent が使える場合は、独立調査・候補生成・失敗分析を並列化して積極的に活用する。",
	"- 1ターン1実験を目安に、日本語で簡潔に報告する。ideas は必要時のみ autoresearch.ideas.md 等へ保存する。",
	"- " + COMPLETE_MARKER + " は、十分な探索証拠があり未探索候補がない場合のみ返す。",
].join("\n");

const SYSTEM_PROMPT_INACTIVE = [
	"",
	"## autoresearch モード(OFF)",
	"",
	"- autoresearch は現在 OFF。",
	"- ユーザーが明示的に `/autoresearch on` を実行するまで、autoresearch の実験ループ・候補評価・継続タスクを開始/再開しない。",
	"- 現在のユーザー依頼を通常の依頼として扱う。修正・調査・質問・レビューなど、依頼内容に従って対応する。",
	"- autoresearch_run / autoresearch_log / autoresearch_init / autoresearch_plan / autoresearch_run_contract は使わない。",
	"- autoresearch.md / .autoresearch/ は、ユーザーが明示した場合、または現在の依頼を理解するために必要な場合だけ参照する。",
].join("\n");

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

	// ─── Prompt fragments ─────────────────────────────────────

	registerPromptProvider({
		id: "autoresearch",
		getFragments(ctx) {
			if (!store.active) {
				return [{
					id: "autoresearch:inactive-policy",
					source: "autoresearch",
					kind: "autoresearch_policy",
					stability: "stable",
					scope: "mode",
					priority: 400,
					version: "v1",
					cacheIntent: "prefer_cache",
					metadata: { volatileTermsArePolicyReferences: true },
					content: SYSTEM_PROMPT_INACTIVE,
				}];
			}
			return [
				{
					id: "autoresearch:policy",
					source: "autoresearch",
					kind: "autoresearch_policy",
					stability: "stable",
					scope: "mode",
					priority: 400,
					version: "v1",
					cacheIntent: "prefer_cache",
					metadata: { volatileTermsArePolicyReferences: true },
					content: SYSTEM_PROMPT_EXTRA,
				},
				{
					id: "autoresearch:active-context",
					source: "autoresearch",
					kind: "autoresearch_state",
					stability: "dynamic",
					scope: "turn",
					priority: 750,
					version: "v1",
					cacheIntent: "avoid_cache",
					content: buildActiveContext(ctx.cwd, store, readCurrentPlanContract),
				},
			];
		},
	});

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
			if (store.noProgressAgentEnds >= NO_PROGRESS_LIMIT) {
				store.autoLoop = false;
				store.updateWidget(ctx);
				ctx.ui.notify(`autoresearch loop を停止しました: ${NO_PROGRESS_LIMIT}回連続で進捗なし。\n/autoresearch loop on で再開、/autoresearch loop max none で上限解除できます。`, "warning");
				return;
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

	// ─── /autoresearch command ─────────────────────────────────

	pi.registerCommand("autoresearch", {
		description: "autoresearch モードの管理(on / off / status / clear)",
		handler: async (args, ctx) => {
			await handleCommand(args, ctx, pi, store, { ...toolDeps, onSurfaceChange: syncAutoresearchToolSurface });
		},
	});

	pi.registerCommand("autoresearch-scale", {
		description: "autoresearch test-time scaling supervisor の管理(start / stop / status / <目的文>)",
		handler: async (args, ctx) => {
			const raw = (args ?? "").trim();
			try {
				if (raw === "status" || raw === "") {
					ctx.ui.notify(scaleStatusText(ctx.cwd), "info");
					return;
				}
				if (raw === "start") {
					store.active = true;
					store.autoLoop = false;
					const s = startScale(ctx.cwd);
					scaleStore.active = true;
					scaleStore.promptQueued = false;
					syncAutoresearchToolSurface();
					store.updateWidget(ctx);
					ctx.ui.notify(`autoresearch-scale を開始しました: generation=${s.generation}`, "info");
					const action = claimNextAction(ctx.cwd);
					if (action) {
						scaleStore.promptQueued = true;
						pi.sendUserMessage(nextActionMessage(action), { deliverAs: "followUp" });
					}
					return;
				}
				if (raw === "stop") {
					const s = requestScaleStop(ctx.cwd);
					scaleStore.active = s.status === "draining";
					scaleStore.promptQueued = false;
					syncAutoresearchToolSurface();
					ctx.ui.notify(s.status === "draining" ? "autoresearch-scale は graceful stopping です" : "autoresearch-scale を停止しました", "info");
					return;
				}

				const plan = buildScalingPlan(raw);
				fs.writeFileSync(planPath(ctx.cwd), plan.markdown, "utf8");
				createPlanningScaleState(ctx.cwd);
				store.active = true;
				store.autoLoop = false;
				scaleStore.active = false;
				scaleStore.promptQueued = false;
				syncAutoresearchToolSurface();
				store.updateWidget(ctx);
				let msg = `[OK] scaling plan draft を生成しました: ${planPath(ctx.cwd)}\n`;
				msg += `判定: ${plan.decision}\n主指標: ${plan.contract.evaluation.primaryMetric.name} (${plan.contract.evaluation.primaryMetric.direction})\n`;
				if (plan.blockingIssues.length > 0) msg += `\nブロッキング issue:\n${plan.blockingIssues.map((i) => `- ${i}`).join("\n")}\n`;
				if (plan.clarifyingQuestions.length > 0) msg += `\n確認質問:\n${plan.clarifyingQuestions.map((q) => `- ${q}`).join("\n")}\n`;
				msg += "\nplan を確認・編集した後、autoresearch_approve を実行してください。承認後に /autoresearch-scale start で開始できます。";
				ctx.ui.notify(msg, "info");
			} catch (e) {
				ctx.ui.notify(`[ERROR] autoresearch-scale: ${e instanceof Error ? e.message : String(e)}`, "error");
			}
		},
	});

	// ─── Tool: autoresearch_evaluate_query ─────────────────────

	registerContextTool(pi, {
		name: "autoresearch_evaluate_query",
		label: "autoresearch evaluate query",
		description: "Evaluate whether a natural-language request can become an autoresearch contract.",
		promptSnippet: "Evaluate an autoresearch request.",
		promptGuidelines: [
			"Use before autoresearch when the user objective is ambiguous.",
			"Ask for missing metric or command details when required.",
		],
		parameters: Type.Object({
			query: Type.String({ description: "User request." }),
		}),

		async execute(_tc, params, _sig, _ou, _ctx) {
			return executeEvaluateQuery(store, params);
		},
	});

	// ─── Tool: autoresearch_init ───────────────────────────────

	const initParamDefs = Type.Object({
		name: Type.String({ description: "Experiment name." }),
		metric_name: Type.String({ description: "Primary metric name, e.g. total_ms." }),
		metric_unit: Type.Optional(Type.String({ description: "Metric unit, e.g. ms." })),
		direction: Type.Optional(StringEnum(["lower", "higher"] as const, { description: "Default: lower." }) as any),
		objective: Type.Optional(Type.String({ description: "Experiment objective." })),
		benchmark_command: Type.Optional(Type.String({ description: "Benchmark command, e.g. ./autoresearch.sh." })),
		metric_method: Type.Optional(StringEnum(["wall_clock", "stdout_metric", "report_file"] as const, { description: "Metric method. Default: wall_clock." }) as any),
		checks_mode: Type.Optional(StringEnum(["script", "command", "none"] as const, { description: "Checks mode. Default: script." }) as any),
		checks_command: Type.Optional(Type.String({ description: "Checks command when checks_mode=command." })),
		acceptance_mode: Type.Optional(StringEnum(["better_than_best", "improvement_threshold", "manual"] as const, { description: "Acceptance mode. Default: better_than_best." }) as any),
		min_improvement: Type.Optional(Type.Number({ description: "Minimum improvement ratio, e.g. 0.02." })),
		repeat: Type.Optional(Type.Number({ description: "Measurement repeats. Default: 1." })),
		aggregate: Type.Optional(StringEnum(["single", "median", "mean", "min", "max"] as const, { description: "Aggregation method. Default: single." }) as any),
		require_git: Type.Optional(Type.Boolean({ description: "Require a git repo. Default: true." })),
		require_clean_baseline: Type.Optional(Type.Boolean({ description: "Require a clean baseline. Default: true." })),
		allowed_paths: Type.Optional(Type.Array(Type.String(), { description: "Allowed path patterns." })),
		excluded_paths: Type.Optional(Type.Array(Type.String(), { description: "Excluded path patterns." })),
	});

	registerContextTool(pi, {
		name: "autoresearch_init",
		label: "autoresearch init",
		description:
			"Initialize an autoresearch plan and state under .autoresearch/.",
		promptSnippet: "Initialize an autoresearch session.",
		promptGuidelines: [
			"Use once at session start; do not reinitialize existing config.",
		],
		parameters: initParamDefs as any,

		async execute(_tc, params, _sig, _ou, ctx) {
			return executeInit(store, params as any, ctx, toolDeps);
		},
	});

	// ─── Tool: autoresearch_run ────────────────────────────────

	registerContextTool(pi, {
		name: "autoresearch_run",
		label: "autoresearch run",
		description:
			"Run a benchmark command, record output/time, parse METRIC/RUN_ID/ARTIFACT_DIR, and run checks when configured.",
		promptSnippet: "Run and measure a benchmark command.",
		promptGuidelines: [
			"Set timeout_seconds for long commands.",
			"Do not run non-terminating commands such as web UIs.",
		],
		parameters: Type.Object({
			command: Type.String({ description: "Command to run." }),
			timeout_seconds: Type.Optional(Type.Number({ description: "Timeout seconds. Default: 600." })),
			checks_timeout_seconds: Type.Optional(Type.Number({ description: "Checks timeout seconds. Default: 300." })),
		}),

		async execute(_tc, params, signal, _ou, ctx) {
			return executeRun(store, params, signal, ctx, toolDeps);
		},
	});

	// ─── Tool: autoresearch_log ────────────────────────────────

	registerContextTool(pi, {
		name: "autoresearch_log",
		label: "autoresearch log",
		description: "Record an experiment result; keep commits, discard/crash/checks_failed revert.",
		promptSnippet: "Record an experiment result.",
		promptGuidelines: [
			"Do not keep timeouts, nonzero exits, failed checks, or missing metrics.",
			"Pass the runId from autoresearch_run; piRunId is accepted as a legacy alias.",
		],
		parameters: Type.Object({
			metric: Type.Number({ description: "Primary metric value." }),
			status: StringEnum(["keep", "discard", "crash", "checks_failed"] as const, { description: "Result status." }) as any,
			description: Type.String({ description: "Short experiment description." }),
			runId: Type.Optional(Type.String({ description: "runId from autoresearch_run." })),
			commit: Type.Optional(Type.String({ description: "Git commit hash; auto when omitted." })),
			metrics: Type.Optional(Type.Object({}, { additionalProperties: Type.Number(), description: "Additional metrics." })),
			memo: Type.Optional(Type.String({ description: "Memo." })),
		}),

		async execute(_tc, params, _sig, _ou, ctx) {
			return executeLog(store, params as any, ctx, toolDeps);
		},
	});

	// ─── Tool: autoresearch_plan ───────────────────────────────

	registerContextTool(pi, {
		name: "autoresearch_plan",
		label: "autoresearch plan",
		description:
			"Draft autoresearch.plan.md from a natural-language query without running baseline measurement.",
		promptSnippet: "Draft an autoresearch plan.",
		promptGuidelines: [
			"Treat the plan as an editable discussion document.",
			"Use `autoresearch-contract jsonc` for the contract block language.",
		],
		parameters: Type.Object({
			query: Type.String({ description: "User request." }),
		}),

		async execute(_tc, params, _sig, _ou, ctx) {
			return executePlan(store, params, ctx);
		},
	});

	// ─── Tool: autoresearch_approve ────────────────────────────

	registerContextTool(pi, {
		name: "autoresearch_approve",
		label: "autoresearch approve",
		description:
			"Validate the plan contract, measure baseline, and write current contract/lock files.",
		promptSnippet: "Approve a contract and measure baseline.",
		promptGuidelines: [
			"Review or edit the plan before approval.",
			"Do not change the contract after approval.",
		],
		parameters: Type.Object({
			plan_path: Type.Optional(Type.String({ description: "Plan file path. Default: autoresearch.plan.md." })),
		}),

		async execute(_tc, params, signal, _ou, ctx) {
			return executeApprove(store, params, signal, ctx, toolDeps);
		},
	});

	// ─── Tool: autoresearch candidates ─────────────────────────

	registerContextTool(pi, {
		name: "autoresearch_candidate_escrow",
		label: "autoresearch candidate escrow",
		description: "Escrow pending subagent patch results as autoresearch candidates.",
		promptSnippet: "Escrow subagent patch results as candidates.",
		promptGuidelines: [
			"During autoresearch, use this tool instead of agent_results({ action: 'apply' }).",
			"Evaluate via autoresearch_apply_candidate, then autoresearch_run_contract({ candidate_id }).",
		],
		parameters: Type.Object({
			source: Type.Optional(Type.Union([Type.Literal("pending"), Type.Literal("result_ids")])),
			result_ids: Type.Optional(Type.Array(Type.String())),
			max_results: Type.Optional(Type.Number()),
		}),
		async execute(_tc, params, _signal, _ou, ctx) { return executeCandidateEscrow(store, params, ctx); },
	});

	registerContextTool(pi, {
		name: "autoresearch_list_candidates",
		label: "autoresearch list candidates",
		description: "List autoresearch candidates for the current plan.",
		parameters: Type.Object({}),
		async execute(_tc, params, _signal, _ou, ctx) { return executeListCandidates(store, params as Record<string, never>, ctx); },
	});

	registerContextTool(pi, {
		name: "autoresearch_show_candidate",
		label: "autoresearch show candidate",
		description: "Show an autoresearch candidate, optionally with patch/source content.",
		parameters: Type.Object({ candidate_id: Type.String(), include_patch: Type.Optional(Type.Boolean()), include_source: Type.Optional(Type.Boolean()) }),
		async execute(_tc, params, _signal, _ou, ctx) { return executeShowCandidate(store, params, ctx); },
	});

	registerContextTool(pi, {
		name: "autoresearch_reject_candidate",
		label: "autoresearch reject candidate",
		description: "Reject an autoresearch candidate without changing the source subagent result.",
		parameters: Type.Object({ candidate_id: Type.String(), reason: Type.Optional(Type.String()) }),
		async execute(_tc, params, _signal, _ou, ctx) { return executeRejectCandidate(store, params, ctx); },
	});

	registerContextTool(pi, {
		name: "autoresearch_apply_candidate",
		label: "autoresearch apply candidate",
		description: "Apply one pending autoresearch candidate as a trial patch. Does not mark subagent result applied.",
		parameters: Type.Object({ candidate_id: Type.String() }),
		async execute(_tc, params, _signal, _ou, ctx) { return executeApplyCandidate(store, params, ctx); },
	});

	registerContextTool(pi, {
		name: "autoresearch_suggest_subagents",
		label: "autoresearch suggest subagents",
		description: "Suggest scout/proposer/critic subagent spawn payloads derived from the current contract.",
		parameters: Type.Object({}),
		async execute(_tc, _params, _signal, _ou, ctx) {
			const contract = readCurrentContract(ctx.cwd);
			if (!contract) return store.textResponse("[ERROR] current contract が見つかりません。");
			const result = suggestSubagents(contract);
			return store.textDetails(JSON.stringify(result, null, 2), result as Record<string, unknown>);
		},
	});

	registerContextTool(pi, {
		name: "autoresearch_apply_candidate_isolated",
		label: "autoresearch apply candidate isolated",
		description: "Apply one pending candidate in .pi/autoresearch-worktrees/<candidateId> for isolated evaluation.",
		parameters: Type.Object({ candidate_id: Type.String() }),
		async execute(_tc, params, _signal, _ou, ctx) { return executeApplyCandidateIsolated(store, params, ctx); },
	});

	// ─── Tools: autoresearch scale supervisor ───────────────────

	registerContextTool(pi, {
		name: "autoresearch_scale_next",
		label: "autoresearch scale next",
		description: "Get the next autoresearch scaling supervisor action.",
		parameters: Type.Object({}),
		async execute(_tc, _params, _signal, _ou, ctx) {
			try {
				const action = claimNextAction(ctx.cwd);
				if (!action) return store.textResponse("[OK] 次 action はありません。");
				return store.textDetails(nextActionMessage(action), { ...action } as Record<string, unknown>);
			} catch (e) {
				return store.textResponse(`[ERROR] ${e instanceof Error ? e.message : String(e)}`);
			}
		},
	});

	registerContextTool(pi, {
		name: "autoresearch_scale_complete_action",
		label: "autoresearch scale complete action",
		description: "Record completion of an autoresearch scaling action.",
		parameters: Type.Object({
			action_id: Type.String(),
			status: Type.Optional(StringEnum(["ok", "failed"] as const) as any),
			result: Type.Optional(Type.Object({}, { additionalProperties: true })),
		}),
		async execute(_tc, params, _signal, _ou, ctx) {
			try {
				const s = completeScaleAction(ctx.cwd, params as any);
				return store.textDetails(`[OK] scale action を記録しました: status=${s.status} generation=${s.generation}`, s as unknown as Record<string, unknown>);
			} catch (e) {
				return store.textResponse(`[ERROR] ${e instanceof Error ? e.message : String(e)}`);
			}
		},
	});

	registerContextTool(pi, {
		name: "autoresearch_scale_ingest",
		label: "autoresearch scale ingest",
		description: "Ingest tool/subagent/candidate results for the active scale action.",
		parameters: Type.Object({}),
		async execute(_tc, _params, _signal, _ou, ctx) {
			try {
				const s = ingestScaleAction(ctx.cwd);
				return store.textDetails(`[OK] scale action result を取り込みました: status=${s.status} phase=${s.phase ?? "none"} generation=${s.generation}`, s as unknown as Record<string, unknown>);
			} catch (e) {
				return store.textResponse(`[ERROR] ${e instanceof Error ? e.message : String(e)}`);
			}
		},
	});

	registerContextTool(pi, {
		name: "autoresearch_scale_status",
		label: "autoresearch scale status",
		description: "Show autoresearch scaling status.",
		parameters: Type.Object({}),
		async execute(_tc, _params, _signal, _ou, ctx) {
			const text = scaleStatusText(ctx.cwd);
			return store.textDetails(text, { status: text });
		},
	});

	// ─── Tool: autoresearch_run_contract ───────────────────────

	registerContextTool(pi, {
		name: "autoresearch_run_contract",
		label: "autoresearch run contract",
		description:
			"Run checks, benchmark, repeats, aggregation, and acceptance from the approved contract.",
		promptSnippet: "Run an approved contract evaluation.",
		promptGuidelines: [
			"Do not provide keep/discard status in contract mode.",
			"Let the evaluator return the decision.",
		],
		parameters: Type.Object({
			reason: Type.Optional(Type.String({ description: "Reason for this run." })),
			iteration_label: Type.Optional(Type.String({ description: "iteration label" })),
			candidate_id: Type.Optional(Type.String({ description: "autoresearch candidate id" })),
		}),

		async execute(_tc, params, signal, _ou, ctx) {
			return executeRunContract(store, params, signal, ctx, toolDeps);
		},
	});
}
