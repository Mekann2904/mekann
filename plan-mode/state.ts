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
}

export function createInitialState(): PlanState {
	return {
		mode: "main",
		planPromptDelivered: false,
	};
}
