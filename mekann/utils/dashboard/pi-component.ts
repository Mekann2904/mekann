/**
 * Pi TUI overlay dashboard component.
 * Only contains the Component class and Pi extension registration.
 * Rendering logic lives in overlay-render.ts.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { renderKittyImage } from "./avatar.js";
import type { DashboardAvatarResult } from "./avatar.js";
import { GRAPH_COLS, GRAPH_ROWS, collectDashboardData, type DashboardData } from "./data.js";
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
		private readonly data: DashboardData,
		private readonly close: () => void,
	) {}

	render(width: number): string[] {
		const height = process.stdout.rows || 40;
		if (this.cachedResult && this.cachedWidth === width && this.cachedHeight === height) {
			return this.cachedResult.lines;
		}

		const result = renderOverlayLines(this.data, width, height);
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
	data: DashboardData,
	close: () => void,
): DashboardPiComponent {
	return new DashboardPiComponent(data, close);
}

// ── Pi extension registration ─────────────────────────────────────────
export default function dashboard(pi: ExtensionAPI): void {
	pi.registerCommand("dashboard", {
		description: "Open the Mekann dashboard in Pi TUI",
		handler: async (_args, ctx) => {
			ctx.ui.notify("Loading dashboard...", "info");
			const data = await collectDashboardData(ctx.cwd);
			const { avatarResult, graphPath } = data;
			ctx.ui.setFooter(() => ({ render: () => [], invalidate: () => {} }));
			try {
				let imagesPlaced = false;
				await ctx.ui.custom<void>((tui, _theme, _keybindings, done) => {
					const component = createDashboardPiComponent(data, () => done(undefined));
					return {
						render: (width) => {
							const lines = component.render(width);
							if (!imagesPlaced) {
								imagesPlaced = true;
								setTimeout(() => {
									if (avatarResult?.ok) {
										renderKittyImage(avatarResult, { x: 1, y: 0 });
									}
									if (graphPath) {
										const graphRow = component.getGraphLineIndex() + 1;
										if (graphRow > 0) {
											renderKittyImage(
												{ ok: true, path: graphPath, columns: GRAPH_COLS, rows: GRAPH_ROWS },
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
