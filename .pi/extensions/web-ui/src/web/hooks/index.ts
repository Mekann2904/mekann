/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/src/web/hooks/index.ts
 * @role カスタムフックのエクスポート
 * @why 一元的なエクスポート
 * @related use-*.ts
 * @public_api すべてのカスタムフック
 * @invariants なし
 * @side_effects なし
 * @failure_modes なし
 *
 * @abdd.explain
 * @overview カスタムフックのエントリーポイント
 * @what_it_does フックの再エクスポート
 * @why_it_exists インポートパスの簡素化
 */

// インスタンス関連
export {
  useInstances,
  useInstanceStats,
  useContextHistory,
  useSelectedInstance,
  useDeleteInstance,
} from "./use-instances.js";

// タスク関連
export {
  useTasks,
  useTaskStats,
  useSelectedTask,
  useCreateTask,
  useUpdateTask,
  useCompleteTask,
  useDeleteTask,
} from "./use-tasks.js";

// SSE関連
export { useSSE, useSSEConnection } from "./use-sse.js";
