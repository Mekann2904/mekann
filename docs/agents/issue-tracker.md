# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues in `Mekann2904/mekann`. Use the `gh` CLI for all operations.

## Conventions

- **Dependencies**: use GitHub's official issue dependency relationships (`blocked by` / `blocking`) as the source of truth. Markdown text such as `Depends on #123` may be used only as explanatory prose; agents must not treat it as authoritative dependency data.
- **Starting issue work**: prefer `/issue` or `mekann-issue` so issue worktrees and dependency checks are applied. Do not start work on an issue while it is blocked by open issues.
- **Issue branches/worktrees**: use `issue-<number>` for issue-specific branches and worktrees.
- **PRs**: tie each PR to its issue. Do not mark a PR ready while the issue is still blocked. If stacked PRs are necessary, make the base branch and dependency relationship explicit in the PR description, and retarget/rebase onto the main branch after blockers merge.
- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v` — `gh` does this automatically when run inside a clone.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.
