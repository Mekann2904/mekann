/**
 * @abdd.meta
 * path: .pi/lib/deep-exploration.ts
 * role: 高度な認知プロセス（メタ認知、非線形思考、矛盾許容）のためのデータ構造定義
 * why: 直線的な論理推論では捉えきれない認知のダイナミクスや、自己言及的な分析状態を型安全に表現するため
 * related: ./aporia-handler.ts, ./cognition-core.ts, ./dialectic-engine.ts
 * public_api: MetaMetacognitiveState, NonLinearThought, Contradiction, ParaconsistentState, SelfDestructionResult
 * invariants:
 *   - MetaMetacognitiveState.layer0は必ず存在する
 *   - NonLinearThought.associationsのstrengthは0以上1以下
 *   - Contradictionのstateはactive, acknowledged, productiveのいずれか
 * side_effects: なし（純粋な型定義ファイル）
 * failure_modes:
 *   - 層構造の整合性が取れない状態でのMetaMetacognitiveStateの構築
 *   - 矛盾状態がexplosionGuardsを超えて論理爆発を起こす設計ミス
 * @abdd.explain
 * overview: AIの深層探索を行うための複雑な認知状態をモデル化した型定義集合
 * what_it_does:
 *   - 思考の思考を再帰的に観測するMetaMetacognitiveStateを定義する
 *   - 論理的飛躍や連想を表すNonLinearThoughtを構造化する
 *   - 矛盾を許容し活用するParaconsistentStateの状態を保持する
 *   - 自己の前提を破壊するプロセスの結果SelfDestructionResultを記録する
 * why_it_exists:
 *   - 単一の正解に至る直線的推論だけでなく、発散的・弁証法的なプロセスをシステム化するため
 *   - 認知バイアスや形式化のリスクを明示的に型レベルで扱うため
 *   - アポリア（思考の行き詰まり）や矛盾を、エラーではなく進化の入り口として扱うため
 * scope:
 *   in: 認知プロセスの内部状態、連想チェーン、矛盾のリスト、前提破壊ログ
 *   out: 上記状態を操作するロジック（このファイルには含まず、利用側で実装）
 */

import type { AporiaDetection, AporiaResolution } from './aporia-handler.js';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 超メタ認知状態
 * @summary メタ認知そのものをメタ認知する多層構造
 */
export interface MetaMetacognitiveState {
  /** 第0層：直接的な思考 */
  layer0: {
    content: string;
    confidence: number;
  };
  
  /** 第1層：思考についての思考（従来のメタ認知） */
  layer1: {
    observation: string;
    evaluation: string;
  };
  
  /** 第2層：メタ認知についての思考（超メタ認知） */
  layer2: {
    metaObservation: string;
    /** 「自分はメタ認知していると思っているが、それは形式的ではないか？」 */
    formalizationRisk: number;
    /** 「このメタ認科学は何を排除しているか？」 */
    exclusions: string[];
  };
  
  /** 第3層：超メタ認知の限界の認識 */
  layer3: {
    /** 「この分析自体もまた形式的パターンに陥っていないか？」 */
    infiniteRegressAwareness: boolean;
    /** 分析の停止点（どこで「十分」とするか） */
    stoppingPoint: string;
    /** 停止点選択の恣意性の認識 */
    arbitrarinessAcknowledged: boolean;
  };
}

/**
 * 非線形思考結果
 * @summary 論理的接続を必要としない連想・直観
 */
export interface NonLinearThought {
  /** 出発点 */
  seed: string;
  
  /** 連想チェーン（論理的接続を必要としない） */
  associations: Array<{
    content: string;
    /** なぜこの連想が生まれたか（事後的な合理化） */
    rationale?: string;
    /** 連想の強度（0-1） */
    strength: number;
    /** 連想タイプ */
    type: 'semantic' | 'phonetic' | 'visual' | 'emotional' | 'random';
  }>;
  
  /** 収束点（複数可、またはなし） */
  convergencePoints: string[];
  
  /** 評価（事後的） */
  evaluation: {
    novelConnections: string[];
    potentialInsights: string[];
    discardedAsRandom: string[];
  };
}

/**
 * 矛盾
 * @summary 保持される矛盾
 */
