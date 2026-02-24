---
title: Tool Compiler
category: development
audience: developer
last_updated: 2026-02-25
tags: [tool-compiler, optimization, fusion]
related: [../02-user-guide/01-extensions.md]
---

# Tool Compiler

> パンくず: [Home](../README.md) > [Development](./) > Tool Compiler

## 概要

Tool Compilerは、LLMCompiler論文のツールコンパイル手法をpiエージェントシステムに統合する開発者向け拡張機能です。複数のツール呼び出しを分析し、依存関係に基づいて融合・最適化することで、トークンコストの削減と実行レイテンシの改善を実現します。

## 主な機能

- **ツール融合**: 複数の独立したツール呼び出しを融合して並列実行
- **依存関係解析**: ツール間の依存関係を自動的に検出
- **実行最適化**: 最適な実行順序と並列度を計算
- **トークン節約**: LLMへのプロンプトサイズを削減
- **キャッシング**: コンパイル結果をキャッシュして再利用

## アーキテクチャ

Tool Compilerは以下のコンポーネントで構成されます:

```
┌─────────────────────────────────────────────────────────┐
│                   Tool Compiler                          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐ │
│  │   Tool      │    │    Tool     │    │    Tool     │ │
│  │  Definition │    │  Definition │    │  Definition │ │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘ │
│         │                  │                  │        │
│         └──────────────────┼──────────────────┘        │
│                            │                           │
│                            ▼                           │
│                  ┌─────────────────┐                  │
│                  │   Tool Fuser    │                  │
│                  │  (依存関係解析)  │                  │
│                  └────────┬────────┘                  │
│                           │                           │
│                           ▼                           │
│                  ┌─────────────────┐                  │
│                  │  Fusion Result  │                  │
│                  │  (最適化計画)    │                  │
│                  └────────┬────────┘                  │
│                           │                           │
│                           ▼                           │
│                  ┌─────────────────┐                  │
│                  │ Tool Executor  │                  │
│                  │  (並列実行)     │                  │
│                  └─────────────────┘                  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## コア概念

### ツール融合 (Tool Fusion)

複数のツール呼び出しを1つの融合された操作に結合:

```typescript
// 融合前: 3つの独立したツール呼び出し
const result1 = await read({ path: "file1.ts" });
const result2 = await read({ path: "file2.ts" });
const result3 = await read({ path: "file3.ts" });

// 融合後: 1つの並列実行操作
const fused = await execute_compiled({
  compilationId: "fusion-abc123",
  executorMode: "parallel"
});
```

### 依存関係解析

ツール間の依存関係を検出し、実行順序を決定:

```
┌─────┐     ┌─────┐
│ T1  │────▶│ T3  │  (T3はT1に依存)
└─────┘     └─────┘
 │           ^
 └─────┬─────┘
       │
     ┌─────┐
     │ T2  │
     └─────┘     (T2は独立)
