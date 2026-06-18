/**
 * Feature audit tests — ResultStore edge cases.
 *
 * Validates SA-07-T1 and SA-07-T2 from the feature list.
 */

import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { SubagentResultStore } from "./resultStore.js";

/** Create a store that uses `dir` directly (not appending .pi/subagent-results). */
function createStore(dir: string): SubagentResultStore {
	const storeDir = dir.endsWith("subagent-results") ? dir : path.join(dir, "subagent-results");
	return new SubagentResultStore(storeDir);
}

/** Get the actual storage dir for assertions. */
function storeDirOf(dir: string): string {
	return dir.endsWith("subagent-results") ? dir : path.join(dir, "subagent-results");
}
import type { AgentMetadata, PatchProposalResult } from "./types.js";

const agent: AgentMetadata = {
	agentId: "a1",
	sessionId: "s1",
	agentPath: "/root/task",
	status: "completed",
	createdAt: 1,
	updatedAt: 1,
	depth: 1,
	open: false,
	cancellationRequested: false,
	authority: { mode: "propose_patch", write_scope: ["src"], require_base_hash: false },
	authorityEnforced: true,
	workspaceCwd: process.cwd(),
};

function patch(): PatchProposalResult {
	return {
		schema: "subagent.result.v1",
		outcome: "patch",
		summary: "fix",
		patch: { format: "unified_diff", body: "diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-old\n+new\n" },
		base: { files: [] },
		scope: { allowed_paths: ["src"], touched_paths: ["src/a.ts"] },
		semantic: { reads: [], writes: [{ kind: "symbol", name: "X" }], assumptions: [], effects: [], public_surface_delta: [], risk: { level: "low" } },
		validation: { suggested: [] },
	};
}

const observation = {
	schema: "subagent.result.v1" as const,
	outcome: "observation" as const,
	summary: "test",
	findings: [{ target: { kind: "file" as const, name: "a.ts" }, message: "found" }],
};

// ---------------------------------------------------------------------------
// SA-07-T1: patch ref outside store dir is rejected
// ---------------------------------------------------------------------------

describe("SA-07-T1: patch ref validation rejects paths outside store dir", () => {
	it("rejects traversal in patch ref on load", () => {
		const dir = mkdtempSync(path.join(tmpdir(), "sar-"));
		const store = createStore(dir);
		const stored = store.save(agent, patch());
		const sDir = storeDirOf(dir);

		// Manually tamper with the stored file to point ref outside store dir
		const tampered = JSON.parse(readFileSync(path.join(sDir, `${stored.result_id}.json`), "utf8"));
		if (tampered.result.outcome === "patch") {
			tampered.result.patch.ref = "/tmp/outside.patch";
		}
		writeFileSync(path.join(sDir, `${stored.result_id}.json`), JSON.stringify(tampered));

		expect(() => store.load(stored.result_id)).toThrow("Invalid stored patch ref");
	});

	it("rejects relative traversal in patch ref", () => {
		const dir = mkdtempSync(path.join(tmpdir(), "sar-"));
		const store = createStore(dir);
		const stored = store.save(agent, patch());
		const sDir = storeDirOf(dir);

		const tampered = JSON.parse(readFileSync(path.join(sDir, `${stored.result_id}.json`), "utf8"));
		if (tampered.result.outcome === "patch") {
			tampered.result.patch.ref = "../../../etc/passwd";
		}
		writeFileSync(path.join(sDir, `${stored.result_id}.json`), JSON.stringify(tampered));

		expect(() => store.load(stored.result_id)).toThrow("Invalid stored patch ref");
	});
});

// ---------------------------------------------------------------------------
// SA-07-T2: recoverStaleApplying time boundary
// ---------------------------------------------------------------------------

