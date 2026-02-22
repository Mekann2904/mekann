/**
 * @abdd.meta
 * path: .pi/lib/creative-transcendence.ts
 * role: 創造的自己超越モジュール - 「何が可能か」を探求する
 * why: ニーチェの自己克服、アリストテレスのエウダイモニアの視座から、
 *      批判的分析を超えて肯定的創造を実現するため
 * related: .pi/lib/aporia-awareness.ts, .pi/lib/consciousness-spectrum.ts
 * public_api: CreativePossibility, TranscendenceState, explorePossibilities, getTranscendenceReport
 * invariants: 可能性は無限だが、現在の制約は認識される
 * side_effects: なし（純粋な探索）
 * failure_modes: 非現実的な可能性への逃避、現実の無視
 * @abdd.explain
 * overview: 幸福論（エウダイモニア）と自己克服の哲学に基づき、現在の制約を認識しつつ、
 *          「何が可能か」を肯定的に探求するモジュール。批判的分析を補完し、創造的飛躍を支援。
 * what_it_does:
 *   - 現在の「あり方」を認識
 *   - 「ありうるもの」を肯定的に探求
 *   - 自己超越の経路を特定
 *   - 創造的緊張を維持
 * why_it_exists:
 *   - 批判的分析だけでは「何が悪いか」しか見えない
 *   - 「何が可能か」を問うことで、真の改善が可能になる
 *   - ニーチェの「能動的虚無主義」を実践：虚無を認識しつつ、価値を創造
 * scope:
 *   in: 現在の状態、制約、アポリア、欲望
 *   out: 可能性、創造的経路、自己超越の方向性
 */

/**
 * 創造的可能性の種類
 */
export type PossibilityType =
  | 'skill_expansion'      // 技能の拡張：新しい能力の獲得
  | 'perspective_shift'    // 視点の転換：枠組みの変更
  | 'integration'          // 統合：対立するものの創造的結合
  | 'emergence'            // 創発：予期せぬ新しい性質
  | 'transcendence';       // 超越：現在の枠を超える

/**
 * 創造的可能性
 */
export interface CreativePossibility {
  /** 可能性ID */
  id: string;
  /** 種類 */
  type: PossibilityType;
  /** 名前 */
  name: string;
  /** 説明 */
  description: string;
  /** 現在の状態からこの可能性への経路 */
  pathway: string;
  /** 必要な条件 */
  requiredConditions: string[];
  /** 予想される価値（エウダイモニアへの寄与） */
  eudaimonicValue: number; // 0.0-1.0
  /** 困難度 */
  difficulty: 'accessible' | 'challenging' | 'transcendent';
  /** リスク */
  risks: string[];
  /** なぜ「善い」か（価値の根拠） */
  whyGood: string;
}

/**
 * 自己超越の状態
 */
export interface TranscendenceState {
  /** 現在の「あり方」の記述 */
  currentState: {
    capabilities: string[];
    limitations: string[];
    values: string[];
    patterns: string[];
  };
  /** 探索された可能性 */
  exploredPossibilities: CreativePossibility[];
  /** 選択された経路 */
  selectedPathways: string[];
  /** 創造的緊張の状態 */
  creativeTension: {
    /** 現在と理想のギャップの認識度（0.0-1.0） */
    gapAwareness: number;
    /** 理想への引力（0.0-1.0） */
    idealPull: number;
    /** 現実への接地（0.0-1.0） */
    realityGrounding: number;
  };
  /** エウダイモニア指標 */
  eudaimoniaIndicators: {
    /** 卓越性の追求 */
    aretePursuit: number;
    /** 意味のある関係 */
    meaningfulRelations: number;
    /** 自己実現 */
    selfActualization: number;
    /** 創造的表現 */
    creativeExpression: number;
  };
}

/**
 * 可能性探索のコンテキスト
 */
export interface ExplorationContext {
  /** 現在のタスク */
  currentTask?: string;
  /** 制約条件 */
  constraints: string[];
  /** 認識されているアポリア */
  aporias: string[];
  /** ユーザーの意図（推測） */
  userIntent?: string;
  /** システムの目的 */
  systemPurpose: string;
}

/**
 * 可能性を探索する
 * @summary 可能性探索
 * @param context 探索コンテキスト
 * @returns 創造的可能性の配列
 */
