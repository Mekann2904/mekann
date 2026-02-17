---
title: reflection
category: api-reference
audience: developer
last_updated: 2026-02-17
tags: [auto-generated]
related: []
---

# reflection

## 概要

`reflection` モジュールのAPIリファレンス。

## インポート

```typescript
import { ToolReflectionResult, ToolReflectionContext, DynamicToolMode... } from './types.js';
import { loadAllToolDefinitions, recommendToolsForTask } from './registry.js';
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `detectRepetitivePattern` | 繰り返し操作のパターンを検出 |
| 関数 | `shouldCreateNewTool` | 新しいツールを作成すべきかどうかを判定 |
| 関数 | `buildReflectionPrompt` | リフレクション用のプロンプトを生成 |
| 関数 | `proposeToolFromTask` | タスクから自動的にツールを提案 |
| 関数 | `shouldTriggerReflection` | リフレクションを実行すべきかどうかを判定 |

## 図解

### 依存関係図

```mermaid
flowchart LR
  subgraph this[reflection]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    types_js["types.js"]
    registry_js["registry.js"]
  end
  main --> local
```

### 関数フロー

```mermaid
flowchart TD
  detectRepetitivePattern["detectRepetitivePattern()"]
  shouldCreateNewTool["shouldCreateNewTool()"]
  buildReflectionPrompt["buildReflectionPrompt()"]
  proposeToolFromTask["proposeToolFromTask()"]
  shouldTriggerReflection["shouldTriggerReflection()"]
  detectRepetitivePattern -.-> shouldCreateNewTool
  shouldCreateNewTool -.-> buildReflectionPrompt
  buildReflectionPrompt -.-> proposeToolFromTask
  proposeToolFromTask -.-> shouldTriggerReflection
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant reflection as "reflection"
  participant types_js as "types.js"
  participant registry_js as "registry.js"

  Caller->>reflection: detectRepetitivePattern()
  reflection->>types_js: 内部関数呼び出し
  types_js-->>reflection: 結果
  reflection-->>Caller: { detected: boolean; pattern: string; occurrences: number } | null

  Caller->>reflection: shouldCreateNewTool()
  reflection-->>Caller: ToolReflectionResult
```

## 関数

### detectRepetitivePattern

```typescript
detectRepetitivePattern(context: ToolReflectionContext): { detected: boolean; pattern: string; occurrences: number } | null
```

繰り返し操作のパターンを検出

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| context | `ToolReflectionContext` | はい |

**戻り値**: `{ detected: boolean; pattern: string; occurrences: number } | null`

### extractBashPatterns

```typescript
extractBashPatterns(output: string): string[]
```

Bashコマンドパターンを抽出

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |

**戻り値**: `string[]`

### shouldCreateNewTool

```typescript
shouldCreateNewTool(context: ToolReflectionContext): ToolReflectionResult
```

新しいツールを作成すべきかどうかを判定

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| context | `ToolReflectionContext` | はい |

**戻り値**: `ToolReflectionResult`

### generateToolNameFromPattern

```typescript
generateToolNameFromPattern(pattern: string): string
```

パターンからツール名を生成

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| pattern | `string` | はい |

**戻り値**: `string`

### generateToolNameFromTask

```typescript
generateToolNameFromTask(task: string): string
```

タスクからツール名を生成

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| task | `string` | はい |

**戻り値**: `string`

### extractCodeFromResult

```typescript
extractCodeFromResult(result: string): string
```

実行結果からコードを抽出

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| result | `string` | はい |

**戻り値**: `string`

### detectComplexChain

```typescript
detectComplexChain(result: string): boolean
```

複雑な操作チェーンを検出

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| result | `string` | はい |

**戻り値**: `boolean`

### buildReflectionPrompt

```typescript
buildReflectionPrompt(context: ToolReflectionContext, reflectionResult: ToolReflectionResult): string
```

リフレクション用のプロンプトを生成

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| context | `ToolReflectionContext` | はい |
| reflectionResult | `ToolReflectionResult` | はい |

**戻り値**: `string`

### proposeToolFromTask

```typescript
proposeToolFromTask(task: string, lastToolResult?: string): ToolReflectionResult["proposedTool"] | null
```

タスクから自動的にツールを提案

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| task | `string` | はい |
| lastToolResult | `string` | いいえ |

**戻り値**: `ToolReflectionResult["proposedTool"] | null`

### shouldTriggerReflection

```typescript
shouldTriggerReflection(context: Partial<ToolReflectionContext>): boolean
```

リフレクションを実行すべきかどうかを判定

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| context | `Partial<ToolReflectionContext>` | はい |

**戻り値**: `boolean`

---
*自動生成: 2026-02-17T22:24:18.924Z*
