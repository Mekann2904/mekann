/**
 * @abdd.meta
 * path: .pi/lib/tool-fuser.ts
 * role: 類似ツールのグループ化と融合操作の生成を行うコアロジック
 * why: LLMCompiler論文に基づき、独立したツール呼び出しを融合してトークン使用量と実行時間を削減するため
 * related: .pi/lib/tool-compiler-types.ts, .pi/lib/tool-executor.ts, .pi/extensions/tool-compiler.ts
 * public_api: ToolFuser, fuseTools, analyzeDependencies, groupTools
 * invariants: 融合後のtoolIds配列は空でない、依存グラフはDAG（非循環）である
 * side_effects: なし（純粋関数的な変換処理）
 * failure_modes: 循環依存検出時はエラーを返す、無効なツール呼び出しはスキップする
 * @abdd.explain
 * overview: ツール呼び出しの依存関係を解析し、独立した呼び出しを融合操作としてグループ化する
 * what_it_does:
 *   - ツール呼び出し間の依存関係を解析してDAGを構築する
 *   - 類似したツール（読み取り系、書き込み系など）をグループ化する
 *   - 依存関係のないツールを融合操作としてまとめる
 *   - トポロジカルソートで実行順序を決定する
 *   - トークン節約量と並列実行可能性を計算する
 * why_it_exists:
 *   - LLMへの複数ツール呼び出しを最適化し、プロンプトサイズを削減するため
 *   - 依存関係のない操作を並列実行し、レイテンシを削減するため
 * scope:
 *   in: ToolCall配列、FusionConfig設定
 *   out: CompilationResult（融合操作、依存グラフ、メトリクス）
 */

// File: .pi/lib/tool-fuser.ts
// Description: Tool fusion logic based on LLMCompiler paper for optimizing LLM tool calls.
// Why: Groups independent tool calls into fused operations to reduce token usage and execution time.
// Related: .pi/lib/tool-compiler-types.ts, .pi/lib/tool-executor.ts, .pi/extensions/tool-compiler.ts

import { randomBytes } from "node:crypto";
import {
  type ToolCall,
  type FusedOperation,
  type ToolGroup,
  type CompilationResult,
  type DependencyNode,
  type FusionConfig,
  type CompilationMetrics,
  DEFAULT_FUSION_CONFIG,
  isToolCall,
} from "./tool-compiler-types.js";

/**
 * ツール融合クラス
 * 類似ツールのグループ化と融合操作の生成を行う
 * @summary ツール融合エンジン
 */
export class ToolFuser {
  private config: FusionConfig;
  private debug: (message: string) => void;

  /**
   * ToolFuserインスタンスを作成
   * @param config - 融合設定
   * @summary ToolFuserコンストラクタ
   */
  constructor(config: Partial<FusionConfig> = {}) {
    this.config = { ...DEFAULT_FUSION_CONFIG, ...config };
    this.debug = this.config.debugMode
      ? (msg) => console.debug(`[ToolFuser] ${msg}`)
      : () => {};
  }

