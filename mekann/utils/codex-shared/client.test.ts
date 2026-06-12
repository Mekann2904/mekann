import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
	normalizeCodexBaseUrl,
	resolveCodexEndpoint,
	buildCodexHeaders,
	getDefaultClientVersion,
} from "./client.js";

describe("normalizeCodexBaseUrl", () => {
	it("returns default URL when undefined", () => {
		expect(normalizeCodexBaseUrl(undefined)).toBe(
			"https://chatgpt.com/backend-api",
		);
	});

	it("removes trailing slashes", () => {
		expect(normalizeCodexBaseUrl("https://example.com/api///")).toBe(
			"https://example.com/api",
		);
	});

	it("strips /codex/responses suffix", () => {
		expect(
			normalizeCodexBaseUrl("https://example.com/api/codex/responses"),
		).toBe("https://example.com/api");
	});

	it("strips /codex suffix", () => {
		expect(normalizeCodexBaseUrl("https://example.com/api/codex")).toBe(
			"https://example.com/api",
		);
	});

	it("does not strip unrelated suffixes", () => {
		expect(normalizeCodexBaseUrl("https://example.com/api/v1")).toBe(
			"https://example.com/api/v1",
		);
	});
});

describe("resolveCodexEndpoint", () => {
	it("resolves models path", () => {
		expect(resolveCodexEndpoint(undefined, "models")).toBe(
			"https://chatgpt.com/backend-api/codex/models",
		);
	});

	it("resolves responses path with custom base", () => {
		expect(
			resolveCodexEndpoint("https://example.com/api", "responses"),
		).toBe("https://example.com/api/codex/responses");
	});
});

describe("buildCodexHeaders", () => {
	it("includes all required headers", () => {
		const headers = buildCodexHeaders("tok123", "acct456", "application/json");
		expect(headers.get("Authorization")).toBe("Bearer tok123");
		expect(headers.get("chatgpt-account-id")).toBe("acct456");
		expect(headers.get("originator")).toBe("pi");
		expect(headers.get("OpenAI-Beta")).toBe("responses=experimental");
		expect(headers.get("accept")).toBe("application/json");
		expect(headers.get("User-Agent")).toBe("pi-codex-search");
	});

	it("sets content-type when accept is text/event-stream", () => {
		const headers = buildCodexHeaders("tok", "acct", "text/event-stream");
		expect(headers.get("content-type")).toBe("application/json");
	});

	it("does not set content-type for other accept values", () => {
		const headers = buildCodexHeaders("tok", "acct", "application/json");
		expect(headers.get("content-type")).toBeNull();
	});
});

describe("getDefaultClientVersion", () => {
	const ORIGINAL = process.env.PI_CODEX_WEB_SEARCH_CLIENT_VERSION;

	beforeEach(() => {
		delete process.env.PI_CODEX_WEB_SEARCH_CLIENT_VERSION;
	});

	afterEach(() => {
		if (ORIGINAL !== undefined) {
			process.env.PI_CODEX_WEB_SEARCH_CLIENT_VERSION = ORIGINAL;
		} else {
			delete process.env.PI_CODEX_WEB_SEARCH_CLIENT_VERSION;
		}
	});

	it("returns default when env var is not set", () => {
		expect(getDefaultClientVersion()).toBe("1.0.0");
	});

	it("returns env var value when set", () => {
		process.env.PI_CODEX_WEB_SEARCH_CLIENT_VERSION = "2.5.0";
		expect(getDefaultClientVersion()).toBe("2.5.0");
	});
});
