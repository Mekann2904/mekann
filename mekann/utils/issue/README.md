# issue worktree

`issue` is a utility feature for GitHub issue workflows.

## Commands

- `/issue`: opens the interactive issue worktree selector in a Kitty split.
- `/issue <parent-number>`: orchestrates the parent's sub-issues (issue #71). Starts the first startable child's Work Pi; when the child's PR is merged and the Work Pi is closed, the next startable child is launched automatically. Approval-gated: a non-merged close stops the chain.
- `/issue-create <title>`: searches open issues for potential duplicates, asks for confirmation, then creates a GitHub issue.
- `/clean-issue-worktrees`: removes issue worktrees whose GitHub issues are closed.

## Orchestration (issue #71)

`/issue <parent>` drives a PRD/epic issue's sub-issues end-to-end with a human approval gate:

1. Snapshot children from GitHub truth (sub-issues, `blocked_by`, PR merge status) + local state (worktree, active Kitty pane).
2. Start the first startable child (lowest number) as a Work Pi marked with `MEKANN_ORCHESTRATION_PARENT` / `MEKANN_ORCHESTRATION_CHILD` env vars.
3. The child's Pi self-runs (implement → review_fixer → create PR), then stops.
4. The human reviews and merges the PR, then closes the Work Pi.
5. On the Work Pi's `session_shutdown`, re-snapshot from GitHub truth. If the just-finished child's PR is merged, launch the next startable child. If not merged, the chain stops.

Robustness by design (GitHub truth = Single Source of Truth): order-independence, re-entry, double-launch prevention (3-state check: PR status × worktree × active pane), and clean coexistence with manual `/issue`. Requires **gh >= 2.94.0** for sub-issues JSON support.

## Runtime gates

- `mekann-issue --issue <number>` and the interactive `/issue` selector check GitHub's official `blocked_by` issue dependency relationship before creating or opening an issue worktree.
- `/issue-create` always searches open issues before creating a new issue so duplicate detection is a runtime flow rather than an always-on prompt reminder.
