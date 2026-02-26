/**
 * @abdd.meta
 * path: .pi/lib/memory/semantic-evaluator.ts
 * role: LLM-as-a-Judge セマンティック評価モジュール
 * why: F1/BLEUスコアの限界を克服し、セマンティックな正確性を評価するため
 * related: .pi/lib/memory/context-saturation-gap.ts, .pi/skills/alma-memory/SKILL.md
 * public_api: evaluateSemanticCorrectness, calculateF1Score, generateComparisonReport, checkRubricConsistency, getEvaluationPrompt
 * invariants: スコアは[0,1]範囲、ルーブリックは3種類(magma, nemori, simplemem)
 * side_effects: LLM API呼び出し（評価時）
 * failure_modes: Paraphrase Penalty, Negation Trap, LLMタイムアウト
 * @abdd.explain
 * overview: 論文「Anatomy of Agentic Memory」のLLM-as-a-Judge評価を実装
 * what_it_does:
 *   - 3種類の評価ルーブリック(MAGMA, Nemori, SimpleMem)の提供
 *   - LLMを使用したセマンティック正確性の評価
 *   - F1スコア計算とセマンティックスコアの比較
 *   - ルーブリック間一貫性チェック
 *   - Paraphrase Penalty/Negation Trap検出
 * why_it_exists:
 *   - F1/BLEUは語彙的一致のみを測定し、セマンティックな等価性を見逃す
 *   - 異なる記述でも意味的に正しい回答を適切に評価するため
 *   - メモリシステムの真の有用性を測定するため
 * scope:
 *   in: クエリ、検索結果、期待値、評価ルーブリック
 *   out: セマンティック評価結果、比較レポート、一貫性スコア
 */

// File: .pi/lib/memory/semantic-evaluator.ts
// Description: LLM-as-a-Judge semantic evaluation for agentic memory systems.
// Why: Overcomes F1/BLEU limitations by evaluating semantic correctness.
// Related: .pi/lib/memory/context-saturation-gap.ts, .pi/skills/alma-memory/SKILL.md

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * 評価ルーブリックの種類
 * @summary セマンティック評価に使用するルーブリック
 */
export type EvaluationRubric = "magma" | "nemori" | "simplemem" | "custom";

/**
 * 評価プロンプト構成
 * @summary ルーブリックに対応する評価プロンプト
 * @param rubric - ルーブリック種別
 * @param systemPrompt - LLMに渡すシステムプロンプト
 * @param evaluationCriteria - 評価基準のリスト
 */
export interface EvaluationPrompt {
  /** ルーブリック種別 */
  rubric: EvaluationRubric;
  /** LLMに渡すシステムプロンプト */
  systemPrompt: string;
  /** 評価基準のリスト */
  evaluationCriteria: string[];
}

/**
 * セマンティック評価結果
 * @summary LLM-as-a-Judgeによる評価結果
 * @param queryId - クエリの一意識別子
 * @param rubric - 使用されたルーブリック
 * @param score - 総合スコア (0-1)
 * @param reasoning - スコアの理由説明
 * @param criteriaScores - 各基準ごとのスコア
 * @param confidence - 評価の信頼度 (0-1)
 * @param detectedIssues - 検出された問題（Paraphrase Penalty等）
 */
export interface SemanticEvaluationResult {
  /** クエリの一意識別子 */
  queryId: string;
  /** 使用されたルーブリック */
  rubric: EvaluationRubric;
  /** 総合スコア (0-1) */
  score: number;
  /** スコアの理由説明 */
  reasoning: string;
  /** 各基準ごとのスコア */
  criteriaScores: Record<string, number>;
  /** 評価の信頼度 (0-1) */
  confidence: number;
  /** 検出された問題 */
  detectedIssues?: DetectedIssue[];
}

/**
 * 検出された問題
 * @summary 評価時に検出される失敗モード
 * @param type - 問題の種類
 * @param description - 問題の説明
 * @param severity - 重要度 (low, medium, high)
 */
export interface DetectedIssue {
  /** 問題の種類 */
  type: "paraphrase_penalty" | "negation_trap" | "hallucination" | "irrelevance";
  /** 問題の説明 */
  description: string;
  /** 重要度 */
  severity: "low" | "medium" | "high";
}

