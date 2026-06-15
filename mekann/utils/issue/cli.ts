#!/usr/bin/env bun
/**
 * mekann-issue — Issue worktree management CLI.
 *
 * Interactive mode: OpenTUI issue list → create worktree → launch pi in Kitty split
 * Direct mode: --issue N → create worktree and print its path
 * Orchestrate mode: <parent-number> → GitHub-truth orchestration of sub-issues (issue #71)
 * Cleanup: remove worktrees whose issues are closed
 */

import { parseIssueArgs } from "./args.js";
import { addDependencyStatus, listOpenIssues, type IssueDependencyStatus, type IssueWithStatus, getIssueStatus, getIssueDependencyStatus } from "./github.js";
import { getRepoInfo, createWorktree, removeWorktree, worktreeDir, listExistingWorktrees, issueBranch, parseIssueNumberFromBranch, type WorktreeInfo, type RepoInfo } from "./worktree.js";
import { mountIssueList } from "./app.js";
import { launchPiSessionInKittySplit } from "../terminal/pi-session.js";
import { createOrchestrationDeps } from "./orchestration/deps.js";
import { startOrchestration, type LaunchWorkPi } from "./orchestration/lifecycle.js";
import { buildIssueSessionSystemPrompt, buildIssueSessionInitialMessage } from "./prompts.js";
import { bulkLaunchIssues, type BulkLaunchDeps } from "./bulk-launch.js";

export { buildIssueSessionSystemPrompt, buildIssueSessionInitialMessage } from "./prompts.js";

async function main(): Promise<void> {
	const args = parseIssueArgs(process.argv.slice(2));
	if (!args.ok) {
		console.error(args.error);
		process.exitCode = args.error.startsWith("Usage:") ? 0 : 1;
		return;
	}

	if (args.value.mode === "cleanup") {
		await runCleanup();
		return;
	}

	if (args.value.mode === "direct") {
		await runDirect(args.value.issueNumber!);
		return;
	}

	if (args.value.mode === "orchestrate") {
		await runOrchestration(args.value.issueNumber!);
		return;
	}

	await runInteractive();
}

async function runCleanup(): Promise<void> {
	const repoInfo = getRepoInfo();
	if (!repoInfo) {
		console.error("Not inside a git repository.");
		process.exitCode = 1;
		return;
	}

	const existing = listExistingWorktrees(repoInfo.root);
	if (existing.length === 0) {
		console.log("No issue worktrees found.");
		return;
	}

	const toRemove: WorktreeInfo[] = [];
	for (const wt of existing) {
		const issueNumber = parseIssueNumberFromBranch(wt.branch);
		if (issueNumber === null) continue;
		const status = await getIssueStatus(repoInfo.remote, issueNumber);
		if (status === "closed") toRemove.push(wt);
	}

	if (toRemove.length === 0) {
		console.log("No closed issue worktrees to clean up.");
		return;
	}

	console.log("Removing:");
	for (const wt of toRemove) {
		removeWorktree(repoInfo.root, wt);
		console.log(`  ${wt.branch}`);
	}
}

async function runDirect(issueNumber: number): Promise<void> {
	const repoInfo = getRepoInfo();
	if (!repoInfo) { console.error("Not in git repo."); process.exitCode = 1; return; }

	const dependencyStatus = await getIssueDependencyStatus(repoInfo.remote, issueNumber);
	if (!ensureIssueCanStart(issueNumber, dependencyStatus)) return;

	const branch = issueBranch(issueNumber);
	const dir = worktreeDir(repoInfo.root, branch);
	const wt = createWorktree(repoInfo.root, branch, dir);
	console.log(wt.path);
}

/**
 * Resolve a child's worktree path, creating it if needed (reusing existing).
 * Shared by orchestration launches so the CLI and the shutdown hook stay in sync.
 */
function resolveChildWorktreePath(repoRoot: string, child: number): string {
	const branch = issueBranch(child);
	const dir = worktreeDir(repoRoot, branch);
	const existing = listExistingWorktrees(repoRoot).find((worktree) => worktree.branch === branch);
	return existing ? existing.path : createWorktree(repoRoot, branch, dir).path;
}

/**
 * Build the Work Pi launcher for an orchestrated child. Propagates orchestration
 * env markers so the child's session_shutdown hook can continue the chain.
 */
