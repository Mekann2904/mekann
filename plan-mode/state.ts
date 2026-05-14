import type { ModelRef, PlanModeConfig } from "./utils.js";

export type Mode = "main" | "plan";

export function isReadOnlyMode(mode: Mode): boolean {
	return mode === "plan";
}

export function modeLabel(mode: Mode): string {
	return mode === "plan" ? "PLAN MODE" : "";
}

export interface PlanState {
	mode: Mode;
	pendingPlan?: string;
	savedActiveTools?: string[];
	planPromptHash?: string;
	planPromptDelivered: boolean;
	/** Persisted model preferences for each mode. */
	modelConfig: PlanModeConfig;
	/** Snapshot of the main-mode model before entering plan mode (for fallback restore). */
	savedMainModel?: ModelRef;
}

export function createInitialState(modelConfig?: PlanModeConfig): PlanState {
	return {
		mode: "main",
		planPromptDelivered: false,
		modelConfig: modelConfig ?? { version: 1, models: {} },
	};
}
