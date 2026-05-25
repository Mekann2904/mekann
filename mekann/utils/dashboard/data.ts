/**
 * Data collection for the dashboard — assembles the ViewModel and prepares images.
 */

import { readFileSync } from "node:fs";
import { prepareDashboardImages, type DashboardAvatarResult } from "./image-pipeline.js";
import { collectCurrentRepo } from "./current-repo.js";
import { collectGitHubDashboard } from "./github.js";
import type { DashboardViewModel } from "./view-model.js";

// ── default layout constants ───────────────────────────────────────────
export const AVATAR_COLS = 20;
export const AVATAR_ROWS = 8;
export const GRAPH_COLS = 140;
export const GRAPH_ROWS = 10;

// ── data options ──────────────────────────────────────────────────────
export interface DashboardDataOptions {
	cwd: string;
	images?: boolean;
	avatar?: boolean;
	avatarSize?: { columns: number; rows: number };
}

// ── data result ───────────────────────────────────────────────────────
export interface DashboardData {
	vm: DashboardViewModel;
	avatarResult: DashboardAvatarResult | undefined;
	graphPath: string | undefined;
}

/** Collect all dashboard data: profile, repo, activity, and images. */
export async function collectDashboardData(options: string | DashboardDataOptions): Promise<DashboardData> {
	const opts: DashboardDataOptions = typeof options === "string"
		? { cwd: options }
		: options;
	const { cwd } = opts;
	const enableImages = opts.images ?? true;
	const enableAvatar = opts.avatar ?? true;
	const avatarSize = opts.avatarSize ?? { columns: AVATAR_COLS, rows: AVATAR_ROWS };

	const [github, currentRepo] = await Promise.all([
		collectGitHubDashboard(),
		collectCurrentRepo(cwd),
	]);

	const avatarUrl = github.ok ? github.data.profile.avatarUrl : undefined;
	// Use sized URL for efficient download
	const sizedUrl = avatarUrl
		? (avatarUrl.includes("?") ? `${avatarUrl}&s=160` : `${avatarUrl}?s=160`)
		: undefined;

	const vm: DashboardViewModel = {
		profile: github.ok ? { ok: true, profile: github.data.profile } : github,
		currentRepo,
		contributionGraph: github.ok
			? { status: "ready", data: github.data.contributionDays }
			: { status: "error", message: github.error },
		activitySummary: github.ok
			? { status: "ready", data: github.data.activity }
			: { status: "error", message: github.error },
		codexUsage: { status: "placeholder", message: "Codex usage summary: coming next" },
	};

	const { avatarResult, graphPath } = await prepareDashboardImages({
		avatarUrl: sizedUrl,
		contributionDays: vm.contributionGraph.status === "ready" ? vm.contributionGraph.data : undefined,
		images: enableImages,
		avatar: enableAvatar,
		avatarSize,
	});

	return { vm, avatarResult, graphPath };
}

// ── MIME detection (exported for testing) ─────────────────────────────
export function guessImageMime(base64: string): string {
	const header = Buffer.from(base64.slice(0, 24), "base64");
	if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47) return "image/png";
	if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) return "image/jpeg";
	if (header.slice(0, 3).toString("ascii") === "GIF") return "image/gif";
	if (header.slice(0, 4).toString("ascii") === "RIFF" && header.slice(8, 12).toString("ascii") === "WEBP") return "image/webp";
	return "image/png";
}
