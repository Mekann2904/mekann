/**
 * orchestration/resolver.ts — pick the next child to launch from a snapshot.
 *
 * Pure functions over {@link ChildState}. No I/O. The orchestrator's only
 * decision module: given GitHub-truth + local snapshot, which child (if any)
 * should be started next.
 *
 * Selection rule (deterministic): among `startable` children, pick the lowest
 * issue number. This gives stable, predictable ordering across re-entries and
 * makes the orchestrator order-independent (issue #71 robustness requirement).
 */

import type { ChildState, ChildVerdict } from "./state.js";
import { judgeChild } from "./state.js";

export interface ChildJudgement {
	state: ChildState;
	verdict: ChildVerdict;
}

export interface ResolutionSummary {
	total: number;
	done: number[];
	blocked: number[];
	active: number[];
	startable: number[];
}

export interface ResolutionResult {
	/** The child to start next, or undefined when none is startable. */
	next?: ChildJudgement;
	/** Per-child judgements, in input order. */
	judgements: ChildJudgement[];
	summary: ResolutionSummary;
}

/**
 * Resolve the next child to launch. Pure: same input → same output.
 *
 * Returns `next: undefined` when no child is startable. Callers distinguish:
 * - all done → orchestration complete
 * - some active/blocked but none startable → waiting (do nothing)
 */
export function pickNextChild(children: ChildState[]): ResolutionResult {
	const judgements: ChildJudgement[] = children.map((state) => ({ state, verdict: judgeChild(state) }));
	const summary = summarize(judgements);
	const startable = judgements
		.filter((judgement) => judgement.verdict.kind === "startable")
		.sort((a, b) => a.state.number - b.state.number);
	return {
		next: startable[0],
		judgements,
		summary,
	};
}

function summarize(judgements: ChildJudgement[]): ResolutionSummary {
	const summary: ResolutionSummary = { total: judgements.length, done: [], blocked: [], active: [], startable: [] };
	for (const judgement of judgements) {
		switch (judgement.verdict.kind) {
			case "done":
				summary.done.push(judgement.state.number);
				break;
			case "blocked":
				summary.blocked.push(judgement.state.number);
				break;
			case "active":
				summary.active.push(judgement.state.number);
				break;
			case "startable":
				summary.startable.push(judgement.state.number);
				break;
		}
	}
	// Sorted by issue number for stable, human-readable progress display.
	for (const key of ["done", "blocked", "active", "startable"] as const) {
		summary[key].sort((a, b) => a - b);
	}
	return summary;
}

/** True when every child is done (orchestration complete). */
export function isComplete(summary: ResolutionSummary): boolean {
	return summary.total > 0 && summary.done.length === summary.total;
}
