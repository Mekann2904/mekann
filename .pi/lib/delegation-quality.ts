/**
 * @abdd.meta
 * path: .pi/lib/delegation-quality.ts
 * role: 委任品質計算エンジン
 * why: タスクの明確性やコンテキストなど5次元から委任の成功確率を定量的に評価し、改善提案を提示するため
 * related: .pi/lib/delegation-manager.ts, .pi/lib/agent-pool.ts
 * public_api: DelegationQualityScore, DelegationQualityInput, calculateDelegationScore
 * invariants: overallスコアは0-100の範囲内、各次元スコアは0-100の範囲内
 * side_effects: なし（純粋関数）
 * failure_modes: 入力文字列が短すぎる場合に低スコアを返す、正規表現パターンに合致しない指標は評価されない
 * @abdd.explain
 * overview: タスク定義の入力から、明確性、コンテキスト、前提条件、成功基準、リソースの5次元でスコアリングし、加重平均で総合品質と成功率を算出するモジュール
 * what_it_does:
 *   - タスク記述やコンテキストを正規表現パターンで解析し各次元のスコアを算出する
 *   - 次元の重み付け（clarity 0.30, context 0.25 など）に基づき総合スコアを計算する
 *   - 総合スコアが60点未満の場合に高リスクフラグを立てる
 *   - 経験的モデルに基づき推定成功率を算出する
 * why_it_exists:
 *   - 委任タスクの不備を検知し、実行前に品質を保証するため
 *   - 定量的なフィードバックによってタスク定義の改善を促すため
 * scope:
 *   in: タスク記述、共有コンテキスト、成功基準、ターゲットID、利用可能リソース
 *   out: 総合スコア、各次元スコア、改善提案リスト、高リスク判定、推定成功率
 */

/**
 * 委任品質の5つの次元
 */
export type DelegationDimension =
  | "clarity"       // タスクの明確性
  | "context"       // コンテキストの充足性
  | "preconditions" // 前提条件の充足
  | "criteria"      // 成功基準の明確さ
  | "resources";    // リソースの可用性

/**
 * 委任品質スコアの詳細
 */
export interface DelegationQualityScore {
  /** 総合スコア (0-100) */
  overall: number;
  /** 各次元のスコア */
  dimensions: Record<DelegationDimension, number>;
  /** 改善提案 */
  suggestions: string[];
  /** 高リスクフラグ */
  isHighRisk: boolean;
  /** 推定成功率 */
  estimatedSuccessRate: number;
}

/**
 * 委任品質評価の入力
 */
export interface DelegationQualityInput {
  /** タスク記述 */
  taskDescription: string;
  /** 共有コンテキスト */
  sharedContext?: string;
  /** 成功基準 */
  successCriteria?: string[];
  /** ターゲット（チームIDまたはサブエージェントID） */
  targetId: string;
  /** 利用可能なファイル/リソース */
  availableResources?: string[];
}

/**
 * 次元の重み付け（成功データに基づく）
 */
const DIMENSION_WEIGHTS: Record<DelegationDimension, number> = {
  clarity: 0.30,       // 最も重要
  context: 0.25,       // 次に重要
  criteria: 0.20,      // 成功基準の明確さ
  preconditions: 0.15, // 前提条件
  resources: 0.10,     // リソース（最も重要度低）
};

/**
 * 高リスクの閾値
 */
const HIGH_RISK_THRESHOLD = 60;

/**
 * 委任品質スコアを計算
 * @summary 委任品質を計算
 * @param input 委任の入力パラメータ
 * @returns 品質スコアと改善提案
 */
export function calculateDelegationScore(
  input: DelegationQualityInput
): DelegationQualityScore {
  const dimensions: Record<DelegationDimension, number> = {
    clarity: evaluateClarity(input.taskDescription),
    context: evaluateContext(input.sharedContext),
    preconditions: evaluatePreconditions(input.availableResources),
    criteria: evaluateCriteria(input.successCriteria),
    resources: evaluateResources(input.targetId, input.availableResources),
  };

  // 重み付け平均
  const overall = Object.entries(dimensions).reduce((sum, [dim, score]) => {
    const weight = DIMENSION_WEIGHTS[dim as DelegationDimension];
    return sum + score * weight;
  }, 0);

  // 改善提案の生成
  const suggestions = generateSuggestions(dimensions);

  // 推定成功率（経験的モデル）
  const estimatedSuccessRate = estimateSuccessRate(overall, dimensions);

  return {
    overall: Math.round(overall),
    dimensions,
    suggestions,
    isHighRisk: overall < HIGH_RISK_THRESHOLD,
    estimatedSuccessRate,
  };
}

