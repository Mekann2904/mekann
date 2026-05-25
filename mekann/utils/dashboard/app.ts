import React, { createElement as h } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import type { DashboardViewModel } from "./view-model.js";
import { formatCurrentRepoLine } from "./view-model.js";

const GREEN = "#79f28f";
const MUTED = "#9ca3af";
const WHITE = "#e5ffe9";
const BLUE = "#8bd5ff";
const YELLOW = "#f4d35e";

export function DashboardApp({ vm }: { vm: DashboardViewModel }): React.ReactElement {
	const { width, height } = useTerminalDimensions();
	const compact = width < 112;
	const heroHeight = Math.max(vm.avatar?.ok ? vm.avatar.rows + 2 : 6, Math.floor(height * 0.18));
	const statsHeight = compact ? 8 : 4;
	const graphHeight = Math.max(vm.contributionImage?.ok ? vm.contributionImage.rows + 2 : 12, Math.min(18, Math.floor(height * 0.22)));
	const detailsHeight = compact ? 10 : 5;
	useKeyboard((key) => {
		if (key.name === "q" || key.name === "escape") process.exit(0);
	});

	return h("scrollbox", { focused: true, scrollY: true, scrollX: false, style: { width: "100%", height: "100%" } },
		h("box", { style: { width: "100%", flexDirection: "column", paddingLeft: 3, paddingRight: 3, paddingTop: 1, gap: 1 } },
			h(Hero, { vm, height: heroHeight }),
			h(StatsStrip, { vm, compact, height: statsHeight }),
			h(ContributionSection, { vm, height: graphHeight }),
			compact
				? h("box", { style: { flexDirection: "column", gap: 1, height: detailsHeight } }, h(CurrentRepo, { vm }), h(Codex, { vm }))
				: h("box", { style: { flexDirection: "row", gap: 6, height: detailsHeight } }, h(CurrentRepo, { vm }), h(Codex, { vm })),
			h(Footer),
		),
	);
}

function Hero({ vm, height }: { vm: DashboardViewModel; height: number }): React.ReactElement {
	const profile = vm.profile.ok ? vm.profile.profile : undefined;
	return h("box", { style: { height, flexDirection: "column", paddingLeft: vm.avatar?.ok ? vm.avatar.columns + 4 : 0, paddingTop: 1 } },
		h("text", { fg: GREEN }, profile ? `@${profile.login}` : "GitHub profile unavailable"),
		h("text", { fg: WHITE }, profile?.name ? profile.name : ""),
		h("text", { fg: MUTED }, profile?.bio ?? ""),
		h("text", { fg: MUTED }, profile?.location ? `⌖ ${profile.location}` : ""),
		h("text", { fg: BLUE }, profile?.url ?? (vm.profile.ok ? "" : vm.profile.error)),
	);
}

function StatsStrip({ vm, compact, height }: { vm: DashboardViewModel; compact: boolean; height: number }): React.ReactElement {
	const s = vm.activitySummary.summary;
	const stats = s ? [
		["This week", s.contributionsThisWeek, GREEN],
		["This month", s.contributionsThisMonth, GREEN],
		["Active days", s.activeDaysThisYear, BLUE],
		["Pull requests", s.pullRequests, YELLOW],
		["Issues", s.issuesOpened, WHITE],
		["Reviews", s.reviews, MUTED],
	] as const : [["GitHub", "unavailable", YELLOW]] as const;
	return h("box", { style: { height, flexDirection: compact ? "column" : "row", gap: 2 } },
		...stats.map(([label, value, color], index) => h("box", { key: index, style: { flex: compact ? undefined : 1, height: compact ? 1 : 4, flexDirection: "column" } },
			h("text", { fg: color }, String(value)),
			h("text", { fg: MUTED }, String(label)),
		)),
	);
}

function ContributionSection({ vm, height }: { vm: DashboardViewModel; height: number }): React.ReactElement {
	return h("box", { style: { height, flexDirection: "column" } },
		h("box", { style: { height: 1, flexDirection: "row", justifyContent: "space-between" } },
			h("text", { fg: WHITE }, "Contribution graph"),
			h("text", { fg: MUTED }, vm.contributionImage?.ok ? "GitHub activity" : "text fallback"),
		),
		vm.contributionImage?.ok
			? h("box", { style: { height: height - 1 } })
			: h("text", { fg: GREEN }, vm.contributionGraph.days?.length ? contributionFallback(vm.contributionGraph.days).join("\n") : vm.contributionGraph.message),
	);
}

function CurrentRepo({ vm }: { vm: DashboardViewModel }): React.ReactElement {
	return h("box", { style: { flex: 1, flexDirection: "column" } },
		h("text", { fg: WHITE }, "Current repo"),
		h("text", { fg: GREEN }, formatCurrentRepoLine(vm.currentRepo)),
	);
}

function Codex({ vm }: { vm: DashboardViewModel }): React.ReactElement {
	return h("box", { style: { flex: 1, flexDirection: "column" } },
		h("text", { fg: WHITE }, "Codex usage"),
		h("text", { fg: GREEN }, vm.codexUsage.message),
		h("text", { fg: MUTED }, "Detailed Pi Usage tab: coming next"),
	);
}

function Footer(): React.ReactElement {
	return h("box", { style: { height: 1, flexDirection: "row", justifyContent: "flex-end" } },
		h("text", { fg: MUTED }, "q Quit    r Refresh    /dashboard"),
	);
}

function contributionFallback(days: Array<{ date: string; level: string }>): string[] {
	const recent = days.slice(-154);
	const rows = [0, 1, 2, 3, 4, 5, 6].map(() => "");
	for (let i = 0; i < recent.length; i += 7) for (let d = 0; d < 7; d++) rows[d] += levelBlock(recent[i + d]?.level);
	return [`Mon ${rows[1]}`, `Wed ${rows[3]}`, `Fri ${rows[5]}`, "Less ·░▒▓█ More"];
}

function levelBlock(level: string | undefined): string {
	if (level === "FOURTH_QUARTILE") return "█";
	if (level === "THIRD_QUARTILE") return "▓";
	if (level === "SECOND_QUARTILE") return "▒";
	if (level === "FIRST_QUARTILE") return "░";
	return "·";
}
