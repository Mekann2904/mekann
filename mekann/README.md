# mekann

`mekann` は、Mekann の Pi extension suite を安定した順序で読み込む wrapper extension です。

## 読み込む suite

| Suite | Feature |
|---|---|
| [`core`](./core/) | `prompt-core`, `cache-friendly-prompt`, `agent-guidelines` |
| [`safety`](./safety/) | `sandbox`, `plan-mode`, `policy-core` |
| [`autonomy`](./autonomy/) | `goal`, `subagent`, `autoresearch` |
| [`context`](./context/) | `output-gate`, `context-ledger` |
| [`utils`](./utils/) | `zip-repo` |

## 読み込み順の意図

`sandbox` は `plan-mode` より先に初期化します。`plan-mode` は UX-level の計画モードであり、実行制限の hard boundary は `sandbox` が担うためです。

## 使い方

```json
{
  "extensions": ["/path/to/repo/mekann"]
}
```
