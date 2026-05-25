/**
 * Overlay rendering logic — pure function that produces dashboard lines
 * for the Pi TUI overlay. Stateless and independently testable.
 */

import type { DashboardAvatarResult } from "./avatar.js";
import { AVATAR_ROWS, GRAPH_ROWS } from "./data.js";
import type { DashboardData } from "./data.js";
import { box, contributionText, padEnd } from "./layout.js";
import { truncateToWidth, BOLD, BLUE, GREEN, MUTED, RESET, WHITE, YELLOW } from "./terminal.js";

export interface OverlayRenderResult {
	lines: string[];
	graphLineIndex: number;
}

/**
 * Render dashboard overlay lines from collected data.
 * Returns the line array and the index of the contribution graph label.
 */
export function renderOverlayLines(
	data: DashboardData,
	width: number,
	height: number,
): OverlayRenderResult {
	const { vm, avatarResult, graphPath } = data;
	const lines: string[] = [];
	const w = Math.max(20, width);
	const h = Math.max(10, height);

	// ── profile + avatar row ───────────────────────────────────────
	const profile = vm.profile;
	if (profile.ok) {
		const p = profile.profile;
		if (avatarResult?.ok) {
			for (let i = 0; i < AVATAR_ROWS; i++) lines.push("");
		}
		lines.push(`${GREEN}@${p.login}${p.name ? `${MUTED} · ${WHITE}${p.name}${RESET}` : ""}`);
		if (p.bio) lines.push(`${MUTED}${p.bio}${RESET}`);
		if (p.location) lines.push(`${MUTED}⌖ ${p.location}${RESET}`);
		if (p.url) lines.push(`${BLUE}${p.url}${RESET}`);
	} else {
		lines.push(`${MUTED}GitHub profile unavailable: ${profile.error}${RESET}`);
	}

	lines.push(""); // spacer

	// ── stats strip ────────────────────────────────────────────────
	if (vm.activitySummary.status === "ready") {
		const s = vm.activitySummary.data;
		const stats: [string, string, string][] = [
			["This week", String(s.contributionsThisWeek), GREEN],
			["This month", String(s.contributionsThisMonth), GREEN],
			["Active days", String(s.activeDaysThisYear), BLUE],
			["PRs", String(s.pullRequests), YELLOW],
			["Issues", String(s.issuesOpened), WHITE],
			["Reviews", String(s.reviews), MUTED],
		];
		const statRow = stats.map(([label, value, color]) => {
			return `${BOLD}${color}${value}${RESET} ${MUTED}${label}${RESET}`;
		}).join(" ");
		lines.push(truncateToWidth(statRow, w));
	}

	lines.push(""); // spacer

	// ── contribution graph ─────────────────────────────────────────
	if (graphPath) {
		const label = `${WHITE}Contribution graph${RESET}  ${MUTED}GitHub activity${RESET}`;
		lines.push(padEnd(label, w));
		for (let i = 0; i < GRAPH_ROWS; i++) lines.push("");
	} else if (vm.contributionGraph.status === "ready" && vm.contributionGraph.data.length) {
		lines.push(...box({ title: "CONTRIBUTION GRAPH", lines: contributionText(vm.contributionGraph.data), width: w, height: 9 }));
	} else {
		const msg = vm.contributionGraph.status === "error" ? vm.contributionGraph.message : "unavailable";
		lines.push(...box({ title: "CONTRIBUTION GRAPH", lines: [msg], width: w, height: 4 }));
	}

	lines.push(""); // spacer

	// ── fill to full height ────────────────────────────────────────
	while (lines.length < h - 1) lines.push("");

	// ── footer ─────────────────────────────────────────────────────
	const footer = `${MUTED}q Quit   r Refresh   /dashboard${RESET}`;
	lines.push(padEnd(footer, w));

	const truncated = lines.map((l) => truncateToWidth(l, w));
	const graphLineIndex = truncated.findIndex((l) => l.includes("Contribution graph"));

	return { lines: truncated, graphLineIndex };
}
