---
title: index
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated]
related: []
---

# index

## 概要

`index` モジュールのAPIリファレンス。

## インポート

```typescript
import { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';
import { StringEnum } from '@mariozechner/pi-ai';
import { fileCandidates } from './tools/file_candidates.js';
import { codeSearch } from './tools/code_search.js';
// ... and 7 more imports
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|

## 図解

### 依存関係図

```mermaid
flowchart LR
  subgraph this[index]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    file_candidates["file_candidates"]
    code_search["code_search"]
    sym_index["sym_index"]
    sym_find["sym_find"]
    call_graph["call_graph"]
  end
  main --> local
  subgraph external[外部ライブラリ]
    _mariozechner["@mariozechner"]
    _sinclair["@sinclair"]
    _mariozechner["@mariozechner"]
  end
  main --> external
```

---
*自動生成: 2026-02-18T07:48:44.586Z*
