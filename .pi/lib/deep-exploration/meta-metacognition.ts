/**
 * @abdd.meta
 * path: .pi/lib/deep-exploration/meta-metacognition.ts
 * role: 超メタ認知プロセスの実装
 * why: メタ認知そのものをメタ認知する多層構造を実装するため
 * related: ./types.ts, ./core.ts
 * public_api: performMetaMetacognition
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: メタ認知を再帰的に観測する超メタ認知機能
 * what_it_does:
 *   - 思考についての思考を分析
 *   - 形式化リスクを検出
 *   - 除外されている側面を特定
 *   - 無限後退の認識を提供
 * why_it_exists: 単層のメタ認知では捉えきれない認知の限界を明示するため
 * scope:
 *   in: 思考内容、メタ思考内容
 *   out: MetaMetacognitiveState
 */

import type { MetaMetacognitiveState } from './types.js';

/**
 * 形式化パターン
 */
const FORMALIZATION_PATTERNS = [
  /前提を確認/,
  /二項対立を検出/,
  /文脈依存性/,
  /除外されたもの/,
  /限界を認識/,
  /批判的検討/,
];

/**
 * 除外カテゴリ
 */
const EXCLUSION_CATEGORIES = [
  { keywords: ['感情', '感覚'], label: '感情的・感覚的な側面' },
  { keywords: ['身体', '物理'], label: '身体的・物理的な側面' },
  { keywords: ['歴史', '時間'], label: '歴史的・時間的な側面' },
  { keywords: ['他者', '対話'], label: '他者との関係性' },
  { keywords: ['言語化不可能', '沈黙'], label: '言語化不可能なもの' },
];

/**
 * 超メタ認知を実行
 * @summary メタ認知そのものをメタ認知する
 * @param thought - 第0層の直接的な思考
 * @param metaThought - 第1層のメタ思考
 * @returns 4層構造のメタ認知状態
 */
export function performMetaMetacognition(
  thought: string,
  metaThought: string
): MetaMetacognitiveState {
  // 第2層：メタ認知の形式化リスクを検出
  const formalizationRisk = calculateFormalizationRisk(metaThought);

  // 第2層：除外されているものを推測
  const exclusions = detectExclusions(metaThought);

  return {
    layer0: { content: thought, confidence: 0.5 },
    layer1: { observation: metaThought, evaluation: '分析中' },
    layer2: {
      metaObservation: `メタ認知は${countMatchedPatterns(metaThought)}つの形式的パターンを使用`,
      formalizationRisk,
      exclusions,
    },
    layer3: {
      infiniteRegressAwareness: true,
      stoppingPoint: '実用性の閾値',
      arbitrarinessAcknowledged: true,
    },
  };
}

/**
 * 形式化リスクを計算
 */
function calculateFormalizationRisk(metaThought: string): number {
  const matchedCount = countMatchedPatterns(metaThought);
  return Math.min(matchedCount / FORMALIZATION_PATTERNS.length, 1);
}

/**
 * マッチしたパターン数をカウント
 */
function countMatchedPatterns(metaThought: string): number {
  return FORMALIZATION_PATTERNS.filter((p) => p.test(metaThought)).length;
}

/**
 * 除外されている側面を検出
 */
function detectExclusions(metaThought: string): string[] {
  const exclusions: string[] = [];

  for (const { keywords, label } of EXCLUSION_CATEGORIES) {
    if (!keywords.some((k) => metaThought.includes(k))) {
      exclusions.push(label);
    }
  }

  return exclusions;
}
