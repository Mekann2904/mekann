import { featureValue } from "./featureConfig.js";

/**
 * Returns whether a Mekann feature should expose its LLM/user-visible surface.
 * Missing settings default to enabled so existing installations keep behavior.
 */
export function isFeatureEnabled(feature: string, cwd = process.cwd()): boolean {
	return featureValue(feature, "enabled", cwd) !== false;
}

export function featureStringValue(feature: string, key: string, fallback: string, cwd = process.cwd()): string {
	const value = featureValue(feature, key, cwd);
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}
