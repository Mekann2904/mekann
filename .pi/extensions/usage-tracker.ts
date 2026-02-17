/**
 * Simple LLM Usage Tracker
 * Shows model costs and daily usage heatmap
 * Optimized with per-file caching
 */

import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { getLogger } from "../lib/comprehensive-logger";
import type { OperationType } from "../lib/comprehensive-logger-types";

const logger = getLogger();

interface FileStats {
	mtimeMs: number;
	byModel: Record<string, number>;
	byDate: Record<string, number>;
	byDateModel: Record<string, Record<string, number>>;
}

interface CacheData {
	files: Record<string, FileStats>;
}

const CACHE_FILE = join(homedir(), ".pi/extensions/usage-cache.json");
const SESSIONS_DIR = join(homedir(), ".pi/agent/sessions");

function ensureCacheDir() {
	try {
		const dir = dirname(CACHE_FILE);
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true });
		}
	} catch {}
}

function loadCache(): CacheData | null {
	try {
		if (existsSync(CACHE_FILE)) {
			return JSON.parse(readFileSync(CACHE_FILE, "utf-8"));
		}
	} catch {}
	return null;
}

function saveCache(data: CacheData) {
	try {
		ensureCacheDir();
		writeFileSync(CACHE_FILE, JSON.stringify(data));
	} catch {}
}

function mergeRecordToMap(target: Map<string, number>, source: Record<string, number>) {
	for (const [key, value] of Object.entries(source)) {
		target.set(key, (target.get(key) || 0) + value);
	}
}

function parseUsageFile(filePath: string): {
	byModel: Record<string, number>;
	byDate: Record<string, number>;
	byDateModel: Record<string, Record<string, number>>;
} {
	const byModel: Record<string, number> = {};
	const byDate: Record<string, number> = {};
	const byDateModel: Record<string, Record<string, number>> = {};

	try {
		const content = readFileSync(filePath, "utf-8");
		const lines = content.split("\n").slice(-1000);

		for (const line of lines) {
			if (!line.trim()) continue;
			try {
				const data = JSON.parse(line);
				if (data.type === "message" && data.message?.usage?.cost?.total > 0) {
					const date = data.timestamp?.slice(0, 10) || "unknown";
					const model = data.message.model || "unknown";
					const cost = data.message.usage.cost.total;

					byModel[model] = (byModel[model] || 0) + cost;
					byDate[date] = (byDate[date] || 0) + cost;
					if (!byDateModel[date]) byDateModel[date] = {};
					byDateModel[date][model] = (byDateModel[date][model] || 0) + cost;
				}
			} catch {}
		}
	} catch {}

	return { byModel, byDate, byDateModel };
}

function collectData(): {
	byModel: Map<string, number>;
	byDate: Map<string, number>;
	byDateModel: Map<string, Map<string, number>>;
} {
	const cache = loadCache();
	const byModel = new Map<string, number>();
	const byDate = new Map<string, number>();
	const byDateModel = new Map<string, Map<string, number>>();
	const nextFiles: Record<string, FileStats> = {};

	try {
		const dirs = readdirSync(SESSIONS_DIR, { withFileTypes: true })
			.filter((d) => d.isDirectory())
			.map((d) => d.name);

		for (const dir of dirs) {
			const dirPath = join(SESSIONS_DIR, dir);
			const files = readdirSync(dirPath).filter((f) => f.endsWith(".jsonl"));

			for (const file of files) {
				const filePath = join(dirPath, file);
				let mtimeMs = 0;
				try {
					mtimeMs = statSync(filePath).mtimeMs;
				} catch {
					continue;
				}

				const cachedFile = cache?.files?.[filePath];
				const needsParse =
					!cachedFile ||
					cachedFile.mtimeMs !== mtimeMs ||
					!cachedFile.byDateModel;
				const stats = needsParse
					? {
						mtimeMs,
						...parseUsageFile(filePath),
					  }
					: cachedFile;

				nextFiles[filePath] = stats;
				mergeRecordToMap(byModel, stats.byModel);
				mergeRecordToMap(byDate, stats.byDate);
				for (const [date, modelCosts] of Object.entries(stats.byDateModel || {})) {
					if (!byDateModel.has(date)) byDateModel.set(date, new Map<string, number>());
					const dayMap = byDateModel.get(date)!;
					for (const [model, cost] of Object.entries(modelCosts)) {
						dayMap.set(model, (dayMap.get(model) || 0) + cost);
					}
				}
			}
		}
	} catch {}

	saveCache({ files: nextFiles });

	return { byModel, byDate, byDateModel };
}

