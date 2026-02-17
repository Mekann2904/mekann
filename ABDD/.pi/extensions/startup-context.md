---
title: startup-context
category: api-reference
audience: developer
last_updated: 2026-02-17
tags: [auto-generated]
related: []
---

# startup-context

## 概要

`startup-context` モジュールのAPIリファレンス。

## インポート

```typescript
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { ExtensionAPI } from '@mariozechner/pi-coding-agent';
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|

## 図解

### 依存関係図

```mermaid
flowchart LR
  subgraph this[startup-context]
    main[Main Module]
  end
  subgraph external[外部ライブラリ]
    _mariozechner[@mariozechner]
  end
  main --> external
```

---
*自動生成: 2026-02-17T21:54:59.721Z*
