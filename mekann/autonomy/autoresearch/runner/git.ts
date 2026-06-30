/**
 * autoresearch/runner/git.ts — Git 操作・run id 生成・auto commit/revert。
 *
 * contract 系の {@link "../git.js"} (isGitRepo / isWorkingTreeClean / getBaselineCommit)
 * とは別系統。こちらは実験 run のための git 操作全般を担う:
 *   - hash 取得 (getGitShortHash / getGitFullHash)
 *   - working tree 状態 (isGitDirty / getChangedFiles)
 *   - run id 生成 (generatePiRunId — git short sha を埋め込むためここに置く)
 *   - 候補パッチ commit / revert (gitAutoCommit / gitAutoRevert)
 * 成果物書き出し (createRunArtifactDir) から参照される gitExecSync / gitCheckSync も
 * ここから export する。
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { randomBytes } from "node:crypto";

// ---------------------------------------------------------------------------
// Shared git exec helpers
// ---------------------------------------------------------------------------

/** execFileSync wrapper for git commands with standard options. */
export function gitExecSync(args: string[], cwd: string, timeout = 5_000): string {
	return execFileSync("git", args, { cwd, encoding: "utf8", timeout, stdio: ["ignore", "pipe", "pipe"] });
}

/** execFileSync wrapper for git commands that only checks exit code. */
export function gitCheckSync(args: string[], cwd: string, timeout = 5_000): void {
	execFileSync("git", args, { cwd, encoding: "utf8", timeout, stdio: ["ignore", "pipe", "pipe"] });
}

/**
 * Safety threshold for {@link gitAutoCommit} (issue #39).
 *
 * Maximum number of tracked files a single auto-commit may delete before the safety
 * guard refuses. Legitimate autoresearch candidate patches touch a handful of files;
 * the catastrophic pollution commit observed in issue #39 deleted 642 files. The
 * threshold sits well above any reasonable candidate patch and well below that.
 */
const GIT_AUTOCOMMIT_MAX_DELETIONS = 50;

/** Count currently-staged deleted files (diff-filter=D on the cached diff). */
function countStagedDeletions(cwd: string): number {
	const out = execFileSync("git", ["diff", "--cached", "--name-only", "--diff-filter=D"], { cwd, encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "pipe"] });
	return out.split("\n").filter(Boolean).length;
}

// ---------------------------------------------------------------------------
// Hash / working tree helpers
// ---------------------------------------------------------------------------

const GIT_SHORT_HASH_CACHE_MS = 1_000;
const gitShortHashCache = new Map<string, { value: string; expiresAt: number }>();

export function getGitShortHash(cwd: string): string {
	const key = path.resolve(cwd);
	const cached = gitShortHashCache.get(key);
	if (cached && cached.expiresAt > Date.now()) return cached.value;
	let value = "unknown";
	try {
		value = gitExecSync(["rev-parse", "--short", "HEAD"], cwd).trim();
	} catch {
		value = "unknown";
	}
	gitShortHashCache.set(key, { value, expiresAt: Date.now() + GIT_SHORT_HASH_CACHE_MS });
	return value;
}

/** Get the full commit hash. */
export function getGitFullHash(cwd: string): string {
	try {
		return gitExecSync(["rev-parse", "HEAD"], cwd).trim();
	} catch {
		return "unknown";
	}
}

/** Check if the working tree has uncommitted changes. */
export function isGitDirty(cwd: string): boolean {
	try {
		gitCheckSync(["diff", "--quiet"], cwd);
		gitCheckSync(["diff", "--cached", "--quiet"], cwd);
		const untracked = gitExecSync(["ls-files", "--others", "--exclude-standard"], cwd).trim();
		return untracked.length > 0;
	} catch {
		return true;
	}
}

