/**
 * @abdd.meta
 * path: .pi/lib/coordination/task-scheduler/hybrid-scoring.ts
 * role: ハイブリッドスケジューリングのスコア計算
 * why: 優先度、処理時間、公平性を組み合わせた最適なタスク選択を実現するため
 * related: ./types.ts, ./scheduler.ts
 * public_api: computeSJFScore, computeFairQueueScore, computeHybridScore, compareHybridEntries
 * invariants: なし
 * side_effects: なし（デバッグログ出力を除く）
 * failure_modes: なし
 * @abdd.explain
 * overview: 複数の要因を組み合わせたハイブリッドスケジューリング
 * what_it_does:
 *   - SJF（最短処理時間優先）スコアを計算
 *   - 公平キュースコアを計算（仮想終了時刻ベース）
 *   - 優先度、SJF、公平性を組み合わせた最終スコアを計算
 *   - スターベーション防止ペナルティを適用
 * why_it_exists: 単一の基準ではなく、複数の要因をバランスよく考慮したスケジューリングを実現するため
 * scope:
 *   in: TaskQueueEntry, HybridSchedulerConfig
 *   out: スコア値（0.0-1.0）
 */

import type { TaskQueueEntry, HybridSchedulerConfig } from './types.js';
import { PRIORITY_VALUES, type TaskPriority } from '../priority-scheduler.js';

// ============================================================================
// デフォルト設定
// ============================================================================

/**
 * デフォルトのハイブリッドスケジューラ設定
 */
export const DEFAULT_HYBRID_CONFIG: HybridSchedulerConfig = {
  priorityWeight: 0.5,
  sjfWeight: 0.3,
  fairQueueWeight: 0.2,
  maxDurationForNormalization: 120_000, // 2分
  starvationPenaltyPerSkip: 0.02,
  maxStarvationPenalty: 0.3,
};

// ============================================================================
// ユーティリティ関数
// ============================================================================

/**
 * 優先度を数値に変換
 * @param priority - タスク優先度
 * @returns 数値（大きいほど高優先度）
 */
function priorityToValue(priority: TaskPriority): number {
  return PRIORITY_VALUES[priority];
}

// ============================================================================
// SJF（最短処理時間優先）スコア
// ============================================================================

/**
 * SJFスコアを計算
 * @summary 最短処理時間優先のスコアを計算
 * @param estimatedDurationMs - 推定実行時間
 * @param maxDurationMs - 正規化用の最大時間
 * @returns 正規化されたスコア（0-1、高いほど短いジョブ）
 * @description
 * エッジケース: maxDuration = 0 の場合は 1.0 を返す（最短可能）
 */
export function computeSJFScore(
  estimatedDurationMs: number,
  maxDurationMs: number
): number {
  const safeMax = Math.max(1, maxDurationMs);
  const normalized = Math.max(0, Math.min(safeMax, estimatedDurationMs));
  // 反転: 短い = 高いスコア
  return 1 - (normalized / safeMax);
}

// ============================================================================
// 公平キュースコア
// ============================================================================

/**
 * 公平キュースコアを計算
 * @summary 仮想終了時刻（VFT）ベースの公平キュースコア
 * @param enqueuedAtMs - エンキュー時刻
 * @param estimatedTokens - 推定トークン数
 * @param priority - タスク優先度
 * @param currentTimeMs - 現在時刻
 * @param maxTokens - 正規化用の最大トークン数
 * @returns 正規化されたスコア（0-1）
 * @description
 * VFT = arrivalTime + (tokens / weight)
 * 高い優先度 = 高い重み = 低いVFT
 * 待機時間が長いタスクにはボーナスを付与
 */
