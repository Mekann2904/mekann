---
title: データ保存場所
category: reference
audience: daily-user, developer
last_updated: 2026-02-12
tags: [reference, storage]
related: [./01-configuration.md, ./03-troubleshooting.md]
---

# データ保存場所

> パンくず: [Home](../../README.md) > [Reference](./) > データ保存場所

各拡張機能が使用するデータ保存場所の一覧です。

## 拡張機能別データ保存場所

### plan_* - 計画管理

| パス | 用途 |
|------|------|
| `.pi/plans/storage.json` | 計画データの保存 |

### subagent_* - サブエージェント

| パス | 用途 |
|------|------|
| `.pi/subagents/storage.json` | サブエージェント定義と履歴 |
| `.pi/subagents/runs/` | 各実行結果のログ |

### agent_team_* - エージェントチーム

| パス | 用途 |
|------|------|
| `.pi/agent-teams/storage.json` | エージェントチーム定義と履歴 |
| `.pi/agent-teams/runs/` | 各実行結果のログ |

### loop_run - 自律ループ

| パス | 用途 |
|------|------|
| `.pi/agent-loop/` | ループ実行ログ |
| `.pi/agent-loop/latest-summary.json` | 最新の実行サマリー |

### usage-tracker - 使用状況追跡

| パス | 用途 |
|------|------|
| `~/.pi/extensions/usage-cache.json` | LLM使用状況キャッシュ |

### agent-usage-tracker - エージェント使用統計

| パス | 用途 |
|------|------|
| `.pi/analytics/agent-usage-stats.json` | エージェント使用統計 |

### abbr - 略語管理

| パス | 用途 |
|------|------|
| `~/.pi/abbr.json` | 略語（エイリアス）定義 |

## データのバックアップと復元

### バックアップ

```bash
# .piディレクトリ全体をバックアップ
cp -r .pi .pi.backup

# 特定の拡張機能データのみをバックアップ
cp -r .pi/plans .pi.plans.backup
```

### 復元

```bash
# バックアップから復元
rm -rf .pi
cp -r .pi.backup .pi
```

## データの削除

### 特定の拡張機能データを削除

```bash
# plan_*のデータを削除
rm -rf .pi/plans

# subagent_*のデータを削除
rm -rf .pi/subagents
```

### 全データを削除

```bash
rm -rf .pi
```

**注意**: データを削除すると、計画、履歴、統計などが失われます。

---

## 関連トピック

- [設定リファレンス](./01-configuration.md) - 設定リファレンス
- [トラブルシューティング](./03-troubleshooting.md) - トラブルシューティング

## 次のトピック

[ → トラブルシューティング](./03-troubleshooting.md)
