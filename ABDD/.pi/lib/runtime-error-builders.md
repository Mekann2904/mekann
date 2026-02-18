---
title: runtime-error-builders
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated]
related: []
---

# runtime-error-builders

## 概要

`runtime-error-builders` モジュールのAPIリファレンス。

## インポート

```typescript
import { normalizeTimeoutMs } from './runtime-utils.js';
import { computeModelTimeoutMs } from './model-timeouts.js';
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `resolveEffectiveTimeoutMs` | 有効なタイムアウト時間を解決する |

## 図解

### 依存関係図

```mermaid
flowchart LR
  subgraph this[runtime-error-builders]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    runtime_utils["runtime-utils"]
    model_timeouts["model-timeouts"]
  end
  main --> local
```

## 関数

### resolveEffectiveTimeoutMs

```typescript
resolveEffectiveTimeoutMs(userTimeoutMs: unknown, modelId: string | undefined, fallback: number): number
```

有効なタイムアウト時間を解決する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| userTimeoutMs | `unknown` | はい |
| modelId | `string | undefined` | はい |
| fallback | `number` | はい |

**戻り値**: `number`

---
*自動生成: 2026-02-18T07:17:30.480Z*