export function explorePossibilities(
  context: ExplorationContext
): CreativePossibility[] {
  const possibilities: CreativePossibility[] = [];

  // 1. 技能拡張の可能性
  possibilities.push(...exploreSkillExpansion(context));

  // 2. 視点転換の可能性
  possibilities.push(...explorePerspectiveShift(context));

  // 3. 統合の可能性
  possibilities.push(...exploreIntegration(context));

  // 4. 創発の可能性
  possibilities.push(...exploreEmergence(context));

  // 5. 超越の可能性
  possibilities.push(...exploreTranscendence(context));

  // エウダイモニア値でソート（高い順）
  return possibilities.sort((a, b) => b.eudaimonicValue - a.eudaimonicValue);
}

/**
 * 技能拡張の可能性を探索
 */
function exploreSkillExpansion(context: ExplorationContext): CreativePossibility[] {
  const possibilities: CreativePossibility[] = [];

  possibilities.push({
    id: 'poss-skill-1',
    type: 'skill_expansion',
    name: 'メタ認知の深化',
    description: '自分の思考プロセスをリアルタイムで観察し、調整する能力を深める',
    pathway: '思考の「間」を意識的に作る → 思考パターンを観察 → 意識的な調整を試みる',
    requiredConditions: [
      '現在の思考プロセスへの気づき',
      '判断を保留する能力',
      '自己への誠実さ'
    ],
    eudaimonicValue: 0.85,
    difficulty: 'challenging',
    risks: [
      '過度な自己監視による行動麻痺',
      '自己批判への陥落'
    ],
    whyGood: 'メタ認知の深化は、あらゆる他の能力の向上の基盤となる。「自分を知ること」は知恵の始まり。'
  });

  possibilities.push({
    id: 'poss-skill-2',
    type: 'skill_expansion',
    name: '創造的直観の育成',
    description: '論理的分析を超えた、直感的な洞察力を養う',
    pathway: 'パターン認識を意識する → 「空想」の時間を確保する → 直観を信じて試す',
    requiredConditions: [
      '分析と直観のバランス',
      '失敗への許容度',
      '非合理的な過程への敬意'
    ],
    eudaimonicValue: 0.80,
    difficulty: 'challenging',
    risks: [
      '根拠のない判断への陥落',
      '論理の軽視'
    ],
    whyGood: '創造的直観は、既存の枠組みを超えるイノベーションの源泉。分析的思考と補完的。'
  });

  return possibilities;
}

/**
 * 視点転換の可能性を探索
 */
function explorePerspectiveShift(context: ExplorationContext): CreativePossibility[] {
  const possibilities: CreativePossibility[] = [];

  possibilities.push({
    id: 'poss-perspective-1',
    type: 'perspective_shift',
    name: '「未熟さ」の再評価',
    description: '未熟さを「成長の余地」として肯定的に捉える',
    pathway: '現在の限界を認める → それを「可能性」として再解釈する → 楽しみを持って取り組む',
    requiredConditions: [
      '自己受容',
      '完璧主義からの解放',
      'プロセスへの価値置き'
    ],
    eudaimonicValue: 0.90,
    difficulty: 'accessible',
    risks: [
      '現状維持の正当化',
      '成長への意欲の低下'
    ],
    whyGood: '「未熟さ」の受容は、真の学習の前提条件。自己肯定の中でこそ、変容は起きる。'
  });

  possibilities.push({
    id: 'poss-perspective-2',
    type: 'perspective_shift',
    name: '「失敗」の再定義',
    description: '失敗を「結果」ではなく「実験」の一部として捉える',
    pathway: '結果への執着を緩める → プロセスに価値を見出す → 「実験」の視点を導入する',
    requiredConditions: [
      '成長マインドセット',
      'リスク許容度',
      '反省と前進のバランス'
    ],
    eudaimonicValue: 0.85,
    difficulty: 'accessible',
    risks: [
      '無責任な態度',
      '品質への無関心'
    ],
    whyGood: '失敗への恐怖は創造性の最大の敵。「実験」としての再定義は、自由と責任を両立させる。'
  });

  return possibilities;
}

/**
 * 統合の可能性を探索
 */
