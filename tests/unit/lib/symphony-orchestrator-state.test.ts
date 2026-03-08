/**
 * path: tests/unit/lib/symphony-orchestrator-state.test.ts
 * role: Symphony durable orchestration state の読み書きと遷移を検証する
 * why: claim/running/retrying/released の記録が壊れないようにするため
 * related: .pi/lib/symphony-orchestrator-state.ts, tests/unit/extensions/task-auto-executor-workpad.test.ts, tests/unit/extensions/long-running-supervisor.test.ts
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  claimSymphonyIssue,
  getSymphonyIssueState,
  listSymphonyIssueStates,
  queueSymphonyIssueRetry,
  releaseSymphonyIssue,
  startSymphonyIssueRun,
} from "../../../.pi/lib/symphony-orchestrator-state.js";

const tempDirs: string[] = [];

function createTempRepo(): string {
  const cwd = mkdtempSync(join(tmpdir(), "mekann-symphony-"));
  tempDirs.push(cwd);
  return cwd;
}

afterEach(() => {
  for (const cwd of tempDirs.splice(0, tempDirs.length)) {
    rmSync(cwd, { recursive: true, force: true });
  }
});

describe("symphony-orchestrator-state", () => {
  it("claim -> running -> retrying -> released を durable に保存する", () => {
    const cwd = createTempRepo();

    claimSymphonyIssue({
      cwd,
      issueId: "task-1",
      title: "Implement runner",
      source: "task-auto-executor",
      workpadId: "wp-1",
    });
    startSymphonyIssueRun({
      cwd,
      issueId: "task-1",
      sessionId: "session-1",
      source: "long-running-supervisor",
    });
    queueSymphonyIssueRetry({
      cwd,
      issueId: "task-1",
      retryAttempt: 2,
      reason: "workspace_verify failed",
    });
    releaseSymphonyIssue({
      cwd,
      issueId: "task-1",
      reason: "workspace_verify passed",
    });

    const state = getSymphonyIssueState(cwd, "task-1");
    expect(state?.runState).toBe("released");
    expect(state?.retryAttempt).toBe(2);
    expect(state?.workpadId).toBe("wp-1");
    expect(listSymphonyIssueStates(cwd)).toHaveLength(1);
  });
});
