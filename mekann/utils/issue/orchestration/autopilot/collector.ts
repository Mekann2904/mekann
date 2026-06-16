/**
 * orchestration/autopilot/collector.ts — build an autopilot snapshot.
 *
 * The supervisor's only I/O boundary. All gh/kitty/git access is hidden behind
 * {@link AutopilotDeps}, so the snapshot builder is trivially testable with
 * injected fakes, and production wiring lives in `deps.ts`.
 *
 * Candidate set = open issues labeled `ready-for-agent` (ADR-0025 slice A/C).
 */

import type { AutopilotChildState } from "./state.js";
import type { ChildBrief } from "../collector.js";

export type AutopilotChildBrief = ChildBrief & { labels: string[] };

/**
 * Injected dependencies for collecting an autopilot snapshot. Each method is a
 * narrow adapter over one external source, so fakes model external behavior.
 */
export interface AutopilotDeps {
	/** List open issues labeled `ready-for-agent` (the candidate set). */
	listReadyForAgentIssues(): Promise<AutopilotChildBrief[]>;
	/** Open issue numbers blocking a candidate (GitHub blocked_by). */
	getDependencyStatus(childNumber: number): Promise<{ openBlockers: number[] }>;
	/** Whether a PR exists for the candidate's branch `issue-<number>` (any state). */
	getPrExists(childNumber: number): Promise<boolean>;
	/** Local: an `issue-<number>` worktree exists on disk. */
	hasWorktree(childNumber: number): boolean;
	/** Local: a Kitty pane titled `Issue #<number>` is currently open. */
	hasActiveWorkPi(childNumber: number): Promise<boolean>;
	/** GitHub: does a label exist on the repo? Used for the zero-candidate guidance. */
	labelExists(name: string): Promise<boolean>;
}

/**
 * Collect an integrated snapshot of every `ready-for-agent` candidate.
 *
 * Cross-source lookups per candidate run concurrently; order is preserved from
 * `listReadyForAgentIssues` for stable output.
 */
export async function collectAutopilotSnapshot(deps: AutopilotDeps): Promise<AutopilotChildState[]> {
	const children = await deps.listReadyForAgentIssues();
	const states = await Promise.all(
		children.map(async (child): Promise<AutopilotChildState> => {
			const [dependency, prExists, hasWorktree, hasActiveWorkPi] = await Promise.all([
				deps.getDependencyStatus(child.number),
				deps.getPrExists(child.number),
				Promise.resolve(deps.hasWorktree(child.number)),
				deps.hasActiveWorkPi(child.number),
			]);
			return {
				number: child.number,
				title: child.title,
				url: child.url,
				labels: child.labels,
				prExists,
				openBlockers: dependency.openBlockers,
				hasWorktree,
				hasActiveWorkPi,
			};
		}),
	);
	return states;
}
