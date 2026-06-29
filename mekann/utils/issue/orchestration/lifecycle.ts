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
import { evaluateGate, type GatePolicy, type GateStatus, type GateStopReason, type GateWaitReason } from "./gate.js";

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
	| { kind: "waiting"; summary: ResolutionSummary; message: string; policy?: GatePolicy; waitReason?: GateWaitReason }
	| { kind: "no-children"; message: string }
	| {
			kind: "not-merged";
			childNumber: number;
			summary: ResolutionSummary;
			message: string;
			policy?: GatePolicy;
			stopReason?: GateStopReason;
	  };

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
 * Derive the gate status the continuation gate reasons over, from a child's
 * integrated snapshot. Unknown just-finished children collapse to a safe
 * not-merged status (defensive: the gate then stops under every policy).
 */
function gateStatusFor(finished: { prMerged?: boolean; prExists?: boolean; prClosed?: boolean; prDraft?: boolean } | undefined): GateStatus {
	return {
		merged: finished?.prMerged ?? false,
		exists: finished?.prExists ?? false,
		closed: finished?.prClosed ?? false,
		isDraft: finished?.prDraft ?? false,
	};
}

/** Resume hint appended to stop messages so the user knows how to re-open. */
function resumeHint(parentNumber: number): string {
	return `Resume with /issue ${parentNumber}.`;
}

/**
 * Continue orchestration after a Work Pi shuts down.
 *
 * Re-snapshots from GitHub truth and applies the configurable continuation
 * gate (ADR-0028 IC-247). `policy` defaults to `"merged"` (the current
 * behaviour: continue only when the just-finished child's PR is merged) and is
 * injected as an argument so the decision stays a pure function over the
 * snapshot + policy, with `launchWorkPi` the only side effect.
 *
 * Gate outcomes:
 * - `continue` → launch the next startable child (or report completion/waiting
 *   if none is startable), exactly like the merged case used to.
 * - `wait`     → the PR is still resolving (open/draft under a lenient policy);
 *   report `waiting` with the policy-aware reason, launch nothing.
 * - `stop`     → the gate rejected the child (not merged / closed); report
 *   `not-merged` with the policy + stop reason and the resume hint, launch
 *   nothing.
 */
export async function continueOrchestration(
	parentNumber: number,
	justFinishedChild: number,
	cwd: string,
	deps: OrchestrationDeps,
	launchWorkPi: LaunchWorkPi,
	policy: GatePolicy = "merged",
): Promise<OrchestrationOutcome> {
	const states = await collectSnapshot(parentNumber, deps);
	const result = pickNextChild(states);

	const finished = states.find((state) => state.number === justFinishedChild);
	const gate = evaluateGate(gateStatusFor(finished), policy);

	if (gate.kind === "stop") {
		return {
			kind: "not-merged",
			childNumber: justFinishedChild,
			summary: result.summary,
			policy,
			stopReason: gate.reason,
			message: `#${justFinishedChild} ${gate.detail}; stopping orchestration of #${parentNumber}. ${resumeHint(parentNumber)} ${formatSummaryLine(result.summary)}`,
		};
	}

	if (gate.kind === "wait") {
		return {
			kind: "waiting",
			summary: result.summary,
			policy,
			waitReason: gate.reason,
			message: `#${justFinishedChild} ${gate.detail}; not starting the next child of #${parentNumber} yet. ${formatSummaryLine(result.summary)}`,
		};
	}

	// The just-finished child is never the immediate next launch — it was just
	// shut down, so re-picking it (possible under a lenient policy where a
	// not-merged child is still `startable`) would be an instant relaunch loop.
	const next = pickNextChild(states.filter((state) => state.number !== justFinishedChild)).next;
	if (next) {
		await launchWorkPi({ cwd, title: `Issue #${next.state.number}`, parent: parentNumber, child: next.state.number });
		return {
			kind: "started",
			childNumber: next.state.number,
			summary: result.summary,
			message: `#${justFinishedChild} passed the '${policy}' gate (${gate.reason}); continuing #${parentNumber}: started #${next.state.number}. ${formatSummaryLine(result.summary)}`,
		};
	}
	if (isComplete(result.summary)) {
		return {
			kind: "completed",
			summary: result.summary,
			message: `#${justFinishedChild} passed the '${policy}' gate (${gate.reason}); orchestration of #${parentNumber} complete. All ${result.summary.total} children merged. ${formatSummaryLine(result.summary)}`,
		};
	}
	return {
		kind: "waiting",
		summary: result.summary,
		message: `#${justFinishedChild} passed the '${policy}' gate (${gate.reason}); no startable child right now. ${formatSummaryLine(result.summary)}`,
	};
}
