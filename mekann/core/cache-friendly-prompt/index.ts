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
	type CacheFriendlyRequestRole,
	type RunKeySource,
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

// ---------------------------------------------------------------------------
// Event helpers (Pi-specific, not pure)
// ---------------------------------------------------------------------------

function contextCwd(event: any, ctx: any): string {
	return event?.systemPromptOptions?.cwd ?? ctx?.cwd ?? process.cwd();
}
function modelProvider(ctx: any): string | undefined {
	return ctx?.model?.provider;
}
function modelId(ctx: any): string | undefined {
	return ctx?.model?.id;
}
function pickString(...values: unknown[]): string | undefined {
	for (const value of values)
		if (typeof value === "string" && value.trim()) return value.trim();
	return undefined;
}
function requestIdOf(event: any, ctx: any): string | undefined {
	return pickString(
		event?.requestId,
		event?.request_id,
		event?.id,
		event?.message?.requestId,
		event?.message?.request_id,
		event?.response?.requestId,
		event?.response?.id,
		ctx?.requestId,
		ctx?.request_id,
	);
}
function runKeyWithSource(event: any, ctx: any): {
	runKey: string;
	runKeySource: RunKeySource;
} {
	const candidates: Array<[RunKeySource, unknown]> = [
		["sessionId", event?.sessionId ?? ctx?.sessionId],
		["conversationId", event?.conversationId ?? ctx?.conversationId],
		["session.id", event?.session?.id ?? ctx?.session?.id],
		["runId", event?.runId ?? ctx?.runId],
		["cwd", ctx?.cwd ?? event?.systemPromptOptions?.cwd],
	];
	for (const [source, value] of candidates) {
		const key = pickString(value);
		if (key) return { runKey: key, runKeySource: source };
	}
	return { runKey: "default", runKeySource: "default" };
}
function requestRoleOf(
	event: any,
	ctx: any,
): { requestRole: CacheFriendlyRequestRole; requestRoleSource: string } {
	const envRole = pickString(process.env.PI_SUBAGENT_ROLE);
	if (envRole === "child")
		return {
			requestRole: "subagent",
			requestRoleSource: "env:PI_SUBAGENT_ROLE",
		};

	const explicit = pickString(
		event?.requestRole,
		event?.role,
		event?.agentRole,
		ctx?.requestRole,
		ctx?.role,
		ctx?.agentRole,
	);
	if (explicit) {
		const normalized = explicit.toLowerCase();
		if (
			normalized.includes("subagent") ||
			normalized.includes("sub-agent") ||
			normalized === "child"
		)
			return {
				requestRole: "subagent",
				requestRoleSource: `explicit:${explicit}`,
			};
		if (normalized.includes("tool"))
			return {
				requestRole: "tool",
				requestRoleSource: `explicit:${explicit}`,
			};
		if (normalized.includes("main") || normalized === "root")
			return {
				requestRole: "main",
				requestRoleSource: `explicit:${explicit}`,
			};
	}

	const agentPath = pickString(
		event?.agentPath,
		event?.agent_path,
		event?.agent?.path,
		ctx?.agentPath,
		ctx?.agent_path,
		ctx?.agent?.path,
	);
	if (agentPath) {
		if (agentPath === "/root" || agentPath === "root")
			return { requestRole: "main", requestRoleSource: "agentPath" };
		if (agentPath.startsWith("/root/") || agentPath.includes("subagent"))
			return { requestRole: "subagent", requestRoleSource: "agentPath" };
	}

	const taskName = pickString(
		event?.taskName,
		event?.task_name,
		ctx?.taskName,
		ctx?.task_name,
	);
	if (taskName)
		return { requestRole: "subagent", requestRoleSource: "taskName" };

	return { requestRole: "main", requestRoleSource: "default:root-process" };
}

function messageTimestamp(message: any): string {
	const timestamp = message?.timestamp;
	if (typeof timestamp === "number" && Number.isFinite(timestamp)) {
		const ms =
			timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
		return new Date(ms).toISOString();
	}
	if (typeof timestamp === "string" && timestamp.trim()) {
		const ms = Date.parse(timestamp);
		if (Number.isFinite(ms)) return new Date(ms).toISOString();
	}
	return new Date().toISOString();
}

function actualUsageKey(
	event: any,
	ctx: any,
	message: any,
	normalized: { inputTotalTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens?: number; cacheMissTokens?: number },
): string | null {
	const requestId = requestIdOf(event, ctx);
	const messageId = pickString(message?.id, event?.messageId, event?.id);
	const timestamp = message?.timestamp;
	if (!requestId && !messageId && timestamp === undefined) return null;
	const { runKey } = runKeyWithSource(event, ctx);
	return [
		ctx?.cwd ?? "",
		runKey,
		requestId ?? "",
		messageId ?? "",
		timestamp ?? "",
		normalized.inputTotalTokens,
		normalized.outputTokens,
		normalized.cacheReadTokens,
		normalized.cacheWriteTokens ?? "",
		normalized.cacheMissTokens ?? "",
	].join(":");
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
			rawUsage,
			state: lookup.state,
			fallbackRequestRole: fallbackRole,
			fallbackRequestRoleSource: fallbackRoleSource,
		});

		await appendActualUsageLog(ctx?.cwd ?? process.cwd(), log);
		return undefined;
	});
}
