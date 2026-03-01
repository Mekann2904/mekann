/**
 * @abdd.meta
 * path: .pi/extensions/agent-teams/debate-graph.ts
 * role: スパース議論グラフの構築、更新、メトリクス計算
 * why: エージェント間の議論構造を可視化し、コンセンサス検出を可能にするため
 * related: ./mdm-types.ts, ./mdm-modulator.ts, ./communication-links.ts
 * public_api: DebateGraphBuilder, buildDebateGraph, findConsensusClusters, DEFAULT_SPARSITY
 * invariants: グラフは常にスパース性制約を満たす、エッジ重みは0.0-1.0の範囲
 * side_effects: なし
 * failure_modes: 空の入力に対する空グラフ返却
 * @abdd.explain
 * overview: エージェントチームの議論構造をスパースグラフとして構築・管理するモジュール
 * what_it_does:
 *   - TeamMemberResultから議論グラフ（DebateGraph）を構築する
 *   - MDM状態に基づいてエッジ重みを調整する
 *   - スパース性維持のためプルーニングを実行する
 *   - コンセンサスクラスタを検出する
 *   - グラフメトリクス（密度、クラスタリング、収束スコア）を計算する
 * why_it_exists:
 *   - CortexDebate機能における議論構造の可視化と分析を可能にするため
 *   - 大規模チームでの通信オーバーヘッドを削減するため
 *   - 合意形成プロセスを定量化するため
 * scope:
 *   in: TeamMemberResult配列、MDMState、SparsityConfig
 *   out: DebateGraph、GraphMetrics、コンセンサスクラスタ
 */

import type {
  DebateGraph,
  DebateNode,
  DebateEdge,
  GraphMetrics,
  SparsityConfig,
  MDMState,
  StanceType,
} from "./mdm-types";
import type { TeamMemberResult } from "./storage";
import { detectPartnerReferencesV3 } from "./communication-references";

/**
 * デフォルトスパース設定
 * @summary デフォルトスパース設定
 */
export const DEFAULT_SPARSITY: SparsityConfig = {
  targetDensity: 0.3,
  pruningStrategy: "adaptive",
  minEdgeWeight: 0.1,
  maxDegree: 5,
};

/**
 * 議論グラフビルダー
 * @summary 議論グラフビルダー
 */
export class DebateGraphBuilder {
  private config: SparsityConfig;

  /**
   * コンストラクタ
   * @summary グラフビルダー初期化
   * @param config - スパース設定（省略時はDEFAULT_SPARSITY）
   */
  constructor(config: SparsityConfig = DEFAULT_SPARSITY) {
    this.config = config;
  }

  /**
   * メンバー結果からグラフを構築
   * @summary グラフ構築
   * @param results - チームメンバーの結果配列
   * @param mdmState - MDM状態
   * @returns 構築された議論グラフ
   */
  buildFromResults(
    results: TeamMemberResult[],
    mdmState: MDMState
  ): DebateGraph {
    const nodes = new Map<string, DebateNode>();
    const edges = new Map<string, DebateEdge[]>();
    const memberById = new Map(Array.from(results).map((r) => [r.memberId, r] as [string, TeamMemberResult]));

    // Build comm ID maps (using memberId as commId for simplicity)
    const commIdToMemberId = new Map<string, string>();
    const memberIdToCommId = new Map<string, string>();
    for (const result of results) {
      commIdToMemberId.set(result.memberId, result.memberId);
      memberIdToCommId.set(result.memberId, result.memberId);
    }

    // Create nodes
    for (const result of results) {
      const mdmPosition = mdmState.positions.get(result.memberId) ?? [];
      const node: DebateNode = {
        id: `node-${result.memberId}`,
        memberId: result.memberId,
        claim: this.extractClaim(result.output),
        confidence: result.diagnostics?.confidence ?? 0.5,
        evidenceCount: result.diagnostics?.evidenceCount ?? 0,
        timestamp: Date.now(),
        mdmPosition,
      };
      nodes.set(node.id, node);
      edges.set(node.id, []);
    }

    // Create edges based on references
    for (const result of results) {
      const sourceId = `node-${result.memberId}`;
      const partnerCommIds = Array.from(nodes.values())
        .filter((n) => n.memberId !== result.memberId)
        .map((n) => n.memberId);

      const refs = detectPartnerReferencesV3(
        result.output,
        partnerCommIds,
        commIdToMemberId,
        memberIdToCommId
      );

      for (const ref of refs.referencedPartners) {
        const targetId = `node-${ref}`;
        const stance =
          refs.claimReferences.find((c) => c.memberId === ref)?.stance ??
          "neutral";

        const edge: DebateEdge = {
          id: `edge-${result.memberId}-${ref}`,
          source: sourceId,
          target: targetId,
          stance: stance as StanceType,
          weight: this.computeEdgeWeight(result, memberById.get(ref), stance),
          mdmInfluenced: true,
        };

        edges.get(sourceId)?.push(edge);
      }
    }

    // Apply sparsity
    const prunedEdges = this.maintainSparsity(edges);

    // Calculate metrics
    const metrics = this.calculateMetrics(nodes, prunedEdges);

    // Find clusters
    const clusters = this.findClusters(nodes, prunedEdges);

    // Build adjacency matrix
    const nodeIds = Array.from(nodes.keys());
    const adjacency = this.buildAdjacencyMatrix(nodeIds, prunedEdges);

    return {
      nodes,
      edges: prunedEdges,
      adjacency,
      clusters,
      metrics,
    };
  }

