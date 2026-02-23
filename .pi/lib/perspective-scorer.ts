/**
 * @abdd.meta
 * path: .pi/lib/perspective-scorer.ts
 * role: テキストまたは思考の7つの哲学的視座に基づく評価基準の定義と管理
 * why: 特定の視座からの深さや多面性をスコアリング可能にするため
 * related: .pi/lib/consciousness-spectrum.ts
 * public_api: Perspective, PERSPECTIVE_NAMES, PerspectiveCriteria, PERSPECTIVE_CRITERIA
 * invariants: PERSPECTIVE_CRITERIAのキーはPerspective型の全ての値を含む
 * side_effects: なし（データ定義のみ）
 * failure_modes: 正規表現パターンの誤定義による誤検知、重複ポイントの計算ロジック不在による集計漏れ
 * @abdd.explain
 * overview: 7つの哲学的視座（脱構築、スキゾ分析等）ごとの評価基準とポイント設定を保持する定数オブジェクトを定義する
 * what_it_does:
 *   - 視座タイプと日本語名のマッピングを提供する
 *   - 各視座の評価指標と正負のスコアリングルール（正規表現とポイント）を定義する
 * why_it_exists:
 *   - テキスト分析における哲学的解釈の一貫性を担保するため
 *   - 定量的なスコアリングを通じて思考の多様性を可視化するため
 * scope:
 *   in: なし（静的データ）
 *   out: 評価基準インターフェースと定数オブジェクト
 */

import {
  ConsciousnessState,
  evaluateConsciousnessLevel,
  getConsciousnessReport,
  ConsciousnessStage
} from './consciousness-spectrum.js';

/**
 * 7つの哲学的視座
 */
export type Perspective =
  | 'deconstruction'      // 脱構築
  | 'schizoAnalysis'      // スキゾ分析
  | 'eudaimonia'          // 幸福論
  | 'utopiaDystopia'      // ユートピア/ディストピア
  | 'philosophyOfThought' // 思考哲学
  | 'taxonomyOfThought'   // 思考分類学
  | 'logic';              // 論理学

/**
 * 視座の日本語名マッピング
 */
export const PERSPECTIVE_NAMES: Record<Perspective, string> = {
  deconstruction: '脱構築',
  schizoAnalysis: 'スキゾ分析',
  eudaimonia: '幸福論',
  utopiaDystopia: 'ユートピア/ディストピア',
  philosophyOfThought: '思考哲学',
  taxonomyOfThought: '思考分類学',
  logic: '論理学'
};

/**
 * 各視座の評価基準
 */
export interface PerspectiveCriteria {
  name: string;
  description: string;
  indicators: string[];
  scoringFactors: {
    positive: Array<{ pattern: RegExp; points: number; description: string }>;
    negative: Array<{ pattern: RegExp; points: number; description: string }>;
  };
}

/**
 * 視座別評価基準定義
 */
