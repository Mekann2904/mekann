/**
 * path: tests/unit/lib/symphony-workspace-manager.test.ts
 * role: Symphony workspace manager の root 解決、workspace 作成、hook 実行を検証する
 * why: per-issue workspace と WORKFLOW.md hook contract が壊れないようにするため
 * related: .pi/lib/symphony-workspace-manager.ts, .pi/lib/workflow-workpad.ts, WORKFLOW.md
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import {
  ensureSymphonyWorkspace,
  getSymphonyWorkspaceInfo,
  removeSymphonyWorkspace,
  runSymphonyWorkspaceHook,
} from "../../../.pi/lib/symphony-workspace-manager.js";

function createTempRepo(): string {
  const dir = join(tmpdir(), `mekann-symphony-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeWorkflow(cwd: string, body: string): void {
  writeFileSync(join(cwd, "WORKFLOW.md"), body);
}

describe("symphony-workspace-manager", () => {
  const cleanupDirs: string[] = [];

  afterEach(() => {
    for (const dir of cleanupDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("workspace root を frontmatter から解決して after_create / before_run / after_run / before_remove を実行する", async () => {
    const cwd = createTempRepo();
    cleanupDirs.push(cwd);
    writeWorkflow(cwd, `---
workspace:
  root: .pi/test-workspaces
hooks:
  after_create: |
    echo created > created.txt
  before_run: |
    echo before-run > before-run.txt
  after_run: |
    echo after-run > after-run.txt
  before_remove: |
    echo before-remove > before-remove.txt
---
run task
`);

    const info = await ensureSymphonyWorkspace({
      cwd,
      issueId: "task:1/demo",
    });

    expect(info.workspaceKey).toBe("task_1_demo");
    expect(info.path).toContain(".pi/test-workspaces/task_1_demo");
    expect(existsSync(join(info.path, "created.txt"))).toBe(true);

    await runSymphonyWorkspaceHook({
      cwd,
      issueId: "task:1/demo",
      hook: "before_run",
    });
    await runSymphonyWorkspaceHook({
      cwd,
      issueId: "task:1/demo",
      hook: "after_run",
    });

    expect(readFileSync(join(info.path, "before-run.txt"), "utf-8").trim()).toBe("before-run");
    expect(readFileSync(join(info.path, "after-run.txt"), "utf-8").trim()).toBe("after-run");

    await removeSymphonyWorkspace({
      cwd,
      issueId: "task:1/demo",
    });

    expect(existsSync(info.path)).toBe(false);
  });

  it("workflow 未設定時は default root を返す", () => {
    const cwd = createTempRepo();
    cleanupDirs.push(cwd);
    const info = getSymphonyWorkspaceInfo({
      cwd,
      issueId: "task-2",
    });

    expect(info.rootPath).toContain("symphony_workspaces");
    expect(info.workspaceKey).toBe("task-2");
  });
});
