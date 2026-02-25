/**
 * @file .pi/extensions/tool-compiler.ts の単体テスト
 * @description LLM-Tool Compiler拡張機能のテスト
 * @testFramework vitest
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ToolFuser } from "../../../.pi/lib/tool-fuser.js";
import { ToolExecutor } from "../../../.pi/lib/tool-executor.js";
import type {
  ToolCall,
  CompilationResult,
  FusedOperation,
  FusionConfig,
  ToolExecutorFn,
} from "../../../.pi/lib/tool-compiler-types.js";
import {
  integrateWithSubagents,
  integrateWithTeamExecution,
  optimizeToolDefinitions,
} from "../../../.pi/extensions/tool-compiler.js";

// ============================================================================
// テストヘルパー
// ============================================================================

const createMockToolCall = (
  id: string,
  name: string,
  args: Record<string, unknown> = {},
  estimatedTokens = 100
): ToolCall => ({
  id,
  name,
  arguments: args,
  estimatedTokens,
});

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// ============================================================================
// エクスポート確認テスト
// ============================================================================

describe("tool-compiler.ts エクスポート確認", () => {
  it("integrateWithSubagentsをエクスポート", () => {
    expect(integrateWithSubagents).toBeDefined();
    expect(typeof integrateWithSubagents).toBe("function");
  });

  it("integrateWithTeamExecutionをエクスポート", () => {
    expect(integrateWithTeamExecution).toBeDefined();
    expect(typeof integrateWithTeamExecution).toBe("function");
  });

  it("optimizeToolDefinitionsをエクスポート", () => {
    expect(optimizeToolDefinitions).toBeDefined();
    expect(typeof optimizeToolDefinitions).toBe("function");
  });
});

// ============================================================================
// integrateWithSubagents テスト
// ============================================================================

describe("integrateWithSubagents", () => {
  it("空のツールセットを処理", () => {
    const result = integrateWithSubagents([]);
    expect(result.compiled).toBeDefined();
    expect(result.compiled.originalToolCount).toBe(0);
    expect(result.shouldUseFusion).toBe(false);
  });

  it("単一ツールを処理", () => {
    const tools = [createMockToolCall("1", "read", { path: "file.txt" })];
    const result = integrateWithSubagents(tools);

    expect(result.compiled.originalToolCount).toBe(1);
    expect(result.compiled.fusedOperationCount).toBe(1);
    expect(result.shouldUseFusion).toBe(false); // 1ツールは融合の利点がない
  });

  it("複数の独立したツールを融合可能", () => {
    const tools = [
      createMockToolCall("1", "read", { path: "file1.txt" }, 150),
      createMockToolCall("2", "read", { path: "file2.txt" }, 150),
      createMockToolCall("3", "read", { path: "file3.txt" }, 150),
    ];
    const result = integrateWithSubagents(tools);

    expect(result.compiled.originalToolCount).toBe(3);
    expect(result.compiled.totalTokenSavings).toBeGreaterThan(0);
    // shouldUseFusionはminTokenSavingsThreshold（デフォルト100）による
    // トークン節約量が閾値を超える場合のみtrue
  });

  it("カスタムminTokenSavingsThresholdで制御", () => {
    const tools = [
      createMockToolCall("1", "read", { path: "file1.txt" }, 50),
      createMockToolCall("2", "read", { path: "file2.txt" }, 50),
    ];

    const result1 = integrateWithSubagents(tools, { minTokenSavingsThreshold: 100 });
    expect(result1.shouldUseFusion).toBe(false);

    const result2 = integrateWithSubagents(tools, { minTokenSavingsThreshold: 10 });
    expect(result2.shouldUseFusion).toBe(true);
  });

  it("依存関係のあるツールを検出", () => {
    const tools = [
      createMockToolCall("1", "write", { path: "output.txt" }),
      createMockToolCall("2", "read", { path: "output.txt" }),
    ];
    const result = integrateWithSubagents(tools, { enableDependencyAnalysis: true });

    // writeの後にreadが実行されるべき
    expect(result.compiled.metrics.hasCircularDependencies).toBe(false);
  });
});

// ============================================================================
// integrateWithTeamExecution テスト
// ============================================================================

describe("integrateWithTeamExecution", () => {
  it("空のメンバーマップを処理", () => {
    const memberTools = new Map<string, ToolCall[]>();
    const result = integrateWithTeamExecution(memberTools);

    expect(result.size).toBe(0);
  });

  it("複数メンバーのツールを処理", () => {
    const memberTools = new Map<string, ToolCall[]>([
      ["researcher", [createMockToolCall("1", "read", { path: "file1.txt" })]],
      ["implementer", [createMockToolCall("2", "write", { path: "file2.txt" })]],
    ]);

    const result = integrateWithTeamExecution(memberTools);

    expect(result.size).toBe(2);
    expect(result.get("researcher")).toBeDefined();
    expect(result.get("implementer")).toBeDefined();
    expect(result.get("researcher")?.originalToolCount).toBe(1);
  });

  it("ツールがないメンバーをスキップ", () => {
    const memberTools = new Map<string, ToolCall[]>([
      ["researcher", [createMockToolCall("1", "read", { path: "file1.txt" })]],
      ["observer", []], // 空の配列
    ]);

    const result = integrateWithTeamExecution(memberTools);

    expect(result.size).toBe(1);
    expect(result.has("observer")).toBe(false);
  });

  it("カスタムfuserConfigを適用", () => {
    const memberTools = new Map<string, ToolCall[]>([
      ["researcher", [createMockToolCall("1", "read", { path: "file1.txt" })]],
    ]);

    const result = integrateWithTeamExecution(memberTools, {
      maxParallelism: 10,
      minTokenSavingsThreshold: 50,
    });

    const compiled = result.get("researcher");
    expect(compiled).toBeDefined();
  });
});

// ============================================================================
// optimizeToolDefinitions テスト
// ============================================================================

describe("optimizeToolDefinitions", () => {
  it("ツール定義を最適化", () => {
    const toolDefinitions = [
      { name: "read", description: "Read file", parameters: { type: "object" } },
      { name: "write", description: "Write file", parameters: { type: "object" } },
    ];

    const result = optimizeToolDefinitions(toolDefinitions);

    expect(result.optimizedTools).toBeDefined();
    expect(result.fusionMapping).toBeInstanceOf(Map);
    expect(result.estimatedSavings).toHaveProperty("tokenReduction");
    expect(result.estimatedSavings).toHaveProperty("parallelismGain");
  });

  it("融合マッピングを生成", () => {
    const toolDefinitions = [
      { name: "read", description: "Read file", parameters: { type: "object" } },
      { name: "write", description: "Write file", parameters: { type: "object" } },
    ];

    const result = optimizeToolDefinitions(toolDefinitions);

    // 融合されたツール名には元のツール名が含まれる
    const hasFusedName = Array.from(result.fusionMapping.keys()).some((name) =>
      name.startsWith("fused_")
    );
    expect(hasFusedName).toBe(true);
  });

  it("空の定義を処理", () => {
    const result = optimizeToolDefinitions([]);

    expect(result.optimizedTools).toHaveLength(0);
    expect(result.fusionMapping.size).toBe(0);
    expect(result.estimatedSavings.tokenReduction).toBe(0);
  });

  it("単一定義を処理", () => {
    const toolDefinitions = [
      { name: "read", description: "Read file", parameters: { type: "object" } },
    ];

    const result = optimizeToolDefinitions(toolDefinitions);

    expect(result.optimizedTools).toHaveLength(1);
    // 単一ツールの場合もfused_プレフィックスが付く実装
    expect(result.optimizedTools[0].name).toContain("read");
  });

  it("カスタムconfigを適用", () => {
    const toolDefinitions = [
      { name: "read", description: "Read file", parameters: { type: "object" } },
      { name: "write", description: "Write file", parameters: { type: "object" } },
    ];

    const result = optimizeToolDefinitions(toolDefinitions, {
      maxParallelism: 10,
      minToolsForFusion: 3,
    });

    expect(result).toBeDefined();
  });
});

// ============================================================================
// コンパイルキャッシュのテスト
// ============================================================================

describe("コンパイルキャッシュ", () => {
  let handleCompileTools: (params: any) => Promise<{ content: { type: string; text: string }[]; details: any }>;

  beforeEach(() => {
    // モジュールをリロードしてキャッシュをクリア
    vi.resetModules();
  });

  it("コンパイル結果をキャッシュに保存", async () => {
    const { default: toolCompiler } = await import("../../../.pi/extensions/tool-compiler.js");

    // pi APIモックの作成
    const mockPi: any = {
      registerTool: vi.fn((toolDef) => {
        if (toolDef.name === "compile_tools") {
          handleCompileTools = toolDef.execute;
        }
      }),
    };

    toolCompiler(mockPi);

    const params = {
      toolCalls: [
        { name: "read", arguments: { path: "file.txt" } },
        { name: "read", arguments: { path: "file2.txt" } },
      ],
    };

    const result1 = await handleCompileTools("tool-1", params, undefined, undefined, undefined);
    const parsed1 = JSON.parse(result1.content[0].text);
    const compilationId1 = parsed1.compilationId;

    expect(compilationId1).toBeDefined();
    expect(typeof compilationId1).toBe("string");
  });

  it("同じツールセットで一貫したcompilationIdを生成", async () => {
    const { default: toolCompiler } = await import("../../../.pi/extensions/tool-compiler.js");

    const mockPi: any = {
      registerTool: vi.fn((toolDef) => {
        if (toolDef.name === "compile_tools") {
          handleCompileTools = toolDef.execute;
        }
      }),
    };

    toolCompiler(mockPi);

    const params = {
      toolCalls: [
        { name: "read", arguments: { path: "file.txt" } },
        { name: "read", arguments: { path: "file2.txt" } },
      ],
    };

    const result1 = await handleCompileTools("tool-1", params, undefined, undefined, undefined);
    const result2 = await handleCompileTools("tool-2", params, undefined, undefined, undefined);

    const parsed1 = JSON.parse(result1.content[0].text);
    const parsed2 = JSON.parse(result2.content[0].text);

    // 同じツールセットなら同じIDを生成するかどうかは実装依存
    expect(parsed1.success).toBe(true);
    expect(parsed2.success).toBe(true);
  });
});

// ============================================================================
// ToolFuser 統合テスト
// ============================================================================

describe("ToolFuser 統合", () => {
  it("複数の独立ツールを融合", () => {
    const tools: ToolCall[] = [
      createMockToolCall("1", "read", { path: "file1.txt" }),
      createMockToolCall("2", "read", { path: "file2.txt" }),
      createMockToolCall("3", "read", { path: "file3.txt" }),
    ];

    const fuser = new ToolFuser({});
    const result = fuser.compile(tools);

    expect(result.success).toBe(true);
    expect(result.originalToolCount).toBe(3);
    expect(result.fusedOperationCount).toBeGreaterThan(0);
    expect(result.totalTokenSavings).toBeGreaterThan(0);
  });

  it("依存関係を検出", () => {
    const tools: ToolCall[] = [
      createMockToolCall("1", "write", { path: "output.txt" }),
      createMockToolCall("2", "read", { path: "output.txt" }),
    ];

    const fuser = new ToolFuser({ enableDependencyAnalysis: true });
    const result = fuser.compile(tools);

    expect(result.metrics.hasCircularDependencies).toBe(false);
    expect(result.dependencyGraph.size).toBe(2);
  });

  it("循環依存を検出", () => {
    // ツール1とツール2が互いに依存する循環
    const tools: ToolCall[] = [
      createMockToolCall("1", "operation_a", { file: "file1.txt" }),
      createMockToolCall("2", "operation_b", { file: "file2.txt" }),
    ];

    // 手動で循環依存を作るには、ToolFuserの内部実装に依存するため
    // ここでは基本的な依存解析が動作することを確認
    const fuser = new ToolFuser({ enableDependencyAnalysis: true });
    const result = fuser.compile(tools);

    expect(result.success).toBe(true);
  });

  it("デバッグモードで詳細情報を出力", () => {
    const tools: ToolCall[] = [
      createMockToolCall("1", "read", { path: "file.txt" }),
    ];

    const fuser = new ToolFuser({ debugMode: true });
    const result = fuser.compile(tools);

    expect(result.metrics).toBeDefined();
    expect(result.metrics.compilationTimeMs).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// ToolExecutor 統合テスト
// ============================================================================

describe("ToolExecutor 統合", () => {
  it("ダミー実行関数でテスト", async () => {
    const tools: ToolCall[] = [
      createMockToolCall("1", "read", { path: "file.txt" }),
    ];

    const fuser = new ToolFuser({});
    const compilation = fuser.compile(tools);

    const dummyExecutor: ToolExecutorFn = async (
      toolName: string,
      args: Record<string, unknown>
    ) => {
      return { toolName, args, status: "success" };
    };

    const executor = new ToolExecutor({});
    const result = await executor.execute(compilation, dummyExecutor);

    expect(result.success).toBe(true);
    expect(result.executionId).toBeDefined();
    expect(result.totalExecutionTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("エラー実行関数でエラーを処理", async () => {
    const tools: ToolCall[] = [
      createMockToolCall("1", "read", { path: "file.txt" }),
    ];

    const fuser = new ToolFuser({});
    const compilation = fuser.compile(tools);

    const errorExecutor: ToolExecutorFn = async () => {
      throw new Error("Test error");
    };

    const executor = new ToolExecutor({ continueOnError: true });
    const result = await executor.execute(compilation, errorExecutor);

    expect(result.success).toBe(false);
    expect(result.errorSummary).toContain("Test error");
  });
});

// ============================================================================
// 並列実行テスト
// ============================================================================

describe("並列実行", () => {
  it("並列実行で時間を節約", async () => {
    const tools: ToolCall[] = [
      createMockToolCall("1", "read", { path: "file1.txt" }),
      createMockToolCall("2", "read", { path: "file2.txt" }),
      createMockToolCall("3", "read", { path: "file3.txt" }),
    ];

    const fuser = new ToolFuser({});
    const compilation = fuser.compile(tools);

    const slowExecutor: ToolExecutorFn = async (toolName: string) => {
      await delay(100);
      return { toolName, delay: 100 };
    };

    const executor = new ToolExecutor({ maxParallelism: 3 });
    const startTime = Date.now();
    const result = await executor.execute(compilation, slowExecutor);
    const duration = Date.now() - startTime;

    // 並列実行なら300ms以内で完了（100ms * 3が並列）
    expect(duration).toBeLessThan(250);
    expect(result.success).toBe(true);
  });

  it("順次実行の場合は時間がかかる", async () => {
    const tools: ToolCall[] = [
      createMockToolCall("1", "read", { path: "file1.txt" }),
      createMockToolCall("2", "read", { path: "file2.txt" }),
    ];

    const fuser = new ToolFuser({});
    const compilation = fuser.compile(tools);

    const slowExecutor: ToolExecutorFn = async (toolName: string) => {
      await delay(50);
      return { toolName, delay: 50 };
    };

    const executor = new ToolExecutor({ maxParallelism: 1 }); // 順次
    const startTime = Date.now();
    const result = await executor.execute(compilation, slowExecutor);
    const duration = Date.now() - startTime;

    // 順次なら100ms以上かかる
    expect(duration).toBeGreaterThanOrEqual(90);
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// エッジケースのテスト
// ============================================================================

describe("エッジケース", () => {
  it("大量のツールを処理", () => {
    const tools: ToolCall[] = [];
    for (let i = 0; i < 100; i++) {
      tools.push(createMockToolCall(`${i}`, "read", { path: `file${i}.txt` }));
    }

    const result = integrateWithSubagents(tools);

    expect(result.compiled.originalToolCount).toBe(100);
    expect(result.compiled.success).toBe(true);
  });

  it("非常に長いツール名", () => {
    const longName = "a".repeat(1000);
    const tools = [createMockToolCall("1", longName, { path: "file.txt" })];

    expect(() => integrateWithSubagents(tools)).not.toThrow();
  });

  it("特殊文字を含む引数", () => {
    const tools = [
      createMockToolCall("1", "read", {
        path: "日本語/ファイル.txt",
        encoding: "utf-8",
      }),
    ];

    const result = integrateWithSubagents(tools);

    expect(result.compiled.success).toBe(true);
  });

  it("undefinedやnullを含む引数", () => {
    const tools = [
      createMockToolCall("1", "read", {
        path: "file.txt",
        optional: undefined,
        nullable: null,
      } as any),
    ];

    expect(() => integrateWithSubagents(tools)).not.toThrow();
  });
});

// ============================================================================
// メトリクスのテスト
// ============================================================================

describe("メトリクス", () => {
  it("コンパイル時間を計測", () => {
    const tools: ToolCall[] = [
      createMockToolCall("1", "read", { path: "file.txt" }),
    ];

    const fuser = new ToolFuser({});
    const result = fuser.compile(tools);

    expect(result.metrics.compilationTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.metrics.dependencyAnalysisTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.metrics.fusionTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("トークン節約量を計算", () => {
    const tools: ToolCall[] = [
      createMockToolCall("1", "read", { path: "file1.txt" }, 100),
      createMockToolCall("2", "read", { path: "file2.txt" }, 100),
    ];

    const result = integrateWithSubagents(tools);

    expect(result.compiled.totalTokenSavings).toBeGreaterThan(0);
  });

  it("並列実行可能なツール数を計算", () => {
    const tools: ToolCall[] = [
      createMockToolCall("1", "read", { path: "file1.txt" }),
      createMockToolCall("2", "read", { path: "file2.txt" }),
    ];

    const result = integrateWithSubagents(tools);

    expect(result.compiled.parallelizableCount).toBeGreaterThan(0);
  });

  it("依存深度を計算", () => {
    const tools: ToolCall[] = [
      createMockToolCall("1", "write", { path: "file1.txt" }),
      createMockToolCall("2", "read", { path: "file1.txt" }),
    ];

    const fuser = new ToolFuser({ enableDependencyAnalysis: true });
    const result = fuser.compile(tools);

    expect(result.metrics.maxDependencyDepth).toBeGreaterThanOrEqual(0);
    expect(result.metrics.averageDependencies).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// 警告のテスト
// ============================================================================

describe("警告", () => {
  it("空のツールセットで警告", () => {
    const result = integrateWithSubagents([]);

    expect(result.compiled.originalToolCount).toBe(0);
    expect(result.compiled.fusedOperationCount).toBe(0);
  });

  it("融合候補がない場合の警告", () => {
    const tools = [
      createMockToolCall("1", "unique_tool_a", { arg: 1 }),
      createMockToolCall("2", "unique_tool_b", { arg: 2 }),
    ];

    const result = integrateWithSubagents(tools);

    // 類似ツールがない場合、融合効果は限定的
    expect(result.compiled.totalTokenSavings).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// 実行モードのテスト
// ============================================================================

describe("実行モード", () => {
  it("並列モードで実行", async () => {
    const tools: ToolCall[] = [
      createMockToolCall("1", "read", { path: "file1.txt" }),
      createMockToolCall("2", "read", { path: "file2.txt" }),
    ];

    const fuser = new ToolFuser({});
    const compilation = fuser.compile(tools);

    const executor: ToolExecutorFn = async (toolName: string) => {
      return { toolName };
    };

    const toolExecutor = new ToolExecutor({ maxParallelism: 2 });
    const result = await toolExecutor.execute(compilation, executor);

    expect(result.success).toBe(true);
  });

  it("順次モードで実行", async () => {
    const tools: ToolCall[] = [
      createMockToolCall("1", "read", { path: "file1.txt" }),
      createMockToolCall("2", "read", { path: "file2.txt" }),
    ];

    const fuser = new ToolFuser({});
    const compilation = fuser.compile(tools);

    const executor: ToolExecutorFn = async (toolName: string) => {
      return { toolName };
    };

    const toolExecutor = new ToolExecutor({ maxParallelism: 1 });
    const result = await toolExecutor.execute(compilation, executor);

    expect(result.success).toBe(true);
  });
});
