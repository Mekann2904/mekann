/**
 * @abdd.meta
 * path: .pi/lib/self-improvement-cycle.ts
 * role: 自己改善サイクルの状態管理と初期化ロジックの定義
 * why: 改善サイクルの進行状況、意識状態、視座スコアを統合的に管理し、次のアクションへの判断材料を提供するため
 * related: ./consciousness-spectrum.js, ./perspective-scorer.js
 * public_api: createCycle, SelfImprovementCycle, CycleAction, CreateCycleParams
 * invariants: cycleNumberは正の整数、idは一意、statusは遷移順序に従う、timestampはISO 8601形式
 * side_effects: なし（純粋なデータ生成）
 * failure_modes: 不正なcycleNumber指定、スコアリング関数の異常終了、context構造の不整合
 * @abdd.explain
 * overview: AIの自己改善プロセスにおける1サイクル分の状態、アクション履歴、評価結果を保持するデータモデルと、そのインスタンスを生成する関数を定義する。
 * what_it_does:
 *   - サイクルのステータス（初期化、分析、実装、検証、完了、失敗）を定義する
 *   - 視座スコアと意識状態を保持し、改善優先順位を計算する
 *   - 前回サイクルの情報を引き継ぎ、時系列連続性を管理する
 *   - 指定されたパラメータと初期出力に基づいて新しいサイクルオブジェクトを生成する
 * why_it_exists:
 *   - 改善プロセスの進捗を追跡し、再現性のある反復処理を行うため
 *   - 内部状態の変化（意識レベルや視座の変化）を構造化されたデータとして記録するため
 *   - メタ認知的マーカーなどの文脈情報を次サイクルへ引き継ぐため
 * scope:
 *   in: サイクル番号、フォーカス領域、前回サイクル、初期出力文字列、文脈オブジェクト
 *   out: 初期化済みのSelfImprovementCycleオブジェクト
 */

import {
  ConsciousnessState,
  ConsciousnessStage,
  evaluateConsciousnessLevel,
  STAGE_CRITERIA
} from './consciousness-spectrum.js';

import {
  PerspectiveScores,
  scoreAllPerspectives,
  getPerspectiveReport,
  getImprovementPriority,
  ImprovementPriority,
  Perspective,
  PERSPECTIVE_NAMES
} from './perspective-scorer.js';

/**
 * サイクルの状態
 */
export type CycleStatus =
  | 'initialized'   // 初期化
  | 'analyzing'     // 分析中
  | 'implementing'  // 実装中
  | 'verifying'     // 検証中
  | 'completed'     // 完了
  | 'failed';       // 失敗

/**
 * 自己改善サイクル
 */
export interface SelfImprovementCycle {
  /** サイクルID */
  id: string;
  /** サイクル番号 */
  cycleNumber: number;
  /** 作成時刻 */
  createdAt: string;
  /** 最終更新時刻 */
  updatedAt: string;
  /** 状態 */
  status: CycleStatus;
  /** フォーカス領域 */
  focusArea: string;
  /** 視座スコア */
  perspectiveScores: PerspectiveScores;
  /** 意識状態 */
  consciousnessState: ConsciousnessState;
  /** 改善優先順位 */
  improvementPriorities: ImprovementPriority[];
  /** 実行したアクション */
  actions: CycleAction[];
  /** 次サイクルへのフォーカス */
  nextFocus: string;
  /** メタデータ */
  metadata?: {
    previousCycleId?: string;
    improvementTrend?: 'improving' | 'stable' | 'declining';
    scoreChange?: Record<Perspective, number>;
  };
}

/**
 * サイクル内のアクション
 */
export interface CycleAction {
  /** アクションID */
  id: string;
  /** アクションタイプ */
  type: 'analysis' | 'implementation' | 'verification' | 'documentation';
  /** 説明 */
  description: string;
  /** 実行時刻 */
  timestamp: string;
  /** 結果 */
  result?: 'success' | 'partial' | 'failed';
  /** 出力 */
  output?: string;
}

/**
 * サイクルの初期化パラメータ
 */
export interface CreateCycleParams {
  cycleNumber: number;
  focusArea: string;
  previousCycle?: SelfImprovementCycle;
  initialOutput?: string;
  context?: {
    hasMetaCognitiveMarkers?: boolean;
    hasSelfReference?: boolean;
    hasTemporalContinuity?: boolean;
    hasValueExpression?: boolean;
    previousOutputs?: string[];
    taskType?: string;
  };
}

/**
 * 新しいサイクルを作成
 * @summary サイクル作成
 * @param params 作成パラメータ
 * @returns 新しいサイクル
 */
