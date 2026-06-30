/**
 * Codex HTTP client helpers.
 *
 * Framework-independent. No Pi imports.
 */

import { throwCodexHttpError } from "./errors.js";

const DEFAULT_BASE_URL = "https://chatgpt.com/backend-api";
const DEFAULT_CLIENT_VERSION = "1.0.0";

export function normalizeCodexBaseUrl(baseUrl: string | undefined): string {
	const raw =
		baseUrl && baseUrl.trim().length > 0 ? baseUrl : DEFAULT_BASE_URL;
	const normalized = raw.replace(/\/+$/, "");
	if (normalized.endsWith("/codex/responses"))
		return normalized.slice(0, -"/codex/responses".length);
	if (normalized.endsWith("/codex"))
		return normalized.slice(0, -"/codex".length);
	return normalized;
}

export function resolveCodexEndpoint(
	baseUrl: string | undefined,
	path: "models" | "responses",
): string {
	return `${normalizeCodexBaseUrl(baseUrl)}/codex/${path}`;
}

export function buildCodexHeaders(
	token: string,
	accountId: string,
	accept: string,
): Headers {
	const headers = new Headers();
	headers.set("Authorization", `Bearer ${token}`);
	headers.set("chatgpt-account-id", accountId);
	headers.set("originator", "pi");
	headers.set("OpenAI-Beta", "responses=experimental");
	headers.set("accept", accept);
	if (accept === "text/event-stream") {
		headers.set("content-type", "application/json");
	}
	headers.set("User-Agent", "pi-codex-search");
	return headers;
}

export function getDefaultClientVersion(): string {
	return process.env.PI_CODEX_WEB_SEARCH_CLIENT_VERSION ?? DEFAULT_CLIENT_VERSION;
}

/**
 * Fetch JSON from a Codex endpoint, throwing CodexError on non-2xx.
 */
export async function fetchCodexJson<T>(
	endpoint: string | URL,
	options: {
		token: string;
		accountId: string;
		signal?: AbortSignal;
		fetchImpl?: typeof fetch;
	},
): Promise<T> {
	const fetcher = options.fetchImpl ?? fetch;
	const response = await fetcher(endpoint.toString(), {
		headers: buildCodexHeaders(options.token, options.accountId, "application/json"),
		signal: options.signal,
	});
	if (!response.ok) {
		return throwCodexHttpError(response, "Codex request failed", options.accountId);
	}
	return (await response.json()) as T;
}
