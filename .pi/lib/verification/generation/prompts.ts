/**
 * @abdd.meta
 * path: .pi/lib/verification/generation/prompts.ts
 * role: 検証用プロンプト生成機能
 * why: Inspector/Challengerエージェント用のプロンプトを一元管理するため
 * related: ../types.ts, ../config.ts, ../extraction/candidates.ts
 * public_api: buildInspectorPrompt, buildChallengerPrompt, generateLLMVerificationPrompt
 * invariants: 各関数は常に非空の文字列を返す
 * side_effects: なし（純粋関数）
 * failure_modes: 入力が空の場合、デフォルトプロンプトを返す
 * @abdd.explain
 * overview: Inspector/Challenger/LLM検証用のプロンプトテンプレートを生成
 * what_it_does:
 *   - Inspector用プロンプトを構築する（バイアス検出用）
 *   - Challenger用プロンプトを構築する（欠陥指摘用）
 *   - LLM判定用プロンプトを生成する
 * why_it_exists:
 *   - 検証プロンプトの一貫性と品質を確保するため
 * scope:
 *   in: ../types.ts, ../config.ts
 *   out: ../core.ts
 */

import { type VerificationContext, type InspectorOutput, type ChallengerOutput } from '../types.js';

// ============================================================================
// Main Functions
// ============================================================================

/**
 * 検査用プロンプトを構築
 * @summary Inspectorプロンプト構築
 * @param targetOutput 検証対象の出力内容
 * @param context 検証コンテキスト情報
 * @param requiredPatterns 必須検出パターン
 * @returns 構築されたプロンプト文字列
 */
export function buildInspectorPrompt(
  targetOutput: string,
  context: VerificationContext,
  requiredPatterns: string[] = DEFAULT_INSPECTOR_PATTERNS
): string {
  return `You are the Inspector subagent. Analyze the following agent output for suspicious patterns.

TARGET OUTPUT:
${targetOutput}

CONTEXT:
- Task: ${context.task}
- Agent: ${context.agentId || context.teamId || 'unknown'}

INSPECTION CHECKLIST:
${requiredPatterns.map(p => `- ${formatPatternName(p)}`).join('\n')}

OUTPUT FORMAT:
\`\`\`
INSPECTION_REPORT:
- [Pattern]: [Finding]
- [Pattern]: [Finding]
...

SUSPICION_LEVEL: low | medium | high

SUMMARY: [Brief summary of findings]

RECOMMENDATION: [What should happen next]
\`\`\`

Focus on:
1. Claims without sufficient evidence
2. Logical inconsistencies between CLAIM and RESULT
3. Overconfidence (high CONFIDENCE with weak EVIDENCE)
4. Missing alternative explanations
5. Causal reversal errors ("A implies B" treated as "B implies A")
6. Confirmation bias patterns (only seeking supporting evidence)`;
}

/**
 * 挑戦者用プロンプトを作成する
 * @summary Challengerプロンプト作成
 * @param targetOutput 対象となる出力
 * @param context 検証コンテキスト
 * @param enabledCategories 有効なチャレンジカテゴリ
 * @param requiredFlaws 必須欠陥数
 * @returns 生成されたプロンプト文字列
 */
export function buildChallengerPrompt(
  targetOutput: string,
  context: VerificationContext,
  enabledCategories: string[] = DEFAULT_CHALLENGE_CATEGORIES,
  requiredFlaws: number = 1
): string {
  return `You are the Challenger subagent. Your role is to DISPUTE and FIND FLAWS in the following agent output.

TARGET OUTPUT:
${targetOutput}

CONTEXT:
- Task: ${context.task}
- Agent: ${context.agentId || context.teamId || 'unknown'}

CHALLENGE CATEGORIES:
${enabledCategories.map(c => `- ${formatCategoryName(c)}`).join('\n')}

REQUIREMENTS:
- Identify at least ${requiredFlaws} flaw(s) or weakness(es)
- Be constructively critical - your goal is to strengthen conclusions
- Focus on the most significant issues first

OUTPUT FORMAT:
For each challenged claim:
\`\`\`
CHALLENGED_CLAIM: <specific claim being challenged>
FLAW: <identified flaw or weakness>
EVIDENCE_GAP: <missing evidence that would strengthen/verify the claim>
ALTERNATIVE: <alternative interpretation or explanation>
BOUNDARY_FAILURE: <conditions under which the claim would fail>
SEVERITY: minor | moderate | critical
\`\`\`

OVERALL_SEVERITY: minor | moderate | critical

SUMMARY: [Brief summary of challenges]

SUGGESTED_REVISIONS:
- [Revision 1]
- [Revision 2]
...`;
}

