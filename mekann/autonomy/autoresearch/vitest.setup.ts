/**
 * Vitest setup for the autoresearch package.
 *
 * Injects a test-only git identity via environment variables so that every child
 * `git` process (including the production {@link gitAutoCommit} in runner.ts, which
 * inherits `process.env`) has an author/committer identity WITHOUT writing to any
 * git config file.
 *
 * Why environment variables and not `git config`:
 *   Tests used to call `git config user.email/name` on a temp dir. Under parallel
 *   execution race conditions the cwd can resolve to a linked worktree instead of
 *   the temp dir, and in a worktree `git config --local` writes to the shared
 *   main-repo config (`.git/config`), polluting the developer's real identity and
 *   leaving `core.bare=true` behind. Env vars are inherited by child processes and
 *   never touch disk, so they cannot pollute any config regardless of cwd races.
 *
 * See issue #39 and TESTING.md "Git identity in tests".
 */

// Neutralize inherited git context so test git commands operate purely on the
// explicit cwd. When `git push` runs the pre-push hook from a linked worktree,
// git exports GIT_DIR pointing at the worktree's git dir (and related vars). If
// left in place, every child `git` process spawned by tests would honor GIT_DIR
// over its cwd, operating on the developer's real repo: this is the exact
// mechanism that created bogus "initial" commits on the worktree HEAD and
// polluted the shared config during parallel pre-push runs (issue #39).
// Deleting them here means all child processes (including production
// gitAutoCommit, which inherits process.env) run against the temp cwd only.
for (const k of [
	"GIT_DIR",
	"GIT_WORK_TREE",
	"GIT_INDEX_FILE",
	"GIT_OBJECT_DIRECTORY",
	"GIT_ALTERNATE_OBJECT_DIRECTORIES",
	"GIT_QUARANTINE_PATH",
	"GIT_NAMESPACE",
]) {
	delete process.env[k];
}

process.env.GIT_AUTHOR_NAME = "Test User";
process.env.GIT_AUTHOR_EMAIL = "test@example.com";
process.env.GIT_COMMITTER_NAME = "Test User";
process.env.GIT_COMMITTER_EMAIL = "test@example.com";
