/**
 * @abdd.meta
 * path: .pi/lib/thinking-process.ts
 * role: 思考プロセスの状態管理と型定義モジュール
 * why: 多角的な思考アプローチと問題解決プロセスの段階的進行を型安全に管理するため
 * related: .pi/lib/agent.ts, .pi/lib/memory.ts
 * public_api: ThinkingMode, ThinkingPhase, ThinkingContext, ThinkingStep, ThinkDeeperOptions
 * invariants: phaseはPHASE_ORDERに従って進行する, confidenceは0から1の範囲である
 * side_effects: なし（純粋な型定義と定数のエクスポート）
 * failure_modes: 不正なモード遷移の定義, 深度や閾値の範囲外指定
 * @abdd.explain
 * overview: ド・ボノの思考帽とブルームの分類学に基づき、思考モードとプロセスの構造を定義する
 * what_it_does:
 *   - 6種の思考モードと4種の思考フェーズを定義する
 *   - 思考の履歴と現在の状態を保持するインターフェースを提供する
 *   - モード切り替えや深化処理のための設定と定数を管理する
 * why_it_exists:
 *   - AIの思考プロセスを多角的かつ段階的に制御する構造が必要なため
 *   - 思考の多様性と論理的な進行を保証するため
 * scope:
 *   in: なし
 *   out: 思考プロセスに関連するすべての型と定数
 */

/**
 * 思考モード型定義
 * ド・ボノの「6つの思考帽」とブルームの分類学に基づく
 * @summary 思考モードを表す型
 */
export type ThinkingMode =
  | 'creative'    // 創造的：新規性追求、発散的思考
  | 'analytical'  // 分析的：論理分解、収束的思考
  | 'critical'    // 批判的：前提疑念、反例探索
  | 'practical'   // 実践的：実現可能性、効率重視
  | 'social'      // 社会的：他者視点、合意形成
  | 'emotional';  // 情感的：共感、倫理配慮

/**
 * 思考フェーズ型定義
 * 問題解決プロセスの段階
 * @summary 思考フェーズを表す型
 */
export type ThinkingPhase =
  | 'problem-discovery'     // 問題発見
  | 'problem-formulation'   // 問題形成
  | 'strategy-development'  // 戦略開発
  | 'solution-evaluation';  // 解の評価

/**
 * 思考コンテキスト
 * @summary 思考プロセスの現在の状態を表す
 * @param task タスク内容
 * @param phase 現在の思考フェーズ
 * @param currentMode 現在の思考モード
 * @param history これまでの思考ステップ履歴
 * @param constraints 制約条件のリスト
 */
export interface ThinkingContext {
  task: string;
  phase: ThinkingPhase;
  currentMode: ThinkingMode;
  history: ThinkingStep[];
  constraints: string[];
}

/**
 * 思考ステップ
 * @summary 単一の思考ステップを表す
 * @param mode 使用された思考モード
 * @param phase その時点のフェーズ
 * @param thought 思考内容
 * @param confidence その時点での信頼度（0-1）
 * @param timestamp タイムスタンプ
 */
export interface ThinkingStep {
  mode: ThinkingMode;
  phase: ThinkingPhase;
  thought: string;
  confidence: number;
  timestamp: Date;
}

/**
 * 思考深化オプション
 * @summary thinkDeeper関数の設定オプション
 * @param targetDepth 目標深度（1-5）
 * @param enableModeSwitch モード切り替え許可
 * @param maxIterations 最大反復回数
 * @param stagnationThreshold 停滞検出閾値
 */
export interface ThinkDeeperOptions {
  targetDepth: number;
  enableModeSwitch: boolean;
  maxIterations: number;
  stagnationThreshold: number;
}

/**
 * 思考モードの日本語説明
 */
const THINKING_MODE_DESCRIPTIONS: Record<ThinkingMode, string> = {
  creative: '新規性を追求し、発散的にアイデアを生成する',
  analytical: '論理的に分解し、収束的に分析する',
  critical: '前提を疑い、反例を探索する',
  practical: '実現可能性と効率を重視する',
  social: '他者の視点を考慮し、合意形成を図る',
  emotional: '共感と倫理的配慮を重視する'
};

/**
 * 思考フェーズの日本語説明
 */
const THINKING_PHASE_DESCRIPTIONS: Record<ThinkingPhase, string> = {
  'problem-discovery': '問題を発見し、認識する',
  'problem-formulation': '問題を明確に定式化する',
  'strategy-development': '解決戦略を開発する',
  'solution-evaluation': '解を評価し、検証する'
};

/**
 * フェーズ遷移の順序
 */
