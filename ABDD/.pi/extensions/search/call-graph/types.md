---
title: types
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated]
related: []
---

# types

## 概要

`types` モジュールのAPIリファレンス。

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| インターフェース | `CallGraphNode` | コールグラフのノード |
| インターフェース | `CallSite` | 呼び出し箇所の位置情報 |
| インターフェース | `CallGraphEdge` | コールグラフのエッジを表す |
| インターフェース | `CallGraphMetadata` | コールグラフインデックスのメタデータ |
| インターフェース | `CallGraphIndex` | 呼び出しグラフの完全なインデックス |
| インターフェース | `CallGraphIndexInput` | call_graph_indexツールの入力 |
| インターフェース | `CallGraphIndexOutput` | call_graph_indexツールの出力 |
| インターフェース | `FindCallersInput` | find_callersツールの入力 |
| インターフェース | `FindCalleesInput` | find_calleesツールの入力 |
| インターフェース | `CallChainResult` | 呼び出しチェーンの結果情報 |
| インターフェース | `FindCallersOutput` | find_callersツールの出力形式 |
| インターフェース | `FindCalleesOutput` | 呼び出し先ツールの出力形式 |
| インターフェース | `FunctionDefinition` | コールグラフ構築用の中間構造 |
| インターフェース | `DetectedCall` | ソースコード内で検出された関数呼び出し |
| 型 | `CallGraphNodeKind` | 呼び出し可能なシンボルの種類 |

## 図解

### クラス図

```mermaid
classDiagram
  class CallGraphNode {
    <<interface>>
    +id: string
    +name: string
    +file: string
    +line: number
    +kind: CallGraphNodeKind
  }
  class CallSite {
    <<interface>>
    +file: string
    +line: number
    +column: number
  }
  class CallGraphEdge {
    <<interface>>
    +caller: string
    +callee: string
    +callSite: CallSite
    +confidence: number
  }
  class CallGraphMetadata {
    <<interface>>
    +indexedAt: number
    +parserBackend: ripgrep
    +fileCount: number
    +nodeCount: number
    +edgeCount: number
  }
  class CallGraphIndex {
    <<interface>>
    +nodes: CallGraphNode
    +edges: CallGraphEdge
    +metadata: CallGraphMetadata
  }
  class CallGraphIndexInput {
    <<interface>>
    +path: string
    +force: boolean
    +cwd: string
  }
  class CallGraphIndexOutput {
    <<interface>>
    +nodeCount: number
    +edgeCount: number
    +outputPath: string
    +error: string
  }
  class FindCallersInput {
    <<interface>>
    +symbolName: string
    +depth: number
    +limit: number
    +cwd: string
  }
  class FindCalleesInput {
    <<interface>>
    +symbolName: string
    +depth: number
    +limit: number
    +cwd: string
  }
  class CallChainResult {
    <<interface>>
    +node: CallGraphNode
    +depth: number
    +callSite: CallSite
    +confidence: number
  }
  class FindCallersOutput {
    <<interface>>
    +symbolName: string
    +total: number
    +truncated: boolean
    +results: CallChainResult
    +error: string
  }
  class FindCalleesOutput {
    <<interface>>
    +symbolName: string
    +total: number
    +truncated: boolean
    +results: CallChainResult
    +error: string
  }
  class FunctionDefinition {
    <<interface>>
    +name: string
    +file: string
    +line: number
    +kind: CallGraphNodeKind
    +scope: string
  }
  class DetectedCall {
    <<interface>>
    +name: string
    +file: string
    +line: number
    +column: number
    +text: string
  }
```

## インターフェース

### CallGraphNode

```typescript
interface CallGraphNode {
  id: string;
  name: string;
  file: string;
  line: number;
  kind: CallGraphNodeKind;
  scope?: string;
  signature?: string;
}
```

コールグラフのノード

### CallSite

```typescript
interface CallSite {
  file: string;
  line: number;
  column: number;
}
```

呼び出し箇所の位置情報

### CallGraphEdge

```typescript
interface CallGraphEdge {
  caller: string;
  callee: string;
  callSite: CallSite;
  confidence: number;
}
```

コールグラフのエッジを表す

### CallGraphMetadata

```typescript
interface CallGraphMetadata {
  indexedAt: number;
  parserBackend: "ripgrep";
  fileCount: number;
  nodeCount: number;
  edgeCount: number;
  version: number;
}
```

コールグラフインデックスのメタデータ

### CallGraphIndex

```typescript
interface CallGraphIndex {
  nodes: CallGraphNode[];
  edges: CallGraphEdge[];
  metadata: CallGraphMetadata;
}
```

呼び出しグラフの完全なインデックス

### CallGraphIndexInput

```typescript
interface CallGraphIndexInput {
  path?: string;
  force?: boolean;
  cwd?: string;
}
```

call_graph_indexツールの入力

### CallGraphIndexOutput

```typescript
interface CallGraphIndexOutput {
  nodeCount: number;
  edgeCount: number;
  outputPath: string;
  error?: string;
}
```

call_graph_indexツールの出力

### FindCallersInput

```typescript
interface FindCallersInput {
  symbolName: string;
  depth?: number;
  limit?: number;
  cwd?: string;
}
```

find_callersツールの入力

### FindCalleesInput

```typescript
interface FindCalleesInput {
  symbolName: string;
  depth?: number;
  limit?: number;
  cwd?: string;
}
```

find_calleesツールの入力

### CallChainResult

```typescript
interface CallChainResult {
  node: CallGraphNode;
  depth: number;
  callSite?: CallSite;
  confidence: number;
}
```

呼び出しチェーンの結果情報

### FindCallersOutput

```typescript
interface FindCallersOutput {
  symbolName: string;
  total: number;
  truncated: boolean;
  results: CallChainResult[];
  error?: string;
}
```

find_callersツールの出力形式

### FindCalleesOutput

```typescript
interface FindCalleesOutput {
  symbolName: string;
  total: number;
  truncated: boolean;
  results: CallChainResult[];
  error?: string;
}
```

呼び出し先ツールの出力形式

### FunctionDefinition

```typescript
interface FunctionDefinition {
  name: string;
  file: string;
  line: number;
  kind: CallGraphNodeKind;
  scope?: string;
  body?: string;
  bodyStartLine?: number;
  bodyEndLine?: number;
}
```

コールグラフ構築用の中間構造

### DetectedCall

```typescript
interface DetectedCall {
  name: string;
  file: string;
  line: number;
  column: number;
  text: string;
}
```

ソースコード内で検出された関数呼び出し

## 型定義

### CallGraphNodeKind

```typescript
type CallGraphNodeKind = "function" | "method" | "arrow" | "const"
```

呼び出し可能なシンボルの種類

---
*自動生成: 2026-02-18T07:17:30.271Z*
