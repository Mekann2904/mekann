# issue worktree

`issue` is a utility feature for GitHub issue workflows.

## Commands

- `/issue`: opens the interactive issue worktree selector in a Kitty split.
- `/issue-create <title>`: searches open issues for potential duplicates, asks for confirmation, then creates a GitHub issue.
- `/clean-issue-worktrees`: removes issue worktrees whose GitHub issues are closed.

## Runtime gates

- `mekann-issue --issue <number>` and the interactive `/issue` selector check GitHub's official `blocked_by` issue dependency relationship before creating or opening an issue worktree.
- `/issue-create` always searches open issues before creating a new issue so duplicate detection is a runtime flow rather than an always-on prompt reminder.
