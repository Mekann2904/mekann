---
title: github-agent
category: api-reference
audience: developer
last_updated: 2026-02-28
tags: [auto-generated]
related: []
---

# github-agent

## 概要

`github-agent` モジュールのAPIリファレンス。

## インポート

```typescript
// from 'node:path': dirname, resolve
// from 'node:url': fileURLToPath
// from 'node:child_process': execFile
// from 'node:util': promisify
// from '@mariozechner/pi-coding-agent': ExtensionAPI
// ... and 3 more imports
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|

## ユーザーフロー

このモジュールが提供するツールと、その実行フローを示します。

### gh_agent

GitHub repository exploration tool. Supports info, tree, read, and search commands.

```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Judge as "Judge"
  participant Internal as "Internal"
  participant Storage as "Storage"
  participant Unresolved as "Unresolved"

  User->>System: GitHub repository exploration tool. Supports info, tree, ...
  System->>Judge: resolve
  System->>Internal: getExtensionDir
  Internal->>Storage: fileURLToPath
  Internal->>Internal: dirname
  System->>Unresolved: cmdArgs.push (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Unresolved: String (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Unresolved: output.trim (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Internal: unknownをErrorに安全に変換
  System-->>User: 結果

```

## 図解

### 依存関係図

```mermaid
flowchart LR
  subgraph this[github-agent]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    error_utils["error-utils"]
  end
  main --> local
  subgraph external[外部ライブラリ]
    _mariozechner["@mariozechner"]
    _sinclair["@sinclair"]
    _mariozechner["@mariozechner"]
  end
  main --> external
```

## 関数

### getExtensionDir

```typescript
getExtensionDir(): string
```

**戻り値**: `string`

## 型定義

### GhAgentArgs

```typescript
type GhAgentArgs = Static<typeof GhAgentParams>
```

---
*自動生成: 2026-02-28T13:55:18.969Z*
