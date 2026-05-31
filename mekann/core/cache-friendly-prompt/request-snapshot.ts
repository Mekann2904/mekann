/**
 * request-snapshot.ts — Pure reducer functions for cache-friendly-prompt
 * request snapshot lifecycle.
 *
 * Each function takes a snapshot state (and hook-specific inputs) and returns
 * an updated snapshot state or a log payload. No Pi framework imports, no
 * mutable global state, no side effects.
 */

import type { NormalizedActualCacheUsage } from "./actualUsage.js";
import {
	canonicalizeText,
	estimateTokens,
	hashFragment,
	inspectBaseSystemPrompt,
	inspectFinalPayloadText,
	inspectStablePrefix,
	type CacheFriendlyRequestLog,
	type CacheFriendlyRequestRole,
	type PromptFragmentHash,
	type PromptInspectionWarning,
	type PromptFragment,
	type RunKeySource,
	type CacheFriendlySnapshotSource,
} from "../prompt-core/index.js";
import { sha256 } from "../prompt-core/hash.js";
import type { ActualUsageLog } from "./actualUsage.js";

// ---------------------------------------------------------------------------
// Snapshot state
// ---------------------------------------------------------------------------

export type PromptRequestSnapshotState = {
	runKey: string;
	runKeySource: RunKeySource;
	requestId?: string;
	requestRole?: CacheFriendlyRequestRole;
	requestRoleSource?: string;
	snapshotSource: CacheFriendlySnapshotSource;
	createdAt: string;
	baseSystemHash?: string;
	stablePrefixHash: string;
	semiStableHash?: string;
	featureCacheablePrefixHash?: string;
	providerPrefixHash?: string;
	stablePrefixChars: number;
	stablePrefixTokenEstimate?: number;
	semiStableChars?: number;
	semiStableTokenEstimate?: number;
	featureCacheablePrefixChars?: number;
	featureCacheablePrefixTokenEstimate?: number;
	providerPrefixChars?: number;
	providerPrefixTokenEstimate?: number;
	injectedStableFragmentHashes: PromptFragmentHash[];
	injectedSemiStableFragmentHashes: PromptFragmentHash[];
	injectedWarnings: PromptInspectionWarning[];
	latestDynamicFragmentHashes?: PromptFragmentHash[];
	latestDynamicCollectedAt?: string;
	dynamicContextTruncated?: boolean;
	dynamicContextOriginalChars?: number;
	dynamicContextRenderedChars?: number;
	dynamicContextLimitChars?: number;
	totalPromptChars?: number;
	totalPromptTokenEstimate?: number;
};

// ---------------------------------------------------------------------------
// Dynamic context truncation
// ---------------------------------------------------------------------------

const DYNAMIC_CONTEXT_MAX_CHARS = 12_000;

export function truncateDynamicContext(text: string): {
	text: string;
	truncated: boolean;
	originalChars: number;
	renderedChars: number;
	limitChars: number;
} {
	if (text.length <= DYNAMIC_CONTEXT_MAX_CHARS) {
		return {
			text,
			truncated: false,
			originalChars: text.length,
			renderedChars: text.length,
			limitChars: DYNAMIC_CONTEXT_MAX_CHARS,
		};
	}
	const omitted = text.length - DYNAMIC_CONTEXT_MAX_CHARS;
	const rendered = `${text.slice(0, DYNAMIC_CONTEXT_MAX_CHARS)}\n\n[cache-friendly-prompt: omitted ${omitted} trailing chars from dynamic context]`;
	return {
		text: rendered,
		truncated: true,
		originalChars: text.length,
		renderedChars: rendered.length,
		limitChars: DYNAMIC_CONTEXT_MAX_CHARS,
	};
}

// ---------------------------------------------------------------------------
// Text helpers (pure)
// ---------------------------------------------------------------------------

export function joinPromptPartsRaw(
	parts: Array<string | undefined | null>,
): string {
	return parts
		.filter((p): p is string => typeof p === "string" && p.length > 0)
		.join("\n\n");
}

export function joinPromptPartsCanonical(
	parts: Array<string | undefined | null>,
): string {
	return parts
		.map((p) => (typeof p === "string" ? canonicalizeText(p) : ""))
		.filter(Boolean)
		.join("\n\n");
}

