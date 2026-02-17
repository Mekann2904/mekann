---
title: adaptive-penalty.ts
category: reference
audience: developer
last_updated: 2026-02-18
tags: [penalty, rate-limit, parallelism, adaptive]
related: [adaptive-rate-controller.ts, dynamic-parallelism.ts]
---

# adaptive-penalty.ts

動的並列調整用の適応ペナルティコントローラ。サブエージェントとエージェントチーム間でコード重複を削減する。

## 概要

指数減衰と理由ベースの重み付けをサポートする拡張ペナルティコントローラを提供する。機能フラグ`PI_ADAPTIVE_PENALTY_MODE`で従来モード（linear）と拡張モード（exponential）を切り替え可能。

## 型定義

### PenaltyReason

```typescript
type PenaltyReason = "rate_limit" | "timeout" | "capacity" | "schema_violation";
```

ペナルティ調整の理由種別。

### DecayStrategy

```typescript
type DecayStrategy = "linear" | "exponential" | "hybrid";
```

減衰戦略の種類。

### AdaptivePenaltyState

```typescript
interface AdaptivePenaltyState {
  penalty: number;
  updatedAtMs: number;
  lastReason?: PenaltyReason;
  reasonHistory: Array<{ reason: PenaltyReason; timestamp: number }>;
}
```

ペナルティ状態を表すインターフェース。

### AdaptivePenaltyOptions

```typescript
interface AdaptivePenaltyOptions {
  isStable: boolean;
  maxPenalty: number;
  decayMs: number;
}
```

従来ペナルティコントローラのオプション。

### EnhancedPenaltyOptions

```typescript
interface EnhancedPenaltyOptions extends AdaptivePenaltyOptions {
  decayStrategy?: DecayStrategy;
  exponentialBase?: number;
  reasonWeights?: Partial<Record<PenaltyReason, number>>;
  historySize?: number;
}
```

拡張ペナルティコントローラのオプション。

### AdaptivePenaltyController

```typescript
interface AdaptivePenaltyController {
  readonly state: AdaptivePenaltyState;
  decay: (nowMs?: number) => void;
  raise: (reason: "rate_limit" | "timeout" | "capacity") => void;
  lower: () => void;
  get: () => number;
  applyLimit: (baseLimit: number) => number;
}
```

従来ペナルティコントローラのインターフェース。

### EnhancedPenaltyController

```typescript
interface EnhancedPenaltyController extends AdaptivePenaltyController {
  raiseWithReason: (reason: PenaltyReason) => void;
  getReasonStats: () => Record<PenaltyReason, number>;
  getDecayStrategy: () => DecayStrategy;
}
```

拡張ペナルティコントローラのインターフェース。

## 関数

### getAdaptivePenaltyMode

現在の適応ペナルティモードを取得する。

```typescript
function getAdaptivePenaltyMode(): "legacy" | "enhanced"
```

環境変数`PI_ADAPTIVE_PENALTY_MODE`から読み込み。デフォルトは"enhanced"。

### resetAdaptivePenaltyModeCache

キャッシュされたモードをリセットする（テスト用）。

```typescript
function resetAdaptivePenaltyModeCache(): void
```

### createAdaptivePenaltyController

従来の適応ペナルティコントローラを作成する。

```typescript
function createAdaptivePenaltyController(
  options: AdaptivePenaltyOptions
): AdaptivePenaltyController
```

### createEnhancedPenaltyController

拡張適応ペナルティコントローラを作成する。

```typescript
function createEnhancedPenaltyController(
  options: EnhancedPenaltyOptions
): EnhancedPenaltyController
```

### createAutoPenaltyController

機能フラグに基づいて適切なペナルティコントローラを作成する。

```typescript
function createAutoPenaltyController(
  options: AdaptivePenaltyOptions | EnhancedPenaltyOptions
): AdaptivePenaltyController | EnhancedPenaltyController
```

## 定数

### DEFAULT_REASON_WEIGHTS

```typescript
const DEFAULT_REASON_WEIGHTS: Record<PenaltyReason, number> = {
  rate_limit: 2.0,
  capacity: 1.5,
  timeout: 1.0,
  schema_violation: 0.5,
};
```

拡張モード用のデフォルト理由重み。

## 環境変数

| 変数名 | 説明 | デフォルト |
|--------|------|----------|
| `PI_ADAPTIVE_PENALTY_MODE` | ペナルティモード（legacy/enhanced） | `enhanced` |

## 関連ファイル

- `.pi/lib/adaptive-rate-controller.ts` - 適応レート制御
- `.pi/lib/dynamic-parallelism.ts` - 動的並列制御
