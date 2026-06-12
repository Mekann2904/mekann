import { describe, expect, it } from "vitest";
import { tryParseSubagentResult } from "./resultSchema.js";

// ─── Blocked outcome ─────────────────────────────────────────────

describe("tryParseSubagentResult: blocked outcome", () => {
  it("parses valid blocked result", () => {
    const result = tryParseSubagentResult(JSON.stringify({
      schema: "subagent.result.v1",
      outcome: "blocked",
      reason: "dependency not available",
    }));
    expect(result.ok).toBe(true);
  });

  it("rejects blocked without reason", () => {
    const result = tryParseSubagentResult(JSON.stringify({
      schema: "subagent.result.v1",
      outcome: "blocked",
    }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("reason is required");
  });
});

// ─── needs_decision outcome ──────────────────────────────────────

describe("tryParseSubagentResult: needs_decision outcome", () => {
  it("parses valid needs_decision result", () => {
    const result = tryParseSubagentResult(JSON.stringify({
      schema: "subagent.result.v1",
      outcome: "needs_decision",
      question: "Which approach?",
      options: ["A", "B"],
    }));
    expect(result.ok).toBe(true);
  });

  it("rejects needs_decision without question", () => {
    const result = tryParseSubagentResult(JSON.stringify({
      schema: "subagent.result.v1",
      outcome: "needs_decision",
      options: ["A"],
    }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("question/options");
  });

  it("rejects needs_decision without options", () => {
    const result = tryParseSubagentResult(JSON.stringify({
      schema: "subagent.result.v1",
      outcome: "needs_decision",
      question: "What?",
    }));
    expect(result.ok).toBe(false);
  });
});

// ─── no_change outcome ───────────────────────────────────────────

describe("tryParseSubagentResult: no_change outcome", () => {
  it("parses valid no_change result", () => {
    const result = tryParseSubagentResult(JSON.stringify({
      schema: "subagent.result.v1",
      outcome: "no_change",
      summary: "already correct",
    }));
    expect(result.ok).toBe(true);
  });

  it("rejects no_change without summary", () => {
    const result = tryParseSubagentResult(JSON.stringify({
      schema: "subagent.result.v1",
      outcome: "no_change",
    }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("summary");
  });
});

// ─── observation outcome ─────────────────────────────────────────

describe("tryParseSubagentResult: observation outcome", () => {
  it("rejects observation without findings", () => {
    const result = tryParseSubagentResult(JSON.stringify({
      schema: "subagent.result.v1",
      outcome: "observation",
      summary: "test",
    }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("summary/findings");
  });

  it("rejects observation without summary", () => {
    const result = tryParseSubagentResult(JSON.stringify({
      schema: "subagent.result.v1",
      outcome: "observation",
      findings: [],
    }));
    expect(result.ok).toBe(false);
  });
});

// ─── patch outcome validation ────────────────────────────────────

describe("tryParseSubagentResult: patch outcome edge cases", () => {
  it("rejects patch without patch field", () => {
    const result = tryParseSubagentResult(JSON.stringify({
      schema: "subagent.result.v1",
      outcome: "patch",
      summary: "fix",
    }));
    expect(result.ok).toBe(false);
  });

  it("rejects patch with wrong format", () => {
    const result = tryParseSubagentResult(JSON.stringify({
      schema: "subagent.result.v1",
      outcome: "patch",
      summary: "fix",
      patch: { format: "wrong", body: "diff" },
    }));
    expect(result.ok).toBe(false);
  });

  it("rejects patch without body", () => {
    const result = tryParseSubagentResult(JSON.stringify({
      schema: "subagent.result.v1",
      outcome: "patch",
      summary: "fix",
      patch: { format: "unified_diff" },
    }));
    expect(result.ok).toBe(false);
  });

  it("rejects patch with invalid semantic reads", () => {
    const result = tryParseSubagentResult(JSON.stringify({
      schema: "subagent.result.v1",
      outcome: "patch",
      summary: "fix",
      patch: { format: "unified_diff", body: "diff" },
      base: { files: [] },
      scope: { allowed_paths: ["src"], touched_paths: ["src/a.ts"] },
      semantic: {
        reads: [{ kind: "invalid_kind", name: "X" }],
        writes: [],
        assumptions: [],
        effects: [],
        public_surface_delta: [],
        risk: { level: "low" },
      },
      validation: { suggested: [] },
    }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("semantic");
  });

  it("rejects patch with invalid risk level", () => {
    const result = tryParseSubagentResult(JSON.stringify({
      schema: "subagent.result.v1",
      outcome: "patch",
      summary: "fix",
      patch: { format: "unified_diff", body: "diff" },
      base: { files: [] },
      scope: { allowed_paths: ["src"], touched_paths: ["src/a.ts"] },
      semantic: {
        reads: [],
        writes: [],
        assumptions: [],
        effects: [],
        public_surface_delta: [],
        risk: { level: "extreme" },
      },
      validation: { suggested: [] },
    }));
    expect(result.ok).toBe(false);
  });

  it("rejects patch with invalid validation command", () => {
    const result = tryParseSubagentResult(JSON.stringify({
      schema: "subagent.result.v1",
      outcome: "patch",
      summary: "fix",
      patch: { format: "unified_diff", body: "diff" },
      base: { files: [] },
      scope: { allowed_paths: ["src"], touched_paths: ["src/a.ts"] },
      semantic: {
        reads: [],
        writes: [{ kind: "symbol", name: "X" }],
        assumptions: [],
        effects: [],
        public_surface_delta: [],
        risk: { level: "low" },
      },
      validation: { suggested: [{ kind: "unknown" }] },
    }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("validation");
  });

  it("accepts patch with valid assumptions", () => {
    const result = tryParseSubagentResult(JSON.stringify({
      schema: "subagent.result.v1",
      outcome: "patch",
      summary: "fix",
      patch: { format: "unified_diff", body: "diff" },
      base: { files: [] },
      scope: { allowed_paths: ["src"], touched_paths: ["src/a.ts"] },
      semantic: {
        reads: [],
        writes: [{ kind: "symbol", name: "X" }],
        assumptions: [{
          kind: "symbol_signature",
          target: { kind: "symbol", name: "fn" },
          expected: "(x: number) => string",
        }],
        effects: [],
        public_surface_delta: [],
        risk: { level: "low" },
      },
      validation: { suggested: [] },
    }));
    expect(result.ok).toBe(true);
  });

  it("accepts patch with valid effects", () => {
    const result = tryParseSubagentResult(JSON.stringify({
      schema: "subagent.result.v1",
      outcome: "patch",
      summary: "fix",
      patch: { format: "unified_diff", body: "diff" },
      base: { files: [] },
      scope: { allowed_paths: ["src"], touched_paths: ["src/a.ts"] },
      semantic: {
        reads: [],
        writes: [{ kind: "symbol", name: "X" }],
        assumptions: [],
        effects: [{
          kind: "api_contract",
          target: { kind: "api_route", name: "GET /api" },
          change: "add",
          compatibility: "backward_compatible",
        }],
        public_surface_delta: [],
        risk: { level: "low" },
      },
      validation: { suggested: [] },
    }));
    expect(result.ok).toBe(true);
  });

  it("accepts patch with required checks", () => {
    const result = tryParseSubagentResult(JSON.stringify({
      schema: "subagent.result.v1",
      outcome: "patch",
      summary: "fix",
      patch: { format: "unified_diff", body: "diff" },
      base: { files: [] },
      scope: { allowed_paths: ["src"], touched_paths: ["src/a.ts"] },
      semantic: {
        reads: [],
        writes: [{ kind: "symbol", name: "X" }],
        assumptions: [],
        effects: [],
        public_surface_delta: [],
        risk: { level: "low" },
      },
      validation: {
        suggested: [],
        required: [{ kind: "typecheck" }],
      },
    }));
    expect(result.ok).toBe(true);
  });

  it("rejects patch with invalid required check", () => {
    const result = tryParseSubagentResult(JSON.stringify({
      schema: "subagent.result.v1",
      outcome: "patch",
      summary: "fix",
      patch: { format: "unified_diff", body: "diff" },
      base: { files: [] },
      scope: { allowed_paths: ["src"], touched_paths: ["src/a.ts"] },
      semantic: {
        reads: [],
        writes: [{ kind: "symbol", name: "X" }],
        assumptions: [],
        effects: [],
        public_surface_delta: [],
        risk: { level: "low" },
      },
      validation: {
        suggested: [],
        required: [{ kind: "invalid_check" }],
      },
    }));
    expect(result.ok).toBe(false);
  });
});

// ─── Schema validation ───────────────────────────────────────────

describe("tryParseSubagentResult: schema validation", () => {
  it("rejects non-object input", () => {
    const result = tryParseSubagentResult("42");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("JSON object");
  });

  it("rejects array input", () => {
    const result = tryParseSubagentResult("[1,2,3]");
    expect(result.ok).toBe(false);
  });

  it("rejects missing schema field", () => {
    const result = tryParseSubagentResult(JSON.stringify({ outcome: "no_change", summary: "x" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("schema");
  });

  it("rejects wrong schema", () => {
    const result = tryParseSubagentResult(JSON.stringify({ schema: "wrong.v1", outcome: "no_change", summary: "x" }));
    expect(result.ok).toBe(false);
  });

  it("rejects missing outcome", () => {
    const result = tryParseSubagentResult(JSON.stringify({ schema: "subagent.result.v1", summary: "x" }));
    expect(result.ok).toBe(false);
  });

  it("rejects patch with ref from subagent", () => {
    const result = tryParseSubagentResult(JSON.stringify({
      schema: "subagent.result.v1",
      outcome: "patch",
      summary: "fix",
      patch: { format: "unified_diff", ref: "/tmp/x.patch" },
    }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("patch.ref");
  });

  it("rejects invalid scope", () => {
    const result = tryParseSubagentResult(JSON.stringify({
      schema: "subagent.result.v1",
      outcome: "patch",
      summary: "fix",
      patch: { format: "unified_diff", body: "diff" },
      base: { files: [] },
      scope: { allowed_paths: "not-array", touched_paths: ["src/a.ts"] },
      semantic: {
        reads: [], writes: [], assumptions: [], effects: [],
        public_surface_delta: [], risk: { level: "low" },
      },
      validation: { suggested: [] },
    }));
    expect(result.ok).toBe(false);
  });

  it("rejects invalid base files", () => {
    const result = tryParseSubagentResult(JSON.stringify({
      schema: "subagent.result.v1",
      outcome: "patch",
      summary: "fix",
      patch: { format: "unified_diff", body: "diff" },
      base: { files: ["not-an-object"] },
      scope: { allowed_paths: ["src"], touched_paths: ["src/a.ts"] },
      semantic: {
        reads: [], writes: [], assumptions: [], effects: [],
        public_surface_delta: [], risk: { level: "low" },
      },
      validation: { suggested: [] },
    }));
    expect(result.ok).toBe(false);
  });
});

// ─── Effect validation ───────────────────────────────────────────

describe("tryParseSubagentResult: effect types", () => {
  function makePatchWithEffect(effect: unknown) {
    return {
      schema: "subagent.result.v1",
      outcome: "patch",
      summary: "fix",
      patch: { format: "unified_diff", body: "diff" },
      base: { files: [] },
      scope: { allowed_paths: ["src"], touched_paths: ["src/a.ts"] },
      semantic: {
        reads: [],
        writes: [{ kind: "symbol", name: "X" }],
        assumptions: [],
        effects: [effect],
        public_surface_delta: [],
        risk: { level: "low" },
      },
      validation: { suggested: [] },
    };
  }

  it("accepts data_model effect", () => {
    const r = tryParseSubagentResult(JSON.stringify(makePatchWithEffect({
      kind: "data_model", target: { kind: "db_table", name: "users" },
      change: "add", compatibility: "backward_compatible",
    })));
    expect(r.ok).toBe(true);
  });

  it("accepts behavior effect", () => {
    const r = tryParseSubagentResult(JSON.stringify(makePatchWithEffect({
      kind: "behavior", target: { kind: "symbol", name: "fn" },
      description: "changed behavior", compatibility: "unknown",
    })));
    expect(r.ok).toBe(true);
  });

  it("accepts config effect", () => {
    const r = tryParseSubagentResult(JSON.stringify(makePatchWithEffect({
      kind: "config", target: { kind: "config_key", name: "port" },
      change: "modify", compatibility: "backward_compatible",
    })));
    expect(r.ok).toBe(true);
  });

  it("accepts side_effect effect", () => {
    const r = tryParseSubagentResult(JSON.stringify(makePatchWithEffect({
      kind: "side_effect", target: { kind: "file", name: "log.txt" },
      operation: "write",
    })));
    expect(r.ok).toBe(true);
  });

  it("accepts test_expectation effect", () => {
    const r = tryParseSubagentResult(JSON.stringify(makePatchWithEffect({
      kind: "test_expectation", target: { kind: "test_contract", name: "e2e" },
      change: "modify",
    })));
    expect(r.ok).toBe(true);
  });

  it("rejects effect with invalid kind", () => {
    const r = tryParseSubagentResult(JSON.stringify(makePatchWithEffect({
      kind: "invalid", target: { kind: "symbol", name: "X" },
    })));
    expect(r.ok).toBe(false);
  });
});

// ─── Public surface delta validation ─────────────────────────────

describe("tryParseSubagentResult: public surface deltas", () => {
  function makePatchWithDelta(delta: unknown) {
    return {
      schema: "subagent.result.v1",
      outcome: "patch",
      summary: "fix",
      patch: { format: "unified_diff", body: "diff" },
      base: { files: [] },
      scope: { allowed_paths: ["src"], touched_paths: ["src/a.ts"] },
      semantic: {
        reads: [],
        writes: [{ kind: "symbol", name: "X" }],
        assumptions: [],
        effects: [],
        public_surface_delta: [delta],
        risk: { level: "low" },
      },
      validation: { suggested: [] },
    };
  }

  it("accepts valid public surface delta", () => {
    const r = tryParseSubagentResult(JSON.stringify(makePatchWithDelta({
      surface: "typescript_export", name: "fn", change: "add", compatibility: "compatible",
    })));
    expect(r.ok).toBe(true);
  });

  it("rejects invalid surface kind", () => {
    const r = tryParseSubagentResult(JSON.stringify(makePatchWithDelta({
      surface: "invalid", name: "fn", change: "add", compatibility: "compatible",
    })));
    expect(r.ok).toBe(false);
  });

  it("rejects invalid change", () => {
    const r = tryParseSubagentResult(JSON.stringify(makePatchWithDelta({
      surface: "typescript_export", name: "fn", change: "invalid", compatibility: "compatible",
    })));
    expect(r.ok).toBe(false);
  });

  it("rejects invalid compatibility", () => {
    const r = tryParseSubagentResult(JSON.stringify(makePatchWithDelta({
      surface: "typescript_export", name: "fn", change: "add", compatibility: "invalid",
    })));
    expect(r.ok).toBe(false);
  });
});