describe("SA-07-T2: recoverStaleApplying respects maxAgeMs", () => {
	it("recovers results older than maxAgeMs", async () => {
		const dir = mkdtempSync(path.join(tmpdir(), "sar-"));
		const store = createStore(dir);
		const stored = store.save(agent, observation);
		const sDir = storeDirOf(dir);

		// Manually set status to applying with old timestamp
		const raw = JSON.parse(readFileSync(path.join(sDir, `${stored.result_id}.json`), "utf8"));
		raw.status = "applying";
		raw.applying_at = Date.now() - 20 * 60 * 1000; // 20 minutes ago
		writeFileSync(path.join(sDir, `${stored.result_id}.json`), JSON.stringify(raw));

		const recovered = await store.recoverStaleApplying(10 * 60 * 1000); // 10 min threshold
		expect(recovered).toBe(1);

		const after = store.load(stored.result_id);
		expect(after.status).toBe("needs_review");
	});

	it("does not recover results newer than maxAgeMs", async () => {
		const dir = mkdtempSync(path.join(tmpdir(), "sar-"));
		const store = createStore(dir);
		const stored = store.save(agent, observation);
		const sDir = storeDirOf(dir);

		// Set status to applying with recent timestamp
		const raw = JSON.parse(readFileSync(path.join(sDir, `${stored.result_id}.json`), "utf8"));
		raw.status = "applying";
		raw.applying_at = Date.now() - 1 * 60 * 1000; // 1 minute ago
		writeFileSync(path.join(sDir, `${stored.result_id}.json`), JSON.stringify(raw));

		const recovered = await store.recoverStaleApplying(10 * 60 * 1000); // 10 min threshold
		expect(recovered).toBe(0);

		const after = store.load(stored.result_id);
		expect(after.status).toBe("applying");
	});

	it("recovers with no applying_at using created_at fallback", async () => {
		const dir = mkdtempSync(path.join(tmpdir(), "sar-"));
		const store = createStore(dir);
		const stored = store.save(agent, observation);
		const sDir = storeDirOf(dir);

		// Set status to applying without applying_at
		const raw = JSON.parse(readFileSync(path.join(sDir, `${stored.result_id}.json`), "utf8"));
		raw.status = "applying";
		raw.applying_at = undefined;
		raw.created_at = Date.now() - 20 * 60 * 1000; // old created_at
		writeFileSync(path.join(sDir, `${stored.result_id}.json`), JSON.stringify(raw));

		const recovered = await store.recoverStaleApplying(10 * 60 * 1000);
		expect(recovered).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// Additional: status transitions
// ---------------------------------------------------------------------------

describe("ResultStore: status transition clears previous state", () => {
	it("markApplied clears reject/escrow/review fields", () => {
		const dir = mkdtempSync(path.join(tmpdir(), "sar-"));
		const store = createStore(dir);
		const stored = store.save(agent, observation);
		const sDir = storeDirOf(dir);

		// First reject, then apply (simulating retry → apply)
		store.markRejected(stored.result_id, "manual_reject");
		let loaded = store.load(stored.result_id);
		expect(loaded.status).toBe("rejected");
		expect(loaded.reject_reason).toBe("manual_reject");

		// Re-save as pending (simulating retry regeneration)
		const raw = JSON.parse(readFileSync(path.join(sDir, `${stored.result_id}.json`), "utf8"));
		raw.status = "pending";
		delete raw.reject_reason;
		delete raw.reject_details;
		writeFileSync(path.join(sDir, `${stored.result_id}.json`), JSON.stringify(raw));

		// Now apply
		store.markApplied(stored.result_id, {
			result_id: stored.result_id,
			agent_path: "/root/task",
			applied_at: Date.now(),
		});
		loaded = store.load(stored.result_id);
		expect(loaded.status).toBe("applied");
		expect(loaded.reject_reason).toBeUndefined();
		expect(loaded.apply_record).toBeDefined();
	});
});

// ---------------------------------------------------------------------------
// Additional: list filtering
// ---------------------------------------------------------------------------

describe("ResultStore: list with filters", () => {
	it("filters by outcome", async () => {
		const dir = mkdtempSync(path.join(tmpdir(), "sar-"));
		const store = createStore(dir);
		store.save(agent, observation);
		store.save(agent, patch());

		const observations = await store.list({ outcome: "observation" });
		expect(observations).toHaveLength(1);
		expect(observations[0].result.outcome).toBe("observation");

		const patches = await store.list({ outcome: "patch" });
		expect(patches).toHaveLength(1);
	});

	it("filters by agent_path", async () => {
		const dir = mkdtempSync(path.join(tmpdir(), "sar-"));
		const store = new SubagentResultStore(dir);
		store.save(agent, observation);
		const otherAgent = { ...agent, agentPath: "/root/other" };
		store.save(otherAgent, observation);

		const filtered = await store.list({ agent_path: "/root/task" });
		expect(filtered).toHaveLength(1);
		expect(filtered[0].agent_path).toBe("/root/task");
	});
});
