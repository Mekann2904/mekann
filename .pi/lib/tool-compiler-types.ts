/**
 * @abdd.meta
 * path: .pi/lib/tool-compiler-types.ts
 * role: LLM-Tool Compiler統合の型定義モジュール
 * why: ツール融合・並列実行のための統一された型システムを提供し、コンパイル時の型安全性を保証するため
 * related: .pi/lib/tool-fuser.ts, .pi/lib/tool-executor.ts, .pi/extensions/tool-compiler.ts
 * public_api: FusedOperation, ToolGroup, CompilationResult, ToolDependency, ExecutionResult
 * invariants: FusedOperationのtoolIdsは常に1つ以上の要素を持つ、依存グラフは循環を持たない
 * side_effects: なし（純粋な型定義モジュール）
 * failure_modes: 型不整合によるコンパイルエラーのみ（実行時エラーは発生しない）
 * @abdd.explain
 * overview: LLMCompiler論文に基づくツール融合・並列実行システムの型定義を提供する
 * what_it_does:
 *   - ツール呼び出しの依存関係を表現する型を定義する
 *   - 融合操作（FusedOperation）とツールグループ（ToolGroup）の構造を定義する
 *   - コンパイル結果（CompilationResult）と実行結果（ExecutionResult）の型を定義する
 *   - トークン節約計算用のメトリクス型を定義する
 * why_it_exists:
 *   - ツール融合システム全体で一貫した型定義を共有するため
 *   - TypeScriptの型システムによる静的検査を活用するため
 * scope:
 *   in: なし（型定義のみ）
 *   out: 型、インターフェース、型ガード関数
 */

// File: .pi/lib/tool-compiler-types.ts
// Description: Type definitions for LLM-Tool Compiler integration based on LLMCompiler paper.
// Why: Provides unified type system for tool fusion and parallel execution with compile-time safety.
// Related: .pi/lib/tool-fuser.ts, .pi/lib/tool-executor.ts, .pi/extensions/tool-compiler.ts

/**
 * 個別のツール呼び出しを表現する型
 * @summary 単一ツール呼び出し定義
 */
export interface ToolCall {
  /** ツールの一意識別子 */
  id: string;
  /** ツール名 */
  name: string;
  /** ツールへの引数 */
  arguments: Record<string, unknown>;
  /** 推定トークン数（オプション） */
  estimatedTokens?: number;
}

/**
 * ツール間の依存関係を表現する型
 * @summary ツール依存関係定義
 */
export interface ToolDependency {
  /** 依存元ツールID */
  toolId: string;
  /** 依存先ツールIDの配列（このツールの実行前に完了している必要がある） */
  dependsOn: string[];
  /** 依存の種別 */
  dependencyType: "data" | "ordering" | "resource";
}

/**
 * 依存グラフのノード
 * @summary 依存グラフノード
 */
export interface DependencyNode {
  /** ツール呼び出し */
  call: ToolCall;
  /** このノードが依存するノードのIDセット */
  dependencies: Set<string>;
  /** このノードに依存するノードのIDセット */
  dependents: Set<string>;
  /** トポロジカルソート順（-1は未ソート） */
  topologicalOrder: number;
}

/**
 * 融合された操作を表現する型
 * 複数の独立したツール呼び出しを1つの操作として扱う
 * @summary 融合操作定義
 */
export interface FusedOperation {
  /** 融合操作の一意識別子 */
  fusedId: string;
  /** 元のツール呼び出しIDの配列 */
  toolIds: string[];
  /** 元のツール呼び出しの配列 */
  toolCalls: ToolCall[];
  /** この操作が依存する融合操作IDの配列 */
  dependsOnFusedIds: string[];
  /** 並列実行可能フラグ */
  canExecuteInParallel: boolean;
  /** 推定トークン節約量 */
  estimatedTokenSavings: number;
  /** 実行戦略 */
  executionStrategy: "parallel" | "sequential" | "batch";
  /** 優先度（高いほど先に実行） */
  priority: number;
}

/**
 * ツールグループを表現する型
 * 類似したツールをグループ化したもの
 * @summary ツールグループ定義
 */
export interface ToolGroup {
  /** グループの一意識別子 */
  groupId: string;
  /** グループ名 */
  groupName: string;
  /** グループに含まれるツール名の配列 */
  toolNames: string[];
  /** グループの種別 */
  groupType: "file_read" | "file_write" | "search" | "execute" | "query" | "other";
  /** このグループの融合可能性スコア（0-1） */
  fusionScore: number;
  /** グループの説明 */
  description: string;
}

/**
 * コンパイル結果を表現する型
 * @summary コンパイル結果定義
 */
export interface CompilationResult {
  /** コンパイルの一意識別子 */
  compilationId: string;
  /** 元のツール呼び出し数 */
  originalToolCount: number;
  /** 融合後の操作数 */
  fusedOperationCount: number;
  /** 融合操作の配列（トポロジカルソート済み） */
  fusedOperations: FusedOperation[];
  /** 検出されたツールグループ */
  toolGroups: ToolGroup[];
  /** 依存グラフ */
  dependencyGraph: Map<string, DependencyNode>;
  /** 推定トークン節約量（合計） */
  totalTokenSavings: number;
  /** 並列実行可能な操作数 */
  parallelizableCount: number;
  /** コンパイル時のメトリクス */
  metrics: CompilationMetrics;
  /** 警告メッセージの配列 */
  warnings: string[];
  /** コンパイル成功フラグ */
  success: boolean;
  /** エラーメッセージ（失敗時のみ） */
  error?: string;
}

/**
 * コンパイル時のメトリクス
 * @summary コンパイルメトリクス
 */
