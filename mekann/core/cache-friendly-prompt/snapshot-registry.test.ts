import { describe, expect, it } from "vitest";
import { PromptRequestSnapshotRegistry } from "./snapshot-registry.js";
import type { PromptRequestSnapshotState } from "./request-snapshot.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mkState = (
	overrides: Partial<PromptRequestSnapshotState> = {},
): PromptRequestSnapshotState => ({
	runKey: "rk",
	runKeySource: "sessionId",
	snapshotSource: "before_agent_start",
	createdAt: "2026-05-27T00:00:00.000Z",
	stablePrefixHash: "hash",
	stablePrefixChars: 100,
	injectedStableFragmentHashes: [],
	injectedSemiStableFragmentHashes: [],
	injectedWarnings: [],
	...overrides,
});

// ---------------------------------------------------------------------------
// Registry tests
// ---------------------------------------------------------------------------

describe("PromptRequestSnapshotRegistry", () => {
	it("stores and retrieves by runKey", () => {
		const reg = new PromptRequestSnapshotRegistry();
		const state = mkState({ runKey: "rk-1" });
		reg.rememberRunState("rk-1", state);
		expect(reg.getByRunKey("rk-1")).toBe(state);
		expect(reg.getByRunKey("nonexistent")).toBeUndefined();
	});

	it("stores and retrieves by requestId", () => {
		const reg = new PromptRequestSnapshotRegistry();
		const state = mkState({ runKey: "rk-1", requestId: "req-1" });
		reg.rememberRunState("rk-1", state);
		expect(reg.getByRequestId("req-1")).toBe(state);
	});

	it("cleans up old requestId when runKey is overwritten", () => {
		const reg = new PromptRequestSnapshotRegistry();
		const s1 = mkState({ runKey: "rk-1", requestId: "req-old" });
		reg.rememberRunState("rk-1", s1);
		const s2 = mkState({ runKey: "rk-1", requestId: "req-new" });
		reg.rememberRunState("rk-1", s2);
		expect(reg.getByRequestId("req-old")).toBeUndefined();
		expect(reg.getByRequestId("req-new")).toBe(s2);
	});

	it("evicts oldest when exceeding MAX_RUN_STATES", () => {
		const reg = new PromptRequestSnapshotRegistry();
		// Fill 129 entries (MAX_RUN_STATES = 128)
		for (let i = 0; i < 129; i++) {
			reg.rememberRunState(`rk-${i}`, mkState({ runKey: `rk-${i}` }));
		}
		// First entry should be evicted
		expect(reg.getByRunKey("rk-0")).toBeUndefined();
		expect(reg.getByRunKey("rk-1")).toBeDefined();
		expect(reg.getByRunKey("rk-128")).toBeDefined();
	});

	// ── Provider-model FIFO ──────────────────────────────────────

	it("stores and takes provider-model state in FIFO order", () => {
		const reg = new PromptRequestSnapshotRegistry();
		const s1 = mkState({ runKey: "rk-1", stablePrefixHash: "h1" });
		const s2 = mkState({ runKey: "rk-1", stablePrefixHash: "h2" });
		reg.rememberProviderModelState("rk-1", "openai", "gpt", s1);
		reg.rememberProviderModelState("rk-1", "openai", "gpt", s2);
		const first = reg.takeProviderModelState("rk-1", "openai", "gpt");
		expect(first?.stablePrefixHash).toBe("h1");
		const second = reg.takeProviderModelState("rk-1", "openai", "gpt");
		expect(second?.stablePrefixHash).toBe("h2");
		const empty = reg.takeProviderModelState("rk-1", "openai", "gpt");
		expect(empty).toBeUndefined();
	});

	// ── Actual usage dedup ───────────────────────────────────────

	it("deduplicates actual usage keys", () => {
		const reg = new PromptRequestSnapshotRegistry();
		expect(reg.rememberActualUsageKey("key-1")).toBe(true);
		expect(reg.rememberActualUsageKey("key-1")).toBe(false);
		expect(reg.rememberActualUsageKey("key-2")).toBe(true);
	});

	it("evicts oldest actual usage keys when exceeding limit", () => {
		const reg = new PromptRequestSnapshotRegistry();
		for (let i = 0; i < 513; i++) {
			reg.rememberActualUsageKey(`key-${i}`);
		}
		// key-0 should be evicted (MAX_ACTUAL_USAGE_KEYS = 512)
		expect(reg.rememberActualUsageKey("key-0")).toBe(true);
		expect(reg.rememberActualUsageKey("key-512")).toBe(false);
	});

	// ── Correlation lookup: lookupForProviderRequest ──────────────

	describe("lookupForProviderRequest", () => {
		it("finds by requestId first (requestId_matched)", () => {
			const reg = new PromptRequestSnapshotRegistry();
			const state = mkState({ runKey: "rk-1", requestId: "req-1" });
			reg.rememberRunState("rk-1", state);
			const result = reg.lookupForProviderRequest({
				requestId: "req-1",
				runKey: "rk-1",
			});
			expect(result.correlationConfidence).toBe("requestId_matched");
			expect(result.state).toBe(state);
		});

		it("falls back to runKey (runKey_latest)", () => {
			const reg = new PromptRequestSnapshotRegistry();
			const state = mkState({ runKey: "rk-1" });
			reg.rememberRunState("rk-1", state);
			const result = reg.lookupForProviderRequest({
				runKey: "rk-1",
			});
			expect(result.correlationConfidence).toBe("runKey_latest");
			expect(result.state).toBe(state);
		});

		it("falls back to cwd key", () => {
			const reg = new PromptRequestSnapshotRegistry();
			const state = mkState({ runKey: "/tmp/project" });
			reg.rememberRunState("/tmp/project", state);
			const result = reg.lookupForProviderRequest({
				runKey: "different-key",
				cwd: "/tmp/project",
			});
			expect(result.correlationConfidence).toBe("runKey_latest");
			expect(result.state).toBe(state);
		});

		it("returns missing when nothing found", () => {
			const reg = new PromptRequestSnapshotRegistry();
			const result = reg.lookupForProviderRequest({
				runKey: "nope",
			});
			expect(result.correlationConfidence).toBe("missing");
			expect(result.state).toBeNull();
		});
	});

	// ── Correlation lookup: lookupForActualUsage ──────────────────

	describe("lookupForActualUsage", () => {
		it("uses provider-model FIFO as second priority", () => {
			const reg = new PromptRequestSnapshotRegistry();
			const fifoState = mkState({ runKey: "rk-1", stablePrefixHash: "fifo" });
			reg.rememberProviderModelState("rk-1", "openai", "gpt", fifoState);
			const result = reg.lookupForActualUsage({
				runKey: "rk-1",
				provider: "openai",
				model: "gpt",
			});
			expect(result.correlationConfidence).toBe("providerModel_fifo");
			expect(result.state?.stablePrefixHash).toBe("fifo");
		});

		it("prefers requestId over provider-model FIFO", () => {
			const reg = new PromptRequestSnapshotRegistry();
			const byReq = mkState({ runKey: "rk-1", requestId: "req-1", stablePrefixHash: "by-req" });
			const byFifo = mkState({ runKey: "rk-1", stablePrefixHash: "fifo" });
			reg.rememberRunState("rk-1", byReq);
			reg.rememberProviderModelState("rk-1", "openai", "gpt", byFifo);
			const result = reg.lookupForActualUsage({
				requestId: "req-1",
				runKey: "rk-1",
				provider: "openai",
				model: "gpt",
			});
			expect(result.correlationConfidence).toBe("requestId_matched");
			expect(result.state?.stablePrefixHash).toBe("by-req");
		});

		it("falls back to runKey after FIFO is exhausted", () => {
			const reg = new PromptRequestSnapshotRegistry();
			const state = mkState({ runKey: "rk-1" });
			reg.rememberRunState("rk-1", state);
			// No FIFO entries
			const result = reg.lookupForActualUsage({
				runKey: "rk-1",
				provider: "openai",
				model: "gpt",
			});
			expect(result.correlationConfidence).toBe("runKey_latest");
			expect(result.state).toBe(state);
		});
	});
});
