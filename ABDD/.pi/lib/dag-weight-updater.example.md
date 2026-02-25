---
title: dag-weight-updater.example
category: api-reference
audience: developer
last_updated: 2026-02-24
tags: [auto-generated]
related: []
---

# dag-weight-updater.example

## 概要

`dag-weight-updater.example` モジュールのAPIリファレンス。

## インポート

```typescript
// from './dag-weight-updater.js': TaskGraphUpdater, createDelta
// from './priority-scheduler.js': PriorityScheduler
// from './dag-types.js': TaskNode
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|

## 図解

### 依存関係図

```mermaid
flowchart LR
  subgraph this[dag-weight-updater.example]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    dag_weight_updater["dag-weight-updater"]
    priority_scheduler["priority-scheduler"]
    dag_types["dag-types"]
  end
  main --> local
```

---
*自動生成: 2026-02-24T17:08:02.648Z*
