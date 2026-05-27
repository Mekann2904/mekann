/**
 * model-optimizer — provider optimization profiles.
 *
 * Each profile defines per-provider static data (overflow patterns, compaction
 * style, display name).  Runtime enable/disable decisions are made in
 * ActiveOptimizationState based on mekann settings.
 */

import type { ModelOptimizationProfile, OptimizedProviderId } from "./types.js";

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

export const OPENAI_PROFILE: ModelOptimizationProfile = {
	provider: "openai",
	displayName: "OpenAI",
	overflowPatterns: [
		/context_length_exceeded/i,
		/maximum context length/i,
		/exceeds the context window/i,
	],
};

export const OPENAI_CODEX_PROFILE: ModelOptimizationProfile = {
	provider: "openai-codex",
	displayName: "OpenAI Codex",
	overflowPatterns: [
		/context_length_exceeded/i,
		/maximum context length/i,
		/exceeds the context window/i,
	],
};

const PROFILES: Record<OptimizedProviderId, ModelOptimizationProfile> = {
	openai: OPENAI_PROFILE,
	"openai-codex": OPENAI_CODEX_PROFILE,
};

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

export function getOptimizationProfile(
	provider?: string,
): ModelOptimizationProfile | undefined {
	if (!provider) return undefined;
	if (provider === "openai") return PROFILES.openai;
	if (provider === "openai-codex") return PROFILES["openai-codex"];
	return undefined;
}
