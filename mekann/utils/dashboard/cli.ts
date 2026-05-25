#!/usr/bin/env bun
import { fetchKittyAvatar, renderKittyAvatar, renderKittyImage } from "./avatar.js";
import { parseDashboardArgs } from "./args.js";
import { createContributionSvg } from "./contribution-image.js";
import { collectCurrentRepo } from "./current-repo.js";
import { collectGitHubDashboard } from "./github.js";
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import React from "react";
import { DashboardApp } from "./app.js";
import type { DashboardViewModel } from "./view-model.js";

async function main(): Promise<void> {
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
	const avatar = github.ok ? await fetchKittyAvatar(github.data.profile.avatarUrl, { enabled: args.value.avatar }) : undefined;
	const contributionImage = github.ok ? await createContributionSvg(github.data.contributionDays, { enabled: true }) : undefined;
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
		void renderKittyAvatar(vm.avatar, { x: 3, y: 4 });
		void renderKittyImage(vm.contributionImage, { x: 3, y: 15 });
	}, 300).unref?.();
}

void main().catch((error) => {
	console.error(error instanceof Error ? error.stack ?? error.message : String(error));
	process.exitCode = 1;
});
