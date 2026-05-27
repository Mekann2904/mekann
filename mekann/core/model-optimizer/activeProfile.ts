/**
 * model-optimizer — active profile tracking.
 *
 * Listens to model_select and session_start to keep the current provider/model
 * state up to date.  The active state is consulted by overflow and metrics
 * hooks to decide whether optimization should be active for the current turn.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ActiveOptimizationState } from "./types.js";
import { getOptimizationProfile } from "./profiles.js";

// ---------------------------------------------------------------------------
// State factory
// ---------------------------------------------------------------------------

export function createActiveOptimizationState(): ActiveOptimizationState {
	return {
		profile: undefined,
		provider: undefined,
		modelId: undefined,
		enabled: false,
		lastSelectedAt: undefined,
		featureEnabled: true,
		overflowRecoveryEnabled: true,
		enableDebugLogging: false,
		providerEnabled: {},
	};
}

// ---------------------------------------------------------------------------
// State update helpers
// ---------------------------------------------------------------------------

function applyModel(
	state: ActiveOptimizationState,
	provider: string | undefined,
	modelId: string | undefined,
): void {
	const profile = getOptimizationProfile(provider);
	const providerAllowed = !provider || state.providerEnabled[provider] !== false;
	const enabled = !!(state.featureEnabled && profile && providerAllowed);
	state.profile = profile;
	state.provider = provider;
	state.modelId = modelId;
	state.enabled = enabled;
	state.lastSelectedAt = Date.now();
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerActiveProfileTracking(
	pi: ExtensionAPI,
	state: ActiveOptimizationState,
): void {
	// Model switch via /model, Ctrl+P, or session restore
	pi.on("model_select", (event) => {
		applyModel(
			state,
			event.model.provider,
			event.model.id,
		);
	});

	// Session start — the model may already be selected (e.g. restore)
	pi.on("session_start", (_event, ctx: ExtensionContext) => {
		const model = ctx.model;
		if (model) {
			applyModel(state, model.provider, model.id);
		}
	});
}


