/**
 * @abdd.meta
 * path: .pi/lib/experience-replay.ts
 * role: 経験再生システム
 * why: 過去の思考セッションから学習し、類似状況での意思決定を改善する
 * related: thinking-process.ts, belief-updater.ts, learnable-mode-selector.ts
 * public_api: ExperienceReplay, ThinkingSession, SimilarExperience, createExperienceReplay, store, retrieve, learn
 * invariants: セッションIDは一意、タイムスタンプは昇順
 * side_effects: なし（状態はImmutable）
 * failure_modes: 類似検索の精度低下、メモリ使用量増大
 * @abdd.explain
 * overview: 強化学習におけるExperience Replayを思考プロセスに適用したシステム
 * what_it_does: 思考セッションの保存、類似検索、パターン学習、推奨生成
 * why_it_exists: 経験から学習し、同様の状況でより良い判断を行うため
 * scope:
 *   in: 思考セッション、コンテキスト、アウトカム
 *   out: 類似経験、学習済みパターン、推奨事項
 */

import {
  ThinkingMode,
  ThinkingPhase,
  ThinkingContext,
  ThinkingStep,
  createThinkingContext,
  getAllThinkingModes,
  getAllThinkingPhases
} from './thinking-process';
import { AporiaDetection, AporiaResolution } from './aporia-handler';
import { Distribution, createPrior, calculateEntropy, getMaxEntropy } from './belief-updater';
import { ModeSelectionResult } from './learnable-mode-selector';

/**
 * 思考セッション
 * @summary 一連の思考プロセスを記録する型
 * @param id セッションID
 * @param context 思考コンテキスト
 * @param steps 思考ステップの履歴
 * @param aporias 検出されたアポリア
 * @param aporiaResolutions アポリア対処結果
 * @param outcome セッションの結果
 * @param metadata メタデータ
 */
export interface ThinkingSession {
  id: string;
  context: ThinkingContext;
  steps: ThinkingStep[];
  modeSelections: ModeSelectionResult[];
  aporias: AporiaDetection[];
  aporiaResolutions: AporiaResolution[];
  outcome: SessionOutcome;
  metadata: SessionMetadata;
}

/**
 * セッションの結果
 * @summary セッションの最終的な結果
 */
export interface SessionOutcome {
  status: 'success' | 'failure' | 'partial' | 'abandoned';
  effectiveness: number;
  lessonsLearned: string[];
  nextSteps?: string[];
  reviewedAt?: Date;
}

/**
 * セッションメタデータ
 * @summary セッションの追加情報
 */
export interface SessionMetadata {
  createdAt: Date;
  completedAt?: Date;
  duration: number;  // ミリ秒
  tags: string[];
  taskType: string;
  complexity: 'low' | 'medium' | 'high';
  priority: 'low' | 'medium' | 'high';
}

/**
 * 類似経験
 * @summary 検索された類似経験
 * @param session 元のセッション
 * @param similarity 類似度スコア（0-1）
 * @param matchingFeatures 一致した特徴量
 * @param relevantSteps 関連する思考ステップ
 */
export interface SimilarExperience {
  session: ThinkingSession;
  similarity: number;
  matchingFeatures: string[];
  relevantSteps: ThinkingStep[];
  applicability: 'high' | 'medium' | 'low';
}

/**
 * 学習済みパターン
 * @summary 経験から抽出されたパターン
 * @param patternId パターンID
 * @param patternType パターンの種類
 * @param conditions パターンが適用される条件
 * @param recommendedAction 推奨されるアクション
 * @param confidence パターンの信頼度
 * @param supportingEvidence 支持証拠（セッションID）
 * @param counterEvidence 反証（セッションID）
 */
export interface LearnedPattern {
  patternId: string;
  patternType: PatternType;
  conditions: PatternCondition[];
  recommendedAction: RecommendedAction;
  confidence: number;
  supportingEvidence: string[];
  counterEvidence: string[];
  lastUpdated: Date;
  usageCount: number;
  successRate: number;
}

/**
 * パターンタイプ
 * @summary パターンの種類
 */
