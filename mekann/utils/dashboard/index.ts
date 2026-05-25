/**
 * Dashboard feature — public API.
 * Only exports what is actually consumed externally.
 */

// Pi extension registration (default export used by Pi's module loader)
export { default } from "./pi-component.js";

// CLI entry
export { parseDashboardArgs } from "./args.js";

// Data collection (used by CLI)
export { collectDashboardData } from "./data.js";
export type { DashboardData, DashboardDataOptions } from "./data.js";

// Rendering (used by CLI)
export { renderDashboardText, dashboardTextColor } from "./render.js";

// ViewModel (used by CLI)
export { formatCurrentRepoLine } from "./view-model.js";
export type { DashboardViewModel } from "./view-model.js";

// Image pipeline (preferred import path for image operations)
export { isLikelyKitty, renderKittyImage, installDashboardCleanup, cleanupDashboardResourcesSync, registerCleanupPath } from "./image-pipeline.js";
export type { DashboardAvatarResult, DashboardImageAssets, PrepareImageOptions } from "./image-pipeline.js";

// GitHub (used by tests and CLI)
export { collectGitHubProfile, parseGitHubViewer } from "./github.js";

// Current repo (used by tests)
export { collectCurrentRepo, parseAheadBehind, parsePorcelainStatus } from "./current-repo.js";
