---
title: agent-idle-indicator
category: api-reference
audience: developer
last_updated: 2026-02-17
tags: [auto-generated]
related: []
---

# agent-idle-indicator

## 概要

`agent-idle-indicator` モジュールのAPIリファレンス。

## インポート

```typescript
import { ExtensionAPI } from '@mariozechner/pi-coding-agent';
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|

## 図解

### 依存関係図

```mermaid
flowchart LR
  subgraph this[agent-idle-indicator]
    main[Main Module]
  end
  subgraph external[外部ライブラリ]
    _mariozechner[@mariozechner]
  end
  main --> external
```

## 関数

### showIdleIndicator

```typescript
showIdleIndicator(ctx: ExtensionAPI["context"]): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| ctx | `ExtensionAPI["context"]` | はい |

**戻り値**: `void`

### clearIdleIndicator

```typescript
clearIdleIndicator(ctx: ExtensionAPI["context"]): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| ctx | `ExtensionAPI["context"]` | はい |

**戻り値**: `void`

### restoreOriginal

```typescript
restoreOriginal(ctx: ExtensionAPI["context"]): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| ctx | `ExtensionAPI["context"]` | はい |

**戻り値**: `void`

---
*自動生成: 2026-02-17T21:54:59.558Z*
