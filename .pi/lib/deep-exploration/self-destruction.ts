/**
 * @abdd.meta
 * path: .pi/lib/deep-exploration/self-destruction.ts
 * role: 自己前提破壊と再構築の実装
 * why: 自身の前提を意図的に破壊し、新たな視点を構築するため
 * related: ./types.ts, ./core.ts
 * public_api: performSelfDestruction, selectDestructionMethod, destroyPremise
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: 前提を破壊し再構築する自己前提破壊機能
 * what_it_does:
 *   - 前提を分析し適切な破壊方法を選択
 *   - 破壊後に残るものを特定
 *   - 新たな視点を構築
 *   - 再帰的な破壊をサポート
 * why_it_exists: 固定された前提から脱し、創発的な視点を生み出すため
 * scope:
 *   in: 現在の前提リスト、深さ
 *   out: SelfDestructionResult
 */

import type {
  SelfDestructionResult,
  DestroyedPremise,
  ReconstructedView,
  DestructionMethod,
} from './types.js';

/**
 * 破壊方法のリスト
 */
const DESTRUCTION_METHODS: DestructionMethod[] = [
  '逆転',
  '極端化',
  '抽象化',
  '具体化',
  '歴史化',
  '相対化',
  '無意味化',
  '脱構築',
];

/**
 * 前提パターンと破壊方法のマッピング
 */
const PREMISE_DESTRUCTION_MAP: Array<{
  pattern: RegExp;
  method: DestructionMethod;
}> = [
  { pattern: /べき|必要/, method: '逆転' },
  { pattern: /正しい|良い/, method: '相対化' },
  { pattern: /常に|絶対/, method: '極端化' },
  { pattern: /改善|進歩/, method: '歴史化' },
  { pattern: /当然|明らか/, method: '脱構築' },
];

/**
 * 破壊方法を選択
 * @param premise - 破壊対象の前提
 * @returns 選択された破壊方法
 */
export function selectDestructionMethod(premise: string): DestructionMethod {
  for (const { pattern, method } of PREMISE_DESTRUCTION_MAP) {
    if (pattern.test(premise)) {
      return method;
    }
  }

  // ランダム選択
  return DESTRUCTION_METHODS[Math.floor(Math.random() * DESTRUCTION_METHODS.length)];
}

/**
 * 破壊結果
 */
interface DestructionResult {
  remains: string;
  newPerspectives: string[];
}

/**
 * 破壊方法ごとの変換
 */
const DESTRUCTION_TRANSFORMS: Record<DestructionMethod, (p: string) => DestructionResult> = {
  逆転: (p) => ({
    remains: `「${p}」の逆も真なり得る`,
    newPerspectives: [`非${p}`],
  }),
  相対化: (p) => ({
    remains: `「${p}」は特定の文脈で成立する`,
    newPerspectives: ['文脈依存性の認識'],
  }),
  極端化: (p) => ({
    remains: `「${p}」を極限まで極端にすると破綻する`,
    newPerspectives: ['極端な事例での検討'],
  }),
  歴史化: (p) => ({
    remains: `「${p}」は歴史的に構成された概念である`,
    newPerspectives: ['歴史的偶然性の認識'],
  }),
  脱構築: (p) => ({
    remains: `「${p}」は何を排除しているか`,
    newPerspectives: ['排除されたものの可視化'],
  }),
  無意味化: (p) => ({
    remains: `「${p}」はそもそも意味を持たない可能性`,
    newPerspectives: ['問い自体の無意味化'],
  }),
  抽象化: (p) => ({
    remains: `「${p}」をより抽象的なレベルで捉え直す`,
    newPerspectives: ['抽象レベルでの再考'],
  }),
  具体化: (p) => ({
    remains: `「${p}」を具体的な事例で検証する`,
    newPerspectives: ['具体的事例での検証'],
  }),
};

/**
 * 前提を破壊
 * @param premise - 破壊対象の前提
 * @param method - 破壊方法
 * @returns 破壊結果
 */
export function destroyPremise(
  premise: string,
  method: DestructionMethod
): DestructionResult {
  const transform = DESTRUCTION_TRANSFORMS[method];
  return transform ? transform(premise) : {
    remains: `「${premise}」は問い直された`,
    newPerspectives: [],
  };
}

/**
 * 自己前提破壊を実行
 * @summary 自身の前提を意図的に破壊し再構築する
 * @param currentPremises - 現在の前提リスト
 * @param depth - 再帰的な破壊の深さ（デフォルト: 1）
 * @returns 自己破壊結果
 */
export function performSelfDestruction(
  currentPremises: string[],
  depth: number = 1
): SelfDestructionResult {
  const destroyedPremises: DestroyedPremise[] = [];
  const reconstructedViews: ReconstructedView[] = [];
  const destructionChain: string[] = [];

  for (const premise of currentPremises) {
    const destructionMethod = selectDestructionMethod(premise);
    const destruction = destroyPremise(premise, destructionMethod);

    destroyedPremises.push({
      premise,
      destructionMethod,
      whatRemains: destruction.remains,
    });

    destructionChain.push(`${premise} -> [${destructionMethod}] -> ${destruction.remains}`);

    if (destruction.newPerspectives.length > 0) {
      reconstructedViews.push({
        description: destruction.newPerspectives.join(' / '),
        basedOn: [destruction.remains],
        instability: 0.7,
      });
    }
  }

  // 再帰的な破壊
  if (depth > 1 && reconstructedViews.length > 0) {
    const nextPremises = reconstructedViews.map((v) => v.description);
    const nextResult = performSelfDestruction(nextPremises, depth - 1);
    destroyedPremises.push(...nextResult.destroyedPremises);
    reconstructedViews.push(...nextResult.reconstructedViews);
    destructionChain.push(...nextResult.destructionChain);
  }

  return {
    destroyedPremises,
    reconstructedViews,
    destructionChain,
  };
}
