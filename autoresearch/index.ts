/**
 * autoresearch — Pi 拡張機能: 自律的実験ループ（日本語 UI）。
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
	runCommand,
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
} from "./runner.js";
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
	"## autoresearch モード（アクティブ）",
	"",
	"現在は autoresearch モードです。以下のルールに従って自律的に実験を繰り返してください。",
	"",
	"1. 最初に `autoresearch.md` を読む（存在する場合）",
	"2. `autoresearch_init` でセッションを初期化（未初期化の場合）",
	"3. `autoresearch_run` でコマンドを実行し、結果を測定",
	"4. 必ず `autoresearch_log` で結果を記録",
	"5. `autoresearch_log` が自動で git commit / revert を行うため、手動 git 操作は不要",
	"6. ユーザーに毎回継続確認しない — 停止されるまで繰り返す",
	"7. Ralph 方式: 1ターンでは原則1つの実験だけを完了し、次ターンに知見を引き継ぐ",
	"8. 表示・報告は日本語で行う",
	"9. `autoresearch.jsonl` に履歴が自動保存される",
	"10. `autoresearch.md` の Codebase Patterns / 試したことを更新し、次イテレーションの記憶にする",
	"11. 有望だが今すぐ試さない最適化案は `autoresearch.ideas.md` に追記する",
	`12. すべての有望な実験が尽きたら ${COMPLETE_MARKER} を返して停止を宣言する`,
	"",
	"### long-run benchmark での注意",
	"",
	"- 長時間実行コマンド（数十分〜数時間）では `timeout_seconds` を明示指定してください",
	"- `--webui` や watch server のように終了しないコマンドを benchmark command に入れないでください",
	"- 外部 benchmark が `RUN_ID` / `ARTIFACT_DIR` / `METRIC` を stdout に出す場合、pi 側で自動保存します",
	"",
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
		description: "autoresearch モードの管理（on / off / status / clear）",
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
		ctx.ui.notify("autoresearch モードを有効にしました（loop ON）", "info");
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

	const STATUS_LABELS: Record<string, string> = { keep: "採用", discard: "棄却", crash: "クラッシュ", checks_failed: "checks失敗" };
	const STATUS_PREFIX: Record<string, string> = { keep: "[KEEP]", discard: "[DISCARD]", crash: "[CRASH]", checks_failed: "[CHECKS_FAILED]" };
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
	// Tool: autoresearch_init
	// ═══════════════════════════════════════════════════════════════

	pi.registerTool({
		name: "autoresearch_init",
		label: "autoresearch init",
		description: "実験セッションを初期化します。名前・指標・単位・方向を設定し、autoresearch.jsonl に保存します。",
		promptSnippet: "実験セッションの初期化",
		promptGuidelines: ["autoresearch_init はセッションの最初に一度だけ。既存設定があれば再初期化しない。"],
		parameters: Type.Object({
			name: Type.String({ description: "実験セッションの名前" }),
			metric_name: Type.String({ description: "主指標名（例: total_ms）" }),
			metric_unit: Type.Optional(Type.String({ description: "単位（例: ms）" })),
			direction: Type.Optional(StringEnum(["lower", "higher"] as const, { description: "デフォルト: lower" })),
		}),

		async execute(_tc, params, _sig, _ou, ctx) {
			if (!active) return INACTIVE_RESPONSE;
			const sessionId = generateSessionId(params.name);
			state.name = params.name;
			state.metricName = params.metric_name;
			state.metricUnit = params.metric_unit ?? "";
			state.sessionId = sessionId;
			if (params.direction === "lower" || params.direction === "higher") state.direction = params.direction;
			state.bestMetric = null; state.results = []; state.runCount = 0;

			const jp = jsonlPath(ctx.cwd);
			try {
				fs.appendFileSync(jp, JSON.stringify({ type: "config", name: state.name, metricName: state.metricName, metricUnit: state.metricUnit, direction: state.direction, sessionId }) + "\n");
			} catch (e) {
				return { content: [{ type: "text", text: `[ERROR] JSONL 書き込み失敗: ${e instanceof Error ? e.message : String(e)}` }], details: {} };
			}
			try { ensureSessionDir(ctx.cwd); } catch {}
			updateWidget(ctx, state, active, runningExperiment, loopInfo());
			return {
				content: [{ type: "text", text: `[OK] 初期化完了\n名前: ${state.name}\n指標: ${state.metricName}（${directionLabel(state.direction)}）\nsessionId: ${sessionId}` }],
				details: { name: state.name, metricName: state.metricName, metricUnit: state.metricUnit, direction: state.direction, sessionId },
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
			"終了しないコマンド（webui 等）は入れない。",
		],
		parameters: Type.Object({
			command: Type.String({ description: "実行するコマンド" }),
			timeout_seconds: Type.Optional(Type.Number({ description: "タイムアウト秒数（デフォルト: 600）" })),
			checks_timeout_seconds: Type.Optional(Type.Number({ description: "checks のタイムアウト秒数（デフォルト: 300）" })),
		}),

		async execute(_tc, params, signal, _ou, ctx) {
			if (!active) return INACTIVE_RESPONSE;

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

			// P0: artifact dir 作成失敗時は benchmark を実行しない（fail-fast）
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

			// Execute — pass logDir for streaming stdout/stderr
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

			// Runs ledger — use runs.jsonl line count for runSeq (not state.runCount)
			const runSeq = nextRunSeq(ctx.cwd, state.sessionId);

			// Write remaining artifacts (manifest, result.json, metrics.json, checks)
			// P0: 書き込み失敗時は artifactFailed を確実に記録
			if (artifactDir) {
				try {
					writeRunArtifacts(artifactDir, result, piRunId, startedAt, completedAt, runSeq);
					if (checks.passed !== null) {
						writeChecksArtifacts(artifactDir, checks);
					} else {
						// No checks to run — mark artifact complete now
						markArtifactComplete(artifactDir);
					}
				} catch {
					artifactFailed = true;
				}
			}
			if (!artifactDir) artifactFailed = true;

			// Store in memory map AFTER artifact write — artifactFailed reflects actual status
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
			if (result.timedOut) text = `[TIMEOUT] タイムアウト（${params.timeout_seconds ?? DEFAULT_TIMEOUT_SECONDS}秒）\n`;
			else if (!result.passed) text = `[FAIL] 失敗（終了コード: ${result.exitCode}）\n`;
			else text = `[OK] 完了\n`;
			text += `実行時間: ${result.durationSeconds.toFixed(1)}秒\n`;
			text += `コマンド: ${result.command}\n`;
			text += `piRunId: ${piRunId}\n`;

			if (result.externalRunId) text += `外部 RUN_ID: ${result.externalRunId}\n`;
			if (result.externalArtifactDir) text += `外部 ARTIFACT_DIR: ${result.externalArtifactDir}\n`;
			if (result.externalSummaryPath) text += `外部 SUMMARY_PATH: ${result.externalSummaryPath}\n`;
			if (result.externalViewlogPath) text += `外部 VIEWLOG_PATH: ${result.externalViewlogPath}\n`;
			if (result.externalMetricsPath) text += `外部 METRICS_PATH: ${result.externalMetricsPath}\n`;

			if (artifactFailed) text += `[WARNING] artifact 保存に失敗しました。この run は keep できません。\n`;

			if (checks.passed === true) text += `checks: 成功（${checks.durationSeconds.toFixed(1)}秒）\n`;
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

			if (result.output) text += `\n出力（末尾）:\n${result.output}`;
			text += `\npiRunId: ${piRunId}（autoresearch_log の runId に渡してください）`;

			return {
				content: [{ type: "text", text }],
				details: {
					...result, runId: piRunId, piRunId, checks, preCommit,
					startedAt, completedAt, createdAt, artifactFailed,
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
			commit: Type.Optional(Type.String({ description: "Git commit hash（省略時自動）" })),
			metrics: Type.Optional(Type.Object({}, { additionalProperties: Type.Number(), description: "追加指標" })),
			memo: Type.Optional(Type.String({ description: "メモ" })),
		}),

		async execute(_tc, params, _sig, _ou, ctx) {
			if (!active) return INACTIVE_RESPONSE;

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

			// --- keep validation ---
			if (params.status === "keep") {
				const reasons: string[] = [];

				if (!matchedResult) {
					return { content: [{ type: "text", text: "[ERROR] run 結果が存在しないため keep できません。" }], details: {} };
				}

				if (matchedResult.timedOut) reasons.push(`timeout した run は keep できません。`);
				if (!matchedResult.passed && !matchedResult.timedOut) reasons.push(`失敗した run（exitCode: ${matchedResult.exitCode}）は keep できません。`);
				if (matchedChecks && matchedChecks.passed === false) reasons.push(`checks が失敗しているため keep できません。checks 出力:\n${matchedChecks.output.slice(-500)}`);

				// P0: 主指標が run 出力に存在することを検証
				if (matchedResult.parsedMetrics && state.metricName in matchedResult.parsedMetrics) {
					// OK — benchmark actually produced this metric
				} else {
					reasons.push(
						`run 出力に主指標 "${state.metricName}" が含まれていません。` +
						`benchmark が METRIC ${state.metricName}=value を stdout に出力する必要があります。`
					);
				}

				// P0: artifactFailed チェック
				if (runResultMap.has(matchedPiRunId ?? "")) {
					const rd = runResultMap.get(matchedPiRunId ?? "");
					if (rd?.artifactFailed) {
						reasons.push("artifact 保存に失敗した run は監査不能のため keep できません。");
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
			}

			// --- Provenance ---
			const preCommit = getGitShortHash(ctx.cwd);
			const dirtyBefore = isGitDirty(ctx.cwd);
			const changedFiles = getChangedFiles(ctx.cwd);
			let commit = params.commit ?? preCommit;
			const run = state.runCount + 1;

			// P0: runSeq は run 時採番値を使用（log 順ではなく実行順）
			const runSeq = matchedRunData?.runSeq ?? run;

			const entry: RunEntry = {
				type: "run", run, runId: matchedPiRunId, piRunId: matchedPiRunId,
				commit, metric: params.metric, status: params.status as RunStatus,
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
			};

			state.results.push(entry);
			state.runCount = run;
			if (params.status === "keep" && isBestMetric(state.bestMetric, params.metric, state.direction)) {
				state.bestMetric = params.metric;
			}

			// --- Git operations ---
			let gitError: string | undefined;
			if (params.status === "keep") {
				const gr = gitAutoCommit(ctx.cwd, `${params.description}\n\nResult: ${JSON.stringify({ status: params.status, [state.metricName]: params.metric })}`);
				if (gr.committed) {
					commit = gr.commit ?? commit;
				} else if (gr.error) {
					gitError = gr.error;
					console.error(`[autoresearch] gitAutoCommit error: ${gr.error}`);
				}
				entry.postCommit = commit;
			} else {
				gitAutoRevert(ctx.cwd);
				entry.postCommit = getGitShortHash(ctx.cwd);
			}
			entry.dirtyAfter = isGitDirty(ctx.cwd);

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
					piRunId: matchedPiRunId ?? "", runSeq, metric: params.metric,
					timestamp: entry.timestamp, gitCommit: entry.postCommit ?? preCommit,
				});
			} catch (e) { ledgerErrors.push(`latest pointer: ${e instanceof Error ? e.message : String(e)}`); }

			// Best pointer
			if (params.status === "keep") {
				try {
					const cur = readPointer(bestPointerPath(ctx.cwd, state.sessionId));
					if (isBestPointerMetric(params.metric, cur, state.direction)) {
						writePointer(bestPointerPath(ctx.cwd, state.sessionId), {
							piRunId: matchedPiRunId ?? "", runSeq, metric: params.metric,
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
					primaryMetricName: state.metricName, primaryMetricValue: params.metric,
					metrics: { ...(params.metrics ?? {}), [state.metricName]: params.metric },
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
					status: params.status, metric: params.metric,
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
					timestamp: entry.timestamp, details: { status: params.status, metric: params.metric, runSeq },
				} satisfies EventLedgerEntry);
			} catch (e) { ledgerErrors.push(`event ledger: ${e instanceof Error ? e.message : String(e)}`); }

			// --- Main JSONL ---
			const jp = jsonlPath(ctx.cwd);
			try {
				const line = JSON.stringify({
					...entry,
					runId: entry.runId ?? undefined, piRunId: entry.piRunId ?? undefined,
					metrics: params.metrics ?? undefined, memo: params.memo ?? undefined,
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
			text += `指標: ${state.metricName}=${params.metric}${state.metricUnit}\n`;
			text += `コミット: ${commit}\n`;
			if (entry.piRunId) text += `piRunId: ${entry.piRunId}\n`;
			if (entry.externalRunId) text += `外部 RUN_ID: ${entry.externalRunId}\n`;
			text += `\n累計: ${state.runCount}回 / 採用${kept}\n`;
			if (state.bestMetric !== null) text += `最良: ${state.metricName}=${state.bestMetric}${state.metricUnit}\n`;

			if (!params.runId && matchedPiRunId) text += `\n[WARNING] runId 省略。次回は明示指定してください。`;
			if (params.status === "keep") {
				if (gitError) {
					text += `\n[git ERROR] commit 失敗: ${gitError}`;
				} else if (entry.postCommit && entry.postCommit !== preCommit) {
					text += `\n[git] 自動 commit しました: ${entry.postCommit}`;
				} else {
					text += `\n[git] 変更なし（commit 不要）`;
				}
			} else {
				text += `\n[git] revert 完了（autoresearch.* / .pi/ は保護）`;
			}

			lastChecks = null; lastRunResult = null; lastRunChecks = null;

			if (ledgerErrors.length > 0) {
				text += `\n[WARNING] ledger 書き込み一部失敗: ${ledgerErrors.join(", ")}`;
			}

			return {
				content: [{ type: "text", text }],
				details: {
					run, runId: entry.piRunId, piRunId: entry.piRunId,
					status: params.status, metric: params.metric, bestMetric: state.bestMetric,
					kept, commit, preCommit, postCommit: entry.postCommit, changedFiles,
					externalRunId: entry.externalRunId, externalArtifactDir: entry.externalArtifactDir,
					gitError,
					ledgerErrors: ledgerErrors.length > 0 ? ledgerErrors : undefined,
				},
			};
		},
	});
}
