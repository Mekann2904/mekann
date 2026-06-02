/**
 * cache-friendly-prompt/index.ts — Pi lifecycle hook Adapter.
 *
 * Delegates snapshot creation, correlation, and log payload shaping to
 * request-snapshot.ts (pure reducers) and snapshot-registry.ts (state
 * management). This file only owns Pi hook wiring and config.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { normalizeActualCacheUsage } from "./actualUsage.js";
import {
	appendActualUsageLog,
	appendCacheFriendlyLog,
	configureCacheFriendlyReports,
	type ReportGenerationMode,
} from "./logs.js";
import {
	collectPromptFragments,
	extractTextFromProviderPayload,
	listPromptProviders,
	renderPromptFragments,
} from "../prompt-core/index.js";
import {
	applyDynamicContext,
	applyProviderRequest,
	buildActualUsageLog,
	buildRequestLog,
	computeProviderRequestWarnings,
	contentText,
	createInitialSnapshot,
	fragmentMarkerPrefix,
	messageContainsDynamicMarker,
	splitVolatileRuntimeBlock,
	truncateDynamicContext,
	type PromptRequestSnapshotState,
} from "./request-snapshot.js";
import { PromptRequestSnapshotRegistry } from "./snapshot-registry.js";
import {
	actualUsageKey,
	contextCwd,
	messageTimestamp,
	modelId,
	modelProvider,
	pickString,
	requestIdOf,
	requestRoleOf,
	runKeyWithSource,
} from "./request-correlation.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export type CacheFriendlyPromptConfig = {
	/** @deprecated stablePrefixHash is stable-only; base system is tracked by baseSystemHash/providerPrefixHash. */
	includeBaseSystemPromptInStableHash?: boolean;
	logRequests: boolean;
	notifyOnWarnings: boolean;
	reportMode: ReportGenerationMode;
	reportDebounceMs: number;
};

const DEFAULT_CONFIG: CacheFriendlyPromptConfig = {
	logRequests: true,
	notifyOnWarnings: false,
	reportMode: "debounce",
	reportDebounceMs: 1000,
};

