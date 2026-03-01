/**
 * @abdd.meta
 * path: .pi/lib/trajectory-reduction/index.ts
 * role: Trajectory Reduction機能のメインモジュール
 * why: AgentDiet論文に基づく軌跡圧縮機能の統合エントリーポイント
 * related: .pi/lib/trajectory-reduction/types.ts, .pi/extensions/trajectory-reduction.ts
 * public_api: TrajectoryReducer, createTrajectoryReducer, reduceTrajectory
 * invariants: 圧縮は設定パラメータに従う
 * side_effects: LLM API呼び出し、ログ出力、軌跡の変更
 * failure_modes: APIエラー、タイムアウト、無効な圧縮結果
 * @abdd.explain
 * overview: 軌跡圧縮機能の統合モジュール
 * what_it_does:
 *   - スライディングウィンドウとリフレクションモジュールを統合
 *   - 各ステップ後の圧縮処理を調整
 *   - 統計情報の収集と管理
 * why_it_exists:
 *   - 各コンポーネントを統合し、使いやすいAPIを提供するため
 * scope:
 *   in: 軌跡ステップ, 設定, LLM呼び出し関数
 *   out: 圧縮結果, 統計情報
 */

import type {
  TrajectoryStep,
  TrajectoryReductionConfig,
  ReductionResult,
  ReductionStats,
  ReductionLogEntry,
  WasteType,
} from "./types.js";
import { DEFAULT_TRAJECTORY_REDUCTION_CONFIG } from "./types.js";
import {
  SlidingWindowManager,
  createSlidingWindowManager,
  globalTrajectoryStore,
} from "./sliding-window.js";
import {
  ReflectionModule,
  createReflectionModule,
} from "./reflection-module.js";
import { countTokens, messageToStep } from "./serialization.js";

export type {
  TrajectoryStep,
  TrajectoryReductionConfig,
  ReductionResult,
  ReductionStats,
  ReductionLogEntry,
  WasteType,
};

export { DEFAULT_TRAJECTORY_REDUCTION_CONFIG, globalTrajectoryStore, messageToStep };

/**
 * 軌跡圧縮器
 * AgentDiet論文のメインアルゴリズムを実装
 */
export class TrajectoryReducer {
  private readonly config: TrajectoryReductionConfig;
  private readonly trajectory: TrajectoryStep[];
  private readonly slidingWindowManager: SlidingWindowManager;
  private readonly reflectionModule: ReflectionModule;
  private readonly log: ReductionLogEntry[] = [];
  private stats: ReductionStats;

  constructor(
    config: Partial<TrajectoryReductionConfig>,
    trajectory: TrajectoryStep[],
    callLLM: (prompt: string, model: string) => Promise<string>
  ) {
    this.config = { ...DEFAULT_TRAJECTORY_REDUCTION_CONFIG, ...config };
    this.trajectory = trajectory;
    this.slidingWindowManager = createSlidingWindowManager(this.config, trajectory);
    this.reflectionModule = createReflectionModule(this.config, callLLM);

    this.stats = this.initializeStats();
  }

