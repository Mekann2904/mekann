/**
 * Plan Mode — 最小状態管理
 *
 * main と plan の2モードのみ。
 * plan はテキストコンテキストとして保存・注入される。
 */

// --- Mode ---

export type Mode = "main" | "plan";

export function isReadOnlyMode(mode: Mode): boolean {
	return mode === "plan";
}

export function modeLabel(mode: Mode): string {
	return mode === "plan" ? "PLAN MODE" : "";
}

// --- State ---

export interface PlanState {
	mode: Mode;
	/** <proposed_plan> の中身をそのまま保存 */
	pendingPlan?: string;
	/** plan mode 进入時の元 tools を保存 */
	savedActiveTools?: string[];
	/** plan mode プロンプトの重複注入回避 */
	planPromptHash?: string;
	planPromptDelivered: boolean;
}

export function createInitialState(): PlanState {
	return {
		mode: "main",
		planPromptDelivered: false,
	};
}
