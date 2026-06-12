# dashboard

`dashboard` は `/dashboard` コマンドから Pi TUI overlay 内で起動される human-facing dashboard feature です。

## 起動

```bash
/dashboard           # Pi 内で起動
mekann-dashboard     # CLI テキスト出力（default）
mekann-dashboard --cwd /path/to/repo
mekann-dashboard --no-avatar
mekann-dashboard --text
```

`/dashboard` は Pi TUI overlay component として表示されます。画像（avatar, contribution graph）は `kitten icat --place` で配置し、TUI overlay compositor をバイパスします。

`mekann-dashboard` は package `bin` として公開される text CLI です。OpenTUI interactive mode は削除済みのため、interactive dashboard は Pi 内の `/dashboard` を使います。

## アーキテクチャ

```
terminal.ts          ANSI colors + string width utilities (shared)
layout.ts            box/padEnd/contribution text (shared)
data.ts              data collection + image file management
pi-component.ts      Pi Component class + extension registration
render.ts            CLI text rendering
view-model.ts        types (DashboardViewModel / CliDashboardViewModel)
avatar.ts            image fetch + kitten icat placement
contribution-image.ts SVG/PNG generation
github.ts            GitHub GraphQL API
current-repo.ts      git repo info
```

## MVP vertical slice

- GitHub profile を `gh api graphql` で取得し、失敗時は `GITHUB_TOKEN` に fallback
- Avatar 画像を Kitty terminal に表示（非 Kitty 環境では省略）
- Contribution graph を PNG で生成し Kitty terminal に表示（テキストフォールバックあり）
- Activity summary（contributions, PRs, issues, reviews）
- Current repo の branch / staged / unstaged / untracked / ahead-behind / latest commit
