/**
 * goal/context-events.ts — Best-effort context ledger recording for goal lifecycle.
 *
 * Records short summaries of goal state changes into the mekann context ledger.
 * Never throws — ledger write failure must not block goal mutations.
 */

import type { Goal, GoalSource, GoalStatus } from "./state.js";

// Lazy import to avoid hard coupling at module level.
// If context/ledger/store is not available (e.g., in isolated tests), recording is silently skipped.
let _appendContextEvent: typeof import("../../context/ledger/store.js").appendContextEvent | null = null;

async function getAppendFn() {
	if (!_appendContextEvent) {
		try {
			const mod = await import("../../context/ledger/store.js");
			_appendContextEvent = mod.appendContextEvent;
		} catch {
			// ledger module not available
		}
	}
	return _appendContextEvent;
}

export type GoalAction =
	| "set"
	| "updated"
	| "paused"
	| "resumed"
	| "completed"
	| "blocked"
	| "cleared"
	| "budget_exhausted";

export interface RecordGoalEventInput {
	action: GoalAction;
	goal?: Goal | null;
	cwd: string;
	sessionId?: string;
	turnId?: string;
	branchId?: string;
	source?: GoalSource;
}

export function goalPriority(action: GoalAction): 0 | 1 | 2 | 3 | 4 {
	switch (action) {
		case "set":
		case "resumed":
		case "updated":
			return 1;
		case "budget_exhausted":
			return 1;
		case "paused":
		case "completed":
		case "blocked":
		case "cleared":
			return 2;
	}
}

export function goalKind(action: GoalAction): "task" | "error" {
	if (action === "budget_exhausted") return "error";
	return "task";
}

export function goalTitle(action: GoalAction, goal?: Goal | null): string {
	const prefix = `Goal ${action}`;
	if (!goal) return prefix;
	const shortObj = goal.objective.length > 80 ? goal.objective.slice(0, 79) + "…" : goal.objective;
	return `${prefix}: ${shortObj}`;
}

export function goalEvidenceLevel(action: GoalAction, source?: GoalSource): "observed" | "tool_reported" | "user_decided" {
	if (action === "budget_exhausted") return "observed";
	if (source === "user") return "user_decided";
	if (source === "tool") return "tool_reported";
	return "observed";
}

export function goalSummary(action: GoalAction, goal?: Goal | null): string {
	if (!goal) return `Goal ${action}`;
	const parts = [
		`goal_id=${goal.goal_id}`,
		`status=${goal.status}`,
		`objective=${goal.objective.slice(0, 200)}`,
	];
	if (goal.token_budget !== null) {
		parts.push(`budget=${goal.token_budget}`);
		parts.push(`used=${goal.tokens_used}`);
	}
	return parts.join("; ");
}

export async function recordGoalEvent(input: RecordGoalEventInput): Promise<void> {
	const appendFn = await getAppendFn();
	if (!appendFn) return;

	try {
		await appendFn({
			cwd: input.cwd,
			kind: goalKind(input.action),
			priority: goalPriority(input.action),
			title: goalTitle(input.action, input.goal),
			summary: goalSummary(input.action, input.goal),
			evidenceLevel: goalEvidenceLevel(input.action, input.source),
			scope: input.goal ? { goalId: input.goal.goal_id, ...(input.branchId ? { branchId: input.branchId } : {}) } : (input.branchId ? { branchId: input.branchId } : undefined),
			sessionId: input.sessionId,
			turnId: input.turnId,
		});
	} catch {
		// best-effort: never block
	}
}