export function computeFairQueueScore(
  enqueuedAtMs: number,
  estimatedTokens: number,
  priority: TaskPriority,
  currentTimeMs: number,
  maxTokens: number
): number {
  // 優先度に基づく重み（高い優先度 = 高い重み = 低いVFT）
  const priorityVal = priorityToValue(priority);
  const weight = Math.max(0.1, priorityVal); // ゼロ除算回避

  // 仮想終了時刻の計算
  const arrivalTime = enqueuedAtMs;
  const normalizedTokens = Math.max(1, Math.min(estimatedTokens, maxTokens));
  const vft = arrivalTime + (normalizedTokens / weight);

  // 低いVFT = 高いスコア（先にスケジュールされるべき）
  // 待機時間に基づいて正規化
  const waitTime = Math.max(0, currentTimeMs - enqueuedAtMs);
  const waitBonus = waitTime > 30_000 ? 0.2 : 0; // 30秒以上待機でボーナス

  // スコア: 低いVFTが良い、待機ボーナスを追加
  const safeMaxTokens = Math.max(1, maxTokens);
  const vftNormalized = vft / (currentTimeMs + safeMaxTokens / weight);
  return Math.min(1, (1 - vftNormalized) + waitBonus);
}

// ============================================================================
// ハイブリッドスコア
// ============================================================================

/**
 * ハイブリッドスケジューリングスコアを計算
 * @summary すべての要因を組み合わせた最終スコア
 * @param entry - タスクキューエントリ
 * @param config - ハイブリッドスケジューラ設定
 * @param currentTimeMs - 現在時刻
 * @returns 最終スコア（高いほど先にスケジュールされるべき）
 * @description
 * finalScore = (priority * 0.5) + (SJF * 0.3) + (FairQueue * 0.2) - starvationPenalty
 */
export function computeHybridScore(
  entry: TaskQueueEntry,
  config: HybridSchedulerConfig,
  currentTimeMs: number
): number {
  const task = entry.task;
  const priority = priorityToValue(task.priority);

  // 優先度を[0, 1]に正規化
  const priorityNormalized = priority / 4; // 最大優先度値は4（critical）

  // SJFスコア
  const sjfScore = computeSJFScore(
    task.costEstimate.estimatedDurationMs,
    config.maxDurationForNormalization
  );

  // 公平キュースコア
  const fairQueueScore = computeFairQueueScore(
    entry.enqueuedAtMs,
    task.costEstimate.estimatedTokens,
    task.priority,
    currentTimeMs,
    100_000 // 正規化用の最大トークン数
  );

  // スターベーションペナルティ
  const starvationPenalty = Math.min(
    config.maxStarvationPenalty,
    entry.skipCount * config.starvationPenaltyPerSkip
  );

  // 統合スコア
  const finalScore =
    (priorityNormalized * config.priorityWeight) +
    (sjfScore * config.sjfWeight) +
    (fairQueueScore * config.fairQueueWeight) -
    starvationPenalty;

  // デバッグログ（環境変数で制御）
  if (process.env.PI_DEBUG_HYBRID_SCHEDULING === "1") {
    console.log(
      `[HybridScheduling] ${task.id}: priority=${priorityNormalized.toFixed(2)} ` +
      `sjf=${sjfScore.toFixed(2)} fair=${fairQueueScore.toFixed(2)} ` +
      `penalty=${starvationPenalty.toFixed(2)} final=${finalScore.toFixed(2)}`
    );
  }

  return finalScore;
}

/**
 * 2つのタスクエントリをハイブリッドスコアで比較
 * @summary 高いスコア = 先にスケジュールされるべき
 * @param a - タスクエントリA
 * @param b - タスクエントリB
 * @param config - ハイブリッドスケジューラ設定
 * @returns 負の値ならaが先、正の値ならbが先
 */
export function compareHybridEntries(
  a: TaskQueueEntry,
  b: TaskQueueEntry,
  config: HybridSchedulerConfig = DEFAULT_HYBRID_CONFIG
): number {
  const currentTimeMs = Date.now();
  const scoreA = computeHybridScore(a, config, currentTimeMs);
  const scoreB = computeHybridScore(b, config, currentTimeMs);

  // 高いスコアが先（降順）
  if (Math.abs(scoreA - scoreB) > 0.001) {
    return scoreB - scoreA;
  }

  // タイブレーカー: FIFO
  return a.enqueuedAtMs - b.enqueuedAtMs;
}
