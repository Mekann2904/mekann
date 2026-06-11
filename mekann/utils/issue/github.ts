export interface GitHubIssue {
	number: number;
	title: string;
	labels: string[];
	url: string;
	body: string;
}

export interface IssueDependency {
	number: number;
	title: string;
	state: "open" | "closed" | "unknown";
	url?: string;
}

export interface IssueDependencyStatus {
	blockedBy: IssueDependency[];
	openBlockers: IssueDependency[];
	error?: string;
}

export interface IssueWithStatus extends GitHubIssue, IssueDependencyStatus {
	hasWorktree: boolean;
	worktreePath?: string;
}

export interface IssueCreateResult {
	number: number;
	title: string;
	url: string;
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

export async function getIssueDependencyStatus(remote: string, issueNumber: number): Promise<IssueDependencyStatus> {
	const { execFile } = await import("node:child_process");
	const { promisify } = await import("node:util");
	const execFileAsync = promisify(execFile);

	try {
		const { stdout } = await execFileAsync("gh", [
			"api",
			`/repos/${remote}/issues/${issueNumber}/dependencies/blocked_by`,
		], { timeout: 10000 });

		const dependencies = JSON.parse(stdout);
		const blockedBy: IssueDependency[] = (Array.isArray(dependencies) ? dependencies : []).map((issue: any) => ({
			number: issue.number,
			title: issue.title ?? "",
			state: normalizeIssueState(issue.state),
			url: issue.html_url ?? issue.url,
		})).filter((issue) => Number.isInteger(issue.number));

		return {
			blockedBy,
			openBlockers: blockedBy.filter((issue) => issue.state === "open" || issue.state === "unknown"),
		};
	} catch (err) {
		return {
			blockedBy: [],
			openBlockers: [],
			error: `Failed to read issue dependencies: ${(err as Error).message}`,
		};
	}
}

export async function addDependencyStatus(remote: string, issue: GitHubIssue): Promise<GitHubIssue & IssueDependencyStatus> {
	const dependencyStatus = await getIssueDependencyStatus(remote, issue.number);
	return { ...issue, ...dependencyStatus };
}

function normalizeIssueState(state: unknown): IssueDependency["state"] {
	if (typeof state !== "string") return "unknown";
	const lower = state.toLowerCase();
	if (lower === "open") return "open";
	if (lower === "closed") return "closed";
	return "unknown";
}

function execFileText(command: string, args: string[], options: { timeout: number }): Promise<string> {
	return import("node:child_process").then(({ execFile }) => new Promise((resolve, reject) => {
		execFile(command, args, options, (error, stdout) => {
			if (error) reject(error);
			else resolve(String(stdout));
		});
	}));
}

export async function searchOpenIssues(remote: string, query: string): Promise<GitHubIssue[]> {
	try {
		const stdout = await execFileText("gh", [
			"issue", "list",
			"--repo", remote,
			"--state", "open",
			"--search", query,
			"--limit", "10",
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
		throw new Error(`Failed to search GitHub issues for ${remote}: ${(err as Error).message}`);
	}
}

export async function createIssue(remote: string, title: string, body: string): Promise<IssueCreateResult> {
	try {
		const stdout = await execFileText("gh", [
			"issue", "create",
			"--repo", remote,
			"--title", title,
			"--body", body,
			"--json", "number,title,url",
		], { timeout: 15000 });
		return JSON.parse(stdout) as IssueCreateResult;
	} catch (err) {
		throw new Error(`Failed to create GitHub issue for ${remote}: ${(err as Error).message}`);
	}
}

/**
 * Get whether an issue is closed. Cleanup removes worktrees for closed issues.
 */
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
