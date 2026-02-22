---
title: pi-ai-abort-fix
category: api-reference
audience: developer
last_updated: 2026-02-22
tags: [auto-generated]
related: []
---

# pi-ai-abort-fix

## 概要

`pi-ai-abort-fix` モジュールのAPIリファレンス。

## インポート

```typescript
// from 'node:fs/promises': readFile, writeFile
// from 'node:module': createRequire
// from '@mariozechner/pi-coding-agent': ExtensionAPI
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|

## 図解

### 依存関係図

```mermaid
flowchart LR
  subgraph this[pi-ai-abort-fix]
    main[Main Module]
  end
  subgraph external[外部ライブラリ]
    _mariozechner["@mariozechner"]
  end
  main --> external
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant pi_ai_abort_fix as "pi-ai-abort-fix"
  participant mariozechner as "@mariozechner"

```

## 関数

### patchFile

```typescript
async patchFile(requireFn: NodeRequire, target: PatchTarget): Promise<"patched" | "already" | "skip">
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| requireFn | `NodeRequire` | はい |
| target | `PatchTarget` | はい |

**戻り値**: `Promise<"patched" | "already" | "skip">`

## 型定義

### PatchTarget

```typescript
type PatchTarget = {
  modulePath: string;
  marker: string;
  before: string;
  after: string;
}
```

---
*自動生成: 2026-02-22T18:55:28.597Z*