  /**
   * ツール呼び出し配列をコンパイルして融合操作を生成
   * @param toolCalls - ツール呼び出し配列
   * @returns コンパイル結果
   * @summary ツールコンパイル実行
   */
  compile(toolCalls: ToolCall[]): CompilationResult {
    const compilationId = this.generateId("compile");
    const startTime = Date.now();
    const warnings: string[] = [];

    // 入力検証
    const validCalls = toolCalls.filter((call) => {
      if (!isToolCall(call)) {
        warnings.push(`無効なツール呼び出しをスキップ: ${JSON.stringify(call)}`);
        return false;
      }
      return true;
    });

    if (validCalls.length === 0) {
      return this.createEmptyResult(compilationId, warnings, "有効なツール呼び出しがありません");
    }

    // ツール数が少ない場合は融合しない
    if (validCalls.length < this.config.minToolsForFusion) {
      this.debug(`ツール数(${validCalls.length})が最小閾値(${this.config.minToolsForFusion})未満のため融合をスキップ`);
      return this.createPassthroughResult(compilationId, validCalls, warnings);
    }

    try {
      // Phase 1: 依存解析
      const depStartTime = Date.now();
      const dependencyGraph = this.analyzeDependencies(validCalls);
      const depTime = Date.now() - depStartTime;

      // 循環依存チェック
      const cycleResult = this.detectCycles(dependencyGraph);
      if (cycleResult.hasCycle) {
        warnings.push(`循環依存が検出されました: ${cycleResult.cyclePath?.join(" -> ")}`);
        return this.createPassthroughResult(compilationId, validCalls, warnings, "循環依存が存在するため融合をスキップ");
      }

      // Phase 2: ツールグループ化
      const groupStartTime = Date.now();
      const toolGroups = this.config.enableAutoGrouping
        ? this.groupTools(validCalls)
        : [];
      const groupTime = Date.now() - groupStartTime;

      // Phase 3: 融合操作生成
      const fusionStartTime = Date.now();
      const fusedOperations = this.createFusedOperations(validCalls, dependencyGraph);
      const fusionTime = Date.now() - fusionStartTime;

      // トポロジカルソート
      const sortedOperations = this.topologicalSort(fusedOperations, dependencyGraph);

      // メトリクス計算
      const metrics = this.calculateMetrics(
        validCalls,
        dependencyGraph,
        depTime,
        groupTime,
        fusionTime,
        Date.now() - startTime
      );

      // トークン節約量計算
      const totalTokenSavings = this.calculateTotalTokenSavings(sortedOperations);

      const result: CompilationResult = {
        compilationId,
        originalToolCount: validCalls.length,
        fusedOperationCount: sortedOperations.length,
        fusedOperations: sortedOperations,
        toolGroups,
        dependencyGraph,
        totalTokenSavings,
        parallelizableCount: sortedOperations.filter((op) => op.canExecuteInParallel).length,
        metrics,
        warnings,
        success: true,
      };

      this.debug(`コンパイル完了: ${validCalls.length}ツール -> ${sortedOperations.length}操作, 節約: ${totalTokenSavings}トークン`);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      warnings.push(`コンパイルエラー: ${errorMessage}`);
      return this.createPassthroughResult(compilationId, validCalls, warnings, errorMessage);
    }
  }

  /**
   * ツール呼び出し間の依存関係を解析
   * @param toolCalls - ツール呼び出し配列
   * @returns 依存グラフ
   * @summary 依存関係解析
   */
  analyzeDependencies(toolCalls: ToolCall[]): Map<string, DependencyNode> {
    const graph = new Map<string, DependencyNode>();

    // ノード作成
    for (const call of toolCalls) {
      graph.set(call.id, {
        call,
        dependencies: new Set<string>(),
        dependents: new Set<string>(),
        topologicalOrder: -1,
      });
    }

    if (!this.config.enableDependencyAnalysis) {
      return graph;
    }

    // 依存関係解析
    // データ依存: あるツールの出力が別のツールの入力として使用される
    // 順序依存: ファイル書き込み後に読み取りなど
    for (let i = 0; i < toolCalls.length; i++) {
      const currentCall = toolCalls[i];
      const currentNode = graph.get(currentCall.id);
      if (!currentNode) continue;

      for (let j = 0; j < i; j++) {
        const prevCall = toolCalls[j];
        const prevNode = graph.get(prevCall.id);
        if (!prevNode) continue;

        const dependency = this.detectDependency(prevCall, currentCall);
        if (dependency) {
          currentNode.dependencies.add(prevCall.id);
          prevNode.dependents.add(currentCall.id);
        }
      }
    }

    return graph;
  }

  /**
   * 2つのツール呼び出し間の依存関係を検出
   * @param earlier - 先に呼び出されるツール
   * @param later - 後に呼び出されるツール
   * @returns 依存関係の種別、または依存なしの場合はnull
   * @summary 依存関係検出
   */
  private detectDependency(
    earlier: ToolCall,
    later: ToolCall
  ): "data" | "ordering" | "resource" | null {
    // ファイルパスの抽出
    const earlierPaths = this.extractFilePaths(earlier);
    const laterPaths = this.extractFilePaths(later);

    // 書き込み -> 読み取りの順序依存
    const earlierIsWrite = this.isWriteOperation(earlier.name);
    const laterIsRead = this.isReadOperation(later.name);

    if (earlierIsWrite && laterIsRead) {
      for (const writePath of earlierPaths) {
        for (const readPath of laterPaths) {
          if (writePath === readPath || this.isParentPath(writePath, readPath)) {
            return "ordering";
          }
        }
      }
    }

    // 同一ファイルへの複数書き込み（順序依存）
    if (earlierIsWrite && this.isWriteOperation(later.name)) {
      for (const path1 of earlierPaths) {
        for (const path2 of laterPaths) {
          if (path1 === path2) {
            return "ordering";
          }
        }
      }
    }

    // リソース競合（同種のファイル操作）
    if (earlierPaths.some((p) => laterPaths.includes(p))) {
      return "resource";
    }

    return null;
  }

