import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	Image,
	type Component,
	type ImageTheme,
	truncateToWidth,
	visibleWidth,
	getImageDimensions,
} from "@earendil-works/pi-tui";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerCleanupPath } from "./cleanup.js";
import { collectCurrentRepo } from "./current-repo.js";
import { collectGitHubDashboard } from "./github.js";
import type { DashboardViewModel } from "./view-model.js";
import { formatCurrentRepoLine } from "./view-model.js";

// ── colors ────────────────────────────────────────────────────────────
const GREEN = "\x1b[38;2;121;242;143m";
const MUTED = "\x1b[38;2;156;163;175m";
const WHITE = "\x1b[38;2;229;255;233m";
const BLUE = "\x1b[38;2;139;213;255m";
const YELLOW = "\x1b[38;2;244;211;94m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

// ── avatar layout constants ───────────────────────────────────────────
const AVATAR_COLS = 20;
const AVATAR_ROWS = 8;

// ── helpers ───────────────────────────────────────────────────────────
function isDashboardImageLine(line: string): boolean {
	return line.startsWith("\x1b_G");
}

function padEnd(value: string, width: number, fill = " "): string {
	return value + fill.repeat(Math.max(0, width - visibleWidth(value)));
}

function center(value: string, width: number): string {
	const vw = visibleWidth(value);
	if (vw >= width) return value;
	const left = Math.floor((width - vw) / 2);
	return " ".repeat(left) + value + " ".repeat(width - vw - left);
}

function box(title: string, lines: string[], width: number, height?: number): string[] {
	const inner = Math.max(0, width - 4);
	const bodyHeight = height ? Math.max(0, height - 3) : lines.length;
	const body = lines.slice(0, bodyHeight);
	while (body.length < bodyHeight) body.push("");
	return [
		`┌─ ${padEnd(title, width - 4, "─")}─┐`,
		...body.flatMap((l) => l.split("\n")).map((l) => `│ ${padEnd(truncateToWidth(l, inner), inner)} │`),
		`└${"─".repeat(Math.max(0, width - 2))}┘`,
	];
}

function rowBox(boxes: { title: string; lines: string[]; width: number; height: number }[]): string[] {
	const rendered = boxes.map((b) => box(b.title, b.lines, b.width, b.height));
	const heights = rendered.map((r) => r.length);
	const maxH = Math.max(...heights);
	return Array.from({ length: maxH }, (_, i) =>
		rendered.map((r, j) => {
			const line = r[i];
			if (line === undefined) return " ".repeat(boxes[j]!.width);
			return line.length < boxes[j]!.width ? line + " ".repeat(boxes[j]!.width - line.length) : line.slice(0, boxes[j]!.width);
		}).join(""),
	);
}

// ── contribution graph (text) ─────────────────────────────────────────
function contributionText(days: Array<{ date: string; level: string }>): string[] {
	const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
	const recent = days.slice(-140);
	const rows = [0, 1, 2, 3, 4, 5, 6].map(() => "");
	let header = "";
	for (let i = 0; i < recent.length; i += 7) {
		const date = new Date(`${recent[i]?.date ?? ""}T00:00:00`);
		header += i % 28 === 0 && !Number.isNaN(date.getTime()) ? `${months[date.getMonth()]} `.padEnd(4) : " ";
		for (let d = 0; d < 7; d++) rows[d] += levelBlock(recent[i + d]?.level);
	}
	return [header.trimEnd(), `Mon ${rows[1]}`, `Wed ${rows[3]}`, `Fri ${rows[5]}`, "Less ░▒▓█ More"];
}

function levelBlock(level: string | undefined): string {
	if (level === "FOURTH_QUARTILE") return "█";
	if (level === "THIRD_QUARTILE") return "▓";
	if (level === "SECOND_QUARTILE") return "▒";
	if (level === "FIRST_QUARTILE") return "░";
	return "·";
}

// ── component ─────────────────────────────────────────────────────────
class DashboardPiComponent implements Component {
	private cachedLines?: string[];
	private cachedWidth?: number;
	private cachedHeight?: number;
	private graphImage: Image | undefined;

	/** Absolute path to the downloaded avatar image file (for kitten icat). */
	private readonly avatarPath: string | undefined;

