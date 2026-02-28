/**
 * DynTaskMAS重み更新の動作確認サンプル
 * 特別な環境なしで実行可能
 * 
 * 実行方法:
 *   npx tsx .pi/lib/dag-weight-updater.example.ts
 */

import { TaskGraphUpdater, createDelta } from "./dag-weight-updater.js";
import { PriorityScheduler } from "./coordination/priority-scheduler.js";
import type { TaskNode } from "./dag-types.js";

// サンプルタスク定義
const task1: TaskNode = {
  id: "research",
  description: "コードベースを調査する",
  dependencies: [],
  priority: "high",
  estimatedDurationMs: 120000, // 2分
  assignedAgent: "researcher",
  inputContext: [],
};

const task2: TaskNode = {
  id: "plan",
  description: "実装計画を立てる",
  dependencies: ["research"],
  priority: "critical",
  estimatedDurationMs: 180000, // 3分
  assignedAgent: "architect",
  inputContext: ["research"],
};

const task3: TaskNode = {
  id: "implement",
  description: "実装する",
  dependencies: ["plan"],
  priority: "high",
  estimatedDurationMs: 300000, // 5分
  assignedAgent: "implementer",
  inputContext: ["plan"],
};

const task4: TaskNode = {
  id: "review",
  description: "コードレビューする",
  dependencies: ["implement"],
  priority: "normal",
  estimatedDurationMs: 90000, // 1.5分
  assignedAgent: "reviewer",
  inputContext: ["implement"],
};

const task5: TaskNode = {
  id: "test",
  description: "テストする",
  dependencies: ["implement"],
  priority: "normal",
  estimatedDurationMs: 120000, // 2分
  assignedAgent: "tester",
  inputContext: ["implement"],
};

console.log("=".repeat(60));
console.log("DynTaskMAS 重み更新 動作確認");
console.log("=".repeat(60));

// 1. 初期化
console.log("\n[1] 初期化");
const updater = new TaskGraphUpdater();
const scheduler = new PriorityScheduler({ maxConcurrency: 2, starvationPreventionInterval: 30000 });

// 2. タスク追加
console.log("\n[2] タスク追加");
updater.updateGraph(createDelta({
  addedTasks: [task1, task2, task3, task4, task5],
}));

console.log("エッジ重み:");
for (const [edge, weight] of Array.from(updater.getEdgeWeights().entries())) {
  console.log(`  ${edge}: ${weight.toFixed(2)}`);
}

// 3. 初回スケジューリング
console.log("\n[3] 初回スケジューリング（researchのみ実行可能）");
const readyTasks1 = updater.getReadyTasks();
console.log("実行可能タスク:", readyTasks1.map(t => t.id));

const weights1 = updater.getAllTaskWeights();
const scheduled1 = scheduler.scheduleTasks(readyTasks1, weights1);
console.log("スケジュール順:", scheduled1.map(t => t.id));

// 4. research完了
console.log("\n[4] research完了 → planが実行可能に");
updater.updateGraph(createDelta({
  completedTaskIds: ["research"],
}));

console.log("更新後のエッジ重み（research→plan は 0 に）:");
for (const [edge, weight] of Array.from(updater.getEdgeWeights().entries())) {
  console.log(`  ${edge}: ${weight.toFixed(2)}`);
}

const readyTasks2 = updater.getReadyTasks();
console.log("実行可能タスク:", readyTasks2.map(t => t.id));

// 5. plan失敗（再試行優先）
console.log("\n[5] plan失敗 → 重み1.5倍に増加");
updater.updateGraph(createDelta({
  failedTaskIds: ["plan"],
}));

console.log("失敗後のエッジ重み（research→plan は 1.5倍）:");
for (const [edge, weight] of Array.from(updater.getEdgeWeights().entries())) {
  console.log(`  ${edge}: ${weight.toFixed(2)}`);
}

// 6. 統計
console.log("\n[6] グラフ統計");
const stats = updater.getStats();
console.log(JSON.stringify(stats, null, 2));

// 7. 完了フロー
console.log("\n[7] 完了フロー");
updater.updateGraph(createDelta({
  completedTaskIds: ["plan"],
}));

const readyTasks3 = updater.getReadyTasks();
console.log("plan完了後の実行可能タスク:", readyTasks3.map(t => t.id));

const weights3 = updater.getAllTaskWeights();
const scheduled3 = scheduler.scheduleTasks(readyTasks3, weights3);
console.log("スケジュール順（implement優先）:", scheduled3.map(t => t.id));

// 8. 最終状態
console.log("\n[8] 全タスク完了");
updater.updateGraph(createDelta({
  completedTaskIds: ["implement", "review", "test"],
}));

const finalStats = updater.getStats();
console.log("最終統計:", JSON.stringify(finalStats, null, 2));

console.log("\n" + "=".repeat(60));
console.log("動作確認完了 - 特別な環境なしで実行可能");
console.log("=".repeat(60));