const PHASE_ORDER: ThinkingPhase[] = [
  'problem-discovery',
  'problem-formulation',
  'strategy-development',
  'solution-evaluation'
];

/**
 * 思考モードの遷移マップ（停滞時の切り替え用）
 */
const MODE_TRANSITIONS: Record<ThinkingMode, ThinkingMode> = {
  'creative': 'analytical',
  'analytical': 'critical',
  'critical': 'practical',
  'practical': 'creative',
  'social': 'critical',
  'emotional': 'analytical'
};

/**
 * @summary 状況に応じた思考モードを選択する
 * @param context 思考コンテキスト（部分的で可）
 * @returns 推奨される思考モード
 */
export function selectThinkingMode(context: Partial<ThinkingContext>): ThinkingMode {
  // フェーズに基づくデフォルトモード
  const phaseDefaults: Record<ThinkingPhase, ThinkingMode> = {
    'problem-discovery': 'creative',
    'problem-formulation': 'analytical',
    'strategy-development': 'practical',
    'solution-evaluation': 'critical'
  };

  if (context.phase) {
    return phaseDefaults[context.phase];
  }

  // タスク特性に基づく選択
  if (context.task) {
    const taskLower = context.task.toLowerCase();

    if (taskLower.includes('設計') || taskLower.includes('デザイン') || taskLower.includes('企画')) {
      return 'creative';
    }
    if (taskLower.includes('分析') || taskLower.includes('調査') || taskLower.includes('検討')) {
      return 'analytical';
    }
    if (taskLower.includes('レビュー') || taskLower.includes('評価') || taskLower.includes('検証')) {
      return 'critical';
    }
    if (taskLower.includes('実装') || taskLower.includes('修正') || taskLower.includes('開発')) {
      return 'practical';
    }
    if (taskLower.includes('合意') || taskLower.includes('協議') || taskLower.includes('調整')) {
      return 'social';
    }
    if (taskLower.includes('倫理') || taskLower.includes('配慮') || taskLower.includes('配分')) {
      return 'emotional';
    }
  }

  // 履歴に基づく選択（モードの多様性を確保）
  if (context.history && context.history.length > 0) {
    const recentModes = context.history.slice(-3).map(h => h.mode);
    const modeCounts = new Map<ThinkingMode, number>();

    recentModes.forEach(mode => {
      modeCounts.set(mode, (modeCounts.get(mode) || 0) + 1);
    });

    // 使用頻度の低いモードを選択
    const allModes: ThinkingMode[] = ['creative', 'analytical', 'critical', 'practical', 'social', 'emotional'];
    const leastUsed = allModes.reduce((a, b) => {
      const countA = modeCounts.get(a) || 0;
      const countB = modeCounts.get(b) || 0;
      return countA < countB ? a : b;
    });

    // あまりにも最近使っていないモードがあればそれを選択
    if ((modeCounts.get(leastUsed) || 0) < 2) {
      return leastUsed;
    }
  }

  return 'analytical'; // デフォルト
}

/**
 * @summary 次の思考フェーズに進む
 * @param currentPhase 現在のフェーズ
 * @returns 次のフェーズ（最終フェーズの場合は同じフェーズを返す）
 */
export function advancePhase(currentPhase: ThinkingPhase): ThinkingPhase {
  const currentIndex = PHASE_ORDER.indexOf(currentPhase);
  if (currentIndex < PHASE_ORDER.length - 1) {
    return PHASE_ORDER[currentIndex + 1];
  }
  return currentPhase;
}

/**
 * @summary 段階的に思考を深化させる
 * @param initialThought 初期思考内容
 * @param context 思考コンテキスト
 * @param options 深化オプション
 * @returns 深化された思考ステップの配列
 */
export function thinkDeeper(
  initialThought: string,
  context: ThinkingContext,
  options: Partial<ThinkDeeperOptions> = {}
): ThinkingStep[] {
  const opts: ThinkDeeperOptions = {
    targetDepth: 3,
    enableModeSwitch: true,
    maxIterations: 10,
    stagnationThreshold: 0.1,
    ...options
  };

  // 目標深度を1-5の範囲に制限
  opts.targetDepth = Math.max(1, Math.min(5, opts.targetDepth));

  const steps: ThinkingStep[] = [];
  let currentThought = initialThought;
  let currentMode = context.currentMode;
  let previousConfidence = 0;

  for (let i = 0; i < opts.targetDepth && i < opts.maxIterations; i++) {
    // 信頼度を推定
    const currentConfidence = estimateConfidence(currentThought, i);

    // 停滞検出
    if (i > 0 && Math.abs(currentConfidence - previousConfidence) < opts.stagnationThreshold) {
      if (opts.enableModeSwitch) {
        currentMode = switchModeOnStagnation(currentMode);
      }
    }

    // 思考ステップを記録
    steps.push({
      mode: currentMode,
      phase: context.phase,
      thought: currentThought,
      confidence: currentConfidence,
      timestamp: new Date()
    });

    // 次の深さレベルへ
    currentThought = deepenThought(currentThought, currentMode, i + 1);
    previousConfidence = currentConfidence;
  }

  return steps;
}

