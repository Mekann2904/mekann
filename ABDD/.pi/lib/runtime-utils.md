---
title: Runtime Utils
category: reference
audience: developer
last_updated: 2026-02-18
tags: [runtime, utilities, timeout, retry, error]
related: [retry-with-backoff, subagents, agent-teams]
---

# Runtime Utils

サブエージェントとエージェントチーム実行用のランタイムユーティリティ。タイムアウト処理、リトライスキーマ、エラーフォーマットユーティリティを提供する。

## 関数

### trimForError

エラー表示用にメッセージをトリムし、空白を正規化する。

```typescript
function trimForError(message: string, maxLength = 600): string
```

#### パラメータ

- `message`: トリムするメッセージ
- `maxLength`: 最大長（デフォルト: 600）

#### 戻り値

トリムされたメッセージ

### buildRateLimitKey

プロバイダーとモデルからレート制限キーを構築する。

```typescript
function buildRateLimitKey(provider: string, model: string): string
```

#### 戻り値

正規化されたレート制限キー（例: `anthropic::claude-sonnet-4-20250514`）

### buildTraceTaskId

デバッグとロギング用のトレースタスクIDを構築する。

```typescript
function buildTraceTaskId(
  traceId: string | undefined,
  delegateId: string,
  sequence: number,
): string
```

#### 戻り値

フォーマットされたトレースタスクID（例: `trace-123:delegate-456:1`）

### normalizeTimeoutMs

タイムアウト値（ミリ秒）を正規化する。

```typescript
function normalizeTimeoutMs(value: unknown, fallback: number): number
```

#### パラメータ

- `value`: タイムアウト値（unknown型）
- `fallback`: 無効な場合のフォールバック値

#### 戻り値

正規化されたタイムアウト（ミリ秒）

### createRetrySchema

ツール入力検証用のリトライスキーマを作成する。

```typescript
function createRetrySchema()
```

#### 戻り値

リトライオプション用のTypeBoxスキーマ

### toRetryOverrides

リトライ入力値をRetryWithBackoffOverridesに変換する。

注意: これは「不安定」バージョンであり、STABLE_*_RUNTIMEをチェックしない。拡張機能（subagents.ts, agent-teams.ts）には、安定モードでundefinedを返す独自のローカルバージョンがある。拡張機能からこの関数を使用する場合、呼び出し元で安定モードチェックを処理する必要がある。

```typescript
function toRetryOverrides(value: unknown): RetryWithBackoffOverrides | undefined
```

### toConcurrencyLimit

同時実行制限入力を数値に変換する。

```typescript
function toConcurrencyLimit(value: unknown, fallback: number): number
```

#### パラメータ

- `value`: 生の同時実行制限値
- `fallback`: 無効な場合のフォールバック値

#### 戻り値

正規化された同時実行制限

## 使用例

```typescript
import {
  trimForError,
  buildRateLimitKey,
  buildTraceTaskId,
  normalizeTimeoutMs,
  toConcurrencyLimit,
} from "./runtime-utils.js";

// エラーメッセージのトリム
const shortError = trimForError(longErrorMessage, 200);

// レート制限キーの構築
const key = buildRateLimitKey("anthropic", "claude-sonnet-4-20250514");
// => "anthropic::claude-sonnet-4-20250514"

// トレースIDの構築
const traceId = buildTraceTaskId("trace-123", "delegate-456", 1);
// => "trace-123:delegate-456:1"

// タイムアウトの正規化
const timeout = normalizeTimeoutMs(userInput, 120000);

// 同時実行制限の正規化
const concurrency = toConcurrencyLimit(userInput, 5);
```
