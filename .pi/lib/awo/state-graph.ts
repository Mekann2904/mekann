/**
 * @abdd.meta
 * path: .pi/lib/awo/state-graph.ts
 * role: AWO State Graph構築システム
 * why: トレースからState Graphを構築し、等価状態をマージする
 * related: .pi/lib/awo/types.ts, .pi/lib/awo/trace-collector.ts, .pi/lib/awo/meta-tool-extractor.ts
 * public_api: StateGraphBuilder, DefaultMergeRules
 * invariants: StateGraphはDAG、ルートノードは一意
 * side_effects: なし（純粋計算）
 * failure_modes: 空トレース入力、循環検出
 * @abdd.explain
 * overview: トレースからState Graphを構築・マージするシステム
 * what_it_does:
 *   - 複数トレースの統合グラフ構築
 *   - 等価状態の判定とマージ
 *   - エッジ重みの計算
 *   - グラフ圧縮
 * why_it_exists: メタツール抽出のためのデータ構造を提供
 * scope:
 *   in: Trace[], MergeRule[]
 *   out: StateGraph, MergedStateGraph
 */

import {
  type Trace,
  type ToolCall,
  type StateNode,
  type StateEdge,
  type StateGraph,
  type MergedStateGraph,
  type MergeRule,
  DEFAULT_AWO_CONFIG,
  type AWOConfig,
} from "./types.js";

// =============================================================================
// デフォルトマージルール
// =============================================================================

/**
 * デフォルトマージルール
 * @summary 一般的な等価状態判定ルール
 */
export const DefaultMergeRules: MergeRule[] = [
  {
    name: "identical-history",
    description: "ツール呼び出し履歴が完全に一致する状態をマージ",
    condition: (node1, node2) => {
      if (node1.toolCallHistory.length !== node2.toolCallHistory.length) {
        return false;
      }
      return node1.toolCallHistory.every(
        (tool, i) => tool === node2.toolCallHistory[i]
      );
    },
  },
  {
    name: "commutative-reads",
    description: "読み取り専用ツールの順序違いを許容",
    condition: (node1, node2) => {
      // 長さが同じで、ソート後に一致する場合は等価
      if (node1.toolCallHistory.length !== node2.toolCallHistory.length) {
        return false;
      }
      const sorted1 = [...node1.toolCallHistory].sort();
      const sorted2 = [...node2.toolCallHistory].sort();
      return sorted1.every((tool, i) => tool === sorted2[i]);
    },
  },
];

// =============================================================================
// StateGraphBuilder クラス
// =============================================================================

/**
 * State Graphビルダー
 * @summary トレースからState Graphを構築
 */
export class StateGraphBuilder {
  private config: AWOConfig["extraction"];
  private mergeRules: MergeRule[];

  /**
   * コンストラクタ
   * @summary StateGraphBuilderを初期化
   * @param config 抽出設定
   * @param mergeRules マージルール
   */
  constructor(
    config: AWOConfig["extraction"] = DEFAULT_AWO_CONFIG.extraction,
    mergeRules: MergeRule[] = DefaultMergeRules
  ) {
    this.config = config;
    this.mergeRules = mergeRules;
  }

  // ===========================================================================
  // パブリックメソッド
  // ===========================================================================

  /**
   * トレースからState Graphを構築
   * @summary 複数トレースを統合してグラフ化
   * @param traces トレース配列
   * @returns State Graph
   */
  buildGraph(traces: Trace[]): StateGraph {
    const nodes = new Map<string, StateNode>();
    const edges: StateEdge[] = [];
    const rootId = "root";

    // ルートノードを作成
    nodes.set(rootId, {
      id: rootId,
      toolCallHistory: [],
      isRoot: true,
      visitCount: traces.length,
    });

    // 各トレースを処理
    for (const trace of traces) {
      this.processTrace(trace, nodes, edges, rootId);
    }

    return {
      nodes,
      edges,
      rootId,
      traceCount: traces.length,
    };
  }

