/**
 * orchestration/extension.ts — Work Pi side of issue orchestration (issue #71).
 *
 * Activates ONLY on a Work Pi that was started as part of an orchestration,
 * detected via the {@link ORCHESTRATION_PARENT_ENV} / {@link ORCHESTRATION_CHILD_ENV}
 * markers injected at launch. Manual `/issue` sessions carry no markers and are
 * left untouched (方針1: 手動とオーケストレーションの両立).
 *
 * On `session_shutdown`, re-snapshots from GitHub truth and, if the just-finished
 * child's PR is merged, launches the next startable child (承認ゲート, 案a). If the
 * PR is not merged, the orchestration stops here without launching anything.
 *
 * The Work Pi itself acts as the orchestrator for its successor (案X), reusing
 * the standard `launchPiSessionInKittySplit` path and propagating the markers.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isFeatureEnabled } from "../../../settings/enabled.js";
import { createOrchestrationDeps } from "./deps.js";
import { continueOrchestration, ORCHESTRATION_CHILD_ENV, ORCHESTRATION_PARENT_ENV, type LaunchWorkPi } from "./lifecycle.js";
import { createWorktree, getRepoInfo, issueBranch, listExistingWorktrees, worktreeDir } from "../worktree.js";
import { launchPiSessionInKittySplit } from "../../terminal/pi-session.js";
import { buildIssueSessionInitialMessage, buildIssueSessionSystemPrompt } from "../prompts.js";

export default function orchestrationExtension(pi: ExtensionAPI): void {
	if (!isFeatureEnabled("issue-orchestration")) return;

	const parentRaw = process.env[ORCHESTRATION_PARENT_ENV];
	const childRaw = process.env[ORCHESTRATION_CHILD_ENV];

	// No markers → this is a manual `/issue` session. Do not continue any chain.
	if (!parentRaw || !childRaw) return;

	const parent = Number(parentRaw);
	const child = Number(childRaw);
	if (!Number.isFinite(parent) || !Number.isFinite(child)) return;

	pi.on("session_shutdown", async () => {
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
			await launchPiSessionInKittySplit({
				cwd: wtPath,
				title: options.title,
				nodeBin: process.env.MEKANN_NODE_BIN,
				appendSystemPrompt: buildIssueSessionSystemPrompt(options.child),
				initialMessage: buildIssueSessionInitialMessage(options.child),
				orchestrationParent: options.parent,
				orchestrationChild: options.child,
				hold: process.env.MEKANN_ISSUE_DEBUG === "1",
			});
		};

		try {
			const outcome = await continueOrchestration(parent, child, repoInfo.root, deps, launchWorkPi);
			// Best-effort log; the Work Pi is exiting, so this is mostly for debugging.
			process.stderr.write(`[orchestration] ${outcome.message}\n`);
		} catch (error) {
			process.stderr.write(
				`[orchestration] continuation failed for #${parent} after #${child}: ${error instanceof Error ? error.message : String(error)}\n`,
			);
		}
	});
}
