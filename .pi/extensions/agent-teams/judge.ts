/**
 * @abdd.meta
 * path: .pi/extensions/agent-teams/judge.ts
 * role: チーム実行結果の不確実性計算と最終判定を行うモジュール
 * why: SRP準拠のため判定ロジックを分離し、重み付け設定の拡張性と判断根拠の説明可能性を確保するため
 * related: .pi/extensions/agent-teams.ts, .pi/extensions/agent-teams/storage.ts, .pi/lib/text-parsing.ts
 * public_api: JudgeWeightConfig, DEFAULT_JUDGE_WEIGHTS, getJudgeWeights, computeProxyUncertaintyWithExplainability (実装コードにあるため推測含む), type exports (TeamDefinition等), utility exports (clampConfidence等)
 * invariants: 内部・相互・システムの各重みは合計が1.0になる構造を維持する, しきい値は0.0から1.0の範囲内である
 * side_effects: 外部からカスタム重み設定を読み込み、モジュール内キャッシュ `customWeights` を更新する
 * failure_modes: 重み設定の整合性が取れない場合の計算結果の不正、キャッシュされた設定と実行環境の不整合
 * @abdd.explain
 * overview: エージェントチームの実行結果に対し、設定可能な重み付けに基づいて不確実性を算出し、最終的な成功/失敗の判定を行うモジュールです。
 * what_it_does:
 *   - TeamMemberResult, TeamStrategy, TeamDefinition 等の型定義を再エクスポートする
 *   - clampConfidence, parseUnitInterval 等のテキスト解析ユーティリティを再エクスポートする
 *   - 判定重み設定 (JudgeWeightConfig) を定義し、デフォルト値 (DEFAULT_JUDGE_WEIGHTS) を提供する
 *   - カスタム重み設定のキャッシュ管理および取得機能 (getJudgeWeights) を提供する
 *   - 内部・相互・システムレベルの指標に基づき、不確実性と判定結果を算出する (実装詳細は後続コード)
 * why_it_exists:
 *   - 複雑な判定ロジックを単一責任原則 (SRP) に基づいて分離し、コードの保守性を向上させるため
 *   - 判定基準の重み付けを外部設定可能にし、柔軟性と説明可能性を高めるため
 * scope:
 *   in: エージェントチームの実行結果、判定重み設定、環境変数やファイルからのカスタム設定
 *   out: 不確実性スコア、最終判定結果、判定根拠の詳細情報
 */

/**
 * Agent team judge module.
 * Handles uncertainty calculation and final judgment logic.
 *
 * Extracted from agent-teams.ts for SRP compliance.
 * Related: .pi/extensions/agent-teams.ts, .pi/extensions/agent-teams/storage.ts
 *
 * Enhanced with explainability (P0-3 improvement).
 * - Judge weights are now configurable via JudgeWeightConfig
 * - computeProxyUncertaintyWithExplainability provides detailed breakdown
 */

import type {
  TeamDefinition,
  TeamFinalJudge,
  TeamMemberResult,
  TeamStrategy,
} from "./storage";
import { existsSync, readFileSync } from "node:fs";
import { resolve, isAbsolute } from "node:path";
import {
  clampConfidence,
  parseUnitInterval,
  extractField,
  countKeywordSignals,
} from "../../lib/text-parsing.js";

// Re-export types for external use
export type {
  TeamDefinition,
  TeamFinalJudge,
  TeamMemberResult,
  TeamStrategy,
};

// Re-export utilities that were previously defined here
export { clampConfidence, parseUnitInterval, extractField, countKeywordSignals };

// ============================================================================
// Judge Weight Configuration (P0-3)
// ============================================================================

/**
 * 審判の重み設定
 * @summary 審判の重み設定
 */
export interface JudgeWeightConfig {
  version: string;
  intraWeights: {
    failedRatio: number;
    lowConfidence: number;
    noEvidence: number;
    contradiction: number;
  };
  interWeights: {
    conflictRatio: number;
    confidenceSpread: number;
    failedRatio: number;
    noEvidence: number;
  };
  sysWeights: {
    uIntra: number;
    uInter: number;
    failedRatio: number;
  };
  collapseThresholds: {
    uIntra: number;
    uInter: number;
    uSys: number;
    failedRatio: number;
    noEvidenceRatio: number;
  };
}

/**
 * Default judge weight configuration (backward compatible).
 * These values match the original hardcoded weights.
 */
