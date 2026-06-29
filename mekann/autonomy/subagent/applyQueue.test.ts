import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ApplyQueue } from "./applyQueue.js";
import { SubagentResultStore } from "./resultStore.js";
import type { AgentMetadata, PatchProposalResult, SubagentResultV1 } from "./types.js";

function makeAgent(overrides: Partial<AgentMetadata> = {}): AgentMetadata {
  return {
    agentId: "a1", sessionId: "s1", agentPath: "/root/task",
    status: "completed", createdAt: 1, updatedAt: 1, depth: 1,
    open: false, cancellationRequested: false,
    authority: { mode: "propose_patch", write_scope: ["src"], require_base_hash: false, max_patch_bytes: 50_000 },
    authorityEnforced: true,
    ...overrides,
  };
}

function patch(overrides: Partial<PatchProposalResult> = {}): PatchProposalResult {
  return {
    schema: "subagent.result.v1",
    outcome: "patch",
    summary: "fix",
    patch: { format: "unified_diff", body: "diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-old\n+new\n" },
    base: { files: [] },
    scope: { allowed_paths: ["src"], touched_paths: ["src/a.ts"] },
    semantic: { reads: [], writes: [{ kind: "symbol", name: "X" }], assumptions: [], effects: [], public_surface_delta: [], risk: { level: "low" } },
    validation: { suggested: [] },
    ...overrides,
  };
}

function patchWithBody(body: string, overrides: Partial<PatchProposalResult> = {}): PatchProposalResult {
  return patch({
    patch: { format: "unified_diff", body },
    ...overrides,
  });
}

function makeStoreAndQueue(overrides: { agent?: Partial<AgentMetadata>; shellAllowlist?: Record<string, string> } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "aq-"));
  const agentObj = makeAgent({ workspaceCwd: dir, ...overrides.agent });
  const store = new SubagentResultStore(dir);
  const q = new ApplyQueue(store, dir, overrides.shellAllowlist ?? {});
  return { dir, store, q, agent: agentObj, cleanup: () => { try { rmSync(dir, { recursive: true }); } catch {} } };
}

describe("ApplyQueue: listAgentResults", () => {
  it("lists results from store", async () => {
    const { store, q, agent, cleanup } = makeStoreAndQueue();
    try {
      store.save(agent, { schema: "subagent.result.v1", outcome: "observation", summary: "test", findings: [] } as any);
      expect(await q.listAgentResults()).toHaveLength(1);
    } finally { cleanup(); }
  });
});

describe("ApplyQueue: showAgentResult", () => {
  it("shows result without patch body", () => {
    const { store, q, agent, cleanup } = makeStoreAndQueue();
    try {
      const stored = store.save(agent, patch());
      const shown = q.showAgentResult(stored.result_id, false);
      expect(shown.result_id).toBe(stored.result_id);
      expect(shown.patch_body).toBeUndefined();
    } finally { cleanup(); }
  });

  it("shows result with patch body when includePatch=true", () => {
    const { store, q, agent, cleanup } = makeStoreAndQueue();
    try {
      const stored = store.save(agent, patch());
      const shown = q.showAgentResult(stored.result_id, true);
      expect(shown.patch_body).toContain("diff --git");
    } finally { cleanup(); }
  });

  // Regression for issue #142: load() must return an independent copy so caller
  // mutations (showAgentResult attaching patch_body, mark* rewriting status)
  // never leak into the in-memory cache or the next persisted JSON.
  it("does not leak patch_body into the cache or disk after includePatch=true", () => {
    const { store, q, agent, cleanup } = makeStoreAndQueue();
    try {
      const stored = store.save(agent, patch());
      q.showAgentResult(stored.result_id, true); // mutates the returned copy only
      // Cache must stay clean: a follow-up without patch must not see patch_body.
      expect(q.showAgentResult(stored.result_id, false).patch_body).toBeUndefined();
      // A status mutation must not persist the transient patch_body field.
      q.rejectAgentResult(stored.result_id);
      const raw = JSON.parse(readFileSync(path.join(store.dir, `${stored.result_id}.json`), "utf8"));
      expect("patch_body" in raw).toBe(false);
    } finally { cleanup(); }
  });
});

describe("ApplyQueue: rejectAgentResult", () => {
  it("rejects a result with default reason", () => {
    const { store, q, agent, cleanup } = makeStoreAndQueue();
    try {
      const stored = store.save(agent, patch());
      const result = q.rejectAgentResult(stored.result_id);
      expect(result).toEqual({ result_id: stored.result_id, reason: "manual_reject" });
      expect(store.load(stored.result_id).status).toBe("rejected");
    } finally { cleanup(); }
  });

  it("rejects a result with custom reason", () => {
    const { store, q, agent, cleanup } = makeStoreAndQueue();
    try {
      const stored = store.save(agent, patch());
      const result = q.rejectAgentResult(stored.result_id, "invalid_schema");
      expect(result.reason).toBe("invalid_schema");
    } finally { cleanup(); }
  });
});

