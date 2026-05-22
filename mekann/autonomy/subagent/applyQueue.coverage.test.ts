import { describe, expect, it, vi, beforeEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ApplyQueue } from "./applyQueue.js";
import { SubagentResultStore } from "./resultStore.js";
import type { AgentMetadata, PatchProposalResult, PublicSurfaceDelta } from "./types.js";

// ── Mocks ──────────────────────────────────────────────────────────────────

const { mockExecFileCb } = vi.hoisted(() => ({ mockExecFileCb: vi.fn() }));
vi.mock("node:child_process", () => ({ execFile: mockExecFileCb }));

vi.mock("./fingerprint.js", () => ({
  extractTouchedPathsFromPatchStrict: vi.fn(),
  detectPublicSurfaceFromPatch: vi.fn(),
  normalizePublicSurfaceDeltas: vi.fn(),
  checkBaseFileHashes: vi.fn(),
  isNewFilePatch: vi.fn(),
  safeRepoRelativePath: vi.fn(),
}));

vi.mock("./semanticConflict.js", () => ({
  evaluateSemanticConflict: vi.fn(),
}));

vi.mock("./semantic.js", () => ({
  keyOfTarget: vi.fn(),
  intersects: vi.fn(),
  isHighRisk: vi.fn(),
  isBreakingOrUnknown: vi.fn(),
}));

// Import mocked modules so we can configure per-test
import {
  extractTouchedPathsFromPatchStrict,
  detectPublicSurfaceFromPatch,
  normalizePublicSurfaceDeltas,
  checkBaseFileHashes,
  isNewFilePatch,
  safeRepoRelativePath,
} from "./fingerprint.js";
import { evaluateSemanticConflict } from "./semanticConflict.js";
import { keyOfTarget } from "./semantic.js";

// ── Helpers ────────────────────────────────────────────────────────────────

function resetMocks() {
  vi.mocked(extractTouchedPathsFromPatchStrict).mockReturnValue({ ok: true, paths: ["src/a.ts"] });
  vi.mocked(detectPublicSurfaceFromPatch).mockReturnValue([]);
  vi.mocked(normalizePublicSurfaceDeltas).mockImplementation((d: PublicSurfaceDelta[]) => d);
  vi.mocked(checkBaseFileHashes).mockResolvedValue({ ok: true });
  vi.mocked(isNewFilePatch).mockReturnValue(false);
  vi.mocked(safeRepoRelativePath).mockImplementation((p: string) => p);
  vi.mocked(evaluateSemanticConflict).mockReturnValue({ action: "allow" });
  vi.mocked(keyOfTarget).mockImplementation((t: { kind: string; name: string }) => `${t.kind}:${t.name}`);
}

function defaultExecFile(_cmd: string, _args: string[], _opts: unknown, cb: (err: null, r: { stdout: string; stderr: string }) => void) {
  cb(null, { stdout: "", stderr: "" });
}

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

function makePatch(overrides: Partial<PatchProposalResult> = {}): PatchProposalResult {
  return {
    schema: "subagent.result.v1", outcome: "patch", summary: "fix",
    patch: {
      format: "unified_diff",
      body: "diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-old\n+new\n",
    },
    base: { files: [] },
    scope: { allowed_paths: ["src"], touched_paths: ["src/a.ts"] },
    semantic: { reads: [], writes: [{ kind: "symbol", name: "X" }], assumptions: [], effects: [], public_surface_delta: [], risk: { level: "low" } },
    validation: { suggested: [] },
    ...overrides,
  };
}

