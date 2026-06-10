export interface GitHubIssue {
	number: number;
	title: string;
	labels: string[];
	url: string;
	body: string;
}

export interface IssueWithStatus extends GitHubIssue {
	hasWorktree: boolean;
	worktreePath?: string;
}

/**
 * List open GitHub issues using `gh` CLI.
 */
export async function listOpenIssues(remote: string): Promise<GitHubIssue[]> {
	const { execFile } = await import("node:child_process");
	const { promisify } = await import("node:util");
	const execFileAsync = promisify(execFile);

	try {
		const { stdout } = await execFileAsync("gh", [
			"issue", "list",
			"--repo", remote,
			"--state", "open",
			"--limit", "100",
			"--json", "number,title,labels,url,body",
		], { timeout: 15000 });

		const issues = JSON.parse(stdout);
		return issues.map((issue: any) => ({
			number: issue.number,
			title: issue.title,
			labels: (issue.labels ?? []).map((l: any) => typeof l === "string" ? l : l.name),
			url: issue.url,
			body: issue.body ?? "",
		}));
	} catch (err) {
		throw new Error(`Failed to list GitHub issues for ${remote}: ${(err as Error).message}`);
	}
}

/**
 * Get whether an issue is closed. Cleanup removes worktrees for closed issues.
 */
export type IssueCleanupStatus = "closed" | "open" | "error";

export async function getIssueStatus(remote: string, issueNumber: number): Promise<IssueCleanupStatus> {
	const { execFile } = await import("node:child_process");
	const { promisify } = await import("node:util");
	const execFileAsync = promisify(execFile);

	try {
		// Check if issue is closed
		const { stdout: issueJson } = await execFileAsync("gh", [
			"issue", "view", String(issueNumber),
			"--repo", remote,
			"--json", "state",
		], { timeout: 10000 });
		const issue = JSON.parse(issueJson);
		return issue.state === "CLOSED" ? "closed" : "open";
	} catch {
		return "error";
	}
}
