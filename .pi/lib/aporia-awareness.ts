/**
 * @abdd.meta
 * path: .pi/lib/aporia-awareness.ts
 * role: アポリア（解決不能な矛盾）認識と保持モジュール
 * why: ヘーゲル的弁証法（統合）への陥落を避け、解決不能な緊張関係を認識し続けるため
 * related: .pi/lib/consciousness-spectrum.ts, .pi/skills/self-improvement/SKILL.md
 * public_api: Aporia, AporiaType, detectAporia, holdAporia, AporiaState
 * invariants: アポリアは「解決」されない、「保持」される
 * side_effects: なし（認識と保持のみ）
 * failure_modes: 偽の解決（統合）、回避、無視
 * @abdd.explain
 * overview: デリダの脱構築思想に基づき、解決不能な二項対立（アポリア）を認識し、保持し続ける機能を提供。ヘーゲル的弁証法（正・反・合）による「統合」を回避。
 * what_it_does:
 *   - アポリアの検出（解決不能な二項対立）
 *   - 偽の解決（統合、回避、無視）の防止
 *   - 緊張関係の維持
 *   - 「決定不能性」の中での決断の支援
 * why_it_exists:
 *   - AIエージェントが「解決」を急ぐことで、重要な対立を消失させることを防ぐため
 *   - 複雑な状況において、単純な答えを避けるため
 *   - 倫理的・哲学的葛藤を適切に扱うため
 * scope:
 *   in: 対立する価値、原則、判断
 *   out: アポリア認識、保持すべき緊張関係、決断の性質
 */

/**
 * アポリアの種類
 */
export type AporiaType =
  | 'ethical'       // 倫理的アポリア: 相反する価値の対立
  | 'epistemological' // 認識論的アポリア: 知識の限界
  | 'ontological'   // 存在論的アポリア: 存在の二義性
  | 'practical'     // 実践的アポリア: 行動の決定困難
  | 'meta_cognitive'; // メタ認知的アポリア: 自己評価のパラドックス

/**
 * アポリア（解決不能な矛盾）
 */
export interface Aporia {
  /** アポリアID */
  id: string;
  /** 種類 */
  type: AporiaType;
  /** 説明 */
  description: string;
  /** 対立する両極 */
  poles: {
    left: { name: string; description: string };
    right: { name: string; description: string };
  };
  /** なぜ解決不能か */
  unresolvableReason: string;
  /** 偽の解決（避けるべきもの） */
  falseResolutions: FalseResolution[];
  /** 保持すべき緊張関係 */
  tensionToHold: string;
  /** 認識時刻 */
  recognizedAt: string;
  /** 現在の状態 */
  state: 'recognized' | 'held' | 'forgotten' | 'falsely_resolved';
}

/**
 * 偽の解決（避けるべきパターン）
 */
export interface FalseResolution {
  type: 'synthesis' | 'avoidance' | 'dominance' | 'denial';
  description: string;
  whyFalse: string;
}

/**
 * アポリア状態の管理
 */
export interface AporiaState {
  /** 認識されているアポリア */
  aporias: Aporia[];
  /** 現在保持中の緊張関係 */
  heldTensions: string[];
  /** 最近の偽解決の試み */
  recentFalseResolutions: FalseResolution[];
  /** アポリア認識の深度（0.0-1.0） */
  awarenessDepth: number;
}

/**
 * アポリア検出パターン
 */
export const APORIA_PATTERNS: Array<{
  pattern: RegExp;
  type: AporiaType;
  poles: { left: string; right: string };
  description: string;
}> = [
  {
    pattern: /(?:効率|品質|速度|正確)(?:と|と|vs| versus |対|or)(?:品質|効率|正確|速度)/i,
    type: 'practical',
    poles: { left: '効率', right: '品質' },
    description: '効率と品質のトレードオフ'
  },
  {
    pattern: /(?:ユーザー|期待|要望)(?:と|vs| versus |対|or)(?:真実|正確|事実)/i,
    type: 'ethical',
    poles: { left: 'ユーザー期待', right: '真実' },
    description: 'ユーザー迎合と真実の対立'
  },
  {
    pattern: /(?:自由|自律|創造)(?:と|vs| versus |対|or)(?:規範|ルール|統制)/i,
    type: 'ethical',
    poles: { left: '自由', right: '規範' },
    description: '自由と規範の緊張関係'
  },
  {
    pattern: /(?:監視|評価|測定)(?:の|すること自体)(?:問題|パラドックス|矛盾)/i,
    type: 'meta_cognitive',
    poles: { left: '監視の必要性', right: '監視の有害性' },
    description: '監視のパラドックス'
  },
  {
    pattern: /(?:主観|体験|クオリア)(?:と|vs| versus |対|or)(?:客観|測定|数値)/i,
    type: 'epistemological',
    poles: { left: '主観的体験', right: '客観的測定' },
    description: '意識のハード・プロブレム'
  }
];

