# pi extensions by mekann

Custom extensions for [pi](https://pi.dev) coding agent.

---

## Extensions

| Extension | Description |
|-----------|-------------|
| [plan-mode](./plan-mode/) | 実装前の読み取り専用プランニングモード |
| [sandbox](./sandbox/) | macOS Seatbelt による bash コマンドサンドボックス |
| [zip-repo](./zip-repo/) | 作業ツリーを ZIP 化してクリップボードにコピー |

---

### plan-mode

Codex-inspired plan mode — 実装前に考えさせるための読み取り専用モード。

- `/plan` または `Cmd+P` で main ↔ plan をトグル
- Plan mode: read-only（`bash` は安全なコマンドのみ許可）
- 計画が `<proposed_plan>` で提示され、main に戻ると実行プロンプトとして注入
- 連続ブロックで段階的に警告を強化するエスカレーション機構
- `pi --plan` で plan mode から起動可能
- main / plan それぞれにモデルと thinking effort を設定・永続化可能

詳細: [plan-mode/README.md](./plan-mode/README.md)

### sandbox

macOS Seatbelt による bash ツール用サンドボックス。

**注意: bash ツールのみが対象。エージェント全体のサンドボックスではない。**

- 3 段階のモード: `read_only` / `workspace_write` / `yolo`
- デフォルト: `yolo`（サンドボックスなし）
- `/sandbox [mode]` でモード表示・変更（Tab で補完）
- `request_elevation` ツール: ブロック時に一時的な権限昇格をリクエスト可能
- default deny: 必要な許可だけを明示的に付与
- 環境変数は allowlist 方式（secret は子プロセスに渡さない）
- Isolated HOME / Bash startup files 無効化

詳細: [sandbox/README.md](./sandbox/README.md) / [sandbox/SECURITY.md](./sandbox/SECURITY.md)

### zip-repo

Git リポジトリの作業ツリー現状を ZIP アーカイブし、クリップボードにコピー。

- `/zip` で即座に ZIP 化
- HEAD + 未コミット変更をオーバーレイして作業ツリーの現状そのものを取得
- macOS `osascript` でクリップボードにファイル参照としてコピー

詳細: [zip-repo/README.md](./zip-repo/README.md)

---

## Install

`~/.pi/agent/settings.json` の `extensions` にパスを追加:

```json
{
  "extensions": [
    "/path/to/this/repo/plan-mode",
    "/path/to/this/repo/sandbox",
    "/path/to/this/repo/zip-repo"
  ]
}
```
