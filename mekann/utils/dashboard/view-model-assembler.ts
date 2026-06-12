/**
 * view-model-assembler.ts — Deep module for Dashboard view-model assembly.
 *
 * Owns GitHub dashboard identity, GitHub activity, Local git activity,
 * Codex usage placeholder, and image preparation. Produces a
 * DashboardRenderModel that renderer Adapters consume without knowing
 * the assembly details.
 *
 * No Pi framework imports.
 */

import { collectGitHubDashboard, type GitHubDashboardResult } from "./github.js";
import { collectCurrentRepo, type CurrentRepoSummary } from "./current-repo.js";
import {
	prepareDashboardImages,
	type DashboardAvatarResult,
} from "./image-pipeline.js";
import type { ContributionDay } from "./github-parse.js";
import type { DashboardViewModel, Panel } from "./view-model.js";
import { buildCodexUsagePanel, liveCodexUsagePanelSource, type CodexUsagePanelSource } from "./codex-usage-panel.js";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

export const AVATAR_COLS = 20;
export const AVATAR_ROWS = 8;
export const GRAPH_COLS = 140;
export const GRAPH_ROWS = 10;

// ---------------------------------------------------------------------------
// Image placement intent (renderer-facing)
// ---------------------------------------------------------------------------

export interface DashboardImagePlacement {
	kind: "avatar" | "contributionGraph";
	path: string;
	columns: number;
	rows: number;
}

// ---------------------------------------------------------------------------
// Render model (primary output)
// ---------------------------------------------------------------------------

export interface DashboardRenderModel {
	vm: DashboardViewModel;
	images: {
		avatar?: DashboardImagePlacement;
		contributionGraph?: DashboardImagePlacement;
	};
}

// ---------------------------------------------------------------------------
// Assembly options
// ---------------------------------------------------------------------------

export interface DashboardAssemblyOptions {
	cwd: string;
	images?: boolean;
	avatar?: boolean;
	avatarSize?: { columns: number; rows: number };
	ctx?: ExtensionContext;
}

// ---------------------------------------------------------------------------
// Dependency injection (for tests)
// ---------------------------------------------------------------------------

export interface DashboardAssemblyDeps {
	collectGitHubDashboard: () => Promise<GitHubDashboardResult>;
	collectCurrentRepo: (cwd: string) => Promise<CurrentRepoSummary>;
	prepareImages: (options: {
		avatarUrl?: string;
		contributionDays?: ContributionDay[];
		images: boolean;
		avatar: boolean;
		avatarSize: { columns: number; rows: number };
	}) => Promise<{
		avatarResult: DashboardAvatarResult | undefined;
		graphPath: string | undefined;
	}>;
	codexUsageSource: CodexUsagePanelSource;
}

// ---------------------------------------------------------------------------
// Assembler
// ---------------------------------------------------------------------------

export async function assembleDashboardRenderModel(
	options: string | DashboardAssemblyOptions,
	deps?: DashboardAssemblyDeps,
): Promise<DashboardRenderModel> {
	const d = deps ?? defaultDeps;
	const opts: DashboardAssemblyOptions =
		typeof options === "string" ? { cwd: options } : options;
	const { cwd } = opts;
	const enableImages = opts.images ?? true;
	const enableAvatar = opts.avatar ?? true;
	const avatarSize = opts.avatarSize ?? {
		columns: AVATAR_COLS,
		rows: AVATAR_ROWS,
	};

	const [github, currentRepo, codexUsage] = await Promise.all([
		d.collectGitHubDashboard(),
		d.collectCurrentRepo(cwd),
		buildCodexUsagePanel(d.codexUsageSource, opts.ctx),
	]);

	const avatarUrl = github.ok ? github.data.profile.avatarUrl : undefined;
	const sizedUrl = avatarUrl
		? avatarUrl.includes("?")
			? `${avatarUrl}&s=160`
			: `${avatarUrl}?s=160`
		: undefined;

	const vm: DashboardViewModel = {
		profile: github.ok
			? { ok: true, profile: github.data.profile }
			: github,
		currentRepo,
		contributionGraph: github.ok
			? { status: "ready", data: github.data.contributionDays }
			: { status: "error", message: github.error },
		activitySummary: github.ok
			? { status: "ready", data: github.data.activity }
			: { status: "error", message: github.error },
		codexUsage,
	};

	const imageAssets = await d.prepareImages({
		avatarUrl: sizedUrl,
		contributionDays:
			vm.contributionGraph.status === "ready"
				? vm.contributionGraph.data
				: undefined,
		images: enableImages,
		avatar: enableAvatar,
		avatarSize,
	});

	const images: DashboardRenderModel["images"] = {};
	if (imageAssets.avatarResult?.ok) {
		images.avatar = {
			kind: "avatar",
			path: imageAssets.avatarResult.path,
			columns: imageAssets.avatarResult.columns,
			rows: imageAssets.avatarResult.rows,
		};
	}
	if (imageAssets.graphPath) {
		images.contributionGraph = {
			kind: "contributionGraph",
			path: imageAssets.graphPath,
			columns: GRAPH_COLS,
			rows: GRAPH_ROWS,
		};
	}

	return { vm, images };
}

// ---------------------------------------------------------------------------
// Default deps (production)
// ---------------------------------------------------------------------------

const defaultDeps: DashboardAssemblyDeps = {
	collectGitHubDashboard,
	collectCurrentRepo,
	prepareImages: (opts) =>
		prepareDashboardImages({
			avatarUrl: opts.avatarUrl,
			contributionDays: opts.contributionDays,
			images: opts.images,
			avatar: opts.avatar,
			avatarSize: opts.avatarSize,
		}),
	codexUsageSource: liveCodexUsagePanelSource,
};
