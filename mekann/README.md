# mekann

`mekann` は、Mekann の Pi extension suite を安定した順序で読み込む wrapper extension です。

## 読み込む suite

| Suite | Feature |
|---|---|
| [`core`](./core/) | `prompt-core`, `cache-friendly-prompt`, `agent-guidelines` |
| [`safety`](./safety/) | `sandbox`, `modes`, `policy-core` |
| [`autonomy`](./autonomy/) | `goal`, `subagent`, `autoresearch` |
| [`context`](./context/) | `output-gate`, `context-ledger` |
| [`utils`](./utils/) | `zip-repo`, `codex-limits`, `dashboard`, `codex-web-search`, `terminal-shortcuts`, `settings-editor` |

## 読み込み順の意図

`sandbox` は `modes` より先に初期化します。`modes` は UX-level のコラボレーションモード管理であり、実行制限の hard boundary は `sandbox` が担うためです。

## 使い方

```json
{
  "extensions": ["/path/to/repo/mekann"]
}
```
