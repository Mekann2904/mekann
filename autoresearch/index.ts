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
import { execFileSync } from "node:child_process";

import {
	reconstructState,
	isBestMetric,
	countByStatus,
	freshState,
	type ExperimentState,
	type RunEntry,
} from "./state.js";
import { runCommand } from "./runner.js";
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
	"## 自動研究モード（アクティブ）",
	"",
	"現在は自動研究モードです。以下のルールに従って自律的に実験を繰り返してください。",
	"",
	"1. 最初に `autoresearch.md` を読む（存在する場合）",
	"2. `autoresearch_init` でセッションを初期化（未初期化の場合）",
	"3. `autoresearch_run` でコマンドを実行し、結果を測定",
	"4. 必ず `autoresearch_log` で結果を記録",
	"5. 改善したら自分で `git commit`、悪化したら自分で `git checkout` で revert",
	"6. ユーザーに毎回継続確認しない — 停止されるまで繰り返す",
	"7. 表示・報告は日本語で行う",
	"8. `autoresearch.jsonl` に履歴が自動保存される",
	"",
].join("\n");

// ---------------------------------------------------------------------------
// Extension factory
// ---------------------------------------------------------------------------

export default function autoresearchExtension(pi: ExtensionAPI): void {
	// ─── Mutable runtime state ──────────────────────────────────────
	let active = false;
	let runningExperiment: { startedAt: number; command: string } | null = null;
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
		description: "自動研究モードの管理（on / off / status / clear）",
		handler: async (args, ctx) => {
			const parts = (args ?? "").trim().split(/\s+/);
			const sub = parts[0] || "status";

			switch (sub) {
				// ── on ───────────────────────────────────────────
				case "on": {
					active = true;
					const purpose = parts.slice(1).join(" ").trim();
					updateWidget(ctx, state, active, runningExperiment);
					ctx.ui.notify("🔬 自動研究モードを有効にしました", "info");

					const hasMd = fs.existsSync(mdFilePath(ctx.cwd));
					let followUpMsg: string;
					if (hasMd) {
						followUpMsg =
							"autoresearch.md を読み直して、自動研究を再開してください。" +
							"最後の実験結果から継続してください。";
					} else {
						const purposeText = purpose ? `目的: ${purpose}` : "";
						followUpMsg =
							`自動研究を開始します。目的・指標・実行コマンドを整理して ` +
							`autoresearch.md とベンチマークスクリプトを作成し、実験を開始してください。` +
							(purposeText ? ` ${purposeText}` : "");
					}
					pi.sendUserMessage(followUpMsg, { deliverAs: "followUp" });
					break;
				}

				// ── off ──────────────────────────────────────────
				case "off": {
					active = false;
					updateWidget(ctx, state, active, runningExperiment);
					ctx.ui.notify("🔬 自動研究モードを無効にしました", "info");
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
					ctx.ui.notify("🔬 自動研究のデータをクリアしました", "info");
					break;
				}

				// ── status / default ─────────────────────────────
				case "status":
				default: {
					const kept = countByStatus(state.results, "keep");
					const best =
						state.bestMetric !== null
							? `${state.metricName}=${state.bestMetric}${state.metricUnit}`
							: "未測定";
					const modeStr = active ? "有効" : "無効";
					ctx.ui.notify(
						`🔬 自動研究: ${modeStr}\n` +
						`実験回数: ${state.runCount}\n` +
						`採用数: ${kept}\n` +
						`最良指標: ${best}\n` +
						`方向: ${directionLabel(state.direction)}`,
						"info",
					);
					break;
				}
			}
		},
	});

	// ─── Tool: autoresearch_init ────────────────────────────────────

	pi.registerTool({
		name: "autoresearch_init",
		label: "自動研究 初期化",
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
							text: `❌ autoresearch.jsonl の書き込みに失敗: ${e instanceof Error ? e.message : String(e)}`,
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
							`✅ 自動研究を初期化しました\n` +
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
		label: "自動研究 実行",
		description:
			"シェルコマンドを実行し、実行時間と出力を記録します。" +
			"METRIC name=value 形式の出力を自動的にパースします。",
		promptSnippet: "コマンドを実行して時間と結果を測定",
		promptGuidelines: [
			"実験コマンドの実行には autoresearch_run を使ってください。",
			"実行後は必ず autoresearch_log で結果を記録してください。",
		],
		parameters: Type.Object({
			command: Type.String({
				description: "実行するシェルコマンド（例: npm test, ./benchmark.sh）",
			}),
			timeout_seconds: Type.Optional(
				Type.Number({ description: "タイムアウト秒数（デフォルト: 600）" }),
			),
		}),

		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const timeoutMs = (params.timeout_seconds ?? DEFAULT_TIMEOUT_SECONDS) * 1000;

			runningExperiment = { startedAt: Date.now(), command: params.command };
			updateWidget(ctx, state, active, runningExperiment);

			const result = await runCommand(params.command, ctx.cwd, timeoutMs, signal);

			runningExperiment = null;
			updateWidget(ctx, state, active, runningExperiment);

			let text = "";
			if (result.timedOut) {
				text = `⏱️ 実験がタイムアウトしました（${params.timeout_seconds ?? DEFAULT_TIMEOUT_SECONDS}秒）\n`;
			} else if (!result.passed) {
				text = `❌ 実験が失敗しました（終了コード: ${result.exitCode}）\n`;
			} else {
				text = `✅ 実験が完了しました\n`;
			}
			text += `実行時間: ${result.durationSeconds.toFixed(1)}秒\n`;
			text += `コマンド: ${result.command}\n`;

			if (result.parsedMetrics) {
				text += `\n📊 測定指標:\n`;
				for (const [name, value] of Object.entries(result.parsedMetrics)) {
					text += `  METRIC ${name}=${value}\n`;
				}
				const primary = result.parsedMetrics[state.metricName];
				if (primary !== undefined) {
					text += `\n主指標 ${state.metricName}=${primary}${state.metricUnit} を autoresearch_log に報告してください。`;
				}
			}

			if (result.output) {
				text += `\n📄 出力（末尾）:\n${result.output}`;
			}

			return {
				content: [{ type: "text", text }],
				details: result,
			};
		},
	});

	// ─── Tool: autoresearch_log ─────────────────────────────────────

	pi.registerTool({
		name: "autoresearch_log",
		label: "自動研究 記録",
		description:
			"実験結果を記録します。結果は autoresearch.jsonl に追記され、最良指標が更新されます。",
		promptSnippet: "実験結果を記録（keep / discard / crash）",
		promptGuidelines: [
			"autoresearch_run の後は必ず autoresearch_log を呼び出してください。",
			"改善 → keep、悪化 → discard、クラッシュ → crash に設定してください。",
			"keep の場合は自分で git commit してください。discard の場合は自分で git checkout で revert してください。",
		],
		parameters: Type.Object({
			metric: Type.Number({
				description: "主指標の値",
			}),
			status: StringEnum(["keep", "discard", "crash"] as const, {
				description: "実験結果: keep=採用, discard=棄却, crash=クラッシュ",
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
			const commit = params.commit ?? getGitShortHash(ctx.cwd);
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
							text: `❌ autoresearch.jsonl の書き込みに失敗: ${e instanceof Error ? e.message : String(e)}`,
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
			};
			const icon = params.status === "keep" ? "✅" : params.status === "discard" ? "⏪" : "💥";

			let text = `${icon} 実験 #${run} を記録: ${statusLabel[params.status]}\n`;
			text += `説明: ${params.description}\n`;
			text += `指標: ${state.metricName}=${params.metric}${state.metricUnit}\n`;
			text += `コミット: ${commit}\n`;
			text += `\n累計: ${state.runCount}回 / 採用${kept}\n`;

			if (state.bestMetric !== null) {
				text += `最良: ${state.metricName}=${state.bestMetric}${state.metricUnit}\n`;
			}

			if (params.status === "keep") {
				text += `\n✨ 改善しました。自分で git commit してください。`;
			} else if (params.status === "discard") {
				text += `\n⏪ 悪化しました。自分で git checkout で revert してください。`;
			}

			return {
				content: [{ type: "text", text }],
				details: {
					run,
					status: params.status,
					metric: params.metric,
					bestMetric: state.bestMetric,
					kept,
				},
			};
		},
	});
}