function setup(overrides: { agent?: Partial<AgentMetadata>; shellAllowlist?: Record<string, string> } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "aq-cov-"));
  const agent = makeAgent({ workspaceCwd: dir, ...overrides.agent });
  const store = new SubagentResultStore(dir);
  const q = new ApplyQueue(store, dir, overrides.shellAllowlist ?? {});
  const cleanup = () => { try { rmSync(dir, { recursive: true }); } catch { /* ignore */ } };
  return { dir, store, q, agent, cleanup };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("ApplyQueue coverage – applyOneInner happy path & runValidation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMocks();
    mockExecFileCb.mockImplementation(defaultExecFile);
  });

  // Line 121: validationResult construction on successful apply (no validation commands)
  it("fully applies a patch with no validation commands", async () => {
    const { store, q, agent, cleanup } = setup();
    try {
      store.save(agent, makePatch());
      const result = await q.applyAgentResults();
      expect(result.applied).toHaveLength(1);
      expect(result.applied[0]!.agent_path).toBe("/root/task");
      expect(result.rejected).toHaveLength(0);
      expect(result.needs_review).toHaveLength(0);
    } finally { cleanup(); }
  });

  // Line 144: npm_script validation succeeds
  it("runs npm_script validation and applies on success", async () => {
    const { store, q, agent, cleanup } = setup({
      agent: {
        authority: {
          mode: "propose_patch", write_scope: ["src"], require_base_hash: false, max_patch_bytes: 50_000,
          allowed_commands: [{ kind: "npm_script" as const, script: "test" }],
        },
      },
    });
    try {
      store.save(agent, makePatch({
        validation: { suggested: [{ kind: "npm_script", script: "test" }] },
      }));
      const result = await q.applyAgentResults();
      expect(result.applied).toHaveLength(1);
      // npm run was called
      expect(mockExecFileCb).toHaveBeenCalledWith(
        "npm",
        expect.arrayContaining(["run", "test"]),
        expect.anything(),
        expect.any(Function),
      );
    } finally { cleanup(); }
  });

  // Line 146: shell_allowlisted command_id not in shellAllowlist → ok:false
  it("rejects when shell_allowlisted command_id is not in shellAllowlist", async () => {
    const { store, q, agent, cleanup } = setup({
      agent: {
        authority: {
          mode: "propose_patch", write_scope: ["src"], require_base_hash: false, max_patch_bytes: 50_000,
          allowed_commands: [{ kind: "shell_allowlisted" as const, command_id: "mycheck" }],
        },
      },
      // No shellAllowlist entry for "mycheck"
    });
    try {
      store.save(agent, makePatch({
        validation: { suggested: [{ kind: "shell_allowlisted", command_id: "mycheck" }] },
      }));
      const result = await q.applyAgentResults();
      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0]!.reason).toBe("validation_failed");
    } finally { cleanup(); }
  });

  // Line 147: shell_allowlisted with configured bin succeeds
  it("runs shell_allowlisted validation with configured bin and applies", async () => {
    const { store, q, agent, cleanup } = setup({
      agent: {
        authority: {
          mode: "propose_patch", write_scope: ["src"], require_base_hash: false, max_patch_bytes: 50_000,
          allowed_commands: [{ kind: "shell_allowlisted" as const, command_id: "lint" }],
        },
      },
      shellAllowlist: { lint: "/usr/bin/lint" },
    });
    try {
      store.save(agent, makePatch({
        validation: { suggested: [{ kind: "shell_allowlisted", command_id: "lint" }] },
      }));
      const result = await q.applyAgentResults();
      expect(result.applied).toHaveLength(1);
      expect(mockExecFileCb).toHaveBeenCalledWith(
        "/usr/bin/lint",
        [],
        expect.anything(),
        expect.any(Function),
      );
    } finally { cleanup(); }
  });

  // Line 148: validation command throws → catch in runValidation
  it("rejects when npm_script validation command throws", async () => {
    const { store, q, agent, cleanup } = setup({
      agent: {
        authority: {
          mode: "propose_patch", write_scope: ["src"], require_base_hash: false, max_patch_bytes: 50_000,
          allowed_commands: [{ kind: "npm_script" as const, script: "test" }],
        },
      },
    });
    try {
      mockExecFileCb.mockImplementation((cmd: string, _args: string[], _opts: unknown, cb: (err: Error | null, r?: { stdout: string; stderr: string }) => void) => {
        if (cmd === "npm") cb(new Error("script exited with code 1"));
        else cb(null, { stdout: "", stderr: "" });
      });
      store.save(agent, makePatch({
        validation: { suggested: [{ kind: "npm_script", script: "test" }] },
      }));
      const result = await q.applyAgentResults();
      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0]!.reason).toBe("validation_failed");
    } finally { cleanup(); }
  });

  // Line 167: surfaceKey called when public_surface_delta has matching entries
  it("calls surfaceKey when public_surface_delta has entries", async () => {
    const delta = { surface: "typescript_export" as const, name: "myFunc", change: "add" as const, compatibility: "compatible" as const };
    vi.mocked(detectPublicSurfaceFromPatch).mockReturnValue([delta]);
    // normalizePublicSurfaceDeltas as identity (already set in resetMocks)

    const { store, q, agent, cleanup } = setup();
    try {
      store.save(agent, makePatch({
        semantic: {
          reads: [], writes: [{ kind: "symbol", name: "X" }], assumptions: [], effects: [],
          public_surface_delta: [delta],
          risk: { level: "low" },
        },
      }));
      const result = await q.applyAgentResults();
      // Both declared and actual match → no undeclared → applies successfully
      expect(result.applied).toHaveLength(1);
    } finally { cleanup(); }
  });
});
