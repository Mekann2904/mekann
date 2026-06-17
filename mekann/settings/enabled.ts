import { getGlobalMekannSettingsPath, getWorkspaceMekannSettingsPath, loadSettings } from "./store.js";

function getPathValue(obj: Record<string, unknown>, key: string): unknown {
	let cur: unknown = obj;
	for (const part of key.split(".")) {
		if (!cur || typeof cur !== "object") return undefined;
		cur = (cur as Record<string, unknown>)[part];
	}
	return cur;
}

const FEATURE_ALIASES: Record<string, string[]> = {
	"command-normalization": ["output-budget"],
};

function featureNamesWithAliases(feature: string): string[] {
	return [...(FEATURE_ALIASES[feature] ?? []), feature];
}

function mergeFeatureConfigs(settings: ReturnType<typeof loadSettings>["settings"], feature: string): Record<string, unknown> {
	return Object.assign({}, ...featureNamesWithAliases(feature).map((name) => settings.features[name] ?? {}));
}

function rawFeatureConfig(feature: string, cwd = process.cwd()): Record<string, unknown> {
	const global = loadSettings(getGlobalMekannSettingsPath());
	const workspace = loadSettings(getWorkspaceMekannSettingsPath(cwd));
	return {
		...mergeFeatureConfigs(global.settings, feature),
		...mergeFeatureConfigs(workspace.settings, feature),
	};
}

function rawFeatureValue(feature: string, key: string, cwd = process.cwd()): unknown {
	return getPathValue(rawFeatureConfig(feature, cwd), key);
}

/**
 * Per-feature default returned when `enabled` is missing from BOTH global
 * and workspace mekann.json. Most features stay enabled-by-default for
 * backward compatibility; this table opts specific features out.
 *
 * ADR-0018: the generic subagent surface (delegate_agent / spawn_agent /
 * message_agent / wait_agent / list_agents / close_agent / agent_results) is
 * intentionally default-off. review-fixer reuses the subagent control plane
 * via its own `createSubagentControl`, independent of this flag, so it keeps
 * working with subagent disabled.
 */
const FEATURE_DEFAULT_WHEN_MISSING: Record<string, boolean> = {
	subagent: false,
};

/**
 * Returns whether a Mekann feature should expose its LLM/user-visible surface.
 * Missing settings default to enabled so existing installations keep behavior,
 * except for features listed in FEATURE_DEFAULT_WHEN_MISSING.
 *
 * Keep this path independent from the settings schema registry: suite indexes call
 * it during Pi startup before deciding which feature modules to import, and pulling
 * in every feature's settings schema here defeats lazy loading.
 */
export function isFeatureEnabled(feature: string, cwd = process.cwd()): boolean {
	const configured = rawFeatureValue(feature, "enabled", cwd);
	if (configured === undefined) {
		return FEATURE_DEFAULT_WHEN_MISSING[feature] ?? true;
	}
	return configured !== false;
}

export function featureStringValue(feature: string, key: string, fallback: string, cwd = process.cwd()): string {
	const value = rawFeatureValue(feature, key, cwd);
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

export function featureBooleanValue(feature: string, key: string, fallback: boolean, cwd = process.cwd()): boolean {
	const value = rawFeatureValue(feature, key, cwd);
	return typeof value === "boolean" ? value : fallback;
}

export function featureRawConfig(feature: string, cwd = process.cwd()): Record<string, unknown> {
	return rawFeatureConfig(feature, cwd);
}
