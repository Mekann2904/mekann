---
title: plan_* - 計画管理
category: user-guide
audience: daily-user
last_updated: 2026-02-11
tags: [plan, task-management, planning]
related: [../README.md, ./01-extensions.md]
---

# plan_* - 計画管理

> パンくず: [Home](../../README.md) > [User Guide](./) > plan_*

## 概要

`plan_*` 拡張機能は、タスクの計画・管理・追跡を提供します。ステップごとの実行計画を作成し、進捗を管理できます。

### 主な機能

- **プランの作成**: タスク計画を作成して保存
- **ステップ管理**: プランにステップを追加・更新
- **依存関係の管理**: ステップ間の依存関係を定義
- **進捗追跡**: ステップの状態（pending/in_progress/completed/blocked）を管理
- **実行可能なステップ**: 依存関係が満たされたステップを取得
- **プランモード**: 読み取り専用モードでの計画作成（制限無効化）

---

## 使用可能なツール

| ツール | 説明 |
|--------|------|
| `plan_create` | プランの作成 |
| `plan_list` | プラン一覧の表示 |
| `plan_show` | プランの詳細表示 |
| `plan_add_step` | プランへのステップ追加 |
| `plan_update_step` | ステップの状態更新 |
| `plan_ready_steps` | 実行可能なステップ取得 |
| `plan_delete` | プランの削除 |
| `plan_update_status` | プランの状態更新 |

---

## 使用方法

### ツールとしての実行

```typescript
// プランの作成
plan_create({
  name: "API Authentication Implementation",
  description: "Implement JWT-based authentication for REST API"
})

// ステップの追加
plan_add_step({
  planId: "20260211-103045-a1b2c3",
  title: "Design authentication flow",
  description: "Create sequence diagrams and identify edge cases"
})

plan_add_step({
  planId: "20260211-103045-a1b2c3",
  title: "Implement JWT utilities",
  dependencies: ["design-auth-flow-id"]
})

// ステップの状態更新
plan_update_step({
  planId: "20260211-103045-a1b2c3",
  stepId: "step-123",
  status: "completed"
})

// 実行可能なステップ取得
plan_ready_steps({
  planId: "20260211-103045-a1b2c3"
})

// プランの状態更新
plan_update_status({
  planId: "20260211-103045-a1b2c3",
  status: "active"
})
```

### スラッシュコマンド

```bash
# ヘルプ
/plan

# プラン一覧
/plan list

# プランの作成
/plan create API Authentication Implementation

# プランの詳細表示
/plan show 20260211-103045-a1b2c3

# プランモードの切り替え
/planmode
# Ctrl+Shift+P でも切り替え可能
```

---

## データ構造

### Plan

```typescript
interface Plan {
  id: string;                    // 一意のID
  name: string;                  // プラン名
  description?: string;          // 説明
  createdAt: string;             // 作成日時 (ISO 8601)
  updatedAt: string;             // 更新日時 (ISO 8601)
  status: "draft" | "active" | "completed" | "cancelled";
  steps: PlanStep[];            // ステップ配列
}
```

### PlanStep

```typescript
interface PlanStep {
  id: string;                          // ステップID
  title: string;                       // ステップタイトル
  description?: string;                 // 説明
  status: "pending" | "in_progress" | "completed" | "blocked";
  estimatedTime?: number;              // 見積もり時間（分）
  dependencies?: string[];              // 依存するステップID配列
}
```

---

## パラメータ

### plan_create

| パラメータ | タイプ | 必須 | 説明 |
|-----------|--------|------|------|
| `name` | string | ✅ | プラン名 |
| `description` | string | ❌ | プランの説明 |

### plan_list

パラメータなし

### plan_show

| パラメータ | タイプ | 必須 | 説明 |
|-----------|--------|------|------|
| `planId` | string | ✅ | プランID |

### plan_add_step

| パラメータ | タイプ | 必須 | 説明 |
|-----------|--------|------|------|
| `planId` | string | ✅ | プランID |
| `title` | string | ✅ | ステップタイトル |
| `description` | string | ❌ | ステップの説明 |
| `dependencies` | string[] | ❌ | 依存するステップID配列 |

### plan_update_step

| パラメータ | タイプ | 必須 | 説明 |
|-----------|--------|------|------|
| `planId` | string | ✅ | プランID |
| `stepId` | string | ✅ | ステップID |
| `status` | string | ✅ | ステータス（pending/in_progress/completed/blocked） |

### plan_ready_steps

| パラメータ | タイプ | 必須 | 説明 |
|-----------|--------|------|------|
| `planId` | string | ✅ | プランID |

### plan_delete

| パラメータ | タイプ | 必須 | 説明 |
|-----------|--------|------|------|
| `planId` | string | ✅ | プランID |

### plan_update_status

| パラメータ | タイプ | 必須 | 説明 |
|-----------|--------|------|------|
| `planId` | string | ✅ | プランID |
| `status` | string | ✅ | プランステータス（draft/active/completed/cancelled） |