export interface CompilationMetrics {
  /** コンパイルにかかった時間（ミリ秒） */
  compilationTimeMs: number;
  /** 依存解析にかかった時間（ミリ秒） */
  dependencyAnalysisTimeMs: number;
  /** グループ化にかかった時間（ミリ秒） */
  groupingTimeMs: number;
  /** 融合にかかった時間（ミリ秒） */
  fusionTimeMs: number;
  /** 平均依存数 */
  averageDependencies: number;
  /** 最大依存深度 */
  maxDependencyDepth: number;
  /** 循環依存が検出されたか */
  hasCircularDependencies: boolean;
}

/**
 * 個別のツール実行結果
 * @summary ツール実行結果
 */
export interface ToolExecutionResult {
  /** ツール呼び出しID */
  toolId: string;
  /** ツール名 */
  toolName: string;
  /** 実行成功フラグ */
  success: boolean;
  /** 実行結果データ */
  result?: unknown;
  /** エラーメッセージ（失敗時のみ） */
  error?: string;
  /** エラーオブジェクト（失敗時のみ） */
  errorObject?: Error;
  /** 実行時間（ミリ秒） */
  executionTimeMs: number;
  /** 使用トークン数（オプション） */
  tokensUsed?: number;
}

/**
 * 融合操作の実行結果
 * @summary 融合操作実行結果
 */
export interface FusedExecutionResult {
  /** 融合操作ID */
  fusedId: string;
  /** 各ツールの実行結果（ツールID → 結果のマップ） */
  toolResults: Map<string, ToolExecutionResult>;
  /** 全体の成功フラグ（全ツールが成功した場合のみtrue） */
  success: boolean;
  /** 合計実行時間（ミリ秒） */
  totalExecutionTimeMs: number;
  /** 並列実行されたか */
  wasParallel: boolean;
  /** 失敗したツールIDの配列 */
  failedToolIds: string[];
}

/**
 * 全体の実行結果
 * @summary 全体実行結果
 */
export interface ExecutionResult {
  /** 実行の一意識別子 */
  executionId: string;
  /** 元のコンパイル結果 */
  compilation: CompilationResult;
  /** 各融合操作の実行結果 */
  fusedResults: FusedExecutionResult[];
  /** 全ツールの実行結果（ツールID → 結果のマップ） */
  allToolResults: Map<string, ToolExecutionResult>;
  /** 全体の成功フラグ */
  success: boolean;
  /** 合計実行時間（ミリ秒） */
  totalExecutionTimeMs: number;
  /** 節約されたトークン数（推定） */
  savedTokens: number;
  /** 節約された時間（ミリ秒、推定） */
  savedTimeMs: number;
  /** エラーサマリー */
  errorSummary?: string;
}

/**
 * ツール融合の設定
 * @summary 融合設定
 */
export interface FusionConfig {
  /** 並列実行の最大数 */
  maxParallelism: number;
  /** 融合を有効にする最小ツール数 */
  minToolsForFusion: number;
  /** トークン節約の最小閾値（これ以下なら融合しない） */
  minTokenSavingsThreshold: number;
  /** ファイル読み込みツールのパターン */
  fileReadPatterns: string[];
  /** ファイル書き込みツールのパターン */
  fileWritePatterns: string[];
  /** 検索ツールのパターン */
  searchPatterns: string[];
  /** 依存解析を有効にするか */
  enableDependencyAnalysis: boolean;
  /** 自動グループ化を有効にするか */
  enableAutoGrouping: boolean;
  /** デバッグモード */
  debugMode: boolean;
}

/**
 * デフォルトの融合設定
 */
export const DEFAULT_FUSION_CONFIG: FusionConfig = {
  maxParallelism: 5,
  minToolsForFusion: 2,
  minTokenSavingsThreshold: 100,
  fileReadPatterns: ["read", "cat", "head", "tail", "less", "view", "get", "fetch"],
  fileWritePatterns: ["write", "save", "create", "update", "put", "post", "patch"],
  searchPatterns: ["search", "find", "grep", "rg", "locate", "query", "lookup"],
  enableDependencyAnalysis: true,
  enableAutoGrouping: true,
  debugMode: false,
};

/**
 * ツール実行関数の型
 * @summary ツール実行関数
 */
export type ToolExecutorFn = (
  toolName: string,
  args: Record<string, unknown>,
  signal?: AbortSignal
) => Promise<unknown>;

/**
 * 進捗コールバックの型
 * @summary 進捗コールバック
 */
export type ProgressCallback = (
  fusedId: string,
  phase: "starting" | "executing" | "completed" | "failed",
  details?: string
) => void;

// ============================================================================
// Type Guards
// ============================================================================

/**
 * ToolCall型ガード
 * @summary ToolCall型チェック
 */
export function isToolCall(value: unknown): value is ToolCall {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === "string" &&
    typeof obj.name === "string" &&
    typeof obj.arguments === "object" &&
    obj.arguments !== null
  );
}

/**
 * FusedOperation型ガード
 * @summary FusedOperation型チェック
 */
export function isFusedOperation(value: unknown): value is FusedOperation {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.fusedId === "string" &&
    Array.isArray(obj.toolIds) &&
    obj.toolIds.length > 0 &&
    Array.isArray(obj.toolCalls) &&
    typeof obj.canExecuteInParallel === "boolean"
  );
}

/**
 * CompilationResult型ガード
 * @summary CompilationResult型チェック
 */
export function isCompilationResult(value: unknown): value is CompilationResult {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.compilationId === "string" &&
    typeof obj.originalToolCount === "number" &&
    typeof obj.fusedOperationCount === "number" &&
    Array.isArray(obj.fusedOperations) &&
    typeof obj.success === "boolean"
  );
}