export type PatternType =
  | 'mode-selection'        // モード選択パターン
  | 'phase-transition'      // フェーズ遷移パターン
  | 'aporia-resolution'     // アポリア対処パターン
  | 'problem-solving'       // 問題解決パターン
  | 'error-recovery';       // エラー回復パターン

/**
 * パターン条件
 * @summary パターンが適用される条件
 */
export interface PatternCondition {
  type: 'context' | 'phase' | 'mode' | 'keyword' | 'complexity';
  value: string;
  weight: number;
}

/**
 * 推奨アクション
 * @summary パターンに基づく推奨
 */
export interface RecommendedAction {
  type: 'select-mode' | 'transition-phase' | 'apply-strategy' | 'avoid-action';
  target: string;
  rationale: string;
  expectedOutcome: string;
}

/**
 * 経験再生システム
 * @summary 経験の保存・検索・学習を管理
 */
export interface ExperienceReplay {
  /** 保存されたセッション */
  sessions: Map<string, ThinkingSession>;
  /** 学習済みパターン */
  patterns: Map<string, LearnedPattern>;
  /** インデックス（高速検索用） */
  indexes: ExperienceIndexes;
  /** 設定 */
  config: ExperienceReplayConfig;
  /** 統計 */
  stats: ExperienceStats;
}

/**
 * 経験インデックス
 * @summary 高速検索のためのインデックス
 */
export interface ExperienceIndexes {
  /** タスクタイプ別インデックス */
  byTaskType: Map<string, Set<string>>;
  /** フェーズ別インデックス */
  byPhase: Map<ThinkingPhase, Set<string>>;
  /** モード別インデックス */
  byMode: Map<ThinkingMode, Set<string>>;
  /** タグ別インデックス */
  byTag: Map<string, Set<string>>;
  /** キーワードインデックス */
  keywordIndex: Map<string, Set<string>>;
}

/**
 * 設定
 * @summary 経験再生システムの設定
 */
export interface ExperienceReplayConfig {
  /** 最大セッション数 */
  maxSessions: number;
  /** 類似度閾値 */
  similarityThreshold: number;
  /** パターン信頼度閾値 */
  patternConfidenceThreshold: number;
  /** 学習間隔（セッション数） */
  learningInterval: number;
  /** 古いセッションの保持期間（ミリ秒） */
  maxAge: number;
}

/**
 * 統計
 * @summary システムの統計情報
 */
export interface ExperienceStats {
  totalSessions: number;
  successfulSessions: number;
  failedSessions: number;
  patternsLearned: number;
  patternsApplied: number;
  lastLearningAt?: Date;
  avgSessionEffectiveness: number;
}

/**
 * デフォルト設定
 */
const DEFAULT_CONFIG: ExperienceReplayConfig = {
  maxSessions: 1000,
  similarityThreshold: 0.3,
  patternConfidenceThreshold: 0.6,
  learningInterval: 10,
  maxAge: 30 * 24 * 60 * 60 * 1000  // 30日
};

/**
 * @summary 経験再生システムを作成
 * @param config 設定
 * @returns 初期化された経験再生システム
 */
export function createExperienceReplay(
  config: Partial<ExperienceReplayConfig> = {}
): ExperienceReplay {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };

  // インデックスを初期化
  const indexes: ExperienceIndexes = {
    byTaskType: new Map(),
    byPhase: new Map(),
    byMode: new Map(),
    byTag: new Map(),
    keywordIndex: new Map()
  };

  // フェーズ別インデックスの初期化
  getAllThinkingPhases().forEach(phase => {
    indexes.byPhase.set(phase, new Set());
  });

  // モード別インデックスの初期化
  getAllThinkingModes().forEach(mode => {
    indexes.byMode.set(mode, new Set());
  });

  return {
    sessions: new Map(),
    patterns: new Map(),
    indexes,
    config: fullConfig,
    stats: {
      totalSessions: 0,
      successfulSessions: 0,
      failedSessions: 0,
      patternsLearned: 0,
      patternsApplied: 0,
      avgSessionEffectiveness: 0
    }
  };
}

/**
 * @summary セッションを保存
 * @param replay 経験再生システム
 * @param session 保存するセッション
 * @returns 更新された経験再生システム
 */
