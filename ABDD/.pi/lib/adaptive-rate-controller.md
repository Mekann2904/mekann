---
title: adaptive-rate-controller
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated]
related: []
---

# adaptive-rate-controller

## 概要

`adaptive-rate-controller` モジュールのAPIリファレンス。

## インポート

```typescript
import { readFileSync, existsSync, writeFileSync... } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { getRuntimeConfig, RuntimeConfig } from './runtime-config.js';
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `initAdaptiveController` | アダプティブコントローラーを初期化する。 |
| 関数 | `shutdownAdaptiveController` | アダプティブコントローラーをシャットダウンする。 |
| 関数 | `getEffectiveLimit` | プロバイダーとモデルの有効な同時実行制限を取得 |
| 関数 | `recordEvent` | レートリミットイベントを記録する |
| 関数 | `record429` | 429エラーを記録する |
| 関数 | `recordSuccess` | 成功したリクエストを記録する。 |
| 関数 | `getAdaptiveState` | 現在の状態を取得する（デバッグ用）。 |
| 関数 | `getLearnedLimit` | 指定プロバイダー/モデルの学習済み制限を取得 |
| 関数 | `resetLearnedLimit` | 学習した制限をリセットする |
| 関数 | `resetAllLearnedLimits` | 学習した制限値をすべてリセットする |
| 関数 | `setGlobalMultiplier` | グローバル乗数を設定 |
| 関数 | `configureRecovery` | 復元パラメータを設定する。 |
| 関数 | `isRateLimitError` | エラーがレートリミットか判定する |
| 関数 | `formatAdaptiveSummary` | 適応制御状態の概要を作成する。 |
| 関数 | `analyze429Probability` | 429エラーの発生確率を予測します。 |
| 関数 | `getPredictiveAnalysis` | プロバイダー/モデルの予測分析を取得する |
| 関数 | `shouldProactivelyThrottle` | 予測に基づいて事前にスロットルするか判定 |
| 関数 | `getPredictiveConcurrency` | 予測に基づいた推奨並列数を取得 |
| 関数 | `setPredictiveEnabled` | 予測スケジューリングの有効/無効を設定する |
| 関数 | `setPredictiveThreshold` | 予測閾値を設定する（0-1） |
| 関数 | `getSchedulerAwareLimit` | スケジューラ対応の同時実行制限を取得する |
| 関数 | `notifyScheduler429` | スケジューラに429エラーを通知する |
| 関数 | `notifySchedulerTimeout` | スケジューラにタイムアウトを通知する |
| 関数 | `notifySchedulerSuccess` | スケジューラに成功を通知する |
| 関数 | `getCombinedRateControlSummary` | レート制御の統合サマリーを取得 |
| インターフェース | `LearnedLimit` | 学習された同時実行制限と状態 |
| インターフェース | `AdaptiveControllerState` | 適応的レート制御の状態 |
| インターフェース | `RateLimitEvent` | レート制限イベントを表す |
| インターフェース | `PredictiveAnalysis` | 予測分析の結果を表すインターフェース |

## 図解

### クラス図

```mermaid
classDiagram
  class LearnedLimit {
    <<interface>>
    +concurrency: number
    +originalConcurrency: number
    +last429At: string_null
    +consecutive429Count: number
    +total429Count: number
  }
  class AdaptiveControllerState {
    <<interface>>
    +version: number
    +lastUpdated: string
    +limits: key_string_Learne
    +globalMultiplier: number
    +recoveryIntervalMs: number
  }
  class RateLimitEvent {
    <<interface>>
    +provider: string
    +model: string
    +type: T429_success_tim
    +timestamp: string
    +details: string
  }
  class PredictiveAnalysis {
    <<interface>>
    +provider: string
    +model: string
    +predicted429Probability: number
    +shouldProactivelyThrottle: boolean
    +recommendedConcurrency: number
  }
```

### 依存関係図

```mermaid
flowchart LR
  subgraph this[adaptive-rate-controller]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    runtime_config["runtime-config"]
  end
  main --> local
