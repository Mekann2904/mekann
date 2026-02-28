// エージェントからのツール呼び出しシミュレーション

import { ToolFuser } from "./.pi/lib/tool-fuser.ts";
import { ToolExecutor } from "./.pi/lib/tool-executor.ts";
import type { ToolCall, ToolExecutorFn } from "./.pi/lib/tool-compiler-types.ts";

async function main() {
  console.log("=== エージェントからのツール呼び出しシミュレーション ===\n");

  // シミュレーション: エージェントが複数のツールを呼び出す
  console.log("ステップ1: エージェントがツールを呼び出す");
  const agentCalls: ToolCall[] = [
    { id: "call-1", name: "read", arguments: { path: "package.json" } },
    { id: "call-2", name: "read", arguments: { path: "tsconfig.json" } },
    { id: "call-3", name: "read", arguments: { path: "README.md" } },
  ];
  console.log(`ツール呼び出し数: ${agentCalls.length}`);
  console.log(JSON.stringify(agentCalls, null, 2));
  console.log();

  // ステップ2: compile_toolsで融合
  console.log("ステップ2: compile_toolsでツールを融合");
  const fuser = new ToolFuser({
    maxParallelism: 3,
    minTokenSavingsThreshold: 50,
    enableDependencyAnalysis: true,
  });

  const compilation = fuser.compile(agentCalls);
  console.log(`コンパイル成功: ${compilation.success}`);
  console.log(`compilationId: ${compilation.compilationId}`);
  console.log(`元のツール数: ${compilation.originalToolCount}`);
  console.log(`融合後の操作数: ${compilation.fusedOperationCount}`);
  console.log(`トークン節約: ${compilation.totalTokenSavings}`);
  console.log();

  // ステップ3: 融合操作の実行
  console.log("ステップ3: execute_compiledで融合操作を実行");
  const mockToolExecutor: ToolExecutorFn = async (toolName: string, args: Record<string, unknown>) => {
    // 実際のツール実行をシミュレート
    await new Promise(resolve => setTimeout(resolve, 5));
    return {
      toolName,
      args,
      result: `Success: ${toolName}`,
      timestamp: Date.now(),
    };
  };

  const executor = new ToolExecutor({
    maxParallelism: 3,
    debugMode: false,
  });

  const startTime = Date.now();
  const execution = await executor.execute(compilation, mockToolExecutor);
  const executionTime = Date.now() - startTime;

  console.log(`実行成功: ${execution.success}`);
  console.log(`executionId: ${execution.executionId}`);
  console.log(`実行時間: ${execution.totalExecutionTimeMs}ms (実際: ${executionTime}ms)`);
  console.log(`ツール結果数: ${execution.allToolResults.size}`);
  console.log(`節約トークン: ${execution.savedTokens}`);
  console.log(`節約時間: ${execution.savedTimeMs}ms`);
  console.log();

  // ステップ4: 結果の表示
  console.log("ステップ4: 実行結果の表示");
  for (const [toolId, result] of execution.allToolResults.entries()) {
    console.log(`[${toolId}]`);
    console.log(`  ツール名: ${result.toolName}`);
    console.log(`  成功: ${result.success}`);
    console.log(`  実行時間: ${result.executionTimeMs}ms`);
  }
  console.log();

  // 効果のまとめ
  console.log("=== 効果のまとめ ===");
  console.log(`元のツール呼び出し数: ${compilation.originalToolCount}`);
  console.log(`融合後の操作数: ${compilation.fusedOperationCount}`);
  console.log(`削減率: ${((1 - compilation.fusedOperationCount / compilation.originalToolCount) * 100).toFixed(1)}%`);
  console.log(`トークン節約: ${compilation.totalTokenSavings}トークン`);
  console.log(`実行時間: ${executionTime}ms`);
  console.log();

  console.log("=== 比較: 融合なし vs 融合あり ===");
  // 融合なしの場合（すべて順次実行）
  const sequentialTime = agentCalls.length * 5; // 各ツール5ms
  console.log(`融合なし（順次）: 約${sequentialTime}ms`);
  console.log(`融合あり（並列）: ${executionTime}ms`);
  console.log(`時間節約: ${sequentialTime - executionTime}ms (${((sequentialTime - executionTime) / sequentialTime * 100).toFixed(1)}%)`);

  console.log("\n=== シミュレーション完了 ===");
}

main().catch(console.error);

