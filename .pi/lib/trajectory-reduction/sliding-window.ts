/**
 * @abdd.meta
 * path: .pi/lib/trajectory-reduction/sliding-window.ts
 * role: スライディングウィンドウによる軌跡コンテキスト管理
 * why: リフレクションモジュールへの入力を固定長に制限し、KV Cacheを保護するため
 * related: .pi/lib/trajectory-reduction/types.ts, .pi/lib/trajectory-reduction/reflection-module.ts
 * public_api: SlidingWindowManager, createSlidingWindowManager
 * invariants: ウィンドウサイズは設定パラメータに従う
 * side_effects: なし
 * failure_modes: 不正なステップ番号
 * @abdd.explain
 * overview: 軌跡へのアクセスを固定幅ウィンドウで制限する機能
 * what_it_does:
 *   - 現在ステップから対象ステップを決定
 *   - コンテキストウィンドウ内のステップを抽出
 *   - 圧縮対象外のステップを保護
 * why_it_exists:
 *   - リフレクションのオーバーヘッドを固定するため
 *   - KV Cacheの無効化範囲を最小化するため
 * scope:
 *   in: 軌跡ステップ配列, 設定
 *   out: ウィンドウコンテキスト
 */

import type {
  TrajectoryStep,
  TrajectoryReductionConfig,
  SlidingWindowContext,
} from "./types.js";
import { countTokens } from "./serialization.js";

/**
 * スライディングウィンドウマネージャー
 * 論文のスライディングウィンドウアプローチを実装
 */
export class SlidingWindowManager {
  private readonly config: TrajectoryReductionConfig;
  private readonly trajectory: TrajectoryStep[];

  constructor(config: TrajectoryReductionConfig, trajectory: TrajectoryStep[]) {
    this.config = config;
    this.trajectory = trajectory;
  }

  /**
   * 現在のステップから圧縮対象ステップを決定
   * @summary 対象ステップ番号を計算
   * @param currentStep 現在のステップ番号
   * @returns 圧縮対象ステップ番号（条件を満たさない場合はnull）
   */
  getTargetStep(currentStep: number): number | null {
    const targetStep = currentStep - this.config.stepsAfter;

    // ステップ番号が正でない場合は対象外
    if (targetStep <= 0) {
      return null;
    }

    return targetStep;
  }

  /**
   * スライディングウィンドウコンテキストを作成
   * @summary 圧縮に必要なコンテキストを構築
   * @param currentStep 現在のステップ番号
   * @returns ウィンドウコンテキスト（条件を満たさない場合はnull）
   */
  createWindowContext(currentStep: number): SlidingWindowContext | null {
    const targetStep = this.getTargetStep(currentStep);

    if (targetStep === null) {
      return null;
    }

    // 配列インデックスに変換（ステップ番号は1始まり）
    const targetIndex = targetStep - 1;

    // 対象ステップが存在しない
    if (targetIndex < 0 || targetIndex >= this.trajectory.length) {
      return null;
    }

    const targetStepData = this.trajectory[targetIndex];

    // 閾値以下のステップはスキップ
    if (targetStepData.tokenCount <= this.config.threshold) {
      return null;
    }

    // 既に圧縮済みの場合はスキップ
    if (targetStepData.compressed) {
      return null;
    }

    // ウィンドウ範囲を計算
    const windowStart = Math.max(0, targetIndex - this.config.stepsBefore);
    const windowEnd = Math.min(this.trajectory.length, currentStep);
    const windowSteps = this.trajectory.slice(windowStart, windowEnd);

    // コンテキストが大きすぎる場合は切り詰め
    const trimmedSteps = this.trimToMaxTokens(windowSteps, this.config.maxContextTokens);

    return {
      targetStep,
      steps: trimmedSteps,
      currentStep,
      windowStart: windowStart + 1, // 1始まりに変換
      windowEnd,
    };
  }

  /**
   * トークン数制限内に収めるようステップを切り詰め
   * @summary 最大トークン数以内に制限
   * @param steps ステップ配列
   * @param maxTokens 最大トークン数
   * @returns 切り詰められたステップ配列
   */
  private trimToMaxTokens(steps: TrajectoryStep[], maxTokens: number): TrajectoryStep[] {
    let totalTokens = 0;
    const result: TrajectoryStep[] = [];

    // 対象ステップ（配列の中央付近）を優先的に保持
    const targetIndex = Math.floor(steps.length / 2);

    // まず対象ステップを追加
    if (steps[targetIndex]) {
      totalTokens += steps[targetIndex].tokenCount;
      result.push(steps[targetIndex]);
    }

    // 前後に広げる
    let left = targetIndex - 1;
    let right = targetIndex + 1;

    while (left >= 0 || right < steps.length) {
      // 左側を追加
      if (left >= 0) {
        const step = steps[left];
        if (totalTokens + step.tokenCount <= maxTokens) {
          totalTokens += step.tokenCount;
          result.unshift(step);
        }
        left--;
      }

      // 右側を追加
      if (right < steps.length) {
        const step = steps[right];
        if (totalTokens + step.tokenCount <= maxTokens) {
          totalTokens += step.tokenCount;
          result.push(step);
        }
        right++;
      }

      // 制限に達したら終了
      if (totalTokens >= maxTokens) {
        break;
      }
    }

    return result;
  }

