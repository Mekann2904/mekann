/**
 * orchestration/gate.ts — configurable continuation gate (ADR-0028 IC-247).
 *
 * Pure decision module: given the just-finished child's PR status and a policy,
 * decide whether orchestration should `continue` (launch the next child),
 * `wait` (the PR is still resolving), or `stop` (the gate rejected it).
 *
 * Kept separate from {@link ./lifecycle.ts} so the gate matrix
 * (policy × {merged, closed, draft, no-PR}) is exhaustively unit-testable
 * without any I/O. `continueOrchestration` injects the policy as an argument,
 * preserving its pure-function testability.
 */

/** Continuation gate policies. */
export const GATE_POLICIES = ["merged", "on-closed-skip", "on-draft-wait"] as const;
export type GatePolicy = (typeof GATE_POLICIES)[number];

/**
 * PR status the gate reasons over.
 *
 * - `merged`:  GitHub PR state is MERGED (the approval proxy).
 * - `closed`:  GitHub PR state is CLOSED without merge (rejected/abandoned).
 * - `isDraft`: an OPEN PR is still a draft.
 * - `exists`:  any PR exists for the child branch (false = none opened yet).
 */
export interface GateStatus {
	merged: boolean;
	closed: boolean;
	isDraft: boolean;
	exists: boolean;
}

/** Machine-readable reason the gate stopped the chain. */
export type GateStopReason = "not-merged" | "closed";
/** Machine-readable reason the gate is waiting. */
export type GateWaitReason = "open" | "draft";

export type GateOutcome =
	| { kind: "continue"; reason: string }
	| { kind: "wait"; reason: GateWaitReason; detail: string }
	| { kind: "stop"; reason: GateStopReason; detail: string };

/** Type guard for a {@link GatePolicy} value read from settings/env. */
export function isGatePolicy(value: unknown): value is GatePolicy {
	return value === "merged" || value === "on-closed-skip" || value === "on-draft-wait";
}

/**
 * Evaluate the continuation gate. Pure: same inputs → same output.
 *
 * Common base for every policy:
 * - `merged` → continue (merged is the approval proxy; all policies agree).
 * - no PR at all → stop `not-merged` (a Work Pi that shut down without a PR did
 *   not complete; continuing the chain would be unsafe under any policy).
 *
 * Then the policy decides among not-merged-but-has-a-PR states:
 * - `merged` (default, current behaviour): require a merged PR; anything else stops.
 * - `on-closed-skip`: stop on a closed PR, otherwise wait (keep watching an
 *   open/draft PR the user is still working on).
 * - `on-draft-wait`: stop on a closed PR, wait on a draft, but treat an open
 *   non-draft PR as approved and continue.
 */
export function evaluateGate(status: GateStatus, policy: GatePolicy): GateOutcome {
	if (status.merged) {
		return { kind: "continue", reason: "PR merged" };
	}
	if (!status.exists) {
		return {
			kind: "stop",
			reason: "not-merged",
			detail: "no PR found for the child branch and none is merged",
		};
	}
	switch (policy) {
		case "merged":
			return {
				kind: "stop",
				reason: "not-merged",
				detail: "PR is not merged (policy 'merged' requires a merged PR to continue)",
			};
		case "on-closed-skip":
			if (status.closed) {
				return {
					kind: "stop",
					reason: "closed",
					detail: "PR was closed without merge (policy 'on-closed-skip' stops on a closed PR)",
				};
			}
			return {
				kind: "wait",
				reason: "open",
				detail: "PR is still open (policy 'on-closed-skip' waits while the PR is open, including drafts)",
			};
		case "on-draft-wait":
			if (status.closed) {
				return {
					kind: "stop",
					reason: "closed",
					detail: "PR was closed without merge (policy 'on-draft-wait' stops on a closed PR)",
				};
			}
			if (status.isDraft) {
				return {
					kind: "wait",
					reason: "draft",
					detail: "PR is still a draft (policy 'on-draft-wait' waits while the PR is a draft)",
				};
			}
			return {
				kind: "continue",
				reason: "PR is open and not a draft (policy 'on-draft-wait' treats an open, non-draft PR as approved)",
			};
	}
}
