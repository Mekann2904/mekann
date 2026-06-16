/**
 * orchestration/autopilot/extension.ts — autopilot Pi extension.
 *
 * Two responsibilities, both part of the `issue` feature:
 *
 * 1. `/issue-autopilot` command (Main Pi): starts the parallel autopilot
 *    supervisor as a fire-and-forget background loop. It scans GitHub truth for
 *    `ready-for-agent` issues, label-gates + dependency-gates them, launches up
 *    to `issue.autopilot.maxParallel` Work Pi panes, refills freed slots as Work
 *    Pi panes auto-close, and stops once every candidate has a PR or is
 *    `ready-for-human`.
 *
 * 2. Work Pi auto-close: when this Pi was started with the autopilot markers
 *    (`MEKANN_AUTOPILOT_*`), watch `agent_end` and, once a PR exists for the
 *    issue branch, shut the Work Pi down so the supervisor can proceed.
 *
 * The supervisor reuses ADR-0022's bounded-backoff polling (`setTimeout().unref()`)
 * and never blocks the Main Pi event loop.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { featureConfig } from "../../../../settings/featureConfig.js";
import { launchPiSessionInKittySplit } from "../../../terminal/pi-session.js";
import { buildIssueSessionInitialMessage, buildIssueSessionSystemPrompt } from "../../prompts.js";
import { getRepoInfo, resolveIssueWorktreePath } from "../../worktree.js";
import { checkIssuePrerequisites } from "../../prerequisites.js";
import { createAutopilotDeps } from "./deps.js";
import { DEFAULT_AUTOPILOT_CONFIG, runAutopilotSupervisor, type AutopilotLoopHooks, type AutopilotSupervisorConfig } from "./lifecycle.js";
import { readAutopilotChildEnv } from "./markers.js";
import type { AutopilotChildState } from "./state.js";

const execFile = promisify(execFileCb);

/** Read and clamp `issue.autopilot.maxParallel`. */
function resolveMaxParallel(): number {
	const raw = featureConfig("issue")?.autopilot;
	const configured = Number((raw as { maxParallel?: unknown } | undefined)?.maxParallel);
	return Number.isFinite(configured) && configured >= 1 ? Math.floor(configured) : DEFAULT_AUTOPILOT_CONFIG.maxParallel;
}

/** Build the production supervisor config. */
export function buildAutopilotConfig(): AutopilotSupervisorConfig {
	return { ...DEFAULT_AUTOPILOT_CONFIG, maxParallel: resolveMaxParallel() };
}

/**
 * Build the Work Pi launcher for an autopilot candidate. Creates/reuses the
 * issue worktree and propagates the autopilot markers so the Work Pi auto-closes
 * once its PR exists.
 */
export function buildAutopilotLauncher(repoRoot: string): (child: AutopilotChildState) => Promise<void> {
	return async (child) => {
		const wtPath = resolveIssueWorktreePath(repoRoot, child.number);
		await launchPiSessionInKittySplit({
			cwd: wtPath,
			title: `Issue #${child.number}`,
			nodeBin: process.env.MEKANN_NODE_BIN,
			appendSystemPrompt: buildIssueSessionSystemPrompt(child.number, child.labels),
			initialMessage: buildIssueSessionInitialMessage(child.number, child.labels),
			autopilotChild: child.number,
			hold: process.env.MEKANN_ISSUE_DEBUG === "1",
		});
	};
}

/** Production loop hooks: unref'd timers (ADR-0022), `Date.now`, ui.notify. */
function createLoopHooks(ctx: ExtensionContext, stopSignal: { stopped: boolean }): AutopilotLoopHooks {
	return {
		sleep(ms: number): Promise<void> {
			return new Promise((resolve) => {
				const timer = setTimeout(() => resolve(), ms);
				// unref so an in-flight poll never keeps the Main Pi process alive.
				timer.unref?.();
			});
		},
		shouldStop: () => stopSignal.stopped,
		now: () => Date.now(),
		notify: (message, level) => ctx.ui.notify(message, level),
	};
}

/** Guard against starting a second supervisor while one is already running. */
let supervisorActive = false;
/** Live stop signal for the currently-running supervisor, so session_shutdown can halt it. */
let supervisorStop: { stopped: boolean } | null = null;

async function prExistsForBranch(remote: string, branch: string): Promise<boolean> {
	try {
		const { stdout } = await execFile(
			"gh",
			["pr", "list", "--repo", remote, "--head", branch, "--state", "all", "--json", "number", "--limit", "5"],
			{ timeout: 15000 },
		);
		return JSON.parse(String(stdout)).length > 0;
	} catch {
		return false;
	}
}

async function startSupervisor(ctx: ExtensionContext): Promise<void> {
	if (supervisorActive) {
		ctx.ui.notify("Autopilot supervisor is already running. /issue-autopilot to start, or wait for completion.", "warning");
		return;
	}
	const repoInfo = getRepoInfo(ctx.cwd);
	if (!repoInfo) {
		ctx.ui.notify("Not inside a git repository.", "error");
		return;
	}

	supervisorActive = true;
	const stopSignal = { stopped: false };
	supervisorStop = stopSignal;
	const hooks = createLoopHooks(ctx, stopSignal);
	const deps = createAutopilotDeps({ remote: repoInfo.remote, repoRoot: repoInfo.root });
	const launchWorkPi = buildAutopilotLauncher(repoInfo.root);

	// Fire-and-forget: the loop runs in the background and notifies via ctx.ui.
	void runAutopilotSupervisor(deps, launchWorkPi, hooks, buildAutopilotConfig())
		.catch((error) => {
			ctx.ui.notify(`Autopilot supervisor crashed: ${error instanceof Error ? error.message : String(error)}`, "error");
		})
		.finally(() => {
			supervisorActive = false;
			supervisorStop = null;
		});
}

/**
 * Register the autopilot command (Main Pi) and, when this Pi carries the
 * autopilot markers, the Work Pi auto-close hook.
 */
export function registerAutopilot(pi: ExtensionAPI): void {
	pi.registerCommand("issue-autopilot", {
		description: "Autopilot: drive ready-for-agent issues to PRs with a parallel worker pool.",
		handler: async (_args, ctx) => {
			const prerequisiteError = checkIssuePrerequisites(ctx.cwd);
			if (prerequisiteError) {
				ctx.ui.notify(prerequisiteError, "error");
				return;
			}
			await startSupervisor(ctx);
		},
	});

	// Main Pi: halt the supervisor cleanly when the session shuts down so an
	// in-flight bounded-backoff poll never outlives the user's session.
	pi.on("session_shutdown", () => {
		if (supervisorStop) supervisorStop.stopped = true;
	});

	// Work Pi auto-close: only on a Pi started by the autopilot supervisor.
	const child = readAutopilotChildEnv(process.env);
	if (child === null) return;

	let closing = false;
	pi.on("agent_end", async (_event, ctx) => {
		if (closing) return;
		const repoInfo = getRepoInfo(ctx.cwd);
		if (!repoInfo) return;
		const branch = `issue-${child}`;
		if (await prExistsForBranch(repoInfo.remote, branch)) {
			closing = true;
			ctx.ui.notify(`Autopilot: PR detected for ${branch}. Closing Work Pi so the supervisor can continue.`, "info");
			// Request a graceful shutdown; the supervisor detects the pane closing and proceeds.
			ctx.shutdown();
		}
	});
}