/**
 * 比較レポート
 * @summary F1スコアとセマンティックスコアの比較
 * @param queryId - クエリの一意識別子
 * @param f1Score - F1スコア
 * @param semanticScores - 各ルーブリックのセマンティックスコア
 * @param ranking - 順位情報
 * @param misalignment - F1とセマンティックで順位が逆転しているか
 */
export interface ComparisonReport {
  /** クエリの一意識別子 */
  queryId: string;
  /** F1スコア */
  f1Score: number;
  /** 各ルーブリックのセマンティックスコア */
  semanticScores: Record<EvaluationRubric, number>;
  /** 順位情報 */
  ranking: {
    /** F1による順位 */
    byF1: number;
    /** セマンティックによる順位（ルーブリック別） */
    bySemantic: Record<EvaluationRubric, number>;
  };
  /** F1とセマンティックで順位が逆転しているか */
  misalignment: boolean;
}

/**
 * 評価設定
 * @summary セマンティック評価の設定
 * @param rubrics - 使用するルーブリックのリスト
 * @param consistencyThreshold - ルーブリック間一貫性の閾値
 * @param detectFailureModes - 失敗モード検出を有効にするか
 */
export interface EvaluationConfig {
  /** 使用するルーブリックのリスト */
  rubrics: EvaluationRubric[];
  /** ルーブリック間一貫性の閾値 */
  consistencyThreshold: number;
  /** 失敗モード検出を有効にするか */
  detectFailureModes: boolean;
}

/**
 * LLM呼び出し関数の型
 * @summary 外部から注入されるLLM呼び出し関数
 * @param systemPrompt - システムプロンプト
 * @param userPrompt - ユーザープロンプト
 * @param options - オプション
 * @returns LLMの出力テキスト
 */
export type LlmCallFunction = (
  systemPrompt: string,
  userPrompt: string,
  options?: { timeoutMs?: number }
) => Promise<string>;

// ============================================================================
// Rubric Definitions (Based on Paper Table 3)
// ============================================================================

/**
 * MAGMAルーブリック: グラフベースの評価基準
 * @summary エンティティ関係グラフに基づく評価
 */
const MAGMA_RUBRIC: EvaluationPrompt = {
  rubric: "magma",
  systemPrompt: `You are an expert evaluator for memory-augmented AI systems. Your task is to evaluate the semantic correctness of retrieved information.

Evaluate based on these criteria:
1. Entity Accuracy: Are the key entities correctly identified?
2. Relation Correctness: Are the relationships between entities accurate?
3. Graph Completeness: Does the retrieval capture the essential graph structure?
4. Contextual Relevance: Is the information relevant to the query context?

Provide scores from 0.0 to 1.0 for each criterion, and an overall score.

Also detect these failure modes:
- Paraphrase Penalty: Penalizing correct answers that use different wording
- Negation Trap: Misinterpreting negation in the query or answer
- Hallucination: Including information not present in the expected answer
- Irrelevance: Providing information unrelated to the query

Output format:
SCORE: <overall_score>
REASONING: <brief explanation>
CRITERIA: {"entity_accuracy": <score>, "relation_correctness": <score>, "graph_completeness": <score>, "contextual_relevance": <score>}
CONFIDENCE: <confidence_0_to_1>
ISSUES: [{"type": "<issue_type>", "description": "<desc>", "severity": "<low|medium|high>"}]`,
  evaluationCriteria: [
    "entity_accuracy",
    "relation_correctness",
    "graph_completeness",
    "contextual_relevance",
  ],
};

/**
 * Nemoriルーブリック: エピソード記憶重視の評価基準
 * @summary 時系列・因果関係に基づく評価
 */
