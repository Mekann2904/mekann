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
| 関数 | `getSearchHistory` | グローバル検索履歴を取得する。 |
| 関数 | `resetSearchHistory` | グローバル履歴インスタンスをリセット |
| 関数 | `extractQuery` | ツールのパラメータからクエリ文字列を抽出する |
| 関数 | `createHistoryEntry` | ツール実行から履歴エントリを作成する |
| クラス | `SearchHistory` | 検索履歴を管理するクラス |
| インターフェース | `SearchHistoryEntry` | 検索履歴のエントリ。 |
| インターフェース | `HistoryConfig` | 履歴管理の設定。 |
| インターフェース | `QuerySuggestion` | サジェッション用のクエリとメタデータ |

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
  getSearchHistory["getSearchHistory()"]
  resetSearchHistory["resetSearchHistory()"]
  extractQuery["extractQuery()"]
  createHistoryEntry["createHistoryEntry()"]
  getSearchHistory -.-> resetSearchHistory
  resetSearchHistory -.-> extractQuery
  extractQuery -.-> createHistoryEntry
```

## 関数

### getSearchHistory

```typescript
getSearchHistory(): SearchHistory
```

グローバル検索履歴を取得する。

**戻り値**: `SearchHistory`

### resetSearchHistory

```typescript
resetSearchHistory(): void
```

グローバル履歴インスタンスをリセット

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

検索履歴を管理するクラス

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

検索履歴のエントリ。

### HistoryConfig

```typescript
interface HistoryConfig {
  maxEntries: number;
  maxResultsPerEntry: number;
}
```

履歴管理の設定。

### QuerySuggestion

```typescript
interface QuerySuggestion {
  query: string;
  count: number;
  lastUsed: number;
  wasAccepted: boolean;
}
```

サジェッション用のクエリとメタデータ

---
*自動生成: 2026-02-18T07:17:30.311Z*
