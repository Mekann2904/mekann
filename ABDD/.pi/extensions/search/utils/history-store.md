---
title: history-store
category: api-reference
audience: developer
last_updated: 2026-02-24
tags: [auto-generated]
related: []
---

# history-store

## 概要

`history-store` モジュールのAPIリファレンス。

## インポート

```typescript
// from 'fs': fs
// from 'path': path
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `getHistoryStore` | グローバル履歴ストアを取得 |
| 関数 | `resetHistoryStore` | グローバル履歴ストアをリセット |
| クラス | `HistoryStore` | 検索履歴永続化ストア |
| インターフェース | `StoredHistoryEntry` | 保存された履歴エントリ |
| インターフェース | `HistorySession` | セッション情報 |
| インターフェース | `HistoryStoreConfig` | ストア設定 |

## 図解

### クラス図

```mermaid
classDiagram
  class HistoryStore {
    -config: HistoryStoreConfig
    -entries: StoredHistoryEntry
    -currentSessionId: string
    -storagePath: string_null
    -loaded: any
    +getCurrentSessionId()
    +startNewSession()
    +addEntry()
    +getHistory()
    +getSessions()
  }
  class StoredHistoryEntry {
    <<interface>>
    +id: string
    +sessionId: string
    +timestamp: number
    +tool: string
    +query: string
  }
  class HistorySession {
    <<interface>>
    +id: string
    +startTime: number
    +endTime: number
    +entryCount: number
  }
  class HistoryStoreConfig {
    <<interface>>
    +maxEntries: number
    +maxSessions: number
    +storagePath: string
  }
```

### 依存関係図

```mermaid
flowchart LR
  subgraph this[history-store]
    main[Main Module]
  end
  subgraph external[外部ライブラリ]
    fs["fs"]
    path["path"]
  end
  main --> external
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant history_store as "history-store"
  participant fs as "fs"
  participant path as "path"

  Caller->>history_store: getHistoryStore()
  history_store->>fs: API呼び出し
  fs-->>history_store: レスポンス
  history_store-->>Caller: HistoryStore

  Caller->>history_store: resetHistoryStore()
  history_store-->>Caller: void
```

## 関数

### getHistoryStore

```typescript
getHistoryStore(cwd?: string): HistoryStore
```

グローバル履歴ストアを取得

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| cwd | `string` | いいえ |

**戻り値**: `HistoryStore`

### resetHistoryStore

```typescript
resetHistoryStore(): void
```

グローバル履歴ストアをリセット

**戻り値**: `void`

## クラス

### HistoryStore

検索履歴永続化ストア

**プロパティ**

| 名前 | 型 | 可視性 |
|------|-----|--------|
| config | `HistoryStoreConfig` | private |
| entries | `StoredHistoryEntry[]` | private |
| currentSessionId | `string` | private |
| storagePath | `string | null` | private |
| loaded | `any` | private |

**メソッド**

| 名前 | シグネチャ |
|------|------------|
| getCurrentSessionId | `getCurrentSessionId(): string` |
| startNewSession | `startNewSession(): string` |
| addEntry | `addEntry(tool, query, resultCount, results): StoredHistoryEntry` |
| getHistory | `getHistory(session, limit): StoredHistoryEntry[]` |
| getSessions | `getSessions(): HistorySession[]` |
| saveQuery | `saveQuery(query, tool): StoredHistoryEntry` |
| clear | `clear(session): void` |
| load | `load(): void` |
| save | `save(): void` |
| generateSessionId | `generateSessionId(): string` |
| generateEntryId | `generateEntryId(): string` |
| finalizeCurrentSession | `finalizeCurrentSession(): void` |

## インターフェース

### StoredHistoryEntry

```typescript
interface StoredHistoryEntry {
  id: string;
  sessionId: string;
  timestamp: number;
  tool: string;
  query: string;
  resultCount: number;
  results: string[];
}
```

保存された履歴エントリ

### HistorySession

```typescript
interface HistorySession {
  id: string;
  startTime: number;
  endTime?: number;
  entryCount: number;
}
```

セッション情報

### HistoryStoreConfig

```typescript
interface HistoryStoreConfig {
  maxEntries: number;
  maxSessions: number;
  storagePath?: string;
}
```

ストア設定

---
*自動生成: 2026-02-24T17:08:02.438Z*
