---
title: adaptive-penalty
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated]
related: []
---

# adaptive-penalty

## 概要

`adaptive-penalty` モジュールのAPIリファレンス。

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `getAdaptivePenaltyMode` | アダプティブペナルティモード取得 |
| 関数 | `resetAdaptivePenaltyModeCache` | - |
| 関数 | `createAdaptivePenaltyController` | アダプティブペナルティコントローラ作成 |
| 関数 | `createEnhancedPenaltyController` | 拡張アダプティブペナルティコントローラーを作成 |
| 関数 | `createAutoPenaltyController` | ペナルティコントローラ生成 |
| インターフェース | `AdaptivePenaltyState` | 適応型ペナルティの状態。 |
| インターフェース | `AdaptivePenaltyOptions` | 適応型ペナルティオプション。 |
| インターフェース | `EnhancedPenaltyOptions` | 拡張ペナルティオプション。 |
| インターフェース | `AdaptivePenaltyController` | ペナルティ制御インターフェース。 |
| インターフェース | `EnhancedPenaltyController` | 拡張ペナルティ制御 |
| 型 | `PenaltyReason` | ペナルティ理由の型定義 |
| 型 | `DecayStrategy` | 減衰戦略の種類。 |

## 図解

### クラス図

```mermaid
classDiagram
  class AdaptivePenaltyState {
    <<interface>>
    +penalty: number
    +updatedAtMs: number
    +lastReason: PenaltyReason
    +reasonHistory: Array_reason_Penalt
  }
  class AdaptivePenaltyOptions {
    <<interface>>
    +isStable: boolean
    +maxPenalty: number
    +decayMs: number
  }
  class EnhancedPenaltyOptions {
    <<interface>>
    +decayStrategy: DecayStrategy
    +exponentialBase: number
    +reasonWeights: Partial_Record_Penal
    +historySize: number
  }
  class AdaptivePenaltyController {
    <<interface>>
    +state: AdaptivePenaltyState
    +decay: nowMs_number_voi
    +raise: reason_rate_limit
    +lower: void
    +get: number
  }
  class EnhancedPenaltyController {
    <<interface>>
    +raiseWithReason: reason_PenaltyReaso
    +getReasonStats: Record_PenaltyRe
    +getDecayStrategy: DecayStrategy
  }
```

### 関数フロー

```mermaid
flowchart TD
  createAdaptivePenaltyController["createAdaptivePenaltyController()"]
  createAutoPenaltyController["createAutoPenaltyController()"]
  createEnhancedPenaltyController["createEnhancedPenaltyController()"]
  decay["decay()"]
  get["get()"]
  getAdaptivePenaltyMode["getAdaptivePenaltyMode()"]
  raiseWithReason["raiseWithReason()"]
  recordReason["recordReason()"]
  resetAdaptivePenaltyModeCache["resetAdaptivePenaltyModeCache()"]
  createAdaptivePenaltyController --> decay
  createAdaptivePenaltyController --> get
  createAutoPenaltyController --> createAdaptivePenaltyController
  createAutoPenaltyController --> createEnhancedPenaltyController
  createAutoPenaltyController --> getAdaptivePenaltyMode
  createEnhancedPenaltyController --> decay
  createEnhancedPenaltyController --> get
  createEnhancedPenaltyController --> raiseWithReason
  createEnhancedPenaltyController --> recordReason
  get --> decay
  raiseWithReason --> decay
  raiseWithReason --> recordReason
```

## 関数

### getAdaptivePenaltyMode

```typescript
getAdaptivePenaltyMode(): "legacy" | "enhanced"
```

アダプティブペナルティモード取得

**戻り値**: `"legacy" | "enhanced"`

### resetAdaptivePenaltyModeCache

```typescript
resetAdaptivePenaltyModeCache(): void
```

**戻り値**: `void`

### createAdaptivePenaltyController

```typescript
createAdaptivePenaltyController(options: AdaptivePenaltyOptions): AdaptivePenaltyController
```

アダプティブペナルティコントローラ作成

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| options | `AdaptivePenaltyOptions` | はい |

**戻り値**: `AdaptivePenaltyController`

### decay

