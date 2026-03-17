/**
 * @abdd.meta
 * path: .pi/lib/awo/index.ts
 * role: AWO (Agent Workflow Optimization) エントリーポイント
 * why: AWOモジュールの統一的なエクスポートを提供
 * related: .pi/lib/awo/types.ts, .pi/lib/awo/trace-collector.ts
 * public_api: すべてのパブリック型と関数
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: AWOモジュールのエントリーポイント
 * what_it_does:
 *   - 全モジュールのエクスポート
 *   - 統合APIの提供
 * why_it_exists: 利用側のインポートを簡素化
 * scope:
 *   in: なし
 *   out: 全パブリックAPI
 */

// =============================================================================
// 型定義
// =============================================================================

export type {
  // トレース収集
  ToolCall,
  Trace,
  TraceFilter,

  // State Graph
  StateNode,
  StateEdge,
  StateGraph,
  MergedStateGraph,
  MergeRule,

  // Meta-Tool
  MetaToolCandidate,
  MetaToolDefinition,

  // 設定
  TraceCollectionConfig,
  ExtractionConfig,
  RegistryConfig,
  AWOConfig,
  AWOStats,
} from "./types.js";

export { DEFAULT_AWO_CONFIG } from "./types.js";

// =============================================================================
// トレース収集
// =============================================================================

export {
  TraceCollector,
  getGlobalTraceCollector,
  resetGlobalTraceCollector,
} from "./trace-collector.js";

// =============================================================================
// State Graph
// =============================================================================

export {
  StateGraphBuilder,
  DefaultMergeRules,
  extractHighFrequencyPaths,
  getGraphStats,
} from "./state-graph.js";

// =============================================================================
// Meta-Tool抽出
// =============================================================================

export {
  MetaToolExtractor,
  extractMetaToolCandidates,
  candidateToDefinition,
} from "./meta-tool-extractor.js";

// =============================================================================
// Meta-Tool Registry
// =============================================================================

export {
  MetaToolRegistry,
  getGlobalMetaToolRegistry,
  resetGlobalMetaToolRegistry,
} from "./meta-tool-registry.js";

// =============================================================================
// 統合API
// =============================================================================

import { TraceCollector, getGlobalTraceCollector } from "./trace-collector.js";
import { StateGraphBuilder } from "./state-graph.js";
import { MetaToolExtractor } from "./meta-tool-extractor.js";
import {
  MetaToolRegistry,
  getGlobalMetaToolRegistry,
} from "./meta-tool-registry.js";
import { DEFAULT_AWO_CONFIG, type AWOConfig, type Trace } from "./types.js";

/**
 * AWOオーケストレーター
 * @summary AWO全体のワークフローを統括
 */
export class AWOOrchestrator {
  private collector: TraceCollector;
  private graphBuilder: StateGraphBuilder;
  private extractor: MetaToolExtractor;
  private registry: MetaToolRegistry;
  private config: AWOConfig;

  /**
   * コンストラクタ
   * @summary AWOOrchestratorを初期化
   * @param config AWO設定
   */
  constructor(config: AWOConfig = DEFAULT_AWO_CONFIG) {
    this.config = config;
    this.collector = new TraceCollector(config.traceCollection);
    this.graphBuilder = new StateGraphBuilder(config.extraction);
    this.extractor = new MetaToolExtractor(config.extraction);
    this.registry = new MetaToolRegistry(config.registry);
  }

  /**
   * トレースを収集
   * @summary 保存済みトレースを取得
   * @returns トレース配列
   */
  getTraces(): Trace[] {
    return this.collector.getTraces();
  }

  /**
   * メタツール候補を分析
   * @summary トレースから候補を抽出
   * @returns 候補配列
   */
  analyzeCandidates(): ReturnType<MetaToolExtractor["extractCandidates"]> {
    const traces = this.collector.getTraces();

    if (traces.length === 0) {
      return [];
    }

    const graph = this.graphBuilder.buildGraph(traces);
    const mergedGraph = this.graphBuilder.mergeEquivalentStates(graph);

    return this.extractor.extractCandidates(mergedGraph);
  }

  /**
   * メタツールを生成・登録
   * @summary 候補からツールを生成して登録
   * @param autoRegister 自動登録フラグ（falseの場合は手動承認必要）
   * @returns 生成されたツール定義配列
   */
  generateMetaTools(
    autoRegister = this.config.registry.autoRegister
  ): ReturnType<MetaToolExtractor["generateTool"]>[] {
    const candidates = this.analyzeCandidates();
    const tools: ReturnType<MetaToolExtractor["generateTool"]>[] = [];

    for (const candidate of candidates) {
      const tool = this.extractor.generateTool(candidate);

      if (autoRegister) {
        this.registry.register(tool);
      }

      tools.push(tool);
    }

    return tools;
  }

  /**
   * 登録済みツール一覧を取得
   * @summary レジストリからツール一覧を取得
   * @returns ツール定義配列
   */
  getRegisteredTools(): ReturnType<MetaToolRegistry["list"]> {
    return this.registry.list();
  }

  /**
   * 統計を取得
   * @summary AWO全体の統計を取得
   */
  getStats(): {
    traces: ReturnType<TraceCollector["getStats"]>;
    registry: ReturnType<MetaToolRegistry["getStats"]>;
  } {
    return {
      traces: this.collector.getStats(),
      registry: this.registry.getStats(),
    };
  }

  /**
   * Observabilityデータからトレースを復元
   * @summary ComprehensiveLoggerのイベントからトレースを再構築
   * @param query クエリ条件（省略時は直近7日間）
   * @returns 復元されたトレース数
   */
  restoreFromObservability(
    query?: import("../../extensions/observability-data.js").ObservabilityQuery
  ): number {
    return this.collector.restoreFromObservability(query);
  }
}

/**
 * グローバルAWOオーケストレーターを取得
 * @summary シングルトンのAWOOrchestratorを返す
 * @returns AWOOrchestratorインスタンス
 */
export function getGlobalAWO(): AWOOrchestrator {
  return new AWOOrchestrator();
}
