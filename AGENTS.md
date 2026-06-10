# Agent instructions

## Agent skills

### Issue tracker

Issues and PRDs are tracked in GitHub Issues for `Mekann2904/mekann`. See `docs/agents/issue-tracker.md`.

### Issue / PR workflow

When starting work from an issue, treat GitHub's official issue dependency relationships as authoritative. Do not begin an issue that is blocked by open issues. Prefer the `/issue` command or `mekann-issue` so the dependency gate and issue worktree conventions are applied consistently.

Use `issue-<number>` branches/worktrees for issue work. Keep PRs tied to their issue, and do not open or mark a PR ready if the underlying issue is still blocked. If an issue depends on another issue, merge the blocking issue first; use stacked PRs only when explicitly needed and make the base branch relationship clear in the PR description.

### Triage labels

This repo uses the default engineering-skill triage labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Proactive review suggestions

コードの変更が一定規模を超えた場合、実装完了後、またはユーザがレビューを求めていそうな場面では、積極的に `thermo-nuclear-code-quality-review` スキルの使用を提案すること。ユーザが明示的にレビューを依頼していない場合でも、変更の重要度や複雑さからレビューが有益だと判断できる場合は、自らレビューを実施するかスキルの使用を勧めること。

### Domain docs

This repo uses a single-context domain docs layout: root `CONTEXT.md` plus ADRs in `docs/adr/`. See `docs/agents/domain.md`.
