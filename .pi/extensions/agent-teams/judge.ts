/**
 * @abdd.meta
 * path: .pi/extensions/agent-teams/judge.ts
 * role: エージェントチームの不確実性計算および最終判定ロジックを提供する
 * why: SRP（単一責任の原則）遵守のためにagent-teams.tsから分離、P0-3改善としての説明性追加と重み設定の外部化を行うため
 * related: .pi/extensions/agent-teams.ts, .pi/extensions/agent-teams/storage.ts, ../../lib/text-parsing.js
 * public_api: JudgeWeightConfig, DEFAULT_JUDGE_WEIGHTS, getJudgeWeights, TeamDefinition, TeamFinalJudge, TeamMemberResult, TeamStrategy, clampConfidence, parseUnitInterval, extractField, countKeywordSignals
 * invariants: 不確実性スコアは0以上1以下である、重み設定はキャッシュにより同時に単一のインスタンスが使用される
 * side_effects: ファイルシステムからの重み設定読み込み（キャッシュ変数 `customWeights` の書き換え）
 * failure_modes: 不正な重み設定ファイルが読み込まれた場合のデフォルト値へのフォールバック、キャッシュの不整合
 * @abdd.explain
 * overview: エージェントチームの実行結果に対する評価（判定）を行うモジュール。メンバー間・メンバー内の一貫性チェックと、システム的な失敗率に基づいて最終的な不確実性（Uncertainty）を算出する。
 * what_it_does:
 *   - 内的一貫性（失敗比率、低信頼度、根拠なし、矛盾）と外的一貫性（競合比率、信頼度のばらつき）に基づく不確実性スコアの計算
 *   - JudgeWeightConfigによる重み付けパラメータの管理と、デフォルト設定または外部ファイルからの設定読み込み
 *   - text-parsing.jsからのユーティリティ関数とstorage.tsからの型定義の再エクスポート
 * why_it_exists:
 *   - agent-teams.tsの肥大化を防ぎ、判定ロジックの責任を分離するため
 *   - 判定基準の透明性を高め、重み設定を動的に変更可能にするため
 *   - P0-3要件に基づき、判定プロセスの説明可能性（Explainability）を提供するため
 * scope:
 *   in: TeamDefinition, TeamMemberResult, JudgeWeightConfig（デフォルトまたは外部）
 *   out: 計算された不確実性スコア、最終判定結果、詳細な説明情報
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
// Aggregation Strategy Types (Phase 2: M1-Parallel Integration)
// ============================================================================

/**
 * 並列チーム実行時の結果集約戦略
 * @summary 結果集約戦略
 */
export type AggregationStrategy =
  | 'rule-based'      // 現在の動作（決定論的）
  | 'majority-vote'   // 最も多い評決が採用される
  | 'best-confidence' // 最高信頼度が採用される
  | 'llm-aggregate';  // LLMが最終結果を統合

/**
 * 集約関数への入力データ
 * @summary 集約入力データ
 */
export interface AggregationInput {
  /** チームごとの実行結果 */
  teamResults: Array<{
    teamId: string;
    memberResults: TeamMemberResult[];
    finalJudge: TeamFinalJudge;
  }>;
  /** 使用する集約戦略 */
  strategy: AggregationStrategy;
  /** 元のタスク内容 */
  task: string;
}

/**
 * 集約関数の出力結果
 * @summary 集約結果
 */
