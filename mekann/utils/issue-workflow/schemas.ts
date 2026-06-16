/**
 * issue_workflow tool parameter schema.
 *
 * The schema is a flat collection of Optional fields shared across all 11
 * actions. Action-specific required-field validation lives in
 * `validateActionArgs` (actions.ts) and is enforced in `prepareArguments`.
 */

import { Type, type Static } from "@sinclair/typebox";

/** The 13 actions exposed by the issue_workflow tool. Single runtime source of truth. */
export const ISSUE_WORKFLOW_ACTIONS = [
	"current_branch",
	"status",
	"diff",
	"view_pr",
	"commit",
	"push",
	"create_pr",
	"update_pr",
	"ready",
	"comment",
	"issue_comment",
	"promote_to_ready_for_agent",
	"demote_to_ready_for_human",
] as const;

export type IssueWorkflowAction = (typeof ISSUE_WORKFLOW_ACTIONS)[number];

// The action literals are written out explicitly (mirroring ISSUE_WORKFLOW_ACTIONS)
// so that `Static<typeof IssueWorkflowParamsSchema>["action"]` resolves to the
// real literal union. Building the union via `.map()` widens to TLiteral<string>
// and collapses Static to `never`. A test asserts the two lists stay in sync.
const ACTION_UNION = Type.Union(
	[
		Type.Literal("current_branch"),
		Type.Literal("status"),
		Type.Literal("diff"),
		Type.Literal("view_pr"),
		Type.Literal("commit"),
		Type.Literal("push"),
		Type.Literal("create_pr"),
		Type.Literal("update_pr"),
		Type.Literal("ready"),
		Type.Literal("comment"),
		Type.Literal("issue_comment"),
		Type.Literal("promote_to_ready_for_agent"),
		Type.Literal("demote_to_ready_for_human"),
	],
	{
		description:
			"Single workflow action to perform. Mutating actions (commit, push, create_pr, update_pr, ready, comment, issue_comment, promote_to_ready_for_agent, demote_to_ready_for_human) only run inside an issue worktree (branch issue-<number>). issue_comment, promote_to_ready_for_agent, and demote_to_ready_for_human are exempt when an explicit 'issue' number is supplied.",
	},
);

export const IssueWorkflowParamsSchema = Type.Object(
	{
		action: ACTION_UNION,
		message: Type.Optional(
			Type.String({
				description: "Commit message (action: commit). Written to a temp file and passed via `git commit -F`, so $, backticks, newlines, and code blocks survive verbatim.",
			}),
		),
		files: Type.Optional(
			Type.Array(Type.String(), {
				description: "Paths to stage before committing (action: commit). Omitted = commit already-staged changes.",
			}),
		),
		amend: Type.Optional(
			Type.Boolean({ description: "Amend the previous commit (action: commit)." }),
		),
		cached: Type.Optional(
			Type.Boolean({ description: "Show staged diff only (action: diff)." }),
		),
		remote: Type.Optional(
			Type.String({ description: "Push remote; defaults to origin (action: push)." }),
		),
		force_with_lease: Type.Optional(
			Type.Boolean({ description: "Push with --force-with-lease (action: push)." }),
		),
		title: Type.Optional(
			Type.String({ description: "PR title (actions: create_pr, update_pr)." }),
		),
		body: Type.Optional(
			Type.String({
				description: "PR body or comment body (actions: create_pr, update_pr, comment, issue_comment). Written to a temp file and passed via --body-file.",
			}),
		),
		base: Type.Optional(
			Type.String({ description: "PR base branch (action: create_pr)." }),
		),
		draft: Type.Optional(
			Type.Boolean({ description: "Create a draft PR (action: create_pr). Prefer ready PRs after review_fixer." }),
		),
		pr: Type.Optional(
			Type.String({ description: "PR number or URL (actions: view_pr, update_pr, ready, comment). Defaults to the current branch PR." }),
		),
		issue: Type.Optional(
			Type.Number({ description: "Issue number (actions: issue_comment, promote_to_ready_for_agent, demote_to_ready_for_human). When supplied, these remote-issue actions run even outside an issue worktree; otherwise they default to the current issue worktree branch." }),
		),
	},
	{
		additionalProperties: false,
		description:
			"Perform git/gh workflow actions for issue worktrees. Pass one `action`; provide action-specific fields. Messages/bodies are passed via temp files, so they are never mangled by shell quoting.",
	},
);

export type IssueWorkflowParams = Static<typeof IssueWorkflowParamsSchema>;
