---
title: app.tsx
category: api-reference
audience: developer
last_updated: 2026-02-28
tags: [auto-generated]
related: []
---

# app.tsx

## 概要

`app.tsx` モジュールのAPIリファレンス。

## インポート

```typescript
// from 'preact/hooks': useState, useEffect, useLayoutEffect, ...
// from 'preact-router': Router, route
// from './components/theme-page': ThemePage, applyThemeToDOM, Mode
// from './components/dashboard-page': DashboardPage
// from './components/instances-page': InstancesPage
// ... and 5 more imports
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `applyTheme` | - |
| 関数 | `App` | - |

## 図解

### クラス図

```mermaid
classDiagram
  class ThemeSettings {
    <<interface>>
    +themeId: string
    +mode: Mode
  }
  class SSEEvent {
    <<interface>>
    +type: SSEEventType
    +data: Record_string_unknow
    +timestamp: number
  }
  class SidebarProps {
    <<interface>>
    +sseConnected: boolean
    +sseExhausted: boolean
    +onSseReconnect: void
  }
```

### 依存関係図

```mermaid
flowchart LR
  subgraph this[app.tsx]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    theme_page["theme-page"]
    dashboard_page["dashboard-page"]
    instances_page["instances-page"]
    mcp_page["mcp-page"]
    tasks_page["tasks-page"]
  end
  main --> local
  subgraph external[外部ライブラリ]
    preact["preact"]
    preact_router["preact-router"]
    lucide_preact["lucide-preact"]
    _["@"]
  end
  main --> external
```

### 関数フロー

```mermaid
flowchart TD
  App["App()"]
  applyTheme["applyTheme()"]
  connect["connect()"]
  fetchGlobalTheme["fetchGlobalTheme()"]
  initializeTheme["initializeTheme()"]
  saveGlobalTheme["saveGlobalTheme()"]
  useSSE["useSSE()"]
  App --> initializeTheme
  App --> useSSE
  applyTheme --> saveGlobalTheme
  connect --> connect
  initializeTheme --> fetchGlobalTheme
  useSSE --> connect
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant app_tsx as "app.tsx"
  participant preact as "preact"
  participant preact_router as "preact-router"
  participant lucide_preact as "lucide-preact"
  participant theme_page as "theme-page"
  participant dashboard_page as "dashboard-page"

  Caller->>app_tsx: applyTheme()
  app_tsx->>preact: API呼び出し
  preact-->>app_tsx: レスポンス
  app_tsx->>theme_page: 内部関数呼び出し
  theme_page-->>app_tsx: 結果
  app_tsx-->>Caller: void

  Caller->>app_tsx: App()
  app_tsx-->>Caller: void
```

## 関数

### fetchGlobalTheme

```typescript
async fetchGlobalTheme(): Promise<ThemeSettings | null>
```

**戻り値**: `Promise<ThemeSettings | null>`

### saveGlobalTheme

```typescript
async saveGlobalTheme(themeId: string, mode: Mode): Promise<boolean>
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| themeId | `string` | はい |
| mode | `Mode` | はい |

**戻り値**: `Promise<boolean>`

### initializeTheme

```typescript
async initializeTheme(): Promise<ThemeSettings>
```

**戻り値**: `Promise<ThemeSettings>`

### applyTheme

```typescript
applyTheme(themeId: string, mode: Mode): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| themeId | `string` | はい |
| mode | `Mode` | はい |

**戻り値**: `void`

### useSSE

```typescript
useSSE(onEvent: (event: SSEEvent) => void): { connected: boolean; reconnect: () => void; exhausted: boolean }
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| onEvent | `(event: SSEEvent) => void` | はい |

**戻り値**: `{ connected: boolean; reconnect: () => void; exhausted: boolean }`

### connect

```typescript
connect(): void
```

**戻り値**: `void`

### App

```typescript
App(): void
```

**戻り値**: `void`

### Sidebar

```typescript
Sidebar({ sseConnected, sseExhausted, onSseReconnect }: SidebarProps): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| { sseConnected, sseExhausted, onSseReconnect } | `SidebarProps` | はい |

**戻り値**: `void`

### handlePopState

```typescript
handlePopState(): void
```

**戻り値**: `void`

### navigate

```typescript
navigate(path: string): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| path | `string` | はい |

**戻り値**: `void`

## インターフェース

### ThemeSettings

```typescript
interface ThemeSettings {
  themeId: string;
  mode: Mode;
}
```

### SSEEvent

```typescript
interface SSEEvent {
  type: SSEEventType;
  data: Record<string, unknown>;
  timestamp: number;
}
```

### SidebarProps

```typescript
interface SidebarProps {
  sseConnected: boolean;
  sseExhausted: boolean;
  onSseReconnect: () => void;
}
```

## 型定義

### SSEEventType

```typescript
type SSEEventType = "status" | "tool-call" | "response" | "heartbeat" | "connected"
```

---
*自動生成: 2026-02-28T13:55:23.113Z*
