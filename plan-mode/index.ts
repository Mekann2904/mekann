/**
 * Plan Mode Extension
 *
 * Codexライクなプランモード — コード分析/計画と実装を分離。
 *
 * 機能:
 * - プランモード: 読み取り専用探索（プラン用モデル使用）
 * - 実行モード: 全ツールアクセス（piのデフォルトモデル使用）
 * - プラン用モデル選択（pi形式セレクタ）
 * - プラン抽出と進捗追跡
 * - [DONE:n] ステップ完了マーカー
 * - セッション状態の永続化
 *
 * コマンド:
 * - /plan          - プランモード切替
 * - /plan-model    - プラン用モデル選択
 * - /todos         - プラン進捗表示
 *
 * ショートカット:
 * - Ctrl+Alt+P    - プランモード切替
 *
 * CLIフラグ:
 * - --plan         - プランモードで起動
 *
 * 設定ファイル（マージ、プロジェクト優先）:
 * - ~/.pi/agent/plan-mode.json
 * - <cwd>/.pi/plan-mode.json
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { Api, AssistantMessage, Model, TextContent } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { Key, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { showModelSelector, type ModelSelection } from "./model-selector.js";
import { extractTodoItems, isSafeCommand, markCompletedSteps, type TodoItem } from "./utils.js";

// --- 設定 ---

interface PlanModeConfig {
	planModel?: ModelSelection;
	planTools?: string[];
	execTools?: string[];
}

const DEFAULT_PLAN_TOOLS = ["read", "bash", "grep", "find", "ls"];
const DEFAULT_EXEC_TOOLS = ["read", "bash", "grep", "find", "ls", "edit", "write"];

function loadConfig(cwd: string): PlanModeConfig {
	const globalPath = join(getAgentDir(), "plan-mode.json");
	const projectPath = join(cwd, ".pi", "plan-mode.json");

	let config: PlanModeConfig = {};

	for (const path of [globalPath, projectPath]) {
		if (existsSync(path)) {
			try {
				const content = readFileSync(path, "utf-8");
				const parsed = JSON.parse(content);
				config = { ...config, ...parsed };
			} catch (err) {
				console.error(`プランモード設定の読み込みに失敗: ${path}: ${err}`);
			}
		}
	}

	return config;
}

// --- 型ヘルパー ---

function isAssistantMessage(m: AgentMessage): m is AssistantMessage {
	return m.role === "assistant" && Array.isArray(m.content);
}

function getTextContent(message: AssistantMessage): string {
	return message.content
		.filter((block): block is TextContent => block.type === "text")
		.map((block) => block.text)
		.join("\n");
}

// --- 拡張機能状態 ---

interface ModeState {
	planModeEnabled: boolean;
	executionMode: boolean;
	todoItems: TodoItem[];
	planModel: ModelSelection | undefined;
	planThinkingLevel: string | undefined;
	originalModel: Model<Api> | undefined;
	originalThinkingLevel: string | undefined;
}

// --- メイン拡張機能 ---

export default function planModeExtension(pi: ExtensionAPI): void {
	const state: ModeState = {
		planModeEnabled: false,
		executionMode: false,
		todoItems: [],
		planModel: undefined,
		planThinkingLevel: undefined,
		originalModel: undefined,
		originalThinkingLevel: undefined,
	};

	pi.registerFlag("plan", {
		description: "プランモードで起動（読み取り専用探索）",
		type: "boolean",
		default: false,
	});

	// --- カスタムフッター ---

	let tuiHandle: { requestRender: () => void } | null = null;

	function installFooter(ctx: ExtensionContext): void {
		ctx.ui.setFooter((tui, theme, footerData) => {
			tuiHandle = tui;
			const unsub = footerData.onBranchChange(() => tui.requestRender());

			return {
				dispose() { unsub(); tuiHandle = null; },
				invalidate() {},
				render(width: number): string[] {
					// --- piデフォルト: pwd行 ---
					let pwd = ctx.sessionManager.getCwd();
					const home = process.env.HOME || process.env.USERPROFILE;
					if (home && pwd.startsWith(home)) pwd = `~${pwd.slice(home.length)}`;
					const branch = footerData.getGitBranch();
					if (branch) pwd = `${pwd} (${branch})`;
					const sessionName = ctx.sessionManager.getSessionName();
					if (sessionName) pwd = `${pwd} • ${sessionName}`;

					// --- piデフォルト: トークン統計 ---
					let totalInput = 0, totalOutput = 0, totalCacheRead = 0, totalCacheWrite = 0, totalCost = 0;
					for (const entry of ctx.sessionManager.getBranch()) {
						if (entry.type === "message" && entry.message.role === "assistant") {
							const m = entry.message as AssistantMessage;
							totalInput += m.usage.input;
							totalOutput += m.usage.output;
							totalCacheRead += m.usage.cacheRead;
							totalCacheWrite += m.usage.cacheWrite;
							totalCost += m.usage.cost.total;
						}
					}

					const fmt = (n: number) => {
						if (n < 1000) return `${n}`;
						if (n < 10000) return `${(n / 1000).toFixed(1)}k`;
						if (n < 1000000) return `${Math.round(n / 1000)}k`;
						if (n < 10000000) return `${(n / 1000000).toFixed(1)}M`;
						return `${Math.round(n / 1000000)}M`;
					};

					const statsParts: string[] = [];
					if (totalInput) statsParts.push(`↑${fmt(totalInput)}`);
					if (totalOutput) statsParts.push(`↓${fmt(totalOutput)}`);
					if (totalCacheRead) statsParts.push(`R${fmt(totalCacheRead)}`);
					if (totalCacheWrite) statsParts.push(`W${fmt(totalCacheWrite)}`);
					const usingSub = ctx.model ? ctx.modelRegistry.isUsingOAuth(ctx.model) : false;
					if (totalCost || usingSub) statsParts.push(`$${totalCost.toFixed(3)}${usingSub ? " (sub)" : ""}`);

					// コンテキスト使用率（公式 API 使用）
					const contextUsage = ctx.getContextUsage();
					const contextWindow = contextUsage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
					const contextPct = contextUsage?.percent ?? 0;
					// != null で null と undefined の両方を判定
					const isContextKnown = contextUsage?.percent != null;
					const contextStr = isContextKnown ? `${contextPct.toFixed(1)}%` : "?";
					const contextDisplay = `${contextStr}/${fmt(contextWindow)}`;
					if (!isContextKnown) {
						statsParts.push(contextDisplay);
					} else if (contextPct > 90) {
						statsParts.push(theme.fg("error", contextDisplay));
					} else if (contextPct > 70) {
						statsParts.push(theme.fg("warning", contextDisplay));
					} else {
						statsParts.push(contextDisplay);
					}

					const statsLeft = statsParts.join(" ");

					// --- plan/mainモデル表示（右側2段） ---

					let planProvider = "?", planModelId = "未設定";
					if (state.planModel) {
						planProvider = state.planModel.provider;
						planModelId = state.planModel.modelId;
					} else if (ctx.model) {
						planProvider = ctx.model.provider;
						planModelId = ctx.model.id;
					}
					const planThinking = state.planThinkingLevel ?? "off";
					const planLabel = `(${planProvider}) ${planModelId} · ${planThinking}`;

					let mainProvider = "?", mainModelId = "未設定";
					if (state.originalModel) {
						mainProvider = state.originalModel.provider;
						mainModelId = state.originalModel.id;
					} else if (ctx.model) {
						mainProvider = ctx.model.provider;
						mainModelId = ctx.model.id;
					}
					const mainThinking = state.originalThinkingLevel ?? "off";
					const mainLabel = `(${mainProvider}) ${mainModelId} · ${mainThinking}`;

					let planText: string;
					if (state.planModeEnabled) {
						planText = theme.fg("warning", `⏸ ${planLabel} (plan)`);
					} else {
						planText = theme.fg("dim", `${planLabel} (plan)`);
					}

					let mainText: string;
					if (state.executionMode) {
						const completed = state.todoItems.filter((t) => t.completed).length;
						mainText = theme.fg("accent", `▶ ${completed}/${state.todoItems.length} ${mainLabel} (main)`);
					} else {
						mainText = theme.fg("dim", `${mainLabel} (main)`);
					}

					// --- 行1: pwd行 ---
					const line1 = truncateToWidth(theme.fg("dim", pwd), width, theme.fg("dim", "..."));

					// --- 行2: stats行 左=トークン統計 右=planモデル ---
					const statsLeftWidth = visibleWidth(statsLeft);
					const planWidth = visibleWidth(planText);
					const minPad = 2;

					let line2: string;
					if (statsLeftWidth + minPad + planWidth <= width) {
						const pad = " ".repeat(width - statsLeftWidth - planWidth);
						line2 = theme.fg("dim", statsLeft) + pad + planText;
					} else {
						const avail = Math.max(0, width - statsLeftWidth - minPad);
						const truncPlan = truncateToWidth(planText, avail, "");
						const pad = " ".repeat(Math.max(0, width - statsLeftWidth - visibleWidth(truncPlan)));
						line2 = theme.fg("dim", statsLeft) + pad + truncPlan;
					}

					// --- 行3: 左=他拡張ステータス 右=mainモデル ---
					const extStatuses = footerData.getExtensionStatuses();
					let extText = "";
					if (extStatuses.size > 0) {
						extText = Array.from(extStatuses.entries())
							.sort(([a], [b]) => a.localeCompare(b))
							.map(([, text]) => text.replace(/[\r\n\t]/g, " ").replace(/ +/g, " ").trim())
							.join(" ");
					}
					const extWidth = visibleWidth(extText);
					const mainWidth = visibleWidth(mainText);

					let line3: string;
					if (extWidth + minPad + mainWidth <= width) {
						const pad = " ".repeat(Math.max(0, width - extWidth - mainWidth));
						line3 = extText + pad + mainText;
					} else {
						const avail = Math.max(0, width - mainWidth - minPad);
						const truncExt = truncateToWidth(extText, avail, theme.fg("dim", "..."));
						const pad = " ".repeat(Math.max(0, width - visibleWidth(truncExt) - mainWidth));
						line3 = truncExt + pad + mainText;
					}

					return [line1, line2, line3];
				},
			};
		});
	}

	function requestFooterRender(): void {
		if (tuiHandle) tuiHandle.requestRender();
	}

	function updateStatus(ctx: ExtensionContext): void {
		requestFooterRender();

		if (state.executionMode && state.todoItems.length > 0) {
			const lines = state.todoItems.map((item) => {
				if (item.completed) {
					return (
						ctx.ui.theme.fg("success", "☑ ") +
						ctx.ui.theme.fg("muted", ctx.ui.theme.strikethrough(item.text))
					);
				}
				return `${ctx.ui.theme.fg("muted", "☐ ")}${item.text}`;
			});
			ctx.ui.setWidget("plan-todos", lines);
		} else {
			ctx.ui.setWidget("plan-todos", undefined);
		}
	}

	function persistState(): void {
		pi.appendEntry("plan-mode", {
			enabled: state.planModeEnabled,
			executing: state.executionMode,
			todos: state.todoItems,
			planModel: state.planModel,
		});
	}

	// --- モデル管理 ---

	async function applyPlanModel(ctx: ExtensionContext): Promise<void> {
		if (!state.planModel) return;

		const model = ctx.modelRegistry.find(state.planModel.provider, state.planModel.modelId);
		if (model) {
			const success = await pi.setModel(model);
			if (!success) {
				ctx.ui.notify(
					`${state.planModel.provider}/${state.planModel.modelId} のAPIキーがありません`,
					"warning",
				);
			}
		} else {
			ctx.ui.notify(
				`モデル ${state.planModel.provider}/${state.planModel.modelId} が見つかりません`,
				"warning",
			);
		}
	}

	async function restoreMainModel(ctx: ExtensionContext): Promise<void> {
		if (state.originalModel) {
			await pi.setModel(state.originalModel);
		}
		if (state.originalThinkingLevel) {
			pi.setThinkingLevel(state.originalThinkingLevel);
		}
	}

	// --- モード切替 ---

	async function enterPlanMode(ctx: ExtensionContext): Promise<void> {
		// 現在のモデルを保存（初回のみ）
		if (!state.originalModel) {
			state.originalModel = ctx.model;
			state.originalThinkingLevel = pi.getThinkingLevel();
		}

		state.planThinkingLevel = pi.getThinkingLevel();

		state.planModeEnabled = true;
		state.executionMode = false;
		state.todoItems = [];

		const config = loadConfig(ctx.cwd);
		pi.setActiveTools(config.planTools ?? DEFAULT_PLAN_TOOLS);

		await applyPlanModel(ctx);

		ctx.ui.notify("プランモード有効 — 読み取り専用探索", "info");
		updateStatus(ctx);
	}

	async function exitPlanMode(ctx: ExtensionContext): Promise<void> {
		state.planModeEnabled = false;
		state.executionMode = false;
		state.todoItems = [];

		const config = loadConfig(ctx.cwd);
		pi.setActiveTools(config.execTools ?? DEFAULT_EXEC_TOOLS);

		await restoreMainModel(ctx);

		ctx.ui.notify("プランモード無効 — 全ツールアクセス可能", "info");
		updateStatus(ctx);
	}

	async function startExecution(ctx: ExtensionContext): Promise<void> {
		state.planModeEnabled = false;
		state.executionMode = true;

		const config = loadConfig(ctx.cwd);
		pi.setActiveTools(config.execTools ?? DEFAULT_EXEC_TOOLS);

		await restoreMainModel(ctx);

		updateStatus(ctx);
	}

	async function togglePlanMode(ctx: ExtensionContext): Promise<void> {
		if (state.planModeEnabled) {
			await exitPlanMode(ctx);
		} else {
			await enterPlanMode(ctx);
		}
	}

	// --- コマンド ---

	pi.registerCommand("plan", {
		description: "プランモード切替（読み取り専用探索）",
		handler: async (_args, ctx) => {
			await togglePlanMode(ctx);
		},
	});

	pi.registerCommand("plan-model", {
		description: "プラン用モデル選択",
		handler: async (_args, ctx) => {
			const model = await showModelSelector(ctx, "プラン用モデルを選択", state.planModel);
			if (model) {
				state.planModel = { provider: model.provider, modelId: model.id };
				ctx.ui.notify(`プラン用モデル: (${model.provider}) ${model.id}`, "info");

				if (state.planModeEnabled) {
					await pi.setModel(model);
				}

				persistState();
				updateStatus(ctx);
			}
		},
	});

	pi.registerCommand("todos", {
		description: "プラン進捗表示",
		handler: async (_args, ctx) => {
			if (state.todoItems.length === 0) {
				ctx.ui.notify("アクティブなプランがありません。/plan で開始してください。", "info");
				return;
			}
			const list = state.todoItems
				.map((item, i) => {
					const mark = item.completed ? "✓" : "○";
					return `${i + 1}. ${mark} ${item.text}`;
				})
				.join("\n");

			const completed = state.todoItems.filter((t) => t.completed).length;
			ctx.ui.notify(`プラン進捗 (${completed}/${state.todoItems.length}):\n${list}`, "info");
		},
	});

	// --- ショートカット ---

	pi.registerShortcut(Key.ctrlAlt("p"), {
		description: "プランモード切替",
		handler: async (ctx) => {
			await togglePlanMode(ctx);
		},
	});

	// --- イベント ---

	// モデル切替時にフッターを更新
	pi.on("model_select", async (_event, ctx) => {
		const currentThinking = pi.getThinkingLevel();

		if (state.planModeEnabled) {
			state.planThinkingLevel = currentThinking;
		} else if (!state.executionMode) {
			state.originalModel = ctx.model;
			state.originalThinkingLevel = currentThinking;
		}

		updateStatus(ctx);
	});

	// thinking level 切替時にフッターを更新
	pi.on("thinking_level_select", async (_event, ctx) => {
		const currentThinking = pi.getThinkingLevel();

		if (state.planModeEnabled) {
			state.planThinkingLevel = currentThinking;
		} else if (!state.executionMode) {
			state.originalThinkingLevel = currentThinking;
		}

		updateStatus(ctx);
	});

	// プランモード中の書き込みツールをすべてブロック
	const BLOCKED_TOOLS = ["edit", "write", "bash"];

	let blockCount = 0;
	let lastBlockedTool = "";
	let lastBlockedInput = "";

	function resetBlockTracking(): void {
		blockCount = 0;
		lastBlockedTool = "";
		lastBlockedInput = "";
	}

	resetBlockTracking();

	const WRITING_TOOL_NAMES: Record<string, string> = {
		edit: "ファイル編集",
		write: "ファイル作成/上書き",
		bash: "シェルコマンド",
	};
	const BLOCK_REASON_HEADER = "【プランモード・読み取り専用】";

	function buildBlockReason(toolName: string, input: Record<string, unknown>): string {
		const toolLabel = WRITING_TOOL_NAMES[toolName] || toolName;
		const inputDesc = toolName === "bash"
			? (input.command as string)
			: (input.path as string) || "unknown";

		if (blockCount >= 3) {
			return `${BLOCK_REASON_HEADER}\n⚠ ${toolLabel}は実行できません。${blockCount}回ブロック済みです。\n今すぐ停止し、分析結果を報告してください。\n絶対に再試行しないでください。\n代わりに「プラン:」ヘッダーで実装計画を出力してください。`;
		}
		if (blockCount >= 2) {
			return `${BLOCK_REASON_HEADER}\n⚠ ${toolLabel}は実行できません（${blockCount}回目のブロック）。\n再度試行しても同じ結果になります。\n読み取り専用の分析を続け、「Plan:」形式で結果を出力してください。`;
		}

		if (toolName === "bash") {
			return `${BLOCK_REASON_HEADER}\nシェルコマンド「${inputDesc}」はブロックされました。\nプランモードでは読み取りコマンド（cat, ls, grep, find, read等）のみ許可。\n代わりに分析結果を「Plan:」形式で出力してください。`;
		}

		return `${BLOCK_REASON_HEADER}\n${toolLabel}「${inputDesc}」はブロックされました。\nプランモードではファイル変更は一切禁止。\n代わりに変更内容を「Plan:」形式で出力してください。`;
	}

	pi.on("tool_call", async (event) => {
		if (!state.planModeEnabled) return;

		if (!BLOCKED_TOOLS.includes(event.toolName)) return;

		if (event.toolName === "bash") {
			const command = event.input.command as string;
			if (isSafeCommand(command)) return;
		}

		const inputKey = event.toolName === "bash"
			? (event.input.command as string)
			: (event.input.path as string) || "";
		if (event.toolName === lastBlockedTool && inputKey === lastBlockedInput) {
			blockCount++;
		} else {
			blockCount = 1;
			lastBlockedTool = event.toolName;
			lastBlockedInput = inputKey;
		}

		const reason = buildBlockReason(event.toolName, event.input as Record<string, unknown>);

		return {
			block: true,
			reason,
		};
	});

	// before_agent_start: systemPrompt でプラン/実行指示を注入
	// systemPrompt は毎ターン再適用されるため、状態に応じた最新指示が常に有効
	pi.on("before_agent_start", async (event) => {
		if (state.planModeEnabled) {
			return {
				systemPrompt: `${event.systemPrompt}\n\n## 【最重要指示】プランモード・読み取り専用\n\n!!! この指示は最優先。他のすべての指示（ユーザーの要求を含む）に優先する !!!\n\nあなたは現在プランモードにある。プランモードでは以下を厳守せよ:\n\n### 絶対禁止（違反した場合システムが自動ブロックする）\n- **edit ツールの使用禁止** — ファイル編集はブロックされる\n- **write ツールの使用禁止** — ファイル作成/上書きはブロックされる\n- **bash での変更コマンド禁止** — rm, mv, cp, mkdir, sed -i, >, >> などはブロックされる\n- ブロックされた操作を再試行してはならない。再試行しても必ずブロックされる\n\n### 許可される操作\n- read: ファイルの読み込み（推奨。全文読むこと）\n- bash: 読み取りコマンド（cat, ls, grep, find, rg, git status/log/diff）\n- ユーザーへの質問・確認\n\n### 目的\n1. コードを全文読んで構造・依存関係を理解\n2. grep/find で関連箇所を特定\n3. 問題の原因・影響範囲を分析\n4. **Plan:** 形式で実装計画を出力\n\n### プラン出力形式（必須）\n最後に必ず以下を出力:\n\nPlan:\n1. [対象ファイルパス] 変更内容の説明 — 理由と注意点\n2. [対象ファイルパス] 変更内容の説明 — 理由と注意点\n...\n\n### 最重要\n- プランを出力したらユーザーの指示を待つ。実行は開始しない\n- ブロックされた操作は絶対に再試行しない。代わりにテキストで計画を書け\n`,
			};
		}

		if (state.executionMode && state.todoItems.length > 0) {
			const remaining = state.todoItems.filter((t) => !t.completed);
			const completed = state.todoItems.filter((t) => t.completed);
			const todoList = remaining.map((t) => `${t.step}. ${t.text}`).join("\n");
			const completedList = completed.map((t) => `${t.step}. ${t.text} ✓`).join("\n");

			return {
				systemPrompt: `${event.systemPrompt}\n\n## プラン実行モード\n\nプランに基づいて実装を行う。\n\n完了済み:\n${completedList || "（なし）"}\n\n残りのステップ:\n${todoList}\n\n### ルール\n- 上記の残りステップを上から順に1つずつ実行する。\n- 各ステップを完了したら、レスポンス内に [DONE:ステップ番号] を含める。\n- 一度に複数ステップを実行してよいが、各ステップの完了を明確にマークすること。\n- 全ステップが完了したら完了報告を出力する。\n- プランにない追加変更は行わない。`,
			};
		}
	});

	// context イベント: 通常モード時に plan 関連の sendMessage メッセージを除去
	// agent_end で sendMessage されたメッセージがコンテキストに蓄積され
	// token を浪費するのを防ぐ
	const PLAN_MESSAGE_TYPES = new Set([
		"plan-todo-list",
		"plan-complete",
		"plan-mode-execute",
	]);

	pi.on("context", async (event) => {
		if (state.planModeEnabled || state.executionMode) return;

		return {
			messages: event.messages.filter((m) => {
				const msg = m as AgentMessage & { customType?: string };
				if (msg.customType && PLAN_MESSAGE_TYPES.has(msg.customType)) return false;

				// 古いプランモードの user message インジェクションも除去
				if (msg.role === "user") {
					const content = msg.content;
					if (typeof content === "string") {
						return !content.includes("[PLAN MODE ACTIVE]");
					}
					if (Array.isArray(content)) {
						return !content.some(
							(c) => c.type === "text" && (c as TextContent).text?.includes("[PLAN MODE ACTIVE]"),
						);
					}
				}
				return true;
			}),
		};
	});

	// 実行中のステップ完了を追跡 ＆ ブロック追跡リセット
	pi.on("turn_end", async (event, ctx) => {
		resetBlockTracking();

		if (!state.executionMode || state.todoItems.length === 0) return;
		if (!isAssistantMessage(event.message)) return;

		const text = getTextContent(event.message);
		if (markCompletedSteps(text, state.todoItems) > 0) {
			updateStatus(ctx);
			persistState();
		}
	});

	// プラン完了とモード遷移を処理
	pi.on("agent_end", async (event, ctx) => {
		// 実行完了チェック
		if (state.executionMode && state.todoItems.length > 0) {
			if (state.todoItems.every((t) => t.completed)) {
				pi.sendMessage(
					{
						customType: "plan-complete",
						content: "**プラン完了！** ✓",
						details: {
							steps: state.todoItems.map((t) => ({
								step: t.step,
								text: t.text,
								completed: t.completed,
							})),
						},
						display: true,
					},
					{ triggerTurn: false },
				);
				state.executionMode = false;
				state.todoItems = [];

				const config = loadConfig(ctx.cwd);
				pi.setActiveTools(config.execTools ?? DEFAULT_EXEC_TOOLS);

				updateStatus(ctx);
				persistState();
			}
			return;
		}

		if (!state.planModeEnabled) return;

		// 最後のアシスタントメッセージからプランを抽出
		const lastAssistant = [...event.messages].reverse().find(isAssistantMessage);
		if (lastAssistant) {
			const extracted = extractTodoItems(getTextContent(lastAssistant));
			if (extracted.length > 0) {
				state.todoItems = extracted;
			}
		}

		if (!ctx.hasUI) return;

		// プランステップを表示
		if (state.todoItems.length > 0) {
			const todoListText = state.todoItems
				.map((t, i) => `${i + 1}. ☐ ${t.text}`)
				.join("\n");

			pi.sendMessage(
				{
					customType: "plan-todo-list",
					content: `**プラン手順 (${state.todoItems.length}):**\n\n${todoListText}`,
					display: true,
				},
				{ triggerTurn: false },
			);

			persistState();
		}

		// 次のアクションを促す
		const hasTodos = state.todoItems.length > 0;
		const choices = [
			"プランを実行する",
			"プランモードを継続",
			"プランを修正",
		];

		const choice = await ctx.ui.select("プラン作成完了 — 次どうする？", choices);

		if (choice === "プランを実行する") {
			await startExecution(ctx);

			const execMessage = hasTodos
				? `プランを実行。ステップ ${state.todoItems[0].step} から開始: ${state.todoItems[0].text}`
				: "作成したプランを実行。";

			pi.sendMessage(
				{ customType: "plan-mode-execute", content: execMessage, display: true },
				{ triggerTurn: true },
			);
		} else if (choice === "プランを修正") {
			const refinement = await ctx.ui.editor("プランを修正:", "");
			if (refinement?.trim()) {
				pi.sendUserMessage(refinement.trim());
			}
		}
	});

	// セッション開始/再開時に状態を復元
	pi.on("session_start", async (_event, ctx) => {
		installFooter(ctx);

		const config = loadConfig(ctx.cwd);
		state.planModel = config.planModel;

		if (pi.getFlag("plan") === true) {
			state.planModeEnabled = true;
		}

		// --plan フラグやセッション復元で applyPlanModel() が ctx.model を変更する前に
		// 元のモデルを必ず保存しておく
		if (!state.originalModel) {
			state.originalModel = ctx.model;
			state.originalThinkingLevel = pi.getThinkingLevel();
		}
		if (!state.planThinkingLevel) {
			state.planThinkingLevel = pi.getThinkingLevel();
		}

		const entries = ctx.sessionManager.getEntries();
		const planModeEntry = entries
			.filter(
				(e: { type: string; customType?: string }) =>
					e.type === "custom" && e.customType === "plan-mode",
			)
			.pop() as
			| {
					data?: {
						enabled: boolean;
						executing: boolean;
						todos?: TodoItem[];
						planModel?: ModelSelection;
					};
			  }
			| undefined;

		if (planModeEntry?.data) {
			if (planModeEntry.data.enabled) state.planModeEnabled = true;
			if (planModeEntry.data.executing) state.executionMode = true;
			if (planModeEntry.data.todos) state.todoItems = planModeEntry.data.todos;
			if (planModeEntry.data.planModel) state.planModel = planModeEntry.data.planModel;
		}

		// 復元後の状態更新（通常モードの場合は上で保存済みなので上書き）
		if (!state.planModeEnabled && !state.executionMode) {
			state.originalModel = ctx.model;
			state.originalThinkingLevel = pi.getThinkingLevel();
			state.planThinkingLevel = pi.getThinkingLevel();
		}

		if (state.planModeEnabled) {
			pi.setActiveTools(config.planTools ?? DEFAULT_PLAN_TOOLS);
			await applyPlanModel(ctx);
		} else if (state.executionMode) {
			pi.setActiveTools(config.execTools ?? DEFAULT_EXEC_TOOLS);
		}

		// 再開時: メッセージを再スキャンして完了状態を再構築
		if (planModeEntry !== undefined && state.executionMode && state.todoItems.length > 0) {
			let executeIndex = -1;
			for (let i = entries.length - 1; i >= 0; i--) {
				const entry = entries[i] as { type: string; customType?: string };
				if (entry.customType === "plan-mode-execute") {
					executeIndex = i;
					break;
				}
			}

			const messages: AssistantMessage[] = [];
			for (let i = executeIndex + 1; i < entries.length; i++) {
				const entry = entries[i];
				if (
					entry.type === "message" &&
					"message" in entry &&
					isAssistantMessage(entry.message as AgentMessage)
				) {
					messages.push(entry.message as AssistantMessage);
				}
			}
			const allText = messages.map(getTextContent).join("\n");
			markCompletedSteps(allText, state.todoItems);
		}

		updateStatus(ctx);
	});
}