function selectedToolNames(options: any): string[] {
	const selected = options?.selectedTools;
	if (!Array.isArray(selected)) return [];
	return selected.map((tool: any) => String(tool?.name ?? tool)).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

export default function cacheFriendlyPromptExtension(
	pi: ExtensionAPI,
	config?: Partial<CacheFriendlyPromptConfig>,
): void {
	const cfg = { ...DEFAULT_CONFIG, ...config };
	configureCacheFriendlyReports({
		mode: cfg.reportMode,
		debounceMs: cfg.reportDebounceMs,
	});

	const registry = new PromptRequestSnapshotRegistry();

	// ── before_agent_start ──────────────────────────────────────────

	pi.on("before_agent_start", async (event: any, ctx: any) => {
		const fragments = await collectPromptFragments({
			cwd: contextCwd(event, ctx),
			provider: modelProvider(ctx),
			model: modelId(ctx),
		});
		const rendered = renderPromptFragments(fragments);
		const baseSystemText =
			typeof event.systemPrompt === "string" ? event.systemPrompt : "";
		const { stableBaseSystemText, volatileRuntimeText } =
			splitVolatileRuntimeBlock(baseSystemText);

		const { runKey, runKeySource } = runKeyWithSource(event, ctx);
		const requestId = requestIdOf(event, ctx);
		const { requestRole, requestRoleSource } = requestRoleOf(event, ctx);

		const state = createInitialSnapshot({
			runKey,
			runKeySource,
			requestId,
			requestRole,
			requestRoleSource,
			baseSystemText,
			rendered,
			selectedTools: selectedToolNames(event?.systemPromptOptions),
		});

		registry.rememberRunState(runKey, state);

		return {
			systemPrompt: [
				stableBaseSystemText,
				rendered.stableText,
				rendered.semiStableText,
				volatileRuntimeText
					? `<!-- cache-friendly-prompt:Volatile runtime context -->\n${volatileRuntimeText}`
					: "",
			]
				.filter(Boolean)
				.join("\n\n"),
		};
	});

	// ── context ─────────────────────────────────────────────────────

	pi.on("context", async (event: any, ctx: any) => {
		const messages = event.messages ?? [];
		if (messageContainsDynamicMarker(messages)) return { messages };

		const fragments = await collectPromptFragments({
			cwd: ctx?.cwd ?? process.cwd(),
			provider: modelProvider(ctx),
			model: modelId(ctx),
		});
		const rendered = renderPromptFragments(fragments);
		const { runKey } = runKeyWithSource(event, ctx);
		const prev =
			registry.getByRunKey(runKey) ??
			registry.getByRunKey(ctx?.cwd ?? "");
		const truncated = truncateDynamicContext(rendered.dynamicText);

		if (prev) {
			const updated = applyDynamicContext(prev, {
				dynamicText: rendered.dynamicText,
				dynamicFragments: rendered.dynamicFragments,
				fragmentWarnings: rendered.warnings,
			});
			registry.rememberRunState(updated.runKey, updated);
		}

		if (!rendered.dynamicText.trim()) return { messages };
		return {
			messages: [
				...messages,
				{
					role: "user",
					customType: "cache-friendly-dynamic-context",
					content: [{ type: "text", text: truncated.text }],
				},
			],
		};
	});

	// ── before_provider_request ─────────────────────────────────────

	pi.on("before_provider_request", async (event: any, ctx: any) => {
		const finalText = extractTextFromProviderPayload(event?.payload);
		const { runKey } = runKeyWithSource(event, ctx);
		const requestId = requestIdOf(event, ctx);

		const lookup = registry.lookupForProviderRequest({
			requestId,
			runKey,
			cwd: ctx?.cwd ?? process.cwd(),
		});
		const lastState = lookup.state;

		const dynamicHashes =
			lastState?.latestDynamicFragmentHashes ?? [];
		const fragmentHashes = [
			...(lastState?.injectedStableFragmentHashes ?? []),
			...(lastState?.injectedSemiStableFragmentHashes ?? []),
			...dynamicHashes,
		];
		const sentDynamicIds = dynamicHashes
			.filter((f) => finalText.includes(fragmentMarkerPrefix(f)))
			.map((f) => f.id);
		if (sentDynamicIds.length > 0) {
			try {
				(pi as any).events?.emit?.(
					"cache-friendly-prompt:dynamic-tail-sent",
					{ fragmentIds: sentDynamicIds },
				);
			} catch {}
		}

		const warnings = computeProviderRequestWarnings(
			lastState ?? {
				runKey,
				runKeySource: lookup.correlationConfidence === "missing" ? "default" as const : runKeyWithSource(event, ctx).runKeySource,
				snapshotSource: "before_agent_start",
				createdAt: new Date().toISOString(),
				stablePrefixHash: "",
				stablePrefixChars: 0,
				injectedStableFragmentHashes: [],
				injectedSemiStableFragmentHashes: [],
				injectedWarnings: [],
			},
			event?.payload,
			finalText,
		);

		if (lastState) {
			const updated = applyProviderRequest(lastState, {
				finalText,
				payload: event?.payload,
			});
			registry.rememberRunState(updated.runKey, updated);
			registry.rememberProviderModelState(
				runKey,
				modelProvider(ctx),
				modelId(ctx),
				updated,
			);
		}

		if (cfg.logRequests) {
			const { requestRole: fallbackRole, requestRoleSource: fallbackRoleSource } =
				requestRoleOf(event, ctx);
			const log = buildRequestLog({
				runKey,
				runKeySource: runKeyWithSource(event, ctx).runKeySource,
				requestId,
				correlationConfidence: lookup.correlationConfidence,
				provider: modelProvider(ctx),
				model: modelId(ctx),
				finalText,
				promptProviderIds: listPromptProviders().map((p) => p.id),
				fragmentHashes,
				warnings,
				state: lastState,
				fallbackRequestRole: fallbackRole,
				fallbackRequestRoleSource: fallbackRoleSource,
			});
			await appendCacheFriendlyLog(ctx?.cwd ?? process.cwd(), log);
		}

		if (
			cfg.notifyOnWarnings &&
			warnings.some((w) => w.severity === "error")
		)
			ctx?.ui?.notify?.(
				"Cache-friendly prompt warnings detected",
				"warning",
			);

		return undefined;
	});

	// ── message_end ─────────────────────────────────────────────────

	pi.on("message_end", async (event: any, ctx: any) => {
		if (!cfg.logRequests) return undefined;
		const message = event?.message;
		if (message?.role !== "assistant") return undefined;
		const rawUsage = message?.usage;
		if (!rawUsage) return undefined;

		const provider =
			modelProvider(ctx) ?? pickString(message.provider, event?.provider);
		const normalized = normalizeActualCacheUsage(provider, rawUsage);
		if (!normalized) return undefined;

		const key = actualUsageKey(event, ctx, message, normalized);
		if (key && !registry.rememberActualUsageKey(key)) return undefined;

		const { runKey } = runKeyWithSource(event, ctx);
		const requestId = requestIdOf(event, ctx);
		const actualModel =
			modelId(ctx) ?? pickString(message.model, event?.model);

		const lookup = registry.lookupForActualUsage({
			requestId,
			runKey,
			cwd: ctx?.cwd ?? process.cwd(),
			provider,
			model: actualModel,
		});

		const { requestRole: fallbackRole, requestRoleSource: fallbackRoleSource } =
			requestRoleOf(event, ctx);

		const log = buildActualUsageLog({
			messageTimestamp: messageTimestamp(message),
			runKey,
			requestId,
			provider,
			model: actualModel,
			correlationConfidence: lookup.correlationConfidence,
			normalized,
			usageSource: normalized.usageSource,
			rawUsage,
			state: lookup.state,
			fallbackRequestRole: fallbackRole,
			fallbackRequestRoleSource: fallbackRoleSource,
		});

		await appendActualUsageLog(ctx?.cwd ?? process.cwd(), log);
		return undefined;
	});
}
