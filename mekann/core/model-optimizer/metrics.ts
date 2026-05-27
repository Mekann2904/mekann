/**
 * model-optimizer — session-local metrics collection.
 *
 * Tracks latency, token usage, and cost for assistant messages on
 * openai / openai-codex providers.  All data is in-memory and scoped to the
 * current session.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { ActiveOptimizationState } from "./types.js";

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerMetrics(
	pi: ExtensionAPI,
	state: ActiveOptimizationState,
): void {
	let pendingAssistantStart: number | undefined;

	pi.on("message_start", (event) => {
		if (!state.enabled) return;
		if (!state.metricsEnabled) return;
		if ((event.message as { role?: string }).role !== "assistant") return;
		pendingAssistantStart = Date.now();
	});

	pi.on("message_end", (event) => {
		if (!state.enabled) return;
		if (!state.metricsEnabled) return;
		if (event.message.role !== "assistant") return;

		const latencyMs = pendingAssistantStart != null
			? Date.now() - pendingAssistantStart
			: 0;
		pendingAssistantStart = undefined;

		const usage = event.message.usage;
		const inputTokens = (usage?.input ?? 0) + (usage?.cacheRead ?? 0);
		const outputTokens = usage?.output ?? 0;

		const provider = state.provider ?? "unknown";
		const modelId = state.modelId ?? "unknown";

		// Global totals
		state.metrics.requestsObserved++;
		state.metrics.totalLatencyMs += latencyMs;
		state.metrics.totalInputTokens += inputTokens;
		state.metrics.totalOutputTokens += outputTokens;

		// Per-provider
		const pm = state.metrics.byProvider[provider] ?? {
			requests: 0,
			totalLatencyMs: 0,
			totalInputTokens: 0,
			totalOutputTokens: 0,
		};
		pm.requests++;
		pm.totalLatencyMs += latencyMs;
		pm.totalInputTokens += inputTokens;
		pm.totalOutputTokens += outputTokens;
		state.metrics.byProvider[provider] = pm;

		// Per-model
		const mm = state.metrics.byModel[modelId] ?? {
			requests: 0,
			totalLatencyMs: 0,
			totalInputTokens: 0,
			totalOutputTokens: 0,
		};
		mm.requests++;
		mm.totalLatencyMs += latencyMs;
		mm.totalInputTokens += inputTokens;
		mm.totalOutputTokens += outputTokens;
		state.metrics.byModel[modelId] = mm;
	});
}
