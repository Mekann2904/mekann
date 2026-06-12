/**
 * Image pipeline — unified interface for dashboard image operations.
 * Consolidates avatar fetching, contribution graph generation, and temp file cleanup.
 * Consumers import from here instead of individual image modules.
 */

import { fetchKittyAvatar, type DashboardAvatarResult } from "./avatar.js";
import { createContributionSvg } from "./contribution-image.js";
import {
	installDashboardCleanup,
	cleanupDashboardResourcesSync,
	registerCleanupPath,
} from "./cleanup.js";
import type { ContributionDay } from "./github-parse.js";

// Re-export Kitty utilities and cleanup for convenience
export { isLikelyKitty, renderKittyImage, kittyGraphicsEscape } from "./avatar.js";
export type { DashboardAvatarResult } from "./avatar.js";
export { installDashboardCleanup, cleanupDashboardResourcesSync, registerCleanupPath } from "./cleanup.js";

// ── types ─────────────────────────────────────────────────────────────
export interface DashboardImageAssets {
	avatarResult: DashboardAvatarResult | undefined;
	graphPath: string | undefined;
}

export interface PrepareImageOptions {
	avatarUrl?: string;
	contributionDays?: ContributionDay[];
	images: boolean;
	avatar: boolean;
	avatarSize: { columns: number; rows: number };
}

// ── image preparation ─────────────────────────────────────────────────
export async function prepareDashboardImages(options: PrepareImageOptions): Promise<DashboardImageAssets> {
	if (!options.images) {
		return { avatarResult: undefined, graphPath: undefined };
	}

	const [avatarResult, graphPath] = await Promise.all([
		fetchKittyAvatar(options.avatarUrl, {
			enabled: options.avatar,
			columns: options.avatarSize.columns,
			rows: options.avatarSize.rows,
		}),
		generateGraphPng(options.contributionDays),
	]);

	return { avatarResult, graphPath };
}

async function generateGraphPng(days: ContributionDay[] | undefined): Promise<string | undefined> {
	if (!days?.length) return undefined;
	try {
		const result = await createContributionSvg(days, { enabled: true });
		if (!result?.ok || !result.pngPath) return undefined;
		return result.pngPath;
	} catch {
		return undefined;
	}
}
