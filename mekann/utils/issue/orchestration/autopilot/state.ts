/**
 * orchestration/autopilot/state.ts — pure state model for the autopilot.
 *
 * Mirrors the structure of the parent/child orchestration state
 * (`orchestration/state.ts`) but with autopilot-specific completion semantics:
 *
 * - Candidate set = open issues labeled `ready-for-agent` (label gate, slice A).
 * - `done` = a PR exists for the issue's branch OR the issue is labeled
 *   `ready-for-human` (降格). Contrast with orchestration, where `done` requires
 *   the PR to be *merged*. The autopilot hands off after PR creation, not merge.
 *
 * No Pi/kitty/gh imports — pure data + judgements so the supervisor's state
 * transitions and stop conditions are unit-testable without I/O.
 */

import { READY_FOR_AGENT_LABEL, READY_FOR_HUMAN_LABEL } from "./markers.js";

/** An autopilot candidate's integrated state (GitHub truth + local). */
export interface AutopilotChildState {
	number: number;
	title: string;
	url: string;
	/** GitHub labels on the issue (normalized lowercase). */
	labels: string[];
	/** GitHub truth: a PR exists for the issue's branch `issue-<number>` (any state). */
	prExists: boolean;
	/** GitHub truth: open issue numbers that block this issue (blocked_by). */
	openBlockers: number[];
	/** Local: an `issue-<number>` worktree exists on disk. */
	hasWorktree: boolean;
	/** Local: a Kitty pane titled `Issue #<number>` is currently open. */
	hasActiveWorkPi: boolean;
}

/**
 * The supervisor's verdict for one candidate. Ordered by priority:
 *   done > active > blocked > startable
 * - `done`: PR created or handed to a human — skip (finished).
 * - `active`: a Work Pi is already open for it — skip (double-launch prevention).
 * - `blocked`: dependencies unresolved — skip.
 * - `startable`: candidate to launch now.
 */
export type AutopilotVerdict =
	| { kind: "done"; reason: string }
	| { kind: "active"; reason: string }
	| { kind: "blocked"; reason: string; blockers: number[] }
	| { kind: "startable"; reason: string; resume: boolean };

/** True when the issue carries the `ready-for-agent` triage label (case-insensitive; collectors normalize to lowercase). */
export function isReadyForAgent(labels: string[]): boolean {
	return labels.some((label) => label.toLowerCase() === READY_FOR_AGENT_LABEL);
}

/** True when the issue has been demoted to `ready-for-human` (case-insensitive). */
export function isReadyForHuman(labels: string[]): boolean {
	return labels.some((label) => label.toLowerCase() === READY_FOR_HUMAN_LABEL);
}

/**
 * Judge a single candidate from its integrated state. Pure function.
 *
 * Precedence rationale:
 * - `prExists` / `ready-for-human` wins: a finished candidate is skipped
 *   regardless of local stale state.
 * - `hasActiveWorkPi` beats `blocked`/`startable`: never double-launch an open
 *   Work Pi, even if GitHub truth has not caught up.
 * - `blocked` beats `startable`: never start a candidate whose dependencies open.
 */
export function judgeAutopilotChild(state: AutopilotChildState): AutopilotVerdict {
	if (state.prExists) return { kind: "done", reason: "PR created" };
	if (isReadyForHuman(state.labels)) return { kind: "done", reason: "ready-for-human" };
	if (state.hasActiveWorkPi) return { kind: "active", reason: "Work Pi already open" };
	if (state.openBlockers.length > 0) {
		return { kind: "blocked", reason: "blocked by open issues", blockers: [...state.openBlockers] };
	}
	return {
		kind: "startable",
		reason: state.hasWorktree ? "worktree exists, resuming" : "fresh start",
		resume: state.hasWorktree,
	};
}
