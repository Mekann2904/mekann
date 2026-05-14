# Zip Repo Extension

Git リポジトリの作業ツリー現状を ZIP アーカイブし、macOS のクリップボードにコピーする拡張機能。

`git archive` で HEAD のスナップショットを作成し、未コミット変更があれば上書きオーバーレイします。常に**作業ツリーの現状そのもの**が ZIP に入ります。

## Commands

| Command | Description |
|---------|-------------|
| `/zip` | 作業ツリー全体（HEAD + 未コミット変更）を ZIP 化してクリップボードにコピー |

## Behavior

1. `git rev-parse` でリポジトリルートと HEAD を取得
2. `git status --porcelain` で未コミット変更の有無を確認
3. `git archive --format=zip` で HEAD を ZIP 化
4. 未コミット変更（modified / untracked）があれば `overlayDirtyFiles` で ZIP にオーバーレイ
5. `osascript` でクリップボードにファイル参照としてコピー（Finder へのペーストが可能）
6. 一時ファイルを削除

## Output

- 出力先: リポジトリの親ディレクトリに `{repoName}-{shortHead}.zip` として保存
- 前回の ZIP があれば上書き
- 通知にファイルパス・サイズを表示

## Requirements

- **macOS** — クリップボードコピーに `osascript` を使用
- **Git** — リポジトリに少なくとも 1 コミット（HEAD）が必要
- **`/usr/bin/zip`** — 未コミット変更のオーバーレイに使用

## Architecture

```
zip-repo/
├── index.ts      # エントリポイント。コマンド登録、ZIP 作成、クリップボードコピー
├── package.json
└── README.md
```

### Key Functions

| Function | Description |
|----------|-------------|
| `handler` (default export) | `/zip` コマンドのハンドラ。ZIP 作成 → オーバーレイ → コピー → クリーンアップ |
| `overlayDirtyFiles` | 未コミットファイルを `git ls-files -mo` + `zip -u` で ZIP に追加 |

## Error Handling

| Case | Behavior |
|------|----------|
| Git リポジトリではない / コミットなし | エラー通知して終了 |
| ZIP 作成失敗 | エラー通知して終了 |
| クリップボードコピー失敗 | 警告通知。ZIP パスは表示 |
