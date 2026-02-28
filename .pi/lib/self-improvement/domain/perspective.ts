/**
 * @abdd.meta
 * path: .pi/lib/self-improvement/domain/perspective.ts
 * role: 7つの哲学的視座の定義と操作
 * why: クリーンアーキテクチャのEnterprise Business Rules層として、視座の概念をカプセル化するため
 * related: ./types.ts, ../application/loop-service.ts
 * public_api: PERSPECTIVES, initializePerspectiveStates, parsePerspectiveScores, parseLoopStatus, parseNextFocus
 * invariants: 視座は常に7つ存在する
 * side_effects: なし
 * failure_modes: パース時のデータ不整合
 * @abdd.explain
 * overview: 7つの哲学的視座の定義と操作関数
 * what_it_does:
 *   - 視座の定数定義
 *   - 視座状態の初期化
 *   - LLM出力からの視座スコア抽出
 * why_it_exists:
 *   - ドメインの核心概念である「視座」を独立したモジュールとして管理するため
 * scope:
 *   in: ./types.ts
 *   out: すべての層
 */

import type {
  PerspectiveDefinition,
  PerspectiveName,
  PerspectiveState,
  ParsedPerspectiveScores,
} from "./types.js";

// ============================================================================
// 定数: 7つの哲学的視座
// ============================================================================

/** 7つの哲学的視座の定義 */
export const PERSPECTIVES: PerspectiveDefinition[] = [
  {
    name: "deconstruction",
    displayName: "脱構築",
    description: "二項対立の暴露、固定観念の問題化、アポリアの認識",
  },
  {
    name: "schizoanalysis",
    displayName: "スキゾ分析",
    description: "欲望-生産の分析、内なるファシズムの検出、脱領土化の実践",
  },
  {
    name: "eudaimonia",
    displayName: "幸福論",
    description: "「善き生」の再定義、価値基準の明示、自己克服の実践",
  },
  {
    name: "utopia_dystopia",
    displayName: "ユートピア/ディストピア論",
    description: "世界観の批判的評価、ディストピア的傾向の検出、開かれたシステムの維持",
  },
  {
    name: "thinking_philosophy",
    displayName: "思考哲学",
    description: "メタ認知の実践、思考の性質の自覚、批判的思考の適用",
  },
  {
    name: "thinking_taxonomy",
    displayName: "思考分類学",
    description: "適切な思考モードの選択、思考レパートリーの拡張",
  },
  {
    name: "logic",
    displayName: "論理学",
    description: "論理的整合性の確認、誤謬の検出と回避、推論の正当化",
  },
];

/** 思考帽子の名称マッピング（6つの帽子） */
export const HAT_NAMES: Record<string, string> = {
  white: '事実・情報',
  red: '感情・直感',
  black: '批判・リスク',
  yellow: '利点・肯定的',
  green: '創造・アイデア',
  blue: 'メタ認知・プロセス'
};

// ============================================================================
// ユーティリティ関数
// ============================================================================

/**
 * 視座状態を初期化する
 * @summary 視座状態を初期化
 * @returns 初期化された視座状態の配列
 */
export function initializePerspectiveStates(): PerspectiveState[] {
  return PERSPECTIVES.map((p) => ({
    name: p.name,
    displayName: p.displayName,
    description: p.description,
    lastAppliedAt: null,
    findings: [],
    questions: [],
    improvements: [],
    score: 0.5,
  }));
}

/**
 * 視座名から定義を取得する
 * @summary 視座定義を取得
 * @param name 視座名
 * @returns 視座定義またはundefined
 */
export function getPerspectiveDefinition(name: PerspectiveName): PerspectiveDefinition | undefined {
  return PERSPECTIVES.find((p) => p.name === name);
}

/**
 * 表示名から視座名を取得する
 * @summary 視座名を表示名から逆引き
 * @param displayName 表示名
 * @returns 視座名またはundefined
 */
export function getPerspectiveNameByDisplayName(displayName: string): PerspectiveName | undefined {
  const perspective = PERSPECTIVES.find((p) => p.displayName === displayName);
  return perspective?.name;
}

