/**
 * @abdd.meta
 * path: .pi/extensions/tool-compiler.ts
 * role: pi SDKとの統合・Tool Compilerツール公開
 * why: エージェントからTool Compiler機能を利用可能にし、ツール呼び出しの並列化とトークン節約を実現するため
 * related: .pi/lib/tool-fuser.ts, .pi/lib/tool-executor.ts, .pi/lib/tool-compiler-types.ts
 * public_api: compile_tools, execute_compiled, integrateWithSubagents, integrateWithTeamExecution
 * invariants: pi SDKツールとして登録済み、コンパイル結果は一時ストレージに保存される
 * side_effects: ツール実行、LLM呼び出し、ファイルI/O（ストレージ）
 * failure_modes: ツール登録失敗、実行エラー、ストレージ書き込みエラー
 * @abdd.explain
 * overview: LLMCompiler論文のTool Compiler手法をpi SDKのツールとして公開する拡張機能
 * what_it_does:
 *   - compile_tools: ツールセットを分析し、類似ツールを融合して並列実行可能な操作を生成
 *   - execute_compiled: 融合された操作を実行し、元のツールに分解して並列/順次実行
 *   - subagent_run/parallelとの統合フックを提供
 *   - agent_team_runとの統合フックを提供
 * why_it_exists:
 *   - エージェントからTool Compiler機能を透過的に利用可能にするため
 *   - 既存のsubagent/agent-teamsシステムへの統合ポイントを提供するため
 * scope:
 *   in: ツール定義配列、設定オプション
 *   out: pi SDKツール定義、統合フック関数
 */

// File: .pi/extensions/tool-compiler.ts
// Description: pi SDK integration for Tool Compiler - exposes compile_tools and execute_compiled as agent tools.
// Why: Enables agents to use Tool Compiler functionality for parallel tool execution and token savings.
// Related: .pi/lib/tool-fuser.ts, .pi/lib/tool-executor.ts, .pi/lib/tool-compiler-types.ts

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { ToolFuser } from "../lib/tool-fuser.js";
import { ToolExecutor } from "../lib/tool-executor.js";
import type {
  ToolCall,
  CompilationResult,
  FusionConfig,
  ToolExecutorFn,
} from "../lib/tool-compiler-types.js";

// ============================================================================
// In-Memory Compilation Cache
// ============================================================================

interface CachedCompilation {
  id: string;
  result: CompilationResult;
  createdAt: number;
  expiresAt: number;
}

const compilationCache = new Map<string, CachedCompilation>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * コンパイル結果をキャッシュに保存
 * @summary コンパイルキャッシュ保存
 */
function cacheCompilation(result: CompilationResult): void {
  const now = Date.now();
  const cached: CachedCompilation = {
    id: result.compilationId,
    result,
    createdAt: now,
    expiresAt: now + CACHE_TTL_MS,
  };
  compilationCache.set(result.compilationId, cached);

  // 期限切れエントリをクリーンアップ
  for (const key of compilationCache.keys()) {
    const entry = compilationCache.get(key);
    if (entry && entry.expiresAt < now) {
      compilationCache.delete(key);
    }
  }
}

/**
 * キャッシュからコンパイル結果を取得
 * @summary コンパイルキャッシュ取得
 */
function getCachedCompilation(id: string): CompilationResult | null {
  const cached = compilationCache.get(id);
  if (!cached) return null;
  if (cached.expiresAt < Date.now()) {
    compilationCache.delete(id);
    return null;
  }
  return cached.result;
}

// ============================================================================
// Integration Hooks (Exported for external use)
// ============================================================================

/**
 * subagent_run/parallelへの統合フック
 * Subagent実行前のツール融合を行う
 * @param tools - ツール定義配列
 * @param fuserConfig - 融合設定（オプション）
 * @returns コンパイル結果と融合を使用すべきかのフラグ
 * @summary Subagent統合フック
 */
export function integrateWithSubagents(
  tools: ToolCall[],
  fuserConfig?: Partial<FusionConfig>
): { compiled: CompilationResult; shouldUseFusion: boolean } {
  const fuser = new ToolFuser(fuserConfig);
  const result = fuser.compile(tools);

  // 融合の利点がある場合のみ使用（トークン節約が閾値以上）
  const shouldUseFusion = result.totalTokenSavings >= (fuserConfig?.minTokenSavingsThreshold ?? 100);

  return { compiled: result, shouldUseFusion };
}

/**
 * agent_team_runへの統合フック
 * チーム実行でのツール融合を行う
 * @param memberTools - メンバーIDとツール定義のマップ
 * @param fuserConfig - 融合設定（オプション）
 * @returns メンバーIDとコンパイル結果のマップ
 * @summary チーム実行統合フック
 */
export function integrateWithTeamExecution(
  memberTools: Map<string, ToolCall[]>,
  fuserConfig?: Partial<FusionConfig>
): Map<string, CompilationResult> {
  const results = new Map<string, CompilationResult>();
  const fuser = new ToolFuser(fuserConfig);

  for (const entry of memberTools.entries()) {
    const [memberId, tools] = entry;
    if (tools.length > 0) {
      results.set(memberId, fuser.compile(tools));
    }
  }

  return results;
}

