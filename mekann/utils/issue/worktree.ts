import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

export interface RepoInfo {
	root: string;
	/** GitHub remote in owner/repo format */
	remote: string;
}

export interface WorktreeInfo {
	branch: string;
	path: string;
}

export function issueBranch(issueNumber: number): string {
	return `issue-${issueNumber}`;
}

/**
 * Resolve an issue worktree's path, reusing an existing worktree for the issue
 * branch when present and otherwise creating one. Shared by direct `/issue`,
 * parent/child orchestration, and the autopilot supervisor so they never drift
 * on path resolution.
 */
export function resolveIssueWorktreePath(repoRoot: string, issueNumber: number): string {
	const branch = issueBranch(issueNumber);
	const dir = worktreeDir(repoRoot, branch);
	const existing = listExistingWorktrees(repoRoot).find((worktree) => worktree.branch === branch);
	return existing ? existing.path : createWorktree(repoRoot, branch, dir).path;
}

export function parseIssueNumberFromBranch(branch: string): number | null {
	const match = branch.match(/^issue-(\d+)$/);
	return match ? parseInt(match[1], 10) : null;
}

/**
 * Detect git repository info from the current working directory.
 */
export function getRepoInfo(cwd?: string): RepoInfo | null {
	try {
		const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
			cwd: cwd ?? process.cwd(),
			encoding: "utf-8",
		}).trim();

		const remoteUrl = execFileSync("git", ["remote", "get-url", "origin"], {
			cwd: root,
			encoding: "utf-8",
		}).trim();

		const match = remoteUrl.match(/(?:github\.com[:/])([^/]+\/[^/.]+)/);
		if (!match) return null;

		return { root, remote: match[1] };
	} catch {
		return null;
	}
}

/**
 * Get the path to the issue worktrees directory for a repo.
 * Sibling of the repo root: ../<basename>-worktrees/
 */
export function worktreesRoot(repoRoot: string): string {
	const basename = path.basename(repoRoot);
	return path.join(path.dirname(repoRoot), `${basename}-worktrees`);
}

/**
 * Get the full path for a specific issue worktree.
 */
export function worktreeDir(repoRoot: string, branch: string): string {
	return path.join(worktreesRoot(repoRoot), branch);
}

/**
 * Create a git worktree for the given branch.
 * If the worktree already exists, return its info.
 * If the branch exists but no worktree, create a worktree checking out the existing branch.
 * Otherwise, create a new branch from HEAD and add a worktree.
 */
export function createWorktree(repoRoot: string, branch: string, worktreePath: string): WorktreeInfo {
	// If worktree directory already exists, only accept it when it is the expected git worktree.
	if (fs.existsSync(worktreePath)) {
		if (isExpectedWorktree(worktreePath, branch)) return { branch, path: worktreePath };
		throw new Error(`Path already exists but is not a worktree for ${branch}: ${worktreePath}`);
	}

	// Ensure parent directory exists
	fs.mkdirSync(path.dirname(worktreePath), { recursive: true });

	// Check if branch already exists
	let branchExists = false;
	try {
		execFileSync("git", ["rev-parse", "--verify", branch], { cwd: repoRoot, encoding: "utf-8" });
		branchExists = true;
	} catch {
		branchExists = false;
	}

	if (branchExists) {
		// Branch exists — check if it's already checked out in another worktree
		try {
			execFileSync("git", ["worktree", "add", worktreePath, branch], {
				cwd: repoRoot,
				encoding: "utf-8",
				stdio: ["ignore", "pipe", "pipe"],
			});
		} catch (err) {
			// Branch might be checked out in another worktree
			// Try with --force as fallback
			throw new Error(`Failed to create worktree for existing branch ${branch}: ${(err as Error).message}`);
		}
	} else {
		// Create new branch from HEAD and add worktree
		execFileSync("git", ["worktree", "add", "-b", branch, worktreePath, "HEAD"], {
			cwd: repoRoot,
			encoding: "utf-8",
			stdio: ["ignore", "pipe", "pipe"],
		});
	}

	return { branch, path: worktreePath };
}

/**
 * Remove a worktree and its local branch.
 */
export function removeWorktree(repoRoot: string, wt: WorktreeInfo): void {
	if (!isRegisteredWorktree(repoRoot, wt)) {
		throw new Error(`Refusing to remove unregistered worktree path: ${wt.path}`);
	}

	// Remove worktree
	try {
		execFileSync("git", ["worktree", "remove", "--force", wt.path], {
			cwd: repoRoot,
			encoding: "utf-8",
			stdio: ["ignore", "pipe", "pipe"],
		});
	} catch {
		// Fallback only after verifying the path is still the expected worktree.
		if (fs.existsSync(wt.path) && isExpectedWorktree(wt.path, wt.branch)) {
			fs.rmSync(wt.path, { recursive: true, force: true });
		}
	}

	// Remove local branch (safe delete — only if merged)
	try {
		execFileSync("git", ["branch", "-d", wt.branch], {
			cwd: repoRoot,
			encoding: "utf-8",
			stdio: ["ignore", "pipe", "pipe"],
		});
	} catch {
		// Branch not merged or already removed — skip silently
	}

	// Clean up empty worktrees directory
	const wtRoot = worktreesRoot(repoRoot);
	try {
		const remaining = fs.readdirSync(wtRoot);
		if (remaining.length === 0) {
			fs.rmdirSync(wtRoot);
		}
	} catch {
		// Directory doesn't exist or not empty — skip
	}
}

function isExpectedWorktree(worktreePath: string, branch: string): boolean {
	try {
		const topLevel = execFileSync("git", ["-C", worktreePath, "rev-parse", "--show-toplevel"], { encoding: "utf-8" }).trim();
		const currentBranch = execFileSync("git", ["-C", worktreePath, "branch", "--show-current"], { encoding: "utf-8" }).trim();
		return path.resolve(topLevel) === path.resolve(worktreePath) && currentBranch === branch;
	} catch {
		return false;
	}
}

function isRegisteredWorktree(repoRoot: string, wt: WorktreeInfo): boolean {
	return listExistingWorktrees(repoRoot).some((existing) => existing.branch === wt.branch && path.resolve(existing.path) === path.resolve(wt.path));
}

/**
 * List existing issue worktrees for a repo.
 * Returns worktrees whose branch name matches `issue-<number>`.
 */
export function listExistingWorktrees(repoRoot: string): WorktreeInfo[] {
	try {
		const output = execFileSync("git", ["worktree", "list", "--porcelain"], {
			cwd: repoRoot,
			encoding: "utf-8",
		});

		const worktrees: WorktreeInfo[] = [];
		let currentPath = "";
		let currentBranch = "";

		for (const line of output.split("\n")) {
			if (line.startsWith("worktree ")) {
				currentPath = line.slice("worktree ".length);
			} else if (line.startsWith("branch ")) {
				currentBranch = line.slice("branch ".length).replace("refs/heads/", "");
			} else if (line === "" && currentPath && currentBranch) {
				// Only include issue-* branches, skip the main worktree
				if (/^issue-\d+$/.test(currentBranch) && currentPath !== repoRoot) {
					worktrees.push({ branch: currentBranch, path: currentPath });
				}
				currentPath = "";
				currentBranch = "";
			}
		}
		// Handle last entry
		if (currentPath && currentBranch && /^issue-\d+$/.test(currentBranch) && currentPath !== repoRoot) {
			worktrees.push({ branch: currentBranch, path: currentPath });
		}

		return worktrees;
	} catch {
		return [];
	}
}
