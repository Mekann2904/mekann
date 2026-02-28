---
title: ul-workflow-reader
category: api-reference
audience: developer
last_updated: 2026-02-28
tags: [auto-generated]
related: []
---

# ul-workflow-reader

## 概要

`ul-workflow-reader` モジュールのAPIリファレンス。

## インポート

```typescript
// from 'fs': fs
// from 'path': path
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `getAllUlWorkflowTasks` | - |
| 関数 | `getUlWorkflowTask` | - |
| 関数 | `getActiveUlWorkflowTask` | - |
| 関数 | `invalidateCache` | - |
| インターフェース | `UlWorkflowTask` | - |

## 図解

### クラス図

```mermaid
classDiagram
  class UlWorkflowTask {
    <<interface>>
    +id: string
    +title: string
    +description: string
    +status: todo_in_progress
    +priority: medium
  }
```

### 依存関係図

```mermaid
flowchart LR
  subgraph this[ul-workflow-reader]
    main[Main Module]
  end
  subgraph external[外部ライブラリ]
    fs["fs"]
    path["path"]
  end
  main --> external
```

### 関数フロー

```mermaid
flowchart TD
  getActiveUlWorkflowTask["getActiveUlWorkflowTask()"]
  getAllUlWorkflowTasks["getAllUlWorkflowTasks()"]
  getUlWorkflowTask["getUlWorkflowTask()"]
  invalidateCache["invalidateCache()"]
  loadAllTasks["loadAllTasks()"]
  loadTask["loadTask()"]
  getActiveUlWorkflowTask --> loadTask
  getAllUlWorkflowTasks --> loadAllTasks
  getUlWorkflowTask --> loadTask
  loadAllTasks --> loadTask
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant ul_workflow_reader as "ul-workflow-reader"
  participant fs as "fs"
  participant path as "path"

  Caller->>ul_workflow_reader: getAllUlWorkflowTasks()
  ul_workflow_reader->>fs: API呼び出し
  fs-->>ul_workflow_reader: レスポンス
  ul_workflow_reader-->>Caller: UlWorkflowTask

  Caller->>ul_workflow_reader: getUlWorkflowTask()
  ul_workflow_reader-->>Caller: UlWorkflowTask_null
```

## 関数

### getAllUlWorkflowTasks

```typescript
getAllUlWorkflowTasks(): UlWorkflowTask[]
```

**戻り値**: `UlWorkflowTask[]`

### getUlWorkflowTask

```typescript
getUlWorkflowTask(taskId: string): UlWorkflowTask | null
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| taskId | `string` | はい |

**戻り値**: `UlWorkflowTask | null`

### getActiveUlWorkflowTask

```typescript
getActiveUlWorkflowTask(): UlWorkflowTask | null
```

**戻り値**: `UlWorkflowTask | null`

### invalidateCache

```typescript
invalidateCache(): void
```

**戻り値**: `void`

### loadAllTasks

```typescript
loadAllTasks(): UlWorkflowTask[]
```

**戻り値**: `UlWorkflowTask[]`

### loadTask

```typescript
loadTask(taskId: string): UlWorkflowTask | null
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| taskId | `string` | はい |

**戻り値**: `UlWorkflowTask | null`

## インターフェース

### UlWorkflowTask

```typescript
interface UlWorkflowTask {
  id: string;
  title: string;
  description?: string;
  status: "todo" | "in_progress" | "completed" | "cancelled";
  priority: "medium";
  tags: string[];
  createdAt: string;
  updatedAt: string;
  phase: string;
  ownerInstanceId?: string;
  isUlWorkflow: true;
}
```

## 型定義

### TaskStatus

```typescript
type TaskStatus = "todo" | "in_progress" | "completed" | "cancelled"
```

---
*自動生成: 2026-02-28T13:55:23.051Z*
