/**
 * @abdd.meta
 * path: .pi/lib/long-running-support.ts
 * role: 長時間実行される思考セッションのライフサイクル、状態管理、および停滞打破（創造的攪乱）を担当するモジュール
 * why: 単一のタスクに対して長時間にわたり思考プロセスを続ける際、ループや停滞を防ぎ、効率的に解に至るための仕組みが必要なため
 * related: ./thinking-process.ts, ./session-store.ts
 * public_api: manageThinkingSession, ThinkingSession, StagnationCheck, CreativeDisruption, SessionManager
 * invariants: session.lastUpdateTimeは更新時常に最新時刻になる、session.historyは思考順序を保持する、stagnationCountは0以上の整数
 * side_effects: generateSessionIdによるID生成、セッション状態の更新履歴の保持、攪乱によるモードやフェーズの変更
 * failure_modes: 無限ループによるリソース枯渇、stagnationThreshold設定値による過剰な攪乱または検出漏れ、ID衝突
 * @abdd.explain
 * overview: 思考プロセスの進行状況を追跡し、停滞を検出した場合は「創造的攪乱」を注入して解決策の探索を継続させるセッションマネージャーを提供する。
 * what_it_does:
 *   - 思考セッションの初期化および状態（ID, 時刻, フェーズ, 履歴）の管理
 *   - 思考ステップの追加と最終更新時刻の記録
 *   - 停滞検出ロジック（重複、進捗なしなど）の実行と判定
 *   - モード切り替えやランダムな注入による停滞の打破
 *   - セッションの完了およびサマリの生成
 * why_it_exists:
 *   - 長時間の思考処理において、特定の思考モードやフェーズに固執することを防ぐため
 *   - 探索の多様性を保ちながら一貫したセッション管理を行うため
 * scope:
 *   in: タスク内容文字列、初期設定（フェーズ、モード、閾値）、思考ステップ履歴
 *   out: 更新されたセッション状態、停滞判定結果、生成された攪乱内容、セッションサマリ文字列
 */

import { ThinkingMode, ThinkingPhase, ThinkingStep, selectThinkingMode } from './thinking-process';

/**
 * 思考セッション
 * @summary 長時間の思考セッションを管理するデータ構造
 * @param id セッションの一意識別子
 * @param task タスク内容
 * @param startTime セッション開始時刻
 * @param lastUpdateTime 最終更新時刻
 * @param currentPhase 現在の思考フェーズ
 * @param currentMode 現在の思考モード
 * @param history 思考ステップの履歴
 * @param stagnationCount 停滞検出回数
 * @param disruptionHistory 攪乱履歴
 * @param status セッション状態
 */
export interface ThinkingSession {
  id: string;
  task: string;
  startTime: Date;
  lastUpdateTime: Date;
  currentPhase: ThinkingPhase;
  currentMode: ThinkingMode;
  history: ThinkingStep[];
  stagnationCount: number;
  disruptionHistory: CreativeDisruption[];
  status: 'active' | 'stagnant' | 'disrupted' | 'completed';
}

/**
 * 創造的攪乱
 * @summary 思考の停滞を打破するための介入
 * @param timestamp 攪乱実行時刻
 * @param type 攪乱タイプ
 * @param content 攪乱内容
 * @param result 攪乱の結果
 */
export interface CreativeDisruption {
  timestamp: Date;
  type: 'mode-switch' | 'assumption-challenge' | 'analogy' | 'random-injection';
  content: string;
  result: 'productive' | 'neutral' | 'counterproductive';
}

/**
 * 停滞検出結果
 * @summary 思考の停滞状態の分析結果
 * @param isStagnant 停滞しているかどうか
 * @param stagnationType 停滞タイプ
 * @param evidence 停滞の根拠
 * @param recommendedAction 推奨アクション
 */
export interface StagnationCheck {
  isStagnant: boolean;
  stagnationType: 'repetition' | 'low-progress' | 'mode-fixation' | 'confidence-plateau';
  evidence: string;
  recommendedAction: string;
}

/**
 * 攪乱戦略
 * @summary 攪乱のトリガー条件と生成方法を定義
 */
export interface DisruptionStrategy {
  type: CreativeDisruption['type'];
  description: string;
  trigger: (session: ThinkingSession) => boolean;
  generate: (session: ThinkingSession) => string;
}