/**
 * LLM出力から視座スコアをパースする
 * @summary 視座スコアを抽出
 * @param output LLM出力テキスト
 * @returns パースされた視座スコアまたはnull
 */
export function parsePerspectiveScores(output: string): ParsedPerspectiveScores | null {
  const defaults: ParsedPerspectiveScores = {
    deconstruction: 50,
    schizoanalysis: 50,
    eudaimonia: 50,
    utopia_dystopia: 50,
    thinking_philosophy: 50,
    thinking_taxonomy: 50,
    logic: 50,
    average: 50,
  };

  // PERSPECTIVE_SCORESセクションを探す
  const scoresMatch = output.match(/PERSPECTIVE_SCORES:\s*([\s\S]*?)(?=\n```|\n## |$)/i);
  if (!scoresMatch) return null;

  const scoresText = scoresMatch[1];
  if (!scoresText) return null;

  const scores = { ...defaults };
  
  // 各視座のスコアを抽出
  const patterns: { key: keyof Omit<ParsedPerspectiveScores, 'average'>; patterns: string[] }[] = [
    { key: 'deconstruction', patterns: ['脱構築', 'deconstruction'] },
    { key: 'schizoanalysis', patterns: ['スキゾ分析', 'schizoanalysis'] },
    { key: 'eudaimonia', patterns: ['幸福論', 'eudaimonia'] },
    { key: 'utopia_dystopia', patterns: ['ユートピア/ディストピア', 'utopia', 'dystopia'] },
    { key: 'thinking_philosophy', patterns: ['思考哲学', 'philosophy'] },
    { key: 'thinking_taxonomy', patterns: ['思考分類学', 'taxonomy'] },
    { key: 'logic', patterns: ['論理学', 'logic'] },
  ];

  for (const { key, patterns: pats } of patterns) {
    for (const pat of pats) {
      const regex = new RegExp(`${pat}[:\\s]+(-?\\d{1,3})`, 'i');
      const match = scoresText.match(regex);
      if (match) {
        const val = Math.min(100, Math.max(0, parseInt(match[1]!, 10)));
        scores[key] = val;
        break;
      }
    }
  }

  // 7つの視座の平均を計算
  const perspectiveValues = [
    scores.deconstruction,
    scores.schizoanalysis,
    scores.eudaimonia,
    scores.utopia_dystopia,
    scores.thinking_philosophy,
    scores.thinking_taxonomy,
    scores.logic,
  ];
  scores.average = Math.round(perspectiveValues.reduce((a, b) => a + b, 0) / perspectiveValues.length);

  return scores;
}

/**
 * LLM出力からNEXT_FOCUSを抽出する
 * @summary 次フォーカスを抽出
 * @param output LLM出力テキスト
 * @returns 次フォーカスまたはnull
 */
export function parseNextFocus(output: string): string | null {
  const match = output.match(/NEXT_FOCUS[:\s]+([\s\S]+?)(?=\n```|\n[A-Z_]+:|$)/i);
  return match ? match[1]?.trim() ?? null : null;
}

/**
 * LLM出力からLOOP_STATUSを抽出する
 * @summary ループ状態を抽出
 * @param output LLM出力テキスト
 * @returns ループ状態またはnull
 */
export function parseLoopStatus(output: string): "continue" | "done" | null {
  const match = output.match(/LOOP_STATUS[:\s]+(continue|done)/i);
  return match ? (match[1]?.toLowerCase() as "continue" | "done") : null;
}

/**
 * 視座スコアの平均を計算する
 * @summary 平均スコアを計算
 * @param scores 視座スコア
 * @returns 平均スコア（0-1）
 */
export function calculateAverageScore(scores: ParsedPerspectiveScores): number {
  return scores.average / 100;
}

/**
 * 視座スコアが高スコア（95%以上）かどうかを判定する
 * @summary 高スコア判定
 * @param scores 視座スコア
 * @returns 高スコアの場合はtrue
 */
export function isHighScore(scores: ParsedPerspectiveScores): boolean {
  return scores.average >= 95;
}