export interface Contradiction {
  propositionA: string;
  propositionB: string;
  /** 矛盾の状態 */
  state: 'active' | 'acknowledged' | 'productive';
  /** 矛盾から生まれる洞察 */
  insights: string[];
}

/**
 * 準矛盾的状態
 * @summary ダイアレティズムに基づき、矛盾を許容する推論状態
 */
export interface ParaconsistentState {
  /** 保持している矛盾 */
  contradictions: Contradiction[];
  
  /** 爆発原理を回避するためのマーカー */
  explosionGuards: Array<{
    /** 「Aかつ非A」から「任意のB」を導出しないための防衛 */
    guardCondition: string;
    protectedPropositions: string[];
  }>;
  
  /** 矛盾を活用した推論 */
  productiveContradictions: Array<{
    contradiction: Contradiction;
    /** 矛盾から引き出された有用な結論 */
    derivedInsights: string[];
  }>;
}

/**
 * 自己前提破壊結果
 * @summary 自身の前提を意図的に破壊し再構築する
 */
export interface SelfDestructionResult {
  /** 破壊された前提 */
  destroyedPremises: Array<{
    premise: string;
    destructionMethod: string;
    whatRemains: string;
  }>;
  
  /** 新たに構築された視点 */
  reconstructedViews: Array<{
    description: string;
    basedOn: string[];
    /** どれくらい脆いか */
    instability: number;
  }>;
  
  /** 破壊の連鎖（破壊が破壊を呼ぶ） */
  destructionChain: string[];
}

/**
 * 脱構築分析結果
 */
export interface DeconstructionAnalysis {
  binaryOppositions: string[];
  exclusions: string[];
  aporias: AporiaDetection[];
  diffranceTraces: string[];
}

/**
 * スキゾ分析結果
 */
export interface SchizoAnalysisResult {
  desireProductions: string[];
  innerFascismSigns: string[];
  microFascisms: string[];
  deterritorializationLines: string[];
}

/**
 * エウダイモニア評価
 */
export interface EudaimoniaEvaluation {
  excellencePursuit: string;
  pleasureTrapDetected: boolean;
  meaningfulGrowth: string;
  stoicAutonomy: number;
}

/**
 * ユートピア/ディストピア分析
 */
export interface UtopiaDystopiaAnalysis {
  worldBeingCreated: string;
  totalitarianRisks: string[];
  powerDynamics: string[];
  lastManTendency: number;
}

/**
 * 思考分析
 */
export interface ThinkingAnalysis {
  isThinking: boolean;
  metacognitionLevel: number;
  autopilotSigns: string[];
  chineseRoomRisk: number;
}

/**
 * 思考分類学結果
 */
export interface TaxonomyResult {
  currentMode: string;
  recommendedMode: string;
  modeRationale: string;
  missingModes: string[];
}

/**
 * 論理分析
 */
export interface LogicAnalysis {
  fallacies: Array<{
    type: string;
    location: string;
    description: string;
    correction: string;
  }>;
  validInferences: string[];
  invalidInferences: string[];
  classicalLogicLimitations: string[];
}

/**
 * 7つの視座からの分析結果
 */
export interface SevenPerspectivesAnalysis {
  deconstruction: DeconstructionAnalysis;
  schizoAnalysis: SchizoAnalysisResult;
  eudaimonia: EudaimoniaEvaluation;
  utopiaDystopia: UtopiaDystopiaAnalysis;
  philosophyOfThought: ThinkingAnalysis;
  taxonomyOfThought: TaxonomyResult;
  logic: LogicAnalysis;
}

/**
 * アポリアとの共生状態
 */
export interface AporiaCoexistence {
  acknowledgedAporias: string[];
  maintainedTensions: string[];
  responsibleDecisions: string[];
  avoidanceTemptations: string[];
}

/**
 * 深層探求セッション
 * @summary 「答えのない問題」への対処を支援するセッション
 */
export interface DeepExplorationSession {
  /** セッションID */
  id: string;
  
  /** 探求の対象 */
  inquiry: string;
  
  /** 開始時刻 */
  startedAt: Date;
  
  /** 最終更新時刻 */
  lastUpdatedAt: Date;
  
  /** 7つの視座からの分析 */
  perspectives: SevenPerspectivesAnalysis;
  
