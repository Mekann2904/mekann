/**
 * model-optimizer — compaction observer + post-compaction hint tests.
 */

import { describe, it, expect } from "vitest";
import { createActiveOptimizationState } from "./activeProfile.js";
import { registerCompactionObserver, handleBeforeAgentStart } from "./compaction.js";
import { openaiModule } from "./openai/index.js";
import { deepseekModule } from "./deepseek/index.js";
import { OPENAI_POST_COMPACTION_HINT, CODEX_POST_COMPACTION_HINT } from "./openai/compaction.js";
import { DEEPSEEK_POST_COMPACTION_HINT } from "./deepseek/compaction.js";
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
// Post-compaction hint content
// ---------------------------------------------------------------------------

describe("openai compaction hints", () => {
	it("codex hint has code-specific content", () => {
		expect(CODEX_POST_COMPACTION_HINT).toContain("file paths");
		expect(CODEX_POST_COMPACTION_HINT).toContain("commands executed");
	});

	it("openai family hint has standard content", () => {
		expect(OPENAI_POST_COMPACTION_HINT).toContain("key decisions");
		expect(OPENAI_POST_COMPACTION_HINT).not.toContain("file paths");
	});
});

// ---------------------------------------------------------------------------
// Compaction observer — session_before_compact
// ---------------------------------------------------------------------------

