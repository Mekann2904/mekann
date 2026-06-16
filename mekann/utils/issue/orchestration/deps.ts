/**
 * orchestration/deps.ts — production {@link OrchestrationDeps} wiring.
 *
 * Adapts gh CLI (sub-issues, blocked_by, PR merge status), local git worktrees,
 * and Kitty panes into the narrow dependency interface the orchestrator consumes.
 * All external access goes through here, so tests use fakes and never touch the
 * network, git, or kitty.
 *
 * Requires gh >= 2.94.0 for sub-issues JSON support (issue #71).
 */

import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { KittyControl } from "../../terminal/kitty/control.js";
import { getIssueDependencyStatus, getIssueLabels } from "../github.js";
import { issueBranch, listExistingWorktrees } from "../worktree.js";
import type { OrchestrationDeps, ChildBrief } from "./collector.js";

const execFile = promisify(execFileCb);

interface RawSubIssue {
	number: number;
	title?: string;
	url?: string;
	state?: string;
}

interface RawSubIssuesJson {
	subIssues?: { nodes?: RawSubIssue[] };
}

interface RawPr {
	number: number;
	state: string; // "OPEN" | "CLOSED" | "MERGED"
}

async function ghJson<T>(args: string[], timeout: number): Promise<T> {
	const { stdout } = await execFile("gh", args, { timeout });
	return JSON.parse(String(stdout)) as T;
}

export interface OrchestrationDepsConfig {
	/** GitHub remote in owner/repo form. */
	remote: string;
	/** Local repo root for worktree checks. */
	repoRoot: string;
	/** Optional KittyControl injection (defaults to a new instance). */
	kitty?: KittyControl;
}

/**
 * Build production orchestration dependencies. Each adapter is a thin wrapper;
 * failures propagate as exceptions so the caller can surface them, except where
 * a safe-side default is documented.
 */
export function createOrchestrationDeps(config: OrchestrationDepsConfig): OrchestrationDeps {
	const kitty = config.kitty ?? new KittyControl();
	const remote = config.remote;

	return {
		async listSubIssues(parentNumber: number): Promise<ChildBrief[]> {
			const json = await ghJson<RawSubIssuesJson>(
				["issue", "view", String(parentNumber), "--repo", remote, "--json", "subIssues"],
				15000,
			);
			const nodes = json.subIssues?.nodes ?? [];
			return nodes
				.filter((node): node is RawSubIssue & { number: number } => typeof node.number === "number")
				.map((node) => ({
					number: node.number,
					title: node.title ?? `#${node.number}`,
					url: node.url ?? `https://github.com/${remote}/issues/${node.number}`,
				}));
		},

		async getDependencyStatus(childNumber: number) {
			const status = await getIssueDependencyStatus(remote, childNumber);
			if (status.error) throw new Error(`Dependency check failed for #${childNumber}: ${status.error}`);
			return { openBlockers: status.openBlockers.map((blocker) => blocker.number) };
		},

		async getIssueLabels(childNumber: number): Promise<string[]> {
			try {
				return await getIssueLabels(remote, childNumber);
			} catch {
				// Safe fallback: without GitHub label truth, do not start the issue.
				return [];
			}
		},

		async getPrMergeStatus(childNumber: number) {
			const branch = issueBranch(childNumber);
			let prs: RawPr[] = [];
			try {
				prs = await ghJson<RawPr[]>(
					["pr", "list", "--repo", remote, "--head", branch, "--state", "all", "--json", "number,state", "--limit", "10"],
					15000,
				);
			} catch {
				// gh pr list errors when there are no matches on some versions; treat as none.
				prs = [];
			}
			const exists = prs.length > 0;
			const merged = prs.some((pr) => pr.state === "MERGED");
			return { merged, exists };
		},

		hasWorktree(childNumber: number): boolean {
			const branch = issueBranch(childNumber);
			return listExistingWorktrees(config.repoRoot).some((worktree) => worktree.branch === branch);
		},

		async hasActiveWorkPi(childNumber: number): Promise<boolean> {
			return kitty.hasIssuePiPane(childNumber);
		},
	};
}
