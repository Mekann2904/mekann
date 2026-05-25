import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
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
const GRAPH_COLS = 140;
const GRAPH_ROWS = 10;

// ── string width helpers (replaces pi-tui truncateToWidth/visibleWidth) ─

/** Strip ANSI escape sequences to get the visible text. */
function stripAnsi(s: string): string {
	return s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "").replace(/\x1b\][^\x07]*\x07/g, "").replace(/\x1b_G[^\x1b]*\x1b\\/g, "");
}

/** Return the visible (cell) width of a string, ignoring ANSI escapes. */
function visibleWidth(s: string): number {
	const stripped = stripAnsi(s);
	let w = 0;
	for (const ch of stripped) {
		const cp = ch.codePointAt(0)!;
		w += cp >= 0x1100 &&
			(cp <= 0x115f || cp === 0x2329 || cp === 0x232a ||
				(0x2e80 <= cp && cp <= 0xa4cf && cp !== 0x303f) ||
				(0xac00 <= cp && cp <= 0xd7a3) ||
				(0xf900 <= cp && cp <= 0xfaff) ||
				(0xfe10 <= cp && cp <= 0xfe19) ||
				(0xfe30 <= cp && cp <= 0xfe6f) ||
				(0xff01 <= cp && cp <= 0xff60) ||
				(0xffe0 <= cp && cp <= 0xffe6) ||
				(0x1f300 <= cp && cp <= 0x1f64f) ||
				(0x1f900 <= cp && cp <= 0x1f9ff) ||
				(0x20000 <= cp && cp <= 0x2fffd) ||
				(0x30000 <= cp && cp <= 0x3fffd))
			? 2 : 1;
	}
	return w;
}

/** Truncate a string to `maxWidth` visible cells, preserving ANSI sequences. */
function truncateToWidth(s: string, maxWidth: number): string {
	let visible = 0;
	let inEscape = false;
	let result = "";
	for (let i = 0; i < s.length; i++) {
		const ch = s[i]!;
		if (ch === "\x1b") { inEscape = true; result += ch; continue; }
		if (inEscape) {
			result += ch;
			if (/[A-Za-z]/.test(ch) || ch === "\\" || ch === "\x07") inEscape = false;
			continue;
		}
		const cp = ch.codePointAt(0)!;
		const cw = cp >= 0x1100 &&
			(cp <= 0x115f || cp === 0x2329 || cp === 0x232a ||
				(0x2e80 <= cp && cp <= 0xa4cf && cp !== 0x303f) ||
				(0xac00 <= cp && cp <= 0xd7a3) ||
				(0xf900 <= cp && cp <= 0xfaff) ||
				(0xfe10 <= cp && cp <= 0xfe19) ||
				(0xfe30 <= cp && cp <= 0xfe6f) ||
				(0xff01 <= cp && cp <= 0xff60) ||
				(0xffe0 <= cp && cp <= 0xffe6) ||
				(0x1f300 <= cp && cp <= 0x1f64f) ||
				(0x1f900 <= cp && cp <= 0x1f9ff) ||
				(0x20000 <= cp && cp <= 0x2fffd) ||
				(0x30000 <= cp && cp <= 0x3fffd))
			? 2 : 1;
		if (visible + cw > maxWidth) {
			return result + RESET;
		}
		visible += cw;
		result += ch;
	}
	return result;
}

// ── Component interface (minimal, replaces pi-tui Component) ───────────
interface Component {
	render(width: number): string[];
	handleInput?(data: string): void;
	invalidate(): void;
}

