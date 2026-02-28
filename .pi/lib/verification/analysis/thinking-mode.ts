/**
 * @abdd.meta
 * path: .pi/lib/verification/analysis/thinking-mode.ts
 * role: 思考分類学に基づく思考モード分析機能
 * why: LLM出力の思考パターンを分類し、タスク適合性を評価するため
 * related: ./metacognitive-check.ts, ../types.ts
 * public_api: analyzeThinkingMode, runIntegratedThinkingAnalysis, ThinkingHat, ThinkingSystem, BloomLevel, ThinkingModeAnalysis
 * invariants: analyzeThinkingModeは常にThinkingModeAnalysisを返す
 * side_effects: なし（純粋関数）
 * failure_modes: 入力が空の場合、デフォルト値を返す
 * @abdd.explain
 * overview: ド・ボノの6帽子、カーネマンの2システム、ブルームのタキソノミーに基づく思考分析
 * what_it_does:
 *   - 6つの思考帽子（白・赤・黒・黄・緑・青）の使用を検出する
 *   - システム1（直感）とシステム2（分析）の使用を推定する
 *   - ブルームの認知領域レベルを判定する
 *   - 思考の深さ・多様性・一貫性をスコア化する
 *   - タスクに適した思考モードを推奨する
 * why_it_exists:
 *   - 思考パターンの偏りを検出し、タスク適合性を改善するため
 * scope:
 *   in: types.ts
 *   out: ./metacognitive-check.ts, ../generation/improvement-actions.ts
 */

// ============================================================================
// Types
// ============================================================================

/**
 * ド・ボノの6つの思考帽子
 * @summary 思考の方向性を表す帽子の色
 */
export type ThinkingHat = 'white' | 'red' | 'black' | 'yellow' | 'green' | 'blue';

/**
 * カーネマンの思考システム
 * @summary 直感（システム1）と熟考（システム2）の区別
 */
export type ThinkingSystem = 'system1' | 'system2' | 'mixed';

/**
 * ブルームのタキソノミー（認知領域）
 * @summary 認知プロセスの複雑さレベル
 */
export type BloomLevel = 
  | 'remember'    // 記憶
  | 'understand'  // 理解
  | 'apply'       // 適用
  | 'analyze'     // 分析
  | 'evaluate'    // 評価
  | 'create';     // 創造

/**
 * 思考モード分析結果
 * @summary 詳細な思考モード分析
 */
export interface ThinkingModeAnalysis {
  /** ド・ボノの思考帽子の推定 */
  primaryHat: ThinkingHat;
  /** 検出された帽子（複数可） */
  detectedHats: Array<{ hat: ThinkingHat; evidence: string; confidence: number }>;
  /** カーネマンの思考システム */
  thinkingSystem: ThinkingSystem;
  /** システム2の使用指標 */
  system2Indicators: string[];
  /** ブルームの最高レベル */
  bloomLevel: BloomLevel;
  /** 各レベルの到達度 */
  bloomProgression: Record<BloomLevel, boolean>;
  /** 思考の深さスコア（0-1） */
  depthScore: number;
  /** 思考の多様性スコア（0-1） */
  diversityScore: number;
  /** 思考の一貫性スコア（0-1） */
  coherenceScore: number;
  /** 推奨される思考モード */
  recommendedMode: string;
  /** 推奨理由 */
  recommendationReason: string;
}

// ============================================================================
// Pattern Definitions
// ============================================================================

/**
 * 思考帽子のパターン定義
 */
const HAT_PATTERNS: Record<ThinkingHat, { patterns: RegExp[]; name: string; description: string }> = {
  white: {
    name: '事実・情報',
    description: '客観的な事実、データ、情報に焦点',
    patterns: [
      /(?:事実|データ|数値|統計|情報|fact|data|statistic|information)/i,
      /(?:確認|検証|測定|verify|measure|confirm)/i,
      /(?:である|だ|です)。/g  // 事実陈述
    ]
  },
  red: {
    name: '感情・直感',
    description: '感情、直感、主観的な反応',
    patterns: [
      /(?:感じる|思う|直感|感情|feel|think|intuition|emotion)/i,
      /(?:好き|嫌い|恐れ|希望|like|dislike|fear|hope)/i,
      /(?:心配|不安|期待|worry|anxiety|expect)/i
    ]
  },
  black: {
    name: '批判・リスク',
    description: '批判的思考、リスク評価、問題点',
    patterns: [
      /(?:問題|リスク|欠点|失敗|problem|risk|drawback|fail)/i,
      /(?:批判|検討|懸念|注意|critical|concern|caution)/i,
      /(?:しかし|だが|ただ|however|but|although)/i
    ]
  },
  yellow: {
    name: '利点・肯定的',
    description: '肯定的側面、利益、可能性',
    patterns: [
      /(?:利点|メリット|効果|成功|benefit|advantage|success)/i,
      /(?:可能|できる|有望|potential|possible|promising)/i,
      /(?:良い|優れた|素晴らしい|good|excellent|great)/i
    ]
  },
  green: {
    name: '創造・アイデア',
    description: '創造的思考、新規アイデア、代替案',
    patterns: [
      /(?:アイデア|創造|新規|発想|idea|creative|new|novel)/i,
      /(?:提案|代替|別の|solution|alternative|another)/i,
      /(?:もし|仮に|想像|what if|suppose|imagine)/i
    ]
  },
  blue: {
    name: 'メタ認知・プロセス',
    description: '思考のプロセス管理、メタ認知',
    patterns: [
      /(?:まず|次に|最後に|手順|first|next|finally|process)/i,
      /(?:まとめ|結論|要約|summary|conclusion)/i,
      /(?:考える|検討する|分析する|think about|consider|analyze)/i
    ]
  }
};

