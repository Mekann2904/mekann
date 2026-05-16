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
import { execFileSync, type ExecException } from "node:child_process";

import {
	reconstructState,
	isBestMetric,
	countByStatus,
	freshState,
	type ExperimentState,
	type RunEntry,
	type RunStatus,
} from "./state.js";
import { runCommand, runChecks, type ChecksResult } from "./runner.js";
import { renderWidget, directionLabel } from "./render.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const JSONL_FILE = "autoresearch.jsonl";
const MD_FILE = "autoresearch.md";
const DEFAULT_TIMEOUT_SECONDS = 600;

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
function getGitShortHash(cwd: string): string {
	try {
		return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
			cwd,
			encoding: "utf8",
			timeout: 5_000,
		}).trim();
	} catch {
		return "unknown";
	}
}

/** `git add -A && git diff --cached --quiet` を実行し staged diff があれば commit。 */
function gitAutoCommit(cwd: string, message: string): { committed: boolean; commit?: string; error?: string } {
	try {
		execFileSync("git", ["add", "-A"], { cwd, encoding: "utf8", timeout: 10_000 });

		// staged diff があるか確認
		try {
			execFileSync("git", ["diff", "--cached", "--quiet"], { cwd, encoding: "utf8", timeout: 5_000 });
			return { committed: false }; // 変更なし
		} catch {
			// diff あり → commit
		}

		execFileSync("git", ["commit", "-m", message], { cwd, encoding: "utf8", timeout: 10_000 });

		const newHash = getGitShortHash(cwd);
		return { committed: true, commit: newHash };
	} catch (e) {
		return { committed: false, error: e instanceof Error ? e.message : String(e) };
	}
}

/** 作業ツリーを revert（autoresearch.* は保護）。 */
function gitAutoRevert(cwd: string): { reverted: boolean; error?: string } {
	try {
		execFileSync(
			"bash",
			[
				"-c",
				"git checkout -- . ':(exclude,glob)**/autoresearch.*' ':(exclude,glob)**/autoresearch.*/**' && " +
				"git clean -fd -e 'autoresearch.*' -e '**/autoresearch.*/**' 2>/dev/null || true",
			],
			{ cwd, encoding: "utf8", timeout: 10_000 },
		);
		return { reverted: true };
	} catch (e) {
		return { reverted: false, error: e instanceof Error ? e.message : String(e) };
	}
}

// ---------------------------------------------------------------------------
// Widget update
// ---------------------------------------------------------------------------

function updateWidget(
	ctx: ExtensionContext,
	state: ExperimentState,
	active: boolean,
	runningInfo?: { startedAt: number; command: string },
): void {
	if (!ctx.hasUI) return;
	const lines = renderWidget(state, active, runningInfo);
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
	"7. 表示・報告は日本語で行う",
	"8. `autoresearch.jsonl` に履歴が自動保存される",
	"9. 有望だが今すぐ試さない最適化案は `autoresearch.ideas.md` に追記する",
	"",
].join("\n");

// ---------------------------------------------------------------------------
// Extension factory
// ---------------------------------------------------------------------------

