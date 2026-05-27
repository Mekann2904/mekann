/**
 * model-optimizer — unit tests.
 */

import { describe, it, expect } from "vitest";
import { getOptimizationProfile, OPENAI_PROFILE, OPENAI_CODEX_PROFILE } from "./profiles.js";
import { createActiveOptimizationState } from "./activeProfile.js";
import { registerOverflowRecovery } from "./overflow.js";
import type { ActiveOptimizationState } from "./types.js";

// ---------------------------------------------------------------------------
// Profile lookup
// ---------------------------------------------------------------------------

describe("getOptimizationProfile", () => {
	it("returns openai profile for 'openai'", () => {
		expect(getOptimizationProfile("openai")).toBe(OPENAI_PROFILE);
	});

	it("returns codex profile for 'openai-codex'", () => {
		expect(getOptimizationProfile("openai-codex")).toBe(OPENAI_CODEX_PROFILE);
	});

	it("returns undefined for non-target providers", () => {
		expect(getOptimizationProfile("anthropic")).toBeUndefined();
		expect(getOptimizationProfile("google")).toBeUndefined();
	});

	it("returns undefined for undefined input", () => {
		expect(getOptimizationProfile(undefined)).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// Active state transitions
// ---------------------------------------------------------------------------

describe("createActiveOptimizationState", () => {
	it("returns disabled state with no profile", () => {
		const state = createActiveOptimizationState();
		expect(state.enabled).toBe(false);
		expect(state.profile).toBeUndefined();
		expect(state.provider).toBeUndefined();
	});

	it("overflowRecoveryEnabled defaults to true", () => {
		const state = createActiveOptimizationState();
		expect(state.overflowRecoveryEnabled).toBe(true);
	});

	it("providerEnabled defaults to empty map", () => {
		const state = createActiveOptimizationState();
		expect(state.providerEnabled).toEqual({});
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

describe("overflow recovery — normalization", () => {
	function stateFor(provider: string): ActiveOptimizationState {
		const s = createActiveOptimizationState();
		const profile = getOptimizationProfile(provider);
		s.profile = profile ?? undefined;
		s.provider = provider;
		s.enabled = !!(profile && s.featureEnabled);
		return s;
	}

	function makeMsg(
		errorMessage: string,
		stopReason = "error",
	): FakeAssistantMessage {
		return { role: "assistant", stopReason, errorMessage };
	}

	// ---- openai ----

	it("normalizes openai 'exceeds the context window'", () => {
		const r = driveOverflow(
			stateFor("openai"),
			makeMsg("Error: prompt exceeds the context window of 128000 tokens"),
		);
		expect(r?.errorMessage).toBe(
			"context_length_exceeded: Error: prompt exceeds the context window of 128000 tokens",
		);
	});

	it("normalizes openai maximum context length", () => {
		const r = driveOverflow(stateFor("openai"), makeMsg("maximum context length exceeded"));
		expect(r?.errorMessage).toMatch(/^context_length_exceeded:/);
	});

	it("normalizes messages containing but not starting with context_length_exceeded", () => {
		const r = driveOverflow(
			stateFor("openai"),
			makeMsg("Error: context_length_exceeded: prompt too long"),
		);
		expect(r?.errorMessage).toBe(
			"context_length_exceeded: Error: context_length_exceeded: prompt too long",
		);
	});

	// ---- openai-codex ----

	it("normalizes codex context_length_exceeded", () => {
		const r = driveOverflow(
			stateFor("openai-codex"),
			makeMsg("Error: context_length_exceeded"),
		);
		expect(r?.errorMessage).toMatch(/^context_length_exceeded:/);
	});

	// ---- idempotency ----

	it("does not double-prefix messages already starting with context_length_exceeded:", () => {
		const r = driveOverflow(
			stateFor("openai"),
			makeMsg("context_length_exceeded: prompt too long"),
		);
		expect(r).toBeUndefined(); // no rewrite
	});

	// ---- exclusion: non-error stops ----

	it("does not touch non-error stop reasons", () => {
		const r = driveOverflow(
			stateFor("openai"),
			makeMsg("context_length_exceeded: something", "stop"),
		);
		expect(r).toBeUndefined();
	});

	// ---- exclusion: non-assistant ----

	it("does not touch user messages", () => {
		const r = driveOverflow(stateFor("openai"), {
			role: "user",
			stopReason: "error",
			errorMessage: "context_length_exceeded",
		});
		expect(r).toBeUndefined();
	});

	// ---- exclusion: rate limit ----

	it("does NOT normalize rate limit errors", () => {
		const r = driveOverflow(stateFor("openai"), makeMsg("rate limit exceeded"));
		expect(r).toBeUndefined();
	});

	// ---- exclusion: auth ----

	it("does NOT normalize auth errors", () => {
		const r = driveOverflow(
			stateFor("openai-codex"),
			makeMsg("invalid api key"),
		);
		expect(r).toBeUndefined();
	});

	// ---- exclusion: disabled state ----

	it("does nothing when state.enabled is false", () => {
		const s = stateFor("openai");
		s.enabled = false;
		const r = driveOverflow(s, makeMsg("exceeds the context window"));
		expect(r).toBeUndefined();
	});

	it("does nothing when overflowRecoveryEnabled is false", () => {
		const s = stateFor("openai");
		s.overflowRecoveryEnabled = false;
		const r = driveOverflow(s, makeMsg("exceeds the context window"));
		expect(r).toBeUndefined();
	});

	// ---- exclusion: non-target provider ----

	it("does nothing for non-target provider", () => {
		const s = stateFor("anthropic" as never);
		s.profile = undefined;
		s.enabled = false;
		const r = driveOverflow(s, makeMsg("context_length_exceeded: huge"));
		expect(r).toBeUndefined();
	});

	// ---- exclusion: empty / missing errorMessage ----

	it("does nothing for empty errorMessage", () => {
		const r = driveOverflow(stateFor("openai"), {
			role: "assistant",
			stopReason: "error",
			errorMessage: "",
		});
		expect(r).toBeUndefined();
	});

	it("does nothing for missing errorMessage", () => {
		const r = driveOverflow(stateFor("openai"), {
			role: "assistant",
			stopReason: "error",
		});
		expect(r).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// Overflow patterns — regex specificity
// ---------------------------------------------------------------------------

describe("overflow patterns — specificity", () => {
	const openaiProfile = getOptimizationProfile("openai")!;
	const codexProfile = getOptimizationProfile("openai-codex")!;

	it("openai patterns match typical overflow messages", () => {
		const matches = openaiProfile.overflowPatterns.filter((p) =>
			p.test("context_length_exceeded: the request exceeds the maximum of 128000"),
		);
		expect(matches.length).toBeGreaterThan(0);
	});

	it("openai patterns do NOT match rate limit messages", () => {
		const matches = openaiProfile.overflowPatterns.filter((p) =>
			p.test(
				"You exceeded your current quota, please check your plan and billing details",
			),
		);
		expect(matches.length).toBe(0);
	});

	it("openai patterns do NOT match invalid API key", () => {
		const matches = openaiProfile.overflowPatterns.filter((p) =>
			p.test("Incorrect API key provided: sk-..."),
		);
		expect(matches.length).toBe(0);
	});

	it("openai patterns do NOT match timeout", () => {
		const matches = openaiProfile.overflowPatterns.filter((p) =>
			p.test("Request timed out"),
		);
		expect(matches.length).toBe(0);
	});

	it("openai patterns do NOT match network error", () => {
		const matches = openaiProfile.overflowPatterns.filter((p) =>
			p.test("Network error: connect ECONNREFUSED"),
		);
		expect(matches.length).toBe(0);
	});

	it("codex patterns do NOT match rate limit", () => {
		const matches = codexProfile.overflowPatterns.filter((p) =>
			p.test("Too many requests. Please try again later."),
		);
		expect(matches.length).toBe(0);
	});
});
