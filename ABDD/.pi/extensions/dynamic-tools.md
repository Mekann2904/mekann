---
title: dynamic-tools
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated]
related: []
---

# dynamic-tools

## 概要

`dynamic-tools` モジュールのAPIリファレンス。

## インポート

```typescript
// from 'node:fs': appendFileSync, existsSync, mkdirSync
// from 'node:path': join
// from '@mariozechner/pi-ai': Type
// from '@mariozechner/pi-coding-agent': ExtensionAPI, ToolResultEvent
// from '../lib/comprehensive-logger': getLogger
// ... and 6 more imports
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `registerDynamicToolsExtension` | 動的ツール拡張を登録 |

## ユーザーフロー

このモジュールが提供するツールと、その実行フローを示します。

### create_tool

動的ツールを生成します。TypeScriptコードを指定して新しいツールを作成します。

```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Executor as "Executor"
  participant Unresolved as "Unresolved"
  participant Internal as "Internal"
  participant Storage as "Storage"

  User->>System: 動的ツールを生成します。TypeScriptコードを指定して新しいツールを作成します。
  System->>Executor: create_tool: 動的ツールを生成
  Executor->>Unresolved: logger.startOperation (.pi/lib/comprehensive-logger.ts)
  Executor->>Internal: レジストリ取得
  Executor->>Unresolved: input.name.trim (node_modules/typescript/lib/lib.es5.d.ts)
  Executor->>Unresolved: logger.endOperation (.pi/lib/comprehensive-logger.ts)
  Executor->>Unresolved: /^[a-z][a-z0-9_-]*$/i.test (node_modules/typescript/lib/lib.es5.d.ts)
  Executor->>Internal: リスク判定
  Internal->>Unresolved: HIGH_STAKES_PATTERNS.some (node_modules/typescript/lib/lib.es5.d.ts)
  Executor->>Storage: writeAuditLog
  Storage->>Internal: getAuditLogPath
  Internal->>Unresolved: process.cwd (node_modules/@types/node/process.d.ts)
  Internal->>Internal: join
  Internal->>Internal: existsSync
  Internal->>Internal: mkdirSync
  Storage->>Unresolved: JSON.stringify (node_modules/typescript/lib/lib.es5.d.ts)
  Storage->>Storage: appendFileSync
  Executor->>Unresolved: new Date().toISOString (node_modules/typescript/lib/lib.es5.d.ts)
  Executor->>Internal: コードの安全性を解析
  Internal->>Unresolved: code.split (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: patternInfo.pattern.flags.includes (node_modules/typescript/lib/lib.es2015.core.d.ts)
  Internal->>Unresolved: Array.from (node_modules/typescript/lib/lib.es2015.core.d.ts)
  Internal->>Unresolved: code.matchAll (node_modules/typescript/lib/lib.es2020.string.d.ts)
  Internal->>Internal: findLineNumber
  Internal->>Unresolved: snippet.slice (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: allowedOperations.push (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Internal: getSeverityPenalty
  Internal->>Unresolved: issues.filter (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: issues.map (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: issueTypes.has (node_modules/typescript/lib/lib.es2015.collection.d.ts)
  Internal->>Unresolved: Math.max (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: Math.min (node_modules/typescript/lib/lib.es5.d.ts)
  Executor->>Internal: 品質評価
  Internal->>Internal: extractFunctionLengths
  Internal->>Unresolved: code.match (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: Object.entries (node_modules/typescript/lib/lib.es2017.object.d.ts)
  Internal->>Internal: generateImprovements
  Internal->>Internal: calculateConfidence
  Internal->>Unresolved: Math.round (node_modules/typescript/lib/lib.es5.d.ts)
  Executor->>Unresolved: registry.register (.pi/lib/dynamic-tools/registry.ts)
  Executor->>Unresolved: Object.keys (node_modules/typescript/lib/lib.es5.d.ts)
  Executor->>Unresolved: safetyResult.score.toFixed (node_modules/typescript/lib/lib.es5.d.ts)
  Executor->>Unresolved: String (node_modules/typescript/lib/lib.es5.d.ts)
  System-->>User: 結果

```

### run_dynamic_tool

登録済みの動的ツールを実行します。tool_idまたはtool_nameでツールを指定します。

```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Executor as "Executor"
  participant Unresolved as "Unresolved"
  participant Internal as "Internal"
  participant Judge as "Judge"
  participant Storage as "Storage"

  User->>System: 登録済みの動的ツールを実行します。tool_idまたはtool_nameでツールを指定します。
  System->>Executor: run_dynamic_tool: 動的ツールを実行
  Executor->>Unresolved: logger.startOperation (.pi/lib/comprehensive-logger.ts)
  Executor->>Internal: レジストリ取得
  Executor->>Unresolved: registry.getById (.pi/lib/dynamic-tools/registry.ts)
  Executor->>Unresolved: registry.findByName (.pi/lib/dynamic-tools/registry.ts)
  Executor->>Unresolved: logger.endOperation (.pi/lib/comprehensive-logger.ts)
  Executor->>Unresolved: tool.parameters.filter(p => p.required).map (node_modules/typescript/lib/lib.es5.d.ts)
  Executor->>Unresolved: tool.parameters.filter (node_modules/typescript/lib/lib.es5.d.ts)
  Executor->>Unresolved: missingParams.join (node_modules/typescript/lib/lib.es5.d.ts)
  Executor->>Executor: 動的ツールを実行
  Executor->>Unresolved: Date.now (node_modules/typescript/lib/lib.es5.d.ts)
  Executor->>Judge: 安全性分析実行
  Judge->>Unresolved: pattern.pattern.test (node_modules/typescript/lib/lib.es5.d.ts)
  Executor->>Unresolved: JSON.stringify (node_modules/typescript/lib/lib.es5.d.ts)
  Executor->>Unresolved: Promise.race (node_modules/typescript/lib/lib.es2015.iterable.d.ts)
  Executor->>Executor: コードを実行
  Executor->>Internal: createContext
  Executor->>Executor: runInContext
  Executor->>Unresolved: String (node_modules/typescript/lib/lib.es5.d.ts)
  Executor->>Internal: setTimeout
  Executor->>Unresolved: registry.recordUsage (.pi/lib/dynamic-tools/registry.ts)
  Executor->>Internal: メトリクス記録
  Internal->>Unresolved: usageStatistics.get (node_modules/typescript/lib/lib.es2015.collection.d.ts)
  Internal->>Unresolved: usageStatistics.set (node_modules/typescript/lib/lib.es2015.collection.d.ts)
  Internal->>Unresolved: Math.max (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: Math.min (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: stats.recentExecutions.push (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: stats.recentExecutions.shift (node_modules/typescript/lib/lib.es5.d.ts)
  Executor->>Storage: writeAuditLog
  Storage->>Internal: getAuditLogPath
  Internal->>Unresolved: process.cwd (node_modules/@types/node/process.d.ts)
  Internal->>Internal: existsSync
  Internal->>Internal: mkdirSync
  Storage->>Storage: appendFileSync
  Executor->>Unresolved: new Date().toISOString (node_modules/typescript/lib/lib.es5.d.ts)
  System-->>User: 結果

```

### list_dynamic_tools

登録済みの動的ツール一覧を表示します。フィルタリングオプションを利用可能です。

```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Executor as "Executor"
  participant Internal as "Internal"
  participant Unresolved as "Unresolved"

  User->>System: 登録済みの動的ツール一覧を表示します。フィルタリングオプションを利用可能です。
  System->>Executor: list_dynamic_tools: ツール一覧を表示
  Executor->>Internal: レジストリ取得
  Executor->>Unresolved: registry.search (.pi/lib/dynamic-tools/registry.ts)
  Executor->>Unresolved: new Date(tool.lastUsedAt).toLocaleString (node_modules/typescript/lib/lib.es5.d.ts)
  Executor->>Unresolved: lines.push (node_modules/typescript/lib/lib.es5.d.ts)
  Executor->>Unresolved: tool.confidenceScore.toFixed (node_modules/typescript/lib/lib.es5.d.ts)
  Executor->>Unresolved: tool.tags.join (node_modules/typescript/lib/lib.es5.d.ts)
  System-->>User: 結果

```

### delete_dynamic_tool

登録済みの動的ツールを削除します。confirm: true で削除を確定します。

```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Executor as "Executor"
  participant Unresolved as "Unresolved"
  participant Internal as "Internal"
  participant Storage as "Storage"

  User->>System: 登録済みの動的ツールを削除します。confirm: true で削除を確定します。
  System->>Executor: delete_dynamic_tool: ツールを削除
  Executor->>Unresolved: logger.startOperation (.pi/lib/comprehensive-logger.ts)
  Executor->>Internal: レジストリ取得
  Executor->>Unresolved: logger.endOperation (.pi/lib/comprehensive-logger.ts)
  Executor->>Unresolved: registry.getById (.pi/lib/dynamic-tools/registry.ts)
  Executor->>Unresolved: registry.findByName (.pi/lib/dynamic-tools/registry.ts)
  Executor->>Unresolved: registry.delete (.pi/lib/dynamic-tools/registry.ts)
  Executor->>Storage: writeAuditLog
  Storage->>Internal: getAuditLogPath
  Internal->>Unresolved: process.cwd (node_modules/@types/node/process.d.ts)
  Internal->>Internal: join
  Internal->>Internal: existsSync
  Internal->>Internal: mkdirSync
  Storage->>Unresolved: JSON.stringify (node_modules/typescript/lib/lib.es5.d.ts)
  Storage->>Storage: appendFileSync
  Executor->>Unresolved: new Date().toISOString (node_modules/typescript/lib/lib.es5.d.ts)
  Executor->>Unresolved: String (node_modules/typescript/lib/lib.es5.d.ts)
  System-->>User: 結果

```

### tool_reflection

タスク実行後に反省を行い、ツール生成が推奨されるかを判定します。

```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Executor as "Executor"
  participant Unresolved as "Unresolved"

  User->>System: タスク実行後に反省を行い、ツール生成が推奨されるかを判定します。
  System->>Executor: tool_reflection: 実行後の反省とツール生成判定
  Executor->>Unresolved: input.task_description.toLowerCase (node_modules/typescript/lib/lib.es5.d.ts)
  Executor->>Unresolved: toolGenerationPatterns.find (node_modules/typescript/lib/lib.es2015.core.d.ts)
  Executor->>Unresolved: p.pattern.test (node_modules/typescript/lib/lib.es5.d.ts)
  Executor->>Unresolved: input.task_description.slice (node_modules/typescript/lib/lib.es5.d.ts)
  Executor->>Unresolved: lines.push (node_modules/typescript/lib/lib.es5.d.ts)
  Executor->>Unresolved: lines.join (node_modules/typescript/lib/lib.es5.d.ts)
  System-->>User: 結果

```

## 図解

### クラス図

```mermaid
classDiagram
  class CreateToolInput {
    <<interface>>
    +name: string
    +description: string
    +code: string
    +parameters: Record_string_type
    +tags: string
  }
  class RunDynamicToolInput {
    <<interface>>
    +tool_id: string
    +tool_name: string
    +parameters: Record_string_unknow
    +timeout_ms: number
  }
  class ListDynamicToolsInput {
    <<interface>>
    +name: string
    +tags: string
    +min_safety_score: number
    +limit: number
  }
  class DeleteDynamicToolInput {
    <<interface>>
    +tool_id: string
    +tool_name: string
    +confirm: boolean
  }
  class ToolReflectionInput {
    <<interface>>
    +task_description: string
    +last_tool_result: string
    +failed_attempts: number
  }
```

### 依存関係図

```mermaid
flowchart LR
  subgraph this[dynamic-tools]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    comprehensive_logger["comprehensive-logger"]
    comprehensive_logger_types["comprehensive-logger-types"]
    registry["registry"]
    safety["safety"]
    quality["quality"]
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
  executeCode["executeCode()"]
  executeDynamicTool["executeDynamicTool()"]
  getAuditLogPath["getAuditLogPath()"]
  handleCreateTool["handleCreateTool()"]
  handleDeleteDynamicTool["handleDeleteDynamicTool()"]
  handleListDynamicTools["handleListDynamicTools()"]
  handleRunDynamicTool["handleRunDynamicTool()"]
  handleToolReflection["handleToolReflection()"]
  registerDynamicToolsExtension["registerDynamicToolsExtension()"]
  writeAuditLog["writeAuditLog()"]
  executeDynamicTool --> executeCode
  handleCreateTool --> writeAuditLog
  handleDeleteDynamicTool --> writeAuditLog
  handleRunDynamicTool --> executeDynamicTool
  handleRunDynamicTool --> writeAuditLog
  registerDynamicToolsExtension --> handleCreateTool
  registerDynamicToolsExtension --> handleDeleteDynamicTool
  registerDynamicToolsExtension --> handleListDynamicTools
  registerDynamicToolsExtension --> handleRunDynamicTool
  registerDynamicToolsExtension --> handleToolReflection
  writeAuditLog --> getAuditLogPath
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant dynamic_tools as "dynamic-tools"
  participant mariozechner as "@mariozechner"
  participant comprehensive_logger as "comprehensive-logger"
  participant comprehensive_logger_types as "comprehensive-logger-types"

  Caller->>dynamic_tools: registerDynamicToolsExtension()
  dynamic_tools->>mariozechner: API呼び出し
  mariozechner-->>dynamic_tools: レスポンス
  dynamic_tools->>comprehensive_logger: 内部関数呼び出し
  comprehensive_logger-->>dynamic_tools: 結果
  dynamic_tools-->>Caller: void
```

## 関数

### getAuditLogPath

```typescript
getAuditLogPath(): string
```

**戻り値**: `string`

### writeAuditLog

```typescript
writeAuditLog(entry: {
  timestamp: string;
  action: string;
  toolId?: string;
  toolName?: string;
  success: boolean;
  details?: Record<string, unknown>;
  error?: string;
}): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| entry | `object` | はい |
| &nbsp;&nbsp;↳ timestamp | `string` | はい |
| &nbsp;&nbsp;↳ action | `string` | はい |
| &nbsp;&nbsp;↳ toolId | `string` | いいえ |
| &nbsp;&nbsp;↳ toolName | `string` | いいえ |
| &nbsp;&nbsp;↳ success | `boolean` | はい |
| &nbsp;&nbsp;↳ details | `Record<string, unknown>` | いいえ |
| &nbsp;&nbsp;↳ error | `string` | いいえ |

**戻り値**: `void`

### executeDynamicTool

```typescript
async executeDynamicTool(tool: DynamicToolDefinition, params: Record<string, unknown>, timeoutMs: number): Promise<ToolExecutionResult>
```

動的ツールを実行
注意: 同一プロセス内でフル権限実行

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| tool | `DynamicToolDefinition` | はい |
| params | `Record<string, unknown>` | はい |
| timeoutMs | `number` | はい |

**戻り値**: `Promise<ToolExecutionResult>`

### executeCode

```typescript
async executeCode(code: string): Promise<ToolExecutionResult>
```

コードを実行
セキュリティ: VMコンテキストからrequire, process, タイマーを削除し
外部モジュールアクセス、プロセス操作、サンドボックスエスケープを制限

利用可能なグローバルオブジェクト:
- console, Buffer
- 標準オブジェクト: Promise, JSON, Object, Array, String, Number, Boolean, Date, Math
- エラークラス: Error, TypeError, RangeError, SyntaxError
- URL関連: URL, URLSearchParams

利用不可（セキュリティ制約）:
- require: 外部モジュールアクセス禁止
- process: 環境変数・プロセス情報アクセス禁止
- global, globalThis: グローバルスコープ汚染禁止
- __dirname, __filename: ファイルシステムパス漏洩禁止
- setTimeout, setInterval, clearTimeout, clearInterval: サンドボックスエスケープ防止

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| code | `string` | はい |

**戻り値**: `Promise<ToolExecutionResult>`

### handleCreateTool

```typescript
async handleCreateTool(input: CreateToolInput): Promise<string>
```

create_tool: 動的ツールを生成

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| input | `CreateToolInput` | はい |

**戻り値**: `Promise<string>`

### handleRunDynamicTool

```typescript
async handleRunDynamicTool(input: RunDynamicToolInput): Promise<string>
```

run_dynamic_tool: 動的ツールを実行

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| input | `RunDynamicToolInput` | はい |

**戻り値**: `Promise<string>`

### handleListDynamicTools

```typescript
async handleListDynamicTools(input: ListDynamicToolsInput): Promise<string>
```

list_dynamic_tools: ツール一覧を表示

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| input | `ListDynamicToolsInput` | はい |

**戻り値**: `Promise<string>`

### handleDeleteDynamicTool

```typescript
async handleDeleteDynamicTool(input: DeleteDynamicToolInput): Promise<string>
```

delete_dynamic_tool: ツールを削除

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| input | `DeleteDynamicToolInput` | はい |

**戻り値**: `Promise<string>`

### handleToolReflection

```typescript
async handleToolReflection(input: ToolReflectionInput): Promise<string>
```

tool_reflection: 実行後の反省とツール生成判定

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| input | `ToolReflectionInput` | はい |

**戻り値**: `Promise<string>`

### registerDynamicToolsExtension

```typescript
registerDynamicToolsExtension(pi: ExtensionAPI): void
```

動的ツール拡張を登録

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| pi | `ExtensionAPI` | はい |

**戻り値**: `void`

## インターフェース

### CreateToolInput

```typescript
interface CreateToolInput {
  name: string;
  description: string;
  code: string;
  parameters?: Record<string, {
    type: "string" | "number" | "boolean" | "object" | "array";
    description: string;
    default?: unknown;
    enum?: string[];
    minimum?: number;
    maximum?: number;
    required?: boolean;
  }>;
  tags?: string[];
  generated_from?: string;
}
```

### RunDynamicToolInput

```typescript
interface RunDynamicToolInput {
  tool_id?: string;
  tool_name?: string;
  parameters: Record<string, unknown>;
  timeout_ms?: number;
}
```

### ListDynamicToolsInput

```typescript
interface ListDynamicToolsInput {
  name?: string;
  tags?: string[];
  min_safety_score?: number;
  limit?: number;
}
```

### DeleteDynamicToolInput

```typescript
interface DeleteDynamicToolInput {
  tool_id?: string;
  tool_name?: string;
  confirm?: boolean;
}
```

### ToolReflectionInput

```typescript
interface ToolReflectionInput {
  task_description: string;
  last_tool_result: string;
  failed_attempts?: number;
}
```

---
*自動生成: 2026-02-18T18:06:17.245Z*
