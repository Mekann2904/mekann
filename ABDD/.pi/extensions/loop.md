---
title: loop
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated]
related: []
---

# loop

## 概要

`loop` モジュールのAPIリファレンス。

## インポート

```typescript
// from 'node:child_process': spawn
// from 'node:crypto': randomBytes
// from 'node:dns/promises': dnsLookup
// from 'node:fs': appendFileSync, existsSync, mkdirSync, ...
// from 'node:path': basename, isAbsolute, join, ...
// ... and 19 more imports
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `registerLoopExtension` | ループ機能を拡張する |

## ユーザーフロー

このモジュールが提供するツールと、その実行フローを示します。

### loop_run

Run an autonomous iteration loop for a task, optionally with explicit goal criteria and verification command checks.

```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Unresolved as "Unresolved"
  participant Internal as "Internal"
  participant Storage as "Storage"
  participant Judge as "Judge"
  participant Executor as "Executor"
  participant LLM as "LLM"

  User->>System: Run an autonomous iteration loop for a task, optionally w...
  System->>Unresolved: String(params.task ?? '').trim (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Unresolved: String (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Internal: normalizeLoopConfig
  Internal->>Internal: 整数値を検証・制限
  Internal->>Unresolved: Number (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: Number.isFinite (node_modules/typescript/lib/lib.es2015.core.d.ts)
  Internal->>Unresolved: Number.isInteger (node_modules/typescript/lib/lib.es2015.core.d.ts)
  Internal->>Unresolved: Boolean (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Storage: 参照読込
  Storage->>Internal: normalizeRefSpec
  Internal->>Unresolved: trimmed.startsWith (node_modules/typescript/lib/lib.es2015.core.d.ts)
  Internal->>Unresolved: trimmed.slice (node_modules/typescript/lib/lib.es5.d.ts)
  Storage->>Unresolved: specs.push (node_modules/typescript/lib/lib.es5.d.ts)
  Storage->>Judge: resolvePath
  Judge->>Internal: isAbsolute
  Judge->>Judge: resolve
  Storage->>Storage: readFileSync
  Storage->>Unresolved: raw.split (node_modules/typescript/lib/lib.es5.d.ts)
  Storage->>Internal: メッセージを文字列化
  Storage->>Internal: throwIfAborted
  Storage->>Internal: loadSingleReference
  Storage->>Executor: truncateText
  Storage->>Unresolved: Math.min (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Unresolved: Array.isArray (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Unresolved: pi.getThinkingLevel (node_modules/@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts)
  System->>Executor: startLoopActivityIndicator
  Executor->>Internal: render
  Executor->>Internal: setInterval
  Executor->>Internal: toPreview
  Executor->>Internal: ミリ秒変換
  Internal->>Unresolved: Math.round (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: (ms / 1000).toFixed (node_modules/typescript/lib/lib.es5.d.ts)
  Executor->>Internal: clearInterval
  System->>Unresolved: logger.startOperation (.pi/lib/comprehensive-logger.ts)
  System->>Internal: normalizeOptionalText
  System->>Executor: runLoop
  Executor->>Executor: 一意な実行IDを生成します。
  Executor->>Unresolved: [     now.getFullYear(),     String(now.getMonth() + 1).padStart(2, '0'),     String(now.getDate()).padStart(2, '0'),     '-',     String(now.getHours()).padStart(2, '0'),     String(now.getMinutes()).padStart(2, '0'),     String(now.getSeconds()).padStart(2, '0'),   ].join (node_modules/typescript/lib/lib.es5.d.ts)
  Executor->>Unresolved: now.getFullYear (node_modules/typescript/lib/lib.es5.d.ts)
  Executor->>Unresolved: String(now.getMonth() + 1).padStart (node_modules/typescript/lib/lib.es2017.string.d.ts)
  Executor->>Unresolved: now.getMonth (node_modules/typescript/lib/lib.es5.d.ts)
  Executor->>Unresolved: now.getDate (node_modules/typescript/lib/lib.es5.d.ts)
  Executor->>Unresolved: now.getHours (node_modules/typescript/lib/lib.es5.d.ts)
  Executor->>Unresolved: now.getMinutes (node_modules/typescript/lib/lib.es5.d.ts)
  Executor->>Unresolved: now.getSeconds (node_modules/typescript/lib/lib.es5.d.ts)
  Executor->>Unresolved: randomBytes(3).toString (node_modules/@types/node/buffer.d.ts)
  Executor->>Internal: randomBytes
  Executor->>Internal: mkdirSync
  Executor->>Unresolved: new Date().toISOString (node_modules/typescript/lib/lib.es5.d.ts)
  Executor->>Internal: appendJsonl
  Internal->>Storage: ロック取得実行
  Storage->>Unresolved: Math.max (node_modules/typescript/lib/lib.es5.d.ts)
  Storage->>Unresolved: Math.trunc (node_modules/typescript/lib/lib.es2015.core.d.ts)
  Storage->>Unresolved: Date.now (node_modules/typescript/lib/lib.es5.d.ts)
  Storage->>Internal: hasEfficientSyncSleep
  Storage->>Internal: tryAcquireLock
  Storage->>Internal: clearStaleLock
  Storage->>Unresolved: console.warn (node_modules/typescript/lib/lib.dom.d.ts)
  Storage->>Internal: sleepSync
  Storage->>Internal: unlinkSync
  Internal->>Storage: appendFileSync
  Internal->>Unresolved: JSON.stringify (node_modules/typescript/lib/lib.es5.d.ts)
  Executor->>Internal: ループコマンドのプレビュー文字列を生成する
  Executor->>Judge: ポリシー設定解決
  Judge->>Unresolved: String(process.env[VERIFICATION_POLICY_ENV] || '')     .trim()     .toLowerCase (node_modules/typescript/lib/lib.es5.d.ts)
  Executor->>Internal: 意図を分類
  Internal->>Unresolved: Object.entries (node_modules/typescript/lib/lib.es2017.object.d.ts)
  Internal->>Unresolved: regex.test (node_modules/typescript/lib/lib.es5.d.ts)
  Executor->>Internal: 反復フォーカスを構築
  Internal->>Internal: extractNextStepLine
  Executor->>Internal: プロンプト生成
  Internal->>Internal: buildReferencePack
  Executor->>Internal: モデル別タイムアウト
  Internal->>Internal: getModelBaseTimeoutMs
  Internal->>Unresolved: Math.floor (node_modules/typescript/lib/lib.es5.d.ts)
  Executor->>LLM: callModelViaPi
  Executor->>Internal: 契約解析
  Internal->>Internal: parseLoopStatus
  Internal->>Internal: parseLoopGoalStatus
  Internal->>Internal: extractGoalEvidence
  Internal->>Internal: extractCitations
  Internal->>Internal: extractSummaryLine
  Internal->>Internal: parseLoopJsonObject
  Internal->>Internal: normalizeLoopStatus
  Internal->>Internal: parseStructuredLoopGoalStatus
  Internal->>Internal: normalizeStringArray
  Internal->>Internal: normalizeCitationList
  Executor->>Judge: 入力値検証
  Judge->>Unresolved: input.citations.filter (node_modules/typescript/lib/lib.es5.d.ts)
  Executor->>Executor: 実行可否判定
  Executor->>Executor: 検証コマンドを実行する
  Executor->>Internal: parseVerificationCommand
  Executor->>Internal: resolveVerificationAllowlistPrefixes
  Executor->>Internal: isVerificationCommandAllowed
  Executor->>Internal: formatAllowlistPreview
  Executor->>Internal: spawn
  Executor->>Internal: cleanup
  Executor->>Internal: redactSensitiveText
  Executor->>Unresolved: child.kill (node_modules/@types/node/child_process.d.ts)
  Executor->>Internal: killSafely
  Executor->>Internal: setTimeout
  Executor->>Internal: finish
  Executor->>Internal: clearTimeout
  Executor->>Internal: removeEventListener
  Executor->>Internal: addEventListener
  Executor->>Unresolved: child.stdout.on (node_modules/@types/node/stream.d.ts)
  Executor->>Internal: フィードバック生成
  Internal->>Unresolved: reason.replace (node_modules/typescript/lib/lib.es5.d.ts)
  Executor->>Internal: フィードバックを構築
  Executor->>Internal: フィードバック正規化
  Internal->>Unresolved: errors     .map (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Internal: normalizeValidationIssue
  Internal->>Unresolved: Array.from (node_modules/typescript/lib/lib.es2015.core.d.ts)
  Internal->>Unresolved: unique.sort (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Internal: validationIssuePriority
  Executor->>Internal: 失敗出力生成
  Executor->>Internal: 重複を検出
  Internal->>Internal: normalizeText
  Internal->>Internal: プロバイダ取得
  Internal->>Unresolved: Promise.all (node_modules/typescript/lib/lib.es2015.iterable.d.ts)
  Internal->>Internal: ベクトル生成
  Internal->>Internal: コサイン類似度計算
  Internal->>Unresolved: Math.sqrt (node_modules/typescript/lib/lib.es5.d.ts)
  Executor->>Internal: 出力を正規化
  Executor->>Internal: 予算を取得
  Executor->>Unresolved: semanticStagnationStats.similarities.reduce (node_modules/typescript/lib/lib.es5.d.ts)
  Executor->>Internal: 結果本文抽出
  Internal->>Internal: extractTaggedBlock
  Executor->>Storage: テキスト書込
  Storage->>Storage: writeFileSync
  Storage->>Internal: renameSync
  Executor->>Storage: writeLatestSummarySnapshot
  System->>Internal: formatLoopProgress
  System->>Unresolved: pi.appendEntry (node_modules/@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts)
  System->>Unresolved: logger.endOperation (.pi/lib/comprehensive-logger.ts)
  System->>Internal: formatLoopResultText
  System-->>User: 結果

```

## 図解

### クラス図

```mermaid
classDiagram
  class LoopConfig {
    <<interface>>
    +maxIterations: number
    +timeoutMs: number
    +requireCitation: boolean
    +verificationTimeoutMs: number
    +enableSemanticStagnation: boolean
  }
  class LoopIterationResult {
    <<interface>>
    +iteration: number
    +latencyMs: number
    +status: LoopStatus
    +goalStatus: LoopGoalStatus
    +goalEvidence: string
  }
  class LoopRunSummary {
    <<interface>>
    +runId: string
    +startedAt: string
    +finishedAt: string
    +task: string
    +completed: boolean
  }
  class LoopRunOutput {
    <<interface>>
    +summary: LoopRunSummary
    +finalOutput: string
    +iterations: LoopIterationResult
  }
  class LoopRunInput {
    <<interface>>
    +task: string
    +goal: string
    +verificationCommand: string
    +config: LoopConfig
    +references: LoopReference
  }
  class LoopProgress {
    <<interface>>
    +type: run_start_iterati
    +iteration: number
    +maxIterations: number
    +status: LoopStatus
    +latencyMs: number
  }
  class ParsedLoopCommand {
    <<interface>>
    +mode: help_status_run
    +task: string
    +goal: string
    +verifyCommand: string
    +refs: string
  }
  class LoopActivityIndicator {
    <<interface>>
    +updateFromProgress: progress_LoopProgre
    +stop: void
  }
  class ParsedLoopContract {
    <<interface>>
    +status: LoopStatus
    +goalStatus: LoopGoalStatus
    +goalEvidence: string
    +citations: string
    +summary: string
  }
  class VerificationPolicyConfig {
    <<interface>>
    +mode: VerificationPolicyMo
    +everyN: number
  }
  class ParsedVerificationCommand {
    <<interface>>
    +executable: string
    +args: string
    +error: string
  }
```

### 依存関係図

```mermaid
flowchart LR
  subgraph this[loop]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    format_utils["format-utils"]
    error_utils["error-utils"]
    validation_utils["validation-utils"]
    agent_types["agent-types"]
    agent_utils["agent-utils"]
  end
  main --> local
  subgraph external[外部ライブラリ]
    _mariozechner["@mariozechner"]
    _mariozechner["@mariozechner"]
    _mariozechner["@mariozechner"]
  end
  main --> external
```

### 関数フロー

```mermaid
flowchart TD
  appendJsonl["appendJsonl()"]
  callModelViaPi["callModelViaPi()"]
  formatLoopProgress["formatLoopProgress()"]
  formatLoopResultText["formatLoopResultText()"]
  formatLoopSummary["formatLoopSummary()"]
  normalizeLoopConfig["normalizeLoopConfig()"]
  normalizeOptionalText["normalizeOptionalText()"]
  parseLoopCommand["parseLoopCommand()"]
  readLatestSummary["readLatestSummary()"]
  registerLoopExtension["registerLoopExtension()"]
  render["render()"]
  runLoop["runLoop()"]
  startLoopActivityIndicator["startLoopActivityIndicator()"]
  throwIfAborted["throwIfAborted()"]
  toPreview["toPreview()"]
  tokenizeArgs["tokenizeArgs()"]
  withArgError["withArgError()"]
  writeLatestSummarySnapshot["writeLatestSummarySnapshot()"]
  callModelViaPi --> callModelViaPi
  parseLoopCommand --> normalizeOptionalText
  parseLoopCommand --> tokenizeArgs
  parseLoopCommand --> withArgError
  registerLoopExtension --> formatLoopProgress
  registerLoopExtension --> formatLoopResultText
  registerLoopExtension --> formatLoopSummary
  registerLoopExtension --> normalizeLoopConfig
  registerLoopExtension --> normalizeOptionalText
  registerLoopExtension --> parseLoopCommand
  registerLoopExtension --> readLatestSummary
  registerLoopExtension --> runLoop
  registerLoopExtension --> startLoopActivityIndicator
  runLoop --> appendJsonl
  runLoop --> callModelViaPi
  runLoop --> throwIfAborted
  runLoop --> toPreview
  runLoop --> writeLatestSummarySnapshot
  startLoopActivityIndicator --> render
  startLoopActivityIndicator --> toPreview
  withArgError --> normalizeOptionalText
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant Mloop as "loop"
  participant mariozechner as "@mariozechner"
  participant format_utils as "format-utils"
  participant error_utils as "error-utils"

  Caller->>Mloop: registerLoopExtension()
  Mloop->>mariozechner: API呼び出し
  mariozechner-->>Mloop: レスポンス
  Mloop->>format_utils: 内部関数呼び出し
  format_utils-->>Mloop: 結果
  Mloop-->>Caller: void
```

## 関数

### registerLoopExtension

```typescript
registerLoopExtension(pi: ExtensionAPI): void
```

ループ機能を拡張する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| pi | `ExtensionAPI` | はい |

**戻り値**: `void`

### runLoop

```typescript
async runLoop(input: LoopRunInput): Promise<LoopRunOutput>
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| input | `LoopRunInput` | はい |

**戻り値**: `Promise<LoopRunOutput>`

### normalizeLoopConfig

```typescript
normalizeLoopConfig(overrides: Partial<LoopConfig>): { ok: true; config: LoopConfig } | { ok: false; error: string }
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| overrides | `Partial<LoopConfig>` | はい |

**戻り値**: `{ ok: true; config: LoopConfig } | { ok: false; error: string }`

### parseLoopCommand

```typescript
parseLoopCommand(args: string | undefined): ParsedLoopCommand
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| args | `string | undefined` | はい |

**戻り値**: `ParsedLoopCommand`

### withArgError

```typescript
withArgError(error: string): ParsedLoopCommand
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| error | `string` | はい |

**戻り値**: `ParsedLoopCommand`

### tokenizeArgs

```typescript
tokenizeArgs(input: string): string[]
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| input | `string` | はい |

**戻り値**: `string[]`

### callModelViaPi

```typescript
async callModelViaPi(model: { provider: string; id: string; thinkingLevel: ThinkingLevel }, prompt: string, timeoutMs: number, signal?: AbortSignal): Promise<string>
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| model | `object` | はい |
| &nbsp;&nbsp;↳ provider | `string` | はい |
| &nbsp;&nbsp;↳ id | `string` | はい |
| &nbsp;&nbsp;↳ thinkingLevel | `ThinkingLevel` | はい |
| prompt | `string` | はい |
| timeoutMs | `number` | はい |
| signal | `AbortSignal` | いいえ |

**戻り値**: `Promise<string>`

### startLoopActivityIndicator

```typescript
startLoopActivityIndicator(ctx: any, maxIterations: number): LoopActivityIndicator
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| ctx | `any` | はい |
| maxIterations | `number` | はい |

**戻り値**: `LoopActivityIndicator`

### render

```typescript
render(): void
```

**戻り値**: `void`

### formatLoopProgress

```typescript
formatLoopProgress(progress: LoopProgress): string
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| progress | `LoopProgress` | はい |

**戻り値**: `string`

### formatLoopResultText

```typescript
formatLoopResultText(summary: LoopRunSummary, finalOutput: string, warnings: string[]): string
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| summary | `LoopRunSummary` | はい |
| finalOutput | `string` | はい |
| warnings | `string[]` | はい |

**戻り値**: `string`

### formatLoopSummary

```typescript
formatLoopSummary(summary: LoopRunSummary): string
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| summary | `LoopRunSummary` | はい |

**戻り値**: `string`

### readLatestSummary

```typescript
readLatestSummary(cwd: string): LoopRunSummary | null
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| cwd | `string` | はい |

**戻り値**: `LoopRunSummary | null`

### writeLatestSummarySnapshot

```typescript
writeLatestSummarySnapshot(path: string, payload: string): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| path | `string` | はい |
| payload | `string` | はい |

**戻り値**: `void`

### appendJsonl

```typescript
appendJsonl(path: string, value: unknown): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| path | `string` | はい |
| value | `unknown` | はい |

**戻り値**: `void`

### normalizeRefSpec

```typescript
normalizeRefSpec(value: string): string
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| value | `string` | はい |

**戻り値**: `string`

### resolvePath

```typescript
resolvePath(cwd: string, pathLike: string): string
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| cwd | `string` | はい |
| pathLike | `string` | はい |

**戻り値**: `string`

### looksLikeUrl

```typescript
looksLikeUrl(value: string): boolean
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| value | `string` | はい |

**戻り値**: `boolean`

### looksLikeHtml

```typescript
looksLikeHtml(value: string): boolean
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| value | `string` | はい |

**戻り値**: `boolean`

### htmlToText

```typescript
htmlToText(value: string): string
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| value | `string` | はい |

**戻り値**: `string`

### truncateText

```typescript
truncateText(value: string, maxChars: number): string
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| value | `string` | はい |
| maxChars | `number` | はい |

**戻り値**: `string`

### toPreview

```typescript
toPreview(value: string, maxChars: number): string
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| value | `string` | はい |
| maxChars | `number` | はい |

**戻り値**: `string`

### normalizeOptionalText

```typescript
normalizeOptionalText(value: unknown): string | undefined
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| value | `unknown` | はい |

**戻り値**: `string | undefined`

### throwIfAborted

```typescript
throwIfAborted(signal: AbortSignal | undefined): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| signal | `AbortSignal | undefined` | はい |

**戻り値**: `void`

## インターフェース

### LoopConfig

```typescript
interface LoopConfig {
  maxIterations: number;
  timeoutMs: number;
  requireCitation: boolean;
  verificationTimeoutMs: number;
  enableSemanticStagnation?: boolean;
  semanticRepetitionThreshold?: number;
}
```

### LoopIterationResult

```typescript
interface LoopIterationResult {
  iteration: number;
  latencyMs: number;
  status: LoopStatus;
  goalStatus: LoopGoalStatus;
  goalEvidence: string;
  verification?: LoopVerificationResult;
  citations: string[];
  validationErrors: string[];
  output: string;
}
```

### LoopRunSummary

```typescript
interface LoopRunSummary {
  runId: string;
  startedAt: string;
  finishedAt: string;
  task: string;
  completed: boolean;
  stopReason: "model_done" | "max_iterations" | "stagnation" | "iteration_error";
  iterationCount: number;
  maxIterations: number;
  referenceCount: number;
  goal?: string;
  verificationCommand?: string;
  verificationTimeoutMs?: number;
  lastGoalStatus?: LoopGoalStatus;
  lastVerificationPassed?: boolean;
  model: {
    provider: string;
    id: string;
    thinkingLevel: ThinkingLevel;
  };
  config: LoopConfig;
  logFile: string;
  summaryFile: string;
  finalPreview: string;
  intentClassification?: {
    intent: TaskIntent;
    confidence: number;
  };
  semanticStagnation?: {
    detected: boolean;
    averageSimilarity: number;
    method: "embedding" | "exact" | "unavailable";
  };
}
```

### LoopRunOutput

```typescript
interface LoopRunOutput {
  summary: LoopRunSummary;
  finalOutput: string;
  iterations: LoopIterationResult[];
}
```

### LoopRunInput

```typescript
interface LoopRunInput {
  task: string;
  goal?: string;
  verificationCommand?: string;
  config: LoopConfig;
  references: LoopReference[];
  model: {
    provider: string;
    id: string;
    thinkingLevel: ThinkingLevel;
  };
  cwd: string;
  signal?: AbortSignal;
  onProgress?: (progress: LoopProgress) => void;
}
```

### LoopProgress

```typescript
interface LoopProgress {
  type: "run_start" | "iteration_start" | "iteration_done" | "run_done";
  iteration?: number;
  maxIterations: number;
  status?: LoopStatus;
  latencyMs?: number;
  validationErrors?: string[];
  taskPreview?: string;
  focusPreview?: string;
  commandPreview?: string;
  summaryPreview?: string;
}
```

### ParsedLoopCommand

```typescript
interface ParsedLoopCommand {
  mode: "help" | "status" | "run";
  task: string;
  goal?: string;
  verifyCommand?: string;
  refs: string[];
  refsFile?: string;
  configOverrides: Partial<LoopConfig>;
  error?: string;
}
```

### LoopActivityIndicator

```typescript
interface LoopActivityIndicator {
  updateFromProgress: (progress: LoopProgress) => void;
  stop: () => void;
}
```

### ParsedLoopContract

```typescript
interface ParsedLoopContract {
  status: LoopStatus;
  goalStatus: LoopGoalStatus;
  goalEvidence: string;
  citations: string[];
  summary: string;
  nextActions: string[];
  parseErrors: string[];
  usedStructuredBlock: boolean;
}
```

### VerificationPolicyConfig

```typescript
interface VerificationPolicyConfig {
  mode: VerificationPolicyMode;
  everyN: number;
}
```

### ParsedVerificationCommand

```typescript
interface ParsedVerificationCommand {
  executable: string;
  args: string[];
  error?: string;
}
```

## 型定義

### VerificationPolicyMode

```typescript
type VerificationPolicyMode = "always" | "done_only" | "every_n"
```

---
*自動生成: 2026-02-18T18:06:17.306Z*
