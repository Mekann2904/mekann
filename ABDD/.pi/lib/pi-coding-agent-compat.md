---
title: pi-coding-agent-compat
category: api-reference
audience: developer
last_updated: 2026-02-22
tags: [auto-generated]
related: []
---

# pi-coding-agent-compat

## 概要

`pi-coding-agent-compat` モジュールのAPIリファレンス。

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|

## 図解

### クラス図

```mermaid
classDiagram
  class ExtensionUIContext {
    <<interface>>
  }
  class ContextUsage {
    <<interface>>
    +usageTokens: number
    +trailingTokens: number
  }
  class ExtensionAPI {
    <<interface>>
    +context: ExtensionContext
  }
  class SessionStartEvent {
    <<interface>>
    +sessionId: string
  }
  class BashToolResultEvent {
    <<interface>>
    +error: string
    +result: unknown
  }
  class ReadToolResultEvent {
    <<interface>>
    +error: string
    +result: unknown
  }
  class EditToolResultEvent {
    <<interface>>
    +error: string
    +result: unknown
  }
  class WriteToolResultEvent {
    <<interface>>
    +error: string
    +result: unknown
  }
  class GrepToolResultEvent {
    <<interface>>
    +error: string
    +result: unknown
  }
  class FindToolResultEvent {
    <<interface>>
    +error: string
    +result: unknown
  }
  class LsToolResultEvent {
    <<interface>>
    +error: string
    +result: unknown
  }
  class CustomToolResultEvent {
    <<interface>>
    +error: string
    +result: unknown
  }
```

## インターフェース

### ExtensionUIContext

```typescript
interface ExtensionUIContext {
  notify(message, type);
  getTitle();
}
```

### ContextUsage

```typescript
interface ContextUsage {
  usageTokens?: number;
  trailingTokens?: number;
}
```

### ExtensionAPI

```typescript
interface ExtensionAPI {
  context: import("@mariozechner/pi-coding-agent").ExtensionContext;
  on(event, handler);
}
```

### SessionStartEvent

```typescript
interface SessionStartEvent {
  sessionId?: string;
}
```

### BashToolResultEvent

```typescript
interface BashToolResultEvent {
  error?: string;
  result?: unknown;
}
```

### ReadToolResultEvent

```typescript
interface ReadToolResultEvent {
  error?: string;
  result?: unknown;
}
```

### EditToolResultEvent

```typescript
interface EditToolResultEvent {
  error?: string;
  result?: unknown;
}
```

### WriteToolResultEvent

```typescript
interface WriteToolResultEvent {
  error?: string;
  result?: unknown;
}
```

### GrepToolResultEvent

```typescript
interface GrepToolResultEvent {
  error?: string;
  result?: unknown;
}
```

### FindToolResultEvent

```typescript
interface FindToolResultEvent {
  error?: string;
  result?: unknown;
}
```

### LsToolResultEvent

```typescript
interface LsToolResultEvent {
  error?: string;
  result?: unknown;
}
```

### CustomToolResultEvent

```typescript
interface CustomToolResultEvent {
  error?: string;
  result?: unknown;
}
```

---
*自動生成: 2026-02-22T19:27:00.688Z*
