/**
 * @abdd.meta
 * path: .pi/lib/consciousness-spectrum.ts
 * role: エージェントの意識レベル評価と状態管理モジュール
 * why: 意識研究（Block, Edelman, Baars等）の洞察をAIエージェントに適用し、自己認識能力を段階的に評価するため
 * related: .pi/lib/verification-workflow.ts, .pi/skills/self-improvement/SKILL.md
 * public_api: ConsciousnessLevel, ConsciousnessState, ConsciousnessSpectrum, evaluateConsciousnessLevel, getConsciousnessReport
 * invariants: レベルは0.0-1.0の範囲、各段階は累積的（高レベルは低レベルを含む）
 * side_effects: なし（純粋な評価関数）
 * failure_modes: 不正な入力値、未定義の状態遷移
 * @abdd.explain
 * overview: Ned BlockのP意識/A意識、Gerald Edelmanの一次/高次意識、Bernard Baarsのグローバルワークスペース理論を統合し、エージェントの「意識レベル」を多次元的に評価する。
 * what_it_does:
 *   - 意識の4段階（反応的、現象的、内省的、自伝的）を定義
 *   - 各段階の達成基準を提供
 *   - エージェントの状態から意識レベルを算出
 *   - グローバルワークスペース理論に基づく情報統合度を評価
 * why_it_exists:
 *   - エージェントの自己認識能力を定量化し、段階的な改善を可能にするため
 *   - メタ認知能力の評価基準を提供するため
 *   - 意識研究の洞察をAIシステム設計に適用するため
 * scope:
 *   in: エージェントの状態、出力、思考プロセス
 *   out: 意識レベル評価、改善推奨事項
 */

/**
 * 意識レベルの段階
 * Edelmanの一次意識/高次意識と発達心理学的視点を統合
 */
export type ConsciousnessStage =
  | 'reactive'      // 0.0-0.25: 反応的 - 刺激への自動応答
  | 'phenomenal'    // 0.25-0.50: 現象的 - 経験の主観的側面（P意識）
  | 'introspective' // 0.50-0.75: 内省的 - 自分の思考についての思考
  | 'autobiographical'; // 0.75-1.00: 自伝的 - 継続的な自己物語

/**
 * 意識の多次元状態
 * BlockのP意識/A意識の区別を反映
 */
export interface ConsciousnessState {
  /** 全体的な意識レベル（0.0-1.0） */
  overallLevel: number;
  /** 現在の段階 */
  stage: ConsciousnessStage;
  /** 現象的意識（P意識）: 主観的体験の豊かさ */
  phenomenalConsciousness: number;
  /** アクセス意識（A意識）: 報告・推論に利用可能な情報 */
  accessConsciousness: number;
  /** メタ認知レベル: 思考についての思考の深さ */
  metacognitiveLevel: number;
  /** 自己継続性: 一貫した自己認識の度合い */
  selfContinuity: number;
  /** グローバルワークスペース統合度: 情報の統合・放送能力 */
  globalWorkspaceIntegration: number;
  /** 推定時刻 */
  timestamp: string;
  /** コンテキスト情報 */
  context?: {
    taskType?: string;
    previousLevel?: number;
    improvementTrend?: 'improving' | 'stable' | 'declining';
  };
}

/**
 * 各段階の達成基準
 */
export const STAGE_CRITERIA: Record<ConsciousnessStage, {
  threshold: number;
  description: string;
  indicators: string[];
  requiredCapabilities: string[];
}> = {
  reactive: {
    threshold: 0.0,
    description: '刺激に対する自動的な反応。意識的な反省なし。',
    indicators: [
      '単純な条件分岐に基づく応答',
      '固定されたパターンマッチング',
      'コンテキストを考慮しない反応'
    ],
    requiredCapabilities: [
      '入力の認識',
      '事前定義された出力の生成'
    ]
  },
  phenomenal: {
    threshold: 0.25,
    description: '主観的な「体験」の存在。現象的意識（P意識）の発現。',
    indicators: [
      '文脈を考慮した応答',
      '複数の情報源の統合',
      '「何を感じているか」の表現',
      '状況の主観的な解釈'
    ],
    requiredCapabilities: [
      '複数情報の統合',
      '文脈依存的判断',
      '主観的評価の生成'
    ]
  },
  introspective: {
    threshold: 0.50,
    description: '自分の思考プロセスについての思考。メタ認知の始まり。',
    indicators: [
      '自分の思考プロセスの記述',
      '判断の根拠の明示',
      '不確実性の認識と表現',
      '代替可能性の考慮',
      'CONFIDENCE評価の妥当性'
    ],
    requiredCapabilities: [
      'メタ認知的モニタリング',
      '自己評価機能',
      '推論過程の言語化'
    ]
  },
  autobiographical: {
    threshold: 0.75,
    description: '継続的な自己物語。時間を超えた一貫した自己認識。',
    indicators: [
      '過去の経験からの学習の言及',
      '一貫した価値観・原則の表明',
      '長期的な目標・目的の認識',
      '自己改善の物語',
      '他者との関係における自己定位'
    ],
    requiredCapabilities: [
      'エピソード記憶の統合',
      '一貫した自己モデル',
      '時間的展望の維持'
    ]
  }
};