export interface AggregationResult {
  /** 最終評決 */
  verdict: 'trusted' | 'partial' | 'untrusted';
  /** 信頼度（0-1） */
  confidence: number;
  /** 選択されたチームID（該当する場合） */
  selectedTeamId?: string;
  /** 統合されたコンテンツ（LLM集約時） */
  aggregatedContent?: string;
  /** 結果の説明 */
  explanation: string;
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
    "\u{77DB}\u{76FE}", // 矛盾
    "\u{81EA}\u{5DF1}\u{77DB}\u{76FE}", // 自己矛盾
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
 * 重み設定の妥当性を検証する
 * @summary 重み設定検証
 * @param weights 検証対象の重み設定
 * @returns 検証結果（true=有効、false=無効）
 */
function validateWeights(weights: JudgeWeightConfig): boolean {
  if (!weights || typeof weights !== "object") return false;
  if (!weights.intraWeights || !weights.interWeights || !weights.sysWeights) return false;
  if (!weights.collapseThresholds) return false;

  // Check all weight values are finite numbers in [0, 1]
  const allWeights = [
    ...Object.values(weights.intraWeights),
    ...Object.values(weights.interWeights),
    ...Object.values(weights.sysWeights),
    ...Object.values(weights.collapseThresholds),
  ];

  for (const w of allWeights) {
    if (typeof w !== "number" || !Number.isFinite(w) || w < 0 || w > 1) {
      return false;
    }
  }

  return true;
}

/**
 * 不確実性と説明を計算
 * @summary 不確実性計算（エッジケース防御付き）
 * @param memberResults チームメンバーの判定結果リスト（空配列許容）
 * @param weights 判定の重み設定（無効な場合はデフォルト値を使用）
 * @returns 計算されたプロキシと判定理由
 * @description
 * - 空配列入力時は最大不確実性を返す
 * - 無効なweights設定時はデフォルト値を使用し警告をreasoningChainに記録
 * - すべての数値計算はNaN/Infinityに対して防御的
 */
export function computeProxyUncertaintyWithExplainability(
  memberResults: TeamMemberResult[],
  weights: JudgeWeightConfig = getJudgeWeights(),
): { proxy: TeamUncertaintyProxy; explanation: JudgeExplanation } {
  // Validate weights, fall back to defaults if invalid
  const validWeights = validateWeights(weights) ? weights : DEFAULT_JUDGE_WEIGHTS;

  // Handle empty input array explicitly
  if (memberResults.length === 0) {
    const emptyProxy: TeamUncertaintyProxy = {
      uIntra: 1,
      uInter: 1,
      uSys: 1,
      collapseSignals: ["no_member_results"],
    };
    const emptyExplanation: JudgeExplanation = {
      inputs: {
        failedRatio: 0,
        lowConfidence: 0,
        noEvidenceRatio: 0,
        contradictionRatio: 0,
        conflictRatio: 0,
        confidenceSpread: 0,
        total: 0,
        failedCount: 0,
      },
      computation: {
        uIntra: { value: 1, contributions: [] },
        uInter: { value: 1, contributions: [] },
        uSys: { value: 1, contributions: [] },
      },
      triggers: [
        {
          signal: "no_member_results",
          actualValue: 0,
          threshold: 0,
          triggered: true,
        },
      ],
      reasoningChain: ["No member results provided - returning maximum uncertainty"],
    };
    return { proxy: emptyProxy, explanation: emptyExplanation };
  }

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
      weight: validWeights.intraWeights.failedRatio,
      value: failedRatio,
      contribution: validWeights.intraWeights.failedRatio * failedRatio,
    },
    {
      factor: "lowConfidence",
      weight: validWeights.intraWeights.lowConfidence,
      value: lowConfidence,
      contribution: validWeights.intraWeights.lowConfidence * lowConfidence,
    },
    {
      factor: "noEvidenceRatio",
      weight: validWeights.intraWeights.noEvidence,
      value: noEvidenceRatio,
      contribution: validWeights.intraWeights.noEvidence * noEvidenceRatio,
    },
    {
      factor: "contradictionRatio",
      weight: validWeights.intraWeights.contradiction,
      value: contradictionRatio,
      contribution: validWeights.intraWeights.contradiction * contradictionRatio,
    },
  ];
  const uIntra = clampConfidence(uIntraContributions.reduce((sum, c) => sum + c.contribution, 0));

  // Compute uInter with contribution breakdown
  const uInterContributions = [
    {
      factor: "conflictRatio",
      weight: validWeights.interWeights.conflictRatio,
      value: conflictRatio,
      contribution: validWeights.interWeights.conflictRatio * conflictRatio,
    },
    {
      factor: "confidenceSpread",
      weight: validWeights.interWeights.confidenceSpread,
      value: confidenceSpread,
      contribution: validWeights.interWeights.confidenceSpread * confidenceSpread,
    },
    {
      factor: "failedRatio",
      weight: validWeights.interWeights.failedRatio,
      value: failedRatio,
      contribution: validWeights.interWeights.failedRatio * failedRatio,
    },
    {
      factor: "noEvidenceRatio",
      weight: validWeights.interWeights.noEvidence,
      value: noEvidenceRatio,
      contribution: validWeights.interWeights.noEvidence * noEvidenceRatio,
    },
  ];
  const uInter = clampConfidence(uInterContributions.reduce((sum, c) => sum + c.contribution, 0));

  // Compute uSys with contribution breakdown
  const uSysContributions = [
    {
      factor: "uIntra",
      weight: validWeights.sysWeights.uIntra,
      value: uIntra,
      contribution: validWeights.sysWeights.uIntra * uIntra,
    },
    {
      factor: "uInter",
      weight: validWeights.sysWeights.uInter,
      value: uInter,
      contribution: validWeights.sysWeights.uInter * uInter,
    },
    {
      factor: "failedRatio",
      weight: validWeights.sysWeights.failedRatio,
      value: failedRatio,
      contribution: validWeights.sysWeights.failedRatio * failedRatio,
    },
  ];
  const uSys = clampConfidence(uSysContributions.reduce((sum, c) => sum + c.contribution, 0));

  // Check collapse triggers
  const triggers: JudgeExplanation["triggers"] = [
    {
      signal: "high_intra_uncertainty",
      actualValue: uIntra,
      threshold: validWeights.collapseThresholds.uIntra,
      triggered: uIntra >= validWeights.collapseThresholds.uIntra,
    },
    {
      signal: "high_inter_disagreement",
      actualValue: uInter,
      threshold: validWeights.collapseThresholds.uInter,
      triggered: uInter >= validWeights.collapseThresholds.uInter,
    },
    {
      signal: "high_system_uncertainty",
      actualValue: uSys,
      threshold: validWeights.collapseThresholds.uSys,
      triggered: uSys >= validWeights.collapseThresholds.uSys,
    },
    {
      signal: "teammate_failures",
      actualValue: failedRatio,
      threshold: validWeights.collapseThresholds.failedRatio,
      triggered: failedRatio >= validWeights.collapseThresholds.failedRatio,
    },
    {
      signal: "insufficient_evidence",
      actualValue: noEvidenceRatio,
      threshold: validWeights.collapseThresholds.noEvidenceRatio,
      triggered: noEvidenceRatio >= validWeights.collapseThresholds.noEvidenceRatio,
    },
  ];

  const collapseSignals = triggers.filter((t) => t.triggered).map((t) => t.signal);

  // Build reasoning chain
  const reasoningChain: string[] = [];
  reasoningChain.push(`Analyzed ${total} member outputs (${failedCount} failed)`);

  // Add weights validation info if fallback was used
  if (!validateWeights(weights)) {
    reasoningChain.push("WARNING: Invalid weights config detected, using defaults");
  }

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
