# pr-workflow

`pr-workflow` is a utility feature that moves GitHub PR mergeability checks out of always-on prompt instructions and into runtime flow.

## Commands

- `/pr-check`: checks the PR for the current branch.
- `/pr-check <url-or-number>`: checks a specific GitHub PR.

The command runs:

```bash
gh pr view <target> --json mergeStateStatus,mergeable,url,baseRefName,headRefName
```

## Hooks

On `agent_end`, the feature scans the turn's messages for GitHub PR URLs. When it finds a PR URL, it checks mergeability and notifies the user. If the state is blocked or inconclusive, it queues a follow-up user message asking the agent to investigate safe remediation only.

## Safety boundary

This feature does not merge PRs, close PRs, approve PRs, force-push, change PR base branches, or run destructive git operations. Those actions remain governed by git safety enforcement and explicit user permission.