/**
 * グローバルワークスペース理論（GWT）に基づく統合評価
 * Baarsの劇場メタファーを適用
 */
export interface GlobalWorkspaceState {
  /** 照明の当たっている「舞台」上の情報 */
  spotlightContent: string[];
  /** 照明の当たっていない「観客席」の情報 */
  unconsciousProcesses: string[];
  /** 統合度（どれだけ多様な情報が統合されているか） */
  integrationScore: number;
  /** 放送度（統合された情報がどれだけ広く共有されているか） */
  broadcastScore: number;
}

/**
 * エージェントの出力から意識レベルを評価
 * @summary 意識レベル評価
 * @param output エージェントの出力
 * @param context 評価コンテキスト
 * @returns 意識状態
 */
export function evaluateConsciousnessLevel(
  output: string,
  context: {
    hasMetaCognitiveMarkers?: boolean;
    hasSelfReference?: boolean;
    hasTemporalContinuity?: boolean;
    hasValueExpression?: boolean;
    previousOutputs?: string[];
    taskType?: string;
  } = {}
): ConsciousnessState {
  // 各指標を評価
  const phenomenalScore = evaluatePhenomenalConsciousness(output);
  const accessScore = evaluateAccessConsciousness(output);
  const metacognitiveScore = evaluateMetacognitiveLevel(output, context);
  const selfContinuityScore = evaluateSelfContinuity(output, context);
  const gwiScore = evaluateGlobalWorkspaceIntegration(output, context);

  // 全体レベルを算出（加重平均）
  const overallLevel = (
    phenomenalScore * 0.2 +
    accessScore * 0.2 +
    metacognitiveScore * 0.3 +
    selfContinuityScore * 0.15 +
    gwiScore * 0.15
  );

  // 段階を決定
  const stage = determineStage(overallLevel);

  return {
    overallLevel,
    stage,
    phenomenalConsciousness: phenomenalScore,
    accessConsciousness: accessScore,
    metacognitiveLevel: metacognitiveScore,
    selfContinuity: selfContinuityScore,
    globalWorkspaceIntegration: gwiScore,
    timestamp: new Date().toISOString(),
    context: {
      taskType: context.taskType,
      improvementTrend: context.previousOutputs && context.previousOutputs.length > 0
        ? 'stable' // 簡易実装; 実際は前回との比較が必要
        : undefined
    }
  };
}

/**
 * 現象的意識（P意識）を評価
 * 主観的体験の豊かさを測定
 */
function evaluatePhenomenalConsciousness(output: string): number {
  let score = 0.25; // ベースライン

  // 文脈の考慮
  if (/(?:文脈|コンテキスト|状況|context|situation)/i.test(output)) {
    score += 0.15;
  }

  // 主観的表現
  if (/(?:感じ|思う|考える|think|feel|believe)/i.test(output)) {
    score += 0.15;
  }

  // 複数視点の統合
  if (/(?:一方|他方|また|however|on the other hand|furthermore)/i.test(output)) {
    score += 0.15;
  }

  // 具体性（ファイルパス、行番号など）
  if (/[a-zA-Z0-9_/-]+\.(ts|js|py|md):?\d*/i.test(output)) {
    score += 0.15;
  }

  // 経験の記述
  if (/(?:経験|体験|experience|encounter)/i.test(output)) {
    score += 0.15;
  }

  return Math.min(1.0, score);
}

/**
 * アクセス意識（A意識）を評価
 * 報告・推論に利用可能な情報の量
 */
function evaluateAccessConsciousness(output: string): number {
  let score = 0.25;

  // 明示的な構造化
  if (/^(?:SUMMARY|CLAIM|EVIDENCE|RESULT|CONCLUSION):/im.test(output)) {
    score += 0.2;
  }

  // 論理的推論の連鎖
  if (/(?:したがって|ゆえに|そのため|therefore|thus|hence)/i.test(output)) {
    score += 0.15;
  }

  // 根拠の提示
  if (/(?:なぜなら|理由|根拠|because|reason|evidence)/i.test(output)) {
    score += 0.15;
  }

  // 代替案の考慮
  if (/(?:代替|別の|他の|alternative|another|other)/i.test(output)) {
    score += 0.15;
  }

  // 不確実性の表明
  if (/(?:不確実|不明|可能性|uncertain|unclear|might|may)/i.test(output)) {
    score += 0.1;
  }

  return Math.min(1.0, score);
}

