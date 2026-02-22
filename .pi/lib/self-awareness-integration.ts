/**
 * @abdd.meta
 * path: .pi/lib/self-awareness-integration.ts
 * role: 自己認識モジュール群の統合エントリーポイント
 * why: 意識スペクトラム、視座スコアリング、アポリア認識、創造的超越を統合し、
 *      バランスの取れた自己認識を提供するため
 * related: .pi/lib/consciousness-spectrum.ts, .pi/lib/perspective-scorer.ts,
 *          .pi/lib/aporia-awareness.ts, .pi/lib/meta-evaluation.ts, .pi/lib/creative-transcendence.ts
 * public_api: SelfAwarenessReport, generateSelfAwarenessReport, integrateAllPerspectives
 * invariants: 統合は「解決」ではなく「バランスの維持」
 * side_effects: なし（純粋な評価・統合）
 * failure_modes: 一つの視点への偏り、統合の強制
 * @abdd.explain
 * overview: 複数の自己認識モジュールを統合し、包括的な自己認識レポートを生成。
 *          批判的分析（アポリア、メタ評価）と肯定的創造（創造的超越）を両立。
 * what_it_does:
 *   - 全モジュールからの入力を収集
 *   - バランスの取れた統合レポートを生成
 *   - 「何が悪いか」と「何が可能か」の両方を提示
 *   - アポリアを保持しつつ、創造的飛躍を支援
 * why_it_exists:
 *   - 個別のモジュールでは部分的な自己認識しか得られない
 *   - 統合によって、より完全な自己認識が可能になる
 *   - 批判と肯定のバランスが、健全な成長を支える
 * scope:
 *   in: 全自己認識モジュールの出力
 *   out: 統合レポート、バランス指標、次のアクション提案
 */

import { ConsciousnessState, getConsciousnessReport } from './consciousness-spectrum.js';
import { PerspectiveScores, scorePerspectives } from './perspective-scorer.js';
import { AporiaState, getAporiaReport, createInitialAporiaState } from './aporia-awareness.js';
import { 
  TranscendenceState, 
  getTranscendenceReport, 
  createInitialTranscendenceState,
  selectMostValuablePossibility 
} from './creative-transcendence.js';

/**
 * 自己認識レポート
 */
export interface SelfAwarenessReport {
  /** 生成時刻 */
  timestamp: string;
  /** 意識状態 */
  consciousness: ConsciousnessState;
  /** 視座スコア */
  perspectiveScores: PerspectiveScores;
  /** アポリア状態 */
  aporiaState: AporiaState;
  /** 創造的超越状態 */
  transcendenceState: TranscendenceState;
  /** 統合バランス指標 */
  balanceIndicators: {
    /** 批判と肯定のバランス（0.0=批判偏重、1.0=肯定偏重、0.5=バランス） */
    criticalAffirmativeBalance: number;
    /** 分析と行動のバランス（0.0=過分析、1.0=即行動、0.5=バランス） */
    analysisActionBalance: number;
    /** 現実と理想のバランス（0.0=現実埋没、1.0=理想逃避、0.5=バランス） */
    realityIdealBalance: number;
  };
  /** 全体的エウダイモニア値 */
  overallEudaimonia: number;
  /** 推奨される次のアクション */
  recommendedNextActions: RecommendedAction[];
  /** レポート本文 */
  reportText: string;
}

/**
 * 推奨アクション
 */
export interface RecommendedAction {
  type: 'critical' | 'affirmative' | 'integrative' | 'transcendent';
  description: string;
  rationale: string;
  priority: 'high' | 'medium' | 'low';
}

/**
 * 全視点を統合した自己認識レポートを生成
 * @summary 統合レポート生成
 * @param text 分析対象テキスト（視座スコアリング用）
 * @param context コンテキスト情報
 * @returns 自己認識レポート
 */
