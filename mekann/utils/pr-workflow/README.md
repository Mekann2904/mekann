# pr-workflow

`pr-workflow` is a utility feature that moves GitHub PR mergeability checks out of always-on prompt instructions and into runtime flow.

## Commands

- `/pr-check`: checks the PR for the current branch.
- `/pr-check <url-or-number>`: checks a specific GitHub PR.

The command runs:

```bash
gh pr view <target> --json mergeStateStatus,mergeable,url,baseRefName,headRefName,statusCheckRollup
```

## Hooks

On `agent_end`, the feature scans the turn's messages for GitHub PR URLs. When it finds a PR URL, it checks mergeability and **waits for the CI checks to settle** before notifying.

The hook is fire-and-forget: it returns immediately so it never blocks the agent, and a background poll runs until the PR reaches a settled state (or the poll budget is exhausted). This avoids false "blocked" notifications caused by GitHub's transient `UNKNOWN` (still computing) and `UNSTABLE` (non-required checks pending) states, which are common immediately after a push.

### Classification

A snapshot is classified as:

| Verdict | Meaning | Notification |
|---|---|---|
| `pending` | Checks still running, or GitHub still computing (`UNKNOWN`) | Wait (poll) |
| `clean` | Fully mergeable | info |
| `mergeableUnstable` | Mergeable but a non-required check failed (`mergeable=true`, `UNSTABLE`) | info — **not** blocked, since the PR can still merge |
| `blocked` | Truly blocked (`CONFLICTING` / `BEHIND` / `DIRTY` / `BLOCKED`) | warning + follow-up |

Only `blocked` queues the follow-up user message asking the agent to investigate safe remediation.

### Polling

Polling uses capped exponential backoff and is controlled by environment variables (defaults tuned for typical CI runtimes):

| Env | Default | Meaning |
|---|---|---|
| `MEKANN_PR_WORKFLOW_MAX_POLLS` | `20` | Maximum number of polls before giving up |
| `MEKANN_PR_WORKFLOW_INITIAL_INTERVAL_MS` | `15000` | First poll interval |
| `MEKANN_PR_WORKFLOW_MAX_INTERVAL_MS` | `60000` | Interval cap |
| `MEKANN_PR_WORKFLOW_BACKOFF` | `1.4` | Backoff multiplier |

Polls use `setTimeout(...).unref()` so they never keep the Pi process alive on their own. If the budget is exhausted while checks are still running, an info (not warning) message suggests re-running `/pr-check` later.

## Safety boundary

This feature does not merge PRs, close PRs, approve PRs, force-push, change PR base branches, or run destructive git operations. Those actions remain governed by git safety enforcement and explicit user permission.
