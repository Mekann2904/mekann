/**
 * @abdd.meta
 * path: .pi/extensions/agent-teams/bond-integration.ts
 * role: チーム実行結果に対するボンド分析機能の統合と設定管理
 * why: エージェント間の結合関係やシステム安定性を客観的に評価し、診断情報を拡張するため
 * related: ./storage.js, ../../lib/reasoning-bonds-evaluator.js
 * public_api: BondAnalysisConfig, DEFAULT_BOND_CONFIG, getBondConfig, BondDiagnostics, augmentDiagnosticsWithBondAnalysis
 * invariants: config.enabledがfalseの場合、analyzedはfalseになる。warningsとrecommendationsは常に配列である。
 * side_effects: 環境変数を読み込む。外部の評価ロジックを実行する。システム状態には書き込まない。
 * failure_modes: 環境変数の不正値（数値変換エラー）、評価ロジックでの例外、完了メンバーが0件の場合のデータ不足
 * @abdd.explain
 * overview: チームメンバーの実行結果を入力とし、ボンド分析エンジンを呼び出して安定性スコアや推奨事項を含む診断情報を生成するモジュール。
 * what_it_does:
 *   - 環境変数またはデフォルト値からボンド分析の設定（有効化、閾値など）を解決する
 *   - 状態がcompletedのメンバー結果を抽出し、ボンド評価用のデータ形式に変換する
 *   - 分析有効時は評価ロジックを実行し、無効時は固定のデフォルト値を返す
 *   - 設定された閾値に基づいて警告や推奨事項を含む診断オブジェクトを構築する
 * why_it_exists:
 *   - エージェント間の連携品質を定量化し、チーム全体の健全性を可視化する
 *   - 分析ロジック（reasoning-bonds-evaluator）をチームシステムへ疎結合に統合する
 *   - 実行環境に応じて分析挙動を環境変数で制御可能にする
 * scope:
 *   in: TeamMemberResultの配列、分析設定オブジェクトまたは環境変数
 *   out: BondDiagnostics（安定性スコア、評価、警告、推奨事項を含む）
 */

import type { TeamMemberResult } from "./storage.js";
import {
  evaluateTeamBonds,
  generateBondReport,
  type BondEvaluationResult,
} from "../../lib/reasoning-bonds-evaluator.js";

/**
 * ボンド分析の設定
 */
export interface BondAnalysisConfig {
  /** ボンド分析を有効にするか（デフォルト: true） */
  enabled: boolean;
  /** 詳細ログを出力するか */
  verbose: boolean;
  /** 構造的カオスの警告閾値（0-1、デフォルト: 0.3） */
  chaosWarningThreshold: number;
  /** 低安定性の警告閾値（0-1、デフォルト: 0.5） */
  lowStabilityThreshold: number;
}

/**
 * デフォルト設定
 */
export const DEFAULT_BOND_CONFIG: BondAnalysisConfig = {
  enabled: true,
  verbose: false,
  chaosWarningThreshold: 0.3,
  lowStabilityThreshold: 0.5,
};

/**
 * 環境変数から設定を読み込み
 */
export function getBondConfig(): BondAnalysisConfig {
  return {
    enabled: process.env.PI_BOND_ANALYSIS_ENABLED !== "false",
    verbose: process.env.PI_BOND_ANALYSIS_VERBOSE === "true",
    chaosWarningThreshold: parseFloat(process.env.PI_BOND_CHAOS_THRESHOLD || "0.3"),
    lowStabilityThreshold: parseFloat(process.env.PI_BOND_STABILITY_THRESHOLD || "0.5"),
  };
}

/**
 * ボンド分析の結果を含む拡張診断情報
 */
export interface BondDiagnostics {
  /** ボンド分析が実行されたか */
  analyzed: boolean;
  /** 構造安定性スコア（0-1） */
  stabilityScore: number;
  /** 全体的な評価 */
  overallAssessment: "optimal" | "suboptimal" | "unstable" | "chaotic";
  /** エントロピー収束速度 */
  entropyConvergenceRate: number;
  /** 支配的ボンドタイプ */
  dominantBond: string;
  /** 警告メッセージ */
  warnings: string[];
  /** 推奨事項 */
  recommendations: string[];
  /** 詳細レポート（Markdown） */
  detailedReport?: string;
}

/**
 * チームメンバーの実行結果にボンド分析を追加
 * @summary ボンド分析で診断拡張
 * @param results - チームメンバーの実行結果
 * @param config - ボンド分析設定
 * @returns ボンド診断情報
 */
