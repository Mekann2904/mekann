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

type RawGitHubIssue = { number: number; title: string; labels?: Array<string | { name?: string }>; url: string; body?: string };

function normalizeIssue(issue: RawGitHubIssue): GitHubIssue {
	return {
		number: issue.number,
		title: issue.title,
		labels: (issue.labels ?? []).map((label) => typeof label === "string" ? label : label.name ?? "").filter(Boolean),
		url: issue.url,
		body: issue.body ?? "",
	};
}

async function ghJson<T>(args: string[], options: { timeout: number }): Promise<T> {
	const { execFile } = await import("node:child_process");
	return new Promise((resolve, reject) => {
		execFile("gh", args, options, (error, stdout) => {
			if (error) reject(error);
			else {
				try { resolve(JSON.parse(String(stdout)) as T); }
				catch (parseError) { reject(parseError); }
			}
		});
	});
}

async function listIssues(remote: string, options: { limit: number; search?: string }): Promise<GitHubIssue[]> {
	const args = [
		"issue", "list",
		"--repo", remote,
		"--state", "open",
		"--limit", String(options.limit),
		"--json", "number,title,labels,url,body",
	];
	if (options.search) args.splice(6, 0, "--search", options.search);
	const issues = await ghJson<RawGitHubIssue[]>(args, { timeout: 15000 });
	return issues.map(normalizeIssue);
}

/**
 * List open GitHub issues using `gh` CLI.
 */
export async function listOpenIssues(remote: string): Promise<GitHubIssue[]> {
	try {
		return await listIssues(remote, { limit: 100 });
	} catch (err) {
		throw new Error(`Failed to list GitHub issues for ${remote}: ${(err as Error).message}`);
	}
}

/**
 * Get whether an issue is closed. Cleanup removes worktrees for closed issues.
 */
export type IssueCleanupStatus = "closed" | "open" | "error";

export async function getIssueLabels(remote: string, issueNumber: number): Promise<string[]> {
	const issue = await ghJson<RawGitHubIssue>([
		"issue", "view", String(issueNumber),
		"--repo", remote,
		"--json", "number,title,labels,url,body",
	], { timeout: 10000 });
	return normalizeIssue(issue).labels;
}

/**
 * Whether a `gh` CLI failure looks like a transient OAuth-authentication error.
 *
 * `gh` stores its OAuth token in the OS keychain and refreshes it on expiry. The
 * refresh token rotates, so when several `gh` processes fire concurrently (as
 * the autopilot snapshot does — one `gh api` per candidate) a sibling process
 * completing a refresh mid-flight invalidates this process's token, surfacing as
 * `gh: Bad credentials (HTTP 401)`. The race self-heals within a couple of
 * seconds once some process finishes the refresh, so it is safe — and necessary
 * — to retry rather than fail the whole snapshot. Non-auth failures (404, 403
 * rate-limit, ENOENT, network) are left to the caller's safe-side handling.
 */
export function isTransientGhAuthError(error: unknown): boolean {
	// `gh`/`execFile` always reject with an `Error`, but accept any thrown
	// value defensively: a string, an Error, or an object carrying `.message`.
	const message =
		error != null && typeof error === "object" && typeof (error as { message?: unknown }).message === "string"
			? (error as { message: string }).message
			: String(error ?? "");
	return /\b401\b|Bad credentials|unauthori[sz]ed/i.test(message);
}

/** Max retries (after the first attempt) when `gh` hits a transient auth error. */
const TRANSIENT_AUTH_MAX_RETRIES = 2;
/** Base delay (ms) between transient-auth retries; grows per attempt. */
const TRANSIENT_AUTH_BASE_DELAY_MS = 1500;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getIssueDependencyStatus(remote: string, issueNumber: number): Promise<IssueDependencyStatus> {
	const { execFile } = await import("node:child_process");
	const { promisify } = await import("node:util");
	const execFileAsync = promisify(execFile);

	const args = ["api", `/repos/${remote}/issues/${issueNumber}/dependencies/blocked_by`];

	let lastError: unknown;
	for (let attempt = 0; attempt <= TRANSIENT_AUTH_MAX_RETRIES; attempt++) {
		try {
			const { stdout } = await execFileAsync("gh", args, { timeout: 10000 });

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
			lastError = err;
			// Absorb the OAuth-refresh race with a bounded retry instead of failing
			// the snapshot; see isTransientGhAuthError. Other errors break out so
			// the safe-side error result below still applies.
			if (isTransientGhAuthError(err) && attempt < TRANSIENT_AUTH_MAX_RETRIES) {
				await sleep(TRANSIENT_AUTH_BASE_DELAY_MS * (attempt + 1));
				continue;
			}
			break;
		}
	}

	return {
		blockedBy: [],
		openBlockers: [],
		error: `Failed to read issue dependencies: ${(lastError as Error)?.message ?? String(lastError)}`,
	};
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

export async function searchOpenIssues(remote: string, query: string): Promise<GitHubIssue[]> {
	try {
		return await listIssues(remote, { limit: 10, search: query });
	} catch (err) {
		throw new Error(`Failed to search GitHub issues for ${remote}: ${(err as Error).message}`);
	}
}

export async function createIssue(remote: string, title: string, body: string): Promise<IssueCreateResult> {
	try {
		return await ghJson<IssueCreateResult>([
			"issue", "create",
			"--repo", remote,
			"--title", title,
			"--body", body,
			"--json", "number,title,url",
		], { timeout: 15000 });
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
