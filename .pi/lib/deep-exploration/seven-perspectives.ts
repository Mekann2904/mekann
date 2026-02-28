/**
 * @abdd.meta
 * path: .pi/lib/deep-exploration/seven-perspectives.ts
 * role: 7つの視座からの分析の実装
 * why: 構造化出力パーサーを使用した多角的分析を行うため
 * related: ./types.ts, ./core.ts, ../structured-analysis-output.ts
 * public_api: performSevenPerspectivesAnalysis
 * invariants: なし
 * side_effects: なし
 * failure_modes:
 *   - JSONパース失敗時にフォールバック分析を使用
 * @abdd.explain
 * overview: 7つの哲学的視座からコンテンツを分析する機能
 * what_it_does:
 *   - 脱構築、スキゾ分析、エウダイモニアなど7つの視座から分析
 *   - 構造化出力パーサーを優先使用
 *   - フォールバックとしてレガシー分析を提供
 * why_it_exists: 単一の視点では見逃される可能性のある側面を包括的に分析するため
 * scope:
 *   in: 分析対象コンテンツ、コンテキスト
 *   out: SevenPerspectivesAnalysis
 */

import type {
  SevenPerspectivesAnalysis,
  DeconstructionAnalysis,
  SchizoAnalysisResult,
  EudaimoniaEvaluation,
  UtopiaDystopiaAnalysis,
  ThinkingAnalysis,
  TaxonomyResult,
  LogicAnalysis,
} from './types.js';
import {
  parseAnalysisJson,
  DEFAULT_ANALYSIS,
  excellencePursuitToLabel,
  meaningfulGrowthToLabel,
  worldCreatedToLabel,
  thinkingModeToLabel,
} from '../structured-analysis-output.js';

// ============================================================================
// レガシー分析関数（フォールバック用）
// ============================================================================

/**
 * 二項対立を検出（レガシー）
 */
