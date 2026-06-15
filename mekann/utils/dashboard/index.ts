/**
 * Dashboard feature — public API.
 * Only exports what is actually consumed externally.
 */

// Pi extension registration (default export used by Pi's module loader)
export { default } from "./pi-component.js";

// CLI entry
export { parseDashboardArgs } from "./args.js";

// Rendering pipeline (preferred for new consumers)
export { renderOverlayPipeline } from "./rendering-pipeline.js";
export type {
	OverlayRenderingOutput,
	DashboardPositionedImage,
} from "./rendering-pipeline.js";

// Rendering (used by CLI)
export { renderDashboardText, dashboardTextColor } from "./render.js";

// ViewModel (used by CLI)
export { formatCurrentRepoLine } from "./view-model.js";
export type { DashboardViewModel } from "./view-model.js";

// View model assembler (preferred data source)
export { assembleDashboardRenderModel } from "./view-model-assembler.js";
export type { DashboardRenderModel } from "./view-model-assembler.js";

// Image pipeline (preferred import path for image operations)
export { isLikelyKitty, renderKittyImage, installDashboardCleanup, cleanupDashboardResourcesSync, registerCleanupPath } from "./image-pipeline.js";
export type { DashboardAvatarResult, DashboardImageAssets, PrepareImageOptions } from "./image-pipeline.js";

// GitHub (used by tests and CLI)
export { collectGitHubProfile, parseGitHubViewer } from "./github.js";

// Current repo (used by tests)
export { collectCurrentRepo, parseAheadBehind, parsePorcelainStatus } from "./current-repo.js";