  /**
   * ツール呼び出しからファイルパスを抽出
   * @param call - ツール呼び出し
   * @returns ファイルパスの配列
   * @summary ファイルパス抽出
   */
  private extractFilePaths(call: ToolCall): string[] {
    const paths: string[] = [];
    const args = call.arguments;

    // 一般的なパス引数名
    const pathKeys = ["path", "file", "filepath", "filePath", "filename", "fileName", "dir", "directory"];

    for (const key of pathKeys) {
      if (typeof args[key] === "string") {
        paths.push(args[key]);
      }
      if (Array.isArray(args[key])) {
        for (const item of args[key]) {
          if (typeof item === "string") {
            paths.push(item);
          }
        }
      }
    }

    return paths;
  }

  /**
   * ツールが読み取り操作かどうかを判定
   * @param toolName - ツール名
   * @returns 読み取り操作の場合true
   * @summary 読み取り操作判定
   */
  private isReadOperation(toolName: string): boolean {
    const name = toolName.toLowerCase();
    return this.config.fileReadPatterns.some((pattern) => name.includes(pattern.toLowerCase()));
  }

  /**
   * ツールが書き込み操作かどうかを判定
   * @param toolName - ツール名
   * @returns 書き込み操作の場合true
   * @summary 書き込み操作判定
   */
  private isWriteOperation(toolName: string): boolean {
    const name = toolName.toLowerCase();
    return this.config.fileWritePatterns.some((pattern) => name.includes(pattern.toLowerCase()));
  }

  /**
   * パスが別のパスの親ディレクトリかどうかを判定
   * @param parent - 親パス候補
   * @param child - 子パス候補
   * @returns 親子関係がある場合true
   * @summary 親パス判定
   */
  private isParentPath(parent: string, child: string): boolean {
    const normalizedParent = parent.replace(/\/+$/, "");
    const normalizedChild = child.replace(/\/+$/, "");
    return normalizedChild.startsWith(normalizedParent + "/");
  }

  /**
   * 依存グラフ内の循環を検出
   * @param graph - 依存グラフ
   * @returns 循環検出結果
   * @summary 循環依存検出
   */
  private detectCycles(
    graph: Map<string, DependencyNode>
  ): { hasCycle: boolean; cyclePath?: string[] } {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const path: string[] = [];

    const dfs = (nodeId: string): boolean => {
      visited.add(nodeId);
      recursionStack.add(nodeId);
      path.push(nodeId);

      const node = graph.get(nodeId);
      if (node) {
        for (const depId of node.dependencies) {
          if (!visited.has(depId)) {
            if (dfs(depId)) return true;
          } else if (recursionStack.has(depId)) {
            path.push(depId);
            return true;
          }
        }
      }

      path.pop();
      recursionStack.delete(nodeId);
      return false;
    };

    for (const nodeId of graph.keys()) {
      if (!visited.has(nodeId)) {
        if (dfs(nodeId)) {
          const cycleStart = path.indexOf(path[path.length - 1]);
          return { hasCycle: true, cyclePath: path.slice(cycleStart) };
        }
      }
    }

    return { hasCycle: false };
  }

