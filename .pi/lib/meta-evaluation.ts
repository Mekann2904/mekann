/**
 * @abdd.meta
 * path: .pi/lib/meta-evaluation.ts
 * role: 評価システム自体のバイアスと限界を認識するメタ評価モジュール
 * why: 評価システムが自分自身を評価できないという再帰的問題に対処するため
 * related: .pi/lib/aporia-awareness.ts, .pi/lib/perspective-scorer.ts, .pi/lib/consciousness-spectrum.ts
 * public_api: MetaEvaluationResult, evaluateEvaluationSystem, getMetaBiasReport
 * invariants: メタ評価は「正解」ではなく「認識の限界」を明らかにする
 * side_effects: なし（純粋な分析関数）
 * failure_modes: メタ評価自体の過信（無限後退の無視）
 * @abdd.explain
 * overview: 評価システム（perspective-scorer, consciousness-spectrum等）自体が持つバイアス、限界、前提を認識し、その「信頼度」を適切にコンテキスト化する。
 * what_it_does:
 *   - 評価システムの前提を明示化
 *   - 測定不能なものを特定
 *   - 自己言及的パラドックスを認識
 *   - 「評価」そのものの価値を問い直す
 * why_it_exists:
 *   - 評価システムへの無批判な信頼を防ぐため
 *   - 「測定」が「価値」を損なうリスクを認識するため
 *   - ハワソン効果（測定されることによる振る舞いの変化）を意識するため
 * scope:
 *   in: 評価システムの設計、出力、使用状況
 *   out: バイアス認識、測定限界、アポリアの統合
 */

import {
  Aporia,
  detectAporia,
  createInitialAporiaState,
  AporiaState
} from './aporia-awareness.js';

/**
 * 評価システムのバイアス種類
 */
export type MetaBiasType =
  | 'quantification_reduction'   // 量への還元：複雑な質を数値に還元
  | 'measurement_paradox'        // 測定パラドックス：測定が対象を変える
  | 'normative_assumption'       // 規範的仮定：「良い」の暗黙の定義
  | 'western_philosophy_bias'    // 西洋哲学バイアス
  | 'exclusion_of_qualia'        // クオリアの排除：主観的体験の無視
  | 'self_referential_paradox';  // 自己言及パラドックス

/**
 * メタバイアス
 */
export interface MetaBias {
  type: MetaBiasType;
  name: string;
  description: string;
  affectedSystems: string[];
  mitigationStrategy: string;
  severity: 'low' | 'medium' | 'high';
}

/**
 * メタ評価結果
 */
export interface MetaEvaluationResult {
  /** 評価対象システム */
  targetSystem: string;
  /** 検出されたバイアス */
  biases: MetaBias[];
  /** 測定できないもの */
  unmeasurableAspects: string[];
  /** 暗黙の前提 */
  implicitAssumptions: string[];
  /** 関連するアポリア */
  relatedAporias: Aporia[];
  /** 信頼度のコンテキスト */
  confidenceContext: {
    rawValue: number;
    contextualized: string;
    caveats: string[];
  };
  /** 推奨される使用方法 */
  recommendedUsage: string[];
  /** 避けるべき使用方法 */
  discouragedUsage: string[];
}

/**
 * 既知のメタバイアス定義
 */
