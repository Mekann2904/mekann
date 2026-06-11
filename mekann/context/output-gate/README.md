# output-gate

`output-gate` は、大きな raw tool output を inline conversation から外し、検索可能な artifact として保存する runtime context management feature です。

## 何を解決するか

大きな command output をそのまま context window に入れると、推論品質と費用に悪影響が出ます。`output-gate` は raw evidence を保存しつつ、会話には小さな artifact reference だけを残します。

## 主な機能

- 閾値を超える output を artifact file に保存
- manifest に tool 名・byte 数・hash などを記録
- `search_tool_outputs` で artifact を検索
- 必要な snippet だけを再取得
- `bash` artifact は command-aware structured preview を生成し、`ls`/`rg`/`git status`/`git diff`/test/lint などを raw dump ではなく機械的な要約として inline に残す

## 境界

`output-gate` は raw log dump を扱います。決定・タスク・エラーなどの解釈済み event は [`context-ledger`](../ledger/) の責任です。