```

**実行順序**:
- Phase 1: T1, T2（並列実行）
- Phase 2: T3（T1の完了後に実行）

### 実行戦略

ツール呼び出しの特性に応じた最適な実行戦略を選択:

| 戦略 | 説明 | 適用条件 |
|------|------|----------|
| `parallel` | 並列実行 | 依存関係がないツール |
| `sequential` | 順次実行 | 明確な依存関係がある場合 |
| `auto` | 自動選択 | 依存関係に基づいて自動決定 |

## API

### compile_tools

ツール呼び出しセットを分析・最適化:

```typescript
await compile_tools({
  toolCalls: [
    {
      id: "read-1",
      name: "read",
      arguments: { path: "src/file1.ts" },
      estimatedTokens: 500
    },
    {
      id: "read-2",
      name: "read",
      arguments: { path: "src/file2.ts" },
      estimatedTokens: 500
    }
  ],
  config: {
    maxParallelism: 5,
    minToolsForFusion: 2,
    minTokenSavingsThreshold: 100,
    enableDependencyAnalysis: true,
    enableAutoGrouping: true,
    debugMode: false
  }
});
```

**パラメータ**:

| パラメータ | 型 | 必須 | 説明 |
|-----------|---|------|------|
| `toolCalls` | array | はい | ツール呼び出し定義の配列 |
| `toolCalls[].id` | string | いいえ | ツール呼び出しID（自動生成可） |
| `toolCalls[].name` | string | はい | ツール名 |
| `toolCalls[].arguments` | object | はい | ツール引数 |
| `toolCalls[].estimatedTokens` | number | いいえ | 推定トークン数 |
| `config.maxParallelism` | number | いいえ | 最大並列数（デフォルト: 10） |
| `config.minToolsForFusion` | number | いいえ | 融合の最小ツール数（デフォルト: 2） |
| `config.minTokenSavingsThreshold` | number | いいえ | 最小トークン節約閾値（デフォルト: 100） |
| `config.enableDependencyAnalysis` | boolean | いいえ | 依存関係解析を有効化 |
| `config.enableAutoGrouping` | boolean | いいえ | 自動グループ化を有効化 |
| `config.debugMode` | boolean | いいえ | デバッグモード |

**戻り値**:

```typescript
{
  success: true,
  compilationId: "comp-20250225-001",
  fusedOperations: [
    {
      fusedId: "fused-read-1-2",
      toolNames: ["read", "read"],
      canExecuteInParallel: true,
      executionStrategy: "parallel",
      estimatedTokenSavings: 250,
      priority: 1.0
    }
  ],
  toolGroups: [
    {
      groupId: "group-1",
      toolIds: ["read-1", "read-2"],
      executionStrategy: "parallel"
    }
  ],
  metrics: {
    originalToolCount: 2,
    fusedOperationCount: 1,
    totalTokenSavings: 250,
    parallelizableCount: 2,
    compilationTimeMs: 5.2,
    dependencyAnalysisTimeMs: 2.1,
    groupingTimeMs: 1.5,
    fusionTimeMs: 1.6
  },
  warnings: []
}
```

### execute_compiled

コンパイルされた融合操作を実行:

```typescript
await execute_compiled({
  compilationId: "comp-20250225-001",
  executorMode: "auto",
  timeoutMs: 30000,
  continueOnError: false
});
```

**パラメータ**:

| パラメータ | 型 | 必須 | 説明 |
|-----------|---|------|------|
| `compilationId` | string | はい | コンパイルID |
| `executorMode` | string | いいえ | 実行モード: `parallel`, `sequential`, `auto`（デフォルト: `auto`） |
| `timeoutMs` | number | いいえ | タイムアウト（ミリ秒） |
| `continueOnError` | boolean | いいえ | エラー時も続行するか |

**戻り値**:

```typescript
{
  success: true,
  executionId: "exec-20250225-001",
  compilationId: "comp-20250225-001",
  totalDurationMs: 1234,
  toolResults: {
    "read-1": { /* ツール実行結果 */ },
    "read-2": { /* ツール実行結果 */ }
  },
  savedTokens: 250,
  savedTimeMs: 456,
  errorSummary: null
}
```

### 統合フック

#### integrateWithSubagents

subagent_run/parallelへの統合フック:

```typescript
import { integrateWithSubagents } from ".pi/extensions/tool-compiler.ts";

const { compiled, shouldUseFusion } = integrateWithSubagents(
  [
    { id: "t1", name: "read", arguments: { path: "file1.ts" } },
    { id: "t2", name: "read", arguments: { path: "file2.ts" } }
  ],
  {
    maxParallelism: 5,
    minTokenSavingsThreshold: 100
  }
);

if (shouldUseFusion) {
  // 融合結果を使用
  await execute_compiled({ compilationId: compiled.compilationId });
} else {
  // 通常の実行
  // ...
}
```

#### integrateWithTeamExecution

agent_team_runへの統合フック:

```typescript
import { integrateWithTeamExecution } from ".pi/extensions/tool-compiler.ts";

const memberTools = new Map([
  ["agent-1", [
    { id: "t1", name: "read", arguments: { path: "file1.ts" } },
    { id: "t2", name: "search", arguments: { query: "test" } }
  ]],
  ["agent-2", [
    { id: "t3", name: "read", arguments: { path: "file2.ts" } }
  ]]
]);

const compilationResults = integrateWithTeamExecution(
  memberTools,
  { maxParallelism: 3 }
);

