import { describe, expect, it } from "vitest";
import {
	applyDynamicContext,
	applyProviderRequest,
	buildActualUsageLog,
	buildRequestLog,
	createInitialSnapshot,
	mergeWarnings,
	splitVolatileRuntimeBlock,
	truncateDynamicContext,
	type PromptRequestSnapshotState,
} from "./request-snapshot.js";
import type { PromptInspectionWarning } from "../prompt-core/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mkState = (
	overrides: Partial<PromptRequestSnapshotState> = {},
): PromptRequestSnapshotState => ({
	runKey: "test-run",
	runKeySource: "sessionId",
	snapshotSource: "before_agent_start",
	createdAt: "2026-05-27T00:00:00.000Z",
	stablePrefixHash: "abc123",
	stablePrefixChars: 500,
	injectedStableFragmentHashes: [],
	injectedSemiStableFragmentHashes: [],
	injectedWarnings: [],
	...overrides,
});

const mkRendered = (overrides: Record<string, unknown> = {}) => ({
	stableText: "stable content",
	semiStableText: "semi content",
	dynamicText: "dynamic content",
	stableFragments: [],
	semiStableFragments: [],
	dynamicFragments: [],
	warnings: [],
	...overrides,
});

// ---------------------------------------------------------------------------
// truncateDynamicContext
// ---------------------------------------------------------------------------

describe("truncateDynamicContext", () => {
	it("does not truncate short text", () => {
		const result = truncateDynamicContext("short");
		expect(result.truncated).toBe(false);
		expect(result.text).toBe("short");
	});

	it("truncates long text and appends notice", () => {
		const long = "x".repeat(15_000);
		const result = truncateDynamicContext(long);
		expect(result.truncated).toBe(true);
		expect(result.originalChars).toBe(15_000);
		expect(result.text).toContain("cache-friendly-prompt: omitted");
		expect(result.renderedChars).toBe(result.text.length);
	});
});

// ---------------------------------------------------------------------------
// splitVolatileRuntimeBlock
// ---------------------------------------------------------------------------

describe("splitVolatileRuntimeBlock", () => {
	it("splits volatile lines from stable", () => {
		const { stableBaseSystemText, volatileRuntimeText } =
			splitVolatileRuntimeBlock(
				"BASE\nCurrent date: 2026-05-27\nCurrent working directory: /tmp",
			);
		expect(stableBaseSystemText).toBe("BASE");
		expect(volatileRuntimeText).toContain("Current date:");
		expect(volatileRuntimeText).toContain("Current working directory:");
	});

	it("returns all stable when no volatile lines", () => {
		const { stableBaseSystemText, volatileRuntimeText } =
			splitVolatileRuntimeBlock("JUST STABLE");
		expect(stableBaseSystemText).toBe("JUST STABLE");
		expect(volatileRuntimeText).toBe("");
	});

	it("extracts the expanded volatile header set (current file / open files / git status / continuation), not just the old 4", () => {
		// Regression for issue #95: extraction must catch up to inspection so a
		// line inspection warns about is actually removed from the stable prefix.
		const { stableBaseSystemText, volatileRuntimeText } =
			splitVolatileRuntimeBlock(
				"POLICY\nCurrent file: render.ts\nOpen files: a.ts\nGit status: clean\nContinuation: turn 2\nMORE POLICY",
			);
		expect(stableBaseSystemText).toBe("POLICY\nMORE POLICY");
		expect(volatileRuntimeText).toContain("Current file:");
		expect(volatileRuntimeText).toContain("Open files:");
		expect(volatileRuntimeText).toContain("Git status:");
		expect(volatileRuntimeText).toContain("Continuation:");
	});

	it("does not extract stable prose that merely mentions a volatile term", () => {
		const { stableBaseSystemText, volatileRuntimeText } =
			splitVolatileRuntimeBlock(
				"When asked for the current date, run a command.\nSee git status output below.",
			);
		expect(volatileRuntimeText).toBe("");
		expect(stableBaseSystemText).toContain("current date");
		expect(stableBaseSystemText).toContain("git status");
	});
});

