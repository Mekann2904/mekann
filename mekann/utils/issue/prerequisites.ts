/**
 * issue/prerequisites.ts — shared pre-flight checks for issue commands.
 *
 * Used by `/issue` and `/issue-autopilot` so both reject early with the same
 * message when Kitty / `gh` / a git repo are unavailable, instead of each
 * command re-implementing the checks.
 */

import { execFileSync } from "node:child_process";
import { getRepoInfo } from "./worktree.js";

/** Returns an error message when a prerequisite is missing, or null when all pass. */
export function checkIssuePrerequisites(cwd: string): string | null {
	if (!process.env.KITTY_WINDOW_ID) return "Kitty terminal is required for /issue.";
	try {
		execFileSync("gh", ["--version"], { encoding: "utf-8", timeout: 3000 });
	} catch {
		return "`gh` CLI is required. Install with: brew install gh";
	}
	if (!getRepoInfo(cwd)) return "Not inside a git repository.";
	return null;
}
