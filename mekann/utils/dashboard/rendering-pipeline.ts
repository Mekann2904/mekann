/**
 * rendering-pipeline.ts — Dashboard rendering pipeline (deep module).
 *
 * Owns the transformation from DashboardRenderModel to text lines and
 * positioned image placement intents. Pi TUI Adapter and CLI Adapter
 * consume the pipeline output without knowing layout internals or Kitty
 * workaround details.
 *
 * No Pi framework imports.
 */

import type { DashboardRenderModel } from "./view-model-assembler.js";
import { box, contributionText, padEnd } from "./layout.js";
import {
	truncateToWidth,
	BOLD,
	BLUE,
	GREEN,
	MUTED,
	RESET,
	WHITE,
	YELLOW,
} from "./terminal.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** An image with an absolute position within the rendered line grid. */
export interface DashboardPositionedImage {
	kind: "avatar" | "contributionGraph";
	path: string;
	columns: number;
	rows: number;
	/** 0-based row in the lines array where the image top edge sits. */
	startRow: number;
	/** 1-based column offset for the image left edge. */
	startCol: number;
}

/** Full output of the overlay rendering pipeline. */
export interface OverlayRenderingOutput {
	lines: string[];
	imagePlacements: DashboardPositionedImage[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Horizontal column where images are placed (1-based, after the border). */
const IMAGE_START_COL = 1;

// ---------------------------------------------------------------------------
// Overlay rendering pipeline
// ---------------------------------------------------------------------------

/**
 * Produce overlay text lines and positioned image placements from a
 * DashboardRenderModel. This is the single source of truth for which
 * row each image occupies.
 */
export function renderOverlayPipeline(
	model: DashboardRenderModel,
	width: number,
	height: number,
): OverlayRenderingOutput {
	const { vm, images } = model;
	const w = Math.max(20, width);
	const h = Math.max(10, height);
	const lines: string[] = [];
	const imagePlacements: DashboardPositionedImage[] = [];

	// ── profile + avatar row ───────────────────────────────────────
	const profile = vm.profile;
	if (profile.ok) {
		const p = profile.profile;
		if (images.avatar) {
			for (let i = 0; i < images.avatar.rows; i++) lines.push("");
			imagePlacements.push({
				kind: "avatar",
				path: images.avatar.path,
				columns: images.avatar.columns,
				rows: images.avatar.rows,
				startRow: 0,
				startCol: IMAGE_START_COL,
			});
		}
		lines.push(
			`${GREEN}@${p.login}${p.name ? `${MUTED} · ${WHITE}${p.name}${RESET}` : ""}`,
		);
		if (p.bio) lines.push(`${MUTED}${p.bio}${RESET}`);
		if (p.location) lines.push(`${MUTED}⌖ ${p.location}${RESET}`);
		if (p.url) lines.push(`${BLUE}${p.url}${RESET}`);
	} else {
		lines.push(
			`${MUTED}GitHub profile unavailable: ${profile.error}${RESET}`,
		);
	}

	lines.push(""); // spacer

	// ── stats strip ────────────────────────────────────────────────
	if (vm.activitySummary.status === "ready") {
		const s = vm.activitySummary.data;
		const stats: [string, string, string][] = [
			["This week", String(s.contributionsThisWeek), GREEN],
			["This month", String(s.contributionsThisMonth), GREEN],
			["Active days", String(s.activeDaysThisYear), BLUE],
			["PRs", String(s.pullRequests), YELLOW],
			["Issues", String(s.issuesOpened), WHITE],
			["Reviews", String(s.reviews), MUTED],
		];
		const statRow = stats
			.map(([label, value, color]) => {
				return `${BOLD}${color}${value}${RESET} ${MUTED}${label}${RESET}`;
			})
			.join(" ");
		lines.push(truncateToWidth(statRow, w));
	}

	lines.push(""); // spacer

	// ── contribution graph ─────────────────────────────────────────
	if (images.contributionGraph) {
		const label = `${WHITE}Contribution graph${RESET}  ${MUTED}GitHub activity${RESET}`;
		lines.push(padEnd(label, w));
		const graphStartRow = lines.length;
		for (let i = 0; i < images.contributionGraph.rows; i++) lines.push("");
		imagePlacements.push({
			kind: "contributionGraph",
			path: images.contributionGraph.path,
			columns: images.contributionGraph.columns,
			rows: images.contributionGraph.rows,
			startRow: graphStartRow,
			startCol: IMAGE_START_COL,
		});
	} else if (
		vm.contributionGraph.status === "ready" &&
		vm.contributionGraph.data.length
	) {
		lines.push(
			...box({
				title: "CONTRIBUTION GRAPH",
				lines: contributionText(vm.contributionGraph.data),
				width: w,
				height: 9,
			}),
		);
	} else {
		const msg =
			vm.contributionGraph.status === "error"
				? vm.contributionGraph.message
				: "unavailable";
		lines.push(
			...box({ title: "CONTRIBUTION GRAPH", lines: [msg], width: w, height: 4 }),
		);
	}

	lines.push(""); // spacer

	// ── fill to full height ────────────────────────────────────────
	while (lines.length < h - 1) lines.push("");

	// ── footer ─────────────────────────────────────────────────────
	const footer = `${MUTED}q Quit   r Refresh   /dashboard${RESET}`;
	lines.push(padEnd(footer, w));

	return {
		lines: lines.map((l) => truncateToWidth(l, w)),
		imagePlacements,
	};
}
