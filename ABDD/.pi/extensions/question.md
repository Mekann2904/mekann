---
title: question
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated]
related: []
---

# question

## 概要

`question` モジュールのAPIリファレンス。

## インポート

```typescript
// from '@mariozechner/pi-ai': Type
// from '@mariozechner/pi-coding-agent': ExtensionAPI
// from '@mariozechner/pi-tui': Text, truncateToWidth, CURSOR_MARKER
// from '@mariozechner/pi-tui': matchesKey, Key
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|

## ユーザーフロー

このモジュールが提供するツールと、その実行フローを示します。

### question

**必須使用**: ユーザーに選択肢から選ばせたり、確認を求める場合は必ずこのツールを使ってください。単一選択、複数選択、自由記述に対応。

```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Unresolved as "Unresolved"
  participant Internal as "Internal"
  participant Executor as "Executor"

  User->>System: **必須使用**: ユーザーに選択肢から選ばせたり、確認を求める場合は必ずこのツールを使ってください。単一選択、複...
  System->>Unresolved: new Array(questions.length).fill (node_modules/typescript/lib/lib.es2015.core.d.ts)
  System->>Internal: askSingleQuestion
  Internal->>Internal: createRenderer
  Internal->>Unresolved: lines.push (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Executor: truncateToWidth
  Internal->>Internal: add
  Internal->>Unresolved: '─'.repeat (node_modules/typescript/lib/lib.es2015.core.d.ts)
  Internal->>Unresolved: state.customInput.split (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: line.slice (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Internal: addCursorLine
  Internal->>Unresolved: state.customInput.endsWith (node_modules/typescript/lib/lib.es2015.core.d.ts)
  Internal->>Unresolved: state.selected.has (node_modules/typescript/lib/lib.es2015.collection.d.ts)
  Internal->>Unresolved: pasteBuffer.indexOf (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: pasteBuffer.substring (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: pasteContent.replace(/\r\n/g, '\n').replace (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Internal: matchesKey
  Internal->>Unresolved: Key.shift (node_modules/@mariozechner/pi-tui/dist/keys.d.ts)
  Internal->>Unresolved: state.customInput.trim (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: Math.min (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: Math.max (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: newSelected.delete (node_modules/typescript/lib/lib.es2015.collection.d.ts)
  Internal->>Unresolved: state.selected.forEach (node_modules/typescript/lib/lib.es2015.collection.d.ts)
  System->>Internal: showConfirmationScreen
  Internal->>Unresolved: /^[1-9]$/.test (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Internal: parseInt
  System->>Unresolved: questions.map((q, i) => `'${q.question}'='${answers[i]!.join(', ')}'`).join (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Unresolved: questions.map (node_modules/typescript/lib/lib.es5.d.ts)
  System-->>User: 結果

```

## 図解

### クラス図

```mermaid
classDiagram
  class QuestionOption {
    <<interface>>
    +label: string
    +description: string
  }
  class QuestionInfo {
    <<interface>>
    +question: string
    +header: string
    +options: QuestionOption
    +multiple: boolean
    +custom: boolean
  }
```

### 依存関係図

```mermaid
flowchart LR
  subgraph this[question]
    main[Main Module]
  end
  subgraph external[外部ライブラリ]
    _mariozechner["@mariozechner"]
    _mariozechner["@mariozechner"]
    _mariozechner["@mariozechner"]
    _mariozechner["@mariozechner"]
  end
  main --> external
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant question as "question"
  participant mariozechner as "@mariozechner"

```

## 関数

### createRenderer

```typescript
createRenderer(initialState: TState, renderFn: (state: TState, width: number, theme: any) => string[]): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| initialState | `TState` | はい |
| renderFn | `(state: TState, width: number, theme: any) => s...` | はい |

**戻り値**: `void`

### askSingleQuestion

```typescript
async askSingleQuestion(question: QuestionInfo, ctx: any): Promise<Answer | null>
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| question | `QuestionInfo` | はい |
| ctx | `any` | はい |

**戻り値**: `Promise<Answer | null>`

### add

```typescript
add(s: string): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| s | `string` | はい |

**戻り値**: `void`

### addCursorLine

```typescript
addCursorLine(s: string): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| s | `string` | はい |

**戻り値**: `void`

### showConfirmationScreen

```typescript
async showConfirmationScreen(questions: QuestionInfo[], answers: Answer[], ctx: any): Promise<ConfirmAction>
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| questions | `QuestionInfo[]` | はい |
| answers | `Answer[]` | はい |
| ctx | `any` | はい |

**戻り値**: `Promise<ConfirmAction>`

### add

```typescript
add(s: string): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| s | `string` | はい |

**戻り値**: `void`

## インターフェース

### QuestionOption

```typescript
interface QuestionOption {
  label: string;
  description?: string;
}
```

### QuestionInfo

```typescript
interface QuestionInfo {
  question: string;
  header: string;
  options: QuestionOption[];
  multiple?: boolean;
  custom?: boolean;
}
```

## 型定義

### Answer

```typescript
type Answer = string[]
```

### ConfirmAction

```typescript
type ConfirmAction = { type: "confirm" } | { type: "edit"; questionIndex: number } | { type: "cancel" }
```

---
*自動生成: 2026-02-18T18:06:17.318Z*