function getRangeKeys(byDate: Map<string, number>, weeksCount: number): string[] {
	const dates = Array.from(byDate.keys()).sort();
	if (dates.length === 0) return [];

	const days = Math.max(7, weeksCount * 7);
	const end = new Date(dates[dates.length - 1]);
	const start = new Date(end);
	start.setDate(end.getDate() - (days - 1));

	const keys: string[] = [];
	for (let i = 0; i < days; i++) {
		const d = new Date(start);
		d.setDate(start.getDate() + i);
		keys.push(d.toISOString().slice(0, 10));
	}
	return keys;
}

function summarizeRange(
	byDate: Map<string, number>,
	byDateModel: Map<string, Map<string, number>>,
	weeksCount: number,
): { total: number; byModel: Map<string, number> } {
	const keys = getRangeKeys(byDate, weeksCount);
	const modelMap = new Map<string, number>();
	let total = 0;

	for (const key of keys) {
		total += byDate.get(key) || 0;
		const dayModels = byDateModel.get(key);
		if (!dayModels) continue;
		for (const [model, cost] of dayModels.entries()) {
			modelMap.set(model, (modelMap.get(model) || 0) + cost);
		}
	}

	return { total, byModel: modelMap };
}

function formatCost(n: number): string {
	if (n >= 1) return "$" + n.toFixed(2);
	if (n >= 0.01) return "$" + n.toFixed(4);
	return "$" + n.toFixed(6);
}