/**
 * @summary 思考モードの説明を取得
 * @param mode 思考モード
 * @returns モードの説明
 */
export function getThinkingModeDescription(mode: ThinkingMode): string {
  return THINKING_MODE_DESCRIPTIONS[mode];
}

/**
 * @summary 思考フェーズの説明を取得
 * @param phase 思考フェーズ
 * @returns フェーズの説明
 */
export function getThinkingPhaseDescription(phase: ThinkingPhase): string {
  return THINKING_PHASE_DESCRIPTIONS[phase];
}

/**
 * @summary 思考コンテキストを作成
 * @param task タスク内容
 * @param options オプション設定
 * @returns 初期化された思考コンテキスト
 */
export function createThinkingContext(
  task: string,
  options: {
    phase?: ThinkingPhase;
    mode?: ThinkingMode;
    constraints?: string[];
  } = {}
): ThinkingContext {
  const phase = options.phase || 'problem-discovery';
  const mode = options.mode || selectThinkingMode({ task, phase });

  return {
    task,
    phase,
    currentMode: mode,
    history: [],
    constraints: options.constraints || []
  };
}

/**
 * @summary 思考ステップをコンテキストに追加
 * @param context 思考コンテキスト
 * @param thought 思考内容
 * @param confidence 信頼度
 * @returns 更新されたコンテキスト
 */
export function addThinkingStep(
  context: ThinkingContext,
  thought: string,
  confidence: number = 0.5
): ThinkingContext {
  const step: ThinkingStep = {
    mode: context.currentMode,
    phase: context.phase,
    thought,
    confidence: Math.max(0, Math.min(1, confidence)),
    timestamp: new Date()
  };

  return {
    ...context,
    history: [...context.history, step]
  };
}

/**
 * @summary 思考モードを切り替え
 * @param context 思考コンテキスト
 * @param newMode 新しい思考モード
 * @returns 更新されたコンテキスト
 */
export function switchThinkingMode(
  context: ThinkingContext,
  newMode: ThinkingMode
): ThinkingContext {
  return {
    ...context,
    currentMode: newMode
  };
}

/**
 * @summary 思考履歴から信頼度の推移を分析
 * @param history 思考ステップの履歴
 * @returns 信頼度分析結果
 */
export function analyzeConfidenceTrend(history: ThinkingStep[]): {
  trend: 'improving' | 'declining' | 'stable';
  averageConfidence: number;
  maxConfidence: number;
  minConfidence: number;
} {
  if (history.length === 0) {
    return {
      trend: 'stable',
      averageConfidence: 0,
      maxConfidence: 0,
      minConfidence: 0
    };
  }

  const confidences = history.map(h => h.confidence);
  const averageConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
  const maxConfidence = Math.max(...confidences);
  const minConfidence = Math.min(...confidences);

  // 傾向を判定（最後の3ステップと最初の3ステップを比較）
  let trend: 'improving' | 'declining' | 'stable' = 'stable';
  if (history.length >= 3) {
    const recent = history.slice(-3).reduce((a, b) => a + b.confidence, 0) / 3;
    const earlier = history.slice(0, 3).reduce((a, b) => a + b.confidence, 0) / 3;

    if (recent > earlier + 0.1) {
      trend = 'improving';
    } else if (recent < earlier - 0.1) {
      trend = 'declining';
    }
  }

  return {
    trend,
    averageConfidence,
    maxConfidence,
    minConfidence
  };
}

// ===== ヘルパー関数（内部使用）=====

/**
 * 思考の信頼度を推定
 * @param thought 思考内容
 * @param depth 現在の深さ
 * @returns 推定信頼度（0-1）
 */
