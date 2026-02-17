---
title: index
category: api-reference
audience: developer
last_updated: 2026-02-17
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
    file_candidates_js["file_candidates.js"]
    code_search_js["code_search.js"]
    sym_index_js["sym_index.js"]
    sym_find_js["sym_find.js"]
    call_graph_js["call_graph.js"]
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
*自動生成: 2026-02-17T22:24:18.827Z*
