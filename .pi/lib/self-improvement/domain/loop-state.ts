/**
 * @abdd.meta
 * path: .pi/lib/self-improvement/domain/loop-state.ts
 * role: 自己改善ループの状態管理
 * why: クリーンアーキテクチャのEnterprise Business Rules層として、ループ状態の管理を集約するため
 * related: ./types.ts, ./perspective.ts, ../application/loop-service.ts
 * public_api: createRunId, initializeLoopState, checkStopSignal, clearStopSignal, shouldStopLoop
 * invariants: runIdは一意である
 * side_effects: なし（ファイル操作はAdapter層で行う）
 * failure_modes: なし
 * @abdd.explain
 * overview: 自己改善ループの状態管理関数
 * what_it_does:
 *   - runIdの生成
 *   - ループ状態の初期化
 *   - 停止条件の判定
 * why_it_exists:
 *   - ループの状態管理をドメイン層に集約し、ビジネスロジックを明確にするため
 * scope:
 *   in: ./types.ts, ./perspective.ts
 *   out: application層
 */

import type {
  SelfImprovementLoopState,
  StopReason,
  ActiveAutonomousRun,
  SelfImprovementLoopConfig,
  SelfImprovementModel,
  ParsedPerspectiveScores,
  TrajectoryTracker,
} from "./types.js";
import { initializePerspectiveStates, PERSPECTIVES } from "./perspective.js";

// ============================================================================
// デフォルト設定
// ============================================================================

/** デフォルトのループ設定 */
export const DEFAULT_LOOP_CONFIG: Required<SelfImprovementLoopConfig> = {
  maxCycles: Infinity,
  stopSignalPath: ".pi/self-improvement-loop/stop-signal",
  logDir: ".pi/self-improvement-loop",
  autoCommit: true,
  stagnationThreshold: 0.85,
  maxStagnationCount: 3,
};

/** デフォルトのモデル設定 */
export const DEFAULT_MODEL: SelfImprovementModel = {
  provider: "anthropic",
  id: "claude-sonnet-4-20250514",
  thinkingLevel: "medium",
};

// ============================================================================
// ユーティリティ関数
// ============================================================================

/**
 * 一意のrunIdを生成する
 * @summary runIdを生成
 * @returns タイムスタンプベースの一意なID
 */
export function createRunId(): string {
  const timestamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const random = Math.random().toString(36).slice(2, 8);
  return `${timestamp}-${random}`;
}

/**
 * ループ状態を初期化する
 * @summary ループ状態を初期化
 * @param task タスク内容
 * @returns 初期化されたループ状態
 */
export function initializeLoopState(task: string): SelfImprovementLoopState {
  return {
    runId: createRunId(),
    startedAt: new Date().toISOString(),
    task,
    currentCycle: 0,
    currentPerspectiveIndex: 0,
    perspectiveStates: initializePerspectiveStates(),
    stopRequested: false,
    stopReason: null,
    lastCommitHash: null,
    lastUpdatedAt: new Date().toISOString(),
    totalImprovements: 0,
    summary: "",
    filesChangedBeforeCycle: new Set<string>(),
    gitignorePatternsToAdd: new Set<string>(),
  };
}

/**
 * 自律実行ランの状態を初期化する
 * @summary 自律実行ランを初期化
 * @param task タスク内容
 * @param maxCycles 最大サイクル数
 * @param autoCommit 自動コミット有無
 * @param model モデル情報
 * @param trajectoryTracker 軌跡トラッカー
 * @param ulMode ULモード有無
 * @param autoApprove 自動承認有無
 * @returns 初期化された自律実行ラン状態
 */
export function initializeActiveRun(
  task: string,
  maxCycles: number,
  autoCommit: boolean,
  model: SelfImprovementModel,
  trajectoryTracker: TrajectoryTracker,
  ulMode: boolean = true,
  autoApprove: boolean = true
): ActiveAutonomousRun {
  const runId = createRunId();
  const logDir = DEFAULT_LOOP_CONFIG.logDir;
  
  return {
    runId,
    task,
    startedAt: new Date().toISOString(),
    maxCycles,
    autoCommit,
    cycle: 0,
    inFlightCycle: null,
    stopRequested: false,
    stopReason: null,
    logPath: `${logDir}/run-${runId}.md`,
    model,
    lastCommitHash: null,
    trajectoryTracker,
    cycleSummaries: [],
    perspectiveScoreHistory: [],
    successfulPatterns: [],
    filesChangedBeforeCycle: new Set<string>(),
    gitignorePatternsToAdd: new Set<string>(),
    ulMode,
    autoApprove,
    currentPhase: "research",
    phaseContext: {},
    phaseRetryCount: 0,
  };
}

/**
 * 停止条件を判定する
 * @summary 停止判定
 * @param run 現在のラン状態
 * @param checkStopSignalFn 停止信号チェック関数（Adapter層から注入）
 * @returns 停止すべき場合はtrue
 */
