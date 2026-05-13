/**
 * Plan Mode — 状態管理・遷移
 *
 * 拡張機能の状態（ModeState）、設定読み込み、モデル管理、
 * モード切替ロジックを提供する。
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { ModelSelection } from "./model-selector.js";
import type { TodoItem } from "./utils.js";

// --- 設定 ---

export interface PlanModeConfig {
	planModel?: ModelSelection;
	planTools?: string[];
	execTools?: string[];
}

export const DEFAULT_PLAN_TOOLS = ["read", "bash", "grep", "find", "ls"];
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
	planModeEnabled: boolean;
	executionMode: boolean;
	todoItems: TodoItem[];
	planModel: ModelSelection | undefined;
	planThinkingLevel: string | undefined;
	originalModel: Model<Api> | undefined;
	originalThinkingLevel: string | undefined;
}

export function createInitialState(): ModeState {
	return {
		planModeEnabled: false,
		executionMode: false,
		todoItems: [],
		planModel: undefined,
		planThinkingLevel: undefined,
		originalModel: undefined,
		originalThinkingLevel: undefined,
	};
}

// --- 永続化 ---

export function persistState(pi: ExtensionAPI, state: ModeState): void {
	pi.appendEntry("plan-mode", {
		enabled: state.planModeEnabled,
		executing: state.executionMode,
		todos: state.todoItems,
		planModel: state.planModel,
	});
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

	state.planThinkingLevel = pi.getThinkingLevel();

	state.planModeEnabled = true;
	state.executionMode = false;
	state.todoItems = [];

	const config = loadConfig(ctx.cwd);
	pi.setActiveTools(config.planTools ?? DEFAULT_PLAN_TOOLS);

	await applyPlanModel(pi, state, ctx);

	ctx.ui.notify("プランモード有効 — 読み取り専用探索", "info");
	updateStatus(ctx);
}

export async function exitPlanMode(
	pi: ExtensionAPI,
	state: ModeState,
	ctx: ExtensionContext,
	updateStatus: (ctx: ExtensionContext) => void,
): Promise<void> {
	state.planModeEnabled = false;
	state.executionMode = false;
	state.todoItems = [];

	const config = loadConfig(ctx.cwd);
	pi.setActiveTools(config.execTools ?? DEFAULT_EXEC_TOOLS);

	await restoreMainModel(pi, state);

	ctx.ui.notify("プランモード無効 — 全ツールアクセス可能", "info");
	updateStatus(ctx);
}

export async function startExecution(
	pi: ExtensionAPI,
	state: ModeState,
	ctx: ExtensionContext,
	updateStatus: (ctx: ExtensionContext) => void,
): Promise<void> {
	state.planModeEnabled = false;
	state.executionMode = true;

	const config = loadConfig(ctx.cwd);
	pi.setActiveTools(config.execTools ?? DEFAULT_EXEC_TOOLS);

	await restoreMainModel(pi, state);

	updateStatus(ctx);
}

export async function togglePlanMode(
	pi: ExtensionAPI,
	state: ModeState,
	ctx: ExtensionContext,
	updateStatus: (ctx: ExtensionContext) => void,
): Promise<void> {
	if (state.planModeEnabled) {
		await exitPlanMode(pi, state, ctx, updateStatus);
	} else {
		await enterPlanMode(pi, state, ctx, updateStatus);
	}
}
