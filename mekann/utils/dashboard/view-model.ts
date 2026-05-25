import type { CurrentRepoSummary } from "./current-repo.js";
import type { ContributionDay, GitHubActivitySummary, GitHubProfileResult } from "./github.js";

export type DashboardViewModel = {
	profile: GitHubProfileResult;
	avatar?: { ok: true; path: string; columns: number; rows: number } | { ok: false; error: string };
	contributionImage?: { ok: true; path: string; columns: number; rows: number } | { ok: false; error: string };
	currentRepo: CurrentRepoSummary;
	contributionGraph: { status: "placeholder" | "loading" | "error"; message: string; days?: ContributionDay[] };
	activitySummary: { status: "placeholder" | "loading" | "error" | "ready"; message: string; summary?: GitHubActivitySummary };
	codexUsage: { status: "placeholder" | "loading" | "error"; message: string };
};

export function formatCurrentRepoLine(repo: CurrentRepoSummary): string {
	if (!repo.ok) return `Current repo error: ${repo.error}`;
	const aheadBehind = repo.aheadBehind.kind === "counts"
		? `↑${repo.aheadBehind.ahead} ↓${repo.aheadBehind.behind}`
		: "no upstream";
	const changes = `${repo.changes.staged} staged / ${repo.changes.unstaged} unstaged / ${repo.changes.untracked} untracked`;
	const commit = repo.latestCommit ? ` ${repo.latestCommit.hash} ${repo.latestCommit.subject}` : "";
	return `${repo.repoName} · ${repo.branch} · ${changes} · ${aheadBehind}${commit}`;
}