describe("registerCompactionObserver — session_before_compact", () => {
	function driveBeforeCompact(
		state: ActiveOptimizationState,
		tokensBefore?: number,
		firstKeptEntryId?: string,
	): void {
		const stubCtx = {} as never;
		const pi = {
			on(_event: string, handler: (...args: unknown[]) => unknown) {
				if (_event === "session_before_compact") {
					handler({ preparation: { tokensBefore, firstKeptEntryId } }, stubCtx);
				}
			},
		} as never;
		registerCompactionObserver(pi as Parameters<typeof registerCompactionObserver>[0], state);
	}

	function enabledState(api = "openai-responses"): ActiveOptimizationState {
		const s = createActiveOptimizationState();
		const model = mockModel(api);
		s.enabled = true;
		s.compactionObserverEnabled = true;
		s.activeModule = optimizerModules.find((m) => m.supports(model));
		s.provider = model.provider;
		s.modelId = model.id;
		s.api = api;
		return s;
	}

	it("increments compactionsObserved", () => {
		const s = enabledState();
		expect(s.metrics.compactionsObserved).toBe(0);
		driveBeforeCompact(s, 50000, "entry-abc");
		expect(s.metrics.compactionsObserved).toBe(1);
	});

	it("records lastCompaction", () => {
		const s = enabledState();
		driveBeforeCompact(s, 75000, "entry-xyz");
		expect(s.metrics.lastCompaction).toBeDefined();
		expect(s.metrics.lastCompaction?.tokensBefore).toBe(75000);
		expect(s.metrics.lastCompaction?.firstKeptEntryId).toBe("entry-xyz");
		expect(s.metrics.lastCompaction?.provider).toBe("openai");
	});

	it("does nothing when state.enabled is false", () => {
		const s = enabledState();
		s.enabled = false;
		driveBeforeCompact(s, 10000);
		expect(s.metrics.compactionsObserved).toBe(0);
	});

	it("does nothing when compactionObserverEnabled is false", () => {
		const s = enabledState();
		s.compactionObserverEnabled = false;
		driveBeforeCompact(s, 10000);
		expect(s.metrics.compactionsObserved).toBe(0);
	});

	it("does not return a custom compaction", () => {
		const s = enabledState();
		let returned: unknown = "NOT_SET";
		const stubCtx = {} as never;
		const pi = {
			on(_event: string, handler: (...args: unknown[]) => unknown) {
				if (_event === "session_before_compact") {
					returned = handler({ preparation: {} }, stubCtx);
				}
			},
		} as never;
		registerCompactionObserver(pi as Parameters<typeof registerCompactionObserver>[0], s);
		expect(returned).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// Compaction observer — session_compact
// ---------------------------------------------------------------------------

describe("registerCompactionObserver — session_compact", () => {
	function driveCompact(state: ActiveOptimizationState): void {
		const stubCtx = {} as never;
		const pi = {
			on(_event: string, handler: (...args: unknown[]) => unknown) {
				if (_event === "session_compact") handler(undefined, stubCtx);
			},
		} as never;
		registerCompactionObserver(pi as Parameters<typeof registerCompactionObserver>[0], state);
	}

	function enabledState(api = "openai-codex-responses"): ActiveOptimizationState {
		const s = createActiveOptimizationState();
		const model = mockModel(api, "openai-codex", "gpt-5.5-codex");
		s.enabled = true;
		s.compactionObserverEnabled = true;
		s.postCompactionHintEnabled = true;
		s.activeModule = optimizerModules.find((m) => m.supports(model));
		s.provider = model.provider;
		s.modelId = model.id;
		s.api = api;
		return s;
	}

	it("increments compactionsCompleted", () => {
		const s = enabledState();
		expect(s.metrics.compactionsCompleted).toBe(0);
		driveCompact(s);
		expect(s.metrics.compactionsCompleted).toBe(1);
	});

	it("sets pendingPostCompactionHint with api", () => {
		const s = enabledState();
		expect(s.pendingPostCompactionHint).toBeUndefined();
		driveCompact(s);
		expect(s.pendingPostCompactionHint).toBeDefined();
		expect(s.pendingPostCompactionHint?.api).toBe("openai-codex-responses");
	});

	it("does not set hint when postCompactionHintEnabled is false", () => {
		const s = enabledState();
		s.postCompactionHintEnabled = false;
		driveCompact(s);
		expect(s.pendingPostCompactionHint).toBeUndefined();
		expect(s.metrics.compactionsCompleted).toBe(1);
	});

	it("does nothing when state.enabled is false", () => {
		const s = enabledState();
		s.enabled = false;
		driveCompact(s);
		expect(s.metrics.compactionsCompleted).toBe(0);
		expect(s.pendingPostCompactionHint).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// Post-compaction hint — before_agent_start
// ---------------------------------------------------------------------------

describe("registerCompactionObserver — before_agent_start hint injection", () => {
	function driveBeforeAgentStart(
		state: ActiveOptimizationState,
		existingSystemPrompt?: string,
	): string | undefined {
		let returnedSystemPrompt: string | undefined;
		const stubCtx = {} as never;
		const pi = {
			on(_event: string, handler: (...args: unknown[]) => unknown) {
				if (_event === "before_agent_start") {
					const result = handler({ systemPrompt: existingSystemPrompt }, stubCtx);
					if (result && typeof result === "object" && "systemPrompt" in result) {
						returnedSystemPrompt = (result as { systemPrompt?: string }).systemPrompt;
					}
				}
			},
		} as never;
		registerCompactionObserver(pi as Parameters<typeof registerCompactionObserver>[0], state);
		return returnedSystemPrompt;
	}

	function stateWithPendingHint(api = "openai-codex-responses"): ActiveOptimizationState {
		const provider = api === "openai-codex-responses" ? "openai-codex" : "openai";
		const model = mockModel(api, provider, "gpt-5.5-codex");
		const s = createActiveOptimizationState();
		s.enabled = true;
		s.postCompactionHintEnabled = true;
		s.activeModule = optimizerModules.find((m) => m.supports(model));
		s.provider = model.provider;
		s.modelId = model.id;
		s.api = api;
		s.pendingPostCompactionHint = { api, modelId: "gpt-5.5-codex", createdAt: Date.now() };
		return s;
	}

	it("injects Codex hint into systemPrompt when pending exists", () => {
		const s = stateWithPendingHint("openai-codex-responses");
		const result = driveBeforeAgentStart(s);
		expect(result).toContain("file paths");
		expect(result).toContain("commands executed");
		expect(s.metrics.postCompactionHintsInjected).toBe(1);
	});

	it("injects standard OpenAI hint for non-codex API", () => {
		const s = stateWithPendingHint("openai-responses");
		const result = driveBeforeAgentStart(s);
		expect(result).toContain("key decisions");
		expect(result).not.toContain("file paths");
	});

	it("appends hint to existing systemPrompt", () => {
		const s = stateWithPendingHint();
		const result = driveBeforeAgentStart(s, "Existing prompt.");
		expect(result).toContain("Existing prompt.");
		expect(result).toContain("file paths");
		expect(s.pendingPostCompactionHint).toBeUndefined();
	});

	it("consumes hint only once (clears pending)", () => {
		const s = stateWithPendingHint();
		driveBeforeAgentStart(s);
		expect(s.pendingPostCompactionHint).toBeUndefined();
		const result2 = driveBeforeAgentStart(s);
		expect(result2).toBeUndefined();
		expect(s.metrics.postCompactionHintsInjected).toBe(1);
	});

	it("does nothing when no pending hint", () => {
		const s = stateWithPendingHint();
		s.pendingPostCompactionHint = undefined;
		const result = driveBeforeAgentStart(s);
		expect(result).toBeUndefined();
		expect(s.metrics.postCompactionHintsInjected).toBe(0);
	});

	it("does nothing when postCompactionHintEnabled is false", () => {
		const s = stateWithPendingHint();
		s.postCompactionHintEnabled = false;
		const result = driveBeforeAgentStart(s);
		expect(result).toBeUndefined();
		expect(s.metrics.postCompactionHintsInjected).toBe(0);
	});

	it("does nothing when state.enabled is false", () => {
		const s = stateWithPendingHint();
		s.enabled = false;
		const result = driveBeforeAgentStart(s);
		expect(result).toBeUndefined();
		expect(s.metrics.postCompactionHintsInjected).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Non-target API — integration-style tests
// ---------------------------------------------------------------------------

describe("non-target API behaviour", () => {
	function driveCompactionForApi(api: string, provider: string, modelId: string) {
		const s = createActiveOptimizationState();
		const model = mockModel(api, provider, modelId);
		s.compactionObserverEnabled = true;
		s.postCompactionHintEnabled = true;
		s.activeModule = optimizerModules.find((m) => m.supports(model));
		s.provider = provider;
		s.modelId = modelId;
		s.api = api;
		s.enabled = !!(s.featureEnabled && s.activeModule);
		return s;
	}

	it("does not record compaction observer for non-target API", () => {
		const s = driveCompactionForApi("anthropic-messages", "anthropic", "claude-opus-5");
		const stubCtx = {} as never;
		const pi = {
			on(_event: string, handler: (...args: unknown[]) => unknown) {
				if (_event === "session_before_compact") handler({ preparation: { tokensBefore: 50000 } }, stubCtx);
				if (_event === "session_compact") handler(undefined, stubCtx);
			},
		} as never;
		registerCompactionObserver(pi as Parameters<typeof registerCompactionObserver>[0], s);
		expect(s.metrics.compactionsObserved).toBe(0);
		expect(s.metrics.compactionsCompleted).toBe(0);
		expect(s.pendingPostCompactionHint).toBeUndefined();
	});

	it("records compaction observer and hints for target API", () => {
		const s = driveCompactionForApi("openai-responses", "openai", "gpt-5.5");
		s.enabled = true;
		const stubCtx = {} as never;
		const pi = {
			on(_event: string, handler: (...args: unknown[]) => unknown) {
				if (_event === "session_before_compact") handler({ preparation: {} }, stubCtx);
				if (_event === "session_compact") handler(undefined, stubCtx);
			},
		} as never;
		registerCompactionObserver(pi as Parameters<typeof registerCompactionObserver>[0], s);
		expect(s.metrics.compactionsObserved).toBe(1);
		expect(s.metrics.compactionsCompleted).toBe(1);
		expect(s.pendingPostCompactionHint).toBeDefined();
	});
});

// ---------------------------------------------------------------------------
// handleBeforeAgentStart — stale hint guard tests
// ---------------------------------------------------------------------------

describe("handleBeforeAgentStart — stale hint guard", () => {
	function stateWithPendingHint(api = "openai-codex-responses"): ActiveOptimizationState {
		const provider = api === "openai-codex-responses" ? "openai-codex" : "openai";
		const model = mockModel(api, provider, "gpt-5.5-codex");
		const s = createActiveOptimizationState();
		s.enabled = true;
		s.postCompactionHintEnabled = true;
		s.activeModule = optimizerModules.find((m) => m.supports(model));
		s.provider = model.provider;
		s.modelId = model.id;
		s.api = api;
		s.pendingPostCompactionHint = { api, modelId: "gpt-5.5-codex", createdAt: Date.now() };
		return s;
	}

	it("consumes hint even when state.enabled is false", () => {
		const s = stateWithPendingHint();
		s.enabled = false;
		const result = handleBeforeAgentStart(s, { systemPrompt: "test" });
		expect(result).toBeUndefined();
		expect(s.pendingPostCompactionHint).toBeUndefined();
	});

	it("consumes hint even when postCompactionHintEnabled is false", () => {
		const s = stateWithPendingHint();
		s.postCompactionHintEnabled = false;
		const result = handleBeforeAgentStart(s, { systemPrompt: "test" });
		expect(result).toBeUndefined();
		expect(s.pendingPostCompactionHint).toBeUndefined();
	});

	it("consumes hint when API has switched away", () => {
		const s = stateWithPendingHint("openai-codex-responses");
		const newModel = mockModel("openai-responses");
		s.activeModule = optimizerModules.find((m) => m.supports(newModel));
		s.api = "openai-responses";
		const result = handleBeforeAgentStart(s, { systemPrompt: "test" });
		expect(result).toBeUndefined();
		expect(s.pendingPostCompactionHint).toBeUndefined();
	});

	it("discards hint older than STALE_HINT_TTL_MS (5 min)", () => {
		const s = stateWithPendingHint();
		const now = Date.now();
		s.pendingPostCompactionHint!.createdAt = now - 5 * 60 * 1000 - 1;
		const result = handleBeforeAgentStart(s, { systemPrompt: "test" }, now);
		expect(result).toBeUndefined();
		expect(s.pendingPostCompactionHint).toBeUndefined();
		expect(s.metrics.postCompactionHintsInjected).toBe(0);
	});

	it("injects hint exactly at TTL boundary", () => {
		const s = stateWithPendingHint();
		const now = Date.now();
		s.pendingPostCompactionHint!.createdAt = now - 5 * 60 * 1000;
		const result = handleBeforeAgentStart(s, { systemPrompt: "test" }, now);
		expect(result).toBeDefined();
		expect(result!.systemPrompt).toContain("file paths");
		expect(s.metrics.postCompactionHintsInjected).toBe(1);
	});

	it("injects hint when fresh and API matches", () => {
		const s = stateWithPendingHint();
		const result = handleBeforeAgentStart(s, { systemPrompt: "base" });
		expect(result).toBeDefined();
		expect(result!.systemPrompt).toContain("base");
		expect(result!.systemPrompt).toContain("file paths");
		expect(s.pendingPostCompactionHint).toBeUndefined();
		expect(s.metrics.postCompactionHintsInjected).toBe(1);
	});

	it("returns undefined when no pending hint", () => {
		const s = stateWithPendingHint();
		s.pendingPostCompactionHint = undefined;
		const result = handleBeforeAgentStart(s, { systemPrompt: "test" });
		expect(result).toBeUndefined();
		expect(s.metrics.postCompactionHintsInjected).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// DeepSeek compaction hint content
// ---------------------------------------------------------------------------

describe("deepseek compaction hints", () => {
	it("has objective-preserving content", () => {
		expect(DEEPSEEK_POST_COMPACTION_HINT).toContain("ORIGINAL OBJECTIVE");
		expect(DEEPSEEK_POST_COMPACTION_HINT).toContain("negative constraints");
	});

	it("has tool-use continuation content", () => {
		expect(DEEPSEEK_POST_COMPACTION_HINT).toContain("tool use");
		expect(DEEPSEEK_POST_COMPACTION_HINT).toContain("reasoning");
	});

	it("mentions verbatim preservation of constraints", () => {
		expect(DEEPSEEK_POST_COMPACTION_HINT).toContain("verbatim");
	});
});

// ---------------------------------------------------------------------------
// DeepSeek compaction observer — session_before_compact / session_compact
// ---------------------------------------------------------------------------

describe("DeepSeek compaction observer", () => {
	function driveBeforeCompact(state: ActiveOptimizationState): void {
		const stubCtx = {} as never;
		const pi = {
			on(_event: string, handler: (...args: unknown[]) => unknown) {
				if (_event === "session_before_compact") {
					handler({ preparation: { tokensBefore: 50000, firstKeptEntryId: "entry-ds" } }, stubCtx);
				}
			},
		} as never;
		registerCompactionObserver(pi as Parameters<typeof registerCompactionObserver>[0], state);
	}

	function driveCompact(state: ActiveOptimizationState): void {
		const stubCtx = {} as never;
		const pi = {
			on(_event: string, handler: (...args: unknown[]) => unknown) {
				if (_event === "session_compact") handler(undefined, stubCtx);
			},
		} as never;
		registerCompactionObserver(pi as Parameters<typeof registerCompactionObserver>[0], state);
	}

	function deepseekEnabledState(): ActiveOptimizationState {
		const s = createActiveOptimizationState();
		const model = mockModel("openai-completions", "deepseek", "deepseek");
		s.enabled = true;
		s.compactionObserverEnabled = true;
		s.postCompactionHintEnabled = true;
		s.activeModule = optimizerModules.find((m) => m.supports(model));
		s.provider = "deepseek";
		s.modelId = "deepseek";
		s.api = "openai-completions";
		return s;
	}

	it("records compaction observer for DeepSeek", () => {
		const s = deepseekEnabledState();
		expect(s.metrics.compactionsObserved).toBe(0);
		driveBeforeCompact(s);
		expect(s.metrics.compactionsObserved).toBe(1);
		expect(s.metrics.lastCompaction?.provider).toBe("deepseek");
		expect(s.metrics.lastCompaction?.modelId).toBe("deepseek");
	});

	it("records compaction completed for DeepSeek", () => {
		const s = deepseekEnabledState();
		driveCompact(s);
		expect(s.metrics.compactionsCompleted).toBe(1);
	});

	it("sets pending hint with DeepSeek api after compaction", () => {
		const s = deepseekEnabledState();
		expect(s.pendingPostCompactionHint).toBeUndefined();
		driveCompact(s);
		expect(s.pendingPostCompactionHint).toBeDefined();
		expect(s.pendingPostCompactionHint?.api).toBe("openai-completions");
	});

	it("does nothing when state.enabled is false", () => {
		const s = deepseekEnabledState();
		s.enabled = false;
		driveBeforeCompact(s);
		driveCompact(s);
		expect(s.metrics.compactionsObserved).toBe(0);
		expect(s.metrics.compactionsCompleted).toBe(0);
		expect(s.pendingPostCompactionHint).toBeUndefined();
	});

	it("does not set hint when postCompactionHintEnabled is false", () => {
		const s = deepseekEnabledState();
		s.postCompactionHintEnabled = false;
		driveCompact(s);
		expect(s.metrics.compactionsCompleted).toBe(1);
		expect(s.pendingPostCompactionHint).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// DeepSeek post-compaction hint — before_agent_start
// ---------------------------------------------------------------------------

describe("DeepSeek post-compaction hint injection", () => {
	function driveBeforeAgentStart(
		state: ActiveOptimizationState,
		existingSystemPrompt?: string,
	): string | undefined {
		let returnedSystemPrompt: string | undefined;
		const stubCtx = {} as never;
		const pi = {
			on(_event: string, handler: (...args: unknown[]) => unknown) {
				if (_event === "before_agent_start") {
					const result = handler({ systemPrompt: existingSystemPrompt }, stubCtx);
					if (result && typeof result === "object" && "systemPrompt" in result) {
						returnedSystemPrompt = (result as { systemPrompt?: string }).systemPrompt;
					}
				}
			},
		} as never;
		registerCompactionObserver(pi as Parameters<typeof registerCompactionObserver>[0], state);
		return returnedSystemPrompt;
	}

	function deepseekStateWithPendingHint(): ActiveOptimizationState {
		const model = mockModel("openai-completions", "deepseek", "deepseek");
		const s = createActiveOptimizationState();
		s.enabled = true;
		s.postCompactionHintEnabled = true;
		s.activeModule = optimizerModules.find((m) => m.supports(model));
		s.provider = "deepseek";
		s.modelId = "deepseek";
		s.api = "openai-completions";
		s.pendingPostCompactionHint = { api: "openai-completions", modelId: "deepseek", createdAt: Date.now() };
		return s;
	}

	it("injects DeepSeek hint into systemPrompt when pending exists", () => {
		const s = deepseekStateWithPendingHint();
		const result = driveBeforeAgentStart(s);
		expect(result).toContain("ORIGINAL OBJECTIVE");
		expect(result).toContain("tool use");
		expect(s.metrics.postCompactionHintsInjected).toBe(1);
	});

	it("appends hint to existing systemPrompt", () => {
		const s = deepseekStateWithPendingHint();
		const result = driveBeforeAgentStart(s, "Existing DeepSeek prompt.");
		expect(result).toContain("Existing DeepSeek prompt.");
		expect(result).toContain("ORIGINAL OBJECTIVE");
		expect(s.pendingPostCompactionHint).toBeUndefined();
	});

	it("consumes hint only once (clears pending)", () => {
		const s = deepseekStateWithPendingHint();
		driveBeforeAgentStart(s);
		expect(s.pendingPostCompactionHint).toBeUndefined();
		const result2 = driveBeforeAgentStart(s);
		expect(result2).toBeUndefined();
		expect(s.metrics.postCompactionHintsInjected).toBe(1);
	});

	it("does nothing when no pending hint", () => {
		const s = deepseekStateWithPendingHint();
		s.pendingPostCompactionHint = undefined;
		const result = driveBeforeAgentStart(s);
		expect(result).toBeUndefined();
		expect(s.metrics.postCompactionHintsInjected).toBe(0);
	});

	it("does nothing when postCompactionHintEnabled is false", () => {
		const s = deepseekStateWithPendingHint();
		s.postCompactionHintEnabled = false;
		const result = driveBeforeAgentStart(s);
		expect(result).toBeUndefined();
		expect(s.metrics.postCompactionHintsInjected).toBe(0);
	});

	it("does nothing when state.enabled is false", () => {
		const s = deepseekStateWithPendingHint();
		s.enabled = false;
		const result = driveBeforeAgentStart(s);
		expect(result).toBeUndefined();
		expect(s.metrics.postCompactionHintsInjected).toBe(0);
	});
});