export function shouldStopLoop(
  run: ActiveAutonomousRun,
  checkStopSignalFn?: () => boolean
): boolean {
  // 1. ユーザー要求
  if ((checkStopSignalFn?.() ?? false) || run.stopRequested) {
    run.stopReason = "user_request";
    return true;
  }
  
  // 2. 最大サイクル到達
  if (run.maxCycles !== Infinity && run.cycle >= run.maxCycles) {
    run.stopReason = "completed";
    return true;
  }
  
  // 3. 停滞検出
  const trajectorySummary = run.trajectoryTracker.getSummary();
  if (trajectorySummary.isStuck) {
    run.stopReason = "stagnation";
    return true;
  }
  
  // 4. 高スコア完了（95%以上）
  const latestScores = run.perspectiveScoreHistory[run.perspectiveScoreHistory.length - 1];
  if (latestScores && latestScores.average >= 95) {
    run.stopReason = "completed";
    return true;
  }
  
  return false;
}

/**
 * サイクルスコアから平均を計算する
 * @summary サイクル平均スコア
 * @param perspectiveResults 視座結果配列
 * @returns 平均スコア（0-1）
 */
export function calculateCycleAverageScore(
  perspectiveResults: Array<{ score: number }>
): number {
  if (perspectiveResults.length === 0) return 0.3;
  return perspectiveResults.reduce((sum, r) => sum + r.score, 0) / perspectiveResults.length;
}

/**
 * 停滞を検出する
 * @summary 停滞検出
 * @param previousScores 過去のスコア履歴
 * @param threshold しきい値
 * @param maxCount 最大連続回数
 * @returns 停滞している場合はtrue
 */
export function detectStagnation(
  previousScores: number[],
  threshold: number = DEFAULT_LOOP_CONFIG.stagnationThreshold,
  maxCount: number = DEFAULT_LOOP_CONFIG.maxStagnationCount
): { isStagnant: boolean; stagnationCount: number } {
  if (previousScores.length < 3) {
    return { isStagnant: false, stagnationCount: 0 };
  }

  const recentScores = previousScores.slice(-3);
  const avgRecent = recentScores.reduce((a, b) => a + b, 0) / 3;
  const variance = recentScores.reduce((sum, s) => sum + Math.pow(s - avgRecent, 2), 0) / 3;

  const isStagnant = variance < (1 - threshold) * 0.1;
  
  // 連続停滞回数をカウント
  let stagnationCount = 0;
  for (let i = previousScores.length - 1; i >= 0; i--) {
    const score = previousScores[i];
    if (score !== undefined && Math.abs(score - avgRecent) < (1 - threshold) * 0.1) {
      stagnationCount++;
    } else {
      break;
    }
  }

  return {
    isStagnant: isStagnant && stagnationCount >= maxCount,
    stagnationCount,
  };
}

/**
 * 視座スコア履歴から戦略ヒントを生成する
 * @summary 戦略ヒントを生成
 * @param scoreHistory スコア履歴
 * @param recommendedAction 推奨アクション
 * @returns 戦略ヒントまたはnull
 */
export function generateStrategyHint(
  scoreHistory: ParsedPerspectiveScores[],
  recommendedAction: "continue" | "pivot" | "early_stop"
): string | null {
  if (scoreHistory.length === 0) return null;

  const latest = scoreHistory[scoreHistory.length - 1];
  if (!latest) return null;

  // 最もスコアが低い視座を特定
  const scores: { name: string; score: number }[] = [
    { name: "脱構築", score: latest.deconstruction },
    { name: "スキゾ分析", score: latest.schizoanalysis },
    { name: "幸福論", score: latest.eudaimonia },
    { name: "ユートピア/ディストピア", score: latest.utopia_dystopia },
    { name: "思考哲学", score: latest.thinking_philosophy },
    { name: "思考分類学", score: latest.thinking_taxonomy },
    { name: "論理学", score: latest.logic },
  ];

  scores.sort((a, b) => a.score - b.score);
  const lowest = scores[0];
  const secondLowest = scores[1];

  let hint = "";

  if (recommendedAction === "pivot") {
    hint = `反復パターンを検知。アプローチを変更してください。「${lowest?.name ?? ''}」の視座（スコア: ${lowest?.score ?? 0}）を重点的に適用し、新しい視点から問題に取り組んでください。`;
  } else if (lowest && lowest.score < 50) {
    hint = `「${lowest.name}」の視座が弱い（スコア: ${lowest.score}）。この視座を強化し、${secondLowest ? `「${secondLowest.name}」（スコア: ${secondLowest.score}）と組み合わせて` : ''}深い分析を行ってください。`;
  } else if (latest.average < 60) {
    hint = `全体的な視座スコアが低い（平均: ${latest.average}）。7つの視座をバランスよく適用し、包括的な自己分析を行ってください。`;
  }

  return hint || null;
}

/**
 * 成功パターンを記録する
 * @summary 成功パターンを記録
 * @param run ラン状態
 * @param cycle サイクル番号
 * @param averageScore 平均スコア
 * @param actionSummary アクション要約
 * @param appliedPerspectives 適用した視座
 */
export function recordSuccessfulPattern(
  run: ActiveAutonomousRun,
  cycle: number,
  averageScore: number,
  actionSummary: string,
  appliedPerspectives: string[]
): void {
  run.successfulPatterns.push({
    cycle,
    averageScore,
    actionSummary,
    appliedPerspectives,
  });
}
