/**
 * @abdd.meta
 * path: .pi/lib/ul-workflow/domain/execution-strategy.ts
 * role: タスク実行戦略の決定ロジック
 * why: タスク複雑度に応じた最適な実行方法を選択するため
 * related: ./workflow-state.ts
 * public_api: determineWorkflowPhases, determineExecutionStrategy, estimateTaskComplexity
 * invariants: 複雑度判定は一貫性がある
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: 実行戦略決定の純粋関数
 * what_it_does:
 *   - タスク複雑度の推定
 *   - フェーズ構成の決定
 *   - 実行戦略（simple/dag）の決定
 * why_it_exists: タスクに適した実行方法を自動選択するため
 * scope:
 *   in: タスク文字列
 *   out: application層
 */

import type { WorkflowPhase } from "./workflow-state.js";

/**
 * タスク複雑度
 * @summary タスク複雑度
 */
export type TaskComplexity = "low" | "medium" | "high";

/**
 * 実行戦略の種類
 * @summary 実行戦略
 */
export type ExecutionStrategy = "simple" | "dag" | "full-workflow";

/**
 * 実行戦略決定結果
 * @summary 実行戦略結果
 */
export interface ExecutionStrategyResult {
  /** 選択された戦略 */
  strategy: ExecutionStrategy;
  /** フェーズ構成 */
  phases: WorkflowPhase[];
  /** DAGを使用するか */
  useDag: boolean;
  /** 判定理由 */
  reason: string;
}

/**
 * DAG信号分析結果
 * @summary DAG信号
 */
interface DagSignalAnalysis {
  hasExplicitSteps: boolean;
  hasMultipleFiles: boolean;
  needsResearch: boolean;
}

/**
 * タスクの複雑度を推定
 * @summary 複雑度推定
 * @param task - タスク文字列
 * @returns 推定された複雑度
 */
export function estimateTaskComplexity(task: string): TaskComplexity {
  const normalized = String(task || "").trim().toLowerCase();
  const wordCount = normalized.split(/\s+/).length;
  const charCount = normalized.length;

  // 高複雑度の指標
  const highComplexityIndicators = [
    /アーキテクチャ|architecture/i,
    /リファクタ|refactor/i,
    /マイグレーション|migration/i,
    /統合|integration/i,
    /複数|multiple|several/i,
    /システム全体|entire system/i,
    /再設計|redesign/i,
  ];

  // 中複雑度の指標
  const mediumComplexityIndicators = [
    /実装|implement/i,
    /追加|add|追加する/i,
    /修正|fix|modify/i,
    /更新|update/i,
    /変更|change/i,
  ];

  // 低複雑度の指標
  const lowComplexityIndicators = [
    /表示|show|display/i,
    /確認|check|verify/i,
    /取得|get|fetch/i,
    /設定|set|config/i,
  ];

  // 高複雑度チェック
  if (highComplexityIndicators.some((p) => p.test(normalized))) {
    return "high";
  }

  // 文字数・単語数による判定
  if (charCount > 200 || wordCount > 30) {
    return "high";
  }

  // 中複雑度チェック
  if (mediumComplexityIndicators.some((p) => p.test(normalized))) {
    if (charCount > 100 || wordCount > 15) {
      return "medium";
    }
    return "medium";
  }

  // 低複雑度チェック
  if (lowComplexityIndicators.some((p) => p.test(normalized))) {
    return "low";
  }

  // デフォルトは文字数で判定
  if (charCount < 50 && wordCount < 10) {
    return "low";
  }

  return "medium";
}

/**
 * タスクが明確なゴールを持つかどうかを判定
 * @summary 明確ゴール判定
 * @param task - タスク文字列
 * @returns 明確なゴールがあるかどうか
 */
export function looksLikeClearGoalTask(task: string): boolean {
  const normalized = String(task || "").trim().toLowerCase();

  // 明確なゴールを示すパターン
  const clearGoalPatterns = [
    /^add\s+/i,
    /^fix\s+/i,
    /^update\s+/i,
    /^implement\s+/i,
    /^create\s+/i,
    /^refactor\s+/i,
    /^remove\s+/i,
    /^rename\s+/i,
  ];

  // 曖昧なゴールを示すパターン
  const ambiguousPatterns = [
    /^investigate\s+/i,
    /^analyze\s+/i,
    /^review\s+/i,
    /^improve\s+/i,
    /^optimize\s+/i,
    /^\?/,
    /^how\s+/i,
    /^what\s+/i,
  ];

  if (ambiguousPatterns.some((p) => p.test(normalized))) {
    return false;
  }

  if (clearGoalPatterns.some((p) => p.test(normalized))) {
    return true;
  }

  return false;
}

/**
 * タスク規模に基づいてフェーズ構成を決定
 * @summary フェーズ決定
 * @param task - タスク文字列
 * @returns フェーズの配列
 */
export function determineWorkflowPhases(task: string): WorkflowPhase[] {
  const complexity = estimateTaskComplexity(task);
  const hasClearGoal = looksLikeClearGoalTask(task);

  switch (complexity) {
    case "low":
      if (hasClearGoal) {
        return ["research", "implement", "completed"];
      }
      return ["research", "plan", "implement", "completed"];

    case "medium":
      if (hasClearGoal) {
        return ["research", "plan", "implement", "completed"];
      }
      return ["research", "plan", "annotate", "implement", "completed"];

    case "high":
      return ["research", "plan", "annotate", "implement", "completed"];
  }
}

/**
 * DAG生成用のタスク信号分析
 * @summary DAG信号分析
 * @param task - タスク文字列
 * @returns 分析結果
 */
function analyzeDagSignals(task: string): DagSignalAnalysis {
  const normalized = task.trim();

  const stepPatterns = [
    /first.*then/i,
    /after.*implement/i,
    /\d+\.\s/,
    /まず.*それから/,
    /実装.*後/,
  ];

  const hasExplicitSteps = stepPatterns.some((p) => p.test(normalized));
  const hasMultipleFiles = /multiple|several|複数|いくつか/i.test(normalized);
  const needsResearch = /investigate|analyze|調査|分析|確認/i.test(normalized);

  return { hasExplicitSteps, hasMultipleFiles, needsResearch };
}

/**
 * タスクの複雑度に基づいて実行戦略を決定
 * @summary 戦略決定
 * @param task - タスク文字列
 * @returns 実行戦略結果
 */
export function determineExecutionStrategy(task: string): ExecutionStrategyResult {
  const complexity = estimateTaskComplexity(task);
  const signals = analyzeDagSignals(task);

  switch (complexity) {
    case "low":
      return {
        strategy: "simple",
        phases: ["implement", "completed"],
        useDag: false,
        reason: "Low complexity task - simple execution sufficient",
      };

    case "medium":
      if (signals.hasExplicitSteps || signals.hasMultipleFiles || signals.needsResearch) {
        return {
          strategy: "dag",
          phases: ["research", "plan", "implement", "completed"],
          useDag: true,
          reason: "Medium complexity with multiple components - DAG execution recommended",
        };
      }
      return {
        strategy: "simple",
        phases: ["research", "plan", "implement", "completed"],
        useDag: false,
        reason: "Medium complexity but straightforward - simple execution",
      };

    case "high":
      return {
        strategy: "dag",
        phases: ["research", "plan", "implement", "review", "completed"],
        useDag: true,
        reason: "High complexity task - DAG-based parallel execution for efficiency",
      };
  }
}