// 各エージェントのコンパイル結果を使用
for (const [agentId, result] of compilationResults.entries()) {
  console.log(`${agentId}: ${result.totalTokenSavings} tokens saved`);
}
```

#### optimizeToolDefinitions

ツール定義の最適化:

```typescript
import { optimizeToolDefinitions } from ".pi/extensions/tool-compiler.ts";

const toolDefinitions = [
  { name: "read", description: "Read a file", parameters: { /* ... */ } },
  { name: "search", description: "Search code", parameters: { /* ... */ } }
];

const { optimizedTools, fusionMapping, estimatedSavings } = optimizeToolDefinitions(
  toolDefinitions,
  { minToolsForFusion: 2 }
);

console.log("Optimized tools:", optimizedTools);
console.log("Estimated token reduction:", estimatedSavings.tokenReduction);
console.log("Parallelism gain:", estimatedSavings.parallelismGain);
```

## 使用事例

### 事例1: 複数ファイルの並列読み込み

```typescript
// コンパイル
const compileResult = await compile_tools({
  toolCalls: [
    { name: "read", arguments: { path: "src/utils.ts" } },
    { name: "read", arguments: { path: "src/api.ts" } },
    { name: "read", arguments: { path: "src/types.ts" } },
    { name: "read", arguments: { path: "src/config.ts" } }
  ],
  config: {
    maxParallelism: 4,
    minTokenSavingsThreshold: 100
  }
});

// 実行
const execResult = await execute_compiled({
  compilationId: compileResult.compilationId,
  executorMode: "parallel"
});

console.log(`Saved ${execResult.savedTokens} tokens`);
console.log(`Saved ${execResult.savedTimeMs}ms`);
```

### 事例2: 依存関係を含むツールセット

```typescript
// ファイルを読んでから検索（依存関係あり）
const compileResult = await compile_tools({
  toolCalls: [
    {
      id: "read-config",
      name: "read",
      arguments: { path: "config.json" }
    },
    {
      id: "search-code",
      name: "search",
      arguments: { query: "import React" }
      // read-config の結果に依存（configからパスを取得する場合）
    }
  ],
  config: {
    enableDependencyAnalysis: true
  }
});

// 依存関係に基づいて最適な順序で実行
const execResult = await execute_compiled({
  compilationId: compileResult.compilationId,
  executorMode: "auto"
});
```

### 事例3: Subagentとの統合

```typescript
import { integrateWithSubagents } from ".pi/extensions/tool-compiler.ts";

// Subagent実行前にツールを最適化
const tools = [
  { name: "file_candidates", arguments: { query: "auth" } },
  { name: "code_search", arguments: { query: "token validation" } }
];

const { compiled, shouldUseFusion } = integrateWithSubagents(tools);

if (shouldUseFusion) {
  // 融合されたツールセットをSubagentに提供
  await subagent_run({
    subagentId: "researcher",
    task: "Analyze authentication code",
    compiledTools: compiled
  });
}
```

### 事例4: Agent Teamとの統合

```typescript
import { integrateWithTeamExecution } from ".pi/extensions/tool-compiler.ts";

// チームメンバーごとにツールセットを最適化
const memberTools = new Map([
  ["researcher", [
    { name: "read", arguments: { path: "README.md" } },
    { name: "read", arguments: { path: "docs/spec.md" } }
  ]],
  ["implementer", [
    { name: "read", arguments: { path: "src/main.ts" } },
    { name: "edit", arguments: { /* ... */ } }
  ]],
  ["tester", [
    { name: "read", arguments: { path: "test/main.test.ts" } }
  ]]
]);

const results = integrateWithTeamExecution(memberTools);