function buildOrchestrationLauncher(parent: number, repoRoot: string): LaunchWorkPi {
	return async (options) => {
		const wtPath = resolveChildWorktreePath(repoRoot, options.child);
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
}

/**
 * Orchestrate a parent PRD/epic issue (issue #71).
 *
 * Snapshot children from GitHub truth, start the first startable child's Work
 * Pi (marked with orchestration env vars), then exit. The Work Pi's own session
 * shutdown hook continues the chain after its PR is merged.
 */
async function runOrchestration(parentNumber: number): Promise<void> {
	const repoInfo = getRepoInfo();
	if (!repoInfo) { console.error("Not in git repo."); process.exitCode = 1; return; }

	const deps = createOrchestrationDeps({ remote: repoInfo.remote, repoRoot: repoInfo.root });
	const launchWorkPi = buildOrchestrationLauncher(parentNumber, repoInfo.root);

	try {
		const outcome = await startOrchestration(parentNumber, repoInfo.root, deps, launchWorkPi);
		console.log(outcome.message);
		if (outcome.kind === "no-children") process.exitCode = 0;
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}

/**
 * List sub-issues, returning [] on any error (e.g. parent has no children,
 * gh unavailable). Used in the interactive list to detect whether a selected
 * issue is a parent that should be orchestrated rather than opened directly.
 */
async function safeListSubIssues(deps: ReturnType<typeof createOrchestrationDeps>, parentNumber: number): Promise<{ number: number }[]> {
	try {
		return await deps.listSubIssues(parentNumber);
	} catch {
		return [];
	}
}

async function runInteractive(): Promise<void> {
	const repoInfo = getRepoInfo();
	if (!repoInfo) { console.error("Not in git repo."); process.exitCode = 1; return; }

	const issues = await listOpenIssues(repoInfo.remote);

	if (issues.length === 0) {
		console.error("No open issues found.");
		process.exitCode = 0;
		return;
	}

	const existing = listExistingWorktrees(repoInfo.root);
	const existingBranches = new Set(existing.map((wt) => wt.branch));

	const issuesWithStatus: IssueWithStatus[] = [];
	for (const issue of issues) {
		const issueWithDependencies = await addDependencyStatus(repoInfo.remote, issue);
		issuesWithStatus.push({
			...issueWithDependencies,
			hasWorktree: existingBranches.has(issueBranch(issue.number)),
			worktreePath: existing.find((wt) => wt.branch === issueBranch(issue.number))?.path,
		});
	}

	const { createCliRenderer } = await import("@opentui/core");
	const renderer = await createCliRenderer({ exitOnCtrlC: false });

	await mountIssueList(renderer, issuesWithStatus, {
		onSelect: async (toOpen: IssueWithStatus[]) => {
			// Pre-flight: every issue must be startable. Slice 1 assumes all
			// succeed; blocked-rejection at mark time is slice 2 (PRD #66).
			for (const issue of toOpen) {
				if (!ensureIssueCanStart(issue.number, issue)) return;
			}

			// Close the list immediately on confirmed start so launch/orchestration
			// work never blocks the UI. Failed pre-flight preserves the legacy list.
			renderer.destroy();

			// Orchestration special case: only meaningful for a single selected
			// parent PRD/epic. Preserves the exact legacy single-select behavior.
			// A bulk-selected batch always opens each issue directly.
			if (toOpen.length === 1) {
				const issue = toOpen[0];
				const deps = createOrchestrationDeps({ remote: repoInfo.remote, repoRoot: repoInfo.root });
				const children = await safeListSubIssues(deps, issue.number);
				if (children.length > 0) {
					const launchWorkPi = buildOrchestrationLauncher(issue.number, repoInfo.root);
					try {
						const outcome = await startOrchestration(issue.number, repoInfo.root, deps, launchWorkPi);
						console.log(outcome.message);
					} catch (error) {
						console.error(error instanceof Error ? error.message : String(error));
						process.exitCode = 1;
					}
					process.exit(process.exitCode ?? 0);
					return;
				}
			}

			// Direct launch path: one issue (length-1 array) or many (bulk).
			const requests = toOpen.map((issue) => ({
				issueNumber: issue.number,
				hasWorktree: issue.hasWorktree,
				worktreePath: issue.worktreePath,
			}));
			try {
				await bulkLaunchIssues(requests, createBulkLaunchDeps(repoInfo));
			} catch (error) {
				console.error(error instanceof Error ? error.message : String(error));
				process.exit(1);
				return;
			}
			process.exit(0);
		},
		onCancel: () => {
			renderer.destroy();
			process.exit(0);
		},
	});
}

/**
 * Production wiring for {@link bulkLaunchIssues}. Worktree creation reuses an
 * existing worktree for the issue branch when present, otherwise creates a new
 * one. Each Pi session launches in its own Kitty split, which re-resolves the
 * widest Issue Pi anchor every call (ADR-0021: Main Pi is never the anchor).
 */
function createBulkLaunchDeps(repoInfo: RepoInfo): BulkLaunchDeps {
	return {
		createWorktree(issueNumber: number): string {
			const branch = issueBranch(issueNumber);
			const dir = worktreeDir(repoInfo.root, branch);
			try {
				return createWorktree(repoInfo.root, branch, dir).path;
			} catch (err) {
				throw new Error(`Failed to create worktree for #${issueNumber}: ${(err as Error).message}`);
			}
		},
		async launchPiSession(issueNumber: number, worktreePath: string): Promise<void> {
			await launchPiSessionInKittySplit({
				cwd: worktreePath,
				title: `Issue #${issueNumber}`,
				nodeBin: process.env.MEKANN_NODE_BIN,
				appendSystemPrompt: buildIssueSessionSystemPrompt(issueNumber),
				initialMessage: buildIssueSessionInitialMessage(issueNumber),
				hold: process.env.MEKANN_ISSUE_DEBUG === "1",
			});
		},
	};
}

function ensureIssueCanStart(issueNumber: number, dependencyStatus: IssueDependencyStatus): boolean {
	if (dependencyStatus.error) {
		console.error(`Issue #${issueNumber} cannot be started because dependencies could not be verified.`);
		console.error(dependencyStatus.error);
		process.exitCode = 1;
		return false;
	}

	if (dependencyStatus.openBlockers.length > 0) {
		console.error(`Issue #${issueNumber} cannot be started yet.`);
		console.error("");
		console.error("Blocked by:");
		for (const blocker of dependencyStatus.openBlockers) {
			console.error(`  #${blocker.number} ${blocker.title}`);
		}
		console.error("");
		console.error("Resolve or close the blocking issues first.");
		process.exitCode = 1;
		return false;
	}

	return true;
}

void main().catch((error) => {
	console.error(error instanceof Error ? error.stack ?? error.message : String(error));
	process.exitCode = 1;
});