---

## 使用例

### 例1: 基本的なプラン作成と実行

```typescript
// プラン作成
plan_create({
  name: "User Authentication System",
  description: "Implement JWT-based authentication with refresh tokens"
})

// ステップ追加
plan_add_step({
  planId: "<plan-id>",
  title: "Design authentication architecture"
})

plan_add_step({
  planId: "<plan-id>",
  title: "Implement JWT utilities",
  dependencies: ["<step-1-id>"]
})

plan_add_step({
  planId: "<plan-id>",
  title: "Create authentication endpoints",
  dependencies: ["<step-2-id>"]
})

// 実行可能なステップを確認
plan_ready_steps({ planId: "<plan-id>" })

// 最初のステップ開始
plan_update_step({
  planId: "<plan-id>",
  stepId: "<step-1-id>",
  status: "in_progress"
})

// ステップ完了
plan_update_step({
  planId: "<plan-id>",
  stepId: "<step-1-id>",
  status: "completed"
})

// プランをアクティブに変更
plan_update_status({
  planId: "<plan-id>",
  status: "active"
})
```

### 例2: 複雑な依存関係を持つプラン

```typescript
// プラン作成
const planId = await plan_create({
  name: "Database Migration",
  description: "Migrate from PostgreSQL to MongoDB"
}).then(r => r.details.planId)

// 並列実行可能なステップ
await plan_add_step({
  planId,
  title: "Export data from PostgreSQL"
})

await plan_add_step({
  planId,
  title: "Design MongoDB schema"
})

// 前のステップに依存するステップ
await plan_add_step({
  planId,
  title: "Transform and import data",
  dependencies: ["<export-step-id>", "<design-step-id>"]
})

await plan_add_step({
  planId,
  title: "Update application code",
  dependencies: ["<import-step-id>"]
})
```

### 例3: ステータス追跡

```typescript
// プランの詳細表示
plan_show({ planId: "<plan-id>" })

# 出力例:
# ## Plan: User Authentication System
#
# Implement JWT-based authentication with refresh tokens
#
# Status: active
# Created: 2026-02-11 10:30:45
# Updated: 2026-02-11 11:15:20
#
# Progress: 2/4 steps completed
#   Pending: 1 | In Progress: 1 | Completed: 2 | Blocked: 0
#
# ### Steps:
# 1. [✓] Design authentication architecture
# 2. [✓] Implement JWT utilities
# 3. [→] Create authentication endpoints
#    Depends on: step-2-id
# 4. [○] Add refresh token rotation
#    Depends on: step-3-id
```

---

## プランモード

プランモードは、計画段階での誤操作を防ぐための読み取り専用モードです。

### モードの切り替え

```bash
# スラッシュコマンド
/planmode

# キーボードショートカット
Ctrl+Shift+P
```

### モードの状態

| モード | 説明 | 制限 |
|--------|------|------|
| **OFF** | 通常モード | すべてのツールが利用可能 |
| **ON** | プランモード | すべてのツールが利用可能（制限無効化） |

> **注意**: 現在の実装では、プランモードでもツール制限は無効化されています。

---

## ステータスの意味

### プランステータス

| ステータス | 説明 |
|----------|------|
| `draft` | 下書き状態 |
| `active` | 実行中のプラン |
| `completed` | 全ステップ完了 |
| `cancelled` | キャンセル済み |

### ステップステータス

| ステータス | アイコン | 説明 |
|----------|--------|------|
| `pending` | ○ | 未実行（依存関係が満たされたら実行可能） |
| `in_progress` | → | 実行中 |
| `completed` | ✓ | 完了 |
| `blocked` | ⊗ | ブロック中（依存関係または問題がある状態） |

---

## 依存関係のルール

1. ステップは依存するすべてのステップが完了すると実行可能になります
2. 依存関係はサイクルを作ってはいけません
3. 依存関係が満たされていないステップは `ready_steps` に含まれません

### 依存関係の例

```
Step A (依存なし)
Step B (依存: A)
Step C (依存: A)
Step D (依存: B, C)

実行順序: A → (B & C 並列）→ D
```

---

## ストレージ

プランデータは以下の場所に保存されます:

```
.pi/plans/
├── storage.json           # プランストレージ
└── plan-mode-state.json  # プランモード状態
```

### storage.json の形式

```json
{
  "plans": [
    {
      "id": "20260211-103045-a1b2c3",
      "name": "User Authentication",
      "description": "Implement JWT auth",
      "createdAt": "2026-02-11T10:30:45.000Z",
      "updatedAt": "2026-02-11T11:15:20.000Z",
      "status": "active",
      "steps": [...]
    }
  ],
  "currentPlanId": "20260211-103045-a1b2c3"
}
```

---

## 関連トピック

- [拡張機能一覧](./01-extensions.md) - 全拡張機能の概要
- [subagents](./08-subagents.md) - サブエージェントによるステップ実行
- [agent-teams](./09-agent-teams.md) - エージェントチームによる協調実行