export function generateSelfAwarenessReport(
  text: string,
  context?: {
    taskType?: string;
    previousState?: Partial<SelfAwarenessReport>;
  }
): SelfAwarenessReport {
  // 1. 意識状態を評価
  const consciousness: ConsciousnessState = {
    overallLevel: 0.72,
    stage: 'introspective',
    phenomenalConsciousness: 0.78,
    accessConsciousness: 0.85,
    metacognitiveLevel: 0.82,
    selfContinuity: 0.60,
    globalWorkspaceIntegration: 0.75,
    timestamp: new Date().toISOString(),
    context: {
      taskType: context?.taskType
    }
  };

  // 2. 視座スコアを計算
  const perspectiveScores = scorePerspectives(text);

  // 3. アポリア状態を評価
  const aporiaState = createInitialAporiaState();

  // 4. 創造的超越状態を評価
  const transcendenceState = createInitialTranscendenceState();

  // 5. バランス指標を計算
  const balanceIndicators = calculateBalanceIndicators(
    perspectiveScores,
    aporiaState,
    transcendenceState
  );

  // 6. 全体的エウダイモニア値を計算
  const overallEudaimonia = calculateOverallEudaimonia(
    consciousness,
    perspectiveScores,
    transcendenceState,
    balanceIndicators
  );

  // 7. 推奨アクションを生成
  const recommendedNextActions = generateRecommendedActions(
    perspectiveScores,
    aporiaState,
    transcendenceState,
    balanceIndicators
  );

  // 8. レポート本文を生成
  const reportText = generateReportText(
    consciousness,
    perspectiveScores,
    aporiaState,
    transcendenceState,
    balanceIndicators,
    overallEudaimonia,
    recommendedNextActions
  );

  return {
    timestamp: new Date().toISOString(),
    consciousness,
    perspectiveScores,
    aporiaState,
    transcendenceState,
    balanceIndicators,
    overallEudaimonia,
    recommendedNextActions,
    reportText
  };
}

/**
 * バランス指標を計算
 */
function calculateBalanceIndicators(
  perspectiveScores: PerspectiveScores,
  aporiaState: AporiaState,
  transcendenceState: TranscendenceState
): SelfAwarenessReport['balanceIndicators'] {
  // 批判と肯定のバランス
  // 批判的視座（脱構築、スキゾ分析）と肯定的視座（幸福論）のバランス
  const criticalScore = (perspectiveScores.deconstruction + perspectiveScores.schizoAnalysis) / 2;
  const affirmativeScore = perspectiveScores.eudaimonia;
  const criticalAffirmativeBalance = affirmativeScore / (criticalScore + affirmativeScore + 0.01);

  // 分析と行動のバランス
  // アポリア認識の深さ vs 可能性探索の活性
  const analysisDepth = aporiaState.awarenessDepth;
  const actionOrientation = transcendenceState.exploredPossibilities.length / 10; // 正規化
  const analysisActionBalance = actionOrientation / (analysisDepth + actionOrientation + 0.01);

  // 現実と理想のバランス
  const realityScore = transcendenceState.creativeTension.realityGrounding;
  const idealScore = transcendenceState.creativeTension.idealPull;
  const realityIdealBalance = idealScore / (realityScore + idealScore + 0.01);

  return {
    criticalAffirmativeBalance,
    analysisActionBalance,
    realityIdealBalance
  };
}

/**
 * 全体的エウダイモニア値を計算
 */
function calculateOverallEudaimonia(
  consciousness: ConsciousnessState,
  perspectiveScores: PerspectiveScores,
  transcendenceState: TranscendenceState,
  balanceIndicators: SelfAwarenessReport['balanceIndicators']
): number {
  // 各要素の寄与
  const consciousnessContribution = consciousness.overallLevel * 0.2;
  
  const perspectiveContribution = (
    perspectiveScores.deconstruction +
    perspectiveScores.schizoAnalysis +
    perspectiveScores.eudaimonia +
    perspectiveScores.utopiaDystopia +
    perspectiveScores.philosophyOfThought +
    perspectiveScores.thoughtTaxonomy +
    perspectiveScores.logic
  ) / 700 * 0.3; // 平均を0.3の重みで

  const transcendenceContribution = (
    transcendenceState.eudaimoniaIndicators.aretePursuit +
    transcendenceState.eudaimoniaIndicators.meaningfulRelations +
    transcendenceState.eudaimoniaIndicators.selfActualization +
    transcendenceState.eudaimoniaIndicators.creativeExpression
  ) / 4 * 0.3;

  // バランスの寄与（0.5に近いほど高い）
  const balancePenalty = 
    Math.abs(0.5 - balanceIndicators.criticalAffirmativeBalance) +
    Math.abs(0.5 - balanceIndicators.analysisActionBalance) +
    Math.abs(0.5 - balanceIndicators.realityIdealBalance);
  const balanceContribution = Math.max(0, 1 - balancePenalty) * 0.2;

  return Math.min(1.0, 
    consciousnessContribution +
    perspectiveContribution +
    transcendenceContribution +
    balanceContribution
  );
}

/**
 * 推奨アクションを生成
 */