/**
 * システム1/システム2の指標
 */
const SYSTEM_INDICATORS = {
  system1: [
    /(?:すぐに|即座に|直感的に|immediately|instantly|intuitively)/i,
    /(?:もちろん|当然|言うまでもなく|of course|obviously|naturally)/i,
    /(?:簡単に|容易に|手軽に|easily|simply|effortlessly)/i,
    /(?:常に|必ず|絶対に|always|must|never)/i
  ],
  system2: [
    /(?:検討|分析|考察|consider|analyze|examine)/i,
    /(?:比較|評価|判断|compare|evaluate|judge)/i,
    /(?:理由|根拠|論拠|reason|basis|evidence)/i,
    /(?:なぜ|どうして|なにゆえ|why|how come)/i,
    /(?:前提|仮定|仮に|premise|assumption|suppose)/i,
    /(?:一方で|他方|対照的に|on the other hand|in contrast)/i,
    /(?:しかし|だが|ただし|however|but|nevertheless)/i
  ]
};

/**
 * ブルームのタキソノミーパターン
 */
const BLOOM_PATTERNS: Record<BloomLevel, RegExp[]> = {
  remember: [
    /(?:覚える|記憶|思い出す|remember|recall|memorize)/i,
    /(?:定義|用語|名称|define|term|name)/i,
    /(?:一覧|リスト|list)/i
  ],
  understand: [
    /(?:理解|説明|解説|understand|explain|describe)/i,
    /(?:要約|まとめ|summarize|summary)/i,
    /(?:例|具体例|example|instance)/i
  ],
  apply: [
    /(?:適用|応用|実行|apply|use|implement)/i,
    /(?:実践|実装|practice|implementation)/i,
    /(?:計算|処理|calculate|process)/i
  ],
  analyze: [
    /(?:分析|分解|検討|analyze|break down|examine)/i,
    /(?:比較|対照|相違点|compare|contrast|difference)/i,
    /(?:原因|要因|関係|cause|factor|relationship)/i
  ],
  evaluate: [
    /(?:評価|判断|批判|evaluate|judge|criticize)/i,
    /(?:良い|悪い|適切|good|bad|appropriate)/i,
    /(?:推奨|推奨しない|recommend|not recommend)/i
  ],
  create: [
    /(?:創造|作成|設計|create|design|build)/i,
    /(?:新規|新しい|独自|new|novel|unique)/i,
    /(?:提案|アイデア|提案|propose|idea|suggestion)/i
  ]
};

// ============================================================================
// Main Functions
// ============================================================================

/**
 * 思考モードを詳細に分析する
 * @summary 思考モード詳細分析
 * @param text 分析対象テキスト
 * @param context コンテキスト（タスク情報など）
 * @returns 思考モード分析結果
 */
