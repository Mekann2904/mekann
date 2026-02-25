// tool-compiler拡張機能の動作確認スクリプト

import { ToolFuser } from "./.pi/lib/tool-fuser.js";
import { ToolExecutor } from "./.pi/lib/tool-executor.js";

// テスト用ツール呼び出しの作成
const createToolCall = (id, name, args, estimatedTokens = 100) => ({
  id,
  name,
  arguments: args,
  estimatedTokens,
});

// テスト1: 複数の読み込み操作を融合
console.log("=== テスト1: 複数の読み込み操作を融合 ===");
const tools1 = [
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
console.log(`compilationId: ${result1.compilationId}\n`);

// テスト2: 依存関係のあるツールセット
console.log("=== テスト2: 依存関係のあるツールセット ===");
const tools2 = [
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
console.log(`最大依存深度: ${result2.metrics.maxDependencyDepth}\n`);

// テスト3: ダミー実行関数で実行テスト
console.log("=== テスト3: 融合操作の実行テスト ===");
const dummyExecutor = async (toolName, args) => {
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
console.log(`ツール結果数: ${executionResult.allToolResults.size}\n`);

// テスト4: 大量のツールセット
console.log("=== テスト4: 大量のツールセット (50件) ===");
const tools4 = [];
for (let i = 0; i < 50; i++) {
  tools4.push(createToolCall(`${i}`, "read", { path: `file${i}.txt` }));
}

const fuser4 = new ToolFuser({});
const result4 = fuser4.compile(tools4);

console.log(`元のツール数: ${result4.originalToolCount}`);
console.log(`融合後の操作数: ${result4.fusedOperationCount}`);
console.log(`トークン節約: ${result4.totalTokenSavings}`);
console.log(`融合操作数: ${result4.fusedOperations.length}`);

console.log("\n=== すべてのテスト完了 ===");
