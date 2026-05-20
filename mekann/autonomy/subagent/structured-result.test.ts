import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { tryParseSubagentResult } from "./resultSchema.js";
import { assertValidResultId, resultSummary, SubagentResultStore } from "./resultStore.js";
import { evaluateSemanticConflict } from "./semanticConflict.js";
import { ApplyQueue } from "./applyQueue.js";
import { extractTouchedPathsFromPatch, extractTouchedPathsFromPatchStrict, isNewFilePatch, normalizePublicSurfaceDeltas, safeRepoRelativePath } from "./fingerprint.js";
import type { AgentMetadata, PatchProposalResult } from "./types.js";

const agent: AgentMetadata = { agentId: "a1", sessionId: "s1", agentPath: "/root/task", status: "completed", createdAt: 1, updatedAt: 1, depth: 1, open: false, cancellationRequested: false, authority: { mode: "propose_patch", write_scope: ["src"], require_base_hash: false }, authorityEnforced: true };

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

  it("rejects patch.ref-only subagent result", () => {
    const bad = patch({ patch: { format: "unified_diff", ref: "/tmp/x.patch" } });
    const parsed = tryParseSubagentResult(JSON.stringify(bad));
    expect(parsed.ok).toBe(false);
  });

  it("extracts actual touched paths from patch", () => {
    expect(extractTouchedPathsFromPatch(patch().patch.body!)).toEqual(["src/a.ts"]);
  });

  it("supersedes no_change so it does not remain pending", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "sar-"));
    const store = new SubagentResultStore(dir);
    const stored = store.save(agent, { schema: "subagent.result.v1", outcome: "no_change", summary: "done" });
    const q = new ApplyQueue(store, dir);
    const res = await q.applyAgentResults();
    expect(res.skipped[0].result_id).toBe(stored.result_id);
    expect(store.load(stored.result_id).status).toBe("superseded");
  });

  it("rejects invalid patch refs outside ResultStore", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "sar-"));
    const store = new SubagentResultStore(dir);
    const stored = store.save(agent, patch());
    if (stored.result.outcome !== "patch") throw new Error("expected patch");
    writeFileSync(path.join(store.dir, `${stored.result_id}.json`), JSON.stringify({ ...stored, result: { ...stored.result, patch: { format: "unified_diff", ref: "/tmp/outside.patch" } } }), "utf8");
    const q = new ApplyQueue(store, dir);
    expect(() => q.showAgentResult(stored.result_id, true)).toThrow("Invalid stored patch ref");
  });

  it("requires base hash for modified files when enabled", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "sar-"));
    const store = new SubagentResultStore(dir);
    const strictAgent = { ...agent, authority: { ...agent.authority!, require_base_hash: true } };
    const stored = store.save(strictAgent, patch());
    const q = new ApplyQueue(store, dir);
    const res = await q.applyAgentResults();
    expect(res.rejected[0].reason).toBe("base_hash_mismatch");
    expect(res.rejected[0].details).toMatchObject({ reason: "missing_base_hash", path: "src/a.ts" });
    expect(stored.result_id).toBeTruthy();
  });

  it("detects new-file patch as base-hash exempt", () => {
    const text = "diff --git a/src/new.ts b/src/new.ts\n--- /dev/null\n+++ b/src/new.ts\n@@ -0,0 +1 @@\n+new\n";
    expect(isNewFilePatch("src/new.ts", text)).toBe(true);
  });

  it("normalizes public surface add/remove pair to modify", () => {
    expect(normalizePublicSurfaceDeltas([
      { surface: "typescript_export", name: "Foo", change: "remove", compatibility: "breaking" },
      { surface: "typescript_export", name: "Foo", change: "add", compatibility: "compatible" },
    ])).toEqual([{ surface: "typescript_export", name: "Foo", change: "modify", compatibility: "breaking" }]);
  });

  it("rejects invalid result ids", () => {
    expect(() => assertValidResultId("../../evil")).toThrow("Invalid result_id");
  });

  it("rejects invalid risk level in schema", () => {
    const bad = patch({ semantic: { ...patch().semantic, risk: { level: "banana" as any } } });
    expect(tryParseSubagentResult(JSON.stringify(bad)).ok).toBe(false);
  });

  it("strict touched path extraction rejects unsafe patch paths", () => {
    expect(extractTouchedPathsFromPatchStrict("--- a/../outside.ts\n+++ b/../outside.ts\n")).toEqual({ ok: false, reason: "unsafe_patch_path", path: "../outside.ts" });
  });

  it("rejects unsafe repo-relative paths", () => {
    expect(safeRepoRelativePath("../x.ts")).toBeUndefined();
    expect(safeRepoRelativePath("/tmp/x.ts")).toBeUndefined();
    expect(safeRepoRelativePath("src/a.ts")).toBe("src/a.ts");
  });

  it("reviews workspace cwd mismatch instead of applying", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "sar-"));
    const store = new SubagentResultStore(dir);
    const stored = store.save({ ...agent, workspaceCwd: path.join(dir, "other") }, patch({ base: { files: [{ path: "src/a.ts", hash: "sha256:x" }] } }));
    const q = new ApplyQueue(store, dir);
    const res = await q.applyAgentResults();
    expect(res.needs_review[0]).toMatchObject({ result_id: stored.result_id, reason: "workspace_cwd_mismatch" });
  });

  it("detects applied-write vs incoming-read semantic conflict", () => {
    const incoming = patch({ semantic: { ...patch().semantic, reads: [{ kind: "symbol", name: "X" }], writes: [] } });
    const decision = evaluateSemanticConflict(incoming, [{ result_id: "old", agent_path: "/root/old", applied_at: 1, reads: [], writes: [{ kind: "symbol", name: "X" }], assumptions: [], effects: [], public_surface_delta: [], validation_result: { ok: true } }]);
    expect(decision.action).toBe("require_regeneration");
  });

  describe("tryParseSubagentResult: JSON extraction from LLM output", () => {
    const observation: any = {
      schema: "subagent.result.v1",
      outcome: "observation",
      summary: "test",
      findings: [{ target: { kind: "file", name: "a.ts" }, message: "found" }],
    };

    it("parses raw JSON directly", () => {
      expect(tryParseSubagentResult(JSON.stringify(observation)).ok).toBe(true);
    });

    it("strips markdown code block with language hint", () => {
      const wrapped = "```json\n" + JSON.stringify(observation, null, 2) + "\n```";
      expect(tryParseSubagentResult(wrapped).ok).toBe(true);
    });

    it("strips markdown code block without language hint", () => {
      const wrapped = "```\n" + JSON.stringify(observation) + "\n```";
      expect(tryParseSubagentResult(wrapped).ok).toBe(true);
    });

    it("extracts JSON from code block surrounded by prose", () => {
      const wrapped = "Here is the result:\n\n```json\n" + JSON.stringify(observation, null, 2) + "\n```\n\nDone.";
      const result = tryParseSubagentResult(wrapped);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.result.outcome).toBe("observation");
    });

    it("extracts JSON from surrounding prose", () => {
      const prose = "Here is the result:\n\n" + JSON.stringify(observation) + "\n\nDone.";
      expect(tryParseSubagentResult(prose).ok).toBe(true);
    });

    it("returns parse error for text without JSON", () => {
      const result = tryParseSubagentResult("no json here");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain("invalid_json");
    });

    it("parses real LLM output: prose + code block with table after JSON", () => {
      // Actual output from pi subagent (F1/F2 experiment)
      const realLLM = [
        'Here are the findings, reported as structured JSON using the `subagent.result.v1` schema with outcome `"observation"`:',
        '',
        '```json',
        '{',
        '  "schema": "subagent.result.v1",',
        '  "outcome": "observation",',
        '  "summary": "AgentStatus is a string-union type with 7 possible values.",',
        '  "findings": [',
        '    {',
        '      "path": "subagent/types.ts",',
        '      "message": "AgentStatus value: \\"pending_init\\""',
        '    }',
        '  ]',
        '}',
        '```',
        '',
        '**Summary:** `AgentStatus` is a string-union type with **7 values**:',
        '',
        '| Value | Terminal? |',
        '|---|---|',
        '| `"pending_init"` | No |',
      ].join('\n');
      const result = tryParseSubagentResult(realLLM);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result.outcome).toBe("observation");
        if (result.result.outcome === "observation") {
          expect(result.result.findings.length).toBeGreaterThanOrEqual(1);
        }
      }
    });
  });
});
