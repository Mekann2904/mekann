/**
 * @abdd.meta
 * path: .pi/extensions/agent-teams/communication.ts
 * role: エージェントチーム内のメンバー間通信と信念状態（belief state）の管理を行うモジュール
 * why: チーム内での情報共有と信念状態の一貫性を保つため
 * related: .pi/extensions/agent-teams/member-execution.ts
 * public_api: updateBeliefState, getBeliefSummary, clearBeliefStateCache
 * invariants: beliefStateCacheはチームIDごとに分離される、Mutexによる並列アクセス保護
 * side_effects: モジュールレベルのキャッシュ状態を変更、ファイルシステムへの書き込みは行わない
 * failure_modes: 無効なチームIDやメンバーIDの場合はエラーをスロー、キャッシュ競合時はMutexで順序化
 * @abdd.explain
 * overview: エージェントチーム内での信念状態の更新、取得、クリアを提供するモジュール
 * what_it_does:
 *   - チームメンバーの信念状態を更新・保存する
 *   - チーム全体の信念サマリーを生成する
 *   - キャッシュをクリアする
 *   - Mutexによる並列アクセスの保護
 * why_it_exists:
 *   - チーム内での信念状態の一貫性を保つため
 *   - 複数チーム並列実行時の競合を防ぐため
 * scope:
 *   in: チームID、メンバーID、信念状態文字列、ターン番号
 *   out: 信念サマリー文字列、更新確認
 */

import { Mutex } from "async-mutex";

/**
 * 信念状態エントリ
 * @summary 信念状態エントリ
 * @interface BeliefStateEntry
 */
interface BeliefStateEntry {
  teamId: string;
  memberId: string;
  content: string;
  turn: number;
  updatedAt: number;
}

/**
 * チームごとの信念状態キャッシュ
 * Key: `${teamId}:${memberId}`
 * Value: BeliefStateEntry
 */
const beliefStateCache = new Map<string, BeliefStateEntry>();

/**
 * 並列アクセス保護用のMutex
 * Bug #3修正: beliefStateCacheへの並列アクセスをMutexで保護
 */
const beliefStateMutex = new Mutex();

/**
 * キャッシュキーを生成
 * @summary キャッシュキー生成
 * @param teamId - チームID
 * @param memberId - メンバーID
 * @returns キャッシュキー
 */
function createCacheKey(teamId: string, memberId: string): string {
  return `${teamId}:${memberId}`;
}

/**
 * 信念状態を更新
 * @summary 信念状態更新
 * @param teamId - チームID
 * @param memberId - メンバーID
 * @param content - 信念状態の内容（SUMMARY/CLAIM/CONFIDENCE形式）
 * @param turn - ターン番号
 * @returns Promise<void>
 * @throws Error 無効なチームIDまたはメンバーIDの場合
 */
export async function updateBeliefState(
  teamId: string,
  memberId: string,
  content: string,
  turn: number
): Promise<void> {
  // 入力検証
  if (!teamId || typeof teamId !== "string") {
    throw new Error("Invalid teamId: must be a non-empty string");
  }
  if (!memberId || typeof memberId !== "string") {
    throw new Error("Invalid memberId: must be a non-empty string");
  }
  if (typeof content !== "string") {
    throw new Error("Invalid content: must be a string");
  }
  if (!Number.isFinite(turn) || turn < 0) {
    throw new Error("Invalid turn: must be a non-negative finite number");
  }

  const key = createCacheKey(teamId, memberId);

  // Bug #3修正: Mutexで排他制御
  const release = await beliefStateMutex.acquire();
  try {
    beliefStateCache.set(key, {
      teamId,
      memberId,
      content,
      turn,
      updatedAt: Date.now(),
    });
  } finally {
    release();
  }
}

/**
 * チームの信念サマリーを取得
 * @summary 信念サマリー取得
 * @param teamId - チームID
 * @param memberIds - メンバーIDの配列
 * @returns 信念サマリー文字列
 */
export async function getBeliefSummary(
  teamId: string,
  memberIds: string[]
): Promise<string> {
  // 入力検証
  if (!teamId || typeof teamId !== "string") {
    throw new Error("Invalid teamId: must be a non-empty string");
  }
  if (!Array.isArray(memberIds)) {
    throw new Error("Invalid memberIds: must be an array");
  }

  // Bug #3修正: Mutexで排他制御
  const release = await beliefStateMutex.acquire();
  try {
    const summaries: string[] = [];

    for (const memberId of memberIds) {
      const key = createCacheKey(teamId, memberId);
      const entry = beliefStateCache.get(key);

      if (entry) {
        // CONFIDENCE値を抽出（0.00-1.00形式）
        const confidenceMatch = entry.content.match(/CONFIDENCE:\s*(0?\.\d+|1\.0|1)/);
        const confidence = confidenceMatch ? parseFloat(confidenceMatch[1]) : null;
        const confidenceStr = confidence !== null ? confidence.toFixed(2) : "N/A";

        summaries.push(`[${memberId}] ${entry.content.split("\n")[0]} (confidence: ${confidenceStr})`);
      } else {
        summaries.push(`[${memberId}] No belief state available`);
      }
    }

    return summaries.join("\n");
  } finally {
    release();
  }
}

/**
 * 信念状態キャッシュをクリア
 * @summary キャッシュクリア
 * @returns Promise<void>
 */
export async function clearBeliefStateCache(): Promise<void> {
  // Bug #3修正: Mutexで排他制御
  const release = await beliefStateMutex.acquire();
  try {
    beliefStateCache.clear();
  } finally {
    release();
  }
}