function estimateConfidence(thought: string, depth: number): number {
  // 思考の長さに基づくスコア（適度な長さが良い）
  const lengthScore = Math.min(thought.length / 300, 1) * 0.2;

  // 深度に基づくスコア（深いほど良いが、限界あり）
  const depthScore = Math.min(depth / 5, 1) * 0.3;

  // 品質キーワードのスコア
  const keywordScore = countQualityKeywords(thought) * 0.05;

  // 構造化のスコア（改行や箇条書きの存在）
  const structureScore = thought.includes('\n') ? 0.1 : 0;

  // 不確実性キーワードのスコア（適度な不確実性の認識は良い）
  const uncertaintyScore = countUncertaintyKeywords(thought) * 0.02;

  // 高信頼度キーワードのペナルティ（過信を避ける）
  const overconfidencePenalty = countOverconfidenceKeywords(thought) * 0.05;

  const totalScore = lengthScore + depthScore + keywordScore + structureScore + uncertaintyScore - overconfidencePenalty;

  return Math.max(0, Math.min(1, totalScore + 0.3)); // ベースライン0.3
}

/**
 * 品質キーワードをカウント
 */
function countQualityKeywords(thought: string): number {
  const keywords = [
    'なぜ', 'どう', 'ただし', '一方', 'したがって',
    '反例', '前提', '結論', '証拠', '根拠',
    '代替', '可能性', '制約', '境界', '条件'
  ];
  return keywords.filter(k => thought.includes(k)).length;
}

/**
 * 不確実性キーワードをカウント
 */
function countUncertaintyKeywords(thought: string): number {
  const keywords = ['かもしれない', '可能性', '不確実', '限界', '注意点'];
  return keywords.filter(k => thought.includes(k)).length;
}

/**
 * 過信キーワードをカウント
 */
function countOverconfidenceKeywords(thought: string): number {
  const keywords = ['間違いなく', '絶対に', '必ず', '確実に', '当然'];
  return keywords.filter(k => thought.includes(k)).length;
}

/**
 * 停滞時にモードを切り替え
 */
function switchModeOnStagnation(currentMode: ThinkingMode): ThinkingMode {
  return MODE_TRANSITIONS[currentMode];
}

/**
 * 思考を深化させる
 */
function deepenThought(thought: string, mode: ThinkingMode, depth: number): string {
  const prompts: Record<ThinkingMode, string> = {
    'creative': `[深さ${depth}] この考えに対して、まったく異なるアプローチは何か？ 既存の前提を覆すような視点はないか？`,
    'analytical': `[深さ${depth}] この考えを構成する要素は何か？ それぞれの要素は正しいか？ 論理的な飛躍はないか？`,
    'critical': `[深さ${depth}] この考えに対する反例や反論は何か？ どのような条件でこの考えは成り立たなくなるか？`,
    'practical': `[深さ${depth}] この考えをどう実現するか？ 障害は何か？ リソースと制約を考慮した実現可能性は？`,
    'social': `[深さ${depth}] 他のステークホルダーはこれをどう見るか？ 異なる立場からの意見や懸念は？`,
    'emotional': `[深さ${depth}] この考えは誰にどのような感情をもたらすか？ 倫理的な配慮すべき点は？`
  };
  return `${thought}\n\n${prompts[mode]}`;
}

/**
 * @summary すべての思考モードを取得
 * @returns 思考モードの配列
 */
export function getAllThinkingModes(): ThinkingMode[] {
  return ['creative', 'analytical', 'critical', 'practical', 'social', 'emotional'];
}

/**
 * @summary すべての思考フェーズを取得
 * @returns 思考フェーズの配列
 */
export function getAllThinkingPhases(): ThinkingPhase[] {
  return [...PHASE_ORDER];
}

/**
 * @summary 思考モードとフェーズの組み合わせの推奨度を取得
 * @param mode 思考モード
 * @param phase 思考フェーズ
 * @returns 推奨度（0-1）
 */
export function getModePhaseCompatibility(mode: ThinkingMode, phase: ThinkingPhase): number {
  const compatibility: Record<ThinkingPhase, Record<ThinkingMode, number>> = {
    'problem-discovery': {
      'creative': 0.9,
      'analytical': 0.5,
      'critical': 0.3,
      'practical': 0.4,
      'social': 0.6,
      'emotional': 0.5
    },
    'problem-formulation': {
      'creative': 0.6,
      'analytical': 0.9,
      'critical': 0.5,
      'practical': 0.5,
      'social': 0.4,
      'emotional': 0.3
    },
    'strategy-development': {
      'creative': 0.7,
      'analytical': 0.6,
      'critical': 0.5,
      'practical': 0.9,
      'social': 0.6,
      'emotional': 0.4
    },
    'solution-evaluation': {
      'creative': 0.4,
      'analytical': 0.7,
      'critical': 0.9,
      'practical': 0.6,
      'social': 0.7,
      'emotional': 0.6
    }
  };

  return compatibility[phase][mode];
}
