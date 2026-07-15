# Project opt-in for PR and issue-workflow automation

## Status

Accepted

## Context

PR URLs can refer to forked or externally owned repositories. Repository ownership and local issue-worktree isolation do not establish permission to poll or mutate remote collaboration state. ADR-0019 auto-approved mutations in issue worktrees, while ADR-0022 automatically started PR settle polling after a PR URL appeared.

## Decision

Automatic GitHub workflow behavior is disabled by default and may only be enabled explicitly in workspace `.pi/mekann.json`.

- `pr-workflow.autoCheckDetectedPrs` defaults to `false`. When enabled, it checks PR URLs detected in agent messages; `/pr-check` remains an explicit read-only command.
- `issue-workflow.autoApproveMutations` defaults to `false`. Without the opt-in, every structured mutating action asks for confirmation.
- Both settings have workspace scope only. A global setting cannot silently opt every repository into automation.
- The policy does not infer trust from repository ownership, fork relationships, branch names, or authenticated GitHub permissions.
- When confirmation is required, remote GitHub targets are resolved read-only and fail closed on ambiguity. Approved execution is bound to the resolved remote URL, PR URL, or repository instead of re-inferring the target after confirmation.

## Consequences

Existing projects that relied on automatic post-PR polling or issue-worktree mutation must opt in through `.pi/mekann.json`. Forks and external repositories receive the same safe default as owned repositories. This decision supersedes ADR-0019's unconditional issue-worktree auto-approval and ADR-0022's unconditional `agent_end` settle polling.