  /**
   * グラフを更新
   * @summary グラフ更新
   * @param graph - 既存のグラフ
   * @param newResults - 新しい結果配列
   * @param mdmState - MDM状態
   * @returns 更新されたグラフ
   */
  updateGraph(
    graph: DebateGraph,
    newResults: TeamMemberResult[],
    mdmState: MDMState
  ): DebateGraph {
    // Merge new nodes
    for (const result of newResults) {
      const existingNode = Array.from(graph.nodes.values()).find(
        (n) => n.memberId === result.memberId
      );

      if (existingNode) {
        // Update existing node
        existingNode.claim = this.extractClaim(result.output);
        existingNode.confidence =
          result.diagnostics?.confidence ?? existingNode.confidence;
        existingNode.evidenceCount =
          result.diagnostics?.evidenceCount ?? existingNode.evidenceCount;
        existingNode.timestamp = Date.now();
        existingNode.mdmPosition =
          mdmState.positions.get(result.memberId) ?? existingNode.mdmPosition;
      } else {
        // Add new node
        const node: DebateNode = {
          id: `node-${result.memberId}`,
          memberId: result.memberId,
          claim: this.extractClaim(result.output),
          confidence: result.diagnostics?.confidence ?? 0.5,
          evidenceCount: result.diagnostics?.evidenceCount ?? 0,
          timestamp: Date.now(),
          mdmPosition: mdmState.positions.get(result.memberId) ?? [],
        };
        graph.nodes.set(node.id, node);
        graph.edges.set(node.id, []);
      }
    }

    // Rebuild edges with updated data
    const allResults: TeamMemberResult[] = Array.from(graph.nodes.values()).map(
      (n) =>
        ({
          memberId: n.memberId,
          role: "",
          summary: "",
          output: n.claim,
          status: "completed" as const,
          latencyMs: 0,
          diagnostics: {
            confidence: n.confidence,
            evidenceCount: n.evidenceCount,
            contradictionSignals: 0,
            conflictSignals: 0,
          },
        }) as TeamMemberResult
    );

    const updatedGraph = this.buildFromResults(allResults, mdmState);

    return updatedGraph;
  }

  /**
   * コンセンサスクラスターを検出
   * @summary コンセンサス検出
   * @param graph - 議論グラフ
   * @returns 同意関係で結ばれたクラスタの配列（サイズ降順）
   */
  findConsensusClusters(graph: DebateGraph): string[][] {
    const clusters: string[][] = [];
    const visited = new Set<string>();

    for (const [nodeId] of graph.nodes) {
      if (visited.has(nodeId)) continue;

      // BFS to find agreeing cluster
      const cluster: string[] = [];
      const queue = [nodeId];

      while (queue.length > 0) {
        const currentId = queue.shift()!;
        if (visited.has(currentId)) continue;
        visited.add(currentId);
        cluster.push(currentId);

        const nodeEdges = graph.edges.get(currentId) ?? [];
        for (const edge of nodeEdges) {
          if (edge.stance === "agree" && !visited.has(edge.target)) {
            queue.push(edge.target);
          }
        }
      }

      if (cluster.length > 0) {
        clusters.push(cluster);
      }
    }

    return clusters.sort((a, b) => b.length - a.length);
  }

