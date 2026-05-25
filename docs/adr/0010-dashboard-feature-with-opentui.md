# Dashboard feature uses Pi TUI overlay + kitten icat for rendering

Mekann の `/dashboard` コマンドは Pi TUI overlay 内で動作する human-facing terminal dashboard である。画像描画には `kitten icat --place` を使い、TUI overlay compositor をバイパスする。

## Context

当初は OpenTUI（独立した TUI フレームワーク）を Pi の TTY で直接起動する設計だったが、Pi と OpenTUI の両方が同じ TTY の terminal modes / cursor state / alternate screen を制御しようとして競合が起きた。Pi の TUI overlay 内で dashboard を描画する方針に変更した。

Pi TUI の `Image` コンポーネント（Kitty graphics escape sequence を生成）を使ったところ、overlay compositor の `compositeLineAt` が画像行の後に 130 バイトの padding spaces を追加し、Kitty image cells を上書きして画像が見えなくなるバグを発見した。このため画像配置は `kitten icat --place` で行い、overlay pipeline を完全にバイパスする設計になった。

## Decision

- `/dashboard` は Pi TUI overlay component として描画される
- アバター画像と contribution graph の画像は `kitten icat --place` で配置し、TUI overlay compositor をバイパスする
- テキスト要素（profile, stats, boxes）は通常の TUI overlay rendering で描画する
- OpenTUI / React への依存は削除済み
- CLI テキストモード（`mekann-dashboard --text`）は `render.ts` が担当し、Pi TUI に依存しない

## Module structure

```
dashboard/
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
  cleanup.ts           temp file cleanup
  args.ts              CLI argument parsing
  cli.ts               CLI entry point
```

## Consequences

- OpenTUI / React への依存が不要になった
- Pi TUI overlay compositor の `compositeLineAt` が Kitty image cells を破壊するバグを回避できる
- 画像配置は `kitten icat --place` に依存する（Kitty terminal が必要）
- 非 Kitty 環境では contribution graph がテキストフォールバック表示になる
- GitHub identity and activity are resolved from `gh` CLI first, with `GITHUB_TOKEN` fallback
- Network or authentication failures are shown as panel-level errors

## Supersedes

ADR-0010 (Dashboard feature uses OpenTUI)
