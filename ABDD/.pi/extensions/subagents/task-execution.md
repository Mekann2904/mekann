---
title: task-execution
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated]
related: []
---

# task-execution

## 概要

`task-execution` モジュールのAPIリファレンス。

## インポート

```typescript
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { trimForError, buildRateLimitKey } from '../../lib/runtime-utils.js';
import { toErrorMessage, extractStatusCodeFromMessage, classifyPressureError... } from '../../lib/error-utils.js';
import { createRunId } from '../../lib/agent-utils.js';
// ... and 10 more imports
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `normalizeSubagentOutput` | サブエージェントの出力を正規化する。 |
| 関数 | `isRetryableSubagentError` | サブエージェントのエラーが再試行可能か判定する |
| 関数 | `isEmptyOutputFailureMessage` | 空の出力失敗メッセージか判定 |
| 関数 | `buildFailureSummary` | 失敗の要約を構築する |
| 関数 | `resolveSubagentFailureOutcome` | サブエージェントの失敗結果を解決する |
| 関数 | `mergeSkillArrays` | スキル配列を継承ルールに従ってマージする |
| 関数 | `resolveEffectiveSkills` | サブエージェントの実効スキルを解決する |
| 関数 | `formatSkillsSection` | スキル一覧をプロンプト用に整形 |
| 関数 | `buildSubagentPrompt` | サブエージェント用のプロンプトを構築する |
| 関数 | `runSubagentTask` | サブエージェントタスクを実行する |
| 関数 | `extractSummary` | 出力文字列から要約を抽出する |
| インターフェース | `SubagentExecutionResult` | サブエージェントの実行結果を表します。 |

## 図解

### クラス図

```mermaid
classDiagram
  class SubagentExecutionResult {
    <<interface>>
    +ok: boolean
    +output: string
    +degraded: boolean
    +reason: string
  }
```

### 依存関係図

```mermaid
flowchart LR
  subgraph this[task-execution]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    runtime_utils["runtime-utils"]
    error_utils["error-utils"]
    agent_utils["agent-utils"]
    agent_types["agent-types"]
    output_validation["output-validation"]
  end
  main --> local
```

### 関数フロー

```mermaid
flowchart TD
  normalizeSubagentOutput["normalizeSubagentOutput()"]
  isRetryableSubagentError["isRetryableSubagentError()"]
  isEmptyOutputFailureMessage["isEmptyOutputFailureMessage()"]
  buildFailureSummary["buildFailureSummary()"]
  resolveSubagentFailureOutcome["resolveSubagentFailureOutcome()"]
  mergeSkillArrays["mergeSkillArrays()"]
  normalizeSubagentOutput -.-> isRetryableSubagentError
  isRetryableSubagentError -.-> isEmptyOutputFailureMessage
  isEmptyOutputFailureMessage -.-> buildFailureSummary
  buildFailureSummary -.-> resolveSubagentFailureOutcome
  resolveSubagentFailureOutcome -.-> mergeSkillArrays
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant task_execution as "task-execution"
  participant runtime_utils as "runtime-utils"
  participant error_utils as "error-utils"

  Caller->>task_execution: normalizeSubagentOutput()
  task_execution->>runtime_utils: 内部関数呼び出し
  runtime_utils-->>task_execution: 結果
  task_execution-->>Caller: SubagentExecutionRes

  Caller->>task_execution: isRetryableSubagentError()
  task_execution-->>Caller: boolean