```

### 関数フロー

```mermaid
flowchart TD
  initAdaptiveController["initAdaptiveController()"]
  shutdownAdaptiveController["shutdownAdaptiveController()"]
  getEffectiveLimit["getEffectiveLimit()"]
  recordEvent["recordEvent()"]
  record429["record429()"]
  recordSuccess["recordSuccess()"]
  initAdaptiveController -.-> shutdownAdaptiveController
  shutdownAdaptiveController -.-> getEffectiveLimit
  getEffectiveLimit -.-> recordEvent
  recordEvent -.-> record429
  record429 -.-> recordSuccess
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant adaptive_rate_controller as "adaptive-rate-controller"
  participant runtime_config as "runtime-config"

  Caller->>adaptive_rate_controller: initAdaptiveController()
  adaptive_rate_controller->>runtime_config: 内部関数呼び出し
  runtime_config-->>adaptive_rate_controller: 結果
  adaptive_rate_controller-->>Caller: void

  Caller->>adaptive_rate_controller: shutdownAdaptiveController()
  adaptive_rate_controller-->>Caller: void
```

## 関数

### getDefaultState

```typescript
getDefaultState(): AdaptiveControllerState
```

Get default state from centralized RuntimeConfig.

**戻り値**: `AdaptiveControllerState`

### buildKey

```typescript
buildKey(provider: string, model: string): string
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| provider | `string` | はい |
| model | `string` | はい |

**戻り値**: `string`

### loadState

```typescript
loadState(): AdaptiveControllerState
```

**戻り値**: `AdaptiveControllerState`

### saveState

```typescript
saveState(): void
```

**戻り値**: `void`

### ensureState

```typescript
ensureState(): AdaptiveControllerState
```

**戻り値**: `AdaptiveControllerState`

### clampConcurrency

```typescript
clampConcurrency(value: number): number
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| value | `number` | はい |

**戻り値**: `number`

### scheduleRecovery

```typescript
scheduleRecovery(provider: string, model: string): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| provider | `string` | はい |
| model | `string` | はい |

**戻り値**: `void`

### processRecovery

```typescript
processRecovery(): void
```

**戻り値**: `void`

### initAdaptiveController

```typescript
initAdaptiveController(): void
```

アダプティブコントローラーを初期化する。

**戻り値**: `void`

### shutdownAdaptiveController

```typescript
shutdownAdaptiveController(): void
```

アダプティブコントローラーをシャットダウンする。

**戻り値**: `void`

### getEffectiveLimit

```typescript
getEffectiveLimit(provider: string, model: string, presetLimit: number): number
```

プロバイダーとモデルの有効な同時実行制限を取得

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| provider | `string` | はい |
| model | `string` | はい |
| presetLimit | `number` | はい |

**戻り値**: `number`

### recordEvent

```typescript
recordEvent(event: RateLimitEvent): void
```

レートリミットイベントを記録する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| event | `RateLimitEvent` | はい |

**戻り値**: `void`

### record429

```typescript
record429(provider: string, model: string, details?: string): void
```

429エラーを記録する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| provider | `string` | はい |
| model | `string` | はい |
| details | `string` | いいえ |

**戻り値**: `void`

### recordSuccess

```typescript
recordSuccess(provider: string, model: string): void
```

成功したリクエストを記録する。

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| provider | `string` | はい |
| model | `string` | はい |

**戻り値**: `void`

### getAdaptiveState

```typescript
getAdaptiveState(): AdaptiveControllerState
```

現在の状態を取得する（デバッグ用）。

**戻り値**: `AdaptiveControllerState`

### getLearnedLimit

```typescript
getLearnedLimit(provider: string, model: string): LearnedLimit | undefined
```

指定プロバイダー/モデルの学習済み制限を取得

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| provider | `string` | はい |
| model | `string` | はい |

**戻り値**: `LearnedLimit | undefined`

### resetLearnedLimit

```typescript
resetLearnedLimit(provider: string, model: string, newLimit?: number): void
```

学習した制限をリセットする

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| provider | `string` | はい |
| model | `string` | はい |
| newLimit | `number` | いいえ |

**戻り値**: `void`

### resetAllLearnedLimits

```typescript
resetAllLearnedLimits(): void
```

学習した制限値をすべてリセットする

**戻り値**: `void`

### setGlobalMultiplier

```typescript
setGlobalMultiplier(multiplier: number): void
```

グローバル乗数を設定

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| multiplier | `number` | はい |

**戻り値**: `void`

### configureRecovery

```typescript
configureRecovery(options: {
  recoveryIntervalMs?: number;
  reductionFactor?: number;
  recoveryFactor?: number;
}): void
```

復元パラメータを設定する。

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| options | `object` | はい |
| &nbsp;&nbsp;↳ recoveryIntervalMs | `number` | いいえ |
| &nbsp;&nbsp;↳ reductionFactor | `number` | いいえ |
| &nbsp;&nbsp;↳ recoveryFactor | `number` | いいえ |

