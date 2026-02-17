---
title: Lib ドキュメント
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated, lib, api]
related: [../README.md]
---

# Lib ドキュメント

このフォルダには`.pi/lib/`のTypeScriptファイルから自動生成されたドキュメントが含まれます。

## カテゴリ別一覧

### エージェント関連

| ファイル | 説明 |
|---------|------|
| [agent.ts.md](agent.ts.md) | エージェントモジュール集約 |
| [agent-common.ts.md](agent-common.ts.md) | 共有定数と出力正規化 |
| [agent-errors.ts.md](agent-errors.ts.md) | エラー分類とリトライ判断 |
| [agent-types.ts.md](agent-types.ts.md) | コア型定義 |
| [agent-utils.ts.md](agent-utils.ts.md) | エージェントユーティリティ |
| [subagent-types.ts.md](subagent-types.ts.md) | サブエージェント型定義 |
| [team-types.ts.md](team-types.ts.md) | チーム型定義 |

### 並列処理・スケジューリング

| ファイル | 説明 |
|---------|------|
| [concurrency.ts.md](concurrency.ts.md) | 並列実行制限付きワーカープール |
| [dynamic-parallelism.ts.md](dynamic-parallelism.ts.md) | 動的並列度調整 |
| [priority-scheduler.ts.md](priority-scheduler.ts.md) | 優先度ベースタスクスケジューリング |
| [task-dependencies.ts.md](task-dependencies.ts.md) | DAGベースタスク依存グラフ |
| [task-scheduler.ts.md](task-scheduler.ts.md) | イベント駆動タスクスケジューラ |

### レート制限・コスト管理

| ファイル | 説明 |
|---------|------|
| [adaptive-penalty.ts.md](adaptive-penalty.ts.md) | 適応的ペナルティコントローラ |
| [adaptive-rate-controller.ts.md](adaptive-rate-controller.ts.md) | レート制限学習と予測スケジューリング |
| [cost-estimator.ts.md](cost-estimator.ts.md) | タスクコスト推定 |
| [provider-limits.ts.md](provider-limits.ts.md) | プロバイダ/モデル別レート制限 |
| [token-bucket.ts.md](token-bucket.ts.md) | トークンバケットレートリミッター |
| [unified-limit-resolver.ts.md](unified-limit-resolver.ts.md) | 統合制限リゾルバー |

### ログ・モニタリング

| ファイル | 説明 |
|---------|------|
| [comprehensive-logger.ts.md](comprehensive-logger.ts.md) | 包括的ログ機能 |
| [comprehensive-logger-config.ts.md](comprehensive-logger-config.ts.md) | ログ設定 |
| [comprehensive-logger-types.ts.md](comprehensive-logger-types.ts.md) | ログ型定義 |
| [structured-logger.ts.md](structured-logger.ts.md) | 構造化ログ |
| [metrics-collector.ts.md](metrics-collector.ts.md) | メトリクス収集 |
| [live-monitor-base.ts.md](live-monitor-base.ts.md) | ライブモニターベース |
| [live-view-utils.ts.md](live-view-utils.ts.md) | ライブビューユーティリティ |

### ストレージ・永続化

| ファイル | 説明 |
|---------|------|
| [storage-base.ts.md](storage-base.ts.md) | ストレージベースパターン |
| [storage-lock.ts.md](storage-lock.ts.md) | ファイルロックとアトミック書き込み |
| [storage.ts.md](storage.ts.md) | ストレージモジュール集約 |
| [run-index.ts.md](run-index.ts.md) | 実行インデックス管理 |
| [checkpoint-manager.ts.md](checkpoint-manager.ts.md) | タスク状態永続化 |

### エラー・検証

| ファイル | 説明 |
|---------|------|
| [errors.ts.md](errors.ts.md) | エラークラス定義 |
| [error-utils.ts.md](error-utils.ts.md) | エラーユーティリティ |
| [runtime-error-builders.ts.md](runtime-error-builders.ts.md) | ランタイムエラービルダー |
| [validation-utils.ts.md](validation-utils.ts.md) | バリデーションユーティリティ |
| [output-validation.ts.md](output-validation.ts.md) | 出力検証 |
| [verification-workflow.ts.md](verification-workflow.ts.md) | Inspector/Challenger検証メカニズム |

### コンテキスト・セマンティック

| ファイル | 説明 |
|---------|------|
| [context-engineering.ts.md](context-engineering.ts.md) | コンテキストウィンドウ最適化 |
| [semantic-memory.ts.md](semantic-memory.ts.md) | セマンティック検索 |
| [semantic-repetition.ts.md](semantic-repetition.ts.md) | セマンティック反復検出 |
| [pattern-extraction.ts.md](pattern-extraction.ts.md) | パターン抽出 |

### プラン・実行制御

| ファイル | 説明 |
|---------|------|
| [plan-mode-shared.ts.md](plan-mode-shared.ts.md) | プランモード共有機能 |
| [execution-rules.ts.md](execution-rules.ts.md) | 実行ルール定数 |
| [intent-aware-limits.ts.md](intent-aware-limits.ts.md) | インテント別予算制限 |

### ユーティリティ

| ファイル | 説明 |
|---------|------|
| [abort-utils.ts.md](abort-utils.ts.md) | AbortControllerユーティリティ |
| [format-utils.ts.md](format-utils.ts.md) | フォーマット関数 |
| [fs-utils.ts.md](fs-utils.ts.md) | ファイルシステムユーティリティ |
| [process-utils.ts.md](process-utils.ts.md) | プロセスユーティリティ |
| [runtime-utils.ts.md](runtime-utils.ts.md) | ランタイムユーティリティ |
| [tui-utils.ts.md](tui-utils.ts.md) | TUIユーティリティ |
| [text-parsing.ts.md](text-parsing.ts.md) | テキストパース |
| [retry-with-backoff.ts.md](retry-with-backoff.ts.md) | 指数バックオフリトライ |

### その他

| ファイル | 説明 |
|---------|------|
| [index.ts.md](index.ts.md) | ライブラリインデックス |
| [model-timeouts.ts.md](model-timeouts.ts.md) | モデル別タイムアウト設定 |
| [output-schema.ts.md](output-schema.ts.md) | 出力スキーマ定義 |
| [skill-registry.ts.md](skill-registry.ts.md) | スキルレジストリ |
| [cross-instance-coordinator.ts.md](cross-instance-coordinator.ts.md) | クロスインスタンス調整 |

## 関連

- [Extensions ドキュメント](../extensions/README.md)
- [ソースコード](.pi/lib/)
