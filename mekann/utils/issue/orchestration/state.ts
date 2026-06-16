/**
 * orchestration/state.ts — GitHub-truth state model for issue orchestration.
 *
 * Pure data and judgements. No Pi/OpenTUI/gh/kitty imports. The orchestrator
 * derives every decision from a snapshot of these states instead of tracking
 * its own progress, so order-independence and re-entrance hold (see issue #71).
 *
 * Design (issue #71):
 * - State source = GitHub truth (Single Source of Truth). PR merge status,
 *   dependency blockers come from GitHub; worktree/active-pane from local.
 * - Robustness requirement: any order, any mix (manual `/issue` vs orchestration,
 *   re-entry, parallel children) must behave correctly.
 */

/** A child issue's integrated state, combining GitHub truth with local state. */
export interface ChildState {
	number: number;
	title: string;
	url: string;
	/** GitHub truth: the child's PR (on branch `issue-<number>`) is merged. */
	prMerged: boolean;
	/** GitHub truth: a PR exists for the child (not necessarily merged). */
	prExists: boolean;
	/** GitHub truth: open issue numbers that block this child (blocked_by). */
	openBlockers: number[];
	/** GitHub truth: the child is explicitly ready for coding-agent implementation. */
	readyForAgent: boolean;
	/** Local: an `issue-<number>` worktree exists on disk. */
	hasWorktree: boolean;
	/** Local: a Kitty pane titled `Issue #<number>` is currently open. */
	hasActiveWorkPi: boolean;
}

/**
 * The orchestrator's verdict for one child. Ordered by priority:
 *   merged > active > blocked > not-ready > startable
 * - `done`: skip (completed)
 * - `active`: skip (already open; double-launch prevention)
 * - `blocked`: skip (dependencies unresolved)
 * - `not-ready`: skip (triage label gate not satisfied)
 * - `startable`: candidate to launch now; `resume` distinguishes a fresh start
 *   from resuming an existing worktree.
 */
export type ChildVerdict =
	| { kind: "done"; reason: string }
	| { kind: "active"; reason: string }
	| { kind: "blocked"; reason: string; blockers: number[] }
	| { kind: "not-ready"; reason: string }
	| { kind: "startable"; reason: string; resume: boolean };

/**
 * Judge a single child from its integrated state. Pure function.
 *
 * Precedence rationale:
 * - `prMerged` wins: a merged child is finished regardless of local stale state.
 * - `hasActiveWorkPi` beats `blocked`/`startable`: never double-launch an open
 *   Work Pi, even if GitHub has not caught up.
 * - `blocked` beats `startable`: never start a child whose dependencies are open.
 * - `readyForAgent` gates startability: triage labels are authoritative.
 */
export function judgeChild(state: ChildState): ChildVerdict {
	if (state.prMerged) return { kind: "done", reason: "PR merged" };
	if (state.hasActiveWorkPi) return { kind: "active", reason: "Work Pi already open" };
	if (state.openBlockers.length > 0) {
		return { kind: "blocked", reason: "blocked by open issues", blockers: [...state.openBlockers] };
	}
	if (!state.readyForAgent) return { kind: "not-ready", reason: "missing ready-for-agent label" };
	return {
		kind: "startable",
		reason: state.hasWorktree ? "worktree exists, resuming" : "fresh start",
		resume: state.hasWorktree,
	};
}
