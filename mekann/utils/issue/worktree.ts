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

export interface SafeRemoveWorktreeOptions {
	/** Branch name to require when the worktree is branch-backed. Omit for detached worktrees. */
	branch?: string;
	path: string;
	/** Refuse to remove unless the resolved path is inside this directory. */
	expectedRootPrefix?: string;
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
 * Git config key recording the branch an issue worktree was forked from, so
 * `create_pr` can target it instead of always defaulting to the repo's default
 * branch. Lives in the shared `.git/config` (read from any linked worktree),
 * never enters the working tree, and is cleared in `removeWorktree`.
 */
export function issueBaseConfigKey(branch: string): string {
	return `branch.${branch}.mekann-base`;
}

/**
 * Detect the current branch of a working tree. Returns "" for detached HEAD
 * or any error so callers can treat it as "no base available".
 */
export function detectCurrentBranch(cwd: string): string {
	try {
		const name = execFileSync("git", ["-C", cwd, "rev-parse", "--abbrev-ref", "HEAD"], {
			encoding: "utf-8",
			stdio: ["ignore", "pipe", "pipe"],
		}).trim();
		return name === "HEAD" || !name ? "" : name;
	} catch {
		return "";
	}
}

/** Read the recorded fork-point base branch for an issue branch, or "" if unset. */
export function readIssueBase(repoRoot: string, branch: string): string {
	try {
		const out = execFileSync("git", ["config", issueBaseConfigKey(branch)], {
			cwd: repoRoot,
			encoding: "utf-8",
			stdio: ["ignore", "pipe", "pipe"],
		}).trim();
		return out;
	} catch {
		return "";
	}
}

/** Record the fork-point base branch for an issue branch. Non-fatal on failure. */
function recordIssueBase(repoRoot: string, branch: string, base: string): void {
	try {
		execFileSync("git", ["config", issueBaseConfigKey(branch), base], {
			cwd: repoRoot,
			encoding: "utf-8",
			stdio: ["ignore", "pipe", "pipe"],
		});
	} catch {
		// Non-fatal: create_pr will fall back to gh's default base.
	}
}

/** Clear the recorded fork-point base branch for an issue branch. */
function unsetIssueBase(repoRoot: string, branch: string): void {
	try {
		execFileSync("git", ["config", "--unset", issueBaseConfigKey(branch)], {
			cwd: repoRoot,
			encoding: "utf-8",
			stdio: ["ignore", "pipe", "pipe"],
		});
	} catch {
		// Already unset or absent — nothing to do.
	}
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
	assertValidBranch(repoRoot, branch);
	assertValidWorktreePath(worktreePath, branch);

	// If worktree directory already exists, only accept it when it is the expected git worktree.
	if (fs.existsSync(worktreePath)) {
		if (isExpectedWorktree(worktreePath, branch)) return { branch, path: worktreePath };
		throw new Error(`Path already exists but is not a worktree for ${branch}: ${worktreePath}`);
	}

	// Ensure parent directory exists
	fs.mkdirSync(path.dirname(worktreePath), { recursive: true });

	// Capture the branch this worktree is forked from before we add the
	// worktree. `git worktree add` does not move repoRoot's HEAD, but reading it
	// here documents intent: this is the fork point `create_pr` will target
	// instead of always defaulting to the repo's main branch.
	const baseBranch = detectCurrentBranch(repoRoot);

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

	// Record the fork point so create_pr can default --base to the branch the
	// issue worktree was invoked from. Only set when absent so a resumed or
	// recreated worktree keeps its original base even if repoRoot moved on.
	if (baseBranch && baseBranch !== branch && !readIssueBase(repoRoot, branch)) {
		recordIssueBase(repoRoot, branch, baseBranch);
	}

	return { branch, path: worktreePath };
}

/**
 * Remove a worktree and its local branch.
 */
export function removeWorktree(repoRoot: string, wt: WorktreeInfo): void {
	safeRemoveWorktree(repoRoot, wt);

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

	// Drop the recorded PR base so a future issue-<n> branch starts clean.
	unsetIssueBase(repoRoot, wt.branch);

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

export function safeRemoveWorktree(repoRoot: string, wt: SafeRemoveWorktreeOptions): void {
	assertPathInsidePrefix(wt.path, wt.expectedRootPrefix);
	if (!isRegisteredWorktree(repoRoot, wt)) {
		throw new Error(`Refusing to remove unregistered worktree path: ${wt.path}`);
	}

	try {
		execFileSync("git", ["worktree", "remove", "--force", wt.path], {
			cwd: repoRoot,
			encoding: "utf-8",
			stdio: ["ignore", "pipe", "pipe"],
		});
	} catch {
		// Fallback only after verifying the path is still registered/expected and inside prefix.
		assertPathInsidePrefix(wt.path, wt.expectedRootPrefix);
		if (fs.existsSync(wt.path) && isRegisteredWorktree(repoRoot, wt) && (!wt.branch || isExpectedWorktree(wt.path, wt.branch))) {
			fs.rmSync(wt.path, { recursive: true, force: true });
		}
	}
}

function assertValidBranch(repoRoot: string, branch: string): void {
	if (path.isAbsolute(branch) || branch.includes("..")) throw new Error(`Invalid branch name: ${branch}`);
	try {
		execFileSync("git", ["check-ref-format", "--branch", branch], { cwd: repoRoot, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
	} catch {
		throw new Error(`Invalid branch name: ${branch}`);
	}
}

function assertValidWorktreePath(worktreePath: string, branch: string): void {
	if (!path.isAbsolute(worktreePath)) throw new Error(`Worktree path must be absolute: ${worktreePath}`);
	if (path.resolve(worktreePath) !== worktreePath) throw new Error(`Worktree path must be normalized: ${worktreePath}`);
	if (path.basename(worktreePath) !== branch) throw new Error(`Worktree path must end with branch name ${branch}: ${worktreePath}`);
}

function assertPathInsidePrefix(target: string, prefix?: string): void {
	if (!prefix) return;
	const resolvedTarget = path.resolve(target);
	const resolvedPrefix = path.resolve(prefix);
	const rel = path.relative(resolvedPrefix, resolvedTarget);
	if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
		throw new Error(`Refusing to remove worktree outside expected prefix: ${target}`);
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

function isRegisteredWorktree(repoRoot: string, wt: SafeRemoveWorktreeOptions): boolean {
	return listAllWorktrees(repoRoot).some((existing) => (!wt.branch || existing.branch === wt.branch) && path.resolve(existing.path) === path.resolve(wt.path));
}

/**
 * List existing issue worktrees for a repo.
 * Returns worktrees whose branch name matches `issue-<number>`.
 */
export function listExistingWorktrees(repoRoot: string): WorktreeInfo[] {
	return listAllWorktrees(repoRoot).filter((wt) => /^issue-\d+$/.test(wt.branch) && path.resolve(wt.path) !== path.resolve(repoRoot));
}

function listAllWorktrees(repoRoot: string): WorktreeInfo[] {
	try {
		const output = execFileSync("git", ["worktree", "list", "--porcelain"], {
			cwd: repoRoot,
			encoding: "utf-8",
		});

		const worktrees: WorktreeInfo[] = [];
		let currentPath = "";
		let currentBranch = "";
		const flush = () => {
			if (currentPath) worktrees.push({ branch: currentBranch, path: currentPath });
			currentPath = "";
			currentBranch = "";
		};

		for (const line of output.split("\n")) {
			if (line.startsWith("worktree ")) {
				if (currentPath) flush();
				currentPath = line.slice("worktree ".length);
			} else if (line.startsWith("branch ")) {
				currentBranch = line.slice("branch ".length).replace("refs/heads/", "");
			} else if (line === "" && currentPath) {
				flush();
			}
		}
		if (currentPath) flush();
		return worktrees;
	} catch {
		return [];
	}
}
