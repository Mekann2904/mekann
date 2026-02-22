---
title: runtime-snapshot
category: api-reference
audience: developer
last_updated: 2026-02-22
tags: [auto-generated]
related: []
---

# runtime-snapshot

## 概要

`runtime-snapshot` モジュールのAPIリファレンス。

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| インターフェース | `IRuntimeSnapshot` | 実行時の状態スナップショット |
| 型 | `RuntimeSnapshotProvider` | 実行時スナップショットを提供 |

## 図解

### クラス図

```mermaid
classDiagram
  class IRuntimeSnapshot {
    <<interface>>
    +totalActiveLlm: number
    +totalActiveRequests: number
    +subagentActiveCount: number
    +teamActiveCount: number
  }
```

## インターフェース

### IRuntimeSnapshot

```typescript
interface IRuntimeSnapshot {
  totalActiveLlm: number;
  totalActiveRequests: number;
  subagentActiveCount: number;
  teamActiveCount: number;
}
```

実行時の状態スナップショット

## 型定義

### RuntimeSnapshotProvider

```typescript
type RuntimeSnapshotProvider = () => IRuntimeSnapshot
```

実行時スナップショットを提供

---
*自動生成: 2026-02-22T19:27:00.645Z*
