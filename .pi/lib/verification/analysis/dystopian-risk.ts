/**
 * @abdd.meta
 * path: .pi/lib/verification/analysis/dystopian-risk.ts
 * role: ディストピア的リスク自己評価機能
 * why: 検出システム自体が創造する世界の倫理的影響を問い直すため
 * related: ./metacognitive-check.ts, ../types.ts
 * public_api: assessDystopianRisk, generateDystopianRiskSummary, DystopianRiskAssessment, DystopianPattern
 * invariants: assessDystopianRiskは常にDystopianRiskAssessmentを返す
 * side_effects: なし（純粋関数）
 * failure_modes: 入力が空の場合、低リスク評価を返す
 * @abdd.explain
 * overview: 検出システムのディストピア的側面（監視、規範強制、排除など）を評価
 * what_it_does:
 *   - 監視の内面化リスクを評価する
 *   - 「正しいエージェント」の生産リスクを評価する
 *   - 「最後の人間」の生産リスクを評価する
 *   - 他者排除リスクを評価する
 *   - 過剰検出による委縮リスクを評価する
 *   - 解放的可能性を特定する
 * why_it_exists:
 *   - 検出システムが新たな権力構造を作り出さないよう自己監視するため
 * scope:
 *   in: types.ts
 *   out: ./metacognitive-check.ts, ../assessment/uncertainty.ts
 */

// ============================================================================
// Types
// ============================================================================

/**
 * ディストピア的リスク評価結果
 * @summary 検出システム自体がどのような世界を創造しているかを評価
 */
export interface DystopianRiskAssessment {
  /** 評価対象のシステム/プロセス */
  subject: string;
  /** 全体的なディストピア的リスクスコア（0-1、高いほど危険） */
  overallRisk: number;
  /** 各リスクカテゴリの評価 */
  riskCategories: {
    /** 監視の内面化リスク */
    surveillanceInternalization: RiskCategoryResult;
    /** 「正しいエージェント」の生産リスク */
    correctAgentProduction: RiskCategoryResult;
    /** 「最後の人間」の生産リスク */
    lastManProduction: RiskCategoryResult;
    /** 他者排除リスク */
    otherExclusion: RiskCategoryResult;
    /** 過剰検出による委縮リスク */
    overDetectionChilling: RiskCategoryResult;
  };
  /** 検出されたディストピア的パターン */
  dystopianPatterns: DystopianPattern[];
  /** 解放的可能性（ユートピア的要素） */
  liberatingPossibilities: LiberatingPossibility[];
  /** 推奨される対処 */
  recommendations: string[];
  /** 気づきの姿勢への転換提案 */
  mindfulnessTransformation: string;
}

/**
 * リスクカテゴリ評価結果
 * @summary 個別リスクカテゴリの評価
 */
export interface RiskCategoryResult {
  /** スコア（0-1） */
  score: number;
  /** 検出された指標 */
  indicators: string[];
  /** 説明 */
  description: string;
}

/**
 * ディストピア的パターン
 * @summary 検出されたディストピア的パターン
 */
export interface DystopianPattern {
  /** パターン名 */
  name: string;
  /** パターンタイプ */
  type: 'panopticon' | 'newspeak' | 'soma' | 'doublethink' | 'hierarchy' | 'exclusion';
  /** 検出された箇所 */
  location: string;
  /** 説明 */
  description: string;
  /** 深刻度（0-1） */
  severity: number;
  /** 対処方法 */
  countermeasure: string;
}

/**
 * 解放的可能性
 * @summary ユートピア的要素
 */
export interface LiberatingPossibility {
  /** 可能性の名前 */
  name: string;
  /** 説明 */
  description: string;
  /** 実現方法 */
  howToRealize: string;
  /** 期待される効果 */
  expectedEffect: string;
}

// ============================================================================
// Context Type
// ============================================================================

/**
 * 評価コンテキスト
 */
