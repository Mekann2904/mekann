/**
 * orchestration/autopilot/lifecycle.ts — supervisor decision + loop.
 *
 * Two layers:
 * - {@link decideAutopilotStep}: pure state transition + stop judgement over a
 *   snapshot. Fully unit-tested without I/O.
 * - {@link runAutopilotSupervisor}: the bounded-backoff loop (ADR-0022 pattern,
 *   `setTimeout(...).unref()`). All I/O and time are injected (`AutopilotDeps` +
 *   `AutopilotLoopHooks`), so the loop is testable with fake timers and fakes.
 *
 * Sequential in this slice (ADR-0025 slice C): at most one Work Pi at a time.
 * The parallel worker pool (maxParallel > 1) is a separate issue.
 */

import { nextInterval } from "../../../pr-workflow/index.js";
import { READY_FOR_AGENT_LABEL } from "./markers.js";
import { collectAutopilotSnapshot, type AutopilotDeps } from "./collector.js";
import { isAutopilotComplete, isAutopilotEmpty, pickNextAutopilot, type AutopilotSummary } from "./resolver.js";
import type { AutopilotChildState } from "./state.js";

/** Pure decision for one supervisor step over a snapshot. */
export type AutopilotDecision =
	| { kind: "no-candidates" }
	| { kind: "completed"; summary: AutopilotSummary }
	| { kind: "startable"; child: AutopilotChildState; summary: AutopilotSummary }
	| { kind: "waiting"; summary: AutopilotSummary };

/**
 * Decide the next supervisor action from a snapshot. Pure: same input → same
 * output. This is the testable core of the supervisor's state machine.
 */
export function decideAutopilotStep(states: AutopilotChildState[]): AutopilotDecision {
	if (states.length === 0) return { kind: "no-candidates" };
	const result = pickNextAutopilot(states);
	if (isAutopilotEmpty(result.summary)) return { kind: "no-candidates" };
	if (isAutopilotComplete(result.summary)) return { kind: "completed", summary: result.summary };
	if (result.next) return { kind: "startable", child: result.next.state, summary: result.summary };
	return { kind: "waiting", summary: result.summary };
}

/** Side effect: start the Work Pi for a candidate. Injected by the caller. */
export type LaunchAutopilotWorkPi = (child: AutopilotChildState) => Promise<void>;

/** Injected time/stop/UI hooks so the loop is deterministic in tests. */
export interface AutopilotLoopHooks {
	sleep(ms: number): Promise<void>;
	/** True when the supervisor should abort (e.g. Main Pi session_shutdown). */
	shouldStop(): boolean;
	now(): number;
	notify(message: string, level: "info" | "warning" | "error"): void;
}

/** Tunable supervisor timing. Bounded backoff (ADR-0022). */
export interface AutopilotSupervisorConfig {
	maxParallel: number;
	initialIntervalMs: number;
	maxIntervalMs: number;
	backoffFactor: number;
	/** Short poll cadence while waiting for a launched pane to appear/disappear. */
	pollIntervalMs: number;
	/** Grace window for a launched pane to become visible before treating it as not-started. */
	appearTimeoutMs: number;
	/** Bound tight relaunch loops when a launch keeps failing to spawn a detectable pane. */
	maxLaunchAttempts: number;
}

export const DEFAULT_AUTOPILOT_CONFIG: AutopilotSupervisorConfig = {
	maxParallel: 1,
	initialIntervalMs: 5_000,
	maxIntervalMs: 60_000,
	backoffFactor: 1.4,
	pollIntervalMs: 3_000,
	appearTimeoutMs: 30_000,
	maxLaunchAttempts: 3,
};

export type AutopilotSupervisorResult =
	| { kind: "completed"; summary: AutopilotSummary }
	| { kind: "stopped-no-candidates"; labelExists: boolean }
	| { kind: "stopped"; reason: string };

export function formatSummary(summary: AutopilotSummary): string {
	return `done=${summary.done.length} active=${summary.active.length} blocked=${summary.blocked.length} startable=${summary.startable.length} total=${summary.total}`;
}

async function safeLabelExists(deps: AutopilotDeps, name: string): Promise<boolean> {
	try {
		return await deps.labelExists(name);
	} catch {
		return false;
	}
}

/** Wait for a launched pane to appear; returns false if it never shows in time. */
async function waitForWorkPi(
	deps: AutopilotDeps,
	child: number,
	hooks: AutopilotLoopHooks,
	config: AutopilotSupervisorConfig,
): Promise<boolean> {
	const deadline = hooks.now() + config.appearTimeoutMs;
	while (!hooks.shouldStop()) {
		if (await deps.hasActiveWorkPi(child)) return true;
		if (hooks.now() >= deadline) return false;
		await hooks.sleep(config.pollIntervalMs);
	}
	return false;
}

