/**
 * Plan Mode Extension
 *
 * Codexライクなプランモード — コード分析/計画と実装を分離。
 *
 * 状態機械:
 *   normal → planning → plan_ready → executing → completed/aborted
 *   plan_ready → planning（revision）
 *   executing → planning（中断・再計画）
 *   completed/aborted → normal（リセット）
 *
 * 機能:
 * - プランモード: 読み取り専用探索（プラン用モデル使用）
 * - plan_ready: プラン承認待ち（読み取り専用）
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
 * - /execute-plan  - plan_ready から実行開始
 * - /revise-plan   - plan_ready → planning に戻る
 * - /discard-plan  - プラン破棄 → normal
 * - /plan-status   - 詳細状態表示
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
	markPlanReady,
	revisePlan as revisePlanState,
	markCompleted,
	markAborted,
	forceResetToNormal,
	loadConfig,
	isReadOnlyMode,
	modeLabel,
	DEFAULT_PLAN_TOOLS,
	DEFAULT_EXEC_TOOLS,
	sanitizePlanTools,
	validateRestoredMode,
	validateRestoredTodoItem,
	type ModeState,
	type PlanMode,
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

// --- Active plan helper ---

/**
 * 実行中は frozenPlan を、それ以外は todoItems を返す。
 * 実行フェーズでは frozenPlan（不変スナップショット）が唯一の権威ある plan となる。
 */