/** Get list of changed files (staged + unstaged + untracked). */
export function getChangedFiles(cwd: string): string[] {
	try {
		const result = gitExecSync(["status", "--porcelain"], cwd).trim();
		if (!result) return [];
		return result.split("\n").map((line: string) => {
			const file = line.length >= 3 && line[2] === " " ? line.slice(3) : line.slice(2).trimStart();
			return file.includes(" -> ") ? file.split(" -> ").pop()! : file;
		}).filter(Boolean);
	} catch {
		return [];
	}
}

// ---------------------------------------------------------------------------
// Run ID generation
// ---------------------------------------------------------------------------

/**
 * Generate a time-sortable unique run ID.
 * Format: `<UTC timestamp>-pi-<gitShortSha>-<random6hex>`
 */
export function generatePiRunId(cwd: string): string {
	const now = new Date();
	const ts = now.toISOString().replace(/-/g, "").replace(/:/g, "").replace(/\.(?=\d{3}Z)/, ".");
	const gitSha = getGitShortHash(cwd);
	const random = randomBytes(3).toString("hex");
	return `${ts}-pi-${gitSha}-${random}`;
}

/** @deprecated Use generatePiRunId(cwd) instead. */
export function generateRunId(): string {
	return generatePiRunId(".");
}

// ---------------------------------------------------------------------------
// Auto git operations
// ---------------------------------------------------------------------------

/**
 * Root-level autoresearch report artifacts.
 *
 * These are audit/publish artifacts (generated reports and benchmark/checks wrappers), NOT
 * candidate patches. They are deliberately kept out of {@link gitAutoCommit} so the candidate-
 * patch commit boundary stays clean. Stage them explicitly via
 * {@link stageAutoresearchReportArtifacts} only when a report commit is intended.
 */
const ROOT_AUTORESEARCH_REPORT_ARTIFACTS = [
	"autoresearch.jsonl",
	"autoresearch.md",
	"autoresearch.sh",
	"autoresearch.checks.sh",
] as const;

/**
 * 候補パッチを stage して commit する。
 *
 * 責務は「候補パッチの commit」のみ。`git add -A` したあと、internal/audit 系パス
 * (`.pi/`, `.autoresearch/`, `autoresearch.plan.md`) を unstage してから commit する。
 *
 * root 直下の autoresearch report artifact (`autoresearch.jsonl`, `autoresearch.md`,
 * `autoresearch.sh`, `autoresearch.checks.sh`) は監査/publish 用であり候補パッチではない
 * ため、ここでは暗黙に stage しない。それらを同じ commit に含めたい場合だけ
 * `includeAutoresearchReportArtifacts: true` を明示すること。
 *
 * `.pi/` は監査用 artifact であり git 管理対象外。
 */
