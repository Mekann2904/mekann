---
title: query
category: api-reference
audience: developer
last_updated: 2026-02-17
tags: [auto-generated]
related: []
---

# query

## 概要

`query` モジュールのAPIリファレンス。

## インポート

```typescript
import { CallGraphIndex, CallGraphNode, CallGraphEdge... } from './types.js';
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `findNodesByName` | Find node by name in the index. |
| 関数 | `findNodeById` | Find node by ID. |
| 関数 | `findNodesByFile` | Find nodes by file path. |
| 関数 | `findCallers` | Find all functions that call the given symbol. |
| 関数 | `findCallees` | Find all functions called by the given symbol. |
| 関数 | `findCallPath` | Find call path between two symbols. |
| 関数 | `getNodeStats` | Get statistics for a function in the call graph. |

## 図解

### クラス図

```mermaid
classDiagram
  class CallerSearchState {
    <<interface>>
    +results: Map<stringCallChainResult>
    +queue: Array<namestringlevelnumbercallSiteCallGraphEdge[callSite]confidencenumber>
  }
```

### 依存関係図

```mermaid
flowchart LR
  subgraph this[query]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    types_js[types.js]
  end
  main --> local
```

### 関数フロー

```mermaid
flowchart TD
  findNodesByName["findNodesByName()"]
  findNodeById["findNodeById()"]
  findNodesByFile["findNodesByFile()"]
  findCallers["findCallers()"]
  findCallees["findCallees()"]
  findCallPath["findCallPath()"]
  findNodesByName -.-> findNodeById
  findNodeById -.-> findNodesByFile
  findNodesByFile -.-> findCallers
  findCallers -.-> findCallees
  findCallees -.-> findCallPath
```

## 関数

### findNodesByName

```typescript
findNodesByName(index: CallGraphIndex, symbolName: string): CallGraphNode[]
```

Find node by name in the index.
Returns all nodes with matching name (may have multiple with same name in different files).

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| index | `CallGraphIndex` | はい |
| symbolName | `string` | はい |

**戻り値**: `CallGraphNode[]`

### findNodeById

```typescript
findNodeById(index: CallGraphIndex, nodeId: string): CallGraphNode | undefined
```

Find node by ID.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| index | `CallGraphIndex` | はい |
| nodeId | `string` | はい |

**戻り値**: `CallGraphNode | undefined`

### findNodesByFile

```typescript
findNodesByFile(index: CallGraphIndex, filePath: string): CallGraphNode[]
```

Find nodes by file path.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| index | `CallGraphIndex` | はい |
| filePath | `string` | はい |

**戻り値**: `CallGraphNode[]`

### findCallers

```typescript
findCallers(index: CallGraphIndex, symbolName: string, depth: number, limit: number): CallChainResult[]
```

Find all functions that call the given symbol.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| index | `CallGraphIndex` | はい |
| symbolName | `string` | はい |
| depth | `number` | はい |
| limit | `number` | はい |

**戻り値**: `CallChainResult[]`

### findCallees

```typescript
findCallees(index: CallGraphIndex, symbolName: string, depth: number, limit: number): CallChainResult[]
```

Find all functions called by the given symbol.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| index | `CallGraphIndex` | はい |
| symbolName | `string` | はい |
| depth | `number` | はい |
| limit | `number` | はい |

**戻り値**: `CallChainResult[]`

### findCallPath

```typescript
findCallPath(index: CallGraphIndex, fromSymbol: string, toSymbol: string, maxDepth: number): CallGraphNode[] | null
```

Find call path between two symbols.
Uses BFS to find shortest path.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| index | `CallGraphIndex` | はい |
| fromSymbol | `string` | はい |
| toSymbol | `string` | はい |
| maxDepth | `number` | はい |

**戻り値**: `CallGraphNode[] | null`

### getNodeStats

```typescript
getNodeStats(index: CallGraphIndex, symbolName: string): {
	node: CallGraphNode | null;
	directCallers: number;
	directCallees: number;
	totalCallers: number;
	totalCallees: number;
}
```

Get statistics for a function in the call graph.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| index | `CallGraphIndex` | はい |
| symbolName | `string` | はい |

**戻り値**: `{
	node: CallGraphNode | null;
	directCallers: number;
	directCallees: number;
	totalCallers: number;
	totalCallees: number;
}`

## インターフェース

### CallerSearchState

```typescript
interface CallerSearchState {
  results: Map<string, CallChainResult>;
  queue: Array<{ name: string; level: number; callSite?: CallGraphEdge["callSite"]; confidence: number }>;
}
```

---
*自動生成: 2026-02-17T21:48:27.563Z*
