/**
 * Pi TUI overlay dashboard component.
 * Only contains the Component class and Pi extension registration.
 * Rendering logic lives in rendering-pipeline.ts.
 * Kitty image placement workaround lives in kitty-placement.ts.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isFeatureEnabled } from "../../settings/enabled.js";
import type { DashboardRenderModel } from "./view-model-assembler.js";
import {
	renderOverlayPipeline,
	type OverlayRenderingOutput,
} from "./rendering-pipeline.js";
import { scheduleKittyPlacements } from "./kitty-placement.js";

// ── Component interface (minimal) ─────────────────────────────────────
interface Component {
	render(width: number): string[];
	handleInput?(data: string): void;
	invalidate(): void;
}

// ── component ─────────────────────────────────────────────────────────
class DashboardPiComponent implements Component {
	private cachedOutput?: OverlayRenderingOutput;
	private cachedWidth?: number;
	private cachedHeight?: number;

	constructor(
		private readonly model: DashboardRenderModel,
		private readonly close: () => void,
	) {}

	render(width: number): string[] {
		const height = process.stdout.rows || 40;
		if (
			this.cachedOutput &&
			this.cachedWidth === width &&
			this.cachedHeight === height
		) {
			return this.cachedOutput.lines;
		}

		const output = renderOverlayPipeline(this.model, width, height);
		this.cachedOutput = output;
		this.cachedWidth = width;
		this.cachedHeight = height;
		return output.lines;
	}

	/** Return the pipeline output including positioned image placements. */
	getOutput(): OverlayRenderingOutput | undefined {
		return this.cachedOutput;
	}

	handleInput?(data: string): void {
		if (data === "q" || data === "\x1b") this.close();
		if (data === "r") this.invalidate();
	}

	invalidate(): void {
		this.cachedOutput = undefined;
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

// ── Pi extension registration ─────────────────────────────────────────
export default function dashboard(pi: ExtensionAPI): void {
	if (!isFeatureEnabled("dashboard")) return;

	pi.registerCommand("dashboard", {
		description: "Open the Mekann dashboard in Pi TUI",
		handler: async (_args, ctx) => {
			ctx.ui.notify("Loading dashboard...", "info");
			const [{ clearDashboardTerminalArtifactsSync }, assembler] =
				await Promise.all([
					import("./cleanup.js"),
					import("./view-model-assembler.js"),
				]);
			const { assembleDashboardRenderModel } = assembler;
			const model = await assembleDashboardRenderModel(ctx.cwd);
			ctx.ui.setFooter(() => ({ render: () => [], invalidate: () => {} }));
			try {
				let imagesPlaced = false;
				let cancelPlacement: (() => void) | undefined;
				await ctx.ui.custom<void>((tui, _theme, _keybindings, done) => {
					const component = createDashboardPiComponent(model, () =>
						done(undefined),
					);
					return {
						render: (width) => {
							const lines = component.render(width);
							if (!imagesPlaced) {
								imagesPlaced = true;
								const output = component.getOutput();
								if (output && output.imagePlacements.length > 0) {
									cancelPlacement = scheduleKittyPlacements(
										output.imagePlacements,
									);
								}
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
				cancelPlacement?.();
				clearDashboardTerminalArtifactsSync();
				ctx.ui.setFooter(undefined);
			}
		},
	});
}