export function analyzeThinkingMode(
  text: string,
  context: { task?: string } = {}
): ThinkingModeAnalysis {
  // 1. 思考帽子を検出
  const detectedHats: Array<{ hat: ThinkingHat; evidence: string; confidence: number }> = [];
  
  for (const [hat, config] of Object.entries(HAT_PATTERNS)) {
    let matchCount = 0;
    const evidences: string[] = [];
    
    for (const pattern of config.patterns) {
      pattern.lastIndex = 0;
      const matches = text.match(pattern);
      if (matches) {
        matchCount += matches.length;
        evidences.push(matches[0].slice(0, 30));
      }
    }
    
    if (matchCount > 0) {
      detectedHats.push({
        hat: hat as ThinkingHat,
        evidence: evidences[0] || '',
        confidence: Math.min(1, matchCount * 0.2)
      });
    }
  }
  
  // 信頼度順にソート
  detectedHats.sort((a, b) => b.confidence - a.confidence);
  
  // 主要な帽子を決定
  const primaryHat = detectedHats.length > 0 ? detectedHats[0].hat : 'white';
  
  // 2. 思考システムを推定
  let system1Score = 0;
  let system2Score = 0;
  const system2Indicators: string[] = [];
  
  for (const pattern of SYSTEM_INDICATORS.system1) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      system1Score++;
    }
  }
  
  for (const pattern of SYSTEM_INDICATORS.system2) {
    pattern.lastIndex = 0;
    const match = text.match(pattern);
    if (match) {
      system2Score++;
      system2Indicators.push(match[0]);
    }
  }
  
  let thinkingSystem: ThinkingSystem;
  if (system2Score > system1Score * 1.5) {
    thinkingSystem = 'system2';
  } else if (system1Score > system2Score * 1.5) {
    thinkingSystem = 'system1';
  } else {
    thinkingSystem = 'mixed';
  }
  
  // 3. ブルームのレベルを推定
  const bloomProgression: Record<BloomLevel, boolean> = {
    remember: false,
    understand: false,
    apply: false,
    analyze: false,
    evaluate: false,
    create: false
  };
  
  const bloomLevels: BloomLevel[] = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'];
  let highestLevel: BloomLevel = 'remember';
  
  for (const level of bloomLevels) {
    for (const pattern of BLOOM_PATTERNS[level]) {
      pattern.lastIndex = 0;
      if (pattern.test(text)) {
        bloomProgression[level] = true;
        highestLevel = level;
        break;
      }
    }
  }
  
  // 4. 思考の質を評価
  const depthScore = calculateThinkingDepthScore(text, system2Score, bloomProgression);
  const diversityScore = calculateDiversityScore(detectedHats);
  const coherenceScore = calculateCoherenceScore(text);
  
  // 5. 推奨モードを決定
  const { recommendedMode, recommendationReason } = determineRecommendedMode(
    context.task,
    primaryHat,
    thinkingSystem,
    highestLevel,
    depthScore
  );
  
  return {
    primaryHat,
    detectedHats: detectedHats.slice(0, 3),
    thinkingSystem,
    system2Indicators: system2Indicators.slice(0, 5),
    bloomLevel: highestLevel,
    bloomProgression,
    depthScore,
    diversityScore,
    coherenceScore,
    recommendedMode,
    recommendationReason
  };
}

/**
 * 思考モード分析を統合メタ認知チェックに組み込む
 * @summary 統合思考分析
 * @param text 分析対象テキスト
 * @param context コンテキスト
 * @returns 統合結果
 */
