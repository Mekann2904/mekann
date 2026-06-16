/**
 * orchestration/autopilot/deps.ts — production {@link AutopilotDeps} wiring.
 *
 * Adapts the gh CLI (ready-for-agent issues, blocked_by, PR existence, label
 * existence), local git worktrees, and Kitty panes into the narrow dependency
 * interface the supervisor consumes. Mirrors `orchestration/deps.ts`; failures
 * propagate as exceptions except where a safe-side default is documented.
 */

import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { KittyControl } from "../../../terminal/kitty/control.js";
import { getIssueDependencyStatus } from "../../github.js";
import { issueBranch, listExistingWorktrees } from "../../worktree.js";
import type { AutopilotDeps, AutopilotChildBrief } from "./collector.js";

const execFile = promisify(execFileCb);

interface RawLabelledIssue {
	number: number;
	title?: string;
	url?: string;
	labels?: Array<string | { name?: string }>;
}

async function ghJson<T>(args: string[], timeout: number): Promise<T> {
	const { stdout } = await execFile("gh", args, { timeout });
	return JSON.parse(String(stdout)) as T;
}

export interface AutopilotDepsConfig {
	/** GitHub remote in owner/repo form. */
	remote: string;
	/** Local repo root for worktree checks. */
	repoRoot: string;
	/** Optional KittyControl injection (defaults to a new instance). */
	kitty?: KittyControl;
}

function normalizeLabels(raw: RawLabelledIssue["labels"]): string[] {
	return (raw ?? [])
		.map((label) => (typeof label === "string" ? label : label.name ?? ""))
		.filter(Boolean)
		.map((label) => label.toLowerCase());
}

/**
 * Build production autopilot dependencies. Each adapter is a thin wrapper;
 * failures propagate as exceptions so the caller can surface them.
 */
export function createAutopilotDeps(config: AutopilotDepsConfig): AutopilotDeps {
	const kitty = config.kitty ?? new KittyControl();
	const remote = config.remote;

	return {
		async listReadyForAgentIssues(): Promise<AutopilotChildBrief[]> {
			const issues = await ghJson<RawLabelledIssue[]>(
				[
					"issue", "list",
					"--repo", remote,
					"--state", "open",
					"--label", "ready-for-agent",
					"--limit", "100",
					"--json", "number,title,labels,url",
				],
				15000,
			);
			return issues
				.filter((issue): issue is RawLabelledIssue & { number: number } => typeof issue.number === "number")
				.map((issue) => ({
					number: issue.number,
					title: issue.title ?? `#${issue.number}`,
					url: issue.url ?? `https://github.com/${remote}/issues/${issue.number}`,
					labels: normalizeLabels(issue.labels),
				}));
		},

		async getDependencyStatus(childNumber: number) {
			const status = await getIssueDependencyStatus(remote, childNumber);
			if (status.error) throw new Error(`Dependency check failed for #${childNumber}: ${status.error}`);
			return { openBlockers: status.openBlockers.map((blocker) => blocker.number) };
		},

		async getPrExists(childNumber: number): Promise<boolean> {
			const branch = issueBranch(childNumber);
			try {
				const prs = await ghJson<{ number: number }[]>(
					["pr", "list", "--repo", remote, "--head", branch, "--state", "all", "--json", "number", "--limit", "5"],
					15000,
				);
				return prs.length > 0;
			} catch {
				// gh pr list errors when there are no matches on some versions; treat as none.
				return false;
			}
		},

		hasWorktree(childNumber: number): boolean {
			const branch = issueBranch(childNumber);
			return listExistingWorktrees(config.repoRoot).some((worktree) => worktree.branch === branch);
		},

		async hasActiveWorkPi(childNumber: number): Promise<boolean> {
			return kitty.hasIssuePiPane(childNumber);
		},

		async labelExists(name: string): Promise<boolean> {
			try {
				await execFile("gh", ["label", "view", name, "--repo", remote], { timeout: 10000 });
				return true;
			} catch {
				return false;
			}
		},
	};
}