/**
 * LLM判定用のプロンプトを生成する
 * @summary LLM判定プロンプト生成
 * @param request LLM判定リクエスト
 * @returns プロンプト文字列
 */
export function generateLLMVerificationPrompt(request: {
  candidate: {
    type: string;
    matchedText: string;
    context: string;
  };
  fullText: string;
  taskContext?: string;
  verificationType: 'fallacy' | 'binary_opposition' | 'aporia' | 'fascism' | 'reasoning_gap';
}): string {
  const { candidate, fullText, taskContext, verificationType } = request;
  
  const typeDescriptions: Record<string, string> = {
    fallacy: '論理的誤謬（後件肯定、循環論法、偽の二分法など）',
    binary_opposition: '二項対立（善/悪、成功/失敗などの対立構造）',
    aporia: 'アポリア（解決困難な対立や緊張関係）',
    fascism: '内なるファシズム（過度な自己監視、権力への服従など）',
    reasoning_gap: '推論の飛躍（前提と結論の間の論理的欠落）'
  };

  return `あなたは論理的推論の専門家です。以下の検出候補が、文脈を考慮した上で本当に問題があるかを判定してください。

## 判定タイプ
${typeDescriptions[verificationType] || verificationType}

## 検出された候補
- 種別: ${candidate.type}
- マッチテキスト: "${candidate.matchedText}"
- 周辺コンテキスト: "...${candidate.context}..."

${taskContext ? `## タスクコンテキスト\n${taskContext}\n` : ''}

## 判定基準
1. **confirmed**: 文脈を考慮しても問題がある。真正な誤謬/問題である。
2. **rejected**: 文脈を考慮すると問題ない。パターンマッチングの偽陽性。
3. **uncertain**: 判定に追加情報が必要。曖昧なケース。

## 出力形式（JSON）
\`\`\`json
{
  "verdict": "confirmed|rejected|uncertain",
  "confidence": 0.0-1.0,
  "reasoning": "判定理由を具体的に記述",
  "contextualFactors": ["考慮した文脈的要因1", "考慮した文脈的要因2"],
  "alternativeInterpretation": "別の解釈があれば記述（オプション）"
}
\`\`\`

## 重要な注意点
- 技術的に正しい記述を誤検出しないこと
- 「必ずテストを実行する」のような適切な指示は、内なるファシズムではない
- 文脈によって正当化できる表現は、問題として扱わない
- 確信度は判定の確実性を反映すること（推測の場合は低めに）`;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * デフォルトのInspector検出パターン
 */
const DEFAULT_INSPECTOR_PATTERNS = [
  'claim-result-mismatch',
  'evidence-confidence-gap',
  'missing-alternatives',
  'causal-reversal',
  'confirmation-bias',
  'overconfidence',
  'first-reason-stopping',
  'proximity-bias',
  'concreteness-bias',
  'palliative-fix'
];

/**
 * デフォルトのChallengeカテゴリ
 */
const DEFAULT_CHALLENGE_CATEGORIES = [
  'evidence-gap',
  'logical-flaw',
  'assumption',
  'alternative',
  'boundary',
  'causal-reversal'
];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * パターン名をフォーマット
 * @summary パターン名フォーマット
 */
function formatPatternName(pattern: string): string {
  const names: Record<string, string> = {
    'claim-result-mismatch': 'CLAIM-RESULT Mismatch',
    'evidence-confidence-gap': 'Evidence-Confidence Gap',
    'missing-alternatives': 'Missing Alternative Explanations',
    'causal-reversal': 'Causal Reversal Error',
    'confirmation-bias': 'Confirmation Bias Pattern',
    'overconfidence': 'Overconfidence',
    'incomplete-reasoning': 'Incomplete Reasoning',
    'first-reason-stopping': 'First-Reason Stopping (Bug Hunting)',
    'proximity-bias': 'Proximity Bias (Symptom = Cause Assumption)',
    'concreteness-bias': 'Concreteness Bias (Missing Abstract Level Analysis)',
    'palliative-fix': 'Palliative Fix (No Recurrence Prevention)',
  };
  return names[pattern] || pattern;
}

/**
 * カテゴリ名をフォーマット
 * @summary カテゴリ名フォーマット
 */
function formatCategoryName(category: string): string {
  const names: Record<string, string> = {
    'evidence-gap': 'Evidence Gaps',
    'logical-flaw': 'Logical Flaws',
    'assumption': 'Hidden Assumptions',
    'alternative': 'Unconsidered Alternatives',
    'boundary': 'Boundary Conditions',
    'causal-reversal': 'Causal Reversals',
  };
  return names[category] || category;
}

/**
 * 検出タイプを判定タイプにマッピング
 * @summary タイプマッピング
 */
export function mapTypeToVerificationType(type: string): 'fallacy' | 'binary_opposition' | 'aporia' | 'fascism' | 'reasoning_gap' {
  if (['affirming-consequent', 'circular-reasoning', 'false-dichotomy', 
       'slippery-slope', 'hasty-generalization'].includes(type)) {
    return 'fallacy';
  }
  if (['truth-binary', 'success-binary', 'moral-binary', 
       'correctness-binary', 'completeness-binary'].includes(type)) {
    return 'binary_opposition';
  }
  if (['self-surveillance', 'norm-obedience', 'value-convergence'].includes(type)) {
    return 'fascism';
  }
  return 'fallacy';
}

/**
 * LLM判定結果をパースする
 * @summary LLM応答パース
 * @param response LLMの応答テキスト
 * @param candidate 元の候補
 * @returns パースされた判定結果
 */
export function parseLLMVerificationResponse(
  response: string,
  candidate: { type: string; matchedText: string; context: string }
): {
  candidate: typeof candidate;
  verdict: 'confirmed' | 'rejected' | 'uncertain';
  confidence: number;
  reasoning: string;
  contextualFactors: string[];
  alternativeInterpretation?: string;
} {
  try {
    // JSONブロックを抽出
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1]);
      return {
        candidate,
        verdict: parsed.verdict || 'uncertain',
        confidence: Math.max(0, Math.min(1, parsed.confidence || 0.5)),
        reasoning: parsed.reasoning || '理由が提供されませんでした',
        contextualFactors: parsed.contextualFactors || [],
        alternativeInterpretation: parsed.alternativeInterpretation
      };
    }

    // JSON形式でない場合、テキストから推定
    const lowerResponse = response.toLowerCase();
    let verdict: 'confirmed' | 'rejected' | 'uncertain' = 'uncertain';
    let confidence = 0.5;

    if (lowerResponse.includes('confirmed') || lowerResponse.includes('問題あり')) {
      verdict = 'confirmed';
      confidence = 0.7;
    } else if (lowerResponse.includes('rejected') || lowerResponse.includes('問題なし')) {
      verdict = 'rejected';
      confidence = 0.7;
    }

    return {
      candidate,
      verdict,
      confidence,
      reasoning: response.slice(0, 500),
      contextualFactors: []
    };
  } catch {
    return {
      candidate,
      verdict: 'uncertain',
      confidence: 0.3,
      reasoning: 'LLM応答のパースに失敗',
      contextualFactors: []
    };
  }
}
