# safety

`safety` は、読み取り専用計画モードと bash 実行サンドボックスに関する機能をまとめたスイートです。

## 機能

| 機能 | 説明 |
|---|---|
| [`sandbox`](./sandbox/) | macOS Seatbelt による bash ツール用サンドボックス |
| [`plan-mode`](./plan-mode/) | 実装前に調査・計画だけを行う読み取り専用モード |
| [`policy-core`](./policy-core/) | sandbox / plan-mode 間で共有するモード定義とコマンド intent 分類 |

## 重要な境界

- `sandbox` は主に bash ツールを制限します。エージェント全体の完全なセキュリティ境界ではありません。
- `plan-mode` の bash intent 判定は UX フィルタです。強制的な実行制限は `sandbox` が担当します。
- 危険な操作や権限緩和は、明示的なユーザー承認を前提にします。
