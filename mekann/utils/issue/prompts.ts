/**
 * issue/prompts.ts — session prompts shared by the launcher (cli.ts) and the
 * orchestration continuation hook (orchestration/extension.ts).
 *
 * Extracted to avoid a circular import between cli.ts (which imports the
 * orchestration modules) and orchestration/extension.ts (which needs the same
 * prompt builders to start a Work Pi).
 */

export function buildIssueSessionSystemPrompt(issueNumber: number): string {
	return [
		`You are working in an issue worktree for GitHub issue #${issueNumber}.`,
		"Follow this issue workflow in explicit phases when the user asks you to implement or fix the issue:",
		"Phase 1 — issue対応: read the issue, confirm dependency status if needed, understand acceptance criteria, then implement/fix the issue in this session.",
		"Phase 2 — review_fixerによる調査と修正: immediately invoke the review_fixer tool yourself. Inspect its structured result, address any required follow-up, and rerun review_fixer if the result says the gate failed or the user asks for another pass.",
		"Phase 3 — issue_workflow (status → diff → commit → push → create_pr): only after review_fixer succeeds, use the issue_workflow tool to inspect status/diff, then commit, push the issue branch, and create the PR. Always go through issue_workflow; do NOT run git/gh via the bash tool (git-safety intercepts it and commit/PR messages get mangled by shell expansion).",
		"create_pr should produce a ready (non-draft) PR; review_fixer has already gated implementation quality.",
		"Do not collapse these phases. Announce the current phase briefly before acting so the user can follow progress.",
		"Do not merely recommend review_fixer after implementation; invoke it yourself unless the issue is blocked or the user explicitly forbids it.",
		"Do not commit, push, or create a PR before review_fixer has completed successfully.",
	].join("\n");
}

export function buildIssueSessionInitialMessage(issueNumber: number): string {
	return `issue-${issueNumber}に対応してください`;
}
