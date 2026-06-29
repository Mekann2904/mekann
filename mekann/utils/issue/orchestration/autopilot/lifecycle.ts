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
 * Parallel worker pool: up to `maxParallel` Work Pi panes may be active at
 * once. Dependency and label gates remain the only startability gates.
 */

import { nextInterval } from "../../../pr-workflow/index.js";
import { READY_FOR_AGENT_LABEL } from "./markers.js";
import { collectAutopilotSnapshot, type AutopilotDeps } from "./collector.js";
import { isAutopilotComplete, isAutopilotEmpty, pickNextAutopilot, type AutopilotJudgement, type AutopilotSummary } from "./resolver.js";
import type { AutopilotChildState } from "./state.js";

/** Pure decision for one supervisor step over a snapshot. */
export type AutopilotDecision =
	| { kind: "no-candidates" }
	| { kind: "completed"; summary: AutopilotSummary }
	| { kind: "startable"; child: AutopilotChildState; summary: AutopilotSummary }
	| { kind: "waiting"; summary: AutopilotSummary };

export type AutopilotPoolDecision =
	| { kind: "no-candidates" }
	| { kind: "completed"; summary: AutopilotSummary }
	| { kind: "launch"; children: AutopilotChildState[]; summary: AutopilotSummary; activeSlots: number; availableSlots: number }
	| { kind: "waiting"; summary: AutopilotSummary; activeSlots: number; availableSlots: number };

/**
 * Decide the next supervisor action from a snapshot. Pure: same input → same
 * output. This is the testable core of the supervisor's state machine.
 */
export function decideAutopilotStep(states: AutopilotChildState[]): AutopilotDecision {
	const decision = decideAutopilotPoolStep(states, 1);
	if (decision.kind === "launch") return { kind: "startable", child: decision.children[0]!, summary: decision.summary };
	if (decision.kind === "waiting") return { kind: "waiting", summary: decision.summary };
	return decision;
}

/** Decide which candidates to launch now for the parallel worker pool. */
export function decideAutopilotPoolStep(states: AutopilotChildState[], maxParallel: number): AutopilotPoolDecision {
	if (states.length === 0) return { kind: "no-candidates" };
	const result = pickNextAutopilot(states);
	if (isAutopilotEmpty(result.summary)) return { kind: "no-candidates" };
	if (isAutopilotComplete(result.summary)) return { kind: "completed", summary: result.summary };

	const limit = clampMaxParallel(maxParallel);
	const activeSlots = result.summary.active.length;
	const availableSlots = Math.max(0, limit - activeSlots);
	const toLaunch = result.startable.slice(0, availableSlots).map((judgement: AutopilotJudgement) => judgement.state);
	if (toLaunch.length > 0) return { kind: "launch", children: toLaunch, summary: result.summary, activeSlots, availableSlots };
	return { kind: "waiting", summary: result.summary, activeSlots, availableSlots };
}

function clampMaxParallel(maxParallel: number): number {
	return Number.isFinite(maxParallel) && maxParallel >= 1 ? Math.floor(maxParallel) : 1;
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
	maxParallel: 2,
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

/**
 * Run the autopilot supervisor loop until it completes, finds no candidates, or
 * is asked to stop. It keeps up to `maxParallel` Work Pi panes active.
 *
 * After launching candidates, the supervisor re-snapshots from GitHub truth on a
 * bounded-backoff cadence. A Work Pi auto-closes once its PR exists; that frees
 * a slot and the next startable candidate is launched. It terminates when every
 * `ready-for-agent` candidate has a PR or is `ready-for-human`.
 */
export async function runAutopilotSupervisor(
	deps: AutopilotDeps,
	launchWorkPi: LaunchAutopilotWorkPi,
	hooks: AutopilotLoopHooks,
	config: AutopilotSupervisorConfig = DEFAULT_AUTOPILOT_CONFIG,
): Promise<AutopilotSupervisorResult> {
	const maxParallel = clampMaxParallel(config.maxParallel);
	hooks.notify(`Autopilot supervisor started (maxParallel=${maxParallel}).`, "info");
	let interval = config.initialIntervalMs;
	const launchAttempts = new Map<number, number>();

	while (!hooks.shouldStop()) {
		// The snapshot fans out to gh (issues / blocked_by / prs) and kitty. Any of
		// those can fail transiently (rate limit, network blip). A single transient
		// failure must NOT crash the whole supervisor — it sleeps on the bounded
		// backoff and re-snapshots from GitHub truth next cycle. This is distinct
		// from a clean "0 candidates" result, which is handled below.
		let states: AutopilotChildState[];
		try {
			states = await collectAutopilotSnapshot(deps);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			hooks.notify(
				`Autopilot: snapshot failed (${message}); staying up and re-checking GitHub truth in ${Math.round(interval / 1000)}s.`,
				"warning",
			);
			await hooks.sleep(interval);
			interval = nextInterval(interval, config.backoffFactor, config.maxIntervalMs);
			continue;
		}
		const decision = decideAutopilotPoolStep(states, maxParallel);

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

		if (decision.kind === "launch") {
			hooks.notify(
				`Autopilot: launching ${decision.children.length} issue(s); slots ${decision.activeSlots}/${maxParallel} active before launch. ${formatSummary(decision.summary)}`,
				"info",
			);
			for (const child of decision.children) {
				const attempts = (launchAttempts.get(child.number) ?? 0) + 1;
				launchAttempts.set(child.number, attempts);
				if (attempts > config.maxLaunchAttempts) {
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
			}

			const appeared = await Promise.all(decision.children.map((child) => waitForWorkPi(deps, child.number, hooks, config)));
			if (hooks.shouldStop()) return { kind: "stopped", reason: "supervisor stopped during launch" };
			// A pane that appeared is a successful launch: clear its failure counter so
			// the bounded-relaunch guard below only bounds *consecutive* no-shows for
			// the same issue (a pane that crashes after a successful start must not
			// exhaust the budget against a later relaunch).
			decision.children.forEach((child, index) => {
				if (appeared[index]) launchAttempts.delete(child.number);
			});
			const missing = decision.children.filter((_child, index) => !appeared[index]);
			if (missing.length > 0) {
				hooks.notify(`Autopilot: Work Pi pane(s) did not appear for ${missing.map((child) => `#${child.number}`).join(", ")}; re-checking GitHub truth.`, "warning");
				await hooks.sleep(interval);
				interval = nextInterval(interval, config.backoffFactor, config.maxIntervalMs);
				continue;
			}

			// Progress made: reset backoff for the next cycle. Do not wait for every
			// launched pane to close; re-snapshotting lets slots refill as soon as any
			// Work Pi auto-closes.
			interval = config.initialIntervalMs;
			continue;
		}

		// waiting: pool full and/or blocked candidates, none startable right now.
		hooks.notify(`Autopilot: waiting for worker pool to settle (${decision.activeSlots}/${maxParallel} slots used). ${formatSummary(decision.summary)}`, "info");
		await hooks.sleep(interval);
		interval = nextInterval(interval, config.backoffFactor, config.maxIntervalMs);
	}

	return { kind: "stopped", reason: "supervisor stopped" };
}