export function splitVolatileRuntimeBlock(systemPrompt: string): {
	stableBaseSystemText: string;
	volatileRuntimeText: string;
} {
	const volatileLine =
		/^\s*(Current date|Current working directory|Current cwd|Working directory)\s*:/i;
	const stableLines: string[] = [];
	const volatileLines: string[] = [];
	for (const line of systemPrompt.split(/\n/)) {
		if (volatileLine.test(line)) volatileLines.push(line);
		else stableLines.push(line);
	}
	return {
		stableBaseSystemText: stableLines.join("\n").trimEnd(),
		volatileRuntimeText: volatileLines.join("\n").trim(),
	};
}

// ---------------------------------------------------------------------------
// Warning helpers (pure)
// ---------------------------------------------------------------------------

export function mergeWarnings(
	a: PromptInspectionWarning[],
	b: PromptInspectionWarning[],
): PromptInspectionWarning[] {
	const seen = new Set<string>();
	const out: PromptInspectionWarning[] = [];
	for (const w of [...a, ...b]) {
		const key = `${w.severity}:${w.code}:${w.fragmentId ?? ""}:${w.source ?? ""}:${w.message}`;
		if (!seen.has(key)) {
			seen.add(key);
			out.push(w);
		}
	}
	return out;
}

export function effectivePrefixWarnings(
	fragmentWarnings: PromptInspectionWarning[],
	effectiveProviderPrefixText: string,
): PromptInspectionWarning[] {
	return mergeWarnings(
		fragmentWarnings.filter((w) => w.code !== "SHORT_STABLE_PREFIX"),
		inspectStablePrefix(effectiveProviderPrefixText),
	);
}

// ---------------------------------------------------------------------------
// Payload inspection helpers (pure)
// ---------------------------------------------------------------------------

export function contentText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map((part) =>
			typeof part === "object" &&
			part &&
			(part as any).type === "text" &&
			typeof (part as any).text === "string"
				? (part as any).text
				: "",
		)
		.join("\n");
}

export function fragmentMarkerPrefix(f: PromptFragmentHash): string {
	return `<!-- fragment:${f.source}:${f.id}:${f.kind}:${f.stability}:`;
}

export function messageContainsDynamicMarker(messages: unknown[]): boolean {
	return messages.some((message) => {
		if (!message || typeof message !== "object") return false;
		const msg = message as { customType?: unknown; content?: unknown };
		return (
			msg.customType === "cache-friendly-dynamic-context" ||
			contentText(msg.content).includes(
				"<!-- prompt-fragments:Dynamic turn context -->",
			)
		);
	});
}

export function inspectCacheablePrefixPayloadText(
	payload: unknown,
): PromptInspectionWarning[] {
	const warnings: PromptInspectionWarning[] = [];
	const seen = new WeakSet<object>();
	function addText(value: unknown, label: string): void {
		const text =
			typeof value === "string" ? value : contentText(value);
		if (text.trim())
			warnings.push(...inspectFinalPayloadText(text, label));
	}
	function visit(value: unknown, path: string): void {
		if (!value || typeof value !== "object") return;
		if (seen.has(value)) return;
		seen.add(value);
		if (Array.isArray(value)) {
			value.forEach((v, i) => visit(v, `${path}[${i}]`));
			return;
		}
		const obj = value as Record<string, unknown>;
		for (const field of ["system", "developer", "instructions"])
			addText(obj[field], `${path}.${field}`);
		const role =
			typeof obj.role === "string" ? obj.role.toLowerCase() : "";
		if (role === "system" || role === "developer")
			addText(obj.content, `${path}.${role}.content`);
		for (const [key, child] of Object.entries(obj))
			visit(child, `${path}.${key}`);
	}
	visit(payload, "payload");
	return warnings;
}