/**
 * タスクの明確性を評価
 * @summary タスク明確性評価
 * @param taskDescription タスク記述
 * @returns スコア (0-100)
 */
function evaluateClarity(taskDescription: string): number {
  if (!taskDescription || taskDescription.length < 20) {
    return 20;
  }

  let score = 50; // ベーススコア

  // ポジティブ指標
  const positivePatterns = [
    /分析せよ|調査せよ|設計せよ|実装せよ/, // 明確な動詞
    /対象範囲|スコープ|範囲/, // 範囲の明示
    /出力形式|フォーマット|結果/, // 期待される出力
    /期限内|までに|優先度/, // 制約条件
  ];

  for (const pattern of positivePatterns) {
    if (pattern.test(taskDescription)) {
      score += 10;
    }
  }

  // ネガティブ指標
  const negativePatterns = [
    /適当に|なんとなく|とりあえず/, // 曖昧な指示
    /全部|すべて|なんでも/, // 範囲の不明確さ
    /^.{1,50}$/, // 短すぎる記述
  ];

  for (const pattern of negativePatterns) {
    if (pattern.test(taskDescription)) {
      score -= 15;
    }
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * コンテキストの充足性を評価
 * @summary コンテキスト評価
 * @param sharedContext 共有コンテキスト
 * @returns スコア (0-100)
 */
function evaluateContext(sharedContext?: string): number {
  if (!sharedContext) {
    return 30; // コンテキストなしは低スコア
  }

  let score = 50;

  // ポジティブ指標
  if (sharedContext.length > 200) score += 15;
  if (sharedContext.length > 500) score += 10;
  if (/関連|参照|前提|背景/.test(sharedContext)) score += 10;
  if (/ファイル|パス|ディレクトリ/.test(sharedContext)) score += 10;

  return Math.min(100, score);
}

/**
 * 前提条件の充足を評価
 * @summary 前提条件評価
 * @param availableResources 利用可能リソース
 * @returns スコア (0-100)
 */
function evaluatePreconditions(availableResources?: string[]): number {
  if (!availableResources || availableResources.length === 0) {
    return 50; // デフォルト
  }

  // リソースが多いほど高スコア
  const resourceCount = availableResources.length;
  if (resourceCount >= 5) return 90;
  if (resourceCount >= 3) return 75;
  if (resourceCount >= 1) return 60;
  return 50;
}

/**
 * 成功基準の明確さを評価
 * @summary 成功基準評価
 * @param successCriteria 成功基準
 * @returns スコア (0-100)
 */
function evaluateCriteria(successCriteria?: string[]): number {
  if (!successCriteria || successCriteria.length === 0) {
    return 30; // 基準なしは低スコア
  }

  // 基準が多いほど高スコア（ただし上限あり）
  const criteriaCount = successCriteria.length;
  if (criteriaCount >= 4) return 95;
  if (criteriaCount >= 2) return 80;
  if (criteriaCount >= 1) return 65;

  return 50;
}

/**
 * リソースの可用性を評価
 * @summary リソース評価
 * @param targetId ターゲットID
 * @param availableResources 利用可能リソース
 * @returns スコア (0-100)
 */
function evaluateResources(targetId: string, availableResources?: string[]): number {
  // ターゲットIDが存在すれば基本的なリソースはある
  let score = targetId ? 60 : 30;

  // リソースの追加チェック
  if (availableResources && availableResources.length > 0) {
    score += 20;
  }

  return Math.min(100, score);
}

/**
 * 改善提案を生成
 * @summary 改善提案生成
 * @param dimensions 各次元のスコア
 * @returns 改善提案リスト
 */
function generateSuggestions(dimensions: Record<DelegationDimension, number>): string[] {
  const suggestions: string[] = [];

  if (dimensions.clarity < 60) {
    suggestions.push("タスク記述をより具体的にしてください（動詞、範囲、期待される出力を明示）");
  }

  if (dimensions.context < 60) {
    suggestions.push("共有コンテキストを追加してください（背景、関連ファイル、前提知識）");
  }

  if (dimensions.preconditions < 60) {
    suggestions.push("前提条件を確認してください（必要なファイルの存在、環境設定）");
  }

  if (dimensions.criteria < 60) {
    suggestions.push("成功基準を明確にしてください（完了の定義、受け入れ条件）");
  }

  if (dimensions.resources < 60) {
    suggestions.push("必要なリソースを確認してください（ファイルパス、ツール、権限）");
  }

  return suggestions;
}

/**
 * 測定不可能な価値の保護警告を生成
 * @summary 測定不可能な価値警告
 * @param overall 総合スコア
 * @returns 警告メッセージのリスト
 */
export function generateUnmeasurableWarnings(overall: number): string[] {
  const warnings: string[] = [];

  // 高スコアの場合の警告（内なるファシズムのリスク）
  if (overall >= 80) {
    warnings.push("【参考】高スコアは「正しい委任」を保証しません。測定不可能な要素（信頼、創造性、文脈）も同等に重要です。");
    warnings.push("【参考】このスコアを「目標」とせず、「参考値」として扱ってください。スコア追求が新たな「正しさ」の強制になる可能性があります。");
  }

  // 中程度のスコアの場合の警告
  if (overall >= 60 && overall < 80) {
    warnings.push("【参考】スコアは改善のヒントであり、委任を禁止するものではありません。直感や経験も尊重してください。");
  }

  return warnings;
}

/**
 * 委任品質スコアを「保護的」に計算
 * @summary 保護的品質スコア計算
 * @param input 委任の入力パラメータ
 * @returns 品質スコアと改善提案（警告を含む）
 */
export function calculateProtectedDelegationScore(
  input: DelegationQualityInput
): DelegationQualityScore & { unmeasurableWarnings: string[] } {
  const baseScore = calculateDelegationScore(input);
  const unmeasurableWarnings = generateUnmeasurableWarnings(baseScore.overall);

  return {
    ...baseScore,
    unmeasurableWarnings,
  };
}

/**
 * 推定成功率を計算
 * @summary 成功率推定
 * @param overall 総合スコア
 * @param dimensions 各次元のスコア
 * @returns 推定成功率 (0-100)
 */
function estimateSuccessRate(
  overall: number,
  dimensions: Record<DelegationDimension, number>
): number {
  // ベースライン: 統計データに基づく
  // self-improvement-deep-dive: 100%成功、整体委任: 82%成功
  const baselineSuccessRate = 82;

  // 明確性が低いと大幅に成功率が下がる
  const clarityPenalty = dimensions.clarity < 50 ? 30 : dimensions.clarity < 70 ? 15 : 0;

  // コンテキストが不足すると中程度のペナルティ
  const contextPenalty = dimensions.context < 50 ? 20 : dimensions.context < 70 ? 10 : 0;

  // 総合スコアによる調整
  const overallAdjustment = (overall - 70) * 0.5;

  const estimatedRate = baselineSuccessRate - clarityPenalty - contextPenalty + overallAdjustment;

  return Math.max(0, Math.min(100, Math.round(estimatedRate)));
}

/**
 * 委任品質トラッカー
 * 過去の委任結果を記録し、パターンを学習する
 */
export class DelegationQualityTracker {
  private records: Array<{
    timestamp: string;
    input: DelegationQualityInput;
    score: DelegationQualityScore;
    actualOutcome: "success" | "partial" | "failure";
  }> = [];

  /**
   * 委任を記録
   * @summary 委任を記録
   * @param input 委任入力
   * @param score 品質スコア
   * @param outcome 実際の結果
   */
  record(
    input: DelegationQualityInput,
    score: DelegationQualityScore,
    outcome: "success" | "partial" | "failure"
  ): void {
    this.records.push({
      timestamp: new Date().toISOString(),
      input,
      score,
      actualOutcome: outcome,
    });
  }

  /**
   * 成功パターンの分析
   * @summary 成功パターン分析
   * @returns 成功パターンの特徴
   */
  analyzeSuccessPatterns(): {
    avgClarity: number;
    avgContext: number;
    commonCharacteristics: string[];
  } {
    const successRecords = this.records.filter((r) => r.actualOutcome === "success");

    if (successRecords.length === 0) {
      return { avgClarity: 0, avgContext: 0, commonCharacteristics: [] };
    }

    const avgClarity =
      successRecords.reduce((sum, r) => sum + r.score.dimensions.clarity, 0) /
      successRecords.length;

    const avgContext =
      successRecords.reduce((sum, r) => sum + r.score.dimensions.context, 0) /
      successRecords.length;

    const commonCharacteristics: string[] = [];
    if (avgClarity > 70) commonCharacteristics.push("タスク記述が明確");
    if (avgContext > 70) commonCharacteristics.push("コンテキストが充足");

    return {
      avgClarity: Math.round(avgClarity),
      avgContext: Math.round(avgContext),
      commonCharacteristics,
    };
  }

  /**
   * 記録数を取得
   * @summary 記録数取得
   * @returns 記録数
   */
  getRecordCount(): number {
    return this.records.length;
  }
}

// シングルトンインスタンス
export const delegationQualityTracker = new DelegationQualityTracker();
