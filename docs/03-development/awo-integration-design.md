---
title: AWO統合設計書
category: development
audience: developer
last_updated: 2026-03-01
tags: [awo, optimization, meta-tools, agent-workflow]
related:
  - .pi/lib/agent-memory.ts
  - .pi/extensions/dynamic-tools.ts
  - .pi/extensions/compile-tools.ts
---

# AWO (Agent Workflow Optimization) 統合設計書

## 概要

本ドキュメントは、論文「Optimizing Agentic Workflows using Meta-tools」の概念をpi-coding-agentに導入するための設計書である。

## 1. 背景・動機

### 1.1 問題意識

エージェントAIシステムには以下の課題がある:

1. **運用コスト**: 各推論ステップでLLM呼び出しが発生
2. **レイテンシ**: 反復的なツール呼び出しが累積
3. **冗長性**: 異なるタスクで同じツールシーケンスが繰り返される

### 1.2 論文の知見

AWO論文（arXiv:2601.22037v2）の主要な発見:

- 5ステップ後で14.3%以上のタスクが等価な軌跡をたどる
- 頻出パターンをメタツール化することでLLM呼び出しを11.9%削減
- タスク成功率を4.2%ポイント向上

### 1.3 pi-coding-agentとの関連

| 論文概念 | pi-coding-agent相当 |
|---------|---------------------|
| Meta-tools | dynamic-tools, compile_tools |
| State Graph | 依存関係DAG |
| Agent Memory | agent-memory.ts |

## 2. 設計目標

### 2.1 機能目標

| 目標 | 説明 | 優先度 |
|------|------|--------|
| トレース収集 | エージェント実行履歴の自動収集 | P0 |
| パターン検出 | 頻出ツールシーケンスの特定 | P0 |
| メタツール生成 | パターンから複合ツールの自動生成 | P1 |
| 透過的統合 | 既存ワークフローへの影響最小化 | P1 |

### 2.2 非機能目標

| 目標 | 指標 |
|------|------|
| オーバーヘッド | 実行時間への影響 < 5% |
| スケーラビリティ | 10,000+トレースを処理可能 |
| 保守性 | モジュール化された設計 |

## 3. アーキテクチャ

### 3.1 全体構成

```
┌─────────────────────────────────────────────────────────────┐
│                    AWO Integration Layer                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐      │
│  │   Trace     │───▶│   State     │───▶│   Meta-     │      │
│  │  Collector  │    │   Graph     │    │   Tool      │      │
│  └─────────────┘    └─────────────┘    └─────────────┘      │
│         │                  │                  │              │
│         ▼                  ▼                  ▼              │
│  ┌─────────────────────────────────────────────────┐        │
│  │              Persistent Storage                  │        │
│  │         (.pi/data/awo/*.jsonl)                  │        │
│  └─────────────────────────────────────────────────┘        │
│                          │                                   │
│                          ▼                                   │
│  ┌─────────────────────────────────────────────────┐        │
│  │           Meta-Tool Registry                     │        │
│  │    (dynamic-tools と統合)                       │        │
│  └─────────────────────────────────────────────────┘        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
         │                                    │
         ▼                                    ▼
┌─────────────────┐                 ┌─────────────────┐
│  subagent_run   │                 │  compile_tools  │
│  agent_team_run │                 │                 │
└─────────────────┘                 └─────────────────┘
```

### 3.2 コンポーネント詳細

#### 3.2.1 Trace Collector

**責務**: エージェント実行履歴の収集

```typescript
interface TraceCollector {
  /**
   * ツール呼び出しを記録
   * @summary ツール呼び出しをトレースに追加
   */
  recordToolCall(call: ToolCall): void;

  /**
   * 実行完了時にトレースを保存
   * @summary トレースを永続化
   */
  finalizeTrace(traceId: string): void;

  /**
   * トレース一覧を取得
   * @summary 収集済みトレースを返す
   */
  getTraces(filter?: TraceFilter): Trace[];
}

interface ToolCall {
  toolName: string;
  arguments: Record<string, unknown>;
  result: unknown;
  timestamp: number;
  executionId: string;
}

interface Trace {
  id: string;
  taskId: string;
  toolCalls: ToolCall[];
  startTime: number;
  endTime: number;
  success: boolean;
}
```

**保存先**: `.pi/data/awo/traces/*.jsonl`

#### 3.2.2 State Graph Builder

**責務**: トレースからState Graphを構築

