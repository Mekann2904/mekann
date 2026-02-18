---
title: cross-instance-runtime
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated]
related: []
---

# cross-instance-runtime

## 概要

`cross-instance-runtime` モジュールのAPIリファレンス。

## インポート

```typescript
import { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { initAdaptiveController, shutdownAdaptiveController, getEffectiveLimit... } from '../lib/adaptive-rate-controller';
import { registerInstance, unregisterInstance, getCoordinatorStatus... } from '../lib/cross-instance-coordinator';
import { resolveLimits, getConcurrencyLimit, formatLimitsSummary... } from '../lib/provider-limits';
import { getRuntimeSnapshot, notifyRuntimeCapacityChanged } from './agent-runtime';
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `registerCrossInstanceRuntimeExtension` | クロスインスタンスランタイム拡張を登録する |

## 図解

### 依存関係図

```mermaid
flowchart LR
  subgraph this[cross-instance-runtime]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    adaptive_rate_controller["adaptive-rate-controller"]
    cross_instance_coordinator["cross-instance-coordinator"]
    provider_limits["provider-limits"]
    agent_runtime["agent-runtime"]
  end
  main --> local
  subgraph external[外部ライブラリ]
    _mariozechner["@mariozechner"]
  end
  main --> external
```

## 関数

### registerCrossInstanceRuntimeExtension

```typescript
registerCrossInstanceRuntimeExtension(pi: ExtensionAPI): void
```

クロスインスタンスランタイム拡張を登録する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| pi | `ExtensionAPI` | はい |

**戻り値**: `void`

---
*自動生成: 2026-02-18T07:48:44.461Z*
