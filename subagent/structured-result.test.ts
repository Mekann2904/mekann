import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { tryParseSubagentResult } from "./resultSchema.js";
import { resultSummary, SubagentResultStore } from "./resultStore.js";
import { evaluateSemanticConflict } from "./semanticConflict.js";
import type { AgentMetadata, PatchProposalResult } from "./types.js";

const agent: AgentMetadata = { agentId: "a1", sessionId: "s1", agentPath: "/root/task", status: "completed", createdAt: 1, updatedAt: 1, depth: 1, open: false, cancellationRequested: false };

function patch(overrides: Partial<PatchProposalResult> = {}): PatchProposalResult {
  return {
    schema: "subagent.result.v1",
    outcome: "patch",
    summary: "fix",
    patch: { format: "unified_diff", body: "diff --git a/a.ts b/a.ts\n" },
    base: { files: [] },
    scope: { allowed_paths: ["src"], touched_paths: ["src/a.ts"] },
    semantic: { reads: [], writes: [{ kind: "symbol", name: "X" }], assumptions: [], effects: [], public_surface_delta: [], risk: { level: "low" } },
    validation: { suggested: [] },
    ...overrides,
  };
}

describe("structured subagent results", () => {
  it("parses valid patch result", () => {
    const parsed = tryParseSubagentResult(JSON.stringify(patch()));
    expect(parsed.ok).toBe(true);
  });

  it("stores transient patch.body in .patch and keeps summary patch-free", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "sar-"));
    const store = new SubagentResultStore(dir);
    const stored = store.save(agent, patch());
    expect(stored.result.outcome).toBe("patch");
    if (stored.result.outcome !== "patch") throw new Error("expected patch");
    expect(stored.result.patch.body).toBeUndefined();
    expect(readFileSync(stored.result.patch.ref!, "utf8")).toContain("diff --git");
    expect(resultSummary(stored)).not.toContain("diff --git");
  });

  it("detects applied-write vs incoming-read semantic conflict", () => {
    const incoming = patch({ semantic: { ...patch().semantic, reads: [{ kind: "symbol", name: "X" }], writes: [] } });
    const decision = evaluateSemanticConflict(incoming, [{ result_id: "old", agent_path: "/root/old", applied_at: 1, reads: [], writes: [{ kind: "symbol", name: "X" }], assumptions: [], effects: [], public_surface_delta: [], validation_result: { ok: true } }]);
    expect(decision.action).toBe("require_regeneration");
  });
});