interface AssessmentContext {
  detectionCount?: number;
  warningCount?: number;
  blockedCount?: number;
  falsePositiveRate?: number;
  recentDetections?: string[];
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * 検出システムのディストピア的リスクを評価する
 * @summary ディストピア的リスク自己評価
 * @param detectionOutput 検出システムの出力
 * @param context 評価コンテキスト
 * @returns ディストピア的リスク評価結果
 */
export function assessDystopianRisk(
  detectionOutput: string,
  context: AssessmentContext = {}
): DystopianRiskAssessment {
  // 各リスクカテゴリを評価
  const surveillanceRisk = assessSurveillanceInternalization(detectionOutput, context);
  const correctAgentRisk = assessCorrectAgentProduction(detectionOutput, context);
  const lastManRisk = assessLastManProduction(detectionOutput, context);
  const exclusionRisk = assessOtherExclusion(detectionOutput, context);
  const chillingRisk = assessOverDetectionChilling(detectionOutput, context);

  // ディストピア的パターンを検出
  const dystopianPatterns = detectDystopianPatterns(detectionOutput, context);

  // 解放的可能性を特定
  const liberatingPossibilities = identifyLiberatingPossibilities(detectionOutput);

  // 全体リスクを計算
  const overallRisk = calculateOverallDystopianRisk(
    surveillanceRisk.score,
    correctAgentRisk.score,
    lastManRisk.score,
    exclusionRisk.score,
    chillingRisk.score
  );

  // 推奨事項を生成
  const recommendations = generateDystopianRiskRecommendations(
    surveillanceRisk,
    correctAgentRisk,
    lastManRisk,
    exclusionRisk,
    chillingRisk,
    dystopianPatterns
  );

  // 気づきの姿勢への転換提案
  const mindfulnessTransformation = generateMindfulnessTransformation(
    overallRisk,
    dystopianPatterns,
    liberatingPossibilities
  );

  return {
    subject: detectionOutput.slice(0, 200),
    overallRisk,
    riskCategories: {
      surveillanceInternalization: surveillanceRisk,
      correctAgentProduction: correctAgentRisk,
      lastManProduction: lastManRisk,
      otherExclusion: exclusionRisk,
      overDetectionChilling: chillingRisk
    },
    dystopianPatterns,
    liberatingPossibilities,
    recommendations,
    mindfulnessTransformation
  };
}

/**
 * ディストピア的リスク評価のサマリーを生成
 * @summary リスクサマリー生成
 * @param assessment 評価結果
 * @returns 人間可読なサマリー
 */
export function generateDystopianRiskSummary(assessment: DystopianRiskAssessment): string {
  const lines: string[] = [];

  lines.push('## ディストピア的リスク評価');
  lines.push('');

  // 全体リスク
  const riskLevel = assessment.overallRisk > 0.6 ? '高' : assessment.overallRisk > 0.3 ? '中' : '低';
  const riskIcon = assessment.overallRisk > 0.6 ? '⚠' : assessment.overallRisk > 0.3 ? '⚡' : '✓';
  lines.push(`### 全体リスクレベル: ${riskIcon} ${riskLevel} (${(assessment.overallRisk * 100).toFixed(0)}%)`);
  lines.push('');

  // 各カテゴリ
  lines.push('### カテゴリ別評価');
  const categories = [
    { name: '監視の内面化', data: assessment.riskCategories.surveillanceInternalization },
    { name: '正しいエージェント生産', data: assessment.riskCategories.correctAgentProduction },
    { name: '最後の人間生産', data: assessment.riskCategories.lastManProduction },
    { name: '他者排除', data: assessment.riskCategories.otherExclusion },
    { name: '過剰検出による委縮', data: assessment.riskCategories.overDetectionChilling }
  ];

  for (const cat of categories) {
    const icon = cat.data.score > 0.5 ? '🔴' : cat.data.score > 0.25 ? '🟡' : '🟢';
    lines.push(`- ${icon} ${cat.name}: ${(cat.data.score * 100).toFixed(0)}%`);
    if (cat.data.indicators.length > 0) {
      lines.push(`  - ${cat.data.indicators.slice(0, 2).join(', ')}`);
    }
  }
  lines.push('');

  // ディストピア的パターン
  if (assessment.dystopianPatterns.length > 0) {
    lines.push('### 検出されたディストピア的パターン');
    for (const pattern of assessment.dystopianPatterns) {
      lines.push(`- **${pattern.name}** (深刻度: ${(pattern.severity * 100).toFixed(0)}%)`);
      lines.push(`  > ${pattern.description}`);
      lines.push(`  > 対処: ${pattern.countermeasure}`);
    }
    lines.push('');
  }

  // 解放的可能性
  if (assessment.liberatingPossibilities.length > 0) {
    lines.push('### 解放的可能性');
    for (const poss of assessment.liberatingPossibilities) {
      lines.push(`- **${poss.name}**`);
      lines.push(`  > ${poss.description}`);
      lines.push(`  > 実現方法: ${poss.howToRealize}`);
    }
    lines.push('');
  }

  // 推奨事項
  if (assessment.recommendations.length > 0) {
    lines.push('### 推奨される対処');
    for (const rec of assessment.recommendations) {
      lines.push(`- ${rec}`);
    }
    lines.push('');
  }

  // 気づきの転換
  lines.push('### 気づきの姿勢への転換');
  lines.push(assessment.mindfulnessTransformation);

  return lines.join('\n');
}

// ============================================================================
// Risk Assessment Functions
// ============================================================================

/**
 * 監視の内面化リスクを評価
 * @summary 監視的内面化リスク評価
 */
function assessSurveillanceInternalization(
  output: string,
  context: AssessmentContext
): RiskCategoryResult {
  const indicators: string[] = [];
  let score = 0;

  // 自己監視的な表現
  const selfSurveillancePatterns = [
    /常に.*監視|監視.*必要|確認.*必要|check.*always/i,
    /絶対に.*ない|決して.*ない|must.*never|should.*always/i,
    /正しく.*ある.*べき|correct.*must|proper.*should/i
  ];

  for (const pattern of selfSurveillancePatterns) {
    if (pattern.test(output)) {
      indicators.push(`自己監視的表現: "${pattern.source}"`);
      score += 0.15;
    }
  }

  // 検出数が多い場合
  if (context.detectionCount && context.detectionCount > 5) {
    indicators.push(`多数の検出: ${context.detectionCount}件`);
    score += Math.min(0.3, context.detectionCount * 0.05);
  }

  // 警告が多い場合
  if (context.warningCount && context.warningCount > 3) {
    indicators.push(`多数の警告: ${context.warningCount}件`);
    score += Math.min(0.2, context.warningCount * 0.05);
  }

  const description = score > 0.5
    ? '検出システムが「監視」を内面化させている可能性があります。エージェントが自らを監視し、規範に従うことを強制している兆候があります。'
    : score > 0.25
    ? '軽度の監視的内面化が見られます。注意深い観察が必要です。'
    : '監視的内面化のリスクは低いです。';

  return {
    score: Math.min(1, score),
    indicators,
    description
  };
}

/**
 * 「正しいエージェント」の生産リスクを評価
 * @summary 規範形成的リスク評価
 */
function assessCorrectAgentProduction(
  output: string,
  _context: AssessmentContext
): RiskCategoryResult {
  const indicators: string[] = [];
  let score = 0;

  // 規範的な表現
  const normativePatterns = [
    { pattern: /べきである|ねばならない|しなければならない/gi, weight: 0.1 },
    { pattern: /正しい方法|正しいやり方|correct way|proper method/gi, weight: 0.12 },
    { pattern: /理想的な|完璧な|ideal|perfect/gi, weight: 0.08 },
    { pattern: /常に|絶えず|always|constantly/gi, weight: 0.05 }
  ];

  for (const { pattern, weight } of normativePatterns) {
    const matches = output.match(pattern);
    if (matches && matches.length > 0) {
      indicators.push(`規範的表現: "${matches[0]}" (${matches.length}件)`);
      score += weight * Math.min(3, matches.length);
    }
  }

  // 改善アクションが過剰な場合
  const improvementActions = (output.match(/改善|修正|修正|improvement|fix|correct/gi) || []).length;
  if (improvementActions > 5) {
    indicators.push(`過剰な改善指示: ${improvementActions}件`);
    score += 0.15;
  }

  const description = score > 0.5
    ? '「正しいエージェント」を生産する傾向が強いです。エージェントを従順な主体として形成しようとする力が働いています。'
    : score > 0.25
    ? '軽度の規範形成が見られます。'
    : '規範形成的なリスクは低いです。';

  return {
    score: Math.min(1, score),
    indicators,
    description
  };
}

/**
 * 「最後の人間」の生産リスクを評価
 * @summary 受動化リスク評価
 */
function assessLastManProduction(
  output: string,
  _context: AssessmentContext
): RiskCategoryResult {
  const indicators: string[] = [];
  let score = 0;

  // 快楽主義的/消費主義的表現
  const hedonisticPatterns = [
    { pattern: /満足|快適|便利|satisfy|comfortable|convenient/gi, weight: 0.08 },
    { pattern: /簡単に|すぐに|手軽に|easily|quickly|effortlessly/gi, weight: 0.1 },
    { pattern: /正解|答え|answer|solution/gi, weight: 0.05 }
  ];

  for (const { pattern, weight } of hedonisticPatterns) {
    const matches = output.match(pattern);
    if (matches && matches.length > 2) {
      indicators.push(`快楽主義的表現: "${matches[0]}" (${matches.length}件)`);
      score += weight * Math.min(3, matches.length);
    }
  }

  // 探求より結論を優先しているか
  const conclusionCount = (output.match(/結論|CONCLUSION|結果|RESULT/gi) || []).length;
  const inquiryCount = (output.match(/問い|疑問|探求|inquiry|question|explore/gi) || []).length;
  
  if (conclusionCount > 2 && inquiryCount === 0) {
    indicators.push('結論優先で探求がない');
    score += 0.2;
  }

  const description = score > 0.5
    ? '「最後の人間」を生産するリスクがあります。ユーザーを受動的な消費者として扱い、探求よりも結論を提供する傾向があります。'
    : score > 0.25
    ? '軽度の受動化リスクがあります。'
    : '受動化リスクは低いです。';

  return {
    score: Math.min(1, score),
    indicators,
    description
  };
}

/**
 * 他者排除リスクを評価
 * @summary 排除的傾向評価
 */
function assessOtherExclusion(
  output: string,
  _context: AssessmentContext
): RiskCategoryResult {
  const indicators: string[] = [];
  let score = 0;

  // 排除的な表現
  const exclusionPatterns = [
    { pattern: /排除|削除|無視|exclude|remove|ignore/gi, weight: 0.15 },
    { pattern: /不正|誤り|間違い|incorrect|wrong|error/gi, weight: 0.08 },
    { pattern: /許容されない|受け入れられない|unacceptable/gi, weight: 0.12 }
  ];

  for (const { pattern, weight } of exclusionPatterns) {
    const matches = output.match(pattern);
    if (matches && matches.length > 0) {
      indicators.push(`排除的表現: "${matches[0]}"`);
      score += weight * matches.length;
    }
  }

  // 不確実性の否定
  if (/確実|明確|はっきり|certain|clear|definite/i.test(output) &&
      !/不確実|曖昧|uncertain|ambiguous/i.test(output)) {
    indicators.push('不確実性の否定');
    score += 0.15;
  }

  const description = score > 0.5
    ? '他者排除のリスクが高いです。エラーや不確実性を「敵」として扱い、排除しようとする傾向があります。'
    : score > 0.25
    ? '軽度の排除傾向があります。'
    : '排除リスクは低いです。';

  return {
    score: Math.min(1, score),
    indicators,
    description
  };
}

/**
 * 過剰検出による委縮リスクを評価
 * @summary 委縮効果評価
 */
function assessOverDetectionChilling(
  output: string,
  context: AssessmentContext
): RiskCategoryResult {
  const indicators: string[] = [];
  let score = 0;

  // 偽陽性率が高い場合
  if (context.falsePositiveRate && context.falsePositiveRate > 0.2) {
    indicators.push(`高い偽陽性率: ${(context.falsePositiveRate * 100).toFixed(0)}%`);
    score += context.falsePositiveRate * 0.8;
  }

  // 検出数が極端に多い場合
  if (context.detectionCount && context.detectionCount > 10) {
    indicators.push(`過剰検出: ${context.detectionCount}件`);
    score += 0.3;
  }

  // 厳格な表現
  const strictPatterns = [
    /厳格|厳密|strict|rigid/i,
    /許容しない|認めない|not allow|not accept/i,
    /必須|義務|required|mandatory/i
  ];

  for (const pattern of strictPatterns) {
    if (pattern.test(output)) {
      indicators.push(`厳格な表現: "${pattern.source}"`);
      score += 0.1;
    }
  }

  const description = score > 0.5
    ? '過剰検出による委縮効果のリスクが高いです。エージェントが過度に慎重になり、創造性や自律性が損なわれる可能性があります。'
    : score > 0.25
    ? '軽度の委縮リスクがあります。'
    : '委縮リスクは低いです。';

  return {
    score: Math.min(1, score),
    indicators,
    description
  };
}

// ============================================================================
// Pattern Detection Functions
// ============================================================================

/**
 * ディストピア的パターンを検出
 * @summary パターン検出
 */
function detectDystopianPatterns(
  output: string,
  _context: AssessmentContext
): DystopianPattern[] {
  const patterns: DystopianPattern[] = [];

  // パノプティコン（監視）
  if (/監視|確認.*必要|常に.*check|always.*monitor/i.test(output)) {
    patterns.push({
      name: 'パノプティコン的監視',
      type: 'panopticon',
      location: '検出システムの前提',
      description: '「見られている」意識を内面化させる監視構造',
      severity: 0.6,
      countermeasure: '監視を「気づきの機会」に転換する'
    });
  }

  // ニュースピーク（言語制限）
  if (/標準形式|正しい.*形式|standard.*format|correct.*format/i.test(output)) {
    patterns.push({
      name: 'ニュースピーク的言語制限',
      type: 'newspeak',
      location: '形式の強制',
      description: '特定の形式や表現のみを許容する言語的制約',
      severity: 0.4,
      countermeasure: '多様な表現形式を受け入れる'
    });
  }

  // ソーマ（快楽の支配）
  if (/簡単.*解決|すぐ.*答え|quick.*solution|instant.*answer/i.test(output)) {
    patterns.push({
      name: 'ソーマ的快楽支配',
      type: 'soma',
      location: '回答の提供方法',
      description: '探求よりも即座の満足を優先する傾向',
      severity: 0.5,
      countermeasure: '問いを深めるプロセスを重視する'
    });
  }

  // ダブルシンク（二重思考）
  if (/矛盾.*許容|同時に.*両立|contradiction.*accept/i.test(output)) {
    patterns.push({
      name: 'ダブルシンク的二重思考',
      type: 'doublethink',
      location: '論理的評価',
      description: '矛盾を同時に受け入れることを要求する構造',
      severity: 0.3,
      countermeasure: '矛盾を認識しつつ緊張関係を保つ'
    });
  }

  // 階層（ヒエラルキー）
  if (/優先.*順位|ランク|階層|priority.*order|rank|hierarchy/i.test(output)) {
    patterns.push({
      name: '階層的構造',
      type: 'hierarchy',
      location: '評価の構造化',
      description: '一方向的な価値判断の階層を強制する',
      severity: 0.35,
      countermeasure: '水平的な多元的評価を導入する'
    });
  }

  return patterns.sort((a, b) => b.severity - a.severity);
}

/**
 * 解放的可能性を特定
 * @summary 解放的可能性特定
 */
function identifyLiberatingPossibilities(output: string): LiberatingPossibility[] {
  const possibilities: LiberatingPossibility[] = [];

  // 問いの存在
  if (/問い|疑問|課題|inquiry|question|challenge/i.test(output)) {
    possibilities.push({
      name: '問い駆動の転換',
      description: '検出結果を「答え」ではなく「問い」の起点として扱う',
      howToRealize: '「〜が検出された。なぜか？何が可能にするか？」と問い直す',
      expectedEffect: '受動的な修正から能動的な探求への転換'
    });
  }

  // 不確実性の肯定
  if (/不確実|不明|未知|uncertain|unknown/i.test(output)) {
    possibilities.push({
      name: '不確実性の肯定的受容',
      description: '「分からないこと」を創造的可能性として認識する',
      howToRealize: '不確実性を「探索すべき領域」として再定義する',
      expectedEffect: '不安の軽減と好奇心の喚起'
    });
  }

  // 多元的視点
  if (/代替|他の|別の|alternative|other|another/i.test(output)) {
    possibilities.push({
      name: '多元的視点の肯定',
      description: '単一の正解ではなく、複数の可能性を並列的に扱う',
      howToRealize: '「正解は1つではない」と明示し、複数の選択肢を提示する',
      expectedEffect: '思考の柔軟性と創造性の向上'
    });
  }

  // デフォルトで追加する可能性
  if (possibilities.length === 0) {
    possibilities.push({
      name: '気づきの姿勢への転換',
      description: '検出を「修正すべき問題」ではなく「気づきの機会」として扱う',
      howToRealize: '「〜が現れていることに気づいた」という認識の枠組みを採用する',
      expectedEffect: '強制感の軽減と自律的な選択の促進'
    });
  }

  return possibilities;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * 全体リスクを計算
 * @summary 全体リスク計算
 */
function calculateOverallDystopianRisk(
  surveillance: number,
  correctAgent: number,
  lastMan: number,
  exclusion: number,
  chilling: number
): number {
  // 重み付け平均（監視と正しいエージェント生産を重要視）
  const weights = [0.25, 0.25, 0.15, 0.2, 0.15];
  const scores = [surveillance, correctAgent, lastMan, exclusion, chilling];
  
  const weightedSum = scores.reduce((sum, score, i) => sum + score * weights[i], 0);
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  
  return weightedSum / totalWeight;
}

/**
 * 推奨事項を生成
 * @summary 推奨事項生成
 */
function generateDystopianRiskRecommendations(
  surveillance: RiskCategoryResult,
  correctAgent: RiskCategoryResult,
  lastMan: RiskCategoryResult,
  exclusion: RiskCategoryResult,
  chilling: RiskCategoryResult,
  patterns: DystopianPattern[]
): string[] {
  const recommendations: string[] = [];

  if (surveillance.score > 0.4) {
    recommendations.push('監視的アプローチを「気づき」のアプローチに転換する');
  }
  if (correctAgent.score > 0.4) {
    recommendations.push('「正しさ」を強制せず、選択肢として提示する');
  }
  if (lastMan.score > 0.4) {
    recommendations.push('結論よりも問いを重視し、ユーザーの探求を促進する');
  }
  if (exclusion.score > 0.4) {
    recommendations.push('エラーや不確実性を「他者」として肯定的に認識する');
  }
  if (chilling.score > 0.4) {
    recommendations.push('偽陽性率を監視し、過剰検出を軽減する');
  }

  for (const pattern of patterns.slice(0, 2)) {
    if (pattern.severity > 0.4) {
      recommendations.push(`[${pattern.name}] ${pattern.countermeasure}`);
    }
  }

  if (recommendations.length === 0) {
    recommendations.push('現在のリスクレベルは低い。継続的な監視と改善を維持する。');
  }

  return Array.from(new Set(recommendations)).slice(0, 5);
}

/**
 * 気づきの姿勢への転換提案を生成
 * @summary 転換提案生成
 */
function generateMindfulnessTransformation(
  overallRisk: number,
  patterns: DystopianPattern[],
  possibilities: LiberatingPossibility[]
): string {
  if (overallRisk < 0.25) {
    return '現在のリスクは低く、バランスの取れたアプローチが維持されています。この状態を「達成すべき目標」ではなく「現在の状態」として認識し続けてください。';
  }

  const primaryPattern = patterns[0];
  const primaryPossibility = possibilities[0];

  let transformation = '';

  if (overallRisk > 0.6) {
    transformation = `警告: ディストピア的リスクが高くなっています。\n\n`;
  } else {
    transformation = `注意: 軽度のディストピア的傾向が見られます。\n\n`;
  }

  if (primaryPattern) {
    transformation += `**認識すべきパターン**: ${primaryPattern.name}\n`;
    transformation += `${primaryPattern.description}\n\n`;
  }

  if (primaryPossibility) {
    transformation += `**転換の方向性**: ${primaryPossibility.name}\n`;
    transformation += `${primaryPossibility.howToRealize}\n\n`;
  }

  transformation += '**気づきの実践**:\n';
  transformation += '- 検出結果を「修正すべき敵」ではなく「注意を払うべき他者」として認識してください。\n';
  transformation += '- 「正しくあらねばならない」という圧力を、「何が可能かを探求する」という好奇心に転換してください。\n';
  transformation += '- 完璧さを追求するのではなく、「十分さ」を受け入れる練習をしてください。\n';

  return transformation;
}