// ── helpers ───────────────────────────────────────────────────────────
function padEnd(value: string, width: number, fill = " "): string {
	return value + fill.repeat(Math.max(0, width - visibleWidth(value)));
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

// ── contribution graph (text fallback) ────────────────────────────────
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

	constructor(
		private readonly vm: DashboardViewModel,
		private readonly avatarFilePath: string | undefined,
		private readonly graphFilePath: string | undefined,
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
			// Reserve AVATAR_ROWS empty lines for the kitten-icat image
			if (this.avatarFilePath) {
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
		if (this.graphFilePath) {
			// Reserve GRAPH_ROWS empty lines for the kitten-icat graph
			const label = `${WHITE}Contribution graph${RESET}  ${MUTED}GitHub activity${RESET}`;
			lines.push(padEnd(label, w));
			for (let i = 0; i < GRAPH_ROWS; i++) lines.push("");
		} else if (this.vm.contributionGraph.days?.length) {
			lines.push(...box("CONTRIBUTION GRAPH", contributionText(this.vm.contributionGraph.days), w, 9));
		} else {
			lines.push(...box("CONTRIBUTION GRAPH", [this.vm.contributionGraph.message || "unavailable"], w, 4));
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
		const lines = this.cachedLines;
		if (!lines) return -1;
		return lines.findIndex((l) => l.includes("Contribution graph"));
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
	graphFilePath: string | undefined,
	close: () => void,
): DashboardPiComponent {
	return new DashboardPiComponent(vm, avatarFilePath, graphFilePath, close);
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

/**
 * Generate the contribution graph PNG and return the file path.
 * Returns undefined if PNG generation fails (text fallback will be used).
 */
async function generateGraphFile(days: Array<{ date: string; count: number; level: string }> | undefined): Promise<string | undefined> {
	if (!days?.length) return undefined;
	try {
		const { createContributionSvg } = await import("./contribution-image.js");
		const result = await createContributionSvg(days, { enabled: true });
		if (!result?.ok || !result.pngPath) return undefined;
		return result.pngPath;
	} catch {
		return undefined;
	}
}

/**
 * Place an image on the terminal using `kitten icat --place`.
 * Bypasses the TUI overlay compositor which destroys Kitty image cells.
 */
function placeImageIcat(imagePath: string, row: number, col: number, cols: number, rows: number): void {
	try {
		spawnSync("kitten", [
			"icat", "--silent", "--transfer-mode=file",
			"--align=left", "--scale-up=yes",
			"--place", `${cols}x${rows}@${col}x${row}`,
			imagePath,
		], { stdio: "inherit", timeout: 3000 });
	} catch {
		// Image rendering is cosmetic; keep the dashboard usable.
	}
}

// ── MIME detection (exported for testing) ─────────────────────────────
export function guessImageMime(base64: string): string {
	const header = Buffer.from(base64.slice(0, 24), "base64");
	// PNG: 89 50 4E 47
	if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47) return "image/png";
	// JPEG: FF D8 FF
	if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) return "image/jpeg";
	// GIF: GIF87a / GIF89a
	if (header.slice(0, 3).toString("ascii") === "GIF") return "image/gif";
	// WebP: RIFF....WEBP
	if (header.slice(0, 4).toString("ascii") === "RIFF" && header.slice(8, 12).toString("ascii") === "WEBP") return "image/webp";
	return "image/png";
}

// ── extension registration ────────────────────────────────────────────
export default function dashboard(pi: ExtensionAPI): void {
	pi.registerCommand("dashboard", {
		description: "Open the Mekann dashboard in Pi TUI",
		handler: async (_args, ctx) => {
			ctx.ui.notify("Loading dashboard...", "info");
			const vm = await collectDashboardViewModel(ctx.cwd);
			const [avatarPath, graphPath] = await Promise.all([
				downloadAvatarToFile(vm.profile.ok ? vm.profile.profile.avatarUrl : undefined),
				generateGraphFile(vm.contributionGraph.days),
			]);
			ctx.ui.setFooter(() => ({ render: () => [], invalidate: () => {} }));
			try {
				let imagesPlaced = false;
				await ctx.ui.custom<void>((tui, _theme, _keybindings, done) => {
					const component = createDashboardPiComponent(vm, avatarPath, graphPath, () => done(undefined));
					return {
						render: (width) => {
							const lines = component.render(width);
							// Place images via kitten icat after first render.
							if (!imagesPlaced) {
								imagesPlaced = true;
								setTimeout(() => {
									if (avatarPath) {
										placeImageIcat(avatarPath, 0, 1, AVATAR_COLS, AVATAR_ROWS);
									}
									if (graphPath) {
										const graphRow = component.getGraphLineIndex() + 1;
										if (graphRow > 0) {
											placeImageIcat(graphPath, graphRow, 1, GRAPH_COLS, GRAPH_ROWS);
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
