# mekann

`mekann` は、Mekann の Pi extension suite を安定した順序で読み込む wrapper extension です。

## 読み込む suite

各 suite の loader（[`core/index.ts`](./core/index.ts), [`safety/index.ts`](./safety/index.ts), [`autonomy/index.ts`](./autonomy/index.ts), [`context/index.ts`](./context/index.ts), [`utils/index.ts`](./utils/index.ts)）が feature 読み込みの single source of truth です。下表はこれらの loader と同期しています。feature の詳細は各 suite の README を参照してください。loader が直接読み込まない共有モジュール（`prompt-core`, `policy-core` など）はここでは省略し、各 suite README に記載しています。

| Suite | 読み込む feature |
|---|---|
| [`core`](./core/) | `cache-friendly-prompt`, `agent-guidelines`, `model-optimizer` |
| [`safety`](./safety/) | `sandbox`, `modes`, `git-safety` |
| [`autonomy`](./autonomy/) | `goal`, `subagent`, `review-fixer`, `autoresearch` |
| [`context`](./context/) | `context-tracker`, `command-normalization`, `output-gate`, `context-ledger`, `cacheable-context` |
| [`utils`](./utils/) | `zip-repo`, `codex-limits`, `codex-web-search`, `dashboard`, `terminal-shortcuts`, `settings-editor`, `startup-clear`, `issue-worktree`, `issue-orchestration`, `issue-workflow`, `voice-notify`, `pr-workflow`, `verify`, `review-quality` |

ほとんどの feature は `mekann.json` で個別に `enabled: false` で無効化でき、未設定は enabled 扱いで読み込まれます。例外として、`core` suite（`cache-friendly-prompt`, `agent-guidelines`, `model-optimizer`）と `startup-clear` はフラグによらず常に読み込まれ、`autoresearch` は明示的な `enabled: true` が必要です。

## 読み込み順の意図

`sandbox` は `modes` より先に初期化します。`modes` は UX-level のコラボレーションモード管理であり、実行制限の hard boundary は `sandbox` が担うためです。

## 使い方

```json
{
  "extensions": ["/path/to/repo/mekann"]
}
```
