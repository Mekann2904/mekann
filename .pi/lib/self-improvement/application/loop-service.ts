/**
 * @abdd.meta
 * path: .pi/lib/self-improvement/application/loop-service.ts
 * role: 自己改善ループのアプリケーションサービス
 * why: クリーンアーキテクチャのApplication Business Rules層として、ループの制御フローを実装するため
 * related: ../domain/types.ts, ../adapters/git-adapter.ts, ../adapters/file-adapter.ts
 * public_api: SelfImprovementLoopService, createLoopService
 * invariants: ループは停止条件が満たされるまで継続する
 * side_effects: LLM API呼び出し、Git操作、ファイルシステム操作
 * failure_modes: LLM APIエラー、タイムアウト、Git操作失敗
 * @abdd.explain
 * overview: 自己改善ループのアプリケーションサービス
 * what_it_does:
 *   - ループの開始・停止制御
 *   - サイクルの実行管理
 *   - コミット作成のオーケストレーション
 *   - ログ出力の管理
 * why_it_exists:
 *   - ドメインロジックとインフラストラクチャを結びつけ、ユースケースを実現するため
 * scope:
 *   in: domain層, adapters層
 *   out: extensions/self-improvement-loop.ts
 */

import type {
  SelfImprovementLoopState,
  CycleResult,
  PerspectiveResult,
  ActiveAutonomousRun,
  SelfImprovementModel,
  SelfImprovementLoopConfig,
  GitOperations,
  FileOperations,
  LLMOperations,
} from "../domain/types.js";
import {
  DEFAULT_LOOP_CONFIG,
  DEFAULT_MODEL,
  createRunId,
  initializeLoopState,
  calculateCycleAverageScore,
  detectStagnation,
  PERSPECTIVES,
  parsePerspectiveScores,
  parseNextFocus,
  parseLoopStatus,
} from "../domain/index.js";
import {
  GitAdapter,
  createGitAdapter,
  FileAdapter,
  createFileAdapter,
  generateLogHeader,
  generateCycleLog,
  generateFooterLog,
  buildAutonomousCyclePrompt,
  buildPerspectivePrompt,
  buildULPhaseMarker,
  buildResearchPrompt,
  buildPlanPrompt,
  buildImplementPrompt,
} from "../adapters/index.js";

// ============================================================================
// 型定義
// ============================================================================

/** ループサービスの依存関係 */
export interface LoopServiceDependencies {
  gitOps: GitOperations;
  fileOps: FileOperations;
  llmOps: LLMOperations;
}

/** ループサービスの設定 */
export interface LoopServiceConfig {
  config: Required<SelfImprovementLoopConfig>;
  model: SelfImprovementModel;
}

// ============================================================================
// SelfImprovementLoopService クラス
// ============================================================================

/**
 * 自己改善ループのアプリケーションサービス
 * 
 * ドメインロジックとインフラストラクチャを結びつけ、
 * 自己改善ループのユースケースを実現する
 */
export class SelfImprovementLoopService {
  private gitOps: GitOperations;
  private fileOps: FileOperations;
  private llmOps: LLMOperations;
  private config: Required<SelfImprovementLoopConfig>;
  private model: SelfImprovementModel;

  /**
   * @param deps 依存関係
   * @param loopConfig ループ設定
   */
  constructor(
    deps: LoopServiceDependencies,
    loopConfig: LoopServiceConfig
  ) {
    this.gitOps = deps.gitOps;
    this.fileOps = deps.fileOps;
    this.llmOps = deps.llmOps;
    this.config = loopConfig.config;
    this.model = loopConfig.model;
  }