export function store(
  replay: ExperienceReplay,
  session: ThinkingSession
): ExperienceReplay {
  // セッションを追加
  const newSessions = new Map(replay.sessions);
  newSessions.set(session.id, session);

  // インデックスを更新
  const newIndexes = updateIndexes(replay.indexes, session);

  // 統計を更新
  const newStats = updateStats(replay.stats, session);

  // 最大セッション数を超えた場合、古いものを削除
  let trimmedSessions = newSessions;
  if (newSessions.size > replay.config.maxSessions) {
    trimmedSessions = trimOldSessions(newSessions, replay.config.maxSessions);
  }

  // 学習タイミングをチェック
  let newPatterns = replay.patterns;
  let updatedStats = newStats;
  if (newStats.totalSessions % replay.config.learningInterval === 0) {
    const learningResult = runLearning(trimmedSessions, replay.patterns, replay.config);
    newPatterns = learningResult.patterns;
    updatedStats = {
      ...newStats,
      patternsLearned: newPatterns.size,
      lastLearningAt: new Date()
    };
  }

  return {
    sessions: trimmedSessions,
    patterns: newPatterns,
    indexes: newIndexes,
    config: replay.config,
    stats: updatedStats
  };
}

/**
 * @summary 類似経験を検索
 * @param replay 経験再生システム
 * @param context 現在のコンテキスト
 * @param options 検索オプション
 * @returns 類似経験のリスト
 */
export function retrieve(
  replay: ExperienceReplay,
  context: ThinkingContext,
  options: {
    maxResults?: number;
    minSimilarity?: number;
    includeFailed?: boolean;
  } = {}
): SimilarExperience[] {
  const {
    maxResults = 5,
    minSimilarity = replay.config.similarityThreshold,
    includeFailed = true
  } = options;

  // 候補セッションを収集（インデックス使用）
  const candidates = collectCandidates(replay, context);

  // 類似度を計算してフィルタリング
  const similarExperiences: SimilarExperience[] = [];

  for (const sessionId of candidates) {
    const session = replay.sessions.get(sessionId);
    if (!session) continue;

    // 失敗セッションを除外
    if (!includeFailed && session.outcome.status === 'failure') {
      continue;
    }

    // 類似度を計算
    const similarity = calculateSimilarity(session.context, context);

    if (similarity >= minSimilarity) {
      const matchingFeatures = findMatchingFeatures(session.context, context);
      const relevantSteps = findRelevantSteps(session.steps, context);
      const applicability = determineApplicability(similarity, session.outcome.effectiveness);

      similarExperiences.push({
        session,
        similarity,
        matchingFeatures,
        relevantSteps,
        applicability
      });
    }
  }

  // 類似度順にソートして上位N件を返す
  return similarExperiences
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, maxResults);
}

/**
 * @summary 経験から学習
 * @param replay 経験再生システム
 * @returns 学習結果と更新されたシステム
 */
export function learn(
  replay: ExperienceReplay
): {
  patterns: Map<string, LearnedPattern>;
  newPatterns: LearnedPattern[];
  updatedPatterns: LearnedPattern[];
  replay: ExperienceReplay;
} {
  const result = runLearning(replay.sessions, replay.patterns, replay.config);

  const updatedReplay: ExperienceReplay = {
    ...replay,
    patterns: result.patterns,
    stats: {
      ...replay.stats,
      patternsLearned: result.patterns.size,
      lastLearningAt: new Date()
    }
  };

  return {
    patterns: result.patterns,
    newPatterns: result.newPatterns,
    updatedPatterns: result.updatedPatterns,
    replay: updatedReplay
  };
}

/**
 * @summary 現在の状況に適用可能なパターンを検索
 * @param replay 経験再生システム
 * @param context 現在のコンテキスト
 * @returns 適用可能なパターンのリスト
 */
export function findApplicablePatterns(
  replay: ExperienceReplay,
  context: ThinkingContext
): LearnedPattern[] {
  const applicablePatterns: LearnedPattern[] = [];

  replay.patterns.forEach(pattern => {
    if (pattern.confidence < replay.config.patternConfidenceThreshold) {
      return;
    }

    // 条件に合致するかチェック
    const matchScore = evaluatePatternConditions(pattern, context);

    if (matchScore > 0.5) {
      applicablePatterns.push({
        ...pattern,
        confidence: pattern.confidence * matchScore
      });
    }
  });

  // 信頼度順にソート
  return applicablePatterns.sort((a, b) => b.confidence - a.confidence);
}

