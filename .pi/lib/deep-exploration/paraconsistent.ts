/**
 * @abdd.meta
 * path: .pi/lib/deep-exploration/paraconsistent.ts
 * role: 準矛盾的推論（ダイアレティズム）の実装
 * why: 矛盾を「解決」せず維持したまま推論するため
 * related: ./types.ts, ./core.ts
 * public_api: performParaconsistentReasoning, areContradictory
 * invariants:
 *   - Contradictionのstateはactive, acknowledged, productiveのいずれか
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: 矛盾を許容し活用する準矛盾的推論機能
 * what_it_does:
 *   - 命題間の矛盾を検出
 *   - 爆発原理を回避するガードを設定
 *   - 生産的矛盾から洞察を引き出す
 * why_it_exists: 古典論理では処理困難な矛盾を、エラーではなく資源として扱うため
 * scope:
 *   in: 命題リスト、既存の準矛盾状態（オプション）
 *   out: ParaconsistentState
 */

import type { ParaconsistentState, Contradiction } from './types.js';

/**
 * 否定パターン
 */
const NEGATION_PATTERNS = [
  [/すべき/, /すべきでない/],
  [/正しい/, /正しくない|誤り/],
  [/可能/, /不可能/],
  [/ある/, /ない/],
  [/良い/, /悪い/],
  [/必要/, /不要/],
];

/**
 * 2つの命題が矛盾的かどうかを判定
 * @param a - 命題A
 * @param b - 命題B
 * @returns 矛盾している場合true
 */
export function areContradictory(a: string, b: string): boolean {
  for (const [p1, p2] of NEGATION_PATTERNS) {
    if ((p1.test(a) && p2.test(b)) || (p2.test(a) && p1.test(b))) {
      return true;
    }
  }

  return false;
}

/**
 * 矛盾を検出
 * @param propositions - 命題リスト
 * @param existingContradictions - 既存の矛盾リスト
 * @returns 検出された矛盾リスト
 */
function detectContradictions(
  propositions: string[],
  existingContradictions: Contradiction[] = []
): Contradiction[] {
  const contradictions: Contradiction[] = [];

  // 新しい矛盾を検出
  for (let i = 0; i < propositions.length; i++) {
    for (let j = i + 1; j < propositions.length; j++) {
      if (areContradictory(propositions[i], propositions[j])) {
        contradictions.push({
          propositionA: propositions[i],
          propositionB: propositions[j],
          state: 'active',
          insights: [],
        });
      }
    }
  }

  // 既存の矛盾をマージ（重複を除く）
  for (const existing of existingContradictions) {
    const alreadyExists = contradictions.some(
      (c) =>
        (c.propositionA === existing.propositionA &&
          c.propositionB === existing.propositionB) ||
        (c.propositionA === existing.propositionB &&
          c.propositionB === existing.propositionA)
    );
    if (!alreadyExists) {
      contradictions.push(existing);
    }
  }

  return contradictions;
}

/**
 * 爆発ガードを作成
 * @param propositions - 保護対象の命題リスト
 * @returns 爆発ガードの配列
 */
function createExplosionGuards(propositions: string[]): ParaconsistentState['explosionGuards'] {
  return [
    {
      guardCondition: '矛盾から任意の命題を導出しない',
      protectedPropositions: ['*'],
    },
    {
      guardCondition: 'Aかつ非AからBを導出しない',
      protectedPropositions: propositions,
    },
  ];
}

/**
 * 生産的矛盾を抽出
 * @param contradictions - 矛盾リスト
 * @returns 生産的矛盾の配列
 */
function extractProductiveContradictions(
  contradictions: Contradiction[]
): ParaconsistentState['productiveContradictions'] {
  return contradictions
    .filter((c) => c.state === 'productive')
    .map((c) => ({
      contradiction: c,
      derivedInsights: c.insights,
    }));
}

/**
 * 準矛盾的推論を実行
 * @summary 矛盾を「解決」せず維持したまま推論する
 * @param propositions - 命題リスト
 * @param existingState - 既存の準矛盾状態（オプション）
 * @returns 準矛盾状態
 */
export function performParaconsistentReasoning(
  propositions: string[],
  existingState?: ParaconsistentState
): ParaconsistentState {
  // 矛盾を検出
  const contradictions = detectContradictions(
    propositions,
    existingState?.contradictions
  );

  return {
    contradictions,
    explosionGuards: createExplosionGuards(propositions),
    productiveContradictions: extractProductiveContradictions(contradictions),
  };
}
