/**
 * Bulk issue launch — the direct-open path for one or more issues.
 *
 * For each issue, reuses an existing worktree when present and otherwise creates
 * a new one, then launches an independent Pi session in a Kitty split. The two
 * side effects (worktree creation and Pi launch) are injected so the sequencing
 * is fully unit-testable without touching git or Kitty (issue #67).
 *
 * Error-continuation policy (issue #68, settling PRD #66 slice 3): when a single
 * issue's worktree creation or Pi launch fails, that issue is skipped and the
 * remaining issues still launch. The caller receives the list of skipped issues
 * (number + reason) to surface once every attempt has finished. A fully-successful
 * batch reports an empty skip list, preserving slice-1 (#67) behaviour. Blocked
 * issues are rejected before reaching this module, so the failures handled here
 * are unexpected worktree/git or launch errors; the batch is never made atomic
 * because that would punish every issue for one failure (PRD #66 方針).
 *
 * ADR-0021 (protect the Main Pi region) is honoured inside the injected Pi
 * launcher, which re-resolves the widest Issue Pi anchor for every launch.
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

/** An issue that could not be opened, with the error that stopped it. */
export interface SkippedIssue {
	issueNumber: number;
	/** Human-readable failure reason (from the thrown error's message). */
	reason: string;
}

/** Outcome of a bulk launch: which issues opened and which were skipped. */
export interface BulkLaunchResult {
	/** Issue numbers that completed worktree resolution and Pi launch. */
	launched: number[];
	/** Issue numbers that failed to open, each with its failure reason. */
	skipped: SkippedIssue[];
}

/**
 * Sequentially attempt to open every issue in {@link issues}.
 *
 * Each attempt reuses an existing worktree when reported, otherwise creates one
 * via {@link BulkLaunchDeps.createWorktree}, then launches a Pi session via
 * {@link BulkLaunchDeps.launchPiSession}. If either step throws for an issue,
 * that issue is recorded in {@link BulkLaunchResult.skipped} and processing
 * continues with the next issue (issue #68 error-continuation policy). The
 * function therefore does not throw for failures raised by the injected
 * per-issue launch steps.
 */
export async function bulkLaunchIssues(
	issues: BulkLaunchIssue[],
	deps: BulkLaunchDeps,
): Promise<BulkLaunchResult> {
	const launched: number[] = [];
	const skipped: SkippedIssue[] = [];

	for (const issue of issues) {
		try {
			const worktreePath =
				issue.hasWorktree && issue.worktreePath
					? issue.worktreePath
					: deps.createWorktree(issue.issueNumber);
			await deps.launchPiSession(issue.issueNumber, worktreePath);
			launched.push(issue.issueNumber);
		} catch (error) {
			skipped.push({
				issueNumber: issue.issueNumber,
				reason: error instanceof Error ? error.message : String(error),
			});
		}
	}

	return { launched, skipped };
}
