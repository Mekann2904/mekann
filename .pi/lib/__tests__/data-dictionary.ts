/**
 * @abdd.meta
 * path: .pi/lib/__tests__/data-dictionary.ts
 * role: テストデータおよび型定義の共通仕様書
 * why: モジュール間で統一されたデータ構造と不変条件を定義し、実装とテストの整合性を保証するため
 * related: aporetic-reasoning.ts, creative-destruction.ts, hyper-metacognition.ts, nonlinear-thought.ts
 * public_api: DataCategory, DataField, DataStructure, DataFlow, DATA_DICTIONARY
 * invariants: DataStructureごとに定義された制約（beliefStrengthの範囲、必須フィールドの存在など）を満たすこと
 * side_effects: なし（定数および型定義のみ）
 * failure_modes: 定義された不変条件と矛盾するデータを使用した場合、テストまたは実行時エラーが発生する
 * @abdd.explain
 * overview: 4つのモジュール（aporetic-reasoning, creative-destruction, hyper-metacognition, nonlinear-thought）間で扱うデータ構造、フィールド定義、およびモジュール間のデータフローを網羅的に定義したリポジトリ
 * what_it_does:
 *   - データ型カテゴリ（state, config, input等）の定義
 *   - 各データ構造が持つフィールド名、型、必須要件、許容範囲の宣言
 *   - データ構造ごとの不変条件と関連構造の明示
 *   - モジュール間のデータフローと変換要件の定義
 *   - 具体的な構造定義リスト（DATA_DICTIONARY）の提供
 * why_it_exists:
 *   - 複数モジュールにまたがるデータ定義を一元管理し、重複や矛盾を防ぐため
 *   - テストコードにおける期待値（Expected Value）のソースとして機能するため
 *   - エンジン内のデータフローと制約をドキュメントとして可視化するため
 * scope:
 *   in: ファイルシステムから静的に読み込まれる定義情報
 * out: テストファイルや実装モジュールへの型情報とデータ定義の参照
 */

// ============================================================================
// データ型定義
// ============================================================================

/**
 * データ型カテゴリ
 */
export type DataCategory =
  | 'state'        // 状態データ（エンジン内部状態）
  | 'config'       // 設定データ（エンジン設定）
  | 'input'        // 入力データ（推論・思考への入力）
  | 'output'       // 出力データ（推論・思考の結果）
  | 'intermediate' // 中間データ（チェーン、履歴）
  | 'metadata';    // メタデータ（タイムスタンプ、ID）

/**
 * データフィールド定義
 */
export interface DataField {
  /** フィールド名 */
  name: string;
  /** データ型 */
  type: string;
  /** 必須かどうか */
  required: boolean;
  /** デフォルト値 */
  defaultValue?: unknown;
  /** 値の範囲（数値の場合） */
  range?: { min: number; max: number };
  /** 許容される値（列挙型の場合） */
  allowedValues?: string[];
  /** 説明 */
  description: string;
  /** 不変条件 */
  invariants?: string[];
}

/**
 * データ構造定義
 */
export interface DataStructure {
  /** 構造名 */
  name: string;
  /** 属するモジュール */
  module: 'aporetic-reasoning' | 'creative-destruction' | 'hyper-metacognition' | 'nonlinear-thought';
  /** カテゴリ */
  category: DataCategory;
  /** 説明 */
  description: string;
  /** フィールド定義 */
  fields: DataField[];
  /** 構造レベルの不変条件 */
  invariants: string[];
  /** 関連する構造 */
  relatedStructures: string[];
}

/**
 * モジュール間のデータフロー
 */
export interface DataFlow {
  /** フロー名 */
  name: string;
  /** ソースモジュール */
  source: string;
  /** ターゲットモジュール */
  target: string;
  /** データ型 */
  dataType: string;
  /** 変換が必要か */
  requiresTransformation: boolean;
  /** 変換関数名 */
  transformationFunction?: string;
}

// ============================================================================
// データ辞書
// ============================================================================