  /**
   * ステップ実行後に圧縮を試行
   * @summary AgentDietのメインエントリポイント
   * @param currentStep 現在のステップ番号
   * @returns 圧縮結果（圧縮しなかった場合はnull）
   */
  async afterStepExecution(currentStep: number): Promise<ReductionResult | null> {
    // 圧縮すべきかチェック
    if (!this.slidingWindowManager.shouldReduce(currentStep)) {
      return null;
    }

    // ウィンドウコンテキストを取得
    const context = this.slidingWindowManager.createWindowContext(currentStep);
    if (!context) {
      return null;
    }

    // 対象ステップを取得（配列インデックスに変換）
    const targetIndex = context.targetStep - 1;
    const targetStep = this.trajectory[targetIndex];
    if (!targetStep) {
      return null;
    }

    try {
      // リフレクションモジュールで圧縮
      const result = await this.reflectionModule.reduce({
        targetContent: targetStep.content,
        contextSteps: context.steps,
        targetStepNumber: context.targetStep,
        currentStepNumber: currentStep,
      });

      // 圧縮結果を検証
      if (!this.reflectionModule.validateReduction(targetStep.content, result)) {
        return null;
      }

      // 軌跡を更新
      this.trajectory[targetIndex] = {
        ...targetStep,
        content: result.content,
        tokenCount: result.tokenCount,
        compressed: true,
        originalTokenCount: targetStep.tokenCount,
      };

      // 統計を更新
      this.updateStats(result, targetStep.tokenCount);

      // ログに記録
      if (this.config.logReductions) {
        this.logEntry(result, context.targetStep, targetStep.tokenCount);
      }

      return result;
    } catch (error) {
      console.error(`[TrajectoryReducer] Reduction failed at step ${currentStep}:`, error);
      return null;
    }
  }

  /**
   * 軌跡にステップを追加
   * @summary 新しいステップを追加
   * @param step 追加するステップ
   */
  addStep(step: TrajectoryStep): void {
    this.trajectory.push(step);
  }

  /**
   * 現在の軌跡を取得
   * @summary 軌跡のコピーを返す
   * @returns 軌跡ステップ配列
   */
  getTrajectory(): TrajectoryStep[] {
    return [...this.trajectory];
  }

  /**
   * 統計情報を取得
   * @summary 現在の圧縮統計
   * @returns 統計情報
   */
  getStats(): ReductionStats {
    return { ...this.stats };
  }

  /**
   * 圧縮ログを取得
   * @summary これまでの圧縮履歴
   * @returns ログエントリ配列
   */
  getLog(): ReductionLogEntry[] {
    return [...this.log];
  }

  /**
   * 設定を取得
   * @summary 現在の設定
   * @returns 設定オブジェクト
   */
  getConfig(): TrajectoryReductionConfig {
    return { ...this.config };
  }

  /**
   * 統計を初期化
   * @summary 初期統計オブジェクトを作成
   * @returns 初期統計
   */
  private initializeStats(): ReductionStats {
    return {
      totalSteps: 0,
      compressedSteps: 0,
      originalTokens: 0,
      compressedTokens: 0,
      tokensSaved: 0,
      averageReductionRatio: 0,
      reflectionCalls: 0,
      totalProcessingTimeMs: 0,
      wasteTypeCounts: {
        useless: 0,
        redundant: 0,
        expired: 0,
      },
    };
  }

  /**
   * 統計を更新
   * @summary 圧縮結果を統計に反映
   * @param result 圧縮結果
   * @param originalTokens 元のトークン数
   */
  private updateStats(result: ReductionResult, originalTokens: number): void {
    this.stats.compressedSteps++;
    this.stats.originalTokens += originalTokens;
    this.stats.compressedTokens += result.tokenCount;
    this.stats.tokensSaved += result.tokensSaved;
    this.stats.reflectionCalls++;
    this.stats.totalProcessingTimeMs += result.processingTimeMs;

    // 平均削減率を再計算
    if (this.stats.compressedSteps > 0) {
      this.stats.averageReductionRatio =
        this.stats.tokensSaved / (this.stats.tokensSaved + this.stats.compressedTokens);
    }

    // 廃棄タイプ別カウント
    for (const type of result.wasteTypes) {
      this.stats.wasteTypeCounts[type]++;
    }
  }

  /**
   * ログに記録
   * @summary 圧縮ログエントリを作成
   * @param result 圧縮結果
   * @param targetStep 対象ステップ番号
   * @param originalTokens 元のトークン数
   */
  private logEntry(
    result: ReductionResult,
    targetStep: number,
    originalTokens: number
  ): void {
    this.log.push({
      timestamp: new Date().toISOString(),
      targetStep,
      originalTokens,
      compressedTokens: result.tokenCount,
      tokensSaved: result.tokensSaved,
      reductionRatio: result.reductionRatio,
      wasteTypes: result.wasteTypes,
      processingTimeMs: result.processingTimeMs,
    });
  }

