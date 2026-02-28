---
title: mediator
category: api-reference
audience: developer
last_updated: 2026-02-28
tags: [auto-generated]
related: []
---

# mediator

## 概要

`mediator` モジュールのAPIリファレンス。

## インポート

```typescript
// from '@mariozechner/pi-ai': Type
// from '@mariozechner/pi-coding-agent': ExtensionAPI
// from '@mariozechner/pi-tui': Text
// from '../lib/mediator-types.js': MediatorInput, MediatorOutput, StructuredIntent, ...
// from '../lib/intent-mediator.js': mediate, mediateWithAnswers, createMediatorSession, ...
// ... and 5 more imports
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `registerMediatorExtension` | - |

## ユーザーフロー

このモジュールが提供するツールと、その実行フローを示します。

### mediator_interpret

Interpret user input using the Mediator layer to detect information gaps and generate clarification questions.

```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Unresolved as "Unresolved"
  participant Internal as "Internal"
  participant Storage as "Storage"
  participant LLM as "LLM"

  User->>System: Interpret user input using the Mediator layer to detect i...
  System->>Unresolved: String(params.userInput ?? '').trim (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Unresolved: String (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Internal: join
  System->>Internal: セッションIDを生成
  Internal->>Unresolved: now.toISOString().replace(/[-:T.Z]/g, '').slice (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: now.toISOString().replace (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: now.toISOString (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: Math.random().toString (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: Math.random (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Storage: confirmed-facts.jsonから読み込み
  Storage->>Internal: existsSync
  Storage->>Storage: readFileSync
  Storage->>Unresolved: JSON.parse (node_modules/typescript/lib/lib.es5.d.ts)
  Storage->>Internal: isValidFactsStore
  Storage->>Unresolved: console.warn (node_modules/typescript/lib/lib.dom.d.ts)
  System->>LLM: createLlmCallFromContext
  System->>Internal: Mediatorのメインエントリーポイント
  Internal->>Unresolved: Date.now (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Internal: interpretInput
  Internal->>Internal: detectGaps
  Internal->>Internal: 各要素の充足度から全体の信頼度を算出
  Internal->>Unresolved: Math.min (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: Math.max (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: gaps.slice(0, cfg.maxQuestionsPerTurn).map (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Internal: 情報ギャップからMediatorQuestionを生成
  Internal->>Internal: getQuestionTemplate
  Internal->>Internal: 信頼度チェック
  Internal->>Internal: buildStructuredIntent
  System->>Internal: formatMediatorOutput
  Internal->>Unresolved: output.confidence.toFixed (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: lines.push (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: output.gaps.forEach (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Internal: StructuredIntentを文字列化
  System->>Internal: エラーメッセージを抽出
  Internal->>Unresolved: JSON.stringify (node_modules/typescript/lib/lib.es5.d.ts)
  System-->>User: 結果

```

## 図解

### クラス図

```mermaid
classDiagram
  class MediatorResult {
    <<interface>>
    +details: status_string_conf
  }
  class ParsedMediatorCommand {
    <<interface>>
    +mode: help_interpret
    +task: string
    +error: string
  }
  class MediatorContext {
    <<interface>>
    +model: unknown
  }
```

### 依存関係図

```mermaid
flowchart LR
  subgraph this[mediator]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    mediator_types["mediator-types"]
    intent_mediator["intent-mediator"]
    mediator_history["mediator-history"]
    mediator_integration["mediator-integration"]
    error_utils["error-utils"]
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
  createLlmCallFromContext["createLlmCallFromContext()"]
  formatMediatorOutput["formatMediatorOutput()"]
  hasMediatorDetails["hasMediatorDetails()"]
  parseMediatorCommand["parseMediatorCommand()"]
  registerMediatorExtension["registerMediatorExtension()"]
  registerMediatorExtension --> createLlmCallFromContext
  registerMediatorExtension --> formatMediatorOutput
  registerMediatorExtension --> hasMediatorDetails
  registerMediatorExtension --> parseMediatorCommand
```

## 関数

### registerMediatorExtension

```typescript
registerMediatorExtension(pi: ExtensionAPI): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| pi | `ExtensionAPI` | はい |

**戻り値**: `void`

### hasMediatorDetails

```typescript
hasMediatorDetails(value: unknown): value is MediatorResult
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| value | `unknown` | はい |

**戻り値**: `value is MediatorResult`

### parseMediatorCommand

```typescript
parseMediatorCommand(args: string | undefined): ParsedMediatorCommand
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| args | `string | undefined` | はい |

**戻り値**: `ParsedMediatorCommand`

### formatMediatorOutput

```typescript
formatMediatorOutput(output: MediatorOutput, originalInput: string): string
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `MediatorOutput` | はい |
| originalInput | `string` | はい |

**戻り値**: `string`

### createLlmCallFromContext

```typescript
createLlmCallFromContext(ctx: MediatorContext): LlmCallFunction
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| ctx | `MediatorContext` | はい |

**戻り値**: `LlmCallFunction`

## インターフェース

### MediatorResult

```typescript
interface MediatorResult {
  details?: { status?: string; confidence?: number };
}
```

### ParsedMediatorCommand

```typescript
interface ParsedMediatorCommand {
  mode: "help" | "interpret" | "history" | "clear";
  task?: string;
  error?: string;
}
```

### MediatorContext

```typescript
interface MediatorContext {
  model?: unknown;
}
```

---
*自動生成: 2026-02-28T13:55:19.214Z*