/**
 * 4モジュールのデータ辞書
 */
export const DATA_DICTIONARY: DataStructure[] = [
  // ==========================================================================
  // aporetic-reasoning.ts
  // ==========================================================================
  {
    name: 'AporiaPole',
    module: 'aporetic-reasoning',
    category: 'state',
    description: 'アポリアを構成する一方の極',
    fields: [
      { name: 'name', type: 'string', required: true, description: '極の名前' },
      { name: 'valueDescription', type: 'string', required: true, description: '極が表す価値の説明' },
      { name: 'beliefDistribution', type: 'Distribution', required: true, description: 'この極に対する信念分布' },
      { name: 'supportingEvidence', type: 'Evidence[]', required: true, description: 'この極を支持する証拠' },
      { name: 'beliefStrength', type: 'number', required: true, range: { min: 0, max: 1 }, description: '現在の信念強度' }
    ],
    invariants: [
      'beliefStrengthは[0, 1]の範囲内',
      'supportingEvidenceは空配列でもよい'
    ],
    relatedStructures: ['Distribution', 'Evidence', 'AporeticBeliefState']
  },
  {
    name: 'AporeticBeliefState',
    module: 'aporetic-reasoning',
    category: 'state',
    description: '両極の信念を同時に維持する状態',
    fields: [
      { name: 'aporia', type: 'AporiaDetection', required: true, description: '対象のアポリア' },
      { name: 'pole1', type: 'AporiaPole', required: true, description: '極1' },
      { name: 'pole2', type: 'AporiaPole', required: true, description: '極2' },
      { name: 'tensionIntensity', type: 'number', required: true, range: { min: 0, max: 1 }, description: '緊張関係の強度' },
      { name: 'balancePoint', type: 'number', required: true, range: { min: -1, max: 1 }, description: '現在のバランス点' },
      { name: 'balanceUncertainty', type: 'number', required: true, range: { min: 0, max: 1 }, description: 'バランスの不確実性' },
      { name: 'explosionGuards', type: 'string[]', required: true, description: '爆発原理を回避するガード条件' },
      { name: 'updateHistory', type: 'BalanceUpdate[]', required: true, description: '更新履歴' }
    ],
    invariants: [
      'pole1とpole2は統合されない',
      'balancePointは[-1, 1]の範囲内',
      'アポリアは解決されず共生される'
    ],
    relatedStructures: ['AporiaDetection', 'AporiaPole', 'BalanceUpdate']
  },
  {
    name: 'ParetoOptimalSolution',
    module: 'aporetic-reasoning',
    category: 'output',
    description: '多目的最適化におけるパレートフロント上の解',
    fields: [
      { name: 'description', type: 'string', required: true, description: '解の説明' },
      { name: 'pole1Achievement', type: 'number', required: true, range: { min: 0, max: 1 }, description: '極1に対する達成度' },
      { name: 'pole2Achievement', type: 'number', required: true, range: { min: 0, max: 1 }, description: '極2に対する達成度' },
      { name: 'risk', type: 'number', required: true, range: { min: 0, max: 1 }, description: 'この解を選択する際のリスク' },
      { name: 'tradeoffDescription', type: 'string', required: true, description: 'トレードオフの説明' },
      { name: 'contextDependentRecommendation', type: 'number', required: true, range: { min: 0, max: 1 }, description: '推奨度' }
    ],
    invariants: [
      'pole1Achievement + pole2Achievement <= 2',
      'パレート支配されていない解のみ'
    ],
    relatedStructures: ['AporeticInferenceResult']
  },
  {
    name: 'AporeticEngineConfig',
    module: 'aporetic-reasoning',
    category: 'config',
    description: 'アポリア推論エンジンの設定',
    fields: [
      { name: 'tensionThreshold', type: 'number', required: true, range: { min: 0, max: 1 }, defaultValue: 0.7, description: '緊張維持の閾値' },
      { name: 'decisionThreshold', type: 'number', required: true, range: { min: 0, max: 1 }, defaultValue: 0.85, description: '決断実行の閾値' },
      { name: 'smoothingFactor', type: 'number', required: true, range: { min: 0, max: 1 }, defaultValue: 0.001, description: '平滑化係数' },
      { name: 'maxHistorySize', type: 'number', required: true, range: { min: 1, max: 1000 }, defaultValue: 100, description: '最大履歴保持数' },
      { name: 'paretoSearchDepth', type: 'number', required: true, range: { min: 1, max: 10 }, defaultValue: 5, description: 'パレートフロント探索の深さ' }
    ],
    invariants: [
      'tensionThreshold < decisionThreshold',
      'smoothingFactor > 0'
    ],
    relatedStructures: ['AporeticReasoningEngine']
  },

  // ==========================================================================
  // creative-destruction.ts
  // ==========================================================================
  {
    name: 'Premise',
    module: 'creative-destruction',
    category: 'input',
    description: '思考の基盤となる前提',
    fields: [
      { name: 'id', type: 'string', required: true, description: '前提の一意識別子' },
      { name: 'content', type: 'string', required: true, description: '前提の内容' },
      { name: 'type', type: 'PremiseType', required: true, allowedValues: ['epistemic', 'normative', 'ontological', 'methodological', 'contextual', 'implicit'], description: '前提のタイプ' },
      { name: 'solidity', type: 'number', required: true, range: { min: 0, max: 1 }, description: '前提の強固さ' },
      { name: 'dependencies', type: 'string[]', required: true, description: '依存している他の前提' },
      { name: 'derivedConclusions', type: 'string[]', required: true, description: '導出される結論' },
      { name: 'confidence', type: 'number', required: true, range: { min: 0, max: 1 }, description: '前提の信頼度' },
      { name: 'createdAt', type: 'Date', required: true, description: '作成時刻' },
      { name: 'updateCount', type: 'number', required: true, range: { min: 0, max: Infinity }, description: '更新回数' }
    ],
    invariants: [
      'solidityは[0, 1]の範囲内',
      'idは一意',
      'dependenciesは他のPremiseのidを参照'
    ],
    relatedStructures: ['DestructionResult', 'DestructionMethod']
  },
  {
    name: 'DestructionResult',
    module: 'creative-destruction',
    category: 'output',
    description: '前提の破壊結果',
    fields: [
      { name: 'originalPremise', type: 'Premise', required: true, description: '破壊された前提' },
      { name: 'method', type: 'DestructionMethod', required: true, description: '使用された破壊方法' },
      { name: 'remnants', type: 'string[]', required: true, description: '破壊の残骸' },
      { name: 'exposed', type: 'string[]', required: true, description: '破壊によって露呈したもの' },
      { name: 'depth', type: 'number', required: true, range: { min: 0, max: 1 }, description: '破壊の深さ' },
      { name: 'completeness', type: 'number', required: true, range: { min: 0, max: 1 }, description: '破壊の完全性' },
      { name: 'nextTargets', type: 'string[]', required: true, description: '次の破壊候補' },
      { name: 'timestamp', type: 'Date', required: true, description: 'タイムスタンプ' }
    ],
    invariants: [
      '破壊は常に再構築とセット',
      'depth * completeness > 0.3で有効な破壊'
    ],
    relatedStructures: ['Premise', 'DestructionMethod', 'ReconstructedView']
  },
  {
    name: 'ReconstructedView',
    module: 'creative-destruction',
    category: 'output',
    description: '破壊後の新たな視点',
    fields: [
      { name: 'description', type: 'string', required: true, description: '視点の説明' },
      { name: 'basedOn', type: 'string[]', required: true, description: '基礎となる残骸' },
      { name: 'instability', type: 'number', required: true, range: { min: 0, max: 1 }, description: '視点の不安定性' },
      { name: 'creativityScore', type: 'number', required: true, range: { min: 0, max: 1 }, description: '創造性スコア' },
      { name: 'potentialInsights', type: 'string[]', required: true, description: '導出可能な洞察' }
    ],
    invariants: [
      'instability + creativityScore >= 0.5',
      'basedOnはDestructionResult.remnantsを参照'
    ],
    relatedStructures: ['DestructionResult']
  },
  {
    name: 'ParetoOptimalDestruction',
    module: 'creative-destruction',
    category: 'output',
    description: '多目的最適化による破壊戦略',
    fields: [
      { name: 'targetPremises', type: 'Premise[]', required: true, description: '破壊対象の前提' },
      { name: 'methodCombination', type: 'Map<string, DestructionMethod>', required: true, description: '破壊方法の組み合わせ' },
      { name: 'expectedEffects', type: 'object', required: true, description: '期待される効果' },
      { name: 'paretoPosition', type: 'object', required: true, description: 'パレートフロント上の位置' }
    ],
    invariants: [
      'expectedEffects.creativityIncreaseとexpectedEffects.stabilityDecreaseのトレードオフ',
      'パレート支配されていない戦略のみ'
    ],
    relatedStructures: ['Premise', 'DestructionMethod']
  },

  // ==========================================================================
  // hyper-metacognition.ts
  // ==========================================================================
  {
    name: 'MetacognitiveLayer',
    module: 'hyper-metacognition',
    category: 'state',
    description: 'メタ認知の階層構造',
    fields: [
      { name: 'level', type: '0 | 1 | 2 | 3', required: true, allowedValues: ['0', '1', '2', '3'], description: '層番号' },
      { name: 'content', type: 'string', required: true, description: '層の内容' },
      { name: 'observations', type: 'string[]', required: true, description: '層での認識' },
      { name: 'evaluation', type: 'string', required: true, description: '層での評価' },
      { name: 'confidence', type: 'number', required: true, range: { min: 0, max: 1 }, description: 'この層での信頼度' },
      { name: 'limitations', type: 'string[]', required: true, description: 'この層の限界' },
      { name: 'exclusions', type: 'string[]', required: true, description: 'この層が除外しているもの' },
      { name: 'timestamp', type: 'Date', required: true, description: 'タイムスタンプ' }
    ],
    invariants: [
      'level=0のconfidence >= level=1のconfidence >= level=2のconfidence >= level=3のconfidence',
      '各層は必ずlimitationsを少なくとも1つ持つ'
    ],
    relatedStructures: ['HyperMetacognitiveState']
  },
  {
    name: 'HyperMetacognitiveState',
    module: 'hyper-metacognition',
    category: 'state',
    description: '4層構造の完全なメタ認知状態',
    fields: [
      { name: 'sessionId', type: 'string', required: true, description: 'セッションID' },
      { name: 'layer0', type: 'MetacognitiveLayer', required: true, description: '第0層' },
      { name: 'layer1', type: 'MetacognitiveLayer', required: true, description: '第1層' },
      { name: 'layer2', type: 'MetacognitiveLayer', required: true, description: '第2層' },
      { name: 'layer3', type: 'MetacognitiveLayer', required: true, description: '第3層' },
      { name: 'integratedEvaluation', type: 'object', required: true, description: '全体の統合評価' },
      { name: 'detectedPatterns', type: 'CognitivePattern[]', required: true, description: '検出されたパターン' },
      { name: 'recommendedImprovements', type: 'ImprovementRecommendation[]', required: true, description: '推奨される改善' },
      { name: 'infiniteRegressAwareness', type: 'object', required: true, description: '無限後退の認識' }
    ],
    invariants: [
      'layer0.level = 0, layer1.level = 1, layer2.level = 2, layer3.level = 3',
      'integratedEvaluation.thinkingQualityは[0, 1]の範囲内',
      '無限後退を認識しつつ実用的な停止点を設定'
    ],
    relatedStructures: ['MetacognitiveLayer', 'CognitivePattern', 'ImprovementRecommendation']
  },
  {
    name: 'CognitivePattern',
    module: 'hyper-metacognition',
    category: 'output',
    description: '検出された認知パターン',
    fields: [
      { name: 'name', type: 'string', required: true, description: 'パターン名' },
      { name: 'type', type: 'string', required: true, allowedValues: ['formalization', 'autopilot', 'confirmation-bias', 'overconfidence', 'avoidance', 'creative'], description: 'パターンタイプ' },
      { name: 'detectedAt', type: 'number[]', required: true, description: '検出された層' },
      { name: 'description', type: 'string', required: true, description: 'パターンの説明' },
      { name: 'impact', type: 'number', required: true, range: { min: 0, max: 1 }, description: '影響度' },
      { name: 'mitigation', type: 'string', required: true, description: '対処方法' }
    ],
    invariants: [
      'detectedAtは[0, 1, 2, 3]の部分集合',
      'impactが高いほど優先的な対処が必要'
    ],
    relatedStructures: ['HyperMetacognitiveState']
  },

  // ==========================================================================
  // nonlinear-thought.ts
  // ==========================================================================
  {
    name: 'ThoughtSeed',
    module: 'nonlinear-thought',
    category: 'input',
    description: '非線形思考の出発点',
    fields: [
      { name: 'id', type: 'string', required: true, description: 'シードID' },
      { name: 'content', type: 'string', required: true, description: 'シードの内容' },
      { name: 'type', type: 'SeedType', required: true, allowedValues: ['concept', 'image', 'emotion', 'question', 'paradox', 'metaphor', 'memory', 'random'], description: 'シードタイプ' },
      { name: 'emotionalValence', type: 'number', required: true, range: { min: -1, max: 1 }, description: '感情価' },
      { name: 'abstractionLevel', type: 'number', required: true, range: { min: 0, max: 1 }, description: '抽象度' },
      { name: 'relatedConcepts', type: 'string[]', required: true, description: '関連概念' },
      { name: 'activationStrength', type: 'number', required: true, range: { min: 0, max: 1 }, description: '活性化強度' }
    ],
    invariants: [
      'idは一意',
      'activationStrengthは[0, 1]の範囲内'
    ],
    relatedStructures: ['AssociationChain']
  },
  {
    name: 'Association',
    module: 'nonlinear-thought',
    category: 'intermediate',
    description: '単一の連想',
    fields: [
      { name: 'id', type: 'string', required: true, description: '連想ID' },
      { name: 'content', type: 'string', required: true, description: '連想の内容' },
      { name: 'type', type: 'AssociationType', required: true, allowedValues: ['semantic', 'phonetic', 'visual', 'emotional', 'temporal', 'spatial', 'metaphorical', 'random'], description: '連想タイプ' },
      { name: 'strength', type: 'number', required: true, range: { min: 0, max: 1 }, description: '連想の強度' },
      { name: 'rationale', type: 'string', required: false, description: '連想の理由' },
      { name: 'semanticDistance', type: 'number', required: true, range: { min: 0, max: 1 }, description: '意味的距離' },
      { name: 'surpriseLevel', type: 'number', required: true, range: { min: 0, max: 1 }, description: '驚き度' },
      { name: 'activatedAt', type: 'Date', required: true, description: '活性化時刻' }
    ],
    invariants: [
      '連想は論理的接続を必要としない',
      'strengthとsurpriseLevelはトレードオフ関係にあり得る'
    ],
    relatedStructures: ['ThoughtSeed', 'AssociationChain']
  },
  {
    name: 'AssociationChain',
    module: 'nonlinear-thought',
    category: 'intermediate',
    description: '連想のシーケンス',
    fields: [
      { name: 'id', type: 'string', required: true, description: 'チェーンID' },
      { name: 'seed', type: 'ThoughtSeed', required: true, description: '出発点のシード' },
      { name: 'associations', type: 'Association[]', required: true, description: '連想のシーケンス' },
      { name: 'depth', type: 'number', required: true, range: { min: 0, max: Infinity }, description: 'チェーンの深さ' },
      { name: 'diversity', type: 'number', required: true, range: { min: 0, max: 1 }, description: 'チェーンの多様性' },
      { name: 'convergencePoints', type: 'ConvergencePoint[]', required: true, description: '収束点' },
      { name: 'statistics', type: 'object', required: true, description: 'チェーンの統計' }
    ],
    invariants: [
      'depth = associations.length',
      'diversityは異なるタイプの連想の割合'
    ],
    relatedStructures: ['ThoughtSeed', 'Association', 'ConvergencePoint']
  },
  {
    name: 'EmergentInsight',
    module: 'nonlinear-thought',
    category: 'output',
    description: '非線形思考から生まれる洞察',
    fields: [
      { name: 'id', type: 'string', required: true, description: '洞察ID' },
      { name: 'content', type: 'string', required: true, description: '洞察の内容' },
      { name: 'kind', type: 'InsightKind', required: true, allowedValues: ['connection', 'pattern', 'analogy', 'reframe', 'synthesis', 'question', 'contradiction'], description: '洞察の種類' },
      { name: 'novelty', type: 'number', required: true, range: { min: 0, max: 1 }, description: '新規性' },
      { name: 'utility', type: 'number', required: true, range: { min: 0, max: 1 }, description: '有用性' },
      { name: 'plausibility', type: 'number', required: true, range: { min: 0, max: 1 }, description: '確からしさ' },
      { name: 'sourceChains', type: 'string[]', required: true, description: '源となった連想チェーン' },
      { name: 'relatedConvergencePoints', type: 'string[]', required: true, description: '関連する収束点' },
      { name: 'evaluation', type: 'InsightEvaluation', required: true, description: '洞察の評価' }
    ],
    invariants: [
      'evaluation.overallScoreは[0, 1]の範囲内',
      'noveltyとutilityはトレードオフ関係にあり得る'
    ],
    relatedStructures: ['AssociationChain', 'ConvergencePoint', 'InsightEvaluation']
  }
];