// ---------------------------------------------------------------------------
// mergeWarnings
// ---------------------------------------------------------------------------

describe("mergeWarnings", () => {
	it("deduplicates identical warnings", () => {
		const w: PromptInspectionWarning = {
			severity: "error",
			code: "TEST",
			message: "test warning",
		};
		const result = mergeWarnings([w, w], [w]);
		expect(result).toHaveLength(1);
	});

	it("preserves distinct warnings", () => {
		const w1: PromptInspectionWarning = {
			severity: "error",
			code: "A",
			message: "first",
		};
		const w2: PromptInspectionWarning = {
			severity: "warning",
			code: "B",
			message: "second",
		};
		expect(mergeWarnings([w1], [w2])).toHaveLength(2);
	});
});

// ---------------------------------------------------------------------------
// createInitialSnapshot
// ---------------------------------------------------------------------------

describe("createInitialSnapshot", () => {
	it("creates a snapshot from rendered fragments", () => {
		const state = createInitialSnapshot({
			runKey: "rk",
			runKeySource: "sessionId",
			requestId: "req-1",
			requestRole: "main",
			requestRoleSource: "default:root-process",
			baseSystemText: "BASE SYSTEM",
			rendered: mkRendered(),
		});
		expect(state.runKey).toBe("rk");
		expect(state.requestId).toBe("req-1");
		expect(state.requestRole).toBe("main");
		expect(state.snapshotSource).toBe("before_agent_start");
		expect(state.stablePrefixHash).toBeTruthy();
		expect(state.stablePrefixChars).toBe("stable content".length);
		expect(state.injectedStableFragmentHashes).toEqual([]);
	});

	it("computes hashes for base system and provider prefix", () => {
		const state = createInitialSnapshot({
			runKey: "rk",
			runKeySource: "cwd",
			baseSystemText: "BASE",
			rendered: mkRendered(),
		});
		expect(state.baseSystemHash).toBeTruthy();
		expect(state.providerPrefixHash).toBeTruthy();
		expect(state.featureCacheablePrefixHash).toBeTruthy();
	});
});

// ---------------------------------------------------------------------------
// applyDynamicContext
// ---------------------------------------------------------------------------

