/**
 * Codex model fetching, selection, and caching.
 *
 * Framework-independent. No Pi imports.
 */

import type { CodexModel } from "./types.js";
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
			is_default?: boolean;
		}>;
	};
	return (data.models ?? [])
		.map((m) => ({
			id: m.slug ?? m.id ?? m.model ?? "",
			name: m.display_name,
			isDefault: m.is_default,
		}))
		.filter((m) => m.id.length > 0);
}

export function selectDefaultModel(models: CodexModel[]): string | undefined {
	return (models.find((m) => m.isDefault) ?? models[0])?.id;
}

// ---------------------------------------------------------------------------
// In-memory cache with in-flight deduplication
// ---------------------------------------------------------------------------

export interface CodexModelsCacheEntry {
	models: CodexModel[];
	defaultModelId: string;
	expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;

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
		};
		cache.set(key, entry);
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
