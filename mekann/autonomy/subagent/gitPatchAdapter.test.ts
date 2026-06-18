import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockExecFileCb } = vi.hoisted(() => ({ mockExecFileCb: vi.fn() }));
vi.mock("node:child_process", () => ({ execFile: mockExecFileCb }));

import { ExecFileGitPatchAdapter } from "./gitPatchAdapter.js";

function ok(stdout = ""): void {
  return (mockExecFileCb as any).mockImplementation((_c: string, _a: string[], _o: unknown, cb: (e: null, r: { stdout: string; stderr: string }) => void) => cb(null, { stdout, stderr: "" }));
}

describe("ExecFileGitPatchAdapter.rollback (issue #152 / IC-092)", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("reports a clean reverse-apply when -R --check succeeds and the tree is clean", async () => {
    const adapter = new ExecFileGitPatchAdapter("/repo");
    ok(""); // every git call succeeds, status returns empty
    const result = await adapter.rollback("/repo/r.patch", ["src/a.ts"]);
    expect(result.fullyReverted).toBe(true);
    expect(result.residual).toEqual([]);
    expect(result.method).toBe("reverse");
  });

  it("detects partial-apply residue, restores via checkout, and reports it", async () => {
    const adapter = new ExecFileGitPatchAdapter("/repo");
    const calls: string[] = [];
    mockExecFileCb.mockImplementation((_cmd: string, args: string[], _opts: unknown, cb: (e: Error | null, r?: { stdout: string; stderr: string }) => void) => {
      const sub = args.join(" ");
      calls.push(sub);
      if (sub.startsWith("apply -R --check")) return cb(new Error("does not apply")); // partial state
      if (sub.startsWith("status --porcelain")) {
        // First status (after failed reverse) shows residue; after checkout, clean.
        const sawCheckout = calls.filter((c) => c.startsWith("checkout")).length;
        return cb(null, { stdout: sawCheckout > 0 ? "" : " M src/a.ts\n", stderr: "" });
      }
      return cb(null, { stdout: "", stderr: "" });
    });

    const result = await adapter.rollback("/repo/r.patch", ["src/a.ts"]);
    expect(result.method).toBe("restore");
    expect(result.fullyReverted).toBe(true);
    expect(result.residual).toEqual([]);
    // checkout fallback was attempted
    expect(calls.some((c) => c.startsWith("checkout"))).toBe(true);
  });

  it("reports residual paths that remain dirty after restore fallback", async () => {
    const adapter = new ExecFileGitPatchAdapter("/repo");
    mockExecFileCb.mockImplementation((_cmd: string, args: string[], _opts: unknown, cb: (e: Error | null, r?: { stdout: string; stderr: string }) => void) => {
      const sub = args.join(" ");
      if (sub.startsWith("apply -R --check")) return cb(new Error("does not apply"));
      if (sub.startsWith("status --porcelain")) return cb(null, { stdout: " M src/a.ts\n?? src/new.ts\n", stderr: "" });
      return cb(null, { stdout: "", stderr: "" });
    });

    const result = await adapter.rollback("/repo/r.patch", ["src/a.ts", "src/new.ts"]);
    expect(result.fullyReverted).toBe(false);
    expect(result.residual).toContain("src/a.ts");
  });

  it("without touched paths, only reports the reverse outcome", async () => {
    const adapter = new ExecFileGitPatchAdapter("/repo");
    mockExecFileCb.mockImplementation((_cmd: string, args: string[], _opts: unknown, cb: (e: Error | null, r?: { stdout: string; stderr: string }) => void) => {
      if (args.join(" ").startsWith("apply -R --check")) return cb(new Error("does not apply"));
      return cb(null, { stdout: "", stderr: "" });
    });
    const result = await adapter.rollback("/repo/r.patch");
    expect(result.fullyReverted).toBe(false);
    expect(result.method).toBe("none");
  });
});
