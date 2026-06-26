import { execFile as execFileCb } from "node:child_process";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

export interface ReviewFixerLockInfo {
  issueNumber: number;
  cwd: string;
  pid: number;
  startedAt: string;
  staleAfterMs: number;
}

export type ReviewFixerLockAcquireResult =
  | { acquired: true; lockDir: string; info: ReviewFixerLockInfo; release(): Promise<void> }
  | { acquired: false; lockDir: string; info: ReviewFixerLockInfo | null; reason: "busy" | "unknown" };

const DEFAULT_STALE_AFTER_MS = 2 * 60 * 60 * 1000;

async function gitCommonDir(cwd: string): Promise<string> {
  const { stdout } = await execFile("git", ["rev-parse", "--git-common-dir"], { cwd, timeout: 10_000 });
  const raw = String(stdout).trim();
  return path.isAbsolute(raw) ? raw : path.resolve(cwd, raw);
}

async function readLockInfo(lockDir: string): Promise<ReviewFixerLockInfo | null> {
  try {
    return JSON.parse(await readFile(path.join(lockDir, "info.json"), "utf8")) as ReviewFixerLockInfo;
  } catch {
    return null;
  }
}

async function isStale(lockDir: string, staleAfterMs: number): Promise<boolean> {
  try {
    const info = await readLockInfo(lockDir);
    const started = info?.startedAt ? Date.parse(info.startedAt) : NaN;
    if (Number.isFinite(started) && Date.now() - started > (info?.staleAfterMs ?? staleAfterMs)) return true;
    const s = await stat(lockDir);
    return Date.now() - s.mtimeMs > staleAfterMs;
  } catch {
    return false;
  }
}

/**
 * Acquire a repo-wide review_fixer lock. The lock is a directory created with
 * exclusive mkdir in the git common dir, so all issue worktrees for the same
 * repo share one mutex across Issue Pi processes.
 */
export async function acquireReviewFixerLock(cwd: string, issueNumber: number, staleAfterMs = DEFAULT_STALE_AFTER_MS): Promise<ReviewFixerLockAcquireResult> {
  const commonDir = await gitCommonDir(cwd);
  const lockParent = path.join(commonDir, "mekann");
  const lockDir = path.join(lockParent, "review-fixer.lock");
  const info: ReviewFixerLockInfo = { issueNumber, cwd, pid: process.pid, startedAt: new Date().toISOString(), staleAfterMs };

  await mkdir(lockParent, { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await mkdir(lockDir);
      await writeFile(path.join(lockDir, "info.json"), JSON.stringify(info, null, 2));
      let released = false;
      return {
        acquired: true,
        lockDir,
        info,
        async release() {
          if (released) return;
          released = true;
          await rm(lockDir, { recursive: true, force: true });
        },
      };
    } catch (error: any) {
      if (error?.code !== "EEXIST") throw error;
      if (await isStale(lockDir, staleAfterMs)) {
        await rm(lockDir, { recursive: true, force: true });
        continue;
      }
      return { acquired: false, lockDir, info: await readLockInfo(lockDir), reason: "busy" };
    }
  }
  return { acquired: false, lockDir, info: await readLockInfo(lockDir), reason: "unknown" };
}