  /**
   * 自己改善ループを実行する
   * @summary ループを実行
   * @param task タスク内容
   * @param signal 中断シグナル
   * @returns 最終状態
   */
  async runLoop(
    task: string,
    signal?: AbortSignal
  ): Promise<SelfImprovementLoopState> {
    const state = initializeLoopState(task);

    // ログファイルを作成
    const logPath = this.createLogPath(state.runId);
    this.writeLogHeader(logPath, state);

    console.log(`[loop-service] Started: runId=${state.runId}`);

    let stagnationCount = 0;
    const previousScores: number[] = [];

    try {
      while (!state.stopRequested && state.currentCycle < this.config.maxCycles) {
        // 中断チェック
        if (signal?.aborted) {
          state.stopRequested = true;
          state.stopReason = "user_request";
          break;
        }

        // 停止信号チェック
        if (this.checkStopSignal()) {
          state.stopRequested = true;
          state.stopReason = "user_request";
          break;
        }

        state.currentCycle++;

        // サイクル開始時の変更ファイルを記録
        state.filesChangedBeforeCycle = new Set(
          await this.gitOps.getChangedFiles(process.cwd())
        );

        // サイクル実行
        const cycleResult = await this.runCycle(state, signal);

        // 停滞検出
        const avgScore = calculateCycleAverageScore(cycleResult.perspectiveResults);
        previousScores.push(avgScore);

        const stagnationResult = detectStagnation(
          previousScores,
          this.config.stagnationThreshold,
          this.config.maxStagnationCount
        );

        if (stagnationResult.isStagnant) {
          state.stopReason = "stagnation";
          break;
        }
        stagnationCount = stagnationResult.stagnationCount;

        // ログ記録
        this.appendCycleLog(logPath, state, cycleResult);

        // Git コミット
        if (this.config.autoCommit && cycleResult.improvements.length > 0) {
          const hash = await this.createCommit(state, cycleResult);
          if (hash) {
            state.lastCommitHash = hash;
            cycleResult.commitHash = hash;
          }
        }

        // 状態更新
        state.lastUpdatedAt = new Date().toISOString();
        state.totalImprovements += cycleResult.improvements.length;
        state.summary = cycleResult.summary;

        if (cycleResult.metacognitiveCheck) {
          state.lastMetacognitiveCheck = cycleResult.metacognitiveCheck;
          state.lastInferenceDepthScore = cycleResult.inferenceDepthScore;
        }

        // 継続判定
        if (!cycleResult.shouldContinue) {
          state.stopReason = cycleResult.stopReason;
          break;
        }

        console.log(`[loop-service] Cycle ${state.currentCycle} completed. Score: ${(avgScore * 100).toFixed(0)}%`);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("Aborted")) {
        state.stopRequested = true;
        state.stopReason = "user_request";
      } else {
        state.stopReason = "error";
        console.error(`[loop-service] Error: ${errorMessage}`);
      }
    }

    // 最終ログ
    this.writeLogFooter(logPath, state);
    this.clearStopSignal();

    console.log(`[loop-service] Finished: runId=${state.runId}, cycles=${state.currentCycle}`);

    return state;
  }

