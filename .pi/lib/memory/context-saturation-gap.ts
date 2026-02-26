/**
 * @abdd.meta
 * path: .pi/lib/memory/context-saturation-gap.ts
 * role: Context Saturation Gap (Δ) 測定モジュール
 * why: メモリシステムの構造的利点を定量的に評価するため
 * related: .pi/skills/alma-memory/SKILL.md, .pi/lib/semantic-repetition.ts
 * public_api: runSaturationTest, measureFullContextBaseline, measureMAGPerformance, calculateSaturationGap, getRecommendation
 * invariants: Δ = MAG - FullContext, スコアは[0,1]範囲
 * side_effects: なし（測定のみ）
 * failure_modes: データ不足で inconclusive
 * @abdd.explain
 * overview: 論文「Anatomy of Agentic Memory」のContext Saturation Gap測定を実装
 * what_it_does:
 *   - Full-Context ベースライン（全データ含む）のパフォーマンス測定
 *   - MAG（Memory-Augmented Generation）パフォーマンス測定
 *   - Δ計算と推奨判定の生成
 * why_it_exists:
 *   - メモリシステムが実際に構造的利点を提供するかを定量的に判断するため
 *   - Δ ≫ 0 の場合のみメモリ使用が正当化される
 * scope:
 *   in: タスク説明、テストデータ、設定
 *   out: SaturationTestResult（スコア、Δ、推奨）
 */

// File: .pi/lib/memory/context-saturation-gap.ts
// Description: Context Saturation Gap (Δ) measurement for agentic memory evaluation.
// Why: Quantifies when memory systems provide structural advantage over full context.
// Related: .pi/skills/alma-memory/SKILL.md

/**
 * Context Saturation Gap (Δ) = Score_MAG - Score_FullContext
 * Δ ≫ 0 の場合のみ、メモリは構造的利点を提供する
 *
 * @summary Context Saturation Gap測定結果
 * @param taskId - テストタスクの一意識別子
 * @param fullContextScore - 全コンテキスト使用時のスコア (0-1)
 * @param magScore - Memory-Augmented Generation使用時のスコア (0-1)
 * @param delta - Context Saturation Gap (MAG - FullContext)
 * @param recommendation - 推奨アクション
 * @param metrics - パフォーマンスメトリクス
 */
export interface SaturationTestResult {
  /** テストタスクの一意識別子 */
  taskId: string;
  /** 全コンテキスト使用時のスコア (0-1) */
  fullContextScore: number;
  /** Memory-Augmented Generation使用時のスコア (0-1) */
  magScore: number;
  /** Context Saturation Gap (MAG - FullContext) */
  delta: number;
  /** 推奨アクション */
  recommendation: "use_memory" | "full_context_sufficient" | "inconclusive";
  /** パフォーマンスメトリクス */
  metrics: {
    /** Full-Context時のトークン数 */
    fullContextTokens: number;
    /** MAG検索時のトークン数 */
    magRetrievalTokens: number;
    /** Full-Context実行レイテンシ (ms) */
    fullContextLatencyMs: number;
    /** MAG実行レイテンシ (ms) */
    magLatencyMs: number;
  };
}

/**
 * @summary Context Saturation Test設定
 * @param task - 実行するタスクの説明
 * @param testData - テスト用データセット
 * @param contextWindowTokens - コンテキストウィンドウのトークン上限
 * @param deltaThreshold - Δの判定閾値（デフォルト 0.1）
 * @param magSystem - 使用するMAGシステム種別
 */
export interface SaturationTestConfig {
  /** 実行するタスクの説明 */
  task: string;
  /** テスト用データセット */
  testData: string[];
  /** コンテキストウィンドウのトークン上限 */
  contextWindowTokens: number;
  /** Δの判定閾値（デフォルト 0.1） */
  deltaThreshold: number;
  /** 使用するMAGシステム種別 */
  magSystem: "semantic-memory" | "entity-centric" | "episodic";
}

/**
 * セマンティックメモリ検索インターフェース
 * @summary セマンティックメモリ検索器
 */
export interface SemanticRetriever {
  /** クエリに基づいて関連データを検索 */
  retrieve(query: string, topK: number): Promise<string[]>;
}

/**
 * パフォーマンス評価器インターフェース
 * @summary タスクパフォーマンス評価器
 */
export interface PerformanceEvaluator {
  /** プロンプトでタスクを実行しスコアを返す (0-1) */
  evaluate(task: string, prompt: string): Promise<number>;
}

/**
 * デフォルトのトークン推定器
 * @summary 文字列からトークン数を推定
 * @param text - 対象テキスト
 * @returns 推定トークン数
 */
export function estimateTokens(text: string): number {
  // 簡易推定: 英語は約4文字=1トークン、日本語は約2文字=1トークン
  const asciiCount = (text.match(/[\x00-\x7F]/g) || []).length;
  const nonAsciiCount = text.length - asciiCount;
  return Math.ceil(asciiCount / 4 + nonAsciiCount / 2);
}

/**
 * Context Saturation Testを実行
 *
 * @summary Δ測定テストを実行
 * @param config - テスト設定
 * @param retriever - セマンティック検索器（オプション）
 * @param evaluator - パフォーマンス評価器（オプション）
 * @returns テスト結果
 */
