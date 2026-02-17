---
title: Model Timeouts
category: reference
audience: developer
last_updated: 2026-02-18
tags: [timeout, model, configuration]
related: [agent-common, runtime-utils]
---

# Model Timeouts

モデル固有のタイムアウト設定。異なるモデルは異なる応答特性を持つ。

## 概要

低速なモデルは早期終了を避けるために長いタイムアウトを必要とする。ULモード実行効率のために最適化されている。

## 定数

### MODEL_TIMEOUT_BASE_MS

異なるモデルのタイムアウト値（ミリ秒）。

```typescript
const MODEL_TIMEOUT_BASE_MS: Record<string, number>
```

| モデル | タイムアウト | 説明 |
|-------|------------|------|
| glm-5 | 600000 (10分) | 低速モデル、頻繁なタイムアウトのため延長 |
| glm-4 | 480000 (8分) | 低速モデル |
| claude-3-5-sonnet | 300000 (5分) | 標準モデル |
| claude-3-5-haiku | 120000 (2分) | 高速モデル |
| gpt-4 | 300000 (5分) | 標準モデル |
| gpt-4o | 300000 (5分) | 標準モデル |
| gpt-4-turbo | 300000 (5分) | 標準モデル |
| gpt-3.5-turbo | 120000 (2分) | 高速モデル |
| gpt-4o-mini | 120000 (2分) | 高速モデル |
| default | 240000 (4分) | 不明なモデルのデフォルト |

### THINKING_LEVEL_MULTIPLIERS

思考レベル乗数。高い思考レベルはより多くの処理時間を必要とする。

```typescript
const THINKING_LEVEL_MULTIPLIERS: Record<string, number>
```

| レベル | 乗数 |
|-------|-----|
| off | 1.0 |
| minimal | 1.1 |
| low | 1.2 |
| medium | 1.4 |
| high | 1.8 |
| xhigh | 2.5 |

## 型定義

### ComputeModelTimeoutOptions

モデルタイムアウト計算のオプション。

```typescript
interface ComputeModelTimeoutOptions {
  userTimeoutMs?: number;   // ユーザー指定タイムアウト（優先）
  thinkingLevel?: string;   // モデルの思考レベル
}
```

## 関数

### getModelBaseTimeoutMs(modelId)

思考レベル調整なしでモデルのベースタイムアウトを取得する。

```typescript
function getModelBaseTimeoutMs(modelId: string): number
```

**パラメータ:**
- `modelId` - モデル識別子

**戻り値:** ベースタイムアウト（ミリ秒）

**マッチングロジック:**
1. 完全一致を検索
2. 部分一致（modelIdがパターンを含む）を検索
3. デフォルト値を返す

### computeModelTimeoutMs(modelId, options)

すべての調整を含めてモデルに適切なタイムアウトを計算する。

```typescript
function computeModelTimeoutMs(
  modelId: string,
  options?: ComputeModelTimeoutOptions
): number
```

**優先順位:** ユーザー指定 > モデル固有 + 思考調整 > デフォルト

**パラメータ:**
- `modelId` - モデル識別子（例: "glm-5", "claude-3-5-sonnet"）
- `options` - タイムアウト計算オプション

**戻り値:** タイムアウト（ミリ秒）

### computeProgressiveTimeoutMs(baseTimeoutMs, attempt)

再試行回数に応じて増加するプログレッシブタイムアウトを計算する。

```typescript
function computeProgressiveTimeoutMs(
  baseTimeoutMs: number,
  attempt: number
): number
```

**パラメータ:**
- `baseTimeoutMs` - ベースタイムアウト
- `attempt` - 現在の試行番号（0インデックス）

**戻り値:** 調整済みタイムアウト（ミリ秒）

**計算式:** `baseTimeoutMs * min(2.0, 1.0 + attempt * 0.25)`

| 試行 | 乗数 |
|-----|-----|
| 0 | 1.0 |
| 1 | 1.25 |
| 2 | 1.5 |
| 3 | 1.75 |
| 4+ | 2.0 |

## 使用例

```typescript
import {
  getModelBaseTimeoutMs,
  computeModelTimeoutMs,
  computeProgressiveTimeoutMs
} from "./model-timeouts.js";

// ベースタイムアウト取得
const base = getModelBaseTimeoutMs("claude-3-5-sonnet");
// 300000 (5分)

// 思考レベル付きタイムアウト計算
const timeout = computeModelTimeoutMs("claude-3-5-sonnet", {
  thinkingLevel: "high"
});
// 300000 * 1.8 = 540000 (9分)

// ユーザー指定タイムアウト（優先）
const userTimeout = computeModelTimeoutMs("claude-3-5-sonnet", {
  userTimeoutMs: 600000
});
// 600000 (ユーザー指定値)

// プログレッシブタイムアウト
const retry1 = computeProgressiveTimeoutMs(300000, 1);
// 375000 (25%増加)

const retry4 = computeProgressiveTimeoutMs(300000, 4);
// 600000 (2倍でキャップ)
```

## 関連ファイル

- `./agent-common.ts` - エージェント共通ユーティリティ
- `./runtime-utils.ts` - ランタイムユーティリティ