  /**
   * ツールをグループ化
   * @param toolCalls - ツール呼び出し配列
   * @returns ツールグループ配列
   * @summary ツールグループ化
   */
  groupTools(toolCalls: ToolCall[]): ToolGroup[] {
    const groups = new Map<string, ToolGroup>();

    for (const call of toolCalls) {
      const groupType = this.determineGroupType(call.name);
      const groupKey = `${groupType}:${call.name.split("_")[0]}`;

      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          groupId: this.generateId("group"),
          groupName: this.getGroupDisplayName(groupType, call.name),
          toolNames: [],
          groupType,
          fusionScore: 0.8, // ベーススコア
          description: this.getGroupDescription(groupType),
        });
      }

      const group = groups.get(groupKey)!;
      if (!group.toolNames.includes(call.name)) {
        group.toolNames.push(call.name);
      }
    }

    // 融合スコアの計算
    for (const group of groups.values()) {
      group.fusionScore = this.calculateFusionScore(group);
    }

    return Array.from(groups.values());
  }

  /**
   * ツール名からグループ種別を決定
   * @param toolName - ツール名
   * @returns グループ種別
   * @summary グループ種別決定
   */
  private determineGroupType(toolName: string): ToolGroup["groupType"] {
    const name = toolName.toLowerCase();

    if (this.config.fileReadPatterns.some((p) => name.includes(p.toLowerCase()))) {
      return "file_read";
    }
    if (this.config.fileWritePatterns.some((p) => name.includes(p.toLowerCase()))) {
      return "file_write";
    }
    if (this.config.searchPatterns.some((p) => name.includes(p.toLowerCase()))) {
      return "search";
    }
    if (name.includes("exec") || name.includes("run") || name.includes("bash")) {
      return "execute";
    }
    if (name.includes("query") || name.includes("ask") || name.includes("get")) {
      return "query";
    }

    return "other";
  }

  /**
   * グループの表示名を取得
   * @param groupType - グループ種別
   * @param toolName - ツール名
   * @returns 表示名
   * @summary グループ表示名取得
   */
  private getGroupDisplayName(groupType: ToolGroup["groupType"], toolName: string): string {
    const prefixes: Record<ToolGroup["groupType"], string> = {
      file_read: "読み取り系",
      file_write: "書き込み系",
      search: "検索系",
      execute: "実行系",
      query: "クエリ系",
      other: "その他",
    };
    return `${prefixes[groupType]}: ${toolName.split("_")[0]}`;
  }

  /**
   * グループ種別の説明を取得
   * @param groupType - グループ種別
   * @returns 説明
   * @summary グループ説明取得
   */
  private getGroupDescription(groupType: ToolGroup["groupType"]): string {
    const descriptions: Record<ToolGroup["groupType"], string> = {
      file_read: "ファイル読み取り操作のグループ",
      file_write: "ファイル書き込み操作のグループ",
      search: "検索・探索操作のグループ",
      execute: "コマンド実行操作のグループ",
      query: "クエリ・問い合わせ操作のグループ",
      other: "その他の操作のグループ",
    };
    return descriptions[groupType];
  }

  /**
   * グループの融合スコアを計算
   * @param group - ツールグループ
   * @returns 融合スコア（0-1）
   * @summary 融合スコア計算
   */
  private calculateFusionScore(group: ToolGroup): number {
    // ツール数が多いほど融合効果が高い
    const countScore = Math.min(1, group.toolNames.length / 5);

    // 同種操作は融合効果が高い
    const typeScores: Record<ToolGroup["groupType"], number> = {
      file_read: 0.95,
      search: 0.9,
      query: 0.85,
      execute: 0.6,
      file_write: 0.4, // 書き込みは順序が重要なので融合効果が低い
      other: 0.5,
    };

    return countScore * 0.3 + typeScores[group.groupType] * 0.7;
  }

  /**
   * 融合操作を生成
   * @param toolCalls - ツール呼び出し配列
   * @param dependencyGraph - 依存グラフ
   * @returns 融合操作配列
   * @summary 融合操作生成
   */
  private createFusedOperations(
    toolCalls: ToolCall[],
    dependencyGraph: Map<string, DependencyNode>
  ): FusedOperation[] {
    const operations: FusedOperation[] = [];
    const processed = new Set<string>();

    // 独立したツールをグループ化
    for (const call of toolCalls) {
      if (processed.has(call.id)) continue;

      const node = dependencyGraph.get(call.id);
      if (!node) continue;

      // 依存関係のないツールを収集
      const independentCalls: ToolCall[] = [call];
      const independentIds: string[] = [call.id];
      processed.add(call.id);

      for (const otherCall of toolCalls) {
        if (processed.has(otherCall.id)) continue;

        const otherNode = dependencyGraph.get(otherCall.id);
        if (!otherNode) continue;

        // 相互に依存関係がない場合
        if (
          !node.dependents.has(otherCall.id) &&
          !otherNode.dependents.has(call.id) &&
          !node.dependencies.has(otherCall.id) &&
          !otherNode.dependencies.has(call.id)
        ) {
          // かつ、既存のindependentCallsとも依存関係がない場合
          const isIndependent = independentCalls.every((existingCall) => {
            const existingNode = dependencyGraph.get(existingCall.id);
            if (!existingNode) return false;
            return (
              !existingNode.dependents.has(otherCall.id) &&
              !otherNode.dependents.has(existingCall.id) &&
              !existingNode.dependencies.has(otherCall.id) &&
              !otherNode.dependencies.has(existingCall.id)
            );
          });

          if (isIndependent) {
            independentCalls.push(otherCall);
            independentIds.push(otherCall.id);
            processed.add(otherCall.id);
          }
        }
      }

      // 融合操作の作成
      const fusedOp = this.createFusedOperation(independentCalls, dependencyGraph);
      operations.push(fusedOp);
    }

    // 依存関係の設定
    this.setFusedDependencies(operations, dependencyGraph);

    return operations;
  }

  /**
   * 単一の融合操作を作成
   * @param calls - 含まれるツール呼び出し
   * @param dependencyGraph - 依存グラフ
   * @returns 融合操作
   * @summary 融合操作作成
   */
  private createFusedOperation(
    calls: ToolCall[],
    dependencyGraph: Map<string, DependencyNode>
  ): FusedOperation {
    const canParallel = calls.every((call) => {
      const node = dependencyGraph.get(call.id);
      return node && node.dependencies.size === 0;
    });

    // 実行戦略の決定
    let strategy: FusedOperation["executionStrategy"] = "parallel";
    if (calls.length === 1) {
      strategy = "sequential";
    } else if (calls.some((c) => this.isWriteOperation(c.name))) {
      strategy = "batch"; // 書き込みが含まれる場合はバッチ実行
    }

    // 優先度の計算（読み取りは高優先度、書き込みは低優先度）
    const priority = calls.reduce((sum, call) => {
      if (this.isReadOperation(call.name)) return sum + 10;
      if (this.isWriteOperation(call.name)) return sum + 1;
      return sum + 5;
    }, 0);

    return {
      fusedId: this.generateId("fused"),
      toolIds: calls.map((c) => c.id),
      toolCalls: calls,
      dependsOnFusedIds: [],
      canExecuteInParallel: canParallel && calls.length > 1,
      estimatedTokenSavings: this.calculateTokenSavings(calls),
      executionStrategy: strategy,
      priority,
    };
  }

  /**
   * 融合操作間の依存関係を設定
   * @param operations - 融合操作配列
   * @param dependencyGraph - 依存グラフ
   * @summary 融合依存設定
   */
  private setFusedDependencies(
    operations: FusedOperation[],
    dependencyGraph: Map<string, DependencyNode>
  ): void {
    // ツールID -> 融合操作IDのマッピング
    const toolToFused = new Map<string, string>();
    for (const op of operations) {
      for (const toolId of op.toolIds) {
        toolToFused.set(toolId, op.fusedId);
      }
    }

    // 依存関係の転送
    for (const op of operations) {
      const fusedDeps = new Set<string>();

      for (const toolId of op.toolIds) {
        const node = dependencyGraph.get(toolId);
        if (node) {
          for (const depId of node.dependencies) {
            const depFusedId = toolToFused.get(depId);
            if (depFusedId && depFusedId !== op.fusedId) {
              fusedDeps.add(depFusedId);
            }
          }
        }
      }

      op.dependsOnFusedIds = Array.from(fusedDeps);
    }
  }

  /**
   * トークン節約量を計算
   * @param calls - ツール呼び出し配列
   * @returns 推定節約トークン数
   * @summary トークン節約計算
   */
  private calculateTokenSavings(calls: ToolCall[]): number {
    // 各ツール呼び出しのオーバーヘッド（概算）
    const overheadPerCall = 20; // ツール名、括弧、カンマ等

    // 融合時の節約
    // N個の独立したツール呼び出しを1つにまとめることで
    // (N-1) * overheadPerCall のトークンを節約
    if (calls.length <= 1) return 0;

    const savedOverhead = (calls.length - 1) * overheadPerCall;

    // 類似ツールの場合、引数の重複部分も節約可能
    const hasSimilarArgs = this.hasSimilarArgumentPatterns(calls);
    const argumentSavings = hasSimilarArgs ? calls.length * 10 : 0;

    return savedOverhead + argumentSavings;
  }

  /**
   * 類似した引数パターンがあるかを判定
   * @param calls - ツール呼び出し配列
   * @returns 類似パターンがある場合true
   * @summary 引数パターン類似判定
   */
  private hasSimilarArgumentPatterns(calls: ToolCall[]): boolean {
    if (calls.length < 2) return false;

    const firstKeys = Object.keys(calls[0].arguments).sort();
    return calls.slice(1).some((call) => {
      const keys = Object.keys(call.arguments).sort();
      return firstKeys.length === keys.length &&
        firstKeys.every((k, i) => k === keys[i]);
    });
  }

  /**
   * トポロジカルソートを実行
   * @param operations - 融合操作配列
   * @param dependencyGraph - 依存グラフ
   * @returns ソート済み融合操作配列
   * @summary トポロジカルソート
   */
  private topologicalSort(
    operations: FusedOperation[],
    dependencyGraph: Map<string, DependencyNode>
  ): FusedOperation[] {
    // Kahn's algorithm
    const inDegree = new Map<string, number>();
    const graph = new Map<string, string[]>();

    // 初期化
    for (const op of operations) {
      inDegree.set(op.fusedId, 0);
      graph.set(op.fusedId, []);
    }

    // エッジの構築
    for (const op of operations) {
      for (const depId of op.dependsOnFusedIds) {
        const deps = graph.get(depId);
        if (deps) {
          deps.push(op.fusedId);
          inDegree.set(op.fusedId, (inDegree.get(op.fusedId) || 0) + 1);
        }
      }
    }

    // ソート実行
    const queue: string[] = [];
    for (const [id, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(id);
      }
    }

    const sorted: FusedOperation[] = [];
    while (queue.length > 0) {
      queue.sort((a, b) => {
        const opA = operations.find((op) => op.fusedId === a);
        const opB = operations.find((op) => op.fusedId === b);
        return (opB?.priority || 0) - (opA?.priority || 0);
      });

      const currentId = queue.shift()!;
      const currentOp = operations.find((op) => op.fusedId === currentId);
      if (currentOp) {
        sorted.push(currentOp);
      }

      const dependents = graph.get(currentId) || [];
      for (const depId of dependents) {
        const newDegree = (inDegree.get(depId) || 0) - 1;
        inDegree.set(depId, newDegree);
        if (newDegree === 0) {
          queue.push(depId);
        }
      }
    }

    return sorted;
  }

  /**
   * メトリクスを計算
   * @summary メトリクス計算
   */
  private calculateMetrics(
    toolCalls: ToolCall[],
    dependencyGraph: Map<string, DependencyNode>,
    depTime: number,
    groupTime: number,
    fusionTime: number,
    totalTime: number
  ): CompilationMetrics {
    let totalDeps = 0;
    let maxDepth = 0;

    const calculateDepth = (nodeId: string, visited: Set<string>): number => {
      if (visited.has(nodeId)) return 0;
      visited.add(nodeId);

      const node = dependencyGraph.get(nodeId);
      if (!node || node.dependencies.size === 0) return 0;

      let maxDepDepth = 0;
      for (const depId of node.dependencies) {
        maxDepDepth = Math.max(maxDepDepth, calculateDepth(depId, visited));
      }

      return maxDepDepth + 1;
    };

    for (const [id, node] of dependencyGraph.entries()) {
      totalDeps += node.dependencies.size;
      maxDepth = Math.max(maxDepth, calculateDepth(id, new Set()));
    }

    return {
      compilationTimeMs: totalTime,
      dependencyAnalysisTimeMs: depTime,
      groupingTimeMs: groupTime,
      fusionTimeMs: fusionTime,
      averageDependencies: dependencyGraph.size > 0 ? totalDeps / dependencyGraph.size : 0,
      maxDependencyDepth: maxDepth,
      hasCircularDependencies: false,
    };
  }

  /**
   * 総トークン節約量を計算
   * @param operations - 融合操作配列
   * @returns 総節約トークン数
   * @summary 総トークン節約計算
   */
  private calculateTotalTokenSavings(operations: FusedOperation[]): number {
    return operations.reduce((sum, op) => sum + op.estimatedTokenSavings, 0);
  }

  /**
   * 空の結果を作成
   * @summary 空結果作成
   */
  private createEmptyResult(
    compilationId: string,
    warnings: string[],
    error?: string
  ): CompilationResult {
    return {
      compilationId,
      originalToolCount: 0,
      fusedOperationCount: 0,
      fusedOperations: [],
      toolGroups: [],
      dependencyGraph: new Map(),
      totalTokenSavings: 0,
      parallelizableCount: 0,
      metrics: {
        compilationTimeMs: 0,
        dependencyAnalysisTimeMs: 0,
        groupingTimeMs: 0,
        fusionTimeMs: 0,
        averageDependencies: 0,
        maxDependencyDepth: 0,
        hasCircularDependencies: false,
      },
      warnings,
      success: false,
      error,
    };
  }

  /**
   * パススルー結果を作成（融合なし）
   * @summary パススルー結果作成
   */
  private createPassthroughResult(
    compilationId: string,
    toolCalls: ToolCall[],
    warnings: string[],
    error?: string
  ): CompilationResult {
    // 各ツールを個別の融合操作として扱う
    const fusedOperations: FusedOperation[] = toolCalls.map((call) => ({
      fusedId: this.generateId("fused"),
      toolIds: [call.id],
      toolCalls: [call],
      dependsOnFusedIds: [],
      canExecuteInParallel: false,
      estimatedTokenSavings: 0,
      executionStrategy: "sequential" as const,
      priority: 5,
    }));

    return {
      compilationId,
      originalToolCount: toolCalls.length,
      fusedOperationCount: fusedOperations.length,
      fusedOperations,
      toolGroups: [],
      dependencyGraph: new Map(),
      totalTokenSavings: 0,
      parallelizableCount: 0,
      metrics: {
        compilationTimeMs: 0,
        dependencyAnalysisTimeMs: 0,
        groupingTimeMs: 0,
        fusionTimeMs: 0,
        averageDependencies: 0,
        maxDependencyDepth: 0,
        hasCircularDependencies: false,
      },
      warnings,
      success: !error,
      error,
    };
  }

  /**
   * 一意識別子を生成
   * @param prefix - IDプレフィックス
   * @returns 一意識別子
   * @summary ID生成
   */
  private generateId(prefix: string): string {
    const timestamp = Date.now().toString(36);
    const random = randomBytes(4).toString("hex");
    return `${prefix}_${timestamp}_${random}`;
  }
}

/**
 * ツール呼び出し配列を融合する便利関数
 * @param toolCalls - ツール呼び出し配列
 * @param config - 融合設定（オプション）
 * @returns コンパイル結果
 * @summary ツール融合便利関数
 */
export function fuseTools(
  toolCalls: ToolCall[],
  config?: Partial<FusionConfig>
): CompilationResult {
  const fuser = new ToolFuser(config);
  return fuser.compile(toolCalls);
}

/**
 * ツール呼び出し配列の依存関係を解析する便利関数
 * @param toolCalls - ツール呼び出し配列
 * @returns 依存グラフ
 * @summary 依存解析便利関数
 */
export function analyzeDependencies(
  toolCalls: ToolCall[]
): Map<string, DependencyNode> {
  const fuser = new ToolFuser();
  return fuser.analyzeDependencies(toolCalls);
}

/**
 * ツール呼び出し配列をグループ化する便利関数
 * @param toolCalls - ツール呼び出し配列
 * @returns ツールグループ配列
 * @summary グループ化便利関数
 */
export function groupTools(toolCalls: ToolCall[]): ToolGroup[] {
  const fuser = new ToolFuser();
  return fuser.groupTools(toolCalls);
}