/**
 * セッション管理オプション
 * @summary manageThinkingSession関数の設定
 * @param initialPhase 初期フェーズ
 * @param initialMode 初期モード
 * @param stagnationThreshold 停滞判定閾値
 * @param maxStagnationCount 最大停滞許容回数
 * @param autoDisruption 自動攪乱の有無
 */
export interface SessionOptions {
  initialPhase?: ThinkingPhase;
  initialMode?: ThinkingMode;
  stagnationThreshold?: number;
  maxStagnationCount?: number;
  autoDisruption?: boolean;
}

/**
 * セッション管理API
 * @summary セッション管理の戻り値型
 */
export interface SessionManager {
  session: ThinkingSession;
  updateSession: (step: ThinkingStep) => void;
  checkStagnation: () => StagnationCheck;
  injectDisruption: (type?: CreativeDisruption['type']) => CreativeDisruption;
  advancePhase: () => ThinkingPhase;
  completeSession: () => ThinkingSession;
  getSessionSummary: () => string;
}

/**
 * @summary 思考セッションを管理する
 * @param task タスク内容
 * @param options セッションオプション
 * @returns セッション管理オブジェクト
 */
export function manageThinkingSession(
  task: string,
  options: SessionOptions = {}
): SessionManager {
  const initialMode = options.initialMode || selectThinkingMode({ task });
  const initialPhase = options.initialPhase || 'problem-discovery';
  const stagnationThreshold = options.stagnationThreshold || 0.1;
  const maxStagnationCount = options.maxStagnationCount || 3;
  const autoDisruption = options.autoDisruption !== false;

  const session: ThinkingSession = {
    id: generateSessionId(),
    task,
    startTime: new Date(),
    lastUpdateTime: new Date(),
    currentPhase: initialPhase,
    currentMode: initialMode,
    history: [],
    stagnationCount: 0,
    disruptionHistory: [],
    status: 'active'
  };

  const updateSession = (step: ThinkingStep): void => {
    session.history.push(step);
    session.lastUpdateTime = new Date();
    session.currentMode = step.mode;
    session.currentPhase = step.phase;

    // 停滞チェック
    const stagnation = checkThinkingStagnation(session, stagnationThreshold);
    if (stagnation.isStagnant) {
      session.stagnationCount++;
      if (session.stagnationCount > maxStagnationCount) {
        session.status = 'stagnant';

        // 自動攪乱
        if (autoDisruption) {
          injectDisruption();
        }
      }
    }
  };

  const checkStagnation = (): StagnationCheck => {
    return checkThinkingStagnation(session, stagnationThreshold);
  };

  const injectDisruption = (type?: CreativeDisruption['type']): CreativeDisruption => {
    const disruption = injectCreativeDisruption(session, type);
    session.disruptionHistory.push(disruption);
    session.status = 'disrupted';
    session.stagnationCount = 0;
    session.lastUpdateTime = new Date();
    return disruption;
  };

  const advancePhaseFn = (): ThinkingPhase => {
    const phases: ThinkingPhase[] = [
      'problem-discovery',
      'problem-formulation',
      'strategy-development',
      'solution-evaluation'
    ];
    const currentIndex = phases.indexOf(session.currentPhase);
    if (currentIndex < phases.length - 1) {
      session.currentPhase = phases[currentIndex + 1];
      session.lastUpdateTime = new Date();
    }
    return session.currentPhase;
  };

  const completeSession = (): ThinkingSession => {
    session.status = 'completed';
    session.lastUpdateTime = new Date();
    return session;
  };

  const getSessionSummary = (): string => {
    return generateSessionSummary(session);
  };

  return {
    session,
    updateSession,
    checkStagnation,
    injectDisruption,
    advancePhase: advancePhaseFn,
    completeSession,
    getSessionSummary
  };
}

/**
 * @summary 思考の停滞を検出
 * @param session 思考セッション
 * @param threshold 停滞判定閾値
 * @returns 停滞検出結果
 */
