/**
 * Plain-text dashboard rendering for CLI output.
 */

import { contributionText, box, rowBox, padEnd, type BoxConfig } from "./layout.js";
import { truncatePlain, visibleWidth, dashboardTextColor } from "./terminal.js";
import type { DashboardViewModel } from "./view-model.js";
import { formatCurrentRepoLine } from "./view-model.js";

export { dashboardTextColor };

export function renderDashboardText(vm: DashboardViewModel, width = process.stdout.columns || 120): string {
	const w = Math.max(20, Math.min(width, 140));
	const profileIndent = vm.avatar?.ok ? " ".repeat(vm.avatar.columns + 4) : "";
	const profile = vm.profile.ok
		? [
			`${profileIndent}@${vm.profile.profile.login}${vm.profile.profile.name ? ` · ${vm.profile.profile.name}` : ""}`,
			`${profileIndent}${vm.profile.profile.bio ?? ""}`,
			vm.profile.profile.location ? `${profileIndent}⌖ ${vm.profile.profile.location}` : "",
			`${profileIndent}${vm.profile.profile.url ?? ""}`,
			vm.avatar && !vm.avatar.ok ? `avatar: ${vm.avatar.error}` : "",
		].filter(Boolean)
		: [`GitHub profile error`, truncatePlain(vm.profile.error, w - 8)];

	const currentRepo = [formatCurrentRepoLine(vm.currentRepo)];
	const graph = vm.contributionGraph.days?.length
		? contributionText(vm.contributionGraph.days)
		: [`GitHub activity error: ${vm.contributionGraph.message}`];
	const activity = vm.activitySummary.summary ? [
		`Contributions this week   ${vm.activitySummary.summary.contributionsThisWeek}`,
		`Contributions this month  ${vm.activitySummary.summary.contributionsThisMonth}`,
		`Active days this year     ${vm.activitySummary.summary.activeDaysThisYear}`,
		`Pull requests             ${vm.activitySummary.summary.pullRequests}`,
		`Issues opened             ${vm.activitySummary.summary.issuesOpened}`,
		`Reviews                   ${vm.activitySummary.summary.reviews}`,
	] : [`GitHub activity error: ${vm.activitySummary.message}`];
	const codex = [vm.codexUsage.message, "Detailed Pi Usage tab: coming next"];

	return [
		titleLine(w),
		...box({ title: "PROFILE", lines: profile, width: w }),
		...box({ title: "CONTRIBUTION GRAPH", lines: graph, width: w }),
		...rowBox([
			{ title: "CURRENT REPO", lines: currentRepo, width: Math.floor((w - 2) / 2), height: 8 },
			{ title: "ACTIVITY SUMMARY", lines: activity, width: Math.ceil((w - 2) / 2), height: 8 },
		], "  "),
		...box({ title: "CODEX USAGE", lines: codex, width: w }),
		footerLine(w),
	].join("\n");
}

function titleLine(width: number): string {
	const left = "● ● ●   ◉ GitHub Dashboard";
	const right = "[ Pi TUI ]";
	return `${left}${" ".repeat(Math.max(1, width - visibleWidth(left) - visibleWidth(right)))}${right}`;
}

function footerLine(width: number): string {
	const text = "q Quit   r Refresh   /dashboard";
	return `└${"─".repeat(Math.max(0, width - 2 - visibleWidth(text)))} ${text}┘`;
}
