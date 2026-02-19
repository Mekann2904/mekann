---
title: extension
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated]
related: []
---

# extension

## 概要

`extension` モジュールのAPIリファレンス。

## インポート

```typescript
// from './tools/extract-structure.js': extractCodeStructure, ExtractOptions, StructureData
// from './tools/generate-diagrams.js': generateMermaidDiagrams, DiagramOptions, MermaidDiagrams
// from './tools/generate-doc.js': generateDocSections, DocOptions, DocSections
// from 'fs': readFileSync, writeFileSync, existsSync, ...
// from 'path': join, relative, basename
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `analyzeCodeStructure` | コード構造を解析 |
| 関数 | `extractStructure` | 構造を抽出 |
| 関数 | `generateDiagrams` | ダイアグラム生成 |
| 関数 | `generateMarkdown` | Markdownを生成 |
| インターフェース | `AnalyzeOptions` | 解析オプション定義 |
| インターフェース | `AnalysisResult` | 解析結果インターフェース |

## 図解

### クラス図

```mermaid
classDiagram
  class AnalyzeOptions {
    <<interface>>
    +target: string
    +outputDir: string
    +diagramTypes: flowchart_classD
    +templatePath: string
    +exclude: string
  }
  class AnalysisResult {
    <<interface>>
    +structure: StructureData
    +diagrams: MermaidDiagrams
    +docSections: DocSections
    +metadata: analyzedAt_string_s
  }
```

### 依存関係図

```mermaid
flowchart LR
  subgraph this[extension]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    extract_structure["extract-structure"]
    generate_diagrams["generate-diagrams"]
    generate_doc["generate-doc"]
  end
  main --> local
  subgraph external[外部ライブラリ]
    fs["fs"]
    path["path"]
  end
  main --> external
```

### 関数フロー

```mermaid
flowchart TD
  analyzeCodeStructure["analyzeCodeStructure()"]
  computeHash["computeHash()"]
  extractStructure["extractStructure()"]
  generateDiagrams["generateDiagrams()"]
  generateMarkdown["generateMarkdown()"]
  analyzeCodeStructure --> computeHash
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant extension as "extension"
  participant fs as "fs"
  participant path as "path"
  participant extract_structure as "extract-structure"
  participant generate_diagrams as "generate-diagrams"

  Caller->>extension: analyzeCodeStructure()
  activate extension
  Note over extension: 非同期処理開始
  extension->>fs: API呼び出し
  fs-->>extension: レスポンス
  extension->>extract_structure: 内部関数呼び出し
  extract_structure-->>extension: 結果
  deactivate extension
  extension-->>Caller: Promise_AnalysisResu

  Caller->>extension: extractStructure()
  activate extension
  extension-->>Caller: Promise_StructureDat
  deactivate extension
```

## 関数

### analyzeCodeStructure

```typescript
async analyzeCodeStructure(params: {
  target: string;
  outputDir?: string;
  diagramTypes?: string[];
  includeLLMContext?: boolean;
}): Promise<AnalysisResult>
```

コード構造を解析

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| params | `object` | はい |
| &nbsp;&nbsp;↳ target | `string` | はい |
| &nbsp;&nbsp;↳ outputDir | `string` | いいえ |
| &nbsp;&nbsp;↳ diagramTypes | `string[]` | いいえ |
| &nbsp;&nbsp;↳ includeLLMContext | `boolean` | いいえ |

**戻り値**: `Promise<AnalysisResult>`

### extractStructure

```typescript
async extractStructure(params: {
  target: string;
  exclude?: string[];
}): Promise<StructureData>
```

構造を抽出

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| params | `object` | はい |
| &nbsp;&nbsp;↳ target | `string` | はい |
| &nbsp;&nbsp;↳ exclude | `string[]` | いいえ |

**戻り値**: `Promise<StructureData>`

### generateDiagrams

```typescript
async generateDiagrams(params: {
  structure: StructureData;
  types?: string[];
}): Promise<MermaidDiagrams>
```

ダイアグラム生成

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| params | `object` | はい |
| &nbsp;&nbsp;↳ structure | `StructureData` | はい |
| &nbsp;&nbsp;↳ types | `string[]` | いいえ |

**戻り値**: `Promise<MermaidDiagrams>`

### generateMarkdown

```typescript
async generateMarkdown(params: {
  result: AnalysisResult;
  outputPath?: string;
}): Promise<string>
```

Markdownを生成

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| params | `object` | はい |
| &nbsp;&nbsp;↳ result | `AnalysisResult` | はい |
| &nbsp;&nbsp;↳ outputPath | `string` | いいえ |

**戻り値**: `Promise<string>`

### computeHash

```typescript
computeHash(structure: StructureData): string
```

構造データのハッシュを計算（ドリフト検出用）

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| structure | `StructureData` | はい |

**戻り値**: `string`

## インターフェース

### AnalyzeOptions

```typescript
interface AnalyzeOptions {
  target: string;
  outputDir?: string;
  diagramTypes?: ('flowchart' | 'classDiagram' | 'sequenceDiagram')[];
  templatePath?: string;
  exclude?: string[];
  includeLLMContext?: boolean;
}
```

解析オプション定義

### AnalysisResult

```typescript
interface AnalysisResult {
  structure: StructureData;
  diagrams: MermaidDiagrams;
  docSections: DocSections;
  metadata: {
    analyzedAt: string;
    sourcePath: string;
    fileHash: string;
    stats: {
      functions: number;
      classes: number;
      interfaces: number;
      imports: number;
    };
  };
}
```

解析結果インターフェース

---
*自動生成: 2026-02-18T18:06:17.166Z*
