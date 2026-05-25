/**
 * Pi TUI overlay dashboard component.
 * Only contains the Component class and Pi extension registration.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { renderKittyImage } from "./avatar.js";
import { AVATAR_COLS, AVATAR_ROWS, GRAPH_COLS, GRAPH_ROWS, collectDashboardData } from "./data.js";
import { box, contributionText, padEnd } from "./layout.js";
import { truncateToWidth } from "./terminal.js";
import { BOLD, BLUE, GREEN, MUTED, RESET, WHITE, YELLOW } from "./terminal.js";
import type { DashboardViewModel } from "./view-model.js";
import { formatCurrentRepoLine } from "./view-model.js";
import type { DashboardAvatarResult } from "./avatar.js";

// ── Component interface (minimal) ─────────────────────────────────────
interface Component {
	render(width: number): string[];
	handleInput?(data: string): void;
	invalidate(): void;
}

// ── component ─────────────────────────────────────────────────────────
class DashboardPiComponent implements Component {
	private cachedLines?: string[];
	private cachedWidth?: number;
	private cachedHeight?: number;

	constructor(
		private readonly vm: DashboardViewModel,
		private readonly avatarResult: DashboardAvatarResult | undefined,
		private readonly graphPath: string | undefined,
		private readonly close: () => void,
	) {}

	render(width: number): string[] {
		const height = process.stdout.rows || 40;
		if (this.cachedLines && this.cachedWidth === width && this.cachedHeight === height) {
			return this.cachedLines;
		}

		const lines: string[] = [];
		const w = Math.max(20, width);
		const h = Math.max(10, height);

		// ── profile + avatar row ───────────────────────────────────────
		const profile = this.vm.profile;
		if (profile.ok) {
			const p = profile.profile;
			if (this.avatarResult?.ok) {
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
		const s = this.vm.activitySummary.summary;
		if (s) {
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
		if (this.graphPath) {
			const label = `${WHITE}Contribution graph${RESET}  ${MUTED}GitHub activity${RESET}`;
			lines.push(padEnd(label, w));
			for (let i = 0; i < GRAPH_ROWS; i++) lines.push("");
		} else if (this.vm.contributionGraph.days?.length) {
			lines.push(...box({ title: "CONTRIBUTION GRAPH", lines: contributionText(this.vm.contributionGraph.days), width: w, height: 9 }));
		} else {
			lines.push(...box({ title: "CONTRIBUTION GRAPH", lines: [this.vm.contributionGraph.message || "unavailable"], width: w, height: 4 }));
		}

		lines.push(""); // spacer

		// ── fill to full height ────────────────────────────────────────
		while (lines.length < h - 1) lines.push("");

		// ── footer ─────────────────────────────────────────────────────
		const footer = `${MUTED}q Quit   r Refresh   /dashboard${RESET}`;
		lines.push(padEnd(footer, w));

		this.cachedLines = lines.map((l) => truncateToWidth(l, w));
		this.cachedWidth = width;
		this.cachedHeight = height;
		return this.cachedLines;
	}

	/** Return the line index where the graph image should be placed. */
	getGraphLineIndex(): number {
		return this.cachedLines?.findIndex((l) => l.includes("Contribution graph")) ?? -1;
	}

	handleInput?(data: string): void {
		if (data === "q" || data === "\x1b") this.close();
		if (data === "r") this.invalidate();
	}

	invalidate(): void {
		this.cachedLines = undefined;
		this.cachedWidth = undefined;
		this.cachedHeight = undefined;
	}
}

export function createDashboardPiComponent(
	vm: DashboardViewModel,
	avatarResult: DashboardAvatarResult | undefined,
	graphPath: string | undefined,
	close: () => void,
): DashboardPiComponent {
	return new DashboardPiComponent(vm, avatarResult, graphPath, close);
}

// ── Pi extension registration ─────────────────────────────────────────
export default function dashboard(pi: ExtensionAPI): void {
	pi.registerCommand("dashboard", {
		description: "Open the Mekann dashboard in Pi TUI",
		handler: async (_args, ctx) => {
			ctx.ui.notify("Loading dashboard...", "info");
			const { vm, avatarResult, graphPath } = await collectDashboardData(ctx.cwd);
			ctx.ui.setFooter(() => ({ render: () => [], invalidate: () => {} }));
			try {
				let imagesPlaced = false;
				await ctx.ui.custom<void>((tui, _theme, _keybindings, done) => {
					const component = createDashboardPiComponent(vm, avatarResult, graphPath, () => done(undefined));
					return {
						render: (width) => {
							const lines = component.render(width);
							if (!imagesPlaced) {
								imagesPlaced = true;
								setTimeout(() => {
									if (avatarResult?.ok) {
										renderKittyImage(avatarResult, { x: 1, y: 0 });
									}
									if (graphPath) {
										const graphRow = component.getGraphLineIndex() + 1;
										if (graphRow > 0) {
											renderKittyImage(
												{ ok: true, path: graphPath, columns: GRAPH_COLS, rows: GRAPH_ROWS },
												{ x: 1, y: graphRow },
											);
										}
									}
								}, 80);
							}
							return lines;
						},
						handleInput: (data) => {
							component.handleInput?.(data);
							tui.requestRender();
						},
						invalidate: () => component.invalidate(),
					};
				}, {
					overlay: true,
					overlayOptions: { width: "100%", maxHeight: "100%", row: 0, col: 0, margin: 0 },
				});
			} finally {
				ctx.ui.setFooter(undefined);
			}
		},
	});
}
