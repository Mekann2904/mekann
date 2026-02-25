---
title: index
category: api-reference
audience: developer
last_updated: 2026-02-24
tags: [auto-generated]
related: []
---

# index

## 概要

`index` モジュールのAPIリファレンス。

## インポート

```typescript
// from '@mariozechner/pi-coding-agent': ExtensionAPI
// from '@sinclair/typebox': Type
// from '../search/repograph/storage.js': loadRepoGraph, getRepoGraphPath
// from '../search/repograph/egograph.js': extractEgograph, formatEgograph
// from '../search/repograph/egograph.js': EgographOptions, EgographResult
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `extractKeywords` | Extract keywords from a task description |
| 関数 | `repographLocalize` | Perform RepoGraph-based localization for a task |
| 関数 | `enrichContext` | Enrich context with RepoGraph localization data |
| インターフェース | `LocalizationResult` | Localization result from RepoGraph |
| インターフェース | `KeywordExtraction` | Keyword extraction result |

## ユーザーフロー

このモジュールが提供するツールと、その実行フローを示します。

### repograph_localize



```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Unresolved as "Unresolved"
  participant Internal as "Internal"
  participant Storage as "Storage"

  User->>System: repograph_localize
  System->>Unresolved: process.cwd (node_modules/@types/node/process.d.ts)
  System->>Internal: RepoGraphベースのコードローカライゼーション
  Internal->>Internal: Get index file path
  Internal->>Internal: join
  Internal->>Storage: Load graph from disk
  Storage->>Storage: readFile
  Storage->>Unresolved: JSON.parse (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Internal: タスク説明からキーワードを抽出
  Internal->>Unresolved: task.matchAll (node_modules/typescript/lib/lib.es2020.string.d.ts)
  Internal->>Unresolved: match[1].toLowerCase (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: STOP_WORDS.has (node_modules/typescript/lib/lib.es2015.collection.d.ts)
  Internal->>Unresolved: /^\d+$/.test (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: keywords.add (node_modules/typescript/lib/lib.es2015.collection.d.ts)
  Internal->>Unresolved: Array.from(keywords).slice (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: Array.from (node_modules/typescript/lib/lib.es2015.core.d.ts)
  Internal->>Unresolved: Math.min (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Internal: キーワード周辺のk-hopサブグラフを抽出
  Internal->>Internal: findSeedNodes
  Internal->>Internal: expandKHops
  Internal->>Internal: summarizeGraph
  Internal->>Unresolved: Date.now (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: egograph.nodes.map (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Unresolved: lines.push (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Unresolved: String (node_modules/typescript/lib/lib.es5.d.ts)
  System-->>User: 結果

```

## 図解

### クラス図

```mermaid
classDiagram
  class LocalizationResult {
    <<interface>>
    +success: boolean
    +error: string
    +locations: Array_file_string_l
    +egograph: EgographResult
  }
  class KeywordExtraction {
    <<interface>>
    +keywords: string
    +confidence: number
    +method: regex_heuristic
  }
```

### 依存関係図

```mermaid
flowchart LR
  subgraph this[index]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    storage["storage"]
    egograph["egograph"]
    egograph["egograph"]
  end
  main --> local
  subgraph external[外部ライブラリ]
    _mariozechner["@mariozechner"]
    _sinclair["@sinclair"]
  end
  main --> external
```

### 関数フロー

```mermaid
flowchart TD
  enrichContext["enrichContext()"]
  extractKeywords["extractKeywords()"]
  repographLocalize["repographLocalize()"]
  enrichContext --> repographLocalize
  repographLocalize --> extractKeywords
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant index as "index"
  participant mariozechner as "@mariozechner"
  participant sinclair as "@sinclair"
  participant storage as "storage"
  participant egograph as "egograph"

  Caller->>index: extractKeywords()
  index->>mariozechner: API呼び出し
  mariozechner-->>index: レスポンス
  index->>storage: 内部関数呼び出し
  storage-->>index: 結果
  index-->>Caller: KeywordExtraction

  Caller->>index: repographLocalize()
  activate index
  index-->>Caller: Promise_Localization
  deactivate index
```

## 関数

### extractKeywords

```typescript
extractKeywords(task: string): KeywordExtraction
```

Extract keywords from a task description

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| task | `string` | はい |

**戻り値**: `KeywordExtraction`

### repographLocalize

```typescript
async repographLocalize(task: string, cwd: string, options?: {
		/** Number of hops for egograph (default: 2) */
		k?: number;
		/** Maximum nodes to return (default: 50) */
		maxNodes?: number;
		/** Include egograph in result */
		includeEgograph?: boolean;
	}): Promise<LocalizationResult>
```

Perform RepoGraph-based localization for a task

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| task | `string` | はい |
| cwd | `string` | はい |
| options | `object` | いいえ |
| &nbsp;&nbsp;↳ k | `number` | いいえ |
| &nbsp;&nbsp;↳ maxNodes | `number` | いいえ |
| &nbsp;&nbsp;↳ includeEgograph | `boolean` | いいえ |

**戻り値**: `Promise<LocalizationResult>`

### enrichContext

```typescript
async enrichContext(task: string, cwd: string): Promise<string>
```

Enrich context with RepoGraph localization data

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| task | `string` | はい |
| cwd | `string` | はい |

**戻り値**: `Promise<string>`

## インターフェース

### LocalizationResult

```typescript
interface LocalizationResult {
  success: boolean;
  error?: string;
  locations: Array<{
		file: string;
		line: number;
		symbolName: string;
		nodeType: "def" | "ref" | "import";
		relevance: number;
	}>;
  egograph?: EgographResult;
}
```

Localization result from RepoGraph

### KeywordExtraction

```typescript
interface KeywordExtraction {
  keywords: string[];
  confidence: number;
  method: "regex" | "heuristic";
}
```

Keyword extraction result

---
*自動生成: 2026-02-24T17:08:02.335Z*
