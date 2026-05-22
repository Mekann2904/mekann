# safety suite

`safety` は、高い自律性を許容するための safety guardrail を提供する suite です。

| Feature | 役割 |
|---|---|
| [`sandbox`](./sandbox/) | `bash` tool の実行を OS-level policy で制限する hard runtime boundary |
| [`plan-mode`](./plan-mode/) | 実装前に read-only 調査と計画を行う UX-level collaboration mode |
| [`policy-core`](./policy-core/) | policy 判定に使う共通の小さな型・補助処理 |

`plan-mode` は sandbox ではありません。実行制限の hard boundary は `sandbox` です。