/**
 * @summary パターンに基づいて推奨を生成
 * @param patterns 適用可能なパターン
 * @param context 現在のコンテキスト
 * @returns 推奨事項
 */
export function generateRecommendations(
  patterns: LearnedPattern[],
  context: ThinkingContext
): string[] {
  const recommendations: string[] = [];

  // モード選択の推奨
  const modePatterns = patterns.filter(p => p.patternType === 'mode-selection');
  if (modePatterns.length > 0) {
    const bestPattern = modePatterns[0];
    recommendations.push(
      `推奨モード: ${bestPattern.recommendedAction.target} - ${bestPattern.recommendedAction.rationale}`
    );
  }

  // フェーズ遷移の推奨
  const phasePatterns = patterns.filter(p => p.patternType === 'phase-transition');
  if (phasePatterns.length > 0) {
    const bestPattern = phasePatterns[0];
    recommendations.push(
      `推奨フェーズ: ${bestPattern.recommendedAction.target} - ${bestPattern.recommendedAction.rationale}`
    );
  }

  // アポリア対処の推奨
  const aporiaPatterns = patterns.filter(p => p.patternType === 'aporia-resolution');
  if (aporiaPatterns.length > 0) {
    aporiaPatterns.slice(0, 2).forEach(p => {
      recommendations.push(
        `アポリア対処: ${p.recommendedAction.rationale}`
      );
    });
  }

  // 避けるべきアクション
  const avoidPatterns = patterns.filter(
    p => p.recommendedAction.type === 'avoid-action'
  );
  if (avoidPatterns.length > 0) {
    avoidPatterns.slice(0, 2).forEach(p => {
      recommendations.push(
        `回避推奨: ${p.recommendedAction.target} - ${p.recommendedAction.rationale}`
      );
    });
  }

  return recommendations;
}

/**
 * @summary セッションIDを生成
 * @returns 一意のセッションID
 */
export function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `session-${timestamp}-${random}`;
}

/**
 * @summary 新しい思考セッションを作成
 * @param task タスク内容
 * @param options オプション
 * @returns 新しいセッション
 */
export function createThinkingSession(
  task: string,
  options: {
    phase?: ThinkingPhase;
    mode?: ThinkingMode;
    taskType?: string;
    complexity?: 'low' | 'medium' | 'high';
    priority?: 'low' | 'medium' | 'high';
    tags?: string[];
  } = {}
): ThinkingSession {
  const context = createThinkingContext(task, {
    phase: options.phase,
    mode: options.mode
  });

  const metadata: SessionMetadata = {
    createdAt: new Date(),
    duration: 0,
    tags: options.tags || [],
    taskType: options.taskType || 'general',
    complexity: options.complexity || 'medium',
    priority: options.priority || 'medium'
  };

  return {
    id: generateSessionId(),
    context,
    steps: [],
    modeSelections: [],
    aporias: [],
    aporiaResolutions: [],
    outcome: {
      status: 'partial',
      effectiveness: 0,
      lessonsLearned: []
    },
    metadata
  };
}

/**
 * @summary セッションに思考ステップを追加
 * @param session セッション
 * @param step 追加するステップ
 * @returns 更新されたセッション
 */
export function addStepToSession(
  session: ThinkingSession,
  step: ThinkingStep
): ThinkingSession {
  return {
    ...session,
    steps: [...session.steps, step],
    metadata: {
      ...session.metadata,
      duration: Date.now() - session.metadata.createdAt.getTime()
    }
  };
}

/**
 * @summary セッションを完了
 * @param session セッション
 * @param outcome 結果
 * @returns 完了したセッション
 */
export function completeSession(
  session: ThinkingSession,
  outcome: Partial<SessionOutcome>
): ThinkingSession {
  return {
    ...session,
    outcome: {
      ...session.outcome,
      ...outcome,
      reviewedAt: new Date()
    },
    metadata: {
      ...session.metadata,
      completedAt: new Date(),
      duration: Date.now() - session.metadata.createdAt.getTime()
    }
  };
}

