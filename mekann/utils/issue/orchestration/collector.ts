/**
 * orchestration/collector.ts — build a {@link ChildState} snapshot.
 *
 * The orchestrator's only I/O boundary. All gh/kitty/git access is hidden
 * behind {@link OrchestrationDeps}, so the snapshot builder is trivially
 * testable with injected fakes, and the production dependency wiring lives
 * in `deps.ts`.
 *
 * GitHub-truth model (issue #71): every decision is derived from a freshly
 * collected snapshot. The orchestrator never tracks its own progress, which
 * is what makes it order-independent and re-entrant.
 */

import type { ChildState } from "./state.js";

export interface ChildBrief {
	number: number;
	title: string;
	url: string;
}

/**
 * Injected dependencies for collecting a snapshot. Each method is a narrow
 * adapter over one external source (gh / kitty / git), so fakes in tests model
 * exactly the external behavior, not implementation details.
 */
export interface OrchestrationDeps {
	/** List child issues of a parent (GitHub sub-issues). */
	listSubIssues(parentNumber: number): Promise<ChildBrief[]>;
	/** Open issue numbers blocking a child (GitHub blocked_by). */
	getDependencyStatus(childNumber: number): Promise<{ openBlockers: number[] }>;
	/** PR merge status for the child's branch `issue-<number>`. */
	getPrMergeStatus(childNumber: number): Promise<{ merged: boolean; exists: boolean }>;
	/** Local: an `issue-<number>` worktree exists on disk. */
	hasWorktree(childNumber: number): boolean;
	/** Local: a Kitty pane titled `Issue #<number>` is currently open. */
	hasActiveWorkPi(childNumber: number): Promise<boolean>;
}

/**
 * Collect an integrated snapshot of all children of a parent.
 *
 * Children are queried in parallel per-data-source where the source allows,
 * but each child's cross-source lookups run concurrently for speed. Order is
 * preserved from `listSubIssues` so callers see stable output.
 */
export async function collectSnapshot(parentNumber: number, deps: OrchestrationDeps): Promise<ChildState[]> {
	const children = await deps.listSubIssues(parentNumber);
	const states = await Promise.all(
		children.map(async (child): Promise<ChildState> => {
			const [dependency, pr, hasWorktree, hasActiveWorkPi] = await Promise.all([
				deps.getDependencyStatus(child.number),
				deps.getPrMergeStatus(child.number),
				Promise.resolve(deps.hasWorktree(child.number)),
				deps.hasActiveWorkPi(child.number),
			]);
			return {
				number: child.number,
				title: child.title,
				url: child.url,
				prMerged: pr.merged,
				prExists: pr.exists,
				openBlockers: dependency.openBlockers,
				hasWorktree,
				hasActiveWorkPi,
			};
		}),
	);
	return states;
}
