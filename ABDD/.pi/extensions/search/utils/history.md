---
title: history
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated]
related: []
---

# history

## 概要

`history` モジュールのAPIリファレンス。

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `getSearchHistory` | - |
| 関数 | `resetSearchHistory` | 検索履歴をリセットする |
| 関数 | `extractQuery` | ツールのパラメータからクエリ文字列を抽出する |
| 関数 | `createHistoryEntry` | ツール実行から履歴エントリを作成する |
| クラス | `SearchHistory` | 検索履歴管理クラス |
| インターフェース | `SearchHistoryEntry` | 検索履歴エントリ |
| インターフェース | `HistoryConfig` | 履歴管理の設定を定義 |
| インターフェース | `QuerySuggestion` | クエリ候補インターフェース |

## 図解

### クラス図

```mermaid
classDiagram
  class SearchHistory {
    -entries: SearchHistoryEntry
    -config: HistoryConfig
    +addHistoryEntry()
    +getRecentQueries()
    +getRelatedQueries()
    +markAccepted()
    +getEntry()
  }
  class SearchHistoryEntry {
    <<interface>>
    +timestamp: number
    +tool: string
    +params: Record_string_unknow
    +query: string
    +results: string
  }
  class HistoryConfig {
    <<interface>>
    +maxEntries: number
    +maxResultsPerEntry: number
  }
  class QuerySuggestion {
    <<interface>>
    +query: string
    +count: number
    +lastUsed: number
    +wasAccepted: boolean
  }
```

### 関数フロー

```mermaid
flowchart TD
  createHistoryEntry["createHistoryEntry()"]
  extractQuery["extractQuery()"]
  getSearchHistory["getSearchHistory()"]
  resetSearchHistory["resetSearchHistory()"]
  createHistoryEntry --> extractQuery
```

## 関数

### getSearchHistory

```typescript
getSearchHistory(): SearchHistory
```

**戻り値**: `SearchHistory`

### resetSearchHistory

```typescript
resetSearchHistory(): void
```

検索履歴をリセットする

**戻り値**: `void`

### extractQuery

```typescript
extractQuery(tool: string, params: Record<string, unknown>): string
```

ツールのパラメータからクエリ文字列を抽出する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| tool | `string` | はい |
| params | `Record<string, unknown>` | はい |

**戻り値**: `string`

### createHistoryEntry

```typescript
createHistoryEntry(tool: string, params: Record<string, unknown>, results: string[]): Omit<SearchHistoryEntry, "timestamp" | "accepted">
```

ツール実行から履歴エントリを作成する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| tool | `string` | はい |
| params | `Record<string, unknown>` | はい |
| results | `string[]` | はい |

**戻り値**: `Omit<SearchHistoryEntry, "timestamp" | "accepted">`

## クラス

### SearchHistory

検索履歴管理クラス

**プロパティ**

| 名前 | 型 | 可視性 |
|------|-----|--------|
| entries | `SearchHistoryEntry[]` | private |
| config | `HistoryConfig` | private |

**メソッド**

| 名前 | シグネチャ |
|------|------------|
| addHistoryEntry | `addHistoryEntry(entry): SearchHistoryEntry` |
| getRecentQueries | `getRecentQueries(limit, tool): QuerySuggestion[]` |
| getRelatedQueries | `getRelatedQueries(query, limit): QuerySuggestion[]` |
| markAccepted | `markAccepted(timestamp): boolean` |
| getEntry | `getEntry(timestamp): SearchHistoryEntry | undefined` |
| getAllEntries | `getAllEntries(): SearchHistoryEntry[]` |
| clear | `clear(): void` |
| addOrUpdateSuggestion | `addOrUpdateSuggestion(map, entry): void` |

## インターフェース

### SearchHistoryEntry

```typescript
interface SearchHistoryEntry {
  timestamp: number;
  tool: string;
  params: Record<string, unknown>;
  query: string;
  results: string[];
  accepted: boolean;
}
```

検索履歴エントリ

### HistoryConfig

```typescript
interface HistoryConfig {
  maxEntries: number;
  maxResultsPerEntry: number;
}
```

履歴管理の設定を定義

### QuerySuggestion

```typescript
interface QuerySuggestion {
  query: string;
  count: number;
  lastUsed: number;
  wasAccepted: boolean;
}
```

クエリ候補インターフェース

---
*自動生成: 2026-02-18T15:54:41.330Z*