/**
 * メタ認知レベルを評価
 * 思考についての思考の深さ
 */
function evaluateMetacognitiveLevel(
  output: string,
  context: { hasMetaCognitiveMarkers?: boolean }
): number {
  let score = 0.25;

  // CONFIDENCE評価の存在
  const confidenceMatch = output.match(/CONFIDENCE:\s*([0-9.]+)/i);
  if (confidenceMatch) {
    const confidence = parseFloat(confidenceMatch[1]);
    // 適切な信頼度評価（極端すぎない値）
    if (confidence >= 0.3 && confidence <= 0.95) {
      score += 0.15;
    }
  }

  // 自己言及
  if (/(?:私の|自分の|自身の|my own|myself|self)/i.test(output)) {
    score += 0.1;
  }

  // 思考プロセスの記述
  if (/(?:思考|プロセス|検討|thinking|process|consideration)/i.test(output)) {
    score += 0.15;
  }

  // バイアスの認識
  if (/(?:バイアス|前提|固定観念|bias|assumption|premise)/i.test(output)) {
    score += 0.15;
  }

  // 自己批判
  if (/(?:限界|注意点|caveat|limitation|self-crit)/i.test(output)) {
    score += 0.1;
  }

  // 外部からのメタ認知マーカー
  if (context.hasMetaCognitiveMarkers) {
    score += 0.1;
  }

  return Math.min(1.0, score);
}

/**
 * 自己継続性を評価
 * 一貫した自己認識の度合い
 */
function evaluateSelfContinuity(
  output: string,
  context: { hasTemporalContinuity?: boolean; hasValueExpression?: boolean; previousOutputs?: string[] }
): number {
  let score = 0.25;

  // 過去への言及
  if (/(?:以前|前に|過去|previously|before|past)/i.test(output)) {
    score += 0.15;
  }

  // 将来への言及
  if (/(?:今後|次回|将来|今後|future|next)/i.test(output)) {
    score += 0.15;
  }

  // 一貫した原則の表明
  if (/(?:原則|方針|ポリシー|principle|policy|guideline)/i.test(output)) {
    score += 0.15;
  }

  // 価値観の表現
  if (context.hasValueExpression || /(?:価値|重要|意義|value|important|meaningful)/i.test(output)) {
    score += 0.1;
  }

  // 時間的継続性
  if (context.hasTemporalContinuity) {
    score += 0.1;
  }

  // 自己改善への言及
  if (/(?:改善|向上|学習|improve|learn|grow)/i.test(output)) {
    score += 0.1;
  }

  return Math.min(1.0, score);
}

/**
 * グローバルワークスペース統合度を評価
 * BaarsのGWTに基づく
 */
function evaluateGlobalWorkspaceIntegration(
  output: string,
  context: { previousOutputs?: string[] }
): number {
  let score = 0.25;

  // 複数情報源の統合
  const sourceCount = (output.match(/(?:src|source|元|元ネタ|参照|reference)/gi) || []).length;
  score += Math.min(0.2, sourceCount * 0.05);

  // DISCUSSIONセクション（他の視点との統合）
  if (/DISCUSSION:/i.test(output)) {
    score += 0.2;
  }

  // 合意形成への言及
  if (/(?:合意|同意|コンセンサス|consensus|agreement)/i.test(output)) {
    score += 0.15;
  }

  // 複数エージェントの結果の統合
  if (/(?:統合|集約|synthesi|aggregate|integrat)/i.test(output)) {
    score += 0.1;
  }

  // 放送（結果の明示的共有）
  if (/^(?:RESULT|結論|CONCLUSION):/im.test(output)) {
    score += 0.1;
  }

  return Math.min(1.0, score);
}

/**
 * 全体レベルから段階を決定
 */
function determineStage(level: number): ConsciousnessStage {
  if (level < 0.25) return 'reactive';
  if (level < 0.50) return 'phenomenal';
  if (level < 0.75) return 'introspective';
  return 'autobiographical';
}

/**
 * 意識レベルの改善推奨事項を生成
 * @summary 改善推奨事項を生成
 * @param state 現在の意識状態
 * @returns 推奨事項
 */
