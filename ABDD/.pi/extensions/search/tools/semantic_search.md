---
title: semantic_search
category: api-reference
audience: developer
last_updated: 2026-02-23
tags: [auto-generated]
related: []
---

# semantic_search

## 概要

`semantic_search` モジュールのAPIリファレンス。

## インポート

```typescript
// from 'node:fs': existsSync, readFileSync
// from 'node:path': join
// from '../types.js': SemanticSearchInput, SemanticSearchOutput, SemanticSearchResult, ...
// from '../utils/constants.js': INDEX_DIR_NAME
// from '../../../lib/embeddings/utils.js': cosineSimilarity
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `semanticSearch` | 意味的検索を実行する |
| 関数 | `formatSemanticSearch` | 検索結果を整形する |

## 図解

### 依存関係図

```mermaid
flowchart LR
  subgraph this[semantic_search]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    types["types"]
    constants["constants"]
    utils["utils"]
  end
  main --> local
```

### 関数フロー

```mermaid
flowchart TD
  findNearestNeighbors["findNearestNeighbors()"]
  formatSemanticSearch["formatSemanticSearch()"]
  getIndexPath["getIndexPath()"]
  loadIndex["loadIndex()"]
  semanticSearch["semanticSearch()"]
  loadIndex --> getIndexPath
  semanticSearch --> findNearestNeighbors
  semanticSearch --> loadIndex
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant semantic_search as "semantic_search"
  participant types as "types"
  participant constants as "constants"

  Caller->>semantic_search: semanticSearch()
  activate semantic_search
  Note over semantic_search: 非同期処理開始
  semantic_search->>types: 内部関数呼び出し
  types-->>semantic_search: 結果
  deactivate semantic_search
  semantic_search-->>Caller: Promise_SemanticSear

  Caller->>semantic_search: formatSemanticSearch()
  semantic_search-->>Caller: string
```

## 関数

### getIndexPath

```typescript
getIndexPath(cwd: string): string
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| cwd | `string` | はい |

**戻り値**: `string`

### loadIndex

```typescript
loadIndex(cwd: string): CodeEmbedding[]
```

Load the semantic index from disk.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| cwd | `string` | はい |

**戻り値**: `CodeEmbedding[]`

### findNearestNeighbors

```typescript
findNearestNeighbors(queryVector: number[], items: CodeEmbedding[], k: number, threshold: number): Array<{ item: CodeEmbedding; similarity: number }>
```

Find the k nearest neighbors to a query vector.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| queryVector | `number[]` | はい |
| items | `CodeEmbedding[]` | はい |
| k | `number` | はい |
| threshold | `number` | はい |

**戻り値**: `Array<{ item: CodeEmbedding; similarity: number }>`

### semanticSearch

```typescript
async semanticSearch(input: SemanticSearchInput, cwd: string): Promise<SemanticSearchOutput>
```

意味的検索を実行する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| input | `SemanticSearchInput` | はい |
| cwd | `string` | はい |

**戻り値**: `Promise<SemanticSearchOutput>`

### formatSemanticSearch

```typescript
formatSemanticSearch(result: SemanticSearchOutput): string
```

検索結果を整形する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| result | `SemanticSearchOutput` | はい |

**戻り値**: `string`

---
*自動生成: 2026-02-23T06:29:42.137Z*
