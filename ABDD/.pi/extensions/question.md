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
import { Type } from '@mariozechner/pi-ai';
import { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Text, truncateToWidth, CURSOR_MARKER } from '@mariozechner/pi-tui';
import { matchesKey, Key } from '@mariozechner/pi-tui';
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|

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
| renderFn | `(state: TState, width: number, theme: any) => string[]` | はい |

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
*自動生成: 2026-02-18T00:15:35.542Z*