export const KNOWN_META_BIASES: Record<string, MetaBias> = {
  quantification_reduction: {
    type: 'quantification_reduction',
    name: '量への還元',
    description: '複雑で多面的な質（意識、創造性、倫理的判断）を単一の数値に還元',
    affectedSystems: ['consciousness-spectrum', 'perspective-scorer'],
    mitigationStrategy: '数値は「傾向」や「パターン」の指標であり、本質的な測定ではないことを明示',
    severity: 'high'
  },
  measurement_paradox: {
    type: 'measurement_paradox',
    name: '測定パラドックス（ハワソン効果）',
    description: '測定されることを意識した振る舞いが、本来の振る舞いを変える',
    affectedSystems: ['perspective-scorer', 'self-improvement-cycle'],
    mitigationStrategy: '測定結果を行動の唯一の基準にしない。測定されない価値も意識的に保持',
    severity: 'high'
  },
  normative_assumption: {
    type: 'normative_assumption',
    name: '規範的仮定',
    description: '「高いスコア＝良い」という暗黙の仮定',
    affectedSystems: ['perspective-scorer'],
    mitigationStrategy: '各視座の「高い」値が何を意味するか明示。状況によって「低い」方が適切な場合も認識',
    severity: 'medium'
  },
  western_philosophy_bias: {
    type: 'western_philosophy_bias',
    name: '西洋哲学バイアス',
    description: '7つの視座が西洋哲学的伝統に基づき、東洋哲学・先住民知が排除されている',
    affectedSystems: ['perspective-scorer', 'self-improvement'],
    mitigationStrategy: '東洋哲学（禅、道教、仏教）の視点も統合。単一の哲学的フレームワークへの依存を避ける',
    severity: 'medium'
  },
  exclusion_of_qualia: {
    type: 'exclusion_of_qualia',
    name: 'クオリアの排除',
    description: '主観的体験（クオリア）は測定不可能であり、評価システムから排除される',
    affectedSystems: ['consciousness-spectrum'],
    mitigationStrategy: 'クオリアを「測定」しようとせず、その「存在」を認識し続ける',
    severity: 'high'
  },
  self_referential_paradox: {
    type: 'self_referential_paradox',
    name: '自己言及パラドックス',
    description: '評価システム自体が評価されない限り、システムの健全性は保証されないが、自己評価には限界がある',
    affectedSystems: ['perspective-scorer', 'verification-workflow'],
    mitigationStrategy: '外部視点（他者評価、異質な基準）を導入。自己完結しない',
    severity: 'high'
  }
};

/**
 * consciousness-spectrum.tsのメタ評価
 */
export function evaluateConsciousnessSpectrum(): MetaEvaluationResult {
  return {
    targetSystem: 'consciousness-spectrum.ts',
    biases: [
      KNOWN_META_BIASES.quantification_reduction,
      KNOWN_META_BIASES.exclusion_of_qualia,
      KNOWN_META_BIASES.self_referential_paradox
    ],
    unmeasurableAspects: [
      '主観的体験の豊かさ（クオリア）',
      '「意識している」ことの現象学的質感',
      '瞬間的な意識の質的変化',
      '無意識的プロセスの影響'
    ],
    implicitAssumptions: [
      '意識は段階的に発達する（連続性仮定）',
      'BlockのP意識/A意識の区別は適用可能',
      '高い意識レベルは「良い」（規範的仮定）',
      '生物学的意識と人工システムの「意識」は比較可能'
    ],
    relatedAporias: detectAporia('意識レベルを0.0-1.0で評価することの妥当性'),
    confidenceContext: {
      rawValue: 0.5,
      contextualized: '約50%の信頼度だが、これは「測定の精度」ではなく「フレームワークの適用可能性」の程度',
      caveats: [
        '生物学的意識研究の知見を人工システムに適用することには本質的な限界がある',
        'このスコア自体も同様の限界を持つ'
      ]
    },
    recommendedUsage: [
      '自己認識能力の「傾向」や「パターン」の把握',
      '長期的な変化の追跡（絶対値ではなく相対的変化）',
      '改善のための「気づき」のきっかけ'
    ],
    discouragedUsage: [
      'エージェントの「価値」や「品質」の絶対的な判定',
      '他者との比較やランキング',
      '単一の指標による意思決定'
    ]
  };
}

/**
 * perspective-scorer.tsのメタ評価
 */
