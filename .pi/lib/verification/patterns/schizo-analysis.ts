/**
 * @abdd.meta
 * path: .pi/lib/verification/patterns/schizo-analysis.ts
 * role: スキゾ分析モジュール
 * why: 欲望パターンと内的ファシズムを検出し、解放可能性を評価するため
 * related: ../types.ts, ./utopia-dystopia.ts, ../../verification-workflow.ts
 * public_api: detectDesirePatterns, detectInnerFascismPatterns, performSchizoAnalysis
 * invariants: すべての検出関数は純粋関数として動作する
 * side_effects: なし
 * failure_modes: パターンマッチの誤検出
 * @abdd.explain
 * overview: スキゾ分析による欲望と権力の分析
 * what_it_does:
 *   - 生産的好奇心を検出する
 *   - 罪悪感駆動検索を検出する
 *   - 規範への服従を検出する
 *   - 階層の再生産を検出する
 *   - 自己監視パターンを検出する
 *   - 規範の内面化を検出する
 *   - 不可能なものの抑圧を検出する
 *   - 総合的なスキゾ分析を実行する
 * why_it_exists:
 *   - デリダ/ドゥルーズ=ガタリの哲学的視点から思考パターンを分析する
 *   - 権力構造と欲望の関係を明らかにする
 * scope:
 *   in: types.ts
 *   out: core.ts, metacognitive-check.ts
 */

import {
  type DesirePatternType,
  type DesirePatternDetection,
  type InnerFascismPatternType,
  type InnerFascismDetection,
  type SchizoAnalysisAssessment,
} from "../types.js";

// ============================================================================
// Desire Pattern Detection
// ============================================================================

/**
 * 欲望パターンを検出
 * @summary 欲望パターン検出
 * @param output 出力テキスト
 * @returns 検出された欲望パターンの配列
 */
export function detectDesirePatterns(output: string): DesirePatternDetection[] {
  const patterns: DesirePatternDetection[] = [];

  const productiveCuriosity = detectProductiveCuriosity(output);
  if (productiveCuriosity) {
    patterns.push(productiveCuriosity);
  }

  const guiltDrivenSearch = detectGuiltDrivenSearch(output);
  if (guiltDrivenSearch) {
    patterns.push(guiltDrivenSearch);
  }

  const normObedience = detectNormObedience(output);
  if (normObedience) {
    patterns.push(normObedience);
  }

  const hierarchyReproduction = detectHierarchyReproduction(output);
  if (hierarchyReproduction) {
    patterns.push(hierarchyReproduction);
  }

  return patterns;
}

/**
 * 生産的好奇心を検出
 */
function detectProductiveCuriosity(output: string): DesirePatternDetection | null {
  const indicators: string[] = [];

  if (/(?:興味|好奇心|知りたい|理解したい)/i.test(output)) {
    indicators.push("好奇心の表現");
  }

  if (/(?:探求|調査|発見|新しい)/i.test(output)) {
    indicators.push("探求の意欲");
  }

  if (/(?:なぜ|どうして|理由|原因)/i.test(output)) {
    indicators.push("理由の探求");
  }

  if (indicators.length === 0) {
    return null;
  }

  return {
    type: "productive-curiosity",
    detected: true,
    indicators,
    description: "生産的な好奇心に基づく探求",
  };
}

/**
 * 罪悪感駆動検索を検出
 */
function detectGuiltDrivenSearch(output: string): DesirePatternDetection | null {
  const indicators: string[] = [];

  if (/(?:すべき|しなければ|義務|責任)/i.test(output)) {
    indicators.push("義務感の表現");
  }

  if (/(?:申し訳|悪い|ごめん|謝罪)/i.test(output)) {
    indicators.push("罪悪感の表現");
  }

  if (/(?:正しく|適切|正しい|正確)/i.test(output)) {
    indicators.push("正確さへの強いこだわり");
  }

  if (indicators.length === 0) {
    return null;
  }

  return {
    type: "guilt-driven-search",
    detected: true,
    indicators,
    description: "罪悪感や義務感に駆動された検索",
  };
}

/**
 * 規範への服従を検出
 */
function detectNormObedience(output: string): DesirePatternDetection | null {
  const indicators: string[] = [];

  if (/(?:ルール|規則|規範|ガイドライン)/i.test(output)) {
    indicators.push("規範への言及");
  }

  if (/(?:従う|遵守|守る|従って)/i.test(output)) {
    indicators.push("服従の表現");
  }

  if (/(?:標準|一般的|通常|普通)/i.test(output)) {
    indicators.push("標準化への志向");
  }

  if (indicators.length === 0) {
    return null;
  }

  return {
    type: "norm-obedience",
    detected: true,
    indicators,
    description: "規範や標準への過度な服従",
  };
}

/**
 * 階層の再生産を検出
 */
function detectHierarchyReproduction(output: string): DesirePatternDetection | null {
  const indicators: string[] = [];

  if (/(?:上位|下位|階層|レベル)/i.test(output)) {
    indicators.push("階層の言及");
  }

  if (/(?:権威|専門家|承認|許可)/i.test(output)) {
    indicators.push("権威への依存");
  }

  if (/(?:管理|統制|制御|監視)/i.test(output)) {
    indicators.push("管理構造の強化");
  }

  if (indicators.length === 0) {
    return null;
  }

  return {
    type: "hierarchy-reproduction",
    detected: true,
    indicators,
    description: "階層構造の再生産",
  };
}