  /**
   * 圧縮すべきかどうかを判定
   * @summary 圧縮実行可否を判定
   * @param currentStep 現在のステップ番号
   * @returns 圧縮すべき場合はtrue
   */
  shouldReduce(currentStep: number): boolean {
    // 無効化されている場合はスキップ
    if (!this.config.enabled) {
      return false;
    }

    // 最小ステップ数に達していない場合はスキップ
    if (this.config.skipShortTasks && currentStep < this.config.minStepsForReduction) {
      return false;
    }

    // ターゲットステップが決定できない場合はスキップ
    const targetStep = this.getTargetStep(currentStep);
    if (targetStep === null) {
      return false;
    }

    // ウィンドウコンテキストが作成できない場合はスキップ
    const context = this.createWindowContext(currentStep);
    return context !== null;
  }

  /**
   * 現在のウィンドウ状態を取得
   * @summary デバッグ用の状態情報
   * @param currentStep 現在のステップ番号
   * @returns 状態情報
   */
  getWindowStatus(currentStep: number): {
    currentStep: number;
    targetStep: number | null;
    windowStart: number;
    windowEnd: number;
    windowSize: number;
    shouldReduce: boolean;
  } {
    const context = this.createWindowContext(currentStep);
    const targetStep = this.getTargetStep(currentStep);

    return {
      currentStep,
      targetStep,
      windowStart: context?.windowStart ?? 0,
      windowEnd: context?.windowEnd ?? 0,
      windowSize: context?.steps.length ?? 0,
      shouldReduce: this.shouldReduce(currentStep),
    };
  }

  /**
   * 軌跡の統計情報を取得
   * @summary 現在の軌跡状態の統計
   * @returns 統計情報
   */
  getTrajectoryStats(): {
    totalSteps: number;
    totalTokens: number;
    compressedSteps: number;
    averageTokensPerStep: number;
  } {
    const totalSteps = this.trajectory.length;
    const totalTokens = this.trajectory.reduce((sum, s) => sum + s.tokenCount, 0);
    const compressedSteps = this.trajectory.filter((s) => s.compressed).length;

    return {
      totalSteps,
      totalTokens,
      compressedSteps,
      averageTokensPerStep: totalSteps > 0 ? Math.round(totalTokens / totalSteps) : 0,
    };
  }
}

/**
 * スライディングウィンドウマネージャーを作成
 * @summary ファクトリー関数
 * @param config 設定
 * @param trajectory 軌跡ステップ配列
 * @returns マネージャーインスタンス
 */
export function createSlidingWindowManager(
  config: TrajectoryReductionConfig,
  trajectory: TrajectoryStep[]
): SlidingWindowManager {
  return new SlidingWindowManager(config, trajectory);
}

/**
 * グローバルな軌跡ストア（簡易実装）
 * 実際の実装では、subagents.ts等から注入される
 */
class GlobalTrajectoryStore {
  private trajectories: Map<string, TrajectoryStep[]> = new Map();

  getTrajectory(runId: string): TrajectoryStep[] {
    return this.trajectories.get(runId) ?? [];
  }

  setTrajectory(runId: string, steps: TrajectoryStep[]): void {
    this.trajectories.set(runId, steps);
  }

  addStep(runId: string, step: TrajectoryStep): void {
    const trajectory = this.getTrajectory(runId);
    trajectory.push(step);
    this.setTrajectory(runId, trajectory);
  }

  updateStep(runId: string, stepIndex: number, content: string): void {
    const trajectory = this.getTrajectory(runId);
    if (stepIndex >= 0 && stepIndex < trajectory.length) {
      trajectory[stepIndex].content = content;
      trajectory[stepIndex].tokenCount = countTokens(content);
      trajectory[stepIndex].compressed = true;
    }
  }

  clearTrajectory(runId: string): void {
    this.trajectories.delete(runId);
  }
}

/** グローバルストアインスタンス */
export const globalTrajectoryStore = new GlobalTrajectoryStore();
