---
title: utils
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated]
related: []
---

# utils

## 概要

`utils` モジュールのAPIリファレンス。

## インポート

```typescript
import { VectorSearchResult } from './types.js';
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `cosineSimilarity` | 2つのベクトル間のコサイン類似度を計算 |
| 関数 | `euclideanDistance` | Calculate Euclidean distance between two vectors. |
| 関数 | `normalizeVector` | ベクトルを正規化する |
| 関数 | `addVectors` | 2つのベクトルの要素ごとの和を計算する |
| 関数 | `subtractVectors` | 2つのベクトルの要素ごとの差を計算する |
| 関数 | `scaleVector` | ベクトルをスカラー倍する |
| 関数 | `meanVector` | 複数のベクトルの平均を計算する |
| 関数 | `findNearestNeighbors` | クエリベクトルに類似した上位k件を検索します。 |
| 関数 | `findBySimilarityThreshold` | 類似度の閾値を超えるアイテムを検索 |
| 関数 | `isValidEmbedding` | 値が有効な埋め込みベクトルか判定 |
| 関数 | `zeroVector` | Create a zero vector of specified dimensions. |
| 関数 | `vectorNorm` | ベクトルのノルム（大きさ）を計算します。 |
| 関数 | `dotProduct` | 2つのベクトルの内積を計算する。 |

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
  cosineSimilarity["cosineSimilarity()"]
  euclideanDistance["euclideanDistance()"]
  normalizeVector["normalizeVector()"]
  addVectors["addVectors()"]
  subtractVectors["subtractVectors()"]
  scaleVector["scaleVector()"]
  cosineSimilarity -.-> euclideanDistance
  euclideanDistance -.-> normalizeVector
  normalizeVector -.-> addVectors
  addVectors -.-> subtractVectors
  subtractVectors -.-> scaleVector
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

2つのベクトル間のコサイン類似度を計算

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

Calculate Euclidean distance between two vectors.

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

ベクトルを正規化する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| vector | `number[]` | はい |

**戻り値**: `number[]`

### addVectors

```typescript
addVectors(a: number[], b: number[]): number[]
```

2つのベクトルの要素ごとの和を計算する

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

2つのベクトルの要素ごとの差を計算する

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

ベクトルをスカラー倍する

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

複数のベクトルの平均を計算する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| vectors | `number[][]` | はい |

**戻り値**: `number[] | null`

### findNearestNeighbors

```typescript
findNearestNeighbors(queryVector: number[], items: T[], k: number): VectorSearchResult<T>[]
```

クエリベクトルに類似した上位k件を検索します。

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

値が有効な埋め込みベクトルか判定

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| value | `unknown` | はい |

**戻り値**: `value is number[]`

### zeroVector

```typescript
zeroVector(dimensions: number): number[]
```

Create a zero vector of specified dimensions.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| dimensions | `number` | はい |

**戻り値**: `number[]`

### vectorNorm

```typescript
vectorNorm(vector: number[]): number
```

ベクトルのノルム（大きさ）を計算します。

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| vector | `number[]` | はい |

**戻り値**: `number`

### dotProduct

```typescript
dotProduct(a: number[], b: number[]): number
```

2つのベクトルの内積を計算する。

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| a | `number[]` | はい |
| b | `number[]` | はい |

**戻り値**: `number`

---
*自動生成: 2026-02-18T07:17:30.442Z*