/**
 * 複数のツール定義を融合して、LLMに提示するツールセットを最適化
 * @param toolDefinitions - 元のツール定義配列
 * @param config - 融合設定
 * @returns 最適化されたツール定義配列と融合マッピング
 * @summary ツール定義最適化
 */
export function optimizeToolDefinitions(
  toolDefinitions: Array<{ name: string; description: string; parameters: Record<string, unknown> }>,
  config?: Partial<FusionConfig>
): {
  optimizedTools: Array<{ name: string; description: string; parameters: Record<string, unknown> }>;
  fusionMapping: Map<string, string[]>; // fusedName -> originalNames
  estimatedSavings: { tokenReduction: number; parallelismGain: number };
} {
  const fuser = new ToolFuser(config);

  // ToolCall形式に変換（引数は空）
  const toolCalls: ToolCall[] = toolDefinitions.map((def, idx) => ({
    id: `def-${idx}`,
    name: def.name,
    arguments: {},
  }));

  const result = fuser.compile(toolCalls);
  const fusionMapping = new Map<string, string[]>();

  // 最適化されたツール定義を構築
  const optimizedTools: Array<{ name: string; description: string; parameters: Record<string, unknown> }> =
    [];

  // 融合されたツールを追加
  for (const fusedOp of result.fusedOperations) {
    const originalNames = fusedOp.toolCalls.map((t) => t.name);
    const fusedName = `fused_${originalNames.join("_")}`;
    const fusedDescription = `【融合操作】${originalNames.join(" + ")}を${
      fusedOp.executionStrategy === "parallel" ? "並列" : "順次"
    }実行。推定トークン節約: ${fusedOp.estimatedTokenSavings}`;

    fusionMapping.set(fusedName, originalNames);

    optimizedTools.push({
      name: fusedName,
      description: fusedDescription,
      parameters: {
        type: "object",
        properties: {
          _fusionNote: {
            type: "string",
            description: "この操作は自動的に融合されました",
          },
        },
      },
    });
  }

  return {
    optimizedTools,
    fusionMapping,
    estimatedSavings: {
      tokenReduction: result.totalTokenSavings,
      parallelismGain: result.parallelizableCount,
    },
  };
}

// ============================================================================
// Tool Handlers
// ============================================================================

interface CompileToolsParams {
  toolCalls: Array<{
    id?: string;
    name: string;
    arguments: Record<string, unknown>;
    estimatedTokens?: number;
  }>;
  config?: {
    maxParallelism?: number;
    minToolsForFusion?: number;
    minTokenSavingsThreshold?: number;
    enableDependencyAnalysis?: boolean;
    enableAutoGrouping?: boolean;
    debugMode?: boolean;
  };
}

interface ExecuteCompiledParams {
  compilationId: string;
  executorMode?: "parallel" | "sequential" | "auto";
  timeoutMs?: number;
  continueOnError?: boolean;
}

/**
 * compile_tools ツールのハンドラ
 */
async function handleCompileTools(params: CompileToolsParams): Promise<string> {
  const { toolCalls, config } = params;

  try {
    // ツール呼び出しにIDを付与
    const callsWithIds: ToolCall[] = toolCalls.map((call, idx) => ({
      ...call,
      id: call.id ?? `tool-${idx}-${Date.now()}`,
    }));

    // ToolFuserでコンパイル
    const fuserConfig: Partial<FusionConfig> = {
      maxParallelism: config?.maxParallelism,
      minToolsForFusion: config?.minToolsForFusion,
      minTokenSavingsThreshold: config?.minTokenSavingsThreshold,
      enableDependencyAnalysis: config?.enableDependencyAnalysis,
      enableAutoGrouping: config?.enableAutoGrouping,
      debugMode: config?.debugMode,
    };

    const fuser = new ToolFuser(fuserConfig);
    const result = fuser.compile(callsWithIds);

    // 結果をキャッシュ
    cacheCompilation(result);

    // 結果をフォーマット
    const output = {
      success: result.success,
      compilationId: result.compilationId,
      fusedOperations: result.fusedOperations.map((op) => ({
        fusedId: op.fusedId,
        toolNames: op.toolCalls.map((t) => t.name),
        canExecuteInParallel: op.canExecuteInParallel,
        executionStrategy: op.executionStrategy,
        estimatedTokenSavings: op.estimatedTokenSavings,
        priority: op.priority,
      })),
      toolGroups: result.toolGroups,
      metrics: {
        originalToolCount: result.originalToolCount,
        fusedOperationCount: result.fusedOperationCount,
        totalTokenSavings: result.totalTokenSavings,
        parallelizableCount: result.parallelizableCount,
        compilationTimeMs: result.metrics.compilationTimeMs,
        dependencyAnalysisTimeMs: result.metrics.dependencyAnalysisTimeMs,
        groupingTimeMs: result.metrics.groupingTimeMs,
        fusionTimeMs: result.metrics.fusionTimeMs,
        averageDependencies: result.metrics.averageDependencies,
        maxDependencyDepth: result.metrics.maxDependencyDepth,
        hasCircularDependencies: result.metrics.hasCircularDependencies,
      },
      dependencyGraph: {
        nodeCount: result.dependencyGraph.size,
        hasCircularDependencies: result.metrics.hasCircularDependencies,
      },
      warnings: result.warnings,
    };

    return JSON.stringify(output, null, 2);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({
      success: false,
      error: `コンパイルエラー: ${errorMessage}`,
      fusedOperations: [],
      metrics: null,
    }, null, 2);
  }
}