describe("applyDynamicContext", () => {
	it("updates dynamic fragment hashes and truncation state", () => {
		const prev = mkState();
		const updated = applyDynamicContext(prev, {
			dynamicText: "dynamic text",
			dynamicFragments: [
				{
					id: "d1",
					source: "test",
					kind: "coding_guidelines",
					stability: "dynamic",
					scope: "global",
					priority: 1,
					version: "v1",
					content: "dynamic text",
				},
			],
			fragmentWarnings: [],
		});
		expect(updated.latestDynamicFragmentHashes).toHaveLength(1);
		expect(updated.latestDynamicFragmentHashes?.[0].id).toBe("d1");
		expect(updated.latestDynamicCollectedAt).toBeTruthy();
		expect(updated.dynamicContextTruncated).toBe(false);
	});

	it("produces truncation warning when dynamic is long", () => {
		const prev = mkState();
		const updated = applyDynamicContext(prev, {
			dynamicText: "x".repeat(15_000),
			dynamicFragments: [],
			fragmentWarnings: [],
		});
		expect(updated.dynamicContextTruncated).toBe(true);
		expect(
			updated.injectedWarnings.some(
				(w) => w.code === "DYNAMIC_CONTEXT_TRUNCATED",
			),
		).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// applyProviderRequest
// ---------------------------------------------------------------------------

describe("applyProviderRequest", () => {
	it("sets total prompt chars", () => {
		const prev = mkState();
		const updated = applyProviderRequest(prev, {
			finalText: "hello world",
			payload: {},
		});
		expect(updated.totalPromptChars).toBe(11);
		expect(updated.totalPromptTokenEstimate).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// buildRequestLog
// ---------------------------------------------------------------------------

describe("buildRequestLog", () => {
	it("builds a complete request log from state", () => {
		const state = mkState({
			baseSystemHash: "bsh",
			stablePrefixHash: "sph",
			stablePrefixChars: 500,
			injectedStableFragmentHashes: [
				{ id: "s1", source: "t", kind: "coding_guidelines", stability: "stable", hash: "h1" },
			],
		});
		const log = buildRequestLog({
			runKey: "rk",
			runKeySource: "sessionId",
			requestId: "req-1",
			correlationConfidence: "requestId_matched",
			provider: "openai",
			model: "gpt-4",
			finalText: "prompt text",
			promptProviderIds: ["p1"],
			fragmentHashes: [],
			warnings: [],
			state,
		});
		expect(log.runKey).toBe("rk");
		expect(log.correlationConfidence).toBe("requestId_matched");
		expect(log.provider).toBe("openai");
		expect(log.baseSystemHash).toBe("bsh");
		expect(log.stablePrefixHash).toBe("sph");
		expect(log.totalPromptChars).toBe(11);
		expect(log.injectedStableFragmentHashes).toHaveLength(1);
	});

	it("handles null state with missing correlation", () => {
		const log = buildRequestLog({
			runKey: "rk",
			runKeySource: "cwd",
			correlationConfidence: "missing",
			provider: undefined,
			model: undefined,
			finalText: "",
			promptProviderIds: [],
			fragmentHashes: [],
			warnings: [],
			state: null,
			fallbackRequestRole: "main",
			fallbackRequestRoleSource: "default",
		});
		expect(log.correlationConfidence).toBe("missing");
		expect(log.stablePrefixHash).toBe("");
		expect(log.stablePrefixChars).toBe(0);
		expect(log.requestRole).toBe("main");
	});
});

// ---------------------------------------------------------------------------
// buildActualUsageLog
// ---------------------------------------------------------------------------

describe("buildActualUsageLog", () => {
	it("builds a complete actual usage log", () => {
		const state = mkState({
			stablePrefixHash: "sph",
			stablePrefixChars: 500,
			totalPromptChars: 2000,
		});
		const log = buildActualUsageLog({
			messageTimestamp: "2026-05-27T00:00:00.000Z",
			runKey: "rk",
			requestId: "req-1",
			provider: "openai",
			model: "gpt-4",
			correlationConfidence: "requestId_matched",
			normalized: {
				inputTotalTokens: 2000,
				outputTokens: 100,
				cacheReadTokens: 1024,
				tokenHitRate: 0.512,
				cacheableReadRate: null,
				usageSource: "provider_raw_usage",
			},
			rawUsage: { prompt_tokens: 2000 },
			state,
		});
		expect(log.timestamp).toBe("2026-05-27T00:00:00.000Z");
		expect(log.inputTotalTokens).toBe(2000);
		expect(log.cacheReadTokens).toBe(1024);
		expect(log.correlationConfidence).toBe("requestId_matched");
		expect(log.totalPromptChars).toBe(2000);
		expect(log.stablePrefixHash).toBe("sph");
		expect(log.rawUsage).toEqual({ prompt_tokens: 2000 });
	});

	it("handles null state", () => {
		const log = buildActualUsageLog({
			messageTimestamp: "2026-05-27T00:00:00.000Z",
			runKey: "rk",
			provider: "openai",
			model: "gpt-4",
			correlationConfidence: "missing",
			normalized: {
				inputTotalTokens: 100,
				outputTokens: 10,
				cacheReadTokens: 50,
				tokenHitRate: 0.5,
				cacheableReadRate: null,
				usageSource: "pi_normalized_usage",
			},
			state: null,
			fallbackRequestRole: "main",
		});
		expect(log.stablePrefixHash).toBeUndefined();
		expect(log.requestRole).toBe("main");
	});
});