export function augmentDiagnosticsWithBondAnalysis(
  results: TeamMemberResult[],
  config: BondAnalysisConfig = DEFAULT_BOND_CONFIG
): BondDiagnostics {
  // 分析が無効な場合は空の結果を返す
  if (!config.enabled) {
    return {
      analyzed: false,
      stabilityScore: 0,
      overallAssessment: "optimal",
      entropyConvergenceRate: 0,
      dominantBond: "unknown",
      warnings: [],
      recommendations: [],
    };
  }

  // 完了したメンバーの結果のみを抽出
  const completedResults = results.filter(
    r => r.status === "completed" && r.output
  );

  if (completedResults.length === 0) {
    return {
      analyzed: false,
      stabilityScore: 0,
      overallAssessment: "optimal",
      entropyConvergenceRate: 0,
      dominantBond: "unknown",
      warnings: ["ボンド分析に十分な完了メンバーがいません"],
      recommendations: [],
    };
  }

  try {
    // TeamMemberResult を TeamMemberResultForBond に変換
    const bondResults = completedResults.map(r => ({
      memberId: r.memberId,
      role: r.role,
      output: r.output || "",
      confidence: r.diagnostics?.confidence,
      status: r.status,
    }));

    // ボンド評価を実行
    const evaluation = evaluateTeamBonds(bondResults);

    // 警告を生成
    const warnings: string[] = [];
    if (evaluation.stabilityScore < config.lowStabilityThreshold) {
      warnings.push(
        `構造安定性が低いです（スコア: ${(evaluation.stabilityScore * 100).toFixed(1)}%）。` +
        `委任フローの品質に影響する可能性があります。`
      );
    }

    if (evaluation.overallAssessment === "chaotic") {
      warnings.push(
        "【重要】構造的カオスが検出されました。" +
        "チームメンバー間で推論パターンが競合している可能性があります。"
      );
    }

    if (!evaluation.entropyMetrics.isConverging) {
      warnings.push(
        "議論が収束していません。" +
        "最終判定の前に、明確な合意形成ステップを検討してください。"
      );
    }

    // 支配的ボンドを特定
    let dominantBond = "normal-operation";
    let maxActual = 0;
    for (const [type, health] of Object.entries(evaluation.distributionHealth)) {
      if (health.actual > maxActual) {
        maxActual = health.actual;
        dominantBond = type;
      }
    }

    // 詳細レポート（verboseモードの場合のみ）
    const detailedReport = config.verbose ? generateBondReport(evaluation) : undefined;

    if (config.verbose && warnings.length > 0) {
      console.warn("[bond-analysis] Warnings:", {
        warnings,
        stabilityScore: evaluation.stabilityScore,
        overallAssessment: evaluation.overallAssessment,
      });
    }

    return {
      analyzed: true,
      stabilityScore: evaluation.stabilityScore,
      overallAssessment: evaluation.overallAssessment,
      entropyConvergenceRate: evaluation.entropyMetrics.convergenceRate,
      dominantBond,
      warnings,
      recommendations: evaluation.recommendations,
      detailedReport,
    };
  } catch (error) {
    console.error("[bond-analysis] Analysis failed:", error);
    return {
      analyzed: false,
      stabilityScore: 0,
      overallAssessment: "optimal",
      entropyConvergenceRate: 0,
      dominantBond: "unknown",
      warnings: [`ボンド分析中にエラーが発生しました: ${error}`],
      recommendations: [],
    };
  }
}

/**
 * ボンド分析結果をJudge判定に反映するための重み調整
 * @summary ボンド分析による重み調整
 * @param bondDiagnostics - ボンド診断情報
 * @param baseConfidence - 基本信頼度
 * @returns 調整された信頼度
 */
export function adjustConfidenceByBondAnalysis(
  bondDiagnostics: BondDiagnostics,
  baseConfidence: number
): number {
  if (!bondDiagnostics.analyzed) {
    return baseConfidence;
  }

  // 構造安定性に基づいて信頼度を調整
  const stabilityFactor = bondDiagnostics.stabilityScore;

  // カオス状態の場合は大幅に信頼度を下げる
  const chaosPenalty = bondDiagnostics.overallAssessment === "chaotic" ? 0.3 : 0;

  // 調整された信頼度
  const adjusted = baseConfidence * stabilityFactor - chaosPenalty;

  // 0-1の範囲にクランプ
  return Math.max(0, Math.min(1, adjusted));
}

/**
 * ボンド分析結果をJudge説明に追加
 * @summary Judge説明にボンド分析を追加
 * @param bondDiagnostics - ボンド診断情報
 * @returns 説明テキスト
 */
export function formatBondAnalysisForJudgeExplanation(
  bondDiagnostics: BondDiagnostics
): string {
  if (!bondDiagnostics.analyzed) {
    return "";
  }

  const lines: string[] = [
    "## 推論ボンド分析",
    "",
    `- **構造安定性**: ${(bondDiagnostics.stabilityScore * 100).toFixed(1)}%`,
    `- **評価**: ${bondDiagnostics.overallAssessment}`,
    `- **支配的ボンド**: ${bondDiagnostics.dominantBond}`,
    `- **エントロピー収束率**: ${(bondDiagnostics.entropyConvergenceRate * 100).toFixed(1)}%`,
  ];

  if (bondDiagnostics.warnings.length > 0) {
    lines.push("");
    lines.push("### 警告");
    for (const warning of bondDiagnostics.warnings) {
      lines.push(`- ${warning}`);
    }
  }

  if (bondDiagnostics.recommendations.length > 0) {
    lines.push("");
    lines.push("### 推奨事項");
    for (const rec of bondDiagnostics.recommendations) {
      lines.push(`- ${rec}`);
    }
  }

  return lines.join("\n");
}

/**
 * ボンド分析が有効かどうかを判定
 */
export function isBondAnalysisEnabled(): boolean {
  return getBondConfig().enabled;
}