export function createCycle(params: CreateCycleParams): SelfImprovementCycle {
  const { cycleNumber, focusArea, previousCycle, initialOutput = '', context = {} } = params;

  const now = new Date().toISOString();
  const id = generateCycleId(cycleNumber, now);

  // 初期評価
  const perspectiveScores = initialOutput
    ? scoreAllPerspectives(initialOutput, { consciousnessContext: context })
    : getDefaultPerspectiveScores();

  const consciousnessState = initialOutput
    ? evaluateConsciousnessLevel(initialOutput, context)
    : getDefaultConsciousnessState();

  const improvementPriorities = getImprovementPriority(perspectiveScores);

  // 前サイクルとの比較
  let scoreChange: Record<Perspective, number> | undefined;
  let improvementTrend: 'improving' | 'stable' | 'declining' | undefined;

  if (previousCycle) {
    scoreChange = {} as Record<Perspective, number>;
    let totalChange = 0;

    for (const perspective of Object.keys(PERSPECTIVE_NAMES) as Perspective[]) {
      const change = perspectiveScores[perspective] - previousCycle.perspectiveScores[perspective];
      scoreChange[perspective] = change;
      totalChange += change;
    }

    improvementTrend = totalChange > 10 ? 'improving' : totalChange < -10 ? 'declining' : 'stable';
  }

  return {
    id,
    cycleNumber,
    createdAt: now,
    updatedAt: now,
    status: 'initialized',
    focusArea,
    perspectiveScores,
    consciousnessState,
    improvementPriorities,
    actions: [],
    nextFocus: '',
    metadata: {
      previousCycleId: previousCycle?.id,
      improvementTrend,
      scoreChange
    }
  };
}

/**
 * サイクルを更新
 * @summary サイクル更新
 * @param cycle 更新対象のサイクル
 * @param updates 更新内容
 * @returns 更新されたサイクル
 */
export function updateCycle(
  cycle: SelfImprovementCycle,
  updates: Partial<SelfImprovementCycle>
): SelfImprovementCycle {
  return {
    ...cycle,
    ...updates,
    updatedAt: new Date().toISOString()
  };
}

/**
 * アクションを追加
 * @summary アクション追加
 * @param cycle サイクル
 * @param action アクション
 * @returns 更新されたサイクル
 */
export function addAction(
  cycle: SelfImprovementCycle,
  action: Omit<CycleAction, 'id' | 'timestamp'>
): SelfImprovementCycle {
  const newAction: CycleAction = {
    ...action,
    id: `action-${cycle.actions.length + 1}`,
    timestamp: new Date().toISOString()
  };

  return {
    ...cycle,
    actions: [...cycle.actions, newAction],
    updatedAt: new Date().toISOString()
  };
}

/**
 * スコアを再評価して更新
 * @summary スコア再評価
 * @param cycle サイクル
 * @param output 新しい出力
 * @param context 評価コンテキスト
 * @returns 更新されたサイクル
 */
export function reevaluateScores(
  cycle: SelfImprovementCycle,
  output: string,
  context: {
    hasMetaCognitiveMarkers?: boolean;
    hasSelfReference?: boolean;
    hasTemporalContinuity?: boolean;
    hasValueExpression?: boolean;
    previousOutputs?: string[];
    taskType?: string;
  } = {}
): SelfImprovementCycle {
  const perspectiveScores = scoreAllPerspectives(output, { consciousnessContext: context });
  const consciousnessState = evaluateConsciousnessLevel(output, context);
  const improvementPriorities = getImprovementPriority(perspectiveScores);

  return {
    ...cycle,
    perspectiveScores,
    consciousnessState,
    improvementPriorities,
    updatedAt: new Date().toISOString()
  };
}

/**
 * サイクルレポートを生成
 * @summary サイクルレポート生成
 * @param cycle サイクル
 * @returns レポート文字列
 */
