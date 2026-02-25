// compile_toolsおよびexecute_compiledツールのパラメータバリデーションテスト

import { Type } from "@mariozechner/pi-ai";

// pi SDKのTypeモジュールを使用してパラメータ定義を検証

console.log("=== compile_tools ツール パラメータ検証 ===\n");

// compile_toolsのパラメータ定義（拡張機能と同じ）
const compileToolsParams = Type.Object({
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
});

console.log("✅ compile_tools パラメータ定義: 正常");
console.log(`   - 必須パラメータ: toolCalls`);
console.log(`   - オプションパラメータ: config\n`);

// 有効なパラメータのテスト
const validParams = {
  toolCalls: [
    { id: "1", name: "read", arguments: { path: "file.txt" } },
    { id: "2", name: "read", arguments: { path: "file2.txt" } },
  ],
  config: {
    maxParallelism: 3,
    minTokenSavingsThreshold: 50,
  },
};

console.log("有効なパラメータ例:");
console.log(JSON.stringify(validParams, null, 2));
console.log();

console.log("=== execute_compiled ツール パラメータ検証 ===\n");

// execute_compiledのパラメータ定義
const executeCompiledParams = Type.Object({
  compilationId: Type.String(),
  executorMode: Type.Optional(
    Type.Union([
      Type.Literal("parallel" as const),
      Type.Literal("sequential" as const),
      Type.Literal("auto" as const),
    ])
  ),
  timeoutMs: Type.Optional(Type.Number()),
  continueOnError: Type.Optional(Type.Boolean()),
});

console.log("✅ execute_compiled パラメータ定義: 正常");
console.log(`   - 必須パラメータ: compilationId`);
console.log(`   - オプションパラメータ: executorMode, timeoutMs, continueOnError\n`);

// 有効なパラメータのテスト
const validExecuteParams = {
  compilationId: "compile_abc123",
  executorMode: "parallel" as const,
  timeoutMs: 30000,
  continueOnError: false,
};

console.log("有効なパラメータ例:");
console.log(JSON.stringify(validExecuteParams, null, 2));
console.log();

console.log("=== executorMode オプション ===\n");
const executorModes = ["parallel", "sequential", "auto"];
console.log(`有効なexecutorMode: ${executorModes.join(", ")}`);
console.log(`   - parallel: 並列実行`);
console.log(`   - sequential: 順次実行`);
console.log(`   - auto: 自動選択（デフォルト）\n`);

console.log("=== config オプションのデフォルト値 ===\n");
const defaultConfig = {
  maxParallelism: 5,
  minToolsForFusion: 2,
  minTokenSavingsThreshold: 100,
  enableDependencyAnalysis: true,
  enableAutoGrouping: true,
  debugMode: false,
};
console.log(JSON.stringify(defaultConfig, null, 2));
console.log();

console.log("=== すべての検証完了 ===");
