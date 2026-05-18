/**
 * autoresearch - Pi 拡張機能: 自律的実験ループ(日本語 UI)。
 *
 * 長時間・高コストな評価 run も安全に扱える実験コントローラ。
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
	validateContractV1,
	extractContractBlockFromPlan,
	parseJsonc,
	canonicalJsonPretty,
	canonicalJsonStringify,
	computeContractHash,
	computeImmutableReadSetHash,
	collectEnvironmentFingerprint,
	computeBaselineNoise,
	writeCurrentContract,
	readCurrentContract,
	writeLockFile,
	readLockFile,
	currentContractPath,
	currentLockPath,
	autoresearchDir,
	planPath,
	ensureAutoresearchDir,
	appendEvent,
	appendDecision,
	appendContractRun,
	appendContractMetric,
	validateWritePaths,
	matchesAnyPattern,
	filterInternalPaths,
	validateCommandSafety,
	resolveCwdInsideRepo,
	type AutoresearchContractV1,
	type LockFile,
	type ContractV1ValidationResult,
	type ContractEvent,
	type DecisionEntry,
} from "./contractV1.js";
import { evaluateContract, type EvaluatorInput, type Decision } from "./contractEvaluator.js";
import {
	contractFilePath,
	contractExists,
	readContract,
	writeContract,
	deleteContract,
	validateGitSafety,
	validateCommand,
	validateChangedFiles,
	validateContract,
	buildContract,
	isGitRepo,
	isWorkingTreeClean,
	getBaselineCommit,
	DEFAULT_ACCEPTANCE,
	DEFAULT_SAFETY,
	DEFAULT_CHECKS,
	type ExperimentContract,
	type AcceptanceMode,
	type MetricMethod,
	type ChecksMode,
	type AggregateMethod,
} from "./contract.js";
import { evaluateAcceptance, type AcceptanceInput } from "./acceptance.js";
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
	getRunArtifactDir,
	createRunArtifactDir,
	writeRunArtifacts,
	writeChecksArtifacts,
	markArtifactComplete,
	loadRunFromArtifact,
	COMPLETE_MARKER,
	hasCompleteMarker,
	loopFollowUpMessage,
	filterSecrets,
} from "./runner.js";
import { evaluateQueryStatically } from "./queryEvaluation.js";
import { renderWidget, directionLabel, type LoopInfo } from "./state.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const JSONL_FILE = "autoresearch.jsonl";
const MD_FILE = "autoresearch.md";
const DEFAULT_TIMEOUT_SECONDS = 600;
const DEFAULT_MAX_LOOP_ITERATIONS = 50;
const NO_PROGRESS_LIMIT = 2;

// ---------------------------------------------------------------------------
// Path helpers
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

// ---------------------------------------------------------------------------
// Widget update
// ---------------------------------------------------------------------------

function updateWidget(
	ctx: ExtensionContext,
	state: ExperimentState,
	active: boolean,
	runningInfo?: { startedAt: number; command: string } | null,
	loopInfo?: LoopInfo,
): void {
	if (!ctx.hasUI) return;
	const lines = renderWidget(state, active, runningInfo ?? undefined, loopInfo);
	ctx.ui.setWidget("autoresearch", lines ?? undefined);
}

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
	"9. `autoresearch.jsonl` に履歴が自動保存される",
	"10. `autoresearch.md` の Codebase Patterns / 試したことを更新し、次イテレーションの記憶にする",
	"11. 有望だが今すぐ試さない最適化案は `autoresearch.ideas.md` に追記する",
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
	let active = false;
	let autoLoop = false;
	let loopPromptQueued = false;
	let loopIterationCount = 0;
	let maxLoopIterations: number | null = DEFAULT_MAX_LOOP_ITERATIONS;
	let lastLoggedRun = 0;
	let agentStartRunCount = 0;
	let noProgressAgentEnds = 0;
	let runningExperiment: { startedAt: number; command: string } | null = null;
	let lastChecks: ChecksResult | null = null;
	let lastRunResult: (RunResult & { piRunId: string }) | null = null;
	let lastRunChecks: ChecksResult | null = null;
	let state: ExperimentState = freshState();

	/** Map of piRunId → run data for run/log correlation.
	 *  Falls back to loadRunFromArtifact when empty (survives restarts). */
	const runResultMap: Map<string, {
		result: RunResult;
		checks: ChecksResult;
		startedAt: number;
		completedAt: number;
		createdAt: number;
		artifactDir?: string;
		artifactFailed?: boolean;
		runSeq?: number;
	}> = new Map();

	function loopInfo(): LoopInfo {
		return {
			enabled: autoLoop,
			iteration: loopIterationCount,
			maxIterations: maxLoopIterations,
			noProgress: noProgressAgentEnds,
			noProgressLimit: NO_PROGRESS_LIMIT,
		};
	}

	function resetLoopProgress(): void {
		loopPromptQueued = false;
		loopIterationCount = 0;
		lastLoggedRun = state.runCount;
		agentStartRunCount = state.runCount;
		noProgressAgentEnds = 0;
	}

	// ─── session_start ─────────────────────────────────────────

	pi.on("session_start", async (_event, ctx) => {
		const jp = jsonlPath(ctx.cwd);
		if (fs.existsSync(jp)) {
			try {
				state = reconstructState(fs.readFileSync(jp, "utf8"));
			} catch {
				state = freshState();
			}
		}
		active = false;
		autoLoop = false;
		runningExperiment = null;
		runResultMap.clear();
		resetLoopProgress();
		updateWidget(ctx, state, active, runningExperiment, loopInfo());
	});

	// ─── before_agent_start ────────────────────────────────────

	pi.on("before_agent_start", async (event, _ctx) => {
		if (!active) return;
		return { systemPrompt: event.systemPrompt + SYSTEM_PROMPT_EXTRA };
	});

	// ─── agent loop watchdog ───────────────────────────────────

	pi.on("agent_start", async () => {
		loopPromptQueued = false;
		agentStartRunCount = state.runCount;
	});

	pi.on("agent_end", async (event, ctx) => {
		if (!active || !autoLoop) return;
		if (runningExperiment || loopPromptQueued) return;

		if (hasCompleteMarker(event)) {
			autoLoop = false;
			loopPromptQueued = false;
			updateWidget(ctx, state, active, runningExperiment, loopInfo());
			ctx.ui.notify("autoresearch loop を完了マーカーで停止しました", "success");
			return;
		}

		const madeProgress = state.runCount > agentStartRunCount || lastLoggedRun > agentStartRunCount;
		if (madeProgress) {
			noProgressAgentEnds = 0;
		} else {
			noProgressAgentEnds++;
			if (noProgressAgentEnds > NO_PROGRESS_LIMIT) {
				autoLoop = false;
				updateWidget(ctx, state, active, runningExperiment, loopInfo());
				ctx.ui.notify(`autoresearch loop を停止しました: ${NO_PROGRESS_LIMIT}回連続で進捗なし`, "warning");
				return;
			}
		}

		if (maxLoopIterations !== null && loopIterationCount >= maxLoopIterations) {
			autoLoop = false;
			updateWidget(ctx, state, active, runningExperiment, loopInfo());
			ctx.ui.notify(`autoresearch loop が上限 ${maxLoopIterations} 回に達したため停止しました`, "info");
			return;
		}

		loopIterationCount++;
		loopPromptQueued = true;
		updateWidget(ctx, state, active, runningExperiment, loopInfo());
		pi.sendUserMessage(loopFollowUpMessage(!madeProgress), { deliverAs: "followUp" });
	});

	// ─── /autoresearch command ─────────────────────────────────

	pi.registerCommand("autoresearch", {
		description: "autoresearch モードの管理(on / off / status / clear)",
		handler: async (args, ctx) => {
			const parts = (args ?? "").trim().split(/\s+/);
			const sub = parts[0] || "status";
			switch (sub) {
				case "on": { activateAutoresearch(ctx, parts.slice(1).join(" ").trim()); break; }
				case "off": {
					active = false; autoLoop = false; loopPromptQueued = false;
					updateWidget(ctx, state, active, runningExperiment, loopInfo());
					ctx.ui.notify("autoresearch モードを無効にしました", "info");
					break;
				}
				case "clear": {
					const jp = jsonlPath(ctx.cwd);
					try { if (fs.existsSync(jp)) fs.unlinkSync(jp); } catch {}
					deleteContract(ctx.cwd); // P0-4: contract ファイルも削除
					state = freshState(); active = false; autoLoop = false; runningExperiment = null;
					runResultMap.clear(); resetLoopProgress();
					updateWidget(ctx, state, active, runningExperiment, loopInfo());
					ctx.ui.notify("autoresearch のデータをクリアしました", "info");
					break;
				}
				case "status": {
					const kept = countByStatus(state.results, "keep");
					const best = state.bestMetric !== null ? `${state.metricName}=${state.bestMetric}${state.metricUnit}` : "未測定";
					const maxStr = maxLoopIterations === null ? "∞" : String(maxLoopIterations);
					ctx.ui.notify(
						`autoresearch: ${active ? "有効" : "無効"}\n` +
						`loop: ${autoLoop ? "ON" : "OFF"} (${loopIterationCount}/${maxStr})\n` +
						`実験回数: ${state.runCount} / 採用: ${kept} / 最良: ${best}`,
						"info",
					);
					break;
				}
				case "loop": {
					const loopSub = parts[1] || "status";
					if (loopSub === "on") { autoLoop = true; noProgressAgentEnds = 0; loopPromptQueued = false; updateWidget(ctx, state, active, runningExperiment, loopInfo()); ctx.ui.notify("autoresearch loop を有効にしました", "info"); break; }
					if (loopSub === "off") { autoLoop = false; loopPromptQueued = false; updateWidget(ctx, state, active, runningExperiment, loopInfo()); ctx.ui.notify("autoresearch loop を無効にしました", "info"); break; }
					if (loopSub === "max") {
						const raw = parts[2];
						if (raw === "none" || raw === "∞" || raw === "infinite") { maxLoopIterations = null; }
						else { const p = Number(raw); if (!Number.isInteger(p) || p <= 0) { ctx.ui.notify("使い方: loop max <正の整数|none>", "warning"); break; } maxLoopIterations = p; }
						updateWidget(ctx, state, active, runningExperiment, loopInfo());
						ctx.ui.notify(`autoresearch loop max を ${maxLoopIterations ?? "∞"} に設定しました`, "info");
						break;
					}
					ctx.ui.notify(`loop: ${autoLoop ? "ON" : "OFF"} iter=${loopIterationCount}`, "info");
					break;
				}
				default: { activateAutoresearch(ctx, (args ?? "").trim()); break; }
			}
		},
	});

	function activateAutoresearch(ctx: ExtensionContext, purpose: string): void {
		active = true; autoLoop = true; resetLoopProgress(); loopPromptQueued = true;
		updateWidget(ctx, state, active, runningExperiment, loopInfo());
		ctx.ui.notify("autoresearch モードを有効にしました(loop ON)", "info");
		const hasMd = fs.existsSync(mdFilePath(ctx.cwd));
		let msg: string;
		if (hasMd) {
			msg = "autoresearch.md を読み直して再開してください。";
			if (purpose) msg += `\n追加コンテキスト: ${purpose}`;
		} else {
			msg = "autoresearch モードを有効化しました。" +
				"目的・指標・実行コマンドを整理して autoresearch.md とベンチマークスクリプトを作成し、実験を開始してください。" +
				"\n必要なら `/skill:autoresearch-create` で手順を確認できます。";
			if (purpose) msg += `\n目的: ${purpose}`;
		}
		pi.sendUserMessage(msg, { deliverAs: "followUp" });
	}

	const STATUS_LABELS: Record<string, string> = { keep: "採用", discard: "棄却", crash: "クラッシュ", checks_failed: "checks失敗", revert_failed: "revert失敗" };
	const STATUS_PREFIX: Record<string, string> = { keep: "[KEEP]", discard: "[DISCARD]", crash: "[CRASH]", checks_failed: "[CHECKS_FAILED]", revert_failed: "[REVERT_FAILED]" };

	function resolvePrimaryMetricValue(
		metricName: string,
		runResult: { durationSeconds?: number; parsedMetrics?: Record<string, number> | null },
	): { value: number | null; source: "stdout_metric" | "wall_clock" | "missing" } {
		const parsed = runResult.parsedMetrics?.[metricName];
		if (typeof parsed === "number" && Number.isFinite(parsed)) {
			return { value: parsed, source: "stdout_metric" };
		}
		if (
			metricName === "duration_seconds" &&
			typeof runResult.durationSeconds === "number" &&
			Number.isFinite(runResult.durationSeconds)
		) {
			return { value: runResult.durationSeconds, source: "wall_clock" };
		}
		return { value: null, source: "missing" };
	}
	const INACTIVE_RESPONSE = {
		content: [{ type: "text" as const, text: "[ERROR] autoresearch モードが無効です。\n`/autoresearch on` で有効化してください。" }],
		details: {},
	};

	function generateSessionId(name: string): string {
		const ts = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
		const slug = name.replace(/[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g, "-").slice(0, 20);
		return `${ts}-${slug}`;
	}

	function ensureSessionDir(cwd: string): void {
		const dir = sessionDir(cwd, state.sessionId);
		if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
	}

	/** Compute next runSeq from runs.jsonl line count (avoids duplication). */
	function nextRunSeq(cwd: string, sessionId: string): number {
		const rlp = runsLedgerPath(cwd, sessionId);
		const entries = readJsonlEntries(rlp);
		return entries.length + 1;
	}

	/** Look up run data: first in memory map, then fallback to artifact manifest.json. */
	function findRunData(piRunId: string, cwd: string): {
		result: RunResult;
		checks: ChecksResult;
		startedAt: number;
		completedAt: number;
		createdAt: number;
		artifactDir?: string;
		artifactFailed?: boolean;
		runSeq?: number;
	} | undefined {
		// 1. Memory map
		const mem = runResultMap.get(piRunId);
		if (mem) return mem;

		// 2. Fallback: load from artifact manifest (survives process restarts)
		const loaded = loadRunFromArtifact(cwd, state.sessionId, piRunId);
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

	// ═══════════════════════════════════════════════════════════════
	// Tool: autoresearch_evaluate_query
	// ═══════════════════════════════════════════════════════════════

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
			// 評価 tool は autoresearch モード有効/無効に関わらず実行可能(read-only)
			const evaluation = evaluateQueryStatically(params.query);
			const r = evaluation.readiness;
			const m = evaluation.contractDraft.primaryMetric;

			const text = [
				`## クエリ評価結果`,
				``,
				`**判定**: ${evaluation.decision}`,
				``,
				`### 段階別 readiness`,
				`- initReady: ${r.initReady}`,
				`- runReady: ${r.runReady}`,
				`- metricExtractionReady: ${r.metricExtractionReady}`,
				`- checksReady: ${r.checksReady}`,
				`- logReady: ${r.logReady}`,
				``,
				`### 測定方法`,
				`- measurementMethod: ${m.measurementMethod}`,
				`- extractionConfidence: ${m.extractionConfidence.toFixed(2)}`,
				`- extractionRule: ${m.extractionRule ?? "(未定)"}`,
				``,
				`### checks policy`,
				evaluation.contractDraft.checksPolicy,
				``,
				`### スコア`,
				`- readiness: ${evaluation.scores.readiness.toFixed(2)}`,
				`- completeness: ${evaluation.scores.completeness.toFixed(2)}`,
				`- measurability: ${evaluation.scores.measurability.toFixed(2)}`,
				`- commandReadiness: ${evaluation.scores.commandReadiness.toFixed(2)}`,
				`- scopeClarity: ${evaluation.scores.scopeClarity.toFixed(2)}`,
				`- safety: ${evaluation.scores.safety.toFixed(2)}`,
				`- reproducibility: ${evaluation.scores.reproducibility.toFixed(2)}`,
				``,
				evaluation.contractDraft.missingFields.length > 0
					? `### 欠落フィールド\n${evaluation.contractDraft.missingFields.map(f => `- ${f}`).join("\n")}\n`
					: "",
				evaluation.blockingIssues.length > 0
					? `### ブロッキング issue\n${evaluation.blockingIssues.map(i => `- ${i}`).join("\n")}\n`
					: "",
				evaluation.riskFlags.length > 0
					? `### リスク\n${evaluation.riskFlags.map(fl => `- ⚠️ ${fl}`).join("\n")}\n`
					: "",
				evaluation.suggestedRewrite
					? `### 推奨書き換え\n${evaluation.suggestedRewrite}\n`
					: "",
				evaluation.clarifyingQuestions.length > 0
					? `### 確認質問\n${evaluation.clarifyingQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}\n`
					: "",
				`### 実験契約ドラフト`,
				`- 目的: ${evaluation.contractDraft.objective || "(未定)"}`,
				`- 対象: ${evaluation.contractDraft.targetScope.length > 0 ? evaluation.contractDraft.targetScope.join(", ") : "(未定)"}`,
				`- 主指標: ${m.name ?? "(未定)"}(${m.direction})`,
				`- benchmark: ${evaluation.contractDraft.benchmarkCommand ?? "(未定)"}`,
				`- checks: ${evaluation.contractDraft.checksCommand ?? "(未定)"}`,
			].filter(s => s !== false).join("\n");

			return {
				content: [{ type: "text" as const, text }],
				details: evaluation,
			};
		},
	});

	// ═══════════════════════════════════════════════════════════════
	// Tool: autoresearch_init
	// ═══════════════════════════════════════════════════════════════

	// P0-4: init は contract 生成の正本
	// P0-1: git safety を強制
	// P0-3: acceptance policy を指定可能

	const initParamDefs = Type.Object({
		name: Type.String({ description: "実験セッションの名前" }),
		metric_name: Type.String({ description: "主指標名(例: total_ms)" }),
		metric_unit: Type.Optional(Type.String({ description: "単位(例: ms)" })),
		direction: Type.Optional(StringEnum(["lower", "higher"] as const, { description: "デフォルト: lower" })),
		// --- P0: 拡張パラメータ ---
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
		allowed_paths: Type.Optional(Type.Object({}, { additionalProperties: Type.String(), description: "許可パスパターンの配列" })),
		excluded_paths: Type.Optional(Type.Object({}, { additionalProperties: Type.String(), description: "除外パスパターンの配列" })),
	});

	// Validate string enum values for optional fields
	function validateOptionalEnum<T extends string>(value: unknown, valid: readonly T[], _fieldName: string): T | undefined {
		if (value === undefined || value === null) return undefined;
		if (typeof value === "string" && (valid as readonly string[]).includes(value)) return value as T;
		return undefined;
	}

	// ═══════════════════════════════════════════════════════════════
	// Register autoresearch_init tool
	// ═══════════════════════════════════════════════════════════════

	pi.registerTool({
		name: "autoresearch_init",
		label: "autoresearch init",
		description:
			"実験セッションを初期化します。名前・指標・単位・方向を設定し、autoresearch.contract.json と autoresearch.jsonl に保存します。" +
			"\nP0: git repo 必須、clean baseline 必須(変更可能)。acceptance policy / safety policy も指定可能。",
		promptSnippet: "実験セッションの初期化",
		promptGuidelines: [
			"autoresearch_init はセッションの最初に一度だけ。既存設定があれば再初期化しない。",
		],
		parameters: initParamDefs as any,

		async execute(_tc, params, _sig, _ou, ctx) {
			if (!active) return INACTIVE_RESPONSE;

			// --- P0-4: 既存 contract の再初期化拒否 ---
			if (contractExists(ctx.cwd)) {
				const existing = readContract(ctx.cwd);
				return {
					content: [{ type: "text" as const, text: `[ERROR] 既に実験契約が存在します (sessionId: ${existing?.sessionId ?? "unknown"}).\n再初期化する場合は、先に /autoresearch clear を実行してください。\n契約ファイル: ${contractFilePath(ctx.cwd)}` }],
					details: { existingSessionId: existing?.sessionId },
				};
			}

			// --- Extract typed params ---
			const direction = params.direction === "higher" ? "higher" : "lower";
			const metricMethod = validateOptionalEnum(params.metric_method, ["wall_clock", "stdout_metric", "report_file"], "metric_method") ?? "wall_clock" as MetricMethod;
			const checksMode = validateOptionalEnum(params.checks_mode, ["script", "command", "none"], "checks_mode") ?? "script" as ChecksMode;
			const acceptanceMode = validateOptionalEnum(params.acceptance_mode, ["better_than_best", "improvement_threshold", "manual"], "acceptance_mode") ?? "better_than_best" as AcceptanceMode;
			const aggregateMethod = validateOptionalEnum(params.aggregate, ["single", "median", "mean", "min", "max"], "aggregate") ?? "single" as AggregateMethod;

			const sessionId = generateSessionId(params.name);

			// --- P0-1: Build safety policy and validate git safety ---
			const safetyPolicy = {
				requireGit: (params as any).require_git !== false,
				requireCleanBaseline: (params as any).require_clean_baseline !== false,
				allowedPaths: Array.isArray((params as any).allowed_paths) ? (params as any).allowed_paths : [],
				excludedPaths: Array.isArray((params as any).excluded_paths) ? (params as any).excluded_paths : [],
				forbiddenCommandPatterns: DEFAULT_SAFETY.forbiddenCommandPatterns,
			};

			const gitViolations = validateGitSafety(ctx.cwd, safetyPolicy);
			if (gitViolations.length > 0) {
				return {
					content: [{ type: "text" as const, text: `[ERROR] git safety 違反のため初期化できません:\n${gitViolations.map((v, i) => `  ${i + 1}. ${v}`).join("\n")}` }],
					details: { gitViolations },
				};
			}

			// --- P0-4: Build and validate contract ---
			const contract = buildContract({
				name: params.name,
				sessionId,
				metricName: params.metric_name,
				metricUnit: params.metric_unit ?? "",
				direction,
				metricMethod,
				benchmarkCommand: (params as any).benchmark_command ?? "./autoresearch.sh",
				objective: (params as any).objective ?? params.name,
				checksMode,
				checksCommand: (params as any).checks_command,
				acceptanceMode,
				minImprovement: (params as any).min_improvement,
				repeat: (params as any).repeat,
				aggregate: aggregateMethod,
				requireGit: safetyPolicy.requireGit,
				requireCleanBaseline: safetyPolicy.requireCleanBaseline,
				allowedPaths: safetyPolicy.allowedPaths,
				excludedPaths: safetyPolicy.excludedPaths,
			});

			const validation = validateContract(contract);
			if (!validation.valid) {
				return {
					content: [{ type: "text" as const, text: `[ERROR] 契約検証失敗:\n${validation.errors.map((e, i) => `  ${i + 1}. ${e}`).join("\n")}` }],
					details: { errors: validation.errors },
				};
			}

			// --- Write contract file ---
			try {
				writeContract(ctx.cwd, contract);
			} catch (e) {
				return {
					content: [{ type: "text" as const, text: `[ERROR] 契約ファイル書き込み失敗: ${e instanceof Error ? e.message : String(e)}` }],
					details: {},
				};
			}

			// --- Update state ---
			state.name = params.name;
			state.metricName = params.metric_name;
			state.metricUnit = params.metric_unit ?? "";
			state.sessionId = sessionId;
			state.direction = direction;
			state.bestMetric = null;
			state.results = [];
			state.runCount = 0;

			// --- Write JSONL config entry ---
			const jp = jsonlPath(ctx.cwd);
			try {
				fs.appendFileSync(jp, JSON.stringify({
					type: "config", name: state.name, metricName: state.metricName,
					metricUnit: state.metricUnit, direction: state.direction, sessionId,
					contractVersion: contract.version,
				}) + "\n");
			} catch (e) {
				return {
					content: [{ type: "text" as const, text: `[ERROR] JSONL 書き込み失敗: ${e instanceof Error ? e.message : String(e)}` }],
					details: {},
				};
			}

			try { ensureSessionDir(ctx.cwd); } catch {}

			// --- P0-1: Record baseline commit for future diff tracking ---
			const baselineCommit = getBaselineCommit(ctx.cwd);

			// --- Transaction event: contract_created ---
			try {
				appendToJsonl(eventsLedgerPath(ctx.cwd, sessionId), {
					schemaVersion: 1, event: "contract_created", piRunId: "", timestamp: Date.now(),
					details: { sessionId, contractVersion: contract.version, baselineCommit },
				} satisfies EventLedgerEntry);
			} catch { /* best effort */ }

			updateWidget(ctx, state, active, runningExperiment, loopInfo());

			let text = `[OK] 初期化完了\n名前: ${state.name}\n指標: ${state.metricName}(${directionLabel(state.direction)})\nsessionId: ${sessionId}`;
			text += `\n契約: ${contractFilePath(ctx.cwd)}`;
			if (baselineCommit) text += `\nbaseline: ${baselineCommit.slice(0, 12)}`;
			if (validation.warnings.length > 0) {
				text += `\n\n[WARNING]\n${validation.warnings.map((w, i) => `  ${i + 1}. ${w}`).join("\n")}`;
			}
			text += `\n\nacceptance mode: ${contract.acceptance.mode}`;
			text += `\nchecks mode: ${contract.checks.mode}`;
			text += `\nbenchmark: ${contract.benchmarkCommand}`;

			return {
				content: [{ type: "text" as const, text }],
				details: {
					name: state.name, metricName: state.metricName, metricUnit: state.metricUnit,
					direction: state.direction, sessionId, contractVersion: contract.version,
					acceptance: contract.acceptance, safety: contract.safety,
					baselineCommit, warnings: validation.warnings,
				},
			};
		},
	});

	// ═══════════════════════════════════════════════════════════════
	// Tool: autoresearch_run
	// ═══════════════════════════════════════════════════════════════

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
		],
		parameters: Type.Object({
			command: Type.String({ description: "実行するコマンド" }),
			timeout_seconds: Type.Optional(Type.Number({ description: "タイムアウト秒数(デフォルト: 600)" })),
			checks_timeout_seconds: Type.Optional(Type.Number({ description: "checks のタイムアウト秒数(デフォルト: 300)" })),
		}),

		async execute(_tc, params, signal, _ou, ctx) {
			if (!active) return INACTIVE_RESPONSE;

			// --- P0-7: Command policy チェック ---
			const contract = readContract(ctx.cwd);
			if (contract) {
				const cmdViolations = validateCommand(params.command, contract.safety);
				if (cmdViolations.length > 0) {
					return {
						content: [{ type: "text" as const, text: `[ERROR] コマンドが safety policy に違反しています:\n${cmdViolations.map((v, i) => `  ${i + 1}. ${v}`).join("\n")}` }],
						details: { violations: cmdViolations },
					};
				}
			}

			const timeoutMs = (params.timeout_seconds ?? DEFAULT_TIMEOUT_SECONDS) * 1000;
			const piRunId = generatePiRunId(ctx.cwd);
			const createdAt = Date.now();
			const preCommit = getGitShortHash(ctx.cwd);

			runningExperiment = { startedAt: Date.now(), command: params.command };
			updateWidget(ctx, state, active, runningExperiment, loopInfo());

			// Create artifact dir BEFORE execution so streaming logs go there
			let artifactDir: string | undefined;
			let artifactFailed = false;
			try {
				ensureSessionDir(ctx.cwd);
				artifactDir = createRunArtifactDir(ctx.cwd, state.sessionId, piRunId, params.command, runningExperiment.startedAt);
			} catch (e) {
				artifactFailed = true;
			}

			// P0: artifact dir 作成失敗時は benchmark を実行しない(fail-fast)
			if (!artifactDir || artifactFailed) {
				runningExperiment = null;
				updateWidget(ctx, state, active, runningExperiment, loopInfo());
				return {
					content: [{ type: "text", text: `[ERROR] artifact directory を作成できないため benchmark を実行しません。\n長時間 run の監査不能を防ぐため、先に修正してください。\nエラー詳細: ディレクトリ ${path.join(ctx.cwd, ".pi", "autoresearch", state.sessionId, "runs", piRunId)} の作成に失敗しました。` }],
					details: {},
				};
			}

			// Events ledger: started
			appendToJsonl(eventsLedgerPath(ctx.cwd, state.sessionId), {
				schemaVersion: 1, event: "started", piRunId, timestamp: createdAt,
				details: { command: params.command },
			} satisfies EventLedgerEntry);

			// Execute - pass logDir for streaming stdout/stderr
			const result = await runCommand(params.command, ctx.cwd, timeoutMs, signal, artifactDir);
			const completedAt = Date.now();
			const startedAt = runningExperiment.startedAt;
			runningExperiment = null;
			updateWidget(ctx, state, active, runningExperiment, loopInfo());

			// Events ledger: completed / timed_out
			appendToJsonl(eventsLedgerPath(ctx.cwd, state.sessionId), {
				schemaVersion: 1, event: result.timedOut ? "timed_out" : "completed",
				piRunId, timestamp: completedAt,
				details: { exitCode: result.exitCode, durationSeconds: result.durationSeconds, timedOut: result.timedOut, signal: result.signal },
			} satisfies EventLedgerEntry);

			// Checks
			let checks: ChecksResult;
			if (result.passed) {
				checks = await runChecks(ctx.cwd, signal, params.checks_timeout_seconds);
			} else {
				checks = { passed: null, timedOut: false, output: "", stdout: "", stderr: "", durationSeconds: 0 };
			}
			lastChecks = checks;
			lastRunResult = { ...result, piRunId };
			lastRunChecks = checks;

			// Runs ledger - use runs.jsonl line count for runSeq (not state.runCount)
			const runSeq = nextRunSeq(ctx.cwd, state.sessionId);

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

			// Store in memory map AFTER artifact write - artifactFailed reflects actual status
			runResultMap.set(piRunId, { result, checks, startedAt, completedAt, createdAt, artifactDir, artifactFailed, runSeq });

			appendToJsonl(runsLedgerPath(ctx.cwd, state.sessionId), {
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

			// Build response text
			let text = "";
			if (result.timedOut) text = `[TIMEOUT] タイムアウト(${params.timeout_seconds ?? DEFAULT_TIMEOUT_SECONDS}秒)\n`;
			else if (!result.passed) text = `[FAIL] 失敗(終了コード: ${result.exitCode})\n`;
			else text = `[OK] 完了\n`;
			const safeCommand = filterSecrets(result.command);
			text += `実行時間: ${result.durationSeconds.toFixed(1)}秒\n`;
			text += `コマンド: ${safeCommand}\n`;
			text += `piRunId: ${piRunId}\n`;

			if (result.externalRunId) text += `外部 RUN_ID: ${result.externalRunId}\n`;
			if (result.externalArtifactDir) text += `外部 ARTIFACT_DIR: ${result.externalArtifactDir}\n`;
			if (result.externalSummaryPath) text += `外部 SUMMARY_PATH: ${result.externalSummaryPath}\n`;
			if (result.externalViewlogPath) text += `外部 VIEWLOG_PATH: ${result.externalViewlogPath}\n`;
			if (result.externalMetricsPath) text += `外部 METRICS_PATH: ${result.externalMetricsPath}\n`;

			if (artifactFailed) text += `[WARNING] artifact 保存に失敗しました。この run は keep できません。\n`;

			if (checks.passed === true) text += `checks: 成功(${checks.durationSeconds.toFixed(1)}秒)\n`;
			else if (checks.passed === false) {
				text += `checks: 失敗\n`;
				if (checks.output) text += `checks 出力:\n${checks.output}\n`;
				text += `status=checks_failed で記録してください。\n`;
			}

			if (result.parsedMetrics) {
				text += `\n測定指標:\n`;
				for (const [n, v] of Object.entries(result.parsedMetrics)) text += `  METRIC ${n}=${v}\n`;
				const primary = result.parsedMetrics[state.metricName];
				if (primary !== undefined) text += `\n主指標 ${state.metricName}=${primary}${state.metricUnit} を autoresearch_log に報告してください。`;
			}
			if (!(result.parsedMetrics && state.metricName in result.parsedMetrics) && state.metricName === "duration_seconds") {
				text += `\n主指標 duration_seconds=${result.durationSeconds}${state.metricUnit} (wall_clock) を autoresearch_log に報告できます。`;
			}

			const safeOutput = filterSecrets(result.output);
			if (safeOutput) text += `\n出力(末尾):\n${safeOutput}`;
			text += `\npiRunId: ${piRunId}(autoresearch_log の runId に渡してください)`;

			return {
				content: [{ type: "text", text }],
				details: {
					// raw stdout/stderr は secret とサイズの両面で返さない。正本は artifact の stdout.log/stderr.log。
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
					runId: piRunId,
					piRunId,
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
				},
			};
		},
	});

	// ═══════════════════════════════════════════════════════════════
	// Tool: autoresearch_log
	// ═══════════════════════════════════════════════════════════════

	pi.registerTool({
		name: "autoresearch_log",
		label: "autoresearch log",
		description: "実験結果を記録。keep は自動 commit、discard/crash/checks_failed は自動 revert。",
		promptSnippet: "実験結果を記録",
		promptGuidelines: [
			"run 後は必ず log を呼ぶ。",
			"keep: timeout・exitCode!=0・checks失敗・metric不在は拒否。",
			"runId に piRunId を渡す。",
		],
		parameters: Type.Object({
			metric: Type.Number({ description: "主指標の値" }),
			status: StringEnum(["keep", "discard", "crash", "checks_failed"] as const, { description: "結果ステータス" }),
			description: Type.String({ description: "実験内容の短い説明" }),
			runId: Type.Optional(Type.String({ description: "autoresearch_run の piRunId" })),
			commit: Type.Optional(Type.String({ description: "Git commit hash(省略時自動)" })),
			metrics: Type.Optional(Type.Object({}, { additionalProperties: Type.Number(), description: "追加指標" })),
			memo: Type.Optional(Type.String({ description: "メモ" })),
		}),

		async execute(_tc, params, _sig, _ou, ctx) {
			if (!active) return INACTIVE_RESPONSE;

			// --- P0-4: Load experiment contract ---
			const contract = readContract(ctx.cwd);

			// --- Find run data ---
			let matchedPiRunId: string | undefined;
			let matchedRunData: ReturnType<typeof findRunData>;

			if (params.runId) {
				matchedRunData = findRunData(params.runId, ctx.cwd);
				if (!matchedRunData) {
					return {
						content: [{ type: "text", text: `[ERROR] piRunId "${params.runId}" に対応する run が見つかりません。\nメモリにも artifact にも存在しません。正しい piRunId を指定してください。` }],
						details: {},
					};
				}
				matchedPiRunId = params.runId;
			} else if (lastRunResult) {
				matchedPiRunId = lastRunResult.piRunId;
				matchedRunData = findRunData(matchedPiRunId, ctx.cwd);
			} else {
				if (params.status === "keep") {
					return { content: [{ type: "text", text: "[ERROR] 対応する autoresearch_run 結果がありません。\n先に autoresearch_run を実行してから autoresearch_log を呼び出してください。" }], details: {} };
				}
			}

			const matchedResult = matchedRunData?.result;
			const matchedChecks = matchedRunData?.checks;
			const resolvedPrimaryMetric = matchedResult
				? resolvePrimaryMetricValue(state.metricName, matchedResult)
				: { value: null, source: "missing" as const };
			const effectiveMetric = params.status === "keep" && resolvedPrimaryMetric.value !== null
				? resolvedPrimaryMetric.value
				: params.metric;

			// --- keep validation ---
			if (params.status === "keep") {
				const reasons: string[] = [];

				if (!matchedResult) {
					return { content: [{ type: "text", text: "[ERROR] run 結果が存在しないため keep できません。" }], details: {} };
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
				if (runResultMap.has(matchedPiRunId ?? "")) {
					const rd = runResultMap.get(matchedPiRunId ?? "");
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
					return {
						content: [{ type: "text", text: `[ERROR] keep が拒否されました:\n${reasons.map((r, i) => `  ${i + 1}. ${r}`).join("\n")}\n\nstatus=discard または status=crash または status=checks_failed で記録してください。` }],
						details: {},
					};
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
						return {
							content: [{ type: "text", text: `[ERROR] acceptance policy により keep が拒否されました:\n${acceptanceResult.reason}\n\ncandidate: ${effectiveMetric} vs best: ${state.bestMetric}\nacceptance mode: ${contract.acceptance.mode}\nminImprovement: ${(contract.acceptance.minImprovement * 100).toFixed(1)}%\n\nstatus=discard で記録してください。改善が不十分(noise)な場合は、別のアプローチを試してください。` }],
							details: { acceptanceResult, effectiveMetric, bestMetric: state.bestMetric },
						};
					}
				}

				// --- P0-1: 変更ファイルが safety policy に収まっているか ---
				if (contract) {
					const preChangedFiles = getChangedFiles(ctx.cwd);
					const pathViolations = validateChangedFiles(preChangedFiles, contract.safety);
					if (pathViolations.length > 0) {
						return {
							content: [{ type: "text", text: `[ERROR] 変更ファイルが safety policy に違反:\n${pathViolations.map((v, i) => `  ${i + 1}. ${v}`).join("\n")}\n\nstatus=discard で記録してください。許可されたパス内に収まるように変更してください。` }],
							details: { pathViolations, changedFiles: preChangedFiles },
						};
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
					return {
						content: [{ type: "text", text: `[ERROR] git commit に失敗したため keep を記録できません:\n${gr.error}\n\ncommit できない keep は再現性を保証できません。\ngit の状態を確認して再度 autoresearch_log を呼び出してください。` }],
						details: { gitError: gr.error },
					};
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
						ensureSessionDir(ctx.cwd);
						appendToJsonl(eventsLedgerPath(ctx.cwd, state.sessionId), {
							schemaVersion: 1, event: "revert_failed", piRunId: matchedPiRunId ?? "",
							timestamp: Date.now(),
							details: { error: revertResult.error, originalStatus: params.status },
						} satisfies EventLedgerEntry);
					} catch { /* best effort */ }

					// Main JSONL
					try {
						const jp = jsonlPath(ctx.cwd);
						fs.appendFileSync(jp, JSON.stringify({ ...failedEntry }) + "\n");
					} catch { /* best effort */ }

					// P0-6: loop を強制停止
					autoLoop = false;
					updateWidget(ctx, state, active, runningExperiment, loopInfo());

					return {
						content: [{ type: "text", text: `[REVERT_FAILED] 実験 #${run} の revert に失敗しました:\n${revertResult.error}\n\n⚠️ 手動介入が必要です。git の状態を確認し、不要な変更を手動で元してください。\nautoresearch loop を停止しました。` }],
						details: { run, status: "revert_failed", error: revertResult.error },
					};
				}
				entry.postCommit = getGitShortHash(ctx.cwd);
			}
			entry.dirtyAfter = isGitDirty(ctx.cwd);
			entry.commit = commit;

			// P0-2: commit 失敗時はここに到達しないため、ここから state を更新する。
			state.results.push(entry);
			state.runCount = run;
			if (params.status === "keep" && isBestMetric(state.bestMetric, effectiveMetric, state.direction)) {
				state.bestMetric = effectiveMetric;
			}

			// --- Pointers & ledgers ---
			const ledgerErrors: string[] = [];
			try {
				ensureSessionDir(ctx.cwd);
			} catch (e) {
				ledgerErrors.push(`session dir: ${e instanceof Error ? e.message : String(e)}`);
			}

			// Latest pointer
			try {
				writePointer(latestPointerPath(ctx.cwd, state.sessionId), {
					piRunId: matchedPiRunId ?? "", runSeq, metric: effectiveMetric,
					timestamp: entry.timestamp, gitCommit: entry.postCommit ?? preCommit,
				});
			} catch (e) { ledgerErrors.push(`latest pointer: ${e instanceof Error ? e.message : String(e)}`); }

			// Best pointer
			if (params.status === "keep") {
				try {
					const cur = readPointer(bestPointerPath(ctx.cwd, state.sessionId));
					if (isBestPointerMetric(effectiveMetric, cur, state.direction)) {
						writePointer(bestPointerPath(ctx.cwd, state.sessionId), {
							piRunId: matchedPiRunId ?? "", runSeq, metric: effectiveMetric,
							timestamp: entry.timestamp, gitCommit: entry.postCommit ?? preCommit,
						});
					}
				} catch (e) { ledgerErrors.push(`best pointer: ${e instanceof Error ? e.message : String(e)}`); }
			}

			// Metrics ledger
			try {
				appendToJsonl(metricsLedgerPath(ctx.cwd, state.sessionId), {
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
				appendToJsonl(decisionsLedgerPath(ctx.cwd, state.sessionId), {
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
				appendToJsonl(eventsLedgerPath(ctx.cwd, state.sessionId), {
					schemaVersion: 1, event: "logged", piRunId: matchedPiRunId ?? "",
					timestamp: entry.timestamp, details: { status: params.status, metric: effectiveMetric, metricSource: entry.metricSource, runSeq },
				} satisfies EventLedgerEntry);
			} catch (e) { ledgerErrors.push(`event ledger: ${e instanceof Error ? e.message : String(e)}`); }

			// --- Main JSONL ---
			const jp = jsonlPath(ctx.cwd);
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
				return { content: [{ type: "text", text: `[ERROR] JSONL 書き込み失敗: ${e instanceof Error ? e.message : String(e)}` }], details: {} };
			}

			lastLoggedRun = run;
			updateWidget(ctx, state, active, runningExperiment, loopInfo());
			if (matchedPiRunId) runResultMap.delete(matchedPiRunId);

			const kept = countByStatus(state.results, "keep");
			const prefix = STATUS_PREFIX[params.status] ?? "[UNKNOWN]";
			let text = `${prefix} 実験 #${run} を記録: ${STATUS_LABELS[params.status] ?? params.status}\n`;
			text += `説明: ${params.description}\n`;
			text += `指標: ${state.metricName}=${effectiveMetric}${state.metricUnit}\n`;
			if (entry.metricSource) text += `指標ソース: ${entry.metricSource}\n`;
			text += `コミット: ${commit}\n`;
			if (entry.piRunId) text += `piRunId: ${entry.piRunId}\n`;
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

			lastChecks = null; lastRunResult = null; lastRunChecks = null;

			if (ledgerErrors.length > 0) {
				text += `\n[WARNING] ledger 書き込み一部失敗: ${ledgerErrors.join(", ")}`;
			}

			return {
				content: [{ type: "text", text }],
				details: {
					run, runId: entry.piRunId, piRunId: entry.piRunId,
					status: params.status, metric: effectiveMetric, metricSource: entry.metricSource, bestMetric: state.bestMetric,
					kept, commit, preCommit, postCommit: entry.postCommit, changedFiles,
					externalRunId: entry.externalRunId, externalArtifactDir: entry.externalArtifactDir,
					ledgerErrors: ledgerErrors.length > 0 ? ledgerErrors : undefined,
				},
			};
		},
	});

	// ═══════════════════════════════════════════════════════════════
	// Helper functions for contract mode tools
	// ═══════════════════════════════════════════════════════════════

	function resolvePrimaryMetricFromRun(
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

	function isWorkingTreeCleanForContract(cwd: string): boolean {
		return filterInternalPaths(getChangedFiles(cwd)).length === 0;
	}

	function getContractRelevantChangedFiles(cwd: string): string[] {
		return filterInternalPaths(getChangedFiles(cwd));
	}

	function aggregateMeasurementsFromValues(
		values: number[],
		method: "median" | "mean" | "min" | "max",
	): number | null {
		if (values.length === 0) return null;
		if (values.length === 1) return values[0];
		const sorted = [...values].sort((a, b) => a - b);
		switch (method) {
			case "median": {
				const mid = Math.floor(sorted.length / 2);
				return sorted.length % 2 === 0
					? (sorted[mid - 1] + sorted[mid]) / 2
					: sorted[mid];
			}
			case "mean":
				return values.reduce((s, v) => s + v, 0) / values.length;
			case "min":
				return sorted[0];
			case "max":
				return sorted[sorted.length - 1];
		}
	}

	// ═══════════════════════════════════════════════════════════════
	// Tool: autoresearch_plan
	// ═══════════════════════════════════════════════════════════════

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
		],
		parameters: Type.Object({
			query: Type.String({ description: "ユーザの自然文クエリ" }),
		}),

		async execute(_tc, params, _sig, _ou, ctx) {
			// Use queryEvaluation to help draft the plan
			const evaluation = evaluateQueryStatically(params.query);

			const m = evaluation.contractDraft.primaryMetric;
			const metricName = m.name ?? "duration_seconds";
			const metricDirection = m.direction === "higher" ? "higher" : "lower";
			const metricSource = m.measurementMethod === "wall_clock" ? "wall_clock" : "metric_line";
			const suggestedBenchmarkCommand = evaluation.contractDraft.benchmarkCommand ?? "./autoresearch.sh";
			const contractBenchmarkCommand = "bash ./autoresearch.sh";

			// Build contract JSONC
			const contractDraft: AutoresearchContractV1 = {
				schemaVersion: "autoresearch/v1",
				objective: {
					summary: evaluation.contractDraft.objective || params.query,
					successDefinition: `${metricName} improves in ${metricDirection} direction`,
				},
				scope: {
					allowedWritePaths: ["src/**", "tests/**", "lib/**"],
					forbiddenWritePaths: [
						"autoresearch.sh",
						"checks.sh",
						"benchmarks/**",
						"benchmark/**",
						"fixtures/**",
						"test/fixtures/**",
						"package-lock.json",
						"pnpm-lock.yaml",
						"yarn.lock",
					],
					immutableReadPaths: [
						"autoresearch.sh",
						"checks.sh",
						"package.json",
						"package-lock.json",
						"pnpm-lock.yaml",
						"yarn.lock",
						"benchmarks/**",
						"benchmark/**",
						"fixtures/**",
						"test/fixtures/**",
					],
					requireGit: true,
					requireCleanGitWorktree: true,
				},
				evaluation: {
					benchmark: {
						command: {
							argv: ["bash", "./autoresearch.sh"],
							cwd: ".",
						},
						timeoutSeconds: 600,
						repeats: 3,
						aggregate: "median",
					},
					primaryMetric: {
						name: metricName,
						direction: metricDirection,
						source: metricSource === "wall_clock"
							? { type: "wall_clock" }
							: { type: "metric_line", format: "METRIC <name>=<number>", fallback: "wall_clock" },
					},
					checks: evaluation.contractDraft.checksCommand
						? [{
							name: "default-checks",
							command: { argv: ["bash", "./checks.sh"], cwd: "." },
							timeoutSeconds: 300,
							required: true,
						}]
						: [],
				},
				acceptance: {
					mode: "better_than_baseline",
					minRelativeImprovement: 0.02,
					requireImprovementAboveNoiseFloor: true,
					requireAllChecksPass: true,
					rejectIfMetricMissing: true,
					rejectIfImmutableReadPathChanged: true,
					rejectIfForbiddenFilesChanged: true,
					rejectIfBenchmarkChanged: true,
				},
				loop: {
					maxIterations: 50,
					maxRuntimeMinutes: 120,
					maxConsecutiveNoImprovement: 3,
					maxConsecutiveFailures: 2,
				},
				failurePolicy: {
					onBenchmarkFailure: "discard",
					onCheckFailure: "discard",
					onMetricMissing: "discard",
					onContractViolation: "pause",
					onRevertFailure: "pause",
				},
			};

			// Build plan markdown
			const md = [
				`# Autoresearch Plan`,
				``,
				`## User Query`,
				``,
				params.query,
				``,
				`## Interpreted Objective`,
				``,
				contractDraft.objective.summary,
				``,
				`## Assumptions`,
				``,
				...evaluation.contractDraft.constraints.map((c) => `- ${c}`),
				`- Platform: ${process.platform}`,
				``,
				`## Unknowns`,
				``,
				...evaluation.clarifyingQuestions.map((q) => `- ${q}`),
				``,
				`## Non-goals`,
				``,
				`- Modifying the benchmark script itself`,
				`- Changing the metric definition mid-experiment`,
				``,
				`## Scope Note`,
				``,
				`The default scope is a reasonable starting point. Edit the contract block to match your repo structure:`,
				`- Adjust allowedWritePaths if source is not in src/ or lib/`,
				`- Add benchmark/fixture paths to immutableReadPaths if applicable`,
				`- Add sensitive paths to forbiddenWritePaths`,
				``,
				`## Proposed Loop Strategy`,
				``,
				`1. Baseline measurement with current code`,
				`2. Apply candidate optimization`,
				`3. Run benchmark with ${contractDraft.evaluation.benchmark.repeats} repeats`,
				`4. Evaluate against contract acceptance criteria`,
				`5. Keep if improvement exceeds threshold, otherwise discard and revert`,
				``,
				`## Evaluation Contract`,
				``,
				"```autoresearch-contract jsonc",
				JSON.stringify(contractDraft, null, 2),
				"```",
			].join("\n");

			// Write plan file
			const pp = planPath(ctx.cwd);
			try {
				fs.writeFileSync(pp, md, "utf8");
			} catch (e) {
				return {
					content: [{ type: "text" as const, text: `[ERROR] plan file の書き込みに失敗: ${e instanceof Error ? e.message : String(e)}` }],
					details: {},
				};
			}

			const contractHash = computeContractHash(contractDraft);

			let text = `[OK] plan draft を生成しました: ${pp}\n`;
			text += `\n### Query 評価\n`;
			text += `判定: ${evaluation.decision}\n`;
			text += `主指標: ${metricName} (${metricDirection})\n`;
			text += `benchmark: ${contractBenchmarkCommand}\n`;
			text += `note: actual benchmark logic should live in autoresearch.sh, or edit the contract argv explicitly. Suggested by query evaluation: ${suggestedBenchmarkCommand}\n`;
			if (evaluation.blockingIssues.length > 0) {
				text += `\n### ブロッキング issue\n`;
				for (const issue of evaluation.blockingIssues) text += `- ${issue}\n`;
			}
			if (evaluation.clarifyingQuestions.length > 0) {
				text += `\n### 確認質問\n`;
				for (const q of evaluation.clarifyingQuestions) text += `- ${q}\n`;
			}
			text += `\nplan を確認・編集した後、autoresearch_approve で承認してください。`;

			return {
				content: [{ type: "text" as const, text }],
				details: { planPath: pp, decision: evaluation.decision, contractHash },
			};
		},
	});

	// ═══════════════════════════════════════════════════════════════
	// Tool: autoresearch_approve
	// ═══════════════════════════════════════════════════════════════

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
			const pp = params.plan_path ?? planPath(ctx.cwd);
			if (!fs.existsSync(pp)) {
				return {
					content: [{ type: "text" as const, text: `[ERROR] plan file が見つかりません: ${pp}\n先に autoresearch_plan で plan を生成してください。` }],
					details: {},
				};
			}

			const planMarkdown = fs.readFileSync(pp, "utf8");

			let jsonc: string;
			try {
				const block = extractContractBlockFromPlan(planMarkdown);
				jsonc = block.jsonc;
			} catch (e) {
				return {
					content: [{ type: "text" as const, text: `[ERROR] contract block の抽出に失敗: ${e instanceof Error ? e.message : String(e)}` }],
					details: {},
				};
			}

			let contractObj: unknown;
			try {
				contractObj = parseJsonc(jsonc);
			} catch (e) {
				return {
					content: [{ type: "text" as const, text: `[ERROR] JSONC の parse に失敗: ${e instanceof Error ? e.message : String(e)}` }],
					details: {},
				};
			}

			const validation = validateContractV1(contractObj);
			if (!validation.valid) {
				return {
					content: [{ type: "text" as const, text: `[ERROR] contract の検証に失敗:\n${validation.errors.map((e, i) => `  ${i + 1}. ${e}`).join("\n")}` }],
					details: { errors: validation.errors },
				};
			}

			const contract = contractObj as AutoresearchContractV1;

			const allCommands = [
				contract.evaluation.benchmark.command,
				...contract.evaluation.checks.map((c) => c.command),
			];
			for (const cmd of allCommands) {
				if (!cmd.argv || cmd.argv.length === 0) {
					return {
						content: [{ type: "text" as const, text: `[ERROR] command.argv が空です: ${JSON.stringify(cmd)}` }],
						details: {},
					};
				}
			}

			// Command safety validation
			const safetyErrors = validateCommandSafety(allCommands, ctx.cwd);
			if (safetyErrors.length > 0) {
				return {
					content: [{ type: "text" as const, text: `[ERROR] command safety validation failed:\n${safetyErrors.map((e, i) => `  ${i + 1}. ${e}`).join("\n")}` }],
					details: { safetyErrors },
				};
			}

			if (contract.scope.requireGit && !isGitRepo(ctx.cwd)) {
				return {
					content: [{ type: "text" as const, text: `[ERROR] git repo ではありません。contract で requireGit=true が指定されています。` }],
					details: {},
				};
			}
			if (contract.scope.requireCleanGitWorktree && !isWorkingTreeCleanForContract(ctx.cwd)) {
				const relevantChangedFiles = getContractRelevantChangedFiles(ctx.cwd);
				return {
					content: [{ type: "text" as const, text: `[ERROR] working tree に contract-relevant な未コミット変更があります。contract で requireCleanGitWorktree=true が指定されています。\n対象: ${relevantChangedFiles.join(", ")}\n先に commit または stash してください。` }],
					details: { changedFiles: relevantChangedFiles },
				};
			}

			const contractHash = computeContractHash(contract);
			const contractId = "0001";
			ensureAutoresearchDir(ctx.cwd);
			appendEvent(ctx.cwd, {
				timestamp: Date.now(),
				contractId,
				contractHash,
				event: "approve_started",
				details: {},
			});

			const immutableResult = await computeImmutableReadSetHash(
				ctx.cwd,
				contract.scope.immutableReadPaths,
			);

			const envFingerprint = await collectEnvironmentFingerprint(
				ctx.cwd,
				immutableResult.hash,
			);

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
					appendEvent(ctx.cwd, {
						timestamp: Date.now(),
						contractId,
						contractHash,
						event: "baseline_run_failed",
						details: { runIndex: i, runId, exitCode: runResult.exitCode, timedOut: runResult.timedOut },
					});
					return {
						content: [{ type: "text" as const, text: `[ERROR] baseline run ${i + 1}/${contract.evaluation.benchmark.repeats} failed.${runResult.timedOut ? " Timed out." : ""} exitCode=${runResult.exitCode}\nBaseline cannot be established from failed benchmark. Fix the benchmark command and retry.` }],
						details: { runIndex: i, exitCode: runResult.exitCode, timedOut: runResult.timedOut },
					};
				}

				const metricValue = resolvePrimaryMetricFromRun(contract.evaluation.primaryMetric, runResult);

				// --- P0: Reject when metric missing unless explicit wall_clock fallback ---
				if (metricValue === null) {
					const source = contract.evaluation.primaryMetric.source;
					const hasWallClockFallback = source.type === "metric_line" && source.fallback === "wall_clock";
					const isWallClock = source.type === "wall_clock";
					if (!hasWallClockFallback && !isWallClock) {
						appendEvent(ctx.cwd, {
							timestamp: Date.now(),
							contractId,
							contractHash,
							event: "baseline_metric_missing",
							details: { runIndex: i, runId, metricName: contract.evaluation.primaryMetric.name },
						});
						return {
							content: [{ type: "text" as const, text: `[ERROR] Primary metric "${contract.evaluation.primaryMetric.name}" not found in baseline run ${i + 1}.\nMetric source is "${source.type}" with no wall_clock fallback.\nEnsure the benchmark outputs METRIC ${contract.evaluation.primaryMetric.name}=<number> to stdout.` }],
							details: { metricName: contract.evaluation.primaryMetric.name, sourceType: source.type },
						};
					}
				}

				baselineRuns.push({ runId, metric: metricValue ?? runResult.durationSeconds, durationSeconds: runResult.durationSeconds });
				appendEvent(ctx.cwd, {
					timestamp: Date.now(),
					contractId,
					contractHash,
					event: "baseline_run_completed",
					details: { runIndex: i, runId, exitCode: runResult.exitCode, metric: metricValue, durationSeconds: runResult.durationSeconds, timedOut: runResult.timedOut },
				});
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

			appendEvent(ctx.cwd, {
				timestamp: Date.now(),
				contractId,
				contractHash,
				event: "approve_completed",
				details: { baselineValue: noise.aggregate, noiseRange: noise.relativeRange, samples: noise.samples.length },
			});

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

			return {
				content: [{ type: "text" as const, text }],
				details: { contractPath: currentContractPath(ctx.cwd), lockPath: currentLockPath(ctx.cwd), baseline: noise, contractHash, gitCommit },
			};
		},
	});

	// ═══════════════════════════════════════════════════════════════
	// Tool: autoresearch_run_contract
	// ═══════════════════════════════════════════════════════════════

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
		}),

		async execute(_tc, params, signal, _ou, ctx) {
			const contract = readCurrentContract(ctx.cwd);
			const lock = readLockFile(ctx.cwd);

			if (!contract) {
				return {
					content: [{ type: "text" as const, text: `[ERROR] current contract が見つかりません。\n先に autoresearch_approve を実行してください。` }],
					details: {},
				};
			}
			if (!lock) {
				return {
					content: [{ type: "text" as const, text: `[ERROR] lock file が見つかりません。\n先に autoresearch_approve を実行してください。` }],
					details: {},
				};
			}

			const currentHash = computeContractHash(contract);
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
				return {
					content: [{ type: "text" as const, text: `[PAUSE] contract hash が lock と一致しません。\nexpected: ${lock.contractHash}\nactual: ${currentHash}\ncontract が承認後に変更されました。` }],
					details: { decision: "pause" },
				};
			}

			if (contract.scope.requireGit && !isGitRepo(ctx.cwd)) {
				return {
					content: [{ type: "text" as const, text: `[ERROR] git repo ではありません。` }],
					details: {},
				};
			}

			// Pre-check state (logged for diagnostics only)
			const preChangedFiles = getChangedFiles(ctx.cwd);

			appendEvent(ctx.cwd, {
				timestamp: Date.now(),
				contractId: lock.contractId,
				contractHash: currentHash,
				event: "contract_run_started",
				details: { reason: params.reason, iterationLabel: params.iteration_label, preChangedFilesCount: preChangedFiles.length },
			});

			// --- Run checks ---
			const checkResults = new Map<string, boolean>();
			for (const check of contract.evaluation.checks) {
				const checkCwd = resolveCwdInsideRepo(ctx.cwd, check.command.cwd);
				const checkResult = await runArgvCommand(
					{ argv: check.command.argv, cwd: checkCwd, env: check.command.env },
					check.timeoutSeconds * 1000,
					signal,
				);
				checkResults.set(check.name, checkResult.passed);
			}

			// --- Run benchmark repeats ---
			const benchmarkCwd = resolveCwdInsideRepo(ctx.cwd, contract.evaluation.benchmark.command.cwd);
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

				appendEvent(ctx.cwd, {
					timestamp: Date.now(),
					contractId: lock.contractId,
					contractHash: currentHash,
					event: "benchmark_run_completed",
					details: { runIndex: i, exitCode: result.exitCode, metric: metricValue, durationSeconds: result.durationSeconds, timedOut: result.timedOut },
				});
			}

			// --- POST state: re-check changed files and immutable hash AFTER benchmark ---
			// This catches mutations made by checks or benchmark scripts.
			// Filter internal paths (.autoresearch/**, .pi/**) from changedFiles
			// since these are audit artifacts, not candidate patches.
			const changedFiles = filterInternalPaths(getChangedFiles(ctx.cwd));
			const immutableResult = await computeImmutableReadSetHash(ctx.cwd, contract.scope.immutableReadPaths);
			const immutableReadSetHashMatches = immutableResult.hash === lock.environment.immutableReadSetHash;

			appendEvent(ctx.cwd, {
				timestamp: Date.now(),
				contractId: lock.contractId,
				contractHash: currentHash,
				event: "post_state_captured",
				details: { postChangedFilesCount: changedFiles.length, immutableHashMatch: immutableReadSetHashMatches },
			});

			const aggregateMethod = contract.evaluation.benchmark.aggregate;
			const candidateMetric = measurements.length > 0
				? aggregateMeasurementsFromValues(measurements, aggregateMethod)
				: null;

			const evaluatorInput: EvaluatorInput = {
				contract,
				lock,
				bestMetric: state.bestMetric,
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
				details: { ...evaluatorResult.details, measurements, changedFiles, reason: params.reason, iterationLabel: params.iteration_label },
			});

			// --- Append to runs.jsonl and metrics.jsonl for audit ---
			try {
				ensureSessionDir(ctx.cwd);
				const runSeq = nextRunSeq(ctx.cwd, state.sessionId);
				const now = Date.now();
				const postCommit = getGitShortHash(ctx.cwd);
				appendToJsonl(runsLedgerPath(ctx.cwd, state.sessionId), {
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
				appendToJsonl(metricsLedgerPath(ctx.cwd, state.sessionId), {
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
					iteration: state.runCount + 1,
					decision: evaluatorResult.decision,
					measurements,
					representativeMetric: evaluatorResult.representativeMetric,
					reference: evaluatorResult.reference,
					changedFiles,
					checkResults: Object.fromEntries(checkResults),
					durationSeconds: 0,
				});
				appendContractMetric(ctx.cwd, {
					timestamp: now,
					contractId: lock.contractId,
					contractHash: currentHash,
					iteration: state.runCount + 1,
					metricName: contract.evaluation.primaryMetric.name,
					metricValue: evaluatorResult.representativeMetric,
					allMeasurements: measurements,
					aggregateMethod: contract.evaluation.benchmark.aggregate,
					decision: evaluatorResult.decision,
				});
			} catch { /* best effort */ }

			if (evaluatorResult.decision === "keep") {
				const gr = gitAutoCommit(
					ctx.cwd,
				`[autoresearch] ${params.reason ?? "contract run"}\n\nDecision: keep\nMetric: ${evaluatorResult.representativeMetric}\nImprovement: ${evaluatorResult.improvement}\nRate: ${evaluatorResult.improvementRate}`,
				);
				if (gr.error) {
					appendEvent(ctx.cwd, { timestamp: Date.now(), contractId: lock.contractId, contractHash: currentHash, event: "decision_pause", details: { reason: "git commit failed", error: gr.error } });
					return {
						content: [{ type: "text" as const, text: `[PAUSE] git commit に失敗しました: ${gr.error}` }],
						details: { decision: "pause", error: gr.error },
					};
				}

				state.runCount++;
				if (candidateMetric !== null && isBestMetric(state.bestMetric, candidateMetric, state.direction)) {
					state.bestMetric = candidateMetric;
				}

				appendEvent(ctx.cwd, { timestamp: Date.now(), contractId: lock.contractId, contractHash: currentHash, event: "decision_keep", details: { metric: evaluatorResult.representativeMetric, commit: gr.commit } });
				updateWidget(ctx, state, active, runningExperiment, loopInfo());

				let text = `[KEEP] 改善が承認されました\n`;
				text += `metric: ${evaluatorResult.representativeMetric}\n`;
				text += `reference: ${evaluatorResult.reference}\n`;
				text += `improvement: ${evaluatorResult.improvement}\n`;
				text += `rate: ${((evaluatorResult.improvementRate ?? 0) * 100).toFixed(2)}%\n`;
				text += `reason: ${evaluatorResult.reason}\n`;
				if (gr.committed) text += `commit: ${gr.commit}\n`;
				text += `\n次の候補を実装して、再度 autoresearch_run_contract を実行してください。`;
				return {
					content: [{ type: "text" as const, text }],
					details: { decision: "keep", metric: evaluatorResult.representativeMetric, reference: evaluatorResult.reference, improvement: evaluatorResult.improvement, improvementRate: evaluatorResult.improvementRate, commit: gr.commit },
				};
			} else if (evaluatorResult.decision === "discard") {
				const rv = gitAutoRevert(ctx.cwd);
				if (!rv.reverted) {
					appendEvent(ctx.cwd, { timestamp: Date.now(), contractId: lock.contractId, contractHash: currentHash, event: "revert_failed", details: { error: rv.error } });
					return {
						content: [{ type: "text" as const, text: `[PAUSE] revert に失敗しました: ${rv.error}\n手動介入が必要です。` }],
						details: { decision: "pause", error: rv.error },
					};
				}

				state.runCount++;
				appendEvent(ctx.cwd, { timestamp: Date.now(), contractId: lock.contractId, contractHash: currentHash, event: "decision_discard", details: { metric: evaluatorResult.representativeMetric, reason: evaluatorResult.reason } });
				updateWidget(ctx, state, active, runningExperiment, loopInfo());

				let text = `[DISCARD] 改善不十分のため棄却しました\n`;
				text += `metric: ${evaluatorResult.representativeMetric}\n`;
				text += `reference: ${evaluatorResult.reference}\n`;
				text += `reason: ${evaluatorResult.reason}\n`;
				text += `\nrevert 完了。次の候補を実装して、再度 autoresearch_run_contract を実行してください。`;
				return {
					content: [{ type: "text" as const, text }],
					details: { decision: "discard", metric: evaluatorResult.representativeMetric, reference: evaluatorResult.reference, reason: evaluatorResult.reason },
				};
			} else {
				appendEvent(ctx.cwd, { timestamp: Date.now(), contractId: lock.contractId, contractHash: currentHash, event: "decision_pause", details: { reason: evaluatorResult.reason } });
				let text = `[PAUSE] 実験を一時停止しました\n`;
				text += `reason: ${evaluatorResult.reason}\n`;
				text += `\n変更は working tree に残っています。問題を解決してから再開してください。`;
				return {
					content: [{ type: "text" as const, text }],
					details: { decision: "pause", reason: evaluatorResult.reason },
				};
			}
		},
	});
}