/**
 * @summary 経験再生システムの統計サマリーを取得
 * @param replay 経験再生システム
 * @returns サマリー文字列
 */
export function summarizeExperienceReplay(replay: ExperienceReplay): string {
  const successRate = replay.stats.totalSessions > 0
    ? (replay.stats.successfulSessions / replay.stats.totalSessions * 100).toFixed(0)
    : '0';

  return [
    `経験再生システム`,
    `セッション数: ${replay.stats.totalSessions}`,
    `成功率: ${successRate}%`,
    `パターン数: ${replay.stats.patternsLearned}`,
    `平均有効性: ${(replay.stats.avgSessionEffectiveness * 100).toFixed(0)}%`
  ].join(' | ');
}

// ===== ヘルパー関数 =====

/**
 * インデックスを更新
 */
function updateIndexes(
  indexes: ExperienceIndexes,
  session: ThinkingSession
): ExperienceIndexes {
  const newIndexes = {
    byTaskType: new Map(indexes.byTaskType),
    byPhase: new Map(indexes.byPhase),
    byMode: new Map(indexes.byMode),
    byTag: new Map(indexes.byTag),
    keywordIndex: new Map(indexes.keywordIndex)
  };

  // タスクタイプ別
  const taskTypeSet = newIndexes.byTaskType.get(session.metadata.taskType) || new Set();
  taskTypeSet.add(session.id);
  newIndexes.byTaskType.set(session.metadata.taskType, taskTypeSet);

  // フェーズ別
  const phaseSet = newIndexes.byPhase.get(session.context.phase) || new Set();
  phaseSet.add(session.id);
  newIndexes.byPhase.set(session.context.phase, phaseSet);

  // モード別
  const modeSet = newIndexes.byMode.get(session.context.currentMode) || new Set();
  modeSet.add(session.id);
  newIndexes.byMode.set(session.context.currentMode, modeSet);

  // タグ別
  session.metadata.tags.forEach(tag => {
    const tagSet = newIndexes.byTag.get(tag) || new Set();
    tagSet.add(session.id);
    newIndexes.byTag.set(tag, tagSet);
  });

  // キーワードインデックス
  const keywords = extractKeywords(session.context.task);
  keywords.forEach(keyword => {
    const keywordSet = newIndexes.keywordIndex.get(keyword) || new Set();
    keywordSet.add(session.id);
    newIndexes.keywordIndex.set(keyword, keywordSet);
  });

  return newIndexes;
}

/**
 * 統計を更新
 */
function updateStats(
  stats: ExperienceStats,
  session: ThinkingSession
): ExperienceStats {
  const newTotal = stats.totalSessions + 1;
  const newSuccessful = stats.successfulSessions +
    (session.outcome.status === 'success' ? 1 : 0);
  const newFailed = stats.failedSessions +
    (session.outcome.status === 'failure' ? 1 : 0);

  // 移動平均で有効性を更新
  const newAvgEffectiveness = stats.totalSessions === 0
    ? session.outcome.effectiveness
    : (stats.avgSessionEffectiveness * stats.totalSessions + session.outcome.effectiveness) / newTotal;

  return {
    ...stats,
    totalSessions: newTotal,
    successfulSessions: newSuccessful,
    failedSessions: newFailed,
    avgSessionEffectiveness: newAvgEffectiveness
  };
}

/**
 * 古いセッションを削除
 */
function trimOldSessions(
  sessions: Map<string, ThinkingSession>,
  maxSessions: number
): Map<string, ThinkingSession> {
  // 作成日時でソート
  const sortedSessions = Array.from(sessions.values())
    .sort((a, b) => b.metadata.createdAt.getTime() - a.metadata.createdAt.getTime());

  // 上位N件を保持
  const toKeep = new Set(sortedSessions.slice(0, maxSessions).map(s => s.id));

  const trimmed = new Map<string, ThinkingSession>();
  sessions.forEach((session, id) => {
    if (toKeep.has(id)) {
      trimmed.set(id, session);
    }
  });

  return trimmed;
}

/**
 * 学習を実行
 */