**戻り値**: `void`

### isRateLimitError

```typescript
isRateLimitError(error: unknown): boolean
```

エラーがレートリミットか判定する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| error | `unknown` | はい |

**戻り値**: `boolean`

### formatAdaptiveSummary

```typescript
formatAdaptiveSummary(): string
```

適応制御状態の概要を作成する。

**戻り値**: `string`

### analyze429Probability

```typescript
analyze429Probability(provider: string, model: string): number
```

429エラーの発生確率を予測します。

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| provider | `string` | はい |
| model | `string` | はい |

**戻り値**: `number`

### getPredictiveAnalysis

```typescript
getPredictiveAnalysis(provider: string, model: string): PredictiveAnalysis
```

プロバイダー/モデルの予測分析を取得する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| provider | `string` | はい |
| model | `string` | はい |

**戻り値**: `PredictiveAnalysis`

### shouldProactivelyThrottle

```typescript
shouldProactivelyThrottle(provider: string, model: string): boolean
```

予測に基づいて事前にスロットルするか判定

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| provider | `string` | はい |
| model | `string` | はい |

**戻り値**: `boolean`

### getPredictiveConcurrency

```typescript
getPredictiveConcurrency(provider: string, model: string, currentConcurrency: number): number
```

予測に基づいた推奨並列数を取得

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| provider | `string` | はい |
| model | `string` | はい |
| currentConcurrency | `number` | はい |

**戻り値**: `number`

### updateHistorical429s

```typescript
updateHistorical429s(limit: LearnedLimit): void
```

Update historical 429 data (called on 429 events).

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| limit | `LearnedLimit` | はい |

**戻り値**: `void`

### setPredictiveEnabled

```typescript
setPredictiveEnabled(enabled: boolean): void
```

予測スケジューリングの有効/無効を設定する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| enabled | `boolean` | はい |

**戻り値**: `void`

### setPredictiveThreshold

```typescript
setPredictiveThreshold(threshold: number): void
```

予測閾値を設定する（0-1）

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| threshold | `number` | はい |

**戻り値**: `void`

### getSchedulerAwareLimit

```typescript
getSchedulerAwareLimit(provider: string, model: string, baseLimit?: number): number
```

スケジューラ対応の同時実行制限を取得する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| provider | `string` | はい |
| model | `string` | はい |
| baseLimit | `number` | いいえ |

**戻り値**: `number`

### notifyScheduler429

```typescript
notifyScheduler429(provider: string, model: string, details?: string): void
```

スケジューラに429エラーを通知する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| provider | `string` | はい |
| model | `string` | はい |
| details | `string` | いいえ |

**戻り値**: `void`

### notifySchedulerTimeout

```typescript
notifySchedulerTimeout(provider: string, model: string): void
```

スケジューラにタイムアウトを通知する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| provider | `string` | はい |
| model | `string` | はい |

**戻り値**: `void`

### notifySchedulerSuccess

```typescript
notifySchedulerSuccess(provider: string, model: string, responseMs?: number): void
```

スケジューラに成功を通知する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| provider | `string` | はい |
| model | `string` | はい |
| responseMs | `number` | いいえ |

**戻り値**: `void`

### getCombinedRateControlSummary

```typescript
getCombinedRateControlSummary(provider: string, model: string): {
  adaptiveLimit: number;
  originalLimit: number;
  predictiveLimit: number;
  predicted429Probability: number;
  shouldThrottle: boolean;
  recent429Count: number;
}
```

レート制御の統合サマリーを取得

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| provider | `string` | はい |
| model | `string` | はい |

**戻り値**: `{
  adaptiveLimit: number;
  originalLimit: number;
  predictiveLimit: number;
  predicted429Probability: number;
  shouldThrottle: boolean;
  recent429Count: number;
}`

## インターフェース

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

学習された同時実行制限と状態

### AdaptiveControllerState

```typescript
interface AdaptiveControllerState {
  version: number;
  lastUpdated: string;
  limits: {
    [key: string]: LearnedLimit; // "provider:model"
  };
  globalMultiplier: number;
  recoveryIntervalMs: number;
  reductionFactor: number;
  recoveryFactor: number;
  predictiveEnabled: boolean;
  predictiveThreshold: number;
}
```

適応的レート制御の状態

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

レート制限イベントを表す

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

予測分析の結果を表すインターフェース

---
*自動生成: 2026-02-18T07:17:30.381Z*
