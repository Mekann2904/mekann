/**
 * Overlay rendering — backward-compatible shim over the rendering pipeline.
 *
 * Accepts both the legacy DashboardData shape and the newer
 * DashboardRenderModel so that existing consumers continue to work.
 * Internally delegates to rendering-pipeline.ts.
 */

import type { DashboardData } from "./data.js";
import type { DashboardRenderModel } from "./view-model-assembler.js";
import {
	renderOverlayPipeline,
	type OverlayRenderingOutput,
} from "./rendering-pipeline.js";

export type { OverlayRenderResult } from "./rendering-pipeline.js";
export type { OverlayRenderingOutput } from "./rendering-pipeline.js";

// ── Public API ────────────────────────────────────────────────────────

export interface OverlayRenderResult {
	lines: string[];
	graphLineIndex: number;
}

/**
 * Render dashboard overlay lines from collected data.
 * Accepts both legacy DashboardData and modern DashboardRenderModel.
 */
export function renderOverlayLines(
	source: DashboardData | DashboardRenderModel,
	width: number,
	height: number,
): OverlayRenderResult {
	const model = isRenderModel(source) ? source : legacyToRenderModel(source);
	const output = renderOverlayPipeline(model, width, height);
	const graphLineIndex = output.lines.findIndex((l) =>
		l.includes("Contribution graph"),
	);
	return { lines: output.lines, graphLineIndex };
}

/**
 * Render overlay using the pipeline directly, returning the full output
 * including positioned image placements.
 */
export function renderOverlay(
	model: DashboardRenderModel,
	width: number,
	height: number,
): OverlayRenderingOutput {
	return renderOverlayPipeline(model, width, height);
}

// ── Type discrimination ──────────────────────────────────────────────

function isRenderModel(source: unknown): source is DashboardRenderModel {
	return (
		typeof source === "object" &&
		source !== null &&
		"images" in source &&
		!("avatarResult" in source)
	);
}

function legacyToRenderModel(data: DashboardData): DashboardRenderModel {
	const { vm, avatarResult, graphPath } = data;
	return {
		vm,
		images: {
			avatar: avatarResult?.ok
				? {
						kind: "avatar" as const,
						path: avatarResult.path,
						columns: avatarResult.columns,
						rows: avatarResult.rows,
					}
				: undefined,
			contributionGraph: graphPath
				? {
						kind: "contributionGraph" as const,
						path: graphPath,
						columns: 140,
						rows: 10,
					}
				: undefined,
		},
	};
}
