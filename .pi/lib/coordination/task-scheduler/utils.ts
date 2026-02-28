/**
 * @abdd.meta
 * path: .pi/lib/coordination/task-scheduler/utils.ts
 * role: タスクスケジューラのユーティリティ関数
 * why: 共通機能を一箇所に集約し、コード重複を避けるため
 * related: ./types.ts, ./scheduler.ts
 * public_api: createTaskId, compareTaskEntries, getDefaultSchedulerConfig
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: タスクスケジューラで使用されるユーティリティ関数
 * what_it_does:
 *   - タスクID生成
 *   - タスクエントリ比較
 *   - デフォルト設定取得
 * why_it_exists: 共通機能を一箇所に集約し、保守性を高めるため
 * scope:
 *   in: なし
 *   out: ユーティリティ関数
 */

import type { TaskQueueEntry, SchedulerConfig, TaskPriority } from './types.js';
import { PRIORITY_VALUES } from '../priority-scheduler.js';
import { getRuntimeConfig } from '../../runtime-config.js';

// ============================================================================
// 優先度順序
// ============================================================================

/**
 * 優先度の順序（低い順）
 * スターベーション防止の昇格に使用
 */
export const PRIORITY_ORDER: TaskPriority[] = ["background", "low", "normal", "high", "critical"];

// ============================================================================
// タスクID生成
// ============================================================================

/** タスクIDシーケンス */
let taskIdSequence = 0;

/**
 * タスクIDを生成する
 * @summary 一意なタスクIDを生成
 * @param prefix - IDの接頭辞（デフォルト: "task"）
 * @returns 生成されたタスクID
 */
export function createTaskId(prefix: string = "task"): string {
  const timestamp = Date.now().toString(36);
  taskIdSequence = (taskIdSequence + 1) % 36 ** 4;
  const sequence = taskIdSequence.toString(36).padStart(4, "0");
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}-${timestamp}-${sequence}${random}`;
}

// ============================================================================
// 優先度ユーティリティ
// ============================================================================

/**
 * 優先度を数値に変換
 * @param priority - タスク優先度
 * @returns 数値（大きいほど高優先度）
 */
export function priorityToValue(priority: TaskPriority): number {
  return PRIORITY_VALUES[priority];
}

// ============================================================================
// 設定取得
// ============================================================================

/**
 * デフォルトのスケジューラ設定を取得
 * @summary 集中管理されたRuntimeConfigからデフォルト設定を取得
 * @returns デフォルトのスケジューラ設定
 */
export function getDefaultSchedulerConfig(): SchedulerConfig {
  const runtimeConfig = getRuntimeConfig();
  return {
    maxConcurrentPerModel: runtimeConfig.maxConcurrentPerModel,
    maxTotalConcurrent: runtimeConfig.maxTotalConcurrent,
    defaultTimeoutMs: 60_000,
    starvationThresholdMs: 60_000,
    maxSkipCount: 10,
  };
}

/**
 * レガシー用のデフォルト設定
 * @deprecated getDefaultSchedulerConfig()を使用してください
 */
export const DEFAULT_CONFIG: SchedulerConfig = {
  maxConcurrentPerModel: 4,
  maxTotalConcurrent: 8,
  defaultTimeoutMs: 60_000,
  starvationThresholdMs: 60_000,
  maxSkipCount: 10,
};

// ============================================================================
// タスクエントリ比較
// ============================================================================

/**
 * 2つのタスクエントリを優先度順で比較
 * @summary 優先度、スターベーション防止、デッドライン、FIFOを考慮
 * @param a - タスクエントリA
 * @param b - タスクエントリB
 * @returns 負の値ならaが先、正の値ならbが先
 */
export function compareTaskEntries(
  a: TaskQueueEntry,
  b: TaskQueueEntry
): number {
  // 1. 優先度比較（高い方が先）
  const priorityDiff = priorityToValue(b.task.priority) - priorityToValue(a.task.priority);
  if (priorityDiff !== 0) {
    return priorityDiff;
  }

  // 2. スターベーション防止
  const skipDiff = a.skipCount - b.skipCount;
  if (skipDiff > 3) return -1;
  if (skipDiff < -3) return 1;

  // 3. デッドライン（早い方が先）
  if (a.task.deadlineMs !== undefined && b.task.deadlineMs !== undefined) {
    const deadlineDiff = a.task.deadlineMs - b.task.deadlineMs;
    if (deadlineDiff !== 0) return deadlineDiff;
  } else if (a.task.deadlineMs !== undefined) {
    return -1;
  } else if (b.task.deadlineMs !== undefined) {
    return 1;
  }

  // 4. 同じ優先度内ではFIFO
  const enqueueDiff = a.enqueuedAtMs - b.enqueuedAtMs;
  if (enqueueDiff !== 0) return enqueueDiff;

  // 5. 推定実行時間（短い方が先）
  const durationDiff =
    a.task.costEstimate.estimatedDurationMs - b.task.costEstimate.estimatedDurationMs;
  if (durationDiff !== 0) return durationDiff;

  // 6. 最終タイブレーカー
  return a.task.id.localeCompare(b.task.id);
}
