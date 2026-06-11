# Prompt control budget

Mekann keeps always-on prompt controls small and moves mechanically-checkable behavior into runtime features, commands, hooks, or skills.

## Budget target

Always-on prompt controls SHOULD stay at **50 bullet controls or fewer**. A bullet control is a top-level Markdown list item in a stable, global prompt fragment registered through `registerPromptProvider`.

Initial category budget:

```text
Core behavior:        8
Git safety:           6
User work safety:     5
Verification:         5
Review/reporting:     5
Web/source handling:  5
Project context:      5
Voice/UX:             3
Runtime flow routing: 4
Reserved:             4
------------------------
Total:               50
```

## Prompt-addition checklist

Before adding a new always-on prompt instruction, check whether it can be moved out of prompt:

1. Can a CLI command inspect or enforce it?
2. Can a lifecycle hook detect it?
3. Can a Mekann command provide the flow?
4. Can a tool result be normalized or enhanced before it reaches the agent?
5. Can it be isolated in a skill loaded only for that task?
6. If none of the above apply, is it a broad judgment rule that must always be available?

If any of 1-5 is yes, prefer a runtime flow, runtime enforcement, result enhancer, or skill over an always-on prompt control.

## Classification rules

### Runtime enforcement

Use when the extension can directly block, execute, or validate behavior without asking the model to remember a rule.

Current and candidate examples:

- sandbox / read-only / workspace-write command restrictions
- destructive git operation blocking
- GitHub PR mergeability inspection
- issue dependency gate
- autoresearch acceptance policy
- output-gate
- command-normalization
- patch proposal intake
- context ledger recording

### Runtime flow

Use when the behavior is an ordered workflow rather than a hard block.

Current and candidate examples:

- PR creation detection followed by mergeability check
- `/pr-check` for the current branch
- issue start dependency check
- PR ready blocked-issue check
- review → test → recheck loop
- conflict detection followed by an agent follow-up task
- GitHub issue duplicate search
- issue worktree setup and branch naming
- verification report generation

### Prompt

Keep only broad judgment rules that cannot be fully decided by runtime code.

Examples:

- make the smallest correct change
- protect unrelated user work
- report verification honestly
- sort review findings by severity
- ask for explicit permission before irreversible or high-risk actions when runtime cannot decide intent
- prefer authoritative sources for current external facts

### Skill

Use for detailed procedures that are task-specific rather than always needed.

Examples:

- `thermo-nuclear-code-quality-review`
- `tdd`
- `diagnose`
- `to-prd`
- `to-issues`
- `grill-with-docs`
- Cloudflare / Wrangler / Durable Objects workflows

## Current prompt inventory

Stable global prompt providers currently include:

| Provider | Current classification | Migration note |
| --- | --- | --- |
| `agent-guidelines` | Prompt | Broad coding judgment. Keep concise. |
| `proactive-review` | Runtime-flow routing prompt | Diff-size detection lives in `utils/review-quality`; semantic risk judgment remains prompt. |
| `github-links` | Prompt + result enhancer candidate | URL formatting can later be handled by GitHub result enhancers. |
| `pr-workflow` | Runtime-flow routing prompt | Detailed steps should live in `utils/pr-workflow`; prompt should only route to it. |
| `git-safety` | Runtime enforcement + prompt safety net | `mekann/safety/git-safety` confirms high-risk bash commands at `tool_call`; prompt remains a short fallback. |
| `sandbox` | Runtime enforcement + prompt safety net | Sandbox owns hard boundaries. |
| `cacheable-context` | Project instruction locator | Keep as compact locator rather than embedding all docs. |
| `skill-surface` | Skill routing | Semi-stable surface; detailed procedures live in skill files. |
| mode providers | Mode policy | Mode-specific and should not count as broad global controls unless stable/global. |
| tool `promptGuidelines` | Tool policy | Prefer moving into tool descriptions/result shaping where possible. |

## Migration status

Implemented runtime flows in this issue:

- `utils/pr-workflow`: PR mergeability checks via `/pr-check` and PR URL detection on `agent_end`.
- `safety/git-safety`: runtime confirmation for high-risk git and GitHub mutations at `tool_call`.
- `utils/issue` `/issue-create`: open-issue duplicate search before creating a new GitHub issue.
- `utils/verify`: repo-local verification reporting via `/verify`.
- `utils/review-quality`: diff-size review prompting via `/review-quality` and `agent_end` detection.

Remaining candidates are follow-up hardening rather than acceptance blockers:

- GitHub full URL formatting as a result enhancer.
- Repo-specific verification registry beyond package scripts.
- Deeper PR-ready blocked-issue gates.

## Migration candidates

1. Implement `utils/pr-workflow` as the runtime home for PR mergeability.
   - `/pr-check`: inspect the current branch PR or an explicit PR URL/number.
   - `agent_end`: optionally inspect when a PR was created or mentioned in the turn.
   - `gh pr create` result detector: extract PR URLs from tool output.
   - Mergeability follow-up: enqueue a user follow-up only when the PR is blocked and safe remediation requires agent work.
2. Move destructive git and GitHub mutation checks from prompt-only policy into `tool_call` enforcement. Initial runtime confirmation lives in `mekann/safety/git-safety`.
3. Move issue duplicate search and dependency gates into issue commands. Dependency gates already run in `mekann-issue`; duplicate search now starts in `/issue-create`.
4. Add a budget check so stable global prompt bullet controls cannot grow beyond 50 unnoticed.
5. Move verification reporting into `/verify`, which runs repo-local scripts and reports exactly which commands passed or failed.
6. Move diff-size based review prompting into `/review-quality` and its `agent_end` detector.

## PR workflow runtime feature design

Feature name: `utils/pr-workflow`.

Responsibilities:

- Detect a PR from an explicit `/pr-check <url-or-number>` argument or the current git branch.
- Run `gh pr view <target> --json mergeStateStatus,mergeable,url,baseRefName,headRefName`.
- Report a concise status notification to the user.
- On `agent_end`, inspect recent assistant/tool messages for newly created GitHub PR URLs and check them.
- If GitHub reports `CONFLICTING`, `DIRTY`, or another blocked state, enqueue a follow-up task for the agent to investigate and fix only within existing safety rules.
- Delegate force push, destructive git, merge, close, and approval decisions to git safety enforcement and explicit user permission.

Non-goals:

- It does not merge PRs.
- It does not force-push.
- It does not bypass issue dependency gates.
- It does not replace human review.

## Budget check policy

The `agent-guidelines` package contains a test that counts top-level bullets in stable global prompt fragments and fails when the count exceeds 50. The count is intentionally simple: it is a guardrail against unbounded always-on policy growth, not a semantic proof of prompt quality.
