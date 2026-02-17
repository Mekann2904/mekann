---
title: adaptive-rate-controller.ts
category: reference
audience: developer
last_updated: 2026-02-18
tags: [rate-limit, 429, adaptive, concurrency, scheduling]
related: [adaptive-penalty.ts, dynamic-parallelism.ts, provider-limits.ts]
---

# adaptive-rate-controller.ts

適応レートコントローラ。429エラーから学習し、並行性制限を動的に調整する。

## 概要

provider-limits.ts（プリセット）やcross-instance-coordinator.tsと連携して動作する。429エラー発生時に並行性を30%削減し、回復期間（5分）後に徐々に復元する。予測スケジューリング機能も提供する。

## 型定義

### LearnedLimit

```typescript
interface LearnedLimit {
  concurrency: number;
  originalConcurrency: number;
  last429At: string | null;
  consecutive429Count: number;
  total429Count: number;
  lastSuccessAt: string | null;
  recoveryScheduled: boolean;
  notes?: string;
  historical429s?: string[];
  predicted429Probability?: number;
  rampUpSchedule?: number[];
}
```

学習済み並行性制限。

### AdaptiveControllerState

```typescript
interface AdaptiveControllerState {
  version: number;
  lastUpdated: string;
  limits: { [key: string]: LearnedLimit };
  globalMultiplier: number;
  recoveryIntervalMs: number;
  reductionFactor: number;
  recoveryFactor: number;
  predictive_enabled: boolean;
  predictiveThreshold: number;
}
```

コントローラの状態。

### RateLimitEvent

```typescript
interface RateLimitEvent {
  provider: string;
  model: string;
  type: "429" | "success" | "timeout" | "error";
  timestamp: string;
  details?: string;
}
```

レート制限イベント。

### PredictiveAnalysis

```typescript
interface PredictiveAnalysis {
  provider: string;
  model: string;
  predicted429Probability: number;
  shouldProactivelyThrottle: boolean;
  recommendedConcurrency: number;
  nextRiskWindow?: { start: Date; end: Date };
  confidence: number;
}
```

予測分析結果。

## 関数

### 初期化・シャットダウン

#### initAdaptiveController

適応コントローラを初期化する。起動時に1回呼び出す必要がある。

```typescript
function initAdaptiveController(): void
```

#### shutdownAdaptiveController

適応コントローラをシャットダウンする。

```typescript
function shutdownAdaptiveController(): void
```

### 制限取得

#### getEffectiveLimit

プロバイダ/モデルの有効並行性制限を取得する。

```typescript
function getEffectiveLimit(
  provider: string,
  model: string,
  presetLimit: number
): number
```

#### getLearnedLimit

特定プロバイダ/モデルの学習済み制限を取得する。

```typescript
function getLearnedLimit(
  provider: string,
  model: string
): LearnedLimit | undefined
```

### イベント記録

#### recordEvent

レート制限イベントを記録する。

```typescript
function recordEvent(event: RateLimitEvent): void
```

#### record429

429エラーを記録する便利関数。

```typescript
function record429(
  provider: string,
  model: string,
  details?: string
): void
```

#### recordSuccess

成功したリクエストを記録する。

```typescript
function recordSuccess(provider: string, model: string): void
```

### リセット

#### resetLearnedLimit

特定プロバイダ/モデルの学習済み制限をリセットする。

```typescript
function resetLearnedLimit(
  provider: string,
  model: string,
  newLimit?: number
): void
```

#### resetAllLearnedLimits

全学習済み制限をリセットする。

```typescript
function resetAllLearnedLimits(): void
```

### 設定

#### setGlobalMultiplier

グローバル乗数を設定する（全制限に影響）。

```typescript
function setGlobalMultiplier(multiplier: number): void
```

#### configureRecovery

回復パラメータを設定する。

```typescript
function configureRecovery(options: {
  recoveryIntervalMs?: number;
  reductionFactor?: number;
  recoveryFactor?: number;
}): void
```

### 予測スケジューリング

#### analyze429Probability

履歴から429確率を予測する。

```typescript
function analyze429Probability(
  provider: string,
  model: string
): number
```

#### getPredictiveAnalysis

予測分析を取得する。

```typescript
function getPredictiveAnalysis(
  provider: string,
  model: string
): PredictiveAnalysis
```

#### shouldProactivelyThrottle

予測に基づいて事前スロットルが必要か判定する。

```typescript
function shouldProactivelyThrottle(
  provider: string,
  model: string
): boolean
```

#### getPredictiveConcurrency

予測を考慮した並行性を取得する。

```typescript
function getPredictiveConcurrency(
  provider: string,
  model: string,
  currentConcurrency: number
): number
```

### スケジューラ統合

#### getSchedulerAwareLimit

スケジューラ対応の並行性制限を取得する。

```typescript
function getSchedulerAwareLimit(
  provider: string,
  model: string,
  baseLimit?: number
): number
```

#### notifyScheduler429

スケジューラに429エラーを通知する。

```typescript
function notifyScheduler429(
  provider: string,
  model: string,
  details?: string
): void
```

#### notifySchedulerTimeout

スケジューラにタイムアウトを通知する。

```typescript
function notifySchedulerTimeout(
  provider: string,
  model: string
): void
```

#### notifySchedulerSuccess

スケジューラに成功を通知する。

```typescript
function notifySchedulerSuccess(
  provider: string,
  model: string,
  responseMs?: number
): void
```

### ユーティリティ

#### isRateLimitError

エラーメッセージがレート制限を示しているか判定する。

```typescript
function isRateLimitError(error: unknown): boolean
```

#### formatAdaptiveSummary

適応コントローラ状態のサマリーを整形する。

```typescript
function formatAdaptiveSummary(): string
```

#### getCombinedRateControlSummary

統合レート制御サマリーを取得する。

```typescript
function getCombinedRateControlSummary(
  provider: string,
  model: string
): {
  adaptiveLimit: number;
  originalLimit: number;
  predictiveLimit: number;
  predicted429Probability: number;
  shouldThrottle: boolean;
  recent429Count: number;
}
```

## 定数

| 名前 | 値 | 説明 |
|------|-----|------|
| `MIN_CONCURRENCY` | 1 | 最小並行性 |
| `MAX_CONCURRENCY` | 16 | 最大並行性 |
| `RECOVERY_CHECK_INTERVAL_MS` | 60000 | 回復チェック間隔 |

## 状態ファイル

状態は`~/.pi/runtime/adaptive-limits.json`に保存される。

## 関連ファイル

- `.pi/lib/adaptive-penalty.ts` - 適応ペナルティ制御
- `.pi/lib/dynamic-parallelism.ts` - 動的並列制御
- `.pi/lib/provider-limits.ts` - プロバイダ制限プリセット
