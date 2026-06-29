/**
 * scope.ts — matchesScope のルールベース化に伴うテスト。
 *
 * このファイルは以下を検証する:
 *
 * 1. **各 matcher の意図**: `cwdAxis` / `sessionAxis` を軸単位で独立テストし、
 *    strict / include-global × 各軸の有無 × project/global scoped の組み合わせごとに
 *    期待振る舞いを文書化する（characterization table）。
 * 2. **現行挙動の保存**: リファクタ前の実装を `legacyMatchesScope` 参照オラクルとして埋め込み、
 *    property-based test でリファクタ後の `matchesScope` と全入力空間で同値であることを証明する。
 * 3. **構成則**: `matchesScope` が軸 matcher の論理積(conjunction)であること。
 * 4. **拡張性**: `branchId` 軸を想定した matcher を追加合成し、既存軸(cwd/session)へ影響せず、
 *    branchId 要求時のみ結果が変化することを示す。
 *
 * fast-check の入力空間は有限の小領域(`/a`,`/b` × `s1`,`s2` × strict/include-global/未指定 × undefined)
 * に絞っており、網羅性と縮小時の可読性を両立させる。
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { ContextScope, StoredContextObservation } from "./observation.js";
import {
  matchesScope,
  scopedSamples,
  currentScope,
  cwdAxis,
  sessionAxis,
  composeScopeMatchers,
  type ScopeAxisMatcher,
  type ScopeMode,
} from "./scope.js";

// ─── Helpers ──────────────────────────────────────────────────────────

/** Build a minimal stored observation. matchesScope reads only cwd/sessionId. */
function mkSample(cwd?: string, sessionId?: string): StoredContextObservation {
  return { id: 0, at: 0, phase: "provider_request", summary: {}, cwd, sessionId };
}

/**
 * Reference oracle: the EXACT pre-refactor implementation of matchesScope.
 * The property test pins the refactored composition against this to prove
 * behavioral preservation. Do not "improve" this — it must stay byte-for-byte
 * the legacy logic.
 */
function legacyMatchesScope(sample: StoredContextObservation, scope: ContextScope): boolean {
  const mode = scope.mode ?? "strict";
  if (scope.cwd !== undefined) {
    const cwdMatches = sample.cwd === scope.cwd || (mode === "include-global" && sample.cwd === undefined);
    if (!cwdMatches) return false;
  }
  if (scope.sessionId !== undefined) {
    const projectScoped =
      sample.cwd !== undefined && sample.cwd === scope.cwd && sample.sessionId === undefined;
    const globalScoped = mode === "include-global" && sample.cwd === undefined && sample.sessionId === undefined;
    const sessionMatches = sample.sessionId === scope.sessionId || projectScoped || globalScoped;
    if (!sessionMatches) return false;
  }
  return true;
}

// ─── Arbitraries (finite, tractable input space) ──────────────────────

const cwdArb: fc.Arbitrary<string | undefined> = fc.oneof(
  fc.constant(undefined),
  fc.constant("/a"),
  fc.constant("/b"),
);
const sessionArb: fc.Arbitrary<string | undefined> = fc.oneof(
  fc.constant(undefined),
  fc.constant("s1"),
  fc.constant("s2"),
);
const modeArb: fc.Arbitrary<ScopeMode | undefined> = fc.oneof(
  fc.constant(undefined),
  fc.constant("strict"),
  fc.constant("include-global"),
);

const scopeArb = fc.record({ cwd: cwdArb, sessionId: sessionArb, mode: modeArb });
const sampleFieldsArb = fc.record({ cwd: cwdArb, sessionId: sessionArb });

// ─── cwdAxis: intent documentation ────────────────────────────────────

describe("cwdAxis", () => {
  it("has no opinion when cwd is not requested", () => {
    for (const mode of ["strict", "include-global", undefined] as const) {
      for (const cwd of [undefined, "/a", "/b"]) {
        expect(cwdAxis(mkSample(cwd), { mode }, mode ?? "strict")).toBe(true);
      }
    }
  });

  it("strict: matches only on exact cwd; unscoped observations are excluded", () => {
    expect(cwdAxis(mkSample("/a"), { cwd: "/a" }, "strict")).toBe(true);
    expect(cwdAxis(mkSample("/b"), { cwd: "/a" }, "strict")).toBe(false);
    expect(cwdAxis(mkSample(undefined), { cwd: "/a" }, "strict")).toBe(false);
  });

  it("include-global: also admits observations that carry no cwd", () => {
    expect(cwdAxis(mkSample("/a"), { cwd: "/a" }, "include-global")).toBe(true);
    expect(cwdAxis(mkSample("/b"), { cwd: "/a" }, "include-global")).toBe(false);
    expect(cwdAxis(mkSample(undefined), { cwd: "/a" }, "include-global")).toBe(true);
  });
});

