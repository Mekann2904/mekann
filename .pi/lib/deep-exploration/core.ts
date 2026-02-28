/**
 * @abdd.meta
 * path: .pi/lib/deep-exploration/core.ts
 * role: 深層探索のメイン機能
 * why: 「答えのない問題」への対処を支援するため
 * related: ./types.ts, ./meta-metacognition.ts, ./non-linear.ts, ./paraconsistent.ts, ./self-destruction.ts, ./seven-perspectives.ts
 * public_api: performDeepExploration, deepenExploration, generateSessionId
 * invariants:
 *   - DeepExplorationSession.idは一意
 *   - DeepExplorationSession.depthは正の整数
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: 深層探索セッションの作成と深化を行うコア機能
 * what_it_does:
 *   - 新規セッションの作成
 *   - セッションの深化
 *   - 各分析モジュールの統合
 * why_it_exists: 複数の認知プロセスを統合し、一貫した探求セッションを提供するため
 * scope:
 *   in: 探求対象、オプション
 *   out: DeepExplorationSession
 */

import type {
  DeepExplorationSession,
  DeepExplorationOptions,
  AporiaCoexistence,
} from './types.js';
import { performMetaMetacognition } from './meta-metacognition.js';
import { performNonLinearThinking } from './non-linear.js';
import { performParaconsistentReasoning } from './paraconsistent.js';
import { performSelfDestruction } from './self-destruction.js';
import { performSevenPerspectivesAnalysis } from './seven-perspectives.js';

/**
 * デフォルトの前提リスト
 */
const DEFAULT_PREMISES = [
  'この問題には答えがある',
  'より良い解決策が存在する',
  '思考を深めれば解決できる',
];

/**
 * セッションIDを生成
 * @returns 一意のセッションID
 */
