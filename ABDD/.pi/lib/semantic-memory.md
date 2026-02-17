---
title: Semantic Memory
category: reference
audience: developer
last_updated: 2026-02-18
tags: [semantic, memory, embedding, search, vector]
related: [run-index, embeddings, pattern-extraction]
---

# Semantic Memory

エンベディングプロバイダーを使用して実行履歴のセマンティック検索を提供するモジュール。ベクトル類似度による「類似タスクの検索」機能を可能にする。

このモジュールは実際のエンベディング生成にembeddings/サブモジュールを使用する。

## 型定義

### RunEmbedding

実行のベクトルエンベディング。

```typescript
interface RunEmbedding {
  runId: string;
  embedding: number[];
  text: string;       // エンベディングされたテキスト
  timestamp: string;
}
```

### SemanticMemoryStorage

セマンティックメモリストレージ。

```typescript
interface SemanticMemoryStorage {
  version: number;
  lastUpdated: string;
  embeddings: RunEmbedding[];
  model: string;
  dimensions: number;
}
```

### SemanticSearchResult

セマンティック検索結果。

```typescript
interface SemanticSearchResult {
  run: IndexedRun;
  similarity: number;
  embedding: RunEmbedding;
}
```

## 定数

### SEMANTIC_MEMORY_VERSION

```typescript
export const SEMANTIC_MEMORY_VERSION = 1;
```

### EMBEDDING_MODEL

```typescript
export const EMBEDDING_MODEL = "text-embedding-3-small";
```

### EMBEDDING_DIMENSIONS

```typescript
export const EMBEDDING_DIMENSIONS = 1536;
```

## 関数

### generateEmbedding (非推奨)

設定されたプロバイダーを使用してテキストのエンベディングを生成する。

```typescript
async function generateEmbedding(text: string): Promise<number[] | null>
```

### generateEmbeddingsBatch (非推奨)

複数のテキストのエンベディングをバッチで生成する。

```typescript
async function generateEmbeddingsBatch(
  texts: string[]
): Promise<(number[] | null)[]>
```

### isSemanticMemoryAvailable

セマンティックメモリが利用可能かどうかを確認する（プロバイダーが設定されているか）。

```typescript
function isSemanticMemoryAvailable(): boolean
```

### findNearestNeighbors

クエリベクトルに最も近いk個の近傍を見つける。

```typescript
function findNearestNeighbors(
  queryVector: number[],
  embeddings: RunEmbedding[],
  k: number = 5
): Array<{ embedding: RunEmbedding; similarity: number }>
```

### getSemanticMemoryPath

セマンティックメモリストレージファイルのパスを取得する。

```typescript
function getSemanticMemoryPath(cwd: string): string
```

### loadSemanticMemory

ディスクからセマンティックメモリストレージを読み込む。

```typescript
function loadSemanticMemory(cwd: string): SemanticMemoryStorage
```

### saveSemanticMemory

セマンティックメモリストレージをディスクに保存する。

```typescript
function saveSemanticMemory(cwd: string, storage: SemanticMemoryStorage): void
```

### buildSemanticMemoryIndex

実行インデックスからセマンティックメモリインデックスを構築する。全実行のエンベディングを生成する。

```typescript
async function buildSemanticMemoryIndex(
  cwd: string,
  batchSize: number = 20
): Promise<SemanticMemoryStorage>
```

### addRunToSemanticMemory

単一の実行をセマンティックメモリに追加する。

```typescript
async function addRunToSemanticMemory(
  cwd: string,
  run: IndexedRun
): Promise<void>
```

### semanticSearch

セマンティック類似度を使用して類似実行を検索する。

```typescript
async function semanticSearch(
  cwd: string,
  query: string,
  options?: {
    limit?: number;
    status?: "completed" | "failed";
    minSimilarity?: number;
  }
): Promise<SemanticSearchResult[]>
```

### findSimilarRunsById

指定された実行IDに類似する実行を検索する。

```typescript
function findSimilarRunsById(
  cwd: string,
  runId: string,
  limit: number = 5
): SemanticSearchResult[]
```

### getSemanticMemoryStats

セマンティックメモリの統計を取得する。

```typescript
function getSemanticMemoryStats(cwd: string): {
  totalEmbeddings: number;
  lastUpdated: string;
  model: string;
  isAvailable: boolean;
}
```

### clearSemanticMemory

セマンティックメモリインデックスをクリアする。

```typescript
function clearSemanticMemory(cwd: string): void
```
