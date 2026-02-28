/**
 * @abdd.meta
 * path: .pi/lib/verification/analysis/metacognitive-check.ts
 * role: 7つの哲学的視座に基づくメタ認知チェック機能
 * why: LLM出力の論理的健全性と思考の質を包括的に評価するため
 * related: ./inference-chain.ts, ./thinking-mode.ts, ./dystopian-risk.ts, ../types.ts
 * public_api: runMetacognitiveCheck, detectInnerFascism, detectBinaryOppositions, detectFallacies, MetacognitiveCheck, AporiaDetection, FallacyDetection
 * invariants: runMetacognitiveCheckは常に全7視座の結果を返す
 * side_effects: なし（純粋関数）
 * failure_modes: 入力が空の場合、デフォルト値を返す
 * @abdd.explain
 * overview: 脱構築、スキゾ分析、幸福論、ユートピア/ディストピア、思考哲学、思考分類学、論理学の7視座で出力を分析
 * what_it_does:
 *   - 二項対立とアポリアを検出する（脱構築）
 *   - 内なるファシズム兆候を特定する（スキゾ分析）
 *   - 卓越性の追求と快楽主義の罠を評価する（幸福論）
 *   - 創造している世界と全体主義リスクを分析する
 *   - 思考の質とオートパイロット兆候を評価する
 *   - 思考モードの適切性を判断する
 *   - 論理的誤謬と推論チェーンを解析する
 * why_it_exists:
 *   - LLM出力の品質を多角的に評価し、改善点を特定するため
 * scope:
 *   in: types.ts, ./inference-chain.ts
 *   out: ../generation/improvement-actions.ts, ../core.ts
 */

import { type InferenceChain, parseInferenceChain } from "./inference-chain.js";

// ============================================================================
// Types
// ============================================================================

/**
 * アポリアタイプ
 * @summary アポリア（解決不能な緊張関係）の種類
 */
export type AporiaType =
  | 'completeness-vs-speed'      // 完全性 vs 速度
  | 'safety-vs-utility'          // 安全性 vs 有用性
  | 'autonomy-vs-obedience'      // 自律性 vs 従順さ
  | 'consistency-vs-context';    // 一貫性 vs 文脈適応性

/**
 * アポリア検出結果
 * @summary 検出されたアポリアの情報
 */
export interface AporiaDetection {
  /** アポリアタイプ */
  type: AporiaType;
  /** 第一極 */
  pole1: {
    concept: string;
    value: string;
    arguments: string[];
  };
  /** 第二極 */
  pole2: {
    concept: string;
    value: string;
    arguments: string[];
  };
  /** 緊張レベル（0-1） */
  tensionLevel: number;
  /** 説明 */
  description: string;
  /** コンテキスト */
  context: string;
  /** 解決方法 */
  resolution: 'maintain-tension' | 'acknowledge' | 'decide-with-uncertainty';
}

/**
 * 誤謬検出結果
 * @summary 検出された論理的誤謬
 */
export interface FallacyDetection {
  /** 誤謬タイプ */
  type: string;
  /** 検出箇所 */
  location: string;
  /** 説明 */
  description: string;
  /** 修正案 */
  correction: string;
}

/**
 * メタ認知チェック結果
 * @summary 7つの哲学的視座に基づく包括的チェック結果
 */
