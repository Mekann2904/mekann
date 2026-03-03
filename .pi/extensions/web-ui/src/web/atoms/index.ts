/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/src/web/atoms/index.ts
 * @role グローバル状態管理のJotai atoms
 * @why Reactコンポーネント間の状態共有
 * @related components/*.tsx, hooks/*.ts
 * @public_api インスタンス関連atoms, タスク関連atoms, テーマatoms
 * @invariants atomsは不変、更新はset関数経由のみ
 * @side_effects なし
 * @failure_modes なし
 *
 * @abdd.explain
 * @overview Jotaiによる状態管理のエントリーポイント
 * @what_it_does グローバル状態の定義とエクスポート
 * @why_it_exists コンポーネント間の状態共有
 * @scope(in) なし
 * @scope(out) Jotai atoms
 */

import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import type { Task, TaskStats, TaskFilter } from "../../schemas/task.schema.js";
import type { InstanceInfo, InstanceStats, InstanceContextHistory } from "../../schemas/instance.schema.js";
import type { ThemeSettings } from "../../schemas/theme.schema.js";

// ============================================================================
// インスタンス関連 atoms
// ============================================================================

/**
 * インスタンス一覧
 */
export const instancesAtom = atom<InstanceInfo[]>([]);

/**
 * インスタンス統計
 */
export const instanceStatsAtom = atom<InstanceStats | null>(null);

/**
 * コンテキスト履歴
 */
export const contextHistoryAtom = atom<InstanceContextHistory[]>([]);

/**
 * 選択中のインスタンスPID
 */
export const selectedInstancePidAtom = atom<number | null>(null);

// ============================================================================
// タスク関連 atoms
// ============================================================================

/**
 * タスク一覧
 */
export const tasksAtom = atom<Task[]>([]);

/**
 * タスク統計
 */
export const taskStatsAtom = atom<TaskStats | null>(null);

/**
 * タスクフィルタ
 */
export const taskFilterAtom = atom<TaskFilter>({});

/**
 * 選択中のタスクID
 */
export const selectedTaskIdAtom = atom<string | null>(null);

// ============================================================================
// テーマ関連 atoms
// ============================================================================

/**
 * テーマ設定（ローカルストレージ永続化）
 */
export const themeAtom = atomWithStorage<ThemeSettings>("pi-theme", {
  themeId: "blue",
  mode: "dark",
});

// ============================================================================
// UI 状態 atoms
// ============================================================================

/**
 * サイドバー開閉状態
 */
export const sidebarOpenAtom = atom<boolean>(true);

/**
 * 通知メッセージ
 */
export const notificationAtom = atom<{
  message: string;
  type: "info" | "success" | "warning" | "error";
} | null>(null);

/**
 * ローディング状態
 */
export const isLoadingAtom = atom<boolean>(false);

// ============================================================================
// SSE 接続状態 atoms
// ============================================================================

/**
 * SSE接続状態
 */
export const sseConnectedAtom = atom<boolean>(false);

/**
 * SSE最終受信時刻
 */
export const sseLastReceivedAtom = atom<number | null>(null);

// ============================================================================
// 派生 atoms
// ============================================================================

/**
 * 選択中のインスタンス
 */
export const selectedInstanceAtom = atom((get) => {
  const pid = get(selectedInstancePidAtom);
  const instances = get(instancesAtom);
  return instances.find((i) => i.pid === pid) ?? null;
});

/**
 * 選択中のタスク
 */
export const selectedTaskAtom = atom((get) => {
  const id = get(selectedTaskIdAtom);
  const tasks = get(tasksAtom);
  return tasks.find((t) => t.id === id) ?? null;
});

/**
 * フィルタリング済みタスク
 */
export const filteredTasksAtom = atom((get) => {
  const tasks = get(tasksAtom);
  const filter = get(taskFilterAtom);

  let result = [...tasks];

  if (filter.status) {
    result = result.filter((t) => filter.status!.includes(t.status));
  }

  if (filter.priority) {
    result = result.filter((t) => filter.priority!.includes(t.priority));
  }

  if (filter.tag) {
    result = result.filter((t) => t.tags.includes(filter.tag!));
  }

  if (filter.assignee) {
    result = result.filter((t) => t.assignee === filter.assignee);
  }

  if (filter.overdue) {
    const now = new Date();
    result = result.filter(
      (t) =>
        t.dueDate &&
        new Date(t.dueDate) < now &&
        t.status !== "completed" &&
        t.status !== "cancelled"
    );
  }

  return result;
});
