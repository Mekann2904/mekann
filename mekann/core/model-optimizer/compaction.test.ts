/**
 * model-optimizer — compaction observer + post-compaction hint tests.
 */

import { describe, it, expect } from "vitest";
import { createActiveOptimizationState } from "./activeProfile.js";
import { registerCompactionObserver, handleBeforeAgentStart } from "./compaction.js";
import { getPostCompactionHint } from "./prompts.js";
import { getOptimizationProfile } from "./profiles.js";
import type { ActiveOptimizationState } from "./types.js";

// ---------------------------------------------------------------------------
// Prompt hints
// ---------------------------------------------------------------------------

describe("getPostCompactionHint", () => {
	it("returns codex-specific hint for openai-codex", () => {
		const hint = getPostCompactionHint("openai-codex");
		expect(hint).toContain("file paths");
		expect(hint).toContain("commands executed");
	});

	it("returns standard hint for openai", () => {
		const hint = getPostCompactionHint("openai");
		expect(hint).toContain("key decisions");
		expect(hint).not.toContain("file paths");
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
					handler(
						{ preparation: { tokensBefore, firstKeptEntryId } },
						stubCtx,
					);
				}
			},
		} as never;

		registerCompactionObserver(
			pi as Parameters<typeof registerCompactionObserver>[0],
			state,
		);
	}

	function enabledState(): ActiveOptimizationState {
		const s = createActiveOptimizationState();
		s.enabled = true;
		s.compactionObserverEnabled = true;
		s.profile = getOptimizationProfile("openai");
		s.provider = "openai";
		s.modelId = "gpt-5.5";
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
		registerCompactionObserver(
			pi as Parameters<typeof registerCompactionObserver>[0],
			s,
		);
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
		registerCompactionObserver(
			pi as Parameters<typeof registerCompactionObserver>[0],
			state,
		);
	}

	function enabledState(): ActiveOptimizationState {
		const s = createActiveOptimizationState();
		s.enabled = true;
		s.compactionObserverEnabled = true;
		s.postCompactionHintEnabled = true;
		s.profile = getOptimizationProfile("openai-codex");
		s.provider = "openai-codex";
		s.modelId = "gpt-5.5-codex";
		return s;
	}

	it("increments compactionsCompleted", () => {
		const s = enabledState();
		expect(s.metrics.compactionsCompleted).toBe(0);
		driveCompact(s);
		expect(s.metrics.compactionsCompleted).toBe(1);
	});

	it("sets pendingPostCompactionHint", () => {
		const s = enabledState();
		expect(s.pendingPostCompactionHint).toBeUndefined();
		driveCompact(s);
		expect(s.pendingPostCompactionHint).toBeDefined();
		expect(s.pendingPostCompactionHint?.provider).toBe("openai-codex");
	});

	it("does not set hint when postCompactionHintEnabled is false", () => {
		const s = enabledState();
		s.postCompactionHintEnabled = false;
		driveCompact(s);
		expect(s.pendingPostCompactionHint).toBeUndefined();
		expect(s.metrics.compactionsCompleted).toBe(1); // observer still works
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
					const result = handler(
						{ systemPrompt: existingSystemPrompt },
						stubCtx,
					);
					if (result && typeof result === "object" && "systemPrompt" in result) {
						returnedSystemPrompt = (
							result as { systemPrompt?: string }
						).systemPrompt;
					}
				}
			},
		} as never;
		registerCompactionObserver(
			pi as Parameters<typeof registerCompactionObserver>[0],
			state,
		);
		return returnedSystemPrompt;
	}

	function stateWithPendingHint(): ActiveOptimizationState {
		const s = createActiveOptimizationState();
		s.enabled = true;
		s.postCompactionHintEnabled = true;
		s.profile = getOptimizationProfile("openai-codex");
		s.provider = "openai-codex";
		s.modelId = "gpt-5.5-codex";
		s.pendingPostCompactionHint = {
			provider: "openai-codex",
			modelId: "gpt-5.5-codex",
			createdAt: Date.now(),
		};
		return s;
	}

	it("injects hint into systemPrompt when pending exists", () => {
		const s = stateWithPendingHint();
		const result = driveBeforeAgentStart(s);
		expect(result).toContain("file paths");
		expect(result).toContain("commands executed");
		expect(s.metrics.postCompactionHintsInjected).toBe(1);
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
		// Second call should not inject
		const result2 = driveBeforeAgentStart(s);
		expect(result2).toBeUndefined();
		expect(s.metrics.postCompactionHintsInjected).toBe(1); // still 1
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
// Non-target provider — integration-style tests
// ---------------------------------------------------------------------------

describe("non-target provider behaviour", () => {
	function driveCompactionForProvider(provider: string, modelId: string) {
		const s = createActiveOptimizationState();
		s.compactionObserverEnabled = true;
		s.postCompactionHintEnabled = true;
		s.profile = getOptimizationProfile(provider);
		s.provider = provider;
		s.modelId = modelId;
		// enabled = true only when a target profile exists
		s.enabled = !!(s.featureEnabled && s.profile);
		return s;
	}

	function driveMetricsForProvider(provider: string, modelId: string) {
		const s = createActiveOptimizationState();
		s.metricsEnabled = true;
		s.profile = getOptimizationProfile(provider);
		s.provider = provider;
		s.modelId = modelId;
		// enabled depends on profile existence
		s.enabled = !!(s.featureEnabled && s.profile);
		return s;
	}

	it("does not record compaction observer for non-target provider", () => {
		const s = driveCompactionForProvider("anthropic", "claude-opus-5");
		const stubCtx = {} as never;
		const pi = {
			on(_event: string, handler: (...args: unknown[]) => unknown) {
				if (_event === "session_before_compact") {
					handler(
						{ preparation: { tokensBefore: 50000 } },
						stubCtx,
					);
				}
				if (_event === "session_compact") {
					handler(undefined, stubCtx);
				}
			},
		} as never;
		registerCompactionObserver(
			pi as Parameters<typeof registerCompactionObserver>[0],
			s,
		);
		expect(s.metrics.compactionsObserved).toBe(0);
		expect(s.metrics.compactionsCompleted).toBe(0);
		expect(s.pendingPostCompactionHint).toBeUndefined();
	});

	it("does not inject post-compaction hint for non-target provider", () => {
		const s = driveCompactionForProvider("anthropic", "claude-opus-5");
		s.pendingPostCompactionHint = {
			provider: "openai",
			modelId: "gpt-5.5",
			createdAt: Date.now(),
		};
		// enabled is false because no profile for anthropic
		let result: unknown = undefined;
		const stubCtx = {} as never;
		const pi = {
			on(_event: string, handler: (...args: unknown[]) => unknown) {
				if (_event === "before_agent_start") {
					result = handler(
						{ systemPrompt: "base" },
						stubCtx,
					);
				}
			},
		} as never;
		registerCompactionObserver(
			pi as Parameters<typeof registerCompactionObserver>[0],
			s,
		);
		expect(result).toBeUndefined();
		expect(s.metrics.postCompactionHintsInjected).toBe(0);
	});

	it("records compaction observer and hints for target provider", () => {
		const s = driveCompactionForProvider("openai", "gpt-5.5");
		s.enabled = true; // profile exists
		const stubCtx = {} as never;
		const pi = {
			on(_event: string, handler: (...args: unknown[]) => unknown) {
				if (_event === "session_before_compact") {
					handler({ preparation: {} }, stubCtx);
				}
				if (_event === "session_compact") {
					handler(undefined, stubCtx);
				}
			},
		} as never;
		registerCompactionObserver(
			pi as Parameters<typeof registerCompactionObserver>[0],
			s,
		);
		expect(s.metrics.compactionsObserved).toBe(1);
		expect(s.metrics.compactionsCompleted).toBe(1);
		expect(s.pendingPostCompactionHint).toBeDefined();
	});
});

// ---------------------------------------------------------------------------
// handleBeforeAgentStart — stale hint guard tests
// ---------------------------------------------------------------------------

describe("handleBeforeAgentStart — stale hint guard", () => {
	function stateWithPendingHint(): ActiveOptimizationState {
		const s = createActiveOptimizationState();
		s.enabled = true;
		s.postCompactionHintEnabled = true;
		s.profile = getOptimizationProfile("openai-codex");
		s.provider = "openai-codex";
		s.modelId = "gpt-5.5-codex";
		s.pendingPostCompactionHint = {
			provider: "openai-codex",
			modelId: "gpt-5.5-codex",
			createdAt: Date.now(),
		};
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

	it("consumes hint when provider has switched away", () => {
		const s = stateWithPendingHint();
		// Simulate provider switch: pending is openai-codex but current is openai
		s.profile = getOptimizationProfile("openai");
		s.provider = "openai";
		const result = handleBeforeAgentStart(s, { systemPrompt: "test" });
		expect(result).toBeUndefined();
		expect(s.pendingPostCompactionHint).toBeUndefined();
	});

	it("discards hint older than STALE_HINT_TTL_MS (5 min)", () => {
		const s = stateWithPendingHint();
		const now = Date.now();
		const staleCreatedAt = now - 5 * 60 * 1000 - 1; // just over 5 min ago
		s.pendingPostCompactionHint!.createdAt = staleCreatedAt;
		const result = handleBeforeAgentStart(s, { systemPrompt: "test" }, now);
		expect(result).toBeUndefined();
		expect(s.pendingPostCompactionHint).toBeUndefined();
		expect(s.metrics.postCompactionHintsInjected).toBe(0);
	});

	it("injects hint exactly at TTL boundary", () => {
		const s = stateWithPendingHint();
		const now = Date.now();
		const boundaryCreatedAt = now - 5 * 60 * 1000; // exactly 5 min ago
		s.pendingPostCompactionHint!.createdAt = boundaryCreatedAt;
		const result = handleBeforeAgentStart(s, { systemPrompt: "test" }, now);
		expect(result).toBeDefined();
		expect(result!.systemPrompt).toContain("file paths");
		expect(s.metrics.postCompactionHintsInjected).toBe(1);
	});

	it("injects hint when fresh and provider matches", () => {
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
