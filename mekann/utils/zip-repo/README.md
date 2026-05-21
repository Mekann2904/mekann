# zip-repo

Git リポジトリの作業ツリー現状を ZIP アーカイブし、macOS のクリップボードにコピーする拡張機能。

`git archive` で HEAD のスナップショットを作成し、未コミット変更があれば上書きオーバーレイします。常に**作業ツリーの現状そのもの**が ZIP に入ります。

## コマンド

| コマンド | 説明 |
|---|---|
| `/zip` | 作業ツリー全体（HEAD + 未コミット変更）を ZIP 化してクリップボードにコピー |

## 動作

1. `git rev-parse` でリポジトリルートと HEAD を取得
2. `git status --porcelain` で未コミット変更の有無を確認
3. `git archive --format=zip` で HEAD を ZIP 化
4. 未コミット変更があれば `prepareWorktreeZip` で ZIP にオーバーレイ（deleted は `zip -d`、modified は `zip -u`。シンボリックリンク等ディスク上に存在しないファイルはスキップ）
5. `osascript` でクリップボードにファイル参照としてコピー（Finder へのペーストが可能。NSPasteboard 経由で書き込み後に読み戻し検証）
6. 一時ファイルを削除

## 出力

- 出力先: リポジトリの親ディレクトリに `{repoName}-{shortHead}.zip` として保存
- 前回の ZIP があれば上書き
- 通知にファイルパス・サイズを表示

## 必要条件

- **macOS** — クリップボードコピーに `osascript` を使用
- **Git** — リポジトリに少なくとも 1 コミット（HEAD）が必要
- **`/usr/bin/zip`** — 未コミット変更のオーバーレイに使用

## アーキテクチャ

```
zip-repo/
├── index.ts      # エントリポイント。コマンド登録、ZIP 作成、クリップボードコピー
├── package.json
└── README.md
```

### 主要関数

| 関数 | 説明 |
|---|---|
| `handler` (default export) | `/zip` コマンドのハンドラ。ZIP 作成 → オーバーレイ → コピー → クリーンアップ |
| `prepareWorktreeZip` | 未コミットファイルを `git status --porcelain` で deleted/modified に分離。deleted は `zip -d` で削除、modified は `zip -u` で ZIP に追加 |
| `formatFileSize` | バイト数を人間可読に変換（B / KB / MB） |
| `buildZipPath` | ZIP ファイルパスを生成（`{repoName}-{shortHead}.zip`） |
| `escapeAppleScriptPath` | AppleScript 用パスエスケープ |
| `buildClipboardScript` | NSPasteboard 経由でクリップボードにコピーする AppleScript を生成 |
| `parseDirtyFiles` | `git ls-files` の出力からファイルリストをパース |
| `parseGitStatus` | `git status --porcelain` の出力から deleted / modified に分離（rename 対応・quoted path 対応） |

## エラー処理

| ケース | 動作 |
|---|---|
| Git リポジトリではない / コミットなし | エラー通知して終了 |
| ZIP 作成失敗 | エラー通知して終了 |
| クリップボードコピー失敗 | 警告通知。ZIP パスは表示 |
