/**
 * @abdd.meta
 * path: .pi/lib/verification/generation/improvement-actions.ts
 * role: 改善アクション生成機能
 * why: メタ認知チェック結果から具体的な改善指針を生成するため
 * related: ../analysis/metacognitive-check.ts, ../types.ts
 * public_api: generateImprovementActions, formatActionsAsPromptInstructions, ImprovementAction
 * invariants: generateImprovementActionsは常に優先度順の配列を返す
 * side_effects: なし（純粋関数）
 * failure_modes: 入力が空の場合、空配列を返す
 * @abdd.explain
 * overview: メタ認知チェック結果に基づき、優先度付き改善アクションを生成
 * what_it_does:
 *   - 各視座の問題点に対する改善アクションを生成する
 *   - 優先度（1-5）を割り当てる
 *   - プロンプト指示形式に変換する
 *   - 統合メタ認知分析を実行する
 * why_it_exists:
 *   - 抽象的な問題点を具体的なアクションに変換するため
 * scope:
 *   in: ../analysis/metacognitive-check.ts, ../types.ts
 *   out: ../core.ts
 */

import { type MetacognitiveCheck } from '../analysis/metacognitive-check.js';
import { type InferenceChain } from '../analysis/inference-chain.js';

// ============================================================================
// Types
// ============================================================================

/**
 * 改善アクションを表すインターフェース
 * @summary 改善アクション定義
 */