```typescript
interface StateGraphBuilder {
  /**
   * トレースからState Graphを構築
   * @summary 複数トレースを統合してグラフ化
   */
  buildGraph(traces: Trace[]): StateGraph;

  /**
   * 等価状態のマージ
   * @summary ドメイン知識またはLLMで等価判定
   */
  mergeEquivalentStates(graph: StateGraph): MergedStateGraph;
}

interface StateNode {
  id: string;
  toolCalls: ToolCall[];  // これまでのツール呼び出し履歴
  isRoot: boolean;
}

interface StateEdge {
  from: string;
  to: string;
  toolCall: ToolCall;
  weight: number;  // 通過回数
}

interface StateGraph {
  nodes: Map<string, StateNode>;
  edges: StateEdge[];
  rootId: string;
}

interface MergedStateGraph extends StateGraph {
  mergeRules: MergeRule[];
}
```

#### 3.2.3 Meta-Tool Extractor

**責務**: Algorithm 1を実装し、メタツール候補を抽出

```typescript
interface MetaToolExtractor {
  /**
   * メタツール候補を抽出
   * @summary Algorithm 1を実行
   */
  extractCandidates(
    graph: MergedStateGraph,
    threshold: number
  ): MetaToolCandidate[];

  /**
   * メタツールを生成
   * @summary 候補から実際のツール定義を生成
   */
  generateTool(candidate: MetaToolCandidate): MetaToolDefinition;
}

interface MetaToolCandidate {
  id: string;
  toolSequence: ToolCall[];
  frequency: number;
  savingsEstimate: number;  // 削減されるLLM呼び出し数
}

interface MetaToolDefinition {
  name: string;
  description: string;
  parameters: JSONSchema;
  implementation: string;  // TypeScript コード
  sourcePattern: ToolCall[];
}
```

**Algorithm 1 擬似コード（論文から）**:

```
Input: Merged state graph Gm = (V, E, w), threshold T
Output: Set of meta-tools M

G'm ← Gm
M ← ∅

while true do
  state_pairs ← extract_state_pairs(G'm, T)

  if not state_pairs.empty() then
    (nx, ny) ← state_pairs[0]
    candidate_tool ← {nx, ny}

    while nz = select_child(ny, T) do
      candidate_tool ← candidate_tool ∪ {nz}
      ny ← nz
    end while

    M ← M ∪ {candidate_tool}
    G'm ← compress_graph(Gm, M)
  else
    return M
  end if
end while
```

#### 3.2.4 Meta-Tool Registry

**責務**: 生成されたメタツールの管理

```typescript
interface MetaToolRegistry {
  /**
   * メタツールを登録
   * @summary dynamic-toolsシステムに統合
   */
  register(tool: MetaToolDefinition): void;

  /**
   * メタツール一覧を取得
   * @summary 登録済みメタツールを返す
   */
  list(): MetaToolDefinition[];

  /**
   * メタツールを削除
   * @summary 使用頻度の低いツールを削除
   */
  prune(minUsage: number): void;
}
```

## 4. データフロー

### 4.1 トレース収集フロー

```
┌─────────────┐
│ subagent_run│
│ agent_team  │
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│ TraceCollector  │
│ recordToolCall()│
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ .pi/data/awo/   │
│ traces/*.jsonl  │
└─────────────────┘
```

### 4.2 メタツール生成フロー

```
┌─────────────────┐
│ traces/*.jsonl  │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ StateGraph      │
│ Builder         │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ MergedState     │
│ Graph           │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ MetaTool        │
│ Extractor       │
│ (Algorithm 1)   │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ MetaTool        │
│ Registry        │
└─────────────────┘
```

## 5. 既存システムとの統合

### 5.1 dynamic-tools との統合

```typescript
// 既存: .pi/extensions/dynamic-tools.ts
// 変更: メタツールを自動登録

import { MetaToolRegistry } from './awo/meta-tool-registry.js';

// dynamic-toolsのlist_dynamic_toolsに統合
export async function listDynamicTools(filter) {
  const manualTools = await loadManualTools();
  const metaTools = MetaToolRegistry.list();

  return [...manualTools, ...metaTools];
}
```

### 5.2 compile_tools との連携

```typescript
// 既存: .pi/extensions/compile-tools.ts
// 変更: メタツール候補の入力として活用

// compile_toolsが融合候補を検出したら、
// AWOシステムに通知して学習データとして蓄積
```

### 5.3 subagent_run への統合