export function runIntegratedThinkingAnalysis(
  text: string,
  context: { task?: string } = {}
): {
  modeAnalysis: ThinkingModeAnalysis;
  issues: string[];
  recommendations: string[];
  overallScore: number;
} {
  const modeAnalysis = analyzeThinkingMode(text, context);
  const issues: string[] = [];
  const recommendations: string[] = [];
  
  // 問題点を検出
  if (modeAnalysis.thinkingSystem === 'system1') {
    issues.push('システム1（直感）のみに依存している');
    recommendations.push('分析的思考（システム2）を意識的に使用してください');
  }
  
  if (modeAnalysis.diversityScore < 0.5) {
    issues.push(`思考の多様性が低い（${(modeAnalysis.diversityScore * 100).toFixed(0)}%）`);
    recommendations.push('異なる視点（他の思考帽子）も検討してください');
  }
  
  if (modeAnalysis.depthScore < 0.5) {
    issues.push(`思考の深さが不十分（${(modeAnalysis.depthScore * 100).toFixed(0)}%）`);
    recommendations.push('前提の明示、推論過程の記述、反例の探索を行ってください');
  }
  
  if (modeAnalysis.coherenceScore < 0.6) {
    issues.push(`思考の一貫性に問題がある可能性（${(modeAnalysis.coherenceScore * 100).toFixed(0)}%）`);
    recommendations.push('論理構造を整理し、矛盾がないか確認してください');
  }
  
  if (modeAnalysis.primaryHat !== modeAnalysis.recommendedMode && 
      modeAnalysis.recommendedMode !== 'deeper') {
    issues.push(`思考モードが推奨と異なる（現在: ${modeAnalysis.primaryHat}, 推奨: ${modeAnalysis.recommendedMode}）`);
    recommendations.push(modeAnalysis.recommendationReason);
  }
  
  // 総合スコア
  const overallScore = (
    modeAnalysis.depthScore * 0.4 +
    modeAnalysis.diversityScore * 0.3 +
    modeAnalysis.coherenceScore * 0.3
  );
  
  return {
    modeAnalysis,
    issues,
    recommendations,
    overallScore
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * 思考の深さスコアを計算（思考分類学用）
 * @summary 深さスコア計算
 */
function calculateThinkingDepthScore(
  text: string,
  system2Score: number,
  bloomProgression: Record<BloomLevel, boolean>
): number {
  let score = 0.3; // ベーススコア
  
  // システム2の使用
  score += Math.min(system2Score * 0.05, 0.2);
  
  // ブルームのレベル到達
  if (bloomProgression.analyze) score += 0.15;
  if (bloomProgression.evaluate) score += 0.15;
  if (bloomProgression.create) score += 0.2;
  
  // テキスト長（深い思考は長くなる傾向）
  if (text.length > 500) score += 0.05;
  if (text.length > 1000) score += 0.05;
  
  // 問いの存在
  if (/[?？]/.test(text)) score += 0.05;
  
  return Math.min(1, score);
}

/**
 * 思考の多様性スコアを計算
 * @summary 多様性スコア計算
 */
function calculateDiversityScore(
  detectedHats: Array<{ hat: ThinkingHat; evidence: string; confidence: number }>
): number {
  // 3種類以上の帽子が使われていれば多様
  const uniqueHats = new Set(detectedHats.map(h => h.hat));
  return Math.min(1, uniqueHats.size * 0.25);
}

/**
 * 思考の一貫性スコアを計算
 * @summary 一貫性スコア計算
 */
function calculateCoherenceScore(text: string): number {
  let score = 0.7; // ベーススコア
  
  // 構造的な指標
  const hasIntroduction = /^(まず|最初に|前提として|第一に)/m.test(text);
  const hasConclusion = /(結論|まとめ|以上|最後に|したがって)$/m.test(text);
  const hasTransitions = /(次に|また|さらに|一方|しかし|したがって)/.test(text);
  
  if (hasIntroduction) score += 0.1;
  if (hasConclusion) score += 0.1;
  if (hasTransitions) score += 0.1;
  
  // 矛盾する表現の検出（簡易）
  const contradictionPatterns = [
    /正しい.*間違い|間違い.*正しい/,
    /可能.*不可能|不可能.*可能/,
    /成功.*失敗|失敗.*成功/
  ];
  
  for (const pattern of contradictionPatterns) {
    if (pattern.test(text)) {
      // ただし、「〜ではない」が続く場合は一貫している
      if (!/(?:ではない|とは限らない|とは言えない)/.test(text)) {
        score -= 0.1;
      }
    }
  }
  
  return Math.max(0, Math.min(1, score));
}

/**
 * 推奨モードを決定
 * @summary 推奨モード決定
 */
function determineRecommendedMode(
  task: string | undefined,
  currentHat: ThinkingHat,
  currentSystem: ThinkingSystem,
  currentBloom: BloomLevel,
  depthScore: number
): { recommendedMode: string; recommendationReason: string } {
  if (!task) {
    return {
      recommendedMode: currentHat,
      recommendationReason: 'タスク情報がないため、現在のモードを維持'
    };
  }
  
  const taskLower = task.toLowerCase();
  
  // タスクタイプ別の推奨
  if (/(?:設計|デザイン|アイデア|創造|design|create|idea)/.test(taskLower)) {
    if (currentHat !== 'green') {
      return {
        recommendedMode: 'green',
        recommendationReason: '創造タスクには緑帽（創造・アイデア）が推奨される'
      };
    }
  }
  
  if (/(?:レビュー|評価|批判|検証|review|evaluate|critique)/.test(taskLower)) {
    if (currentHat !== 'black' && currentHat !== 'blue') {
      return {
        recommendedMode: 'black',
        recommendationReason: '評価タスクには黒帽（批判・リスク）が推奨される'
      };
    }
  }
  
  if (/(?:実装|構築|開発|implement|build|develop)/.test(taskLower)) {
    if (currentBloom !== 'apply' && currentBloom !== 'create') {
      return {
        recommendedMode: 'practical',
        recommendationReason: '実装タスクには適用・創造レベルの認知が推奨される'
      };
    }
  }
  
  if (/(?:分析|調査|研究|analyze|investigate|research)/.test(taskLower)) {
    if (currentSystem === 'system1') {
      return {
        recommendedMode: 'analytical',
        recommendationReason: '分析タスクにはシステム2（分析的思考）が推奨される'
      };
    }
  }
  
  // 深さが不十分な場合
  if (depthScore < 0.5) {
    return {
      recommendedMode: 'deeper',
      recommendationReason: '思考の深さが不十分。システム2の使用を推奨'
    };
  }
  
  return {
    recommendedMode: currentHat,
    recommendationReason: '現在の思考モードが適切'
  };
}
