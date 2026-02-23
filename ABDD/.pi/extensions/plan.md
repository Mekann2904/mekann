---
title: plan
category: api-reference
audience: developer
last_updated: 2026-02-23
tags: [auto-generated]
related: []
---

# plan

## 概要

`plan` モジュールのAPIリファレンス。

## インポート

```typescript
// from 'node:fs': existsSync, readFileSync, writeFileSync, ...
// from 'node:path': join
// from '@mariozechner/pi-ai': Type
// from '@mariozechner/pi-coding-agent': ExtensionAPI
// from '@mariozechner/pi-agent-core': AgentMessage
// ... and 3 more imports
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|

## ユーザーフロー

このモジュールが提供するツールと、その実行フローを示します。

### plan_create

Create a new task plan with a name and optional description

```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Unresolved as "Unresolved"
  participant Storage as "Storage"
  participant Internal as "Internal"

  User->>System: Create a new task plan with a name and optional description
  System->>Unresolved: logger.startOperation (.pi/lib/comprehensive-logger.ts)
  System->>Storage: loadStorage
  Storage->>Internal: ensurePlanDir
  Internal->>Internal: existsSync
  Internal->>Internal: mkdirSync
  Storage->>Storage: writeFileSync
  Storage->>Unresolved: JSON.stringify (node_modules/typescript/lib/lib.es5.d.ts)
  Storage->>Storage: readFileSync
  Storage->>Unresolved: JSON.parse (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Internal: createPlan
  Internal->>Internal: generateId
  Internal->>Unresolved: Date.now (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: new Date().toISOString (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Unresolved: storage.plans.push (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Storage: saveStorage
  System->>Unresolved: logger.endOperation (.pi/lib/comprehensive-logger.ts)
  System->>Internal: formatPlanSummary
  Internal->>Unresolved: new Date(plan.createdAt).toLocaleString (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: plan.steps.filter (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: plan.steps.forEach (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: step.dependencies.join (node_modules/typescript/lib/lib.es5.d.ts)
  System-->>User: 結果

```

### plan_list

List all existing plans

```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Storage as "Storage"
  participant Internal as "Internal"
  participant Unresolved as "Unresolved"

  User->>System: List all existing plans
  System->>Storage: loadStorage
  Storage->>Internal: ensurePlanDir
  Internal->>Internal: existsSync
  Internal->>Internal: mkdirSync
  Storage->>Storage: writeFileSync
  Storage->>Unresolved: JSON.stringify (node_modules/typescript/lib/lib.es5.d.ts)
  Storage->>Storage: readFileSync
  Storage->>Unresolved: JSON.parse (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Internal: formatPlanList
  Internal->>Unresolved: plans.forEach (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: plan.steps.filter (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: lines.push (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: lines.join (node_modules/typescript/lib/lib.es5.d.ts)
  System-->>User: 結果

```

### plan_show

Show detailed information about a specific plan

```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Storage as "Storage"
  participant Internal as "Internal"
  participant Unresolved as "Unresolved"

  User->>System: Show detailed information about a specific plan
  System->>Storage: loadStorage
  Storage->>Internal: ensurePlanDir
  Internal->>Internal: existsSync
  Internal->>Internal: mkdirSync
  Storage->>Storage: writeFileSync
  Storage->>Unresolved: JSON.stringify (node_modules/typescript/lib/lib.es5.d.ts)
  Storage->>Storage: readFileSync
  Storage->>Unresolved: JSON.parse (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Internal: findPlanById
  Internal->>Unresolved: storage.plans.find (node_modules/typescript/lib/lib.es2015.core.d.ts)
  System->>Internal: formatPlanSummary
  Internal->>Unresolved: lines.push (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: new Date(plan.createdAt).toLocaleString (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: plan.steps.filter (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: plan.steps.forEach (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: step.dependencies.join (node_modules/typescript/lib/lib.es5.d.ts)
  System-->>User: 結果

```

### plan_add_step

Add a step to a plan with optional description and dependencies

```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Unresolved as "Unresolved"
  participant Storage as "Storage"
  participant Internal as "Internal"

  User->>System: Add a step to a plan with optional description and depend...
  System->>Unresolved: logger.startOperation (.pi/lib/comprehensive-logger.ts)
  System->>Storage: loadStorage
  Storage->>Internal: ensurePlanDir
  Internal->>Internal: existsSync
  Internal->>Internal: mkdirSync
  Storage->>Storage: writeFileSync
  Storage->>Unresolved: JSON.stringify (node_modules/typescript/lib/lib.es5.d.ts)
  Storage->>Storage: readFileSync
  Storage->>Unresolved: JSON.parse (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Internal: findPlanById
  Internal->>Unresolved: storage.plans.find (node_modules/typescript/lib/lib.es2015.core.d.ts)
  System->>Internal: addStepToPlan
  Internal->>Internal: generateId
  Internal->>Unresolved: Date.now (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: plan.steps.push (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: new Date().toISOString (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Storage: saveStorage
  System->>Unresolved: logger.endOperation (.pi/lib/comprehensive-logger.ts)
  System-->>User: 結果

```

### plan_update_step

Update the status of a step (pending, in_progress, completed, blocked)

```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Unresolved as "Unresolved"
  participant Storage as "Storage"
  participant Internal as "Internal"

  User->>System: Update the status of a step (pending, in_progress, comple...
  System->>Unresolved: logger.startOperation (.pi/lib/comprehensive-logger.ts)
  System->>Storage: loadStorage
  Storage->>Internal: ensurePlanDir
  Internal->>Internal: existsSync
  Internal->>Internal: mkdirSync
  Storage->>Storage: writeFileSync
  Storage->>Unresolved: JSON.stringify (node_modules/typescript/lib/lib.es5.d.ts)
  Storage->>Storage: readFileSync
  Storage->>Unresolved: JSON.parse (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Internal: findPlanById
  Internal->>Unresolved: storage.plans.find (node_modules/typescript/lib/lib.es2015.core.d.ts)
  System->>Unresolved: validStatuses.includes (node_modules/typescript/lib/lib.es2016.array.include.d.ts)
  System->>Unresolved: validStatuses.join (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Internal: updateStepStatus
  Internal->>Internal: findStepById
  Internal->>Unresolved: new Date().toISOString (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Storage: saveStorage
  System->>Unresolved: logger.endOperation (.pi/lib/comprehensive-logger.ts)
  System-->>User: 結果

```

### plan_ready_steps

Get steps that are ready to execute (all dependencies completed)

```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Storage as "Storage"
  participant Internal as "Internal"
  participant Unresolved as "Unresolved"

  User->>System: Get steps that are ready to execute (all dependencies com...
  System->>Storage: loadStorage
  Storage->>Internal: ensurePlanDir
  Internal->>Internal: existsSync
  Internal->>Internal: mkdirSync
  Storage->>Storage: writeFileSync
  Storage->>Unresolved: JSON.stringify (node_modules/typescript/lib/lib.es5.d.ts)
  Storage->>Storage: readFileSync
  Storage->>Unresolved: JSON.parse (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Internal: findPlanById
  Internal->>Unresolved: storage.plans.find (node_modules/typescript/lib/lib.es2015.core.d.ts)
  System->>Storage: getReadySteps
  Storage->>Unresolved: plan.steps.filter(s => s.status === 'completed').map (node_modules/typescript/lib/lib.es5.d.ts)
  Storage->>Unresolved: plan.steps.filter (node_modules/typescript/lib/lib.es5.d.ts)
  Storage->>Unresolved: step.dependencies.every (node_modules/typescript/lib/lib.es5.d.ts)
  Storage->>Unresolved: completedStepIds.has (node_modules/typescript/lib/lib.es2015.collection.d.ts)
  System->>Unresolved: readySteps.forEach (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Unresolved: lines.push (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Unresolved: lines.join (node_modules/typescript/lib/lib.es5.d.ts)
  System-->>User: 結果

```

### plan_delete

Delete a plan by ID

```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Unresolved as "Unresolved"
  participant Storage as "Storage"
  participant Internal as "Internal"

  User->>System: Delete a plan by ID
  System->>Unresolved: logger.startOperation (.pi/lib/comprehensive-logger.ts)
  System->>Storage: loadStorage
  Storage->>Internal: ensurePlanDir
  Internal->>Internal: existsSync
  Internal->>Internal: mkdirSync
  Storage->>Storage: writeFileSync
  Storage->>Unresolved: JSON.stringify (node_modules/typescript/lib/lib.es5.d.ts)
  Storage->>Storage: readFileSync
  Storage->>Unresolved: JSON.parse (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Unresolved: storage.plans.filter (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Storage: saveStorage
  System->>Unresolved: logger.endOperation (.pi/lib/comprehensive-logger.ts)
  System-->>User: 結果

```

### plan_update_status

Update the status of a plan (draft, active, completed, cancelled)

```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Unresolved as "Unresolved"
  participant Storage as "Storage"
  participant Internal as "Internal"

  User->>System: Update the status of a plan (draft, active, completed, ca...
  System->>Unresolved: logger.startOperation (.pi/lib/comprehensive-logger.ts)
  System->>Storage: loadStorage
  Storage->>Internal: ensurePlanDir
  Internal->>Internal: existsSync
  Internal->>Internal: mkdirSync
  Storage->>Storage: writeFileSync
  Storage->>Unresolved: JSON.stringify (node_modules/typescript/lib/lib.es5.d.ts)
  Storage->>Storage: readFileSync
  Storage->>Unresolved: JSON.parse (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Internal: findPlanById
  Internal->>Unresolved: storage.plans.find (node_modules/typescript/lib/lib.es2015.core.d.ts)
  System->>Unresolved: validStatuses.includes (node_modules/typescript/lib/lib.es2016.array.include.d.ts)
  System->>Unresolved: validStatuses.join (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Unresolved: new Date().toISOString (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Storage: saveStorage
  System->>Unresolved: logger.endOperation (.pi/lib/comprehensive-logger.ts)
  System-->>User: 結果

```

## 図解

### クラス図

```mermaid
classDiagram
  class PlanStep {
    <<interface>>
    +id: string
    +title: string
    +description: string
    +status: pending_in_progre
    +estimatedTime: number
  }
  class Plan {
    <<interface>>
    +id: string
    +name: string
    +description: string
    +createdAt: string
    +updatedAt: string
  }
  class PlanStorage {
    <<interface>>
    +plans: Plan
    +currentPlanId: string
  }
```

### 依存関係図

```mermaid
flowchart LR
  subgraph this[plan]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    comprehensive_logger["comprehensive-logger"]
    comprehensive_logger_types["comprehensive-logger-types"]
    plan_mode_shared["plan-mode-shared"]
  end
  main --> local
  subgraph external[外部ライブラリ]
    _mariozechner["@mariozechner"]
    _mariozechner["@mariozechner"]
    _mariozechner["@mariozechner"]
  end
  main --> external
```

## 関数

### isCustomMessage

```typescript
isCustomMessage(msg: AgentMessage): msg is AgentMessage & { customType: string }
```

CustomMessage型かどうかを判定する型ガード関数
CustomMessageは role: "custom" と customType プロパティを持つ

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| msg | `AgentMessage` | はい |

**戻り値**: `msg is AgentMessage & { customType: string }`

### ensurePlanDir

```typescript
ensurePlanDir(): void
```

**戻り値**: `void`

### loadStorage

```typescript
loadStorage(): PlanStorage
```

**戻り値**: `PlanStorage`

### saveStorage

```typescript
saveStorage(storage: PlanStorage): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| storage | `PlanStorage` | はい |

**戻り値**: `void`

### generateId

```typescript
generateId(): string
```

**戻り値**: `string`

### createPlan

```typescript
createPlan(name: string, description?: string): Plan
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| name | `string` | はい |
| description | `string` | いいえ |

**戻り値**: `Plan`

### findPlanById

```typescript
findPlanById(storage: PlanStorage, planId: string): Plan | undefined
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| storage | `PlanStorage` | はい |
| planId | `string` | はい |

**戻り値**: `Plan | undefined`

### findStepById

```typescript
findStepById(plan: Plan, stepId: string): PlanStep | undefined
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| plan | `Plan` | はい |
| stepId | `string` | はい |

**戻り値**: `PlanStep | undefined`

### addStepToPlan

```typescript
addStepToPlan(plan: Plan, title: string, description?: string, dependencies?: string[]): PlanStep
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| plan | `Plan` | はい |
| title | `string` | はい |
| description | `string` | いいえ |
| dependencies | `string[]` | いいえ |

**戻り値**: `PlanStep`

### updateStepStatus

```typescript
updateStepStatus(plan: Plan, stepId: string, status: PlanStep["status"]): boolean
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| plan | `Plan` | はい |
| stepId | `string` | はい |
| status | `PlanStep["status"]` | はい |

**戻り値**: `boolean`

### getReadySteps

```typescript
getReadySteps(plan: Plan): PlanStep[]
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| plan | `Plan` | はい |

**戻り値**: `PlanStep[]`

### formatPlanSummary

```typescript
formatPlanSummary(plan: Plan): string
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| plan | `Plan` | はい |

**戻り値**: `string`

### formatPlanList

```typescript
formatPlanList(plans: Plan[]): string
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| plans | `Plan[]` | はい |

**戻り値**: `string`

### syncPlanModeEnv

```typescript
syncPlanModeEnv(enabled: boolean): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| enabled | `boolean` | はい |

**戻り値**: `void`

### savePlanModeState

```typescript
savePlanModeState(enabled: boolean): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| enabled | `boolean` | はい |

**戻り値**: `void`

### loadPlanModeState

```typescript
loadPlanModeState(): boolean
```

**戻り値**: `boolean`

### togglePlanMode

```typescript
togglePlanMode(ctx: any): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| ctx | `any` | はい |

**戻り値**: `void`

## インターフェース

### PlanStep

```typescript
interface PlanStep {
  id: string;
  title: string;
  description?: string;
  status: "pending" | "in_progress" | "completed" | "blocked";
  estimatedTime?: number;
  dependencies?: string[];
}
```

### Plan

```typescript
interface Plan {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  status: "draft" | "active" | "completed" | "cancelled";
  steps: PlanStep[];
}
```

### PlanStorage

```typescript
interface PlanStorage {
  plans: Plan[];
  currentPlanId?: string;
}
```

---
*自動生成: 2026-02-23T06:29:42.078Z*
