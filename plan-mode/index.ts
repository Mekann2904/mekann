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

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, TextContent } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Key } from "@earendil-works/pi-tui";
import { showModelSelector, type ModelSelection } from "./model-selector.js";
import {
	createInitialState,
	persistState,
	applyPlanModel,
	restoreMainModel,
	enterPlanMode,
	exitPlanMode,
	startExecution,
	togglePlanMode,
	loadConfig,
	DEFAULT_PLAN_TOOLS,
	DEFAULT_EXEC_TOOLS,
	type ModeState,
} from "./state.js";
import { installFooter, type FooterHandle } from "./footer.js";
import {
	extractTodoItems,
	isSafeCommand,
	markCompletedSteps,
	buildBlockReason,
	loadPrompt,
	type TodoItem,
} from "./utils.js";

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

// --- メイン拡張機能 ---

export default function planModeExtension(pi: ExtensionAPI): void {
	const state: ModeState = createInitialState();
	let footerHandle: FooterHandle | null = null;

	pi.registerFlag("plan", {
		description: "プランモードで起動（読み取り専用探索）",
		type: "boolean",
		default: false,
	});

	// --- UI更新 ---

	function requestFooterRender(): void {
		if (footerHandle) footerHandle.requestRender();
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

	// 状態遷移ヘルパー（updateStatus を注入したラッパー）
	const wrappedTogglePlanMode = (ctx: ExtensionContext) =>
		togglePlanMode(pi, state, ctx, updateStatus);
	const wrappedEnterPlanMode = (ctx: ExtensionContext) =>
		enterPlanMode(pi, state, ctx, updateStatus);
	const wrappedExitPlanMode = (ctx: ExtensionContext) =>
		exitPlanMode(pi, state, ctx, updateStatus);
	const wrappedStartExecution = (ctx: ExtensionContext) =>
		startExecution(pi, state, ctx, updateStatus);
	const wrappedApplyPlanModel = (ctx: ExtensionContext) =>
		applyPlanModel(pi, state, ctx);
	const wrappedRestoreMainModel = () =>
		restoreMainModel(pi, state);
	const wrappedPersistState = () =>
		persistState(pi, state);

	// --- コマンド ---

	pi.registerCommand("plan", {
		description: "プランモード切替（読み取り専用探索）",
		handler: async (_args, ctx) => {
			await wrappedTogglePlanMode(ctx);
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

				wrappedPersistState();
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
			await wrappedTogglePlanMode(ctx);
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

		const reason = buildBlockReason(event.toolName, event.input as Record<string, unknown>, blockCount);

		return {
			block: true,
			reason,
		};
	});

	// before_agent_start: systemPrompt でプラン/実行指示を注入
	pi.on("before_agent_start", async (event) => {
		if (state.planModeEnabled) {
			const planModePrompt = loadPrompt("plan-mode");
			return {
				systemPrompt: `${event.systemPrompt}\n\n${planModePrompt}`,
			};
		}

		if (state.executionMode && state.todoItems.length > 0) {
			const remaining = state.todoItems.filter((t) => !t.completed);
			const completed = state.todoItems.filter((t) => t.completed);
			const todoList = remaining.map((t) => `${t.step}. ${t.text}`).join("\n");
			const completedList = completed.map((t) => `${t.step}. ${t.text} ✓`).join("\n");
			const executeModeTemplate = loadPrompt("execute-mode");
			const executeModePrompt = executeModeTemplate
				.replaceAll("${completedList}", completedList || "（なし）")
				.replaceAll("${todoList}", todoList);

			return {
				systemPrompt: `${event.systemPrompt}\n\n${executeModePrompt}`,
			};
		}
	});

	// context イベント: 通常モード時に plan 関連の sendMessage メッセージを除去
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
			wrappedPersistState();
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
				wrappedPersistState();
			}
			return;
		}

		if (!state.planModeEnabled) return;

		// 最後のアシスタントメッセージから <proposed_plan> を検出
		const lastAssistant = [...event.messages].reverse().find(isAssistantMessage);
		if (!lastAssistant) return;

		const assistantText = getTextContent(lastAssistant);
		const hasProposedPlan = /<proposed_plan>/.test(assistantText);

		// <proposed_plan> がない場合は Todo 抽出もダイアログも行わない
		// （探索フェーズ中の番号付きリスト誤抽出を防ぐ）
		if (!hasProposedPlan) return;

		const extracted = extractTodoItems(assistantText);
		if (extracted.length > 0) {
			state.todoItems = extracted;
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

			wrappedPersistState();
		}

		// 次のアクションを促す
		const hasTodos = state.todoItems.length > 0;
		const choices = [
			"プランを実行する",
			"プランモードを継続",
			"プランを修正",
		];

		const choice = await ctx.ui.select("プランが提出されました — 次どうする？", choices);

		if (choice === "プランを実行する") {
			await wrappedStartExecution(ctx);

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
		footerHandle = installFooter(ctx, state);

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
			await wrappedApplyPlanModel(ctx);
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
