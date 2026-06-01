import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { featureStringValue } from "./enabled.js";
import { setToolsActive } from "./toolSurface.js";

export function projectFeatureToolSurface(
	pi: ExtensionAPI,
	feature: string,
	toolNames: readonly string[],
	defaultSurface: string,
	isActive: () => boolean,
): void {
	const surface = featureStringValue(feature, "toolSurface", defaultSurface);
	setToolsActive(pi, toolNames, surface === "always" || isActive());
}
