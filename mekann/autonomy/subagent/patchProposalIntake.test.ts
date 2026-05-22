import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { admitPatchProposal } from "./patchProposalIntake.js";
import type { PatchProposalResult } from "./types.js";

function withTemp<T>(fn: (dir: string, patchDir: string) => T): T {
  const dir = mkdtempSync(path.join(tmpdir(), "ppi-"));
  const patchDir = path.join(dir, ".pi", "subagent-results");
  mkdirSync(patchDir, { recursive: true });
  try { return fn(dir, patchDir); }
  finally { rmSync(dir, { recursive: true, force: true }); }
}

function proposal(ref: string, overrides: Partial<PatchProposalResult> = {}): PatchProposalResult {
  return {
    schema: "subagent.result.v1",
    outcome: "patch",
    summary: "fix",
    patch: { format: "unified_diff", ref },
    base: { files: [] },
    scope: { allowed_paths: ["src"], touched_paths: ["src/a.ts"] },
    semantic: { reads: [], writes: [{ kind: "symbol", name: "X" }], assumptions: [], effects: [], public_surface_delta: [], risk: { level: "low" } },
    validation: { suggested: [] },
    ...overrides,
  };
}

const PATCH = "diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-old\n+new\n";

describe("Patch proposal intake", () => {
  it("returns profile metadata for an allowed candidate escrow proposal", () => withTemp((cwd, patchDir) => {
    const ref = path.join(patchDir, "p.diff");
    writeFileSync(ref, PATCH);

    const result = admitPatchProposal({
      cwd,
      proposal: proposal(ref),
      authority: { mode: "propose_patch", write_scope: ["src/**"], require_base_hash: false },
      authorityEnforced: true,
      patchRefRootDir: patchDir,
      profile: "candidate_escrow",
      writeScopeMatcher: (file, scopes) => scopes.some((scope) => scope === "src/**" && file.startsWith("src/")),
    });

    expect(result.kind).toBe("allow");
    if (result.kind !== "allow") return;
    expect(result.patchText).toBe(PATCH);
    expect(result.patchSha256).toMatch(/^sha256:/);
    expect(result.touchedPaths).toEqual(["src/a.ts"]);
    expect(result.canonicalWriteScope).toEqual(["src/**"]);
    expect(result.audit.profile).toBe("candidate_escrow");
  }));

  it("maps candidate escrow authority failures to candidate reasons", () => withTemp((cwd, patchDir) => {
    const ref = path.join(patchDir, "p.diff");
    writeFileSync(ref, PATCH);

    const result = admitPatchProposal({
      cwd,
      proposal: proposal(ref),
      authority: { mode: "propose_patch", write_scope: ["src/**"], require_base_hash: false },
      authorityEnforced: false,
      patchRefRootDir: patchDir,
      profile: "candidate_escrow",
      writeScopeMatcher: (file, scopes) => scopes.some((scope) => scope === "src/**" && file.startsWith("src/")),
    });

    expect(result.kind).toBe("reject");
    expect(result.reason).toBe("authority_not_enforced");
  }));

  it("maps subagent apply missing write scope to review metadata", () => withTemp((cwd, patchDir) => {
    const ref = path.join(patchDir, "p.diff");
    writeFileSync(ref, PATCH);

    const result = admitPatchProposal({
      cwd,
      proposal: proposal(ref),
      authority: { mode: "propose_patch", require_base_hash: false },
      authorityEnforced: true,
      patchRefRootDir: patchDir,
      profile: "subagent_apply",
    });

    expect(result.kind).toBe("allow");
    if (result.kind !== "allow") return;
    expect(result.canonicalWriteScope).toEqual([]);
    expect(result.touchedPaths).toEqual(["src/a.ts"]);
  }));
});
