---
title: question
category: api-reference
audience: developer
last_updated: 2026-02-24
tags: [auto-generated]
related: []
---

# question

## 概要

`question` モジュールのAPIリファレンス。

## インポート

```typescript
// from '@mariozechner/pi-ai': Type
// from '@mariozechner/pi-coding-agent': ExtensionAPI, ExtensionContext
// from '@mariozechner/pi-tui': Text, truncateToWidth, wrapTextWithAnsi, ...
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
  participant Internal as "Internal"
  participant Unresolved as "Unresolved"
  participant Executor as "Executor"

  User->>System: **必須使用**: ユーザーに選択肢から選ばせたり、確認を求める場合は必ずこのツールを使ってください。単一選択、複...
  System->>Internal: ExtensionContextをQuestionContextとして型キャスト
  System->>Unresolved: new Array(questions.length).fill (node_modules/typescript/lib/lib.es2015.core.d.ts)
  System->>Internal: askSingleQuestion
  Internal->>Internal: createRenderer
  Internal->>Unresolved: lines.push (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Executor: truncateToWidth
  Internal->>Internal: add
  Internal->>Unresolved: '─'.repeat (node_modules/typescript/lib/lib.es2015.core.d.ts)
  Internal->>Unresolved: state.customInput.split (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Internal: wrapTextWithAnsi
  Internal->>Unresolved: wl.text.slice (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Internal: addCursorLine
  Internal->>Unresolved: state.selected.has (node_modules/typescript/lib/lib.es2015.collection.d.ts)
  Internal->>Unresolved: data.includes (node_modules/typescript/lib/lib.es2015.core.d.ts)
  Internal->>Unresolved: data.replace (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: pasteBuffer.indexOf (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: pasteBuffer.substring (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Internal: matchesKey
  Internal->>Unresolved: Key.shift (node_modules/@mariozechner/pi-tui/dist/keys.d.ts)
  Internal->>Unresolved: state.customInput.trim (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: Math.min (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: Math.max (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: data.charCodeAt (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: data.startsWith (node_modules/typescript/lib/lib.es2015.core.d.ts)
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
  class QuestionTheme {
    <<interface>>
    +fg: color_string_text_s
    +bg: color_string_text_s
    +dim: text_string_strin
    +bold: text_string_strin
    +underline: text_string_strin
  }
  class QuestionTui {
    <<interface>>
    +requestRender: void
  }
  class QuestionContext {
    <<interface>>
    +hasUI: boolean
    +ui: custom_T_handler
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

### asQuestionContext

```typescript
asQuestionContext(ctx: ExtensionContext): QuestionContext
```

ExtensionContextをQuestionContextとして型キャスト
実行時にはpi SDKのTheme型とQuestionThemeは互換性があるため安全
（両者とも同じメソッドシグネチャを持つ）

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| ctx | `ExtensionContext` | はい |

**戻り値**: `QuestionContext`

### createRenderer

```typescript
createRenderer(initialState: TState, renderFn: (state: TState, width: number, theme: QuestionTheme) => string[]): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| initialState | `TState` | はい |
| renderFn | `(state: TState, width: number, theme: QuestionT...` | はい |

**戻り値**: `void`

### askSingleQuestion

```typescript
async askSingleQuestion(question: QuestionInfo, ctx: QuestionContext): Promise<Answer | null>
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| question | `QuestionInfo` | はい |
| ctx | `QuestionContext` | はい |

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
async showConfirmationScreen(questions: QuestionInfo[], answers: Answer[], ctx: QuestionContext): Promise<ConfirmAction>
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| questions | `QuestionInfo[]` | はい |
| answers | `Answer[]` | はい |
| ctx | `QuestionContext` | はい |

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

### QuestionTheme

```typescript
interface QuestionTheme {
  fg: (color: string, text: string) => string;
  bg: (color: string, text: string) => string;
  dim: (text: string) => string;
  bold: (text: string) => string;
  underline: (text: string) => string;
}
```

### QuestionTui

```typescript
interface QuestionTui {
  requestRender: () => void;
}
```

### QuestionContext

```typescript
interface QuestionContext {
  hasUI: boolean;
  ui: {
		custom: <T>(handler: (
			tui: QuestionTui,
			theme: QuestionTheme,
			_kb: unknown,
			done: (value: T) => void
		) => QuestionCustomController) => Promise<T>;
		notify: (message: string, type: string) => void;
	};
}
```

## 型定義

### Answer

```typescript
type Answer = string[]
```

### QuestionCustomController

```typescript
type QuestionCustomController = {
	render: (w: number) => string[];
	invalidate: () => void;
	handleInput: (data: string) => void;
}
```

### ConfirmAction

```typescript
type ConfirmAction = { type: "confirm" } | { type: "edit"; questionIndex: number } | { type: "cancel" }
```

---
*自動生成: 2026-02-24T17:08:02.326Z*