export function payloadDynamicPlacementWarnings(
	payload: unknown,
	extractedText?: string,
): PromptInspectionWarning[] {
	const warnings: PromptInspectionWarning[] = [];
	const dynamicMarker =
		"<!-- prompt-fragments:Dynamic turn context -->";
	const stableMarker =
		"<!-- prompt-fragments:Stable extension instructions -->";
	const seen = new WeakSet<object>();
	function textHasDynamic(value: unknown): boolean {
		return typeof value === "string"
			? value.includes(dynamicMarker)
			: contentText(value).includes(dynamicMarker);
	}
	function visit(value: unknown, path: string): void {
		if (!value || typeof value !== "object") return;
		if (seen.has(value)) return;
		seen.add(value);
		if (Array.isArray(value)) {
			value.forEach((v, i) => visit(v, `${path}[${i}]`));
			return;
		}
		const obj = value as Record<string, unknown>;
		const role =
			typeof obj.role === "string" ? obj.role.toLowerCase() : "";
		const cacheableFieldNames = ["system", "developer", "instructions"];
		for (const field of cacheableFieldNames) {
			if (textHasDynamic(obj[field]))
				warnings.push({
					severity: "error",
					code: "DYNAMIC_CONTEXT_IN_CACHEABLE_PREFIX",
					message: `Dynamic context marker appears in cacheable ${field} payload field (${path}.${field}).`,
				});
		}
		if (
			(role === "system" || role === "developer") &&
			textHasDynamic(obj.content)
		)
			warnings.push({
				severity: "error",
				code: "DYNAMIC_CONTEXT_IN_CACHEABLE_PREFIX",
				message: `Dynamic context marker appears in ${role} message content (${path}.content).`,
			});
		for (const [key, child] of Object.entries(obj))
			visit(child, `${path}.${key}`);
	}
	visit(payload, "payload");
	const finalText = extractedText ?? "";
	const dynamicIndex = finalText.indexOf(dynamicMarker);
	const stableIndex = finalText.indexOf(stableMarker);
	if (
		dynamicIndex >= 0 &&
		stableIndex >= 0 &&
		dynamicIndex < stableIndex
	)
		warnings.push({
			severity: "warning",
			code: "DYNAMIC_CONTEXT_BEFORE_STABLE_PREFIX",
			message:
				"Dynamic context marker appears before stable fragment marker in extracted provider payload text.",
		});
	return warnings;
}

// ---------------------------------------------------------------------------
// Reducer: create initial snapshot (from agent-start hook)
// ---------------------------------------------------------------------------

export interface RenderedFragments {
	stableText: string;
	semiStableText: string;
	dynamicText: string;
	stableFragments: Array<{ id: string; source: string; kind: string; stability: string; scope: string; priority: number; version: string; content: string }>;
	semiStableFragments: Array<{ id: string; source: string; kind: string; stability: string; scope: string; priority: number; version: string; content: string }>;
	dynamicFragments: Array<{ id: string; source: string; kind: string; stability: string; scope: string; priority: number; version: string; content: string }>;
	warnings: PromptInspectionWarning[];
}

export interface InitialSnapshotInput {
	runKey: string;
	runKeySource: RunKeySource;
	requestId?: string;
	requestRole?: CacheFriendlyRequestRole;
	requestRoleSource?: string;
	baseSystemText: string;
	rendered: RenderedFragments;
}

export function createInitialSnapshot(
	input: InitialSnapshotInput,
): PromptRequestSnapshotState {
	const { baseSystemText, rendered } = input;

	const { stableBaseSystemText } = splitVolatileRuntimeBlock(baseSystemText);
	const featureCacheablePrefixText = joinPromptPartsCanonical([
		rendered.stableText,
		rendered.semiStableText,
	]);
	const providerPrefixText = joinPromptPartsRaw([
		stableBaseSystemText,
		rendered.stableText,
		rendered.semiStableText,
	]);

	return {
		runKey: input.runKey,
		runKeySource: input.runKeySource,
		requestId: input.requestId,
		requestRole: input.requestRole,
		requestRoleSource: input.requestRoleSource,
		snapshotSource: ("before" + "_agent_start") as PromptRequestSnapshotState["snapshotSource"],
		createdAt: new Date().toISOString(),
		baseSystemHash: stableBaseSystemText
			? sha256(canonicalizeText(stableBaseSystemText))
			: undefined,
		stablePrefixHash: sha256(canonicalizeText(rendered.stableText)),
		semiStableHash: rendered.semiStableText
			? sha256(canonicalizeText(rendered.semiStableText))
			: undefined,
		featureCacheablePrefixHash: sha256(featureCacheablePrefixText),
		providerPrefixHash: sha256(providerPrefixText),
		stablePrefixChars: rendered.stableText.length,
		stablePrefixTokenEstimate: estimateTokens(rendered.stableText),
		semiStableChars: rendered.semiStableText
			? rendered.semiStableText.length
			: undefined,
		semiStableTokenEstimate: rendered.semiStableText
			? estimateTokens(rendered.semiStableText)
			: undefined,
		featureCacheablePrefixChars: featureCacheablePrefixText.length,
		featureCacheablePrefixTokenEstimate: estimateTokens(
			featureCacheablePrefixText,
		),
		providerPrefixChars: providerPrefixText.length,
		providerPrefixTokenEstimate: estimateTokens(providerPrefixText),
		injectedStableFragmentHashes: (rendered.stableFragments as PromptFragment[]).map(
			hashFragment,
		),
		injectedSemiStableFragmentHashes: (rendered.semiStableFragments as PromptFragment[]).map(
			hashFragment,
		),
		injectedWarnings: mergeWarnings(
			effectivePrefixWarnings(rendered.warnings, providerPrefixText),
			inspectBaseSystemPrompt(stableBaseSystemText),
		),
	};
}