  /**
   * グラフメトリクスを計算
   * @summary メトリクス計算
   * @param nodes - ノードマップ
   * @param edges - エッジマップ
   * @returns 計算されたグラフメトリクス
   */
  calculateMetrics(
    nodes: Map<string, DebateNode>,
    edges: Map<string, DebateEdge[]>
  ): GraphMetrics {
    const nodeCount = nodes.size;
    const edgeCount = Array.from(edges.values()).reduce(
      (sum, e) => sum + e.length,
      0
    );

    // Density
    const maxEdges = nodeCount * (nodeCount - 1);
    const density = maxEdges > 0 ? edgeCount / maxEdges : 0;

    // Clustering coefficient
    const clustering = this.calculateClustering(nodes, edges);

    // Convergence score
    const convergenceScore = this.calculateConvergence(nodes, edges);

    return {
      density,
      clustering,
      avgPathLength: 0, // Computed on demand (expensive)
      modularity: 0, // Computed on demand (expensive)
      convergenceScore,
    };
  }

  // --- Private methods ---

  /**
   * 出力から主張を抽出
   * @summary 主張抽出
   * @param output - エージェントの出力テキスト
   * @returns 抽出された主張（最大200文字）
   */
  private extractClaim(output: string): string {
    const claimMatch = output.match(/CLAIM:\s*([^\n]+)/);
    return claimMatch?.[1]?.trim() ?? output.slice(0, 200);
  }

  /**
   * エッジ重みを計算
   * @summary エッジ重み計算
   * @param source - 送信元メンバーの結果
   * @param target - 送信先メンバーの結果（オプション）
   * @param stance - 立場タイプ
   * @returns エッジ重み（0.0-1.0）
   */
  private computeEdgeWeight(
    source: TeamMemberResult,
    target?: TeamMemberResult,
    stance?: string
  ): number {
    let weight = 0.5;

    // High confidence = stronger edge
    weight += (source.diagnostics?.confidence ?? 0.5) * 0.2;

    // Agreement = stronger connection
    if (stance === "agree") weight += 0.2;
    if (stance === "disagree") weight -= 0.1;

    // Target confidence contribution
    if (target?.diagnostics?.confidence) {
      weight += target.diagnostics.confidence * 0.1;
    }

    return Math.max(0, Math.min(1, weight));
  }

  /**
   * スパース性を維持
   * @summary スパース性維持
   * @param edges - 元のエッジマップ
   * @returns プルーニングされたエッジマップ
   */
  private maintainSparsity(
    edges: Map<string, DebateEdge[]>
  ): Map<string, DebateEdge[]> {
    const pruned = new Map<string, DebateEdge[]>();

    for (const [nodeId, nodeEdges] of edges) {
      // Filter by minimum weight
      let filtered = nodeEdges.filter(
        (e) => e.weight >= this.config.minEdgeWeight
      );

      // Apply max degree constraint
      if (filtered.length > this.config.maxDegree) {
        filtered.sort((a, b) => b.weight - a.weight);
        filtered = filtered.slice(0, this.config.maxDegree);
      }

      pruned.set(nodeId, filtered);
    }

    return pruned;
  }

  /**
   * 接続成分（クラスタ）を検出
   * @summary クラスタ検出
   * @param nodes - ノードマップ
   * @param edges - エッジマップ
   * @returns 接続成分の配列
   */
  private findClusters(
    nodes: Map<string, DebateNode>,
    edges: Map<string, DebateEdge[]>
  ): string[][] {
    // Simple connected components via BFS
    const visited = new Set<string>();
    const clusters: string[][] = [];

    for (const nodeId of nodes.keys()) {
      if (visited.has(nodeId)) continue;

      const cluster: string[] = [];
      const queue = [nodeId];

      while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;

        visited.add(current);
        cluster.push(current);

        const nodeEdges = edges.get(current) ?? [];
        for (const edge of nodeEdges) {
          if (!visited.has(edge.target)) {
            queue.push(edge.target);
          }
        }
      }

      if (cluster.length > 0) {
        clusters.push(cluster);
      }
    }