/** Wait for an active pane to close (Work Pi finished its run and auto-closed). */
async function waitForWorkPiClose(
	deps: AutopilotDeps,
	child: number,
	hooks: AutopilotLoopHooks,
	config: AutopilotSupervisorConfig,
): Promise<void> {
	let interval = config.initialIntervalMs;
	while (!hooks.shouldStop()) {
		if (!(await deps.hasActiveWorkPi(child))) return;
		await hooks.sleep(interval);
		interval = nextInterval(interval, config.backoffFactor, config.maxIntervalMs);
	}
}

/**
 * Run the autopilot supervisor loop until it completes, finds no candidates, or
 * is asked to stop. Sequential: one Work Pi at a time.
 *
 * After launching a candidate, the supervisor waits for its pane to appear and
 * then to disappear (the Work Pi auto-closes once its PR is created), then
 * re-snapshots from GitHub truth and picks the next startable candidate. It
 * terminates when every `ready-for-agent` candidate has a PR or is
 * `ready-for-human`.
 */
export async function runAutopilotSupervisor(
	deps: AutopilotDeps,
	launchWorkPi: LaunchAutopilotWorkPi,
	hooks: AutopilotLoopHooks,
	config: AutopilotSupervisorConfig = DEFAULT_AUTOPILOT_CONFIG,
): Promise<AutopilotSupervisorResult> {
	hooks.notify(`Autopilot supervisor started (sequential, maxParallel=${config.maxParallel}).`, "info");
	let interval = config.initialIntervalMs;
	let lastChild = -1;
	let launchAttempts = 0;

	while (!hooks.shouldStop()) {
		const states = await collectAutopilotSnapshot(deps);
		const decision = decideAutopilotStep(states);

		if (decision.kind === "no-candidates") {
			const labelExists = await safeLabelExists(deps, READY_FOR_AGENT_LABEL);
			if (!labelExists) {
				hooks.notify(
					`No open issues are labeled "${READY_FOR_AGENT_LABEL}", and the label does not exist on the repo. ` +
						`Run setup-matt-pocock-skills or create the label on GitHub, then re-run /issue-autopilot.`,
					"warning",
				);
			} else {
				hooks.notify(`No open issues are labeled "${READY_FOR_AGENT_LABEL}". Nothing to do.`, "info");
			}
			return { kind: "stopped-no-candidates", labelExists };
		}

		if (decision.kind === "completed") {
			hooks.notify(
				`Autopilot complete. All ${decision.summary.total} ready-for-agent issue(s) have a PR or are ready-for-human. ${formatSummary(decision.summary)}`,
				"info",
			);
			return { kind: "completed", summary: decision.summary };
		}

		if (decision.kind === "startable") {
			const child = decision.child;
			if (child.number !== lastChild) {
				lastChild = child.number;
				launchAttempts = 0;
			}
			launchAttempts += 1;
			if (launchAttempts > config.maxLaunchAttempts) {
				hooks.notify(
					`Autopilot: repeatedly failed to observe a Work Pi for #${child.number} after ${config.maxLaunchAttempts} attempts. Stopping; investigate manually.`,
					"error",
				);
				return { kind: "stopped", reason: `max launch attempts exceeded for #${child.number}` };
			}

			hooks.notify(`Autopilot: starting #${child.number} — ${child.title}.`, "info");
			try {
				await launchWorkPi(child);
			} catch (error) {
				hooks.notify(
					`Autopilot: launch failed for #${child.number}: ${error instanceof Error ? error.message : String(error)}. Stopping.`,
					"error",
				);
				return { kind: "stopped", reason: `launch failed for #${child.number}` };
			}

			const appeared = await waitForWorkPi(deps, child.number, hooks, config);
			if (hooks.shouldStop()) return { kind: "stopped", reason: "supervisor stopped during launch" };
			if (!appeared) {
				hooks.notify(`Autopilot: Work Pi pane for #${child.number} did not appear; re-checking GitHub truth.`, "warning");
				await hooks.sleep(interval);
				interval = nextInterval(interval, config.backoffFactor, config.maxIntervalMs);
				continue;
			}

			await waitForWorkPiClose(deps, child.number, hooks, config);
			// Progress made: reset backoff for the next cycle.
			interval = config.initialIntervalMs;
			continue;
		}

		// waiting: in-flight/blocked candidates, none startable right now.
		hooks.notify(`Autopilot: waiting for in-flight work to settle. ${formatSummary(decision.summary)}`, "info");
		await hooks.sleep(interval);
		interval = nextInterval(interval, config.backoffFactor, config.maxIntervalMs);
	}

	return { kind: "stopped", reason: "supervisor stopped" };
}
