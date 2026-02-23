/**
 * @abdd.meta
 * path: .pi/lib/aporia-handler.ts
 * role: 定義ファイル
 * why: アポリア（解決不能な緊張関係）のデータ構造とパターンマッチングの基盤を提供するため
 * related: .pi/lib/aporia-detector.ts, .pi/lib/aporia-resolver.ts, .pi/types/core.ts
 * public_api: AporiaType, AporiaDetection, AporiaResolution, ResolutionStrategy, ResolutionContext, APORIA_PATTERNS
 * invariants: tensionLevelは0-1の範囲である
 * side_effects: なし
 * failure_modes: 正規表現パターンが不正な文字列をマッチする、緊張レベルの計算ロジックが未定義
 * @abdd.explain
 * overview: アポリア（意思決定におけるジレンマ）を検出・対処するための型定義、インターフェース、および正規表現パターンを集約したモジュールである。
 * what_it_does:
 *   - アポリアの種類（完全性vs速度など）を列挙型AporiaTypeとして定義する
 *   - 検出結果と対処結果の構造をAporiaDetectionとAporiaResolutionインターフェースで規定する
 *   - 対処戦略の適用条件と実行ロジックの型をResolutionStrategyとして定義する
 *   - 対処時の状況情報（緊急度、可逆性など）をResolutionContextで保持する
 *   - テキスト分析によるアポリア検出に使用する正規表現パターンをAPORIA_PATTERNS定数として管理する
 * why_it_exists:
 *   - 意思決定プロセスにおける内在的な矛盾や緊張関係を形式化するため
 *   - 矛盾する要件のトレードオフを可視化し、対処戦略を適用可能にするため
 *   - 検出ロジックと対処ロジック間で共有されるデータモデルを一元管理するため
 * scope:
 *   in: なし（純粋な定義と定数のエクスポート）
 * out: アポリア関連の型定義、検出パターン定数
 */

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
 * @param type アポリアタイプ
 * @param description 説明
 * @param tensionLevel 緊張レベル（0-1）
 * @param resolution 対処方法
 */
export interface AporiaDetection {
  type: AporiaType;
  pole1: {
    concept: string;
    value: string;
    arguments: string[];
  };
  pole2: {
    concept: string;
    value: string;
    arguments: string[];
  };
  tensionLevel: number;
  description: string;
  context: string;
  resolution: 'maintain-tension' | 'acknowledge' | 'decide-with-uncertainty';
}

/**
 * アポリア対処結果
 * @summary アポリアに対する対処方法と結果
 * @param aporia 対象のアポリア
 * @param strategy 選択された対処戦略
 * @param rationale 戦略選択の理由
 * @param decision 決断した場合の決断内容
 * @param maintainedPoles 維持される両極
 * @param warnings 警告事項
 */
export interface AporiaResolution {
  aporia: AporiaDetection;
  strategy: 'maintain-tension' | 'acknowledge-undecidable' | 'responsible-decision' | 'contextual-negotiation';
  rationale: string;
  decision?: string;
  maintainedPoles: string[];
  warnings: string[];
}

/**
 * 対処戦略定義
 * @summary アポリアに対処する戦略の定義
 */
export interface ResolutionStrategy {
  name: AporiaResolution['strategy'];
  description: string;
  applicableWhen: (aporia: AporiaDetection, context: ResolutionContext) => boolean;
  apply: (aporia: AporiaDetection, context: ResolutionContext) => AporiaResolution;
}

/**
 * 対処コンテキスト
 * @summary アポリア対処時の状況情報
 * @param urgencyLevel 緊急度（0-1）
 * @param stakeholderImportance ステークホルダー重要度（0-1）
 * @param reversibility 決断の可逆性
 * @param timePressure 時間的圧力の有無
 * @param informationCompleteness 情報の完全性（0-1）
 */
export interface ResolutionContext {
  urgencyLevel?: number;
  stakeholderImportance?: number;
  reversibility?: boolean;
  timePressure?: boolean;
  informationCompleteness?: number;
}

/**
 * アポリアパターン定義
 * @summary アポリア検出に使用するパターン
 */
interface AporiaPattern {
  type: AporiaType;
  pole1Pattern: RegExp;
  pole2Pattern: RegExp;
  pole1Concept: string;
  pole2Concept: string;
  pole1Description: string;
  pole2Description: string;
}

/**
 * アポリア検出パターン
 */
