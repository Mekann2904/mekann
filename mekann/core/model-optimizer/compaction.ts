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

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ActiveOptimizationState } from "./types.js";
import { getPostCompactionHint } from "./prompts.js";

// ---------------------------------------------------------------------------
// Weakly‑typed event shapes (pi does not export full event types)
// ---------------------------------------------------------------------------

interface SessionBeforeCompactEvent {
	preparation: {
		tokensBefore?: number;
		firstKeptEntryId?: string;
	};
}

interface BeforeAgentStartEvent {
	systemPrompt?: string;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerCompactionObserver(
	pi: ExtensionAPI,
	state: ActiveOptimizationState,
): void {
	// ── session_before_compact — record observation, do NOT replace compaction ──

	pi.on("session_before_compact", (event, ctx: ExtensionContext) => {
		if (!state.enabled) return;
		if (!state.compactionObserverEnabled) return;

		state.metrics.compactionsObserved++;

		const e = event as SessionBeforeCompactEvent;

		state.metrics.lastCompaction = {
			provider: state.provider,
			modelId: state.modelId,
			tokensBefore: e.preparation?.tokensBefore,
			firstKeptEntryId: e.preparation?.firstKeptEntryId,
			at: Date.now(),
		};

		if (state.enableDebugLogging) {
			ctx.ui.notify(
				`model-optimizer: compaction observed (${state.profile?.displayName ?? "?"}), tokensBefore=${e.preparation?.tokensBefore ?? "?"}`,
				"info",
			);
		}

		// Never return a custom compaction — let pi handle the default
	});

	// ── session_compact — mark completion, set up post-compaction hint ──

	pi.on("session_compact", (_event, ctx: ExtensionContext) => {
		if (!state.enabled) return;
		if (!state.compactionObserverEnabled) return;

		state.metrics.compactionsCompleted++;

		if (state.enableDebugLogging) {
			ctx.ui.notify(
				"model-optimizer: compaction completed",
				"info",
			);
		}

		if (state.postCompactionHintEnabled && state.profile) {
			state.pendingPostCompactionHint = {
				provider: state.profile.provider,
				modelId: state.modelId,
				createdAt: Date.now(),
			};
		}
	});

	// ── before_agent_start — inject pending hint into systemPrompt ──

	pi.on("before_agent_start", (event, ctx: ExtensionContext) => {
		const pending = state.pendingPostCompactionHint;
		if (!pending) return;
		if (!state.enabled) return;
		if (!state.postCompactionHintEnabled) return;

		// Consume the hint exactly once
		state.pendingPostCompactionHint = undefined;

		const hint = getPostCompactionHint(pending.provider);
		const e = event as BeforeAgentStartEvent;
		const currentPrompt = e.systemPrompt ?? "";

		state.metrics.postCompactionHintsInjected++;

		if (state.enableDebugLogging) {
			ctx.ui.notify(
				`model-optimizer: post-compaction hint injected (${pending.provider})`,
				"info",
			);
		}

		return {
			systemPrompt: currentPrompt
				? `${currentPrompt}

${hint}`
				: hint,
		};
	});
}
