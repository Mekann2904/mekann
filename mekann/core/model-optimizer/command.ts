/**
 * model-optimizer — /model-optimizer slash command.
 *
 * Subcommands:
 *   /model-optimizer              → help
 *   /model-optimizer status       → show current provider/profile/settings
 *   /model-optimizer stats        → show session-local metrics
 *   /model-optimizer help         → show usage
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { ActiveOptimizationState } from "./types.js";

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerCommands(
	pi: ExtensionAPI,
	state: ActiveOptimizationState,
): void {
	pi.registerCommand("model-optimizer", {
		description: "Show model optimizer status or stats",
		handler: async (args, ctx) => {
			const sub = (args ?? "").trim().toLowerCase();

			if (sub === "stats" || sub === "s") {
				showStats(ctx, state);
			} else if (sub === "status") {
				showStatus(ctx, state);
			} else {
				showHelp(ctx);
			}
		},
	});
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

function showHelp(
	ctx: ExtensionCommandContext,
): void {
	ctx.ui.notify([
		"model-optimizer — OpenAI‑family provider‑aware optimizer",
		"",
		"Subcommands:",
		"  status     Show active provider, profile, and feature toggles",
		"  stats      Show session‑local metrics (tokens, latency, compactions)",
		"  help       Show this help",
	].join("\n"), "info");
}

function showStatus(
	ctx: ExtensionCommandContext,
	state: ActiveOptimizationState,
): void {
	const lines = [
		"Model Optimizer Status",
		"─────────────────────",
		`Enabled:       ${state.featureEnabled ? "yes" : "no"}`,
		`Active:        ${state.enabled ? "yes" : "no"}`,
		`Provider:      ${state.provider ?? "(none)"}`,
		`Model:         ${state.modelId ?? "(none)"}`,
		`Profile:       ${state.profile?.displayName ?? "(none)"}`,
		`Overflow recv: ${state.overflowRecoveryEnabled ? "on" : "off"}`,
		`Metrics:       ${state.metricsEnabled ? "on" : "off"}`,
		`Compaction obs: ${state.compactionObserverEnabled ? "on" : "off"}`,
		`Post-comp hint: ${state.postCompactionHintEnabled ? "on" : "off"}`,
		`Debug log:     ${state.enableDebugLogging ? "on" : "off"}`,
	];
	ctx.ui.notify(lines.join("\n"), "info");
}

function showStats(
	ctx: ExtensionCommandContext,
	state: ActiveOptimizationState,
): void {
	const m = state.metrics;
	const avgLatency = m.requestsObserved > 0
		? `${(m.totalLatencyMs / m.requestsObserved).toFixed(0)} ms`
		: "—";

	const totalTokens = m.totalInputTokens + m.totalOutputTokens;

	const lines = [
		"Model Optimizer Stats (this session)",
		"───────────────────────────────────",
		`Requests observed:  ${m.requestsObserved}`,
		`Total tokens:       ${totalTokens.toLocaleString()} (in ${m.totalInputTokens.toLocaleString()} / out ${m.totalOutputTokens.toLocaleString()})`,
		`Avg latency:        ${avgLatency}`,
		`Overflow recovered: ${m.overflowRecoveries}`,
		`Compactions:       ${m.compactionsObserved} observed / ${m.compactionsCompleted} completed`,
		`Post-comp hints:   ${m.postCompactionHintsInjected}`,
	];

	// Last compaction snapshot
	const lc = m.lastCompaction;
	if (lc) {
		const when = new Date(lc.at).toLocaleTimeString();
		lines.push(`Last compaction:   ${when} — ${lc.provider ?? "?"}/${lc.modelId ?? "?"}` +
			`${lc.tokensBefore != null ? `, ${lc.tokensBefore.toLocaleString()} tokens before` : ""}`);
		if (lc.firstKeptEntryId) {
			lines.push(`  firstKeptEntryId: ${lc.firstKeptEntryId}`);
		}
	}

	// Per-provider breakdown
	const providers = Object.keys(m.byProvider).sort();
	if (providers.length > 0) {
		lines.push("─── by provider ───");
		for (const p of providers) {
			const pm = m.byProvider[p];
			if (!pm) continue;
			const pAvg = pm.requests > 0 ? `${(pm.totalLatencyMs / pm.requests).toFixed(0)} ms` : "—";
			const pTokens = pm.totalInputTokens + pm.totalOutputTokens;
			lines.push(
				`  ${p}: ${pm.requests} req, ${pTokens.toLocaleString()} tok, avg ${pAvg}`,
			);
		}
	}

	// Per-model breakdown
	const models = Object.keys(m.byModel).sort();
	if (models.length > 0) {
		lines.push("─── by model ───");
		for (const md of models) {
			const mm = m.byModel[md];
			if (!mm) continue;
			const mAvg = mm.requests > 0 ? `${(mm.totalLatencyMs / mm.requests).toFixed(0)} ms` : "—";
			const mTokens = mm.totalInputTokens + mm.totalOutputTokens;
			lines.push(
				`  ${md}: ${mm.requests} req, ${mTokens.toLocaleString()} tok, avg ${mAvg}`,
			);
		}
	}

	ctx.ui.notify(lines.join("\n"), "info");
}
