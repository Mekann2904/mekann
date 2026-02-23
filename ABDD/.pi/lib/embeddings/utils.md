---
title: utils
category: api-reference
audience: developer
last_updated: 2026-02-23
tags: [auto-generated]
related: []
---

# utils

## 概要

`utils` モジュールのAPIリファレンス。

## インポート

```typescript
// from './types.js': VectorSearchResult
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `cosineSimilarity` | コサイン類似度を計算 |
| 関数 | `euclideanDistance` | ユークリッド距離を算出 |
| 関数 | `normalizeVector` | ベクトルを正規化 |
| 関数 | `addVectors` | ベクトル同士の加算 |
| 関数 | `subtractVectors` | ベクトル同士の減算 |
| 関数 | `scaleVector` | ベクトルをスカラー倍 |
| 関数 | `meanVector` | ベクトル集合の平均ベクトルを計算 |
| 関数 | `findNearestNeighbors` | クエリベクトルに類似した上位k件を検索 |
| 関数 | `findBySimilarityThreshold` | 類似度の閾値を超えるアイテムを検索 |
| 関数 | `isValidEmbedding` | 埋め込みベクトルか検証 |
| 関数 | `zeroVector` | ゼロベクトルを生成 |
| 関数 | `vectorNorm` | ベクトルのノルムを計算 |
| 関数 | `dotProduct` | 内積を計算 |

## 図解

### 依存関係図

```mermaid
flowchart LR
  subgraph this[utils]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    types["types"]
  end
  main --> local
```

### 関数フロー

```mermaid
flowchart TD
  addVectors["addVectors()"]
  cosineSimilarity["cosineSimilarity()"]
  dotProduct["dotProduct()"]
  euclideanDistance["euclideanDistance()"]
  findBySimilarityThreshold["findBySimilarityThreshold()"]
  findNearestNeighbors["findNearestNeighbors()"]
  isValidEmbedding["isValidEmbedding()"]
  meanVector["meanVector()"]
  normalizeVector["normalizeVector()"]
  scaleVector["scaleVector()"]
  subtractVectors["subtractVectors()"]
  vectorNorm["vectorNorm()"]
  zeroVector["zeroVector()"]
  findBySimilarityThreshold --> cosineSimilarity
  findNearestNeighbors --> cosineSimilarity
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant utils as "utils"
  participant types as "types"

  Caller->>utils: cosineSimilarity()
  utils->>types: 内部関数呼び出し
  types-->>utils: 結果
  utils-->>Caller: number

  Caller->>utils: euclideanDistance()
  utils-->>Caller: number
```

## 関数

### cosineSimilarity

```typescript
cosineSimilarity(a: number[], b: number[]): number
```

コサイン類似度を計算

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| a | `number[]` | はい |
| b | `number[]` | はい |

**戻り値**: `number`

### euclideanDistance

```typescript
euclideanDistance(a: number[], b: number[]): number
```

ユークリッド距離を算出

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| a | `number[]` | はい |
| b | `number[]` | はい |

**戻り値**: `number`

### normalizeVector

```typescript
normalizeVector(vector: number[]): number[]
```

ベクトルを正規化

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| vector | `number[]` | はい |

**戻り値**: `number[]`

### addVectors

```typescript
addVectors(a: number[], b: number[]): number[]
```

ベクトル同士の加算

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| a | `number[]` | はい |
| b | `number[]` | はい |

**戻り値**: `number[]`

### subtractVectors

```typescript
subtractVectors(a: number[], b: number[]): number[]
```

ベクトル同士の減算

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| a | `number[]` | はい |
| b | `number[]` | はい |

**戻り値**: `number[]`

### scaleVector

```typescript
scaleVector(vector: number[], scalar: number): number[]
```

ベクトルをスカラー倍

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| vector | `number[]` | はい |
| scalar | `number` | はい |

**戻り値**: `number[]`

### meanVector

```typescript
meanVector(vectors: number[][]): number[] | null
```

ベクトル集合の平均ベクトルを計算

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| vectors | `number[][]` | はい |

**戻り値**: `number[] | null`

### findNearestNeighbors

```typescript
findNearestNeighbors(queryVector: number[], items: T[], k: number): VectorSearchResult<T>[]
```

クエリベクトルに類似した上位k件を検索

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| queryVector | `number[]` | はい |
| items | `T[]` | はい |
| k | `number` | はい |

**戻り値**: `VectorSearchResult<T>[]`

### findBySimilarityThreshold

```typescript
findBySimilarityThreshold(queryVector: number[], items: T[], threshold: number): VectorSearchResult<T>[]
```

類似度の閾値を超えるアイテムを検索

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| queryVector | `number[]` | はい |
| items | `T[]` | はい |
| threshold | `number` | はい |

**戻り値**: `VectorSearchResult<T>[]`

### isValidEmbedding

```typescript
isValidEmbedding(value: unknown): value is number[]
```

埋め込みベクトルか検証

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| value | `unknown` | はい |

**戻り値**: `value is number[]`

### zeroVector

```typescript
zeroVector(dimensions: number): number[]
```

ゼロベクトルを生成

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| dimensions | `number` | はい |

**戻り値**: `number[]`

### vectorNorm

```typescript
vectorNorm(vector: number[]): number
```

ベクトルのノルムを計算

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| vector | `number[]` | はい |

**戻り値**: `number`

### dotProduct

```typescript
dotProduct(a: number[], b: number[]): number
```

内積を計算

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| a | `number[]` | はい |
| b | `number[]` | はい |

**戻り値**: `number`

---
*自動生成: 2026-02-23T06:29:42.322Z*