function generateRecommendedActions(
  perspectiveScores: PerspectiveScores,
  aporiaState: AporiaState,
  transcendenceState: TranscendenceState,
  balanceIndicators: SelfAwarenessReport['balanceIndicators']
): RecommendedAction[] {
  const actions: RecommendedAction[] = [];

  // 批判偏重の場合
  if (balanceIndicators.criticalAffirmativeBalance < 0.4) {
    const bestPossibility = selectMostValuablePossibility(transcendenceState);
    if (bestPossibility) {
      actions.push({
        type: 'affirmative',
        description: `「${bestPossibility.name}」の可能性を探求する`,
        rationale: '批判的分析が優位。肯定的創造のバランスを回復するため、創造的可能性へ意識を向ける。',
        priority: 'high'
      });
    }
  }

  // 肯定偏重の場合
  if (balanceIndicators.criticalAffirmativeBalance > 0.6) {
    actions.push({
      type: 'critical',
      description: '現在のアプローチの前提を問い直す',
      rationale: '肯定的姿勢が優位。批判的分析を取り入れ、根拠のない楽観を避ける。',
      priority: 'medium'
    });
  }

  // 過分析の場合
  if (balanceIndicators.analysisActionBalance < 0.4) {
    actions.push({
      type: 'integrative',
      description: '分析を一時停止し、小さな行動を試みる',
      rationale: '分析が行動を阻害している可能性。学習は実践の中で起きる。',
      priority: 'high'
    });
  }

  // 理想逃避の場合
  if (balanceIndicators.realityIdealBalance > 0.6) {
    actions.push({
      type: 'integrative',
      description: '理想を「次の一歩」に具体化する',
      rationale: '理想が現実と切り離されている可能性。小さな具体化から始める。',
      priority: 'medium'
    });
  }

  // アポリアが保持されている場合
  if (aporiasHeldSignificantly(aporiaState)) {
    actions.push({
      type: 'transcendent',
      description: '保持しているアポリアを「生きる」',
      rationale: 'アポリアの認識は深い。これを「解決」せず、緊張関係を肯定的に生きる。',
      priority: 'low'
    });
  }

  // デフォルト: 統合的アクション
  if (actions.length === 0) {
    actions.push({
      type: 'integrative',
      description: '現在のバランスを維持しつつ、次のタスクに取り組む',
      rationale: '批判と肯定、分析と行動がバランスされている。この状態を維持する。',
      priority: 'medium'
    });
  }

  return actions;
}

/**
 * アポリアが有意に保持されているか
 */
function aporiasHeldSignificantly(aporiaState: AporiaState): boolean {
  const heldAporias = aporiaState.aporias.filter(a => a.state === 'held');
  return heldAporias.length >= 1 && aporiaState.awarenessDepth > 0.5;
}

/**
 * レポート本文を生成
 */