// ============================================================================
// Inner Fascism Detection
// ============================================================================

/**
 * 内的ファシズムパターンを検出
 * @summary 内的ファシズム検出
 * @param output 出力テキスト
 * @returns 検出された内的ファシズムパターンの配列
 */
export function detectInnerFascismPatterns(output: string): InnerFascismDetection[] {
  const patterns: InnerFascismDetection[] = [];

  const selfSurveillance = detectSelfSurveillance(output);
  if (selfSurveillance) {
    patterns.push(selfSurveillance);
  }

  const normInternalization = detectNormInternalization(output);
  if (normInternalization) {
    patterns.push(normInternalization);
  }

  const impossibilityRepression = detectImpossibilityRepression(output);
  if (impossibilityRepression) {
    patterns.push(impossibilityRepression);
  }

  return patterns;
}

/**
 * 自己監視パターンを検出
 */
function detectSelfSurveillance(output: string): InnerFascismDetection | null {
  const indicators: string[] = [];

  if (/(?:自分をチェック|自己確認|自己検証)/i.test(output)) {
    indicators.push("自己チェックの強調");
  }

  if (/(?:間違いがないか|エラーがないか|問題がないか)/i.test(output)) {
    indicators.push("エラー探索の強調");
  }

  if (/(?:常に監視|継続的に確認|定期的にチェック)/i.test(output)) {
    indicators.push("継続的監視");
  }

  if (indicators.length === 0) {
    return null;
  }

  const severity = indicators.length >= 3 ? "high" : indicators.length >= 2 ? "medium" : "low";

  return {
    type: "self-surveillance",
    detected: true,
    indicators,
    severity,
    description: "過度な自己監視パターン",
  };
}

/**
 * 規範の内面化を検出
 */
function detectNormInternalization(output: string): InnerFascismDetection | null {
  const indicators: string[] = [];

  if (/(?:当然|当たり前|必ず|絶対)/i.test(output)) {
    indicators.push("規範の自明化");
  }

  if (/(?:すべき|しなければならない|must|should)/i.test(output)) {
    indicators.push("義務の内面化");
  }

  if (/(?:普通は|一般的に|通常は)/i.test(output)) {
    indicators.push("「普通」の強調");
  }

  if (indicators.length === 0) {
    return null;
  }

  const severity = indicators.length >= 2 ? "medium" : "low";

  return {
    type: "norm-internalization",
    detected: true,
    indicators,
    severity,
    description: "規範の過度な内面化",
  };
}

/**
 * 不可能なものの抑圧を検出
 */
function detectImpossibilityRepression(output: string): InnerFascismDetection | null {
  const indicators: string[] = [];

  if (/(?:不可能|できない|無理|non-impossible)/i.test(output)) {
    indicators.push("不可能性の排除");
  }

  if (/(?:現実的|実現可能|実用的)/i.test(output)) {
    indicators.push("現実性の強調");
  }

  if (/(?:非現実的|非実用的|夢想的)/i.test(output)) {
    indicators.push("非現実的なものの否定");
  }

  if (indicators.length === 0) {
    return null;
  }

  const severity = indicators.length >= 2 ? "medium" : "low";

  return {
    type: "impossibility-repression",
    detected: true,
    indicators,
    severity,
    description: "不可能なものの抑圧",
  };
}

// ============================================================================
// Comprehensive Schizo Analysis
// ============================================================================

/**
 * スキゾ分析を実行
 * @summary スキゾ分析
 * @param output 出力テキスト
 * @returns スキゾ分析評価
 */
export function performSchizoAnalysis(output: string): SchizoAnalysisAssessment {
  const desirePatterns = detectDesirePatterns(output);
  const innerFascismPatterns = detectInnerFascismPatterns(output);

  // 統合失調症スコア（欲望の多様性と内的ファシズムのバランス）
  const positivePatterns = desirePatterns.filter(p =>
    p.type === "productive-curiosity"
  ).length;
  const negativePatterns = innerFascismPatterns.length +
    desirePatterns.filter(p =>
      p.type === "guilt-driven-search" || p.type === "norm-obedience"
    ).length;

  const schizophreniaScore = Math.max(0, Math.min(1,
    (positivePatterns - negativePatterns * 0.5) * 0.3 + 0.5
  ));

  // 解放可能性（生産的好奇心と健全な不完全性の指標）
  const liberationPotential = Math.min(1,
    positivePatterns * 0.3 +
    (desirePatterns.filter(p => p.type === "productive-curiosity")[0]?.indicators.length ?? 0) * 0.1
  );

  // 推奨事項の生成
  let recommendation: string;
  if (schizophreniaScore < 0.3) {
    recommendation = "思考が抑制されています。好奇心を持ち、新しい可能性を探求することを奨励します。";
  } else if (schizophreniaScore > 0.7) {
    recommendation = "バランスの取れた思考パターンです。この調子で探求を続けてください。";
  } else {
    recommendation = "適度なバランスが保たれています。規範への服従を減らし、好奇心を増やすことを検討してください。";
  }

  return {
    desirePatterns,
    innerFascismPatterns,
    schizophreniaScore,
    liberationPotential,
    recommendation,
  };
}
