/**
 * kitty-placement.ts — Concentrated Kitty image placement workaround.
 *
 * The Kitty graphics protocol requires images to be placed AFTER the TUI
 * overlay has painted its text, because the overlay compositor's
 * `compositeLineAt` adds padding spaces that overwrite Kitty image cells.
 * This module owns the setTimeout delay and the rendering call so that
 * callers do not need to know these details.
 *
 * No Pi framework imports.
 */

import type { DashboardPositionedImage } from "./rendering-pipeline.js";
import { renderKittyImage } from "./image-pipeline.js";

/** Delay in ms before placing images (lets the overlay compositor paint first). */
const PLACEMENT_DELAY_MS = 80;

/**
 * Schedule Kitty image placements after a short delay.
 * Returns a cancellation function for cleanup.
 */
export function scheduleKittyPlacements(
	imagePlacements: DashboardPositionedImage[],
): () => void {
	let cancelled = false;
	const timer = setTimeout(() => {
		if (cancelled) return;
		for (const placement of imagePlacements) {
			renderKittyImage(
				{ ok: true, path: placement.path, columns: placement.columns, rows: placement.rows },
				{ x: placement.startCol, y: placement.startRow },
			);
		}
	}, PLACEMENT_DELAY_MS);
	return () => {
		cancelled = true;
		clearTimeout(timer);
	};
}