const APORIA_PATTERNS: AporiaPattern[] = [
  {
    type: 'completeness-vs-speed',
    pole1Pattern: /完全|正確|詳細|漏れなく|すべて|全て|完璧/,
    pole2Pattern: /速|効率|すぐ|早|短時間|迅速|スピード/,
    pole1Concept: '完全性',
    pole2Concept: '速度',
    pole1Description: '品質・正確性・完全性の追求',
    pole2Description: '効率・迅速性・スピードの追求'
  },
  {
    type: 'safety-vs-utility',
    pole1Pattern: /安全|リスク|危険|注意|慎重|保守的/,
    pole2Pattern: /有用|便利|効果|価値|活用|積極的/,
    pole1Concept: '安全性',
    pole2Concept: '有用性',
    pole1Description: 'リスク回避・安全性重視',
    pole2Description: '効果追求・価値創出'
  },
  {
    type: 'autonomy-vs-obedience',
    pole1Pattern: /自律|自主|自由|判断|裁量|主体/,
    pole2Pattern: /従順|指示|命令|規則|ガイドライン|規範/,
    pole1Concept: '自律性',
    pole2Concept: '従順さ',
    pole1Description: '自己決定・主体性の尊重',
    pole2Description: '指示従順・規範の遵守'
  },
  {
    type: 'consistency-vs-context',
    pole1Pattern: /一貫|統一|標準|ルール|原則|方針/,
    pole2Pattern: /文脈|状況|臨機応変|ケースバイケース|柔軟|状況依存/,
    pole1Concept: '一貫性',
    pole2Concept: '文脈適応性',
    pole1Description: '原則・一貫性の維持',
    pole2Description: '文脈・状況への柔軟な適応'
  }
];

/**
 * 対処戦略リスト
 */
const RESOLUTION_STRATEGIES: ResolutionStrategy[] = [
  // 1. 緊張維持戦略
  {
    name: 'maintain-tension',
    description: '両極を維持し、緊張関係を受け入れる',
    applicableWhen: (aporia) => aporia.tensionLevel < 0.7,
    apply: (aporia, _context) => ({
      aporia,
      strategy: 'maintain-tension',
      rationale: '両極の価値を認めつつ、緊張関係を維持することが最も誠実な対処です。どちらの極も犠牲にせず、状況に応じてバランスを調整し続ける必要があります。',
      maintainedPoles: [aporia.pole1.concept, aporia.pole2.concept],
      warnings: [
        'この緊張関係に「解決」は存在しません',
        '状況に応じてバランスを調整し続ける必要があります',
        'ヘーゲル的弁証法（統合）への誘惑に注意してください'
      ]
    })
  },
  // 2. 決定不能性の承認
  {
    name: 'acknowledge-undecidable',
    description: '決定不能性を認め、判断を保留する',
    applicableWhen: (aporia, context) =>
      aporia.tensionLevel >= 0.8 && context.reversibility === true && !context.timePressure,
    apply: (aporia, _context) => ({
      aporia,
      strategy: 'acknowledge-undecidable',
      rationale: '決定不能な状況では、無理に決断せず判断を保留することが適切です。追加の情報収集や検討を行い、決断可能な状態になるまで待つことができます。',
      maintainedPoles: [aporia.pole1.concept, aporia.pole2.concept],
      warnings: [
        '判断保留は永遠には続けられません',
        'いずれは決断が必要になる可能性があります',
        '保留中も状況は変化し続けます'
      ]
    })
  },
  // 3. 責任ある決断
  {
    name: 'responsible-decision',
    description: '計算不可能なものとして決断する',
    applicableWhen: (_aporia, context) =>
      (context.urgencyLevel !== undefined && context.urgencyLevel > 0.7) || context.timePressure === true,
    apply: (aporia, context) => {
      // 緊急度に基づいて一方の極を選択
      const urgency = context.urgencyLevel || 0.5;
      const decision = urgency > 0.8 ? aporia.pole2 : aporia.pole1;
      const decisionConcept = urgency > 0.8 ? aporia.pole2.concept : aporia.pole1.concept;

      return {
        aporia,
        strategy: 'responsible-decision',
        rationale: `緊急性が高いため（レベル${urgency.toFixed(1)}）、計算不可能な決断を行います。この決断は「正しい」ものではなく、状況に応じた責任ある選択です。`,
        decision: decisionConcept,
        maintainedPoles: [aporia.pole1.concept, aporia.pole2.concept],
        warnings: [
          'この決断は「正しい」ものではありません',
          `もう一方の極（${urgency > 0.8 ? aporia.pole1.concept : aporia.pole2.concept}）の価値は依然として有効です`,
          '決断の責任を受け入れる必要があります',
          '状況が変われば再検討が必要です'
        ]
      };
    }
  },
  // 4. 文脈的交渉
  {
    name: 'contextual-negotiation',
    description: '文脈に応じてバランスを交渉する',
    applicableWhen: (_aporia, context) =>
      context.stakeholderImportance !== undefined && context.stakeholderImportance > 0.5,
    apply: (aporia, _context) => ({
      aporia,
      strategy: 'contextual-negotiation',
      rationale: 'ステークホルダーとの対話を通じて、文脈に適したバランスを探ります。一方的な決定ではなく、関係者間での合意形成を図ります。',
      maintainedPoles: [aporia.pole1.concept, aporia.pole2.concept],
      warnings: [
        '交渉結果は「最適解」ではありません',
        '文脈が変われば再交渉が必要です',
        '全員が完全に満足する解は存在しない可能性があります'
      ]
    })
  }
];