/**
 * execute_compiled ツールのハンドラ
 */
async function handleExecuteCompiled(params: ExecuteCompiledParams): Promise<string> {
  const { compilationId, executorMode = "auto" } = params;

  try {
    // キャッシュからコンパイル結果を取得
    const compilation = getCachedCompilation(compilationId);
    if (!compilation) {
      return JSON.stringify({
        success: false,
        error: `コンパイル結果が見つかりません: ${compilationId}。キャッシュの有効期限が切れた可能性があります。`,
        results: [],
      }, null, 2);
    }

    // ツール実行関数（実際のツール実行はpi contextが必要）
    // この拡張機能単体ではダミー実行を返す
    const dummyExecutor: ToolExecutorFn = async (
      toolName: string,
      args: Record<string, unknown>,
      _signal?: AbortSignal
    ) => {
      return {
        toolName,
        status: "simulated" as const,
        message: "実際のツール実行にはpi contextが必要です",
        args,
      };
    };

    const executorConfig: Partial<FusionConfig> = {
      maxParallelism: executorMode === "sequential" ? 1 : compilation.fusedOperations.length,
      debugMode: false,
    };

    const executor = new ToolExecutor(executorConfig);
    const result = await executor.execute(compilation, dummyExecutor);

    // allToolResultsを変換
    const toolResultsRecord: Record<string, unknown> = {};
    for (const entry of result.allToolResults.entries()) {
      const [toolId, toolResult] = entry;
      toolResultsRecord[toolId] = toolResult;
    }

    const output = {
      success: result.success,
      executionId: result.executionId,
      compilationId: result.compilation.compilationId,
      totalDurationMs: result.totalExecutionTimeMs,
      toolResults: toolResultsRecord,
      savedTokens: result.savedTokens,
      savedTimeMs: result.savedTimeMs,
      errorSummary: result.errorSummary,
      note: "この実行はシミュレーションです。実際のツール実行にはpi contextとの統合が必要です。",
    };

    return JSON.stringify(output, null, 2);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({
      success: false,
      error: `実行エラー: ${errorMessage}`,
      results: [],
    }, null, 2);
  }
}

// ============================================================================
// Extension Registration
// ============================================================================

/**
 * Tool Compiler拡張機能の登録関数
 * pi SDKのExtensionAPIを使用してツールを登録する
 */
export default function registerToolCompilerExtension(pi: ExtensionAPI): void {
  // compile_tools ツールを登録
  pi.registerTool({
    name: "compile_tools",
    label: "compile_tools",
    description:
      "ツール呼び出しセットを分析し、類似ツールを融合して並列実行可能な操作を生成する。トークンコスト削減とレイテンシ改善を実現。依存関係を解析し、独立した操作をグループ化する。",
    parameters: Type.Object({
      toolCalls: Type.Array(
        Type.Object({
          id: Type.Optional(Type.String()),
          name: Type.String(),
          arguments: Type.Record(Type.String(), Type.Any()),
          estimatedTokens: Type.Optional(Type.Number()),
        }),
        { minItems: 1 }
      ),
      config: Type.Optional(
        Type.Object({
          maxParallelism: Type.Optional(Type.Number()),
          minToolsForFusion: Type.Optional(Type.Number()),
          minTokenSavingsThreshold: Type.Optional(Type.Number()),
          enableDependencyAnalysis: Type.Optional(Type.Boolean()),
          enableAutoGrouping: Type.Optional(Type.Boolean()),
          debugMode: Type.Optional(Type.Boolean()),
        })
      ),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const result = await handleCompileTools(params as CompileToolsParams);
      return {
        content: [{ type: "text", text: result }],
        details: {},
      };
    },
  });

  // execute_compiled ツールを登録
  pi.registerTool({
    name: "execute_compiled",
    label: "execute_compiled",
    description:
      "compile_toolsで生成された融合操作を実行する。元のツールに分解し、依存関係に基づいて並列/順次実行する。実行結果を元のツールIDに対応付けて返す。",
    parameters: Type.Object({
      compilationId: Type.String(),
      executorMode: Type.Optional(
        Type.Union([Type.Literal("parallel"), Type.Literal("sequential"), Type.Literal("auto")])
      ),
      timeoutMs: Type.Optional(Type.Number()),
      continueOnError: Type.Optional(Type.Boolean()),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const result = await handleExecuteCompiled(params as ExecuteCompiledParams);
      return {
        content: [{ type: "text", text: result }],
        details: {},
      };
    },
  });
}
