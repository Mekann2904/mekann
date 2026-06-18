#!/usr/bin/env bun
/**
 * mekann-issue — Issue worktree management CLI.
 *
 * Interactive mode: OpenTUI issue list → create worktree → launch pi in Kitty split
 * Direct mode: --issue N → create worktree and print its path
 * Open mode: <number> → orchestrate a parent's sub-issues (issue #71) or open a leaf directly
 * Cleanup: remove worktrees whose issues are closed
 */

import { parseIssueArgs } from "./args.js";
import { addDependencyStatus, listOpenIssues, type IssueDependencyStatus, type IssueWithStatus, getIssueStatus, getIssueDependencyStatus, getIssueLabels } from "./github.js";
import { getRepoInfo, createWorktree, removeWorktree, worktreeDir, listExistingWorktrees, issueBranch, parseIssueNumberFromBranch, resolveIssueWorktreePath, type WorktreeInfo, type RepoInfo } from "./worktree.js";
import { mountIssueList } from "./app.js";
import { launchPiSessionInKittySplit } from "../terminal/pi-session.js";
import { createOrchestrationDeps } from "./orchestration/deps.js";
import type { OrchestrationDeps } from "./orchestration/collector.js";
import { startOrchestration, type LaunchWorkPi } from "./orchestration/lifecycle.js";
import { resolveIssueWorkPiModel } from "./orchestration/issueModel.js";
import { buildIssueSessionSystemPrompt, buildIssueSessionInitialMessage } from "./prompts.js";
import { bulkLaunchIssues, type BulkLaunchDeps } from "./bulk-launch.js";
import { mapWithConcurrency } from "../concurrency.js";
import { createAutopilotDeps } from "./orchestration/autopilot/deps.js";
import { buildAutopilotConfig, buildAutopilotLauncher } from "./orchestration/autopilot/extension.js";
import { runAutopilotSupervisor, type AutopilotLoopHooks } from "./orchestration/autopilot/lifecycle.js";

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

	if (args.value.mode === "open") {
		await runOpen(args.value.issueNumber!);
		return;
	}

	if (args.value.mode === "autopilot") {
		await runAutopilot();
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

	const [dependencyStatus, labels] = await Promise.all([
		getIssueDependencyStatus(repoInfo.remote, issueNumber),
		getIssueLabels(repoInfo.remote, issueNumber).catch(() => []),
	]);
	if (!ensureIssueCanStart(issueNumber, { ...dependencyStatus, labels })) return;

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
	return resolveIssueWorktreePath(repoRoot, child);
}

/**
 * Build the Work Pi launcher for an orchestrated child. Propagates orchestration
 * env markers so the child's session_shutdown hook can continue the chain.
 */
