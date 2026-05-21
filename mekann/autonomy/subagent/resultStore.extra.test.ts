import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { SubagentResultStore, assertValidResultId, resultSummary } from "./resultStore.js";
import type { AgentMetadata, SubagentResultV1 } from "./types.js";

const agent: AgentMetadata = {
  agentId: "a1", sessionId: "s1", agentPath: "/root/task",
  status: "completed", createdAt: 1, updatedAt: 1, depth: 1,
  open: false, cancellationRequested: false,
  authority: { mode: "propose_patch", write_scope: ["src"], require_base_hash: false },
  authorityEnforced: true, workspaceCwd: process.cwd(),
};

function observation(): SubagentResultV1 {
  return {
    schema: "subagent.result.v1",
    outcome: "observation",
    summary: "test",
    findings: [{ target: { kind: "file", name: "a.ts" }, message: "found" }],
  } as any;
}

function blocked(): SubagentResultV1 {
  return {
    schema: "subagent.result.v1",
    outcome: "blocked",
    reason: "blocked reason",
  } as any;
}

function needsDecision(): SubagentResultV1 {
  return {
    schema: "subagent.result.v1",
    outcome: "needs_decision",
    question: "What to do?",
    options: ["A", "B"],
  } as any;
}

function noChange(): SubagentResultV1 {
  return {
    schema: "subagent.result.v1",
    outcome: "no_change",
    summary: "nothing to do",
  } as any;
}

describe("SubagentResultStore: save various outcomes", () => {
  it("saves observation result", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "srs-"));
    try {
      const store = new SubagentResultStore(dir);
      const stored = store.save(agent, observation());
      expect(stored.result.outcome).toBe("observation");
      expect(stored.status).toBe("pending");
      expect(stored.result_id).toMatch(/^sar_/);
    } finally { rmSync(dir, { recursive: true }); }
  });

  it("saves blocked result", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "srs-"));
    try {
      const store = new SubagentResultStore(dir);
      const stored = store.save(agent, blocked());
      expect(stored.result.outcome).toBe("blocked");
    } finally { rmSync(dir, { recursive: true }); }
  });

  it("saves needs_decision result", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "srs-"));
    try {
      const store = new SubagentResultStore(dir);
      const stored = store.save(agent, needsDecision());
      expect(stored.result.outcome).toBe("needs_decision");
    } finally { rmSync(dir, { recursive: true }); }
  });

  it("saves no_change result", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "srs-"));
    try {
      const store = new SubagentResultStore(dir);
      const stored = store.save(agent, noChange());
      expect(stored.result.outcome).toBe("no_change");
    } finally { rmSync(dir, { recursive: true }); }
  });
});

describe("SubagentResultStore: status transitions", () => {
  it("markApplying sets applying_at", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "srs-"));
    try {
      const store = new SubagentResultStore(dir);
      const stored = store.save(agent, observation());
      store.markApplying(stored.result_id);
      const loaded = store.load(stored.result_id);
      expect(loaded.status).toBe("applying");
      expect(loaded.applying_at).toBeDefined();
    } finally { rmSync(dir, { recursive: true }); }
  });

  it("markEscrowed sets escrow_record", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "srs-"));
    try {
      const store = new SubagentResultStore(dir);
      const stored = store.save(agent, observation());
      store.markEscrowed(stored.result_id, { result_id: stored.result_id, agent_path: "/root/task", escrowed_at: Date.now(), candidate_id: "c1" });
      const loaded = store.load(stored.result_id);
      expect(loaded.status).toBe("escrowed");
      expect(loaded.escrow_record).toBeDefined();
    } finally { rmSync(dir, { recursive: true }); }
  });

  it("markNeedsReview sets review_record", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "srs-"));
    try {
      const store = new SubagentResultStore(dir);
      const stored = store.save(agent, observation());
      store.markNeedsReview(stored.result_id, "high risk", { detail: "x" });
      const loaded = store.load(stored.result_id);
      expect(loaded.status).toBe("needs_review");
      expect(loaded.review_record?.reason).toBe("high risk");
    } finally { rmSync(dir, { recursive: true }); }
  });

  it("markSuperseded sets superseded_reason", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "srs-"));
    try {
      const store = new SubagentResultStore(dir);
      const stored = store.save(agent, observation());
      store.markSuperseded(stored.result_id, "no_change");
      const loaded = store.load(stored.result_id);
      expect(loaded.status).toBe("superseded");
      expect(loaded.superseded_reason).toBe("no_change");
    } finally { rmSync(dir, { recursive: true }); }
  });

  it("markApplied clears reject/escrow/review fields", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "srs-"));
    try {
      const store = new SubagentResultStore(dir);
      const stored = store.save(agent, observation());
      store.markRejected(stored.result_id, "manual_reject", "detail");
      store.markApplied(stored.result_id, {
        result_id: stored.result_id,
        agent_path: "/root/task",
        applied_at: Date.now(),
      });
      const loaded = store.load(stored.result_id);
      expect(loaded.status).toBe("applied");
      expect(loaded.reject_reason).toBeUndefined();
      expect(loaded.reject_details).toBeUndefined();
      expect(loaded.apply_record).toBeDefined();
    } finally { rmSync(dir, { recursive: true }); }
  });
});

