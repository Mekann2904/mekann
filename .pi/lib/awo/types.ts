/**
 * @abdd.meta
 * path: .pi/lib/awo/types.ts
 * role: AWO (Agent Workflow Optimization) 型定義
 * why: メタツール生成のための型システムを提供
 * related: .pi/lib/awo/trace-collector.ts, .pi/lib/awo/state-graph.ts
 * public_api: ToolCall, Trace, StateNode, StateEdge, StateGraph, MetaToolCandidate, MetaToolDefinition, AWOConfig
 * invariants: トレースIDは一意、StateGraphはDAG
 * side_effects: なし（型定義のみ）
 * failure_modes: なし
 * @abdd.explain
 * overview: AWO統合のための型定義モジュール
 * what_it_does:
 *   - トレース収集の型定義
 *   - State Graphの型定義
 *   - メタツール抽出の型定義
 *   - 設定パラメータの型定義
 * why_it_exists: AWO実装全体で使用する型を一元管理
 * scope:
 *   in: なし
 *   out: 型定義のみ
 */

// =============================================================================
// トレース収集
// =============================================================================

/**
 * ツール呼び出し記録
 * @summary 単一ツール呼び出しを表す
 */
export interface ToolCall {
  /** ツール名 */
  toolName: string;
  /** 呼び出し引数 */
  arguments: Record<string, unknown>;
  /** 実行結果 */
  result: unknown;
  /** タイムスタンプ（ms） */
  timestamp: number;
  /** 実行ID */
  executionId: string;
  /** 成功フラグ */
  success: boolean;
  /** エラーメッセージ（失敗時） */
  error?: string;
}

/**
 * 実行トレース
 * @summary エージェント実行の完全な記録
 */
export interface Trace {
  /** トレースID */
  id: string;
  /** タスクID */
  taskId: string;
  /** タスク説明 */
  taskDescription: string;
  /** ツール呼び出しシーケンス */
  toolCalls: ToolCall[];
  /** 開始時刻（ms） */
  startTime: number;
  /** 終了時刻（ms） */
  endTime: number;
  /** 成功フラグ */
  success: boolean;
  /** エージェント種別 */
  agentType: "subagent" | "team" | "workflow";
  /** メタデータ */
  metadata?: Record<string, unknown>;
}

/**
 * トレースフィルタ
 * @summary トレース検索用フィルタ
 */
export interface TraceFilter {
  /** 期間開始 */
  startTimeFrom?: number;
  /** 期間終了 */
  startTimeTo?: number;
  /** 成功のみ */
  successOnly?: boolean;
  /** エージェント種別 */
  agentType?: Trace["agentType"];
  /** 最小ツール呼び出し数 */
  minToolCalls?: number;
}

// =============================================================================
// State Graph
// =============================================================================

/**
 * 状態ノード
 * @summary State Graphのノード
 */
export interface StateNode {
  /** ノードID */
  id: string;
  /** これまでのツール呼び出し履歴 */
  toolCallHistory: string[];
  /** ルートノードフラグ */
  isRoot: boolean;
  /** 到達回数 */
  visitCount: number;
}

/**
 * 状態エッジ
 * @summary State Graphのエッジ
 */
export interface StateEdge {
  /** 遷移元ノードID */
  from: string;
  /** 遷移先ノードID */
  to: string;
  /** ツール名 */
  toolName: string;
  /** 重み（通過回数） */
  weight: number;
}

/**
 * State Graph
 * @summary エージェント実行の状態遷移グラフ
 */
export interface StateGraph {
  /** ノードマップ */
  nodes: Map<string, StateNode>;
  /** エッジリスト */
  edges: StateEdge[];
  /** ルートノードID */
  rootId: string;
  /** 生成元トレース数 */
  traceCount: number;
}

/**
 * マージルール
 * @summary 等価状態判定ルール
 */
export interface MergeRule {
  /** ルール名 */
  name: string;
  /** 説明 */
  description: string;
  /** 適用条件 */
  condition: (node1: StateNode, node2: StateNode) => boolean;
}

/**
 * マージ済みState Graph
 * @summary 等価状態をマージしたグラフ
 */
