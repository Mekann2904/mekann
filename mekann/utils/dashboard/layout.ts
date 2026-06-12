/**
 * Shared box/text layout for the dashboard.
 * Used by both pi-component.ts (Pi TUI overlay) and render.ts (CLI text output).
 */

import { truncateToWidth, visibleWidth } from "./terminal.js";

// ── types ─────────────────────────────────────────────────────────────
export interface BoxConfig {
	title: string;
	lines: string[];
	width: number;
	height?: number;
}

// ── layout helpers ────────────────────────────────────────────────────

/** Pad a string to `width` visible cells. */
export function padEnd(value: string, width: number, fill = " "): string {
	return value + fill.repeat(Math.max(0, width - visibleWidth(value)));
}

/** Render a titled box with ANSI-aware truncation. Returns one string per line. */
export function box(config: BoxConfig): string[] {
	const inner = Math.max(0, config.width - 4);
	const bodyHeight = config.height ? Math.max(0, config.height - 3) : config.lines.length;
	const body = config.lines.slice(0, bodyHeight);
	while (body.length < bodyHeight) body.push("");
	return [
		`┌─ ${padEnd(config.title, config.width - 4, "─")}─┐`,
		...body.flatMap((l) => l.split("\n")).map((l) => `│ ${padEnd(truncateToWidth(l, inner), inner)} │`),
		`└${"─".repeat(Math.max(0, config.width - 2))}┘`,
	];
}

/** Render multiple boxes side-by-side. Returns one string per row. */
export function rowBox(boxes: BoxConfig[], gap = ""): string[] {
	const rendered = boxes.map((b) => box(b));
	const heights = rendered.map((r) => r.length);
	const maxH = Math.max(...heights);
	return Array.from({ length: maxH }, (_, i) =>
		rendered.map((r, j) => {
			const line = r[i];
			if (line === undefined) return " ".repeat(boxes[j]!.width);
			return line.length < boxes[j]!.width
				? line + " ".repeat(boxes[j]!.width - line.length)
				: line.slice(0, boxes[j]!.width);
		}).join(gap),
	);
}

// ── contribution graph text fallback ──────────────────────────────────

export function contributionText(days: Array<{ date: string; level: string }>): string[] {
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

export function levelBlock(level: string | undefined): string {
	if (level === "FOURTH_QUARTILE") return "█";
	if (level === "THIRD_QUARTILE") return "▓";
	if (level === "SECOND_QUARTILE") return "▒";
	if (level === "FIRST_QUARTILE") return "░";
	return "·";
}
