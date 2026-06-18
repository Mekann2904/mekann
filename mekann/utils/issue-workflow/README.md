# issue-workflow

Single structured tool (`issue_workflow`) that runs git/gh workflow actions for
issue worktrees so Phase 3 of issue work (status → diff → commit → push →
create_pr) does **not** go through the bash tool.

## Why

Two problems block the agent from self-driving to a PR via bash:

1. **git-safety gate** — `mekann/safety/git-safety` intercepts bash mutating
   git/gh commands (`git push`, `gh pr create`, …) and prompts with
   `ctx.ui.confirm()` every time, stopping the agent.
2. **message mangling** — heredoc + `git commit -m` / `gh pr create --body`
   mangles commit/PR messages containing `$`, backticks, newlines, or code
   blocks via shell expansion.

`issue_workflow` fixes both: it calls git/gh via `execFile` (not the bash tool,
so git-safety never sees it) and passes messages/bodies via temp files
(`git commit -F` / `gh pr create --body-file`), so no shell quoting is used.

## Actions

| action | purpose | mutating | gated to issue worktree |
|---|---|---|---|
| `current_branch` | current branch + issue number + worktree flag + recorded PR base | no | no |
| `status` | `git status --porcelain` | no | no |
| `diff` | `git diff` (`cached?`, `files?`) | no | no |
| `view_pr` | mergeability (`/pr-check` parity) | no | no |
| `commit` | stage (`files?`) → `git commit -F <tmpfile>` (`amend?`) | yes | yes |
| `push` | `git push [remote?] <branch> [--force-with-lease?]` | yes | yes |
| `create_pr` | `gh pr create --title --body-file <tmpfile>` (`base?`, `draft?`); `base` defaults to the branch the worktree was forked from | yes | yes |
| `update_pr` | `gh pr edit [--title] [--body-file <tmpfile>]` | yes | yes |
| `ready` | `gh pr ready` | yes | yes |
| `comment` | `gh pr comment --body-file <tmpfile>` | yes | yes |
| `issue_comment` | `gh issue comment <n> --body-file <tmpfile>` | yes | conditional |
| `promote_to_ready_for_agent` | `gh issue edit <n> --add-label ready-for-agent --remove-label ready-for-human` | yes | conditional |
| `demote_to_ready_for_human` | `gh issue edit <n> --add-label ready-for-human --remove-label ready-for-agent` | yes | conditional |

Mutating actions are only permitted inside an issue worktree (branch
`issue-<number>`); otherwise they return a clear error so `main` etc. can never
be touched by accident. The remote-issue actions (`issue_comment`,
`promote_to_ready_for_agent`, `demote_to_ready_for_human`) are the exception:
they target an arbitrary remote issue through the GitHub API and never touch
local worktree state, so they bypass the gate when an explicit `issue` number
is supplied. With no `issue` they still require a worktree so the number can be
derived from the branch.

`promote_to_ready_for_agent` / `demote_to_ready_for_human` toggle the triage
state-role labels (`ready-for-human` ↔ `ready-for-agent`; see
`docs/agents/triage-labels.md`) for the consensus phase and F3 demotion in the
issue-autopilot label-gated-parallel design (issue #111). The issue number
resolves from `issue` or the current `issue-<n>` branch.

## Message safety

`message` / `body` are received as JSON arguments, written to a temp file under
`os.tmpdir()`, and passed via `-F` / `--body-file`. The temp file is removed in
a `finally` block. `title` is passed as a plain argv element. No shell is
involved, so `$VAR`, backticks, newlines, and fenced code blocks survive
verbatim.

## Feature flag

`issue-workflow` (defaults to enabled). See `mekann/settings`.

## PR base resolution

`create_pr` does not always target the repo's default branch. When `base` is
omitted, it falls back to the branch the issue worktree was forked from — i.e.
the branch `/issue` was invoked on. That branch is recorded at worktree creation
in `git config branch.issue-<n>.mekann-base` (shared `.git/config`, never in the
working tree, cleared when the worktree is removed). So:

- `/issue` invoked on `main` → PR targets `main` (unchanged behaviour).
- `/issue` invoked on `develop` → PR targets `develop`.
- A child Work Pi forked from a parent `issue-<n>` → PR targets `issue-<n>`
  (stacked PR; GitHub auto-retargets to `main` once the parent merges).

Explicit `base` always wins. `current_branch` reports the recorded `prBase` so
the agent can see where the PR will go before creating it. If the fork-point
branch is local-only (not pushed), `gh pr create --base` fails clearly; when no
base is recorded at all, create_pr falls back to gh's default base.

## Layout

- `schemas.ts` — TypeBox parameter schema (flat Optional fields) + action tuple.
- `actions.ts` — `validateActionArgs` + `executeAction` over a `CommandRunner`
  abstraction (pure-ish, unit-testable without mocking node modules).
- `index.ts` — tool registration, `prepareArguments` validation, real
  `CommandRunner` (execFile + temp files).
- `index.test.ts` — validation, dispatch, worktree gate, message safety.

See ADR 0019 for the decision record.
