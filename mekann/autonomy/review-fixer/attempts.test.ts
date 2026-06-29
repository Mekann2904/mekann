import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { recordReviewFixerAttempt } from "./attempts.js";

const execFile = promisify(execFileCb);

async function gitRepo(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "review-fixer-attempts-"));
  await execFile("git", ["init"], { cwd: dir });
  await execFile("git", ["config", "user.email", "test@example.com"], { cwd: dir });
  await execFile("git", ["config", "user.name", "Test"], { cwd: dir });
  await writeFile(path.join(dir, "file.txt"), "a");
  await execFile("git", ["add", "file.txt"], { cwd: dir });
  await execFile("git", ["commit", "-m", "init"], { cwd: dir });
  return dir;
}

describe("recordReviewFixerAttempt", () => {
  it("blocks repeated launches against the same tree state and resets after edits", async () => {
    const repo = await gitRepo();
    try {
      expect((await recordReviewFixerAttempt(repo, 7, 2)).allowed).toBe(true);
      expect((await recordReviewFixerAttempt(repo, 7, 2)).allowed).toBe(true);
      expect((await recordReviewFixerAttempt(repo, 7, 2)).allowed).toBe(false);
      await writeFile(path.join(repo, "file.txt"), "changed");
      const afterEdit = await recordReviewFixerAttempt(repo, 7, 2);
      expect(afterEdit.allowed).toBe(true);
      expect(afterEdit.state.attempts).toBe(1);
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });
});
