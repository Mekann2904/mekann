---
title: cache
category: api-reference
audience: developer
last_updated: 2026-02-17
tags: [auto-generated]
related: []
---

# cache

## 概要

`cache` モジュールのAPIリファレンス。

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `getCacheKey` | Generate a cache key from tool name and parameters |
| 関数 | `getSearchCache` | Get the global cache instance. |
| 関数 | `resetSearchCache` | Reset the global cache instance (for testing). |
| 関数 | `getOrCompute` | Get or compute a cached result. |
| 関数 | `getOrComputeSync` | Sync version of getOrCompute. |
| クラス | `SearchResultCache` | Type-safe cache store with TTL support. |
| インターフェース | `CacheEntry` | A single cache entry with metadata. |
| インターフェース | `CacheConfig` | Cache configuration. |
| インターフェース | `CacheStats` | Cache statistics. |

## 図解

### クラス図

```mermaid
classDiagram
  class SearchResultCache {
    -cache: any
    -config: CacheConfig
    -hits: any
    -misses: any
    +getCached
    +setCache
    +has
    +invalidateCache
    +invalidateTool
  }
  class CacheEntry {
    <<interface>>
    +timestamp: number
    +ttl: number
    +params: Record<stringunknown>
    +result: T
  }
  class CacheConfig {
    <<interface>>
    +defaultTtl: number
    +maxEntries: number
    +enabled: boolean
  }
  class CacheStats {
    <<interface>>
    +entries: number
    +hits: number
    +misses: number
    +hitRate: number
  }
```

### 関数フロー

```mermaid
flowchart TD
  getCacheKey["getCacheKey()"]
  getSearchCache["getSearchCache()"]
  resetSearchCache["resetSearchCache()"]
  getOrCompute["getOrCompute()"]
  getOrComputeSync["getOrComputeSync()"]
  getCacheKey -.-> getSearchCache
  getSearchCache -.-> resetSearchCache
  resetSearchCache -.-> getOrCompute
  getOrCompute -.-> getOrComputeSync
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant cache as "cache"

  Caller->>cache: getCacheKey()
  cache-->>Caller: string

  Caller->>cache: getSearchCache()
  cache-->>Caller: SearchResultCache
```

## 関数

### getCacheKey

```typescript
getCacheKey(tool: string, params: Record<string, unknown>): string
```

Generate a cache key from tool name and parameters.
Creates a deterministic string representation.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| tool | `string` | はい |
| params | `Record<string, unknown>` | はい |

**戻り値**: `string`

### sortObjectKeys

```typescript
sortObjectKeys(obj: Record<string, unknown>): Record<string, unknown>
```

Sort object keys recursively for consistent serialization.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| obj | `Record<string, unknown>` | はい |

**戻り値**: `Record<string, unknown>`

### getSearchCache

```typescript
getSearchCache(): SearchResultCache
```

Get the global cache instance.

**戻り値**: `SearchResultCache`

### resetSearchCache

```typescript
resetSearchCache(): void
```

Reset the global cache instance (for testing).

**戻り値**: `void`

### getOrCompute

```typescript
async getOrCompute(tool: string, params: Record<string, unknown>, factory: () => Promise<T>, ttl?: number): Promise<T>
```

Get or compute a cached result.
If the result is not cached, calls the factory function and caches the result.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| tool | `string` | はい |
| params | `Record<string, unknown>` | はい |
| factory | `() => Promise<T>` | はい |
| ttl | `number` | いいえ |

**戻り値**: `Promise<T>`

### getOrComputeSync

```typescript
getOrComputeSync(tool: string, params: Record<string, unknown>, factory: () => T, ttl?: number): T
```

Sync version of getOrCompute.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| tool | `string` | はい |
| params | `Record<string, unknown>` | はい |
| factory | `() => T` | はい |
| ttl | `number` | いいえ |

**戻り値**: `T`

## クラス

### SearchResultCache

Type-safe cache store with TTL support.

**プロパティ**

| 名前 | 型 | 可視性 |
|------|-----|--------|
| cache | `any` | private |
| config | `CacheConfig` | private |
| hits | `any` | private |
| misses | `any` | private |

**メソッド**

| 名前 | シグネチャ |
|------|------------|
| getCached | `getCached(key): T | undefined` |
| setCache | `setCache(key, result, ttl, params): void` |
| has | `has(key): boolean` |
| invalidateCache | `invalidateCache(pattern): number` |
| invalidateTool | `invalidateTool(tool): number` |
| clear | `clear(): void` |
| getStats | `getStats(): CacheStats` |
| getKeys | `getKeys(): string[]` |
| isExpired | `isExpired(entry): boolean` |
| evictOldest | `evictOldest(): void` |
| patternToRegex | `patternToRegex(pattern): RegExp` |

## インターフェース

### CacheEntry

```typescript
interface CacheEntry {
  timestamp: number;
  ttl: number;
  params: Record<string, unknown>;
  result: T;
}
```

A single cache entry with metadata.

### CacheConfig

```typescript
interface CacheConfig {
  defaultTtl: number;
  maxEntries: number;
  enabled: boolean;
}
```

Cache configuration.

### CacheStats

```typescript
interface CacheStats {
  entries: number;
  hits: number;
  misses: number;
  hitRate: number;
}
```

Cache statistics.

---
*自動生成: 2026-02-17T22:24:18.846Z*
