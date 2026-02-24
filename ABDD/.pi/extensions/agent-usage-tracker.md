---
title: agent-usage-tracker
category: api-reference
audience: developer
last_updated: 2026-02-24
tags: [auto-generated]
related: []
---

# agent-usage-tracker

## 概要

`agent-usage-tracker` モジュールのAPIリファレンス。

## インポート

```typescript
// from 'node:crypto': randomBytes
// from 'node:fs': existsSync, mkdirSync, readdirSync, ...
// from 'node:path': basename, dirname, join, ...
// from '@mariozechner/pi-ai': Type
// from '@mariozechner/pi-coding-agent': ExtensionAPI
// ... and 4 more imports
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `registerAgentUsageTracker` | エージェント使用状況トラッカーを登録する |

## ユーザーフロー

このモジュールが提供するツールと、その実行フローを示します。

### agent_usage_stats

Read/reset/export extension usage stats including per-feature call count, error rate, and context occupancy averages.

```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Unresolved as "Unresolved"
  participant Runtime as "Runtime"
  participant Executor as "Executor"
  participant Storage as "Storage"
  participant Internal as "Internal"
  participant Judge as "Judge"

  User->>System: Read/reset/export extension usage stats including per-fea...
  System->>Unresolved: logger.startOperation (.pi/lib/comprehensive-logger.ts)
  System->>Runtime: ensureRuntime
  Runtime->>Executor: prunePendingTools
  Executor->>Unresolved: Date.now (node_modules/typescript/lib/lib.es5.d.ts)
  Executor->>Unresolved: currentRuntime.pendingTools.entries (node_modules/typescript/lib/lib.es2015.iterable.d.ts)
  Executor->>Unresolved: currentRuntime.pendingTools.delete (node_modules/typescript/lib/lib.es2015.collection.d.ts)
  Executor->>Unresolved: Array.from(currentRuntime.pendingTools.entries())     .sort((a, b) => a[1].startedAtMs - b[1].startedAtMs)     .slice (node_modules/typescript/lib/lib.es5.d.ts)
  Executor->>Unresolved: Array.from(currentRuntime.pendingTools.entries())     .sort (node_modules/typescript/lib/lib.es5.d.ts)
  Executor->>Unresolved: Array.from (node_modules/typescript/lib/lib.es2015.core.d.ts)
  Runtime->>Storage: getStorageFile
  Storage->>Internal: join
  Storage->>Internal: ディレクトリを生成
  Internal->>Internal: existsSync
  Internal->>Internal: mkdirSync
  Runtime->>Storage: loadState
  Storage->>Internal: createEmptyState
  Internal->>Internal: nowIso
  Storage->>Unresolved: JSON.parse (node_modules/typescript/lib/lib.es5.d.ts)
  Storage->>Storage: readFileSync
  Storage->>Unresolved: Array.isArray (node_modules/typescript/lib/lib.es5.d.ts)
  Storage->>Unresolved: Number (node_modules/typescript/lib/lib.es5.d.ts)
  Runtime->>Internal: discoverFeatureCatalog
  Internal->>Storage: readdirSync
  Internal->>Unresolved: fileName.endsWith (node_modules/typescript/lib/lib.es2015.core.d.ts)
  Internal->>Unresolved: candidateFiles.push (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Internal: basename
  Internal->>Internal: extractRegisteredToolNames
  Internal->>Unresolved: source.indexOf (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: probe.match (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: match[1].trim (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Internal: extractRegisteredCommandNames
  Internal->>Unresolved: matcher.exec (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Unresolved: currentRuntime.pendingTools.clear (node_modules/typescript/lib/lib.es2015.collection.d.ts)
  System->>Storage: saveState
  Storage->>Storage: writeFileSync
  Storage->>Unresolved: JSON.stringify (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Unresolved: logger.endOperation (.pi/lib/comprehensive-logger.ts)
  System->>Internal: exportState
  Internal->>Unresolved: new Date().toISOString().replace (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: new Date().toISOString (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Judge: resolve
  Internal->>Internal: dirname
  System->>Internal: parsePositiveInt
  Internal->>Unresolved: Number.isFinite (node_modules/typescript/lib/lib.es2015.core.d.ts)
  Internal->>Unresolved: Math.max (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: Math.trunc (node_modules/typescript/lib/lib.es2015.core.d.ts)
  System->>Unresolved: String (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Internal: buildRecentReport
  Internal->>Unresolved: state.events.slice(-limit).reverse (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Internal: formatPercent
  Internal->>Unresolved: (value * 100).toFixed (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: Math.round (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Internal: buildSummaryReport
  Internal->>Unresolved: Object.values (node_modules/typescript/lib/lib.es2017.object.d.ts)
  Internal->>Internal: aggregateByExtension
  Internal->>Unresolved: map.has (node_modules/typescript/lib/lib.es2015.collection.d.ts)
  Internal->>Unresolved: map.set (node_modules/typescript/lib/lib.es2015.collection.d.ts)
  Internal->>Unresolved: map.get (node_modules/typescript/lib/lib.es2015.collection.d.ts)
  Internal->>Internal: formatRate
  Internal->>Unresolved: Object.keys (node_modules/typescript/lib/lib.es5.d.ts)
  System-->>User: 結果

```

## 図解

### クラス図

```mermaid
classDiagram
  class ContextSnapshot {
    <<interface>>
    +tokens: number
    +contextWindow: number
    +ratio: number
  }
  class FeatureMetrics {
    <<interface>>
    +extension: string
    +featureType: FeatureType
    +featureName: string
    +calls: number
    +errors: number
  }
  class UsageEventRecord {
    <<interface>>
    +id: string
    +timestamp: string
    +extension: string
    +featureType: FeatureType
    +featureName: string
  }
  class UsageTrackerState {
    <<interface>>
    +version: number
    +createdAt: string
    +updatedAt: string
    +totals: toolCalls_number_to
    +features: Record_string_Featur
  }
  class FeatureCatalog {
    <<interface>>
    +discoveredAt: string
    +toolToExtension: Record_string_string
    +commandToExtension: Record_string_string
  }
  class ActiveToolCall {
    <<interface>>
    +toolName: string
    +extension: string
    +featureKey: string
    +startedAtMs: number
    +inputPreview: string
  }
  class ActiveAgentRun {
    <<interface>>
    +featureKey: string
    +startedAtMs: number
    +toolCalls: number
    +toolErrors: number
    +startContext: ContextSnapshot
  }
  class RuntimeState {
    <<interface>>
    +cwd: string
    +storageFile: string
    +state: UsageTrackerState
    +catalog: FeatureCatalog
    +pendingTools: Map_string_ActiveToo
  }
```

### 依存関係図

```mermaid
flowchart LR
  subgraph this[agent-usage-tracker]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    fs_utils["fs-utils"]
    validation_utils["validation-utils"]
    comprehensive_logger["comprehensive-logger"]
    comprehensive_logger_types["comprehensive-logger-types"]
  end
  main --> local
  subgraph external[外部ライブラリ]
    _mariozechner["@mariozechner"]
    _mariozechner["@mariozechner"]
  end
  main --> external
```

### 関数フロー

```mermaid
flowchart TD
  appendEvent["appendEvent()"]
  buildRecentReport["buildRecentReport()"]
  buildSummaryReport["buildSummaryReport()"]
  createEmptyState["createEmptyState()"]
  discoverFeatureCatalog["discoverFeatureCatalog()"]
  ensureRuntime["ensureRuntime()"]
  exportState["exportState()"]
  getStorageFile["getStorageFile()"]
  handleAgentUsageCommand["handleAgentUsageCommand()"]
  loadState["loadState()"]
  markFeatureCall["markFeatureCall()"]
  nowIso["nowIso()"]
  parsePositiveInt["parsePositiveInt()"]
  previewInput["previewInput()"]
  prunePendingTools["prunePendingTools()"]
  readContextSnapshot["readContextSnapshot()"]
  recordAgentEnd["recordAgentEnd()"]
  recordAgentStart["recordAgentStart()"]
  recordToolCall["recordToolCall()"]
  recordToolResult["recordToolResult()"]
  registerAgentUsageTracker["registerAgentUsageTracker()"]
  resolveExtensionForTool["resolveExtensionForTool()"]
  saveState["saveState()"]
  toFeatureKey["toFeatureKey()"]
  ensureRuntime --> discoverFeatureCatalog
  ensureRuntime --> getStorageFile
  ensureRuntime --> loadState
  ensureRuntime --> prunePendingTools
  recordToolCall --> appendEvent
  recordToolCall --> ensureRuntime
  recordToolCall --> markFeatureCall
  recordToolCall --> nowIso
  recordToolCall --> previewInput
  recordToolCall --> prunePendingTools
  recordToolCall --> readContextSnapshot
  recordToolCall --> resolveExtensionForTool
  recordToolResult --> ensureRuntime
  recordToolResult --> prunePendingTools
  recordToolResult --> resolveExtensionForTool
  recordToolResult --> toFeatureKey
  registerAgentUsageTracker --> buildRecentReport
  registerAgentUsageTracker --> buildSummaryReport
  registerAgentUsageTracker --> createEmptyState
  registerAgentUsageTracker --> ensureRuntime
  registerAgentUsageTracker --> exportState
  registerAgentUsageTracker --> handleAgentUsageCommand
  registerAgentUsageTracker --> parsePositiveInt
  registerAgentUsageTracker --> prunePendingTools
  registerAgentUsageTracker --> recordAgentEnd
  registerAgentUsageTracker --> recordAgentStart
  registerAgentUsageTracker --> recordToolCall
  registerAgentUsageTracker --> recordToolResult
  registerAgentUsageTracker --> saveState
  saveState --> nowIso
```

## 関数

### nowIso

```typescript
nowIso(): string
```

**戻り値**: `string`

### getStorageFile

```typescript
getStorageFile(cwd: string): string
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| cwd | `string` | はい |

**戻り値**: `string`

### createEmptyState

```typescript
createEmptyState(timestamp: any): UsageTrackerState
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| timestamp | `any` | はい |

**戻り値**: `UsageTrackerState`

### loadState

```typescript
loadState(storageFile: string): UsageTrackerState
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| storageFile | `string` | はい |

**戻り値**: `UsageTrackerState`

### saveState

```typescript
saveState(currentRuntime: RuntimeState): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| currentRuntime | `RuntimeState` | はい |

**戻り値**: `void`

### prunePendingTools

```typescript
prunePendingTools(currentRuntime: RuntimeState, nowMs: any): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| currentRuntime | `RuntimeState` | はい |
| nowMs | `any` | はい |

**戻り値**: `void`

### ensureRuntime

```typescript
ensureRuntime(ctx: ExtensionAPI["context"]): RuntimeState
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| ctx | `ExtensionAPI["context"]` | はい |

**戻り値**: `RuntimeState`

### discoverFeatureCatalog

```typescript
discoverFeatureCatalog(cwd: string): FeatureCatalog
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| cwd | `string` | はい |

**戻り値**: `FeatureCatalog`

### extractRegisteredToolNames

```typescript
extractRegisteredToolNames(source: string): string[]
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| source | `string` | はい |

**戻り値**: `string[]`

### extractRegisteredCommandNames

```typescript
extractRegisteredCommandNames(source: string): string[]
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| source | `string` | はい |

**戻り値**: `string[]`

### resolveExtensionForTool

```typescript
resolveExtensionForTool(toolName: string, catalog: FeatureCatalog): string
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| toolName | `string` | はい |
| catalog | `FeatureCatalog` | はい |

**戻り値**: `string`

### toFeatureKey

```typescript
toFeatureKey(featureType: FeatureType, extension: string, featureName: string): string
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| featureType | `FeatureType` | はい |
| extension | `string` | はい |
| featureName | `string` | はい |

**戻り値**: `string`

### getOrCreateFeature

```typescript
getOrCreateFeature(state: UsageTrackerState, key: string, extension: string, featureType: FeatureType, featureName: string): FeatureMetrics
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| state | `UsageTrackerState` | はい |
| key | `string` | はい |
| extension | `string` | はい |
| featureType | `FeatureType` | はい |
| featureName | `string` | はい |

**戻り値**: `FeatureMetrics`

### applyContextSample

```typescript
applyContextSample(state: UsageTrackerState, feature: FeatureMetrics, context: ContextSnapshot | undefined): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| state | `UsageTrackerState` | はい |
| feature | `FeatureMetrics` | はい |
| context | `ContextSnapshot | undefined` | はい |

**戻り値**: `void`

### markFeatureCall

```typescript
markFeatureCall(state: UsageTrackerState, input: {
    extension: string;
    featureType: FeatureType;
    featureName: string;
    at: string;
    context?: ContextSnapshot;
  }): string
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| state | `UsageTrackerState` | はい |
| input | `object` | はい |
| &nbsp;&nbsp;↳ extension | `string` | はい |
| &nbsp;&nbsp;↳ featureType | `FeatureType` | はい |
| &nbsp;&nbsp;↳ featureName | `string` | はい |
| &nbsp;&nbsp;↳ at | `string` | はい |
| &nbsp;&nbsp;↳ context | `ContextSnapshot` | いいえ |

**戻り値**: `string`

### markFeatureError

```typescript
markFeatureError(state: UsageTrackerState, featureKey: string, at: string, errorMessage?: string): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| state | `UsageTrackerState` | はい |
| featureKey | `string` | はい |
| at | `string` | はい |
| errorMessage | `string` | いいえ |

**戻り値**: `void`

### appendEvent

```typescript
appendEvent(state: UsageTrackerState, event: Omit<UsageEventRecord, "id">): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| state | `UsageTrackerState` | はい |
| event | `Omit<UsageEventRecord, "id">` | はい |

**戻り値**: `void`

### pickNumber

```typescript
pickNumber(raw: Record<string, unknown>, keys: string[]): number | undefined
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| raw | `Record<string, unknown>` | はい |
| keys | `string[]` | はい |

**戻り値**: `number | undefined`

### normalizeRatio

```typescript
normalizeRatio(value: number | undefined): number | undefined
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| value | `number | undefined` | はい |

**戻り値**: `number | undefined`

### readContextSnapshot

```typescript
readContextSnapshot(ctx: ExtensionAPI["context"]): ContextSnapshot | undefined
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| ctx | `ExtensionAPI["context"]` | はい |

**戻り値**: `ContextSnapshot | undefined`

### formatPercent

```typescript
formatPercent(value: number | undefined): string
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| value | `number | undefined` | はい |

**戻り値**: `string`

### formatRate

```typescript
formatRate(numerator: number, denominator: number): string
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| numerator | `number` | はい |
| denominator | `number` | はい |

**戻り値**: `string`

### compactSingleLine

```typescript
compactSingleLine(input: string, limit: any): string
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| input | `string` | はい |
| limit | `any` | はい |

**戻り値**: `string`

### previewInput

```typescript
previewInput(input: unknown): string | undefined
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| input | `unknown` | はい |

**戻り値**: `string | undefined`

### extractToolErrorMessage

```typescript
extractToolErrorMessage(event: any): string | undefined
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| event | `any` | はい |

**戻り値**: `string | undefined`

### aggregateByExtension

```typescript
aggregateByExtension(features: FeatureMetrics[]): Array<{
  extension: string;
  calls: number;
  errors: number;
  contextSamples: number;
  contextRatioSum: number;
  featureCount: number;
}>
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| features | `FeatureMetrics[]` | はい |

**戻り値**: `Array<{
  extension: string;
  calls: number;
  errors: number;
  contextSamples: number;
  contextRatioSum: number;
  featureCount: number;
}>`

### buildSummaryReport

```typescript
buildSummaryReport(state: UsageTrackerState, catalog: FeatureCatalog, topLimit: number): string
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| state | `UsageTrackerState` | はい |
| catalog | `FeatureCatalog` | はい |
| topLimit | `number` | はい |

**戻り値**: `string`

### buildRecentReport

```typescript
buildRecentReport(state: UsageTrackerState, limit: number): string
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| state | `UsageTrackerState` | はい |
| limit | `number` | はい |

**戻り値**: `string`

### parsePositiveInt

```typescript
parsePositiveInt(raw: string | undefined, fallback: number): number
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| raw | `string | undefined` | はい |
| fallback | `number` | はい |

**戻り値**: `number`

### exportState

```typescript
exportState(currentRuntime: RuntimeState, exportPathRaw: string | undefined): string
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| currentRuntime | `RuntimeState` | はい |
| exportPathRaw | `string | undefined` | はい |

**戻り値**: `string`

### handleAgentUsageCommand

```typescript
handleAgentUsageCommand(args: string, ctx: ExtensionAPI["context"]): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| args | `string` | はい |
| ctx | `ExtensionAPI["context"]` | はい |

**戻り値**: `void`

### recordToolCall

```typescript
recordToolCall(event: any, ctx: ExtensionAPI["context"]): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| event | `any` | はい |
| ctx | `ExtensionAPI["context"]` | はい |

**戻り値**: `void`

### recordToolResult

```typescript
recordToolResult(event: any, ctx: ExtensionAPI["context"]): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| event | `any` | はい |
| ctx | `ExtensionAPI["context"]` | はい |

**戻り値**: `void`

### recordAgentStart

```typescript
recordAgentStart(ctx: ExtensionAPI["context"]): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| ctx | `ExtensionAPI["context"]` | はい |

**戻り値**: `void`

### recordAgentEnd

```typescript
recordAgentEnd(ctx: ExtensionAPI["context"]): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| ctx | `ExtensionAPI["context"]` | はい |

**戻り値**: `void`

### registerAgentUsageTracker

```typescript
registerAgentUsageTracker(pi: ExtensionAPI): void
```

エージェント使用状況トラッカーを登録する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| pi | `ExtensionAPI` | はい |

**戻り値**: `void`

## インターフェース

### ContextSnapshot

```typescript
interface ContextSnapshot {
  tokens?: number;
  contextWindow?: number;
  ratio?: number;
}
```

### FeatureMetrics

```typescript
interface FeatureMetrics {
  extension: string;
  featureType: FeatureType;
  featureName: string;
  calls: number;
  errors: number;
  contextSamples: number;
  contextRatioSum: number;
  contextTokenSamples: number;
  contextTokenSum: number;
  lastUsedAt?: string;
  lastErrorAt?: string;
  lastErrorMessage?: string;
}
```

### UsageEventRecord

```typescript
interface UsageEventRecord {
  id: string;
  timestamp: string;
  extension: string;
  featureType: FeatureType;
  featureName: string;
  status: EventStatus;
  durationMs?: number;
  toolCallId?: string;
  inputPreview?: string;
  contextRatio?: number;
  contextTokens?: number;
  contextWindow?: number;
  error?: string;
}
```

### UsageTrackerState

```typescript
interface UsageTrackerState {
  version: number;
  createdAt: string;
  updatedAt: string;
  totals: {
    toolCalls: number;
    toolErrors: number;
    agentRuns: number;
    agentRunErrors: number;
    contextSamples: number;
    contextRatioSum: number;
    contextTokenSamples: number;
    contextTokenSum: number;
  };
  features: Record<string, FeatureMetrics>;
  events: UsageEventRecord[];
}
```

### FeatureCatalog

```typescript
interface FeatureCatalog {
  discoveredAt: string;
  toolToExtension: Record<string, string>;
  commandToExtension: Record<string, string>;
}
```

### ActiveToolCall

```typescript
interface ActiveToolCall {
  toolName: string;
  extension: string;
  featureKey: string;
  startedAtMs: number;
  inputPreview?: string;
  context?: ContextSnapshot;
}
```

### ActiveAgentRun

```typescript
interface ActiveAgentRun {
  featureKey: string;
  startedAtMs: number;
  toolCalls: number;
  toolErrors: number;
  startContext?: ContextSnapshot;
}
```

### RuntimeState

```typescript
interface RuntimeState {
  cwd: string;
  storageFile: string;
  state: UsageTrackerState;
  catalog: FeatureCatalog;
  pendingTools: Map<string, ActiveToolCall>;
  activeAgentRun?: ActiveAgentRun;
}
```

## 型定義

### FeatureType

```typescript
type FeatureType = "tool" | "agent_run"
```

### EventStatus

```typescript
type EventStatus = "ok" | "error"
```

---
*自動生成: 2026-02-24T17:08:02.129Z*