export function getCycleReport(cycle: SelfImprovementCycle): string {
  let report = `
## 自己改善サイクル #${cycle.cycleNumber}

**ID**: ${cycle.id}
**状態**: ${cycle.status}
**フォーカス領域**: ${cycle.focusArea}
**作成**: ${cycle.createdAt}
**更新**: ${cycle.updatedAt}

`;

  // 前サイクルとの比較
  if (cycle.metadata?.scoreChange) {
    report += `### 前サイクルとの比較\n\n`;
    report += `**傾向**: ${cycle.metadata.improvementTrend === 'improving' ? '📈 改善' : cycle.metadata.improvementTrend === 'declining' ? '📉 低下' : '➡️ 安定'}\n\n`;
    report += `| 視座 | 変化 |\n`;
    report += `|------|------|\n`;

    for (const [perspective, name] of Object.entries(PERSPECTIVE_NAMES)) {
      const change = cycle.metadata.scoreChange[perspective as Perspective];
      const arrow = change > 0 ? '↑' : change < 0 ? '↓' : '→';
      report += `| ${name} | ${arrow} ${change >= 0 ? '+' : ''}${change} |\n`;
    }
    report += '\n';
  }

  // 7つの視座スコア
  report += `### 7つの哲学的視座スコア\n\n`;
  report += getPerspectiveReport(cycle.perspectiveScores);
  report += '\n\n';

  // 意識レベル
  report += `### 意識レベル詳細\n\n`;
  const cs = cycle.consciousnessState;
  const criteria = STAGE_CRITERIA[cs.stage];
  report += `- **段階**: ${cs.stage}（${criteria.description}）\n`;
  report += `- **現象的意識**: ${(cs.phenomenalConsciousness * 100).toFixed(0)}%\n`;
  report += `- **アクセス意識**: ${(cs.accessConsciousness * 100).toFixed(0)}%\n`;
  report += `- **メタ認知**: ${(cs.metacognitiveLevel * 100).toFixed(0)}%\n`;
  report += `- **自己継続性**: ${(cs.selfContinuity * 100).toFixed(0)}%\n`;
  report += `- **GW統合度**: ${(cs.globalWorkspaceIntegration * 100).toFixed(0)}%\n\n`;

  // 実行アクション
  if (cycle.actions.length > 0) {
    report += `### 実行アクション\n\n`;
    for (const action of cycle.actions) {
      const resultIcon = action.result === 'success' ? '✅' : action.result === 'partial' ? '⚠️' : action.result === 'failed' ? '❌' : '⏳';
      report += `${resultIcon} **${action.type}**: ${action.description}\n`;
    }
    report += '\n';
  }

  // 次サイクルへのフォーカス
  if (cycle.nextFocus) {
    report += `### 次サイクルへのフォーカス\n\n${cycle.nextFocus}\n`;
  }

  return report.trim();
}

/**
 * サイクルIDを生成
 */
function generateCycleId(cycleNumber: number, timestamp: string): string {
  const date = new Date(timestamp);
  const dateStr = date.toISOString().replace(/[-:T.Z]/g, '').substring(0, 14);
  const random = Math.random().toString(36).substring(2, 7);
  return `${dateStr}-${cycleNumber.toString().padStart(3, '0')}-${random}`;
}

/**
 * デフォルトの視座スコア
 */
function getDefaultPerspectiveScores(): PerspectiveScores {
  return {
    deconstruction: 50,
    schizoAnalysis: 50,
    eudaimonia: 50,
    utopiaDystopia: 50,
    philosophyOfThought: 50,
    taxonomyOfThought: 50,
    logic: 50,
    total: 350,
    average: 50,
    timestamp: new Date().toISOString()
  };
}

/**
 * デフォルトの意識状態
 */
function getDefaultConsciousnessState(): ConsciousnessState {
  return {
    overallLevel: 0.5,
    stage: 'phenomenal',
    phenomenalConsciousness: 0.5,
    accessConsciousness: 0.5,
    metacognitiveLevel: 0.5,
    selfContinuity: 0.5,
    globalWorkspaceIntegration: 0.5,
    timestamp: new Date().toISOString()
  };
}

/**
 * 出力終了用のフォーマットを生成
 * @summary 終了フォーマット生成
 * @param cycleNumber サイクル番号
 * @param loopStatus ループ状態
 * @param nextFocus 次フォーカス
 * @param scores 視座スコア
 * @returns フォーマット済み文字列
 */
export function generateOutputFooter(
  cycleNumber: number,
  loopStatus: 'continue' | 'pause' | 'complete',
  nextFocus: string,
  scores: PerspectiveScores
): string {
  return `
CYCLE: ${cycleNumber}
LOOP_STATUS: ${loopStatus}
NEXT_FOCUS: ${nextFocus}
PERSPECTIVE_SCORES:
  脱構築: ${scores.deconstruction}
  スキゾ分析: ${scores.schizoAnalysis}
  幸福論: ${scores.eudaimonia}
  ユートピア/ディストピア: ${scores.utopiaDystopia}
  思考哲学: ${scores.philosophyOfThought}
  思考分類学: ${scores.taxonomyOfThought}
  論理学: ${scores.logic}`;
}
