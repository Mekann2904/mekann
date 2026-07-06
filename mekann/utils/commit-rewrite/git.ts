import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface CommitInfo {
	sha: string;
	subject: string;
	author: string;
}

/** Environment overrides applied to git invocations (used to inject the non-interactive editors). */
type GitEnv = Record<string, string>;

/**
 * Parse `git log --format="%H%x09%an%x09%s"` output into commit records.
 * Pure — extracted for unit testing. Records are returned in the order given
 * (git log emits newest-first; callers pass oldest-first via --reverse).
 */
export function parseCommitList(output: string): CommitInfo[] {
	const commits: CommitInfo[] = [];
	for (const line of output.split(/\r?\n/)) {
		if (!line.trim()) continue;
		const [sha, author, ...rest] = line.split("\t");
		if (!sha || author === undefined) continue;
		const subject = rest.join("\t");
		commits.push({ sha, author, subject });
	}
	return commits;
}

function execGit(args: string[], cwd: string, signal?: AbortSignal, env?: GitEnv): Promise<string> {
	return new Promise((resolve, reject) => {
		execFile("git", args, { cwd, timeout: 60_000, signal, env: env ? { ...process.env, ...env } : undefined }, (error, stdout, stderr) => {
			if (error) reject(new Error(String(stderr || error.message).trim() || error.message));
			else resolve(String(stdout));
		});
	});
}

/** Resolve the upstream ref of HEAD (e.g. "origin/main"). Throws when no upstream is set. */
export async function getUpstream(cwd: string, signal?: AbortSignal): Promise<string> {
	return (await execGit(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], cwd, signal)).trim();
}

/** Absolute path of the .git directory (handles worktrees / bare quirks). */
export async function getGitDir(cwd: string, signal?: AbortSignal): Promise<string> {
	return (await execGit(["rev-parse", "--absolute-git-dir"], cwd, signal)).trim();
}

/** True when HEAD has no commits ahead of its upstream (nothing to rewrite). */
export async function getUnpushedCommits(cwd: string, upstream: string, signal?: AbortSignal): Promise<CommitInfo[]> {
	// oldest-first so rebase walks them in natural order
	const raw = await execGit(["log", "--reverse", "--format=%H%x09%an%x09%s", `${upstream}..HEAD`], cwd, signal);
	return parseCommitList(raw);
}

/** Full textual diff of a single commit (stat + patch), capped for prompt size. */
export async function getCommitDiff(sha: string, cwd: string, signal?: AbortSignal): Promise<string> {
	const stat = await execGit(["show", "--stat", "--format=", sha], cwd, signal);
	const patch = await execGit(["show", "--format=", "--", sha], cwd, signal);
	const combined = `${stat}\n${patch}`.trim();
	// Cap to keep prompts manageable; very large diffs are truncated with a marker.
	const MAX = 12_000;
	if (combined.length <= MAX) return combined;
	return `${combined.slice(0, MAX)}\n\n…(diff truncated: ${combined.length - MAX} chars omitted)`;
}

/** Working tree must be clean before a non-interactive rebase can run safely. */
export async function isClean(cwd: string, signal?: AbortSignal): Promise<boolean> {
	const status = (await execGit(["status", "--porcelain"], cwd, signal)).trim();
	return status.length === 0;
}

/** Detect an in-progress rebase/apply so we refuse to start another. */
export async function isRebaseInProgress(cwd: string, signal?: AbortSignal): Promise<boolean> {
	const gitDir = await getGitDir(cwd, signal);
	for (const marker of ["rebase-merge", "rebase-apply"]) {
		try {
			const st = await fs.stat(path.join(gitDir, marker));
			if (st.isDirectory()) return true;
		} catch {
			// marker absent — fine
		}
	}
	return false;
}

/** Create a branch at current HEAD as a restore point. Returns the branch name. */
export async function createBackupBranch(cwd: string, signal?: AbortSignal): Promise<string> {
	const name = `backup/commit-rewrite/${new Date().toISOString().replace(/[:.]/g, "-")}`;
	await execGit(["branch", name], cwd, signal);
	return name;
}

const EDITOR_DIR = path.dirname(fileURLToPath(import.meta.url));
// Invoke the editors via the running node binary so we never depend on the
// filesystem executable bit (fragile on Windows and inside packaged installs).
const SEQUENCE_EDITOR = `${process.execPath} ${path.join(EDITOR_DIR, "sequence-editor.cjs")}`;
const MESSAGE_EDITOR = `${process.execPath} ${path.join(EDITOR_DIR, "message-editor.cjs")}`;

/**
 * Apply rewritten messages to specific commits via a single non-interactive
 * `git rebase -i`. Editors are injected through env so the rebase runs to
 * completion without a terminal. Only commits present in `shaToMessage` are
 * reworded; all other commits keep their original message.
 *
 * On failure the caller should surface the backup branch and instruct the user
 * to run `git rebase --abort`; this function does not swallow rebase errors.
 */
export async function applyRewords(
	upstream: string,
	shaToMessage: Map<string, string>,
	cwd: string,
	signal?: AbortSignal,
): Promise<void> {
	const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "commit-rewrite-"));
	const mapFile = path.join(tmp, "map.json");
	const queueFile = path.join(tmp, "queue.json");

	const map: Record<string, string> = {};
	for (const [sha, msg] of shaToMessage) map[sha] = msg;

	const env: GitEnv = {
		GIT_SEQUENCE_EDITOR: SEQUENCE_EDITOR,
		GIT_EDITOR: MESSAGE_EDITOR,
		COMMIT_REWRITE_MAP_FILE: mapFile,
		COMMIT_REWRITE_QUEUE_FILE: queueFile,
	};

	try {
		await fs.writeFile(mapFile, JSON.stringify(map));
		await execGit(["rebase", "-i", upstream], cwd, signal, env);
	} finally {
		await fs.rm(tmp, { recursive: true, force: true }).catch(() => {
			// best-effort cleanup; never mask the real error
		});
	}
}
