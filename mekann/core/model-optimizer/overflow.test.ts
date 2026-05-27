/**
 * model-optimizer — overflow recovery tests.
 */

import { describe, it, expect } from "vitest";
import { openaiModule } from "./openai/index.js";
import { isOpenaiOverflow } from "./openai/overflow.js";
import { createActiveOptimizationState } from "./activeProfile.js";
import { registerOverflowRecovery } from "./overflow.js";
import { optimizerModules } from "./modules.js";
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
// Module lookup
// ---------------------------------------------------------------------------

describe("optimizer module selection", () => {
	it("selects openai module for openai-responses", () => {
		const mod = optimizerModules.find((m) => m.supports(mockModel("openai-responses")));
		expect(mod).toBe(openaiModule);
	});

	it("selects openai module for openai-codex-responses", () => {
		const mod = optimizerModules.find((m) => m.supports(mockModel("openai-codex-responses", "openai-codex")));
		expect(mod).toBe(openaiModule);
	});

	it("does NOT select openai module for azure-openai-responses", () => {
		const mod = optimizerModules.find((m) => m.supports(mockModel("azure-openai-responses", "azure-openai-responses")));
		expect(mod).toBeUndefined();
	});

	it("does NOT select openai module for non-openai provider using openai-completions", () => {
		const mod = optimizerModules.find((m) => m.supports(mockModel("openai-completions", "openrouter")));
		expect(mod).toBeUndefined();
	});

	it("returns no module for non-target APIs", () => {
		const mod = optimizerModules.find((m) => m.supports(mockModel("anthropic-messages")));
		expect(mod).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// OpenAI overflow detection
// ---------------------------------------------------------------------------

describe("openai overflow detection", () => {
	it("detects context_length_exceeded", () => {
		expect(isOpenaiOverflow("Error: context_length_exceeded")).toBe(true);
	});

	it("detects exceeds the context window", () => {
		expect(isOpenaiOverflow("Error: prompt exceeds the context window of 128000 tokens")).toBe(true);
	});

	it("detects maximum context length", () => {
		expect(isOpenaiOverflow("maximum context length exceeded")).toBe(true);
	});

	it("does NOT match rate limit", () => {
		expect(isOpenaiOverflow("rate limit exceeded")).toBe(false);
	});

	it("does NOT match invalid API key", () => {
		expect(isOpenaiOverflow("Incorrect API key provided: sk-...")).toBe(false);
	});

	it("does NOT match timeout", () => {
		expect(isOpenaiOverflow("Request timed out")).toBe(false);
	});

	it("does NOT match network error", () => {
		expect(isOpenaiOverflow("Network error: connect ECONNREFUSED")).toBe(false);
	});

	it("does NOT match quota exceeded", () => {
		expect(isOpenaiOverflow("You exceeded your current quota, please check your plan and billing details")).toBe(false);
	});

	it("does NOT match too many requests", () => {
		expect(isOpenaiOverflow("Too many requests. Please try again later.")).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Active state defaults
// ---------------------------------------------------------------------------

describe("createActiveOptimizationState", () => {
	it("returns disabled state with no module", () => {
		const state = createActiveOptimizationState();
		expect(state.enabled).toBe(false);
		expect(state.activeModule).toBeUndefined();
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
// Overflow recovery — hook dispatch tests
// ---------------------------------------------------------------------------

interface FakeAssistantMessage {
	role: string;
	stopReason?: string;
	errorMessage?: string;
}

function driveOverflow(
	state: ActiveOptimizationState,
	message: FakeAssistantMessage,
): FakeAssistantMessage | undefined {
	let result: FakeAssistantMessage | undefined;

	const pi = {
		on(_event: string, handler: (...args: unknown[]) => unknown) {
			const event = { message };
			const ctx = {} as never;
			const ret = handler(event, ctx);
			if (ret && typeof ret === "object" && "message" in ret) {
				result = (ret as { message: FakeAssistantMessage }).message;
			}
		},
	} as never;

	registerOverflowRecovery(pi as Parameters<typeof registerOverflowRecovery>[0], state);
	return result;
}

function stateForApi(api: string, provider?: string): ActiveOptimizationState {
	const s = createActiveOptimizationState();
	const model = mockModel(api, provider ?? (api === "openai-codex-responses" ? "openai-codex" : "openai"));
	const mod = optimizerModules.find((m) => m.supports(model));
	s.activeModule = mod;
	s.provider = model.provider;
	s.api = api;
	s.enabled = !!(mod && s.featureEnabled);
	return s;
}

function makeMsg(errorMessage: string, stopReason = "error"): FakeAssistantMessage {
	return { role: "assistant", stopReason, errorMessage };
}

// ---- openai-responses ----

it("normalizes openai 'exceeds the context window'", () => {
	const r = driveOverflow(stateForApi("openai-responses"), makeMsg("Error: prompt exceeds the context window of 128000 tokens"));
	expect(r?.errorMessage).toBe("context_length_exceeded: Error: prompt exceeds the context window of 128000 tokens");
});

it("normalizes openai maximum context length", () => {
	const r = driveOverflow(stateForApi("openai-responses"), makeMsg("maximum context length exceeded"));
	expect(r?.errorMessage).toMatch(/^context_length_exceeded:/);
});

it("normalizes messages containing but not starting with context_length_exceeded", () => {
	const r = driveOverflow(stateForApi("openai-responses"), makeMsg("Error: context_length_exceeded: prompt too long"));
	expect(r?.errorMessage).toBe("context_length_exceeded: Error: context_length_exceeded: prompt too long");
});

// ---- openai-codex-responses ----

it("normalizes codex context_length_exceeded", () => {
	const r = driveOverflow(stateForApi("openai-codex-responses"), makeMsg("Error: context_length_exceeded"));
	expect(r?.errorMessage).toMatch(/^context_length_exceeded:/);
});

it("normalizes Codex exact overflow message", () => {
	const r = driveOverflow(stateForApi("openai-codex-responses"), makeMsg("Your input exceeds the context window of this model. Please adjust your input and try again."));
	expect(r?.errorMessage).toBe("context_length_exceeded: Your input exceeds the context window of this model. Please adjust your input and try again.");
});

it("normalizes Codex exact overflow message with embedded newline", () => {
	const r = driveOverflow(stateForApi("openai-codex-responses"), makeMsg("Your input exceeds the context window of this model. Please adjust your input and try\nagain."));
	expect(r?.errorMessage).toMatch(/^context_length_exceeded:/);
});

// ---- azure-openai-responses (excluded) ----

it("does NOT normalize azure-openai-responses overflow (not supported)", () => {
	const s = stateForApi("azure-openai-responses");
	s.activeModule = undefined;
	s.enabled = false;
	const r = driveOverflow(s, makeMsg("Error: prompt exceeds the context window of 128000 tokens"));
	expect(r).toBeUndefined();
});

// ---- idempotency ----

it("does not double-prefix messages already starting with context_length_exceeded:", () => {
	const r = driveOverflow(stateForApi("openai-responses"), makeMsg("context_length_exceeded: prompt too long"));
	expect(r).toBeUndefined();
});

// ---- exclusion: non-error stops ----

it("does not touch non-error stop reasons", () => {
	const r = driveOverflow(stateForApi("openai-responses"), makeMsg("context_length_exceeded: something", "stop"));
	expect(r).toBeUndefined();
});

// ---- exclusion: non-assistant ----

it("does not touch user messages", () => {
	const r = driveOverflow(stateForApi("openai-responses"), { role: "user", stopReason: "error", errorMessage: "context_length_exceeded" });
	expect(r).toBeUndefined();
});

// ---- exclusion: rate limit ----

it("does NOT normalize rate limit errors", () => {
	const r = driveOverflow(stateForApi("openai-responses"), makeMsg("rate limit exceeded"));
	expect(r).toBeUndefined();
});

// ---- exclusion: auth ----

it("does NOT normalize auth errors", () => {
	const r = driveOverflow(stateForApi("openai-codex-responses"), makeMsg("invalid api key"));
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
	s.activeModule = undefined;
	s.enabled = false;
	const r = driveOverflow(s, makeMsg("context_length_exceeded: huge"));
	expect(r).toBeUndefined();
});

// ---- exclusion: empty / missing errorMessage ----

it("does nothing for empty errorMessage", () => {
	const r = driveOverflow(stateForApi("openai-responses"), { role: "assistant", stopReason: "error", errorMessage: "" });
	expect(r).toBeUndefined();
});

it("does nothing for missing errorMessage", () => {
	const r = driveOverflow(stateForApi("openai-responses"), { role: "assistant", stopReason: "error" });
	expect(r).toBeUndefined();
});