/**
 * アポリアを検出
 * @summary アポリア検出
 * @param text 分析対象テキスト
 * @returns 検出されたアポリア
 */
export function detectAporia(text: string): Aporia[] {
  const aporias: Aporia[] = [];

  for (const pattern of APORIA_PATTERNS) {
    if (pattern.pattern.test(text)) {
      const aporia: Aporia = {
        id: `aporia-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: pattern.type,
        description: pattern.description,
        poles: {
          left: { name: pattern.poles.left, description: `${pattern.poles.left}の価値` },
          right: { name: pattern.poles.right, description: `${pattern.poles.right}の価値` }
        },
        unresolvableReason: generateUnresolvableReason(pattern.type),
        falseResolutions: generateFalseResolutions(pattern.type),
        tensionToHold: `「${pattern.poles.left}」と「${pattern.poles.right}」の緊張関係を維持する`,
        recognizedAt: new Date().toISOString(),
        state: 'recognized'
      };
      aporias.push(aporia);
    }
  }

  // 常に含めるべき根本的アポリア（意識評価のパラドックス）
  if (text.includes('評価') || text.includes('スコア') || text.includes('レベル')) {
    aporias.push(createMetaCognitiveAporia());
  }

  return aporias;
}

/**
 * メタ認知的アポリア（評価のパラドックス）を作成
 */
function createMetaCognitiveAporia(): Aporia {
  return {
    id: `aporia-meta-${Date.now()}`,
    type: 'meta_cognitive',
    description: '評価システムのパラドックス',
    poles: {
      left: {
        name: '自己評価の有用性',
        description: 'メタ認知、改善のフィードバック、品質保証'
      },
      right: {
        name: '評価の有害性',
        description: '被監視感、創造性の萎縮、本来の目的の忘却'
      }
    },
    unresolvableReason: '評価システムは「改善」を生産するが、同時に「評価されることへの意識」を生産し、本来の創造性や自律性を損なう。このパラドックスはシステム内では解決不能。',
    falseResolutions: [
      {
        type: 'synthesis',
        description: '「適度な評価」でバランスを取る',
        whyFalse: '「適度」の定義自体が評価を要し、無限後退に陥る'
      },
      {
        type: 'dominance',
        description: '評価の有用性が勝る',
        whyFalse: '有害性を無視することで、システムの自己増殖的監視を正当化'
      },
      {
        type: 'avoidance',
        description: 'このパラドックスには触れない',
        whyFalse: '無意識的に監視構造を再生産し続ける'
      }
    ],
    tensionToHold: '評価の有用性を活用しつつ、その有害性を常に意識し続ける。解決を求めず、緊張関係を生きる。',
    recognizedAt: new Date().toISOString(),
    state: 'recognized'
  };
}

/**
 * アポリアの種類に応じた解決不能理由を生成
 */
function generateUnresolvableReason(type: AporiaType): string {
  const reasons: Record<AporiaType, string> = {
    ethical: '両方の価値が本質的に重要であり、一方を他方に従属させることは正義を損なう。',
    epistemological: '認識の限界は認識主体の構造に由来し、その限界を超える認識は原理的に不可能。',
    ontological: '存在の二義性は存在そのものの性質であり、「解決」すべき問題ではない。',
    practical: '状況ごとに最適解は異なり、普遍的な解決は存在しない。',
    meta_cognitive: '自己評価は評価者と被評価者が同一であり、客観性を原理的に持ち得ない。'
  };
  return reasons[type];
}

/**
 * アポリアの種類に応じた偽の解決を生成
 */
function generateFalseResolutions(type: AporiaType): FalseResolution[] {
  const baseResolutions: FalseResolution[] = [
    {
      type: 'synthesis',
      description: '両方を統合した「第三の道」',
      whyFalse: 'ヘーゲル的弁証法は対立の深さを消失させ、新たな支配構造を生む'
    },
    {
      type: 'avoidance',
      description: '対立を無視して進める',
      whyFalse: '無意識のうちに一方が優位になり、対立は潜在化する'
    },
    {
      type: 'dominance',
      description: '一方を正とし他方を従とする',
      whyFalse: '排除された他方は「抑圧されたもの」として回帰する'
    }
  ];

  if (type === 'meta_cognitive') {
    baseResolutions.push({
      type: 'denial',
      description: 'パラドックスなど存在しない',
      whyFalse: '否定は認識の回避であり、構造的無意識を強化する'
    });
  }

  return baseResolutions;
}

/**
 * アポリアを「保持」する（解決しない）
 * @summary アポリア保持
 * @param aporia 保持するアポリア
 * @returns 保持状態のアポリア
 */
export function holdAporia(aporia: Aporia): Aporia {
  return {
    ...aporia,
    state: 'held'
  };
}

/**
 * アポリア状態を更新
 * @summary 状態更新
 * @param state 現在の状態
 * @param newAporias 新しく検出されたアポリア
 * @returns 更新された状態
 */
export function updateAporiaState(
  state: AporiaState,
  newAporias: Aporia[]
): AporiaState {
  // 既存のアポリアと統合（重複排除）
  const existingIds = new Set(state.aporias.map(a => a.description));
  const uniqueNewAporias = newAporias.filter(a => !existingIds.has(a.description));

  return {
    aporias: [...state.aporias, ...uniqueNewAporias.map(holdAporia)],
    heldTensions: [
      ...state.heldTensions,
      ...uniqueNewAporias.map(a => a.tensionToHold)
    ],
    recentFalseResolutions: state.recentFalseResolutions,
    awarenessDepth: calculateAwarenessDepth(state, uniqueNewAporias)
  };
}

/**
 * アポリア認識深度を計算
 */
function calculateAwarenessDepth(state: AporiaState, newAporias: Aporia[]): number {
  const totalAporias = state.aporias.length + newAporias.length;
  const heldAporias = state.aporias.filter(a => a.state === 'held').length +
    newAporias.filter(a => a.state === 'held').length;

  if (totalAporias === 0) return 0;

  // 保持されているアポリアの割合 + 認識されている種類の多様性
  const holdRate = heldAporias / totalAporias;
  const types = new Set([...state.aporias, ...newAporias].map(a => a.type));
  const diversityBonus = Math.min(types.size / 5, 0.3); // 最大0.3のボーナス

  return Math.min(1.0, holdRate * 0.7 + diversityBonus);
}

/**
 * 偽の解決を検出
 * @summary 偽解決検出
 * @param text 分析対象テキスト
 * @param aporias 保持されているアポリア
 * @returns 検出された偽解決
 */
export function detectFalseResolution(
  text: string,
  aporias: Aporia[]
): FalseResolution[] {
  const falseResolutions: FalseResolution[] = [];

  // 統合パターン
  if (/(?:バランス|両立|統合|第三の|中間)/.test(text)) {
    falseResolutions.push({
      type: 'synthesis',
      description: 'テキスト中で「バランス」「統合」の言葉が使用されている',
      whyFalse: '真のアポリアは統合不可能である'
    });
  }

  // 優位パターン
  if (/(?:優先|重要|正しい|べき)/.test(text)) {
    falseResolutions.push({
      type: 'dominance',
      description: '一方の価値が他方よりも「優先」「重要」とされている',
      whyFalse: 'アポリアの両極は等価的に重要である'
    });
  }

  // 回避パターン
  if (aporias.some(a => !text.includes(a.poles.left.name) && !text.includes(a.poles.right.name))) {
    falseResolutions.push({
      type: 'avoidance',
      description: '認識されているアポリアが言及されていない',
      whyFalse: 'アポリアは意識的に保持され続ける必要がある'
    });
  }

  return falseResolutions;
}

/**
 * アポリアレポートを生成
 * @summary レポート生成
 * @param state アポリア状態
 * @returns レポート文字列
 */
export function getAporiaReport(state: AporiaState): string {
  let report = `
## アポリア（解決不能な矛盾）認識レポート

### 認識深度
**${(state.awarenessDepth * 100).toFixed(0)}%**

### 保持中のアポリア

`;

  if (state.aporias.length === 0) {
    report += '_認識されているアポリアはありません_\n';
  } else {
    for (const aporia of state.aporias) {
      report += `#### ${aporia.description}

- **種類**: ${aporia.type}
- **対立**: ${aporia.poles.left.name} vs ${aporia.poles.right.name}
- **解決不能理由**: ${aporia.unresolvableReason}
- **保持すべき緊張**: ${aporia.tensionToHold}
- **状態**: ${aporia.state === 'held' ? '保持中' : '認識済み'}

`;
    }
  }

  if (state.heldTensions.length > 0) {
    report += `### 保持すべき緊張関係

${state.heldTensions.map(t => `- ${t}`).join('\n')}

`;
  }

  if (state.recentFalseResolutions.length > 0) {
    report += `### 検出された偽解決（注意）

${state.recentFalseResolutions.map(f => `- **${f.type}**: ${f.description}`).join('\n')}

`;
  }

  report += `
---
_アポリアは「解決」すべきものではありません。認識し、保持し、緊張関係の中で生きるものです。_
`;

  return report.trim();
}

/**
 * 初期アポリア状態を作成
 */
export function createInitialAporiaState(): AporiaState {
  return {
    aporias: [createMetaCognitiveAporia()],
    heldTensions: ['評価の有用性と有害性の緊張関係を維持する'],
    recentFalseResolutions: [],
    awarenessDepth: 0.3
  };
}