// ---------------------------------------------------------------------------
// Reducer: apply dynamic context (from context hook)
// ---------------------------------------------------------------------------

export interface DynamicContextInput {
	dynamicText: string;
	dynamicFragments: Array<{ id: string; source: string; kind: string; stability: string; scope: string; priority: number; version: string; content: string }>;
	fragmentWarnings: PromptInspectionWarning[];
}

export function applyDynamicContext(
	prev: PromptRequestSnapshotState,
	input: DynamicContextInput,
): PromptRequestSnapshotState {
	const truncated = truncateDynamicContext(input.dynamicText);
	const truncationWarning: PromptInspectionWarning[] = truncated.truncated
		? [
				{
					severity: "warning",
					code: "DYNAMIC_CONTEXT_TRUNCATED",
					message: `Dynamic context was truncated from ${truncated.originalChars} to ${truncated.renderedChars} chars before injection.`,
				},
			]
		: [];

	return {
		...prev,
		latestDynamicFragmentHashes: (input.dynamicFragments as PromptFragment[]).map(hashFragment),
		latestDynamicCollectedAt: new Date().toISOString(),
		dynamicContextTruncated: truncated.truncated,
		dynamicContextOriginalChars: truncated.originalChars,
		dynamicContextRenderedChars: truncated.renderedChars,
		dynamicContextLimitChars: truncated.limitChars,
		injectedWarnings: mergeWarnings(prev.injectedWarnings, [
			...input.fragmentWarnings.filter((w) =>
				w.fragmentId
					? input.dynamicFragments.some((f) => f.id === w.fragmentId)
					: false,
			),
			...truncationWarning,
		]),
	};
}

// ---------------------------------------------------------------------------
// Reducer: apply provider request (from before_provider_request hook)
// ---------------------------------------------------------------------------

export interface ProviderRequestInput {
	finalText: string;
	payload: unknown;
}

export function applyProviderRequest(
	prev: PromptRequestSnapshotState,
	input: ProviderRequestInput,
): PromptRequestSnapshotState {
	return {
		...prev,
		totalPromptChars: input.finalText.length,
		totalPromptTokenEstimate: estimateTokens(input.finalText),
	};
}

export function computeProviderRequestWarnings(
	prev: PromptRequestSnapshotState,
	payload: unknown,
	extractedText: string,
): PromptInspectionWarning[] {
	return mergeWarnings(
		mergeWarnings(
			prev.injectedWarnings,
			inspectCacheablePrefixPayloadText(payload),
		),
		payloadDynamicPlacementWarnings(payload, extractedText),
	);
}

// ---------------------------------------------------------------------------
// Reducer: build request log payload
// ---------------------------------------------------------------------------

export interface RequestLogInput {
	runKey: string;
	runKeySource: RunKeySource;
	requestId?: string;
	correlationConfidence: "requestId_matched" | "providerModel_fifo" | "runKey_latest" | "missing";
	provider: string | undefined;
	model: string | undefined;
	finalText: string;
	promptProviderIds: string[];
	fragmentHashes: PromptFragmentHash[];
	warnings: PromptInspectionWarning[];
	state: PromptRequestSnapshotState | null;
	fallbackRequestRole?: CacheFriendlyRequestRole;
	fallbackRequestRoleSource?: string;
}