// 各メンバーの最適化されたツールセットでチーム実行
await agent_team_run({
  teamId: "core-delivery-team",
  task: "Implement feature",
  compiledToolSets: results
});
```

## パフォーマンス分析

### トークン節約

Tool Compilerは主に以下の方法でトークンを節約します:

1. **ツール定義の融合**: 複数のツール定義を1つの融合定義に統合
2. **依存関係情報の圧縮**: グラフ形式で依存関係を表現
3. **引数の最適化**: 重複する引数を共有

**節約量の例**:

| ツール数 | 融合前 | 融合後 | 節約 |
|---------|--------|--------|------|
| 3 | 1500 tokens | 1000 tokens | 33% |
| 5 | 2500 tokens | 1200 tokens | 52% |
| 10 | 5000 tokens | 1800 tokens | 64% |

### レイテンシ削減

並列実行によるレイテンシ削減:

```
┌──────────────────────────────────────────────────┐
│ 順次実行                                           │
│                                                   │
│ Tool 1 ████████████ 100ms                         │
│ Tool 2         ████████████ 100ms                 │
│ Tool 3                 ████████████ 100ms          │
│                                                   │
│ Total: 300ms                                      │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│ 並列実行                                           │
│                                                   │
│ Tool 1 ████████████ 100ms                         │
│ Tool 2 ████████████ 100ms                         │
│ Tool 3 ████████████ 100ms                         │
│                                                   │
│ Total: 100ms (66% reduction)                     │
└──────────────────────────────────────────────────┘
```

### コンパイルオーバーヘッド

ツール融合の計算コストは通常最小です:

| ツール数 | コンパイル時間 |
|---------|---------------|
| 2-5 | 1-5ms |
| 5-10 | 5-15ms |
| 10-20 | 15-50ms |

**結論**: 2つ以上のツールがある場合、トークン節約とレイテンシ削減のメリットがコンパイルコストを上回ります。

## キャッシング

Tool Compilerはコンパイル結果を30分間キャッシュします:

```typescript
// 同じツールセットで2回目はキャッシュを使用
await compile_tools({ toolCalls: [...] });
// 1回目: コンパイル実行 (5ms)

await compile_tools({ toolCalls: [...] });
// 2回目: キャッシュから取得 (<1ms)
```

**キャッシュの動作**:
- キャッシュTTL: 30分
- 自動クリーンアップ: 期限切れエントリは自動的に削除
- キャッシュキー: ツール呼び出しのハッシュ

## デバッグ

### デバッグモード

`debugMode: true` で詳細なデバッグ情報を表示:

```typescript
await compile_tools({
  toolCalls: [...],
  config: {
    debugMode: true
  }
});

// 出力:
// [DEBUG] Analyzing tool dependencies...
// [DEBUG] Found 2 parallelizable groups
// [DEBUG] Estimated token savings: 250
// [DEBUG] Group 1: [read-1, read-2] -> parallel
// [DEBUG] Group 2: [search-1] -> sequential
```

### メトリクスの解釈

```typescript
{
  metrics: {
    compilationTimeMs: 5.2,           // 総コンパイル時間
    dependencyAnalysisTimeMs: 2.1,    // 依存関係解析時間
    groupingTimeMs: 1.5,              // グループ化時間
    fusionTimeMs: 1.6,                // 融合処理時間
    averageDependencies: 1.2,         // 平均依存関係数
    maxDependencyDepth: 2,            // 最大依存関係深さ
    hasCircularDependencies: false    // 循環依存の有無
  }
}
```

### 警告の対処

```typescript
{
  warnings: [
    "Tool 'write' has side effects, fusion may be unsafe",
    "Circular dependency detected between T1 and T2"
  ]
}
```

**警告への対処**:
- 副作用のあるツールの融合を回避
- 循環依存を解消（ツール呼び出し順序の変更）

## 設定ガイドライン

### maxParallelism

- **小規模（ツール数 < 5）**: 2-3
- **中規模（ツール数 5-10）**: 4-6
- **大規模（ツール数 > 10）**: 8-10

```typescript
// 少数のツール
await compile_tools({
  toolCalls: [...], // 3ツール
  config: { maxParallelism: 2 }
});

// 多数のツール
await compile_tools({
  toolCalls: [...], // 15ツール
  config: { maxParallelism: 8 }
});
```

### minTokenSavingsThreshold

- **厳格（トークン節約を優先）**: 200-500
- **バランス（デフォルト）**: 100
- **緩和（並列化を優先）**: 50-100

```typescript
await compile_tools({
  toolCalls: [...],
  config: {
    minTokenSavingsThreshold: 200  // トークン節約を優先
  }
});
```

### enableDependencyAnalysis

- **有効（推奨）**: 依存関係に基づいて最適化
- **無効**: 単純な並列化（より高速だが精度が低い）

```typescript
await compile_tools({
  toolCalls: [...],
  config: {
    enableDependencyAnalysis: true  // 推奨
  }
});
```

## 環境変数

Tool Compilerは以下の環境変数で制御できます:

```bash
# Tool Compilerを有効化
PI_TOOL_COMPILER_ENABLED=true

