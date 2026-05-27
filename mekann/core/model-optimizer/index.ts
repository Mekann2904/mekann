/**
 * model-optimizer — provider-aware model optimizer for OpenAI-family models.
 *
 * Detects when an openai or openai-codex model is selected and enables:
 * - Context overflow error normalization (→ pi auto-compaction/retry)
 * - Provider-specific compaction hints (Phase 2)
 * - Lightweight usage/latency metrics (Phase 2)
 *
 * No provider override or custom streaming is performed — the existing pi
 * provider definitions are left untouched.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createActiveOptimizationState, registerActiveProfileTracking } from "./activeProfile.js";
import { registerOverflowRecovery } from "./overflow.js";
import { featureValue } from "../../settings/featureConfig.js";
import { getOptimizationProfile } from "./profiles.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readBool(feature: string, key: string, fallback: boolean): boolean {
	const v = featureValue(feature, key);
	return typeof v === "boolean" ? v : fallback;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export default function modelOptimizer(pi: ExtensionAPI): void {
	const state = createActiveOptimizationState();

	function refreshRuntimeConfig(model?: { provider: string; id: string }): void {
		state.featureEnabled = readBool("model-optimizer", "enabled", true);
		state.overflowRecoveryEnabled = readBool("model-optimizer", "overflowRecovery.enabled", true);
		state.enableDebugLogging = readBool("model-optimizer", "debugLogging", false);

		state.providerEnabled = {
			openai: readBool("model-optimizer", "openai.enabled", true),
			"openai-codex": readBool("model-optimizer", "openaiCodex.enabled", true),
		};

		// Re-evaluate enabled with current provider (avoids race with activeProfile's session_start)
		if (model) {
			const profile = getOptimizationProfile(model.provider);
			const providerAllowed = state.providerEnabled[model.provider] !== false;
			state.profile = profile;
			state.provider = model.provider;
			state.modelId = model.id;
			state.enabled = !!(state.featureEnabled && profile && providerAllowed);
		} else {
			state.enabled = !!(state.featureEnabled && state.profile
				&& state.providerEnabled[state.provider ?? ""] !== false);
		}
	}

	// Initial read
	refreshRuntimeConfig();

	// Track current model/provider (model_select + session_start)
	registerActiveProfileTracking(pi, state);

	// Overflow recovery (message_end hook)
	registerOverflowRecovery(pi, state);

	// Re-read settings on every session start
	pi.on("session_start", (_event, ctx: ExtensionContext) => {
		refreshRuntimeConfig(ctx.model);
	});
}
