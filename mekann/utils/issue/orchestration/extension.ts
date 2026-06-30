/**
 * orchestration/extension.ts — Work Pi side of issue orchestration (issue #71).
 *
 * Two responsibilities, both gated on the `issue-orchestration` feature:
 *
 * 1. IC-246 hello verify (`session_start`): the launcher drops an expected-child
 *    manifest into the child worktree (see {@link ./hello.ts}). At session
 *    start we read it; if it says this session was launched as an orchestration
 *    child but the env markers are missing, we surface a loud warning instead
 *    of letting the continuation hook fail silently. This is defence-in-depth
 *    over the `--env` propagation in {@link ../../terminal/pi-session.ts}.
 * 2. Continuation (`session_shutdown`): re-snapshot from GitHub truth and apply
 *    the configurable continuation gate (ADR-0028 IC-247). Manual `/issue`
 *    sessions carry neither markers nor a manifest, so they are left untouched
 *    (方針1: 手動とオーケストレーションの両立).
 *
 * The Work Pi itself acts as the orchestrator for its successor (案X), reusing
 * the standard `launchPiSessionInKittySplit` path and propagating the markers.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { isFeatureEnabled } from "../../../settings/enabled.js";
import { featureConfig } from "../../../settings/featureConfig.js";
import { createOrchestrationDeps } from "./deps.js";
import { isGatePolicy, type GatePolicy } from "./gate.js";
import { consumeExpectedHello, readExpectedHello } from "./hello.js";
import {
	continueOrchestration,
	ORCHESTRATION_CHILD_ENV,
	ORCHESTRATION_PARENT_ENV,
	type LaunchWorkPi,
} from "./lifecycle.js";
import { createWorktree, getRepoInfo, issueBranch, listExistingWorktrees, worktreeDir } from "../worktree.js";
import { launchPiSessionInKittySplit } from "../../terminal/pi-session.js";
import { buildIssueSessionInitialMessage, buildIssueSessionSystemPrompt } from "../prompts.js";
import { resolveIssueWorkPiModel } from "./issueModel.js";

/** Outcome of the IC-246 startup hello verify. */
type HelloState = "ok" | "missing-markers" | "manual";

/**
 * Read the configured continuation gate policy (ADR-0028 IC-247). Falls back to
 * the default `merged` policy for any missing/invalid value, preserving the
 * pre-policy behaviour.
 */
function resolveContinueGatePolicy(): GatePolicy {
	const feature = featureConfig("issue") as { orchestration?: { continueGate?: unknown } } | undefined;
	const raw = feature?.orchestration?.continueGate;
	return isGatePolicy(raw) ? raw : "merged";
}

export default function orchestrationExtension(pi: ExtensionAPI): void {
	if (!isFeatureEnabled("issue-orchestration")) return;

	const parentRaw = process.env[ORCHESTRATION_PARENT_ENV];
	const childRaw = process.env[ORCHESTRATION_CHILD_ENV];
	const parent = Number(parentRaw);
	const child = Number(childRaw);
	const markersPresent =
		Boolean(parentRaw) && Boolean(childRaw) && Number.isFinite(parent) && Number.isFinite(child);

	// IC-246 hello-verify state, captured at session_start and reused at
	// session_shutdown so a missing-marker session can explain why it will not
	// continue instead of failing silently.
	let helloState: HelloState = "manual";
	let helloParent: number | null = null;
	let helloChild: number | null = null;

	// 1. IC-246 hello verify. Detect a launch that meant to be an orchestration
	//    child but whose env markers did not arrive (broken --env path, a shell
	//    wrapper that dropped the export, a `set -e` abort). The manifest is
	//    written by the launcher into the worktree — independent of env — so the
	//    detection itself cannot be defeated by the same env failure.
	pi.on("session_start", async (_event, ctx: ExtensionContext) => {
		const cwd = ctx.cwd;
		const hello = await readExpectedHello(cwd);
		if (!hello.expected) {
			// No manifest → genuine manual /issue session (or a non-orchestration
			// Pi). Stay silent, exactly like before.
			helloState = "manual";
			return;
		}
		helloParent = hello.parent;
		helloChild = hello.child;
		if (markersPresent) {
			helloState = "ok";
			// The manifest has served its purpose; remove it so it cannot trip a
			// later manual session opened in the same worktree.
			await consumeExpectedHello(cwd);
			return;
		}
		helloState = "missing-markers";
		const message =
			`[orchestration] env markers missing: this session was launched as orchestration child #${hello.child} of #${hello.parent}, ` +
			`but MEKANN_ORCHESTRATION_PARENT/CHILD were not detected. The session_shutdown continuation hook will NOT fire, ` +
			`so orchestration of #${hello.parent} will not continue automatically. This usually means the launch wrapper did not ` +
			`export the markers (e.g. a \`set -e\` abort or a missing export). Resume manually with /issue ${hello.parent}.`;
		ctx.ui.notify(message, "warning");
		process.stderr.write(`${message}\n`);
		// Keep the manifest so the shutdown handler can reinforce the reason.
	});

	// 2. Continuation. Only a Work Pi that received its markers continues the
	//    chain; a missing-marker-but-expected session instead reinforces the
	//    IC-246 warning, and a manual session stays inert.
	pi.on("session_shutdown", async () => {
		if (!markersPresent) {
			if (helloState === "missing-markers" && helloParent !== null) {
				process.stderr.write(
					`[orchestration] not continuing #${helloParent} after #${helloChild}: orchestration env markers were missing at startup, so the continuation hook cannot fire. Resume with /issue ${helloParent}.\n`,
				);
			}
			return;
		}

		const repoInfo = getRepoInfo();
		if (!repoInfo) {
			process.stderr.write(`[orchestration] not in a git repo; cannot continue #${parent}\n`);
			return;
		}

		const deps = createOrchestrationDeps({ remote: repoInfo.remote, repoRoot: repoInfo.root });

		const launchWorkPi: LaunchWorkPi = async (options) => {
			const branch = issueBranch(options.child);
			const dir = worktreeDir(repoInfo.root, branch);
			const existing = listExistingWorktrees(repoInfo.root).find((worktree) => worktree.branch === branch);
			const wtPath = existing ? existing.path : createWorktree(repoInfo.root, branch, dir).path;
			const { model, thinking } = resolveIssueWorkPiModel();
			await launchPiSessionInKittySplit({
				cwd: wtPath,
				title: options.title,
				nodeBin: process.env.MEKANN_NODE_BIN,
				appendSystemPrompt: buildIssueSessionSystemPrompt(options.child),
				initialMessage: buildIssueSessionInitialMessage(options.child),
				model,
				thinking,
				orchestrationParent: options.parent,
				orchestrationChild: options.child,
				hold: process.env.MEKANN_ISSUE_DEBUG === "1",
			});
		};

		try {
			const outcome = await continueOrchestration(
				parent,
				child,
				repoInfo.root,
				deps,
				launchWorkPi,
				resolveContinueGatePolicy(),
			);
			// Best-effort log; the Work Pi is exiting, so this is mostly for debugging.
			process.stderr.write(`[orchestration] ${outcome.message}\n`);
		} catch (error) {
			process.stderr.write(
				`[orchestration] continuation failed for #${parent} after #${child}: ${error instanceof Error ? error.message : String(error)}\n`,
			);
		}
	});
}
