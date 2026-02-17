---
title: token-bucket
category: api-reference
audience: developer
last_updated: 2026-02-17
tags: [auto-generated]
related: []
---

# token-bucket

## 概要

`token-bucket` モジュールのAPIリファレンス。

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `getTokenBucketRateLimiter` | Get the singleton rate limiter instance. |
| 関数 | `createTokenBucketRateLimiter` | Create a new rate limiter (for testing). |
| 関数 | `resetTokenBucketRateLimiter` | Reset the singleton rate limiter (for testing). |
| インターフェース | `RateLimitConfig` | Rate limit configuration for a provider/model. |
| インターフェース | `RateLimiterStats` | Rate limiter statistics. |
| インターフェース | `TokenBucketRateLimiter` | Token bucket rate limiter interface. |

## 図解

### クラス図

```mermaid
classDiagram
  class TokenBucketRateLimiterImpl {
    -buckets: Map<stringTokenBucketState>
    -configs: Map<stringRateLimitConfig>
    +canProceed
    +consume
    +record429
    +recordSuccess
    +getStats
  }
  class TokenBucketState {
    <<interface>>
    +tokens: number
    +maxTokens: number
    +refillRate: number
    +lastRefillMs: number
    +retryAfterMs: number
  }
  class RateLimitConfig {
    <<interface>>
    +rpm: number
    +burstMultiplier: number
    +minIntervalMs: number
  }
  class RateLimiterStats {
    <<interface>>
    +trackedModels: number
    +blockedModels: string[]
    +avgAvailableTokens: number
    +lowCapacityModels: string[]
  }
  class TokenBucketRateLimiter {
    <<interface>>
  }
```

### 関数フロー

```mermaid
flowchart TD
  getTokenBucketRateLimiter["getTokenBucketRateLimiter()"]
  createTokenBucketRateLimiter["createTokenBucketRateLimiter()"]
  resetTokenBucketRateLimiter["resetTokenBucketRateLimiter()"]
  getTokenBucketRateLimiter -.-> createTokenBucketRateLimiter
  createTokenBucketRateLimiter -.-> resetTokenBucketRateLimiter
```

## 関数

### getTokenBucketRateLimiter

```typescript
getTokenBucketRateLimiter(): TokenBucketRateLimiterImpl
```

Get the singleton rate limiter instance.

**戻り値**: `TokenBucketRateLimiterImpl`

### createTokenBucketRateLimiter

```typescript
createTokenBucketRateLimiter(): TokenBucketRateLimiterImpl
```

Create a new rate limiter (for testing).

**戻り値**: `TokenBucketRateLimiterImpl`

### resetTokenBucketRateLimiter

```typescript
resetTokenBucketRateLimiter(): void
```

Reset the singleton rate limiter (for testing).

**戻り値**: `void`

## クラス

### TokenBucketRateLimiterImpl

Token bucket rate limiter with RPM support and burst tolerance.

**プロパティ**

| 名前 | 型 | 可視性 |
|------|-----|--------|
| buckets | `Map<string, TokenBucketState>` | private |
| configs | `Map<string, RateLimitConfig>` | private |

**メソッド**

| 名前 | シグネチャ |
|------|------------|
| canProceed | `canProceed(provider, model, tokensNeeded): number` |
| consume | `consume(provider, model, tokens): void` |
| record429 | `record429(provider, model, retryAfterMs): void` |
| recordSuccess | `recordSuccess(provider, model): void` |
| getStats | `getStats(): RateLimiterStats` |
| configure | `configure(provider, model, config): void` |
| reset | `reset(provider, model): void` |
| resetAll | `resetAll(): void` |
| getBucketState | `getBucketState(provider, model): TokenBucketState | undefined` |
| getKey | `getKey(provider, model): string` |
| getConfig | `getConfig(provider, model): RateLimitConfig` |
| getOrCreateState | `getOrCreateState(key, provider, model): TokenBucketState` |
| refillTokens | `refillTokens(state): void` |

## インターフェース

### TokenBucketState

```typescript
interface TokenBucketState {
  tokens: number;
  maxTokens: number;
  refillRate: number;
  lastRefillMs: number;
  retryAfterMs: number;
  burstMultiplier: number;
  burstTokensUsed: number;
}
```

Token bucket state for a provider/model combination.

### RateLimitConfig

```typescript
interface RateLimitConfig {
  rpm: number;
  burstMultiplier: number;
  minIntervalMs: number;
}
```

Rate limit configuration for a provider/model.

### RateLimiterStats

```typescript
interface RateLimiterStats {
  trackedModels: number;
  blockedModels: string[];
  avgAvailableTokens: number;
  lowCapacityModels: string[];
}
```

Rate limiter statistics.

### TokenBucketRateLimiter

```typescript
interface TokenBucketRateLimiter {
  canProceed(provider, model, tokensNeeded);
  consume(provider, model, tokens);
  record429(provider, model, retryAfterMs);
  recordSuccess(provider, model);
  getStats();
}
```

Token bucket rate limiter interface.

---
*自動生成: 2026-02-17T22:24:18.985Z*
