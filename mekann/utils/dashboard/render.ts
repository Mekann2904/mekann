/**
 * Plain-text dashboard rendering for CLI output.
 */

import { contributionText, box, rowBox, padEnd } from "./layout.js";
import { truncatePlain, visibleWidth, dashboardTextColor } from "./terminal.js";
import { resolveDashboardConfig } from "./config.js";
import type { MekannDashboardConfig } from "../../config.js";
import type { DashboardRenderModel } from "./view-model-assembler.js";
import { formatCurrentRepoLine } from "./view-model.js";

export { dashboardTextColor };

export function renderDashboardText(
	source: DashboardRenderModel,
	width = process.stdout.columns || 120,
	layout: MekannDashboardConfig = resolveDashboardConfig(),
): string {
	const { vm, images } = source;
	const w = Math.max(layout.widthMin, Math.min(width, layout.widthMax));
	const profileIndent = images.avatar
		? " ".repeat(images.avatar.columns + 4)
		: "";
	const profile = vm.profile.ok
		? [
				`${profileIndent}@${vm.profile.profile.login}${vm.profile.profile.name ? ` · ${vm.profile.profile.name}` : ""}`,
				`${profileIndent}${vm.profile.profile.bio ?? ""}`,
				vm.profile.profile.location
					? `${profileIndent}⌖ ${vm.profile.profile.location}`
					: "",
				`${profileIndent}${vm.profile.profile.url ?? ""}`,
			].filter(Boolean)
		: [`GitHub profile error`, truncatePlain(vm.profile.error, w - 8)];

	const currentRepo = [formatCurrentRepoLine(vm.currentRepo)];
	const graph =
		vm.contributionGraph.status === "ready" &&
		vm.contributionGraph.data.length
			? contributionText(vm.contributionGraph.data)
			: [
					`GitHub activity error: ${vm.contributionGraph.status === "error" ? vm.contributionGraph.message : "unavailable"}`,
				];
	const activity =
		vm.activitySummary.status === "ready"
			? [
					`Contributions this week   ${vm.activitySummary.data.contributionsThisWeek}`,
					`Contributions this month  ${vm.activitySummary.data.contributionsThisMonth}`,
					`Active days this year     ${vm.activitySummary.data.activeDaysThisYear}`,
					`Pull requests             ${vm.activitySummary.data.pullRequests}`,
					`Issues opened             ${vm.activitySummary.data.issuesOpened}`,
					`Reviews                   ${vm.activitySummary.data.reviews}`,
				]
			: [
					`GitHub activity error: ${vm.activitySummary.status === "error" ? vm.activitySummary.message : "unavailable"}`,
				];
	const codexMsg =
		vm.codexUsage.status === "ready"
			? vm.codexUsage.data
			: vm.codexUsage.status === "loading"
				? "Codex usage loading..."
				: vm.codexUsage.message;
	const codex = [codexMsg, "Detailed Pi Usage tab: coming next"];

	return [
		titleLine(w),
		...box({ title: "PROFILE", lines: profile, width: w }),
		...box({
			title: "CONTRIBUTION GRAPH",
			lines: graph,
			width: w,
		}),
		...rowBox(
			[
				{
					title: "CURRENT REPO",
					lines: currentRepo,
					width: Math.floor((w - 2) / 2),
					height: 8,
				},
				{
					title: "ACTIVITY SUMMARY",
					lines: activity,
					width: Math.ceil((w - 2) / 2),
					height: 8,
				},
			],
			"  ",
		),
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
