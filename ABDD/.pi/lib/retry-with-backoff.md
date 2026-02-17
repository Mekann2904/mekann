---
title: Retry With Backoff
category: reference
audience: developer
last_updated: 2026-02-18
tags: [retry, backoff, rate-limit, transient-error]
related: [subagents, agent-teams]
---

# Retry With Backoff

一時的なLLM障害に対する指数バックオフとジッター付きリトライヘルパー。サブエージェントとエージェントチームの429/5xx復旧ポリシーを一箇所に集約。

## 型定義

### RetryJitterMode

ジッターモード。

```typescript
type RetryJitterMode = "full" | "partial" | "none";
```

### RetryWithBackoffConfig

リトライ設定を表すインターフェース。

```typescript
interface RetryWithBackoffConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  multiplier: number;
  jitter: RetryJitterMode;
}
```

### RetryWithBackoffOverrides

リトライ設定のオーバーライド。

```typescript
type RetryWithBackoffOverrides = Partial<RetryWithBackoffConfig>;
```

### RetryAttemptContext

リトライ試行のコンテキスト。

```typescript
interface RetryAttemptContext {
  attempt: number;
  maxRetries: number;
  delayMs: number;
  statusCode?: number;
  error: unknown;
}
```

### RateLimitGateSnapshot

レート制限ゲートのスナップショット。

```typescript
interface RateLimitGateSnapshot {
  key: string;
  waitMs: number;
  hits: number;
  untilMs: number;
}
```

### RateLimitWaitContext

レート制限待機のコンテキスト。

```typescript
interface RateLimitWaitContext {
  key: string;
  waitMs: number;
  hits: number;
  untilMs: number;
}
```

## 関数

### resolveRetryWithBackoffConfig

リトライ設定を解決する。

```typescript
function resolveRetryWithBackoffConfig(
  cwd?: string,
  overrides?: RetryWithBackoffOverrides,
): RetryWithBackoffConfig
```

### extractRetryStatusCode

エラーからリトライステータスコードを抽出する。

```typescript
function extractRetryStatusCode(error: unknown): number | undefined
```

### isRetryableError

エラーがリトライ可能かどうかを判定する。

```typescript
function isRetryableError(error: unknown, statusCode?: number): boolean
```

### computeBackoffDelayMs

バックオフ遅延（ミリ秒）を計算する。

```typescript
function computeBackoffDelayMs(
  attempt: number,
  config: RetryWithBackoffConfig,
): number
```

### getRateLimitGateSnapshot

レート制限ゲートのスナップショットを取得する。

```typescript
function getRateLimitGateSnapshot(key: string | undefined): RateLimitGateSnapshot
```

### retryWithBackoff

指数バックオフ付きで操作をリトライする。

```typescript
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: RetryWithBackoffOptions = {},
): Promise<T>
```

## RetryWithBackoffOptions

```typescript
interface RetryWithBackoffOptions {
  cwd?: string;
  overrides?: RetryWithBackoffOverrides;
  signal?: AbortSignal;
  rateLimitKey?: string;
  maxRateLimitRetries?: number;
  maxRateLimitWaitMs?: number;
  onRateLimitWait?: (context: RateLimitWaitContext) => void;
  onRetry?: (context: RetryAttemptContext) => void;
  shouldRetry?: (error: unknown, statusCode?: number) => boolean;
}
```

## 設定ファイル

`.pi/config.json`でリトライ設定をカスタマイズ可能:

```json
{
  "retryWithBackoff": {
    "maxRetries": 3,
    "initialDelayMs": 800,
    "maxDelayMs": 4000,
    "multiplier": 2,
    "jitter": "none"
  }
}
```

## レート制限ゲート

共有レート制限状態を管理し、複数のリクエスト間でレート制限情報を共有する:

- `DEFAULT_RATE_LIMIT_GATE_BASE_DELAY_MS`: 800ms
- `MAX_RATE_LIMIT_GATE_DELAY_MS`: 120,000ms
- `RATE_LIMIT_GATE_TTL_MS`: 600,000ms (10分)
- `MAX_RATE_LIMIT_ENTRIES`: 64エントリ
