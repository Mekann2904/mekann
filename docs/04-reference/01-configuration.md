---
title: 設定リファレンス
category: reference
audience: daily-user, developer
last_updated: 2026-02-11
tags: [reference, configuration]
related: [./02-data-storage.md]
---

# 設定リファレンス

> パンくず: [Home](../../README.md) > [Reference](./) > 設定リファレンス

pi拡張機能コレクションの設定リファレンスです。

## piの設定

### モデル設定

```bash
pi --model gpt-4o-mini --provider openai
```

### 思考レベル設定

```bash
pi --thinking low|medium|high
```

## 拡張機能の設定

### データ保存場所

各拡張機能は以下の場所にデータを保存します：

| ディレクトリ/ファイル | 用途 | 拡張機能 |
|------------------|------|---------|
| `.pi/plans/storage.json` | 計画データの保存 | plan_* |
| `.pi/subagents/storage.json` | サブエージェント定義と履歴 | subagent_* |
| `.pi/subagents/runs/` | 各実行結果のログ | subagent_* |
| `.pi/agent-teams/storage.json` | エージェントチーム定義と履歴 | agent_team_* |
| `.pi/agent-teams/runs/` | 各実行結果のログ | agent_team_* |
| `.pi/agent-loop/` | ループ実行ログ | loop_run |
| `.pi/agent-loop/latest-summary.json` | 最新の実行サマリー | loop_run |
| `.pi/analytics/agent-usage-stats.json` | エージェント使用統計 | agent-usage-tracker |
| `~/.pi/extensions/usage-cache.json` | LLM使用状況キャッシュ | usage-tracker |
| `.pi/abbreviations.json` | 略語（エイリアス）定義 | abbr |

### 詳細情報

各拡張機能のデータ保存の詳細については、[データ保存場所](./02-data-storage.md)を参照してください。

---

## 関連トピック

- [データ保存場所](./02-data-storage.md) - 各拡張機能のデータ保存場所
- [APIリファレンス](../03-development/03-api-reference.md) - APIリファレンス

## 次のトピック

[ → データ保存場所](./02-data-storage.md)
