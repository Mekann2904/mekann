---
title: abbr
category: api-reference
audience: developer
last_updated: 2026-02-17
tags: [auto-generated]
related: []
---

# abbr

## 概要

`abbr` モジュールのAPIリファレンス。

## インポート

```typescript
import { StringEnum } from '@mariozechner/pi-ai';
import { ExtensionAPI, ExtensionContext, Theme } from '@mariozechner/pi-coding-agent';
// ... and 2 more imports
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| インターフェース | `Abbreviation` | - |

## 図解

### クラス図

```mermaid
classDiagram
  class AbbrListComponent {
    -theme: Theme
    -onClose: >void
    -cachedWidth: number
    -cachedLines: string[]
    +handleInput
    +render
    +invalidate
  }
  class Abbreviation {
    <<interface>>
    +name: string
    +expansion: string
    +regex: boolean
    +pattern: string
    +position: commandanywhere
  }
  class AbbrState {
    <<interface>>
    +abbreviations: Abbreviation[]
  }
  class AbbrDetails {
    <<interface>>
    +action: listadderaserenamequery
    +abbreviations: Abbreviation[]
    +result: string
    +error: string
  }
```

### 依存関係図

```mermaid
flowchart LR
  subgraph this[abbr]
    main[Main Module]
  end
  subgraph external[外部ライブラリ]
    _mariozechner[@mariozechner]
    _mariozechner[@mariozechner]
    _mariozechner[@mariozechner]
    _sinclair[@sinclair]
  end
  main --> external
```

## 関数

### loadFromFile

```typescript
loadFromFile(): void
```

**戻り値**: `void`

### saveToFile

```typescript
saveToFile(): void
```

**戻り値**: `void`

### persistState

```typescript
persistState(): void
```

**戻り値**: `void`

### findExpansion

```typescript
findExpansion(input: string): { expanded: string; original: string } | null
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| input | `string` | はい |

**戻り値**: `{ expanded: string; original: string } | null`

### escapeRegex

```typescript
escapeRegex(str: string): string
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| str | `string` | はい |

**戻り値**: `string`

### stripQuotes

```typescript
stripQuotes(str: string): string
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| str | `string` | はい |

**戻り値**: `string`

### reconstructState

```typescript
reconstructState(ctx: ExtensionContext): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| ctx | `ExtensionContext` | はい |

**戻り値**: `void`

## クラス

### AbbrListComponent

**プロパティ**

| 名前 | 型 | 可視性 |
|------|-----|--------|
| theme | `Theme` | private |
| onClose | `() => void` | private |
| cachedWidth | `number` | private |
| cachedLines | `string[]` | private |

**メソッド**

| 名前 | シグネチャ |
|------|------------|
| handleInput | `handleInput(data): void` |
| render | `render(width): string[]` |
| invalidate | `invalidate(): void` |

## インターフェース

### Abbreviation

```typescript
interface Abbreviation {
  name: string;
  expansion: string;
  regex?: boolean;
  pattern?: string;
  position?: "command" | "anywhere";
}
```

### AbbrState

```typescript
interface AbbrState {
  abbreviations: Abbreviation[];
}
```

### AbbrDetails

```typescript
interface AbbrDetails {
  action: "list" | "add" | "erase" | "rename" | "query";
  abbreviations: Abbreviation[];
  result?: string;
  error?: string;
}
```

---
*自動生成: 2026-02-17T22:16:16.329Z*
