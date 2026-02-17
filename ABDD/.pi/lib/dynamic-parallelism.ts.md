---
title: Dynamic Parallelism Adjuster
category: reference
audience: developer
last_updated: 2026-02-18
tags: [parallelism, rate-limit, recovery, provider]
related: [cross-instance-coordinator, adaptive-rate-controller]
---

# Dynamic Parallelism Adjuster

プロバイダ/モデルごとの並列処理をエラー率と回復状況に基づいて動的に管理するモジュール。

## 概要

429エラー時は30%削減、タイムアウト時は10%削減し、回復間隔ごとに10%ずつ段階的に回復する。クロスインスタンス調整との統合をサポートする。

## 型定義

### ParallelismConfig

並列処理調整の設定。

```typescript
interface ParallelismConfig {
  baseParallelism: number;      // ベース並列レベル
  currentParallelism: number;   // 現在の並列レベル
  minParallelism: number;       // 最小並列レベル
  maxParallelism: number;       // 最大並列レベル
  adjustmentReason: string;     // 最後の調整理由
  lastAdjustedAt: number;       // 最終調整タイムスタンプ(ms)
}
```

### ProviderHealth

プロバイダ/モデルの健全性状態。

```typescript
interface ProviderHealth {
  healthy: boolean;             // 健全かどうか
  activeRequests: number;       // アクティブリクエスト数
  recent429Count: number;       // 最近の429エラー数
  avgResponseMs: number;        // 平均応答時間(ms)
  recommendedBackoffMs: number; // 推奨バックオフ時間(ms)
}
```

### DynamicAdjusterConfig

調整器の設定。

```typescript
interface DynamicAdjusterConfig {
  minParallelism: number;       // デフォルト: 1
  baseParallelism: number;      // デフォルト: 4
  maxParallelism: number;       // デフォルト: 16
  reductionOn429: number;       // デフォルト: 0.3 (30%)
  reductionOnTimeout: number;   // デフォルト: 0.1 (10%)
  increaseOnRecovery: number;   // デフォルト: 0.1 (10%)
  recoveryIntervalMs: number;   // デフォルト: 60000 (1分)
  errorWindowMs: number;        // デフォルト: 300000 (5分)
  maxErrorHistory: number;      // デフォルト: 100
  maxResponseSamples: number;   // デフォルト: 50
}
```

### ErrorEvent

エラーイベントの追跡用。

```typescript
interface ErrorEvent {
  provider: string;
  model: string;
  type: "429" | "timeout" | "error";
  timestamp: number;
  details?: string;
}
```

## クラス

### DynamicParallelismAdjuster

LLMプロバイダの動的並列処理調整を管理する。

#### 主要メソッド

| メソッド | 説明 |
|---------|------|
| `getParallelism(provider, model)` | 現在の並列レベルを取得 |
| `getConfig(provider, model)` | 設定を取得 |
| `adjustForError(provider, model, errorType)` | エラーに基づき調整 |
| `attemptRecovery(provider, model)` | 回復を試行 |
| `applyCrossInstanceLimits(provider, model, instanceCount)` | クロスインスタンス制限を適用 |
| `getHealth(provider, model)` | 健全性状態を取得 |
| `recordSuccess(provider, model, responseMs)` | 成功を記録 |
| `requestStarted(provider, model)` | リクエスト開始を追跡 |
| `requestCompleted(provider, model)` | リクエスト完了を追跡 |
| `reset(provider, model)` | 特定の設定をリセット |
| `resetAll()` | 全状態をリセット |
| `onParallelismChange(callback)` | 変更イベントを購読 |
| `shutdown()` | 調整器をシャットダウン |

## 関数

### getParallelismAdjuster()

シングルトン調整器インスタンスを取得する。

```typescript
function getParallelismAdjuster(): DynamicParallelismAdjuster
```

### createParallelismAdjuster(config)

カスタム設定で新しい調整器を作成する。

```typescript
function createParallelismAdjuster(
  config: Partial<DynamicAdjusterConfig>
): DynamicParallelismAdjuster
```

### resetParallelismAdjuster()

シングルトン調整器をリセットする（テスト用）。

```typescript
function resetParallelismAdjuster(): void
```

### 便利関数

```typescript
// 並列レベル取得
function getParallelism(provider: string, model: string): number

// エラー調整
function adjustForError(
  provider: string,
  model: string,
  errorType: "429" | "timeout" | "error"
): void

// 回復試行
function attemptRecovery(provider: string, model: string): void

// サマリーフォーマット
function formatDynamicParallelismSummary(): string
```

## デフォルト設定

```typescript
{
  minParallelism: 1,
  baseParallelism: 4,
  maxParallelism: 16,
  reductionOn429: 0.3,      // 30%削減
  reductionOnTimeout: 0.1,  // 10%削減
  increaseOnRecovery: 0.1,  // 10%回復
  recoveryIntervalMs: 60000,
  errorWindowMs: 300000,
  maxErrorHistory: 100,
  maxResponseSamples: 50
}
```

## 使用例

```typescript
const adjuster = getParallelismAdjuster();

// 現在の並列レベルを取得
const limit = adjuster.getParallelism("anthropic", "claude-sonnet-4");

// エラー時に調整
adjuster.adjustForError("anthropic", "claude-sonnet-4", "429");

// 回復を試行
adjuster.attemptRecovery("anthropic", "claude-sonnet-4");

// 変更イベントを購読
const unsubscribe = adjuster.onParallelismChange((event) => {
  console.log(`${event.key}: ${event.oldParallelism} -> ${event.newParallelism}`);
});
```

## 関連ファイル

- `./cross-instance-coordinator.ts` - クロスインスタンス調整
- `./adaptive-rate-controller.ts` - アダプティブレート制御
- `./task-scheduler.ts` - タスクスケジューリング
