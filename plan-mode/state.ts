/**
 * Plan Mode — 状態管理・遷移
 *
 * 単一 mode enum による状態管理。
 * normal → planning → plan_ready → executing → completed/aborted
 * の状態機械を提供する。
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { ModelSelection } from "./model-selector.js";
import { type TodoItem, hashTodoItems, resolveExecutionTools,
	// Re-export pure functions for consumers
	type PlanMode,
	isValidTransition,
	transition as _transition,
	isReadOnlyMode,
	modeLabel,
	InvalidTransitionError,
} from "./utils.js";

// Re-export types and pure functions
export type { PlanMode };
export { isValidTransition, isReadOnlyMode, modeLabel, InvalidTransitionError };

/** 安全な遷移 — state.ts からは utils の transition を再エクスポート */
export const transition = _transition;

// --- Mode enum (types and pure functions are in utils.ts) ---

// --- 設定 ---

export interface PlanModeConfig {
	planModel?: ModelSelection;
	planTools?: string[];
	execTools?: string[];
}

export const DEFAULT_PLAN_TOOLS = ["read", "grep", "find", "ls"];
export const DEFAULT_EXEC_TOOLS = ["read", "bash", "grep", "find", "ls", "edit", "write"];

export function loadConfig(cwd: string): PlanModeConfig {
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

// --- 拡張機能状態 ---

export interface ModeState {
	mode: PlanMode;
	todoItems: TodoItem[];
	/** 実行開始時に固定された plan snapshot（実行中は変更不可） */
	frozenPlan: TodoItem[] | undefined;
	planModel: ModelSelection | undefined;
	planThinkingLevel: string | undefined;
	originalModel: Model<Api> | undefined;
	originalThinkingLevel: string | undefined;
	planPromptHash: string | undefined;
	planPromptDelivered: boolean;
	savedActiveTools: string[] | undefined;
	/** plan revision tracking */
	planId: string | undefined;
	planRevision: number;
}

export function createInitialState(): ModeState {
	return {
		mode: "normal",
		todoItems: [],
		planModel: undefined,
		planThinkingLevel: undefined,
		originalModel: undefined,
		originalThinkingLevel: undefined,
		planPromptHash: undefined,
		planPromptDelivered: false,
		savedActiveTools: undefined,
		planId: undefined,
		planRevision: 0,
		frozenPlan: undefined,
	};
}

// --- 永続化 ---

export function persistState(pi: ExtensionAPI, state: ModeState): void {
	const data: Record<string, unknown> = {
		mode: state.mode,
		todos: state.todoItems,
		planModel: state.planModel,
		planId: state.planId,
		planRevision: state.planRevision,
	};
	if (state.savedActiveTools) {
		data.savedActiveTools = state.savedActiveTools;
	}
	// originalModel / originalThinkingLevel を永続化
	if (state.originalModel) {
		data.originalModel = {
			provider: state.originalModel.provider,
			modelId: state.originalModel.id,
		};
	}
	if (state.originalThinkingLevel) {
		data.originalThinkingLevel = state.originalThinkingLevel;
	}
	// 後方互換: 旧フォーマット（enabled/executing）も書き出す
	data.enabled = isReadOnlyMode(state.mode);
	data.executing = state.mode === "executing";

	pi.appendEntry("plan-mode", data);
}

// --- モデル管理 ---

export async function applyPlanModel(pi: ExtensionAPI, state: ModeState, ctx: ExtensionContext): Promise<void> {
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

export async function restoreMainModel(pi: ExtensionAPI, state: ModeState): Promise<void> {
	if (state.originalModel) {
		await pi.setModel(state.originalModel);
	}
	if (state.originalThinkingLevel) {
		pi.setThinkingLevel(state.originalThinkingLevel);
	}
}

// --- Active tools management ---

/**
 * 実行フェーズ用の tools を決定する。
 */
export function getExecutionTools(state: ModeState, cwd: string): string[] {
	const config = loadConfig(cwd);
	return resolveExecutionTools(state.savedActiveTools, config.execTools, DEFAULT_EXEC_TOOLS);
}

/**
 * 実行フェーズの tools を適用する。savedActiveTools は保持する。
 */
export function applyExecutionTools(
	pi: ExtensionAPI,
	state: ModeState,
	cwd: string,
): void {
	pi.setActiveTools(getExecutionTools(state, cwd));
}

/**
 * plan 開始前の元 tools を復元し、savedActiveTools をクリアする。
 */
export function restoreOriginalToolsAndClear(
	pi: ExtensionAPI,
	state: ModeState,
): void {
	if (state.savedActiveTools) {
		pi.setActiveTools(state.savedActiveTools);
	}
	state.savedActiveTools = undefined;
}

// --- モード切替 ---

export async function enterPlanMode(
	pi: ExtensionAPI,
	state: ModeState,
	ctx: ExtensionContext,
	updateStatus: (ctx: ExtensionContext) => void,
): Promise<void> {
	// 現在のモデルを保存（初回のみ）
	if (!state.originalModel) {
		state.originalModel = ctx.model;
		state.originalThinkingLevel = pi.getThinkingLevel();
	}

	// 現在の active tools を保存（初回のみ）
	if (!state.savedActiveTools) {
		state.savedActiveTools = pi.getActiveTools();
	}

	state.planThinkingLevel = pi.getThinkingLevel();

	state.mode = transition(state.mode, "planning");
	state.todoItems = [];
	state.planPromptDelivered = false;
	state.planPromptHash = undefined;
	state.planId = undefined;
	state.planRevision = 0;
	state.frozenPlan = undefined;

	const config = loadConfig(ctx.cwd);
	pi.setActiveTools(config.planTools ?? DEFAULT_PLAN_TOOLS);

	await applyPlanModel(pi, state, ctx);

	if (!state.planModel) {
		ctx.ui.notify("プラン用モデルが未設定です。/plan-model で設定してください。", "warning");
	}

	ctx.ui.notify("プランモード有効 — 読み取り専用探索", "info");
	updateStatus(ctx);
}

export async function exitPlanMode(
	pi: ExtensionAPI,
	state: ModeState,
	ctx: ExtensionContext,
	updateStatus: (ctx: ExtensionContext) => void,
): Promise<void> {
	state.mode = transition(state.mode, "normal");
	state.todoItems = [];
	state.planPromptDelivered = false;
	state.planPromptHash = undefined;
	state.planId = undefined;
	state.planRevision = 0;
	state.frozenPlan = undefined;

	restoreOriginalToolsAndClear(pi, state);

	await restoreMainModel(pi, state);

	ctx.ui.notify("プランモード無効 — 全ツールアクセス可能", "info");
	updateStatus(ctx);
}

/** plan_ready に移行（plan 抽出・validation 後） */
export function markPlanReady(
	state: ModeState,
): void {
	state.mode = transition(state.mode, "plan_ready");
	if (!state.planId) state.planId = randomUUID();
	state.planRevision++;
}

/** plan_ready → planning に戻る（revision） */
export function revisePlan(
	state: ModeState,
): void {
	state.mode = transition(state.mode, "planning");
	state.planPromptDelivered = false;
	state.planPromptHash = undefined;
}

export async function startExecution(
	pi: ExtensionAPI,
	state: ModeState,
	ctx: ExtensionContext,
	updateStatus: (ctx: ExtensionContext) => void,
): Promise<void> {
	state.mode = transition(state.mode, "executing");
	state.planPromptDelivered = false;
	state.planPromptHash = undefined;

	// plan snapshot を固定（deep copy）
	state.frozenPlan = JSON.parse(JSON.stringify(state.todoItems));

	// plan-mode-execute マーカーを保存（復元時の DONE 再スキャン用）
	const planHash = hashTodoItems(state.todoItems);
	pi.appendEntry("plan-mode-execute", {
		startedAt: Date.now(),
		planHash,
		todos: state.todoItems,
		planId: state.planId,
		planRevision: state.planRevision,
	});

	applyExecutionTools(pi, state, ctx.cwd);

	await restoreMainModel(pi, state);

	updateStatus(ctx);
}

/** 全ステップ完了 → completed */
export function markCompleted(
	state: ModeState,
): void {
	state.mode = transition(state.mode, "completed");
}

/** 中断 → aborted */
export function markAborted(
	state: ModeState,
): void {
	state.mode = transition(state.mode, "aborted");
}

/** 任意の状態から normal にリセット（強制） */
export function forceResetToNormal(
	state: ModeState,
): void {
	// 強制リセット: バリデーションなし
	state.mode = "normal";
	state.todoItems = [];
	state.planPromptDelivered = false;
	state.planPromptHash = undefined;
	state.planId = undefined;
	state.planRevision = 0;
	state.frozenPlan = undefined;
}

export async function togglePlanMode(
	pi: ExtensionAPI,
	state: ModeState,
	ctx: ExtensionContext,
	updateStatus: (ctx: ExtensionContext) => void,
): Promise<void> {
	switch (state.mode) {
		case "normal":
			await enterPlanMode(pi, state, ctx, updateStatus);
			break;

		case "planning":
			await exitPlanMode(pi, state, ctx, updateStatus);
			break;

		case "plan_ready":
			// plan_ready → planning に戻る（修正）
			revisePlan(state);
			ctx.ui.notify("プランを再修正中 — 読み取り専用探索", "info");
			updateStatus(ctx);
			break;

		case "executing":
			// 実行モード→プランモード（todoItems保持）
			state.mode = transition(state.mode, "planning");
			state.planPromptDelivered = false;
			state.planPromptHash = undefined;

			{
				const config = loadConfig(ctx.cwd);
				pi.setActiveTools(config.planTools ?? DEFAULT_PLAN_TOOLS);
				await applyPlanModel(pi, state, ctx);
			}

			ctx.ui.notify("プランモードに復帰 — todoItems保持", "info");
			updateStatus(ctx);
			break;

		case "completed":
		case "aborted":
			// 完了/中断 → normal 経由で planning へ
			forceResetToNormal(state);
			await enterPlanMode(pi, state, ctx, updateStatus);
			break;
	}
}
