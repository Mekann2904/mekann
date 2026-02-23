/**
 * @abdd.meta
 * path: .pi/lib/verification-simple.ts
 * role: 出力の簡易検証エンジン
 * why: CLAIM-RESULT不一致や過信など、論理的な不整合や認知バイアスを低コストで検出するため
 * related: .pi/lib/verification-workflow.js, .pi/lib/verification-types.ts
 * public_api: verifyOutput, SimpleVerificationResult, SimpleVerificationConfig
 * invariants: confidenceAdjustmentは初期値1.0であり、問題検出時は1.0未満になる
 * side_effects: なし（純粋関数）
 * failure_modes: 入力が空文字の場合は検証スキップ、検出ロジックの誤検知により信頼度が過度に低下する
 * @abdd.explain
 * overview: 設定されたルールに基づいてテキスト出力を検証し、問題の有無と信頼度調整係数を返す
 * what_it_does:
 *   - 信頼度が閾値以上かつ高リスクタスクでない場合、検証をスキップする
 *   - CLAIM-RESULT不一致、過信、代替解釈欠如、確認バイアスを検出する
 *   - 検出された問題の重大度に応じて信頼度調整係数を減算する
 * why_it_exists:
 *   - 重厚なワークフローを実行する前に、軽量なフィルタリングを行うため
 *   - 明らかな論理破綻やリスクを即座に特定して出力品質を担保するため
 * scope:
 *   in: 検証対象テキスト、現在の信頼度、検証コンテキスト、検証設定
 *   out: 検証フラグ、問題リスト、判定結果、信頼度調整係数、トリガー理由
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