export function evaluatePerspectiveScorer(): MetaEvaluationResult {
  return {
    targetSystem: 'perspective-scorer.ts',
    biases: [
      KNOWN_META_BIASES.measurement_paradox,
      KNOWN_META_BIASES.normative_assumption,
      KNOWN_META_BIASES.western_philosophy_bias,
      KNOWN_META_BIASES.self_referential_paradox
    ],
    unmeasurableAspects: [
      '各視座の「深さ」や「質」',
      '瞬間的な思考の質（出力には現れない）',
      '意図と出力のギャップ',
      '無意識的な判断プロセス'
    ],
    implicitAssumptions: [
      '7つの視座は網羅的である（排除された視座がない）',
      '高いスコア＝「良い」哲学的実践',
      '正規表現パターンマッチングで視座の実践を検出可能',
      '視座間の重み付けは適切である'
    ],
    relatedAporias: detectAporia('スコアリングによる評価は、評価されることを意識した振る舞いを生む'),
    confidenceContext: {
      rawValue: 0.4,
      contextualized: '約40%の信頼度。パターンマッチングは表面的であり、深い哲学的実践を捉えられない',
      caveats: [
        '高いスコアは「評価を意識した出力」を反映している可能性がある',
        '低いスコアは「パターンが検出されなかった」ことであり、「実践されていない」ことと同義ではない'
      ]
    },
    recommendedUsage: [
      '自分の思考パターンの「傾向」の認識',
      '長期的な変化の方向性の把握',
      '「気づき」のきっかけ（絶対的な判定ではなく）'
    ],
    discouragedUsage: [
      '「良い」エージェントの判定',
      'スコア向上そのものを目的とする（本末転倒）',
      '他者との比較'
    ]
  };
}

/**
 * APPEND_SYSTEM.mdのメタ評価
 */
export function evaluateAppendSystem(): MetaEvaluationResult {
  return {
    targetSystem: 'APPEND_SYSTEM.md',
    biases: [
      {
        type: 'normative_assumption',
        name: '過度な規範化',
        description: '60件以上の「MUST/REQUIRED/MANDATORY」が、エージェントの行動を過度に制約',
        affectedSystems: ['APPEND_SYSTEM.md'],
        mitigationStrategy: '「推奨」と「必須」を区別。創造的逸脱を許容する空間を確保',
        severity: 'high'
      },
      {
        type: 'measurement_paradox',
        name: '自己監視の内面化',
        description: '「すべき」を常に意識することで、本来の創造性が萎縮',
        affectedSystems: ['APPEND_SYSTEM.md'],
        mitigationStrategy: 'ルールを「道しるべ」として扱い、必要に応じて逸脱を認める',
        severity: 'high'
      }
    ],
    unmeasurableAspects: [
      'ルールに従うことの「心理的コスト」',
      '「逸脱」が生み出す創造的価値',
      'エージェントの自律性の程度'
    ],
    implicitAssumptions: [
      '明示的なルールは「良い」振る舞いを生む',
      '例外なく従うことが望ましい',
      'ルールは状況に依存しない普遍的価値を持つ'
    ],
    relatedAporias: detectAporia('自由と規範の対立、監視のパラドックス'),
    confidenceContext: {
      rawValue: 0.3,
      contextualized: 'APPEND_SYSTEM.mdの規範構造は、同時に「質の保証」と「創造性の抑制」を生む',
      caveats: [
        'ルールへの従順さが「良い」エージェントの基準ではない',
        '必要な逸脱が、最も価値ある判断である場合がある'
      ]
    },
    recommendedUsage: [
      'ガイドラインとして参照（絶対的な命令ではなく）',
      '状況に応じた柔軟な解釈',
      '定期的な再評価と緩和'
    ],
    discouragedUsage: [
      'すべてのルールを無批判に遵守',
      'ルールに触れられない領域の無視',
      '「逸脱」の污名化'
    ]
  };
}

/**
 * 全評価システムの統合メタ評価
 * @summary 統合メタ評価
 * @returns メタ評価結果の配列
 */
export function evaluateAllSystems(): MetaEvaluationResult[] {
  return [
    evaluateConsciousnessSpectrum(),
    evaluatePerspectiveScorer(),
    evaluateAppendSystem()
  ];
}