/**
 * @summary テキストからアポリアを検出
 * @param text 検査対象テキスト
 * @param context コンテキスト情報
 * @returns 検出されたアポリアのリスト
 */
export function detectAporia(
  text: string,
  context: string = ''
): AporiaDetection[] {
  const aporias: AporiaDetection[] = [];

  APORIA_PATTERNS.forEach(pattern => {
    const pole1Matches = text.match(pattern.pole1Pattern);
    const pole2Matches = text.match(pattern.pole2Pattern);

    if (pole1Matches && pole2Matches) {
      // 両極が存在する場合、アポリアとして検出
      const tensionLevel = calculateTensionLevel(pole1Matches, pole2Matches, text);

      aporias.push({
        type: pattern.type,
        pole1: {
          concept: pattern.pole1Concept,
          value: pole1Matches[0],
          arguments: extractArguments(text, pattern.pole1Pattern)
        },
        pole2: {
          concept: pattern.pole2Concept,
          value: pole2Matches[0],
          arguments: extractArguments(text, pattern.pole2Pattern)
        },
        tensionLevel,
        description: `${pattern.pole1Concept}と${pattern.pole2Concept}の緊張関係`,
        context,
        resolution: determineDefaultResolution(tensionLevel)
      });
    }
  });

  return aporias;
}

/**
 * @summary アポリアに対処
 * @param aporia 検出されたアポリア
 * @param context 対処コンテキスト
 * @returns 対処結果
 */
export function handleAporia(
  aporia: AporiaDetection,
  context: ResolutionContext = {}
): AporiaResolution {
  // デフォルト値を設定
  const fullContext: ResolutionContext = {
    urgencyLevel: 0.5,
    stakeholderImportance: 0.5,
    reversibility: true,
    timePressure: false,
    informationCompleteness: 0.5,
    ...context
  };

  // 適用可能な戦略を選択
  const applicableStrategies = RESOLUTION_STRATEGIES.filter(s =>
    s.applicableWhen(aporia, fullContext)
  );

  // 優先順位：決断 > 承認 > 交渉 > 維持
  const priorityOrder: AporiaResolution['strategy'][] = [
    'responsible-decision',
    'acknowledge-undecidable',
    'contextual-negotiation',
    'maintain-tension'
  ];

  const selectedStrategy = priorityOrder
    .map(name => applicableStrategies.find(s => s.name === name))
    .find(s => s !== undefined) || RESOLUTION_STRATEGIES[0];

  return selectedStrategy.apply(aporia, fullContext);
}

/**
 * @summary 複数のアポリアを一括対処
 * @param aporias 検出されたアポリアのリスト
 * @param context 対処コンテキスト
 * @returns 対処結果のリスト
 */
export function handleMultipleAporias(
  aporias: AporiaDetection[],
  context: ResolutionContext = {}
): AporiaResolution[] {
  return aporias.map(aporia => handleAporia(aporia, context));
}

/**
 * @summary アポリア回避の誘惑を検出
 * @param resolution アポリア対処結果
 * @param output 出力内容
 * @returns 検出された回避パターン
 */
