---
title: call_graph
category: api-reference
audience: developer
last_updated: 2026-02-17
tags: [auto-generated]
related: []
---

# call_graph

## 概要

`call_graph` モジュールのAPIリファレンス。

## インポート

```typescript
import { CallGraphIndexInput, CallGraphIndexOutput, FindCallersInput... } from '../call-graph/types.js';
import { buildCallGraph, saveCallGraphIndex, readCallGraphIndex... } from '../call-graph/builder.js';
import { findCallers, findCallees } from '../call-graph/query.js';
import { symIndex, readSymbolIndex } from './sym_index.js';
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `callGraphIndex` | Generate or update call graph index. |
| 関数 | `findCallersTool` | Find all functions that call the given symbol. |
| 関数 | `findCalleesTool` | Find all functions called by the given symbol. |
| 関数 | `formatCallGraphIndex` | Format call graph index result for display. |
| 関数 | `formatCallers` | Format callers result for display. |
| 関数 | `formatCallees` | Format callees result for display. |

## 図解

### 依存関係図

```mermaid
flowchart LR
  subgraph this[call_graph]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    types_js[types.js]
    builder_js[builder.js]
    query_js[query.js]
    sym_index_js[sym_index.js]
  end
  main --> local
```

### 関数フロー

```mermaid
flowchart TD
  callGraphIndex["callGraphIndex()"]
  findCallersTool["findCallersTool()"]
  findCalleesTool["findCalleesTool()"]
  formatCallGraphIndex["formatCallGraphIndex()"]
  formatCallers["formatCallers()"]
  formatCallees["formatCallees()"]
  callGraphIndex -.-> findCallersTool
  findCallersTool -.-> findCalleesTool
  findCalleesTool -.-> formatCallGraphIndex
  formatCallGraphIndex -.-> formatCallers
  formatCallers -.-> formatCallees
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant call_graph as call_graph
  participant types_js as types.js
  participant builder_js as builder.js

  Caller->>call_graph: callGraphIndex()
  activate call_graph
  Note over call_graph: 非同期処理開始
  call_graph->>types_js: 内部関数呼び出し
  types_js-->>call_graph: 結果
  deactivate call_graph
  call_graph-->>Caller: Promise<CallGraphIndexOutput>

  Caller->>call_graph: findCallersTool()
  activate call_graph
  call_graph-->>Caller: Promise<FindCallersOutput>
  deactivate call_graph
```

## 関数

### callGraphIndex

```typescript
async callGraphIndex(input: CallGraphIndexInput, cwd: string): Promise<CallGraphIndexOutput>
```

Generate or update call graph index.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| input | `CallGraphIndexInput` | はい |
| cwd | `string` | はい |

**戻り値**: `Promise<CallGraphIndexOutput>`

### findCallersTool

```typescript
async findCallersTool(input: FindCallersInput, cwd: string): Promise<FindCallersOutput>
```

Find all functions that call the given symbol.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| input | `FindCallersInput` | はい |
| cwd | `string` | はい |

**戻り値**: `Promise<FindCallersOutput>`

### findCalleesTool

```typescript
async findCalleesTool(input: FindCalleesInput, cwd: string): Promise<FindCalleesOutput>
```

Find all functions called by the given symbol.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| input | `FindCalleesInput` | はい |
| cwd | `string` | はい |

**戻り値**: `Promise<FindCalleesOutput>`

### formatCallGraphIndex

```typescript
formatCallGraphIndex(result: CallGraphIndexOutput): string
```

Format call graph index result for display.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| result | `CallGraphIndexOutput` | はい |

**戻り値**: `string`

### formatCallers

```typescript
formatCallers(result: FindCallersOutput): string
```

Format callers result for display.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| result | `FindCallersOutput` | はい |

**戻り値**: `string`

### formatCallees

```typescript
formatCallees(result: FindCalleesOutput): string
```

Format callees result for display.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| result | `FindCalleesOutput` | はい |

**戻り値**: `string`

---
*自動生成: 2026-02-17T22:16:16.526Z*
