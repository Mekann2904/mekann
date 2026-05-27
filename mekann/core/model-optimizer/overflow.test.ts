/**
 * model-optimizer — unit tests.
 */

import { describe, it, expect } from "vitest";
import { resolveProfile, OPENAI_FAMILY_PROFILE, CODEX_PROFILE, API_FAMILY_MAP } from "./profiles.js";
import { createActiveOptimizationState } from "./activeProfile.js";
import { registerOverflowRecovery } from "./overflow.js";
import type { ActiveOptimizationState } from "./types.js";
import type { Api, Model } from "@earendil-works/pi-ai";

// ---------------------------------------------------------------------------
// Mock Model helper
// ---------------------------------------------------------------------------

function mockModel(api: string, provider = "openai", id = "test-model"): Model<Api> {
	return {
		api: api as Api,
		provider,
		id,
		name: id,
		baseUrl: "https://api.example.com",
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 128000,
		maxTokens: 4096,
	} as Model<Api>;
}

// ---------------------------------------------------------------------------
// Profile lookup
// ---------------------------------------------------------------------------

describe("resolveProfile", () => {
	it("returns OpenAI family profile for openai-responses", () => {
		expect(resolveProfile(mockModel("openai-responses"))).toBe(OPENAI_FAMILY_PROFILE);
	});

	it("returns OpenAI family profile for openai-completions", () => {
		expect(resolveProfile(mockModel("openai-completions"))).toBe(OPENAI_FAMILY_PROFILE);
	});

	it("returns OpenAI family profile for azure-openai-responses", () => {
		expect(resolveProfile(mockModel("azure-openai-responses"))).toBe(OPENAI_FAMILY_PROFILE);
	});

	it("returns Codex profile for openai-codex-responses", () => {
		expect(resolveProfile(mockModel("openai-codex-responses"))).toBe(CODEX_PROFILE);
	});

	it("returns undefined for non-target APIs", () => {
		expect(resolveProfile(mockModel("anthropic-messages"))).toBeUndefined();
		expect(resolveProfile(mockModel("google-generative-ai"))).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// API_FAMILY_MAP completeness
// ---------------------------------------------------------------------------

describe("API_FAMILY_MAP", () => {
	it("every entry has a familyKey and profile", () => {
		for (const [api, entry] of Object.entries(API_FAMILY_MAP)) {
			expect(entry.familyKey).toBeTruthy();
			expect(entry.profile).toBeDefined();
			expect(entry.profile.overflowPatterns.length).toBeGreaterThan(0);
			expect(entry.profile.postCompactionHint).toBeTruthy();
		}
	});
});

// ---------------------------------------------------------------------------
// Active state defaults
// ---------------------------------------------------------------------------

describe("createActiveOptimizationState", () => {
	it("returns disabled state with no profile", () => {
		const state = createActiveOptimizationState();
		expect(state.enabled).toBe(false);
		expect(state.profile).toBeUndefined();
		expect(state.api).toBeUndefined();
	});

	it("overflowRecoveryEnabled defaults to true", () => {
		const state = createActiveOptimizationState();
		expect(state.overflowRecoveryEnabled).toBe(true);
	});

	it("apiFamilyEnabled defaults to empty map", () => {
		const state = createActiveOptimizationState();
		expect(state.apiFamilyEnabled).toEqual({});
	});
});

// ---------------------------------------------------------------------------
// Overflow recovery — unit tests on the normalization logic
// ---------------------------------------------------------------------------

interface FakeAssistantMessage {
	role: string;
	stopReason?: string;
	errorMessage?: string;
}

/** Minimal mock so we can drive registerOverflowRecovery without full pi/types. */
function driveOverflow(
	state: ActiveOptimizationState,
	message: FakeAssistantMessage,
): FakeAssistantMessage | undefined {
	let result: FakeAssistantMessage | undefined;

	// Simulate what pi does: call the handler and capture return
	const pi = {
		on(_event: string, handler: (...args: unknown[]) => unknown) {
			const event = { message };
			const ctx = {} as never;
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
			const ret = handler(event, ctx);
			if (ret && typeof ret === "object" && "message" in ret) {
				result = (ret as { message: FakeAssistantMessage }).message;
			}
		},
	} as never;

	registerOverflowRecovery(pi as Parameters<typeof registerOverflowRecovery>[0], state);
	return result;
}

/**
 * Helper: create an enabled state for a given API.
 * Sets profile, provider, api, and enabled = true.
 */
function stateForApi(api: string): ActiveOptimizationState {
	const s = createActiveOptimizationState();
	const model = mockModel(api);
	const profile = resolveProfile(model);
	s.profile = profile ?? undefined;
	s.provider = model.provider;
	s.api = api;
	s.enabled = !!(profile && s.featureEnabled);
	return s;
}

function makeMsg(
	errorMessage: string,
	stopReason = "error",
): FakeAssistantMessage {
	return { role: "assistant", stopReason, errorMessage };
}

// ---- openai-responses ----

it("normalizes openai 'exceeds the context window'", () => {
	const r = driveOverflow(
		stateForApi("openai-responses"),
		makeMsg("Error: prompt exceeds the context window of 128000 tokens"),
	);
	expect(r?.errorMessage).toBe(
		"context_length_exceeded: Error: prompt exceeds the context window of 128000 tokens",
	);
});

it("normalizes openai maximum context length", () => {
	const r = driveOverflow(stateForApi("openai-responses"), makeMsg("maximum context length exceeded"));
	expect(r?.errorMessage).toMatch(/^context_length_exceeded:/);
});

it("normalizes messages containing but not starting with context_length_exceeded", () => {
	const r = driveOverflow(
		stateForApi("openai-responses"),
		makeMsg("Error: context_length_exceeded: prompt too long"),
	);
	expect(r?.errorMessage).toBe(
		"context_length_exceeded: Error: context_length_exceeded: prompt too long",
	);
});

// ---- openai-codex-responses ----

it("normalizes codex context_length_exceeded", () => {
	const r = driveOverflow(
		stateForApi("openai-codex-responses"),
		makeMsg("Error: context_length_exceeded"),
	);
	expect(r?.errorMessage).toMatch(/^context_length_exceeded:/);
});

// Codex OSS exact overflow fixture (codex-api/src/sse/responses.rs tests)
it("normalizes Codex exact overflow message", () => {
	const r = driveOverflow(
		stateForApi("openai-codex-responses"),
		makeMsg(
			"Your input exceeds the context window of this model. Please adjust your input and try again.",
		),
	);
	expect(r?.errorMessage).toBe(
		"context_length_exceeded: Your input exceeds the context window of this model. Please adjust your input and try again.",
	);
});

it("normalizes Codex exact overflow message with embedded newline", () => {
	const r = driveOverflow(
		stateForApi("openai-codex-responses"),
		makeMsg(
			"Your input exceeds the context window of this model. Please adjust your input and try\nagain.",
		),
	);
	expect(r?.errorMessage).toMatch(/^context_length_exceeded:/);
});

// ---- azure-openai-responses ----

it("normalizes azure-openai-responses overflow", () => {
	const r = driveOverflow(
		stateForApi("azure-openai-responses"),
		makeMsg("Error: prompt exceeds the context window of 128000 tokens"),
	);
	expect(r?.errorMessage).toMatch(/^context_length_exceeded:/);
});

// ---- idempotency ----

it("does not double-prefix messages already starting with context_length_exceeded:", () => {
	const r = driveOverflow(
		stateForApi("openai-responses"),
		makeMsg("context_length_exceeded: prompt too long"),
	);
	expect(r).toBeUndefined(); // no rewrite
});

// ---- exclusion: non-error stops ----

it("does not touch non-error stop reasons", () => {
	const r = driveOverflow(
		stateForApi("openai-responses"),
		makeMsg("context_length_exceeded: something", "stop"),
	);
	expect(r).toBeUndefined();
});

// ---- exclusion: non-assistant ----

it("does not touch user messages", () => {
	const r = driveOverflow(stateForApi("openai-responses"), {
		role: "user",
		stopReason: "error",
		errorMessage: "context_length_exceeded",
	});
	expect(r).toBeUndefined();
});

// ---- exclusion: rate limit ----

it("does NOT normalize rate limit errors", () => {
	const r = driveOverflow(stateForApi("openai-responses"), makeMsg("rate limit exceeded"));
	expect(r).toBeUndefined();
});

// ---- exclusion: auth ----

it("does NOT normalize auth errors", () => {
	const r = driveOverflow(
		stateForApi("openai-codex-responses"),
		makeMsg("invalid api key"),
	);
	expect(r).toBeUndefined();
});

// ---- exclusion: disabled state ----

it("does nothing when state.enabled is false", () => {
	const s = stateForApi("openai-responses");
	s.enabled = false;
	const r = driveOverflow(s, makeMsg("exceeds the context window"));
	expect(r).toBeUndefined();
});

it("does nothing when overflowRecoveryEnabled is false", () => {
	const s = stateForApi("openai-responses");
	s.overflowRecoveryEnabled = false;
	const r = driveOverflow(s, makeMsg("exceeds the context window"));
	expect(r).toBeUndefined();
});

// ---- exclusion: non-target API ----

it("does nothing for non-target API", () => {
	const s = stateForApi("anthropic-messages");
	s.profile = undefined;
	s.enabled = false;
	const r = driveOverflow(s, makeMsg("context_length_exceeded: huge"));
	expect(r).toBeUndefined();
});

// ---- exclusion: empty / missing errorMessage ----

it("does nothing for empty errorMessage", () => {
	const r = driveOverflow(stateForApi("openai-responses"), {
		role: "assistant",
		stopReason: "error",
		errorMessage: "",
	});
	expect(r).toBeUndefined();
});

it("does nothing for missing errorMessage", () => {
	const r = driveOverflow(stateForApi("openai-responses"), {
		role: "assistant",
		stopReason: "error",
	});
	expect(r).toBeUndefined();
});

// ---------------------------------------------------------------------------
// Overflow patterns — regex specificity
// ---------------------------------------------------------------------------

describe("overflow patterns — specificity", () => {
	it("openai family patterns match typical overflow messages", () => {
		const matches = OPENAI_FAMILY_PROFILE.overflowPatterns.filter((p) =>
			p.test("context_length_exceeded: the request exceeds the maximum of 128000"),
		);
		expect(matches.length).toBeGreaterThan(0);
	});

	it("openai family patterns do NOT match rate limit messages", () => {
		const matches = OPENAI_FAMILY_PROFILE.overflowPatterns.filter((p) =>
			p.test(
				"You exceeded your current quota, please check your plan and billing details",
			),
		);
		expect(matches.length).toBe(0);
	});

	it("openai family patterns do NOT match invalid API key", () => {
		const matches = OPENAI_FAMILY_PROFILE.overflowPatterns.filter((p) =>
			p.test("Incorrect API key provided: sk-..."),
		);
		expect(matches.length).toBe(0);
	});

	it("openai family patterns do NOT match timeout", () => {
		const matches = OPENAI_FAMILY_PROFILE.overflowPatterns.filter((p) =>
			p.test("Request timed out"),
		);
		expect(matches.length).toBe(0);
	});

	it("openai family patterns do NOT match network error", () => {
		const matches = OPENAI_FAMILY_PROFILE.overflowPatterns.filter((p) =>
			p.test("Network error: connect ECONNREFUSED"),
		);
		expect(matches.length).toBe(0);
	});

	it("codex patterns do NOT match rate limit", () => {
		const matches = CODEX_PROFILE.overflowPatterns.filter((p) =>
			p.test("Too many requests. Please try again later."),
		);
		expect(matches.length).toBe(0);
	});
});