// ─── sessionAxis: intent documentation ────────────────────────────────

describe("sessionAxis", () => {
  it("has no opinion when sessionId is not requested", () => {
    for (const mode of ["strict", "include-global", undefined] as const) {
      for (const sessionId of [undefined, "s1", "s2"]) {
        expect(sessionAxis(mkSample(undefined, sessionId), { mode }, mode ?? "strict")).toBe(true);
      }
    }
  });

  it("matches on exact session id in any mode", () => {
    expect(sessionAxis(mkSample("/a", "s1"), { cwd: "/a", sessionId: "s1" }, "strict")).toBe(true);
    expect(sessionAxis(mkSample("/a", "s1"), { cwd: "/a", sessionId: "s1" }, "include-global")).toBe(true);
  });

  it("admits project-scoped observations (matching cwd, no sessionId)", () => {
    expect(sessionAxis(mkSample("/a", undefined), { cwd: "/a", sessionId: "s1" }, "strict")).toBe(true);
    // different project's project-scoped observation does NOT cover this session
    expect(sessionAxis(mkSample("/b", undefined), { cwd: "/a", sessionId: "s1" }, "strict")).toBe(false);
  });

  it("strict: rejects truly-global observations (no cwd, no sessionId)", () => {
    expect(sessionAxis(mkSample(undefined, undefined), { cwd: "/a", sessionId: "s1" }, "strict")).toBe(false);
  });

  it("include-global: admits truly-global observations (no cwd, no sessionId)", () => {
    expect(sessionAxis(mkSample(undefined, undefined), { cwd: "/a", sessionId: "s1" }, "include-global")).toBe(true);
    // a session-bearing sample that is neither the requested session nor global is still rejected
    expect(sessionAxis(mkSample(undefined, "s2"), { cwd: "/a", sessionId: "s1" }, "include-global")).toBe(false);
  });

  it("rejects a session mismatch when the sample has a (different) sessionId", () => {
    expect(sessionAxis(mkSample("/a", "s2"), { cwd: "/a", sessionId: "s1" }, "strict")).toBe(false);
    expect(sessionAxis(mkSample("/a", "s2"), { cwd: "/a", sessionId: "s1" }, "include-global")).toBe(false);
  });
});

// ─── matchesScope: characterization matrix (intent per combination) ────