function runLearning(
  sessions: Map<string, ThinkingSession>,
  existingPatterns: Map<string, LearnedPattern>,
  config: ExperienceReplayConfig
): {
  patterns: Map<string, LearnedPattern>;
  newPatterns: LearnedPattern[];
  updatedPatterns: LearnedPattern[];
} {
  const newPatterns: LearnedPattern[] = [];
  const updatedPatterns: LearnedPattern[] = [];
  const patterns = new Map(existingPatterns);

  // 成功セッションからパターンを抽出
  const successfulSessions = Array.from(sessions.values())
    .filter(s => s.outcome.status === 'success' && s.outcome.effectiveness >= 0.7);

  // モード選択パターンを抽出
  const modePatterns = extractModeSelectionPatterns(successfulSessions);
  modePatterns.forEach(pattern => {
    const existingPattern = findSimilarPattern(patterns, pattern);
    if (existingPattern) {
      // 既存パターンを更新
      const updated = updatePattern(existingPattern, pattern);
      patterns.set(updated.patternId, updated);
      updatedPatterns.push(updated);
    } else {
      // 新規パターンを追加
      patterns.set(pattern.patternId, pattern);
      newPatterns.push(pattern);
    }
  });

  // フェーズ遷移パターンを抽出
  const phasePatterns = extractPhaseTransitionPatterns(successfulSessions);
  phasePatterns.forEach(pattern => {
    const existingPattern = findSimilarPattern(patterns, pattern);
    if (existingPattern) {
      const updated = updatePattern(existingPattern, pattern);
      patterns.set(updated.patternId, updated);
      updatedPatterns.push(updated);
    } else {
      patterns.set(pattern.patternId, pattern);
      newPatterns.push(pattern);
    }
  });

  // 低信頼度パターンを削除
  patterns.forEach((pattern, id) => {
    if (pattern.confidence < config.patternConfidenceThreshold * 0.5) {
      patterns.delete(id);
    }
  });

  return { patterns, newPatterns, updatedPatterns };
}

/**
 * 候補セッションを収集
 */
function collectCandidates(
  replay: ExperienceReplay,
  context: ThinkingContext
): Set<string> {
  const candidates = new Set<string>();

  // 同じフェーズのセッション
  const phaseSet = replay.indexes.byPhase.get(context.phase);
  if (phaseSet) {
    phaseSet.forEach(id => candidates.add(id));
  }

  // 同じモードのセッション
  const modeSet = replay.indexes.byMode.get(context.currentMode);
  if (modeSet) {
    modeSet.forEach(id => candidates.add(id));
  }

  // キーワードマッチ
  const keywords = extractKeywords(context.task);
  keywords.forEach(keyword => {
    const keywordSet = replay.indexes.keywordIndex.get(keyword);
    if (keywordSet) {
      keywordSet.forEach(id => candidates.add(id));
    }
  });

  return candidates;
}

/**
 * 類似度を計算
 */
function calculateSimilarity(
  sessionContext: ThinkingContext,
  currentContext: ThinkingContext
): number {
  let score = 0;
  let weights = 0;

  // フェーズ一致
  if (sessionContext.phase === currentContext.phase) {
    score += 0.3;
  }
  weights += 0.3;

  // 現在モード一致
  if (sessionContext.currentMode === currentContext.currentMode) {
    score += 0.2;
  }
  weights += 0.2;

  // タスク類似度（キーワードベース）
  const taskSimilarity = calculateTaskSimilarity(
    sessionContext.task,
    currentContext.task
  );
  score += taskSimilarity * 0.4;
  weights += 0.4;

  // 制約一致
  const constraintOverlap = calculateConstraintOverlap(
    sessionContext.constraints,
    currentContext.constraints
  );
  score += constraintOverlap * 0.1;
  weights += 0.1;

  return weights > 0 ? score / weights : 0;
}

/**
 * タスク類似度を計算
 */
function calculateTaskSimilarity(task1: string, task2: string): number {
  const keywords1 = extractKeywords(task1);
  const keywords2 = extractKeywords(task2);

  if (keywords1.size === 0 || keywords2.size === 0) {
    return 0;
  }

  let overlap = 0;
  keywords1.forEach(k => {
    if (keywords2.has(k)) {
      overlap++;
    }
  });

  const union = new Set([...keywords1, ...keywords2]).size;
  return union > 0 ? overlap / union : 0;
}

