/**
 * Integration tests for worktree base-branch recording.
 *
 * Uses real temp git repos (git is invoked via execFileSync, not the sandboxed
 * bash tool) to verify that an issue worktree remembers the branch it was
 * forked from so create_pr can target it instead of always defaulting to main.
 */

import { describe, it, expect, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
	createWorktree,
	removeWorktree,
	detectCurrentBranch,
	readIssueBase,
	issueBaseConfigKey,
	issueBranch,
} from "./worktree.js";

const tmpDirs: string[] = [];

function mkdtemp(prefix: string): string {
	const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
	tmpDirs.push(dir);
	return dir;
}

function git(cwd: string, args: string[]): string {
	return execFileSync("git", args, { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

/** Create a real git repo with an initial commit on `main` and a `develop` branch. */
function makeRepo(): string {
	const root = mkdtemp("wt-base-");
	git(root, ["init", "-q", "-b", "main"]);
	git(root, ["config", "user.email", "t@t.t"]);
	git(root, ["config", "user.name", "t"]);
	fs.writeFileSync(path.join(root, "a.txt"), "a");
	git(root, ["add", "."]);
	git(root, ["commit", "-q", "-m", "init"]);
	git(root, ["checkout", "-q", "-b", "develop"]);
	fs.writeFileSync(path.join(root, "b.txt"), "b");
	git(root, ["add", "."]);
	git(root, ["commit", "-q", "-m", "dev"]);
	return root;
}

afterEach(() => {
	for (const dir of tmpDirs.splice(0)) {
		try {
			fs.rmSync(dir, { recursive: true, force: true });
		} catch {
			/* best-effort */
		}
	}
});

describe("issueBaseConfigKey", () => {
	it("maps an issue branch to a branch-scoped config key", () => {
		expect(issueBaseConfigKey("issue-5")).toBe("branch.issue-5.mekann-base");
	});
});

describe("detectCurrentBranch", () => {
	it("returns the current branch name", () => {
		const root = makeRepo();
		expect(detectCurrentBranch(root)).toBe("develop");
	});

	it("returns empty string on detached HEAD", () => {
		const root = makeRepo();
		const head = git(root, ["rev-parse", "HEAD"]);
		git(root, ["checkout", "-q", "--detach", head]);
		expect(detectCurrentBranch(root)).toBe("");
	});

	it("returns empty string outside a git repo", () => {
		const dir = mkdtemp("wt-empty-");
		expect(detectCurrentBranch(dir)).toBe("");
	});
});

describe("readIssueBase", () => {
	it("returns empty string when no base is recorded", () => {
		const root = makeRepo();
		expect(readIssueBase(root, "issue-99")).toBe("");
	});
});

describe("createWorktree records the fork-point base", () => {
	it("records the branch the worktree was created from (develop)", () => {
		const root = makeRepo(); // on `develop`
		const wtPath = path.join(path.dirname(root), `${path.basename(root)}-wt`, "issue-5");
		const wt = createWorktree(root, issueBranch(5), wtPath);
		expect(wt.branch).toBe("issue-5");
		expect(readIssueBase(root, "issue-5")).toBe("develop");
	});

	it("records `main` when invoked from main (no behaviour change for the default flow)", () => {
		const root = makeRepo();
		git(root, ["checkout", "-q", "main"]);
		const wtPath = path.join(path.dirname(root), `${path.basename(root)}-wt`, "issue-6");
		createWorktree(root, issueBranch(6), wtPath);
		expect(readIssueBase(root, "issue-6")).toBe("main");
	});

	it("does not overwrite an already-recorded base on re-add (branch exists, no worktree)", () => {
		const root = makeRepo(); // on develop
		// Pre-seed the config as if a previous creation recorded `develop`.
		git(root, ["config", issueBaseConfigKey("issue-7"), "develop"]);
		// Create the branch ahead of time so createWorktree takes the
		// branch-exists path; switch repoRoot to a different branch.
		git(root, ["branch", "issue-7"]);
		git(root, ["checkout", "-q", "main"]);
		const wtPath = path.join(path.dirname(root), `${path.basename(root)}-wt`, "issue-7");
		createWorktree(root, issueBranch(7), wtPath);
		// Original base preserved (not overwritten with `main`).
		expect(readIssueBase(root, "issue-7")).toBe("develop");
	});

	it("creates a stacked PR base when forked from a parent issue worktree", () => {
		const root = makeRepo(); // repoRoot on `develop`
		const wt8Path = path.join(path.dirname(root), `${path.basename(root)}-wt`, "issue-8");
		createWorktree(root, issueBranch(8), wt8Path); // records `develop`
		expect(readIssueBase(root, "issue-8")).toBe("develop");

		// Simulate running `/issue 9` from inside the issue-8 Work Pi: the issue-8
		// worktree is the cwd, so its HEAD (issue-8) is the fork point for issue-9.
		// This is how stacked PRs arise — issue-9's PR targets issue-8.
		const wt9Path = path.join(path.dirname(root), `${path.basename(root)}-wt`, "issue-9");
		createWorktree(wt8Path, issueBranch(9), wt9Path);
		expect(readIssueBase(root, "issue-9")).toBe("issue-8");
		expect(fs.existsSync(wt9Path)).toBe(true);
	});
});

describe("resume keeps the original base", () => {
	it("does not re-record (or drop) the base when the worktree already exists", () => {
		const root = makeRepo(); // on develop
		const wtPath = path.join(path.dirname(root), `${path.basename(root)}-wt`, "issue-5");
		createWorktree(root, issueBranch(5), wtPath);
		expect(readIssueBase(root, "issue-5")).toBe("develop");
		// repoRoot moves on to main, then the worktree is "resumed" (re-resolved).
		git(root, ["checkout", "-q", "main"]);
		const wt = createWorktree(root, issueBranch(5), wtPath);
		expect(wt.path).toBe(wtPath);
		// Base must still be the original fork point, not main.
		expect(readIssueBase(root, "issue-5")).toBe("develop");
	});
});

describe("removeWorktree clears the recorded base", () => {
	it("unsets the base config when the worktree is removed", () => {
		const root = makeRepo();
		const wtPath = path.join(path.dirname(root), `${path.basename(root)}-wt`, "issue-5");
		const wt = createWorktree(root, issueBranch(5), wtPath);
		expect(readIssueBase(root, "issue-5")).toBe("develop");
		removeWorktree(root, wt);
		expect(readIssueBase(root, "issue-5")).toBe("");
	});
});