# 最大並列数
PI_TOOL_COMPILER_MAX_PARALLELISM=10

# 最小ツール融合数
PI_TOOL_COMPILER_MIN_TOOLS_FOR_FUSION=2

# 最小トークン節約閾値
PI_TOOL_COMPILER_MIN_TOKEN_SAVINGS=100
```

## トラブルシューティング

### 期待通りに融合されない

**原因**: トークン節約が閾値を満たしていない可能性があります。

**解決策**:
- `minTokenSavingsThreshold` を下げる
- `debugMode: true` で詳細を確認

```typescript
await compile_tools({
  toolCalls: [...],
  config: {
    debugMode: true,
    minTokenSavingsThreshold: 50
  }
});
```

### 並列実行が期待通り動作しない

**原因**: 依存関係が正しく検出されていない可能性があります。

**解決策**:
- `enableDependencyAnalysis: true` を設定
- 手動でツールの順序を調整

```typescript
await compile_tools({
  toolCalls: [
    { id: "t1", name: "read", arguments: { path: "file1.ts" } },
    { id: "t2", name: "read", arguments: { path: "file2.ts" } }
  ],
  config: {
    enableDependencyAnalysis: true,
    debugMode: true
  }
});
```

### キャッシュが古い

**原因**: キャッシュの有効期限（30分）が切れていないが、コードが変更された場合。

**解決策**:
- 新しいツール呼び出しIDを使用
- キャッシュTTLが切れるのを待つ

## ベストプラクティス

### 1. 3つ以上のツールで融合を使用

```typescript
// ✅ 融合のメリットがある
await compile_tools({
  toolCalls: [
    { name: "read", arguments: { path: "file1.ts" } },
    { name: "read", arguments: { path: "file2.ts" } },
    { name: "read", arguments: { path: "file3.ts" } }
  ]
});

// ❌ 融合のメリットが小さい
await compile_tools({
  toolCalls: [
    { name: "read", arguments: { path: "file1.ts" } }
  ]
});
```

### 2. 副作用のあるツールを扱う際は注意

```typescript
// 副作用のあるツール（write, deleteなど）
await compile_tools({
  toolCalls: [
    { name: "read", arguments: { path: "file1.ts" } },
    { name: "write", arguments: { path: "file2.ts", content: "..." } }
  ],
  config: {
    // 副作用のあるツールを分離
    minToolsForFusion: 3  // writeは融合しない
  }
});
```

### 3. デバッグモードで検証

```typescript
// まずデバッグモードで検証
const result = await compile_tools({
  toolCalls: [...],
  config: { debugMode: true }
});

// 結果を確認してから本番実行
if (result.totalTokenSavings > 100) {
  await execute_compiled({ compilationId: result.compilationId });
}
```

### 4. 統合フックを活用

```typescript
// Subagentとの統合
import { integrateWithSubagents } from ".pi/extensions/tool-compiler.ts";

const { compiled, shouldUseFusion } = integrateWithSubagents(tools);

if (shouldUseFusion) {
  // 融合バージョンを使用
  await subagent_run({
    subagentId: "researcher",
    task: task,
    compiledTools: compiled
  });
} else {
  // 通常バージョンを使用
  await subagent_run({ subagentId: "researcher", task });
}
```

## 制限事項

- **トールの種類**: すべてのツールが融合可能というわけではありません
- **副作用**: 副作用のあるツールの融合は制限されます
- **依存関係**: 循環依存がある場合は自動解決できません
- **キャッシュ**: キャッシュはメモリ内のみで、プロセス再起動で消去されます

## 関連トピック

- [拡張機能開発](../03-development/) - 独自の拡張機能の作成方法
- [LLMCompiler論文](https://arxiv.org/abs/2312.04511) - Tool Compilerの理論的背景
- [Subagents](../02-user-guide/08-subagents.md) - Subagent実行との統合

## 次のトピック

[ → 開発ガイド目次](./)