	constructor(
		private readonly vm: DashboardViewModel,
		private readonly avatarFilePath: string | undefined,
		graphBase64: string | undefined,
		private readonly close: () => void,
	) {
		this.avatarPath = avatarFilePath;

		const imageTheme: ImageTheme = { fallbackColor: (s) => `${MUTED}${s}${RESET}` };

		if (graphBase64) {
			const dims = getImageDimensions(graphBase64, "image/png");
			if (dims) {
				this.graphImage = new Image(graphBase64, "image/png", imageTheme, { maxWidthCells: 140, maxHeightCells: 10 }, dims);
			}
		}
	}

	render(width: number): string[] {
		const height = process.stdout.rows || 40;
		if (this.cachedLines && this.cachedWidth === width && this.cachedHeight === height) {
			return this.cachedLines;
		}

		const lines: string[] = [];
		const w = Math.max(20, width);
		const h = Math.max(10, height);

		// ── profile + avatar row ───────────────────────────────────────
		// The avatar is rendered via kitten icat --place (not through the
		// TUI overlay pipeline) because the overlay compositor adds padding
		// spaces that overwrite Kitty image cells.
		const profile = this.vm.profile;

		if (profile.ok) {
			const p = profile.profile;
			// Reserve AVATAR_ROWS empty lines for the kitten-icat image
			if (this.avatarPath) {
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
			const statW = Math.floor((w - stats.length + 1) / stats.length);
			const statRow = stats.map(([label, value, color]) => {
				return `${BOLD}${color}${value}${RESET} ${MUTED}${label}${RESET}`;
			}).join(" ");
			lines.push(truncateToWidth(statRow, w));
		}

		lines.push(""); // spacer

		// ── contribution graph ─────────────────────────────────────────
		const graphH = 7;
		if (this.graphImage) {
			const label = `${WHITE}Contribution graph${RESET}  ${MUTED}GitHub activity${RESET}`;
			const graphLines = this.graphImage.render(w - 4);
			lines.push(padEnd(label, w), ...graphLines);
		} else if (this.vm.contributionGraph.days?.length) {
			lines.push(...box("CONTRIBUTION GRAPH", contributionText(this.vm.contributionGraph.days), w, graphH + 2));
		} else {
			lines.push(...box("CONTRIBUTION GRAPH", [this.vm.contributionGraph.message || "unavailable"], w, 4));
		}

		lines.push(""); // spacer

		// ── current repo + codex usage row ─────────────────────────────
		const halfW = Math.floor((w - 2) / 2);
		const repoLines = [
			`${GREEN}${formatCurrentRepoLine(this.vm.currentRepo)}${RESET}`,
		];
		const codexLines = [
			`${GREEN}${this.vm.codexUsage.message}${RESET}`,
			`${MUTED}Detailed Pi Usage tab: coming next${RESET}`,
		];
		const bottomH = 5;
		lines.push(...rowBox([
			{ title: "CURRENT REPO", lines: repoLines, width: halfW, height: bottomH },
			{ title: "CODEX USAGE", lines: codexLines, width: w - halfW - 2, height: bottomH },
		]));

		// ── fill to full height ────────────────────────────────────────
		while (lines.length < h - 1) lines.push("");

		// ── footer ─────────────────────────────────────────────────────
		const footer = `${MUTED}q Quit   r Refresh   /dashboard${RESET}`;
		lines.push(padEnd(footer, w));

		this.cachedLines = lines.map((l) => isDashboardImageLine(l) ? l : truncateToWidth(l, w));
		this.cachedWidth = width;
		this.cachedHeight = height;
		return this.cachedLines;
	}

	handleInput?(data: string): void {
		if (data === "q" || data === "\x1b") this.close();
		if (data === "r") {
			this.invalidate();
		}
	}

	invalidate(): void {
		this.cachedLines = undefined;
		this.cachedWidth = undefined;
		this.cachedHeight = undefined;
	}
}

export function createDashboardPiComponent(
	vm: DashboardViewModel,
	avatarFilePath: string | undefined,
	graphBase64: string | undefined,
	close: () => void,
): Component {
	return new DashboardPiComponent(vm, avatarFilePath, graphBase64, close);
}

// ── data collection ───────────────────────────────────────────────────
async function collectDashboardViewModel(cwd: string): Promise<DashboardViewModel> {
	const [github, currentRepo] = await Promise.all([
		collectGitHubDashboard(),
		collectCurrentRepo(cwd),
	]);
	return {
		profile: github.ok ? { ok: true, profile: github.data.profile } : github,
		currentRepo,
		contributionGraph: github.ok
			? { status: "loading", message: "", days: github.data.contributionDays }
			: { status: "error", message: github.error },
		activitySummary: github.ok
			? { status: "ready", message: "", summary: github.data.activity }
			: { status: "error", message: github.error },
		codexUsage: { status: "placeholder", message: "Codex usage summary: coming next" },
	};
}

/**
 * Download the avatar image to a temp file suitable for `kitten icat`.
 * Returns the absolute path to the file, or undefined on failure.
 */
async function downloadAvatarToFile(url: string | undefined): Promise<string | undefined> {
	if (!url) return undefined;
	try {
		const sizedUrl = url.includes("?") ? `${url}&s=160` : `${url}?s=160`;
		const resp = await fetch(sizedUrl);
		if (!resp.ok) return undefined;
		const buf = Buffer.from(await resp.arrayBuffer());
		const dir = await mkdtemp(join(tmpdir(), "mekann-dashboard-avatar-"));
		registerCleanupPath(dir);
		const path = join(dir, "avatar.jpg");
		await writeFile(path, buf);
		return path;
	} catch {
		return undefined;
	}
}

async function generateGraphBase64(days: Array<{ date: string; count: number; level: string }> | undefined): Promise<string | undefined> {
	if (!days?.length) return undefined;
	try {
		const { createContributionSvg } = await import("./contribution-image.js");
		const result = await createContributionSvg(days, { enabled: true });
		if (!result?.ok) return undefined;
		// Prefer PNG (Kitty graphics protocol does not support SVG)
		const imagePath = result.pngPath ?? result.path;
		const imageBytes = readFileSync(imagePath);
		return imageBytes.toString("base64");
	} catch {
		return undefined;
	}
}

/**
 * Place the avatar image on the terminal using `kitten icat --place`.
 * This bypasses the TUI overlay compositor, which adds padding spaces
 * that overwrite Kitty image cells and make images invisible.
 */
function placeAvatarIcat(avatarPath: string, row: number, col: number): void {
	try {
		spawnSync("kitten", [
			"icat", "--silent", "--transfer-mode=file",
			"--align=left", "--scale-up=yes",
			"--place", `${AVATAR_COLS}x${AVATAR_ROWS}@${col}x${row}`,
			avatarPath,
		], { stdio: "inherit", timeout: 3000 });
	} catch {
		// Image rendering is cosmetic; keep the dashboard usable.
	}
}

// ── extension registration ────────────────────────────────────────────
export default function dashboard(pi: ExtensionAPI): void {
	pi.registerCommand("dashboard", {
		description: "Open the Mekann dashboard in Pi TUI",
		handler: async (_args, ctx) => {
			ctx.ui.notify("Loading dashboard...", "info");
			const vm = await collectDashboardViewModel(ctx.cwd);
			const [avatarPath, graphBase64] = await Promise.all([
				downloadAvatarToFile(vm.profile.ok ? vm.profile.profile.avatarUrl : undefined),
				generateGraphBase64(vm.contributionGraph.days),
			]);
			ctx.ui.setFooter(() => ({ render: () => [], invalidate: () => {} }));
			try {
				let avatarPlaced = false;
				await ctx.ui.custom<void>((tui, _theme, _keybindings, done) => {
					const component = createDashboardPiComponent(vm, avatarPath, graphBase64, () => done(undefined));
					return {
						render: (width) => {
							const lines = component.render(width);
							// Place avatar via kitten icat on first render, AFTER the TUI
							// has written its output. The TUI's differential rendering won't
							// re-render unchanged empty placeholder lines, so the image persists.
							if (!avatarPlaced && avatarPath) {
								avatarPlaced = true;
																setTimeout(() => placeAvatarIcat(avatarPath, 0, 1), 80);
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
