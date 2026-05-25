import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerCleanupPath } from "./cleanup.js";
import type { ContributionDay } from "./github.js";

const execFile = promisify(execFileCb);

export type DashboardImage = { ok: true; path: string; columns: number; rows: number; pngPath?: string } | { ok: false; error: string };

export async function createContributionSvg(days: ContributionDay[] | undefined, options: { enabled: boolean; columns?: number; rows?: number } = { enabled: true }): Promise<DashboardImage | undefined> {
	if (!options.enabled || !days?.length) return undefined;
	try {
		const columns = options.columns ?? 104;
		const rows = options.rows ?? 11;
		const recent = days.slice(-371);
		const cell = 10;
		const gap = 3;
		const left = 34;
		const top = 24;
		const weekCount = Math.ceil(recent.length / 7);
		const width = left + weekCount * (cell + gap) + 10;
		const height = top + 7 * (cell + gap) + 28;
		const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
		const monthLabels: string[] = [];
		let lastMonth = -1;
		const rects = recent.map((day, index) => {
			const date = new Date(`${day.date}T00:00:00`);
			const week = Math.floor(index / 7);
			const dow = index % 7;
			if (!Number.isNaN(date.getTime()) && date.getMonth() !== lastMonth) {
				lastMonth = date.getMonth();
				monthLabels.push(`<text x="${left + week * (cell + gap)}" y="14" fill="#9ca3af" font-size="12">${months[lastMonth]}</text>`);
			}
			return `<rect x="${left + week * (cell + gap)}" y="${top + dow * (cell + gap)}" width="${cell}" height="${cell}" fill="${levelColor(day.level)}"/>`;
		}).join("\n");
		const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect width="100%" height="100%" fill="rgba(4,10,8,0.10)"/>
<style>text{font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace}</style>
${monthLabels.join("\n")}
<text x="0" y="${top + 10}" fill="#d1d5db" font-size="12">Mon</text>
<text x="0" y="${top + 3 * (cell + gap) + 10}" fill="#d1d5db" font-size="12">Wed</text>
<text x="0" y="${top + 5 * (cell + gap) + 10}" fill="#d1d5db" font-size="12">Fri</text>
${rects}
<text x="0" y="${height - 8}" fill="#d1d5db" font-size="12">Less</text>
<rect x="36" y="${height - 18}" width="10" height="10" fill="#17201b"/>
<rect x="52" y="${height - 18}" width="10" height="10" fill="#0e4429"/>
<rect x="68" y="${height - 18}" width="10" height="10" fill="#006d32"/>
<rect x="84" y="${height - 18}" width="10" height="10" fill="#26a641"/>
<rect x="100" y="${height - 18}" width="10" height="10" fill="#39d353"/>
<text x="118" y="${height - 8}" fill="#d1d5db" font-size="12">More</text>
</svg>`;
		const dir = await mkdtemp(join(tmpdir(), "mekann-dashboard-graph-"));
		registerCleanupPath(dir);
		const path = join(dir, "contributions.svg");
		await writeFile(path, svg);

		// Convert SVG to PNG for Kitty graphics protocol (SVG is not a supported image format)
		let pngPath: string | undefined;
		try {
			const png = join(dir, "contributions.png");
			await execFile("rsvg-convert", ["--format", "png", "--output", png, path], { timeout: 5000 });
			pngPath = png;
		} catch {
			// PNG conversion optional; SVG path remains for text fallback
		}

		return { ok: true, path, columns, rows, pngPath };
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : String(error) };
	}
}

function levelColor(level: string): string {
	if (level === "FOURTH_QUARTILE") return "#39d353";
	if (level === "THIRD_QUARTILE") return "#26a641";
	if (level === "SECOND_QUARTILE") return "#006d32";
	if (level === "FIRST_QUARTILE") return "#0e4429";
	return "#111827";
}
