import type { CurrentRepoSummary } from "./current-repo.js";
import type { ContributionDay, GitHubActivitySummary, GitHubProfileResult } from "./github.js";

// ── generic panel state ───────────────────────────────────────────────
export type Panel<T> =
	| { status: "ready"; data: T }
	| { status: "loading" }
	| { status: "error"; message: string }
	| { status: "placeholder"; message: string };

/** Extract data from a panel, or undefined if not ready. */
export function panelData<T>(panel: Panel<T>): T | undefined {
	return panel.status === "ready" ? panel.data : undefined;
}

/** Extract message from a panel (error or placeholder), or undefined. */
export function panelMessage(panel: Panel<unknown>): string | undefined {
	return (panel.status === "error" || panel.status === "placeholder") ? panel.message : undefined;
}

// ── ViewModel ─────────────────────────────────────────────────────────
export type DashboardViewModel = {
	profile: GitHubProfileResult;
	currentRepo: CurrentRepoSummary;
	contributionGraph: Panel<ContributionDay[]>;
	activitySummary: Panel<GitHubActivitySummary>;
	codexUsage: Panel<string>;
};

// ── formatting ────────────────────────────────────────────────────────
export function formatCurrentRepoLine(repo: CurrentRepoSummary): string {
	if (!repo.ok) return `Current repo error: ${repo.error}`;
	const aheadBehind = repo.aheadBehind.kind === "counts"
		? `↑${repo.aheadBehind.ahead} ↓${repo.aheadBehind.behind}`
		: "no upstream";
	const changes = `${repo.changes.staged} staged / ${repo.changes.unstaged} unstaged / ${repo.changes.untracked} untracked`;
	const commit = repo.latestCommit ? ` ${repo.latestCommit.hash} ${repo.latestCommit.subject}` : "";
	return `${repo.repoName} · ${repo.branch} · ${changes} · ${aheadBehind}${commit}`;
}