export function gitAutoCommit(cwd: string, message: string, options: { includeAutoresearchReportArtifacts?: boolean; allowDestructiveCommit?: boolean } = {}): { committed: boolean; commit?: string; error?: string } {
	try {
		// Check if we're in a git repo first. If not, no error — just nothing to commit.
		gitCheckSync(["rev-parse", "--git-dir"], cwd);
	} catch {
		return { committed: false };
	}

	try {
		// Internal artifacts are discussion/audit state, not candidate patches.
		// Avoid pathspec magic exclusions here: older Git versions and some shells/environments
		// have proven brittle with `:(exclude)` during auto-commit. Stage normally, then
		// unstage internal paths (audit dirs + root report artifacts) using portable pathspecs.
		execFileSync("git", ["add", "-A", "--", "."], { cwd, encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "pipe"] });
		execFileSync("git", ["reset", "--", ".pi", ".autoresearch", "autoresearch.plan.md", ...ROOT_AUTORESEARCH_REPORT_ARTIFACTS], { cwd, encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "pipe"] });
		if (options.includeAutoresearchReportArtifacts) {
			const stagedReports = stageAutoresearchReportArtifacts(cwd);
			if (stagedReports.error) return { committed: false, error: stagedReports.error };
		}

		try {
			gitCheckSync(["diff", "--cached", "--quiet"], cwd);
			return { committed: false };
		} catch { /* diff あり → commit */ }

		// Safety guard (issue #39): refuse to commit a catastrophic mass deletion.
		// This backstops test/worktree races where a corrupted index would stage the
		// deletion of hundreds of tracked files in one commit. Legitimate candidate
		// patches never delete this many files at once; opt out with
		// `allowDestructiveCommit: true` only when a large deletion is intentional.
		if (!options.allowDestructiveCommit) {
			const deletions = countStagedDeletions(cwd);
			if (deletions > GIT_AUTOCOMMIT_MAX_DELETIONS) {
				return {
					committed: false,
					error: `gitAutoCommit safety guard: ${deletions} tracked files would be deleted by this commit (threshold ${GIT_AUTOCOMMIT_MAX_DELETIONS}). This usually means the cwd index is corrupted (e.g. a worktree race, see issue #39). Refusing to commit. Inspect with: git -C ${JSON.stringify(cwd)} diff --cached --name-only --diff-filter=D`,
				};
			}
		}

		gitCheckSync(["commit", "-m", message], cwd, 10_000);
		gitShortHashCache.delete(path.resolve(cwd));
		return { committed: true, commit: getGitShortHash(cwd) };
	} catch (e) {
		return { committed: false, error: e instanceof Error ? e.message : String(e) };
	}
}

/**
 * root 直下の autoresearch report artifact を明示的に stage する。
 *
 * これは候補パッチの staging ではなく、監査/publish 用 report artifact の明示的な
 * export step である。`-f` で ignore を貫通する挙動はこの関数に閉じ込めている。
 * report artifact だけを別途 publish したい場合は、この関数を呼んでから任意の commit
 * 手順で commit すること。候補パッチ commit に明示的に同梱したい場合は
 * {@link gitAutoCommit} に `includeAutoresearchReportArtifacts: true` を渡すこと。
 *
 * 戻り値 `staged` は実際に stage した (存在した) ファイル名のリスト。
 */
export function stageAutoresearchReportArtifacts(cwd: string): { staged: string[]; error?: string } {
	try {
		gitCheckSync(["rev-parse", "--git-dir"], cwd);
	} catch {
		return { staged: [] };
	}

	const existing = ROOT_AUTORESEARCH_REPORT_ARTIFACTS.filter((f) => fs.existsSync(path.join(cwd, f)));
	if (existing.length === 0) {
		return { staged: [] };
	}

	try {
		execFileSync("git", ["add", "-f", "--", ...existing], { cwd, encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "pipe"] });
		return { staged: [...existing] };
	} catch (e) {
		return { staged: [], error: e instanceof Error ? e.message : String(e) };
	}
}

/** 作業ツリーを revert（root internal artifacts と .autoresearch/.pi は保護）。 */
export function gitAutoRevert(cwd: string): { reverted: boolean; error?: string } {
	try {
		const checkoutExcludes = [
			":(exclude)autoresearch.plan.md",
			":(exclude)autoresearch.md",
			":(exclude)autoresearch.jsonl",
			":(exclude)autoresearch.ideas.md",
			":(exclude).autoresearch/**",
			":(exclude).pi/**",
		];
		execFileSync("git", ["checkout", "--", ".", ...checkoutExcludes], {
			cwd, encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "ignore"],
		});
		// Preserve only root discussion artifacts and internal audit directories.
		execFileSync("git", [
			"clean", "-fd",
			"-e", "autoresearch.plan.md",
			"-e", "autoresearch.md",
			"-e", "autoresearch.jsonl",
			"-e", "autoresearch.ideas.md",
			"-e", ".autoresearch",
			"-e", ".autoresearch/**",
			"-e", ".pi",
			"-e", ".pi/**",
		], { cwd, encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "ignore"] });
		return { reverted: true };
	} catch (e) {
		return { reverted: false, error: e instanceof Error ? e.message : String(e) };
	}
}