export function generateSessionId(): string {
  return `deep-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 次の探求方向を生成
 * @param perspectives - 7つの視座からの分析結果
 * @param paraconsistentState - 準矛盾状態
 * @param selfDestruction - 自己破壊結果
 * @returns 次の探求方向のリスト
 */
function generateNextDirections(
  perspectives: DeepExplorationSession['perspectives'],
  paraconsistentState: DeepExplorationSession['paraconsistentState'],
  selfDestruction: DeepExplorationSession['selfDestruction']
): string[] {
  const directions: string[] = [];

  if (perspectives.deconstruction.binaryOppositions.length > 0) {
    directions.push(`二項対立「${perspectives.deconstruction.binaryOppositions[0]}」の脱構築`);
  }
  if (paraconsistentState.contradictions.length > 0) {
    directions.push(
      `矛盾「${paraconsistentState.contradictions[0].propositionA}」と「${paraconsistentState.contradictions[0].propositionB}」の共生`
    );
  }
  if (selfDestruction.reconstructedViews.length > 0) {
    directions.push(`新たな視点「${selfDestruction.reconstructedViews[0].description}」からの探求`);
  }

  return directions;
}

/**
 * 警告事項を生成
 * @param session - セッションデータ
 * @returns 警告事項のリスト
 */
function generateWarnings(session: {
  metaMetacognition: DeepExplorationSession['metaMetacognition'];
  perspectives: DeepExplorationSession['perspectives'];
}): string[] {
  const warnings: string[] = [];

  if (session.metaMetacognition.layer2.formalizationRisk > 0.5) {
    warnings.push('メタ認知の形式化リスクが高い');
  }
  if (session.perspectives.utopiaDystopia.lastManTendency > 0.5) {
    warnings.push('「最後の人間」への傾向が見られる');
  }
  if (session.perspectives.philosophyOfThought.autopilotSigns.length > 2) {
    warnings.push('オートパイロットの兆候が多い');
  }

  return warnings;
}

/**
 * アポリア共生状態を作成
 * @param perspectives - 7つの視座からの分析結果
 * @returns アポリア共生状態
 */
function createAporiaCoexistence(
  perspectives: DeepExplorationSession['perspectives']
): AporiaCoexistence {
  return {
    acknowledgedAporias: perspectives.deconstruction.aporias.map((a) => a.description),
    maintainedTensions: [],
    responsibleDecisions: [],
    avoidanceTemptations: [],
  };
}

/**
 * 深層探求を実行
 * @summary 「答えのない問題」への対処を支援
 * @param inquiry - 探求の対象
 * @param options - 実行オプション
 * @returns 深層探索セッション
 */
export function performDeepExploration(
  inquiry: string,
  options: DeepExplorationOptions = {}
): DeepExplorationSession {
  const sessionId = generateSessionId();
  const now = new Date();

  // 7つの視座からの分析
  const perspectives = performSevenPerspectivesAnalysis(inquiry, inquiry);

  // 自己前提破壊
  const premises = options.initialPremises || DEFAULT_PREMISES;
  const selfDestruction =
    options.enableSelfDestruction !== false
      ? performSelfDestruction(premises, options.depth || 1)
      : { destroyedPremises: [], reconstructedViews: [], destructionChain: [] };

  // 超メタ認知
  const metaMetacognition = performMetaMetacognition(
    inquiry,
    `「${inquiry}」について7つの視座から分析`
  );

  // 非線形思考
  const nonLinearThoughts =
    options.enableNonLinearThinking !== false ? [performNonLinearThinking(inquiry)] : [];

  // 準矛盾的推論
  const allPropositions = [
    ...premises,
    ...selfDestruction.reconstructedViews.map((v) => v.description),
  ];
  const paraconsistentState = performParaconsistentReasoning(allPropositions);

  // アポリア共生状態
  const aporiaCoexistence = createAporiaCoexistence(perspectives);

  // 次の探求方向
  const nextDirections = generateNextDirections(perspectives, paraconsistentState, selfDestruction);

  // 警告事項
  const warnings = generateWarnings({ metaMetacognition, perspectives });

  return {
    id: sessionId,
    inquiry,
    startedAt: now,
    lastUpdatedAt: now,
    perspectives,
    aporias: perspectives.deconstruction.aporias,
    aporiaResolutions: [],
    aporiaCoexistence,
    selfDestruction,
    metaMetacognition,
    nonLinearThoughts,
    paraconsistentState,
    status: 'exploring',
    nextDirections,
    depth: options.depth || 1,
    warnings,
  };
}

/**
 * 深層探求セッションを深化
 * @param session - 既存のセッション
 * @param newInsight - 新たな洞察
 * @returns 深化されたセッション
 */
export function deepenExploration(
  session: DeepExplorationSession,
  newInsight: string
): DeepExplorationSession {
  const now = new Date();

  // 新たな視点から再分析
  const newPerspectives = performSevenPerspectivesAnalysis(newInsight, session.inquiry);

  // 自己破壊を追加
  const additionalDestruction = performSelfDestruction([newInsight], 1);

  // メタメタ認知を更新
  const newMetaMetacognition = performMetaMetacognition(newInsight, `前回の探求に基づく追加分析`);

  return {
    ...session,
    lastUpdatedAt: now,
    depth: session.depth + 1,
    perspectives: newPerspectives,
    selfDestruction: {
      destroyedPremises: [
        ...session.selfDestruction.destroyedPremises,
        ...additionalDestruction.destroyedPremises,
      ],
      reconstructedViews: [
        ...session.selfDestruction.reconstructedViews,
        ...additionalDestruction.reconstructedViews,
      ],
      destructionChain: [
        ...session.selfDestruction.destructionChain,
        ...additionalDestruction.destructionChain,
      ],
    },
    metaMetacognition: newMetaMetacognition,
    warnings: [
      ...session.warnings,
      ...(newMetaMetacognition.layer2.formalizationRisk > 0.7
        ? ['深化による形式化リスクの増大']
        : []),
    ],
  };
}