  /**
   * 統計をリセット
   * @summary 統計とログをクリア
   */
  resetStats(): void {
    this.stats = this.initializeStats();
    this.log.length = 0;
  }
}

/**
 * アクティブなリデューサーを管理するストア
 */
class ReducerStore {
  private reducers: Map<string, TrajectoryReducer> = new Map();

  get(runId: string): TrajectoryReducer | undefined {
    return this.reducers.get(runId);
  }

  set(runId: string, reducer: TrajectoryReducer): void {
    this.reducers.set(runId, reducer);
  }

  delete(runId: string): void {
    this.reducers.delete(runId);
  }

  has(runId: string): boolean {
    return this.reducers.has(runId);
  }
}

/** グローバルリデューサーストア */
export const globalReducerStore = new ReducerStore();

/**
 * 軌跡圧縮器を作成
 * @summary ファクトリー関数
 * @param runId 実行ID
 * @param config 設定（部分指定可）
 * @param callLLM LLM呼び出し関数
 * @returns リデューサーインスタンス
 */
export function createTrajectoryReducer(
  runId: string,
  config: Partial<TrajectoryReductionConfig> = {},
  callLLM: (prompt: string, model: string) => Promise<string>
): TrajectoryReducer {
  const trajectory = globalTrajectoryStore.getTrajectory(runId);
  const reducer = new TrajectoryReducer(config, trajectory, callLLM);
  globalReducerStore.set(runId, reducer);
  return reducer;
}

/**
 * 軌跡を一度に圧縮（バッチ処理）
 * @summary 全ステップを一括で圧縮
 * @param trajectory 軌跡ステップ配列
 * @param config 設定
 * @param callLLM LLM呼び出し関数
 * @returns 圧縮結果の配列
 */
export async function reduceTrajectory(
  trajectory: TrajectoryStep[],
  config: Partial<TrajectoryReductionConfig> = {},
  callLLM: (prompt: string, model: string) => Promise<string>
): Promise<ReductionResult[]> {
  const reducer = new TrajectoryReducer(config, trajectory, callLLM);
  const results: ReductionResult[] = [];

  // 全ステップを順に処理
  for (let step = 1; step <= trajectory.length; step++) {
    const result = await reducer.afterStepExecution(step);
    if (result) {
      results.push(result);
    }
  }

  return results;
}

/**
 * 圧縮統計をフォーマット
 * @summary 統計情報を人間可読な文字列に変換
 * @param stats 統計情報
 * @returns フォーマットされた文字列
 */
export function formatStats(stats: ReductionStats): string {
  const lines = [
    "## Trajectory Reduction Statistics",
    "",
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Total Steps | ${stats.totalSteps} |`,
    `| Compressed Steps | ${stats.compressedSteps} |`,
    `| Original Tokens | ${stats.originalTokens.toLocaleString()} |`,
    `| Compressed Tokens | ${stats.compressedTokens.toLocaleString()} |`,
    `| Tokens Saved | ${stats.tokensSaved.toLocaleString()} |`,
    `| Average Reduction | ${(stats.averageReductionRatio * 100).toFixed(1)}% |`,
    `| Reflection Calls | ${stats.reflectionCalls} |`,
    `| Processing Time | ${stats.totalProcessingTimeMs}ms |`,
    "",
    "### Waste Types",
    "",
    `| Type | Count |`,
    `|------|-------|`,
    `| Useless | ${stats.wasteTypeCounts.useless} |`,
    `| Redundant | ${stats.wasteTypeCounts.redundant} |`,
    `| Expired | ${stats.wasteTypeCounts.expired} |`,
  ];

  return lines.join("\n");
}
