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
 * Get the status of an issue: is it closed? Is the branch merged?
 */
export type IssueCleanupStatus = "merged_and_closed" | "not_merged" | "not_closed" | "error";

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
		if (issue.state !== "CLOSED") return "not_closed";

		// Check if branch is merged
		const branch = `issue-${issueNumber}`;
		try {
			const { stdout } = await execFileAsync("git", [
				"branch", "--merged", "HEAD",
			], { timeout: 5000 });
			const mergedBranches = stdout.split("\n").map((b: string) => b.trim().replace(/^\*?\s*/, ""));
			if (!mergedBranches.includes(branch)) return "not_merged";
		} catch {
			return "not_merged";
		}

		return "merged_and_closed";
	} catch {
		return "error";
	}
}