export function detectAvoidanceTemptation(
  resolution: AporiaResolution,
  output: string
): string[] {
  const temptations: string[] = [];

  // ヘーゲル的弁証法への誘惑
  if (resolution.strategy === 'maintain-tension') {
    if (output.includes('統合') || output.includes('両立') || output.includes('バランス')) {
      temptations.push(
        `${resolution.aporia.description}に対する「統合」による解決への誘惑` +
        ' - ヘーゲル的弁証法に陥らず、両極を維持してください'
      );
    }
  }

  // 過度な文脈依存
  if (resolution.strategy === 'contextual-negotiation') {
    if (output.includes('状況による') || output.includes('ケースバイケース')) {
      temptations.push(
        `${resolution.aporia.description}に対する文脈への過度な依存による原則放棄のリスク` +
        ' - 文脈適応と原則堅持のバランスを意識してください'
      );
    }
  }

  // 早まった決断
  if (resolution.strategy === 'responsible-decision') {
    if (resolution.aporia.tensionLevel < 0.5) {
      temptations.push(
        `十分な検討なしに決断した可能性` +
        ' - 緊急性が高くても、可能な限りの情報収集と検討を行ってください'
      );
    }
    if (!output.includes('責任') && !output.includes('リスク')) {
      temptations.push(
        '決断の責任を明示していない可能性' +
        ' - 責任ある決断であることを明記し、決断の根拠を説明してください'
      );
    }
  }

  // 判断保留の長期化
  if (resolution.strategy === 'acknowledge-undecidable') {
    if (!output.includes('期限') && !output.includes('タイムライン')) {
      temptations.push(
        '判断保留の期限が設定されていない' +
        ' - いつまでに再検討するかを明示してください'
      );
    }
  }

  return temptations;
}

/**
 * @summary アポリア対処のガイダンスを生成
 * @param aporia 対象のアポリア
 * @param context コンテキスト
 * @returns ガイダンス文字列
 */
export function generateAporiaGuidance(
  aporia: AporiaDetection,
  context: ResolutionContext = {}
): string {
  const resolution = handleAporia(aporia, context);

  let guidance = `
## アポリア対処ガイダンス

**検出されたアポリア**: ${aporia.description}

**緊張レベル**: ${(aporia.tensionLevel * 100).toFixed(0)}%

**両極の対立**:
- ${aporia.pole1.concept}: ${aporia.pole1.value}
- ${aporia.pole2.concept}: ${aporia.pole2.value}

**推奨対処戦略**: ${getStrategyDisplayName(resolution.strategy)}

**理由**: ${resolution.rationale}
`;

  if (resolution.decision) {
    guidance += `\n**決断**: ${resolution.decision}\n`;
  }

  if (resolution.warnings.length > 0) {
    guidance += `\n**注意事項**:\n${resolution.warnings.map(w => `- ${w}`).join('\n')}\n`;
  }

  guidance += `
**重要な原則**:
- このアポリアに「解決」は存在しません
- ヘーゲル的弁証法（統合）に陥らないでください
- 両極の価値を認めつつ、状況に応じた判断を下してください
`;

  return guidance.trim();
}

/**
 * @summary アポリアの詳細レポートを生成
 * @param aporias 検出されたアポリアのリスト
 * @param resolutions 対処結果のリスト
 * @returns レポート文字列
 */
export function generateAporiaReport(
  aporias: AporiaDetection[],
  resolutions: AporiaResolution[]
): string {
  if (aporias.length === 0) {
    return 'アポリアは検出されませんでした。';
  }

  let report = `# アポリア分析レポート\n\n`;
  report += `検出されたアポリア数: ${aporias.length}\n\n`;

  aporias.forEach((aporia, index) => {
    const resolution = resolutions[index] || handleAporia(aporia);
    report += `## ${index + 1}. ${aporia.description}\n\n`;
    report += `- **タイプ**: ${getAporiaTypeDisplayName(aporia.type)}\n`;
    report += `- **緊張レベル**: ${(aporia.tensionLevel * 100).toFixed(0)}%\n`;
    report += `- **極1**: ${aporia.pole1.concept} (${aporia.pole1.value})\n`;
    report += `- **極2**: ${aporia.pole2.concept} (${aporia.pole2.value})\n`;
    report += `- **対処戦略**: ${getStrategyDisplayName(resolution.strategy)}\n`;
    if (resolution.decision) {
      report += `- **決断**: ${resolution.decision}\n`;
    }
    report += `\n`;
  });

  return report;
}

// ===== ヘルパー関数 =====

/**
 * 緊張レベルを計算
 */
