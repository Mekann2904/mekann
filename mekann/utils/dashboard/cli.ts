#!/usr/bin/env bun
import { fetchKittyAvatar, renderKittyAvatar, renderKittyImage } from "./avatar.js";
import { parseDashboardArgs } from "./args.js";
import { installDashboardCleanup } from "./cleanup.js";
import { createContributionSvg } from "./contribution-image.js";
import { collectCurrentRepo } from "./current-repo.js";
import { collectGitHubDashboard } from "./github.js";
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import React from "react";
import { DashboardApp } from "./app.js";
import type { DashboardViewModel } from "./view-model.js";

async function main(): Promise<void> {
	installDashboardCleanup();
	const args = parseDashboardArgs(process.argv.slice(2));
	if (!args.ok) {
		console.error(args.error);
		process.exitCode = args.error.startsWith("Usage:") ? 0 : 1;
		return;
	}

	const [github, currentRepo] = await Promise.all([
		collectGitHubDashboard(),
		collectCurrentRepo(args.value.cwd),
	]);
	const profile = github.ok ? { ok: true as const, profile: github.data.profile } : github;
	const terminalWidth = process.stdout.columns || 140;
	const terminalHeight = process.stdout.rows || 40;
	const avatarColumns = Math.max(22, Math.min(34, Math.floor(terminalWidth * 0.16)));
	const avatarRows = Math.max(11, Math.min(17, Math.floor(terminalHeight * 0.18)));
	const graphColumns = Math.max(86, Math.min(terminalWidth - 8, Math.floor(terminalWidth * 0.78)));
	const graphRows = Math.max(10, Math.min(15, Math.floor(terminalHeight * 0.16)));
	const avatar = github.ok ? await fetchKittyAvatar(github.data.profile.avatarUrl, { enabled: args.value.avatar, columns: avatarColumns, rows: avatarRows }) : undefined;
	const contributionImage = github.ok ? await createContributionSvg(github.data.contributionDays, { enabled: true, columns: graphColumns, rows: graphRows }) : undefined;
	const viewModel: DashboardViewModel = {
		profile,
		avatar,
		contributionImage,
		currentRepo,
		contributionGraph: github.ok
			? { status: "loading", message: "", days: github.data.contributionDays }
			: { status: "error", message: github.error },
		activitySummary: github.ok
			? { status: "ready", message: "", summary: github.data.activity }
			: { status: "error", message: github.error },
		codexUsage: { status: "placeholder", message: "Codex usage summary: coming next" },
	};
	await renderDashboard(viewModel);
}

async function renderDashboard(vm: DashboardViewModel): Promise<void> {
	const renderer = await createCliRenderer({ exitOnCtrlC: true });
	createRoot(renderer).render(React.createElement(DashboardApp, { vm }));
	setTimeout(() => {
		void renderKittyAvatar(vm.avatar, { x: 4, y: 3 });
		void renderKittyImage(vm.contributionImage, { x: 4, y: (vm.avatar?.ok ? vm.avatar.rows + 11 : 17) });
	}, 300).unref?.();
}

void main().catch((error) => {
	console.error(error instanceof Error ? error.stack ?? error.message : String(error));
	process.exitCode = 1;
});