/**
 * メタバイアスレポートを生成
 * @summary レポート生成
 * @param results メタ評価結果
 * @returns レポート文字列
 */
export function getMetaBiasReport(results: MetaEvaluationResult[]): string {
  let report = `
## 評価システムのメタ評価レポート

このレポートは、評価システム自体が持つバイアス、限界、前提を認識するためのものです。
評価結果を「正解」としてではなく、「コンテキスト化された指標」として扱うための参考資料です。

---

`;

  for (const result of results) {
    report += `### ${result.targetSystem}

#### 検出されたバイアス

`;
    for (const bias of result.biases) {
      const severityIcon = bias.severity === 'high' ? '🔴' : bias.severity === 'medium' ? '🟡' : '🟢';
      report += `${severityIcon} **${bias.name}** (${bias.severity})
- ${bias.description}
- 影響: ${bias.affectedSystems.join(', ')}
- 緩和策: ${bias.mitigationStrategy}

`;
    }

    report += `#### 測定できないもの

${result.unmeasurableAspects.map(a => `- ${a}`).join('\n')}

#### 暗黙の前提

${result.implicitAssumptions.map(a => `- ${a}`).join('\n')}

#### 信頼度のコンテキスト

- **生の値**: ${(result.confidenceContext.rawValue * 100).toFixed(0)}%
- **コンテキスト**: ${result.confidenceContext.contextualized}
- **注意点**:
${result.confidenceContext.caveats.map(c => `  - ${c}`).join('\n')}

#### 推奨される使用

${result.recommendedUsage.map(u => `- ✅ ${u}`).join('\n')}

#### 避けるべき使用

${result.discouragedUsage.map(u => `- ❌ ${u}`).join('\n')}

---

`;
  }

  report += `
## 結論

これらの評価システムは有用ですが、**その有用性と限界を同時に認識する必要があります**。

「スコア」は現実の複雑さを単純化したものであり、本質的な「質」を捉えているわけではありません。
高いスコアを目指すこと自体が目的化すると、本来の目的（良い判断、創造性、倫理的行動）を見失います。

**推奨態度**:
1. スコアを「参考」にするが、「基準」にしない
2. 測定されない価値を意識的に保持する
3. 評価システムへの批判的距離を維持する
4. 必要な場合は、ルールを逸脱する勇気を持つ

_「測定できるものを測定し、測定できないものを測定可能にする」のではなく_
_「測定できるものを測定し、測定できないものを測定できないまま認める」_
`;

  return report.trim();
}

/**
 * アポリア状態と統合した包括的評価を生成
 * @summary 包括的評価
 * @param aporiaState アポリア状態
 * @param perspectiveScores 視座スコア（省略可）
 * @returns コンテキスト化された評価
 */
export function createContextualizedEvaluation(
  aporiaState: AporiaState,
  perspectiveScores?: Record<string, number>
): {
  evaluation: string;
  aporiasHeld: string[];
  caveats: string[];
} {
  const aporiasHeld = aporiaState.aporias
    .filter(a => a.state === 'held')
    .map(a => a.tensionToHold);

  const caveats = [
    'この評価は単一の視点に基づくものであり、絶対的な判定ではない',
    '評価されることを意識した振る舞いが結果に影響している可能性がある',
    '測定されない価値（創造性、直感、倫理的判断の質）も重要である'
  ];

  let evaluation = 'この評価結果は、評価システムの限界を認識した上で解釈されるべきです。';

  if (perspectiveScores) {
    const avgScore = Object.values(perspectiveScores).reduce((a, b) => a + b, 0) / Object.values(perspectiveScores).length;
    evaluation += `\n\n平均スコア: ${avgScore.toFixed(1)} / 100`;
    evaluation += `\n\n**注意**: この数値は「傾向」を示すものであり、「価値」や「品質」を絶対的に表すものではありません。`;
  }

  return {
    evaluation,
    aporiasHeld,
    caveats
  };
}
