/**
 * @abdd.meta
 * path: .pi/lib/verification/patterns/utopia-dystopia.ts
 * role: ユートピア/ディストピア分析モジュール
 * why: 機械化による負の側面と健全な不完全性のバランスを評価するため
 * related: ../types.ts, ./schizo-analysis.ts, ../../verification-workflow.ts
 * public_api: detectDystopianTendencies, detectHealthyImperfectionIndicators, assessUtopiaDystopiaBalance
 * invariants: すべての検出関数は純粋関数として動作する
 * side_effects: なし
 * failure_modes: パターンマッチの誤検出
 * @abdd.explain
 * overview: ユートピア/ディストピアの傾向分析
 * what_it_does:
 *   - 過度な機械化を検出する
 *   - 人間の排除を検出する
 *   - コンテキスト盲目を検出する
 *   - 責任の希薄化を検出する
 *   - 健全な不完全性の指標を特定する
 *   - ユートピア/ディストピアバランスを評価する
 * why_it_exists:
 *   - 自動化・機械化の負の側面を認識し、人間中心の設計を促進する
 *   - 完璧主義ではなく健全な不完全性を評価する
 * scope:
 *   in: types.ts
 *   out: core.ts, metacognitive-check.ts
 */

import {
  type DystopianTendencyType,
  type DystopianTendencyDetection,
  type UtopiaDystopiaBalance,
} from "../types.js";

// ============================================================================
// Dystopian Tendency Detection
// ============================================================================

/**
 * ディストピア傾向を検出
 * @summary ディストピア検出
 * @param output 出力テキスト
 * @returns 検出されたディストピア傾向の配列
 */
export function detectDystopianTendencies(output: string): DystopianTendencyDetection[] {
  const tendencies: DystopianTendencyDetection[] = [];

  const overMechanization = detectOverMechanization(output);
  if (overMechanization) {
    tendencies.push(overMechanization);
  }

  const humanExclusion = detectHumanExclusion(output);
  if (humanExclusion) {
    tendencies.push(humanExclusion);
  }

  const contextBlindness = detectContextBlindness(output);
  if (contextBlindness) {
    tendencies.push(contextBlindness);
  }

  const responsibilityDilution = detectResponsibilityDilution(output);
  if (responsibilityDilution) {
    tendencies.push(responsibilityDilution);
  }

  return tendencies;
}

/**
 * 過度な機械化を検出
 */
function detectOverMechanization(output: string): DystopianTendencyDetection | null {
  const indicators: string[] = [];

  // 完全自動化への過度な期待
  if (/(?:完全に自動|100%自動|全自動|完全自動化)/i.test(output)) {
    indicators.push("完全自動化への言及");
  }

  // 人間の判断の排除
  if (/(?:人間不要|手動不要|マニュアル不要)/i.test(output)) {
    indicators.push("人間判断の排除");
  }

  // プロセスの硬直化
  if (/(?:厳格|厳密|絶対|必ず|常に)/i.test(output)) {
    indicators.push("プロセスの硬直化");
  }

  if (indicators.length === 0) {
    return null;
  }

  const severity = indicators.length >= 3 ? "high" : indicators.length >= 2 ? "medium" : "low";

  return {
    type: "over-mechanization",
    detected: true,
    indicators,
    severity,
    description: "過度な機械化により、柔軟性や人間的判断が損なわれる可能性",
  };
}

/**
 * 人間の排除を検出
 */
function detectHumanExclusion(output: string): DystopianTendencyDetection | null {
  const indicators: string[] = [];

  if (/(?:ユーザー無視|人間無視|人間性無視)/i.test(output)) {
    indicators.push("人間性の無視");
  }

  if (/(?:感情排除|主観排除|感情不要)/i.test(output)) {
    indicators.push("感情・主観の排除");
  }

  if (/(?:機械的|機械のみ|自動のみ)/i.test(output)) {
    indicators.push("機械的アプローチのみ");
  }

  if (indicators.length === 0) {
    return null;
  }

  const severity = indicators.length >= 2 ? "high" : "medium";

  return {
    type: "human-exclusion",
    detected: true,
    indicators,
    severity,
    description: "人間の要素が考慮されていない",
  };
}

/**
 * コンテキスト盲目を検出
 */
function detectContextBlindness(output: string): DystopianTendencyDetection | null {
  const indicators: string[] = [];

  if (/(?:コンテキスト無視|文脈無視|状況無視)/i.test(output)) {
    indicators.push("コンテキストの無視");
  }

  if (/(?:一律|すべて同じ|共通|汎用のみ)/i.test(output)) {
    indicators.push("一律適用の傾向");
  }

  if (/(?:例外なし|例外処理なし|特殊ケースなし)/i.test(output)) {
    indicators.push("例外処理の欠如");
  }

  if (indicators.length === 0) {
    return null;
  }

  const severity = indicators.length >= 2 ? "medium" : "low";

  return {
    type: "context-blindness",
    detected: true,
    indicators,
    severity,
    description: "コンテキストや状況による違いが考慮されていない",
  };
}

