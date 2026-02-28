---
title: code-panel
category: api-reference
audience: developer
last_updated: 2026-02-28
tags: [auto-generated]
related: []
---

# code-panel

## 概要

`code-panel` モジュールのAPIリファレンス。

## インポート

```typescript
// from 'node:fs': fs
// from '@mariozechner/pi-coding-agent': ExtensionAPI
// from '@mariozechner/pi-coding-agent': highlightCode, getLanguageFromPath
// from '@mariozechner/pi-tui': Container, Text, matchesKey
// from '../lib/tui/types.js': Theme
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|

## 図解

### 依存関係図

```mermaid
flowchart LR
  subgraph this[code-panel]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    types["types"]
  end
  main --> local
  subgraph external[外部ライブラリ]
    _mariozechner["@mariozechner"]
    _mariozechner["@mariozechner"]
    _mariozechner["@mariozechner"]
  end
  main --> external
```

## 関数

### formatLinesWithNumbers

```typescript
formatLinesWithNumbers(lines: string[], startLine: number, theme: Theme): string[]
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| lines | `string[]` | はい |
| startLine | `number` | はい |
| theme | `Theme` | はい |

**戻り値**: `string[]`

### createCodePanel

```typescript
createCodePanel(code: string, language: string | undefined, filePath: string | undefined, theme: Theme): Container
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| code | `string` | はい |
| language | `string | undefined` | はい |
| filePath | `string | undefined` | はい |
| theme | `Theme` | はい |

**戻り値**: `Container`

### parseArgs

```typescript
parseArgs(args: string): {
	code?: string;
	path?: string;
	language?: string;
}
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| args | `string` | はい |

**戻り値**: `{
	code?: string;
	path?: string;
	language?: string;
}`

---
*自動生成: 2026-02-28T13:55:18.795Z*
