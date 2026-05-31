import { featureValue } from "./featureConfig.js";

/**
 * Returns whether a Mekann feature should expose its LLM/user-visible surface.
 * Missing settings default to enabled so existing installations keep behavior.
 */
export function isFeatureEnabled(feature: string, cwd = process.cwd()): boolean {
	return featureValue(feature, "enabled", cwd) !== false;
}
