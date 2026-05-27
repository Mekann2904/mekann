/**
 * model-optimizer — active module tracking.
 *
 * Listens to model_select and session_start to keep the current module/api/model
 * state up to date.  The active state is consulted by overflow, metrics, and
 * compaction hooks to decide whether optimization should be active.
 *
 * Module selection is driven by `Model.api` via the module registry.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { ActiveOptimizationState } from "./types.js";
import { createMetrics } from "./types.js";
import { optimizerModules } from "./modules.js";

// ---------------------------------------------------------------------------
// State factory
// ---------------------------------------------------------------------------

export function createActiveOptimizationState(): ActiveOptimizationState {
	return {
		activeModule: undefined,
		provider: undefined,
		modelId: undefined,
		api: undefined,
		enabled: false,
		lastSelectedAt: undefined,
		featureEnabled: true,
		overflowRecoveryEnabled: true,
		metricsEnabled: true,
		compactionObserverEnabled: true,
		postCompactionHintEnabled: true,
		enableDebugLogging: false,
		apiFamilyEnabled: {},
		metrics: createMetrics(),
	};
}

// ---------------------------------------------------------------------------
// State update helpers
// ---------------------------------------------------------------------------

function applyModel(
	state: ActiveOptimizationState,
	model: Model<Api>,
	ctx?: ExtensionContext,
): void {
	const activeModule = optimizerModules.find((m) => m.supports(model));
	const familyKey = activeModule?.familyKey(model);
	const familyAllowed = !familyKey || state.apiFamilyEnabled[familyKey] !== false;
	const enabled = !!(state.featureEnabled && activeModule && familyAllowed);
	state.activeModule = activeModule;
	state.provider = model.provider;
	state.modelId = model.id;
	state.api = model.api;
	state.enabled = enabled;
	state.lastSelectedAt = Date.now();

	if (state.enableDebugLogging && ctx) {
		const providerName = ctx.modelRegistry?.getProviderDisplayName(model.provider)
			?? model.provider;
		ctx.ui.notify(
			`model-optimizer: provider=${providerName}, model=${model.id}, api=${model.api}, module=${activeModule?.id ?? "none"}, enabled=${enabled}`,
			"info",
		);
	}
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerActiveProfileTracking(
	pi: ExtensionAPI,
	state: ActiveOptimizationState,
): void {
	// Model switch via /model, Ctrl+P, or session restore
	pi.on("model_select", (event, ctx: ExtensionContext) => {
		applyModel(state, event.model, ctx);
	});

	// Session start — the model may already be selected (e.g. restore)
	pi.on("session_start", (_event, ctx: ExtensionContext) => {
		const model = ctx.model;
		if (model) {
			applyModel(state, model, ctx);
		}
	});
}