function drawHeatmap(
	byDate: Map<string, number>,
	weeksCount: number,
	theme: any,
): { lines: string[]; rangeLine: string; legendLine: string } {
	const lines: string[] = [];
	const dates = Array.from(byDate.keys()).sort();
	const days = Math.max(7, weeksCount * 7);
	if (dates.length === 0) {
		return {
			lines: [theme.fg("dim", "No data")],
			rangeLine: theme.fg("dim", "Range -"),
			legendLine: theme.fg("dim", "Scale: - none, ░ low, ▒ medium, ▓ high, █ peak"),
		};
	}

	const rangeKeys = getRangeKeys(byDate, weeksCount);
	if (rangeKeys.length === 0) {
		return {
			lines: [theme.fg("dim", "No data")],
			rangeLine: theme.fg("dim", "Range -"),
			legendLine: theme.fg("dim", "Scale: - none, ░ low, ▒ medium, ▓ high, █ peak"),
		};
	}

	const maxCost = Math.max(...rangeKeys.map((k) => byDate.get(k) || 0), 0);
	const t1 = maxCost * 0.1;
	const t2 = maxCost * 0.35;
	const t3 = maxCost * 0.7;
	const weeks: string[][] = [];

	for (let w = 0; w < weeksCount; w++) {
		const week: string[] = [];
		for (let day = 0; day < 7; day++) {
			const key = rangeKeys[w * 7 + day];
			const cost = key ? byDate.get(key) || 0 : 0;
			let char = "-";
			let color = "dim";
			if (cost > 0 && cost <= t1) {
				char = "░";
				color = "accent";
			} else if (cost <= t2) {
				char = "▒";
				color = "accent";
			} else if (cost <= t3) {
				char = "▓";
				color = "accent";
			} else if (cost > t3) {
				char = "█";
				color = "accent";
			}

			week.push(theme.fg(color, char));
		}
		weeks.push(week);
	}

	const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
	for (let day = 0; day < 7; day++) {
		let line = theme.fg("dim", `${dayNames[day]} `);
		for (const week of weeks) {
			line += `${week[day] || theme.fg("dim", "-")} `;
		}
		lines.push(line);
	}

	return {
		lines,
		rangeLine: theme.fg("dim", `Range ${rangeKeys[0]} .. ${rangeKeys[rangeKeys.length - 1]}`),
		legendLine:
			theme.fg("dim", "Scale (cost/day): ") +
			theme.fg("dim", `- $0, `) +
			theme.fg("accent", `░ <=${formatCost(t1)}, `) +
			theme.fg("accent", `▒ <=${formatCost(t2)}, `) +
			theme.fg("accent", `▓ <=${formatCost(t3)}, `) +
			theme.fg("accent", `█ >${formatCost(t3)}`),
	};
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("usage", {
		description: "Show LLM usage stats",
		handler: async (_args, ctx) => {
			const operationId = logger.startOperation("direct" as OperationType, "usage_command", {
				task: "LLM使用量統計の表示",
				params: {},
			});

			try {
				let usage = collectData();
				let heatmapWeeks = 12;

				await ctx.ui.custom<void>((tui, theme, _kb, done) => ({
						render: (w) => {
					const lines: string[] = [];
					const add = (s: string) => lines.push(s);
					const { byDate, byDateModel } = usage;
					const range = summarizeRange(byDate, byDateModel, heatmapWeeks);
					const byModel = range.byModel;

					add(theme.bold(theme.fg("accent", "LLM Usage")));
					add(theme.fg("dim", `Model cost + daily heatmap for selected range (${heatmapWeeks}w)`));
					add("");

					const total = range.total;
					add(theme.fg("text", "Total Cost  ") + theme.fg("success", formatCost(total)));
					add(theme.fg("text", "Models      ") + theme.fg("text", String(byModel.size)));
					add("");

					add(theme.bold(theme.fg("accent", "Top Models (USD)")));
					add(theme.fg("dim", "#  model                 cost        share   bar"));
					const sorted = Array.from(byModel.entries()).sort((a, b) => b[1] - a[1]);
					for (const [idx, [model, cost]] of sorted.slice(0, 8).entries()) {
						const name = model.split("/").pop()?.slice(0, 20) || model.slice(0, 20);
						const pct = total > 0 ? cost / total : 0;
						const share = `${(pct * 100).toFixed(1)}%`;
						const barLen = Math.max(8, Math.min(18, w - 58));
						const filled = Math.round(pct * barLen);
						const bar = theme.fg("accent", "#".repeat(filled)) + theme.fg("dim", "-".repeat(barLen - filled));
						add(`${String(idx + 1).padStart(2)} ${name.padEnd(20)}  ${formatCost(cost).padStart(10)}  ${share.padStart(6)}  ${bar}`);
					}

					add("");
					add(theme.bold(theme.fg("accent", `Daily Activity (last ${heatmapWeeks} week${heatmapWeeks === 1 ? "" : "s"})`)));
					const heatmap = drawHeatmap(byDate, heatmapWeeks, theme);
					for (const line of heatmap.lines) {
						add(line);
					}
					add(heatmap.rangeLine);
					add(heatmap.legendLine);
					add(theme.fg("dim", "Note: symbols encode level; color is only visual aid."));

					add("");
					add(theme.fg("dim", "[1] 1w  [2] 12w  [r] refresh  [q] close"));

					return lines;
				},
				invalidate: () => {},
				handleInput: (input) => {
					if (input === "q" || input === "escape") {
						logger.endOperation({
							status: "success",
							tokensUsed: 0,
							outputLength: 0,
							childOperations: 0,
							toolCalls: 0,
						});
						done();
					}
					if (input === "1") {
						heatmapWeeks = 1;
						tui.requestRender();
					}
					if (input === "2") {
						heatmapWeeks = 12;
						tui.requestRender();
					}
					if (input === "r") {
						usage = collectData();
						tui.requestRender();
					}
				},
			}));
			} catch (error) {
				logger.endOperation({
					status: "failure",
					tokensUsed: 0,
					outputLength: 0,
					childOperations: 0,
					toolCalls: 0,
					error: {
						type: error instanceof Error ? error.constructor.name : "UnknownError",
						message: error instanceof Error ? error.message : String(error),
						stack: error instanceof Error ? error.stack || "" : "",
					},
				});
			}
		},
	});
}