/**
 * 制約の重なりを計算
 */
function calculateConstraintOverlap(
  constraints1: string[],
  constraints2: string[]
): number {
  if (constraints1.length === 0 && constraints2.length === 0) {
    return 1;
  }
  if (constraints1.length === 0 || constraints2.length === 0) {
    return 0;
  }

  const set1 = new Set(constraints1);
  const set2 = new Set(constraints2);

  let overlap = 0;
  set1.forEach(c => {
    if (set2.has(c)) {
      overlap++;
    }
  });

  return overlap / Math.max(set1.size, set2.size);
}

/**
 * 一致する特徴量を見つける
 */
function findMatchingFeatures(
  sessionContext: ThinkingContext,
  currentContext: ThinkingContext
): string[] {
  const features: string[] = [];

  if (sessionContext.phase === currentContext.phase) {
    features.push(`フェーズ: ${sessionContext.phase}`);
  }

  if (sessionContext.currentMode === currentContext.currentMode) {
    features.push(`モード: ${sessionContext.currentMode}`);
  }

  const commonKeywords = findCommonKeywords(
    sessionContext.task,
    currentContext.task
  );
  commonKeywords.forEach(k => features.push(`キーワード: ${k}`));

  sessionContext.constraints.forEach(c => {
    if (currentContext.constraints.includes(c)) {
      features.push(`制約: ${c}`);
    }
  });

  return features;
}

/**
 * 関連するステップを見つける
 */
function findRelevantSteps(
  steps: ThinkingStep[],
  _context: ThinkingContext
): ThinkingStep[] {
  // 最新の3ステップを返す（簡易実装）
  return steps.slice(-3);
}

/**
 * 適用可能性を判定
 */
function determineApplicability(
  similarity: number,
  effectiveness: number
): 'high' | 'medium' | 'low' {
  const score = similarity * effectiveness;
  if (score >= 0.7) return 'high';
  if (score >= 0.4) return 'medium';
  return 'low';
}

/**
 * キーワードを抽出
 */
function extractKeywords(text: string): Set<string> {
  const keywords = new Set<string>();

  // 日本語キーワード
  const japanesePatterns = [
    /設計/g, /実装/g, /テスト/g, /分析/g, /調査/g,
    /修正/g, /改善/g, /最適化/g, /レビュー/g, /設計/g
  ];

  japanesePatterns.forEach(pattern => {
    const matches = text.match(pattern);
    if (matches) {
      matches.forEach(m => keywords.add(m));
    }
  });

  // 英語キーワード（単語境界）
  const englishWords = text.match(/\b[a-zA-Z]{3,}\b/g);
  if (englishWords) {
    englishWords.forEach(w => keywords.add(w.toLowerCase()));
  }

  return keywords;
}

/**
 * 共通キーワードを見つける
 */
function findCommonKeywords(text1: string, text2: string): string[] {
  const keywords1 = extractKeywords(text1);
  const keywords2 = extractKeywords(text2);

  const common: string[] = [];
  keywords1.forEach(k => {
    if (keywords2.has(k)) {
      common.push(k);
    }
  });

  return common;
}

/**
 * パターン条件を評価
 */
function evaluatePatternConditions(
  pattern: LearnedPattern,
  context: ThinkingContext
): number {
  let totalWeight = 0;
  let matchedWeight = 0;

  pattern.conditions.forEach(condition => {
    totalWeight += condition.weight;

    switch (condition.type) {
      case 'phase':
        if (context.phase === condition.value) {
          matchedWeight += condition.weight;
        }
        break;
      case 'mode':
        if (context.currentMode === condition.value) {
          matchedWeight += condition.weight;
        }
        break;
      case 'keyword':
        if (context.task.includes(condition.value)) {
          matchedWeight += condition.weight;
        }
        break;
      case 'context':
        if (context.task.includes(condition.value)) {
          matchedWeight += condition.weight;
        }
        break;
    }
  });

  return totalWeight > 0 ? matchedWeight / totalWeight : 0;
}

/**
 * モード選択パターンを抽出
 */
