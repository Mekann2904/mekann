/**
 * Pure functions for parsing GitHub GraphQL responses.
 * No HTTP, no CLI calls — only data transformations.
 */

export type GitHubProfile = {
	login: string;
	name?: string;
	bio?: string;
	location?: string;
	url?: string;
	avatarUrl?: string;
};

export type ContributionDay = { date: string; count: number; level: string };

export type GitHubActivitySummary = {
	contributionsThisWeek: number;
	contributionsThisMonth: number;
	activeDaysThisYear: number;
	pullRequests: number;
	issuesOpened: number;
	reviews: number;
};

export type GitHubDashboardData = {
	profile: GitHubProfile;
	contributionDays: ContributionDay[];
	activity: GitHubActivitySummary;
};

export type GitHubProfileResult = { ok: true; profile: GitHubProfile } | { ok: false; error: string };
export type GitHubDashboardResult = { ok: true; data: GitHubDashboardData } | { ok: false; error: string };

export function parseGitHubViewer(value: unknown): GitHubProfile {
	const obj = value && typeof value === "object" ? value as Record<string, unknown> : {};
	const login = typeof obj.login === "string" && obj.login ? obj.login : "unknown";
	return {
		login,
		name: typeof obj.name === "string" ? obj.name : undefined,
		bio: typeof obj.bio === "string" ? obj.bio : undefined,
		location: typeof obj.location === "string" ? obj.location : undefined,
		url: typeof obj.url === "string" ? obj.url : undefined,
		avatarUrl: typeof obj.avatarUrl === "string" ? obj.avatarUrl : undefined,
	};
}

export function normalizeDashboardResponse(value: unknown, now = new Date()): GitHubDashboardData {
	const viewer = ((value as { data?: { viewer?: unknown } }).data?.viewer ?? {}) as Record<string, any>;
	const collection = viewer.contributionsCollection as Record<string, any> | undefined;
	const weeks = collection?.contributionCalendar?.weeks ?? [];
	const contributionDays: ContributionDay[] = [];
	for (const week of Array.isArray(weeks) ? weeks : []) {
		for (const day of Array.isArray(week.contributionDays) ? week.contributionDays : []) {
			contributionDays.push({
				date: String(day.date ?? ""),
				count: Number(day.contributionCount ?? 0),
				level: String(day.contributionLevel ?? "NONE"),
			});
		}
	}
	const today = localDateKey(now);
	const weekStart = startOfLocalWeek(now);
	const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
	const yearStart = new Date(now.getFullYear(), 0, 1);
	return {
		profile: parseGitHubViewer(viewer),
		contributionDays,
		activity: {
			contributionsThisWeek: sumDays(contributionDays, weekStart, today),
			contributionsThisMonth: sumDays(contributionDays, monthStart, today),
			activeDaysThisYear: contributionDays.filter((d) => d.count > 0 && d.date >= localDateKey(yearStart) && d.date <= today).length,
			pullRequests: sumContributionGroups(collection?.pullRequestContributionsByRepository),
			issuesOpened: sumContributionGroups(collection?.issueContributionsByRepository),
			reviews: sumContributionGroups(collection?.pullRequestReviewContributionsByRepository),
		},
	};
}

function sumContributionGroups(value: unknown): number {
	return (Array.isArray(value) ? value : []).reduce((sum, item: any) => sum + Number(item?.contributions?.totalCount ?? 0), 0);
}

function sumDays(days: ContributionDay[], from: Date, toKey: string): number {
	const fromKey = localDateKey(from);
	return days.filter((d) => d.date >= fromKey && d.date <= toKey).reduce((sum, d) => sum + d.count, 0);
}

function startOfLocalWeek(date: Date): Date {
	const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
	start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
	return start;
}

function localDateKey(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}
