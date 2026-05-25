import type { CurrentRepoSummary } from "./current-repo.js";
import type { ContributionDay, GitHubActivitySummary, GitHubProfileResult } from "./github.js";

// ── image result (shared between CLI and Pi) ──────────────────────────
export type ImageResult =
	| { ok: true; path: string; columns: number; rows: number }
	| { ok: false; error: string };

// ── shared state types ────────────────────────────────────────────────
export type ContributionGraphState = { status: "placeholder" | "loading" | "error"; message: string; days?: ContributionDay[] };
export type ActivitySummaryState = { status: "placeholder" | "loading" | "error" | "ready"; message: string; summary?: GitHubActivitySummary };
export type CodexUsageState = { status: "placeholder" | "loading" | "error"; message: string };

// ── base ViewModel (shared by CLI and Pi) ─────────────────────────────
export type DashboardViewModel = {
	profile: GitHubProfileResult;
	currentRepo: CurrentRepoSummary;
	contributionGraph: ContributionGraphState;
	activitySummary: ActivitySummaryState;
	codexUsage: CodexUsageState;
};

// ── CLI-only ViewModel (extends base with image results) ──────────────
export type CliDashboardViewModel = DashboardViewModel & {
	avatar?: ImageResult;
	contributionImage?: ImageResult;
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
