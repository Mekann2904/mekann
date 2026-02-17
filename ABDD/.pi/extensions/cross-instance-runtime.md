---
title: cross-instance-runtime
category: reference
audience: developer
last_updated: 2026-02-18
tags: [extension, cross-instance, coordinator, rate-limit]
related: [adaptive-rate-controller, cross-instance-coordinator, provider-limits]
---

# cross-instance-runtime

> パンくず: [Home](../../README.md) > [Extensions](./) > cross-instance-runtime

## 概要

複数のpiインスタンス間の調整をpiライフサイクルに統合する拡張機能。アクティブなpiインスタンス数に基づいて並列度を自動調整する。

## 機能

- 起動時のアダプティブコントローラー初期化
- セッション開始時のインスタンス登録
- セッション終了時のインスタンス登録解除
- ツールコール時のモデル使用追跡
- ツール結果時の429エラー検出と記録

## コマンド

### /pi-instances

アクティブなpiインスタンスと並列度割り当てを表示する。

**説明**: アクティブなpiインスタンスと並列度割り当てを表示

**表示内容**:
- アクティブなpiインスタンス数
- 自分のインスタンスID
- 自分の並列制限
- 総最大LLM数
- モデル使用状況（インスタンス間）
- アクティブインスタンス一覧

### /pi-limits

プロバイダ/モデルのレート制限を表示する。

**説明**: プロバイダ/モデルのレート制限を表示

**引数**: プロバイダ名（省略可）

**表示内容**:
- プロバイダ別の制限
- 現在のモデルの解決済み制限
- アダプティブ学習状態

### /pi-limits-reset

学習済みレート制限をリセットする。

**説明**: 学習済みレート制限をリセット

**使用方法**: `/pi-limits-reset <provider> <model>`

## ツール

### pi_instance_status

現在のクロスインスタンスコーディネーターの状態と並列度割り当てを取得する。

**ラベル**: PI Instance Status

**説明**: 現在のクロスインスタンスコーディネーターの状態と並列度割り当てを取得

**パラメータ**: なし

**戻り値**:
- 登録状態
- インスタンスID
- アクティブインスタンス数
- 並列制限
- 設定（総最大LLM、ハートビート間隔、タイムアウト）
- ランタイムスナップショット
- モデル使用状況
- 環境変数設定

### pi_model_limits

特定のプロバイダ/モデルの組み合わせのレート制限を取得する。

**ラベル**: PI Model Limits

**説明**: 特定のプロバイダ/モデルの組み合わせのレート制限を取得

**パラメータ**:

| 名前 | 型 | 説明 |
|------|------|------|
| `provider` | string | プロバイダ名（例: anthropic, openai） |
| `model` | string | モデル名（例: claude-sonnet-4-20250514） |
| `tier` | string | オプションのティア（例: pro, max, plus） |

**戻り値**:
- プリセット制限（ティア、RPM、TPM、並列度、ソース）
- 学習済み制限
- インスタンス分布（アクティブインスタンス数、有効制限、モデル固有制限）

## イベントハンドラ

### session_start

セッション開始時にインスタンスを登録する。

**処理**:
1. セッションIDを取得
2. 環境変数オーバーライドを取得
3. インスタンスを登録
4. ランタイム容量変更を通知

### session_end

セッション終了時にインスタンスの登録を解除する。

**処理**:
1. アダプティブコントローラーをシャットダウン
2. インスタンスの登録を解除

### tool_call

ツールコール時にモデル使用を追跡する。

**処理**:
- LLMツール（subagent_run, agent_team_run等）の場合、アクティブモデルを設定

### tool_result

ツール結果時に429エラーを検出する。

**処理**:
- 429エラーを検出した場合、記録して並列度を削減
- 成功した場合、成功を記録
- アクティブモデルをクリア

## 依存モジュール

### lib/adaptive-rate-controller

- `initAdaptiveController()`: アダプティブコントローラー初期化
- `shutdownAdaptiveController()`: シャットダウン
- `getEffectiveLimit()`: 有効制限取得
- `record429()`: 429エラー記録
- `recordSuccess()`: 成功記録
- `isRateLimitError()`: レート制限エラー判定
- `getLearnedLimit()`: 学習済み制限取得
- `resetLearnedLimit()`: 学習済み制限リセット
- `formatAdaptiveSummary()`: サマリー整形

### lib/cross-instance-coordinator

- `registerInstance()`: インスタンス登録
- `unregisterInstance()`: インスタンス登録解除
- `getCoordinatorStatus()`: コーディネーター状態取得
- `getActiveInstanceCount()`: アクティブインスタンス数取得
- `getMyParallelLimit()`: 自分の並列制限取得
- `getEnvOverrides()`: 環境変数オーバーライド取得
- `setActiveModel()`: アクティブモデル設定
- `clearActiveModel()`: アクティブモデルクリア
- `getModelParallelLimit()`: モデル並列制限取得
- `getModelUsageSummary()`: モデル使用サマリー取得

### lib/provider-limits

- `resolveLimits()`: 制限解決
- `getConcurrencyLimit()`: 並列制限取得
- `formatLimitsSummary()`: サマリー整形
- `listProviders()`: プロバイダ一覧
- `detectTier()`: ティア検出

### agent-runtime

- `getRuntimeSnapshot()`: ランタイムスナップショット取得
- `notifyRuntimeCapacityChanged()`: 容量変更通知

## 環境変数

| 変数名 | 説明 |
|--------|------|
| `PI_TOTAL_MAX_LLM` | 総最大LLM数 |
| `PI_AGENT_MAX_PARALLEL_SUBAGENTS` | エージェント最大並列サブエージェント数 |
| `PI_CURRENT_MODEL` | 現在のモデル |

---

## 関連トピック

- [adaptive-rate-controller](../lib/adaptive-rate-controller.md) - アダプティブレートコントローラー
- [cross-instance-coordinator](../lib/cross-instance-coordinator.md) - クロスインスタンスコーディネーター
- [provider-limits](../lib/provider-limits.md) - プロバイダ制限