export function buildRequestLog(input: RequestLogInput): CacheFriendlyRequestLog {
	const s = input.state;
	return {
		timestamp: new Date().toISOString(),
		runKey: input.runKey,
		runKeySource: input.runKeySource,
		requestId: input.requestId,
		requestRole: s?.requestRole ?? input.fallbackRequestRole,
		requestRoleSource:
			s?.requestRoleSource ?? input.fallbackRequestRoleSource,
		snapshotSource: s?.snapshotSource ?? "missing",
		correlationConfidence: input.correlationConfidence,
		provider: input.provider,
		model: input.model,
		baseSystemHash: s?.baseSystemHash,
		stablePrefixHash: s?.stablePrefixHash ?? "",
		stablePrefixChars: s?.stablePrefixChars ?? 0,
		stablePrefixTokenEstimate: s?.stablePrefixTokenEstimate,
		semiStableHash: s?.semiStableHash,
		semiStableChars: s?.semiStableChars,
		semiStableTokenEstimate: s?.semiStableTokenEstimate,
		featureCacheablePrefixHash: s?.featureCacheablePrefixHash,
		featureCacheablePrefixChars: s?.featureCacheablePrefixChars,
		featureCacheablePrefixTokenEstimate:
			s?.featureCacheablePrefixTokenEstimate,
		providerPrefixHash: s?.providerPrefixHash,
		providerPrefixChars: s?.providerPrefixChars,
		providerPrefixTokenEstimate: s?.providerPrefixTokenEstimate,
		totalPromptChars: input.finalText.length,
		totalPromptTokenEstimate: estimateTokens(input.finalText),
		promptProviderIds: input.promptProviderIds,
		fragmentHashes: input.fragmentHashes,
		injectedStableFragmentHashes:
			s?.injectedStableFragmentHashes ?? [],
		injectedSemiStableFragmentHashes:
			s?.injectedSemiStableFragmentHashes ?? [],
		latestDynamicFragmentHashes: s?.latestDynamicFragmentHashes,
		latestDynamicCollectedAt: s?.latestDynamicCollectedAt,
		dynamicContextTruncated: s?.dynamicContextTruncated,
		dynamicContextOriginalChars: s?.dynamicContextOriginalChars,
		dynamicContextRenderedChars: s?.dynamicContextRenderedChars,
		dynamicContextLimitChars: s?.dynamicContextLimitChars,
		warnings: input.warnings,
	};
}

// ---------------------------------------------------------------------------
// Reducer: build actual usage log payload
// ---------------------------------------------------------------------------

export interface ActualUsageLogInput {
	messageTimestamp: string;
	runKey: string;
	requestId?: string;
	provider: string | undefined;
	model: string | undefined;
	correlationConfidence: "requestId_matched" | "providerModel_fifo" | "runKey_latest" | "missing";
	normalized: NormalizedActualCacheUsage;
	usageSource: "pi_normalized_usage" | "provider_raw_usage";
	rawUsage?: unknown;
	state: PromptRequestSnapshotState | null;
	fallbackRequestRole?: CacheFriendlyRequestRole;
	fallbackRequestRoleSource?: string;
}

export function buildActualUsageLog(
	input: ActualUsageLogInput,
): ActualUsageLog {
	const s = input.state;
	return {
		timestamp: input.messageTimestamp,
		requestId: input.requestId,
		runKey: input.runKey,
		requestRole: s?.requestRole ?? input.fallbackRequestRole,
		requestRoleSource:
			s?.requestRoleSource ?? input.fallbackRequestRoleSource,
		provider: input.provider,
		model: input.model,
		correlationConfidence: input.correlationConfidence,
		baseSystemHash: s?.baseSystemHash,
		stablePrefixHash: s?.stablePrefixHash,
		featureCacheablePrefixHash: s?.featureCacheablePrefixHash,
		providerPrefixHash: s?.providerPrefixHash,
		providerPrefixChars: s?.providerPrefixChars,
		stablePrefixChars: s?.stablePrefixChars,
		semiStableChars: s?.semiStableChars,
		totalPromptChars: s?.totalPromptChars,
		latestDynamicFragmentHashes: s?.latestDynamicFragmentHashes,
		dynamicContextTruncated: s?.dynamicContextTruncated,
		dynamicContextOriginalChars: s?.dynamicContextOriginalChars,
		dynamicContextRenderedChars: s?.dynamicContextRenderedChars,
		dynamicContextLimitChars: s?.dynamicContextLimitChars,
		inputTotalTokens: input.normalized.inputTotalTokens,
		outputTokens: input.normalized.outputTokens,
		cacheReadTokens: input.normalized.cacheReadTokens,
		cacheWriteTokens: input.normalized.cacheWriteTokens,
		cacheMissTokens: input.normalized.cacheMissTokens,
		tokenHitRate: input.normalized.tokenHitRate,
		cacheableReadRate: input.normalized.cacheableReadRate,
		usageSource: input.usageSource,
		rawUsage: input.rawUsage,
	};
}
