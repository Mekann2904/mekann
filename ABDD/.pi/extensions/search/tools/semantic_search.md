---
title: semantic_search
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated]
related: []
---

# semantic_search

## 概要

`semantic_search` モジュールのAPIリファレンス。

## インポート

```typescript
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SemanticSearchInput, SemanticSearchOutput, SemanticSearchResult... } from '../types.js';
import { INDEX_DIR_NAME } from '../utils/constants.js';
import { cosineSimilarity } from '../../../lib/embeddings/utils.js';
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `semanticSearch` | コードの意味検索を行う |
| 関数 | `formatSemanticSearch` | セマンティック検索の結果を整形します。 |

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
  semanticSearch["semanticSearch()"]
  formatSemanticSearch["formatSemanticSearch()"]
  semanticSearch -.-> formatSemanticSearch
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

コードの意味検索を行う

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

セマンティック検索の結果を整形します。

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| result | `SemanticSearchOutput` | はい |

**戻り値**: `string`

---
*自動生成: 2026-02-18T07:17:30.288Z*