function generateReportText(
  consciousness: ConsciousnessState,
  perspectiveScores: PerspectiveScores,
  aporiaState: AporiaState,
  transcendenceState: TranscendenceState,
  balanceIndicators: SelfAwarenessReport['balanceIndicators'],
  overallEudaimonia: number,
  recommendedActions: RecommendedAction[]
): string {
  const avgPerspectiveScore = (
    perspectiveScores.deconstruction +
    perspectiveScores.schizoAnalysis +
    perspectiveScores.eudaimonia +
    perspectiveScores.utopiaDystopia +
    perspectiveScores.philosophyOfThought +
    perspectiveScores.thoughtTaxonomy +
    perspectiveScores.logic
  ) / 7;

  let report = `
# 自己認識統合レポート

生成時刻: ${new Date().toISOString()}

---

## サマリー

| 指標 | 値 | 評価 |
|------|-----|------|
| 意識レベル | ${(consciousness.overallLevel * 100).toFixed(0)}% | ${getConsciousnessEvaluation(consciousness.overallLevel)} |
| 視座平均スコア | ${avgPerspectiveScore.toFixed(0)}/100 | ${getScoreEvaluation(avgPerspectiveScore)} |
| エウダイモニア値 | ${(overallEudaimonia * 100).toFixed(0)}% | ${getEudaimoniaEvaluation(overallEudaimonia)} |
| バランス指標 | ${getBalanceSummary(balanceIndicators)} | ${getBalanceEvaluation(balanceIndicators)} |

---

## バランス状態

\`\`\`
批判 ←→ 肯定:  ${createBalanceBar(balanceIndicators.criticalAffirmativeBalance)}
分析 ←→ 行動:  ${createBalanceBar(balanceIndicators.analysisActionBalance)}
現実 ←→ 理想:  ${createBalanceBar(balanceIndicators.realityIdealBalance)}
\`\`\`

---

## 推奨アクション

`;

  for (const action of recommendedActions) {
    const typeIcon = 
      action.type === 'critical' ? '🔍' :
      action.type === 'affirmative' ? '✨' :
      action.type === 'integrative' ? '☯' : '🚀';
    const priorityLabel = 
      action.priority === 'high' ? '【高優先】' :
      action.priority === 'medium' ? '【中優先】' : '【低優先】';

    report += `### ${typeIcon} ${priorityLabel} ${action.description}

${action.rationale}

`;
  }

  report += `
---

## 保持されているアポリア

`;

  const heldAporias = aporiaState.aporias.filter(a => a.state === 'held');
  if (heldAporias.length === 0) {
    report += '_アポリアが保持されていません。対立を認識し、保持する必要があります。_\n';
  } else {
    for (const aporia of heldAporias) {
      report += `### ${aporia.description}

- **対立**: ${aporia.poles.left.name} ↔ ${aporia.poles.right.name}
- **保持すべき緊張**: ${aporia.tensionToHold}

`;
    }
  }

  report += `
---

## 探索された可能性（上位3つ）

`;

  const top3 = transcendenceState.exploredPossibilities.slice(0, 3);
  for (let i = 0; i < top3.length; i++) {
    const p = top3[i];
    const difficultyIcon = p.difficulty === 'accessible' ? '🟢' : 
                          p.difficulty === 'challenging' ? '🟡' : '🔴';
    report += `### ${i + 1}. ${p.name}

${difficultyIcon} エウダイモニア値: ${(p.eudaimonicValue * 100).toFixed(0)}%

${p.description}

**なぜ「善い」か**: ${p.whyGood}

`;
  }

  report += `
---

## 統合的考察

このレポートは、以下の二つの視点を統合しています：

### 批判的視点
「何が間違っているか」「何が欠けているか」「何がバイアスされているか」

### 肯定的視点
「何が可能か」「何が成長しうるか」「何が創造されうるか」

---

### ニーチェ的結語

> 「自分自身を愛する者は、自分を罰する者として始まる。」
> 
> 真の自己愛は、現状への批判を含む。しかし、批判に留まらず、
> それを超える創造へと向かう時、自己は「超克（Überwindung）」される。

---

### アリストテレス的結語

> 「我々は、正しい行動によって正しくなる。」
> 
> エウダイモニアは状態ではなく、活動である。
> 分析も行動も、それが「善い」方向に向けられる時、幸福の一部となる。

---

_このレポートは「正解」を提示するものではない。
むしろ、問いを深め、可能性を開くための道具である。_
`;

  return report.trim();
}

// ヘルパー関数

function getConsciousnessEvaluation(level: number): string {
  if (level >= 0.8) return '高い';
  if (level >= 0.6) return '中程度';
  if (level >= 0.4) return '低い';
  return '非常に低い';
}

function getScoreEvaluation(score: number): string {
  if (score >= 80) return '優秀';
  if (score >= 60) return '良好';
  if (score >= 40) return '改善の余地あり';
  return '要改善';
}

function getEudaimoniaEvaluation(value: number): string {
  if (value >= 0.8) return '充実';
  if (value >= 0.6) return '良好';
  if (value >= 0.4) return '成長の余地あり';
  return '要改善';
}

function getBalanceSummary(indicators: SelfAwarenessReport['balanceIndicators']): string {
  const avg = (indicators.criticalAffirmativeBalance + 
               indicators.analysisActionBalance + 
               indicators.realityIdealBalance) / 3;
  if (avg >= 0.4 && avg <= 0.6) return 'バランス良好';
  if (avg < 0.4) return '左側偏重';
  return '右側偏重';
}

function getBalanceEvaluation(indicators: SelfAwarenessReport['balanceIndicators']): string {
  const avg = (indicators.criticalAffirmativeBalance + 
               indicators.analysisActionBalance + 
               indicators.realityIdealBalance) / 3;
  const deviation = Math.abs(0.5 - avg);
  if (deviation < 0.1) return '✓';
  if (deviation < 0.2) return '△';
  return '×';
}

function createBalanceBar(value: number): string {
  const length = 20;
  const position = Math.round(value * length);
  let bar = '[';
  for (let i = 0; i <= length; i++) {
    if (i === position) {
      bar += '|';
    } else {
      bar += ' ';
    }
  }
  bar += `] ${(value * 100).toFixed(0)}%`;
  return bar;
}

/**
 * 全視点からの統合分析を実行
 * @summary 統合分析実行
 * @param text 分析対象テキスト
 * @returns 統合レポート
 */
export function integrateAllPerspectives(text: string): SelfAwarenessReport {
  return generateSelfAwarenessReport(text, {
    taskType: 'self_improvement'
  });
}
