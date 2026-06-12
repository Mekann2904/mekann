# context-ledger

`context-ledger` は、agent session の意味ある working-memory event を保存する runtime context management feature です。

## 記録するもの

- 決定
- タスク
- エラー
- plan
- file / commit / artifact reference
- session snapshot

## 主な tool

- `search_context_events`: decision / task / error / plan などを検索
- `summarize_session_context`: 最新 snapshot を読む、または event から再構築する

## 境界

`context-ledger` は解釈済みの session state を扱います。巨大な raw output の保存と検索は [`output-gate`](../output-gate/) が担当します。