    return clusters;
  }

  /**
   * 隣接行列を構築
   * @summary 隣接行列構築
   * @param nodeIds - ノードID配列
   * @param edges - エッジマップ
   * @returns 隣接行列
   */
  private buildAdjacencyMatrix(
    nodeIds: string[],
    edges: Map<string, DebateEdge[]>
  ): number[][] {
    const n = nodeIds.length;
    const matrix: number[][] = Array(n)
      .fill(null)
      .map(() => Array(n).fill(0));
    const idToIndex = new Map(nodeIds.map((id, i) => [id, i] as [string, number]));

    for (const [sourceId, nodeEdges] of edges) {
      const sourceIndex = idToIndex.get(sourceId);
      if (sourceIndex === undefined) continue;

      for (const edge of nodeEdges) {
        const targetIndex = idToIndex.get(edge.target);
        if (targetIndex === undefined) continue;

        matrix[sourceIndex][targetIndex] = edge.weight;
      }
    }

    return matrix;
  }

  /**
   * クラスタリング係数を計算
   * @summary クラスタリング計算
   * @param nodes - ノードマップ
   * @param edges - エッジマップ
   * @returns クラスタリング係数（0.0-1.0）
   */
  private calculateClustering(
    nodes: Map<string, DebateNode>,
    edges: Map<string, DebateEdge[]>
  ): number {
    // Simplified clustering coefficient
    let totalCoef = 0;
    let count = 0;

    for (const [, nodeEdges] of edges) {
      const neighbors = nodeEdges.map((e) => e.target);
      if (neighbors.length < 2) continue;

      let triangles = 0;
      for (let i = 0; i < neighbors.length; i++) {
        for (let j = i + 1; j < neighbors.length; j++) {
          const neighborEdges = edges.get(neighbors[i]) ?? [];
          if (neighborEdges.some((e) => e.target === neighbors[j])) {
            triangles++;
          }
        }
      }

      const possibleTriangles =
        (neighbors.length * (neighbors.length - 1)) / 2;
      totalCoef += triangles / possibleTriangles;
      count++;
    }

    return count > 0 ? totalCoef / count : 0;
  }

  /**
   * 収束スコアを計算
   * @summary 収束スコア計算
   * @param nodes - ノードマップ
   * @param edges - エッジマップ
   * @returns 収束スコア（0.0-1.0）
   */
  private calculateConvergence(
    nodes: Map<string, DebateNode>,
    edges: Map<string, DebateEdge[]>
  ): number {
    // High agreement ratio = high convergence
    let agreeCount = 0;
    let totalEdges = 0;

    for (const nodeEdges of edges.values()) {
      for (const edge of nodeEdges) {
        totalEdges++;
        if (edge.stance === "agree") agreeCount++;
      }
    }

    return totalEdges > 0 ? agreeCount / totalEdges : 0;
  }
}

/**
 * グラフ構築のファクトリ関数
 * @summary グラフ構築
 * @param results - チームメンバーの結果配列
 * @param mdmState - MDM状態
 * @param config - スパース設定（オプション）
 * @returns 構築された議論グラフ
 */
export function buildDebateGraph(
  results: TeamMemberResult[],
  mdmState: MDMState,
  config?: SparsityConfig
): DebateGraph {
  const builder = new DebateGraphBuilder(config);
  return builder.buildFromResults(results, mdmState);
}

/**
 * コンセンサスクラスタを検出するスタンドアロン関数
 * @summary コンセンサスクラスタ検出
 * @param graph - 議論グラフ
 * @returns 同意関係で結ばれたクラスタの配列（サイズ降順）
 */
export function findConsensusClusters(graph: DebateGraph): string[][] {
  const builder = new DebateGraphBuilder();
  return builder.findConsensusClusters(graph);
}
