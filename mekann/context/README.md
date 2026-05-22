# context suite

`context` は **runtime context management** のための suite です。project language を定義する [`CONTEXT.md`](../../CONTEXT.md) とは別物です。

| Feature | 役割 |
|---|---|
| [`output-gate`](./output-gate/) | 大きな raw tool output を外部保存し、検索可能な artifact reference を残す |
| [`context-ledger`](./ledger/) | 決定・タスク・エラー・plan などの作業記憶 event を保存する |

`output-gate` は raw evidence、`context-ledger` は解釈済みの session state を扱います。
