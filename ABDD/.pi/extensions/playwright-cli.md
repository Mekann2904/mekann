---
title: playwright-cli
category: api-reference
audience: developer
last_updated: 2026-02-28
tags: [auto-generated]
related: []
---

# playwright-cli

## 概要

`playwright-cli` モジュールのAPIリファレンス。

## インポート

```typescript
// from 'node:child_process': execFile
// from 'node:util': promisify
// from '@mariozechner/pi-coding-agent': ExtensionAPI
// from '@sinclair/typebox': Type
// from '../lib/error-utils.js': toError
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `buildPlaywrightCliArgs` | - |

## ユーザーフロー

このモジュールが提供するツールと、その実行フローを示します。

### playwright_cli

Run playwright-cli commands from PI extension.

```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Unresolved as "Unresolved"
  participant Internal as "Internal"

  User->>System: Run playwright-cli commands from PI extension.
  System->>Unresolved: params.command.trim (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Internal: buildPlaywrightCliArgs
  Internal->>Unresolved: built.push (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Unresolved: process.cwd (node_modules/@types/node/process.d.ts)
  System->>Internal: toTextOutput
  System->>Internal: unknownをErrorに安全に変換
  Internal->>Unresolved: String (node_modules/typescript/lib/lib.es5.d.ts)
  System-->>User: 結果

```

## 図解

### 依存関係図

```mermaid
flowchart LR
  subgraph this[playwright-cli]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    error_utils["error-utils"]
  end
  main --> local
  subgraph external[外部ライブラリ]
    _mariozechner["@mariozechner"]
    _sinclair["@sinclair"]
  end
  main --> external
```

## 関数

### buildPlaywrightCliArgs

```typescript
buildPlaywrightCliArgs(params: PlaywrightCliParamsType): string[]
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| params | `PlaywrightCliParamsType` | はい |

**戻り値**: `string[]`

### toTextOutput

```typescript
toTextOutput(stdout: string, stderr: string): string
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| stdout | `string` | はい |
| stderr | `string` | はい |

**戻り値**: `string`

## 型定義

### PlaywrightCliParamsType

```typescript
type PlaywrightCliParamsType = {
  command: string;
  args?: string[];
  session?: string;
  config?: string;
  timeout_ms?: number;
  cwd?: string;
}
```

---
*自動生成: 2026-02-28T13:55:19.229Z*
