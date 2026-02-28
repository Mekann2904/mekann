---
title: ul-diagnostic
category: api-reference
audience: developer
last_updated: 2026-02-28
tags: [auto-generated]
related: []
---

# ul-diagnostic

## 概要

`ul-diagnostic` モジュールのAPIリファレンス。

## インポート

```typescript
// from '@mariozechner/pi-ai': Type
// from '@mariozechner/pi-coding-agent': ExtensionAPI
// from 'fs': fs
// from 'path': path
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `registerUlDiagnosticExtension` | UI診断機能の拡張を登録 |

## ユーザーフロー

このモジュールが提供するツールと、その実行フローを示します。

### ul_diagnostic

ULモードの診断を実行し、既知の問題をチェックする

```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Executor as "Executor"
  participant Unresolved as "Unresolved"
  participant Runtime as "Runtime"
  participant Judge as "Judge"
  participant Internal as "Internal"

  User->>System: ULモードの診断を実行し、既知の問題をチェックする
  System->>Executor: runDiagnostics
  Executor->>Unresolved: results.push (node_modules/typescript/lib/lib.es5.d.ts)
  Executor->>Runtime: checkRateLimitState
  Runtime->>Unresolved: require (node_modules/@types/node/module.d.ts)
  Runtime->>Unresolved: String (node_modules/typescript/lib/lib.es5.d.ts)
  Executor->>Runtime: checkRuntimeInitialization
  Runtime->>Runtime: getRuntimeState
  Executor->>Judge: checkResourceLeaks
  Executor->>Runtime: checkParallelExecutionRisk
  Runtime->>Unresolved: Math.round (node_modules/typescript/lib/lib.es5.d.ts)
  Executor->>Judge: checkConfiguration
  Judge->>Unresolved: issues.join (node_modules/typescript/lib/lib.es5.d.ts)
  Executor->>Judge: checkUlModeState
  Executor->>Unresolved: results.filter (node_modules/typescript/lib/lib.es5.d.ts)
  Executor->>Unresolved: new Date().toISOString (node_modules/typescript/lib/lib.es5.d.ts)
  Executor->>Internal: isUlModeActive
  System->>Internal: formatReport
  System-->>User: 結果

```

## 図解

### クラス図

```mermaid
classDiagram
  class DiagnosticResult {
    <<interface>>
    +category: string
    +severity: critical_high_m
    +issue: string
    +description: string
    +recommendation: string
  }
  class DiagnosticReport {
    <<interface>>
    +timestamp: string
    +ulModeActive: boolean
    +results: DiagnosticResult
    +summary: total_number_detect
  }
  class RateLimitState {
    <<interface>>
    +entries: Map_string_untilMs
  }
  class RuntimeState {
    <<interface>>
    +subagents: activeRunRequests_n
    +teams: activeTeamRuns_numb
    +queue: pending_unknown
    +limits: maxTotalActiveLlm_n
    +activeLlm: number
  }
```

### 依存関係図

```mermaid
flowchart LR
  subgraph this[ul-diagnostic]
    main[Main Module]
  end
  subgraph external[外部ライブラリ]
    _mariozechner["@mariozechner"]
    _mariozechner["@mariozechner"]
    fs["fs"]
    path["path"]
  end
  main --> external
```

### 関数フロー

```mermaid
flowchart TD
  checkConfiguration["checkConfiguration()"]
  checkParallelExecutionRisk["checkParallelExecutionRisk()"]
  checkRateLimitState["checkRateLimitState()"]
  checkResourceLeaks["checkResourceLeaks()"]
  checkRuntimeInitialization["checkRuntimeInitialization()"]
  checkUlModeState["checkUlModeState()"]
  formatReport["formatReport()"]
  getRuntimeState["getRuntimeState()"]
  isUlModeActive["isUlModeActive()"]
  registerUlDiagnosticExtension["registerUlDiagnosticExtension()"]
  runDiagnostics["runDiagnostics()"]
  checkParallelExecutionRisk --> getRuntimeState
  checkResourceLeaks --> getRuntimeState
  checkRuntimeInitialization --> getRuntimeState
  isUlModeActive --> isUlModeActive
  registerUlDiagnosticExtension --> formatReport
  registerUlDiagnosticExtension --> runDiagnostics
  runDiagnostics --> checkConfiguration
  runDiagnostics --> checkParallelExecutionRisk
  runDiagnostics --> checkRateLimitState
  runDiagnostics --> checkResourceLeaks
  runDiagnostics --> checkRuntimeInitialization
  runDiagnostics --> checkUlModeState
  runDiagnostics --> isUlModeActive
```

## 関数

### getRateLimitState

```typescript
getRateLimitState(): RateLimitState | null
```

**戻り値**: `RateLimitState | null`

### getRuntimeState

```typescript
getRuntimeState(): RuntimeState | null
```

**戻り値**: `RuntimeState | null`

### isUlModeActive

```typescript
isUlModeActive(): boolean
```

**戻り値**: `boolean`

### checkRateLimitState

```typescript
checkRateLimitState(): DiagnosticResult
```

**戻り値**: `DiagnosticResult`

### checkRuntimeInitialization

```typescript
checkRuntimeInitialization(): DiagnosticResult
```

**戻り値**: `DiagnosticResult`

### checkResourceLeaks

```typescript
checkResourceLeaks(): DiagnosticResult
```

**戻り値**: `DiagnosticResult`

### checkParallelExecutionRisk

```typescript
checkParallelExecutionRisk(): DiagnosticResult
```

**戻り値**: `DiagnosticResult`

### checkConfiguration

```typescript
checkConfiguration(): DiagnosticResult
```

**戻り値**: `DiagnosticResult`

### checkUlModeState

```typescript
checkUlModeState(): DiagnosticResult
```

**戻り値**: `DiagnosticResult`

### runDiagnostics

```typescript
runDiagnostics(): DiagnosticReport
```

**戻り値**: `DiagnosticReport`

### formatReport

```typescript
formatReport(report: DiagnosticReport): string
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| report | `DiagnosticReport` | はい |

**戻り値**: `string`

### registerUlDiagnosticExtension

```typescript
registerUlDiagnosticExtension(pi: ExtensionAPI): void
```

UI診断機能の拡張を登録

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| pi | `ExtensionAPI` | はい |

**戻り値**: `void`

## インターフェース

### DiagnosticResult

```typescript
interface DiagnosticResult {
  category: string;
  severity: "critical" | "high" | "medium" | "low";
  issue: string;
  description: string;
  recommendation: string;
  detected: boolean;
  details?: string;
}
```

### DiagnosticReport

```typescript
interface DiagnosticReport {
  timestamp: string;
  ulModeActive: boolean;
  results: DiagnosticResult[];
  summary: {
    total: number;
    detected: number;
    bySeverity: Record<string, number>;
  };
}
```

### RateLimitState

```typescript
interface RateLimitState {
  entries: Map<string, { untilMs: number; hits: number; updatedAtMs: number }>;
}
```

### RuntimeState

```typescript
interface RuntimeState {
  subagents?: { activeRunRequests: number; activeAgents: number };
  teams?: { activeTeamRuns: number; activeTeammates: number };
  queue?: { pending: unknown[] };
  limits?: { maxTotalActiveLlm: number };
  activeLlm?: number;
  pendingQueue?: unknown[];
}
```

---
*自動生成: 2026-02-28T13:55:22.983Z*