  /**
   * 等価状態をマージ
   * @summary マージルールを適用してグラフを圧縮
   * @param graph 元のグラフ
   * @returns マージ済みグラフ
   */
  mergeEquivalentStates(graph: StateGraph): MergedStateGraph {
    const mergedNodes = new Map<string, StateNode>();
    const mergedEdges: StateEdge[] = [];
    const nodeMapping = new Map<string, string>(); // oldId -> newId

    // ノードをマージ
    const originalNodeCount = graph.nodes.size;

    for (const [nodeId, node] of graph.nodes) {
      if (node.isRoot) {
        // ルートノードはそのまま
        mergedNodes.set(nodeId, { ...node });
        nodeMapping.set(nodeId, nodeId);
        continue;
      }

      // 既存のマージ済みノードと比較
      let merged = false;
      for (const [existingId, existingNode] of mergedNodes) {
        if (this.shouldMerge(node, existingNode)) {
          // 既存ノードに統合
          existingNode.visitCount += node.visitCount;
          nodeMapping.set(nodeId, existingId);
          merged = true;
          break;
        }
      }

      if (!merged) {
        // 新規ノードとして追加
        mergedNodes.set(nodeId, { ...node });
        nodeMapping.set(nodeId, nodeId);
      }
    }

    // エッジをマージ
    const edgeMap = new Map<string, StateEdge>();

    for (const edge of graph.edges) {
      const newFrom = nodeMapping.get(edge.from) ?? edge.from;
      const newTo = nodeMapping.get(edge.to) ?? edge.to;
      const edgeKey = `${newFrom}->${newTo}:${edge.toolName}`;

      const existing = edgeMap.get(edgeKey);
      if (existing) {
        existing.weight += edge.weight;
      } else {
        edgeMap.set(edgeKey, {
          from: newFrom,
          to: newTo,
          toolName: edge.toolName,
          weight: edge.weight,
        });
      }
    }

    mergedEdges.push(...edgeMap.values());

    const mergedNodeCount = mergedNodes.size;

    return {
      nodes: mergedNodes,
      edges: mergedEdges,
      rootId: graph.rootId,
      traceCount: graph.traceCount,
      mergeRules: this.mergeRules,
      mergeStats: {
        originalNodes: originalNodeCount,
        mergedNodes: mergedNodeCount,
        reductionRate: 1 - mergedNodeCount / originalNodeCount,
      },
    };
  }

  /**
   * グラフを可視化用データに変換
   * @summary デバッグ用にグラフ構造を文字列化
   * @param graph グラフ
   * @returns 可視化用文字列
   */
  visualize(graph: StateGraph | MergedStateGraph): string {
    const lines: string[] = [];
    lines.push(`State Graph (traces: ${graph.traceCount})`);
    lines.push(`Nodes: ${graph.nodes.size}, Edges: ${graph.edges.length}`);
    lines.push("");

    // ノード一覧
    lines.push("Nodes:");
    for (const [id, node] of graph.nodes) {
      const history = node.toolCallHistory.join(" -> ");
      lines.push(`  ${id}: [${history}] (visits: ${node.visitCount})`);
    }

    lines.push("");

    // エッジ一覧（重み順）
    lines.push("Edges (sorted by weight):");
    const sortedEdges = [...graph.edges].sort((a, b) => b.weight - a.weight);
    for (const edge of sortedEdges.slice(0, 20)) {
      lines.push(
        `  ${edge.from} -> ${edge.to} [${edge.toolName}] (weight: ${edge.weight})`
      );
    }

    if ("mergeStats" in graph) {
      lines.push("");
      lines.push("Merge Stats:");
      lines.push(`  Original nodes: ${graph.mergeStats.originalNodes}`);
      lines.push(`  Merged nodes: ${graph.mergeStats.mergedNodes}`);
      lines.push(`  Reduction: ${(graph.mergeStats.reductionRate * 100).toFixed(1)}%`);
    }

    return lines.join("\n");
  }

