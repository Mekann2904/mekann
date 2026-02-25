// tool-compiler拡張機能の動作確認スクリプト

import { ToolFuser } from "./.pi/lib/tool-fuser.ts";
import { ToolExecutor } from "./.pi/lib/tool-executor.ts";
import type { ToolCall, ToolExecutorFn } from "./.pi/lib/tool-compiler-types.ts";

// テスト用ツール呼び出しの作成
const createToolCall = (id: string, name: string, args: Record<string, unknown>, estimatedTokens = 100): ToolCall => ({
  id,
  name,
  arguments: args,
  estimatedTokens,
});

async function main() {
  // テスト1: 複数の読み込み操作を融合
  console.log("=== テスト1: 複数の読み込み操作を融合 ===");
  const tools1: ToolCall[] = [
    createToolCall("1", "read", { path: "file1.txt" }),
    createToolCall("2", "read", { path: "file2.txt" }),
    createToolCall("3", "read", { path: "file3.txt" }),
  ];

  const fuser1 = new ToolFuser({
    maxParallelism: 3,
    enableDependencyAnalysis: true,
  });
  const result1 = fuser1.compile(tools1);

  console.log(`元のツール数: ${result1.originalToolCount}`);
  console.log(`融合後の操作数: ${result1.fusedOperationCount}`);
  console.log(`トークン節約: ${result1.totalTokenSavings}`);
  console.log(`並列実行可能数: ${result1.parallelizableCount}`);
  console.log(`コンパイル時間: ${result1.metrics.compilationTimeMs}ms`);
  console.log(`成功: ${result1.success}`);
  console.log(`compilationId: ${result1.compilationId}`);
  console.log(`融合操作詳細:`);
  result1.fusedOperations.forEach((op, i) => {
    console.log(`  [${i}] ID: ${op.fusedId}, 並列: ${op.canExecuteInParallel}, 戦略: ${op.executionStrategy}, 評価節約: ${op.estimatedTokenSavings}`);
  });

  // テスト2: 依存関係のあるツールセット
  console.log("\n=== テスト2: 依存関係のあるツールセット ===");
  const tools2: ToolCall[] = [
    createToolCall("1", "write", { path: "output.txt" }),
    createToolCall("2", "read", { path: "output.txt" }),
  ];

  const fuser2 = new ToolFuser({
    enableDependencyAnalysis: true,
    debugMode: true,
  });
  const result2 = fuser2.compile(tools2);

  console.log(`元のツール数: ${result2.originalToolCount}`);
  console.log(`依存解析時間: ${result2.metrics.dependencyAnalysisTimeMs}ms`);
  console.log(`循環依存: ${result2.metrics.hasCircularDependencies}`);
  console.log(`最大依存深度: ${result2.metrics.maxDependencyDepth}`);
  console.log(`平均依存数: ${result2.metrics.averageDependencies}`);

  // テスト3: ダミー実行関数で実行テスト
  console.log("\n=== テスト3: 融合操作の実行テスト ===");
  const dummyExecutor: ToolExecutorFn = async (toolName, args) => {
    await new Promise(resolve => setTimeout(resolve, 10));
    return { toolName, args, status: "success", timestamp: Date.now() };
  };

  const fuser3 = new ToolFuser({});
  const compilation3 = fuser3.compile([
    createToolCall("1", "read", { path: "file1.txt" }),
    createToolCall("2", "read", { path: "file2.txt" }),
  ]);

  const executor = new ToolExecutor({ maxParallelism: 2 });
  const startTime = Date.now();
  const executionResult = await executor.execute(compilation3, dummyExecutor);
  const duration = Date.now() - startTime;

  console.log(`実行ID: ${executionResult.executionId}`);
  console.log(`成功: ${executionResult.success}`);
  console.log(`実行時間: ${executionResult.totalExecutionTimeMs}ms`);
  console.log(`実際の時間: ${duration}ms`);
  console.log(`ツール結果数: ${executionResult.allToolResults.size}`);
  console.log(`節約トークン: ${executionResult.savedTokens}`);

  // テスト4: 大量のツールセット
  console.log("\n=== テスト4: 大量のツールセット (50件) ===");
  const tools4: ToolCall[] = [];
  for (let i = 0; i < 50; i++) {
    tools4.push(createToolCall(`${i}`, "read", { path: `file${i}.txt` }));
  }

  const fuser4 = new ToolFuser({});
  const result4 = fuser4.compile(tools4);

  console.log(`元のツール数: ${result4.originalToolCount}`);
  console.log(`融合後の操作数: ${result4.fusedOperationCount}`);
  console.log(`トークン節約: ${result4.totalTokenSavings}`);
  console.log(`融合操作数: ${result4.fusedOperations.length}`);
  console.log(`並列実行可能数: ${result4.parallelizableCount}`);

  // テスト5: 並列 vs 順次の速度比較
  console.log("\n=== テスト5: 並列 vs 順次の速度比較 ===");

  const slowExecutor: ToolExecutorFn = async (toolName) => {
    await new Promise(resolve => setTimeout(resolve, 50));
    return { toolName, status: "success" };
  };

  const testTools: ToolCall[] = [];
  for (let i = 0; i < 5; i++) {
    testTools.push(createToolCall(`${i}`, "read", { path: `file${i}.txt` }));
  }

  // 並列実行
  const fuserParallel = new ToolFuser({});
  const compilationParallel = fuserParallel.compile(testTools);
  const executorParallel = new ToolExecutor({ maxParallelism: 5 });
  const parallelStart = Date.now();
  await executorParallel.execute(compilationParallel, slowExecutor);
  const parallelTime = Date.now() - parallelStart;

  // 順次実行
  const fuserSequential = new ToolFuser({});
  const compilationSequential = fuserSequential.compile(testTools);
  const executorSequential = new ToolExecutor({ maxParallelism: 1 });
  const sequentialStart = Date.now();
  await executorSequential.execute(compilationSequential, slowExecutor);
  const sequentialTime = Date.now() - sequentialStart;

  console.log(`並列実行時間: ${parallelTime}ms`);
  console.log(`順次実行時間: ${sequentialTime}ms`);
  console.log(`時間節約: ${sequentialTime - parallelTime}ms (${Math.round((sequentialTime - parallelTime) / sequentialTime * 100)}%)`);

  console.log("\n=== すべてのテスト完了 ===");
}

main().catch(console.error);

