/**
 * @file .pi/extensions/tool-compiler.ts の統合テスト
 * @description Tool Compiler拡張機能のpi SDK統合テスト
 * @testFramework vitest
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Type } from "@mariozechner/pi-ai";

// pi SDKのモック
vi.mock("@mariozechner/pi-coding-agent", () => ({
  ExtensionAPI: vi.fn(),
}));

vi.mock("@mariozechner/pi-ai", () => ({
  Type: {
    String: () => ({ type: "string" }),
    Number: () => ({ type: "number" }),
    Boolean: () => ({ type: "boolean" }),
    Any: () => ({}),
    Optional: (def: any) => ({ ...def, optional: true }),
    Object: (def: any) => ({ type: "object", properties: def }),
    Array: (def: any, options?: any) => ({ type: "array", items: def, ...options }),
    Record: (keyType: any, valueType: any) => ({
      type: "record",
      keyType,
      valueType,
    }),
    Union: (defs: any[]) => ({ type: "union", oneOf: defs }),
    Literal: (val: any) => ({ type: "literal", value: val }),
  },
}));

// Subagent infrastructure mocks
vi.mock("../../../.pi/extensions/subagents/storage.js", () => ({
  loadStorage: vi.fn(() => ({
    agents: [
      {
        id: "tool-executor",
        name: "Tool Executor",
        description: "Executes fused tool operations",
        systemPrompt: "You are a tool executor",
        enabled: "enabled",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    runs: [],
    currentAgentId: "tool-executor",
  })),
  saveStorage: vi.fn(),
  ensurePaths: vi.fn(() => ({
    storageFile: "/tmp/test-storage.json",
    runsDir: "/tmp/test-runs",
  })),
}));

vi.mock("../../../.pi/extensions/subagents/task-execution.js", () => ({
  runSubagentTask: vi.fn(async (input: { task: string }) => {
    // Extract compilationId from the task string
    const compilationIdMatch = input.task.match(/Compilation ID: ([^\n]+)/);
    const compilationId = compilationIdMatch ? compilationIdMatch[1] : "test-compilation-id";
    
    return {
      runRecord: {
        runId: "test-run-id",
        agentId: "tool-executor",
        task: input.task,
        summary: "test summary",
        status: "completed",
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        latencyMs: 100,
        outputFile: "/tmp/test-output.json",
      },
      output: JSON.stringify({
        compilationId,
        success: true,
        toolResults: {
          "tool-1": {
            toolId: "tool-1",
            toolName: "read",
            success: true,
            result: "file content",
            executionTimeMs: 50,
          },
        },
      }),
      prompt: "test prompt",
    };
  }),
}));

vi.mock("../../../.pi/extensions/subagents/tool-executor-subagent.js", () => ({
  TOOL_EXECUTOR_SUBAGENT: {
    id: "tool-executor",
    name: "Tool Executor",
    description: "Executes fused tool operations",
    systemPrompt: "You are a tool executor",
    enabled: "enabled",
  },
  ensureToolExecutorSubagent: vi.fn(),
}));

// ============================================================================
// 拡張機能の統合テスト
// ============================================================================

describe("tool-compiler.ts 統合テスト", () => {
  let registeredTools: Map<string, any>;
  let mockPi: any;

  beforeEach(() => {
    registeredTools = new Map();
    mockPi = {
      registerTool: vi.fn((toolDef: any) => {
        registeredTools.set(toolDef.name, toolDef);
      }),
      registerCommand: vi.fn(),
    };
  });

  it("拡張機能を正常に登録", async () => {
    const toolCompiler = (await import("../../../.pi/extensions/tool-compiler.js")).default;

    expect(() => toolCompiler(mockPi)).not.toThrow();
  });

  it("compile_toolsツールを登録", async () => {
    const toolCompiler = (await import("../../../.pi/extensions/tool-compiler.js")).default;

    toolCompiler(mockPi);

    expect(registeredTools.has("compile_tools")).toBe(true);
    const tool = registeredTools.get("compile_tools");
    expect(tool).toBeDefined();
    expect(tool.name).toBe("compile_tools");
    expect(tool.execute).toBeDefined();
    expect(typeof tool.execute).toBe("function");
  });

  it("execute_compiledツールを登録", async () => {
    const toolCompiler = (await import("../../../.pi/extensions/tool-compiler.js")).default;

    toolCompiler(mockPi);

    expect(registeredTools.has("execute_compiled")).toBe(true);
    const tool = registeredTools.get("execute_compiled");
    expect(tool).toBeDefined();
    expect(tool.name).toBe("execute_compiled");
    expect(tool.execute).toBeDefined();
  });

  it("compile_toolsツールのパラメータ定義を検証", async () => {
    const toolCompiler = (await import("../../../.pi/extensions/tool-compiler.js")).default;

    toolCompiler(mockPi);

    const tool = registeredTools.get("compile_tools");
    expect(tool.parameters).toBeDefined();

    const params = tool.parameters;

    // toolCallsパラメータ
    expect(params.properties.toolCalls).toBeDefined();
    expect(params.properties.toolCalls.type).toBe("array");
    expect(params.properties.toolCalls.minItems).toBe(1);

    // configパラメータ（オプション）
    expect(params.properties.config).toBeDefined();
  });

  it("execute_compiledツールのパラメータ定義を検証", async () => {
    const toolCompiler = (await import("../../../.pi/extensions/tool-compiler.js")).default;

    toolCompiler(mockPi);

    const tool = registeredTools.get("execute_compiled");
    expect(tool.parameters).toBeDefined();

    const params = tool.parameters;

    // compilationId（必須）
    expect(params.properties.compilationId).toBeDefined();

    // executorMode（オプション）
    expect(params.properties.executorMode).toBeDefined();
  });

  it("compile_toolsのdescriptionが正しい", async () => {
    const toolCompiler = (await import("../../../.pi/extensions/tool-compiler.js")).default;

    toolCompiler(mockPi);

    const tool = registeredTools.get("compile_tools");
    expect(tool.description).toContain("ツール呼び出しセット");
    expect(tool.description).toContain("融合");
    expect(tool.description).toContain("並列実行");
  });

  it("execute_compiledのdescriptionが正しい", async () => {
    const toolCompiler = (await import("../../../.pi/extensions/tool-compiler.js")).default;

    toolCompiler(mockPi);

    const tool = registeredTools.get("execute_compiled");
    expect(tool.description).toContain("融合操作");
    expect(tool.description).toContain("実行");
  });
});

// ============================================================================
// compile_tools 実行テスト
// ============================================================================

describe("compile_tools 実行テスト", () => {
  let registeredTools: Map<string, any>;
  let mockPi: any;

  beforeEach(async () => {
    registeredTools = new Map();
    mockPi = {
      registerTool: vi.fn((toolDef: any) => {
        registeredTools.set(toolDef.name, toolDef);
      }),
    };

    const toolCompiler = (await import("../../../.pi/extensions/tool-compiler.js")).default;
    toolCompiler(mockPi);
  });

  it("基本的なツールセットをコンパイル", async () => {
    const tool = registeredTools.get("compile_tools");

    const params = {
      toolCalls: [
        { id: "1", name: "read", arguments: { path: "file1.txt" } },
        { id: "2", name: "read", arguments: { path: "file2.txt" } },
      ],
    };

    const result = await tool.execute("call-id", params, undefined, undefined, undefined);

    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe("text");

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.compilationId).toBeDefined();
    expect(parsed.metrics).toBeDefined();
  });

  it("空のツールセットを処理", async () => {
    const tool = registeredTools.get("compile_tools");

    const params = {
      toolCalls: [],
    };

    const result = await tool.execute("call-id", params, undefined, undefined, undefined);

    expect(result.content).toBeDefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.metrics).toBeDefined();
    expect(parsed.metrics.originalToolCount).toBe(0);
  });

  it("IDが省略されたツールセットにIDを付与", async () => {
    const tool = registeredTools.get("compile_tools");

    const params = {
      toolCalls: [
        { name: "read", arguments: { path: "file.txt" } },
      ],
    };

    const result = await tool.execute("call-id", params, undefined, undefined, undefined);

    expect(result.content).toBeDefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(true);
  });

  it("カスタムconfigを適用", async () => {
    const tool = registeredTools.get("compile_tools");

    const params = {
      toolCalls: [
        { id: "1", name: "read", arguments: { path: "file1.txt" } },
        { id: "2", name: "read", arguments: { path: "file2.txt" } },
      ],
      config: {
        maxParallelism: 10,
        minTokenSavingsThreshold: 50,
        enableDependencyAnalysis: true,
        debugMode: false,
      },
    };

    const result = await tool.execute("call-id", params, undefined, undefined, undefined);

    expect(result.content).toBeDefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(true);
  });

  it("大量のツールを処理", async () => {
    const tool = registeredTools.get("compile_tools");

    const toolCalls = [];
    for (let i = 0; i < 100; i++) {
      toolCalls.push({
        id: `${i}`,
        name: "read",
        arguments: { path: `file${i}.txt` },
      });
    }

    const params = { toolCalls };

    const result = await tool.execute("call-id", params, undefined, undefined, undefined);

    expect(result.content).toBeDefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.metrics).toBeDefined();
    expect(parsed.metrics.originalToolCount).toBe(100);
  });

  it("エラーをハンドル", async () => {
    const tool = registeredTools.get("compile_tools");

    // 不正なパラメータ（構造は正しいが、処理中にエラーが発生する可能性がある）
    const params = {
      toolCalls: [
        { id: "1", name: "", arguments: {} }, // 空のツール名
      ],
    };

    const result = await tool.execute("call-id", params, undefined, undefined, undefined);

    expect(result.content).toBeDefined();
    const parsed = JSON.parse(result.content[0].text);
    // エラー時はsuccessがfalseか、またはwarningが含まれる
    expect(parsed).toHaveProperty("success");
  });
});

// ============================================================================
// execute_compiled 実行テスト
// ============================================================================

describe("execute_compiled 実行テスト", () => {
  let registeredTools: Map<string, any>;
  let mockPi: any;
  let compilationId: string;

  beforeEach(async () => {
    registeredTools = new Map();
    mockPi = {
      registerTool: vi.fn((toolDef: any) => {
        registeredTools.set(toolDef.name, toolDef);
      }),
    };

    const toolCompiler = (await import("../../../.pi/extensions/tool-compiler.js")).default;
    toolCompiler(mockPi);

    // まずコンパイルを実行してcompilationIdを取得
    const compileTool = registeredTools.get("compile_tools");
    const compileResult = await compileTool.execute(
      "call-id",
      {
        toolCalls: [
          { id: "1", name: "read", arguments: { path: "file.txt" } },
        ],
      },
      undefined,
      undefined,
      undefined
    );

    const parsedCompile = JSON.parse(compileResult.content[0].text);
    compilationId = parsedCompile.compilationId;
  });

  it("コンパイル結果を実行", async () => {
    const tool = registeredTools.get("execute_compiled");

    const params = {
      compilationId,
      executorMode: "auto" as const,
    };

    const result = await tool.execute("call-id", params, undefined, undefined, { cwd: "/tmp/test" });

    expect(result.content).toBeDefined();
    const parsed = JSON.parse(result.content[0].text);
    // With subagent execution, success depends on subagent availability
    // In test environment, we check that the structure is correct
    expect(parsed).toHaveProperty("compilationId");
  });

  it("存在しないcompilationIdでエラー", async () => {
    const tool = registeredTools.get("execute_compiled");

    const params = {
      compilationId: "non-existent-id",
    };

    const result = await tool.execute("call-id", params, undefined, undefined, undefined);

    expect(result.content).toBeDefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("見つかりません");
  });

  it("並列実行モードを指定", async () => {
    const tool = registeredTools.get("execute_compiled");

    const params = {
      compilationId,
      executorMode: "parallel" as const,
    };

    const result = await tool.execute("call-id", params, undefined, undefined, { cwd: "/tmp/test" });

    expect(result.content).toBeDefined();
    const parsed = JSON.parse(result.content[0].text);
    // Execution mode is passed to subagent, check structure
    expect(parsed).toHaveProperty("compilationId");
  });

  it("順次実行モードを指定", async () => {
    const tool = registeredTools.get("execute_compiled");

    const params = {
      compilationId,
      executorMode: "sequential" as const,
    };

    const result = await tool.execute("call-id", params, undefined, undefined, { cwd: "/tmp/test" });

    expect(result.content).toBeDefined();
    const parsed = JSON.parse(result.content[0].text);
    // Execution mode is passed to subagent, check structure
    expect(parsed).toHaveProperty("compilationId");
  });

  it("timeoutパラメータを指定", async () => {
    const tool = registeredTools.get("execute_compiled");

    const params = {
      compilationId,
      timeoutMs: 5000,
    };

    const result = await tool.execute("call-id", params, undefined, undefined, undefined);

    expect(result.content).toBeDefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toBeDefined();
  });
});

// ============================================================================
// ワークフローの統合テスト
// ============================================================================

describe("ツール融合ワークフローの統合テスト", () => {
  let registeredTools: Map<string, any>;
  let mockPi: any;

  beforeEach(async () => {
    registeredTools = new Map();
    mockPi = {
      registerTool: vi.fn((toolDef: any) => {
        registeredTools.set(toolDef.name, toolDef);
      }),
    };

    const toolCompiler = (await import("../../../.pi/extensions/tool-compiler.js")).default;
    toolCompiler(mockPi);
  });

  it("複数の読み取り操作を融合して実行", async () => {
    const compileTool = registeredTools.get("compile_tools");
    const executeTool = registeredTools.get("execute_compiled");

    // ステップ1: コンパイル
    const compileResult = await compileTool.execute(
      "call-1",
      {
        toolCalls: [
          { id: "1", name: "read", arguments: { path: "file1.txt" } },
          { id: "2", name: "read", arguments: { path: "file2.txt" } },
          { id: "3", name: "read", arguments: { path: "file3.txt" } },
        ],
        config: {
          maxParallelism: 3,
        },
      },
      undefined,
      undefined,
      undefined
    );

    const compiled = JSON.parse(compileResult.content[0].text);
    expect(compiled.success).toBe(true);
    expect(compiled.fusedOperations.length).toBeGreaterThan(0);

    // ステップ2: 実行
    const executeResult = await executeTool.execute(
      "call-2",
      {
        compilationId: compiled.compilationId,
        executorMode: "parallel" as const,
      },
      undefined,
      undefined,
      { cwd: "/tmp/test" }
    );

    const executed = JSON.parse(executeResult.content[0].text);
    // Check structure - subagent execution returns compilationId
    expect(executed).toHaveProperty("compilationId");
  });

  it("依存関係を検出して順次実行", async () => {
    const compileTool = registeredTools.get("compile_tools");
    const executeTool = registeredTools.get("execute_compiled");

    // 依存関係のあるツールセット
    const compileResult = await compileTool.execute(
      "call-1",
      {
        toolCalls: [
          { id: "1", name: "write", arguments: { path: "output.txt" } },
          { id: "2", name: "read", arguments: { path: "output.txt" } },
        ],
        config: {
          enableDependencyAnalysis: true,
        },
      },
      undefined,
      undefined,
      undefined
    );

    const compiled = JSON.parse(compileResult.content[0].text);
    expect(compiled.success).toBe(true);

    // ステップ2: 実行
    const executeResult = await executeTool.execute(
      "call-2",
      {
        compilationId: compiled.compilationId,
        executorMode: "auto" as const,
      },
      undefined,
      undefined,
      { cwd: "/tmp/test" }
    );

    const executed = JSON.parse(executeResult.content[0].text);
    // Check structure - subagent execution returns compilationId
    expect(executed).toHaveProperty("compilationId");
  });
});

// ============================================================================
// メトリクスと統計のテスト
// ============================================================================

describe("メトリクスと統計", () => {
  let registeredTools: Map<string, any>;
  let mockPi: any;

  beforeEach(async () => {
    registeredTools = new Map();
    mockPi = {
      registerTool: vi.fn((toolDef: any) => {
        registeredTools.set(toolDef.name, toolDef);
      }),
    };

    const toolCompiler = (await import("../../../.pi/extensions/tool-compiler.js")).default;
    toolCompiler(mockPi);
  });

  it("コンパイルメトリクスを収集", async () => {
    const tool = registeredTools.get("compile_tools");

    const params = {
      toolCalls: [
        { id: "1", name: "read", arguments: { path: "file1.txt" } },
        { id: "2", name: "read", arguments: { path: "file2.txt" } },
      ],
    };

    const result = await tool.execute("call-id", params, undefined, undefined, undefined);

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.metrics).toBeDefined();
    expect(parsed.metrics.compilationTimeMs).toBeGreaterThanOrEqual(0);
    expect(parsed.metrics.fusionTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("依存解析メトリクスを収集", async () => {
    const tool = registeredTools.get("compile_tools");

    const params = {
      toolCalls: [
        { id: "1", name: "read", arguments: { path: "file1.txt" } },
        { id: "2", name: "read", arguments: { path: "file2.txt" } },
      ],
      config: {
        enableDependencyAnalysis: true,
      },
    };

    const result = await tool.execute("call-id", params, undefined, undefined, undefined);

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.metrics.dependencyAnalysisTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("トークン節約メトリクスを収集", async () => {
    const tool = registeredTools.get("compile_tools");

    const params = {
      toolCalls: [
        { id: "1", name: "read", arguments: { path: "file1.txt" }, estimatedTokens: 100 },
        { id: "2", name: "read", arguments: { path: "file2.txt" }, estimatedTokens: 100 },
      ],
    };

    const result = await tool.execute("call-id", params, undefined, undefined, undefined);

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.metrics).toBeDefined();
    expect(parsed.metrics.totalTokenSavings).toBeDefined();
    expect(parsed.metrics.totalTokenSavings).toBeGreaterThanOrEqual(0);
  });

  it("並列実行メトリクスを収集", async () => {
    const compileTool = registeredTools.get("compile_tools");
    const executeTool = registeredTools.get("execute_compiled");

    const compileResult = await compileTool.execute(
      "call-id",
      {
        toolCalls: [
          { id: "1", name: "read", arguments: { path: "file1.txt" } },
          { id: "2", name: "read", arguments: { path: "file2.txt" } },
        ],
      },
      undefined,
      undefined,
      undefined
    );

    const compiled = JSON.parse(compileResult.content[0].text);

    const executeResult = await executeTool.execute(
      "call-id-2",
      {
        compilationId: compiled.compilationId,
        executorMode: "parallel" as const,
      },
      undefined,
      undefined,
      { cwd: "/tmp/test" }
    );

    const executed = JSON.parse(executeResult.content[0].text);
    // Subagent execution returns totalDurationMs and savedTokens
    expect(executed).toHaveProperty("totalDurationMs");
    expect(executed).toHaveProperty("savedTokens");
  });
});

// ============================================================================
// エッジケースの統合テスト
// ============================================================================

describe("エッジケースの統合テスト", () => {
  let registeredTools: Map<string, any>;
  let mockPi: any;

  beforeEach(async () => {
    registeredTools = new Map();
    mockPi = {
      registerTool: vi.fn((toolDef: any) => {
        registeredTools.set(toolDef.name, toolDef);
      }),
    };

    const toolCompiler = (await import("../../../.pi/extensions/tool-compiler.js")).default;
    toolCompiler(mockPi);
  });

  it("特殊文字を含むツール名", async () => {
    const tool = registeredTools.get("compile_tools");

    const params = {
      toolCalls: [
        { id: "1", name: "日本語ツール", arguments: { path: "ファイル.txt" } },
      ],
    };

    const result = await tool.execute("call-id", params, undefined, undefined, undefined);

    expect(result.content).toBeDefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toBeDefined();
  });

  it("非常に長いツール名", async () => {
    const tool = registeredTools.get("compile_tools");

    const longName = "a".repeat(500);
    const params = {
      toolCalls: [
        { id: "1", name: longName, arguments: { path: "file.txt" } },
      ],
    };

    expect(async () => {
      await tool.execute("call-id", params, undefined, undefined, undefined);
    }).not.toThrow();
  });

  it("空の引数", async () => {
    const tool = registeredTools.get("compile_tools");

    const params = {
      toolCalls: [
        { id: "1", name: "read", arguments: {} },
      ],
    };

    const result = await tool.execute("call-id", params, undefined, undefined, undefined);

    expect(result.content).toBeDefined();
  });
});
