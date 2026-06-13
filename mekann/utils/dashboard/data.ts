/**
 * data.ts — Backward-compatible shim over DashboardViewModelAssembler.
 *
 * Preserves the existing `DashboardData` / `collectDashboardData` interface
 * so existing consumers (cli.ts, tests) continue to work unchanged.
 * Internally delegates to `assembleDashboardRenderModel`.
 */

import type { DashboardAvatarResult } from "./image-pipeline.js";
import type { DashboardViewModel } from "./view-model.js";
import {
	assembleDashboardRenderModel,
	AVATAR_COLS,
	AVATAR_ROWS,
	GRAPH_COLS,
	GRAPH_ROWS,
} from "./view-model-assembler.js";

// Re-export constants for backward compatibility
export { AVATAR_COLS, AVATAR_ROWS, GRAPH_COLS, GRAPH_ROWS };

// ── data options (preserved interface) ──────────────────────────────
export interface DashboardDataOptions {
	cwd: string;
	images?: boolean;
	avatar?: boolean;
	avatarSize?: { columns: number; rows: number };
}

// ── data result (preserved interface) ───────────────────────────────
export interface DashboardData {
	vm: DashboardViewModel;
	avatarResult: DashboardAvatarResult | undefined;
	graphPath: string | undefined;
}

/** Collect all dashboard data: profile, repo, activity, and images. */
export async function collectDashboardData(
	options: string | DashboardDataOptions,
): Promise<DashboardData> {
	const model = await assembleDashboardRenderModel(options);

	// Convert placement intents back to legacy shape
	const avatarResult: DashboardAvatarResult | undefined = model.images.avatar
		? {
				ok: true,
				path: model.images.avatar.path,
				columns: model.images.avatar.columns,
				rows: model.images.avatar.rows,
			}
		: undefined;

	const graphPath: string | undefined =
		model.images.contributionGraph?.path;

	return { vm: model.vm, avatarResult, graphPath };
}

// ── MIME detection (exported for testing) ─────────────────────────────
export function guessImageMime(base64: string): string {
	const header = Buffer.from(base64.slice(0, 24), "base64");
	if (
		header[0] === 0x89 &&
		header[1] === 0x50 &&
		header[2] === 0x4e &&
		header[3] === 0x47
	)
		return "image/png";
	if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff)
		return "image/jpeg";
	if (header.slice(0, 3).toString("ascii") === "GIF") return "image/gif";
	if (
		header.slice(0, 4).toString("ascii") === "RIFF" &&
		header.slice(8, 12).toString("ascii") === "WEBP"
	)
		return "image/webp";
	return "image/png";
}
