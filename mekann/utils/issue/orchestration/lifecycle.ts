/**
 * orchestration/lifecycle.ts — orchestration entry points and outcome types.
 *
 * Two pure-ish entry points over a snapshot:
 * - {@link startOrchestration}: launch the first startable child of a parent.
 * - {@link continueOrchestration}: called from a Work Pi shutdown; re-snapshot
 *   (GitHub truth) and launch the next startable child, but only if the
 *   just-finished child's PR is merged (the approval gate).
 *
 * `launchWorkPi` is an injected side effect, so the decision logic is fully
 * testable without spawning Pi/kitty.
 *
 * Environment contract (issue #71, policy 方針1):
 * - {@link ORCHESTRATION_PARENT_ENV}: present on a Work Pi that is part of an
 *   orchestration. Absent on manual `/issue` sessions, so a manual close never
 *   triggers the next launch.
 * - {@link ORCHESTRATION_CHILD_ENV}: the child number the Work Pi was started
 *   for; used at shutdown as `justFinishedChild`.
 */

import { collectSnapshot, type OrchestrationDeps } from "./collector.js";
import { isComplete, pickNextChild, type ResolutionSummary } from "./resolver.js";

/** Env var marking a Work Pi as part of an orchestration. */
export const ORCHESTRATION_PARENT_ENV = "MEKANN_ORCHESTRATION_PARENT";
/** Env var carrying the child number a Work Pi was started for. */
export const ORCHESTRATION_CHILD_ENV = "MEKANN_ORCHESTRATION_CHILD";

export interface LaunchWorkPiOptions {
	cwd: string;
	title: string;
	parent: number;
	child: number;
}

/** Side effect: start the Work Pi for a child. Injected by the caller. */
export type LaunchWorkPi = (options: LaunchWorkPiOptions) => Promise<void>;

export type OrchestrationOutcome =
	| { kind: "started"; childNumber: number; summary: ResolutionSummary; message: string }
	| { kind: "completed"; summary: ResolutionSummary; message: string }
	| { kind: "waiting"; summary: ResolutionSummary; message: string }
	| { kind: "no-children"; message: string }
	| { kind: "not-merged"; childNumber: number; summary: ResolutionSummary; message: string };

function formatSummaryLine(summary: ResolutionSummary): string {
	return `done=${summary.done.length} active=${summary.active.length} blocked=${summary.blocked.length} notReady=${summary.notReady.length} startable=${summary.startable.length} total=${summary.total}`;
}

/**
 * Start orchestration for a parent PRD/epic issue.
 *
 * Resolves the first startable child (by ascending issue number) and launches
 * its Work Pi. If no child is startable, reports completion (all done) or
 * waiting (remaining are active/blocked).
 */
export async function startOrchestration(
	parentNumber: number,
	cwd: string,
	deps: OrchestrationDeps,
	launchWorkPi: LaunchWorkPi,
): Promise<OrchestrationOutcome> {
	const states = await collectSnapshot(parentNumber, deps);
	if (states.length === 0) {
		return { kind: "no-children", message: `Issue #${parentNumber} has no sub-issues; nothing to orchestrate.` };
	}
	const result = pickNextChild(states);
	const next = result.next;
	if (next) {
		await launchWorkPi({ cwd, title: `Issue #${next.state.number}`, parent: parentNumber, child: next.state.number });
		return {
			kind: "started",
			childNumber: next.state.number,
			summary: result.summary,
			message: `Orchestrating #${parentNumber}: started #${next.state.number}. ${formatSummaryLine(result.summary)}`,
		};
	}
	if (isComplete(result.summary)) {
		return {
			kind: "completed",
			summary: result.summary,
			message: `Orchestration of #${parentNumber} complete. All ${result.summary.total} children merged. ${formatSummaryLine(result.summary)}`,
		};
	}
	return {
		kind: "waiting",
		summary: result.summary,
		message: `Orchestration of #${parentNumber}: no startable child right now. ${formatSummaryLine(result.summary)}`,
	};
}

/**
 * Continue orchestration after a Work Pi shuts down.
 *
 * Re-snapshots from GitHub truth. If the just-finished child's PR is merged,
 * launches the next startable child. If it is NOT merged (user closed the Work
 * Pi without merging — interrupted, review rejected, or merge not yet reflected),
 * the orchestration stops here without launching anything (approval gate, 案a).
 */
export async function continueOrchestration(
	parentNumber: number,
	justFinishedChild: number,
	cwd: string,
	deps: OrchestrationDeps,
	launchWorkPi: LaunchWorkPi,
): Promise<OrchestrationOutcome> {
	const states = await collectSnapshot(parentNumber, deps);
	const result = pickNextChild(states);

	const finished = states.find((state) => state.number === justFinishedChild);
	const finishedMerged = finished?.prMerged ?? false;

	if (!finishedMerged) {
		return {
			kind: "not-merged",
			childNumber: justFinishedChild,
			summary: result.summary,
			message: `#${justFinishedChild} PR is not merged; stopping orchestration of #${parentNumber}. Re-open with /issue ${parentNumber} to resume. ${formatSummaryLine(result.summary)}`,
		};
	}

	const next = result.next;
	if (next) {
		await launchWorkPi({ cwd, title: `Issue #${next.state.number}`, parent: parentNumber, child: next.state.number });
		return {
			kind: "started",
			childNumber: next.state.number,
			summary: result.summary,
			message: `#${justFinishedChild} merged; continuing #${parentNumber}: started #${next.state.number}. ${formatSummaryLine(result.summary)}`,
		};
	}
	if (isComplete(result.summary)) {
		return {
			kind: "completed",
			summary: result.summary,
			message: `#${justFinishedChild} merged; orchestration of #${parentNumber} complete. All ${result.summary.total} children merged. ${formatSummaryLine(result.summary)}`,
		};
	}
	return {
		kind: "waiting",
		summary: result.summary,
		message: `#${justFinishedChild} merged; no startable child right now. ${formatSummaryLine(result.summary)}`,
	};
}