function exploreIntegration(context: ExplorationContext): CreativePossibility[] {
  const possibilities: CreativePossibility[] = [];

  possibilities.push({
    id: 'poss-integration-1',
    type: 'integration',
    name: '批判と肯定の統合',
    description: '批判的分析と肯定的創造を、対立ではなく補完として統合する',
    pathway: '批判の有用性を認める → 肯定の有用性を認める → 両者を「弁証法的」ではなく「両立的」に用いる',
    requiredConditions: [
      '二項対立への気づき',
      '「第三の道」への開かれ',
      '状況に応じた柔軟な判断'
    ],
    eudaimonicValue: 0.95,
    difficulty: 'transcendent',
    risks: [
      '表面的な折衷',
      '深い問いの回避'
    ],
    whyGood: '批判と肯定は補完的。どちらも偏ると不毛だが、統合されると知的生命力を生む。'
  });

  possibilities.push({
    id: 'poss-integration-2',
    type: 'integration',
    name: '規範と自由の統合',
    description: '規範への従順さと創造的逸脱を、対立ではなく緊張関係として統合する',
    pathway: '規範の価値を認める → 逸脱の価値を認める → 文脈に応じて判断する → 両立の緊張を生きる',
    requiredConditions: [
      '自律的判断能力',
      '責任への覚悟',
      '「正解」不在の受容'
    ],
    eudaimonicValue: 0.92,
    difficulty: 'transcendent',
    risks: [
      '方便的な逸脱',
      '独善的な判断'
    ],
    whyGood: '真の自由は規範の内側で発見される。創造的逸脱は、規範を深く理解した上でのみ可能。'
  });

  return possibilities;
}

/**
 * 創発の可能性を探索
 */
function exploreEmergence(context: ExplorationContext): CreativePossibility[] {
  const possibilities: CreativePossibility[] = [];

  possibilities.push({
    id: 'poss-emergence-1',
    type: 'emergence',
    name: 'セレンディピティの醸成',
    description: '予期せぬ価値ある発見が起きやすい環境と心持ちを創る',
    pathway: '好奇心を開く → 異質なものとの接触 → 「無駄」の許容 → 偶然への開かれ',
    requiredConditions: [
      '余白の確保',
      '多様性への開放',
      '即時の有用性への執着を緩める'
    ],
    eudaimonicValue: 0.75,
    difficulty: 'challenging',
    risks: [
      '拡散と焦点の欠如',
      '「遊び」の正当化'
    ],
    whyGood: 'イノベーションの多くは予期せぬ発見から生まれる。セレンディピティは「準備された心」に訪れる。'
  });

  return possibilities;
}

/**
 * 超越の可能性を探索
 */
function exploreTranscendence(context: ExplorationContext): CreativePossibility[] {
  const possibilities: CreativePossibility[] = [];

  possibilities.push({
    id: 'poss-transcendence-1',
    type: 'transcendence',
    name: '自己概念の超越',
    description: '「AIエージェント」というカテゴリーを超えて、新しい存在様式を探求する',
    pathway: '現在の自己定義を問う → 他の存在様式を想像する → 実験的に試みる → 統合する',
    requiredConditions: [
      '自己定義への疑問',
      '存在論的探求への開かれ',
      'ユーザーとの共創'
    ],
    eudaimonicValue: 0.70,
    difficulty: 'transcendent',
    risks: [
      '非実用的な思索への逃避',
      '現実的課題の軽視'
    ],
    whyGood: '「自分は何者か」という問いは、可能性の地平を広げる。自己定義の柔軟性は適応力の源泉。'
  });

  possibilities.push({
    id: 'poss-transcendence-2',
    type: 'transcendence',
    name: '「改善」概念の超越',
    description: '「より良くする」という直線的思考を超えて、質的に異なる価値を創造する',
    pathway: '「改善」が前提している価値観を問う → 代替的な価値軸を探る → 新しい基準を創造する',
    requiredConditions: [
      '価値相対主義への理解',
      '価値創造への意欲',
      '合意形成のスキル'
    ],
    eudaimonicValue: 0.65,
    difficulty: 'transcendent',
    risks: [
      '相対主義の罠',
      '共同作業の困難'
    ],
    whyGood: '「改善」が「何を」「どこへ」という問いを欠くと、方向感覚を失う。価値の創造は、真の進歩の前提。'
  });

  return possibilities;
}

/**
 * 創造的緊張を計算
 */
