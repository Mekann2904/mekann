# safety suite

`safety` は、高い自律性を許容するための safety guardrail を提供する suite です。

| Feature | 役割 |
|---|---|
| [`sandbox`](./sandbox/) | `bash` tool の実行を OS-level policy で制限する hard runtime boundary |
| [`modes`](./modes/) | コラボレーションモード（main / read_only / auto / sub）の管理 |
| [`policy-core`](./policy-core/) | policy 判定に使う共通の小さな型・補助処理 |

`modes` は sandbox ではありません。実行制限の hard boundary は `sandbox` です。