describe("matchesScope: characterization matrix", () => {
  // scope requesting BOTH cwd and sessionId — the richest combination
  describe("scope { cwd, sessionId }", () => {
    const scoped = { cwd: "/a", sessionId: "s1" } satisfies ContextScope;

    it("strict (default): only exact + project-scoped samples participate", () => {
      expect(matchesScope(mkSample("/a", "s1"), scoped)).toBe(true); // exact
      expect(matchesScope(mkSample("/a", undefined), scoped)).toBe(true); // project-scoped
      expect(matchesScope(mkSample("/b", "s1"), scoped)).toBe(false); // wrong project
      expect(matchesScope(mkSample("/a", "s2"), scoped)).toBe(false); // wrong session
      expect(matchesScope(mkSample(undefined, undefined), scoped)).toBe(false); // global excluded in strict
      expect(matchesScope(mkSample(undefined, "s1"), scoped)).toBe(false); // session-only global excluded (cwd axis fails)
    });

    it("include-global: exact + project-scoped + truly-global participate; wrong project still excluded", () => {
      const global = { ...scoped, mode: "include-global" } satisfies ContextScope;
      expect(matchesScope(mkSample("/a", "s1"), global)).toBe(true); // exact
      expect(matchesScope(mkSample("/a", undefined), global)).toBe(true); // project-scoped
      expect(matchesScope(mkSample("/b", "s1"), global)).toBe(false); // wrong project still excluded
      expect(matchesScope(mkSample("/a", "s2"), global)).toBe(false); // wrong session still excluded
      expect(matchesScope(mkSample(undefined, undefined), global)).toBe(true); // truly-global participates
      expect(matchesScope(mkSample(undefined, "s1"), global)).toBe(true); // global cwd + exact session participates
      expect(matchesScope(mkSample(undefined, "s2"), global)).toBe(false); // global cwd + wrong session excluded
    });
  });

  // scope requesting ONLY sessionId — cwd axis is a no-op, so project-scoped
  // samples (which key off scope.cwd) cannot satisfy the session axis.
  describe("scope { sessionId } only", () => {
    const scoped = { sessionId: "s1" } satisfies ContextScope;

    it("strict: exact session matches; project-scoped/global do not (no cwd requested)", () => {
      expect(matchesScope(mkSample(undefined, "s1"), scoped)).toBe(true); // exact session
      expect(matchesScope(mkSample("/a", "s1"), scoped)).toBe(true); // exact session, any cwd
      expect(matchesScope(mkSample("/a", undefined), scoped)).toBe(false); // project-scoped needs scope.cwd
      expect(matchesScope(mkSample(undefined, undefined), scoped)).toBe(false); // global excluded in strict
    });

    it("include-global: truly-global participates; project-scoped still does not", () => {
      const global = { ...scoped, mode: "include-global" } satisfies ContextScope;
      expect(matchesScope(mkSample(undefined, "s1"), global)).toBe(true);
      expect(matchesScope(mkSample(undefined, undefined), global)).toBe(true); // truly-global
      expect(matchesScope(mkSample("/a", undefined), global)).toBe(false); // project-scoped still excluded (cwd != undefined)
    });
  });

  // scope requesting ONLY cwd — session axis is a no-op.
  describe("scope { cwd } only", () => {
    const scoped = { cwd: "/a" } satisfies ContextScope;

    it("strict: exact cwd matches regardless of session; unscoped excluded", () => {
      expect(matchesScope(mkSample("/a", undefined), scoped)).toBe(true);
      expect(matchesScope(mkSample("/a", "s1"), scoped)).toBe(true);
      expect(matchesScope(mkSample("/b", "s1"), scoped)).toBe(false);
      expect(matchesScope(mkSample(undefined, "s1"), scoped)).toBe(false); // unscoped excluded in strict
    });

    it("include-global: observations with no cwd also participate", () => {
      const global = { ...scoped, mode: "include-global" } satisfies ContextScope;
      expect(matchesScope(mkSample("/a", "s1"), global)).toBe(true);
      expect(matchesScope(mkSample(undefined, undefined), global)).toBe(true); // global participates
      expect(matchesScope(mkSample("/b", "s1"), global)).toBe(false); // wrong cwd still excluded
    });
  });

  // empty scope — no axis requested, everything participates.
  describe("empty scope {}", () => {
    it("matches every sample in every mode", () => {
      for (const mode of ["strict", "include-global", undefined] as const) {
        const scope: ContextScope = { mode };
        expect(matchesScope(mkSample(undefined, undefined), scope)).toBe(true);
        expect(matchesScope(mkSample("/a", "s1"), scope)).toBe(true);
        expect(matchesScope(mkSample("/b", "s2"), scope)).toBe(true);
      }
    });
  });
});

// ─── Property-based invariants ────────────────────────────────────────

describe("matchesScope: property-based invariants", () => {
  it("refactor equivalence: identical to the legacy reference oracle across the whole input space", () => {
    fc.assert(
      fc.property(scopeArb, sampleFieldsArb, (scope, fields) => {
        const sample = mkSample(fields.cwd, fields.sessionId);
        return matchesScope(sample, scope) === legacyMatchesScope(sample, scope);
      }),
      { numRuns: 500 },
    );
  });

  it("monotonicity: strict match ⇒ include-global match (include-global only adds unscoped participation)", () => {
    fc.assert(
      fc.property(scopeArb, sampleFieldsArb, (scope, fields) => {
        const sample = mkSample(fields.cwd, fields.sessionId);
        const strict: ContextScope = { cwd: scope.cwd, sessionId: scope.sessionId, mode: "strict" };
        const inclusive: ContextScope = { cwd: scope.cwd, sessionId: scope.sessionId, mode: "include-global" };
        return !matchesScope(sample, strict) || matchesScope(sample, inclusive);
      }),
      { numRuns: 500 },
    );
  });

  it("each matcher is a no-op when its own axis is not requested", () => {
    // Design intent: a matcher contributes no opinion (returns true) whenever the
    // scope does not request its axis, regardless of the sample's field values.
    // (Note: the session axis *deliberately* inspects sample.cwd for its
    // "truly-global" concept, so cross-axis value-independence does NOT hold —
    // only per-matcher no-op-ness does. The oracle-equivalence property above
    // pins the resulting end-to-end behavior.)
    fc.assert(
      fc.property(scopeArb, sampleFieldsArb, (scope, fields) => {
        const sample = mkSample(fields.cwd, fields.sessionId);
        const mode = scope.mode ?? "strict";
        const noCwd = { ...scope, cwd: undefined } as ContextScope;
        const noSession = { ...scope, sessionId: undefined } as ContextScope;
        return cwdAxis(sample, noCwd, mode) === true && sessionAxis(sample, noSession, mode) === true;
      }),
      { numRuns: 500 },
    );
  });

  it("composition: matchesScope equals the conjunction of cwdAxis ∧ sessionAxis", () => {
    fc.assert(
      fc.property(scopeArb, sampleFieldsArb, (scope, fields) => {
        const sample = mkSample(fields.cwd, fields.sessionId);
        const mode = scope.mode ?? "strict";
        const conjunctive = cwdAxis(sample, scope, mode) && sessionAxis(sample, scope, mode);
        return matchesScope(sample, scope) === conjunctive;
      }),
      { numRuns: 500 },
    );
  });

  it("exact match always participates: requesting a sample's own cwd+session always matches", () => {
    fc.assert(
      fc.property(cwdArb.filter((c): c is string => c !== undefined), sessionArb.filter((s): s is string => s !== undefined), modeArb, (cwd, sessionId, mode) => {
        const scope: ContextScope = { cwd, sessionId, mode };
        const sample = mkSample(cwd, sessionId);
        for (const m of ["strict", "include-global"] as const) {
          expect(matchesScope(sample, { cwd, sessionId, mode: m })).toBe(true);
        }
        return true;
      }),
      { numRuns: 200 },
    );
  });
});

