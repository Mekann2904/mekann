import { featureStringValue } from "./enabled.js";
import { setToolsActive } from "./toolSurface.js";

export type ToolSurfaceMode = "always" | "active" | "on-demand" | "artifact";

function isToolSurfaceMode(value: string): value is ToolSurfaceMode {
	return value === "always" || value === "active" || value === "on-demand" || value === "artifact";
}

export function projectFeatureToolSurface(
	pi: Parameters<typeof setToolsActive>[0],
	feature: string,
	toolNames: readonly string[],
	defaultSurface: ToolSurfaceMode,
	isActive: () => boolean,
): void {
	const configured = featureStringValue(feature, "toolSurface", defaultSurface);
	// Validate the configured value; fall back to the declared default on a typo
	// instead of letting an unknown mode silently behave as "not always".
	const surface = isToolSurfaceMode(configured) ? configured : defaultSurface;
	setToolsActive(pi, toolNames, surface === "always" || isActive());
}
