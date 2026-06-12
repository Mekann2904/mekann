import { featureStringValue } from "./enabled.js";
import { setToolsActive } from "./toolSurface.js";

export function projectFeatureToolSurface(
	pi: Parameters<typeof setToolsActive>[0],
	feature: string,
	toolNames: readonly string[],
	defaultSurface: string,
	isActive: () => boolean,
): void {
	const surface = featureStringValue(feature, "toolSurface", defaultSurface);
	setToolsActive(pi, toolNames, surface === "always" || isActive());
}
