import React, { createElement as h } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import type { DashboardViewModel } from "./view-model.js";
import { formatCurrentRepoLine } from "./view-model.js";

const GREEN = "#79f28f";
const DIM = "#8fa99a";

export function DashboardApp({ vm }: { vm: DashboardViewModel }): React.ReactElement {
	const { width, height } = useTerminalDimensions();
	const compact = width < 110;
	const graphHeight = Math.max(8, Math.min(12, Math.floor(height * 0.16)));
	const profileHeight = vm.avatar?.ok ? 10 : 7;
	useKeyboard((key) => {
		if (key.name === "q" || key.name === "escape") process.exit(0);
	});

	return h("box", { style: { width: "100%", height: "100%", flexDirection: "column", padding: 1, gap: 1 } },
		h("box", { style: { height: 1, flexDirection: "row", justifyContent: "space-between" } },
			h("text", { fg: GREEN }, "● ● ●   ◉ GitHub Dashboard"),
			h("text", { fg: GREEN }, "[ OpenTUI ]"),
		),
		h(ProfileCard, { vm, height: profileHeight }),
		h(ContributionCard, { vm, height: graphHeight }),
		compact
			? h("box", { style: { flexDirection: "column", gap: 1, height: 14 } },
				h(CurrentRepoCard, { vm }),
				h(ActivityCard, { vm }),
			)
			: h("box", { style: { flexDirection: "row", gap: 2, height: 8 } },
				h(CurrentRepoCard, { vm }),
				h(ActivityCard, { vm }),
			),
		h(CodexCard, { vm }),
		h("box", { style: { height: 1, flexDirection: "row", justifyContent: "flex-end" } },
			h("text", { fg: GREEN }, "q Quit    r Refresh    /dashboard"),
		),
	);
}

function ProfileCard({ vm, height }: { vm: DashboardViewModel; height: number }): React.ReactElement {
	const lines = vm.profile.ok ? [
		`@${vm.profile.profile.login}${vm.profile.profile.name ? ` · ${vm.profile.profile.name}` : ""}`,
		vm.profile.profile.bio ?? "",
		vm.profile.profile.location ? `⌖ ${vm.profile.profile.location}` : "",
		vm.profile.profile.url ?? "",
		vm.avatar && !vm.avatar.ok ? `avatar: ${vm.avatar.error}` : "",
	].filter(Boolean) : ["GitHub profile error", vm.profile.error];
	return h(Panel, { title: "PROFILE", height },
		...lines.map((line, index) => h("text", { key: index, fg: index === 0 ? GREEN : DIM, style: { marginLeft: vm.avatar?.ok ? 22 : 0 } }, line)),
	);
}

function ContributionCard({ vm, height }: { vm: DashboardViewModel; height: number }): React.ReactElement {
	const lines = vm.contributionImage?.ok
		? ["", "", "", "", "", "", ""]
		: vm.contributionGraph.days?.length ? contributionLines(vm.contributionGraph.days) : [`GitHub activity error: ${vm.contributionGraph.message}`];
	return h(Panel, { title: "CONTRIBUTION GRAPH", height },
		...lines.map((line, index) => h("text", { key: index, fg: index === 0 ? DIM : GREEN }, line)),
	);
}

function CurrentRepoCard({ vm }: { vm: DashboardViewModel }): React.ReactElement {
	return h(Panel, { title: "CURRENT REPO", flex: 1 },
		h("text", { fg: GREEN }, formatCurrentRepoLine(vm.currentRepo)),
	);
}

function ActivityCard({ vm }: { vm: DashboardViewModel }): React.ReactElement {
	const summary = vm.activitySummary.summary;
	const lines = summary ? [
		["Contributions this week", summary.contributionsThisWeek],
		["Contributions this month", summary.contributionsThisMonth],
		["Active days this year", summary.activeDaysThisYear],
		["Pull requests", summary.pullRequests],
		["Issues opened", summary.issuesOpened],
		["Reviews", summary.reviews],
	].map(([label, value]) => `${String(label).padEnd(28)} ${value}`) : [`GitHub activity error: ${vm.activitySummary.message}`];
	return h(Panel, { title: "ACTIVITY SUMMARY", flex: 1 },
		...lines.map((line, index) => h("text", { key: index, fg: GREEN }, line)),
	);
}

function CodexCard({ vm }: { vm: DashboardViewModel }): React.ReactElement {
	return h(Panel, { title: "CODEX USAGE", height: 5 },
		h("text", { fg: GREEN }, vm.codexUsage.message),
		h("text", { fg: DIM }, "Detailed Pi Usage tab: coming next"),
	);
}

function Panel({ title, height, flex, children }: { title: string; height?: number; flex?: number; children?: React.ReactNode }): React.ReactElement {
	return h("box", {
		title,
		border: true,
		borderColor: GREEN,
		style: { height, flex, paddingLeft: 1, paddingRight: 1, flexDirection: "column" },
	}, children);
}

function contributionLines(days: Array<{ date: string; level: string }>): string[] {
	const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
	const recent = days.slice(-154);
	const rows = [0, 1, 2, 3, 4, 5, 6].map(() => "");
	let header = "";
	for (let i = 0; i < recent.length; i += 7) {
		const date = new Date(`${recent[i]?.date ?? ""}T00:00:00`);
		header += i % 28 === 0 && !Number.isNaN(date.getTime()) ? `${months[date.getMonth()]} `.padEnd(4) : " ";
		for (let d = 0; d < 7; d++) rows[d] += levelBlock(recent[i + d]?.level);
	}
	return [header.trimEnd(), `Mon ${rows[1]}`, `Wed ${rows[3]}`, `Fri ${rows[5]}`, "Less ·░▒▓█ More"];
}

function levelBlock(level: string | undefined): string {
	if (level === "FOURTH_QUARTILE") return "█";
	if (level === "THIRD_QUARTILE") return "▓";
	if (level === "SECOND_QUARTILE") return "▒";
	if (level === "FIRST_QUARTILE") return "░";
	return "·";
}
