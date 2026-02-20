---
title: ユーザーガイド
category: user-guide
audience: daily-user
last_updated: 2026-02-14
tags: [user-guide, overview]
related: [../README.md, ./01-extensions.md]
---

# ユーザーガイド

> パンくず: [Home](../../README.md) > ユーザーガイド

pi拡張機能コレクションのユーザーガイドです。

## 目次

- [拡張機能一覧](./01-extensions.md) - 利用可能なすべての拡張機能
- [コア拡張機能](#コア拡張機能) - question, loop_run, fzf, abbr
- [オーケストレーション](#オーケストレーション) - plan, subagents, agent-teams
- [ユーティリティ](#ユーティリティ) - 使用状況の追跡、統計

## コア拡張機能

| 拡張機能 | 説明 | ドキュメント |
|---------|------|------|
| **question** | インタラクティブUIでユーザー選択 | [→](./02-question.md) |

| **loop_run** | 自律ループ実行 | [→](./04-loop-run.md) 必須 |
| **fzf** | Fuzzy finder統合 | [→](./05-fzf.md) 必須 |
| **abbr** | 略語管理 | [→](./06-abbr.md) 必須 |

## オーケストレーション

| 拡張機能 | 説明 | ドキュメント |
|---------|------|------|
| **plan_*** | 計画管理とタスク追跡 | [→](./07-plan.md) 必須 |
| **subagent_*** | サブエージェント | [→](./08-subagents.md) 必須 |
| **agent_team_*** | エージェントチーム | [→](./09-agent-teams.md) 必須 |
| **ul-dual-mode** | デュアルモード強制実行 | [→](./10-ul-dual-mode.md) 必須 |

## ユーティリティ

| 拡張機能 | 説明 | ドキュメント |
|---------|------|------|
| **usage-tracker** | LLM使用状況の追跡 | [→](./11-utilities.md) |
| **agent-usage-tracker** | 拡張機能の使用統計 | [→](./11-utilities.md) |
| **context-dashboard** | コンテキスト使用量ダッシュボード | [→](./11-utilities.md) |
| **agent-idle-indicator** | エージェント実行状態の表示 | [→](./11-utilities.md) |
| **kitty-status-integration** | kittyターミナル連携 | [→](./11-utilities.md) |
| **skill-inspector** | スキル割り当て状況の表示 | [→](./11-utilities.md) |

## システム管理

| 拡張機能 | 説明 | ドキュメント |
|---------|------|------|
| **cross-instance-runtime** | クロスインスタンス協調・レート制限 | [→](./12-cross-instance-runtime.md) |
| **invariant-pipeline** | インバリアント生成パイプライン | [→](./14-invariant-pipeline.md) |
| **search-tools** | 高速検索ツール群 | [→](./15-search-tools.md) |

## クイックスタート

まだpi拡張機能コレクションをインストールしていない場合は、[Getting Started](../01-getting-started/)を参照してください。

## 次のステップ

- [拡張機能一覧](./01-extensions.md) - すべての拡張機能を確認
- [Getting Started](../01-getting-started/) - インストールと初回使用

---

## 関連トピック

- [Getting Started](../01-getting-started/) - インストールと初回使用
- [Developer Guide](../03-development/) - 開発者ガイド

## 次のトピック

[ → 拡張機能一覧](./01-extensions.md)
