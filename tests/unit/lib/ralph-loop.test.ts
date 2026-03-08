/**
 * path: tests/unit/lib/ralph-loop.test.ts
 * role: Ralph loop の file-based orchestration を検証する
 * why: branch archive と fresh-process loop が参照元の責務に沿って壊れないようにするため
 * related: .pi/lib/ralph-loop.ts, .pi/extensions/ralph-loop.ts, tests/unit/extensions/ralph-loop.test.ts, WORKFLOW.md
 */

import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { inspectRalphLoop, runRalphLoop } from "../../../.pi/lib/ralph-loop.js";

function createRepo(): string {
  return mkdtempSync(join(tmpdir(), "mekann-ralph-"));
}

describe("ralph-loop lib", () => {
  it("branch が変わると state snapshot を archive して progress を初期化する", () => {
    const cwd = createRepo();
    const stateDir = join(cwd, ".pi", "ralph");
    mkdirSync(stateDir, { recursive: true });

    writeFileSync(join(stateDir, "prd.json"), JSON.stringify({ branchName: "feature-two" }, null, 2));
    writeFileSync(join(stateDir, "progress.txt"), "old progress");
    writeFileSync(join(stateDir, ".last-branch"), "feature-one\n");

    const status = inspectRalphLoop({
      cwd,
      getDateStamp: () => "2026-03-09",
    });

    expect(status.archivedTo).toContain("2026-03-09-feature-one");
    expect(readFileSync(join(stateDir, "progress.txt"), "utf-8")).toBe("");
    expect(readFileSync(join(stateDir, ".last-branch"), "utf-8").trim()).toBe("feature-two");
    expect(readFileSync(join(status.archivedTo!, "progress.txt"), "utf-8")).toBe("old progress");
  });

  it("COMPLETE を受け取った反復で loop を停止する", async () => {
    const cwd = createRepo();
    const stateDir = join(cwd, ".pi", "ralph");
    mkdirSync(stateDir, { recursive: true });

    writeFileSync(join(stateDir, "prd.json"), JSON.stringify({ branchName: "feature-one" }, null, 2));
    writeFileSync(join(stateDir, "progress.txt"), "");
    writeFileSync(join(stateDir, "PI.md"), "run the task");

    const spawnCommand = vi
      .fn()
      .mockResolvedValueOnce({ stdout: "still working", stderr: "", exitCode: 0 })
      .mockResolvedValueOnce({ stdout: "COMPLETE", stderr: "", exitCode: 0 });

    const result = await runRalphLoop({
      cwd,
      runtime: "pi",
      maxIterations: 5,
      sleepMs: 0,
      spawnCommand,
      resolveCurrentBranch: () => "feature-one",
    });

    expect(result.completed).toBe(true);
    expect(result.stopReason).toBe("complete");
    expect(result.iterations).toHaveLength(2);
    expect(spawnCommand).toHaveBeenCalledTimes(2);
  });
});
