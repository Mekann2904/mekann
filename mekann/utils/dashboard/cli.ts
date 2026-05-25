#!/usr/bin/env bun
import { parseDashboardArgs } from "./args.js";
import { installDashboardCleanup } from "./cleanup.js";
import { collectDashboardData, type DashboardData } from "./data.js";
import { renderDashboardText } from "./render.js";

async function main(): Promise<void> {
	const args = parseDashboardArgs(process.argv.slice(2));
	if (!args.ok) {
		console.error(args.error);
		process.exitCode = args.error.startsWith("Usage:") ? 0 : 1;
		return;
	}

	if (args.value.images) installDashboardCleanup();
	const terminalWidth = process.stdout.columns || 140;
	const terminalHeight = process.stdout.rows || 40;
	const data = await collectDashboardData({
		cwd: args.value.cwd,
		images: args.value.images,
		avatar: args.value.avatar,
		avatarSize: {
			columns: Math.max(22, Math.min(34, Math.floor(terminalWidth * 0.16))),
			rows: Math.max(11, Math.min(17, Math.floor(terminalHeight * 0.18))),
		},
	});

	if (args.value.interactive) {
		await renderDashboard(data);
		return;
	}
	console.log(renderDashboardText(data, terminalWidth));
}

async function renderDashboard(_data: DashboardData): Promise<void> {
	console.error("Interactive mode (OpenTUI) has been removed. Use /dashboard in Pi instead.");
	process.exitCode = 1;
}

void main().catch((error) => {
	console.error(error instanceof Error ? error.stack ?? error.message : String(error));
	process.exitCode = 1;
});
