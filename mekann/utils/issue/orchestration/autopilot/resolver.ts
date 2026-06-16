/**
 * orchestration/autopilot/resolver.ts — pick the next autopilot candidate.
 *
 * Pure functions over {@link AutopilotChildState}. The supervisor's only
 * decision module: given a snapshot of `ready-for-agent` candidates, which one
 * (if any) should be started next, and whether the run is complete / waiting.
 *
 * Mirrors `orchestration/resolver.ts` structure with autopilot verdicts.
 */

import type { AutopilotChildState, AutopilotVerdict } from "./state.js";
import { judgeAutopilotChild } from "./state.js";

export interface AutopilotJudgement {
	state: AutopilotChildState;
	verdict: AutopilotVerdict;
}

export interface AutopilotSummary {
	total: number;
	done: number[];
	blocked: number[];
	active: number[];
	startable: number[];
}

export interface AutopilotResolution {
	/** The candidate to start next, or undefined when none is startable. */
	next?: AutopilotJudgement;
	/** Per-candidate judgements, in input order. */
	judgements: AutopilotJudgement[];
	summary: AutopilotSummary;
}

/**
 * Resolve the next candidate to launch. Pure: same input → same output.
 *
 * Among `startable` candidates, pick the lowest issue number for stable,
 * predictable ordering across re-entries (deterministic supervisor).
 */
export function pickNextAutopilot(children: AutopilotChildState[]): AutopilotResolution {
	const judgements: AutopilotJudgement[] = children.map((state) => ({ state, verdict: judgeAutopilotChild(state) }));
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

function summarize(judgements: AutopilotJudgement[]): AutopilotSummary {
	const summary: AutopilotSummary = { total: judgements.length, done: [], blocked: [], active: [], startable: [] };
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
	for (const key of ["done", "blocked", "active", "startable"] as const) {
		summary[key].sort((a, b) => a - b);
	}
	return summary;
}

/** True when there is at least one candidate and every candidate is done. */
export function isAutopilotComplete(summary: AutopilotSummary): boolean {
	return summary.total > 0 && summary.done.length === summary.total;
}

/** True when there are zero candidates (nothing labeled ready-for-agent). */
export function isAutopilotEmpty(summary: AutopilotSummary): boolean {
	return summary.total === 0;
}
