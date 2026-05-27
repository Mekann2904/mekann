/**
 * model-optimizer — API-based model optimizer for OpenAI-family models.
 *
 * Detects when a model with a known API protocol is selected and enables:
 * - Context overflow error normalization (→ pi auto-compaction/retry)
 * - Session-local metrics (latency, tokens, overflow recoveries)
 * - /model-optimizer status / stats commands
 * - Compaction lifecycle observer + post-compaction hints
 *
 * Classification is driven by `Model.api` (KnownApi) rather than provider
 * string.  No provider override or custom streaming is performed — the
 * existing pi provider definitions are left untouched.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createActiveOptimizationState, registerActiveProfileTracking } from "./activeProfile.js";
import { registerOverflowRecovery } from "./overflow.js";
import { registerMetrics } from "./metrics.js";
import { registerCompactionObserver } from "./compaction.js";
import { registerCommands } from "./command.js";
import { featureValue } from "../../settings/featureConfig.js";
import { resolveFamilyKey } from "./profiles.js";

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

	function refreshRuntimeConfig(): void {
		state.featureEnabled = readBool("model-optimizer", "enabled", true);
		state.overflowRecoveryEnabled = readBool("model-optimizer", "overflowRecovery.enabled", true);
		state.metricsEnabled = readBool("model-optimizer", "metrics.enabled", true);
		state.compactionObserverEnabled = readBool("model-optimizer", "compactionObserver.enabled", true);
		state.postCompactionHintEnabled = readBool("model-optimizer", "postCompactionHint.enabled", true);
		state.enableDebugLogging = readBool("model-optimizer", "debugLogging", false);

		state.apiFamilyEnabled = {
			openaiFamily: readBool("model-optimizer", "openaiFamily.enabled", true),
			openaiCodex: readBool("model-optimizer", "openaiCodex.enabled", true),
		};

		// Re-evaluate enabled based on current api → family key → setting
		const familyKey = state.api ? resolveFamilyKey(state.api) : undefined;
		state.enabled = !!(state.featureEnabled && state.profile
			&& (!familyKey || state.apiFamilyEnabled[familyKey] !== false));
	}

	// Initial read
	refreshRuntimeConfig();

	// Track current model/api (model_select + session_start)
	registerActiveProfileTracking(pi, state);

	// Overflow recovery (message_end hook)
	registerOverflowRecovery(pi, state);

	// Metrics collection (message_start / message_end hooks)
	registerMetrics(pi, state);

	// Compaction lifecycle observer + post-compaction hints
	registerCompactionObserver(pi, state);

	// Slash command: /model-optimizer status | stats
	registerCommands(pi, state);

	// Re-read settings on every session start (activeProfile.ts already
	// tracks provider/model/api via its own session_start handler)
	pi.on("session_start", () => {
		refreshRuntimeConfig();
	});
}
