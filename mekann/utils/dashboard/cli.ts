#!/usr/bin/env bun
import { fetchKittyAvatar, renderKittyAvatar } from "./avatar.js";
import { parseDashboardArgs } from "./args.js";
import { collectCurrentRepo } from "./current-repo.js";
import { collectGitHubDashboard } from "./github.js";
import { dashboardTextColor, renderDashboardText } from "./render.js";
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
	const viewModel: DashboardViewModel = {
		profile,
		avatar,
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
	const { createCliRenderer, Text } = await import("@opentui/core");
	const renderer = await createCliRenderer({ exitOnCtrlC: true });
	renderer.root.add(Text({ content: renderDashboardText(vm), fg: dashboardTextColor }));
	setTimeout(() => void renderKittyAvatar(vm.avatar, { x: 3, y: 3 }), 250).unref?.();
	process.stdin.setRawMode?.(true);
	process.stdin.resume();
	process.stdin.on("data", (chunk) => {
		if (chunk.toString() === "q") {
			renderer.destroy?.();
			process.exit(0);
		}
	});
}

void main().catch((error) => {
	console.error(error instanceof Error ? error.stack ?? error.message : String(error));
	process.exitCode = 1;
});