describe("SubagentResultStore: semantic log", () => {
  it("appends and reads semantic log entries", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "srs-"));
    try {
      const store = new SubagentResultStore(dir);
      const entry = {
        result_id: "sar_test_1",
        agent_path: "/root/task",
        applied_at: Date.now(),
        reads: [],
        writes: [{ kind: "symbol" as const, name: "X" }],
        assumptions: [],
        effects: [],
        public_surface_delta: [],
        validation_result: { ok: true },
      };
      store.appendSemanticLog(entry);
      const log = store.readSemanticLog();
      expect(log).toHaveLength(1);
      expect(log[0].result_id).toBe("sar_test_1");
    } finally { rmSync(dir, { recursive: true }); }
  });

  it("returns empty array when no log exists", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "srs-"));
    try {
      const store = new SubagentResultStore(dir);
      expect(store.readSemanticLog()).toEqual([]);
    } finally { rmSync(dir, { recursive: true }); }
  });

  it("handles malformed log lines gracefully", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "srs-"));
    try {
      const store = new SubagentResultStore(dir);
      const { appendFileSync } = require("node:fs");
      const logPath = path.join(store.dir, "semantic-log.jsonl");
      appendFileSync(logPath, "not-json\n{\"result_id\":\"ok\"}\n\n");
      const log = store.readSemanticLog();
      expect(log).toHaveLength(1);
      expect(log[0].result_id).toBe("ok");
    } finally { rmSync(dir, { recursive: true }); }
  });
});

describe("assertValidResultId", () => {
  it("accepts valid ids", () => {
    expect(() => assertValidResultId("sar_abc123_1")).not.toThrow();
    expect(() => assertValidResultId("sar_x_99")).not.toThrow();
  });

  it("rejects invalid ids", () => {
    expect(() => assertValidResultId("../../evil")).toThrow("Invalid result_id");
    expect(() => assertValidResultId("not-sar")).toThrow("Invalid result_id");
    expect(() => assertValidResultId("")).toThrow("Invalid result_id");
  });
});

describe("resultSummary", () => {
  it("formats observation summary", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "srs-"));
    try {
      const store = new SubagentResultStore(dir);
      const stored = store.save(agent, observation());
      const summary = resultSummary(stored);
      expect(summary).toContain("subagent_result_available");
      expect(summary).toContain(stored.result_id);
      expect(summary).toContain("observation");
    } finally { rmSync(dir, { recursive: true }); }
  });

  it("formats patch summary with touched_paths", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "srs-"));
    try {
      const store = new SubagentResultStore(dir);
      const patchResult = {
        schema: "subagent.result.v1",
        outcome: "patch",
        summary: "fix bug",
        patch: { format: "unified_diff", body: "diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-old\n+new\n" },
        base: { files: [] },
        scope: { allowed_paths: ["src"], touched_paths: ["src/a.ts"] },
        semantic: { reads: [], writes: [{ kind: "symbol", name: "X" }], assumptions: [], effects: [], public_surface_delta: [], risk: { level: "low" } },
        validation: { suggested: [] },
      } as any;
      const stored = store.save(agent, patchResult);
      const summary = resultSummary(stored);
      expect(summary).toContain("src/a.ts");
      expect(summary).toContain("patch");
    } finally { rmSync(dir, { recursive: true }); }
  });
});

describe("SubagentResultStore: list filtering", () => {
  it("filters by status", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "srs-"));
    try {
      const store = new SubagentResultStore(dir);
      const s1 = store.save(agent, observation());
      const s2 = store.save(agent, observation());
      store.markRejected(s2.result_id, "manual_reject");

      const pending = store.list({ status: "pending" });
      expect(pending).toHaveLength(1);
      expect(pending[0].result_id).toBe(s1.result_id);

      const rejected = store.list({ status: "rejected" });
      expect(rejected).toHaveLength(1);
    } finally { rmSync(dir, { recursive: true }); }
  });

  it("returns empty for directory without matching files", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "srs-"));
    try {
      const store = new SubagentResultStore(dir);
      expect(store.list()).toEqual([]);
    } finally { rmSync(dir, { recursive: true }); }
  });
});

describe("SubagentResultStore: load validates metadata", () => {
  it("throws for invalid stored result status", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "srs-"));
    try {
      const store = new SubagentResultStore(dir);
      const stored = store.save(agent, observation());
      // Tamper with the file
      const { readFileSync, writeFileSync } = require("node:fs");
      const p = path.join(store.dir, `${stored.result_id}.json`);
      const raw = JSON.parse(readFileSync(p, "utf8"));
      raw.status = "invalid_status";
      writeFileSync(p, JSON.stringify(raw));
      expect(() => store.load(stored.result_id)).toThrow("Invalid stored result status");
    } finally { rmSync(dir, { recursive: true }); }
  });
});
