# pi extensions by mekann

Custom extensions for [pi](https://pi.dev) coding agent.

---

## Extensions

| Extension | Description |
|-----------|-------------|
| [policy-core](./policy-core/) | `read_only` / bash 制限 / capability 語彙の共通定義 |
| [plan-mode](./plan-mode/) | 実装前の読み取り専用プランニングモード |
| [sandbox](./sandbox/) | macOS Seatbelt による bash コマンドサンドボックス |
| [zip-repo](./zip-repo/) | 作業ツリーを ZIP 化してクリップボードにコピー |
| [subagent](./subagent/) | バックグラウンドサブエージェントの管理 |
| [autoresearch](./autoresearch/) | 自律的実験ループ（パフォーマンス最適化など） |
| [goal](./goal/) | 永続的なスレッドローカル goal（アイドル時自動継続・予算管理） |

---

### plan-mode

Codex-inspired plan mode — 実装前に考えさせるための読み取り専用モード。

- `/plan` または `Cmd+P` で main ↔ plan をトグル
- Plan mode: read-only（`bash` は読み取り専用 intent のみ UX guard で許可、security は sandbox が担当）
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
- `workspace_write`（サンドボックスあり）は明示指定のみ
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

### subagent

バックグラウンドサブエージェントの管理拡張機能。

### autoresearch

自律的実験ループ — コード変更が指標に与える影響を自動測定・記録・管理する。

- `/autoresearch <目的>` または `/autoresearch on` で開始
- `autoresearch_evaluate_query` / `autoresearch_init` / `autoresearch_run` / `autoresearch_log` の4ツールを提供
- `keep` は自動 git commit、`discard` / `crash` / `checks_failed` は自動 revert
- `autoresearch.checks.sh` で正確性チェック（テスト・型チェック等）を自動実行
- **最小構成**: finalize / hooks / ダッシュボード / compaction / confidence score / auto-resume は未移植

#### autoresearch-create skill

`autoresearch-create` skill により、ユーザーが「autoresearchして」と頼んだときに、目的・指標・コマンドを整理して実験ループを自動開始できる。エージェントが skill を読み込み、`autoresearch.md` と `autoresearch.sh` の作成から実験ループの実行までを自律的に行う。

### goal

Codex-inspired goal 機能 — thread/session に紐づく永続的な objective を設定し、アイドル時に agent が自律継続する。

- `/goal <objective>` で goal を設定（`--budget <n>` でトークン予算指定可能）
- `/goal` で status/objective/usage/budget を表示
- `/goal edit` で objective を編集
- `/goal pause` / `/goal resume` で一時停止・再開
- `/goal clear` で削除
- `/goal budget <n|none>` で予算設定
- active goal がある状態で agent が idle になると自動 continuation
- token budget 到達時に `budget_limited` に移行し、agent は勝手に作業を続けない
- plan mode 中は continuation を抑制
- model は `update_goal(status="complete")` のみ実行可能
- `get_goal` / `create_goal` / `update_goal` の3ツールを提供

---

## Install

`~/.pi/agent/settings.json` の `extensions` にパスを追加:

```json
{
  "extensions": [
    "/path/to/this/repo/plan-mode",
    "/path/to/this/repo/sandbox",
    "/path/to/this/repo/zip-repo",
    "/path/to/this/repo/autoresearch",
    "/path/to/this/repo/subagent",
    "/path/to/this/repo/goal"
  ]
}
```
