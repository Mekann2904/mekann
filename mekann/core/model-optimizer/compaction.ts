/**
 * model-optimizer — compaction lifecycle observer and post-compaction hints.
 *
 * Observes session_before_compact / session_compact to record compaction
 * events in metrics, and injects a provider-aware continuation hint on the
 * next before_agent_start when a compaction just completed and the active
 * provider is openai or openai-codex.
 *
 * Custom compaction summaries are never returned — pi's default compaction
 * behaviour is left intact.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { ActiveOptimizationState, OptimizedProviderId } from "./types.js";
import { getOptimizationProfile } from "./profiles.js";
import { getPostCompactionHint } from "./prompts.js";

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerCompactionObserver(
	pi: ExtensionAPI,
	state: ActiveOptimizationState,
): void {
	// ── session_before_compact — record observation, do NOT replace compaction ──

	pi.on("session_before_compact", (event) => {
		if (!state.enabled) return;
		if (!state.compactionObserverEnabled) return;

		state.metrics.compactionsObserved++;

		const preparation = (event as { preparation?: { tokensBefore?: number; firstKeptEntryId?: string } }).preparation;

		state.metrics.lastCompaction = {
			provider: state.provider,
			modelId: state.modelId,
			tokensBefore: preparation?.tokensBefore,
			firstKeptEntryId: preparation?.firstKeptEntryId,
			at: Date.now(),
		};

		// Never return a custom compaction — let pi handle the default
	});

	// ── session_compact — mark completion, set up post-compaction hint ──

	pi.on("session_compact", () => {
		if (!state.enabled) return;
		if (!state.compactionObserverEnabled) return;

		state.metrics.compactionsCompleted++;

		if (state.postCompactionHintEnabled && state.profile) {
			state.pendingPostCompactionHint = {
				provider: state.profile.provider,
				modelId: state.modelId,
				createdAt: Date.now(),
			};
		}
	});

	// ── before_agent_start — inject pending hint into systemPrompt ──

	pi.on("before_agent_start", (event, _ctx) => {
		const pending = state.pendingPostCompactionHint;
		if (!pending) return;
		if (!state.enabled) return;
		if (!state.postCompactionHintEnabled) return;

		// Consume the hint exactly once
		state.pendingPostCompactionHint = undefined;

		const hint = getPostCompactionHint(pending.provider);
		const currentPrompt = (event as { systemPrompt?: string }).systemPrompt ?? "";

		state.metrics.postCompactionHintsInjected++;

		return {
			systemPrompt: currentPrompt
				? `${currentPrompt}\n\n${hint}`
				: hint,
		};
	});
}
