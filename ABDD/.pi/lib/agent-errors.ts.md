---
title: agent-errors.ts
category: reference
audience: developer
last_updated: 2026-02-18
tags: [agent, error, retry, classification]
related: [agent-common.ts, agent-types.ts, error-utils.ts]
---

# agent-errors.ts

共有エージェントエラーハンドリングユーティリティ。サブエージェントとチームメンバー実行の統一エラー分類と結果解決を提供する。

## 概要

拡張エラー分類（SCHEMA_VIOLATION, LOW_SUBSTANCE, EMPTY_OUTPUT）をサポートする。再試行可能エラーパターンはOCP準拠の設定可能な形式。

## 型定義

### ExtendedOutcomeCode

```typescript
type ExtendedOutcomeCode =
  | RunOutcomeCode
  | "SCHEMA_VIOLATION"
  | "LOW_SUBSTANCE"
  | "EMPTY_OUTPUT"
  | "PARSE_ERROR"
```

拡張エラー分類コード。

### ExtendedOutcomeSignal

```typescript
interface ExtendedOutcomeSignal extends Omit<RunOutcomeSignal, 'outcomeCode'> {
  outcomeCode: ExtendedOutcomeCode;
  semanticError?: string;
  schemaViolations?: string[];
  failedEntityIds?: string[];
}
```

拡張結果シグナル。

### FailureClassification

```typescript
type FailureClassification =
  | "rate_limit"
  | "capacity"
  | "timeout"
  | "quality"
  | "transient"
  | "permanent"
```

標準化された失敗分類。

### EntityResultItem

```typescript
interface EntityResultItem {
  status: "completed" | "failed";
  error?: string;
  summary?: string;
  entityId: string;
}
```

集計結果解決用の結果アイテム。

## 定数

### RETRY_POLICY

```typescript
const RETRY_POLICY: Record<FailureClassification, {
  retryable: boolean;
  maxRounds?: number;
}> = {
  rate_limit:  { retryable: false },
  capacity:    { retryable: false },
  timeout:     { retryable: true, maxRounds: 2 },
  quality:     { retryable: true, maxRounds: 2 },
  transient:   { retryable: true, maxRounds: 2 },
  permanent:   { retryable: false },
}
```

各失敗分類の再試行ポリシー。

## 関数

### 拡張エラー分類

#### classifySemanticError

出力コンテンツから意味的エラーを分類する。

```typescript
function classifySemanticError(
  output?: string,
  error?: unknown,
): { code: ExtendedOutcomeCode | null; details?: string[] }
```

#### resolveExtendedFailureOutcome

意味的エラー分類を含む拡張結果シグナルを解決する。

```typescript
function resolveExtendedFailureOutcome(
  error: unknown,
  output?: string,
  config?: EntityConfig,
): ExtendedOutcomeSignal
```

### 再試行可能パターン管理

#### getRetryablePatterns

再試行可能エラーパターンのリストを取得する。

```typescript
function getRetryablePatterns(): string[]
```

環境変数`PI_RETRYABLE_ERROR_PATTERNS`で拡張可能。

#### resetRetryablePatternsCache

キャッシュされたパターンをリセットする（テスト用）。

```typescript
function resetRetryablePatternsCache(): void
```

#### addRetryablePatterns

実行時にカスタム再試行可能パターンを追加する。

```typescript
function addRetryablePatterns(patterns: string[]): void
```

### 再試行判定

#### isRetryableEntityError

エラーがエンティティ実行で再試行可能か判定する。

```typescript
function isRetryableEntityError(
  error: unknown,
  statusCode: number | undefined,
  config: EntityConfig,
): boolean
```

#### isRetryableSubagentError

サブエージェントコンテキストで再試行可能か判定する。

```typescript
function isRetryableSubagentError(
  error: unknown,
  statusCode?: number,
): boolean
```

#### isRetryableTeamMemberError

チームメンバーコンテキストで再試行可能か判定する。

```typescript
function isRetryableTeamMemberError(
  error: unknown,
  statusCode?: number,
): boolean
```

### 失敗結果解決

#### resolveFailureOutcome

失敗したエンティティ実行の結果シグナルを解決する。

```typescript
function resolveFailureOutcome(
  error: unknown,
  config?: EntityConfig,
): RunOutcomeSignal
```

#### resolveSubagentFailureOutcome

サブエージェントコンテキストで失敗結果を解決する。

```typescript
function resolveSubagentFailureOutcome(error: unknown): RunOutcomeSignal
```

#### resolveTeamFailureOutcome

チームメンバーコンテキストで失敗結果を解決する。

```typescript
function resolveTeamFailureOutcome(error: unknown): RunOutcomeSignal
```

### 集計結果解決

#### resolveAggregateOutcome

複数エンティティ結果から集計結果を解決する。

```typescript
function resolveAggregateOutcome<T extends EntityResultItem>(
  results: T[],
  resolveEntityFailure: (error: unknown) => RunOutcomeSignal,
): RunOutcomeSignal & { failedEntityIds: string[] }
```

#### resolveSubagentParallelOutcome

サブエージェント並列実行の集計結果を解決する。

```typescript
function resolveSubagentParallelOutcome(
  results: Array<{ runRecord: { status: "completed" | "failed"; error?: string; summary?: string; agentId: string } }>,
): RunOutcomeSignal & { failedSubagentIds: string[] }
```

#### resolveTeamMemberAggregateOutcome

チームメンバー実行の集計結果を解決する。

```typescript
function resolveTeamMemberAggregateOutcome(
  memberResults: Array<{ status: "completed" | "failed"; error?: string; summary?: string; memberId: string }>,
): RunOutcomeSignal & { failedMemberIds: string[] }
```

### 標準化失敗分類

#### classifyFailureType

失敗を標準化カテゴリに分類する。

```typescript
function classifyFailureType(
  error: unknown,
  statusCode?: number,
): FailureClassification
```

#### shouldRetryByClassification

分類に基づいて再試行すべきか判定する。

```typescript
function shouldRetryByClassification(
  classification: FailureClassification,
  currentRound: number,
): boolean
```

### ユーティリティ

#### trimErrorMessage

エラーメッセージを切り詰める。

```typescript
function trimErrorMessage(message: string, maxLength = 200): string
```

#### buildDiagnosticContext

エラーメッセージ用の診断コンテキスト文字列を構築する。

```typescript
function buildDiagnosticContext(context: {
  provider?: string;
  model?: string;
  retries?: number;
  lastStatusCode?: number;
  lastRetryMessage?: string;
  rateLimitWaitMs?: number;
  rateLimitHits?: number;
  gateWaitMs?: number;
  gateHits?: number;
}): string
```

## 環境変数

| 変数名 | 説明 |
|--------|------|
| `PI_RETRYABLE_ERROR_PATTERNS` | 追加の再試行可能パターン（カンマ区切り） |

## 依存関係

- Layer 1: `agent-common`, `agent-types`
- Layer 0: `error-utils`

## 関連ファイル

- `.pi/lib/agent-common.ts` - エージェント共通ユーティリティ
- `.pi/lib/agent-types.ts` - エージェント型定義
- `.pi/lib/error-utils.ts` - エラーユーティリティ
