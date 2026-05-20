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
import { suggestSubagents } from "./subagentPlanning.js";
import { registerPromptProvider } from "../prompt-core/index.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const JSONL_FILE = "autoresearch.jsonl";
const MD_FILE = "autoresearch.md";

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
// System prompt extra (Japanese)
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT_EXTRA = [
	"",
	"## autoresearch モード(アクティブ)",
	"",
	"現在は autoresearch モードです。以下のルールに従って自律的に実験を繰り返してください。",
	"",
	"1. 最初に `autoresearch.md` を読む(存在する場合)",
	"2. `autoresearch_init` でセッションを初期化(未初期化の場合)",
	"3. `autoresearch_run` でコマンドを実行し、結果を測定",
	"4. 必ず `autoresearch_log` で結果を記録",
	"5. `autoresearch_log` が自動で git commit / revert を行うため、手動 git 操作は不要",
	"6. ユーザーに毎回継続確認しない - 停止されるまで繰り返す",
	"7. Ralph 方式: 1ターンでは原則1つの実験だけを完了し、次ターンに知見を引き継ぐ",
	"8. 表示・報告は日本語で行う",
	"9. canonical history は `.autoresearch/journal.jsonl`、current state は `.autoresearch/state.json` に保存される。`autoresearch.jsonl` は legacy compatibility log。",
	"10. `autoresearch.md` は current plan への index。plan 固有の作業記憶は `.autoresearch/plans/<planId>/notes.md` または `plan.md` に追記する。",
	"11. plan 固有の ideas は `.autoresearch/plans/<planId>/ideas.md`、global backlog が必要な場合のみ `autoresearch.ideas.md` に追記する。",
	`12. すべての有望な実験が尽きたら ${COMPLETE_MARKER} を返して停止を宣言する`,
	"",
	"### long-run benchmark での注意",
	"",
	"- 長時間実行コマンド(数十分〜数時間)では `timeout_seconds` を明示指定してください",
	"- `--webui` や watch server のように終了しないコマンドを benchmark command に入れないでください",
	"- 外部 benchmark が `RUN_ID` / `ARTIFACT_DIR` / `METRIC` を stdout に出す場合、pi 側で自動保存します",
	"",
	"### クエリ評価",
	"",
	"ユーザの目的が自然文で曖昧な場合、`autoresearch_init` の前に `autoresearch_evaluate_query` を呼び出す。",
	"評価結果の decision に従って行動すること。",
	"",
	"decision の意味:",
	"- `ready_for_run`: 実験契約が完備。`autoresearch_init` → `autoresearch_run` → checks/log/keep 判断まで安全に進める。",
	"- `ready_for_init`: init は可能だが、run には benchmark command / extraction / checks が不足。",
	"- `needs_command`: benchmark command を確認する。",
	"- `needs_metric_extraction`: metric の抽出方法 (wall-clock / stdout / report file) を確認する。",
	"- `needs_checks_policy`: checks command または `autoresearch.checks.sh` 方針を確認する。",
	"- `needs_metric_design`: metric 候補を提示する。",
	"- `needs_rewrite`: autoresearch 向けの suggestedRewrite を提示する。",
	"- `reject`: 安全上の理由を説明して実験を開始しない。",
	"",
	"`ready_for_run` は `autoresearch_run` 単体ではなく、run 後に checks と log/keep/discard 判断まで安全に進められる状態を意味する。",
	"`ready_for_run` 以外では `autoresearch_run` に進んではならない。",
	"`ready_for_init` では `autoresearch_init` は可能だが、run 前に不足を解消する。",
	"",
	"### subagent candidate 連携",
	"",
	"- autoresearch 中は subagent patch を apply_agent_results で直接適用しない。",
	"- subagent patch result は autoresearch_candidate_escrow で candidate 化する。",
	"- 評価は autoresearch_apply_candidate → autoresearch_run_contract({ candidate_id }) の順で行う。",
	"- subagent は benchmark / git / keep-discard を実行しない。評価と記録は root の autoresearch tool が行う。",
	"",
	"動的評価として以下を 0.0〜1.0 で評価してよい(ただし ready 判定は static validator の blocking/risk を優先):",
	"- semanticAlignment: ユーザ目的と metric が一致しているか",
	"- feasibility: 現在の repository で実行可能そうか",
	"- valuePotential: 改善余地がありそうか",
	"- ambiguityRisk: 解釈の揺れが大きいか",
	"- confidence: この評価にどれだけ確信があるか",
].join("\n");

// ---------------------------------------------------------------------------
// Extension factory
// ---------------------------------------------------------------------------

