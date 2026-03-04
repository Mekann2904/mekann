# Plan-Task-DAG 連携改善提案

## 概要

`plan_*`、`task_*`、`subagent_run_dag` の3システムを統合的に連携させ、シームレスなワークフローを実現する。

---

## 現状の問題

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   plan_*    │     │   task_*    │     │ subagent_   │
│             │     │             │     │   run_dag   │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       ▼                   ▼                   ▼
  .pi/plans/          .pi/tasks/          内部メモリ
  storage.json        storage.json        (一時的)
```

### 問題点
1. **データの断絶**: 各システムが独立したストレージを持ち、情報が分散
2. **手動での同期が必要**: Plan→Task変換は `task_from_plan` で可能だが、進捗の双方向同期がない
3. **DAG実行結果の消失**: `subagent_run_dag` の結果がTask/Planに記録されない
4. **重複した概念**: PlanStepとTaskが似た構造を持つが別々に管理されている

---

## 改善案

### 案1: 統合ID体系（推奨）

```typescript
// 統一されたID体系で相互参照可能に
interface UnifiedReference {
  planId?: string;      // Plan ID
  stepId?: string;      // PlanStep ID
  taskId?: string;      // Task ID
  dagExecutionId?: string;  // DAG実行ID
}

// PlanStepにTask/DAGへのリンクを追加
interface PlanStep {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "completed" | "blocked";
  linkedTaskId?: string;      // ← 紐付けられたTask
  linkedDagTaskId?: string;   // ← DAG内のタスクID
  dependencies: string[];
}

// TaskにPlanへの逆リンクを追加
interface Task {
  id: string;
  title: string;
  sourcePlanId?: string;      // ← 由来するPlan
  sourceStepId?: string;      // ← 由来するPlanStep
  dagExecutionId?: string;    // ← DAG実行セッションID
  // ...既存フィールド
}
```

### 案2: 双方向自動同期

```typescript
// task_complete時にPlanStepも自動更新
async function onTaskComplete(taskId: string) {
  const task = loadTask(taskId);
  
  // PlanStepの自動更新
  if (task.sourcePlanId && task.sourceStepId) {
    await plan_update_step({
      planId: task.sourcePlanId,
      stepId: task.sourceStepId,
      status: "completed"
    });
  }
  
  // 次のReady Stepsを自動的にTask化
  const readySteps = await plan_ready_steps({
    planId: task.sourcePlanId
  });
  
  for (const step of readySteps) {
    await task_create({
      title: step.title,
      description: step.description,
      parentTaskId: taskId,  // 依存関係を継承
      tags: [`plan:${task.sourcePlanId}`, `step:${step.id}`]
    });
  }
}
```

### 案3: DAG実行の自動記録

```typescript
// subagent_run_dagのラッパーで自動記録
interface DagExecutionRecord {
  executionId: string;
  planId?: string;           // 元になったPlan
  generatedTasks: string[];  // 生成されたTask IDs
  results: {
    taskId: string;
    status: "completed" | "failed";
    output: string;
  }[];
}

