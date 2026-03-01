/**
 * @abdd.meta
 * path: .pi/lib/awo/meta-tool-extractor.ts
 * role: AWO メタツール抽出システム
 * why: State Graphから頻出パターンを抽出し、メタツール候補を生成
 * related: .pi/lib/awo/types.ts, .pi/lib/awo/state-graph.ts, .pi/lib/awo/meta-tool-registry.ts
 * public_api: MetaToolExtractor, extractMetaToolCandidates
 * invariants: 抽出閾値以上の頻度パターンのみを候補とする
 * side_effects: なし（純粋計算）
 * failure_modes: 空グラフ入力、閾値過大で候補なし
 * @abdd.explain
 * overview: Algorithm 1を実装し、メタツール候補を抽出
 * what_it_does:
 *   - State Graphから高頻度パスを検出
 *   - ツールシーケンスを候補として抽出
 *   - 削減効果を推算
 *   - メタツール定義を生成
 * why_it_exists: 繰り返しパターンを自動検出して効率化
 * scope:
 *   in: MergedStateGraph, threshold
 *   out: MetaToolCandidate[], MetaToolDefinition
 */

import {
  type StateEdge,
  type MergedStateGraph,
  type MetaToolCandidate,
  type MetaToolDefinition,
  DEFAULT_AWO_CONFIG,
  type AWOConfig,
} from "./types.js";

// =============================================================================
// MetaToolExtractor クラス
// =============================================================================

/**
 * メタツール抽出器
 * @summary Algorithm 1を実装してメタツール候補を抽出
 */
export class MetaToolExtractor {
  private config: AWOConfig["extraction"];

  /**
   * コンストラクタ
   * @summary MetaToolExtractorを初期化
   * @param config 抽出設定
   */
  constructor(config: AWOConfig["extraction"] = DEFAULT_AWO_CONFIG.extraction) {
    this.config = config;
  }

  // ===========================================================================
  // パブリックメソッド
  // ===========================================================================

  /**
   * メタツール候補を抽出
   * @summary Algorithm 1を実行して候補を抽出
   * @param graph マージ済みState Graph
   * @returns 候補配列
   */
  extractCandidates(graph: MergedStateGraph): MetaToolCandidate[] {
    const candidates: MetaToolCandidate[] = [];
    const processedPaths = new Set<string>();

    // 重みでソートしたエッジリスト
    const sortedEdges = [...graph.edges]
      .filter((e) => e.weight >= this.config.threshold)
      .sort((a, b) => b.weight - a.weight);

    // 各エッジから開始してチェーンを構築
    for (const startEdge of sortedEdges) {
      const pathKey = this.getPathKey([startEdge]);

      if (processedPaths.has(pathKey)) {
        continue;
      }

      // チェーンを構築
      const chain = this.buildChain(graph, startEdge);

      if (chain.length >= this.config.minFrequency) {
        const candidate = this.createCandidate(chain, graph);
        candidates.push(candidate);
        processedPaths.add(pathKey);
      }
    }

    // 信頼度でフィルタリング
    const filtered = candidates.filter(
      (c) => c.confidence >= this.config.minConfidence
    );

    // 推定削減効果でソート
    filtered.sort((a, b) => b.savingsEstimate - a.savingsEstimate);

    return filtered;
  }

  /**
   * メタツール定義を生成
   * @summary 候補から実際のツール定義を生成
   * @param candidate 候補
   * @returns メタツール定義
   */
  generateTool(candidate: MetaToolCandidate): MetaToolDefinition {
    const name = this.generateToolName(candidate);
    const description = this.generateDescription(candidate);
    const parameters = this.inferParameters(candidate);
    const implementation = this.generateImplementation(candidate);

    return {
      name,
      description,
      parameters,
      implementation,
      sourcePattern: candidate.toolSequence,
      createdAt: Date.now(),
      usageCount: 0,
    };
  }

  /**
   * 削減効果を推算
   * @summary メタツール導入によるLLM呼び出し削減数を推算
   * @param candidate 候補
   * @returns 削減推定数
   */
  estimateSavings(candidate: MetaToolCandidate): number {
    // ツール数 - 1（メタツールで1回にまとまる）
    const stepsPerExecution = candidate.toolSequence.length - 1;
    return stepsPerExecution * candidate.frequency;
  }

  // ===========================================================================
  // プライベートメソッド
  // ===========================================================================

  /**
   * チェーンを構築
   * @summary 開始エッジから連続する高頻度パスを構築
   */
  private buildChain(
    graph: MergedStateGraph,
    startEdge: StateEdge
  ): StateEdge[] {
    const chain: StateEdge[] = [startEdge];
    let currentEdge = startEdge;

    while (chain.length < this.config.maxToolLength) {
      // 次のエッジを探す
      const nextEdge = this.findNextEdge(graph, currentEdge);

      if (!nextEdge) {
        break;
      }

      chain.push(nextEdge);
      currentEdge = nextEdge;
    }

    return chain;
  }

