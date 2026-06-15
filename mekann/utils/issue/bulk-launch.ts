/**
 * Bulk issue launch — the direct-open path for one or more issues.
 *
 * For each issue, reuses an existing worktree when present and otherwise creates
 * a new one, then launches an independent Pi session in a Kitty split. The two
 * side effects (worktree creation and Pi launch) are injected so the sequencing
 * is fully unit-testable without touching git or Kitty (issue #67).
 *
 * Out of scope for this slice: error-continuation policy (PRD #66, slice 3) and
 * blocked-issue rejection (slice 2). This module assumes every requested issue
 * can be opened; the caller is responsible for pre-flight checks. ADR-0021
 * (protect the Main Pi region) is honoured inside the injected Pi launcher,
 * which re-resolves the widest Issue Pi anchor for every launch.
 */

/**
 * A single issue to open directly. Carries pre-resolved worktree info so the
 * launcher can decide reuse-vs-create without re-querying git itself.
 */
export interface BulkLaunchIssue {
	issueNumber: number;
	hasWorktree: boolean;
	/** Present only when {@link hasWorktree} is true. */
	worktreePath?: string;
}

/**
 * Injectable side effects for bulk launch.
 *
 * - {@link createWorktree}: create a fresh worktree for an issue, returning its
 *   absolute path. Only called when no existing worktree is reported.
 * - {@link launchPiSession}: start an independent Pi session in a Kitty split
 *   for an issue rooted at the given worktree path. Called once per issue.
 */
export interface BulkLaunchDeps {
	createWorktree: (issueNumber: number) => string;
	launchPiSession: (issueNumber: number, worktreePath: string) => Promise<void>;
}

/**
 * Sequentially open every issue in {@link issues}.
 *
 * Launches run in order (serial). Each launch reuses an existing worktree when
 * reported, otherwise creates one via {@link BulkLaunchDeps.createWorktree}.
 * Pi sessions always launch via {@link BulkLaunchDeps.launchPiSession}.
 */
export async function bulkLaunchIssues(
	issues: BulkLaunchIssue[],
	deps: BulkLaunchDeps,
): Promise<void> {
	for (const issue of issues) {
		const worktreePath =
			issue.hasWorktree && issue.worktreePath
				? issue.worktreePath
				: deps.createWorktree(issue.issueNumber);
		await deps.launchPiSession(issue.issueNumber, worktreePath);
	}
}