```typescript
// 既存: .pi/extensions/subagents.ts
// 変更: トレース収集のフック

import { TraceCollector } from './awo/trace-collector.js';

export async function subagentRun(params) {
  const collector = new TraceCollector();

  // ツール呼び出しをフック
  const wrappedContext = {
    ...params.context,
    onToolCall: (call) => collector.recordToolCall(call)
  };

  // 実行
  const result = await executeSubagent({ ...params, context: wrappedContext });

  // トレース保存
  collector.finalizeTrace(result.id);

  return result;
}
```

## 6. 設定パラメータ

### 6.1 AWO設定

```typescript
interface AWOConfig {
  // トレース収集
  traceCollection: {
    enabled: boolean;
    maxTraces: number;          // 最大保存トレース数
    retentionDays: number;      // 保持期間
  };

  // メタツール抽出
  extraction: {
    threshold: number;          // Algorithm 1の閾値T
    minFrequency: number;       // 最小出現頻度
    maxToolLength: number;      // メタツールの最大ツール数
  };

  // 登録・管理
  registry: {
    autoRegister: boolean;      // 自動登録するか
    maxTools: number;           // 最大メタツール数
    pruneInterval: number;      // 削除チェック間隔（ms）
  };
}

const DEFAULT_CONFIG: AWOConfig = {
  traceCollection: {
    enabled: true,
    maxTraces: 10000,
    retentionDays: 30
  },
  extraction: {
    threshold: 5,       // 5回以上出現で候補
    minFrequency: 3,    // 3回以上
    maxToolLength: 5    // 最大5ツールまで結合
  },
  registry: {
    autoRegister: false,  // 初期は手動承認
    maxTools: 100,
    pruneInterval: 86400000  // 1日
  }
};
```

## 7. 実装フェーズ

### Phase 1: トレース収集基盤（1-2日）

**成果物**:
- `.pi/lib/awo/trace-collector.ts`
- `.pi/lib/awo/types.ts`
- subagent_runへの統合

**検証基準**:
- [ ] トレースが正しく収集される
- [ ] JSONL形式で保存される
- [ ] 既存機能に影響しない

### Phase 2: State Graph構築（2-3日）

**成果物**:
- `.pi/lib/awo/state-graph.ts`
- 等価状態判定（簡易版）

**検証基準**:
- [ ] トレースからグラフを構築できる
- [ ] 重みが正しく計算される
- [ ] 可視化デバッグが可能

### Phase 3: メタツール抽出（3-5日）

**成果物**:
- `.pi/lib/awo/meta-tool-extractor.ts`
- Algorithm 1の実装

**検証基準**:
- [ ] 頻出パターンが検出される
- [ ] メタツール定義が生成される
- [ ] 削減効果が推算できる

### Phase 4: Registry統合（1-2日）

**成果物**:
- `.pi/lib/awo/meta-tool-registry.ts`
- dynamic-toolsとの統合

**検証基準**:
- [ ] メタツールが登録・実行できる
- [ ] 既存ツールと共存できる
- [ ] 削除機能が動作する

### Phase 5: 評価・チューニング（継続）

**活動**:
- 実際のワークロードで評価
- 閾値の調整
- パフォーマンス計測

## 8. リスクと対策

| リスク | 確率 | 影響 | 対策 |
|--------|------|------|------|
| パターン検出精度不足 | 中 | 中 | 閾値調整、LLMアシスト |
| オーバーヘッド増加 | 低 | 中 | 非同期処理、バッチ実行 |
| メタツールの陳腐化 | 中 | 低 | 定期的再学習、TTL |
| 既存機能への影響 | 低 | 高 | 段階的ロールアウト |

## 9. 成功指標

| 指標 | 目標値 | 測定方法 |
|------|--------|---------|
| LLM呼び出し削減率 | > 5% | 実行ログ比較 |
| 平均レイテンシ改善 | > 3% | タイムスタンプ比較 |
| タスク成功率維持 | 変化なし | 成功率モニタリング |
| メモリオーバーヘッド | < 50MB | プロセスメモリ計測 |

## 10. 参考文献

- Sami Abuzakuk et al., "Optimizing Agentic Workflows using Meta-tools", arXiv:2601.22037v2, ICML 2026
- `.pi/extensions/dynamic-tools.ts` - 既存の動的ツールシステム
- `.pi/extensions/compile-tools.ts` - 既存のツール融合システム
- `.pi/lib/agent-memory.ts` - 既存のエージェントメモリ