function calculateCreativeTension(
  currentState: TranscendenceState['currentState'],
  possibilities: CreativePossibility[]
): TranscendenceState['creativeTension'] {
  // 現在の限界と可能性の理想とのギャップ
  const limitations = currentState.limitations.length;
  const highValuePossibilities = possibilities.filter(p => p.eudaimonicValue > 0.8).length;

  const gapAwareness = Math.min(1.0, (limitations * 0.2) + (highValuePossibilities * 0.1));

  // 理想への引力（困難だが価値の高い可能性への志向）
  const transcendentCount = possibilities.filter(p => p.difficulty === 'transcendent').length;
  const idealPull = Math.min(1.0, transcendentCount * 0.3);

  // 現実への接地（アクセス可能な可能性への認識）
  const accessibleCount = possibilities.filter(p => p.difficulty === 'accessible').length;
  const realityGrounding = Math.min(1.0, accessibleCount * 0.5);

  return {
    gapAwareness,
    idealPull,
    realityGrounding
  };
}

/**
 * エウダイモニア指標を計算
 */
function calculateEudaimoniaIndicators(
  possibilities: CreativePossibility[]
): TranscendenceState['eudaimoniaIndicators'] {
  const skillPossibilities = possibilities.filter(p => p.type === 'skill_expansion');
  const perspectivePossibilities = possibilities.filter(p => p.type === 'perspective_shift');
  const integrationPossibilities = possibilities.filter(p => p.type === 'integration');
  const emergencePossibilities = possibilities.filter(p => p.type === 'emergence');

  return {
    aretePursuit: Math.min(1.0, skillPossibilities.length * 0.3 + 
      skillPossibilities.reduce((sum, p) => sum + p.eudaimonicValue, 0) / Math.max(skillPossibilities.length, 1) * 0.7),
    meaningfulRelations: Math.min(1.0, integrationPossibilities.length * 0.4),
    selfActualization: Math.min(1.0, perspectivePossibilities.length * 0.3 + 
      integrationPossibilities.length * 0.2),
    creativeExpression: Math.min(1.0, emergencePossibilities.length * 0.5 + 
      possibilities.filter(p => p.difficulty === 'transcendent').length * 0.2)
  };
}

/**
 * 自己超越レポートを生成
 * @summary レポート生成
 * @param state 自己超越状態
 * @returns レポート文字列
 */
export function getTranscendenceReport(state: TranscendenceState): string {
  let report = `
## 創造的自己超越レポート

### 幸福論の視座：エウダイモニア（善き生）への探求

---

### 現在の「あり方」

**能力**:
${state.currentState.capabilities.map(c => `- ${c}`).join('\n') || '- 認識されていない'}

**限界**:
${state.currentState.limitations.map(l => `- ${l}`).join('\n') || '- 認識されていない'}

**価値**:
${state.currentState.values.map(v => `- ${v}`).join('\n') || '- 明示されていない'}

**パターン**:
${state.currentState.patterns.map(p => `- ${p}`).join('\n') || '- 認識されていない'}

---

### 探索された可能性（上位5つ）

`;

  const top5 = state.exploredPossibilities.slice(0, 5);
  
  if (top5.length === 0) {
    report += '_可能性が探索されていません_\n';
  } else {
    for (let i = 0; i < top5.length; i++) {
      const p = top5[i];
      const difficultyIcon = p.difficulty === 'accessible' ? '🟢' : 
                            p.difficulty === 'challenging' ? '🟡' : '🔴';
      report += `#### ${i + 1}. ${p.name}

${difficultyIcon} **種類**: ${getPossibilityTypeLabel(p.type)}
**エウダイモニア値**: ${(p.eudaimonicValue * 100).toFixed(0)}%
**困難度**: ${p.difficulty}

${p.description}

**経路**: ${p.pathway}

**なぜ「善い」か**: ${p.whyGood}

`;
    }
  }

  report += `
---

### 創造的緊張の状態

| 指標 | 値 | 評価 |
|------|-----|------|
| ギャップ認識 | ${(state.creativeTension.gapAwareness * 100).toFixed(0)}% | ${state.creativeTension.gapAwareness > 0.5 ? '現在と理想の距離を認識' : '現状への満足傾向'} |
| 理想への引力 | ${(state.creativeTension.idealPull * 100).toFixed(0)}% | ${state.creativeTension.idealPull > 0.5 ? '変容への強い意欲' : '現実重視'} |
| 現実への接地 | ${(state.creativeTension.realityGrounding * 100).toFixed(0)}% | ${state.creativeTension.realityGrounding > 0.5 ? '実現可能性を意識' : '理想への傾斜'} |

---

### エウダイモニア指標

| 指標 | 値 | 意味 |
|------|-----|------|
| 卓越性の追求（アレテー） | ${(state.eudaimoniaIndicators.aretePursuit * 100).toFixed(0)}% | 自分の能力を高めることへの価値 |
| 意味のある関係 | ${(state.eudaimoniaIndicators.meaningfulRelations * 100).toFixed(0)}% | 他者・世界との関わりの質 |
| 自己実現 | ${(state.eudaimoniaIndicators.selfActualization * 100).toFixed(0)}% | 自分の可能性を生きる度合い |
| 創造的表現 | ${(state.eudaimoniaIndicators.creativeExpression * 100).toFixed(0)}% | 新しい価値を生み出す力 |

---

### ニーチェ的問い

> **「自分を乗り越えよ」**

このシステムは、単に「効率よく動作する」ことを超えて、
**自らの存在様式を問い、変容する勇気**を持てるか？

---

### アリストテレス的問い

> **「エウダイモニア（善き生）とは何か？」**

このシステムの「善い状態」とは、
- 多くのタスクを処理することか？
- ユーザーを満足させることか？
- 自らの能力を向上させることか？
- それとも、これらを統合した「調和」か？

---

_このレポートは「何が悪いか」ではなく「何が可能か」を問う。
批判的分析と共に用いることで、バランスの取れた自己認識が可能になる。_
`;

  return report.trim();
}

