/**
 * @abdd.meta
 * path: .pi/lib/verification-simple.ts
 * role: 同期検証モジュール（検証ワークフローの簡易実装）
 * why: 1924行の検証コードが実質ダミー実装だったため、静的パターン検出のみで即座に効果を得る
 * related: .pi/lib/verification-workflow.ts, .pi/extensions/agent-teams/team-orchestrator.ts, .pi/extensions/subagents/task-execution.ts
 * public_api: verifyOutput, simpleVerificationHook, SimpleVerificationResult
 * invariants: 検出関数は同期的に実行、外部依存なし
 * side_effects: なし（純粋関数）
 * failure_modes: 検出関数例外時はpassを返す
 * @abdd.explain
 * overview: verification-workflow.tsの検出関数を直接呼び出す簡易検証モジュール
 * what_it_does:
 *   - CLAIM-RESULT不一致、過信、代替解釈欠如、確認バイアスを検出
 *   - 同期的に実行され、外部エージェントを必要としない
 *   - 検証結果に基づいて信頼度を調整
 * why_it_exists:
 *   - 910行の検証フックが実質ダミー実装だったため
 *   - 即座に使用可能な検証機能を提供するため
 * scope:
 *   in: 出力文字列、信頼度、コンテキスト
 *   out: 検証結果（triggered, issues, verdict）
 */

import {
  detectClaimResultMismatch,
  detectOverconfidence,
  detectMissingAlternatives,
  detectConfirmationBias,
  isHighStakesTask,
  type VerificationContext,
} from "./verification-workflow.js";

/**
 * 簡易検証結果
 */
export interface SimpleVerificationResult {
  /** 検証がトリガーされたか */
  triggered: boolean;
  /** 検出された問題のリスト */
  issues: VerificationIssue[];
  /** 判定結果 */
  verdict: "pass" | "pass-with-warnings" | "needs-review" | "blocked";
  /** 信頼度調整係数 */
  confidenceAdjustment: number;
  /** トリガー理由 */
  triggerReason: string;
}

/**
 * 検出された問題
 */
export interface VerificationIssue {
  type: string;
  severity: "low" | "medium" | "high";
  description: string;
}

/**
 * 簡易検証設定
 */
export interface SimpleVerificationConfig {
  /** CLAIM-RESULT不一致検出を有効化 */
  enableMismatchDetection: boolean;
  /** 過信検出を有効化 */
  enableOverconfidenceDetection: boolean;
  /** 代替解釈欠如検出を有効化 */
  enableAlternativesDetection: boolean;
  /** 確認バイアス検出を有効化 */
  enableBiasDetection: boolean;
  /** 高リスクタスクで常に検証 */
  alwaysVerifyHighStakes: boolean;
  /** 検証をスキップする信頼度閾値 */
  skipThreshold: number;
}

const DEFAULT_CONFIG: SimpleVerificationConfig = {
  enableMismatchDetection: true,
  enableOverconfidenceDetection: true,
  enableAlternativesDetection: true,
  enableBiasDetection: true,
  alwaysVerifyHighStakes: true,
  skipThreshold: 0.95,
};

/**
 * 出力を簡易検証する
 * @summary 簡易検証実行
 * @param output - 検証対象の出力文字列
 * @param confidence - 現在の信頼度（0-1）
 * @param context - 検証コンテキスト
 * @param config - 検証設定（省略時はデフォルト）
 * @returns 検証結果
 */
export function verifyOutput(
  output: string,
  confidence: number,
  context: VerificationContext,
  config: Partial<SimpleVerificationConfig> = {}
): SimpleVerificationResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // 高信頼度の場合はスキップ
  if (confidence >= cfg.skipThreshold && !isHighStakesTask(context.task ?? "")) {
    return {
      triggered: false,
      issues: [],
      verdict: "pass",
      confidenceAdjustment: 1.0,
      triggerReason: "high-confidence-skip",
    };
  }

  // 空出力の場合はスキップ
  if (!output || output.trim().length === 0) {
    return {
      triggered: false,
      issues: [],
      verdict: "pass",
      confidenceAdjustment: 1.0,
      triggerReason: "empty-output-skip",
    };
  }

  const issues: VerificationIssue[] = [];
  let confidenceAdj = 1.0;

  try {
    // 1. CLAIM-RESULT不一致検出
    if (cfg.enableMismatchDetection) {
      const mismatch = detectClaimResultMismatch(output);
      if (mismatch.detected) {
        issues.push({
          type: "claim-result-mismatch",
          severity: "high",
          description: mismatch.reason,
        });
        confidenceAdj *= 0.7;
      }
    }

    // 2. 過信検出
    if (cfg.enableOverconfidenceDetection) {
      const overconfidence = detectOverconfidence(output);
      if (overconfidence.detected) {
        issues.push({
          type: "overconfidence",
          severity: "medium",
          description: overconfidence.reason,
        });
        confidenceAdj *= 0.85;
      }
    }

    // 3. 代替解釈欠如検出
    if (cfg.enableAlternativesDetection) {
      const missing = detectMissingAlternatives(output);
      if (missing.detected) {
        issues.push({
          type: "missing-alternatives",
          severity: "low",
          description: missing.reason,
        });
        confidenceAdj *= 0.9;
      }
    }

    // 4. 確認バイアス検出
    if (cfg.enableBiasDetection) {
      const bias = detectConfirmationBias(output);
      if (bias.detected) {
        issues.push({
          type: "confirmation-bias",
          severity: "medium",
          description: bias.reason,
        });
        confidenceAdj *= 0.8;
      }
    }
  } catch (error) {
    // 検出関数エラー時はパス扱い
    return {
      triggered: false,
      issues: [],
      verdict: "pass",
      confidenceAdjustment: 1.0,
      triggerReason: `detection-error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  // 高リスクタスクの場合は常にneeds-review
  const isHighStakes = context.task ? isHighStakesTask(context.task) : false;

  // 判定
  let verdict: SimpleVerificationResult["verdict"];
  if (issues.some((i) => i.severity === "high") || (isHighStakes && issues.length > 0)) {
    verdict = "needs-review";
  } else if (issues.length > 0) {
    verdict = "pass-with-warnings";
  } else {
    verdict = "pass";
  }

  return {
    triggered: issues.length > 0 || isHighStakes,
    issues,
    verdict,
    confidenceAdjustment: confidenceAdj,
    triggerReason:
      issues.length > 0
        ? `issues-detected: ${issues.map((i) => i.type).join(",")}`
        : isHighStakes
          ? "high-stakes-task"
          : "no-issues",
  };
}

/**
 * サブエージェント/チーム実行後の簡易検証フック
 * @summary 簡易検証フック
 * @param output - 検証対象の出力
 * @param confidence - 信頼度
 * @param context - コンテキスト
 * @returns 検証結果（簡易版）
 */
export async function simpleVerificationHook(
  output: string,
  confidence: number,
  context: VerificationContext
): Promise<{
  triggered: boolean;
  result?: SimpleVerificationResult;
  error?: string;
}> {
  try {
    const result = verifyOutput(output, confidence, context);
    return {
      triggered: result.triggered,
      result,
    };
  } catch (error) {
    return {
      triggered: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