const NEMORI_RUBRIC: EvaluationPrompt = {
  rubric: "nemori",
  systemPrompt: `You are an expert evaluator for episodic memory systems. Your task is to evaluate the semantic correctness of retrieved episodic information.

Evaluate based on these criteria:
1. Temporal Accuracy: Is the timing/sequence of events correct?
2. Causal Correctness: Are cause-effect relationships accurately represented?
3. Episode Completeness: Does the retrieval capture the essential episode elements?
4. Narrative Coherence: Is the information coherent as a narrative?

Provide scores from 0.0 to 1.0 for each criterion, and an overall score.

Also detect these failure modes:
- Paraphrase Penalty: Penalizing correct answers that use different wording
- Negation Trap: Misinterpreting negation in the query or answer
- Hallucination: Including information not present in the expected answer
- Irrelevance: Providing information unrelated to the query

Output format:
SCORE: <overall_score>
REASONING: <brief explanation>
CRITERIA: {"temporal_accuracy": <score>, "causal_correctness": <score>, "episode_completeness": <score>, "narrative_coherence": <score>}
CONFIDENCE: <confidence_0_to_1>
ISSUES: [{"type": "<issue_type>", "description": "<desc>", "severity": "<low|medium|high>"}]`,
  evaluationCriteria: [
    "temporal_accuracy",
    "causal_correctness",
    "episode_completeness",
    "narrative_coherence",
  ],
};

/**
 * SimpleMemルーブリック: シンプルな関連性評価
 * @summary 基本的な関連性と正確性の評価
 */
const SIMPLEMEM_RUBRIC: EvaluationPrompt = {
  rubric: "simplemem",
  systemPrompt: `You are an expert evaluator for simple memory retrieval systems. Your task is to evaluate the semantic correctness of retrieved information.

Evaluate based on these criteria:
1. Relevance: Is the retrieved information relevant to the query?
2. Accuracy: Is the information factually correct?
3. Completeness: Does it cover the key points needed to answer the query?
4. Conciseness: Is the information appropriately focused?

Provide scores from 0.0 to 1.0 for each criterion, and an overall score.

Also detect these failure modes:
- Paraphrase Penalty: Penalizing correct answers that use different wording
- Negation Trap: Misinterpreting negation in the query or answer
- Hallucination: Including information not present in the expected answer
- Irrelevance: Providing information unrelated to the query

Output format:
SCORE: <overall_score>
REASONING: <brief explanation>
CRITERIA: {"relevance": <score>, "accuracy": <score>, "completeness": <score>, "conciseness": <score>}
CONFIDENCE: <confidence_0_to_1>
ISSUES: [{"type": "<issue_type>", "description": "<desc>", "severity": "<low|medium|high>"}]`,
  evaluationCriteria: [
    "relevance",
    "accuracy",
    "completeness",
    "conciseness",
  ],
};

// ============================================================================
// Core Functions
// ============================================================================

/**
 * 指定されたルーブリックの評価プロンプトを取得
 *
 * @summary ルーブリックに対応する評価プロンプトを返す
 * @param rubric - ルーブリック種別
 * @returns 評価プロンプト
 * @throws Error カスタムルーブリックが指定された場合
 */
export function getEvaluationPrompt(rubric: EvaluationRubric): EvaluationPrompt {
  switch (rubric) {
    case "magma":
      return MAGMA_RUBRIC;
    case "nemori":
      return NEMORI_RUBRIC;
    case "simplemem":
      return SIMPLEMEM_RUBRIC;
    case "custom":
      throw new Error("Custom rubric requires explicit prompt definition");
    default:
      throw new Error(`Unknown rubric: ${rubric}`);
  }
}

/**
 * セマンティック正確性を評価
 *
 * @summary LLM-as-a-Judgeを使用してセマンティックな正確性を評価
 * @param query - 元のクエリ
 * @param retrieved - 検索された情報
 * @param expected - 期待される正解
 * @param rubric - 使用するルーブリック
 * @param llmCall - LLM呼び出し関数（オプション）
 * @returns セマンティック評価結果
 */