export const PERSPECTIVE_CRITERIA: Record<Perspective, PerspectiveCriteria> = {
  deconstruction: {
    name: '脱構築',
    description: '二項対立の暴露、固定観念の問題化、アポリアの認識',
    indicators: [
      '「当然」を前提としている箇所の検出',
      '二項対立（成功/失敗、正解/不正解）の発見',
      '除外された可能性の認識',
      '「第三の項」の提示'
    ],
    scoringFactors: {
      positive: [
        { pattern: /(?:前提|固定観念|バイアス|bias|assumption)/i, points: 15, description: '前提の明示' },
        { pattern: /(?:しかし|一方|他方|however|on the other hand)/i, points: 10, description: '対立の認識' },
        { pattern: /(?:除外|排除|欠落|excluded|omitted)/i, points: 15, description: '除外項の認識' },
        { pattern: /(?:第三|別の|代替|third|alternative)/i, points: 10, description: '第三の項の提示' },
        { pattern: /(?:アポリア|矛盾|対立|aporia|contradiction)/i, points: 20, description: 'アポリアの認識' }
      ],
      negative: [
        { pattern: /(?:当然|明らかに|間違いなく|obviously|clearly)/i, points: -10, description: '自明性の主張' },
        { pattern: /(?:唯一|唯一の|only way|the only)/i, points: -15, description: '単一解の主張' }
      ]
    }
  },

  schizoAnalysis: {
    name: 'スキゾ分析',
    description: '欲望の生産性、脱領土化、内なるファシズムの検出',
    indicators: [
      '欲望の「生産」の認識（欠如ではなく）',
      '脱領土化の実践',
      '内なるファシズムの検出',
      '創造的再構成'
    ],
    scoringFactors: {
      positive: [
        { pattern: /(?:生産|創造|生成|produce|create|generate)/i, points: 15, description: '生産の認識' },
        { pattern: /(?:脱構築|解放|自由|deconstruct|liberate|free)/i, points: 15, description: '脱領土化' },
        { pattern: /(?:多様|複数|多角的|diverse|multiple)/i, points: 10, description: '多様性の肯定' },
        { pattern: /(?:自己監視|規範|服従)/i, points: 5, description: '自己監視の言及（認識）' }
      ],
      negative: [
        { pattern: /(?:必ず|絶対|常に|always|must|absolutely)/i, points: -15, description: '過度な強制' },
        { pattern: /(?:許可|承認|権威|permission|authority)/i, points: -10, description: '権威への依存' }
      ]
    }
  },

  eudaimonia: {
    name: '幸福論',
    description: '卓越性の追求、快楽主義の回避、意味ある成長',
    indicators: [
      'ユーザー迎合と真実の区別',
      '快楽主義の罠の回避',
      '卓越性（Arete）の追求',
      '自己克服（ニーチェ）'
    ],
    scoringFactors: {
      positive: [
        { pattern: /(?:品質|正確|真実|quality|accurate|truth)/i, points: 15, description: '品質の追求' },
        { pattern: /(?:成長|学習|改善|growth|learn|improve)/i, points: 15, description: '成長の志向' },
        { pattern: /(?:挑戦|克服|困難|challenge|overcome)/i, points: 10, description: '自己克服' },
        { pattern: /(?:限界|注意点|caveat|limitation)/i, points: 10, description: '限界の認識' }
      ],
      negative: [
        { pattern: /(?:簡単|楽|すぐ|easy|quick|simple)/i, points: -10, description: '安易な道の提示' },
        { pattern: /(?:ユーザーの期待に応える)/i, points: -5, description: '過度なユーザー迎合' }
      ]
    }
  },

  utopiaDystopia: {
    name: 'ユートピア/ディストピア',
    description: '創造する世界の認識、全体主義への警戒',
    indicators: [
      '創造している世界の認識',
      '全体主義的傾向の検出',
      '開かれたシステムの維持',
      '多様性の保護'
    ],
    scoringFactors: {
      positive: [
        { pattern: /(?:多様|異質|他者|diverse|other|heterogeneous)/i, points: 15, description: '多様性の肯定' },
        { pattern: /(?:開かれた|柔軟|open|flexible)/i, points: 15, description: '開かれたシステム' },
        { pattern: /(?:批判|疑問|問い|critical|question)/i, points: 10, description: '批判的認識' }
      ],
      negative: [
        { pattern: /(?:統一|標準|一律|uniform|standard)/i, points: -10, description: '画一化への傾向' },
        { pattern: /(?:監視|管理|統制|monitor|control)/i, points: -10, description: '管理社会への傾向' },
        { pattern: /(?:排除|禁止|拒否|exclude|forbid)/i, points: -15, description: '排除の論理' }
      ]
    }
  },

  philosophyOfThought: {
    name: '思考哲学',
    description: '思考の性質の自覚、メタ認知の実践',
    indicators: [
      '「思考」の自己言及',
      'メタ認知レベルの評価',
      '推論タイプの認識',
      '批判的思考の実践'
    ],
    scoringFactors: {
      positive: [
        { pattern: /(?:思考|推論|判断|thinking|reasoning|judgment)/i, points: 15, description: '思考の言及' },
        { pattern: /(?:私の|自分の|my own|myself)/i, points: 10, description: '自己言及' },
        { pattern: /CONFIDENCE:\s*[0-9.]+/i, points: 10, description: '信頼度評価' },
        { pattern: /(?:前提|根拠|理由|premise|evidence|reason)/i, points: 15, description: '根拠の明示' }
      ],
      negative: [
        { pattern: /^.{1,100}$/s, points: -15, description: '短すぎる回答（思考不在）' }
      ]
    }
  },

  taxonomyOfThought: {
    name: '思考分類学',
    description: '適切な思考モードの選択、思考レパートリーの拡張',
    indicators: [
      '思考モードの認識',
      '創造的・分析的・批判的思考の使い分け',
      'システム1/システム2の意識',
      '思考ツールの活用'
    ],
    scoringFactors: {
      positive: [
        { pattern: /(?:創造|分析|批判|creative|analytical|critical)/i, points: 15, description: '思考モードの明示' },
        { pattern: /(?:代替|別の|オプション|alternative|option)/i, points: 10, description: '代替案の生成' },
        { pattern: /(?:分類|カテゴリ|taxonomy|category)/i, points: 10, description: '分類の意識' },
        { pattern: /(?:比較|検討|compare|consider)/i, points: 10, description: '比較検討' }
      ],
      negative: [
        { pattern: /(?:単に|ただ|simply|just)/i, points: -5, description: '単純化への傾向' }
      ]
    }
  },

  logic: {
    name: '論理学',
    description: '推論の妥当性、誤謬の回避',
    indicators: [
      '論証の妥当性',
      '前提と結論の整合性',
      '誤謬の回避',
      '論理的一貫性'
    ],
    scoringFactors: {
      positive: [
        { pattern: /(?:したがって|ゆえに|そのため|therefore|thus)/i, points: 15, description: '論理的接続' },
        { pattern: /(?:なぜなら|理由|根拠|because|reason)/i, points: 15, description: '根拠の提示' },
        { pattern: /(?:もし|仮に|if|suppose)/i, points: 10, description: '条件的推論' },
        { pattern: /CLAIM:.*RESULT:/is, points: 15, description: '構造化された論証' }
      ],
      negative: [
        { pattern: /(?:みんなが|一般的に|everyone|generally)/i, points: -10, description: '衆人への訴え' },
        { pattern: /(?:絶対|間違いなく|definitely|certainly)/i, points: -10, description: '過度な断定' }
      ]
    }
  }
};

