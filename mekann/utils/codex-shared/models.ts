/**
 * Codex model fetching, selection, and caching.
 *
 * Framework-independent. No Pi imports.
 */

import type { CodexModel, CodexReasoningEffort } from "./types.js";
import { CodexError, classifyHttpStatus } from "./errors.js";
import { buildCodexHeaders, getDefaultClientVersion, resolveCodexEndpoint } from "./client.js";

// ---------------------------------------------------------------------------
// Fetch & select
// ---------------------------------------------------------------------------

export async function fetchCodexModels(options: {
	token: string;
	accountId: string;
	baseUrl?: string;
	clientVersion?: string;
	fetchImpl?: typeof fetch;
	signal?: AbortSignal;
}): Promise<CodexModel[]> {
	const fetcher = options.fetchImpl ?? fetch;
	const endpoint = new URL(resolveCodexEndpoint(options.baseUrl, "models"));
	endpoint.searchParams.set("client_version", options.clientVersion ?? getDefaultClientVersion());

	const response = await fetcher(endpoint.toString(), {
		headers: buildCodexHeaders(options.token, options.accountId, "application/json"),
		signal: options.signal,
	});

	if (!response.ok) {
		const status = response.status;
		throw new CodexError(
			classifyHttpStatus(status),
			`Codex models request failed: HTTP ${status} ${await response.text()}`,
			status,
		);
	}

	const data = (await response.json()) as {
		models?: Array<{
			slug?: string;
			id?: string;
			model?: string;
			display_name?: string;
			displayName?: string;
			is_default?: boolean;
			isDefault?: boolean;
			supported_reasoning_efforts?: Array<{ effort?: string; reasoningEffort?: string }>;
			supportedReasoningEfforts?: Array<{ effort?: string; reasoningEffort?: string }>;
		}>;
		data?: Array<{
			slug?: string;
			id?: string;
			model?: string;
			display_name?: string;
			displayName?: string;
			is_default?: boolean;
			isDefault?: boolean;
			supported_reasoning_efforts?: Array<{ effort?: string; reasoningEffort?: string }>;
			supportedReasoningEfforts?: Array<{ effort?: string; reasoningEffort?: string }>;
		}>;
	};
	const rawModels = data.models ?? data.data ?? [];
	return rawModels
		.map((m) => ({
			id: m.slug ?? m.id ?? m.model ?? "",
			name: m.display_name ?? m.displayName,
			isDefault: m.is_default ?? m.isDefault,
			supportedReasoningEfforts: normalizeReasoningEfforts(
				m.supported_reasoning_efforts ?? m.supportedReasoningEfforts,
			),
		}))
		.filter((m) => m.id.length > 0);
}

export function selectDefaultModel(models: CodexModel[]): string | undefined {
	return (models.find((m) => m.isDefault) ?? models[0])?.id;
}

// ---------------------------------------------------------------------------
// Effort normalization
// ---------------------------------------------------------------------------

const VALID_REASONING_EFFORTS = new Set<string>([
	"none",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
]);

function normalizeReasoningEfforts(
	raw?: Array<{ effort?: string; reasoningEffort?: string }>,
): CodexReasoningEffort[] | undefined {
	if (!raw || !Array.isArray(raw)) return undefined;
	const efforts = raw
		.map((entry) => entry.effort ?? entry.reasoningEffort)
		.filter((v): v is string => typeof v === "string")
		.filter((v) => VALID_REASONING_EFFORTS.has(v)) as CodexReasoningEffort[];
	return efforts.length > 0 ? efforts : undefined;
}

/**
 * Normalize the requested effort for a given model.
 * If the model lists supportedReasoningEfforts, validate against it.
 * Falls back to "low" if the requested effort is unsupported, or undefined if
 * even "low" is not supported.
 */
export function normalizeReasoningEffortForModel(
	requested: CodexReasoningEffort | undefined,
	model: CodexModel | undefined,
): CodexReasoningEffort | undefined {
	if (!requested) return undefined;

	const supported = model?.supportedReasoningEfforts;
	if (!supported || supported.length === 0) {
		return requested;
	}

	if (supported.includes(requested)) {
		return requested;
	}

	if (supported.includes("low")) {
		return "low";
	}

	return undefined;
}