function extractModeSelectionPatterns(
  sessions: ThinkingSession[]
): LearnedPattern[] {
  const patterns: LearnedPattern[] = [];
  const modeCombinationCounts = new Map<string, { success: number; total: number }>();

  sessions.forEach(session => {
    // フェーズとモードの組み合わせをカウント
    const key = `${session.context.phase}:${session.context.currentMode}`;
    const current = modeCombinationCounts.get(key) || { success: 0, total: 0 };
    current.success += session.outcome.effectiveness >= 0.7 ? 1 : 0;
    current.total += 1;
    modeCombinationCounts.set(key, current);
  });

  // 高成功率の組み合わせをパターン化
  modeCombinationCounts.forEach((stats, key) => {
    if (stats.total >= 3) {
      const successRate = stats.success / stats.total;
      if (successRate >= 0.7) {
        const [phase, mode] = key.split(':');

        patterns.push({
          patternId: `mode-${phase}-${mode}`,
          patternType: 'mode-selection',
          conditions: [
            { type: 'phase', value: phase, weight: 0.6 },
            { type: 'keyword', value: phase, weight: 0.4 }
          ],
          recommendedAction: {
            type: 'select-mode',
            target: mode,
            rationale: `フェーズ「${phase}」での成功率${(successRate * 100).toFixed(0)}%`,
            expectedOutcome: `高確率で成功`
          },
          confidence: successRate,
          supportingEvidence: [],
          counterEvidence: [],
          lastUpdated: new Date(),
          usageCount: stats.total,
          successRate
        });
      }
    }
  });

  return patterns;
}

/**
 * フェーズ遷移パターンを抽出
 */
function extractPhaseTransitionPatterns(
  sessions: ThinkingSession[]
): LearnedPattern[] {
  const patterns: LearnedPattern[] = [];

  // フェーズ遷移の成功率を分析
  const transitionCounts = new Map<string, { success: number; total: number }>();

  sessions.forEach(session => {
    // ステップ間のフェーズ遷移を分析
    for (let i = 1; i < session.steps.length; i++) {
      const fromPhase = session.steps[i - 1].phase;
      const toPhase = session.steps[i].phase;

      if (fromPhase !== toPhase) {
        const key = `${fromPhase}->${toPhase}`;
        const current = transitionCounts.get(key) || { success: 0, total: 0 };
        current.success += session.outcome.effectiveness >= 0.7 ? 1 : 0;
        current.total += 1;
        transitionCounts.set(key, current);
      }
    }
  });

  // 高成功率の遷移をパターン化
  transitionCounts.forEach((stats, key) => {
    if (stats.total >= 2) {
      const successRate = stats.success / stats.total;
      if (successRate >= 0.6) {
        const [from, to] = key.split('->');

        patterns.push({
          patternId: `transition-${from}-${to}`,
          patternType: 'phase-transition',
          conditions: [
            { type: 'phase', value: from, weight: 1.0 }
          ],
          recommendedAction: {
            type: 'transition-phase',
            target: to,
            rationale: `遷移成功率${(successRate * 100).toFixed(0)}%`,
            expectedOutcome: `次フェーズへの効率的な移行`
          },
          confidence: successRate,
          supportingEvidence: [],
          counterEvidence: [],
          lastUpdated: new Date(),
          usageCount: stats.total,
          successRate
        });
      }
    }
  });

  return patterns;
}

/**
 * 類似パターンを検索
 */
function findSimilarPattern(
  patterns: Map<string, LearnedPattern>,
  newPattern: LearnedPattern
): LearnedPattern | undefined {
  return patterns.get(newPattern.patternId);
}

/**
 * パターンを更新
 */
function updatePattern(
  existing: LearnedPattern,
  newEvidence: LearnedPattern
): LearnedPattern {
  const newUsageCount = existing.usageCount + newEvidence.usageCount;
  const newSuccessRate = (
    existing.successRate * existing.usageCount +
    newEvidence.successRate * newEvidence.usageCount
  ) / newUsageCount;

  return {
    ...existing,
    confidence: Math.max(existing.confidence, newSuccessRate),
    usageCount: newUsageCount,
    successRate: newSuccessRate,
    lastUpdated: new Date()
  };
}