export async function runSaturationTest(
  config: SaturationTestConfig,
  retriever?: SemanticRetriever,
  evaluator?: PerformanceEvaluator
): Promise<SaturationTestResult> {
  const taskId = `test-${Date.now()}`;

  // Full-Context ベースライン測定
  const { score: fullContextScore, latency: fullContextLatency } =
    await measureFullContextBaseline(config, evaluator);

  // MAG パフォーマンス測定
  const { score: magScore, latency: magLatency, retrievalTokens } =
    await measureMAGPerformance(config, retriever, evaluator);

  // Δ計算
  const delta = calculateSaturationGap(fullContextScore, magScore);

  // 推奨判定
  const recommendation = getRecommendation(delta, config.deltaThreshold);

  // トークン数計算
  const fullContextTokens = estimateTokens(config.testData.join("\n"));

  return {
    taskId,
    fullContextScore,
    magScore,
    delta,
    recommendation,
    metrics: {
      fullContextTokens,
      magRetrievalTokens: retrievalTokens,
      fullContextLatencyMs: fullContextLatency,
      magLatencyMs: magLatency,
    },
  };
}

/**
 * Full-Context ベースラインを測定
 *
 * @summary 全データ含むプロンプトでスコア測定
 * @param config - テスト設定
 * @param evaluator - パフォーマンス評価器
 * @returns スコアとレイテンシ
 */
export async function measureFullContextBaseline(
  config: SaturationTestConfig,
  evaluator?: PerformanceEvaluator
): Promise<{ score: number; latency: number }> {
  const startTime = Date.now();

  // 全データを含むプロンプト構築
  const fullContextPrompt = buildFullContextPrompt(config.task, config.testData);

  let score: number;
  if (evaluator) {
    score = await evaluator.evaluate(config.task, fullContextPrompt);
  } else {
    // モック評価: データ量に反比例する簡易スコア
    // コンテキストが飽和すると性能が低下する仮定
    const dataTokens = estimateTokens(config.testData.join("\n"));
    const saturationRatio = Math.min(dataTokens / config.contextWindowTokens, 1);
    score = Math.max(0, 1 - saturationRatio * 0.5);
  }

  const latency = Date.now() - startTime;
  return { score, latency };
}

/**
 * MAG パフォーマンスを測定
 *
 * @summary メモリ検索を使用したスコア測定
 * @param config - テスト設定
 * @param retriever - セマンティック検索器
 * @param evaluator - パフォーマンス評価器
 * @returns スコア、レイテンシ、検索トークン数
 */
export async function measureMAGPerformance(
  config: SaturationTestConfig,
  retriever?: SemanticRetriever,
  evaluator?: PerformanceEvaluator
): Promise<{ score: number; latency: number; retrievalTokens: number }> {
  const startTime = Date.now();

  let retrievedData: string[];
  let retrievalTokens: number;

  if (retriever) {
    // セマンティック検索で関連データを取得
    retrievedData = await retriever.retrieve(config.task, 5);
    retrievalTokens = estimateTokens(retrievedData.join("\n"));
  } else {
    // モック検索: データの先頭部分を使用
    const topK = Math.min(5, config.testData.length);
    retrievedData = config.testData.slice(0, topK);
    retrievalTokens = estimateTokens(retrievedData.join("\n"));
  }

  // 検索結果でプロンプト構築
  const magPrompt = buildMAGPrompt(config.task, retrievedData);

  let score: number;
  if (evaluator) {
    score = await evaluator.evaluate(config.task, magPrompt);
  } else {
    // モック評価: 関連データのみで効率的に処理
    // MAGは低トークンで高い性能を維持する仮定
    const relevantRatio = retrievalTokens / Math.max(estimateTokens(config.testData.join("\n")), 1);
    score = Math.min(1, 0.7 + (1 - relevantRatio) * 0.3);
  }

  const latency = Date.now() - startTime;
  return { score, latency, retrievalTokens };
}

/**
 * Context Saturation Gap (Δ) を計算
 *
 * @summary Δ = MAG - FullContext
 * @param fullContext - Full-Context スコア
 * @param mag - MAG スコア
 * @returns Context Saturation Gap
 */
export function calculateSaturationGap(
  fullContext: number,
  mag: number
): number {
  return mag - fullContext;
}

/**
 * Δに基づいて推奨を判定
 *
 * @summary Δ値から推奨アクションを返す
 * @param delta - Context Saturation Gap
 * @param threshold - 判定閾値
 * @returns 推奨アクション
 */
export function getRecommendation(
  delta: number,
  threshold: number
): SaturationTestResult["recommendation"] {
  if (delta > threshold) {
    return "use_memory";
  } else if (delta > -threshold) {
    return "inconclusive";
  } else {
    return "full_context_sufficient";
  }
}

/**
 * Full-Context プロンプトを構築
 * @summary 全データを含むプロンプト生成
 */
function buildFullContextPrompt(task: string, data: string[]): string {
  return `Task: ${task}\n\nAvailable Data:\n${data.map((d, i) => `[${i + 1}] ${d}`).join("\n")}\n\nPlease complete the task using all available data.`;
}

/**
 * MAG プロンプトを構築
 * @summary 検索結果を含むプロンプト生成
 */
function buildMAGPrompt(task: string, retrievedData: string[]): string {
  return `Task: ${task}\n\nRelevant Data:\n${retrievedData.map((d, i) => `[${i + 1}] ${d}`).join("\n")}\n\nPlease complete the task using the relevant data above.`;
}