// 新ツール: plan_execute_dag
async function plan_execute_dag(params: {
  planId: string;
  maxConcurrency?: number;
  autoCreateTasks?: boolean;  // 各stepをTaskとして事前作成
}) {
  // 1. PlanをTaskPlanに変換
  const plan = loadPlan(params.planId);
  const taskPlan = convertPlanToTaskPlan(plan);
  
  // 2. 各stepをTaskとして作成（オプション）
  const taskMap = new Map<string, string>();
  if (params.autoCreateTasks) {
    for (const step of plan.steps) {
      const task = await task_create({
        title: step.title,
        description: step.description,
        status: "todo",
        tags: [`plan:${plan.id}`, `step:${step.id}`]
      });
      taskMap.set(step.id, task.id);
    }
  }
  
  // 3. DAG実行
  const result = await subagent_run_dag({
    task: plan.description,
    plan: taskPlan,
    maxConcurrency: params.maxConcurrency
  });
  
  // 4. 結果をTask/Planに反映
  for (const [dagTaskId, taskResult] of result.taskResults) {
    const stepId = findStepIdByDagTaskId(dagTaskId);
    
    // PlanStep更新
    await plan_update_step({
      planId: params.planId,
      stepId,
      status: taskResult.status === "completed" ? "completed" : "blocked"
    });
    
    // Task更新（存在すれば）
    if (taskMap.has(stepId)) {
      await task_update({
        taskId: taskMap.get(stepId)!,
        status: taskResult.status === "completed" ? "completed" : "failed"
      });
    }
  }
  
  return result;
}
```

### 案4: 統合ワークフローコマンド

```typescript
// 新スラッシュコマンド: /workflow
pi.registerCommand("workflow", {
  description: "Unified workflow commands",
  handler: async (args, ctx) => {
    const [subcommand, ...rest] = args.split(" ");
    
    switch(subcommand) {
      case "create":
        // workflow create "計画名" → Plan作成→Task生成まで一括
        const planName = rest.join(" ");
        const plan = await plan_create({ name: planName });
        await task_from_plan({ planId: plan.details.planId });
        ctx.ui.notify(`Created plan and tasks for: ${planName}`, "success");
        break;
        
      case "execute":
        // workflow execute <planId> → Plan→DAG実行→進捗反映
        const planId = rest[0];
        await plan_execute_dag({ planId, autoCreateTasks: true });
        break;
        
      case "status":
        // workflow status <planId> → Plan/Task/DAGの統合進捗表示
        showUnifiedStatus(rest[0]);
        break;
    }
  }
});
```

### 案5: 統合ステータス表示

```typescript
// 新ツール: unified_status
async function unified_status(params: { planId: string }) {
  const plan = loadPlan(params.planId);
  const tasks = loadTasksByPlanId(params.planId);
  
  // 統合ビュー
  return {
    plan: {
      id: plan.id,
      name: plan.name,
      progress: calculatePlanProgress(plan)
    },
    tasks: tasks.map(t => ({
      id: t.id,
      title: t.title,
      status: t.status,
      linkedStepId: t.sourceStepId
    })),
    dagExecutions: loadDagExecutionsByPlanId(params.planId),
    overallProgress: calculateOverallProgress(plan, tasks)
  };
}

// 出力例:
// ## Plan: API実装 (ID: plan-xxx)
// Progress: 60% (3/5 steps, 8/12 tasks)
// 
// ### Steps & Tasks:
// 1. [✓] 調査
//    └─ Task-1: [completed] 技術調査
//    └─ Task-2: [completed] ライブラリ選定
// 2. [→] 設計 (in_progress)
//    └─ Task-3: [in_progress] API設計
//    └─ Task-4: [todo] データモデル設計
// 3. [○] 実装 (pending)
//    └─ DAG実行待ち...
```

---

## 実装優先度

| 優先度 | 機能 | 影響範囲 | 工数 |
|--------|------|---------|------|
| P0 | 統合ID体系（リンクフィールド追加） | plan.ts, task.ts | 小 |
| P0 | Plan→DAG自動変換 | subagents.ts | 中 |
| P1 | Task完了→PlanStep自動更新 | task.ts, plan.ts | 中 |
| P1 | DAG実行結果の自動記録 | subagents.ts, task.ts | 中 |
| P2 | 統合ワークフローコマンド | 新規ファイル | 中 |
| P2 | 統合ステータス表示 | 新規ファイル | 小 |

---

## 技術的考慮事項

### 後方互換性
- 既存のデータ構造は維持し、新フィールドはoptionalにする
- 既存ツールの挙動は変更しない（デフォルトでは連携無効）

### トランザクション管理
```typescript
// 複数ストレージの整合性確保
async function syncWithTransaction(operations: () => Promise<void>) {
  const backup = createBackup();
  try {
    await operations();
    commit();
  } catch (e) {
    rollback(backup);
    throw e;
  }
}
```

### 循環参照防止
- Plan↔Task間の双方向リンクは弱参照（IDのみ保持）
- 削除時のカスケード処理を明確に定義

---

## まとめ

この改善により：

1. **Plan** = 高レベル設計・マイルストーン管理
2. **Task** = 日次作業・具体的な作業項目
3. **DAG** = 自動並列実行エンジン

という役割分担が明確になり、相互にシームレスに連携する統合ワークフローが実現する。
