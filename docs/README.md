---
title: ドキュメント
category: meta
audience: new-user, daily-user, developer, contributor
last_updated: 2026-02-17
tags: [documentation, index]
related: []
---

# ドキュメント

pi拡張機能コレクションのドキュメントへようこそ。

## あなたは誰ですか？

### [完了] 新規ユーザー
[Getting Started](./01-getting-started/)から始めてください。インストールと基本的な使い方を学べます。

### [doc] 日常ユーザー
[User Guide](./02-user-guide/)を参照してください。各拡張機能の詳細な使い方が記載されています。

### [config] 開発者
[Developer Guide](./03-development/)を確認してください。拡張機能の開発方法とAPIリファレンスがあります。

## クイックナビゲーション

### ユーザーガイド

| トピック | 説明 | ステータス |
|---------|------|---------|
| [拡張機能一覧](./02-user-guide/01-extensions.md) | すべての拡張機能の概要 | [完了] 完了 |
| [question](./02-user-guide/02-question.md) | インタラクティブUIでユーザー選択 | [完了] 完了 |

| [loop_run](./02-user-guide/04-loop-run.md) | 自律ループ実行 | [完了] 完了 |
| [fzf](./02-user-guide/05-fzf.md) | Fuzzy finder統合 | [完了] 完了 |
| [abbr](./02-user-guide/06-abbr.md) | 略語管理 | [完了] 完了 |
| [plan_***](./02-user-guide/07-plan.md) | 計画管理とタスク追跡 | [完了] 完了 |
| [subagents](./02-user-guide/08-subagents.md) | サブエージェント | [完了] 完了 |
| [agent-teams](./02-user-guide/09-agent-teams.md) | エージェントチーム | [完了] 完了 |
| [ul-dual-mode](./02-user-guide/10-ul-dual-mode.md) | デュアルモード | [完了] 完了 |
| [ユーティリティ](./02-user-guide/11-utilities.md) | kitty統合などのユーティリティ | [完了] 完了 |
| [cross-instance-runtime](./02-user-guide/12-cross-instance-runtime.md) | クロスインスタンス協調・レート制限 | [完了] 完了 |
| [search-tools](./02-user-guide/13-search-tools.md) | 高速検索ツール群 | [完了] 完了 |

### 開発者ガイド

| トピック | 説明 | ステータス |
|---------|------|---------|
| [Getting Started](./03-development/01-getting-started.md) | 開発環境セットアップ | [完了] 完了 |
| [APIリファレンス](./03-development/03-api-reference.md) | APIの完全なリファレンス | [注意] 準備中 |
| [テスト](./03-development/04-testing.md) | テストガイド | [準備中] |
| [貢献方法](./03-development/05-contributing.md) | 貢献の手順 | [準備中] |

### リファレンス

| トピック | 説明 |
|---------|------|
| [設定](./04-reference/01-configuration.md) | 環境変数と設定ファイル |
| [データストレージ](./04-reference/02-data-storage.md) | データ保存場所と形式 |
| [トラブルシューティング](./04-reference/03-troubleshooting.md) | よくある問題と解決策 |
| [pi拡張機能リファレンス](./04-reference/04-pi-extensions.md) | pi公式拡張機能ドキュメント |

### コードレビューレポート

| トピック | 説明 |
|---------|------|
| [インデックス](./06-code-review-report/README.md) | コードレビューレポート トップ |
| [レビューサマリー](./06-code-review-report/01-summary.md) | 全体評価と品質スコア |
| [アーキテクチャ図](./06-code-review-report/02-architecture-diagram.md) | Mermaid図による可視化 |
| [判断基準フロー](./06-code-review-report/03-decision-flow.md) | 開発時の意思決定基準 |
| [改善推奨事項](./06-code-review-report/04-recommendations.md) | 優先度別改善項目 |

### 追加ドキュメント

| トピック | 説明 |
|---------|------|
| [ユーティリティ](./02-user-guide/11-utilities.md) | kitty統合などのユーティリティ |
| [開発ワークフロー](./05-meta/04-development-workflow.md) | AIエージェントによるドキュメント管理 |
| [パッチ管理](./patches/README.md) | patch-packageによる依存パッケージ修正 |
| [シーケンス図集](./subagents-agent-teams-sequence-diagrams.md) | 実行フローの詳細可視化 |

## 最近更新されたドキュメント

- 2026-02-17: コードレビュー統合レポートを追加（06-code-review-report/）
- 2026-02-11: ドキュメント構造を再編成、README.md更新
- 各ドキュメントの最終更新日を確認してください

---

## ドキュメント構造について

このドキュメントは**Deepwikiスタイル**で構成されています：

- **読者別パス**: 新規ユーザー、日常ユーザー、開発者、貢献者に最適化されたナビゲーション
- **最大3レベル**: 認知負荷を最小限に抑えた階層構造
- **パンくずリスト**: 現在位置を常に表示
- **関連トピック**: 各ページ末尾に関連ドキュメントへのリンク

詳しくは [Documentation Policy](./05-meta/02-documentation-policy.md) を参照してください。
