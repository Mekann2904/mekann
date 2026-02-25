---
title: self-improvement-reflection
category: api-reference
audience: developer
last_updated: 2026-02-24
tags: [auto-generated]
related: []
---

# self-improvement-reflection

## 概要

`self-improvement-reflection` モジュールのAPIリファレンス。

## インポート

```typescript
// from '@mariozechner/pi-ai': Type
// from '@mariozechner/pi-coding-agent': ExtensionAPI
// from '../lib/self-improvement-data-platform.js': buildIntegratedDataView, generateInsightReport, saveInsightReport, ...
// from '@mariozechner/pi-coding-agent': ExtensionContext
// from '../lib/comprehensive-logger': getLogger
// ... and 1 more imports
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `registerSelfImprovementReflection` | - |

## 図解

### 依存関係図

```mermaid
flowchart LR
  subgraph this[self-improvement-reflection]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    self_improvement_data_platform["self-improvement-data-platform"]
    comprehensive_logger["comprehensive-logger"]
    comprehensive_logger_types["comprehensive-logger-types"]
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
  executeSelfReflectTool["executeSelfReflectTool()"]
  generateNewInsights["generateNewInsights()"]
  handleSelfReflectCommand["handleSelfReflectCommand()"]
  registerSelfImprovementReflection["registerSelfImprovementReflection()"]
  showHistory["showHistory()"]
  showInsights["showInsights()"]
  showPerspectives["showPerspectives()"]
  showSummary["showSummary()"]
  handleSelfReflectCommand --> generateNewInsights
  handleSelfReflectCommand --> showHistory
  handleSelfReflectCommand --> showInsights
  handleSelfReflectCommand --> showPerspectives
  handleSelfReflectCommand --> showSummary
  registerSelfImprovementReflection --> executeSelfReflectTool
  registerSelfImprovementReflection --> handleSelfReflectCommand
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant self_improvement_reflection as "self-improvement-reflection"
  participant mariozechner as "@mariozechner"
  participant self_improvement_data_platform as "self-improvement-data-platform"
  participant comprehensive_logger as "comprehensive-logger"

  Caller->>self_improvement_reflection: registerSelfImprovementReflection()
  self_improvement_reflection->>mariozechner: API呼び出し
  mariozechner-->>self_improvement_reflection: レスポンス
  self_improvement_reflection->>self_improvement_data_platform: 内部関数呼び出し
  self_improvement_data_platform-->>self_improvement_reflection: 結果
  self_improvement_reflection-->>Caller: void
```

## 関数

### handleSelfReflectCommand

```typescript
async handleSelfReflectCommand(args: string, ctx: ExtensionContext): Promise<void>
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| args | `string` | はい |
| ctx | `ExtensionContext` | はい |

**戻り値**: `Promise<void>`

### showSummary

```typescript
async showSummary(ctx: ExtensionContext): Promise<void>
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| ctx | `ExtensionContext` | はい |

**戻り値**: `Promise<void>`

### showInsights

```typescript
async showInsights(ctx: ExtensionContext): Promise<void>
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| ctx | `ExtensionContext` | はい |

**戻り値**: `Promise<void>`

### generateNewInsights

```typescript
async generateNewInsights(ctx: ExtensionContext): Promise<void>
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| ctx | `ExtensionContext` | はい |

**戻り値**: `Promise<void>`

### showPerspectives

```typescript
async showPerspectives(ctx: ExtensionContext): Promise<void>
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| ctx | `ExtensionContext` | はい |

**戻り値**: `Promise<void>`

### showHistory

```typescript
async showHistory(ctx: ExtensionContext, limitRaw?: string): Promise<void>
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| ctx | `ExtensionContext` | はい |
| limitRaw | `string` | いいえ |

**戻り値**: `Promise<void>`

### executeSelfReflectTool

```typescript
async executeSelfReflectTool(_toolCallId: string, params: {
    action?: "summary" | "insights" | "generate" | "perspectives" | "analyze";
    perspective?: PhilosophicalPerspective;
    focus_area?: string;
    config?: Partial<PlatformConfig>;
  }, _signal: AbortSignal, _onUpdate: (partialResult: { content: Array<{ type: "text"; text: string }> }) => void, ctx: ExtensionContext): Promise<{
  content: Array<{ type: "text"; text: string }>;
  details?: Record<string, unknown>;
}>
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| _toolCallId | `string` | はい |
| params | `object` | はい |
| &nbsp;&nbsp;↳ action | `"summary" | "insights" | "generate" | "perspectives" | "analyze"` | いいえ |
| &nbsp;&nbsp;↳ perspective | `PhilosophicalPerspective` | いいえ |
| &nbsp;&nbsp;↳ focus_area | `string` | いいえ |
| &nbsp;&nbsp;↳ config | `Partial<PlatformConfig>` | いいえ |
| _signal | `AbortSignal` | はい |
| _onUpdate | `(partialResult: { content: Array<{ type: "text"...` | はい |
| ctx | `ExtensionContext` | はい |

**戻り値**: `Promise<{
  content: Array<{ type: "text"; text: string }>;
  details?: Record<string, unknown>;
}>`

### registerSelfImprovementReflection

```typescript
registerSelfImprovementReflection(pi: ExtensionAPI): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| pi | `ExtensionAPI` | はい |

**戻り値**: `void`

## 型定義

### ReflectionAction

```typescript
type ReflectionAction = "summary" | "insights" | "generate" | "perspectives" | "history"
```

---
*自動生成: 2026-02-24T17:08:02.471Z*