export function checkThinkingStagnation(
  session: ThinkingSession,
  threshold: number = 0.1
): StagnationCheck {
  const history = session.history;
  if (history.length < 3) {
    return {
      isStagnant: false,
      stagnationType: 'low-progress',
      evidence: '履歴が不足（3ステップ未満）',
      recommendedAction: '継続'
    };
  }

  // 1. 繰り返し検出
  const recentThoughts = history.slice(-3).map(h => h.thought);
  const similarityScore = calculateSimilarity(recentThoughts);
  if (similarityScore > 0.8) {
    return {
      isStagnant: true,
      stagnationType: 'repetition',
      evidence: `類似度スコア: ${similarityScore.toFixed(2)}（閾値0.8超過）`,
      recommendedAction: '創造的攪乱の注入、または視点の転換'
    };
  }

  // 2. 進捗の低さ
  const recentConfidences = history.slice(-5).map(h => h.confidence);
  if (recentConfidences.length >= 2) {
    const progressScore = recentConfidences[recentConfidences.length - 1] - recentConfidences[0];
    if (Math.abs(progressScore) < threshold) {
      return {
        isStagnant: true,
        stagnationType: 'low-progress',
        evidence: `信頼度変化: ${progressScore.toFixed(3)}（閾値${threshold}未満）`,
        recommendedAction: '思考モードの切り替え、またはフェーズの進行'
      };
    }
  }

  // 3. モード固着
  const recentModes = history.slice(-5).map(h => h.mode);
  const uniqueModes = new Set(recentModes);
  if (uniqueModes.size === 1 && recentModes.length >= 5) {
    return {
      isStagnant: true,
      stagnationType: 'mode-fixation',
      evidence: `思考モード: ${recentModes[0]} が5回連続`,
      recommendedAction: '別の思考モードへの切り替え'
    };
  }

  // 4. 信頼度プラトー（高すぎる信頼度の維持）
  if (recentConfidences.length >= 3) {
    const maxConfidence = Math.max(...recentConfidences);
    const avgConfidence = recentConfidences.reduce((a, b) => a + b, 0) / recentConfidences.length;
    if (maxConfidence > 0.9 && avgConfidence > 0.85) {
      return {
        isStagnant: true,
        stagnationType: 'confidence-plateau',
        evidence: `信頼度が高水準で安定: 最大${maxConfidence.toFixed(2)}, 平均${avgConfidence.toFixed(2)}`,
        recommendedAction: '批判的モードでの再検討、反例の探索'
      };
    }
  }

  // 5. 時間ベースの停滞（長時間同じ状態）
  const timeSinceLastUpdate = Date.now() - session.lastUpdateTime.getTime();
  const fiveMinutes = 5 * 60 * 1000;
  if (timeSinceLastUpdate > fiveMinutes && session.status === 'active') {
    return {
      isStagnant: true,
      stagnationType: 'low-progress',
      evidence: `最終更新から${Math.floor(timeSinceLastUpdate / 60000)}分経過`,
      recommendedAction: 'セッションの状態確認、または攪乱の注入'
    };
  }

  return {
    isStagnant: false,
    stagnationType: 'low-progress',
    evidence: '停滞なし',
    recommendedAction: '継続'
  };
}

/**
 * @summary 創造的攪乱を注入
 * @param session 思考セッション
 * @param forcedType 強制する攪乱タイプ
 * @returns 創造的攪乱
 */
