---
title: enhanced-read
category: api-reference
audience: developer
last_updated: 2026-02-22
tags: [auto-generated]
related: []
---

# enhanced-read

## 概要

`enhanced-read` モジュールのAPIリファレンス。

## インポート

```typescript
// from 'node:fs': fs
// from '@sinclair/typebox': Type
// from '@mariozechner/pi-coding-agent': ExtensionAPI
// from '@mariozechner/pi-coding-agent': highlightCode, getLanguageFromPath
// from '@mariozechner/pi-tui': Text
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|

## ユーザーフロー

このモジュールが提供するツールと、その実行フローを示します。

### enhanced_read



```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Internal as "Internal"
  participant Storage as "Storage"
  participant Unresolved as "Unresolved"

  User->>System: enhanced_read
  System->>Internal: existsSync
  System->>Storage: readFileSync
  System->>Unresolved: content.split (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Internal: getLanguageFromPath
  System->>Unresolved: Math.max (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Unresolved: Math.min (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Unresolved: allLines.slice (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Unresolved: selectedLines.join (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Internal: highlightCode
  System->>Internal: 行番号付きでコードをフォーマット
  Internal->>Unresolved: maxLineNum.toString (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: lines 		.map (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: (startLine + index).toString().padStart (node_modules/typescript/lib/lib.es2017.string.d.ts)
  System->>Unresolved: headerParts.push (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Unresolved: '─'.repeat (node_modules/typescript/lib/lib.es2015.core.d.ts)
  System->>Unresolved: String (node_modules/typescript/lib/lib.es5.d.ts)
  System-->>User: 結果

```

## 図解

### クラス図

```mermaid
classDiagram
  class EnhancedReadDetails {
    <<interface>>
    +path: string
    +language: string
    +totalLines: number
    +startLine: number
    +endLine: number
  }
```

### 依存関係図

```mermaid
flowchart LR
  subgraph this[enhanced-read]
    main[Main Module]
  end
  subgraph external[外部ライブラリ]
    _sinclair["@sinclair"]
    _mariozechner["@mariozechner"]
    _mariozechner["@mariozechner"]
    _mariozechner["@mariozechner"]
  end
  main --> external
```

## 関数

### formatWithLineNumbers

```typescript
formatWithLineNumbers(lines: string[], startLine: number): string
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| lines | `string[]` | はい |
| startLine | `number` | はい |

**戻り値**: `string`

## インターフェース

### EnhancedReadDetails

```typescript
interface EnhancedReadDetails {
  path: string;
  language: string;
  totalLines: number;
  startLine: number;
  endLine: number;
  displayedLines: number;
  error?: string;
}
```

---
*自動生成: 2026-02-22T18:55:28.494Z*
