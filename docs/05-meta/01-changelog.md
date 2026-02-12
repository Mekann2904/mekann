---
title: 変更履歴
category: meta
audience: new-user, daily-user, developer, contributor
last_updated: 2026-02-11
tags: [changelog]
related: [../../CHANGELOG.md]
---

# 変更履歴

> パンくず: [Home](../../README.md) > [Meta](./) > 変更履歴

pi拡張機能コレクションの詳細な変更履歴です。

> **注**: ルートの [CHANGELOG.md](../../CHANGELOG.md) は簡潔版です。ここには詳細な変更記録が含まれています。

## [未公開] - 2026-02-11

### 追加
- **Deepwikiスタイルのドキュメント構造**: ユーザー、開発者、貢献者別のナビゲーションパス
- **読者別パス**: 新規ユーザー、日常ユーザー、開発者、貢献者向けのエントリーポイント
- **パンくずリスト**: 各ページに現在位置を表示
- **関連トピック**: 各ページ末尾に関連ドキュメントへのリンク
- **メタデータ標準**: YAMLフロントマター形式の標準化

### 変更
- **README.md**: ポータル化（500行以内に短縮）
- **docs/README.md**: リッチなナビゲーションを追加
- **ドキュメント構造**: 3レベルの階層構造に再編

### ドキュメントの移動
- インストールガイド → `docs/01-getting-started/02-installation.md`
- クイックスタート → `docs/01-getting-started/01-quick-start.md`
- 初回ステップ → `docs/01-getting-started/03-first-steps.md`
- 拡張機能一覧 → `docs/02-user-guide/01-extensions.md`
- question詳細 → `docs/02-user-guide/02-question.md`
- rsa_solve詳細 → `docs/02-user-guide/03-rsa-solve.md`
- 開発者ガイド → `docs/03-development/01-getting-started.md`

---

## [v0.1.0] - 2026-02-10

### 初期リリース

#### コア拡張機能
- **question**: インタラクティブUIでユーザー選択
- **rsa_solve**: 推論スケーリング
- **loop_run**: 自律ループ実行
- **fzf**: Fuzzy finder統合
- **abbr**: 略語管理

#### オーケストレーション
- **plan_***: 計画管理とタスク追跡
- **subagent_***: サブエージェント
- **agent_team_***: エージェントチーム
- **ul-dual-mode**: デュアルモード強制実行

#### ユーティリティ
- **usage-tracker**: LLM使用状況の追跡
- **agent-usage-tracker**: 拡張機能の使用統計
- **context-dashboard**: コンテキスト使用量ダッシュボード
- **agent-idle-indicator**: エージェント実行状態の表示
- **kitty-status-integration**: kittyターミナル連携

---

## バージョン命名規則

- **Major**: 破壊的な変更
- **Minor**: 新機能の追加
- **Patch**: バグ修正

---

## 関連トピック

- [Documentation Policy](./02-documentation-policy.md) - ドキュメント管理方針
- [Roadmap](./03-roadmap.md) - ロードマップ
