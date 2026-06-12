/**
 * Issue context resolution for Review fixer.
 *
 * Derives the GitHub issue number from the current branch name
 * and fetches issue metadata + dependency status.
 */

import { execFileSync } from "node:child_process";
import { parseIssueNumberFromBranch, getRepoInfo } from "../../utils/issue/worktree.js";
import { getIssueDependencyStatus, type IssueDependencyStatus } from "../../utils/issue/github.js";

export interface ResolvedIssueContext {
  number: number;
  title: string;
  url: string;
  body: string;
  labels: string[];
  remote: string;
  dependencyStatus: IssueDependencyStatus;
}

/**
 * Derive the issue number from the current git branch.
 * Returns null if not on an issue worktree branch.
 */
export function deriveIssueNumber(cwd?: string): number | null {
  try {
    const branch = execFileSync("git", ["branch", "--show-current"], {
      cwd: cwd ?? process.cwd(),
      encoding: "utf-8",
    }).trim();
    return parseIssueNumberFromBranch(branch);
  } catch {
    return null;
  }
}

/**
 * Fetch full issue context from GitHub.
 * Returns null if the issue cannot be fetched.
 */
export async function resolveIssueContext(cwd?: string): Promise<ResolvedIssueContext | null> {
  const issueNumber = deriveIssueNumber(cwd);
  if (issueNumber === null) return null;

  const repoInfo = getRepoInfo(cwd);
  if (!repoInfo) return null;

  const { promisify } = await import("node:util");
  const { execFile } = await import("node:child_process");
  const execFileAsync = promisify(execFile);

  let issueJson: any;
  try {
    const { stdout } = await execFileAsync("gh", [
      "issue", "view", String(issueNumber),
      "--repo", repoInfo.remote,
      "--json", "number,title,url,body,labels,state",
    ], { timeout: 15000 });
    issueJson = JSON.parse(stdout);
  } catch {
    return null;
  }

  if (!issueJson || issueJson.state !== "OPEN") return null;

  const dependencyStatus = await getIssueDependencyStatus(repoInfo.remote, issueNumber);

  return {
    number: issueJson.number,
    title: issueJson.title ?? "",
    url: issueJson.url ?? "",
    body: issueJson.body ?? "",
    labels: (issueJson.labels ?? []).map((l: any) => typeof l === "string" ? l : l.name),
    remote: repoInfo.remote,
    dependencyStatus,
  };
}

/**
 * Check if the issue is ready for review fixer.
 * Returns an error message if not ready, or null if ready.
 */
export function checkIssueReadiness(ctx: ResolvedIssueContext): string | null {
  if (ctx.dependencyStatus.openBlockers.length > 0) {
    const blockers = ctx.dependencyStatus.openBlockers.map((b) => `#${b.number} ${b.title}`).join(", ");
    return `Issue #${ctx.number} is blocked by open issues: ${blockers}`;
  }
  return null;
}