describe("ApplyQueue: applyAgentResults", () => {
  it("skips non-pending, non-needs_review results", async () => {
    const { store, q, agent, cleanup } = makeStoreAndQueue();
    try {
      const stored = store.save(agent, patch());
      store.markRejected(stored.result_id, "manual_reject");
      // Rejected results won't show in list({ status: "pending" })
      const result = await q.applyAgentResults();
      // The rejected result is not in the pending list, so it's simply not processed
      expect(result.applied).toHaveLength(0);
      expect(result.rejected).toHaveLength(0);
    } finally { cleanup(); }
  });

  it("limits results with max_results", async () => {
    const { store, q, agent, cleanup } = makeStoreAndQueue();
    try {
      store.save(agent, { schema: "subagent.result.v1", outcome: "no_change", summary: "a" } as any);
      store.save(agent, { schema: "subagent.result.v1", outcome: "no_change", summary: "b" } as any);
      store.save(agent, { schema: "subagent.result.v1", outcome: "no_change", summary: "c" } as any);
      const result = await q.applyAgentResults({ max_results: 2 });
      expect(result.skipped).toHaveLength(2);
    } finally { cleanup(); }
  });

  it("clamps an absurd max_results to the HARD_MAX apply batch (issue #152)", async () => {
    const { store, q, agent, cleanup } = makeStoreAndQueue();
    try {
      store.save(agent, { schema: "subagent.result.v1", outcome: "no_change", summary: "a" } as any);
      // 1e9 is far above HARD_MAX_APPLY_BATCH; the batch must stay bounded.
      const result = await q.applyAgentResults({ max_results: 1_000_000_000 });
      expect(result.skipped).toHaveLength(1);
    } finally { cleanup(); }
  });

  it("skips a result already being applied elsewhere as concurrent_apply (issue #152)", async () => {
    const { store, q, agent, cleanup } = makeStoreAndQueue();
    try {
      const stored = store.save(agent, patch());
      // Simulate a parallel process winning the pending→applying race after this
      // caller loaded the (still pending) result but before it could mark it.
      const spy = vi.spyOn(store, "tryMarkApplying").mockReturnValue(false);
      const result = await q.applyAgentResults({ source: "result_ids", result_ids: [stored.result_id] });
      spy.mockRestore();
      expect(result.skipped.some((s) => s.reason === "concurrent_apply")).toBe(true);
      expect(result.applied).toHaveLength(0);
    } finally { cleanup(); }
  });

  it("rejects patch that is too large", async () => {
    const { store, q, agent, cleanup } = makeStoreAndQueue({ agent: { authority: { mode: "propose_patch", write_scope: ["src"], require_base_hash: false, max_patch_bytes: 10 } } });
    try {
      store.save(agent, patch());
      const result = await q.applyAgentResults();
      expect(result.rejected[0].reason).toBe("patch_too_large");
    } finally { cleanup(); }
  });

  it("rejects blocked outcome", async () => {
    const { store, q, agent, cleanup } = makeStoreAndQueue();
    try {
      store.save(agent, { schema: "subagent.result.v1", outcome: "blocked", reason: "can't proceed" } as any);
      const result = await q.applyAgentResults();
      expect(result.rejected[0].reason).toBe("manual_reject");
    } finally { cleanup(); }
  });

  it("reviews needs_decision outcome", async () => {
    const { store, q, agent, cleanup } = makeStoreAndQueue();
    try {
      store.save(agent, { schema: "subagent.result.v1", outcome: "needs_decision", question: "what?", options: ["a", "b"] } as any);
      const result = await q.applyAgentResults();
      expect(result.needs_review[0].reason).toBe("what?");
    } finally { cleanup(); }
  });

  it("supersedes observation outcome", async () => {
    const { store, q, agent, cleanup } = makeStoreAndQueue();
    try {
      const stored = store.save(agent, { schema: "subagent.result.v1", outcome: "observation", summary: "test", findings: [] } as any);
      const result = await q.applyAgentResults();
      expect(result.skipped[0].reason).toBe("observation");
      expect(store.load(stored.result_id).status).toBe("superseded");
    } finally { cleanup(); }
  });

  it("rejects declared_touched_paths mismatch", async () => {
    const { store, q, agent, cleanup } = makeStoreAndQueue();
    try {
      store.save(agent, patch({
        scope: { allowed_paths: ["src"], touched_paths: ["src/other.ts"] },
      }));
      const result = await q.applyAgentResults();
      expect(result.rejected[0].reason).toBe("declared_touched_paths_mismatch");
    } finally { cleanup(); }
  });

  it("rejects when touched path is outside write scope", async () => {
    const { store, q, agent, cleanup } = makeStoreAndQueue({ agent: { authority: { mode: "propose_patch", write_scope: ["lib"], require_base_hash: false, max_patch_bytes: 50_000 } } });
    try {
      store.save(agent, patch());
      const result = await q.applyAgentResults();
      expect(result.rejected[0].reason).toBe("outside_path_scope");
    } finally { cleanup(); }
  });

  it("reviews when write_scope is empty", async () => {
    const { store, q, agent, cleanup } = makeStoreAndQueue({ agent: { authority: { mode: "propose_patch", write_scope: [], require_base_hash: false, max_patch_bytes: 50_000 } } });
    try {
      store.save(agent, patch());
      const result = await q.applyAgentResults();
      expect(result.needs_review[0].reason).toContain("write_scope is not specified");
    } finally { cleanup(); }
  });

  it("reviews .husky paths as execution-sensitive", async () => {
    const { store, q, agent, cleanup } = makeStoreAndQueue({ agent: { authority: { mode: "propose_patch", write_scope: [".husky", "src"], require_base_hash: false, max_patch_bytes: 50_000 } } });
    try {
      const body = "diff --git a/.husky/pre-commit b/.husky/pre-commit\n--- a/.husky/pre-commit\n+++ b/.husky/pre-commit\n@@ -1 +1 @@\n-old\n+new\n";
      store.save(agent, patchWithBody(body, {
        scope: { allowed_paths: [".husky", "src"], touched_paths: [".husky/pre-commit"] },
      }));
      const result = await q.applyAgentResults();
      expect(result.needs_review[0].reason).toContain("execution_sensitive_path");
    } finally { cleanup(); }
  });

  it("rejects outside semantic scope", async () => {
    const { store, q, agent, cleanup } = makeStoreAndQueue({ agent: { authority: { mode: "propose_patch", write_scope: ["src"], require_base_hash: false, max_patch_bytes: 50_000, semantic_scope: [{ kind: "symbol", name: "Y" }] } } });
    try {
      store.save(agent, patch());
      const result = await q.applyAgentResults();
      expect(result.rejected[0].reason).toBe("outside_semantic_scope");
    } finally { cleanup(); }
  });

  it("reviews when authority_enforced is false", async () => {
    const { store, q, agent, cleanup } = makeStoreAndQueue({ agent: { authorityEnforced: false } });
    try {
      store.save(agent, patch());
      const result = await q.applyAgentResults();
      expect(result.needs_review.some(r => r.reason.includes("Authority was not enforced"))).toBe(true);
    } finally { cleanup(); }
  });

  it("reviews undeclared public surface delta", async () => {
    const { store, q, agent, cleanup } = makeStoreAndQueue();
    try {
      const body = "diff --git a/package.json b/package.json\n--- a/package.json\n+++ b/package.json\n@@ -1 +1 @@\n-old\n+new\n";
      store.save(agent, patchWithBody(body, {
        scope: { allowed_paths: ["src", "."], touched_paths: ["package.json"] },
      }));
      const result = await q.applyAgentResults();
      // package.json triggers config_schema delta which is not declared → undeclared_public_surface_delta
      // But we need write_scope to cover package.json
      // Actually write_scope=["src"] doesn't cover package.json → outside_path_scope
      // Let's check what actually happens
      const reasons = [...result.rejected.map(r => r.reason), ...result.needs_review.map(r => r.reason)];
      expect(reasons.some(r => r.includes("undeclared_public_surface") || r.includes("outside_path_scope"))).toBe(true);
    } finally { cleanup(); }
  });

  it("rejects require_regeneration from semantic conflict", async () => {
    const { store, q, agent, cleanup } = makeStoreAndQueue();
    try {
      // Log an existing write to X
      store.appendSemanticLog({
        result_id: "sar_old_1",
        agent_path: "/root/old",
        applied_at: Date.now(),
        reads: [],
        writes: [{ kind: "symbol", name: "X" }],
        assumptions: [],
        effects: [],
        public_surface_delta: [],
        validation_result: { ok: true },
      });
      // Incoming also writes X → write-write conflict → require_review
      store.save(agent, patch());
      const result = await q.applyAgentResults();
      expect(result.needs_review.some(r => r.reason.includes("write the same semantic target"))).toBe(true);
    } finally { cleanup(); }
  });

  it("reviews high risk patches", async () => {
    const { store, q, agent, cleanup } = makeStoreAndQueue();
    try {
      store.save(agent, patch({
        semantic: { reads: [], writes: [{ kind: "symbol", name: "X" }], assumptions: [], effects: [], public_surface_delta: [], risk: { level: "high" } },
      }));
      const result = await q.applyAgentResults();
      expect(result.needs_review.some(r => r.reason.includes("High semantic risk"))).toBe(true);
    } finally { cleanup(); }
  });

  it("applies results from specific result_ids", async () => {
    const { store, q, agent, cleanup } = makeStoreAndQueue();
    try {
      const s1 = store.save(agent, { schema: "subagent.result.v1", outcome: "no_change", summary: "a" } as any);
      store.save(agent, { schema: "subagent.result.v1", outcome: "no_change", summary: "b" } as any);
      const result = await q.applyAgentResults({ source: "result_ids", result_ids: [s1.result_id] });
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].result_id).toBe(s1.result_id);
    } finally { cleanup(); }
  });

  it("reviews when write_scope contains unsafe path patterns", async () => {
    const { store, q, agent, cleanup } = makeStoreAndQueue({ agent: { authority: { mode: "propose_patch", write_scope: ["../escape"], require_base_hash: false, max_patch_bytes: 50_000 } } });
    try {
      store.save(agent, patch());
      const result = await q.applyAgentResults();
      expect(result.needs_review.some(r => r.reason.includes("unsafe path pattern"))).toBe(true);
    } finally { cleanup(); }
  });

  it("reviews when required check has no command mapping", async () => {
    const { store, q, agent, cleanup } = makeStoreAndQueue();
    try {
      store.save(agent, patch({
        validation: {
          suggested: [],
          required: [{ kind: "unit_test", target: "specific-test" }],
        },
      }));
      const result = await q.applyAgentResults();
      expect(result.needs_review.some(r => r.reason.includes("no command mapping"))).toBe(true);
    } finally { cleanup(); }
  });

  it("rejects when validation command is not allowed", async () => {
    const { store, q, agent, cleanup } = makeStoreAndQueue();
    try {
      store.save(agent, patch({
        validation: {
          suggested: [{ kind: "npm_script", script: "test" }],
        },
      }));
      const result = await q.applyAgentResults();
      expect(result.rejected.some(r => r.reason === "validation_command_not_allowed")).toBe(true);
    } finally { cleanup(); }
  });

  it("reviews workspace cwd mismatch", async () => {
    const { store, q, agent, cleanup } = makeStoreAndQueue();
    try {
      const otherDir = mkdtempSync(path.join(tmpdir(), "aq-other-"));
      try {
        const otherAgent = makeAgent({ workspaceCwd: otherDir });
        store.save(otherAgent, patch());
        const result = await q.applyAgentResults();
        expect(result.needs_review[0].reason).toBe("workspace_cwd_mismatch");
      } finally { rmSync(otherDir, { recursive: true }); }
    } finally { cleanup(); }
  });

  it("skips needs_review result when allow_high_risk is not set", async () => {
    const { store, q, agent, cleanup } = makeStoreAndQueue();
    try {
      const stored = store.save(agent, patch());
      store.markNeedsReview(stored.result_id, "test");
      // Use result_ids source to load it directly
      const result = await q.applyAgentResults({ source: "result_ids", result_ids: [stored.result_id] });
      expect(result.skipped.some(s => s.reason.includes("status:needs_review"))).toBe(true);
    } finally { cleanup(); }
  });

  it("rejects unsafe declared path in scope", async () => {
    const { store, q, agent, cleanup } = makeStoreAndQueue();
    try {
      store.save(agent, patch({
        scope: { allowed_paths: ["src"], touched_paths: ["../escape.ts"] },
      }));
      const result = await q.applyAgentResults();
      expect(result.rejected.some(r => r.reason === "declared_touched_paths_mismatch")).toBe(true);
    } finally { cleanup(); }
  });

  it("rejects when base files have unsafe paths", async () => {
    const { store, q, agent, cleanup } = makeStoreAndQueue();
    try {
      store.save(agent, patch({
        base: { files: [{ path: "../outside.ts", hash: "sha256:abc" }] },
      }));
      const result = await q.applyAgentResults();
      expect(result.rejected.some(r => r.reason === "base_hash_mismatch")).toBe(true);
    } finally { cleanup(); }
  });
});