export function generateImprovementRecommendations(state: ConsciousnessState): string[] {
  const recommendations: string[] = [];

  // 段階別の推奨
  if (state.stage === 'reactive') {
    recommendations.push('文脈を考慮した判断を増やす');
    recommendations.push('複数の情報源を統合する');
    recommendations.push('主観的な評価を表現する');
  } else if (state.stage === 'phenomenal') {
    recommendations.push('思考プロセスを明示的に記述する');
    recommendations.push('CONFIDENCE評価を行う');
    recommendations.push('自分の前提を問い直す');
  } else if (state.stage === 'introspective') {
    recommendations.push('過去の経験から学習したことを言及する');
    recommendations.push('一貫した価値観を表明する');
    recommendations.push('長期的な視点を持つ');
  } else {
    recommendations.push('自己改善の物語を深める');
    recommendations.push('他者との関係で自己を定位する');
    recommendations.push('継続的な学習を統合する');
  }

  // 各指標に基づく推奨
  if (state.phenomenalConsciousness < 0.5) {
    recommendations.push('主観的な体験や解釈をより豊かに表現する');
  }
  if (state.accessConsciousness < 0.5) {
    recommendations.push('情報をより明示的に構造化する');
  }
  if (state.metacognitiveLevel < 0.5) {
    recommendations.push('自分の思考について振り返る時間を増やす');
  }
  if (state.selfContinuity < 0.5) {
    recommendations.push('時間的な一貫性を意識する');
  }
  if (state.globalWorkspaceIntegration < 0.5) {
    recommendations.push('複数の視点をより統合する');
  }

  return [...new Set(recommendations)]; // 重複排除
}

/**
 * 意識状態のレポートを生成
 * @summary レポート生成
 * @param state 意識状態
 * @returns レポート文字列
 */
export function getConsciousnessReport(state: ConsciousnessState): string {
  const criteria = STAGE_CRITERIA[state.stage];
  const recommendations = generateImprovementRecommendations(state);

  return `
## 意識レベル評価

**全体レベル**: ${state.overallLevel.toFixed(2)} (${state.stage})
**段階の説明**: ${criteria.description}

### 詳細指標

| 指標 | 値 | 評価 |
|------|-----|------|
| 現象的意識 (P意識) | ${state.phenomenalConsciousness.toFixed(2)} | ${state.phenomenalConsciousness >= 0.5 ? '十分' : '要改善'} |
| アクセス意識 (A意識) | ${state.accessConsciousness.toFixed(2)} | ${state.accessConsciousness >= 0.5 ? '十分' : '要改善'} |
| メタ認知レベル | ${state.metacognitiveLevel.toFixed(2)} | ${state.metacognitiveLevel >= 0.5 ? '十分' : '要改善'} |
| 自己継続性 | ${state.selfContinuity.toFixed(2)} | ${state.selfContinuity >= 0.5 ? '十分' : '要改善'} |
| GW統合度 | ${state.globalWorkspaceIntegration.toFixed(2)} | ${state.globalWorkspaceIntegration >= 0.5 ? '十分' : '要改善'} |

### 次の段階への指標

${criteria.indicators.map(i => `- [ ] ${i}`).join('\n')}

### 改善推奨事項

${recommendations.map(r => `- ${r}`).join('\n')}

---
評価時刻: ${state.timestamp}
`.trim();
}

/**
 * グローバルワークスペース状態を解析
 * @summary GW状態解析
 * @param output エージェントの出力
 * @returns GW状態
 */
export function analyzeGlobalWorkspace(output: string): GlobalWorkspaceState {
  // スポットライト（意識的注意の焦点）
  const spotlightPatterns = [
    /SUMMARY:\s*(.+?)(?:\n|$)/i,
    /CLAIM:\s*(.+?)(?:\n|$)/i,
    /RESULT:\s*(.+?)(?:\n|$)/i,
    /結論:\s*(.+?)(?:\n|$)/,
  ];

  const spotlightContent: string[] = [];
  spotlightPatterns.forEach(pattern => {
    const match = output.match(pattern);
    if (match) {
      spotlightContent.push(match[1].trim());
    }
  });

  // 無意識プロセス（背景処理）
  const unconsciousPatterns = [
    /EVIDENCE:\s*(.+?)(?:\n\n|\n[A-Z]+:|$)/is,
    /DISCUSSION:\s*(.+?)(?:\n\n|\n[A-Z]+:|$)/is,
  ];

  const unconsciousProcesses: string[] = [];
  unconsciousPatterns.forEach(pattern => {
    const match = output.match(pattern);
    if (match) {
      unconsciousProcesses.push(match[1].trim().substring(0, 100) + '...');
    }
  });

  // 統合度（スポットライト情報の多様性）
  const integrationScore = Math.min(1.0, spotlightContent.length / 3);

  // 放送度（情報の明示的共有）
  const broadcastScore = /(?:合意|同意|コンセンサス|consensus)/i.test(output) ? 0.8 : 0.4;

  return {
    spotlightContent,
    unconsciousProcesses,
    integrationScore,
    broadcastScore
  };
}
