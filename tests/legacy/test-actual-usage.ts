// 実際にtool-compilerを使ってツールを融合・実行するテスト

import { integrateWithSubagents, integrateWithTeamExecution, optimizeToolDefinitions } from "./.pi/extensions/tool-compiler.js";

console.log("=== 実際の使用シナリオテスト ===\n");

// シナリオ1: subagentでのツール融合
console.log("シナリオ1: subagentで複数のファイルを読み込む");
const subagentTools = [
  {
    id: "1",
    name: "read",
    arguments: { path: "src/components/Header.tsx" },
    estimatedTokens: 150
  },
  {
    id: "2",
    name: "read",
    arguments: { path: "src/components/Footer.tsx" },
    estimatedTokens: 120
  },
  {
    id: "3",
    name: "read",
    arguments: { path: "src/utils/helpers.ts" },
    estimatedTokens: 100
  }
];

const { compiled, shouldUseFusion } = integrateWithSubagents(subagentTools, {
  minTokenSavingsThreshold: 50
});

console.log(`元のツール数: ${compiled.originalToolCount}`);
console.log(`融合後の操作数: ${compiled.fusedOperationCount}`);
console.log(`融合を使用: ${shouldUseFusion}`);
console.log(`トークン節約: ${compiled.totalTokenSavings}`);
console.log(`コンパイルID: ${compiled.compilationId}`);
console.log(`並列実行可能: ${compiled.parallelizableCount > 0 ? "はい" : "いいえ"}\n`);

// シナリオ2: チーム実行でのツール融合
console.log("シナリオ2: エージェントチームでのツール融合");
const memberTools = new Map([
  ["researcher", [
    { id: "r1", name: "read", arguments: { path: "README.md" } },
    { id: "r2", name: "search", arguments: { query: "API" } }
  ]],
  ["implementer", [
    { id: "i1", name: "read", arguments: { path: "src/index.ts" } },
    { id: "i2", name: "write", arguments: { path: "dist/output.js" } }
  ]]
]);

const teamResults = integrateWithTeamExecution(memberTools, {
  maxParallelism: 2
});

console.log(`メンバー数: ${teamResults.size}`);
for (const [memberId, compiled] of teamResults.entries()) {
  console.log(`  [${memberId}]`);
  console.log(`    ツール数: ${compiled.originalToolCount} -> ${compiled.fusedOperationCount}`);
  console.log(`    トークン節約: ${compiled.totalTokenSavings}`);
}
console.log();

// シナリオ3: ツール定義の最適化
console.log("シナリオ3: LLMに提示するツール定義の最適化");
const toolDefinitions = [
  { name: "read", description: "Read file content", parameters: { type: "object" } },
  { name: "write", description: "Write file content", parameters: { type: "object" } },
  { name: "search", description: "Search in files", parameters: { type: "object" } },
  { name: "execute", description: "Execute command", parameters: { type: "object" } }
];

const { optimizedTools, estimatedSavings } = optimizeToolDefinitions(toolDefinitions, {
  minTokenSavingsThreshold: 20
});

console.log(`元のツール定義数: ${toolDefinitions.length}`);
console.log(`最適化後のツール数: ${optimizedTools.length}`);
console.log(`推定トークン節約: ${estimatedSavings.tokenReduction}`);
console.log(`並列実行ゲイン: ${estimatedSavings.parallelismGain}`);
console.log("\n最適化されたツール:");
optimizedTools.forEach((tool, i) => {
  console.log(`  [${i + 1}] ${tool.name}`);
  console.log(`      ${tool.description.substring(0, 60)}...`);
});
console.log();

// シナリオ4: 大規模なコード解析
console.log("シナリオ4: 大規模なコード解析（100ファイル）");
const largeTools = [];
for (let i = 0; i < 100; i++) {
  largeTools.push({
    id: `${i}`,
    name: "read",
    arguments: { path: `src/module${i}/index.ts` },
    estimatedTokens: 100
  });
}

const largeResult = integrateWithSubagents(largeTools, {
  maxParallelism: 10,
  minTokenSavingsThreshold: 50
});

console.log(`元のツール数: ${largeResult.compiled.originalToolCount}`);
console.log(`融合後の操作数: ${largeResult.compiled.fusedOperationCount}`);
console.log(`トークン節約: ${largeResult.compiled.totalTokenSavings}`);
console.log(`コンパイル時間: ${largeResult.compiled.metrics.compilationTimeMs}ms`);
console.log(`融合を使用: ${largeResult.shouldUseFusion}`);
console.log();

// シナリオ5: 依存関係のあるツールセット
console.log("シナリオ5: 依存関係のあるツールセット（ビルドプロセス）");
const buildTools = [
  { id: "1", name: "install", arguments: { packages: ["typescript"] } },
  { id: "2", name: "build", arguments: { target: "dist" } },
  { id: "3", name: "test", arguments: { coverage: true } },
  { id: "4", name: "deploy", arguments: { environment: "production" } }
];

const buildResult = integrateWithSubagents(buildTools, {
  enableDependencyAnalysis: true,
  enableAutoGrouping: true
});

console.log(`元のツール数: ${buildResult.compiled.originalToolCount}`);
console.log(`融合後の操作数: ${buildResult.compiled.fusedOperationCount}`);
console.log(`循環依存: ${buildResult.compiled.metrics.hasCircularDependencies ? "あり" : "なし"}`);
console.log(`最大依存深度: ${buildResult.compiled.metrics.maxDependencyDepth}`);
console.log(`並列実行可能数: ${buildResult.compiled.parallelizableCount}`);

console.log("\n=== すべてのシナリオテスト完了 ===");
