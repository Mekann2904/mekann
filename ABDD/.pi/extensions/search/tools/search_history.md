---
title: search_history
category: api-reference
audience: developer
last_updated: 2026-02-28
tags: [auto-generated]
related: []
---

# search_history

## 概要

`search_history` モジュールのAPIリファレンス。

## インポート

```typescript
// from '../types.js': SearchDetails
// from '../utils/history-store.js': getHistoryStore, StoredHistoryEntry, HistorySession
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `searchHistory` | 検索履歴を管理 |
| 関数 | `formatSearchHistory` | 履歴結果をフォーマット |
| インターフェース | `SearchHistoryInput` | 検索履歴の入力パラメータ |
| インターフェース | `HistoryQuery` | 履歴クエリ情報 |
| インターフェース | `SearchHistoryResult` | 検索履歴の出力結果 |

## 図解

### クラス図

```mermaid
classDiagram
  class SearchHistoryInput {
    <<interface>>
    +action: get_clear_save
    +session: current_previous
    +limit: number
    +query: string
    +tool: string
  }
  class HistoryQuery {
    <<interface>>
    +query: string
    +tool: string
    +timestamp: string
    +resultCount: number
  }
  class SearchHistoryResult {
    <<interface>>
    +queries: HistoryQuery
    +session: string
    +total: number
    +sessions: HistorySession
    +error: string
  }
```

### 依存関係図

```mermaid
flowchart LR
  subgraph this[search_history]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    types["types"]
    history_store["history-store"]
  end
  main --> local
```

### 関数フロー

```mermaid
flowchart TD
  formatEntry["formatEntry()"]
  formatSearchHistory["formatSearchHistory()"]
  searchHistory["searchHistory()"]
  searchHistory --> formatEntry
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant search_history as "search_history"
  participant types as "types"
  participant history_store as "history-store"

  Caller->>search_history: searchHistory()
  activate search_history
  Note over search_history: 非同期処理開始
  search_history->>types: 内部関数呼び出し
  types-->>search_history: 結果
  deactivate search_history
  search_history-->>Caller: Promise_SearchHistor

  Caller->>search_history: formatSearchHistory()
  search_history-->>Caller: string
```

## 関数

### searchHistory

```typescript
async searchHistory(input: SearchHistoryInput, cwd: string): Promise<SearchHistoryResult>
```

検索履歴を管理

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| input | `SearchHistoryInput` | はい |
| cwd | `string` | はい |

**戻り値**: `Promise<SearchHistoryResult>`

### formatEntry

```typescript
formatEntry(entry: StoredHistoryEntry): HistoryQuery
```

エントリをフォーマット

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| entry | `StoredHistoryEntry` | はい |

**戻り値**: `HistoryQuery`

### formatSearchHistory

```typescript
formatSearchHistory(output: SearchHistoryResult): string
```

履歴結果をフォーマット

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `SearchHistoryResult` | はい |

**戻り値**: `string`

## インターフェース

### SearchHistoryInput

```typescript
interface SearchHistoryInput {
  action: "get" | "clear" | "save_query";
  session?: "current" | "previous" | "all";
  limit?: number;
  query?: string;
  tool?: string;
}
```

検索履歴の入力パラメータ

### HistoryQuery

```typescript
interface HistoryQuery {
  query: string;
  tool: string;
  timestamp: string;
  resultCount: number;
}
```

履歴クエリ情報

### SearchHistoryResult

```typescript
interface SearchHistoryResult {
  queries: HistoryQuery[];
  session: string;
  total: number;
  sessions?: HistorySession[];
  error?: string;
  details?: SearchDetails;
}
```

検索履歴の出力結果

---
*自動生成: 2026-02-28T13:55:20.087Z*