export default function autoresearchExtension(pi: ExtensionAPI): void {
	// ─── Mutable runtime state ──────────────────────────────────────
	let active = false;
	let runningExperiment: { startedAt: number; command: string } | null = null;
	let lastChecks: ChecksResult | null = null;
	let state: ExperimentState = freshState();

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
		runningExperiment = null;
		updateWidget(ctx, state, active, runningExperiment);
	});

	// ─── before_agent_start: 日本語指示を追加 ─────────────────────

	pi.on("before_agent_start", async (event, _ctx) => {
		if (!active) return;
		return {
			systemPrompt: event.systemPrompt + SYSTEM_PROMPT_EXTRA,
		};
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
					active = true;
					const purpose = parts.slice(1).join(" ").trim();
					updateWidget(ctx, state, active, runningExperiment);
					ctx.ui.notify("autoresearch モードを有効にしました", "info");

					const hasMd = fs.existsSync(mdFilePath(ctx.cwd));
					let followUpMsg: string;
					if (hasMd) {
						followUpMsg =
							"autoresearch.md を読み直して、autoresearch を再開してください。" +
							"最後の実験結果から継続してください。";
					} else {
						const purposeText = purpose ? `目的: ${purpose}` : "";
						followUpMsg =
							"autoresearch モードを有効化しました。" +
							"目的・指標・実行コマンドを整理して autoresearch.md とベンチマークスクリプトを作成し、実験を開始してください。" +
							"\n必要なら `/skill:autoresearch-create` で手順を確認できます。" +
							(purposeText ? ` ${purposeText}` : "");
					}
					pi.sendUserMessage(followUpMsg, { deliverAs: "followUp" });
					break;
				}

				// ── off ──────────────────────────────────────────
				case "off": {
					active = false;
					updateWidget(ctx, state, active, runningExperiment);
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
					runningExperiment = null;
					updateWidget(ctx, state, active, runningExperiment);
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
					ctx.ui.notify(
						`autoresearch: ${modeStr}\n` +
						`実験回数: ${state.runCount}\n` +
					`採用数: ${kept}\n` +
					`最良指標: ${best}\n` +
					`方向: ${directionLabel(state.direction)}`,
						"info",
					);
					break;
				}

				// ── default: 目的文として扱い mode ON ───────────
				default: {
					const purpose = (args ?? "").trim();
					active = true;
					updateWidget(ctx, state, active, runningExperiment);
					ctx.ui.notify("autoresearch モードを有効にしました", "info");

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
					break;
				}
			}
		},
	});

	// ─── Tool: autoresearch_init ────────────────────────────────────

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
			if (!active) {
				return {
					content: [{
						type: "text",
						text:
							"[ERROR] autoresearch モードが無効です。\n" +
							"先に `/autoresearch on` または `/autoresearch <目的>` を実行してください。",
					}],
					details: {},
				};
			}

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

			updateWidget(ctx, state, active, runningExperiment);

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
			if (!active) {
				return {
					content: [{
						type: "text",
						text:
							"[ERROR] autoresearch モードが無効です。\n" +
							"先に `/autoresearch on` または `/autoresearch <目的>` を実行してください。",
					}],
					details: {},
				};
			}

			const timeoutMs = (params.timeout_seconds ?? DEFAULT_TIMEOUT_SECONDS) * 1000;

			runningExperiment = { startedAt: Date.now(), command: params.command };
			updateWidget(ctx, state, active, runningExperiment);

			const result = await runCommand(params.command, ctx.cwd, timeoutMs, signal);

			runningExperiment = null;
			updateWidget(ctx, state, active, runningExperiment);

			// benchmark 成功時に checks を実行
			let checks: ChecksResult;
			if (result.passed) {
				checks = await runChecks(ctx.cwd, signal, params.checks_timeout_seconds);
			} else {
				checks = { passed: null, timedOut: false, output: "", durationSeconds: 0 };
			}
			lastChecks = checks;

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

			return {
				content: [{ type: "text", text }],
				details: { ...result, checks },
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
			if (!active) {
				return {
					content: [{
						type: "text",
						text:
							"[ERROR] autoresearch モードが無効です。\n" +
							"先に `/autoresearch on` または `/autoresearch <目的>` を実行してください。",
					}],
					details: {},
				};
			}

			// Gate: checks 失敗時の keep を拒否
			if (params.status === "keep" && lastChecks && lastChecks.passed === false) {
				return {
					content: [{
						type: "text",
						text:
							`[ERROR] checks が失敗しているため keep できません。\n` +
							`checks 出力:\n${lastChecks.output.slice(-500)}\n` +
							`status=checks_failed で記録してください。`,
					}],
					details: {},
				};
			}

			let commit = params.commit ?? getGitShortHash(ctx.cwd);
			const run = state.runCount + 1;

			const entry: RunEntry = {
				type: "run",
				run,
				commit,
				metric: params.metric,
				status: params.status,
				description: params.description,
				timestamp: Date.now(),
				metrics: params.metrics,
				memo: params.memo,
			};

			// 状態更新
			state.results.push(entry);
			state.runCount = run;

			if (params.status === "keep" && isBestMetric(state.bestMetric, params.metric, state.direction)) {
				state.bestMetric = params.metric;
			}

			// JSONL へ追記
			const jp = jsonlPath(ctx.cwd);
			try {
				const line =
					JSON.stringify({
						...entry,
						metrics: params.metrics ?? undefined,
						memo: params.memo ?? undefined,
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

			updateWidget(ctx, state, active, runningExperiment);

			// 結果メッセージ
			const kept = countByStatus(state.results, "keep");
			const statusLabel: Record<string, string> = {
				keep: "採用",
				discard: "棄却",
				crash: "クラッシュ",
				checks_failed: "checks失敗",
			};
			const prefixMap: Record<string, string> = {
				keep: "[KEEP]",
				discard: "[DISCARD]",
				crash: "[CRASH]",
				checks_failed: "[CHECKS_FAILED]",
			};
			const prefix = prefixMap[params.status] ?? "[UNKNOWN]";

			let text = `${prefix} 実験 #${run} を記録: ${statusLabel[params.status]}\n`;
			text += `説明: ${params.description}\n`;
			text += `指標: ${state.metricName}=${params.metric}${state.metricUnit}\n`;
			text += `コミット: ${commit}\n`;
			text += `\n累計: ${state.runCount}回 / 採用${kept}\n`;

			if (state.bestMetric !== null) {
				text += `最良: ${state.metricName}=${state.bestMetric}${state.metricUnit}\n`;
			}

			// 自動 git 操作
			if (params.status === "keep") {
				const commitMsg = `${params.description}\n\nResult: ${JSON.stringify({ status: params.status, [state.metricName]: params.metric })}`;
				const gitResult = gitAutoCommit(ctx.cwd, commitMsg);
				if (gitResult.committed) {
					commit = gitResult.commit ?? commit;
					text += `\n[git] 自動 commit しました: ${commit}`;
				} else if (gitResult.error) {
					text += `\n[git] commit エラー: ${gitResult.error}`;
				} else {
					text += `\n[git] 変更なし（commit 不要）`;
				}
			} else {
				// discard / crash / checks_failed → 自動 revert
				const revertResult = gitAutoRevert(ctx.cwd);
				if (revertResult.reverted) {
					text += `\n[git] 作業ツリーを revert しました（autoresearch.* は保護）`;
				} else if (revertResult.error) {
					text += `\n[git] revert エラー: ${revertResult.error}`;
				}
			}

			// lastChecks をクリア
			lastChecks = null;

			return {
				content: [{ type: "text", text }],
				details: {
					run,
					status: params.status,
					metric: params.metric,
					bestMetric: state.bestMetric,
					kept,
					commit,
				},
			};
		},
	});
}