  /**
   * 次のエッジを探す
   * @summary 現在のエッジから続く高頻度エッジを探す
   */
  private findNextEdge(
    graph: MergedStateGraph,
    currentEdge: StateEdge
  ): StateEdge | null {
    // 現在のエッジの終点から始まるエッジを探す
    const candidates = graph.edges.filter(
      (e) =>
        e.from === currentEdge.to &&
        e.weight >= this.config.threshold &&
        e.weight > 1 // 少なくとも2回以上出現
    );

    if (candidates.length === 0) {
      return null;
    }

    // 最も重みが高いエッジを選択
    candidates.sort((a, b) => b.weight - a.weight);
    return candidates[0];
  }

  /**
   * 候補を作成
   * @summary エッジチェーンから候補を作成
   */
  private createCandidate(
    chain: StateEdge[],
    graph: MergedStateGraph
  ): MetaToolCandidate {
    const toolSequence = chain.map((edge) => ({
      toolName: edge.toolName,
      sampleArguments: {},
    }));

    // 最小重みを出現頻度として使用
    const frequency = Math.min(...chain.map((e) => e.weight));

    // 信頼度を計算（重みの一貫性）
    const weights = chain.map((e) => e.weight);
    const avgWeight = weights.reduce((a, b) => a + b, 0) / weights.length;
    const variance =
      weights.reduce((sum, w) => sum + Math.pow(w - avgWeight, 2), 0) /
      weights.length;
    const confidence = Math.max(0, 1 - variance / (avgWeight * avgWeight));

    // 削減推定
    const savingsEstimate = (chain.length - 1) * frequency;

    return {
      id: `candidate-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      toolSequence,
      frequency,
      savingsEstimate,
      confidence,
      sourceGraphId: graph.rootId,
    };
  }

  /**
   * パスキーを生成
   * @summary チェーンの一意キーを生成
   */
  private getPathKey(chain: StateEdge[]): string {
    return chain.map((e) => e.toolName).join("->");
  }

  /**
   * ツール名を生成
   * @summary 候補からメタツール名を生成
   */
  private generateToolName(candidate: MetaToolCandidate): string {
    const tools = candidate.toolSequence.map((t) => {
      // ツール名から動詞部分を抽出
      const parts = t.toolName.split("_");
      return parts[parts.length - 1] || t.toolName;
    });

    // キャメルケースに変換
    const name = tools
      .map((t, i) => (i === 0 ? t : t.charAt(0).toUpperCase() + t.slice(1)))
      .join("");

    return `meta_${name}`;
  }

  /**
   * 説明を生成
   * @summary 候補からツール説明を生成
   */
  private generateDescription(candidate: MetaToolCandidate): string {
    const toolNames = candidate.toolSequence.map((t) => t.toolName).join(", ");
    return `Combined operation: ${toolNames}. ` +
      `This meta-tool bundles ${candidate.toolSequence.length} tool calls into a single invocation. ` +
      `Frequency: ${candidate.frequency}, Estimated savings: ${candidate.savingsEstimate} LLM calls.`;
  }

  /**
   * パラメータを推論
   * @summary 候補からパラメータスキーマを推論
   */
  private inferParameters(
    candidate: MetaToolDefinition["sourcePattern"]
  ): MetaToolDefinition["parameters"] {
    // 簡易実装: 各ツールの引数を収集
    const properties: Record<string, { type: string; description: string }> = {};

    for (let i = 0; i < candidate.length; i++) {
      const tool = candidate[i];
      const prefix = `step${i + 1}_`;

      // サンプル引数から推論
      for (const [key, value] of Object.entries(tool.sampleArguments)) {
        const paramKey = `${prefix}${key}`;
        const type = typeof value;

        properties[paramKey] = {
          type: type === "number" ? "number" : "string",
          description: `Parameter '${key}' for ${tool.toolName}`,
        };
      }
    }

    return {
      type: "object",
      properties,
    };
  }

  /**
   * 実装コードを生成
   * @summary 候補からTypeScript実装を生成
   */
  private generateImplementation(candidate: MetaToolDefinition["sourcePattern"]): string {
    const calls = candidate
      .map((tool, i) => {
        return `  // Step ${i + 1}: ${tool.toolName}
  const result${i + 1} = await executeTool("${tool.toolName}", params.step${i + 1} || {});`;
      })
      .join("\n\n");

    const returns = candidate
      .map((_, i) => `result${i + 1}`)
      .join(", ");

    return `/**
 * Auto-generated meta-tool
 * Combines ${candidate.length} tool calls
 */
async function execute(params) {
${calls}

  return { ${returns} };
}`;
  }
}

// =============================================================================
// スタンドアロン関数
// =============================================================================

/**
 * メタツール候補を抽出
 * @summary グラフから候補を抽出する便利関数
 * @param graph マージ済みグラフ
 * @param threshold 閾値
 * @returns 候補配列
 */
export function extractMetaToolCandidates(
  graph: MergedStateGraph,
  threshold?: number
): MetaToolCandidate[] {
  const config = { ...DEFAULT_AWO_CONFIG.extraction };
  if (threshold !== undefined) {
    config.threshold = threshold;
  }

  const extractor = new MetaToolExtractor(config);
  return extractor.extractCandidates(graph);
}

/**
 * 候補をツール定義に変換
 * @summary 候補からツール定義を生成する便利関数
 * @param candidate 候補
 * @returns ツール定義
 */
export function candidateToDefinition(
  candidate: MetaToolCandidate
): MetaToolDefinition {
  const extractor = new MetaToolExtractor();
  return extractor.generateTool(candidate);
}