function activePlan(state: ModeState): TodoItem[] {
	return (state.mode === "executing" && state.frozenPlan) ? state.frozenPlan : state.todoItems;
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

		if ((state.mode === "executing" || state.mode === "plan_ready") && activePlan(state).length > 0) {
			const lines = activePlan(state).map((item) => {
				if (item.completed) {
					return (
						ctx.ui.theme.fg("success", "☑ ") +
						ctx.ui.theme.fg("muted", ctx.ui.theme.strikethrough(item.text))
					);
				}
				const prefix = item.status === "failed"
					? ctx.ui.theme.fg("error", "✗ ")
					: item.status === "in_progress"
					  ? ctx.ui.theme.fg("accent", "→ ")
					  : ctx.ui.theme.fg("muted", "☐ ");
				return `${prefix}${item.text}`;
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

	// --- 共通: normal に戻す ---

	async function resetToNormal(ctx: ExtensionContext, message?: string): Promise<void> {
		forceResetToNormal(state);
		restoreOriginalToolsAndClear(pi, state);
		await restoreMainModel(pi, state);

		ctx.ui.notify(message ?? "通常モードに復帰しました。", "info");
		updateStatus(ctx);
		wrappedPersistState();
	}

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

				if (isReadOnlyMode(state.mode)) {
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
			const plan = activePlan(state);
			if (plan.length === 0) {
				ctx.ui.notify("アクティブなプランがありません。/plan で開始してください。", "info");
				return;
			}
			const list = plan
				.map((item, i) => {
					const statusIcon = item.status === "done" ? "✓"
						: item.status === "failed" ? "✗"
						: item.status === "in_progress" ? "→"
						: item.status === "skipped" ? "⊘"
						: "○";
					return `${i + 1}. ${statusIcon} [${item.id}] ${item.text}`;
				})
				.join("\n");

			const completed = plan.filter((t) => t.completed).length;
			ctx.ui.notify(`プラン進捗 (${completed}/${plan.length}):\n${list}`, "info");
		},
	});

	pi.registerCommand("execute-plan", {
		description: "保存済みプランを実行モードに移行して実行開始",
		handler: async (_args, ctx) => {
			if (state.mode !== "plan_ready") {
				ctx.ui.notify(
					`現在 ${modeLabel(state.mode)} です。/execute-plan は plan_ready 状態でのみ使用できます。`,
					"warning",
				);
				return;
			}
			if (state.todoItems.length === 0) {
				ctx.ui.notify("実行可能なプランがありません。先にプランを作成してください。", "warning");
				return;
			}
			// validation gate
			const validation = validatePlan(state.todoItems);
			if (!validation.valid) {
				ctx.ui.notify(
					`プランが無効なため実行できません:\n${validation.issues.join("\n")}`,
					"error",
				);
				return;
			}

			// 実行前に対象planの要約を表示
			const summary = state.todoItems
				.map((t, i) => `${i + 1}. [${t.id}] ${t.text}`)
				.join("\n");
			ctx.ui.notify(`以下のプランを実行開始します:\n${summary}`, "info");

			await wrappedStartExecution(ctx);
			wrappedPersistState();

			// frozenPlan（実行スナップショット）に基づく開始メッセージ
			const frozen = state.frozenPlan ?? state.todoItems;
			const remaining = frozen.filter((t) => !t.completed);
			const executePrompt = `プラン (revision ${state.planRevision}) を実行開始。残り ${remaining.length} ステップ。`;
			pi.sendUserMessage(executePrompt);
		},
	});

	pi.registerCommand("revise-plan", {
		description: "plan_ready → planning に戻りプランを修正する",
		handler: async (_args, ctx) => {
			if (state.mode !== "plan_ready" && state.mode !== "planning") {
				ctx.ui.notify(
					`現在 ${modeLabel(state.mode)} です。/revise-plan は plan_ready または planning 状態でのみ使用できます。`,
					"warning",
				);
				return;
			}

			if (state.mode === "plan_ready") {
				revisePlanState(state);
				// planning ツールを適用
				const config = loadConfig(ctx.cwd);
				pi.setActiveTools(sanitizePlanTools(config.planTools ?? DEFAULT_PLAN_TOOLS));
				ctx.ui.notify("プランを再修正中 — 読み取り専用探索", "info");
			} else {
				ctx.ui.notify("すでに planning 状態です。引き続きプランを修正してください。", "info");
			}

			updateStatus(ctx);
			wrappedPersistState();
		},
	});

	pi.registerCommand("abort-plan", {
		description: "実行中のプランを中断（executing/planning → aborted → normal）",
		handler: async (_args, ctx) => {
			if (state.mode !== "executing" && state.mode !== "planning" && state.mode !== "plan_ready") {
				ctx.ui.notify(
					`現在 ${modeLabel(state.mode)} です。/abort-plan は executing/planning/plan_ready でのみ使用できます。`,
					"warning",
			);
				return;
			}

			markAborted(state);
			restoreOriginalToolsAndClear(pi, state);
			await restoreMainModel(pi, state);

			ctx.ui.notify("プランを中断しました。", "warning");
			updateStatus(ctx);
			wrappedPersistState();
		},
	});

	pi.registerCommand("discard-plan", {
		description: "現在のプランを破棄して normal に戻る",
		handler: async (_args, ctx) => {
			if (state.mode === "normal" && state.todoItems.length === 0) {
				ctx.ui.notify("破棄するプランがありません。", "info");
				return;
			}
			await resetToNormal(ctx, "プランを破棄しました。");
		},
	});

	// 後方互換: /plan-clear も残す
	pi.registerCommand("plan-clear", {
		description: "プランを破棄（/discard-plan のエイリアス）",
		handler: async (_args, ctx) => {
			if (state.mode === "normal" && state.todoItems.length === 0) {
				ctx.ui.notify("破棄するプランがありません。", "info");
				return;
			}
			await resetToNormal(ctx, "プランを破棄しました。");
		},
	});

	pi.registerCommand("plan-status", {
		description: "プランの詳細状態を表示（mode, model, tools, plan hash, steps）",
		handler: async (_args, ctx) => {
			const planModel = state.planModel
				? `${state.planModel.provider}/${state.planModel.modelId}`
				: "未設定";
			const mainModel = state.originalModel
				? `${state.originalModel.provider}/${state.originalModel.id}`
				: "未設定";

			const activeTools = pi.getActiveTools().join(", ");

			const lines: string[] = [
				`モード: ${modeLabel(state.mode)} (${state.mode})`,
				`プラン用モデル: ${planModel}`,
				`実行用モデル: ${mainModel}`,
				`アクティブツール: ${activeTools}`,
			];

			if (state.planId) {
				lines.push(`プランID: ${state.planId} (revision ${state.planRevision})`);
			}

			if (activePlan(state).length > 0) {
				const plan = activePlan(state);
				const completed = plan.filter((t) => t.completed).length;
				const planHash = hashTodoItems(plan, state.planId, state.planRevision);
				lines.push(`プラン進捗: ${completed}/${plan.length}`);
				lines.push(`プランハッシュ: ${planHash}`);
				lines.push("");
				lines.push("ステップ:");
				for (const item of plan) {
					const statusIcon = item.status === "done" ? "✓"
						: item.status === "failed" ? "✗"
						: item.status === "in_progress" ? "→"
						: item.status === "skipped" ? "⊘"
						: "○";
					const extra = item.verification ? ` [verify: ${item.verification}]` : "";
					lines.push(`  ${statusIcon} [${item.id}] ${item.text}${extra}`);
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

		if (isReadOnlyMode(state.mode)) {
			// プランモード中のモデル変更は plan 側の設定として記録
			if (ctx.model) {
				state.planModel = { provider: ctx.model.provider, modelId: ctx.model.id };
			}
			state.planThinkingLevel = currentThinking;
			wrappedPersistState();
		} else if (state.mode === "normal" || state.mode === "completed" || state.mode === "aborted") {
			// 通常モード中のユーザーによるモデル変更を追跡
			state.originalModel = ctx.model;
			state.originalThinkingLevel = currentThinking;
		}

		updateStatus(ctx);
	});

	// thinking level 切替時にフッターを更新
	pi.on("thinking_level_select", async (_event, ctx) => {
		const currentThinking = pi.getThinkingLevel();

		if (isReadOnlyMode(state.mode)) {
			state.planThinkingLevel = currentThinking;
		} else if (state.mode === "normal" || state.mode === "completed" || state.mode === "aborted") {
			state.originalThinkingLevel = currentThinking;
		}

		updateStatus(ctx);
	});

	// プランモード中のツール制限 — allowlist 方式
	// planning / plan_ready の両方で読み取り専用を強制する。
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
		// planning / plan_ready 以外ではツール制限なし
		if (!isReadOnlyMode(state.mode)) return;

		const { toolName } = event;
		const input = (event.input ?? {}) as Record<string, unknown>;

		// read/grep/find/ls は無条件許可
		if (SAFE_PLAN_TOOLS.has(toolName)) return;

		// bash はコマンド内容で安全性を判定
		if (toolName === "bash") {
			const command = String(input.command ?? "");
			if (!isSafeCommand(command)) {
				// 監査ログ: unsafe bash ブロックも記録
				pi.appendEntry("plan-mode-blocked-tool", {
					at: Date.now(),
					mode: state.mode,
					toolName: "bash",
					command,
					blockCount: 1,
					reason: "unsafe-bash",
				});
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

		// 監査ログ: ブロックされたツール呼び出しを永続化
		// 機密情報を避けるため、path と command のみ記録
		pi.appendEntry("plan-mode-blocked-tool", {
			at: Date.now(),
			mode: state.mode,
			toolName,
			path: typeof input?.path === "string" ? input.path : undefined,
			command: typeof input?.command === "string" ? input.command : undefined,
			blockCount,
		});

		return {
			block: true,
			reason,
		};
	});

	// before_agent_start: systemPrompt でプラン/実行指示を注入
	pi.on("before_agent_start", async (event) => {
		if (isReadOnlyMode(state.mode)) {
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

		if (state.mode === "executing" && state.frozenPlan && state.frozenPlan.length > 0) {
			const frozen = state.frozenPlan;
			const remaining = frozen.filter((t) => !t.completed);
			const completed = frozen.filter((t) => t.completed);
			const todoList = remaining.map((t) => {
				let line = `${t.step}. [${t.id}] ${t.instruction ?? t.text}`;
				if (t.acceptance) line += `\n   Acceptance: ${t.acceptance}`;
				if (t.verification) line += `\n   Verification: ${t.verification}`;
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

		if (state.mode !== "executing" || !state.frozenPlan || state.frozenPlan.length === 0) return;
		if (!isAssistantMessage(event.message)) return;

		const text = getTextContent(event.message);
		if (markCompletedSteps(text, state.frozenPlan) > 0) {
			updateStatus(ctx);
			wrappedPersistState();
		}
	});

	// プラン完了とモード遷移を処理
	pi.on("agent_end", async (event, ctx) => {
		// 実行完了チェック
		if (state.mode === "executing" && state.frozenPlan && state.frozenPlan.length > 0) {
			if (state.frozenPlan.every((t) => t.completed)) {
				markCompleted(state);
				ctx.ui.notify("**プラン完了！** ✓", "success");

				restoreOriginalToolsAndClear(pi, state);

				updateStatus(ctx);
				wrappedPersistState();
			}
			return;
		}

		// planning モード以外ではプラン抽出を行わない
		if (state.mode !== "planning") return;

		// 最後のアシスタントメッセージから <proposed_plan> を検出
		const lastAssistant = [...event.messages].reverse().find(isAssistantMessage);
		if (!lastAssistant) return;

		const assistantText = getTextContent(lastAssistant);
		const hasProposedPlan = /<proposed_plan>[\s\S]*?<\/proposed_plan>/.test(assistantText);

		// <proposed_plan> がない場合は Todo 抽出もダイアログも行わない
		if (!hasProposedPlan) return;

		const extracted = extractTodoItems(assistantText);

		if (extracted.length === 0) {
			wrappedPersistState();
			return;
		}

		// 品質チェック
		const validation = validatePlan(extracted);
		if (!validation.valid) {
			ctx.ui.notify(
				`プランを詳細化してください:\n${validation.issues.join("\n")}`,
				"warning",
			);
			return;
		}

		// validation 通過後のみ state に採用 → plan_ready に移行
		state.todoItems = extracted;
		markPlanReady(state);

		if (validation.warnings.length > 0) {
			ctx.ui.notify(
				`推奨: ${validation.warnings.join("\n")}`,
				"info",
			);
		}

		wrappedPersistState();

		// plan_ready 通知 + 次のアクションを提示
		ctx.ui.notify(
			`プラン手順 (${state.todoItems.length}) を保存しました。plan_ready 状態です。\n` +
			"次のアクション:\n" +
			"  /execute-plan — 実行を開始\n" +
			"  /revise-plan  — プランを修正\n" +
			"  /discard-plan — プランを破棄",
			"info",
		);
	});

	// セッション開始/再開時に状態を復元
	pi.on("session_start", async (_event, ctx) => {
		footerHandle = installFooter(ctx, state);

		const config = loadConfig(ctx.cwd);
		state.planModel = config.planModel;

		if (pi.getFlag("plan") === true) {
			// --plan 経由も enterPlanMode 相当の tool 保存を通す
			if (!state.savedActiveTools) {
				state.savedActiveTools = pi.getActiveTools();
			}
			state.mode = "planning";
		}

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
						mode?: PlanMode;
						enabled?: boolean;       // 後方互換
						executing?: boolean;      // 後方互換
						todos?: unknown[];
						planModel?: ModelSelection;
						planId?: string;
						planRevision?: number;
						savedActiveTools?: string[];
						originalModel?: { provider: string; modelId: string };
						originalThinkingLevel?: string;
						frozenPlan?: unknown[];
					};
			  }
			| undefined;

		if (planModeEntry?.data) {
			const d = planModeEntry.data;

			// mode を検証付きで復元
			if (d.mode) {
				state.mode = validateRestoredMode(d.mode);
			} else {
				// 後方互換: enabled/executing フラグ → mode 復元
				if (d.executing) {
					state.mode = "executing";
				} else if (d.enabled) {
					// todos があれば plan_ready、なければ planning
					state.mode = (d.todos && d.todos.length > 0) ? "plan_ready" : "planning";
				}
			}

			// todos を検証付きで復元
			if (d.todos) {
				state.todoItems = (d.todos as unknown[]).map((raw, i) => validateRestoredTodoItem(raw, i));
			}
			if (d.planModel) state.planModel = d.planModel;
			if (d.planId) state.planId = d.planId;
			if (typeof d.planRevision === "number") state.planRevision = d.planRevision;
			if (d.savedActiveTools && Array.isArray(d.savedActiveTools)) {
				state.savedActiveTools = d.savedActiveTools.filter((t): t is string => typeof t === "string");
			}

			// persisted originalModel/originalThinkingLevel を優先復元
			if (d.originalModel) {
				const restored = ctx.modelRegistry.find(d.originalModel.provider, d.originalModel.modelId);
				if (restored) state.originalModel = restored;
			}
			if (d.originalThinkingLevel) {
				state.originalThinkingLevel = d.originalThinkingLevel;
			}

			// frozenPlan を検証付きで復元（実行中の不変スナップショット）
			if (d.frozenPlan && Array.isArray(d.frozenPlan)) {
				state.frozenPlan = (d.frozenPlan as unknown[]).map((raw, i) => validateRestoredTodoItem(raw, i));
			}

			// 後方互換: 古い TodoItem にデフォルトを設定 (validateRestoredTodoItem で処理済み)
		}

		// persisted 復元後にまだ未設定の場合のみ ctx.model をフォールバックとして保存
		if (!state.originalModel) {
			state.originalModel = ctx.model;
			state.originalThinkingLevel = pi.getThinkingLevel();
		}
		if (!state.planThinkingLevel) {
			state.planThinkingLevel = pi.getThinkingLevel();
		}

		// 通常モードの場合は最新 ctx.model で更新
		if (state.mode === "normal") {
			state.originalModel = ctx.model;
			state.originalThinkingLevel = pi.getThinkingLevel();
			state.planThinkingLevel = pi.getThinkingLevel();
		}

		// モードに応じたツール・モデル適用
		if (state.mode === "planning" || state.mode === "plan_ready") {
			const safeTools = sanitizePlanTools(config.planTools ?? DEFAULT_PLAN_TOOLS);
			pi.setActiveTools(safeTools);
			await wrappedApplyPlanModel(ctx);
		} else if (state.mode === "executing") {
			applyExecutionTools(pi, state, ctx.cwd);
		}

		// 再開時: planHash が一致する場合のみ [DONE:n] を再スキャン
		if (planModeEntry !== undefined && state.mode === "executing" && state.frozenPlan && state.frozenPlan.length > 0) {
			let executeIndex = -1;
			let executionPlanHash: string | undefined;
			let executionPlanId: string | undefined;
			let executionPlanRevision: number | undefined;

			for (let i = entries.length - 1; i >= 0; i--) {
				const entry = entries[i] as {
					type: string;
					customType?: string;
					data?: { planHash?: string; planId?: string; planRevision?: number };
				};
				if (entry.customType === "plan-mode-execute") {
					executeIndex = i;
					executionPlanHash = entry.data?.planHash;
					executionPlanId = entry.data?.planId;
					executionPlanRevision = entry.data?.planRevision;
					break;
				}
			}

			const currentPlanHash = hashTodoItems(state.frozenPlan, executionPlanId, executionPlanRevision);

			// planId + planRevision の一致も確認（hash 衝突対策）
			const idMatches = (!executionPlanId && !state.planId) ||
				(executionPlanId === state.planId && executionPlanRevision === state.planRevision);

			if (executionPlanHash && executionPlanHash === currentPlanHash && idMatches && executeIndex >= 0) {
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
				markCompletedSteps(allText, state.frozenPlan);
			}
		}

		updateStatus(ctx);
	});
}