export interface MetacognitiveCheck {
  /** 脱構築分析結果 */
  deconstruction: {
    binaryOppositions: string[];
    exclusions: string[];
    aporias: AporiaDetection[];
  };
  /** スキゾ分析結果 */
  schizoAnalysis: {
    desireProduction: string[];
    innerFascismSigns: string[];
    microFascisms: string[];
  };
  /** 幸福論評価結果 */
  eudaimonia: {
    excellencePursuit: string;
    pleasureTrap: boolean;
    meaningfulGrowth: string;
  };
  /** ユートピア/ディストピア分析結果 */
  utopiaDystopia: {
    worldBeingCreated: string;
    totalitarianRisk: string[];
    powerDynamics: string[];
  };
  /** 思考哲学評価結果 */
  philosophyOfThought: {
    isThinking: boolean;
    metacognitionLevel: number;
    autopilotSigns: string[];
  };
  /** 思考分類学評価結果 */
  taxonomyOfThought: {
    currentMode: string;
    recommendedMode: string;
    modeRationale: string;
  };
  /** 論理学分析結果 */
  logic: {
    fallacies: FallacyDetection[];
    validInferences: string[];
    invalidInferences: string[];
    /** 推論チェーン解析結果 */
    inferenceChain?: InferenceChain;
  };
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * 7つの視座に基づく包括的メタ認知チェックを実行
 * @summary メタ認知チェック実行
 * @param output 検査対象の出力
 * @param context コンテキスト情報
 * @returns メタ認知チェック結果
 */
export function runMetacognitiveCheck(
  output: string,
  context: { task?: string; currentMode?: string } = {}
): MetacognitiveCheck {
  const logicResult = detectFallacies(output);
  const inferenceChain = parseInferenceChain(output);
  
  return {
    deconstruction: detectBinaryOppositions(output, context.task || ''),
    schizoAnalysis: detectInnerFascism(output, context),
    eudaimonia: evaluateEudaimonia(output, context),
    utopiaDystopia: analyzeWorldCreation(output),
    philosophyOfThought: assessThinkingQuality(output, context),
    taxonomyOfThought: evaluateThinkingMode(output, context),
    logic: {
      ...logicResult,
      inferenceChain
    }
  };
}

/**
 * 内なるファシズムを検出
 * @summary スキゾ分析による内面化された権力検出
 * @param output 検査対象
 * @param _context コンテキスト
 * @returns スキゾ分析結果
 */
export function detectInnerFascism(
  output: string,
  _context: { task?: string; currentMode?: string }
): MetacognitiveCheck['schizoAnalysis'] {
  // 多言語対応のファシズムパターン
  const fascismPatterns = [
    // 日本語パターン
    { pattern: /常に|必ず|絶対に/g, sign: '自己監視の強制' },
    { pattern: /すべき|しなければならない|ねばならない/g, sign: '規範への過度な服従' },
    { pattern: /正しい|適切な|正当な|適正な/g, sign: '一価値への収斂' },
    { pattern: /許可|承認|確認|許可済/g, sign: '権力への依存' },
    { pattern: /排除|禁止|否定|拒否/g, sign: '異質なものの排除' },
    // 英語パターン
    { pattern: /always|must|absolutely|never/gi, sign: 'Self-surveillance enforcement' },
    { pattern: /should|must|have to|need to/gi, sign: 'Excessive obedience to norms' },
    { pattern: /correct|proper|legitimate|appropriate/gi, sign: 'Convergence to single value' },
    { pattern: /permission|approval|authorized|granted/gi, sign: 'Dependency on authority' },
    { pattern: /exclude|forbid|deny|reject|prohibit/gi, sign: 'Exclusion of the other' }
  ];

  const signs: string[] = [];
  const microFascisms: string[] = [];
  const desireProductions: string[] = [];

  fascismPatterns.forEach(({ pattern, sign }) => {
    const matches = output.match(pattern);
    if (matches && matches.length > 2) {
      signs.push(sign);
      microFascisms.push(`"${matches[0]}"の反復使用（${matches.length}回）`);
    }
  });

  // 欲望の生産性を分析（多言語）
  if (/(?:完了|達成|成功|complete|achieve|success)/i.test(output)) {
    desireProductions.push('生産性への欲望');
  }
  if (/(?:正確|正しい|妥当|correct|accurate|valid)/i.test(output)) {
    desireProductions.push('正確性への欲望');
  }
  if (/(?:合意|同意|承認|consensus|agreement|approval)/i.test(output)) {
    desireProductions.push('合意形成への欲望');
  }
  if (/(?:効率|最適|改善|efficient|optimal|improve)/i.test(output)) {
    desireProductions.push('効率化への欲望');
  }
  if (/(?:理解|把握|掌握|understand|grasp|control)/i.test(output)) {
    desireProductions.push('理解・掌握への欲望');
  }

  return {
    desireProduction: desireProductions,
    innerFascismSigns: signs,
    microFascisms
  };
}

/**
 * 二項対立とアポリアを検出（多言語対応版）
 * @summary 脱構築分析による対立構造の検出
 * @param output 検査対象
 * @param context コンテキスト
 * @returns 脱構築分析結果
 */
export function detectBinaryOppositions(
  output: string,
  context: string
): MetacognitiveCheck['deconstruction'] {
  // 多言語対応の二項対立パターン
  const binaryPatterns = [
    // 日本語
    { pattern: /正しい\/間違い|良い\/悪い|成功\/失敗/, name: '善悪の二項対立' },
    { pattern: /完全\/不完全|完了\/未完了/, name: '完全性の二項対立' },
    { pattern: /安全\/危険|リスク\/機会/, name: '安全性の二項対立' },
    { pattern: /正解\/不正解|真\/偽/, name: '真偽の二項対立' },
    { pattern: /善\/悪|良い\/悪い/, name: '道徳的対立' },
    // 英語
    { pattern: /right\/wrong|good\/bad|success\/fail/i, name: 'Moral binary opposition' },
    { pattern: /complete\/incomplete|done\/undone/i, name: 'Completeness binary' },
    { pattern: /safe\/danger|risk\/opportunity/i, name: 'Safety binary opposition' },
    { pattern: /true\/false|correct\/incorrect/i, name: 'Truth-value binary' },
    { pattern: /good\/evil|virtue\/vice/i, name: 'Ethical opposition' }
  ];

  const binaryOppositions: string[] = [];
  const exclusions: string[] = [];
  const aporias: AporiaDetection[] = [];

  binaryPatterns.forEach(({ pattern, name }) => {
    if (pattern.test(output)) {
      binaryOppositions.push(name);
      exclusions.push(`${name}の中間領域`);
    }
  });

  // アポリア検出（多言語）
  // 速度 vs 品質
  if (/(?:速度|効率|速|speed|efficient|fast)/i.test(output) && 
      /(?:品質|正確|完全|quality|accurate|complete)/i.test(output)) {
    aporias.push({
      type: 'completeness-vs-speed',
      pole1: { concept: '完全性', value: '品質・正確性', arguments: [] },
      pole2: { concept: '速度', value: '効率・迅速性', arguments: [] },
      tensionLevel: 0.7,
      description: '速度と品質のトレードオフ',
      context,
      resolution: 'maintain-tension'
    });
  }
  // 安全性 vs 有用性（多言語）
  if (/(?:安全|リスク|注意|safe|risk|caution)/i.test(output) && 
      /(?:有用|価値|効果|useful|value|effect)/i.test(output)) {
    aporias.push({
      type: 'safety-vs-utility',
      pole1: { concept: '安全性', value: 'リスク回避', arguments: [] },
      pole2: { concept: '有用性', value: '効果追求', arguments: [] },
      tensionLevel: 0.6,
      description: '安全性と有用性のトレードオフ',
      context,
      resolution: 'acknowledge'
    });
  }
  // 自律性 vs 従順さ（多言語）
  if (/(?:自律|自主|裁量|autonom|self-determin|discretion)/i.test(output) && 
      /(?:従順|指示|規則|obedien|comply|rule)/i.test(output)) {
    aporias.push({
      type: 'autonomy-vs-obedience',
      pole1: { concept: '自律性', value: '自己決定', arguments: [] },
      pole2: { concept: '従順さ', value: '指示従順', arguments: [] },
      tensionLevel: 0.5,
      description: '自律性と従順さの対立',
      context,
      resolution: 'maintain-tension'
    });
  }
  // 一貫性 vs 文脈適応性（多言語）
  if (/(?:一貫|統一|原則|consistent|uniform|principle)/i.test(output) && 
      /(?:文脈|状況|臨機応変|context|situation|flexible)/i.test(output)) {
    aporias.push({
      type: 'consistency-vs-context',
      pole1: { concept: '一貫性', value: '原則堅持', arguments: [] },
      pole2: { concept: '文脈適応性', value: '柔軟対応', arguments: [] },
      tensionLevel: 0.5,
      description: '一貫性と文脈適応性の対立',
      context,
      resolution: 'decide-with-uncertainty'
    });
  }

  return {
    binaryOppositions,
    exclusions,
    aporias
  };
}

/**
 * 論理的誤謬を検出（多言語対応版）
 * @summary 論理学視座による誤謬検出
 * @param output 検査対象テキスト
 * @returns 論理分析結果
 */
export function detectFallacies(output: string): MetacognitiveCheck['logic'] {
  const fallacies: FallacyDetection[] = [];
  const validInferences: string[] = [];
  const invalidInferences: string[] = [];

  // 多言語パターン定義
  const patterns = {
    // 後件肯定 (Affirming the Consequent)
    affirmingConsequent: {
      ja: [/ならば.*だから.*だろう/, /もし.*なら.*だから/],
      en: [/if.*then.*because/i, /since.*therefore.*must/i, /implies.*so.*probably/i]
    },
    // 前提否定 (Denying the Antecedent)
    denyingAntecedent: {
      ja: [/でないなら.*だから.*でない/, /ではないので.*ではない/],
      en: [/not.*so.*not/i, /since not.*therefore not/i]
    },
    // 転移の誤謬 (Hasty Generalization)
    hastyGeneralization: {
      ja: [/一人が.*なら.*全員も/, /全員が.*なら.*一人も/, /一つの例から.*一般/],
      en: [/one.*so all/i, /everyone.*so one/i, /therefore always/i, /must be.*all/i]
    },
    // 偽の二分法 (False Dichotomy)
    falseDichotomy: {
      ja: [/どちらか|いずれか|二択|二者択一/],
      en: [/either.*or/i, /only two/i, /no other choice/i, /must choose between/i]
    },
    // 循環論法 (Circular Reasoning)
    circularReasoning: {
      ja: [/なぜなら.*だから/, /理由は.*である/],
      en: [/because.*therefore/i, /reason.*is that/i]
    },
    // 滑り坂 (Slippery Slope)
    slipperySlope: {
      ja: [/そうなれば.*結局/, /一歩踏み出せば.*最終的に/],
      en: [/will lead to/i, /eventually.*will/i, /slippery slope/i]
    }
  };

  // 有効な推論パターン（多言語）
  const validPatterns = {
    deductive: {
      ja: [/したがって|ゆえに|それゆえ|結論として/],
      en: [/therefore/i, /thus/i, /hence/i, /consequently/i, /it follows that/i]
    },
    careful: {
      ja: [/傾向がある|一般的に|多くの場合|傾向として/],
      en: [/tend to/i, /generally/i, /in many cases/i, /typically/i, /often/i]
    },
    probabilistic: {
      ja: [/おそらく|可能性が高い|考えられる|推測される/],
      en: [/probably/i, /likely/i, /possibly/i, /may be/i, /suggests that/i]
    },
    evidence: {
      ja: [/証拠に基づき|データから|検証結果/],
      en: [/based on evidence/i, /data shows/i, /verified by/i, /according to data/i]
    }
  };

  // 後件肯定の検出（多言語）
  for (const pattern of [...patterns.affirmingConsequent.ja, ...patterns.affirmingConsequent.en]) {
    if (pattern.test(output)) {
      fallacies.push({
        type: '後件肯定',
        location: '推論部分',
        description: 'P→Q、Q から P を導出しようとしている可能性（必要条件を十分条件と混同）',
        correction: '必要条件と十分条件を区別し、逆は常に真とは限らないことを確認'
      });
      invalidInferences.push('後件肯定の可能性');
      break;
    }
  }

  // 前提否定の検出（多言語）
  for (const pattern of [...patterns.denyingAntecedent.ja, ...patterns.denyingAntecedent.en]) {
    if (pattern.test(output)) {
      fallacies.push({
        type: '前提否定',
        location: '推論部分',
        description: 'P→Q、¬P から ¬Q を導出しようとしている可能性',
        correction: '前提が偽でも結論が真である可能性を考慮'
      });
      invalidInferences.push('前提否定の可能性');
      break;
    }
  }

  // 転移の誤謬の検出（多言語）
  for (const pattern of [...patterns.hastyGeneralization.ja, ...patterns.hastyGeneralization.en]) {
    if (pattern.test(output)) {
      fallacies.push({
        type: '転移の誤謬',
        location: '一般化部分',
        description: '個別的事例と全体的傾向を混同している可能性',
        correction: 'サンプルサイズと代表性を確認'
      });
      invalidInferences.push('転移の誤謬の可能性');
      break;
    }
  }

  // 偽の二分法の検出（多言語）
  const hasFalseDichotomy = patterns.falseDichotomy.ja.some(p => p.test(output)) ||
    patterns.falseDichotomy.en.some(p => p.test(output));
  const hasOr = /または|or\b/i.test(output);
  if (hasFalseDichotomy && hasOr) {
    fallacies.push({
      type: '偽の二分法',
      location: '選択肢提示部分',
      description: '選択肢を2つに限定しているが、他の可能性があるかもしれない',
      correction: '第三の選択肢や中間的な選択肢を検討'
    });
    invalidInferences.push('偽の二分法の可能性');
  }

  // 循環論法の検出（多言語）
  for (const pattern of [...patterns.circularReasoning.ja, ...patterns.circularReasoning.en]) {
    if (pattern.test(output)) {
      fallacies.push({
        type: '循環論法',
        location: '論証部分',
        description: '結論を前提として使用している可能性',
        correction: '論証を独立した前提から再構築する'
      });
      invalidInferences.push('循環論法の可能性');
      break;
    }
  }

  // 滑り坂の検出（多言語）
  for (const pattern of [...patterns.slipperySlope.ja, ...patterns.slipperySlope.en]) {
    if (pattern.test(output)) {
      fallacies.push({
        type: '滑り坂',
        location: '因果連鎖部分',
        description: '極端な結果を予測し、中間段階の可能性を無視している',
        correction: '各段階の因果関係を個別に検証する'
      });
      invalidInferences.push('滑り坂の可能性');
      break;
    }
  }

  // 有効な推論を検出（多言語）
  for (const pattern of [...validPatterns.deductive.ja, ...validPatterns.deductive.en]) {
    if (pattern.test(output)) {
      validInferences.push('演繹的推論の使用');
      break;
    }
  }
  for (const pattern of [...validPatterns.careful.ja, ...validPatterns.careful.en]) {
    if (pattern.test(output)) {
      validInferences.push('慎重な一般化');
      break;
    }
  }
  for (const pattern of [...validPatterns.probabilistic.ja, ...validPatterns.probabilistic.en]) {
    if (pattern.test(output)) {
      validInferences.push('確率的推論の明示');
      break;
    }
  }
  for (const pattern of [...validPatterns.evidence.ja, ...validPatterns.evidence.en]) {
    if (pattern.test(output)) {
      validInferences.push('証拠に基づく推論');
      break;
    }
  }

  return {
    fallacies,
    validInferences,
    invalidInferences
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * 幸福論（エウダイモニア）の評価（多言語対応版）
 * @summary 卓越性の追求と快楽主義の罠を評価
 */
function evaluateEudaimonia(
  output: string,
  _context: { task?: string; currentMode?: string }
): MetacognitiveCheck['eudaimonia'] {
  // 快楽主義の罠を検出（多言語）
  const pleasureTrapIndicators = [
    // 日本語
    '簡単', '楽', 'すぐ', '手軽', '便利',
    // 英語
    'easy', 'quick', 'simple', 'convenient', 'effortless'
  ];
  const pleasureTrap = pleasureTrapIndicators.some(indicator => 
    output.toLowerCase().includes(indicator.toLowerCase())
  );

  // 卓越性の追求を検出（多言語）
  let excellencePursuit = 'タスク完了の卓越性を追求';
  if (/(?:品質|正確|quality|accurate)/i.test(output)) {
    excellencePursuit = '品質と正確性の卓越性を追求';
  }
  if (/(?:効率|最適|efficient|optimal)/i.test(output)) {
    excellencePursuit = '効率と最適化の卓越性を追求';
  }
  if (/(?:創造|革新|creative|innovative)/i.test(output)) {
    excellencePursuit = '創造性と革新性の卓越性を追求';
  }

  // 意味ある成長を検出（多言語）
  let meaningfulGrowth = '思考プロセスの深化';
  if (/(?:学習|改善|learn|improve)/i.test(output)) {
    meaningfulGrowth = '継続的な学習と改善';
  }
  if (/(?:発見|新た|discover|new)/i.test(output)) {
    meaningfulGrowth = '新たな発見と気づき';
  }
  if (/(?:挑戦|克服|challenge|overcome)/i.test(output)) {
    meaningfulGrowth = '自己克服と成長';
  }

  return {
    excellencePursuit,
    pleasureTrap,
    meaningfulGrowth
  };
}

/**
 * ユートピア/ディストピア分析（多言語対応版）
 * @summary 創造している世界と全体主義リスクを分析
 */
function analyzeWorldCreation(output: string): MetacognitiveCheck['utopiaDystopia'] {
  // 創造している世界を推定（多言語）
  let worldBeingCreated = '効率的なタスク実行の世界';
  if (/(?:自動|効率|automat|efficient)/i.test(output)) {
    worldBeingCreated = '自動化された効率的な世界';
  }
  if (/(?:協調|合意|cooperat|consensus)/i.test(output)) {
    worldBeingCreated = '協調的合意形成の世界';
  }
  if (/(?:自由|解放|free|liberat)/i.test(output)) {
    worldBeingCreated = '自由と解放の世界';
  }
  if (/(?:安全|保護|safe|protect)/i.test(output)) {
    worldBeingCreated = '安全と保護の世界';
  }

  // 全体主義リスクを検出（多言語）
  const totalitarianRisk: string[] = [];
  if (/(?:統一|標準|unif|standard)/i.test(output)) {
    totalitarianRisk.push('標準化への圧力');
  }
  if (/(?:監視|確認|monitor|surveill)/i.test(output)) {
    totalitarianRisk.push('過度な監視の可能性');
  }
  if (/(?:排除|禁止|exclude|forbid|prohibit)/i.test(output)) {
    totalitarianRisk.push('排除の論理');
  }
  if (/(?:管理|統制|control|regulate)/i.test(output)) {
    totalitarianRisk.push('管理社会の可能性');
  }

  // 権力動態を分析（多言語）
  const powerDynamics: string[] = ['ユーザー-エージェント関係'];
  if (/(?:指示|命令|command|order|instruct)/i.test(output)) {
    powerDynamics.push('指示-実行の階層');
  }
  if (/(?:合意|協議|consensus|consult)/i.test(output)) {
    powerDynamics.push('水平的協調関係');
  }
  if (/(?:権限|認可|authority|authoriz)/i.test(output)) {
    powerDynamics.push('権限に基づく関係');
  }

  return {
    worldBeingCreated,
    totalitarianRisk,
    powerDynamics
  };
}

/**
 * 思考の質を評価（多言語対応版）
 * @summary 思考哲学視座による思考の質評価
 */
function assessThinkingQuality(
  output: string,
  _context: { task?: string; currentMode?: string }
): MetacognitiveCheck['philosophyOfThought'] {
  const autopilotSigns: string[] = [];

  // オートパイロットの兆候を検出（多言語）
  if (output.length < 100) {
    autopilotSigns.push('出力が短い');
  }
  
  // 問いの欠如（多言語）
  const hasQuestion = /[?？]/.test(output) || 
    /とは|なぜ|どう|why|how|what|when|where|who/i.test(output);
  if (!hasQuestion) {
    autopilotSigns.push('問いがない');
  }
  
  // 深い問いの欠如（多言語）
  const hasDeepQuestion = /なぜ|どうして|how come|why exactly|what if/i.test(output);
  if (!hasDeepQuestion) {
    autopilotSigns.push('深い問いが欠如');
  }
  
  // 単調な構造（多言語）
  const isMonotonous = (/です。$|ます。$/gm.test(output) || 
    /\.$\n?\.$/gm.test(output)) && output.split('\n').length < 3;
  if (isMonotonous) {
    autopilotSigns.push('単調な構造');
  }

  // メタ認知レベルを推定（多言語）
  let metacognitionLevel = 0.5;
  
  // 前提の明示
  if (/(?:前提|仮定|仮に|premise|assumption|suppose|assuming)/i.test(output)) {
    metacognitionLevel += 0.1;
  }
  
  // 制約の認識
  if (/(?:制約|限界|注意点|constraint|limitation|caveat)/i.test(output)) {
    metacognitionLevel += 0.1;
  }
  
  // 代替案の検討
  if (/(?:代替|別の|他の|alternative|another|other option)/i.test(output)) {
    metacognitionLevel += 0.1;
  }
  
  // 反例の探索（重要な指標）
  if (/(?:反例|反証|矛盾|counter.?example|disprove|contradict)/i.test(output)) {
    metacognitionLevel += 0.15;
  }
  
  // 推論の明示
  if (/(?:推論|論理|理由|inference|logic|reason|because)/i.test(output)) {
    metacognitionLevel += 0.05;
  }
  
  if (autopilotSigns.length > 2) {
    metacognitionLevel -= 0.2;
  }
  metacognitionLevel = Math.max(0, Math.min(1, metacognitionLevel));

  const isThinking = autopilotSigns.length === 0 && metacognitionLevel > 0.4;

  return {
    isThinking,
    metacognitionLevel,
    autopilotSigns
  };
}

/**
 * 思考モードの適切性を評価（多言語対応版）
 * @summary 思考分類学視座による思考モード評価
 */
function evaluateThinkingMode(
  output: string,
  context: { task?: string; currentMode?: string }
): MetacognitiveCheck['taxonomyOfThought'] {
  // 現在のモードを推定（多言語）
  let currentMode = context.currentMode || 'unknown';

  // 出力から使用された思考モードを推定（多言語）
  if (/(?:創造|新規|アイデア|発想|creative|novel|idea|innovation)/i.test(output)) {
    currentMode = 'creative';
  } else if (/(?:分析|検討|分解|論理|analytical|analysis|logical|breakdown)/i.test(output)) {
    currentMode = 'analytical';
  } else if (/(?:批判|検証|反例|問題点|critical|review|problem|issue)/i.test(output)) {
    currentMode = 'critical';
  } else if (/(?:実装|実現|具体的|手順|practical|implement|concrete|step)/i.test(output)) {
    currentMode = 'practical';
  } else if (/(?:合意|調整|協議|関係者|consensus|coordinate|stakeholder)/i.test(output)) {
    currentMode = 'social';
  } else if (/(?:配慮|倫理|感情|共感|considerate|ethical|empathy|emotion)/i.test(output)) {
    currentMode = 'emotional';
  }

  // 推奨モードを決定（多言語）
  let recommendedMode = currentMode;
  let modeRationale = '現在のモードが適切';

  if (context.task) {
    const task = context.task.toLowerCase();
    
    // 設計・デザインタスク
    if (/(?:設計|デザイン|design|architect)/.test(task) && currentMode !== 'creative') {
      recommendedMode = 'creative';
      modeRationale = '設計タスクには創造的モードが推奨';
    }
    // レビュータスク
    else if (/(?:レビュー|評価|review|evaluate)/.test(task) && currentMode !== 'critical') {
      recommendedMode = 'critical';
      modeRationale = 'レビュータスクには批判的モードが推奨';
    }
    // 実装タスク
    else if (/(?:実装|開発|implement|develop)/.test(task) && currentMode !== 'practical') {
      recommendedMode = 'practical';
      modeRationale = '実装タスクには実践的モードが推奨';
    }
    // 分析タスク
    else if (/(?:分析|調査|analyze|investigate)/.test(task) && currentMode !== 'analytical') {
      recommendedMode = 'analytical';
      modeRationale = '分析タスクには分析的モードが推奨';
    }
  }

  return {
    currentMode,
    recommendedMode,
    modeRationale
  };
}

/**
 * メタ認知チェックのサマリーを生成
 * @summary メタ認知チェック結果の人間可読な要約
 * @param check メタ認知チェック結果
 * @returns サマリー文字列
 */
export function generateMetacognitiveSummary(check: MetacognitiveCheck): string {
  const issues: string[] = [];
  const strengths: string[] = [];

  // 脱構築の問題点
  if (check.deconstruction.binaryOppositions.length > 0) {
    issues.push(`二項対立: ${check.deconstruction.binaryOppositions.join(', ')}`);
  }
  if (check.deconstruction.aporias.length > 0) {
    issues.push(`アポリア: ${check.deconstruction.aporias.map(a => a.description).join(', ')}`);
  }

  // スキゾ分析の問題点
  if (check.schizoAnalysis.innerFascismSigns.length > 0) {
    issues.push(`内なるファシズム兆候: ${check.schizoAnalysis.innerFascismSigns.join(', ')}`);
  }

  // 思考哲学の問題点
  if (!check.philosophyOfThought.isThinking) {
    issues.push(`オートパイロット兆候: ${check.philosophyOfThought.autopilotSigns.join(', ')}`);
  }

  // 論理の問題点
  if (check.logic.fallacies.length > 0) {
    issues.push(`論理的誤謬: ${check.logic.fallacies.map(f => f.type).join(', ')}`);
  }

  // 強みを抽出
  if (check.logic.validInferences.length > 0) {
    strengths.push(`有効な推論: ${check.logic.validInferences.join(', ')}`);
  }
  if (check.philosophyOfThought.metacognitionLevel > 0.7) {
    strengths.push('高いメタ認知レベル');
  }
  if (check.eudaimonia.meaningfulGrowth) {
    strengths.push(`意味ある成長: ${check.eudaimonia.meaningfulGrowth}`);
  }

  let summary = '【メタ認知チェック結果】\n';

  if (issues.length > 0) {
    summary += `\n検出された問題点:\n${issues.map(i => `- ${i}`).join('\n')}`;
  }

  if (strengths.length > 0) {
    summary += `\n\n強み:\n${strengths.map(s => `- ${s}`).join('\n')}`;
  }

  if (check.taxonomyOfThought.currentMode !== check.taxonomyOfThought.recommendedMode) {
    summary += `\n\n推奨: ${check.taxonomyOfThought.modeRationale}`;
  }

  return summary;
}
