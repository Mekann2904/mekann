/**
 * model-optimizer — root orchestrator.
 *
 * Detects when a model with a known API protocol is selected and enables:
 * - Context overflow error normalization (→ pi auto-compaction/retry)
 * - Session-local metrics (latency, tokens, overflow recoveries)
 * - /model-optimizer status / stats commands
 * - Compaction lifecycle observer + post-compaction hints
 *
 * Provider-specific logic is delegated to optimizer modules (e.g. `openai/`).
 * This root only handles model tracking, settings, and hook dispatch.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createActiveOptimizationState, registerActiveProfileTracking } from "./activeProfile.js";
import { registerOverflowRecovery } from "./overflow.js";
import { registerMetrics } from "./metrics.js";
import { registerCompactionObserver } from "./compaction.js";
import { registerCommands } from "./command.js";
import { optimizerModules } from "./modules.js";
import { featureBooleanValue } from "../../settings/enabled.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readBool(feature: string, key: string, fallback: boolean): boolean {
	return featureBooleanValue(feature, key, fallback);
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

		// Collect per-family settings from all modules
		const familyEnabled: Record<string, boolean> = {};
		for (const mod of optimizerModules) {
			for (const s of mod.settings) {
				familyEnabled[s.key.replace(/\.enabled$/, "").split(".").pop()!] = readBool("model-optimizer", s.key, s.defaultValue as boolean);
			}
		}
		state.apiFamilyEnabled = familyEnabled;

		// Re-evaluate enabled based on current module + family setting
		if (state.api && state.activeModule) {
			const familyKey = state.activeModule.familyKey(
				{ api: state.api as any, provider: state.provider!, id: state.modelId! } as any,
			);
			state.enabled = !!(state.featureEnabled && state.activeModule
				&& (!familyKey || state.apiFamilyEnabled[familyKey] !== false));
		}
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

	// System-prompt hint injection (every agent start when active module has one)
	pi.on("before_agent_start", (event, ctx: ExtensionContext) => {
		if (!state.enabled) return;
		const module = state.activeModule;
		if (!module?.buildSystemPromptHint) return;

		const modelStub = { provider: state.provider!, id: state.modelId!, api: state.api } as any;
		const hint = module.buildSystemPromptHint({ model: modelStub });
		if (!hint) return;

		const current = (event as { systemPrompt?: string }).systemPrompt ?? "";
		if (current.includes(hint)) return;

		if (state.enableDebugLogging) {
			ctx.ui.notify(
				`model-optimizer: system-prompt hint injected (api=${state.api ?? "?"}, module=${module.id})`,
				"info",
			);
		}

		return {
			systemPrompt: current ? `${current}\n\n${hint}` : hint,
		};
	});

	// Slash command: /model-optimizer status | stats
	registerCommands(pi, state);

	// Re-read settings on every session start
	pi.on("session_start", () => {
		refreshRuntimeConfig();
	});
}
