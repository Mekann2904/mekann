#!/usr/bin/env bun
/**
 * mekann-issue — Issue worktree management CLI.
 *
 * Interactive mode: OpenTUI issue list → create worktree → launch pi in Kitty split
 * Direct mode: --issue N → create worktree and print its path
 * Cleanup: remove worktrees whose issues are closed
 */

import { parseIssueArgs } from "./args.js";
import { addDependencyStatus, listOpenIssues, type IssueDependencyStatus, type IssueWithStatus, getIssueStatus, getIssueDependencyStatus } from "./github.js";
import { getRepoInfo, createWorktree, removeWorktree, worktreeDir, listExistingWorktrees, issueBranch, parseIssueNumberFromBranch, type WorktreeInfo } from "./worktree.js";
import { mountIssueList } from "./app.js";
import { launchPiSessionInKittySplit } from "../terminal/pi-session.js";

function buildIssueSessionSystemPrompt(issueNumber: number): string {
	return [
		`You are working in an issue worktree for GitHub issue #${issueNumber}.`,
		"When the user asks you to implement or fix the issue, complete the implementation in this session, then immediately run the review_fixer tool before any commit, push, or PR creation.",
		"The required workflow is: user instruction → implement/fix → run review_fixer → inspect and report the review_fixer result to the user.",
		"Do not merely recommend review_fixer after implementation; invoke it yourself unless the issue is blocked or the user explicitly forbids it.",
	].join("\n");
}

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
		onSelect: async (issue: IssueWithStatus) => {
			if (!ensureIssueCanStart(issue.number, issue)) return;

			const branch = issueBranch(issue.number);
			const dir = worktreeDir(repoInfo.root, branch);

			let wtPath: string;
			if (issue.hasWorktree && issue.worktreePath) {
				wtPath = issue.worktreePath;
			} else {
				try {
					const wt = createWorktree(repoInfo.root, branch, dir);
					wtPath = wt.path;
				} catch (err) {
					console.error(`Failed to create worktree: ${(err as Error).message}`);
					renderer.destroy();
					process.exit(1);
					return;
				}
			}

			renderer.destroy();
			await launchPiSessionInKittySplit({
				cwd: wtPath,
				title: `Issue #${issue.number}`,
				nodeBin: process.env.MEKANN_NODE_BIN,
				appendSystemPrompt: buildIssueSessionSystemPrompt(issue.number),
				hold: process.env.MEKANN_ISSUE_DEBUG === "1",
			});
			process.exit(0);
		},
		onCancel: () => {
			renderer.destroy();
			process.exit(0);
		},
	});
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