// ============================================================================
// データフロー定義
// ============================================================================

export const DATA_FLOWS: DataFlow[] = [
  {
    name: 'AporiaToCreativeDestruction',
    source: 'aporetic-reasoning',
    target: 'creative-destruction',
    dataType: 'AporiaDetection',
    requiresTransformation: true,
    transformationFunction: 'transformAporiaToPremise'
  },
  {
    name: 'PremiseToMetacognition',
    source: 'creative-destruction',
    target: 'hyper-metacognition',
    dataType: 'Premise',
    requiresTransformation: true,
    transformationFunction: 'transformPremiseToThought'
  },
  {
    name: 'ThoughtToNonLinear',
    source: 'hyper-metacognition',
    target: 'nonlinear-thought',
    dataType: 'MetacognitiveLayer',
    requiresTransformation: true,
    transformationFunction: 'transformLayerToSeed'
  },
  {
    name: 'InsightToBelief',
    source: 'nonlinear-thought',
    target: 'aporetic-reasoning',
    dataType: 'EmergentInsight',
    requiresTransformation: true,
    transformationFunction: 'transformInsightToEvidence'
  }
];

// ============================================================================
// 整合性検証関数
// ============================================================================

/**
 * @summary データ整合性を検証
 * @param data 検証対象のデータ
 * @param structureName データ構造名
 * @returns 検証結果
 */