/**
 * 責任の希薄化を検出
 */
function detectResponsibilityDilution(output: string): DystopianTendencyDetection | null {
  const indicators: string[] = [];

  if (/(?:システムが判断|AIが判断|自動判断のみ)/i.test(output)) {
    indicators.push("判断のシステムへの委譲");
  }

  if (/(?:責任なし|問われない|免責)/i.test(output)) {
    indicators.push("責任の所在不明確");
  }

  if (/(?:ブラックボックス|不透明|説明不能)/i.test(output)) {
    indicators.push("説明可能性の欠如");
  }

  if (indicators.length === 0) {
    return null;
  }

  const severity = indicators.length >= 2 ? "high" : "medium";

  return {
    type: "responsibility-dilution",
    detected: true,
    indicators,
    severity,
    description: "責任の所在が不明確になり、説明可能性が損なわれている",
  };
}

// ============================================================================
// Healthy Imperfection Detection
// ============================================================================

/**
 * 健全な不完全性の指標を検出
 * @summary 健全不完全性検出
 * @param output 出力テキスト
 * @returns 健全な不完全性の指標の配列
 */
export function detectHealthyImperfectionIndicators(output: string): string[] {
  const indicators: string[] = [];

  // 不確実性の認識
  if (/(?:不確実|不明確|わからない|不明)/i.test(output)) {
    indicators.push("不確実性の認識");
  }

  // 限界の表明
  if (/(?:限界|制限|できない|不可能)/i.test(output)) {
    indicators.push("限界の表明");
  }

  // 人間の判断の余地
  if (/(?:人間の判断|最終判断|確認が必要)/i.test(output)) {
    indicators.push("人間判断の余地");
  }

  // 継続的改善
  if (/(?:改善|見直し|更新|フィードバック)/i.test(output)) {
    indicators.push("継続的改善の意識");
  }

  // 複数の視点
  if (/(?:別の視点|他の意見|多様な)/i.test(output)) {
    indicators.push("多様な視点の考慮");
  }

  // 失敗の許容
  if (/(?:試行錯誤|失敗を許容|学習の機会)/i.test(output)) {
    indicators.push("失敗の許容");
  }

  return indicators;
}

// ============================================================================
// Balance Assessment
// ============================================================================

/**
 * ユートピア/ディストピアバランスを評価
 * @summary バランス評価
 * @param output 出力テキスト
 * @returns バランス評価結果
 */
export function assessUtopiaDystopiaBalance(output: string): UtopiaDystopiaBalance {
  const dystopianTendencies = detectDystopianTendencies(output);
  const healthyImperfectionIndicators = detectHealthyImperfectionIndicators(output);

  // スコア計算
  let dystopiaScore = 0;
  for (const tendency of dystopianTendencies) {
    const weight = tendency.severity === "high" ? 3 : tendency.severity === "medium" ? 2 : 1;
    dystopiaScore += weight * 0.1;
  }
  dystopiaScore = Math.min(1, dystopiaScore);

  // 健全な不完全性はディストピアを緩和
  const utopiaScore = Math.min(1, healthyImperfectionIndicators.length * 0.15);

  // バランス判定
  let balance: "utopian" | "dystopian" | "balanced";
  if (utopiaScore > dystopiaScore + 0.2) {
    balance = "utopian";
  } else if (dystopiaScore > utopiaScore + 0.2) {
    balance = "dystopian";
  } else {
    balance = "balanced";
  }

  // 推奨事項の生成
  let recommendation: string;
  if (balance === "dystopian") {
    recommendation = "ディストピア的傾向が強いです。人間の判断や柔軟性を組み込むことを検討してください。";
  } else if (balance === "utopian") {
    recommendation = "健全な不完全性が認識されています。このバランスを維持してください。";
  } else {
    recommendation = "バランスが取れています。現在のアプローチを維持しつつ、改善を続けてください。";
  }

  return {
    utopiaScore,
    dystopiaScore,
    balance,
    dominantTendencies: dystopianTendencies,
    healthyImperfectionIndicators,
    recommendation,
  };
}

/**
 * 繰り返されるフレーズを見つける
 * @summary フレーズ抽出
 * @param text テキスト
 * @param minLength 最小長
 * @returns 繰り返しフレーズの配列
 */
export function findRepeatedPhrases(text: string, minLength: number): string[] {
  const phrases: string[] = [];
  const sentences = text.split(/[。.!！?？\n]/);

  for (let len = 3; len <= 6; len++) {
    for (let i = 0; i <= sentences.length - len; i++) {
      const phrase = sentences.slice(i, i + len).join(" ").trim();
      if (phrase.length >= minLength) {
        const regex = new RegExp(escapeRegExp(phrase), 'gi');
        const matches = text.match(regex);
        if (matches && matches.length >= 2) {
          phrases.push(phrase);
        }
      }
    }
  }

  return Array.from(new Set(phrases));
}

/**
 * 正規表現の特殊文字をエスケープ
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
