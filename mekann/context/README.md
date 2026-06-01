# context suite

`context` は **runtime context management** のための suite です。project language を定義する [`CONTEXT.md`](../../CONTEXT.md) とは別物です。

| Feature | 役割 |
|---|---|
| `command-normalization` | 単純な bash command を parse しやすい形へ正規化し、必要な場合だけ normalization log を残す |
| [`output-gate`](./output-gate/) | 大きな raw tool output を外部保存し、検索可能な artifact reference を残す |
| [`context-ledger`](./ledger/) | 決定・タスク・エラー・plan などの作業記憶 event を保存する |

`output-gate` は raw evidence、`context-ledger` は解釈済みの session state を扱います。`command-normalization` は raw output を compact せず、tool command の形を揃える前処理だけを担当します。