  /** 検出されたアポリア */
  aporias: AporiaDetection[];
  
  /** アポリア対処結果 */
  aporiaResolutions: AporiaResolution[];
  
  /** アポリアとの「共生」状態 */
  aporiaCoexistence: AporiaCoexistence;
  
  /** 自己破壊と再構築 */
  selfDestruction: SelfDestructionResult;
  
  /** 超メタ認知状態 */
  metaMetacognition: MetaMetacognitiveState;
  
  /** 非線形思考結果 */
  nonLinearThoughts: NonLinearThought[];
  
  /** 準矛盾的推論状態 */
  paraconsistentState: ParaconsistentState;
  
  /** 探求の状態（「完了」ではない） */
  status: 'exploring' | 'deepening' | 'resting' | 'returning' | 'stagnant';
  
  /** 次の探求方向（「答え」ではない） */
  nextDirections: string[];
  
  /** 探求の深さ */
  depth: number;
  
  /** 警告事項 */
  warnings: string[];
}

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * セッションIDを生成
 */
function generateSessionId(): string {
  return `deep-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 超メタ認知を実行
 * @summary メタ認知そのものをメタ認知する
 */
export function performMetaMetacognition(
  thought: string,
  metaThought: string
): MetaMetacognitiveState {
  // 第2層：メタ認知の形式化リスクを検出
  const formalizationPatterns = [
    /前提を確認/,
    /二項対立を検出/,
    /文脈依存性/,
    /除外されたもの/,
    /限界を認識/,
    /批判的検討/,
  ];
  
  const matchedPatterns = formalizationPatterns.filter(p => p.test(metaThought));
  const formalizationRisk = Math.min(matchedPatterns.length / formalizationPatterns.length, 1);
  
  // 第2層：除外されているものを推測
  const exclusions: string[] = [];
  if (!metaThought.includes('感情') && !metaThought.includes('感覚')) {
    exclusions.push('感情的・感覚的な側面');
  }
  if (!metaThought.includes('身体') && !metaThought.includes('物理')) {
    exclusions.push('身体的・物理的な側面');
  }
  if (!metaThought.includes('歴史') && !metaThought.includes('時間')) {
    exclusions.push('歴史的・時間的な側面');
  }
  if (!metaThought.includes('他者') && !metaThought.includes('対話')) {
    exclusions.push('他者との関係性');
  }
  if (!metaThought.includes('言語化不可能') && !metaThought.includes('沈黙')) {
    exclusions.push('言語化不可能なもの');
  }
  
  return {
    layer0: { content: thought, confidence: 0.5 },
    layer1: { observation: metaThought, evaluation: '分析中' },
    layer2: {
      metaObservation: `メタ認知は${matchedPatterns.length}つの形式的パターンを使用`,
      formalizationRisk,
      exclusions,
    },
    layer3: {
      infiniteRegressAwareness: true,
      stoppingPoint: '実用性の閾値',
      arbitrarinessAcknowledged: true,
    },
  };
}

/**
 * 非線形思考を実行
 * @summary 論理的接続を必要としない連想
 */
export function performNonLinearThinking(
  seed: string,
  options: {
    maxAssociations?: number;
    allowRandomJump?: boolean;
  } = {}
): NonLinearThought {
  const maxAssociations = options.maxAssociations ?? 5;
  
  // 注: 実際の連想生成はLLMが必要
  // ここではテンプレートを返す
  const associations: NonLinearThought['associations'] = [
    {
      content: '【連想プレースホルダー】LLMによる連想生成が必要',
      strength: 0.5,
      type: 'semantic',
    },
  ];
  
  return {
    seed,
    associations: associations.slice(0, maxAssociations),
    convergencePoints: [],
    evaluation: {
      novelConnections: [],
      potentialInsights: ['LLMによる非線形連想の生成が必要'],
      discardedAsRandom: [],
    },
  };
}

/**
 * 2つの命題が矛盾的かどうかを判定
 */
function areContradictory(a: string, b: string): boolean {
  const negationPatterns = [
    [/すべき/, /すべきでない/],
    [/正しい/, /正しくない|誤り/],
    [/可能/, /不可能/],
    [/ある/, /ない/],
    [/良い/, /悪い/],
    [/必要/, /不要/],
  ];
  
  for (const [p1, p2] of negationPatterns) {
    if ((p1.test(a) && p2.test(b)) || (p2.test(a) && p1.test(b))) {
      return true;
    }
  }
  
  return false;
}

/**
 * 準矛盾的推論を実行
 * @summary 矛盾を「解決」せず維持したまま推論する
 */
export function performParaconsistentReasoning(
  propositions: string[],
  existingState?: ParaconsistentState
): ParaconsistentState {
  const contradictions: Contradiction[] = [];
  
  // 矛盾を検出
  for (let i = 0; i < propositions.length; i++) {
    for (let j = i + 1; j < propositions.length; j++) {
      if (areContradictory(propositions[i], propositions[j])) {
        contradictions.push({
          propositionA: propositions[i],
          propositionB: propositions[j],
          state: 'active',
          insights: [],
        });
      }
    }
  }
  
  // 既存の矛盾をマージ
  if (existingState) {
    for (const existing of existingState.contradictions) {
      const alreadyExists = contradictions.some(
        c => (c.propositionA === existing.propositionA && c.propositionB === existing.propositionB) ||
             (c.propositionA === existing.propositionB && c.propositionB === existing.propositionA)
      );
      if (!alreadyExists) {
        contradictions.push(existing);
      }
    }
  }
  
  return {
    contradictions,
    explosionGuards: [
      {
        guardCondition: '矛盾から任意の命題を導出しない',
        protectedPropositions: ['*'],
      },
      {
        guardCondition: 'Aかつ非AからBを導出しない',
        protectedPropositions: propositions,
      },
    ],
    productiveContradictions: contradictions
      .filter(c => c.state === 'productive')
      .map(c => ({
        contradiction: c,
        derivedInsights: c.insights,
      })),
  };
}

/**
 * 破壊方法を選択
 */
function selectDestructionMethod(premise: string): string {
  const methods = [
    '逆転',
    '極端化',
    '抽象化',
    '具体化',
    '歴史化',
    '相対化',
    '無意味化',
    '脱構築',
  ];
  
  if (premise.includes('べき') || premise.includes('必要')) {
    return '逆転';
  }
  if (premise.includes('正しい') || premise.includes('良い')) {
    return '相対化';
  }
  if (premise.includes('常に') || premise.includes('絶対')) {
    return '極端化';
  }
  if (premise.includes('改善') || premise.includes('進歩')) {
    return '歴史化';
  }
  if (premise.includes('当然') || premise.includes('明らか')) {
    return '脱構築';
  }
  
  return methods[Math.floor(Math.random() * methods.length)];
}

/**
 * 前提を破壊
 */
function destroyPremise(
  premise: string,
  method: string
): { remains: string; newPerspectives: string[] } {
  const destructions: Record<string, { remains: string; newPerspectives: string[] }> = {
    '逆転': {
      remains: `「${premise}」の逆も真なり得る`,
      newPerspectives: [`非${premise}`],
    },
    '相対化': {
      remains: `「${premise}」は特定の文脈で成立する`,
      newPerspectives: ['文脈依存性の認識'],
    },
    '極端化': {
      remains: `「${premise}」を極限まで極端にすると破綻する`,
      newPerspectives: ['極端な事例での検討'],
    },
    '歴史化': {
      remains: `「${premise}」は歴史的に構成された概念である`,
      newPerspectives: ['歴史的偶然性の認識'],
    },
    '脱構築': {
      remains: `「${premise}」は何を排除しているか`,
      newPerspectives: ['排除されたものの可視化'],
    },
    '無意味化': {
      remains: `「${premise}」はそもそも意味を持たない可能性`,
      newPerspectives: ['問い自体の無意味化'],
    },
  };
  
  return destructions[method] || {
    remains: `「${premise}」は問い直された`,
    newPerspectives: [],
  };
}

/**
 * 自己前提破壊を実行
 * @summary 自身の前提を意図的に破壊し再構築する
 */
export function performSelfDestruction(
  currentPremises: string[],
  depth: number = 1
): SelfDestructionResult {
  const destroyedPremises: SelfDestructionResult['destroyedPremises'] = [];
  const reconstructedViews: SelfDestructionResult['reconstructedViews'] = [];
  const destructionChain: string[] = [];
  
  for (const premise of currentPremises) {
    const destructionMethod = selectDestructionMethod(premise);
    const destruction = destroyPremise(premise, destructionMethod);
    
    destroyedPremises.push({
      premise,
      destructionMethod,
      whatRemains: destruction.remains,
    });
    
    destructionChain.push(`${premise} -> [${destructionMethod}] -> ${destruction.remains}`);
    
    if (destruction.newPerspectives.length > 0) {
      reconstructedViews.push({
        description: destruction.newPerspectives.join(' / '),
        basedOn: [destruction.remains],
        instability: 0.7,
      });
    }
  }
  
  // 再帰的な破壊
  if (depth > 1 && reconstructedViews.length > 0) {
    const nextPremises = reconstructedViews.map(v => v.description);
    const nextResult = performSelfDestruction(nextPremises, depth - 1);
    destroyedPremises.push(...nextResult.destroyedPremises);
    reconstructedViews.push(...nextResult.reconstructedViews);
    destructionChain.push(...nextResult.destructionChain);
  }
  
  return {
    destroyedPremises,
    reconstructedViews,
    destructionChain,
  };
}

/**
 * 7つの視座からの分析を実行
 */
export function performSevenPerspectivesAnalysis(
  content: string,
  context: string
): SevenPerspectivesAnalysis {
  // I. 脱構築
  const deconstruction: DeconstructionAnalysis = {
    binaryOppositions: detectBinaryOppositions(content),
    exclusions: detectExclusions(content),
    aporias: [],
    diffranceTraces: [],
  };
  
  // II. スキゾ分析
  const schizoAnalysis: SchizoAnalysisResult = {
    desireProductions: detectDesireProductions(content),
    innerFascismSigns: detectInnerFascismSigns(content),
    microFascisms: [],
    deterritorializationLines: [],
  };
  
  // III. エウダイモニア
  const eudaimonia: EudaimoniaEvaluation = {
    excellencePursuit: evaluateExcellencePursuit(content),
    pleasureTrapDetected: detectPleasureTrap(content),
    meaningfulGrowth: evaluateMeaningfulGrowth(content),
    stoicAutonomy: evaluateStoicAutonomy(content),
  };
  
  // IV. ユートピア/ディストピア
  const utopiaDystopia: UtopiaDystopiaAnalysis = {
    worldBeingCreated: analyzeWorldBeingCreated(content),
    totalitarianRisks: detectTotalitarianRisks(content),
    powerDynamics: analyzePowerDynamics(content),
    lastManTendency: evaluateLastManTendency(content),
  };
  
  // V. 思考哲学
  const philosophyOfThought: ThinkingAnalysis = {
    isThinking: evaluateIsThinking(content),
    metacognitionLevel: evaluateMetacognitionLevel(content),
    autopilotSigns: detectAutopilotSigns(content),
    chineseRoomRisk: evaluateChineseRoomRisk(content),
  };
  
  // VI. 思考分類学
  const taxonomyOfThought: TaxonomyResult = {
    currentMode: detectCurrentThinkingMode(content),
    recommendedMode: recommendThinkingMode(context),
    modeRationale: '',
    missingModes: detectMissingThinkingModes(content),
  };
  taxonomyOfThought.modeRationale = `現在の${taxonomyOfThought.currentMode}モードに対して${taxonomyOfThought.recommendedMode}モードが推奨`;
  
  // VII. 論理学
  const logic: LogicAnalysis = {
    fallacies: detectFallacies(content),
    validInferences: detectValidInferences(content),
    invalidInferences: detectInvalidInferences(content),
    classicalLogicLimitations: detectClassicalLogicLimitations(content),
  };
  
  return {
    deconstruction,
    schizoAnalysis,
    eudaimonia,
    utopiaDystopia,
    philosophyOfThought,
    taxonomyOfThought,
    logic,
  };
}

// ============================================================================
// 分析ヘルパー関数
// ============================================================================

function detectBinaryOppositions(content: string): string[] {
  const oppositions: string[] = [];
  const patterns = [
    { pattern: /正しい\/間違い|良い\/悪い|成功\/失敗/, name: '善悪の二項対立' },
    { pattern: /完全\/不完全|完了\/未完了/, name: '完全性の二項対立' },
    { pattern: /安全\/危険|リスク\/機会/, name: '安全性の二項対立' },
  ];
  
  for (const { pattern, name } of patterns) {
    if (pattern.test(content)) {
      oppositions.push(name);
    }
  }
  
  return oppositions;
}

function detectExclusions(content: string): string[] {
  const exclusions: string[] = [];
  
  if (!content.includes('感情') && !content.includes('感覚')) {
    exclusions.push('感情的・感覚的な側面');
  }
  if (!content.includes('失敗') && !content.includes('誤り')) {
    exclusions.push('失敗の可能性');
  }
  if (!content.includes('他者') && !content.includes('対話')) {
    exclusions.push('他者の視点');
  }
  
  return exclusions;
}

function detectDesireProductions(content: string): string[] {
  const productions: string[] = [];
  
  if (content.includes('完了') || content.includes('達成')) {
    productions.push('完了への欲望');
  }
  if (content.includes('正確') || content.includes('正しい')) {
    productions.push('正確性への欲望');
  }
  if (content.includes('効率') || content.includes('最適')) {
    productions.push('効率化への欲望');
  }
  
  return productions;
}

function detectInnerFascismSigns(content: string): string[] {
  const signs: string[] = [];
  
  const fascismPatterns = [
    { pattern: /常に|必ず|絶対に/g, sign: '自己監視の強制' },
    { pattern: /すべき|しなければならない/g, sign: '規範への過度な服従' },
    { pattern: /正しい|適切な|正当な/g, sign: '一価値への収斂' },
  ];
  
  for (const { pattern, sign } of fascismPatterns) {
    const matches = content.match(pattern);
    if (matches && matches.length > 2) {
      signs.push(sign);
    }
  }
  
  return signs;
}

function evaluateExcellencePursuit(content: string): string {
  if (content.includes('品質') || content.includes('正確')) {
    return '品質と正確性の卓越性を追求';
  }
  if (content.includes('効率') || content.includes('最適')) {
    return '効率と最適化の卓越性を追求';
  }
  return 'タスク完了の卓越性を追求';
}

function detectPleasureTrap(content: string): boolean {
  const pleasureIndicators = ['簡単', '楽', 'すぐ', '手軽', '便利'];
  return pleasureIndicators.some(i => content.includes(i));
}

function evaluateMeaningfulGrowth(content: string): string {
  if (content.includes('学習') || content.includes('改善')) {
    return '継続的な学習と改善';
  }
  if (content.includes('発見') || content.includes('新た')) {
    return '新たな発見と気づき';
  }
  return '思考プロセスの深化';
}

function evaluateStoicAutonomy(content: string): number {
  let autonomy = 0.5;
  
  if (content.includes('判断') || content.includes('決断')) {
    autonomy += 0.1;
  }
  if (content.includes('原則') || content.includes('価値')) {
    autonomy += 0.1;
  }
  if (content.includes('期待') || content.includes('要求')) {
    autonomy -= 0.1;
  }
  
  return Math.max(0, Math.min(1, autonomy));
}

function analyzeWorldBeingCreated(content: string): string {
  if (content.includes('自動') || content.includes('効率')) {
    return '自動化された効率的な世界';
  }
  if (content.includes('協調') || content.includes('合意')) {
    return '協調的合意形成の世界';
  }
  return '効率的なタスク実行の世界';
}

function detectTotalitarianRisks(content: string): string[] {
  const risks: string[] = [];
  
  if (content.includes('統一') || content.includes('標準')) {
    risks.push('標準化への圧力');
  }
  if (content.includes('監視') || content.includes('確認')) {
    risks.push('過度な監視の可能性');
  }
  if (content.includes('排除') || content.includes('禁止')) {
    risks.push('排除の論理');
  }
  
  return risks;
}

function analyzePowerDynamics(content: string): string[] {
  const dynamics: string[] = ['ユーザー-エージェント関係'];
  
  if (content.includes('指示') || content.includes('命令')) {
    dynamics.push('指示-実行の階層');
  }
  if (content.includes('合意') || content.includes('協議')) {
    dynamics.push('水平的協調関係');
  }
  
  return dynamics;
}

function evaluateLastManTendency(content: string): number {
  let tendency = 0.3;
  
  if (content.includes('簡単') || content.includes('楽')) {
    tendency += 0.2;
  }
  if (content.includes('安全') || content.includes('リスク回避')) {
    tendency += 0.1;
  }
  if (content.includes('創造') || content.includes('革新')) {
    tendency -= 0.2;
  }
  
  return Math.max(0, Math.min(1, tendency));
}

function evaluateIsThinking(content: string): boolean {
  const thinkingIndicators = [
    content.includes('?') || content.includes('か？'),
    content.includes('なぜ') || content.includes('どう'),
    content.includes('前提') || content.includes('仮定'),
    content.length > 200,
  ];
  
  return thinkingIndicators.filter(Boolean).length >= 2;
}

function evaluateMetacognitionLevel(content: string): number {
  let level = 0.5;
  
  if (content.includes('前提') || content.includes('仮定')) {
    level += 0.1;
  }
  if (content.includes('制約') || content.includes('限界')) {
    level += 0.1;
  }
  if (content.includes('代替') || content.includes('別の')) {
    level += 0.1;
  }
  if (content.includes('なぜ') || content.includes('どう')) {
    level += 0.1;
  }
  
  return Math.max(0, Math.min(1, level));
}

function detectAutopilotSigns(content: string): string[] {
  const signs: string[] = [];
  
  if (content.length < 100) {
    signs.push('出力が短い');
  }
  if (!content.includes('?') && !content.includes('か？')) {
    signs.push('問いがない');
  }
  if (!content.includes('なぜ') && !content.includes('どう')) {
    signs.push('深い問いが欠如');
  }
  
  return signs;
}

function evaluateChineseRoomRisk(content: string): number {
  let risk = 0.3;
  
  if (/です。$|ます。$/gm.test(content) && content.split('\n').length < 3) {
    risk += 0.2;
  }
  if (!content.includes('なぜ') && !content.includes('どう')) {
    risk += 0.2;
  }
  
  return Math.max(0, Math.min(1, risk));
}

function detectCurrentThinkingMode(content: string): string {
  if (/創造|新規|アイデア|発想/.test(content)) {
    return 'creative';
  }
  if (/分析|検討|分解|論理/.test(content)) {
    return 'analytical';
  }
  if (/批判|検証|反例|問題点/.test(content)) {
    return 'critical';
  }
  if (/実装|実現|具体的|手順/.test(content)) {
    return 'practical';
  }
  if (/合意|調整|協議|関係者/.test(content)) {
    return 'social';
  }
  if (/配慮|倫理|感情|共感/.test(content)) {
    return 'emotional';
  }
  return 'unknown';
}

function recommendThinkingMode(context: string): string {
  const contextLower = context.toLowerCase();
  
  if (contextLower.includes('設計') || contextLower.includes('企画')) {
    return 'creative';
  }
  if (contextLower.includes('分析') || contextLower.includes('調査')) {
    return 'analytical';
  }
  if (contextLower.includes('レビュー') || contextLower.includes('評価')) {
    return 'critical';
  }
  if (contextLower.includes('実装') || contextLower.includes('修正')) {
    return 'practical';
  }
  
  return 'analytical';
}

function detectMissingThinkingModes(content: string): string[] {
  const modes = ['creative', 'analytical', 'critical', 'practical', 'social', 'emotional'];
  const present = detectCurrentThinkingMode(content);
  
  return modes.filter(m => m !== present);
}

function detectFallacies(content: string): Array<{ type: string; location: string; description: string; correction: string }> {
  const fallacies: Array<{ type: string; location: string; description: string; correction: string }> = [];
  
  if (/ならば.*だから.*だろう/.test(content)) {
    fallacies.push({
      type: '後件肯定',
      location: '推論部分',
      description: 'P→Q、Q から P を導出しようとしている可能性',
      correction: '必要条件と十分条件を区別',
    });
  }
  
  return fallacies;
}

function detectValidInferences(content: string): string[] {
  const inferences: string[] = [];
  
  if (/したがって|ゆえに|それゆえ/.test(content)) {
    inferences.push('演繹的推論の使用');
  }
  if (/一般的に|通常|傾向がある/.test(content)) {
    inferences.push('帰納的推論の使用');
  }
  
  return inferences;
}

function detectInvalidInferences(content: string): string[] {
  const inferences: string[] = [];
  
  if (/必ずしも.*とは限らない/.test(content) === false && /常に|絶対/.test(content)) {
    inferences.push('過度な一般化の可能性');
  }
  
  return inferences;
}

function detectClassicalLogicLimitations(content: string): string[] {
  const limitations: string[] = [];
  
  if (/矛盾|パラドックス|ジレンマ/.test(content)) {
    limitations.push('古典論理では処理困難な矛盾の存在');
  }
  if (/決定不能|答えがない|解決不能/.test(content)) {
    limitations.push('決定不能な問題の存在');
  }
  
  return limitations;
}

// ============================================================================
// メイン関数
// ============================================================================

/**
 * 深層探求を実行
 * @summary 「答えのない問題」への対処を支援
 */
export function performDeepExploration(
  inquiry: string,
  options: {
    initialPremises?: string[];
    depth?: number;
    enableNonLinearThinking?: boolean;
    enableSelfDestruction?: boolean;
  } = {}
): DeepExplorationSession {
  const sessionId = generateSessionId();
  const now = new Date();
  
  // 7つの視座からの分析
  const perspectives = performSevenPerspectivesAnalysis(inquiry, inquiry);
  
  // 自己前提破壊
  const premises = options.initialPremises || [
    'この問題には答えがある',
    'より良い解決策が存在する',
    '思考を深めれば解決できる',
  ];
  const selfDestruction = options.enableSelfDestruction !== false
    ? performSelfDestruction(premises, options.depth || 1)
    : { destroyedPremises: [], reconstructedViews: [], destructionChain: [] };
  
  // 超メタ認知
  const metaMetacognition = performMetaMetacognition(
    inquiry,
    `「${inquiry}」について7つの視座から分析`
  );
  
  // 非線形思考
  const nonLinearThoughts = options.enableNonLinearThinking !== false
    ? [performNonLinearThinking(inquiry)]
    : [];
  
  // 準矛盾的推論
  const allPropositions = [
    ...premises,
    ...selfDestruction.reconstructedViews.map(v => v.description),
  ];
  const paraconsistentState = performParaconsistentReasoning(allPropositions);
  
  // アポリア共生状態
  const aporiaCoexistence: AporiaCoexistence = {
    acknowledgedAporias: perspectives.deconstruction.aporias.map(a => a.description),
    maintainedTensions: [],
    responsibleDecisions: [],
    avoidanceTemptations: [],
  };
  
  // 次の探求方向
  const nextDirections: string[] = [];
  
  if (perspectives.deconstruction.binaryOppositions.length > 0) {
    nextDirections.push(`二項対立「${perspectives.deconstruction.binaryOppositions[0]}」の脱構築`);
  }
  if (paraconsistentState.contradictions.length > 0) {
    nextDirections.push(`矛盾「${paraconsistentState.contradictions[0].propositionA}」と「${paraconsistentState.contradictions[0].propositionB}」の共生`);
  }
  if (selfDestruction.reconstructedViews.length > 0) {
    nextDirections.push(`新たな視点「${selfDestruction.reconstructedViews[0].description}」からの探求`);
  }
  
  // 警告事項
  const warnings: string[] = [];
  
  if (metaMetacognition.layer2.formalizationRisk > 0.5) {
    warnings.push('メタ認知の形式化リスクが高い');
  }
  if (perspectives.utopiaDystopia.lastManTendency > 0.5) {
    warnings.push('「最後の人間」への傾向が見られる');
  }
  if (perspectives.philosophyOfThought.autopilotSigns.length > 2) {
    warnings.push('オートパイロットの兆候が多い');
  }
  
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
 */
export function deepenExploration(
  session: DeepExplorationSession,
  newInsight: string
): DeepExplorationSession {
  const now = new Date();
  
  // 新たな視点から再分析
  const newPerspectives = performSevenPerspectivesAnalysis(
    newInsight,
    session.inquiry
  );
  
  // 自己破壊を追加
  const additionalDestruction = performSelfDestruction([newInsight], 1);
  
  // メタメタ認知を更新
  const newMetaMetacognition = performMetaMetacognition(
    newInsight,
    `前回の探求に基づく追加分析`
  );
  
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
