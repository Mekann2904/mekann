import type { Goal } from "./state.js";

export type GoalAttribution = "turn" | "no_turn";
export type GoalRuntimeEventName = "budget_exhausted" | "blocked" | "usage_limited" | "usage_accounted";

/** Domain event emitted by GoalRuntime before UI, ledger, or event-bus projection. */
export interface GoalRuntimeDomainEvent {
  kind: GoalRuntimeEventName;
  goal: Goal;
  attribution: GoalAttribution;
}
