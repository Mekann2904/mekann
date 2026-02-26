---
title: リファレンス
category: reference
audience: daily-user, developer
last_updated: 2026-02-11
tags: [reference, overview]
related: [../README.md]
---

# リファレンス

> パンくず: [Home](../../README.md) > リファレンス

pi拡張機能コレクションのリファレンスです。

## 目次

- [設定リファレンス](./01-configuration.md) - piと拡張機能の設定
- [データ保存場所](./02-data-storage.md) - 各拡張機能のデータ保存場所
- [トラブルシューティング](./03-troubleshooting.md) - よくある問題と解決策
- [スキルガイド](./skill-guide.md) - 利用可能なスキルの一覧と使用ガイド
- [pi拡張機能リファレンス](./04-pi-extensions.md) - pi公式拡張機能ドキュメント

## プロジェクト哲学

- [プロジェクト哲学](../../philosophy.md) - プロジェクトの価値観、優先順位、禁則

## 設定リファレンス

piと拡張機能の設定に関するリファレンスです。

- [設定リファレンス](./01-configuration.md) - 詳細情報

### 主な設定項目

| 設定項目 | 説明 |
|---------|------|
| `--model` | 使用するモデル |
| `--provider` | プロバイダー |
| `--thinking` | 思考レベル |

## データ保存場所

各拡張機能が使用するデータ保存場所の一覧です。

- [データ保存場所](./02-data-storage.md) - 詳細情報

### 拡張機能別データ保存場所

| 拡張機能 | 保存場所 |
|---------|---------|
| plan_* | `.pi/plans/` |
| subagent_* | `.pi/subagents/` |
| agent_team_* | `.pi/agent-teams/` |
| loop_run | `.pi/agent-loop/` |
| usage-tracker | `~/.pi/extensions/usage-cache.json` |
| agent-usage-tracker | `.pi/analytics/` |
| abbr | `.pi/abbreviations.json` |

## トラブルシューティング

よくある問題と解決策です。

- [トラブルシューティング](./03-troubleshooting.md) - 詳細情報

### 主な問題カテゴリ

| カテゴリ | 例 |
|---------|-----|
| インストール | piが見つからない |
| 拡張機能 | 拡張機能が読み込まれない |
| 実行 | subagentが失敗する、loop_runが失敗する |
| パフォーマンス | 実行が遅い、APIレート制限エラー |
| データ | データが失われた、データが破損している |

## 次のステップ

- [設定リファレンス](./01-configuration.md) - 設定リファレンス
- [データ保存場所](./02-data-storage.md) - データ保存場所
- [トラブルシューティング](./03-troubleshooting.md) - トラブルシューティング
- [スキルガイド](./skill-guide.md) - スキルガイド
- [pi拡張機能リファレンス](./04-pi-extensions.md) - pi公式拡張機能ドキュメント

---

## 関連トピック

- [Getting Started](../01-getting-started/) - インストールと初回使用
- [User Guide](../02-user-guide/) - ユーザーガイド
- [Developer Guide](../03-development/) - 開発者ガイド

## 次のトピック

[ → 設定リファレンス](./01-configuration.md)
[ → スキルガイド](./skill-guide.md)
[ → pi拡張機能リファレンス](./04-pi-extensions.md)
