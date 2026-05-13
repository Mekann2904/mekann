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
	applyExecutionTools,
	restoreOriginalToolsAndClear,
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
	isSafeCommand,
	extractTodoItems,
	markCompletedSteps,
	buildBlockReason,
	loadPrompt,
	hashContent,
	hashTodoItems,
	validatePlan,
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
					return `${i + 1}. ${mark} [${item.id}] ${item.text}`;
				})
				.join("\n");

			const completed = state.todoItems.filter((t) => t.completed).length;
			ctx.ui.notify(`プラン進捗 (${completed}/${state.todoItems.length}):\n${list}`, "info");
		},
	});

	pi.registerCommand("execute-plan", {
		description: "保存済みプランを実行モードに移行して実行開始",
		handler: async (_args, ctx) => {
			if (state.todoItems.length === 0) {
				ctx.ui.notify("実行可能なプランがありません。先にプランを作成してください。", "warning");
				return;
			}
			if (state.executionMode) {
				ctx.ui.notify("すでに実行モード中です。", "info");
				return;
			}
			await wrappedStartExecution(ctx);
			wrappedPersistState();
			pi.sendUserMessage("プランを実行開始。");
		},
	});

	pi.registerCommand("plan-clear", {
		description: "現在のプランと todo を破棄",
		handler: async (_args, ctx) => {
			if (state.todoItems.length === 0 && !state.planModeEnabled && !state.executionMode) {
				ctx.ui.notify("破棄するプランがありません。", "info");
				return;
			}
			state.todoItems = [];
			state.executionMode = false;
			state.planModeEnabled = false;
			state.planPromptDelivered = false;
			state.planPromptHash = undefined;

			restoreOriginalToolsAndClear(pi, state);
			await restoreMainModel(pi, state);

			ctx.ui.notify("プランを破棄しました。通常モードに復帰。", "info");
			updateStatus(ctx);
			wrappedPersistState();
		},
	});

	pi.registerCommand("plan-status", {
		description: "プランの詳細状態を表示（mode, model, tools, plan hash, steps）",
		handler: async (_args, ctx) => {
			const mode = state.planModeEnabled
				? "プランモード（読み取り専用）"
				: state.executionMode
				  ? "実行モード"
				  : "通常モード";

			const planModel = state.planModel
				? `${state.planModel.provider}/${state.planModel.modelId}`
				: "未設定";
			const mainModel = state.originalModel
				? `${state.originalModel.provider}/${state.originalModel.id}`
				: "未設定";

			const activeTools = pi.getActiveTools().join(", ");

			const lines: string[] = [
				`モード: ${mode}`,
				`プラン用モデル: ${planModel}`,
				`実行用モデル: ${mainModel}`,
				`アクティブツール: ${activeTools}`,
			];

			if (state.todoItems.length > 0) {
				const completed = state.todoItems.filter((t) => t.completed).length;
				const planHash = hashTodoItems(state.todoItems);
				lines.push(`プラン進捗: ${completed}/${state.todoItems.length}`);
				lines.push(`プランハッシュ: ${planHash}`);
				lines.push("");
				lines.push("ステップ:");
				for (const item of state.todoItems) {
					const mark = item.completed ? "✓" : "○";
					lines.push(`  ${mark} [${item.id}] ${item.text}`);
				}
			} else {
				lines.push("プラン: なし");
			}

			ctx.ui.notify(lines.join("\n"), "info");
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
			// プランモード中のモデル変更は plan 側の設定として記録
			if (ctx.model) {
				state.planModel = { provider: ctx.model.provider, modelId: ctx.model.id };
			}
			state.planThinkingLevel = currentThinking;
			wrappedPersistState();
		} else if (!state.executionMode) {
			// 通常モード中のユーザーによるモデル変更を追跡
			// (restoreMainModel 後の再変更に対応するため)
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

	// プランモード中のツール制限 — allowlist 方式
	// read/grep/find/ls は無条件許可、bash は isSafeCommand() で検査、
	// それ以外（edit, write, 将来の tool 含む）は原則ブロック。
	const SAFE_PLAN_TOOLS = new Set(["read", "grep", "find", "ls"]);

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

		const { toolName } = event;
		// P0: event.input が null/undefined の場合も安全に処理
		const input = (event.input ?? {}) as Record<string, unknown>;

		// read/grep/find/ls は無条件許可
		if (SAFE_PLAN_TOOLS.has(toolName)) return;

		// bash はコマンド内容で安全性を判定
		if (toolName === "bash") {
			const command = String(input.command ?? "");
			if (!isSafeCommand(command)) {
				return {
					block: true,
					reason: `Plan mode is read-only. Blocked unsafe bash command:\n${command}`,
				};
			}
			return; // safe command は許可
		}

		// それ以外は原則ブロック（edit, write, 将来の tool 含む）
		const inputKey = String(input.path ?? "");
		if (toolName === lastBlockedTool && inputKey === lastBlockedInput) {
			blockCount++;
		} else {
			blockCount = 1;
			lastBlockedTool = toolName;
			lastBlockedInput = inputKey;
		}

		const reason = buildBlockReason(toolName, input, blockCount);

		return {
			block: true,
			reason,
		};
	});

	// before_agent_start: systemPrompt でプラン/実行指示を注入
	pi.on("before_agent_start", async (event) => {
		if (state.planModeEnabled) {
			const fullPrompt = loadPrompt("plan-mode");
			const currentHash = hashContent(fullPrompt);

			const shouldInjectFull =
				!state.planPromptDelivered ||
				state.planPromptHash !== currentHash;

			const prompt = shouldInjectFull
				? fullPrompt
				: loadPrompt("plan-mode-reminder");

			if (shouldInjectFull) {
				state.planPromptHash = currentHash;
				state.planPromptDelivered = true;
			}

			return {
				systemPrompt: `${event.systemPrompt}\n\n${prompt}`,
			};
		}

		if (state.executionMode && state.todoItems.length > 0) {
			const remaining = state.todoItems.filter((t) => !t.completed);
			const completed = state.todoItems.filter((t) => t.completed);
			const todoList = remaining.map((t) => {
				let line = `${t.step}. [${t.id}] ${t.instruction ?? t.text}`;
				if (t.acceptance) line += `\n   Acceptance: ${t.acceptance}`;
				return line;
			}).join("\n");
			const completedList = completed.map((t) => `${t.step}. [${t.id}] ${t.text} ✓`).join("\n");
			const executeModeTemplate = loadPrompt("execute-mode");
			const executeModePrompt = executeModeTemplate
				.replaceAll("${completedList}", completedList || "（なし）")
				.replaceAll("${todoList}", todoList);

			return {
				systemPrompt: `${event.systemPrompt}\n\n${executeModePrompt}`,
			};
		}
	});

	// context イベント: plan 関連の sendMessage メッセージを全モードで除去
	const PLAN_MESSAGE_TYPES = new Set([
		"plan-todo-list",
		"plan-complete",
	]);

	pi.on("context", async (event) => {
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
				ctx.ui.notify("**プラン完了！** ✓", "success");
				state.executionMode = false;
				state.todoItems = [];

				restoreOriginalToolsAndClear(pi, state);

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
		const hasProposedPlan = /<proposed_plan>[\s\S]*?<\/proposed_plan>/.test(assistantText);

		// <proposed_plan> がない場合は Todo 抽出もダイアログも行わない
		// （探索フェーズ中の番号付きリスト誤抽出を防ぐ）
		if (!hasProposedPlan) return;

		const extracted = extractTodoItems(assistantText);

		if (extracted.length === 0) {
			wrappedPersistState();
			return;
		}

		// todo を state に保存（UI 有無に関わらない）
		state.todoItems = extracted;

		// 品質チェック
		const validation = validatePlan(extracted);
		if (!validation.valid) {
			ctx.ui.notify(
				`プランを詳細化してください:\n${validation.issues.join("\n")}`,
				"warning",
			);
			wrappedPersistState();
			return;
		}
		if (validation.warnings.length > 0) {
			ctx.ui.notify(
				`推奨: ${validation.warnings.join("\n")}`,
				"info",
			);
		}

		// 永続化（UI 有無に関わらない）
		wrappedPersistState();

		// 保存と通知のみ。実行開始は /execute-plan で明示的に
		ctx.ui.notify(
			`プラン手順 (${state.todoItems.length}) を保存しました。/execute-plan で実行を開始できます。`,
			"info",
		);
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
			if ((planModeEntry.data as { savedActiveTools?: string[] }).savedActiveTools) {
				state.savedActiveTools = (planModeEntry.data as { savedActiveTools?: string[] }).savedActiveTools;
			}

			// P0: persisted originalModel/originalThinkingLevel を優先復元
			// plan/execution 中にセッション再開した場合、ctx.model は plan モデルの可能性があるため
			const persistedOriginal = (planModeEntry.data as { originalModel?: { provider: string; modelId: string } }).originalModel;
			if (persistedOriginal) {
				const restored = ctx.modelRegistry.find(persistedOriginal.provider, persistedOriginal.modelId);
				if (restored) state.originalModel = restored;
			}
			const persistedThinking = (planModeEntry.data as { originalThinkingLevel?: string }).originalThinkingLevel;
			if (persistedThinking) {
				state.originalThinkingLevel = persistedThinking;
			}

			// 後方互換: 古い TodoItem（id, instruction なし）にデフォルトを設定
			state.todoItems = state.todoItems.map((item: TodoItem, i: number) => ({
				...item,
				id: item.id || `step-${item.step || i + 1}`,
				instruction: item.instruction || item.text || "",
			}));
		}

		// persisted 復元後にまだ未設定の場合のみ ctx.model をフォールバックとして保存
		// (plan/execution 中の再開では上で persisted 値が設定済みなので ctx.model で上書きされない)
		if (!state.originalModel) {
			state.originalModel = ctx.model;
			state.originalThinkingLevel = pi.getThinkingLevel();
		}
		if (!state.planThinkingLevel) {
			state.planThinkingLevel = pi.getThinkingLevel();
		}

		// 通常モードの場合は最新 ctx.model で更新
		if (!state.planModeEnabled && !state.executionMode) {
			state.originalModel = ctx.model;
			state.originalThinkingLevel = pi.getThinkingLevel();
			state.planThinkingLevel = pi.getThinkingLevel();
		}

		if (state.planModeEnabled) {
			pi.setActiveTools(config.planTools ?? DEFAULT_PLAN_TOOLS);
			await wrappedApplyPlanModel(ctx);
		} else if (state.executionMode) {
			applyExecutionTools(pi, state, ctx.cwd);
		}

		// 再開時: planHash が一致する場合のみ [DONE:n] を再スキャン
		if (planModeEntry !== undefined && state.executionMode && state.todoItems.length > 0) {
			let executeIndex = -1;
			let executionPlanHash: string | undefined;

			for (let i = entries.length - 1; i >= 0; i--) {
				const entry = entries[i] as {
					type: string;
					customType?: string;
					data?: { planHash?: string };
				};
				if (entry.customType === "plan-mode-execute") {
					executeIndex = i;
					executionPlanHash = entry.data?.planHash;
					break;
				}
			}

			const currentPlanHash = hashTodoItems(state.todoItems);

			// planHash が一致する場合のみ再スキャン（古い DONE が新 plan に混入するのを防ぐ）
			if (executionPlanHash && executionPlanHash === currentPlanHash && executeIndex >= 0) {
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
		}

		updateStatus(ctx);
	});
}