```

## 関数

### pickSubagentSummaryCandidate

```typescript
pickSubagentSummaryCandidate(text: string): string
```

Pick a candidate text for SUMMARY field from unstructured output.
Note: Kept locally because the summary format is subagent-specific.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| text | `string` | はい |

**戻り値**: `string`

### normalizeSubagentOutput

```typescript
normalizeSubagentOutput(output: string): SubagentExecutionResult
```

サブエージェントの出力を正規化する。

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |

**戻り値**: `SubagentExecutionResult`

### isRetryableSubagentError

```typescript
isRetryableSubagentError(error: unknown, statusCode?: number): boolean
```

サブエージェントのエラーが再試行可能か判定する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| error | `unknown` | はい |
| statusCode | `number` | いいえ |

**戻り値**: `boolean`

### isEmptyOutputFailureMessage

```typescript
isEmptyOutputFailureMessage(message: string): boolean
```

空の出力失敗メッセージか判定

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| message | `string` | はい |

**戻り値**: `boolean`

### buildFailureSummary

```typescript
buildFailureSummary(message: string): string
```

失敗の要約を構築する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| message | `string` | はい |

**戻り値**: `string`

### resolveSubagentFailureOutcome

```typescript
resolveSubagentFailureOutcome(error: unknown): RunOutcomeSignal
```

サブエージェントの失敗結果を解決する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| error | `unknown` | はい |

**戻り値**: `RunOutcomeSignal`

### mergeSkillArrays

```typescript
mergeSkillArrays(base: string[] | undefined, override: string[] | undefined): string[] | undefined
```

スキル配列を継承ルールに従ってマージする

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| base | `string[] | undefined` | はい |
| override | `string[] | undefined` | はい |

**戻り値**: `string[] | undefined`

### resolveEffectiveSkills

```typescript
resolveEffectiveSkills(agent: SubagentDefinition, parentSkills?: string[]): string[] | undefined
```

サブエージェントの実効スキルを解決する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| agent | `SubagentDefinition` | はい |
| parentSkills | `string[]` | いいえ |

**戻り値**: `string[] | undefined`

### formatSkillsSection

```typescript
formatSkillsSection(skills: string[] | undefined): string | null
```

スキル一覧をプロンプト用に整形

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| skills | `string[] | undefined` | はい |

**戻り値**: `string | null`

### buildSubagentPrompt

```typescript
buildSubagentPrompt(input: {
  agent: SubagentDefinition;
  task: string;
  extraContext?: string;
  enforcePlanMode?: boolean;
  parentSkills?: string[];
}): string
```

サブエージェント用のプロンプトを構築する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| input | `object` | はい |
| &nbsp;&nbsp;↳ agent | `SubagentDefinition` | はい |
| &nbsp;&nbsp;↳ task | `string` | はい |
| &nbsp;&nbsp;↳ extraContext | `string` | いいえ |
| &nbsp;&nbsp;↳ enforcePlanMode | `boolean` | いいえ |
| &nbsp;&nbsp;↳ parentSkills | `string[]` | いいえ |

**戻り値**: `string`

### runPiPrintMode

```typescript
async runPiPrintMode(input: {
  provider?: string;
  model?: string;
  prompt: string;
  timeoutMs: number;
  signal?: AbortSignal;
  onTextDelta?: (delta: string) => void;
  onStderrChunk?: (chunk: string) => void;
}): Promise<PrintCommandResult>
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| input | `object` | はい |
| &nbsp;&nbsp;↳ provider | `string` | いいえ |
| &nbsp;&nbsp;↳ model | `string` | いいえ |
| &nbsp;&nbsp;↳ prompt | `string` | はい |
| &nbsp;&nbsp;↳ timeoutMs | `number` | はい |
| &nbsp;&nbsp;↳ signal | `AbortSignal` | いいえ |
| &nbsp;&nbsp;↳ onTextDelta | `(delta: string) => void;  onStderrChunk?: (chunk: string) => void;` | いいえ |

**戻り値**: `Promise<PrintCommandResult>`

### runSubagentTask

```typescript
async runSubagentTask(input: {
  agent: SubagentDefinition;
  task: string;
  extraContext?: string;
  timeoutMs: number;
  cwd: string;
  retryOverrides?: RetryWithBackoffOverrides;
  modelProvider?: string;
  modelId?: string;
  parentSkills?: string[];
  signal?: AbortSignal;
  onStart?: () => void;
  onEnd?: () => void;
  onTextDelta?: (delta: string) => void;
  onStderrChunk?: (chunk: string) => void;
}): Promise<{ runRecord: SubagentRunRecord; output: string; prompt: string }>
```

サブエージェントタスクを実行する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| input | `object` | はい |
| &nbsp;&nbsp;↳ agent | `SubagentDefinition` | はい |
| &nbsp;&nbsp;↳ task | `string` | はい |
| &nbsp;&nbsp;↳ extraContext | `string` | いいえ |
| &nbsp;&nbsp;↳ timeoutMs | `number` | はい |
| &nbsp;&nbsp;↳ cwd | `string` | はい |
| &nbsp;&nbsp;↳ retryOverrides | `RetryWithBackoffOverrides` | いいえ |
| &nbsp;&nbsp;↳ modelProvider | `string` | いいえ |
| &nbsp;&nbsp;↳ modelId | `string` | いいえ |
| &nbsp;&nbsp;↳ parentSkills | `string[]` | いいえ |
| &nbsp;&nbsp;↳ signal | `AbortSignal` | いいえ |
| &nbsp;&nbsp;↳ onStart | `() => void;  onEnd?: () => void;  onTextDelta?: (delta: string) => void;  onStderrChunk?: (chunk: string) => void;` | いいえ |

**戻り値**: `Promise<{ runRecord: SubagentRunRecord; output: string; prompt: string }>`

### emitStderrChunk

```typescript
emitStderrChunk(chunk: string): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| chunk | `string` | はい |

**戻り値**: `void`

### extractSummary

```typescript
extractSummary(output: string): string
```

出力文字列から要約を抽出する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |

**戻り値**: `string`

## インターフェース

### SubagentExecutionResult

```typescript
interface SubagentExecutionResult {
  ok: boolean;
  output: string;
  degraded: boolean;
  reason?: string;
}
```

サブエージェントの実行結果を表します。

---
*自動生成: 2026-02-18T07:17:30.359Z*