/**
 * Find a CodexModel by ID from a list.
 */
export function findModelById(models: CodexModel[], id: string): CodexModel | undefined {
	return models.find((m) => m.id === id);
}

// ---------------------------------------------------------------------------
// In-memory cache with in-flight deduplication
// ---------------------------------------------------------------------------

export interface CodexModelsCacheEntry {
	models: CodexModel[];
	defaultModelId: string;
	expiresAt: number;
	modelIds: Set<string>;
}

const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Maximum number of cache entries retained across provider/baseUrl/account
 * combinations. FIFO eviction drops the oldest so provider/account churn in
 * long-running sessions cannot grow the cache unboundedly.
 * See issue #165 (IC-226).
 */
const MAX_CACHE_ENTRIES = 64;

const cache = new Map<string, CodexModelsCacheEntry>();
const inflight = new Map<string, Promise<CodexModelsCacheEntry>>();

export function codexModelsCacheKey(opts: {
	baseUrl: string;
	accountId: string;
	provider: string;
}): string {
	return `${opts.provider}:${opts.baseUrl}:${opts.accountId}`;
}

export async function getCachedCodexModels(
	opts: {
		token: string;
		accountId: string;
		baseUrl?: string;
		provider?: string;
		fetchImpl?: typeof fetch;
		signal?: AbortSignal;
	},
	ttlMs: number = CACHE_TTL_MS,
): Promise<CodexModelsCacheEntry> {
	const key = codexModelsCacheKey({
		provider: opts.provider ?? "openai-codex",
		baseUrl: opts.baseUrl ?? "https://chatgpt.com/backend-api",
		accountId: opts.accountId,
	});

	const now = Date.now();
	const cached = cache.get(key);
	if (cached && cached.expiresAt > now) {
		return cached;
	}

	const existing = inflight.get(key);
	if (existing) return existing;

	const promise = (async () => {
		const models = await fetchCodexModels(opts);
		const defaultModel = selectDefaultModel(models);
		const entry: CodexModelsCacheEntry = {
			models,
			defaultModelId: defaultModel ?? models[0]?.id ?? "",
			expiresAt: Date.now() + ttlMs,
			modelIds: new Set(models.map((m) => m.id)),
		};
		cache.set(key, entry);
		// Sweep TTL-expired entries and trim to MAX_CACHE_ENTRIES *after* the
		// insert so the cache size is always bounded (issue #165, IC-226).
		sweepCodexModelsCache(Date.now());
		return entry;
	})();

	inflight.set(key, promise);
	try {
		return await promise;
	} finally {
		inflight.delete(key);
	}
}

export function invalidateCodexModelsCache(opts: {
	baseUrl: string;
	accountId: string;
	provider?: string;
}): void {
	const key = codexModelsCacheKey({
		provider: opts.provider ?? "openai-codex",
		baseUrl: opts.baseUrl,
		accountId: opts.accountId,
	});
	cache.delete(key);
}

/**
 * Clear all cached model entries. Useful in tests.
 */
export function clearCodexModelsCache(): void {
	cache.clear();
	inflight.clear();
}

/**
 * Remove TTL-expired entries and trim the cache to `MAX_CACHE_ENTRIES`.
 * Invoked after every fresh fetch+insert (the cache-miss path), so expired
 * entries are reclaimed even when their key is never re-requested again
 * (e.g. after a provider/account switch). Exported for tests.
 * See issue #165 (IC-226).
 */
export function sweepCodexModelsCache(now: number = Date.now()): void {
	for (const [k, entry] of cache) {
		if (entry.expiresAt <= now) cache.delete(k);
	}
	while (cache.size > MAX_CACHE_ENTRIES) {
		const oldest = cache.keys().next().value;
		if (oldest === undefined) break;
		cache.delete(oldest);
	}
}

/** Current cache size (test/diagnostic introspection). See issue #165. */
export function codexModelsCacheSize(): number {
	return cache.size;
}
