# pi extensions by mekann

Custom extensions for [pi](https://pi.dev) coding agent.

## Extensions

### [plan-mode](./plan-mode/)

Codex-inspired plan mode — 実装前に考えさせるための読み取り専用モード。

- `/plan` または `Cmd+P` で main ↔ plan をトグル
- Plan mode: read-only（`bash` は安全なコマンドのみ許可）
- 計画が `<proposed_plan>` で提示され、main に戻ると実行プロンプトとして注入
- 連続ブロックで段階的に警告を強化するエスカレーション機構
- `pi --plan` で plan mode から起動可能
- main / plan それぞれにモデルと thinking effort を設定・永続化可能

```bash
# Install — add to settings.json
{
  "extensions": ["/path/to/this/repo/plan-mode"]
}
```

See [plan-mode/README.md](./plan-mode/README.md) for full documentation.

### [zip-repo](./zip-repo/)

Git リポジトリの作業ツリー現状を ZIP アーカイブし、macOS のクリップボードにコピー。

- `/zip` コマンドで HEAD + 未コミット変更を含む ZIP を作成
- NSPasteboard 経由でファイルとしてクリップボードにコピー（Finder や Slack 等に直接ペースト可能）
- 出力先: リポジトリの親ディレクトリに `{repoName}-{shortHead}.zip`
- macOS only

```bash
# Install — add to settings.json
{
  "extensions": ["/path/to/this/repo/zip-repo"]
}
```

See [zip-repo/README.md](./zip-repo/README.md) for full documentation.