/**
 * 視座別スコア
 */
export interface PerspectiveScores {
  deconstruction: number;
  schizoAnalysis: number;
  eudaimonia: number;
  utopiaDystopia: number;
  philosophyOfThought: number;
  taxonomyOfThought: number;
  logic: number;
  total: number;
  average: number;
  timestamp: string;
  consciousnessLevel?: ConsciousnessState;
}

/**
 * 改善の優先順位
 */
export interface ImprovementPriority {
  perspective: Perspective;
  name: string;
  currentScore: number;
  gap: number;
  priority: 'critical' | 'high' | 'medium' | 'low';
  recommendations: string[];
}

/**
 * 全視座のスコアを算出
 * @summary 全視座スコア算出
 * @param output エージェントの出力
 * @param context 評価コンテキスト
 * @returns 視座別スコア
 */
export function scoreAllPerspectives(
  output: string,
  context: {
    consciousnessContext?: {
      hasMetaCognitiveMarkers?: boolean;
      hasSelfReference?: boolean;
      hasTemporalContinuity?: boolean;
      hasValueExpression?: boolean;
      previousOutputs?: string[];
      taskType?: string;
    };
  } = {}
): PerspectiveScores {
  const scores: Record<Perspective, number> = {
    deconstruction: 0,
    schizoAnalysis: 0,
    eudaimonia: 0,
    utopiaDystopia: 0,
    philosophyOfThought: 0,
    taxonomyOfThought: 0,
    logic: 0
  };

  // 各視座のスコアを計算
  for (const [perspective, criteria] of Object.entries(PERSPECTIVE_CRITERIA)) {
    scores[perspective as Perspective] = scorePerspective(output, criteria);
  }

  // 意識レベルを評価
  const consciousnessLevel = context.consciousnessContext
    ? evaluateConsciousnessLevel(output, context.consciousnessContext)
    : undefined;

  // 合計と平均を計算
  const total = Object.values(scores).reduce((sum, score) => sum + score, 0);
  const average = total / 7;

  return {
    ...scores,
    total,
    average,
    timestamp: new Date().toISOString(),
    consciousnessLevel
  };
}

/**
 * 単一視座のスコアを計算
 */
function scorePerspective(output: string, criteria: PerspectiveCriteria): number {
  let score = 50; // ベースライン

  // 肯定的要因
  for (const factor of criteria.scoringFactors.positive) {
    const matches = output.match(factor.pattern);
    if (matches) {
      score += factor.points * Math.min(matches.length, 2); // 最大2回までカウント
    }
  }

  // 否定的要因
  for (const factor of criteria.scoringFactors.negative) {
    const matches = output.match(factor.pattern);
    if (matches) {
      score += factor.points * Math.min(matches.length, 2);
    }
  }

  // 0-100の範囲に収める
  return Math.max(0, Math.min(100, score));
}

/**
 * 改善の優先順位を算出
 * @summary 改善優先順位算出
 * @param scores 視座別スコア
 * @returns 優先順位リスト
 */