export function validateDataIntegrity(
  data: Record<string, unknown>,
  structureName: string
): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const structure = DATA_DICTIONARY.find(s => s.name === structureName);
  
  if (!structure) {
    return {
      isValid: false,
      errors: [`未知のデータ構造: ${structureName}`],
      warnings: []
    };
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  // 必須フィールドのチェック
  for (const field of structure.fields) {
    if (field.required && !(field.name in data)) {
      errors.push(`必須フィールドが欠落: ${field.name}`);
    }

    if (field.name in data) {
      const value = data[field.name];

      // 範囲チェック
      if (field.range && typeof value === 'number') {
        if (value < field.range.min || value > field.range.max) {
          errors.push(`${field.name}が範囲外: ${value} (期待: [${field.range.min}, ${field.range.max}])`);
        }
      }

      // 許容値チェック
      if (field.allowedValues && typeof value === 'string') {
        if (!field.allowedValues.includes(value)) {
          errors.push(`${field.name}が許容値外: ${value} (期待: ${field.allowedValues.join(', ')})`);
        }
      }
    }
  }

  // 不変条件のチェック（簡易版）
  for (const invariant of structure.invariants) {
    // 数値範囲の不変条件をチェック
    const rangeMatch = invariant.match(/(\w+)は?\[([0-9.]+),\s*([0-9.]+)\]/);
    if (rangeMatch) {
      const fieldName = rangeMatch[1];
      const min = parseFloat(rangeMatch[2]);
      const max = parseFloat(rangeMatch[3]);
      const value = data[fieldName];
      if (typeof value === 'number' && (value < min || value > max)) {
        errors.push(`不変条件違反: ${invariant}`);
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * @summary 全モジュールのデータ整合性を検証
 * @returns 検証結果のサマリー
 */
export function validateAllModules(): {
  module: string;
  structuresChecked: number;
  errors: number;
  warnings: number;
}[] {
  const results: ReturnType<typeof validateAllModules> = [];

  const modules = ['aporetic-reasoning', 'creative-destruction', 'hyper-metacognition', 'nonlinear-thought'] as const;

  for (const module of modules) {
    const structures = DATA_DICTIONARY.filter(s => s.module === module);
    let errors = 0;
    let warnings = 0;

    // 各構造の不変条件をチェック
    for (const structure of structures) {
      // 型定義の整合性（簡易チェック）
      for (const field of structure.fields) {
        if (!field.type) {
          errors++;
        }
        if (field.required && field.defaultValue !== undefined) {
          warnings++; // 必須フィールドにデフォルト値がある
        }
      }
    }

    results.push({
      module,
      structuresChecked: structures.length,
      errors,
      warnings
    });
  }

  return results;
}

/**
 * @summary データ辞書をMarkdown形式で出力
 * @returns Markdown形式のデータ辞書
 */
export function generateDataDictionaryMarkdown(): string {
  const lines: string[] = [
    '# 自己改善深化フェーズ データ辞書',
    '',
    '## 概要',
    '',
    'このドキュメントは、自己改善深化フェーズで実装された4つの哲学的モジュールのデータ構造を定義します。',
    '',
    '- **aporetic-reasoning**: アポリア共生型推論',
    '- **creative-destruction**: 自己前提破壊メカニズム',
    '- **hyper-metacognition**: 超メタ認知エンジン',
    '- **nonlinear-thought**: 非線形思考生成器',
    '',
    '---',
    ''
  ];

  for (const structure of DATA_DICTIONARY) {
    lines.push(`## ${structure.name}`);
    lines.push('');
    lines.push(`**モジュール**: ${structure.module}`);
    lines.push(`**カテゴリ**: ${structure.category}`);
    lines.push('');
    lines.push(`${structure.description}`);
    lines.push('');
    lines.push('### フィールド');
    lines.push('');
    lines.push('| フィールド | 型 | 必須 | 説明 |');
    lines.push('|-----------|-----|------|------|');

    for (const field of structure.fields) {
      const required = field.required ? 'はい' : 'いいえ';
      lines.push(`| ${field.name} | ${field.type} | ${required} | ${field.description} |`);
    }

    lines.push('');
    lines.push('### 不変条件');
    lines.push('');
    for (const invariant of structure.invariants) {
      lines.push(`- ${invariant}`);
    }

    lines.push('');
    lines.push('---');
    lines.push('');
  }

  // データフロー
  lines.push('## データフロー');
  lines.push('');
  lines.push('モジュール間のデータフロー図:');
  lines.push('');
  lines.push('```mermaid');
  lines.push('graph LR');
  for (const flow of DATA_FLOWS) {
    lines.push(`  ${flow.source} -->|${flow.dataType}| ${flow.target}`);
  }
  lines.push('```');
  lines.push('');

  return lines.join('\n');
}