  /**
   * 単一サイクルを実行する
   * @summary サイクルを実行
   * @param state ループ状態
   * @param signal 中断シグナル
   * @returns サイクル結果
   */
  private async runCycle(
    state: SelfImprovementLoopState,
    signal?: AbortSignal
  ): Promise<CycleResult> {
    const perspectiveResults: PerspectiveResult[] = [];
    const allImprovements: string[] = [];

    // 7つの視座を順次適用
    for (let i = 0; i < PERSPECTIVES.length; i++) {
      if (signal?.aborted) break;

      const perspective = state.perspectiveStates[i];
      if (!perspective) continue;

      const prompt = buildPerspectivePrompt(
        perspective,
        state.task,
        perspectiveResults,
        state.lastMetacognitiveCheck
      );

      try {
        const output = await this.llmOps.callModel(prompt, this.model, 300000, signal);

        // 結果をパース
        const result = this.parsePerspectiveResult(perspective.name, output);
        perspectiveResults.push(result);

        // 状態を更新
        perspective.lastAppliedAt = new Date().toISOString();
        perspective.findings.push(...result.findings);
        perspective.questions.push(...result.questions);
        perspective.improvements.push(...result.improvements);
        perspective.score = result.score;

        allImprovements.push(...result.improvements);

        console.log(`[loop-service] ${perspective.displayName}: ${(result.score * 100).toFixed(0)}%`);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[loop-service] Perspective ${perspective.displayName} failed: ${errorMessage}`);

        // エラー時はデフォルトスコアで続行
        perspectiveResults.push({
          perspective: perspective.name,
          findings: [],
          questions: [],
          improvements: [],
          score: 0.3,
          output: `Error: ${errorMessage}`,
        });
        perspective.score = 0.3;
      }
    }

    // サイクルサマリー
    const avgScore = calculateCycleAverageScore(perspectiveResults);
    const summary = `Cycle ${state.currentCycle} completed. Average score: ${(avgScore * 100).toFixed(0)}%. ${allImprovements.length} improvements identified.`;

    return {
      cycleNumber: state.currentCycle,
      perspectiveResults,
      improvements: allImprovements,
      commitHash: null,
      summary,
      shouldContinue: avgScore < 0.95,
      stopReason: avgScore >= 0.95 ? "completed" : null,
    };
  }

  /**
   * 視座結果をパースする
   * @summary 視座結果をパース
   * @param perspectiveName 視座名
   * @param output LLM出力
   * @returns 視座結果
   */
  private parsePerspectiveResult(
    perspectiveName: string,
    output: string
  ): PerspectiveResult {
    // FINDINGS セクションを抽出
    const findingsMatch = output.match(/FINDINGS:\s*([\s\S]*?)(?=QUESTIONS:|IMPROVEMENTS:|SCORE:|SUMMARY:|$)/i);
    const findings = findingsMatch?.[1]
      ?.split("\n")
      .map((l) => l.replace(/^[-\s]+/, "").trim())
      .filter((l) => l.length > 0) ?? [];

    // QUESTIONS セクションを抽出
    const questionsMatch = output.match(/QUESTIONS:\s*([\s\S]*?)(?=IMPROVEMENTS:|SCORE:|SUMMARY:|$)/i);
    const questions = questionsMatch?.[1]
      ?.split("\n")
      .map((l) => l.replace(/^[-\s]+/, "").trim())
      .filter((l) => l.length > 0) ?? [];

    // IMPROVEMENTS セクションを抽出
    const improvementsMatch = output.match(/IMPROVEMENTS:\s*([\s\S]*?)(?=SCORE:|SUMMARY:|$)/i);
    const improvements = improvementsMatch?.[1]
      ?.split("\n")
      .map((l) => l.replace(/^[-\s]+/, "").trim())
      .filter((l) => l.length > 0) ?? [];

    // SCORE を抽出
    const scoreMatch = output.match(/SCORE:\s*(\d{1,3})/i);
    const score = scoreMatch ? Math.min(100, Math.max(0, parseInt(scoreMatch[1]!, 10))) / 100 : 0.5;

    return {
      perspective: perspectiveName as any,
      findings,
      questions,
      improvements,
      score,
      output,
    };
  }

  /**
   * コミットを作成する
   * @summary コミットを作成
   * @param state ループ状態
   * @param cycleResult サイクル結果
   * @returns コミットハッシュまたはnull
   */
  private async createCommit(
    state: SelfImprovementLoopState,
    cycleResult: CycleResult
  ): Promise<string | null> {
    const message = this.generateCommitMessage(state, cycleResult);
    return this.gitOps.createCommit(message, process.cwd());
  }

  /**
   * コミットメッセージを生成する
   * @summary コミットメッセージを生成
   * @param state ループ状態
   * @param cycleResult サイクル結果
   * @returns コミットメッセージ
   */
  private generateCommitMessage(
    state: SelfImprovementLoopState,
    cycleResult: CycleResult
  ): string {
    const avgScore = calculateCycleAverageScore(cycleResult.perspectiveResults);
    
    return `chore(self-improvement-loop): implement cycle ${state.currentCycle} improvements

## Changes
Self-improvement loop cycle ${state.currentCycle} improvements.

## Context
- Run ID: ${state.runId}
- Average Score: ${(avgScore * 100).toFixed(0)}%
- Improvements: ${cycleResult.improvements.length}

runId: ${state.runId}`;
  }

  // ============================================================================
  // ファイル操作ヘルパー
  // ============================================================================

  private createLogPath(runId: string): string {
    return `${this.config.logDir}/run-${runId}.md`;
  }

  private writeLogHeader(path: string, state: SelfImprovementLoopState): void {
    this.fileOps.ensureDir(this.config.logDir);
    const header = generateLogHeader(
      state.runId,
      state.task,
      this.config.maxCycles,
      this.config.autoCommit,
      true, // ulMode
      true, // autoApprove
      { provider: this.model.provider, id: this.model.id }
    );
    this.fileOps.writeFile(path, header);
  }

  private appendCycleLog(
    path: string,
    state: SelfImprovementLoopState,
    result: CycleResult
  ): void {
    const timestamp = new Date().toISOString();
    const cycleLog = generateCycleLog(
      result.cycleNumber,
      timestamp,
      result.commitHash,
      result.perspectiveResults,
      result.summary,
      result.shouldContinue,
      result.stopReason
    );
    this.fileOps.appendFile(path, cycleLog);
  }

  private writeLogFooter(path: string, state: SelfImprovementLoopState): void {
    const footer = generateFooterLog({
      lastUpdatedAt: state.lastUpdatedAt,
      currentCycle: state.currentCycle,
      totalImprovements: state.totalImprovements,
      stopReason: state.stopReason,
      lastCommitHash: state.lastCommitHash,
      summary: state.summary,
      perspectiveStates: state.perspectiveStates.map((ps) => ({
        displayName: ps.displayName,
        score: ps.score,
        findings: ps.findings.length,
        improvements: ps.improvements.length,
      })),
    });
    this.fileOps.appendFile(path, footer);
  }

  private checkStopSignal(): boolean {
    const stopPath = `${process.cwd()}/${this.config.stopSignalPath}`;
    if (this.fileOps.exists(stopPath)) {
      try {
        const content = this.fileOps.readFile(stopPath).trim();
        return content === "STOP" || content === "stop";
      } catch {
        return false;
      }
    }
    return false;
  }

  private clearStopSignal(): void {
    const stopPath = `${process.cwd()}/${this.config.stopSignalPath}`;
    if (this.fileOps.exists(stopPath)) {
      try {
        this.fileOps.writeFile(stopPath, "");
      } catch {
        // ignore
      }
    }
  }
}

// ============================================================================
// ファクトリ関数
// ============================================================================

/**
 * SelfImprovementLoopServiceを作成する
 * @summary LoopServiceを作成
 * @param llmOps LLM操作インターフェース
 * @param config ループ設定（オプション）
 * @param model モデル設定（オプション）
 * @returns SelfImprovementLoopServiceのインスタンス
 */
export function createLoopService(
  llmOps: LLMOperations,
  config?: Partial<SelfImprovementLoopConfig>,
  model?: Partial<SelfImprovementModel>
): SelfImprovementLoopService {
  const gitOps = createGitAdapter();
  const fileOps = createFileAdapter();

  const fullConfig: Required<SelfImprovementLoopConfig> = {
    ...DEFAULT_LOOP_CONFIG,
    ...config,
  };

  const fullModel: SelfImprovementModel = {
    ...DEFAULT_MODEL,
    ...model,
  };

  return new SelfImprovementLoopService(
    { gitOps, fileOps, llmOps },
    { config: fullConfig, model: fullModel }
  );
}
