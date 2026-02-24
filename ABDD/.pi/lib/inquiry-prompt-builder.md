---
title: inquiry-prompt-builder
category: api-reference
audience: developer
last_updated: 2026-02-24
tags: [auto-generated]
related: []
---

# inquiry-prompt-builder

## 概要

`inquiry-prompt-builder` モジュールのAPIリファレンス。

## インポート

```typescript
// from './inquiry-library.js': getInquiryLibrary, InquiryCategory
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `buildInquiryPrompt` | - |
| 関数 | `buildAporiaPrompt` | - |
| 関数 | `buildPreCompletionCheckPrompt` | - |
| 関数 | `buildDeepeningPrompt` | - |
| インターフェース | `InquiryPromptOptions` | - |

## 図解

### クラス図

```mermaid
classDiagram
  class InquiryPromptOptions {
    <<interface>>
    +taskDescription: string
    +recommendedCategories: InquiryCategory
    +minCycles: number
    +requiredDepth: surface_structura
    +additionalInstructions: string
  }
```

### 依存関係図

```mermaid
flowchart LR
  subgraph this[inquiry-prompt-builder]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    inquiry_library["inquiry-library"]
  end
  main --> local
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant inquiry_prompt_builder as "inquiry-prompt-builder"
  participant inquiry_library as "inquiry-library"

  Caller->>inquiry_prompt_builder: buildInquiryPrompt()
  inquiry_prompt_builder->>inquiry_library: 内部関数呼び出し
  inquiry_library-->>inquiry_prompt_builder: 結果
  inquiry_prompt_builder-->>Caller: string

  Caller->>inquiry_prompt_builder: buildAporiaPrompt()
  inquiry_prompt_builder-->>Caller: string
```

## 関数

### buildInquiryPrompt

```typescript
buildInquiryPrompt(options: InquiryPromptOptions): string
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| options | `InquiryPromptOptions` | はい |

**戻り値**: `string`

### buildAporiaPrompt

```typescript
buildAporiaPrompt(poles: [string, string]): string
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| poles | `[string, string]` | はい |

**戻り値**: `string`

### buildPreCompletionCheckPrompt

```typescript
buildPreCompletionCheckPrompt(): string
```

**戻り値**: `string`

### buildDeepeningPrompt

```typescript
buildDeepeningPrompt(currentDepth: "surface" | "structural" | "foundational" | "aporic"): string
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| currentDepth | `"surface" | "structural" | "foundational" | "ap...` | はい |

**戻り値**: `string`

## インターフェース

### InquiryPromptOptions

```typescript
interface InquiryPromptOptions {
  taskDescription: string;
  recommendedCategories?: InquiryCategory[];
  minCycles?: number;
  requiredDepth?: "surface" | "structural" | "foundational" | "aporic";
  additionalInstructions?: string;
}
```

---
*自動生成: 2026-02-24T17:08:02.701Z*
