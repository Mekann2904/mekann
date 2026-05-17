/**
 * autoresearch — Pi 拡張機能: 自律的実験ループ（日本語 UI）。
 *
 * 提供:
 * - `autoresearch_init` tool — セッション初期化
 * - `autoresearch_run`  tool — コマンド実行・計測
 * - `autoresearch_log`  tool — 結果記録
 * - `/autoresearch` command — on / off / status / clear
 * - `before_agent_start` — 日本語 system prompt 追記
 * - 日本語ステータス widget
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import * as fs from "node:fs";
import * as path from "node:path";

import {
	reconstructState,
	isBestMetric,
	countByStatus,
	freshState,
	type ExperimentState,
	type RunEntry,
	type RunStatus,
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
	generateRunId,
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

/** git short hash を取得。失敗時は "unknown"。 */
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
	if (lines) {
		ctx.ui.setWidget("autoresearch", lines);
	} else {
		ctx.ui.setWidget("autoresearch", undefined);
	}
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
].join("\n");

// ---------------------------------------------------------------------------
// Ralph-style loop helpers
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Extension factory
// ---------------------------------------------------------------------------

export default function autoresearchExtension(pi: ExtensionAPI): void {
	// ─── Mutable runtime state ──────────────────────────────────────
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
	let lastRunResult: (RunResult & { runId: string }) | null = null;
	let lastRunChecks: ChecksResult | null = null;
	let state: ExperimentState = freshState();

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

	// ─── session_start: JSONL から状態復元 ─────────────────────────

	pi.on("session_start", async (_event, ctx) => {
		const jp = jsonlPath(ctx.cwd);
		if (fs.existsSync(jp)) {
			try {
				state = reconstructState(fs.readFileSync(jp, "utf8"));
			} catch {
				state = freshState();
			}
		}
		// セッション開始時は非アクティブ。ユーザーが /autoresearch on で明示的に有効化する。
		active = false;
		autoLoop = false;
		runningExperiment = null;
		resetLoopProgress();
		updateWidget(ctx, state, active, runningExperiment, loopInfo());
	});

	// ─── before_agent_start: 日本語指示を追加 ─────────────────────

	pi.on("before_agent_start", async (event, _ctx) => {
		if (!active) return;
		return {
			systemPrompt: event.systemPrompt + SYSTEM_PROMPT_EXTRA,
		};
	});

	// ─── agent loop watchdog (Ralph-style auto resume) ───────────────

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
				ctx.ui.notify(
					`autoresearch loop を停止しました: ${NO_PROGRESS_LIMIT}回連続で autoresearch_log まで進みませんでした`,
					"warning",
				);
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

	// ─── /autoresearch command ───────────────────────────────────────

	pi.registerCommand("autoresearch", {
		description: "autoresearch モードの管理（on / off / status / clear）",
		handler: async (args, ctx) => {
			const parts = (args ?? "").trim().split(/\s+/);
			const sub = parts[0] || "status";

			switch (sub) {
				// ── on ───────────────────────────────────────────
				case "on": {
					activateAutoresearch(ctx, parts.slice(1).join(" ").trim());
					break;
				}

				// ── off ──────────────────────────────────────────
				case "off": {
					active = false;
					autoLoop = false;
					loopPromptQueued = false;
					updateWidget(ctx, state, active, runningExperiment, loopInfo());
					ctx.ui.notify("autoresearch モードを無効にしました", "info");
					break;
				}

				// ── clear ────────────────────────────────────────
				case "clear": {
					const jp = jsonlPath(ctx.cwd);
					try {
						if (fs.existsSync(jp)) fs.unlinkSync(jp);
					} catch { /* ignore */ }
					state = freshState();
					active = false;
					autoLoop = false;
					runningExperiment = null;
					resetLoopProgress();
					updateWidget(ctx, state, active, runningExperiment, loopInfo());
					ctx.ui.notify("autoresearch のデータをクリアしました", "info");
					break;
				}

				// ── status ──────────────────────────────────────
				case "status": {
					const kept = countByStatus(state.results, "keep");
					const best =
						state.bestMetric !== null
							? `${state.metricName}=${state.bestMetric}${state.metricUnit}`
							: "未測定";
					const modeStr = active ? "有効" : "無効";
					const maxStr = maxLoopIterations === null ? "∞" : String(maxLoopIterations);
					ctx.ui.notify(
						`autoresearch: ${modeStr}\n` +
						`loop: ${autoLoop ? "ON" : "OFF"} (${loopIterationCount}/${maxStr}, no-progress ${noProgressAgentEnds}/${NO_PROGRESS_LIMIT})\n` +
						`実験回数: ${state.runCount}\n` +
					`採用数: ${kept}\n` +
					`最良指標: ${best}\n` +
					`方向: ${directionLabel(state.direction)}`,
						"info",
					);
					break;
				}

				// ── loop ────────────────────────────────────────
				case "loop": {
					const loopSub = parts[1] || "status";
					if (loopSub === "on") {
						autoLoop = true;
						noProgressAgentEnds = 0;
						loopPromptQueued = false;
						updateWidget(ctx, state, active, runningExperiment, loopInfo());
						ctx.ui.notify("autoresearch loop を有効にしました", "info");
						break;
					}
					if (loopSub === "off") {
						autoLoop = false;
						loopPromptQueued = false;
						updateWidget(ctx, state, active, runningExperiment, loopInfo());
						ctx.ui.notify("autoresearch loop を無効にしました", "info");
						break;
					}
					if (loopSub === "max") {
						const raw = parts[2];
						if (raw === "none" || raw === "∞" || raw === "infinite") {
							maxLoopIterations = null;
						} else {
							const parsed = Number(raw);
							if (!Number.isInteger(parsed) || parsed <= 0) {
								ctx.ui.notify("使い方: /autoresearch loop max <正の整数|none>", "warning");
								break;
							}
							maxLoopIterations = parsed;
						}
						updateWidget(ctx, state, active, runningExperiment, loopInfo());
						ctx.ui.notify(`autoresearch loop max を ${maxLoopIterations ?? "∞"} に設定しました`, "info");
						break;
					}
					const maxStr = maxLoopIterations === null ? "∞" : String(maxLoopIterations);
					ctx.ui.notify(
						`autoresearch loop: ${autoLoop ? "ON" : "OFF"}\n` +
						`iteration: ${loopIterationCount}/${maxStr}\n` +
						`no-progress: ${noProgressAgentEnds}/${NO_PROGRESS_LIMIT}`,
						"info",
					);
					break;
				}

				// ── default: 目的文として扱い mode ON ───────────
				default: {
					activateAutoresearch(ctx, (args ?? "").trim());
					break;
				}
			}
			}
		});

	// ─── Shared activation helper ────────────────────────────────────

	function activateAutoresearch(ctx: ExtensionContext, purpose: string): void {
		active = true;
		autoLoop = true;
		resetLoopProgress();
		loopPromptQueued = true;
		updateWidget(ctx, state, active, runningExperiment, loopInfo());
		ctx.ui.notify("autoresearch モードを有効にしました（loop ON）", "info");

		const hasMd = fs.existsSync(mdFilePath(ctx.cwd));
		let followUpMsg: string;
		if (hasMd) {
			followUpMsg =
				"autoresearch.md を読み直して、autoresearch を再開してください。" +
				"最後の実験結果から継続してください。";
			if (purpose) followUpMsg += `\n追加コンテキスト: ${purpose}`;
		} else {
			const purposeText = purpose ? `目的: ${purpose}` : "";
			followUpMsg =
				"autoresearch モードを有効化しました。" +
				"目的・指標・実行コマンドを整理して autoresearch.md とベンチマークスクリプトを作成し、実験を開始してください。" +
				"\n必要なら `/skill:autoresearch-create` で手順を確認できます。" +
				(purposeText ? ` ${purposeText}` : "");
		}
		pi.sendUserMessage(followUpMsg, { deliverAs: "followUp" });
	}

	const STATUS_LABELS: Record<string, string> = {
		keep: "採用",
		discard: "棄却",
		crash: "クラッシュ",
		checks_failed: "checks失敗",
	};
	const STATUS_PREFIX: Record<string, string> = {
		keep: "[KEEP]",
		discard: "[DISCARD]",
		crash: "[CRASH]",
		checks_failed: "[CHECKS_FAILED]",
	};

	const INACTIVE_RESPONSE = {
		content: [{
			type: "text" as const,
			text:
				"[ERROR] autoresearch モードが無効です。\n" +
				"先に `/autoresearch on` または `/autoresearch <目的>` を実行してください。",
		}],
		details: {},
	};

	pi.registerTool({
		name: "autoresearch_init",
		label: "autoresearch init",
		description:
			"実験セッションを初期化します。名前・指標・単位・方向を設定し、autoresearch.jsonl に保存します。",
		promptSnippet: "実験セッションの初期化（名前、指標、方向）",
		promptGuidelines: [
			"autoresearch_init はセッションの最初に一度だけ呼び出してください。",
			"既に autoresearch.jsonl に設定がある場合は再初期化しないでください。",
		],
		parameters: Type.Object({
			name: Type.String({
				description: "実験セッションの名前（例: テスト実行時間の最適化）",
			}),
			metric_name: Type.String({
				description: "主指標の表示名（例: total_ms, bundle_kb）",
			}),
			metric_unit: Type.Optional(
				Type.String({ description: "指標の単位（例: ms, s, kb）。デフォルト: なし" }),
			),
			direction: Type.Optional(
				StringEnum(["lower", "higher"] as const, {
					description: "低い方が良いか高い方が良いか。デフォルト: lower",
				}),
			),
		}),

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			if (!active) return INACTIVE_RESPONSE;

			state.name = params.name;
			state.metricName = params.metric_name;
			state.metricUnit = params.metric_unit ?? "";
			if (params.direction === "lower" || params.direction === "higher") {
				state.direction = params.direction;
			}
			state.bestMetric = null;
			state.results = [];
			state.runCount = 0;

			// JSONL へ config 行を追記
			const jp = jsonlPath(ctx.cwd);
			const configLine =
				JSON.stringify({
					type: "config",
					name: state.name,
					metricName: state.metricName,
					metricUnit: state.metricUnit,
					direction: state.direction,
				}) + "\n";

			try {
				fs.appendFileSync(jp, configLine);
			} catch (e) {
				return {
					content: [
						{
							type: "text",
							text: `[ERROR] autoresearch.jsonl の書き込みに失敗: ${e instanceof Error ? e.message : String(e)}`,
						},
					],
					details: {},
				};
			}

			updateWidget(ctx, state, active, runningExperiment, loopInfo());

			return {
				content: [
					{
						type: "text",
						text:
							`[OK] autoresearch を初期化しました\n` +
							`名前: ${state.name}\n` +
							`指標: ${state.metricName}（${directionLabel(state.direction)}）\n` +
							`次に autoresearch_run でベースラインを測定してください。`,
					},
				],
				details: {
					name: state.name,
					metricName: state.metricName,
					metricUnit: state.metricUnit,
					direction: state.direction,
				},
			};
		},
	});

	// ─── Tool: autoresearch_run ─────────────────────────────────────

	pi.registerTool({
		name: "autoresearch_run",
		label: "autoresearch run",
		description:
			"シェルコマンドを実行し、実行時間と出力を記録します。" +
			"METRIC name=value 形式の出力を自動的にパースします。" +
			"autoresearch.checks.sh が存在する場合、benchmark 成功後に自動実行します。",
		promptSnippet: "コマンドを実行して時間と結果を測定",
		promptGuidelines: [
			"実験コマンドの実行には autoresearch_run を使ってください。",
			"実行後は必ず autoresearch_log で結果を記録してください。",
			"checks が失敗した場合は checks_failed で記録してください。",
		],
		parameters: Type.Object({
			command: Type.String({
				description: "実行するシェルコマンド（例: npm test, ./benchmark.sh）",
			}),
			timeout_seconds: Type.Optional(
				Type.Number({ description: "タイムアウト秒数（デフォルト: 600）" }),
			),
			checks_timeout_seconds: Type.Optional(
				Type.Number({ description: "autoresearch.checks.sh のタイムアウト秒数（デフォルト: 300）" }),
			),
		}),

		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			if (!active) return INACTIVE_RESPONSE;

			const timeoutMs = (params.timeout_seconds ?? DEFAULT_TIMEOUT_SECONDS) * 1000;

			const preCommit = getGitShortHash(ctx.cwd);
			const dirtyBefore = isGitDirty(ctx.cwd);
			const changedFilesBefore = getChangedFiles(ctx.cwd);

			runningExperiment = { startedAt: Date.now(), command: params.command };
			updateWidget(ctx, state, active, runningExperiment, loopInfo());

			const runId = generateRunId();
			const result = await runCommand(params.command, ctx.cwd, timeoutMs, signal);

			runningExperiment = null;
			updateWidget(ctx, state, active, runningExperiment, loopInfo());

			// benchmark 成功時に checks を実行
			let checks: ChecksResult;
			if (result.passed) {
				checks = await runChecks(ctx.cwd, signal, params.checks_timeout_seconds);
			} else {
				checks = { passed: null, timedOut: false, output: "", durationSeconds: 0 };
			}
			lastChecks = checks;
			lastRunResult = { ...result, runId };
			lastRunChecks = checks;

			let text = "";
			if (result.timedOut) {
				text = `[TIMEOUT] 実験がタイムアウトしました（${params.timeout_seconds ?? DEFAULT_TIMEOUT_SECONDS}秒）\n`;
			} else if (!result.passed) {
				text = `[FAIL] 実験が失敗しました（終了コード: ${result.exitCode}）\n`;
			} else {
				text = `[OK] 実験が完了しました\n`;
			}
			text += `実行時間: ${result.durationSeconds.toFixed(1)}秒\n`;
			text += `コマンド: ${result.command}\n`;

			// checks 結果を報告
			if (checks.passed === true) {
				text += `checks: 成功（${checks.durationSeconds.toFixed(1)}秒）\n`;
			} else if (checks.passed === false) {
				text += `checks: 失敗\n`;
				if (checks.output) {
					text += `checks 出力（末尾）:\n${checks.output}\n`;
				}
				text += `\nautoresearch_log では status=checks_failed で記録してください。keep は拒否されます。\n`;
			}

			if (result.parsedMetrics) {
				text += `\n測定指標:\n`;
				for (const [name, value] of Object.entries(result.parsedMetrics)) {
					text += `  METRIC ${name}=${value}\n`;
				}
				const primary = result.parsedMetrics[state.metricName];
				if (primary !== undefined) {
					text += `\n主指標 ${state.metricName}=${primary}${state.metricUnit} を autoresearch_log に報告してください。`;
				}
			}

			if (result.output) {
				text += `\n出力（末尾）:\n${result.output}`;
			}

			text += `\nrunId: ${runId}`;
			text += `\nこの runId を autoresearch_log に渡して紐付けてください。`;

			return {
				content: [{ type: "text", text }],
				details: { ...result, checks, runId, preCommit, dirtyBefore, changedFilesBefore },
			};
		},
	});

	// ─── Tool: autoresearch_log ─────────────────────────────────────

	pi.registerTool({
		name: "autoresearch_log",
		label: "autoresearch log",
		description:
			"実験結果を記録します。結果は autoresearch.jsonl に追記され、最良指標が更新されます。" +
			"keep は自動で git commit し、discard/crash/checks_failed は自動で revert します。",
		promptSnippet: "実験結果を記録（keep / discard / crash / checks_failed）",
		promptGuidelines: [
			"autoresearch_run の後は必ず autoresearch_log を呼び出してください。",
			"改善 → keep、悪化 → discard、クラッシュ → crash、checks 失敗 → checks_failed に設定してください。",
			"keep の場合は自動で git commit されます。discard/crash/checks_failed の場合は自動で revert されます。",
			"checks が失敗した場合は keep を選択できません。",
		],
		parameters: Type.Object({
			metric: Type.Number({
				description: "主指標の値",
			}),
			status: StringEnum(["keep", "discard", "crash", "checks_failed"] as const, {
				description: "実験結果: keep=採用, discard=棄却, crash=クラッシュ, checks_failed=checks失敗",
			}),
			description: Type.String({
				description: "実験内容の短い説明",
			}),
			runId: Type.Optional(
				Type.String({ description: "対応する autoresearch_run の runId。省略時は直前の run に紐付け。" }),
			),
			commit: Type.Optional(
				Type.String({ description: "Git コミットハッシュ。省略時は自動取得。" }),
			),
			metrics: Type.Optional(
				Type.Object(
					{},
					{
						additionalProperties: Type.Number(),
						description: "追加指標の { 名前: 値 } ペア",
					},
				),
			),
			memo: Type.Optional(Type.String({ description: "メモ" })),
		}),

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			if (!active) return INACTIVE_RESPONSE;

			// --- Validate runId ---
			let matchedRun: (RunResult & { runId: string }) | null = null;
			if (params.runId) {
				if (!lastRunResult || lastRunResult.runId !== params.runId) {
					return {
						content: [{
							type: "text",
							text:
								`[ERROR] runId "${params.runId}" に対応する run 結果が見つかりません。\n` +
								`直前の runId は ${lastRunResult?.runId ?? "(なし)"} です。\n` +
								`正しい runId を指定するか、省略して直前の run に紐付けてください。`,
						}],
						details: {},
					};
				}
				matchedRun = lastRunResult;
			} else if (lastRunResult) {
				matchedRun = lastRunResult;
			} else {
				// No run result available — keep is rejected, others allowed for backward compat
				if (params.status === "keep") {
					return {
						content: [{
							type: "text",
							text:
								"[ERROR] 対応する autoresearch_run 結果がありません。\n" +
								"先に autoresearch_run を実行してから autoresearch_log を呼び出してください。",
						}],
						details: {},
					};
				}
			}

			// --- Gate: keep validation (enforced) ---
			if (params.status === "keep") {
				// 1. run が timeout していない
				if (matchedRun && matchedRun.timedOut) {
					return {
						content: [{
							type: "text",
							text:
								"[ERROR] timeout した run は keep できません。\n" +
								`runId: ${matchedRun.runId} はタイムアウトしています。\n` +
								"status=discard または status=crash で記録してください。",
						}],
						details: {},
					};
				}
				// 2. run の exit code が成功している
				if (matchedRun && !matchedRun.passed) {
					return {
						content: [{
							type: "text",
							text:
								"[ERROR] 失敗した run（終了コード: " + matchedRun.exitCode + "）は keep できません。\n" +
								`runId: ${matchedRun.runId}\n` +
								"status=discard または status=crash で記録してください。",
						}],
						details: {},
					};
				}
				// 3. checks が定義されていて失敗している場合は拒否
				if (lastChecks && lastChecks.passed === false) {
					return {
						content: [{
							type: "text",
							text:
								"[ERROR] checks が失敗しているため keep できません。\n" +
								`checks 出力:\n${lastChecks.output.slice(-500)}\n` +
								"status=checks_failed で記録してください。",
						}],
						details: {},
					};
				}
			}

			// --- Collect provenance ---
			const preCommit = getGitShortHash(ctx.cwd);
			const dirtyBefore = isGitDirty(ctx.cwd);
			const changedFiles = getChangedFiles(ctx.cwd);

			let commit = params.commit ?? preCommit;
			const run = state.runCount + 1;

			const entry: RunEntry = {
				type: "run",
				run,
				runId: matchedRun?.runId,
				commit,
				metric: params.metric,
				status: params.status,
				description: params.description,
				timestamp: Date.now(),
				metrics: params.metrics,
				memo: params.memo,
				command: matchedRun?.command,
				exitCode: matchedRun?.exitCode,
				timedOut: matchedRun?.timedOut,
				checksPassed: lastRunChecks?.passed ?? null,
				preCommit: preCommit,
				postCommit: undefined, // updated after git operation
				dirtyBefore: dirtyBefore,
				dirtyAfter: undefined, // updated after git operation
				changedFiles: changedFiles.length > 0 ? changedFiles : undefined,
				notes: params.memo,
			};

			// 状態更新
			state.results.push(entry);
			state.runCount = run;

			if (params.status === "keep" && isBestMetric(state.bestMetric, params.metric, state.direction)) {
				state.bestMetric = params.metric;
			}

			// --- Auto git operations (before JSONL write so postCommit is correct) ---
			if (params.status === "keep") {
				const commitMsg = `${params.description}\n\nResult: ${JSON.stringify({ status: params.status, [state.metricName]: params.metric })}`;
				const gitResult = gitAutoCommit(ctx.cwd, commitMsg);
				if (gitResult.committed) {
					commit = gitResult.commit ?? commit;
					entry.postCommit = commit;
				} else {
					entry.postCommit = preCommit;
				}
				entry.dirtyAfter = isGitDirty(ctx.cwd);
			} else {
				// discard / crash / checks_failed → 自動 revert
				const revertResult = gitAutoRevert(ctx.cwd);
				entry.postCommit = getGitShortHash(ctx.cwd);
				entry.dirtyAfter = isGitDirty(ctx.cwd);
			}

			// JSONL へ追記（provenance 完了後）
			const jp = jsonlPath(ctx.cwd);
			try {
				const line =
					JSON.stringify({
						...entry,
						runId: entry.runId ?? undefined,
						metrics: params.metrics ?? undefined,
						memo: params.memo ?? undefined,
						command: entry.command ?? undefined,
						exitCode: entry.exitCode ?? undefined,
						timedOut: entry.timedOut ?? undefined,
						checksPassed: entry.checksPassed ?? undefined,
						preCommit: entry.preCommit ?? undefined,
						postCommit: entry.postCommit ?? undefined,
						dirtyBefore: entry.dirtyBefore ?? undefined,
						dirtyAfter: entry.dirtyAfter ?? undefined,
						changedFiles: entry.changedFiles ?? undefined,
						notes: entry.notes ?? undefined,
					}) + "\n";
				fs.appendFileSync(jp, line);
			} catch (e) {
				return {
					content: [
						{
							type: "text",
							text: `[ERROR] autoresearch.jsonl の書き込みに失敗: ${e instanceof Error ? e.message : String(e)}`,
						},
					],
					details: {},
				};
			}

			lastLoggedRun = run;
			updateWidget(ctx, state, active, runningExperiment, loopInfo());

			const kept = countByStatus(state.results, "keep");
			const prefix = STATUS_PREFIX[params.status] ?? "[UNKNOWN]";

			let text = `${prefix} 実験 #${run} を記録: ${STATUS_LABELS[params.status] ?? params.status}\n`;
			text += `説明: ${params.description}\n`;
			text += `指標: ${state.metricName}=${params.metric}${state.metricUnit}\n`;
			text += `コミット: ${commit}\n`;
			if (entry.runId) {
				text += `runId: ${entry.runId}\n`;
			}
			text += `\n累計: ${state.runCount}回 / 採用${kept}\n`;

			if (state.bestMetric !== null) {
				text += `最良: ${state.metricName}=${state.bestMetric}${state.metricUnit}\n`;
			}

			// git 操作結果
			if (params.status === "keep") {
				if (entry.postCommit && entry.postCommit !== preCommit) {
					text += `\n[git] 自動 commit しました: ${entry.postCommit}`;
				} else {
					text += `\n[git] 変更なし（commit 不要）`;
				}
			} else {
				text += `\n[git] 作業ツリーを revert しました（autoresearch.* は保護）`;
			}

			// 状態をクリア
			lastChecks = null;
			lastRunResult = null;
			lastRunChecks = null;

			return {
				content: [{ type: "text", text }],
				details: {
					run,
					runId: entry.runId,
					status: params.status,
					metric: params.metric,
					bestMetric: state.bestMetric,
					kept,
					commit,
					preCommit: entry.preCommit,
					postCommit: entry.postCommit,
					changedFiles: entry.changedFiles,
				},
			};
		},
	});
}