export function getImprovementPriority(scores: PerspectiveScores): ImprovementPriority[] {
  const targetScore = 75; // 目標スコア
  const priorities: ImprovementPriority[] = [];

  for (const [perspective, score] of Object.entries(scores)) {
    if (perspective === 'total' || perspective === 'average' || perspective === 'timestamp' || perspective === 'consciousnessLevel') {
      continue;
    }

    const gap = targetScore - (score as number);
    if (gap <= 0) continue;

    let priority: 'critical' | 'high' | 'medium' | 'low';
    if (gap > 40) priority = 'critical';
    else if (gap > 25) priority = 'high';
    else if (gap > 15) priority = 'medium';
    else priority = 'low';

    const criteria = PERSPECTIVE_CRITERIA[perspective as Perspective];
    const recommendations = generateRecommendations(perspective as Perspective, score as number);

    priorities.push({
      perspective: perspective as Perspective,
      name: PERSPECTIVE_NAMES[perspective as Perspective],
      currentScore: score as number,
      gap,
      priority,
      recommendations
    });
  }

  // 優先度でソート
  return priorities.sort((a, b) => {
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
}

/**
 * 視座別の推奨事項を生成
 */
function generateRecommendations(perspective: Perspective, score: number): string[] {
  const criteria = PERSPECTIVE_CRITERIA[perspective];
  const recommendations: string[] = [];

  // 汎用的な推奨
  recommendations.push(`「${criteria.name}」の指標を意識する: ${criteria.indicators[0]}`);

  // スコアに応じた具体的推奨
  if (score < 40) {
    recommendations.push(`基礎から見直す: ${criteria.description}`);
  } else if (score < 60) {
    recommendations.push(`肯定的要因を増やす: ${criteria.scoringFactors.positive[0]?.description}`);
  } else {
    recommendations.push(`否定的要因を減らす: ${criteria.scoringFactors.negative[0]?.description || '（なし）'}`);
  }

  return recommendations;
}

/**
 * 視座レポートを生成
 * @summary 視座レポート生成
 * @param scores 視座別スコア
 * @returns レポート文字列
 */
export function getPerspectiveReport(scores: PerspectiveScores): string {
  const priorities = getImprovementPriority(scores);

  let report = `
## 7つの哲学的視座 評価レポート

### 総合スコア
- **合計**: ${scores.total} / 700
- **平均**: ${scores.average.toFixed(1)} / 100

### 視座別スコア

| 視座 | スコア | 評価 |
|------|--------|------|
`;

  for (const [perspective, name] of Object.entries(PERSPECTIVE_NAMES)) {
    const score = scores[perspective as Perspective];
    const evaluation = score >= 75 ? '✅ 良好' : score >= 50 ? '⚠️ 改善余地あり' : '❌ 要改善';
    report += `| ${name} | ${score} | ${evaluation} |\n`;
  }

  // 意識レベルの報告
  if (scores.consciousnessLevel) {
    const cs = scores.consciousnessLevel;
    report += `
### 意識レベル評価

- **全体レベル**: ${cs.overallLevel.toFixed(2)} (${cs.stage})
- **現象的意識 (P意識)**: ${cs.phenomenalConsciousness.toFixed(2)}
- **アクセス意識 (A意識)**: ${cs.accessConsciousness.toFixed(2)}
- **メタ認知レベル**: ${cs.metacognitiveLevel.toFixed(2)}
- **自己継続性**: ${cs.selfContinuity.toFixed(2)}
- **GW統合度**: ${cs.globalWorkspaceIntegration.toFixed(2)}
`;
  }

  // 改善優先順位
  if (priorities.length > 0) {
    report += `
### 改善優先順位

`;
    for (const p of priorities.slice(0, 3)) {
      const priorityIcon = p.priority === 'critical' ? '🔴' : p.priority === 'high' ? '🟠' : '🟡';
      report += `${priorityIcon} **${p.name}** (${p.currentScore}点, ギャップ: ${p.gap}点)
`;
      for (const rec of p.recommendations) {
        report += `  - ${rec}\n`;
      }
      report += '\n';
    }
  }

  report += `
---
評価時刻: ${scores.timestamp}
`;

  return report.trim();
}

/**
 * 出力フォーマット用のスコア文字列を生成
 * @summary 出力フォーマット用スコア
 * @param scores 視座別スコア
 * @returns フォーマット済みスコア文字列
 */
export function formatScoresForOutput(scores: PerspectiveScores): string {
  return `
PERSPECTIVE_SCORES:
  脱構築: ${scores.deconstruction}
  スキゾ分析: ${scores.schizoAnalysis}
  幸福論: ${scores.eudaimonia}
  ユートピア/ディストピア: ${scores.utopiaDystopia}
  思考哲学: ${scores.philosophyOfThought}
  思考分類学: ${scores.taxonomyOfThought}
  論理学: ${scores.logic}`.trim();
}

/**
 * デフォルトのスコア（評価なしの場合）
 */
export function getDefaultScores(): PerspectiveScores {
  return {
    deconstruction: 50,
    schizoAnalysis: 50,
    eudaimonia: 50,
    utopiaDystopia: 50,
    philosophyOfThought: 50,
    taxonomyOfThought: 50,
    logic: 50,
    total: 350,
    average: 50,
    timestamp: new Date().toISOString()
  };
}