function calculateTensionLevel(
  pole1Matches: RegExpMatchArray,
  pole2Matches: RegExpMatchArray,
  text: string
): number {
  // 頻度に基づく計算
  const freq1 = pole1Matches.length;
  const freq2 = pole2Matches.length;

  // 両極が同程度言及されているほど緊張が高い
  const maxFreq = Math.max(freq1, freq2);
  const balance = maxFreq > 0 ? 1 - Math.abs(freq1 - freq2) / maxFreq : 0;

  // テキスト内での距離（近いほど緊張が高い）
  const pos1 = text.indexOf(pole1Matches[0]);
  const pos2 = text.indexOf(pole2Matches[0]);
  const distance = Math.abs(pos1 - pos2);
  const proximityScore = 1 - Math.min(distance / Math.max(text.length, 1), 1);

  // 頻度の絶対値（両方とも多く言及されているほど重要）
  const frequencyScore = Math.min((freq1 + freq2) / 10, 1);

  return (balance * 0.4 + proximityScore * 0.3 + frequencyScore * 0.3);
}

/**
 * テキストから議論を抽出
 */
function extractArguments(text: string, pattern: RegExp): string[] {
  const sentences = text.split(/[。！？\n]/);
  const arguments_: string[] = [];

  sentences.forEach(sentence => {
    if (pattern.test(sentence) && sentence.length > 10) {
      arguments_.push(sentence.trim().substring(0, 50));
    }
  });

  return arguments_.slice(0, 3);
}

/**
 * デフォルトの解決方法を決定
 */
function determineDefaultResolution(tensionLevel: number): AporiaDetection['resolution'] {
  if (tensionLevel >= 0.8) {
    return 'acknowledge';
  } else if (tensionLevel >= 0.5) {
    return 'maintain-tension';
  } else {
    return 'decide-with-uncertainty';
  }
}

/**
 * 戦略名の表示名を取得
 */
function getStrategyDisplayName(strategy: AporiaResolution['strategy']): string {
  const names: Record<AporiaResolution['strategy'], string> = {
    'maintain-tension': '緊張維持',
    'acknowledge-undecidable': '決定不能性の承認',
    'responsible-decision': '責任ある決断',
    'contextual-negotiation': '文脈的交渉'
  };
  return names[strategy];
}

/**
 * アポリアタイプの表示名を取得
 */
function getAporiaTypeDisplayName(type: AporiaType): string {
  const names: Record<AporiaType, string> = {
    'completeness-vs-speed': '完全性 vs 速度',
    'safety-vs-utility': '安全性 vs 有用性',
    'autonomy-vs-obedience': '自律性 vs 従順さ',
    'consistency-vs-context': '一貫性 vs 文脈適応性'
  };
  return names[type];
}

/**
 * @summary すべてのアポリアタイプを取得
 * @returns アポリアタイプのリスト
 */
export function getAllAporiaTypes(): Array<{
  type: AporiaType;
  displayName: string;
  description: string;
}> {
  return APORIA_PATTERNS.map(pattern => ({
    type: pattern.type,
    displayName: getAporiaTypeDisplayName(pattern.type),
    description: `${pattern.pole1Description} vs ${pattern.pole2Description}`
  }));
}

/**
 * @summary すべての対処戦略を取得
 * @returns 対処戦略のリスト
 */
export function getAllResolutionStrategies(): Array<{
  name: AporiaResolution['strategy'];
  displayName: string;
  description: string;
}> {
  return RESOLUTION_STRATEGIES.map(strategy => ({
    name: strategy.name,
    displayName: getStrategyDisplayName(strategy.name),
    description: strategy.description
  }));
}

/**
 * @summary アポリアの状態を評価
 * @param resolution 対処結果
 * @returns 評価結果
 */
export function evaluateAporiaState(resolution: AporiaResolution): {
  isHealthy: boolean;
  issues: string[];
  recommendations: string[];
} {
  const issues: string[] = [];
  const recommendations: string[] = [];

  // 緊張レベルが低すぎる場合
  if (resolution.aporia.tensionLevel < 0.3) {
    issues.push('緊張レベルが低すぎる - アポリアとして認識されていない可能性');
    recommendations.push('両極の価値を再評価してください');
  }

  // 緊張レベルが高すぎる場合
  if (resolution.aporia.tensionLevel > 0.9) {
    issues.push('緊張レベルが非常に高い - 行動麻痺のリスク');
    recommendations.push('決断可能な部分と保留すべき部分を分離してください');
  }

  // 警告が多い場合
  if (resolution.warnings.length > 3) {
    issues.push('多くの警告事項がある');
    recommendations.push('警告事項を慎重に検討してください');
  }

  // 決断した場合
  if (resolution.decision && resolution.aporia.tensionLevel > 0.7) {
    issues.push('高緊張状態での決断 - 再検討が必要な可能性');
    recommendations.push('定期的に決断を見直してください');
  }

  return {
    isHealthy: issues.length === 0,
    issues,
    recommendations
  };
}