  // ===========================================================================
  // プライベートメソッド
  // ===========================================================================

  /**
   * トレースを処理
   * @summary 単一トレースをグラフに追加
   */
  private processTrace(
    trace: Trace,
    nodes: Map<string, StateNode>,
    edges: StateEdge[],
    rootId: string
  ): void {
    let currentNodeId = rootId;
    const history: string[] = [];

    for (const toolCall of trace.toolCalls) {
      history.push(toolCall.toolName);

      // ノードIDを生成
      const nodeId = this.generateNodeId(history);

      // ノードが存在しない場合は作成
      if (!nodes.has(nodeId)) {
        nodes.set(nodeId, {
          id: nodeId,
          toolCallHistory: [...history],
          isRoot: false,
          visitCount: 0,
        });
      }

      // ノードの訪問回数を増加
      const node = nodes.get(nodeId)!;
      node.visitCount++;

      // エッジを追加または更新
      this.addEdge(edges, currentNodeId, nodeId, toolCall);

      currentNodeId = nodeId;
    }
  }

  /**
   * エッジを追加
   * @summary エッジを追加または重みを更新
   */
  private addEdge(
    edges: StateEdge[],
    from: string,
    to: string,
    toolCall: ToolCall
  ): void {
    // 既存エッジを検索
    const existing = edges.find(
      (e) => e.from === from && e.to === to && e.toolName === toolCall.toolName
    );

    if (existing) {
      existing.weight++;
    } else {
      edges.push({
        from,
        to,
        toolName: toolCall.toolName,
        weight: 1,
      });
    }
  }

  /**
   * ノードIDを生成
   * @summary ツール履歴からノードIDを生成
   */
  private generateNodeId(history: string[]): string {
    return `node-${history.join("-")}`;
  }

  /**
   * マージすべきか判定
   * @summary 2つのノードが等価か判定
   */
  private shouldMerge(node1: StateNode, node2: StateNode): boolean {
    // 全てのマージルールをチェック
    for (const rule of this.mergeRules) {
      if (rule.condition(node1, node2)) {
        return true;
      }
    }
    return false;
  }
}

// =============================================================================
// ユーティリティ関数
// =============================================================================

/**
 * グラフから高頻度パスを抽出
 * @summary 重みの高いパスを特定
 * @param graph マージ済みグラフ
 * @param threshold 最小重み閾値
 * @returns 高頻度エッジ配列
 */
export function extractHighFrequencyPaths(
  graph: MergedStateGraph,
  threshold: number
): StateEdge[] {
  return graph.edges
    .filter((e) => e.weight >= threshold)
    .sort((a, b) => b.weight - a.weight);
}

/**
 * グラフ統計を計算
 * @summary グラフの統計情報を返す
 * @param graph グラフ
 * @returns 統計情報
 */
export function getGraphStats(graph: StateGraph | MergedStateGraph): {
  nodeCount: number;
  edgeCount: number;
  avgOutDegree: number;
  maxEdgeWeight: number;
  totalWeight: number;
} {
  const outDegrees = new Map<string, number>();
  let maxWeight = 0;
  let totalWeight = 0;

  for (const edge of graph.edges) {
    const current = outDegrees.get(edge.from) ?? 0;
    outDegrees.set(edge.from, current + 1);
    maxWeight = Math.max(maxWeight, edge.weight);
    totalWeight += edge.weight;
  }

  const avgOutDegree = graph.nodes.size > 0
    ? Array.from(outDegrees.values()).reduce((a, b) => a + b, 0) / graph.nodes.size
    : 0;

  return {
    nodeCount: graph.nodes.size,
    edgeCount: graph.edges.length,
    avgOutDegree,
    maxEdgeWeight: maxWeight,
    totalWeight,
  };
}
