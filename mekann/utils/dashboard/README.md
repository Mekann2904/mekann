# dashboard

`dashboard` は `/dashboard` terminal shortcut から起動される OpenTUI ベースの human-facing dashboard feature です。

## 起動

```bash
mekann-dashboard
mekann-dashboard --cwd /path/to/repo
mekann-dashboard --no-avatar
```

`/dashboard` は `terminal-shortcuts` の built-in shortcut として `mekann-dashboard` を起動します。既定は pass-through で、既存の `MEKANN_TERMINAL_SPLIT_SHORTCUTS` 設定により Kitty split 起動も選べます。

## MVP vertical slice

現在の slice は以下を提供します。

- GitHub profile を `gh api graphql` で取得し、失敗時は `GITHUB_TOKEN` に fallback
- current repo の branch / staged / unstaged / untracked / ahead-behind / latest commit を表示
- contribution graph / activity summary / Codex usage は次 slice 用 placeholder

OpenTUI は現時点で Bun ベースのため、`mekann-dashboard` wrapper は `bun` を起動します。