export async function evaluateSemanticCorrectness(
  query: string,
  retrieved: string,
  expected: string,
  rubric: EvaluationRubric,
  llmCall?: LlmCallFunction
): Promise<SemanticEvaluationResult> {
  const queryId = `query-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const evalPrompt = getEvaluationPrompt(rubric);

  const userPrompt = `Query: ${query}

Retrieved Information:
${retrieved}

Expected Answer:
${expected}

Please evaluate the semantic correctness of the retrieved information.`;

  if (llmCall) {
    try {
      const response = await llmCall(evalPrompt.systemPrompt, userPrompt, {
        timeoutMs: 30000,
      });
      return parseLlmResponse(queryId, rubric, response);
    } catch (error) {
      // LLM呼び出し失敗時はデフォルト値を返す
      return createDefaultResult(queryId, rubric, String(error));
    }
  }

  // モック評価（テスト用）
  return mockEvaluation(queryId, rubric, query, retrieved, expected);
}

/**
 * F1スコアを計算
 *
 * @summary 語彙的重複に基づくF1スコアを計算
 * @param retrieved - 検索されたテキスト
 * @param expected - 期待されるテキスト
 * @returns F1スコア (0-1)
 */
export function calculateF1Score(retrieved: string, expected: string): number {
  const retrievedTokens = tokenize(retrieved);
  const expectedTokens = tokenize(expected);

  if (retrievedTokens.size === 0 || expectedTokens.size === 0) {
    return 0;
  }

  // 共通トークン数を計算
  const commonTokens = new Set(
    [...retrievedTokens].filter((token) => expectedTokens.has(token))
  );

  const precision = commonTokens.size / retrievedTokens.size;
  const recall = commonTokens.size / expectedTokens.size;

  if (precision + recall === 0) {
    return 0;
  }

  return (2 * precision * recall) / (precision + recall);
}

/**
 * 比較レポートを生成
 *
 * @summary F1スコアとセマンティックスコアの比較レポートを生成
 * @param results - セマンティック評価結果のリスト
 * @param f1Scores - F1スコアのリスト
 * @returns 比較レポートのリスト
 */
export function generateComparisonReport(
  results: SemanticEvaluationResult[],
  f1Scores: number[]
): ComparisonReport[] {
  // クエリIDでグループ化
  const groupedResults = new Map<string, SemanticEvaluationResult[]>();
  for (const result of results) {
    const existing = groupedResults.get(result.queryId) || [];
    existing.push(result);
    groupedResults.set(result.queryId, existing);
  }

  const queryIds = [...new Set(results.map((r) => r.queryId))];

  if (queryIds.length !== f1Scores.length) {
    throw new Error(
      `Number of unique queries (${queryIds.length}) must match F1 scores count (${f1Scores.length})`
    );
  }

  const reports: ComparisonReport[] = [];

  // F1スコアでランキング
  const f1Ranking = rankScores(f1Scores);

  for (let i = 0; i < queryIds.length; i++) {
    const queryId = queryIds[i];
    const queryResults = groupedResults.get(queryId) || [];
    const f1Score = f1Scores[i];

    // セマンティックスコアを収集
    const semanticScores: Record<EvaluationRubric, number> = {
      magma: 0,
      nemori: 0,
      simplemem: 0,
      custom: 0,
    };

    for (const result of queryResults) {
      semanticScores[result.rubric] = result.score;
    }

    // セマンティックスコアでランキング
    const semanticRanking = rankSemanticScores(results, i);

    // ミスマライメント検出
    const misalignment = detectMisalignment(
      f1Ranking[i],
      semanticRanking,
      f1Score,
      semanticScores
    );

    reports.push({
      queryId,
      f1Score,
      semanticScores,
      ranking: {
        byF1: f1Ranking[i],
        bySemantic: semanticRanking,
      },
      misalignment,
    });
  }

  return reports;
}

/**
 * ルーブリック間の一貫性をチェック
 *
 * @summary 複数ルーブリックの評価結果間の一貫性を計算
 * @param results - セマンティック評価結果のリスト
 * @returns 一貫性スコア (0-1, 1が完全に一貫)
 */
export function checkRubricConsistency(
  results: SemanticEvaluationResult[]
): number {
  if (results.length < 2) {
    return 1; // 単一ルーブリックの場合は完全に一貫
  }

  // クエリIDでグループ化
  const groupedResults = new Map<string, SemanticEvaluationResult[]>();
  for (const result of results) {
    const existing = groupedResults.get(result.queryId) || [];
    existing.push(result);
    groupedResults.set(result.queryId, existing);
  }

  let totalConsistency = 0;
  let groupCount = 0;

  for (const [, queryResults] of groupedResults) {
    if (queryResults.length < 2) continue;

    const scores = queryResults.map((r) => r.score);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance =
      scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / scores.length;

    // 分散が小さいほど一貫性が高い（最大分散0.25で0、分散0で1）
    const consistency = Math.max(0, 1 - variance * 4);
    totalConsistency += consistency;
    groupCount++;
  }

  return groupCount > 0 ? totalConsistency / groupCount : 1;
}

/**
 * デフォルトの評価設定を取得
 *
 * @summary 標準的な評価設定を返す
 * @returns デフォルト評価設定
 */
export function getDefaultEvaluationConfig(): EvaluationConfig {
  return {
    rubrics: ["magma", "nemori", "simplemem"],
    consistencyThreshold: 0.7,
    detectFailureModes: true,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * テキストをトークン化
 * @summary 小文字化・句読点除去でトークンセットを生成
 */
function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 0)
  );
}

/**
 * LLMレスポンスをパース
 * @summary LLM出力から構造化データを抽出
 */
function parseLlmResponse(
  queryId: string,
  rubric: EvaluationRubric,
  response: string
): SemanticEvaluationResult {
  // スコア抽出
  const scoreMatch = response.match(/SCORE:\s*([\d.]+)/);
  const score = scoreMatch ? parseFloat(scoreMatch[1]) : 0.5;

  // 理由抽出
  const reasoningMatch = response.match(/REASONING:\s*(.+?)(?=CRITERIA:|CONFIDENCE:|ISSUES:|$)/s);
  const reasoning = reasoningMatch ? reasoningMatch[1].trim() : "No reasoning provided";

  // 基準スコア抽出
  const criteriaMatch = response.match(/CRITERIA:\s*(\{[\s\S]+?\})/);
  let criteriaScores: Record<string, number> = {};
  if (criteriaMatch) {
    try {
      criteriaScores = JSON.parse(criteriaMatch[1]);
    } catch {
      criteriaScores = {};
    }
  }

  // 信頼度抽出
  const confidenceMatch = response.match(/CONFIDENCE:\s*([\d.]+)/);
  const confidence = confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.5;

  // 問題抽出
  const issuesMatch = response.match(/ISSUES:\s*(\[[\s\S]+?\])/);
  let detectedIssues: DetectedIssue[] = [];
  if (issuesMatch) {
    try {
      detectedIssues = JSON.parse(issuesMatch[1]);
    } catch {
      detectedIssues = [];
    }
  }

  return {
    queryId,
    rubric,
    score: Math.min(1, Math.max(0, score)),
    reasoning,
    criteriaScores,
    confidence: Math.min(1, Math.max(0, confidence)),
    detectedIssues,
  };
}

/**
 * デフォルト結果を生成
 * @summary LLM呼び出し失敗時のフォールバック
 */
function createDefaultResult(
  queryId: string,
  rubric: EvaluationRubric,
  error: string
): SemanticEvaluationResult {
  return {
    queryId,
    rubric,
    score: 0,
    reasoning: `Evaluation failed: ${error}`,
    criteriaScores: {},
    confidence: 0,
    detectedIssues: [
      {
        type: "irrelevance",
        description: "Could not evaluate due to LLM error",
        severity: "high",
      },
    ],
  };
}

/**
 * モック評価（テスト用）
 * @summary LLMなしでの簡易評価
 */
function mockEvaluation(
  queryId: string,
  rubric: EvaluationRubric,
  query: string,
  retrieved: string,
  expected: string
): SemanticEvaluationResult {
  const evalPrompt = getEvaluationPrompt(rubric);

  // 簡易スコア計算（語彙的重複 + 長さ考慮）
  const queryTokens = tokenize(query);
  const retrievedTokens = tokenize(retrieved);
  const expectedTokens = tokenize(expected);

  // 共通トークン比率
  const queryOverlap =
    [...queryTokens].filter((t) => retrievedTokens.has(t)).length /
    Math.max(queryTokens.size, 1);
  const expectedOverlap =
    [...expectedTokens].filter((t) => retrievedTokens.has(t)).length /
    Math.max(expectedTokens.size, 1);

  // 長さの比率（期待値に対して）
  const lengthRatio = Math.min(
    retrievedTokens.size / Math.max(expectedTokens.size, 1),
    1
  );

  // 総合スコア
  const score = (queryOverlap * 0.3 + expectedOverlap * 0.5 + lengthRatio * 0.2);

  // 基準スコア（簡易版）
  const criteriaScores: Record<string, number> = {};
  for (const criterion of evalPrompt.evaluationCriteria) {
    criteriaScores[criterion] = score * (0.8 + Math.random() * 0.4);
  }

  // 失敗モード検出（簡易版）
  const detectedIssues: DetectedIssue[] = [];

  // Negation Trap検出
  const negationWords = ["not", "no", "never", "don't", "doesn't", "isn't", "aren't"];
  const hasNegationInQuery = negationWords.some((w) => query.toLowerCase().includes(w));
  const hasNegationInRetrieved = negationWords.some((w) =>
    retrieved.toLowerCase().includes(w)
  );
  if (hasNegationInQuery && !hasNegationInRetrieved) {
    detectedIssues.push({
      type: "negation_trap",
      description: "Query contains negation but retrieved content may not reflect this",
      severity: "medium",
    });
  }

  // Paraphrase Penalty検出（語彙的重複が低いが内容が正しい可能性）
  if (expectedOverlap < 0.3 && lengthRatio > 0.5) {
    detectedIssues.push({
      type: "paraphrase_penalty",
      description: "Low lexical overlap but potentially correct paraphrase",
      severity: "low",
    });
  }

  return {
    queryId,
    rubric,
    score: Math.min(1, Math.max(0, score)),
    reasoning: `Mock evaluation based on lexical overlap. Query overlap: ${queryOverlap.toFixed(2)}, Expected overlap: ${expectedOverlap.toFixed(2)}`,
    criteriaScores,
    confidence: 0.5, // モック評価は低信頼度
    detectedIssues,
  };
}

/**
 * スコアのランキングを計算
 * @summary スコア配列から順位配列を生成
 */
function rankScores(scores: number[]): number[] {
  const sorted = [...scores].sort((a, b) => b - a);
  return scores.map((s) => sorted.indexOf(s) + 1);
}

/**
 * セマンティックスコアのランキングを計算
 * @summary 特定インデックスのセマンティック順位を計算
 */
function rankSemanticScores(
  results: SemanticEvaluationResult[],
  index: number
): Record<EvaluationRubric, number> {
  const rubrics: EvaluationRubric[] = ["magma", "nemori", "simplemem", "custom"];
  const ranking: Record<EvaluationRubric, number> = {
    magma: 0,
    nemori: 0,
    simplemem: 0,
    custom: 0,
  };

  for (const rubric of rubrics) {
    const rubricScores = results
      .filter((r) => r.rubric === rubric)
      .map((r) => r.score);
    if (rubricScores.length > index) {
      const sorted = [...rubricScores].sort((a, b) => b - a);
      ranking[rubric] = sorted.indexOf(rubricScores[index]) + 1;
    }
  }

  return ranking;
}

/**
 * ミスマライメントを検出
 * @summary F1とセマンティックの順位が大きく異なるかチェック
 */
function detectMisalignment(
  f1Rank: number,
  semanticRanking: Record<EvaluationRubric, number>,
  f1Score: number,
  semanticScores: Record<EvaluationRubric, number>
): boolean {
  // F1が低い（順位が高い = 数値が小さい）がセマンティックが高い場合
  const avgSemanticScore =
    (semanticScores.magma + semanticScores.nemori + semanticScores.simplemem) / 3;

  // F1 < 0.3 だがセマンティック > 0.7 の場合、ミスマライメント
  if (f1Score < 0.3 && avgSemanticScore > 0.7) {
    return true;
  }

  // F1 > 0.7 だがセマンティック < 0.3 の場合もミスマライメント
  if (f1Score > 0.7 && avgSemanticScore < 0.3) {
    return true;
  }

  return false;
}
