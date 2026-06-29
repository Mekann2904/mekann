import { describe, it, expect } from "vitest";
import { evaluateSemanticConflict } from "./semanticConflict.js";
import type { PatchProposalResult, SemanticApplyLogEntry } from "./types.js";

function makePatch(overrides: Partial<PatchProposalResult> = {}): PatchProposalResult {
  return {
    schema: "subagent.result.v1",
    outcome: "patch",
    summary: "test",
    patch: { format: "unified_diff", body: "diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-old\n+new\n" },
    base: { files: [] },
    scope: { allowed_paths: ["src"], touched_paths: ["src/a.ts"] },
    semantic: {
      reads: [],
      writes: [],
      assumptions: [],
      effects: [],
      public_surface_delta: [],
      risk: { level: "low" },
    },
    validation: { suggested: [] },
    ...overrides,
  };
}

function makeLogEntry(overrides: Partial<SemanticApplyLogEntry> = {}): SemanticApplyLogEntry {
  return {
    result_id: "sar_prev_1",
    agent_path: "/root/task1",
    applied_at: Date.now(),
    reads: [],
    writes: [],
    assumptions: [],
    effects: [],
    public_surface_delta: [],
    validation_result: { ok: true },
    ...overrides,
  };
}

describe("evaluateSemanticConflict", () => {
  it("returns allow for no conflict with empty log", () => {
    const incoming = makePatch();
    const decision = evaluateSemanticConflict(incoming, []);
    expect(decision.action).toBe("allow");
  });

  it("returns allow when incoming writes do not overlap with applied writes", () => {
    const incoming = makePatch({
      semantic: {
        reads: [{ kind: "symbol", name: "A" }],
        writes: [{ kind: "symbol", name: "B" }],
        assumptions: [],
        effects: [],
        public_surface_delta: [],
        risk: { level: "low" },
      },
    });
    const log = [makeLogEntry({
      writes: [{ kind: "symbol", name: "C" }],
    })];
    const decision = evaluateSemanticConflict(incoming, log);
    expect(decision.action).toBe("allow");
  });

  it("returns require_regeneration when incoming reads a target written by applied patch", () => {
    const incoming = makePatch({
      semantic: {
        reads: [{ kind: "symbol", name: "X" }],
        writes: [],
        assumptions: [],
        effects: [],
        public_surface_delta: [],
        risk: { level: "low" },
      },
    });
    const log = [makeLogEntry({
      writes: [{ kind: "symbol", name: "X" }],
    })];
    const decision = evaluateSemanticConflict(incoming, log);
    expect(decision.action).toBe("require_regeneration");
    if (decision.action === "require_regeneration") {
      expect(decision.invalidated_by).toContain("sar_prev_1");
      expect(decision.reason).toContain("X");
    }
  });

  it("returns require_review when both proposals write the same target", () => {
    const incoming = makePatch({
      semantic: {
        reads: [],
        writes: [{ kind: "symbol", name: "Y" }],
        assumptions: [],
        effects: [],
        public_surface_delta: [],
        risk: { level: "low" },
      },
    });
    const log = [makeLogEntry({
      writes: [{ kind: "symbol", name: "Y" }],
    })];
    const decision = evaluateSemanticConflict(incoming, log);
    expect(decision.action).toBe("require_review");
    if (decision.action === "require_review") {
      expect(decision.reason).toContain("Y");
    }
  });

  it("returns require_regeneration when breaking public surface delta matches incoming reads", () => {
    const incoming = makePatch({
      semantic: {
        reads: [{ kind: "symbol", name: "Foo" }],
        writes: [],
        assumptions: [],
        effects: [],
        public_surface_delta: [],
        risk: { level: "low" },
      },
    });
    const log = [makeLogEntry({
      writes: [{ kind: "symbol", name: "Z" }], // no write overlap
      public_surface_delta: [
        { surface: "typescript_export", name: "Foo", change: "remove", compatibility: "breaking" },
      ],
    })];
    const decision = evaluateSemanticConflict(incoming, log);
    expect(decision.action).toBe("require_regeneration");
  });

  it("does not trigger surface delta conflict for compatible deltas", () => {
    const incoming = makePatch({
      semantic: {
        reads: [{ kind: "symbol", name: "Foo" }],
        writes: [],
        assumptions: [],
        effects: [],
        public_surface_delta: [],
        risk: { level: "low" },
      },
    });
    const log = [makeLogEntry({
      writes: [],
      public_surface_delta: [
        { surface: "typescript_export", name: "Foo", change: "add", compatibility: "compatible" },
      ],
    })];
    const decision = evaluateSemanticConflict(incoming, log);
    // compatible delta → isBreakingOrUnknown returns false → no conflict
    expect(decision.action).toBe("allow");
  });

  it("returns require_review for high risk when allowHighRisk is false", () => {
    const incoming = makePatch({
      semantic: {
        reads: [],
        writes: [],
        assumptions: [],
        effects: [],
        public_surface_delta: [],
        risk: { level: "high" },
      },
    });
    const decision = evaluateSemanticConflict(incoming, [], { allowHighRisk: false });
    expect(decision.action).toBe("require_review");
    if (decision.action === "require_review") {
      expect(decision.reason).toContain("High semantic risk");
    }
  });

  it("returns allow for high risk when allowHighRisk is true", () => {
    const incoming = makePatch({
      semantic: {
        reads: [],
        writes: [],
        assumptions: [],
        effects: [],
        public_surface_delta: [],
        risk: { level: "high" },
      },
    });
    const decision = evaluateSemanticConflict(incoming, [], { allowHighRisk: true });
    expect(decision.action).toBe("allow");
  });

  it("returns require_review for breaking public surface delta in incoming", () => {
    const incoming = makePatch({
      semantic: {
        reads: [],
        writes: [],
        assumptions: [],
        effects: [],
        public_surface_delta: [
          { surface: "rest_api", name: "GET /api/users", change: "remove", compatibility: "breaking" },
        ],
        risk: { level: "low" },
      },
    });
    const decision = evaluateSemanticConflict(incoming, []);
    expect(decision.action).toBe("require_review");
  });

  it("returns require_review for unknown compatibility public surface delta", () => {
    const incoming = makePatch({
      semantic: {
        reads: [],
        writes: [],
        assumptions: [],
        effects: [],
        public_surface_delta: [
          { surface: "database_schema", name: "users", change: "modify", compatibility: "unknown" },
        ],
        risk: { level: "low" },
      },
    });
    const decision = evaluateSemanticConflict(incoming, []);
    expect(decision.action).toBe("require_review");
  });

  it("returns allow for compatible public surface delta", () => {
    const incoming = makePatch({
      semantic: {
        reads: [],
        writes: [],
        assumptions: [],
        effects: [],
        public_surface_delta: [
          { surface: "typescript_export", name: "newFn", change: "add", compatibility: "compatible" },
        ],
        risk: { level: "low" },
      },
    });
    const decision = evaluateSemanticConflict(incoming, []);
    expect(decision.action).toBe("allow");
  });

  it("checks multiple log entries", () => {
    const incoming = makePatch({
      semantic: {
        reads: [{ kind: "symbol", name: "R1" }, { kind: "symbol", name: "R2" }],
        writes: [{ kind: "symbol", name: "W1" }],
        assumptions: [],
        effects: [],
        public_surface_delta: [],
        risk: { level: "low" },
      },
    });
    const log = [
      makeLogEntry({ writes: [{ kind: "symbol", name: "R1" }] }),
      makeLogEntry({ writes: [{ kind: "symbol", name: "R2" }] }),
    ];
    // First log entry should trigger require_regeneration
    const decision = evaluateSemanticConflict(incoming, log);
    expect(decision.action).toBe("require_regeneration");
  });

  it("write-write conflict takes precedence over read-only check", () => {
    // incoming writes W, applied also writes W
    const incoming = makePatch({
      semantic: {
        reads: [],
        writes: [{ kind: "symbol", name: "W" }],
        assumptions: [],
        effects: [],
        public_surface_delta: [],
        risk: { level: "low" },
      },
    });
    const log = [makeLogEntry({
      writes: [{ kind: "symbol", name: "W" }],
    })];
    const decision = evaluateSemanticConflict(incoming, log);
    expect(decision.action).toBe("require_review");
  });

  // Issue #152 / IC-161: the public-surface match must compare names exactly,
  // not via substring. `r.includes(delta.name)` previously flagged a read of
  // `parseFile` when a `parse` surface changed (over-detection).
  it("does not flag a breaking surface delta whose name is only a substring of a read", () => {
    const incoming = makePatch({
      semantic: {
        reads: [{ kind: "symbol", name: "parseFile" }],
        writes: [],
        assumptions: [],
        effects: [],
        public_surface_delta: [],
        risk: { level: "low" },
      },
    });
    const log = [makeLogEntry({
      writes: [],
      public_surface_delta: [
        { surface: "typescript_export", name: "parse", change: "remove", compatibility: "breaking" },
      ],
    })];
    const decision = evaluateSemanticConflict(incoming, log);
    expect(decision.action).toBe("allow");
  });

  // Issue #152 / IC-158: same-named symbols in different modules are distinct
  // targets and must not be treated as a write-write conflict.
  it("treats same-named writes in different modules as distinct", () => {
    const incoming = makePatch({
      semantic: {
        reads: [],
        writes: [{ kind: "symbol", name: "parse", module: "b" }],
        assumptions: [],
        effects: [],
        public_surface_delta: [],
        risk: { level: "low" },
      },
    });
    const log = [makeLogEntry({
      writes: [{ kind: "symbol", name: "parse", module: "a" }],
    })];
    const decision = evaluateSemanticConflict(incoming, log);
    expect(decision.action).toBe("allow");
  });
});
