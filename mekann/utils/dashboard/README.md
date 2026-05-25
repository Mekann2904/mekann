# dashboard

`dashboard` は `/dashboard` command から Pi TUI 内で起動される human-facing dashboard feature です。OpenTUI 版 CLI は standalone/debug 用として残しています。

## 起動

```bash
/dashboard

# standalone/debug only
mekann-dashboard
mekann-dashboard --cwd /path/to/repo
mekann-dashboard --no-avatar
```

`/dashboard` は Pi TUI component として表示されます。Pi の current TTY を OpenTUI に渡す pass-through 起動は、Pi TUI の scroll/input state と競合するため使いません。

## MVP vertical slice

現在の slice は以下を提供します。

- GitHub profile を `gh api graphql` で取得し、失敗時は `GITHUB_TOKEN` に fallback
- current repo の branch / staged / unstaged / untracked / ahead-behind / latest commit を表示
- contribution graph / activity summary / Codex usage は次 slice 用 placeholder

Standalone/debug 用の OpenTUI CLI は現時点で Bun ベースのため、`mekann-dashboard` wrapper は `bun` を起動します。
