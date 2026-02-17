---
title: dynamic-tools
category: api-reference
audience: developer
last_updated: 2026-02-17
tags: [auto-generated]
related: []
---

# dynamic-tools

## 概要

`dynamic-tools` モジュールのAPIリファレンス。

## インポート

```typescript
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Type } from '@mariozechner/pi-ai';
import { ExtensionAPI, ToolResultEvent } from '@mariozechner/pi-coding-agent';
import { getLogger } from '../lib/comprehensive-logger';
// ... and 6 more imports
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `registerDynamicToolsExtension` | - |

## 図解

### クラス図

```mermaid
classDiagram
  class CreateToolInput {
    <<interface>>
    +name: string
    +description: string
    +code: string
    +parameters: Record<stringtypestringnumberbooleanobjectarraydescriptionstringdefaultunknownenumstring[]minimumnumbermaximumnumberrequiredboolean>
    +tags: string[]
  }
  class RunDynamicToolInput {
    <<interface>>
    +tool_id: string
    +tool_name: string
    +parameters: Record<stringunknown>
    +timeout_ms: number
  }
  class ListDynamicToolsInput {
    <<interface>>
    +name: string
    +tags: string[]
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
    comprehensive_logger[comprehensive-logger]
    comprehensive_logger_types[comprehensive-logger-types]
    registry_js[registry.js]
    safety_js[safety.js]
    quality_js[quality.js]
  end
  main --> local
  subgraph external[外部ライブラリ]
    _mariozechner[@mariozechner]
    _mariozechner[@mariozechner]
  end
  main --> external
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant dynamic_tools as dynamic-tools
  participant _mariozechner as @mariozechner
  participant comprehensive_logger as comprehensive-logger
  participant comprehensive_logger_types as comprehensive-logger-types

  Caller->>dynamic_tools: registerDynamicToolsExtension()
  dynamic_tools->>_mariozechner: API呼び出し
  _mariozechner-->>dynamic_tools: レスポンス
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
| entry | `{
  timestamp: string;
  action: string;
  toolId?: string;
  toolName?: string;
  success: boolean;
  details?: Record<string, unknown>;
  error?: string;
}` | はい |

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
*自動生成: 2026-02-17T22:16:16.460Z*
