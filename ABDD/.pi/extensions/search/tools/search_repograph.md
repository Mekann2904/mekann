---
title: search_repograph
category: api-reference
audience: developer
last_updated: 2026-02-28
tags: [auto-generated]
related: []
---

# search_repograph

## 概要

`search_repograph` モジュールのAPIリファレンス。

## インポート

```typescript
// from '@sinclair/typebox': Type
// from '@sinclair/typebox': Static
// from '../repograph/storage.js': loadRepoGraph, getRepoGraphPath
// from '../repograph/egograph.js': extractEgograph, formatEgograph
// from '../repograph/egograph.js': EgographOptions, EgographResult
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `searchRepograph` | Search RepoGraph with k-hop egograph extraction |
| 関数 | `formatSearchResult` | Format search result for display |
| インターフェース | `SearchRepographOutput` | Output schema for search_repograph tool |
| 型 | `SearchRepographInput` | 検索入力定義 |

## 図解

### クラス図

```mermaid
classDiagram
  class SearchRepographOutput {
    <<interface>>
    +success: boolean
    +error: string
    +result: EgographResult
    +indexPath: string
  }
```

### 依存関係図

```mermaid
flowchart LR
  subgraph this[search_repograph]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    storage["storage"]
    egograph["egograph"]
    egograph["egograph"]
  end
  main --> local
  subgraph external[外部ライブラリ]
    _sinclair["@sinclair"]
    _sinclair["@sinclair"]
  end
  main --> external
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant search_repograph as "search_repograph"
  participant sinclair as "@sinclair"
  participant storage as "storage"
  participant egograph as "egograph"

  Caller->>search_repograph: searchRepograph()
  activate search_repograph
  Note over search_repograph: 非同期処理開始
  search_repograph->>sinclair: API呼び出し
  sinclair-->>search_repograph: レスポンス
  search_repograph->>storage: 内部関数呼び出し
  storage-->>search_repograph: 結果
  deactivate search_repograph
  search_repograph-->>Caller: Promise_SearchRepogr

  Caller->>search_repograph: formatSearchResult()
  search_repograph-->>Caller: string
```

## 関数

### searchRepograph

```typescript
async searchRepograph(params: SearchRepographInput, cwd: string): Promise<SearchRepographOutput>
```

Search RepoGraph with k-hop egograph extraction

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| params | `SearchRepographInput` | はい |
| cwd | `string` | はい |

**戻り値**: `Promise<SearchRepographOutput>`

### formatSearchResult

```typescript
formatSearchResult(output: SearchRepographOutput): string
```

Format search result for display

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `SearchRepographOutput` | はい |

**戻り値**: `string`

## インターフェース

### SearchRepographOutput

```typescript
interface SearchRepographOutput {
  success: boolean;
  error?: string;
  result?: EgographResult;
  indexPath?: string;
}
```

Output schema for search_repograph tool

## 型定義

### SearchRepographInput

```typescript
type SearchRepographInput = Static<typeof SearchRepographInput>
```

検索入力定義

---
*自動生成: 2026-02-28T13:55:20.089Z*
