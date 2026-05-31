/**
 * Pi TUI overlay dashboard component.
 * Only contains the Component class and Pi extension registration.
 * Rendering logic lives in overlay-render.ts.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { featureValue } from "../../settings/featureConfig.js";
import { renderKittyImage } from "./avatar.js";
import { assembleDashboardRenderModel, GRAPH_COLS, GRAPH_ROWS } from "./view-model-assembler.js";
import type { DashboardRenderModel, DashboardImagePlacement } from "./view-model-assembler.js";
import { renderOverlayLines } from "./overlay-render.js";

// ── Component interface (minimal) ─────────────────────────────────────
interface Component {
	render(width: number): string[];
	handleInput?(data: string): void;
	invalidate(): void;
}

// ── component ─────────────────────────────────────────────────────────
class DashboardPiComponent implements Component {
	private cachedResult?: { lines: string[]; graphLineIndex: number };
	private cachedWidth?: number;
	private cachedHeight?: number;

	constructor(
		private readonly model: DashboardRenderModel,
		private readonly close: () => void,
	) {}

	render(width: number): string[] {
		const height = process.stdout.rows || 40;
		if (this.cachedResult && this.cachedWidth === width && this.cachedHeight === height) {
			return this.cachedResult.lines;
		}

		// Build legacy DashboardData shape for overlay-render
		const data = renderModelToLegacyData(this.model);
		const result = renderOverlayLines(data, width, height);
		this.cachedResult = result;
		this.cachedWidth = width;
		this.cachedHeight = height;
		return result.lines;
	}

	/** Return the line index where the graph image should be placed. */
	getGraphLineIndex(): number {
		return this.cachedResult?.graphLineIndex ?? -1;
	}

	handleInput?(data: string): void {
		if (data === "q" || data === "\x1b") this.close();
		if (data === "r") this.invalidate();
	}

	invalidate(): void {
		this.cachedResult = undefined;
		this.cachedWidth = undefined;
		this.cachedHeight = undefined;
	}
}

export function createDashboardPiComponent(
	model: DashboardRenderModel,
	close: () => void,
): DashboardPiComponent {
	return new DashboardPiComponent(model, close);
}

// ── Legacy data conversion (for overlay-render compatibility) ─────────

function renderModelToLegacyData(model: DashboardRenderModel) {
	const { vm, images } = model;
	return {
		vm,
		avatarResult: images.avatar
			? { ok: true as const, path: images.avatar.path, columns: images.avatar.columns, rows: images.avatar.rows }
			: undefined,
		graphPath: images.contributionGraph?.path,
	};
}

// ── Pi extension registration ─────────────────────────────────────────
export default function dashboard(pi: ExtensionAPI): void {
	if (featureValue("dashboard", "enabled") === false) return;

	pi.registerCommand("dashboard", {
		description: "Open the Mekann dashboard in Pi TUI",
		handler: async (_args, ctx) => {
			ctx.ui.notify("Loading dashboard...", "info");
			const model = await assembleDashboardRenderModel(ctx.cwd);
			ctx.ui.setFooter(() => ({ render: () => [], invalidate: () => {} }));
			try {
				let imagesPlaced = false;
				await ctx.ui.custom<void>((tui, _theme, _keybindings, done) => {
					const component = createDashboardPiComponent(model, () => done(undefined));
					return {
						render: (width) => {
							const lines = component.render(width);
							if (!imagesPlaced) {
								imagesPlaced = true;
								setTimeout(() => {
									const { images } = model;
									if (images.avatar) {
										renderKittyImage(
											{ ok: true, path: images.avatar.path, columns: images.avatar.columns, rows: images.avatar.rows },
											{ x: 1, y: 0 },
										);
									}
									if (images.contributionGraph) {
										const graphRow = component.getGraphLineIndex() + 1;
										if (graphRow > 0) {
											renderKittyImage(
												{ ok: true, path: images.contributionGraph.path, columns: GRAPH_COLS, rows: GRAPH_ROWS },
												{ x: 1, y: graphRow },
											);
										}
									}
								}, 80);
							}
							return lines;
						},
						handleInput: (data) => {
							component.handleInput?.(data);
							tui.requestRender();
						},
						invalidate: () => component.invalidate(),
					};
				}, {
					overlay: true,
					overlayOptions: { width: "100%", maxHeight: "100%", row: 0, col: 0, margin: 0 },
				});
			} finally {
				ctx.ui.setFooter(undefined);
			}
		},
	});
}
