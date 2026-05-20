# pi extensions by mekann

Custom extensions for [pi](https://pi.dev) coding agent.

---

## Extension

### [mekann](./mekann/)

`mekann` は複数の pi 拡張を用途別 suite としてまとめた統合拡張です。

| Suite | Modules |
|-------|---------|
| core | [cache-friendly-prompt](./mekann/core/cache-friendly-prompt/), [agent-guidelines](./mekann/core/agent-guidelines/) |
| safety | [sandbox](./mekann/safety/sandbox/), [plan-mode](./mekann/safety/plan-mode/) |
| autonomy | [goal](./mekann/autonomy/goal/), [subagent](./mekann/autonomy/subagent/), [autoresearch](./mekann/autonomy/autoresearch/) |
| utils | [zip-repo](./mekann/utils/zip-repo/) |
| shared | [prompt-core](./mekann/core/prompt-core/), [policy-core](./mekann/safety/policy-core/) |

`mekann` wrapper がロード順を管理します。特に `sandbox` は `plan-mode` より先に初期化されます。

---

## Modules

### plan-mode

Codex-inspired plan mode — 実装前に考えさせるための読み取り専用モード。

- `/plan` または `Cmd+P` で main ↔ plan をトグル
- Plan mode: read-only（`bash` は読み取り専用 intent のみ UX guard で許可、security は sandbox が担当）
- 計画が `<proposed_plan>` で提示され、main に戻ると実行プロンプトとして注入
- 連続ブロックで段階的に警告を強化するエスカレーション機構
- `pi --plan` で plan mode から起動可能
- main / plan それぞれにモデルと thinking effort を設定・永続化可能

詳細: [plan-mode/README.md](./mekann/safety/plan-mode/README.md)

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

詳細: [sandbox/README.md](./mekann/safety/sandbox/README.md) / [sandbox/SECURITY.md](./mekann/safety/sandbox/SECURITY.md)

### zip-repo

Git リポジトリの作業ツリー現状を ZIP アーカイブし、クリップボードにコピー。

- `/zip` で即座に ZIP 化
- HEAD + 未コミット変更をオーバーレイして作業ツリーの現状そのものを取得
- macOS `osascript` でクリップボードにファイル参照としてコピー

詳細: [zip-repo/README.md](./mekann/utils/zip-repo/README.md)

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
    "/path/to/this/repo/mekann"
  ]
}
```
