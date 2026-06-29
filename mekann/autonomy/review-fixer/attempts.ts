import { execFile as execFileCb } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

export interface ReviewFixerAttemptState {
  issueNumber: number;
  branch: string;
  head: string;
  contentFingerprint: string;
  attempts: number;
  updatedAt: string;
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFile("git", args, { cwd, timeout: 10_000 });
  return String(stdout).trim();
}

async function statePath(cwd: string, issueNumber: number): Promise<string> {
  const commonRaw = await git(cwd, ["rev-parse", "--git-common-dir"]);
  const commonDir = path.isAbsolute(commonRaw) ? commonRaw : path.resolve(cwd, commonRaw);
  const dir = path.join(commonDir, "mekann", "review-fixer-attempts");
  await mkdir(dir, { recursive: true });
  return path.join(dir, `issue-${issueNumber}.json`);
}

export async function currentReviewFixerFingerprint(cwd: string): Promise<{ branch: string; head: string; contentFingerprint: string }> {
  const [branch, head, status] = await Promise.all([
    git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]),
    git(cwd, ["rev-parse", "HEAD"]),
    git(cwd, ["status", "--porcelain=v1", "-z"]),
  ]);
  // A cheap, stable-enough fingerprint for the parent-side launch budget. It
  // changes when HEAD or porcelain changes, allowing a new pass after follow-up
  // edits while stopping blind repeated launches against the same tree state.
  return { branch, head, contentFingerprint: `${head}\0${status}` };
}

export async function recordReviewFixerAttempt(cwd: string, issueNumber: number, maxAttempts: number): Promise<{ allowed: true; state: ReviewFixerAttemptState } | { allowed: false; state: ReviewFixerAttemptState; maxAttempts: number }> {
  const file = await statePath(cwd, issueNumber);
  const fingerprint = await currentReviewFixerFingerprint(cwd);
  let previous: ReviewFixerAttemptState | null = null;
  try { previous = JSON.parse(await readFile(file, "utf8")) as ReviewFixerAttemptState; } catch {}
  const attempts = previous?.contentFingerprint === fingerprint.contentFingerprint ? previous.attempts + 1 : 1;
  const state: ReviewFixerAttemptState = { issueNumber, ...fingerprint, attempts, updatedAt: new Date().toISOString() };
  await writeFile(file, JSON.stringify(state, null, 2));
  return attempts <= maxAttempts ? { allowed: true, state } : { allowed: false, state, maxAttempts };
}
