import type { DashboardViewModel } from "./view-model.js";
import { formatCurrentRepoLine } from "./view-model.js";

const GREEN = "#4ade80";

type Box = { title: string; lines: string[]; width: number; height?: number };

export function renderDashboardText(vm: DashboardViewModel, width = process.stdout.columns || 120): string {
	const contentWidth = Math.max(80, Math.min(width - 4, 140));
	const profileIndent = vm.avatar?.ok ? "                  " : "";
	const profile = vm.profile.ok
		? [
			`${profileIndent}@${vm.profile.profile.login}${vm.profile.profile.name ? ` · ${vm.profile.profile.name}` : ""}`,
			`${profileIndent}${vm.profile.profile.bio ?? ""}`,
			vm.profile.profile.location ? `${profileIndent}⌖ ${vm.profile.profile.location}` : "",
			`${profileIndent}${vm.profile.profile.url ?? ""}`,
			vm.avatar && !vm.avatar.ok ? `avatar: ${vm.avatar.error}` : "",
		].filter(Boolean)
		: [`GitHub profile error`, truncate(vm.profile.error, contentWidth - 8)];

	const currentRepo = [formatCurrentRepoLine(vm.currentRepo)];
	const graph = vm.contributionGraph.days?.length
		? renderContributionGraph(vm.contributionGraph.days)
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
		titleLine(contentWidth),
		box({ title: "PROFILE", lines: profile, width: contentWidth }),
		box({ title: "CONTRIBUTION GRAPH", lines: graph, width: contentWidth }),
		row([
			{ title: "CURRENT REPO", lines: currentRepo, width: Math.floor((contentWidth - 2) / 2), height: 8 },
			{ title: "ACTIVITY SUMMARY", lines: activity, width: Math.ceil((contentWidth - 2) / 2), height: 8 },
		]),
		box({ title: "CODEX USAGE", lines: codex, width: contentWidth }),
		footerLine(contentWidth),
	].join("\n");
}

export const dashboardTextColor = GREEN;

function titleLine(width: number): string {
	const left = "● ● ●   ◉ GitHub Dashboard";
	const right = "[ OpenTUI ]";
	return `${left}${" ".repeat(Math.max(1, width - visible(left) - visible(right)))}${right}`;
}

function footerLine(width: number): string {
	const text = "q Quit   r Refresh   /dashboard";
	return `└${"─".repeat(Math.max(0, width - 2 - visible(text)))} ${text}┘`;
}

function box(input: Box): string {
	const inner = input.width - 4;
	const bodyHeight = input.height ? Math.max(0, input.height - 3) : input.lines.length;
	const lines = input.lines.slice(0, bodyHeight);
	while (lines.length < bodyHeight) lines.push("");
	return [
		`┌─ ${padEnd(input.title, input.width - 4, "─")}─┐`,
		...lines.flatMap((line) => line.split("\n")).map((line) => `│ ${padEnd(truncate(line, inner), inner)} │`),
		`└${"─".repeat(input.width - 2)}┘`,
	].join("\n");
}

function row(boxes: Box[]): string {
	const rendered = boxes.map((b) => box(b).split("\n"));
	const height = Math.max(...rendered.map((r) => r.length));
	return Array.from({ length: height }, (_, i) => rendered.map((r) => r[i] ?? " ".repeat(r[0]?.length ?? 0)).join("  ")).join("\n");
}

function renderContributionGraph(days: Array<{ date: string; level: string }>): string[] {
	const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
	const recent = days.slice(-140);
	const rows = [0, 1, 2, 3, 4, 5, 6].map(() => "");
	let header = "";
	for (let i = 0; i < recent.length; i += 7) {
		const date = new Date(`${recent[i]?.date ?? ""}T00:00:00`);
		header += i % 28 === 0 && !Number.isNaN(date.getTime()) ? `${months[date.getMonth()]} `.padEnd(4) : " ";
		for (let d = 0; d < 7; d++) rows[d] += levelBlock(recent[i + d]?.level);
	}
	return [header.trimEnd(), `Mon ${rows[1]}`, `Wed ${rows[3]}`, `Fri ${rows[5]}`, "Less ░▒▓█ More"].filter(Boolean);
}

function levelBlock(level: string | undefined): string {
	if (level === "FOURTH_QUARTILE") return "█";
	if (level === "THIRD_QUARTILE") return "▓";
	if (level === "SECOND_QUARTILE") return "▒";
	if (level === "FIRST_QUARTILE") return "░";
	return "·";
}

function truncate(value: string, width: number): string {
	if (visible(value) <= width) return value;
	let out = "";
	for (const char of [...value]) {
		if (visible(`${out}${char}…`) > width) break;
		out += char;
	}
	return `${out}…`;
}

function padEnd(value: string, width: number, fill = " "): string {
	return value + fill.repeat(Math.max(0, width - visible(value)));
}

function visible(value: string): number {
	const withoutEscapes = value.replace(/\x1b(?:\[[0-?]*[ -/]*[@-~]|_G.*?\x1b\\)/gs, "");
	let width = 0;
	for (const char of [...withoutEscapes]) {
		const code = char.codePointAt(0) ?? 0;
		width += isWide(code) ? 2 : 1;
	}
	return width;
}

function isWide(code: number): boolean {
	return (code >= 0x1100 && code <= 0x115f) ||
		code === 0x2329 || code === 0x232a ||
		(code >= 0x2e80 && code <= 0xa4cf) ||
		(code >= 0xac00 && code <= 0xd7a3) ||
		(code >= 0xf900 && code <= 0xfaff) ||
		(code >= 0xfe10 && code <= 0xfe19) ||
		(code >= 0xfe30 && code <= 0xfe6f) ||
		(code >= 0xff00 && code <= 0xff60) ||
		(code >= 0xffe0 && code <= 0xffe6) ||
		(code >= 0x1f300 && code <= 0x1faff);
}
