import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { acquireReviewFixerLock } from "./runLock.js";

const execFile = promisify(execFileCb);

async function gitRepo(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "review-fixer-lock-"));
  await execFile("git", ["init"], { cwd: dir });
  return dir;
}

describe("acquireReviewFixerLock", () => {
  it("serializes review_fixer for the SAME issue across callers in the same repo", async () => {
    const repo = await gitRepo();
    try {
      const first = await acquireReviewFixerLock(repo, 1);
      expect(first.acquired).toBe(true);
      const second = await acquireReviewFixerLock(repo, 1);
      expect(second.acquired).toBe(false);
      expect(second.info?.issueNumber).toBe(1);
      if (first.acquired) await first.release();
      const third = await acquireReviewFixerLock(repo, 1);
      expect(third.acquired).toBe(true);
      if (third.acquired) await third.release();
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  it("does NOT block DIFFERENT issues (autopilot parallelism is preserved)", async () => {
    const repo = await gitRepo();
    try {
      const first = await acquireReviewFixerLock(repo, 154);
      expect(first.acquired).toBe(true);
      // A different issue must still be able to start its own review_fixer while
      // #154 runs — this is the regression for the repo-wide lock that blocked
      // #154 behind #155.
      const second = await acquireReviewFixerLock(repo, 155);
      expect(second.acquired).toBe(true);
      if (first.acquired) await first.release();
      if (second.acquired) await second.release();
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  it("recovers stale locks", async () => {
    const repo = await gitRepo();
    try {
      const first = await acquireReviewFixerLock(repo, 1, 1);
      expect(first.acquired).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 5));
      const second = await acquireReviewFixerLock(repo, 1, 1);
      expect(second.acquired).toBe(true);
      if (second.acquired) await second.release();
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });
});