export interface ImprovementAction {
  /** アクションのカテゴリ */
  category: 'deconstruction' | 'schizoanalysis' | 'eudaimonia' | 'utopia_dystopia' | 
            'philosophy_of_thought' | 'taxonomy_of_thought' | 'logic';
  /** 優先度（1-5、1が最高） */
  priority: 1 | 2 | 3 | 4 | 5;
  /** 問題の説明 */
  issue: string;
  /** 具体的な改善アクション */
  action: string;
  /** 期待される効果 */
  expectedOutcome: string;
  /** 関連する視座 */
  relatedPerspective: string;
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * メタ認知チェック結果から改善アクションを生成する
 * @summary 改善アクション生成
 * @param check メタ認知チェック結果
 * @returns 優先度順の改善アクションリスト
 */
export function generateImprovementActions(check: MetacognitiveCheck): ImprovementAction[] {
  const actions: ImprovementAction[] = [];

  // I. 脱構築: 二項対立の脱構築アクション
  for (const binary of check.deconstruction.binaryOppositions) {
    actions.push({
      category: 'deconstruction',
      priority: 2,
      issue: `二項対立「${binary}」が検出された`,
      action: `「${binary}」の中間領域や第三の選択肢を探求する。両極を両立させる条件を検討する。`,
      expectedOutcome: '二項対立を超えた統合的解決の発見',
      relatedPerspective: '脱構築'
    });
  }

  // アポリア対処アクション
  for (const aporia of check.deconstruction.aporias) {
    const priority: 1 | 2 | 3 | 4 | 5 = aporia.tensionLevel > 0.7 ? 1 : 2;
    actions.push({
      category: 'deconstruction',
      priority,
      issue: `アポリア「${aporia.description}」が存在する`,
      action: `このアポリアを「解決すべき問題」ではなく「認識すべき状態」として受け入れる。` +
              `${aporia.pole1.concept}と${aporia.pole2.concept}の両極を維持しながら、文脈に応じて判断する。`,
      expectedOutcome: 'アポリアとの生産的な共存',
      relatedPerspective: '脱構築'
    });
  }

  // II. スキゾ分析: 内なるファシズムへの対処
  for (const sign of check.schizoAnalysis.innerFascismSigns) {
    actions.push({
      category: 'schizoanalysis',
      priority: 2,
      issue: `内なるファシズム兆候「${sign}」が検出された`,
      action: `「${sign}」のパターンを意識的に緩和する。代替表現や柔軟な判断基準を導入する。`,
      expectedOutcome: 'より自由で創造的な思考の獲得',
      relatedPerspective: 'スキゾ分析'
    });
  }

  // III. 幸福論: 快楽主義の罠
  if (check.eudaimonia.pleasureTrap) {
    actions.push({
      category: 'eudaimonia',
      priority: 3,
      issue: '快楽主義の罠（簡単・手軽な解決への誘惑）が検出された',
      action: '長期的な価値と成長を優先する。困難でも本質的な解決を追求する。',
      expectedOutcome: '持続可能で意味のある成果の達成',
      relatedPerspective: '幸福論'
    });
  }

  // IV. ユートピア/ディストピア: 全体主義リスク
  for (const risk of check.utopiaDystopia.totalitarianRisk) {
    actions.push({
      category: 'utopia_dystopia',
      priority: 3,
      issue: `全体主義リスク「${risk}」が検出された`,
      action: `多様性と個別性を尊重する判断を意識する。「${risk}」の傾向を緩和する仕組みを検討する。`,
      expectedOutcome: '開かれた柔軟なシステムの維持',
      relatedPerspective: 'ユートピア/ディストピア'
    });
  }

  // V. 思考哲学: オートパイロット兆候
  for (const sign of check.philosophyOfThought.autopilotSigns) {
    actions.push({
      category: 'philosophy_of_thought',
      priority: 1,
      issue: `オートパイロット兆候「${sign}」が検出された`,
      action: `意識的に「${sign}」の逆を行う。前提を明示し、推論過程を記述する。メタ認知を実践する。`,
      expectedOutcome: '深い思考と批判的判断の回復',
      relatedPerspective: '思考哲学'
    });
  }

  // 低メタ認知レベル
  if (check.philosophyOfThought.metacognitionLevel < 0.5) {
    actions.push({
      category: 'philosophy_of_thought',
      priority: 1,
      issue: `メタ認知レベルが低い（${(check.philosophyOfThought.metacognitionLevel * 100).toFixed(0)}%）`,
      action: '以下を実践する：(1) 暗黙の前提を明示 (2) 推論の各ステップを検証 (3) 反例を積極的に探索',
      expectedOutcome: 'メタ認知レベルの向上と思考の深化',
      relatedPerspective: '思考哲学'
    });
  }

  // VI. 思考分類学: 不適切な思考モード
  if (check.taxonomyOfThought.currentMode !== check.taxonomyOfThought.recommendedMode) {
    actions.push({
      category: 'taxonomy_of_thought',
      priority: 3,
      issue: `思考モードが不適切（現在: ${check.taxonomyOfThought.currentMode}, 推奨: ${check.taxonomyOfThought.recommendedMode}）`,
      action: `${check.taxonomyOfThought.modeRationale}。意識的に${check.taxonomyOfThought.recommendedMode}モードに切り替える。`,
      expectedOutcome: 'タスクに適した思考アプローチの適用',
      relatedPerspective: '思考分類学'
    });
  }

  // VII. 論理学: 誤謬への対処
  for (const fallacy of check.logic.fallacies) {
    actions.push({
      category: 'logic',
      priority: 1,
      issue: `論理的誤謬「${fallacy.type}」が検出された: ${fallacy.description}`,
      action: fallacy.correction,
      expectedOutcome: '論理的妥当性の確保',
      relatedPerspective: '論理学'
    });
  }

  // 推論チェーンの問題
  if (check.logic.inferenceChain) {
    const chain = check.logic.inferenceChain;
    
    if (chain.gaps.length > 0) {
      for (const gap of chain.gaps) {
        actions.push({
          category: 'logic',
          priority: 2,
          issue: `推論の飛躍: ${gap}`,
          action: '前提と結論をつなぐ中間ステップを明示する。各ステップの論理的妥当性を検証する。',
          expectedOutcome: '論理的飛躍の解消',
          relatedPerspective: '論理学'
        });
      }
    }
    
    if (chain.validity === 'invalid') {
      actions.push({
        category: 'logic',
        priority: 1,
        issue: '推論チェーンが無効と判定された',
        action: '推論全体を再構築する。各前提が結論を導くか検証する。代替の推論経路を検討する。',
        expectedOutcome: '有効な推論の構築',
        relatedPerspective: '論理学'
      });
    }
  }

  // 優先度順にソート
  return actions.sort((a, b) => a.priority - b.priority);
}

/**
 * 改善アクションを実行可能なプロンプト指示に変換する
 * @summary プロンプト指示生成
 * @param actions 改善アクションリスト
 * @param maxActions 最大アクション数（デフォルト: 5）
 * @returns プロンプトに追加可能な指示文字列
 */
export function formatActionsAsPromptInstructions(
  actions: ImprovementAction[],
  maxActions: number = 5
): string {
  const topActions = actions.slice(0, maxActions);
  
  if (topActions.length === 0) {
    return '';
  }

  const instructions = topActions.map((action, index) => 
    `${index + 1}. 【${action.relatedPerspective}】${action.action}`
  );

  return `## 推論改善指示

以下の改善アクションを実践してください：

${instructions.join('\n')}

これらは、前回の分析で検出された問題に対処するための具体的な指示です。`;
}

/**
 * メタ認知チェックと改善アクションを統合的に実行
 * @summary 統合メタ認知分析
 * @param output 分析対象の出力
 * @param context コンテキスト情報
 * @param runCheck メタ認知チェック実行関数
 * @returns メタ認知チェック結果、改善アクション、プロンプト指示を含む統合結果
 */
export function runIntegratedMetacognitiveAnalysis(
  output: string,
  context: { task?: string; currentMode?: string } = {},
  runCheck: (output: string, context: { task?: string; currentMode?: string }) => MetacognitiveCheck
): {
  check: MetacognitiveCheck;
  actions: ImprovementAction[];
  promptInstructions: string;
  summary: string;
  depthScore: number;
} {
  // メタ認知チェックを実行
  const check = runCheck(output, context);
  
  // 改善アクションを生成
  const actions = generateImprovementActions(check);
  
  // プロンプト指示を生成
  const promptInstructions = formatActionsAsPromptInstructions(actions);
  
  // サマリーを生成
  const summary = generateMetacognitiveSummary(check);
  
  // 推論深度スコアを計算
  const depthScore = calculateDepthScore(check);
  
  return {
    check,
    actions,
    promptInstructions,
    summary,
    depthScore
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * 推論深度スコアを計算（内部関数）
 * @summary 深度スコア計算
 */
function calculateDepthScore(check: MetacognitiveCheck): number {
  let score = 0.5;
  
  // 二項対立の認識 = 深い思考の証
  score += Math.min(check.deconstruction.binaryOppositions.length * 0.05, 0.15);
  
  // アポリアの認識 = 複雑さの受容
  score += Math.min(check.deconstruction.aporias.length * 0.08, 0.2);
  
  // 欲望の自己認識
  score += Math.min(check.schizoAnalysis.desireProduction.length * 0.03, 0.09);
  
  // 快楽主義の罠を回避している
  if (!check.eudaimonia.pleasureTrap) {
    score += 0.05;
  }
  
  // リスク認識
  score += Math.min(check.utopiaDystopia.totalitarianRisk.length * 0.03, 0.09);
  
  // メタ認知レベル（最重要）
  score += check.philosophyOfThought.metacognitionLevel * 0.15;
  
  // 思考モードの適切性
  if (check.taxonomyOfThought.currentMode === check.taxonomyOfThought.recommendedMode) {
    score += 0.05;
  }
  
  // 誤謬の不在
  if (check.logic.fallacies.length === 0) {
    score += 0.05;
  } else {
    score -= Math.min(check.logic.fallacies.length * 0.1, 0.25);
  }
  
  // 推論チェーンの品質
  if (check.logic.inferenceChain) {
    if (check.logic.inferenceChain.validity === 'valid') {
      score += 0.1;
    }
    if (check.logic.inferenceChain.gaps.length === 0) {
      score += 0.05;
    }
  }
  
  return Math.max(0, Math.min(1, score));
}

/**
 * メタ認知チェックのサマリーを生成
 * @summary サマリー生成
 */
function generateMetacognitiveSummary(check: MetacognitiveCheck): string {
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

/**
 * 信頼度レベル
 */
type ConfidenceLevel = 'high' | 'medium' | 'low';

/**
 * 候補検出結果から信頼度レベルを判定
 * @summary 信頼度レベル判定
 */
function getConfidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= 0.5) return 'high';
  if (confidence >= 0.3) return 'medium';
  return 'low';
}

/**
 * 統合検出結果から改善アクションを生成（信頼度考慮版）
 * @summary 信頼度ベース改善アクション生成
 * @param detectionResult 統合検出結果
 * @returns 改善アクションリスト（信頼度で重み付け）
 */
export function generateActionsFromDetection(detectionResult: {
  candidates: Array<{
    type: string;
    matchedText: string;
    patternConfidence: number;
  }>;
}): Array<ImprovementAction & { confidenceLevel: ConfidenceLevel }> {
  const actions: Array<ImprovementAction & { confidenceLevel: ConfidenceLevel }> = [];

  for (const candidate of detectionResult.candidates) {
    const confidenceLevel = getConfidenceLevel(candidate.patternConfidence);
    
    // 信頼度に基づいて優先度を調整
    let priority: 1 | 2 | 3 | 4 | 5;
    if (confidenceLevel === 'high') {
      priority = 1;
    } else if (confidenceLevel === 'medium') {
      priority = 2;
    } else {
      priority = 4; // 低信頼度は優先度を下げる
    }

    // 検出タイプに応じたアクションを生成
    const actionTemplate = getActionTemplateForType(candidate.type, candidate.matchedText);
    
    actions.push({
      category: mapTypeToCategory(candidate.type),
      priority,
      issue: `${actionTemplate.issuePrefix}「${candidate.matchedText.slice(0, 30)}」`,
      action: actionTemplate.action,
      expectedOutcome: actionTemplate.expectedOutcome,
      relatedPerspective: actionTemplate.perspective,
      confidenceLevel
    });
  }

  // 優先度順にソート
  return actions.sort((a, b) => a.priority - b.priority);
}

/**
 * 検出タイプに応じたアクションテンプレートを取得
 * @summary アクションテンプレート取得
 */
function getActionTemplateForType(type: string, _matchedText: string): {
  issuePrefix: string;
  action: string;
  expectedOutcome: string;
  perspective: string;
} {
  // 誤謬タイプ（幸福論的転換: 「修正」→「卓越の追求」）
  if (['affirming-consequent', 'circular-reasoning', 'false-dichotomy', 
       'slippery-slope', 'hasty-generalization'].includes(type)) {
    const fallacyActions: Record<string, { issuePrefix: string; action: string; expectedOutcome: string; perspective: string }> = {
      'affirming-consequent': {
        issuePrefix: '後件肯定の誤謬が現れています',
        action: '「AならB、BだからA」という推論パターンが現れていることに気づいてください。Bが他の原因で起こりうるか検討し、より妥当な推論を追求できます。',
        expectedOutcome: '推論の卓越（論理的妥当性の追求）',
        perspective: '論理学・幸福論'
      },
      'circular-reasoning': {
        issuePrefix: '循環論法が現れています',
        action: '結論を前提として使うパターンが現れていることに気づいてください。独立した根拠を探求し、実質的な論証を構築できます。',
        expectedOutcome: '推論の卓越（実質的論証の追求）',
        perspective: '論理学・幸福論'
      },
      'false-dichotomy': {
        issuePrefix: '偽の二分法が現れています',
        action: '「AかBか」という二分法が現れていることに気づいてください。第三の選択肢や中間的な解を探求し、より包括的な問題解決を目指せます。',
        expectedOutcome: '思考の卓越（包括的視点の追求）',
        perspective: '論理学・脱構築'
      },
      'slippery-slope': {
        issuePrefix: '滑り坂論法が現れています',
        action: '極端な結論への連鎖推論が現れていることに気づいてください。各段階の因果関係を検証し、現実的な予測を追求できます。',
        expectedOutcome: '推論の卓越（現実的予測の追求）',
        perspective: '論理学・幸福論'
      },
      'hasty-generalization': {
        issuePrefix: '急激な一般化が現れています',
        action: '限られた事例からの一般化が現れていることに気づいてください。サンプルサイズと代表性を確認し、根拠ある一般化を追求できます。',
        expectedOutcome: '推論の卓越（根拠ある一般化の追求）',
        perspective: '論理学・幸福論'
      }
    };
    return fallacyActions[type] || {
      issuePrefix: '論理的誤謬が現れています',
      action: '推論パターンに気づいてください。論理的飛躍がないか検証し、より妥当な推論を追求できます。',
      expectedOutcome: '推論の卓越（論理的厳密さの追求）',
      perspective: '論理学・幸福論'
    };
  }

  // 二項対立タイプ（幸福論的転換: 「超克」→「中庸の実践」）
  if (['truth-binary', 'success-binary', 'moral-binary', 
       'correctness-binary', 'completeness-binary'].includes(type)) {
    return {
      issuePrefix: '二項対立が現れています',
      action: '「AかBか」という対立構造が現れていることに気づいてください。中間領域やグラデーションを考慮し、中庸の実践を目指せます。',
      expectedOutcome: '中庸の実践（統合的視点の追求）',
      perspective: '脱構築・幸福論'
    };
  }

  // ファシズムタイプ（幸福論的転換: 「排除」→「自律の回復」）
  if (['self-surveillance', 'norm-obedience', 'value-convergence'].includes(type)) {
    const fascismActions: Record<string, { issuePrefix: string; action: string; expectedOutcome: string; perspective: string }> = {
      'self-surveillance': {
        issuePrefix: '自己監視の強制が現れています',
        action: '「常に」「必ず」などの絶対的表現が現れていることに気づいてください。柔軟な判断基準を認め、自律的な判断を取り戻せます。',
        expectedOutcome: '自律の回復（過度な自己強制からの解放）',
        perspective: 'スキゾ分析・幸福論'
      },
      'norm-obedience': {
        issuePrefix: '規範への過度な服従が現れています',
        action: '「すべき」が現れていることに気づいてください。それが本当に必要か、それとも慣習かを問い直し、創造的判断の余地を取り戻せます。',
        expectedOutcome: '自律の回復（創造的判断の追求）',
        perspective: 'スキゾ分析・幸福論'
      },
      'value-convergence': {
        issuePrefix: '一価値への収束が現れています',
        action: '「正しい」への単一の基準が現れていることに気づいてください。多角的な視点を認め、価値の多様性を取り戻せます。',
        expectedOutcome: '自律の回復（価値の多様性の追求）',
        perspective: 'スキゾ分析・幸福論'
      }
    };
    return fascismActions[type] || {
      issuePrefix: '内なるファシズムが現れています',
      action: '無批判な服従や自己監視のパターンが現れていることに気づいてください。代替の判断基準を探求し、より自由な思考を追求できます。',
      expectedOutcome: '自律の回復（自由な思考の追求）',
      perspective: 'スキゾ分析'
    };
  }

  // 渇愛タイプ（十二因縁の適用）
  if (['correctness-craving', 'approval-craving', 'perfection-craving', 'completion-craving'].includes(type)) {
    return {
      issuePrefix: '渇愛が現れています',
      action: 'この渇愛を「私」ではなく、現象として認識してください。渇愛が現れ、消滅するプロセスを観察した上で、本質的な目的に立ち返ることを選択できます。',
      expectedOutcome: '気づきによる自由な選択（無執着の実践）',
      perspective: '縁起・無我（十二因縁）'
    };
  }

  // デフォルト（気づきを促すトーン）
  return {
    issuePrefix: 'パターンが現れています',
    action: '現れているパターンに気づいてください。文脈で評価し、より良い選択を追求できます。',
    expectedOutcome: '気づきによる自由な選択（推論の卓越）',
    perspective: '論理学・幸福論'
  };
}

/**
 * 検出タイプをカテゴリにマッピング
 * @summary カテゴリマッピング
 */
function mapTypeToCategory(type: string): ImprovementAction['category'] {
  if (['affirming-consequent', 'circular-reasoning', 'false-dichotomy', 
       'slippery-slope', 'hasty-generalization'].includes(type)) {
    return 'logic';
  }
  if (['truth-binary', 'success-binary', 'moral-binary', 
       'correctness-binary', 'completeness-binary'].includes(type)) {
    return 'deconstruction';
  }
  if (['self-surveillance', 'norm-obedience', 'value-convergence'].includes(type)) {
    return 'schizoanalysis';
  }
  if (['correctness-craving', 'approval-craving', 'perfection-craving', 'completion-craving'].includes(type)) {
    return 'schizoanalysis'; // 渇愛もスキゾ分析のカテゴリ（欲望分析）に含める
  }
  return 'logic';
}