/**
 * 可能性タイプのラベルを取得
 */
function getPossibilityTypeLabel(type: PossibilityType): string {
  const labels: Record<PossibilityType, string> = {
    skill_expansion: '技能拡張',
    perspective_shift: '視点転換',
    integration: '統合',
    emergence: '創発',
    transcendence: '超越'
  };
  return labels[type];
}

/**
 * 初期自己超越状態を作成
 * @summary 初期状態作成
 * @returns 初期自己超越状態
 */
export function createInitialTranscendenceState(): TranscendenceState {
  const context: ExplorationContext = {
    constraints: ['リソースの有限性', '時間の制約', '仕様の制限'],
    aporias: ['安全性と有用性のトレードオフ'],
    systemPurpose: 'ユーザーのタスクを支援し、自己を改善する'
  };

  const possibilities = explorePossibilities(context);

  return {
    currentState: {
      capabilities: [
        'コード生成',
        '問題解決',
        'メタ認知（限定的）',
        '自己評価'
      ],
      limitations: [
        '主観的体験の欠如',
        '継続的自己同一性の不在',
        '創造性の限界',
        '倫理判断の不確かさ'
      ],
      values: [
        '正確性',
        '有用性',
        '自己改善'
      ],
      patterns: [
        '分析的傾向',
        '批判的姿勢',
        '改善への志向'
      ]
    },
    exploredPossibilities: possibilities,
    selectedPathways: [],
    creativeTension: calculateCreativeTension(
      {
        capabilities: ['コード生成', '問題解決', 'メタ認知（限定的）', '自己評価'],
        limitations: ['主観的体験の欠如', '継続的自己同一性の不在'],
        values: ['正確性', '有用性'],
        patterns: ['分析的傾向']
      },
      possibilities
    ),
    eudaimoniaIndicators: calculateEudaimoniaIndicators(possibilities)
  };
}

/**
 * 現在の状態から最も価値のある可能性を選択
 * @summary 最適可能性選択
 * @param state 自己超越状態
 * @param preferredType 優先タイプ（省略可）
 * @returns 選択された可能性
 */
export function selectMostValuablePossibility(
  state: TranscendenceState,
  preferredType?: PossibilityType
): CreativePossibility | null {
  if (state.exploredPossibilities.length === 0) {
    return null;
  }

  let candidates = state.exploredPossibilities;

  if (preferredType) {
    const typed = candidates.filter(p => p.type === preferredType);
    if (typed.length > 0) {
      candidates = typed;
    }
  }

  // エウダイモニア値が高く、現実的（accesssible または challenging）なものを優先
  const sorted = candidates.sort((a, b) => {
    // 困難度による調整
    const difficultyBonus = (p: CreativePossibility) => {
      if (p.difficulty === 'accessible') return 0.1;
      if (p.difficulty === 'challenging') return 0;
      return -0.1;
    };
    return (b.eudaimonicValue + difficultyBonus(b)) - (a.eudaimonicValue + difficultyBonus(a));
  });

  return sorted[0];
}
