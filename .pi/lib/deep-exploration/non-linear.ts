/**
 * @abdd.meta
 * path: .pi/lib/deep-exploration/non-linear.ts
 * role: 非線形思考（連想・直観）の実装
 * why: 論理的接続を必要としない発散的思考をシステム化するため
 * related: ./types.ts, ./core.ts
 * public_api: performNonLinearThinking
 * invariants:
 *   - associationsのstrengthは0以上1以下
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: 論理的飛躍や連想を構造化する非線形思考機能
 * what_it_does:
 *   - 種となる思考から連想チェーンを生成
 *   - 収束点を特定
 *   - 事後的に評価
 * why_it_exists: 直線的推論だけでは生まれない創発的アイデアを捉えるため
 * scope:
 *   in: 種となる思考、オプション
 *   out: NonLinearThought
 */

import type { NonLinearThought, NonLinearThinkingOptions } from './types.js';

/**
 * デフォルトの最大連想数
 */
const DEFAULT_MAX_ASSOCIATIONS = 5;

/**
 * 非線形思考を実行
 * @summary 論理的接続を必要としない連想
 * @param seed - 出発点となる思考
 * @param options - 実行オプション
 * @returns 非線形思考結果
 * @description
 * 注: 実際の連想生成はLLMが必要。この関数はテンプレートを返す。
 */
export function performNonLinearThinking(
  seed: string,
  options: NonLinearThinkingOptions = {}
): NonLinearThought {
  const maxAssociations = options.maxAssociations ?? DEFAULT_MAX_ASSOCIATIONS;

  // 注: 実際の連想生成はLLMが必要
  // ここではテンプレートを返す
  const associations: NonLinearThought['associations'] = [
    {
      content: '【連想プレースホルダー】LLMによる連想生成が必要',
      strength: 0.5,
      type: 'semantic',
    },
  ];

  return {
    seed,
    associations: associations.slice(0, maxAssociations),
    convergencePoints: [],
    evaluation: {
      novelConnections: [],
      potentialInsights: ['LLMによる非線形連想の生成が必要'],
      discardedAsRandom: [],
    },
  };
}
