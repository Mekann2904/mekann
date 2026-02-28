/**
 * @abdd.meta
 * path: .pi/lib/agent-runtime/domain/capacity-check.ts
 * role: 容量チェックのドメインロジック
 * why: 容量チェックのビジネスルールを集約
 * related: ./runtime-state.ts, ../application/interfaces.ts
 * public_api: RuntimeCapacityCheck, checkCapacity, calculateProjectedUsage
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: 容量チェックのビジネスルール
 * what_it_does:
 *   - 容量チェック計算
 *   - 投影使用量計算
 *   - 制限超過判定
 * why_it_exists: 容量管理ロジックを一箇所に集約
 * scope:
 *   in: runtime-state.ts
 *   out: application層
 */

import type {
  AgentRuntimeLimits,
  RuntimePriorityStats,
} from "./runtime-state.js";

/**
 * 容量チェック入力
 * @summary 容量チェック入力
 */
export interface CapacityCheckInput {
  /** 現在のアクティブリクエスト数 */
  currentRequests: number;
  /** 現在のアクティブLLM数 */
  currentLlm: number;
  /** 予約中リクエスト数 */
  reservedRequests: number;
  /** 予約中LLM数 */
  reservedLlm: number;
  /** 消費済みリクエスト数 */
  consumedRequests: number;
  /** 消費済みLLM数 */
  consumedLlm: number;
  /** 追加リクエスト数 */
  additionalRequests: number;
  /** 追加LLM数 */
  additionalLlm: number;
  /** 制限 */
  limits: AgentRuntimeLimits;
}

/**
 * 容量チェック結果
 * @summary 容量チェック結果
 */
export interface RuntimeCapacityCheck {
  /** 許可フラグ */
  allowed: boolean;
  /** 拒否理由 */
  reasons: string[];
  /** 投影リクエスト数 */
  projectedRequests: number;
  /** 投影LLM数 */
  projectedLlm: number;
}

/**
 * 投影使用量を計算
 * @summary 投影使用量計算
 * @param input - 容量チェック入力
 * @returns 投影リクエスト数とLLM数
 */
export function calculateProjectedUsage(
  input: CapacityCheckInput
): { projectedRequests: number; projectedLlm: number } {
  const projectedRequests =
    input.currentRequests +
    input.reservedRequests +
    input.consumedRequests +
    input.additionalRequests;

  const projectedLlm =
    input.currentLlm +
    input.reservedLlm +
    input.consumedLlm +
    input.additionalLlm;

  return { projectedRequests, projectedLlm };
}

/**
 * 容量をチェック
 * @summary 容量チェック
 * @param input - 容量チェック入力
 * @returns 容量チェック結果
 */
export function checkCapacity(input: CapacityCheckInput): RuntimeCapacityCheck {
  const { projectedRequests, projectedLlm } = calculateProjectedUsage(input);
  const reasons: string[] = [];

  if (projectedRequests > input.limits.maxTotalActiveRequests) {
    reasons.push(
      `request上限超過: projected=${projectedRequests}, limit=${input.limits.maxTotalActiveRequests}`
    );
  }

  if (projectedLlm > input.limits.maxTotalActiveLlm) {
    reasons.push(
      `LLM上限超過: projected=${projectedLlm}, limit=${input.limits.maxTotalActiveLlm}`
    );
  }

  return {
    allowed: reasons.length === 0,
    reasons,
    projectedRequests,
    projectedLlm,
  };
}

/**
 * 容量使用率を計算
 * @summary 使用率計算
 * @param current - 現在値
 * @param limit - 制限値
 * @returns 使用率（0.0-1.0）
 */
export function calculateUtilization(current: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.min(1, Math.max(0, current / limit));
}

/**
 * 優先度統計を更新
 * @summary 優先度統計更新
 * @param entries - キューエントリ配列
 * @returns 優先度統計
 */
export function updatePriorityStats(
  entries: Array<{ priority?: string }>
): RuntimePriorityStats {
  const stats: RuntimePriorityStats = {
    critical: 0,
    high: 0,
    normal: 0,
    low: 0,
    background: 0,
  };

  for (const entry of entries) {
    const priority = entry.priority ?? "normal";
    if (priority in stats) {
      stats[priority as keyof RuntimePriorityStats]++;
    }
  }

  return stats;
}