function buildOrchestrationLauncher(parent: number, repoRoot: string): LaunchWorkPi {
	return async (options) => {
		const wtPath = resolveChildWorktreePath(repoRoot, options.child);
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
}

/**
 * Orchestrate a parent issue's sub-issues when it has any; otherwise do nothing
 * and let the caller open the issue directly.
 *
 * Single source of truth for the parent/leaf decision, shared by `/issue
 * <number>` (runOpen) and the interactive list's single-select (issue #71).
 * Reuses the caller's `deps` so orchestration neither re-resolves repo info
 * nor rebuilds the orchestration dependencies, and the gh sub-issues call that
 * decides parent-vs-leaf is the same `deps` instance orchestration snapshots
 * from.
 *
 * Returns true when the issue is a parent (orchestration ran or was attempted);
 * false when it is a leaf and the caller should open it directly.
 */
async function orchestrateIfParent(repoInfo: RepoInfo, deps: OrchestrationDeps, issueNumber: number): Promise<boolean> {
	if ((await safeListSubIssues(deps, issueNumber)).length === 0) return false;

	const launchWorkPi = buildOrchestrationLauncher(issueNumber, repoInfo.root);
	try {
		const outcome = await startOrchestration(issueNumber, repoInfo.root, deps, launchWorkPi);
		console.log(outcome.message);
		if (outcome.kind === "no-children") process.exitCode = 0;
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
	return true;
}

/**
 * Open a single issue by number (`/issue <number>`; issue #71 + leaf-issue fix).
 *
 * Parent (has sub-issues) → orchestrate its sub-issues; leaf → open the issue's
 * worktree directly (worktree + Work Pi). Previously the bare numeric CLI arg
 * was hardwired to orchestrate-only, so `/issue <number>` printed "nothing to
 * orchestrate" and opened nothing for leaf issues.
 */
async function runOpen(issueNumber: number): Promise<void> {
	const repoInfo = getRepoInfo();
	if (!repoInfo) { console.error("Not in git repo."); process.exitCode = 1; return; }

	// One deps instance is reused for the parent/leaf check and for orchestration.
	const deps = createOrchestrationDeps({ remote: repoInfo.remote, repoRoot: repoInfo.root });
	if (await orchestrateIfParent(repoInfo, deps, issueNumber)) return;

	// Leaf issue → open directly: dependency/label gate, then worktree + Work Pi.
	const [dependencyStatus, labels] = await Promise.all([
		getIssueDependencyStatus(repoInfo.remote, issueNumber),
		getIssueLabels(repoInfo.remote, issueNumber).catch(() => []),
	]);
	if (!ensureIssueCanStart(issueNumber, { ...dependencyStatus, labels })) return;

	const existing = listExistingWorktrees(repoInfo.root).find((wt) => wt.branch === issueBranch(issueNumber));
	const { skipped } = await bulkLaunchIssues(
		[{ issueNumber, hasWorktree: Boolean(existing), worktreePath: existing?.path, labels }],
		createBulkLaunchDeps(repoInfo),
	);
	if (skipped.length > 0) {
		console.error(`Could not open #${issueNumber}: ${skipped[0].reason}`);
		process.exitCode = 1;
	}
}

/**
 * Loop hooks for the standalone CLI autopilot run. Unlike the Main Pi extension
 * loop, these timers stay ref'd so `mekann-issue autopilot` cannot exit before
 * the supervisor reaches a terminal state.
 */
function createAutopilotCliHooks(): AutopilotLoopHooks {
	return {
		sleep(ms: number): Promise<void> {
			return new Promise((resolve) => {
				setTimeout(() => resolve(), ms);
			});
		},
		shouldStop: () => false,
		now: () => Date.now(),
		notify: (message, level) => {
			if (level === "error" || level === "warning") console.error(message);
			else console.log(message);
		},
	};
}

/**
 * Run the autopilot supervisor as a standalone process (issue #112).
 * `mekann-issue autopilot`. Sequentially drives every ready-for-agent issue to
 * a PR until the candidate set is exhausted, then exits.
 */
async function runAutopilot(): Promise<void> {
	const repoInfo = getRepoInfo();
	if (!repoInfo) { console.error("Not in git repo."); process.exitCode = 1; return; }

	const deps = createAutopilotDeps({ remote: repoInfo.remote, repoRoot: repoInfo.root });
	const launchWorkPi = buildAutopilotLauncher(repoInfo.root);
	const hooks = createAutopilotCliHooks();

	try {
		const result = await runAutopilotSupervisor(deps, launchWorkPi, hooks, buildAutopilotConfig());
		// A hard stop (launch failure / repeated no-show) is a non-zero exit so CI
		// and scripts can detect it; natural completion and no-candidates are 0.
		if (result.kind === "stopped") process.exitCode = 1;
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

	// Resolve dependency status with bounded concurrency. Each issue triggers
	// one `gh api /repos/.../issues/N/dependencies/blocked_by` call (the only way
	// to read issue dependencies — no bulk/GraphQL endpoint exists). The old code
	// awaited these serially, so the TUI only opened after N sequential network
	// round-trips (the lag before the list appeared). Parallelising collapses
	// that, but a plain Promise.all would fire all ~100 calls at once and sit on
	// or exceed GitHub's secondary rate limit (~100 concurrent requests, shared
	// across REST/GraphQL, independent of auth). Capping at 10 keeps peak
	// in-flight well under the limit while still collapsing N serial round-trips
	// into ⌈N/10⌉ batches. mapWithConcurrency preserves input order, so the
	// displayed list order is unchanged.
	const DEPENDENCY_FETCH_CONCURRENCY = 10;
	const issuesWithStatus: IssueWithStatus[] = await mapWithConcurrency(
		issues,
		DEPENDENCY_FETCH_CONCURRENCY,
		async (issue): Promise<IssueWithStatus> => {
			const issueWithDependencies = await addDependencyStatus(repoInfo.remote, issue);
			return {
				...issueWithDependencies,
				hasWorktree: existingBranches.has(issueBranch(issue.number)),
				worktreePath: existing.find((wt) => wt.branch === issueBranch(issue.number))?.path,
			};
		},
	);

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
			// parent PRD/epic. A bulk-selected batch always opens each issue
			// directly. Shares the parent/leaf decision with `/issue <number>`
			// via orchestrateIfParent (issue #71).
			if (toOpen.length === 1) {
				const issue = toOpen[0];
				const deps = createOrchestrationDeps({ remote: repoInfo.remote, repoRoot: repoInfo.root });
				if (await orchestrateIfParent(repoInfo, deps, issue.number)) {
					process.exit(process.exitCode ?? 0);
					return;
				}
			}

			// Direct launch path: one issue (length-1 array) or many (bulk).
			const requests = toOpen.map((issue) => ({
				issueNumber: issue.number,
				hasWorktree: issue.hasWorktree,
				worktreePath: issue.worktreePath,
				labels: issue.labels,
			}));
			// bulkLaunchIssues never throws on issue-level failures: a failing issue
			// (worktree create or Pi launch) is reported in `skipped` and the rest
			// still launch (issue #68). Surface the skip list, then exit non-zero
			// only when nothing opened at all.
			const { skipped } = await bulkLaunchIssues(requests, createBulkLaunchDeps(repoInfo));
			if (skipped.length > 0) {
				console.error("Some issues could not be opened:");
				for (const skip of skipped) {
					console.error(`  #${skip.issueNumber}: ${skip.reason}`);
				}
			}
			const launchedCount = requests.length - skipped.length;
			process.exit(launchedCount > 0 ? 0 : 1);
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
		async launchPiSession(issueNumber: number, worktreePath: string, labels: string[]): Promise<void> {
			const { model, thinking } = resolveIssueWorkPiModel();
			await launchPiSessionInKittySplit({
				cwd: worktreePath,
				title: `Issue #${issueNumber}`,
				nodeBin: process.env.MEKANN_NODE_BIN,
				appendSystemPrompt: buildIssueSessionSystemPrompt(issueNumber, labels),
				initialMessage: buildIssueSessionInitialMessage(issueNumber, labels),
				model,
				thinking,
				hold: process.env.MEKANN_ISSUE_DEBUG === "1",
			});
		},
	};
}

function ensureIssueCanStart(issueNumber: number, dependencyStatus: IssueDependencyStatus & { labels?: string[] }): boolean {
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

	const labels = dependencyStatus.labels ?? [];
	if (!labels.includes("ready-for-agent") && !labels.includes("ready-for-human")) {
		console.error(`Issue #${issueNumber} cannot be started because it has neither the ready-for-agent nor the ready-for-human label.`);
		console.error("ready-for-agent opens an implementation worktree; ready-for-human opens an Agreement-phase worktree. Ask a human to triage it first.");
		process.exitCode = 1;
		return false;
	}

	return true;
}

void main().catch((error) => {
	console.error(error instanceof Error ? error.stack ?? error.message : String(error));
	process.exitCode = 1;
});
