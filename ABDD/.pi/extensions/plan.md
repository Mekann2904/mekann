---
title: Plan Extension
category: reference
audience: developer
last_updated: 2026-02-18
tags: [extension, plan, task-management, workflow]
related: []
---

# Plan Extension

> パンくず: [Home](../README.md) > [Extensions](./) > Plan Extension

## 概要

Plan拡張機能は、タスクの計画管理機能を提供します。ステップバイステップの実行、依存関係管理、進捗追跡をサポートします。

## 機能

- プランの作成と管理
- ステップの依存関係管理
- プランモード（読み取り専用モード）
- 進捗の可視化
- 永続化ストレージ

---

## 型定義

### PlanStep

プランのステップ定義。

```typescript
interface PlanStep {
  id: string;                      // ステップID
  title: string;                   // ステップタイトル
  description?: string;            // 説明
  status: "pending" | "in_progress" | "completed" | "blocked";  // ステータス
  estimatedTime?: number;          // 推定時間（分）
  dependencies?: string[];         // 依存するステップID
}
```

### Plan

プラン定義。

```typescript
interface Plan {
  id: string;                      // プランID
  name: string;                    // プラン名
  description?: string;            // 説明
  createdAt: string;               // 作成日時
  updatedAt: string;               // 更新日時
  status: "draft" | "active" | "completed" | "cancelled";  // ステータス
  steps: PlanStep[];               // ステップリスト
}
```

### PlanStorage

ストレージ構造。

```typescript
interface PlanStorage {
  plans: Plan[];                   // プランリスト
  currentPlanId?: string;          // 現在のプランID
}
```

### PlanModeState

プランモード状態。

```typescript
interface PlanModeState {
  enabled: boolean;                // 有効フラグ
  timestamp: string;               // タイムスタンプ
  checksum: string;                // チェックサム
}
```

---

## 主要関数

### createPlan(name: string, description?: string): Plan

新しいプランを作成します。

```typescript
function createPlan(name: string, description?: string): Plan
```

**パラメータ**:
- `name`: プラン名
- `description`: 説明（オプション）

**戻り値**: 作成されたプラン

### findPlanById(storage: PlanStorage, planId: string): Plan | undefined

IDでプランを検索します。

```typescript
function findPlanById(storage: PlanStorage, planId: string): Plan | undefined
```

### addStepToPlan(plan: Plan, title: string, description?: string, dependencies?: string[]): PlanStep

プランにステップを追加します。

```typescript
function addStepToPlan(
  plan: Plan,
  title: string,
  description?: string,
  dependencies?: string[]
): PlanStep
```

**パラメータ**:
- `plan`: 対象プラン
- `title`: ステップタイトル
- `description`: 説明
- `dependencies`: 依存ステップID

**戻り値**: 追加されたステップ

### updateStepStatus(plan: Plan, stepId: string, status: PlanStep["status"]): boolean

ステップのステータスを更新します。

```typescript
function updateStepStatus(
  plan: Plan,
  stepId: string,
  status: PlanStep["status"]
): boolean
```

**戻り値**: 更新成功時`true`

### getReadySteps(plan: Plan): PlanStep[]

実行可能なステップを取得します。

```typescript
function getReadySteps(plan: Plan): PlanStep[]
```

**戻り値**: 依存関係が満たされた保留中のステップ

### formatPlanSummary(plan: Plan): string

プランのサマリーをフォーマットします。

```typescript
function formatPlanSummary(plan: Plan): string
```

---

## ツール

### plan_create

新しいプランを作成します。

**パラメータ**:
| 名前 | 型 | 必須 | 説明 |
|-----|-----|-----|------|
| name | string | はい | プラン名 |
| description | string | いいえ | 説明 |

### plan_list

すべてのプランを一覧表示します。

**パラメータ**: なし

### plan_show

プランの詳細を表示します。

**パラメータ**:
| 名前 | 型 | 必須 | 説明 |
|-----|-----|-----|------|
| planId | string | はい | プランID |

### plan_add_step

プランにステップを追加します。

**パラメータ**:
| 名前 | 型 | 必須 | 説明 |
|-----|-----|-----|------|
| planId | string | はい | プランID |
| title | string | はい | ステップタイトル |
| description | string | いいえ | 説明 |
| dependencies | string[] | いいえ | 依存ステップID |

### plan_update_step

ステップのステータスを更新します。

**パラメータ**:
| 名前 | 型 | 必須 | 説明 |
|-----|-----|-----|------|
| planId | string | はい | プランID |
| stepId | string | はい | ステップID |
| status | string | はい | 新しいステータス |

### plan_ready_steps

実行可能なステップを取得します。

**パラメータ**:
| 名前 | 型 | 必須 | 説明 |
|-----|-----|-----|------|
| planId | string | はい | プランID |

### plan_delete

プランを削除します。

**パラメータ**:
| 名前 | 型 | 必須 | 説明 |
|-----|-----|-----|------|
| planId | string | はい | プランID |

### plan_update_status

プランのステータスを更新します。

**パラメータ**:
| 名前 | 型 | 必須 | 説明 |
|-----|-----|-----|------|
| planId | string | はい | プランID |
| status | string | はい | 新しいステータス |

---

## コマンド

### /planmode

プランモードを切り替えます。

```
/planmode
```

プランモードでは、すべてのツールが利用可能です（読み取り専用制限は無効化されています）。

### /plan

プラン管理コマンド。

```
/plan list                    # プラン一覧
/plan create <name>           # プラン作成
/plan show <id>               # プラン詳細表示
```

---

## ショートカット

### Ctrl+Shift+P

プランモードの切り替え。

---

## ストレージ

プランデータは以下の場所に保存されます:

- `.pi/plans/storage.json` - プランストレージ
- `.pi/plans/plan-mode-state.json` - プランモード状態

---

## 使用例

```
# プランの作成
plan_create name="Implement Feature X" description="New feature implementation"

# ステップの追加
plan_add_step planId="xxx" title="Design API" description="Define API endpoints"

# 依存関係のあるステップ追加
plan_add_step planId="xxx" title="Implement API" dependencies=["step-id-1"]

# ステータス更新
plan_update_step planId="xxx" stepId="yyy" status="in_progress"

# 実行可能なステップ確認
plan_ready_steps planId="xxx"
```

---

## ステータスアイコン

| ステータス | アイコン |
|-----------|---------|
| pending | ○ |
| in_progress | → |
| completed | ✓ |
| blocked | ⊗ |

---

## 関連トピック

- [Loop Extension](./loop.md) - ループ実行機能
- [Question Extension](./question.md) - ユーザー質問機能