export const DEFAULT_JUDGE_WEIGHTS: JudgeWeightConfig = {
  version: "1.0.0-default",
  intraWeights: {
    failedRatio: 0.38,
    lowConfidence: 0.26,
    noEvidence: 0.20,
    contradiction: 0.16,
  },
  interWeights: {
    conflictRatio: 0.42,
    confidenceSpread: 0.28,
    failedRatio: 0.20,
    noEvidence: 0.10,
  },
  sysWeights: {
    uIntra: 0.45,
    uInter: 0.35,
    failedRatio: 0.20,
  },
  collapseThresholds: {
    uIntra: 0.55,
    uInter: 0.55,
    uSys: 0.60,
    failedRatio: 0.30,
    noEvidenceRatio: 0.50,
  },
};

/**
 * Cache for custom judge weights loaded from environment/file.
 */
let customWeights: JudgeWeightConfig | undefined;

/**
 * 重み設定を取得
 * @summary 重み設定を取得
 * @returns {JudgeWeightConfig} 現在の重み設定
 */
export function getJudgeWeights(): JudgeWeightConfig {
  // Return cached custom weights if set
  if (customWeights) {
    return customWeights;
  }

  // Try loading from file if path is specified
  const weightsPath = process.env.PI_JUDGE_WEIGHTS_PATH;
  if (weightsPath) {
    try {
      const absolutePath = isAbsolute(weightsPath)
        ? weightsPath
        : resolve(process.cwd(), weightsPath);

      if (existsSync(absolutePath)) {
        const content = readFileSync(absolutePath, "utf-8");
        const loaded = JSON.parse(content) as Partial<JudgeWeightConfig>;

        // Merge with defaults to ensure all fields are present
        customWeights = {
          ...DEFAULT_JUDGE_WEIGHTS,
          ...loaded,
          intraWeights: { ...DEFAULT_JUDGE_WEIGHTS.intraWeights, ...loaded.intraWeights },
          interWeights: { ...DEFAULT_JUDGE_WEIGHTS.interWeights, ...loaded.interWeights },
          sysWeights: { ...DEFAULT_JUDGE_WEIGHTS.sysWeights, ...loaded.sysWeights },
          collapseThresholds: { ...DEFAULT_JUDGE_WEIGHTS.collapseThresholds, ...loaded.collapseThresholds },
        };
        return customWeights;
      }
    } catch (error) {
      // Log warning but continue with defaults
      console.warn(
        `[judge] Failed to load weights from ${weightsPath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return DEFAULT_JUDGE_WEIGHTS;
}

/**
 * 重み設定を更新
 * @summary 重み設定を更新
 * @param weights - 重みの設定情報
 * @returns {void}
 */
export function setJudgeWeights(weights: JudgeWeightConfig): void {
  customWeights = weights;
}

/**
 * 判定重みを初期化
 * @summary 判定重みを初期化
 * @returns 戻り値なし
 */
export function resetJudgeWeights(): void {
  customWeights = undefined;
}

// ============================================================================
// Judge Explanation (P0-3)
// ============================================================================

/**
 * 判定決定要因の詳細な説明
 * @summary 判定要因を保持
 * @param inputs 入力値
 * @param computation 中間計算結果
 * @returns なし
 */
export interface JudgeExplanation {
  /** Input values used for computation */
  inputs: {
    failedRatio: number;
    lowConfidence: number;
    noEvidenceRatio: number;
    contradictionRatio: number;
    conflictRatio: number;
    confidenceSpread: number;
    total: number;
    failedCount: number;
  };
  /** Intermediate computation results */
  computation: {
    uIntra: {
      value: number;
      contributions: Array<{ factor: string; weight: number; value: number; contribution: number }>;
    };
    uInter: {
      value: number;
      contributions: Array<{ factor: string; weight: number; value: number; contribution: number }>;
    };
    uSys: {
      value: number;
      contributions: Array<{ factor: string; weight: number; value: number; contribution: number }>;
    };
  };
  /** Collapse signals that were triggered */
  triggers: Array<{
    signal: string;
    actualValue: number;
    threshold: number;
    triggered: boolean;
  }>;
  /** Reasoning chain for the verdict */
  reasoningChain: string[];
}

// ============================================================================
// Core Types
// ============================================================================

/**
 * チームの不確実性を表現
 * @summary 不確実性を表現
 * @param uIntra メンバー内の不確実性（内部の不一致）
 * @param uInter メンバー間の不確実性（メンバー間の意見の相違）
 * @param uSys システムレベルの不確実性（総合的な指標）
 * @param collapseSignals 崩壊条件をトリガーしたシグナル
 */
export interface TeamUncertaintyProxy {
  /** Intra-member uncertainty (internal inconsistency) */
  uIntra: number;
  /** Inter-member uncertainty (disagreement between members) */
  uInter: number;
  /** System-level uncertainty (combined measure) */
  uSys: number;
  /** Signals that triggered collapse conditions */
  collapseSignals: string[];
}

 /**
  * 構造化出力からDISCUSSIONセクションを抽出
  * @param output 構造化された出力文字列
  * @returns DISCUSSIONセクションの内容（該当しない場合は空文字）
  */
export function extractDiscussionSection(output: string): string {
  const discussionPattern = /^DISCUSSION\s*:\s*$/im;
  const lines = output.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => discussionPattern.test(line));

  if (startIndex === -1) {
    return "";
  }

  const discussionLines: string[] = [];
  for (let i = startIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    // Stop at the next major label (SUMMARY, CLAIM, EVIDENCE, etc.)
    if (/^(SUMMARY|CLAIM|EVIDENCE|CONFIDENCE|RESULT|NEXT_STEP)\s*:/i.test(line)) {
      break;
    }
    discussionLines.push(line);
  }

  return discussionLines.join("\n");
}

/**
 * @summary 証拠シグナルをカウント
 * @param output - 解析対象の出力文字列
 * @returns 証拠シグナルの数
 */
export function countEvidenceSignals(output: string): number {
  let count = 0;

  const evidenceField = extractField(output, "EVIDENCE");
  if (evidenceField) {
    const items = evidenceField
      .split(/[;,]/)
      .map((item) => item.trim())
      .filter(Boolean);
    count += items.length;
  }

  const fileRefs = output.match(/\b[\w./-]+\.[a-z]{1,8}:\d+\b/gi);
  if (fileRefs) {
    count += fileRefs.length;
  }

  return Math.max(0, Math.min(50, count));
}

/**
 * メンバー出力を解析
 * @summary 出力解析
 * @param output 解析対象の文字列出力
 * @returns 診断情報を含む解析結果
 */
export function analyzeMemberOutput(output: string): TeamMemberResult["diagnostics"] {
  const confidence = parseUnitInterval(extractField(output, "CONFIDENCE")) ?? 0.5;
  const evidenceCount = countEvidenceSignals(output);
  const contradictionSignals = countKeywordSignals(output, [
    "self-contradict",
    "contradict",
    "inconsistent",
    "\u{7F3A}\u{76F8}", // 矛盾
    "\u{81EA}\u{5DF1}\u{7F3A}\u{76F8}", // 自己矛盾
  ]);
  const conflictSignals = countKeywordSignals(output, [
    "disagree",
    "conflict",
    "not aligned",
    "\u{5BFE}\u{7ACB}", // 対立
    "\u{4E0D}\u{4E00}\u{81F4}", // 不一致
    "\u{610F}\u{898B}\u{304C}\u{5272}\u{308C}", // 意見が割れ
  ]);

  return {
    confidence,
    evidenceCount,
    contradictionSignals,
    conflictSignals,
  };
}

/**
 * 代理不確実性を計算
 * @summary 代理不確実性計算
 * @param memberResults チームメンバーの判定結果リスト
 * @returns 計算された不確実性プロキシ
 */
export function computeProxyUncertainty(memberResults: TeamMemberResult[]): TeamUncertaintyProxy {
  const total = Math.max(1, memberResults.length);
  const failedCount = memberResults.filter((result) => result.status === "failed").length;
  const failedRatio = failedCount / total;

  const confidences = memberResults.map((result) => result.diagnostics?.confidence ?? 0.5);
  const meanConfidence = confidences.reduce((sum, value) => sum + value, 0) / total;
  const lowConfidence = 1 - meanConfidence;

  const noEvidenceRatio =
    memberResults.filter((result) => (result.diagnostics?.evidenceCount ?? 0) <= 0).length / total;
  const contradictionRatio =
    memberResults.filter((result) => (result.diagnostics?.contradictionSignals ?? 0) > 0).length / total;
  const conflictRatio =
    memberResults.filter((result) => (result.diagnostics?.conflictSignals ?? 0) > 0).length / total;

  const variance =
    confidences.reduce((sum, value) => sum + (value - meanConfidence) ** 2, 0) / total;
  const confidenceSpread = clampConfidence(Math.sqrt(Math.max(0, variance)) / 0.5);

  const uIntra = clampConfidence(
    0.38 * failedRatio + 0.26 * lowConfidence + 0.2 * noEvidenceRatio + 0.16 * contradictionRatio,
  );
  const uInter = clampConfidence(
    0.42 * conflictRatio + 0.28 * confidenceSpread + 0.2 * failedRatio + 0.1 * noEvidenceRatio,
  );
  const uSys = clampConfidence(0.45 * uIntra + 0.35 * uInter + 0.2 * failedRatio);

  const collapseSignals: string[] = [];
  if (uIntra >= 0.55) collapseSignals.push("high_intra_uncertainty");
  if (uInter >= 0.55) collapseSignals.push("high_inter_disagreement");
  if (uSys >= 0.6) collapseSignals.push("high_system_uncertainty");
  if (failedRatio >= 0.3) collapseSignals.push("teammate_failures");
  if (noEvidenceRatio >= 0.5) collapseSignals.push("insufficient_evidence");

  return {
    uIntra,
    uInter,
    uSys,
    collapseSignals,
  };
}

/**
 * 不確実性と説明を計算
 * @summary 不確実性計算
 * @param memberResults チームメンバーの判定結果リスト
 * @param weights 判定の重み設定
 * @returns 計算されたプロキシと判定理由
 */
export function computeProxyUncertaintyWithExplainability(
  memberResults: TeamMemberResult[],
  weights: JudgeWeightConfig = getJudgeWeights(),
): { proxy: TeamUncertaintyProxy; explanation: JudgeExplanation } {
  const total = Math.max(1, memberResults.length);
  const failedCount = memberResults.filter((result) => result.status === "failed").length;
  const failedRatio = failedCount / total;

  const confidences = memberResults.map((result) => result.diagnostics?.confidence ?? 0.5);
  const meanConfidence = confidences.reduce((sum, value) => sum + value, 0) / total;
  const lowConfidence = 1 - meanConfidence;

  const noEvidenceRatio =
    memberResults.filter((result) => (result.diagnostics?.evidenceCount ?? 0) <= 0).length / total;
  const contradictionRatio =
    memberResults.filter((result) => (result.diagnostics?.contradictionSignals ?? 0) > 0).length / total;
  const conflictRatio =
    memberResults.filter((result) => (result.diagnostics?.conflictSignals ?? 0) > 0).length / total;

  const variance =
    confidences.reduce((sum, value) => sum + (value - meanConfidence) ** 2, 0) / total;
  const confidenceSpread = clampConfidence(Math.sqrt(Math.max(0, variance)) / 0.5);

  // Compute uIntra with contribution breakdown
  const uIntraContributions = [
    {
      factor: "failedRatio",
      weight: weights.intraWeights.failedRatio,
      value: failedRatio,
      contribution: weights.intraWeights.failedRatio * failedRatio,
    },
    {
      factor: "lowConfidence",
      weight: weights.intraWeights.lowConfidence,
      value: lowConfidence,
      contribution: weights.intraWeights.lowConfidence * lowConfidence,
    },
    {
      factor: "noEvidenceRatio",
      weight: weights.intraWeights.noEvidence,
      value: noEvidenceRatio,
      contribution: weights.intraWeights.noEvidence * noEvidenceRatio,
    },
    {
      factor: "contradictionRatio",
      weight: weights.intraWeights.contradiction,
      value: contradictionRatio,
      contribution: weights.intraWeights.contradiction * contradictionRatio,
    },
  ];
  const uIntra = clampConfidence(uIntraContributions.reduce((sum, c) => sum + c.contribution, 0));

  // Compute uInter with contribution breakdown
  const uInterContributions = [
    {
      factor: "conflictRatio",
      weight: weights.interWeights.conflictRatio,
      value: conflictRatio,
      contribution: weights.interWeights.conflictRatio * conflictRatio,
    },
    {
      factor: "confidenceSpread",
      weight: weights.interWeights.confidenceSpread,
      value: confidenceSpread,
      contribution: weights.interWeights.confidenceSpread * confidenceSpread,
    },
    {
      factor: "failedRatio",
      weight: weights.interWeights.failedRatio,
      value: failedRatio,
      contribution: weights.interWeights.failedRatio * failedRatio,
    },
    {
      factor: "noEvidenceRatio",
      weight: weights.interWeights.noEvidence,
      value: noEvidenceRatio,
      contribution: weights.interWeights.noEvidence * noEvidenceRatio,
    },
  ];
  const uInter = clampConfidence(uInterContributions.reduce((sum, c) => sum + c.contribution, 0));

  // Compute uSys with contribution breakdown
  const uSysContributions = [
    {
      factor: "uIntra",
      weight: weights.sysWeights.uIntra,
      value: uIntra,
      contribution: weights.sysWeights.uIntra * uIntra,
    },
    {
      factor: "uInter",
      weight: weights.sysWeights.uInter,
      value: uInter,
      contribution: weights.sysWeights.uInter * uInter,
    },
    {
      factor: "failedRatio",
      weight: weights.sysWeights.failedRatio,
      value: failedRatio,
      contribution: weights.sysWeights.failedRatio * failedRatio,
    },
  ];
  const uSys = clampConfidence(uSysContributions.reduce((sum, c) => sum + c.contribution, 0));

  // Check collapse triggers
  const triggers: JudgeExplanation["triggers"] = [
    {
      signal: "high_intra_uncertainty",
      actualValue: uIntra,
      threshold: weights.collapseThresholds.uIntra,
      triggered: uIntra >= weights.collapseThresholds.uIntra,
    },
    {
      signal: "high_inter_disagreement",
      actualValue: uInter,
      threshold: weights.collapseThresholds.uInter,
      triggered: uInter >= weights.collapseThresholds.uInter,
    },
    {
      signal: "high_system_uncertainty",
      actualValue: uSys,
      threshold: weights.collapseThresholds.uSys,
      triggered: uSys >= weights.collapseThresholds.uSys,
    },
    {
      signal: "teammate_failures",
      actualValue: failedRatio,
      threshold: weights.collapseThresholds.failedRatio,
      triggered: failedRatio >= weights.collapseThresholds.failedRatio,
    },
    {
      signal: "insufficient_evidence",
      actualValue: noEvidenceRatio,
      threshold: weights.collapseThresholds.noEvidenceRatio,
      triggered: noEvidenceRatio >= weights.collapseThresholds.noEvidenceRatio,
    },
  ];

  const collapseSignals = triggers.filter((t) => t.triggered).map((t) => t.signal);

  // Build reasoning chain
  const reasoningChain: string[] = [];
  reasoningChain.push(`Analyzed ${total} member outputs (${failedCount} failed)`);
  reasoningChain.push(`uIntra=${uIntra.toFixed(2)} = ${uIntraContributions.map((c) => `${c.weight}*${c.value.toFixed(2)}`).join(" + ")}`);
  reasoningChain.push(`uInter=${uInter.toFixed(2)} = ${uInterContributions.map((c) => `${c.weight}*${c.value.toFixed(2)}`).join(" + ")}`);
  reasoningChain.push(`uSys=${uSys.toFixed(2)} = ${uSysContributions.map((c) => `${c.weight}*${c.value.toFixed(2)}`).join(" + ")}`);

  if (collapseSignals.length > 0) {
    reasoningChain.push(`Collapse signals triggered: ${collapseSignals.join(", ")}`);
  }

  const proxy: TeamUncertaintyProxy = {
    uIntra,
    uInter,
    uSys,
    collapseSignals,
  };

  const explanation: JudgeExplanation = {
    inputs: {
      failedRatio,
      lowConfidence,
      noEvidenceRatio,
      contradictionRatio,
      conflictRatio,
      confidenceSpread,
      total,
      failedCount,
    },
    computation: {
      uIntra: { value: uIntra, contributions: uIntraContributions },
      uInter: { value: uInter, contributions: uInterContributions },
      uSys: { value: uSys, contributions: uSysContributions },
    },
    triggers,
    reasoningChain,
  };

  return { proxy, explanation };
}

/**
 * 判定理由を整形
 * @summary 判定理由整形
 * @param explanation 整形前の判定理由オブジェクト
 * @returns 整形された判定理由文字列
 */
export function formatJudgeExplanation(explanation: JudgeExplanation): string {
  const lines: string[] = [];

  lines.push("## Judge Decision Explanation");
  lines.push("");
  lines.push(`**Input Summary:** ${explanation.inputs.total} members (${explanation.inputs.failedCount} failed)`);
  lines.push("");

  lines.push("**Uncertainty Computation:**");
  lines.push(`- uIntra (${explanation.computation.uIntra.value.toFixed(2)})`);
  for (const c of explanation.computation.uIntra.contributions) {
    lines.push(`  - ${c.factor}: ${c.weight} * ${c.value.toFixed(2)} = ${c.contribution.toFixed(3)}`);
  }

  lines.push(`- uInter (${explanation.computation.uInter.value.toFixed(2)})`);
  for (const c of explanation.computation.uInter.contributions) {
    lines.push(`  - ${c.factor}: ${c.weight} * ${c.value.toFixed(2)} = ${c.contribution.toFixed(3)}`);
  }

  lines.push(`- uSys (${explanation.computation.uSys.value.toFixed(2)})`);
  for (const c of explanation.computation.uSys.contributions) {
    lines.push(`  - ${c.factor}: ${c.weight} * ${c.value.toFixed(2)} = ${c.contribution.toFixed(3)}`);
  }

  lines.push("");
  lines.push("**Collapse Triggers:**");
  for (const trigger of explanation.triggers) {
    const status = trigger.triggered ? "[TRIGGERED]" : "[ok]";
    lines.push(`- ${trigger.signal}: ${trigger.actualValue.toFixed(2)} vs ${trigger.threshold} ${status}`);
  }

  lines.push("");
  lines.push("**Reasoning Chain:**");
  for (const step of explanation.reasoningChain) {
    lines.push(`- ${step}`);
  }

  return lines.join("\n");
}

/**
 * 代替判定を生成
 * @summary 代替判定生成
 * @param input メンバー結果、プロキシ、エラーを含む入力データ
 * @returns 生成された最終判定
 */
export function buildFallbackJudge(input: {
  memberResults: TeamMemberResult[];
  proxy?: TeamUncertaintyProxy;
  error?: string;
}): TeamFinalJudge {
  const proxy = input.proxy ?? computeProxyUncertainty(input.memberResults);
  const failed = input.memberResults.filter((result) => result.status === "failed").length;
  const total = input.memberResults.length;

  if (total === 0 || failed === total) {
    return {
      verdict: "untrusted",
      confidence: 0.1,
      reason: input.error || "No successful teammate output was available for reliable judgment.",
      nextStep: "Re-run the team and ensure at least one high-quality output is produced.",
      uIntra: 1,
      uInter: 1,
      uSys: 1,
      collapseSignals: ["no_successful_output"],
      rawOutput: input.error || "",
    };
  }

  if (proxy.uSys >= 0.6 || failed > 0) {
    return {
      verdict: "partial",
      confidence: clampConfidence(1 - proxy.uSys),
      reason:
        input.error ||
        `Result reliability is partial (uSys=${proxy.uSys.toFixed(2)}, failures=${failed}/${total}).`,
      nextStep: "Re-check contested claims with one focused follow-up run.",
      uIntra: proxy.uIntra,
      uInter: proxy.uInter,
      uSys: proxy.uSys,
      collapseSignals: proxy.collapseSignals,
      rawOutput: input.error || "",
    };
  }

  return {
    verdict: "trusted",
    confidence: clampConfidence(1 - proxy.uSys * 0.6),
    reason: "All teammates completed and no runtime failures were reported.",
    nextStep: "Proceed, but validate high-impact claims with direct evidence if needed.",
    uIntra: proxy.uIntra,
    uInter: proxy.uInter,
    uSys: proxy.uSys,
    collapseSignals: proxy.collapseSignals,
    rawOutput: input.error || "",
  };
}

/**
 * 最終審査を実行
 * @summary 最終審査の実行
 * @param input 入力データ
 * @param input.team チーム定義
 * @param input.task タスク内容
 * @param input.strategy チーム戦略
 * @param input.memberResults メンバーの実行結果リスト
 * @param input.proxy チーム不確実性プロキシ
 * @param input.timeoutMs タイムアウト時間（ミリ秒）
 * @param input.signal 中断シグナル（任意）
 * @returns 最終審査結果
 */
export async function runFinalJudge(input: {
  team: TeamDefinition;
  task: string;
  strategy: TeamStrategy;
  memberResults: TeamMemberResult[];
  proxy: TeamUncertaintyProxy;
  timeoutMs: number;
  signal?: AbortSignal;
}): Promise<TeamFinalJudge> {
  // Stable profile: final judge is deterministic and does not trigger extra LLM calls.
  const { memberResults, proxy } = input;
  return buildFallbackJudge({
    memberResults,
    proxy,
  });
}
