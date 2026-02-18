---
title: abdd
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated]
related: []
---

# abdd

## 概要

`abdd` モジュールのAPIリファレンス。

## インポート

```typescript
// from 'node:fs': fs
// from 'node:path': path
// from 'node:child_process': execSync
// from '@sinclair/typebox': Type
// from '@mariozechner/pi-coding-agent': ExtensionAPI
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|

## ユーザーフロー

このモジュールが提供するツールと、その実行フローを示します。

### abdd_generate



```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Internal as "Internal"
  participant Unresolved as "Unresolved"

  User->>System: abdd_generate
  System->>Internal: join
  System->>Internal: existsSync
  System->>Unresolved: args.push (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Internal: execSync
  System->>Unresolved: String (node_modules/typescript/lib/lib.es5.d.ts)
  System-->>User: 結果

```

### abdd_jsdoc



```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Internal as "Internal"
  participant Unresolved as "Unresolved"

  User->>System: abdd_jsdoc
  System->>Internal: join
  System->>Internal: existsSync
  System->>Unresolved: args.push (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Unresolved: String (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Internal: execSync
  System-->>User: 結果

```

### abdd_review



```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Unresolved as "Unresolved"
  participant Internal as "Internal"
  participant Storage as "Storage"

  User->>System: abdd_review
  System->>Unresolved: new Date().toISOString().split (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Unresolved: new Date().toISOString (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Internal: join
  System->>Internal: existsSync
  System->>Internal: mkdirSync
  System->>Storage: writeFileSync
  System-->>User: 結果

```

### abdd_analyze



```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Internal as "Internal"
  participant Storage as "Storage"
  participant Unresolved as "Unresolved"
  participant LLM as "LLM"

  User->>System: abdd_analyze
  System->>Internal: join
  System->>Internal: existsSync
  System->>Storage: readFileSync
  System->>Unresolved: warnings.push (node_modules/typescript/lib/lib.es5.d.ts)
  System->>LLM: 指定ディレクトリ以下の.mdファイルを再帰的に検索
  LLM->>Storage: readdirSync
  LLM->>Unresolved: entry.isDirectory (node_modules/@types/node/fs.d.ts)
  LLM->>Unresolved: entry.isFile (node_modules/@types/node/fs.d.ts)
  LLM->>Unresolved: entry.name.endsWith (node_modules/typescript/lib/lib.es2015.core.d.ts)
  System->>Internal: relative
  System->>Internal: 不変条件違反を検出
  Internal->>Unresolved: uncheckedPattern.exec (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: file.content.includes (node_modules/typescript/lib/lib.es2015.core.d.ts)
  System->>Internal: 価値観ミスマッチを検出
  Internal->>Internal: Markdownからコードブロックを抽出
  System->>Internal: JSDoc欠落を検出
  Internal->>Unresolved: block.language.toLowerCase (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: block.code.substring (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: Math.max (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: /\/\*\*[\s\S]*?\*\//.test (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: divergences.filter (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: self.findIndex (node_modules/typescript/lib/lib.es2015.core.d.ts)
  System->>Unresolved: d.severity.toUpperCase (node_modules/typescript/lib/lib.es5.d.ts)
  System-->>User: 結果

```

### abdd_workflow



```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Unresolved as "Unresolved"
  participant Internal as "Internal"
  participant Executor as "Executor"

  User->>System: abdd_workflow
  System->>Unresolved: baseArgs.push (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Internal: join
  System->>Internal: existsSync
  System->>Internal: execSync
  System->>Unresolved: result.slice (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Unresolved: String (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Executor: runStep
  System->>Unresolved: results.every (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Unresolved: results.map (node_modules/typescript/lib/lib.es5.d.ts)
  System-->>User: 結果

```

## 図解

### クラス図

```mermaid
classDiagram
  class Divergence {
    <<interface>>
    +type: DivergenceType
    +severity: Severity
    +intention: source_string_text
    +reality: file_string_text_st
    +reason: string
  }
```

### 依存関係図

```mermaid
flowchart LR
  subgraph this[abdd]
    main[Main Module]
  end
  subgraph external[外部ライブラリ]
    _sinclair["@sinclair"]
    _mariozechner["@mariozechner"]
  end
  main --> external
```

## 関数

### runStep

```typescript
runStep(stepName: string, scriptName: string, extraArgs: string[]): boolean
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| stepName | `string` | はい |
| scriptName | `string` | はい |
| extraArgs | `string[]` | はい |

**戻り値**: `boolean`

### findAllMdFiles

```typescript
findAllMdFiles(dir: string): string[]
```

指定ディレクトリ以下の.mdファイルを再帰的に検索

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| dir | `string` | はい |

**戻り値**: `string[]`

### detectInvariantViolations

```typescript
detectInvariantViolations(specContent: string, realityFiles: { path: string; content: string }[]): Divergence[]
```

不変条件違反を検出
spec.mdの未チェック項目（- [ ]）を検出し、実態記述に対応する記述があるか確認

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| specContent | `string` | はい |
| realityFiles | `{ path: string; content: string }[]` | はい |

**戻り値**: `Divergence[]`

### detectValueMismatches

```typescript
detectValueMismatches(_philosophyContent: string, realityFiles: { path: string; content: string }[]): Divergence[]
```

価値観ミスマッチを検出
philosophy.mdの禁則パターンを実態記述から検索

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| _philosophyContent | `string` | はい |
| realityFiles | `{ path: string; content: string }[]` | はい |

**戻り値**: `Divergence[]`

### detectJSDocMissing

```typescript
detectJSDocMissing(realityFiles: { path: string; content: string }[]): Divergence[]
```

JSDoc欠落を検出
実態記述内の関数定義で説明がないものを検出

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| realityFiles | `{ path: string; content: string }[]` | はい |

**戻り値**: `Divergence[]`

### extractCodeBlocks

```typescript
extractCodeBlocks(content: string): { language: string | null; code: string }[]
```

Markdownからコードブロックを抽出

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| content | `string` | はい |

**戻り値**: `{ language: string | null; code: string }[]`

## インターフェース

### Divergence

```typescript
interface Divergence {
  type: DivergenceType;
  severity: Severity;
  intention: { source: string; text: string };
  reality: { file: string; text: string };
  reason: string;
}
```

乖離候補

## 型定義

### DivergenceType

```typescript
type DivergenceType = "value_mismatch" | "invariant_violation" | "contract_breach" | "missing_jsdoc"
```

乖離タイプ

### Severity

```typescript
type Severity = "low" | "medium" | "high"
```

乖離重要度

---
*自動生成: 2026-02-18T14:31:30.401Z*
