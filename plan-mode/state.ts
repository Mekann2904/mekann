import type { ModelRef, PlanModeConfig, ThinkingLevel } from "./utils.js";

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
	/** Plan text to inject once into main mode's system prompt, then cleared. */
	implementationPlan?: string;
	savedActiveTools?: string[];
	planPromptHash?: string;
	planPromptDelivered: boolean;
	/** Persisted model preferences for each mode. */
	modelConfig: PlanModeConfig;
	/** Snapshot of the main-mode model before entering plan mode (for fallback restore). */
	savedMainModel?: ModelRef;
	/** Snapshot of the main-mode thinking level before entering plan mode (for fallback restore). */
	savedMainThinking?: ThinkingLevel;
}

export function createInitialState(modelConfig?: PlanModeConfig): PlanState {
	return {
		mode: "main",
		planPromptDelivered: false,
		modelConfig: modelConfig ?? { version: 1, models: {}, thinking: {} },
	};
}