export function injectCreativeDisruption(
  session: ThinkingSession,
  forcedType?: CreativeDisruption['type']
): CreativeDisruption {
  const strategies: DisruptionStrategy[] = [
    // 1. モード切り替え
    {
      type: 'mode-switch',
      description: '思考モードを切り替える',
      trigger: (s) => {
        const recentModes = s.history.slice(-3).map(h => h.mode);
        return new Set(recentModes).size === 1;
      },
      generate: (s) => {
        const currentMode = s.currentMode;
        const allModes: ThinkingMode[] = ['creative', 'analytical', 'critical', 'practical', 'social', 'emotional'];
        const alternatives = allModes.filter(m => m !== currentMode);
        const newMode = alternatives[Math.floor(Math.random() * alternatives.length)];
        return `【思考モード切り替え】\n現在の${currentMode}モードから${newMode}モードに切り替えてください。\n新しい視点から問題を見直しましょう。`;
      }
    },
    // 2. 前提への挑戦
    {
      type: 'assumption-challenge',
      description: '暗黙の前提を疑う',
      trigger: (s) => s.history.length > 5,
      generate: (s) => {
        const assumptions = extractAssumptions(s.history);
        return `【前提への挑戦】\n以下の前提を疑ってみてください：\n${assumptions.map(a => `- 「${a}」`).join('\n')}\n\nこれらが誤りである可能性はありますか？\n逆の前提を立てるとどうなりますか？`;
      }
    },
    // 3. アナロジー
    {
      type: 'analogy',
      description: '異なる領域からのアナロジーを適用',
      trigger: () => true,
      generate: (s) => {
        const analogies = [
          { domain: '生物学的システム', question: 'この問題を生物学的なシステム（生態系、進化、適応）として捉え直すとどうなりますか？' },
          { domain: '建築設計', question: 'この問題を建築の設計（構造、基礎、空間）として捉え直すとどうなりますか？' },
          { domain: '料理・レシピ', question: 'この問題を料理のレシピ（材料、手順、味付け）として捉え直すとどうなりますか？' },
          { domain: '音楽・作曲', question: 'この問題を音楽の作曲（旋律、リズム、ハーモニー）として捉え直すとどうなりますか？' },
          { domain: '物語・ドラマ', question: 'この問題を物語やドラマ（登場人物、葛藤、解決）として捉え直すとどうなりますか？' },
          { domain: 'スポーツ・ゲーム', question: 'この問題をスポーツやゲーム（戦略、ルール、勝利条件）として捉え直すとどうなりますか？' }
        ];
        const selected = analogies[Math.floor(Math.random() * analogies.length)];
        return `【アナロジー：${selected.domain}】\n${selected.question}`;
      }
    },
    // 4. ランダム注入
    {
      type: 'random-injection',
      description: '予測不可能な問いを投入',
      trigger: (s) => s.stagnationCount > 2,
      generate: () => {
        const randomQuestions = [
          'この問題で「間違いなく真実」なことは何か？',
          'この問題を最も単純化するとどうなるか？',
          'この問題に対して10歳の子どもならどう考えるか？',
          'この問題を逆転させるとどうなるか？（目的と手段の逆転）',
          'この問題において、もっともらしいが誤った解決策は何か？',
          'この問題の「解決しない」という選択肢はあり得るか？',
          'この問題を誰も解決しなかったらどうなるか？',
          'この問題の前提をすべて捨てたら、何が残るか？'
        ];
        return `【ランダム問い】\n${randomQuestions[Math.floor(Math.random() * randomQuestions.length)]}`;
      }
    }
  ];

  // タイプが指定されている場合はそれを使用
  if (forcedType) {
    const strategy = strategies.find(s => s.type === forcedType);
    if (strategy) {
      return {
        timestamp: new Date(),
        type: strategy.type,
        content: strategy.generate(session),
        result: 'neutral'
      };
    }
  }

  // トリガー条件に合う戦略を選択
  const applicableStrategies = strategies.filter(s => s.trigger(session));
  const selectedStrategy = applicableStrategies[Math.floor(Math.random() * applicableStrategies.length)];

  return {
    timestamp: new Date(),
    type: selectedStrategy.type,
    content: selectedStrategy.generate(session),
    result: 'neutral'
  };
}

/**
 * @summary セッションの統計情報を取得
 * @param session 思考セッション
 * @returns 統計情報
 */
export function getSessionStats(session: ThinkingSession): {
  duration: number;
  stepCount: number;
  avgConfidence: number;
  modeDistribution: Record<ThinkingMode, number>;
  disruptionCount: number;
  finalStatus: string;
} {
  const duration = Date.now() - session.startTime.getTime();
  const stepCount = session.history.length;

  const confidences = session.history.map(h => h.confidence);
  const avgConfidence = confidences.length > 0
    ? confidences.reduce((a, b) => a + b, 0) / confidences.length
    : 0;

  const modeDistribution: Record<ThinkingMode, number> = {
    'creative': 0,
    'analytical': 0,
    'critical': 0,
    'practical': 0,
    'social': 0,
    'emotional': 0
  };
  session.history.forEach(h => {
    modeDistribution[h.mode]++;
  });

  return {
    duration,
    stepCount,
    avgConfidence,
    modeDistribution,
    disruptionCount: session.disruptionHistory.length,
    finalStatus: session.status
  };
}

// ===== ヘルパー関数 =====

/**
 * セッションIDを生成
 */
function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * テキスト間の類似度を計算
 */