// ─── Extensibility: adding a new axis does not perturb existing axes ───

describe("extensibility: adding a branchId axis", () => {
  // Simulated future extension: ContextScope/observation gain an optional branchId.
  type BranchScope = ContextScope & { branchId?: string };
  type BranchSample = StoredContextObservation & { branchId?: string };

  const branchIdAxis: ScopeAxisMatcher = (sample, scope, mode) => {
    const s = scope as BranchScope;
    if (s.branchId === undefined) return true; // axis not requested → no opinion
    const b = (sample as BranchSample).branchId;
    if (b === s.branchId) return true; // exact branch match
    return mode === "include-global" && b === undefined; // global fallback
  };

  const matchesWithBranch = composeScopeMatchers([cwdAxis, sessionAxis, branchIdAxis]);

  const mkBranchSample = (cwd?: string, sessionId?: string, branchId?: string): BranchSample => ({
    ...mkSample(cwd, sessionId),
    branchId,
  });

  it("does not change behavior when branchId is not requested (existing axes untouched)", () => {
    fc.assert(
      fc.property(scopeArb, sampleFieldsArb, fc.oneof(fc.constant(undefined), fc.constant("main"), fc.constant("dev")), (scope, fields, branchId) => {
        const sample = mkBranchSample(fields.cwd, fields.sessionId, branchId);
        return matchesWithBranch(sample, scope) === matchesScope(sample, scope);
      }),
      { numRuns: 500 },
    );
  });

  it("filters by branchId only when requested, following the same strict/include-global rules", () => {
    const base: BranchScope = { cwd: "/a", sessionId: "s1" };

    // strict + matching branch → match
    expect(matchesWithBranch(mkBranchSample("/a", "s1", "main"), { ...base, branchId: "main", mode: "strict" })).toBe(true);
    // strict + mismatched branch → reject (would otherwise match)
    expect(matchesWithBranch(mkBranchSample("/a", "s1", "dev"), { ...base, branchId: "main", mode: "strict" })).toBe(false);
    // strict + missing branch on sample → reject
    expect(matchesWithBranch(mkBranchSample("/a", "s1", undefined), { ...base, branchId: "main", mode: "strict" })).toBe(false);
    // include-global + missing branch on sample → match (global fallback)
    expect(matchesWithBranch(mkBranchSample("/a", "s1", undefined), { ...base, branchId: "main", mode: "include-global" })).toBe(true);
  });
});

// ─── currentScope / scopedSamples: integration smoke ──────────────────

describe("currentScope / scopedSamples", () => {
  it("currentScope derives strict {cwd, sessionId} from the latest sample", () => {
    expect(currentScope([])).toEqual({ cwd: undefined, sessionId: undefined, mode: "strict" });
    expect(currentScope([mkSample("/a", "s1")])).toEqual({ cwd: "/a", sessionId: "s1", mode: "strict" });
  });

  it("scopedSamples filters by the derived (or provided) scope", () => {
    const samples = [
      mkSample("/b", "s2"),
      mkSample(undefined, undefined), // global
      mkSample("/a", undefined), // project-scoped for /a
      mkSample("/a", "s1"), // latest → derived scope { /a, s1, strict }
    ];
    // derived default scope from the latest sample { /a, s1, strict }: exact + project-scoped
    expect(scopedSamples(samples).map((s) => [s.cwd, s.sessionId])).toEqual([
      ["/a", undefined],
      ["/a", "s1"],
    ]);
    // include-global over /a/s1 additionally admits the truly-global sample
    const global = scopedSamples(samples, { cwd: "/a", sessionId: "s1", mode: "include-global" });
    expect(global.map((s) => [s.cwd, s.sessionId])).toEqual([
      [undefined, undefined],
      ["/a", undefined],
      ["/a", "s1"],
    ]);
  });
});