export interface MergedStateGraph extends StateGraph {
  /** 適用されたマージルール */
  mergeRules: MergeRule[];
  /** マージ統計 */
  mergeStats: {
    originalNodes: number;
    mergedNodes: number;
    reductionRate: number;
  };
}

// =============================================================================
// Meta-Tool抽出
// =============================================================================

/**
 * メタツール候補
 * @summary Algorithm 1で抽出された候補
 */
export interface MetaToolCandidate {
  /** 候補ID */
  id: string;
  /** ツール呼び出しシーケンス */
  toolSequence: Array<{
    toolName: string;
    sampleArguments: Record<string, unknown>;
  }>;
  /** 出現頻度 */
  frequency: number;
  /** 推定削減LLM呼び出し数 */
  savingsEstimate: number;
  /** 信頼度スコア（0-1） */
  confidence: number;
  /** 生成元グラフ */
  sourceGraphId: string;
}

/**
 * メタツール定義
 * @summary 実際に登録可能なツール定義
 */
export interface MetaToolDefinition {
  /** ツール名 */
  name: string;
  /** 説明 */
  description: string;
  /** パラメータスキーマ */
  parameters: {
    type: "object";
    properties: Record<string, {
      type: string;
      description: string;
    }>;
    required?: string[];
  };
  /** 実装コード（TypeScript） */
  implementation: string;
  /** 元となったパターン */
  sourcePattern: MetaToolCandidate["toolSequence"];
  /** 生成日時 */
  createdAt: number;
  /** 使用回数 */
  usageCount: number;
  /** 最終使用日時 */
  lastUsedAt?: number;
}

// =============================================================================
// 設定
// =============================================================================

/**
 * トレース収集設定
 * @summary TraceCollector設定
 */
export interface TraceCollectionConfig {
  /** 有効フラグ */
  enabled: boolean;
  /** 最大保存トレース数 */
  maxTraces: number;
  /** 保持期間（日） */
  retentionDays: number;
}

/**
 * メタツール抽出設定
 * @summary MetaToolExtractor設定
 */
export interface ExtractionConfig {
  /** Algorithm 1の閾値T */
  threshold: number;
  /** 最小出現頻度 */
  minFrequency: number;
  /** メタツールの最大ツール数 */
  maxToolLength: number;
  /** 信頼度閾値 */
  minConfidence: number;
}

/**
 * レジストリ設定
 * @summary MetaToolRegistry設定
 */
export interface RegistryConfig {
  /** 自動登録フラグ */
  autoRegister: boolean;
  /** 最大メタツール数 */
  maxTools: number;
  /** 削除チェック間隔（ms） */
  pruneInterval: number;
  /** 最小使用回数（これ以下は削除候補） */
  minUsageThreshold: number;
}

/**
 * AWO全体設定
 * @summary AWO統合設定
 */
export interface AWOConfig {
  /** トレース収集設定 */
  traceCollection: TraceCollectionConfig;
  /** メタツール抽出設定 */
  extraction: ExtractionConfig;
  /** レジストリ設定 */
  registry: RegistryConfig;
}

/**
 * デフォルトAWO設定
 * @summary 本番用デフォルト値
 */
export const DEFAULT_AWO_CONFIG: AWOConfig = {
  traceCollection: {
    enabled: true,
    maxTraces: 10000,
    retentionDays: 30,
  },
  extraction: {
    threshold: 5,
    minFrequency: 3,
    maxToolLength: 5,
    minConfidence: 0.7,
  },
  registry: {
    autoRegister: false,
    maxTools: 100,
    pruneInterval: 86400000,
    minUsageThreshold: 2,
  },
};

// =============================================================================
// 統計・メトリクス
// =============================================================================

/**
 * AWO統計
 * @summary パフォーマンスメトリクス
 */
export interface AWOStats {
  /** 収集トレース数 */
  totalTraces: number;
  /** 総ツール呼び出し数 */
  totalToolCalls: number;
  /** 登録メタツール数 */
  registeredMetaTools: number;
  /** メタツール使用回数 */
  metaToolUsages: number;
  /** 推定LLM呼び出し削減数 */
  estimatedLLMSavings: number;
  /** 平均トレース長 */
  averageTraceLength: number;
  /** 最終更新日時 */
  lastUpdated: number;
}