function calculateSimilarity(thoughts: string[]): number {
  if (thoughts.length < 2) return 0;

  // 簡易類似度計算（共通単語比率）
  const wordSets = thoughts.map(t => new Set(t.split(/\s+/).filter(w => w.length > 2)));

  let totalSimilarity = 0;
  let comparisons = 0;

  for (let i = 0; i < wordSets.length - 1; i++) {
    for (let j = i + 1; j < wordSets.length; j++) {
      const setI = wordSets[i];
      const setJ = wordSets[j];
      let intersectionSize = 0;
      setI.forEach(w => { if (setJ.has(w)) intersectionSize++; });
      const unionSize = setI.size + setJ.size - intersectionSize;
      totalSimilarity += unionSize > 0 ? intersectionSize / unionSize : 0;
      comparisons++;
    }
  }

  return comparisons > 0 ? totalSimilarity / comparisons : 0;
}

/**
 * 思考履歴から前提を抽出
 */
function extractAssumptions(history: ThinkingStep[]): string[] {
  const assumptions: string[] = [];
  const assumptionPatterns = [
    /前提として([^。]+)/,
    /仮定すると([^。]+)/,
    /当然([^。]+)/,
    /必然的に([^。]+)/,
    /明らかに([^。]+)/
  ];

  history.forEach(h => {
    assumptionPatterns.forEach(pattern => {
      const match = h.thought.match(pattern);
      if (match) {
        assumptions.push(match[1].trim());
      }
    });
  });

  // 暗黙の前提も推測
  if (assumptions.length === 0 && history.length > 0) {
    assumptions.push('現在のアプローチが最適である');
    assumptions.push('問題の理解が正確である');
  }

  return assumptions.slice(0, 3); // 最大3つ
}

/**
 * セッションサマリーを生成
 */
function generateSessionSummary(session: ThinkingSession): string {
  const stats = getSessionStats(session);
  const durationMinutes = Math.floor(stats.duration / 60000);
  const durationSeconds = Math.floor((stats.duration % 60000) / 1000);

  const dominantMode = Object.entries(stats.modeDistribution)
    .reduce((a, b) => a[1] > b[1] ? a : b)[0];

  return `
## セッションサマリー

**タスク**: ${session.task}

**状態**: ${session.status}

**期間**: ${durationMinutes}分${durationSeconds}秒

**ステップ数**: ${stats.stepCount}

**平均信頼度**: ${stats.avgConfidence.toFixed(2)}

**支配的思考モード**: ${dominantMode}

**攪乱回数**: ${stats.disruptionCount}

**フェーズ**: ${session.currentPhase}
`.trim();
}

/**
 * @summary 利用可能な攪乱タイプを取得
 * @returns 攪乱タイプのリストと説明
 */
export function getAvailableDisruptionTypes(): Array<{
  type: CreativeDisruption['type'];
  description: string;
}> {
  return [
    { type: 'mode-switch', description: '思考モードを切り替えて新しい視点を獲得' },
    { type: 'assumption-challenge', description: '暗黙の前提を疑い、新たな可能性を探索' },
    { type: 'analogy', description: '異なる領域からのアナロジーを適用' },
    { type: 'random-injection', description: '予測不可能な問いを投入し、思考を刺激' }
  ];
}

/**
 * @summary 攪乱結果を評価
 * @param disruption 攪乱
 * @param session 更新後のセッション
 * @returns 更新された攪乱（結果評価済み）
 */
export function evaluateDisruptionResult(
  disruption: CreativeDisruption,
  session: ThinkingSession
): CreativeDisruption {
  // 攪乱後の履歴を確認
  const postDisruptionSteps = session.history.filter(
    h => h.timestamp >= disruption.timestamp
  );

  if (postDisruptionSteps.length < 2) {
    return { ...disruption, result: 'neutral' };
  }

  // 信頼度の変化を評価
  const confidences = postDisruptionSteps.map(h => h.confidence);
  const progress = confidences[confidences.length - 1] - confidences[0];

  // モードの変化を評価
  const modes = postDisruptionSteps.map(h => h.mode);
  const modeChanged = new Set(modes).size > 1;

  // 結果を判定
  if (progress > 0.1 && modeChanged) {
    return { ...disruption, result: 'productive' };
  } else if (progress < -0.1 || !modeChanged) {
    return { ...disruption, result: 'counterproductive' };
  }

  return { ...disruption, result: 'neutral' };
}