```typescript
decay(nowMs: any): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| nowMs | `any` | はい |

**戻り値**: `void`

### raise

```typescript
raise(reason: "rate_limit" | "timeout" | "capacity"): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| reason | `"rate_limit" | "timeout" | "capacity"` | はい |

**戻り値**: `void`

### lower

```typescript
lower(): void
```

**戻り値**: `void`

### get

```typescript
get(): number
```

**戻り値**: `number`

### applyLimit

```typescript
applyLimit(baseLimit: number): number
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| baseLimit | `number` | はい |

**戻り値**: `number`

### createEnhancedPenaltyController

```typescript
createEnhancedPenaltyController(options: EnhancedPenaltyOptions): EnhancedPenaltyController
```

拡張アダプティブペナルティコントローラーを作成

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| options | `EnhancedPenaltyOptions` | はい |

**戻り値**: `EnhancedPenaltyController`

### decay

```typescript
decay(nowMs: any): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| nowMs | `any` | はい |

**戻り値**: `void`

### recordReason

```typescript
recordReason(reason: PenaltyReason): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| reason | `PenaltyReason` | はい |

**戻り値**: `void`

### raiseWithReason

```typescript
raiseWithReason(reason: PenaltyReason): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| reason | `PenaltyReason` | はい |

**戻り値**: `void`

### raise

```typescript
raise(reason: "rate_limit" | "timeout" | "capacity"): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| reason | `"rate_limit" | "timeout" | "capacity"` | はい |

**戻り値**: `void`

### lower

```typescript
lower(): void
```

**戻り値**: `void`

### get

```typescript
get(): number
```

**戻り値**: `number`

### applyLimit

```typescript
applyLimit(baseLimit: number): number
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| baseLimit | `number` | はい |

**戻り値**: `number`

### getReasonStats

```typescript
getReasonStats(): Record<PenaltyReason, number>
```

**戻り値**: `Record<PenaltyReason, number>`

### getDecayStrategy

```typescript
getDecayStrategy(): DecayStrategy
```

**戻り値**: `DecayStrategy`

### createAutoPenaltyController

```typescript
createAutoPenaltyController(options: AdaptivePenaltyOptions | EnhancedPenaltyOptions): AdaptivePenaltyController | EnhancedPenaltyController
```

ペナルティコントローラ生成

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| options | `AdaptivePenaltyOptions | EnhancedPenaltyOptions` | はい |

**戻り値**: `AdaptivePenaltyController | EnhancedPenaltyController`

## インターフェース

### AdaptivePenaltyState

```typescript
interface AdaptivePenaltyState {
  penalty: number;
  updatedAtMs: number;
  lastReason?: PenaltyReason;
  reasonHistory: Array<{ reason: PenaltyReason; timestamp: number }>;
}
```

適応型ペナルティの状態。

### AdaptivePenaltyOptions

```typescript
interface AdaptivePenaltyOptions {
  isStable: boolean;
  maxPenalty: number;
  decayMs: number;
}
```

適応型ペナルティオプション。

### EnhancedPenaltyOptions

```typescript
interface EnhancedPenaltyOptions {
  decayStrategy?: DecayStrategy;
  exponentialBase?: number;
  reasonWeights?: Partial<Record<PenaltyReason, number>>;
  historySize?: number;
}
```

拡張ペナルティオプション。

### AdaptivePenaltyController

```typescript
interface AdaptivePenaltyController {
  state: AdaptivePenaltyState;
  decay: (nowMs?: number) => void;
  raise: (reason: "rate_limit" | "timeout" | "capacity") => void;
  lower: () => void;
  get: () => number;
  applyLimit: (baseLimit: number) => number;
}
```

ペナルティ制御インターフェース。

### EnhancedPenaltyController

```typescript
interface EnhancedPenaltyController {
  raiseWithReason: (reason: PenaltyReason) => void;
  getReasonStats: () => Record<PenaltyReason, number>;
  getDecayStrategy: () => DecayStrategy;
}
```

拡張ペナルティ制御

## 型定義

### PenaltyReason

```typescript
type PenaltyReason = "rate_limit" | "timeout" | "capacity" | "schema_violation"
```

ペナルティ理由の型定義

### DecayStrategy

```typescript
type DecayStrategy = "linear" | "exponential" | "hybrid"
```

減衰戦略の種類。

---
*自動生成: 2026-02-18T18:06:17.476Z*