export default function autoresearchExtension(pi: ExtensionAPI): void {
	const store = new SessionStore();

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
				store.state.direction = c.direction ?? c.primaryMetric?.direction ?? c.evaluation?.primaryMetric?.direction ?? store.state.direction;
			}

			if (s2.bestMetric) {
				store.state.bestMetric = s2.bestMetric.value;
				store.state.direction = s2.bestMetric.direction ?? store.state.direction;
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
				store.state.direction = pm.direction;
				store.state.metricUnit = pm.unit ?? store.state.metricUnit;
				store.state.name = contractV1.objective.summary ?? store.state.name;

				if (contractV1Lock) {
					const currentHash = computeContractHash(contractV1);
					const hashMatch = currentHash === contractV1Lock.contractHash && s2.currentContractHash === currentHash;
					if (hashMatch && s2.bestMetric) {
						store.state.bestMetric = s2.bestMetric.value;
						store.state.direction = s2.bestMetric.direction ?? store.state.direction;
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
		store.updateWidget(ctx);
	});

	// ─── Prompt fragments ─────────────────────────────────────

	registerPromptProvider({
		id: "autoresearch",
		getFragments() {
			if (!store.active) return [];
			return [{
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
			}];
		},
	});

	// ─── agent loop watchdog ───────────────────────────────────

	pi.on("agent_start", async () => {
		store.loopPromptQueued = false;
		store.agentStartRunCount = store.state.runCount;
	});

	pi.on("agent_end", async (event, ctx) => {
		if (!store.active || !store.autoLoop) return;
		if (store.runningExperiment || store.loopPromptQueued) return;

		if (hasCompleteMarker(event)) {
			store.autoLoop = false;
			store.loopPromptQueued = false;
			store.updateWidget(ctx);
			ctx.ui.notify("autoresearch loop を完了マーカーで停止しました", "success");
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
				ctx.ui.notify(`autoresearch loop を停止しました: ${NO_PROGRESS_LIMIT}回連続で進捗なし`, "warning");
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
			await handleCommand(args, ctx, pi, store, toolDeps);
		},
	});

	// ─── Tool: autoresearch_evaluate_query ─────────────────────

	pi.registerTool({
		name: "autoresearch_evaluate_query",
		label: "autoresearch evaluate query",
		description: "ユーザの自然文クエリを評価し、autoresearch 実験契約に変換できるか判定します。",
		promptSnippet: "自然文クエリの評価",
		promptGuidelines: [
			"autoresearch 開始前に、ユーザの目的が曖昧な場合に呼び出す。",
			"評価結果に従って、必要に応じて metric や command の確認を行う。",
		],
		parameters: Type.Object({
			query: Type.String({ description: "ユーザの自然文クエリ" }),
		}),

		async execute(_tc, params, _sig, _ou, _ctx) {
			return executeEvaluateQuery(store, params);
		},
	});

	// ─── Tool: autoresearch_init ───────────────────────────────

	const initParamDefs = Type.Object({
		name: Type.String({ description: "実験セッションの名前" }),
		metric_name: Type.String({ description: "主指標名(例: total_ms)" }),
		metric_unit: Type.Optional(Type.String({ description: "単位(例: ms)" })),
		direction: Type.Optional(StringEnum(["lower", "higher"] as const, { description: "デフォルト: lower" })),
		objective: Type.Optional(Type.String({ description: "実験目的" })),
		benchmark_command: Type.Optional(Type.String({ description: "benchmark command (例: ./autoresearch.sh)" })),
		metric_method: Type.Optional(StringEnum(["wall_clock", "stdout_metric", "report_file"] as const, { description: "測定方法。デフォルト: wall_clock" })),
		checks_mode: Type.Optional(StringEnum(["script", "command", "none"] as const, { description: "checks mode。デフォルト: script" })),
		checks_command: Type.Optional(Type.String({ description: "checks mode=command の場合のコマンド" })),
		acceptance_mode: Type.Optional(StringEnum(["better_than_best", "improvement_threshold", "manual"] as const, { description: "acceptance mode。デフォルト: better_than_best" })),
		min_improvement: Type.Optional(Type.Number({ description: "最小改善率 (0.02 = 2%)。acceptance_mode=improvement_threshold で有効" })),
		repeat: Type.Optional(Type.Number({ description: "測定繰り返し回数。デフォルト: 1" })),
		aggregate: Type.Optional(StringEnum(["single", "median", "mean", "min", "max"] as const, { description: "集計方法。デフォルト: single" })),
		require_git: Type.Optional(Type.Boolean({ description: "git repo を必須にする。デフォルト: true" })),
		require_clean_baseline: Type.Optional(Type.Boolean({ description: "clean working tree を必須にする。デフォルト: true" })),
		allowed_paths: Type.Optional(Type.Array(Type.String(), { description: "許可パスパターンの配列" })),
		excluded_paths: Type.Optional(Type.Array(Type.String(), { description: "除外パスパターンの配列" })),
	});

	pi.registerTool({
		name: "autoresearch_init",
		label: "autoresearch init",
		description:
			"実験 plan を初期化します。plan 固有ファイルを .autoresearch/plans/<planId>/ に保存し、current state を .autoresearch/state.json に記録します。" +
			" autoresearch.jsonl / autoresearch.contract.json は legacy compatibility 用です。" +
			"\nP0: git repo 必須、clean baseline 必須(変更可能)。acceptance policy / safety policy も指定可能。",
		promptSnippet: "実験セッションの初期化",
		promptGuidelines: [
			"autoresearch_init はセッションの最初に一度だけ。既存設定があれば再初期化しない。",
			"subagent が利用可能なら、plan 作成前の読み取り専用調査や候補案比較に使ってよい。ただし subagent にファイル編集や autoresearch 実行を任せない。",
		],
		parameters: initParamDefs as any,

		async execute(_tc, params, _sig, _ou, ctx) {
			return executeInit(store, params, ctx, toolDeps);
		},
	});

	// ─── Tool: autoresearch_run ────────────────────────────────

	pi.registerTool({
		name: "autoresearch_run",
		label: "autoresearch run",
		description:
			"シェルコマンドを実行し、実行時間と出力を記録。METRIC / RUN_ID / ARTIFACT_DIR 等を自動パース。" +
			"autoresearch.checks.sh が存在する場合、benchmark 成功後に自動実行。",
		promptSnippet: "コマンドを実行して結果を測定",
		promptGuidelines: [
			"実行後は必ず autoresearch_log で記録。",
			"長時間コマンドでは timeout_seconds を明示指定。",
			"終了しないコマンド(webui 等)は入れない。",
			"autoresearch_run は root agent が実行する。subagent に実行させない。",
		],
		parameters: Type.Object({
			command: Type.String({ description: "実行するコマンド" }),
			timeout_seconds: Type.Optional(Type.Number({ description: "タイムアウト秒数(デフォルト: 600)" })),
			checks_timeout_seconds: Type.Optional(Type.Number({ description: "checks のタイムアウト秒数(デフォルト: 300)" })),
		}),

		async execute(_tc, params, signal, _ou, ctx) {
			return executeRun(store, params, signal, ctx, toolDeps);
		},
	});

	// ─── Tool: autoresearch_log ────────────────────────────────

	pi.registerTool({
		name: "autoresearch_log",
		label: "autoresearch log",
		description: "実験結果を記録。keep は自動 commit、discard/crash/checks_failed は自動 revert。",
		promptSnippet: "実験結果を記録",
		promptGuidelines: [
			"run 後は必ず log を呼ぶ。",
			"keep: timeout・exitCode!=0・checks失敗・metric不在は拒否。",
			"runId に autoresearch_run の runId を渡す。旧 piRunId も互換 alias として受け付ける。",
			"autoresearch_log は root agent が実行する。subagent に記録・keep/discard判断・git操作を任せない。",
		],
		parameters: Type.Object({
			metric: Type.Number({ description: "主指標の値" }),
			status: StringEnum(["keep", "discard", "crash", "checks_failed"] as const, { description: "結果ステータス" }),
			description: Type.String({ description: "実験内容の短い説明" }),
			runId: Type.Optional(Type.String({ description: "autoresearch_run の runId (旧 piRunId 互換)" })),
			commit: Type.Optional(Type.String({ description: "Git commit hash(省略時自動)" })),
			metrics: Type.Optional(Type.Object({}, { additionalProperties: Type.Number(), description: "追加指標" })),
			memo: Type.Optional(Type.String({ description: "メモ" })),
		}),

		async execute(_tc, params, _sig, _ou, ctx) {
			return executeLog(store, params, ctx, toolDeps);
		},
	});

	// ─── Tool: autoresearch_plan ───────────────────────────────

	pi.registerTool({
		name: "autoresearch_plan",
		label: "autoresearch plan",
		description:
			"自然文 query から autoresearch.plan.md の draft を生成する。" +
			"plan は Markdown + contract block 形式。baseline 測定はしない。repo は read-only 調査のみ。",
		promptSnippet: "実験 plan の draft を生成",
		promptGuidelines: [
			"plan は人間と agent が議論するための editable document です。",
			"contract block の言語指定は `autoresearch-contract jsonc` にしてください。",
			"subagent が利用可能なら、plan 作成前の読み取り専用調査や候補案比較に使ってよい。ただし subagent にファイル編集や autoresearch 実行を任せない。",
		],
		parameters: Type.Object({
			query: Type.String({ description: "ユーザの自然文クエリ" }),
		}),

		async execute(_tc, params, _sig, _ou, ctx) {
			return executePlan(store, params, ctx);
		},
	});

	// ─── Tool: autoresearch_approve ────────────────────────────

	pi.registerTool({
		name: "autoresearch_approve",
		label: "autoresearch approve",
		description:
			"plan の contract block を validate し、baseline を測り、" +
			".autoresearch/current.contract.json と .autoresearch/current.lock.json を作成する。",
		promptSnippet: "contract を承認して baseline を測定",
		promptGuidelines: [
			"approve 前に plan を確認・編集してください。",
			"approve 後は contract の変更ができません。",
		],
		parameters: Type.Object({
			plan_path: Type.Optional(Type.String({ description: "plan file path (default: autoresearch.plan.md)" })),
		}),

		async execute(_tc, params, signal, _ou, ctx) {
			return executeApprove(store, params, signal, ctx, toolDeps);
		},
	});

	// ─── Tool: autoresearch candidates ─────────────────────────

	pi.registerTool({
		name: "autoresearch_candidate_escrow",
		label: "autoresearch candidate escrow",
		description: "pending subagent patch results を autoresearch candidate として escrow する。",
		promptSnippet: "subagent patch result を candidate 化",
		promptGuidelines: [
			"autoresearch 中は apply_agent_results を使わず、この tool で candidate 化してください。",
			"評価は autoresearch_apply_candidate → autoresearch_run_contract({ candidate_id }) の順で行ってください。",
		],
		parameters: Type.Object({
			source: Type.Optional(Type.Union([Type.Literal("pending"), Type.Literal("result_ids")])),
			result_ids: Type.Optional(Type.Array(Type.String())),
			max_results: Type.Optional(Type.Number()),
		}),
		async execute(_tc, params, _signal, _ou, ctx) { return executeCandidateEscrow(store, params, ctx); },
	});

	pi.registerTool({
		name: "autoresearch_list_candidates",
		label: "autoresearch list candidates",
		description: "List autoresearch candidates for the current plan.",
		parameters: Type.Object({}),
		async execute(_tc, params, _signal, _ou, ctx) { return executeListCandidates(store, params as Record<string, never>, ctx); },
	});

	pi.registerTool({
		name: "autoresearch_show_candidate",
		label: "autoresearch show candidate",
		description: "Show an autoresearch candidate, optionally with patch/source content.",
		parameters: Type.Object({ candidate_id: Type.String(), include_patch: Type.Optional(Type.Boolean()), include_source: Type.Optional(Type.Boolean()) }),
		async execute(_tc, params, _signal, _ou, ctx) { return executeShowCandidate(store, params, ctx); },
	});

	pi.registerTool({
		name: "autoresearch_reject_candidate",
		label: "autoresearch reject candidate",
		description: "Reject an autoresearch candidate without changing the source subagent result.",
		parameters: Type.Object({ candidate_id: Type.String(), reason: Type.Optional(Type.String()) }),
		async execute(_tc, params, _signal, _ou, ctx) { return executeRejectCandidate(store, params, ctx); },
	});

	pi.registerTool({
		name: "autoresearch_apply_candidate",
		label: "autoresearch apply candidate",
		description: "Apply one pending autoresearch candidate as a trial patch. Does not mark subagent result applied.",
		parameters: Type.Object({ candidate_id: Type.String() }),
		async execute(_tc, params, _signal, _ou, ctx) { return executeApplyCandidate(store, params, ctx); },
	});

	pi.registerTool({
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

	pi.registerTool({
		name: "autoresearch_apply_candidate_isolated",
		label: "autoresearch apply candidate isolated",
		description: "Apply one pending candidate in .pi/autoresearch-worktrees/<candidateId> for isolated evaluation.",
		parameters: Type.Object({ candidate_id: Type.String() }),
		async execute(_tc, params, _signal, _ou, ctx) { return executeApplyCandidateIsolated(store, params, ctx); },
	});

	// ─── Tool: autoresearch_run_contract ───────────────────────

	pi.registerTool({
		name: "autoresearch_run_contract",
		label: "autoresearch run contract",
		description:
			"contract に従って checks/benchmark/repeats/aggregate/acceptance を実行する。" +
			"keep/discard/pause は agent ではなく evaluator が決める。" +
			"benchmark command や metric は受け取らない。",
		promptSnippet: "contract mode で実験を実行",
		promptGuidelines: [
			"contract mode では agent から status=keep/status=discard を受け取らない。",
			"decision は必ず tool 側が返す。",
		],
		parameters: Type.Object({
			reason: Type.Optional(Type.String({ description: "この run の理由" })),
			iteration_label: Type.Optional(Type.String({ description: "iteration label" })),
			candidate_id: Type.Optional(Type.String({ description: "autoresearch candidate id" })),
		}),

		async execute(_tc, params, signal, _ou, ctx) {
			return executeRunContract(store, params, signal, ctx, toolDeps);
		},
	});
}