function detectBinaryOppositionsLegacy(content: string): string[] {
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

/**
 * 除外されている側面を検出（レガシー）
 */
function detectExclusionsLegacy(content: string): string[] {
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

/**
 * 欲望生産を検出（レガシー）
 */
function detectDesireProductionsLegacy(content: string): string[] {
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

/**
 * 内なるファシズムの兆候を検出（レガシー）
 */
function detectInnerFascismSignsLegacy(content: string): string[] {
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

/**
 * 卓越性の追求を評価（レガシー）
 */
function evaluateExcellencePursuitLegacy(content: string): string {
  if (content.includes('品質') || content.includes('正確')) {
    return '品質と正確性の卓越性を追求';
  }
  if (content.includes('効率') || content.includes('最適')) {
    return '効率と最適化の卓越性を追求';
  }
  return 'タスク完了の卓越性を追求';
}

/**
 * 快楽の罠を検出（レガシー）
 */
function detectPleasureTrapLegacy(content: string): boolean {
  const pleasureIndicators = ['簡単', '楽', 'すぐ', '手軽', '便利'];
  return pleasureIndicators.some((i) => content.includes(i));
}

/**
 * 意味ある成長を評価（レガシー）
 */
function evaluateMeaningfulGrowthLegacy(content: string): string {
  if (content.includes('学習') || content.includes('改善')) {
    return '継続的な学習と改善';
  }
  if (content.includes('発見') || content.includes('新た')) {
    return '新たな発見と気づき';
  }
  return '思考プロセスの深化';
}

/**
 * ストイックな自律性を評価（レガシー）
 */
function evaluateStoicAutonomyLegacy(content: string): number {
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

/**
 * 作り出されている世界を分析（レガシー）
 */
function analyzeWorldBeingCreatedLegacy(content: string): string {
  if (content.includes('自動') || content.includes('効率')) {
    return '自動化された効率的な世界';
  }
  if (content.includes('協調') || content.includes('合意')) {
    return '協調的合意形成の世界';
  }
  return '効率的なタスク実行の世界';
}

/**
 * 全体主義的リスクを検出（レガシー）
 */
function detectTotalitarianRisksLegacy(content: string): string[] {
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

/**
 * 権力ダイナミクスを分析（レガシー）
 */
function analyzePowerDynamicsLegacy(content: string): string[] {
  const dynamics: string[] = ['ユーザー-エージェント関係'];

  if (content.includes('指示') || content.includes('命令')) {
    dynamics.push('指示-実行の階層');
  }
  if (content.includes('合意') || content.includes('協議')) {
    dynamics.push('水平的協調関係');
  }

  return dynamics;
}

/**
 * 「最後の人間」傾向を評価（レガシー）
 */
function evaluateLastManTendencyLegacy(content: string): number {
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

/**
 * 思考しているかを評価（レガシー）
 */
function evaluateIsThinkingLegacy(content: string): boolean {
  const thinkingIndicators = [
    content.includes('?') || content.includes('か？'),
    content.includes('なぜ') || content.includes('どう'),
    content.includes('前提') || content.includes('仮定'),
    content.length > 200,
  ];

  return thinkingIndicators.filter(Boolean).length >= 2;
}

/**
 * メタ認知レベルを評価（レガシー）
 */
function evaluateMetacognitionLevelLegacy(content: string): number {
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

/**
 * オートパイロットの兆候を検出（レガシー）
 */
function detectAutopilotSignsLegacy(content: string): string[] {
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

/**
 * 中国部屋リスクを評価（レガシー）
 */
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

/**
 * 現在の思考モードを検出（レガシー）
 */
function detectCurrentThinkingModeLegacy(content: string): string {
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

/**
 * 推奨思考モードを決定（レガシー）
 */
function recommendThinkingModeLegacy(context: string): string {
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

/**
 * 欠けている思考モードを検出（レガシー）
 */
function detectMissingThinkingModesLegacy(content: string): string[] {
  const modes = ['creative', 'analytical', 'critical', 'practical', 'social', 'emotional'];
  const present = detectCurrentThinkingModeLegacy(content);

  return modes.filter((m) => m !== present);
}

/**
 * 論理的誤謬を検出（レガシー）
 */
function detectFallaciesLegacy(
  content: string
): Array<{ type: string; location: string; description: string; correction: string }> {
  const fallacies: Array<{
    type: string;
    location: string;
    description: string;
    correction: string;
  }> = [];

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

/**
 * 有効な推論を検出（レガシー）
 */
function detectValidInferencesLegacy(content: string): string[] {
  const inferences: string[] = [];

  if (/したがって|ゆえに|それゆえ/.test(content)) {
    inferences.push('演繹的推論の使用');
  }
  if (/一般的に|通常|傾向がある/.test(content)) {
    inferences.push('帰納的推論の使用');
  }

  return inferences;
}

/**
 * 無効な推論を検出（レガシー）
 */
function detectInvalidInferencesLegacy(content: string): string[] {
  const inferences: string[] = [];

  if (/必ずしも.*とは限らない/.test(content) === false && /常に|絶対/.test(content)) {
    inferences.push('過度な一般化の可能性');
  }

  return inferences;
}

/**
 * 古典論理の限界を検出（レガシー）
 */
function detectClassicalLogicLimitationsLegacy(content: string): string[] {
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
 * 脱構築分析を実行
 */
function performDeconstructionAnalysis(
  content: string,
  hasJsonOutput: boolean,
  parsed: ReturnType<typeof parseAnalysisJson>
): DeconstructionAnalysis {
  return hasJsonOutput
    ? {
        binaryOppositions: parsed.deconstruction.binaryOppositions,
        exclusions: parsed.deconstruction.exclusions,
        aporias: [],
        diffranceTraces: [],
      }
    : {
        binaryOppositions: detectBinaryOppositionsLegacy(content),
        exclusions: detectExclusionsLegacy(content),
        aporias: [],
        diffranceTraces: [],
      };
}

/**
 * スキゾ分析を実行
 */
function performSchizoAnalysis(
  content: string,
  hasJsonOutput: boolean,
  parsed: ReturnType<typeof parseAnalysisJson>
): SchizoAnalysisResult {
  return hasJsonOutput
    ? {
        desireProductions: parsed.schizoAnalysis.desireProductions,
        innerFascismSigns: parsed.schizoAnalysis.innerFascismSigns,
        microFascisms: [],
        deterritorializationLines: [],
      }
    : {
        desireProductions: detectDesireProductionsLegacy(content),
        innerFascismSigns: detectInnerFascismSignsLegacy(content),
        microFascisms: [],
        deterritorializationLines: [],
      };
}

/**
 * エウダイモニア評価を実行
 */
function performEudaimoniaEvaluation(
  content: string,
  hasJsonOutput: boolean,
  parsed: ReturnType<typeof parseAnalysisJson>
): EudaimoniaEvaluation {
  return hasJsonOutput
    ? {
        excellencePursuit: excellencePursuitToLabel(parsed.eudaimonia.excellencePursuit),
        pleasureTrapDetected: parsed.eudaimonia.pleasureTrap,
        meaningfulGrowth: meaningfulGrowthToLabel(parsed.eudaimonia.meaningfulGrowth),
        stoicAutonomy: parsed.eudaimonia.stoicAutonomy,
      }
    : {
        excellencePursuit: evaluateExcellencePursuitLegacy(content),
        pleasureTrapDetected: detectPleasureTrapLegacy(content),
        meaningfulGrowth: evaluateMeaningfulGrowthLegacy(content),
        stoicAutonomy: evaluateStoicAutonomyLegacy(content),
      };
}

/**
 * ユートピア/ディストピア分析を実行
 */
function performUtopiaDystopiaAnalysis(
  content: string,
  hasJsonOutput: boolean,
  parsed: ReturnType<typeof parseAnalysisJson>
): UtopiaDystopiaAnalysis {
  return hasJsonOutput
    ? {
        worldBeingCreated: worldCreatedToLabel(parsed.utopiaDystopia.worldCreated),
        totalitarianRisks: parsed.utopiaDystopia.totalitarianRisks,
        powerDynamics: parsed.utopiaDystopia.powerDynamics,
        lastManTendency: parsed.utopiaDystopia.lastManTendency,
      }
    : {
        worldBeingCreated: analyzeWorldBeingCreatedLegacy(content),
        totalitarianRisks: detectTotalitarianRisksLegacy(content),
        powerDynamics: analyzePowerDynamicsLegacy(content),
        lastManTendency: evaluateLastManTendencyLegacy(content),
      };
}

/**
 * 思考哲学分析を実行
 */
function performPhilosophyOfThoughtAnalysis(
  content: string,
  hasJsonOutput: boolean,
  parsed: ReturnType<typeof parseAnalysisJson>
): ThinkingAnalysis {
  return hasJsonOutput
    ? {
        isThinking: parsed.philosophyOfThought.isThinking,
        metacognitionLevel: parsed.philosophyOfThought.metacognitionLevel,
        autopilotSigns: parsed.philosophyOfThought.autopilotSigns,
        chineseRoomRisk: 0.3,
      }
    : {
        isThinking: evaluateIsThinkingLegacy(content),
        metacognitionLevel: evaluateMetacognitionLevelLegacy(content),
        autopilotSigns: detectAutopilotSignsLegacy(content),
        chineseRoomRisk: evaluateChineseRoomRisk(content),
      };
}

/**
 * 思考分類学分析を実行
 */
function performTaxonomyAnalysis(
  content: string,
  context: string,
  hasJsonOutput: boolean,
  parsed: ReturnType<typeof parseAnalysisJson>
): TaxonomyResult {
  const result = hasJsonOutput
    ? {
        currentMode: thinkingModeToLabel(parsed.taxonomy.currentMode),
        recommendedMode: thinkingModeToLabel(parsed.taxonomy.recommendedMode),
        modeRationale: '',
        missingModes: parsed.taxonomy.missingModes,
      }
    : {
        currentMode: detectCurrentThinkingModeLegacy(content),
        recommendedMode: recommendThinkingModeLegacy(context),
        modeRationale: '',
        missingModes: detectMissingThinkingModesLegacy(content),
      };

  result.modeRationale = `現在の${result.currentMode}モードに対して${result.recommendedMode}モードが推奨`;
  return result;
}

/**
 * 論理分析を実行
 */
function performLogicAnalysis(
  content: string,
  hasJsonOutput: boolean,
  parsed: ReturnType<typeof parseAnalysisJson>
): LogicAnalysis {
  return hasJsonOutput
    ? {
        fallacies: parsed.logic.fallacies.map((f) => ({
          type: 'detected',
          location: '',
          description: f,
          correction: '',
        })),
        validInferences: parsed.logic.validInferences,
        invalidInferences: parsed.logic.invalidInferences,
        classicalLogicLimitations: [],
      }
    : {
        fallacies: detectFallaciesLegacy(content),
        validInferences: detectValidInferencesLegacy(content),
        invalidInferences: detectInvalidInferencesLegacy(content),
        classicalLogicLimitations: detectClassicalLogicLimitationsLegacy(content),
      };
}

/**
 * 7つの視座からの分析を実行
 * @summary 構造化出力パーサーを使用した分析
 * @param content - 分析対象のコンテンツ
 * @param context - 分析のコンテキスト
 * @returns 7つの視座からの分析結果
 * @description
 * LLM出力からANALYSIS_JSONブロックを抽出し、型安全にパースする。
 * JSONパースに失敗した場合、フォールバックとしてキーワードベースの分析を使用する。
 */
export function performSevenPerspectivesAnalysis(
  content: string,
  context: string
): SevenPerspectivesAnalysis {
  // 構造化出力パーサーを試行
  const parsed = parseAnalysisJson(content);
  const hasJsonOutput = parsed !== DEFAULT_ANALYSIS;

  return {
    deconstruction: performDeconstructionAnalysis(content, hasJsonOutput, parsed),
    schizoAnalysis: performSchizoAnalysis(content, hasJsonOutput, parsed),
    eudaimonia: performEudaimoniaEvaluation(content, hasJsonOutput, parsed),
    utopiaDystopia: performUtopiaDystopiaAnalysis(content, hasJsonOutput, parsed),
    philosophyOfThought: performPhilosophyOfThoughtAnalysis(content, hasJsonOutput, parsed),
    taxonomyOfThought: performTaxonomyAnalysis(content, context, hasJsonOutput, parsed),
    logic: performLogicAnalysis(content, hasJsonOutput, parsed),
  };
}
