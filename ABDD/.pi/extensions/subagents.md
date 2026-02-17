---
title: Subagents Extension
category: reference
audience: developer
last_updated: 2026-02-18
tags: [extension, subagent, delegation, parallel, multi-agent]
related: [agent-teams.md, agent-runtime.md, ul-dual-mode.md]
---

# Subagents Extension

サブエージェントの作成、管理、委譲実行を行うツール群を提供する拡張機能。

## 概要

この拡張機能は、単一のAIエージェントの認知限界を補うために、タスクを専門特化したサブエージェントに委譲する機能を提供する。これにより、以下の利点を得る：

- **認知負荷の分散**: 各専門家は単一の関心事に集中
- **並列実行**: 独立したトラックを同時実行可能
- **クロスバリデーション**: 複数視点でのエラー検出
- **スケーラビリティ**: タスク複雑度に応じたチーム編成

## ツール一覧

### subagent_list

サブエージェント定義一覧と現在のデフォルトサブエージェントを表示。

```typescript
pi.registerTool({
  name: "subagent_list",
  parameters: Type.Object({}),
  // ...
});
```

**戻り値**:
- `content`: フォーマットされた一覧テキスト
- `details.currentAgentId`: 現在のデフォルトID
- `details.agents`: エージェント定義配列

### subagent_create

カスタムサブエージェント定義を作成。

```typescript
pi.registerTool({
  name: "subagent_create",
  parameters: Type.Object({
    id: Type.Optional(Type.String()),          // 一意ID（省略可）
    name: Type.String(),                        // 表示名
    description: Type.String(),                 // 使用場面の説明
    systemPrompt: Type.String(),                // コア指示プロンプト
    provider: Type.Optional(Type.String()),     // プロバイダー上書き
    model: Type.Optional(Type.String()),        // モデル上書き
    setCurrent: Type.Optional(Type.Boolean()),  // デフォルトに設定
  }),
  // ...
});
```

### subagent_configure

サブエージェントの有効/無効切り替え、デフォルト設定。

```typescript
pi.registerTool({
  name: "subagent_configure",
  parameters: Type.Object({
    subagentId: Type.String(),
    enabled: Type.Optional(Type.Boolean()),
    setCurrent: Type.Optional(Type.Boolean()),
  }),
  // ...
});
```

### subagent_run

単一サブエージェントで委譲タスクを実行。

```typescript
pi.registerTool({
  name: "subagent_run",
  parameters: Type.Object({
    task: Type.String(),
    subagentId: Type.Optional(Type.String()),
    extraContext: Type.Optional(Type.String()),
    timeoutMs: Type.Optional(Type.Number()),
    retry: createRetrySchema(),
  }),
  // ...
});
```

**推奨用途**: 単一専門家へのフォールバック委譲

### subagent_run_parallel

複数サブエージェントを並列実行。

```typescript
pi.registerTool({
  name: "subagent_run_parallel",
  parameters: Type.Object({
    task: Type.String(),
    subagentIds: Type.Optional(Type.Array(Type.String())),
    extraContext: Type.Optional(Type.String()),
    timeoutMs: Type.Optional(Type.Number()),
    retry: createRetrySchema(),
  }),
  // ...
});
```

**推奨用途**: 2以上の専門家によるファンアウト実行

### subagent_status

アクティブなサブエージェントリクエスト数とエージェント数を表示。

```typescript
pi.registerTool({
  name: "subagent_status",
  parameters: Type.Object({}),
  // ...
});
```

**戻り値の詳細**:
- `activeRunRequests`: 実行中リクエスト数
- `activeAgents`: アクティブエージェント数
- `adaptiveParallelPenalty`: 適応的並列度ペナルティ値

### subagent_runs

最近のサブエージェント実行履歴を表示。

```typescript
pi.registerTool({
  name: "subagent_runs",
  parameters: Type.Object({
    limit: Type.Optional(Type.Number({ minimum: 1, maximum: 50 })),
  }),
  // ...
});
```

## スラッシュコマンド

### /subagent

```bash
/subagent list              # 一覧表示
/subagent runs              # 実行履歴
/subagent status            # ランタイム状態
/subagent default <id>      # デフォルト設定
/subagent enable <id>       # 有効化
/subagent disable <id>      # 無効化
```

## 主要な型定義

### SubagentDefinition

```typescript
interface SubagentDefinition {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  provider?: string;
  model?: string;
  enabled: "enabled" | "disabled";
  createdAt: string;
  updatedAt: string;
}
```

### SubagentRunRecord

```typescript
interface SubagentRunRecord {
  runId: string;
  agentId: string;
  status: "completed" | "failed";
  summary: string;
  error?: string;
  startedAt: string;
  latencyMs: number;
  outputFile: string;
}
```

### RunOutcomeCode

```typescript
type RunOutcomeCode =
  | "SUCCESS"
  | "PARTIAL_SUCCESS"
  | "NONRETRYABLE_FAILURE"
  | "RETRYABLE_FAILURE"
  | "CANCELLED"
  | "TIMEOUT";
```

## 内部関数

### toAgentId

```typescript
function toAgentId(input: string): string
```

入力文字列からサブエージェントIDを生成。小文字化、ハイフン結合、最大48文字。

### pickAgent

```typescript
function pickAgent(
  storage: SubagentStorage,
  requestedId?: string
): SubagentDefinition | undefined
```

指定ID、または現在のデフォルト、または最初の有効エージェントを選択。

### pickDefaultParallelAgents

```typescript
function pickDefaultParallelAgents(
  storage: SubagentStorage
): SubagentDefinition[]
```

環境変数`PI_SUBAGENT_PARALLEL_DEFAULT`に基づいて並列実行用エージェントを選択。

### resolveEffectiveTimeoutMs

```typescript
function resolveEffectiveTimeoutMs(
  timeoutMs: number | undefined,
  modelId: string | undefined,
  defaultTimeout: number
): number
```

モデル別のタイムアウト調整を含む有効タイムアウトを計算。

## 適応的並列度制御

### ADAPTIVE_PARALLEL_MAX_PENALTY

並列度削減の最大ペナルティ値。

### ADAPTIVE_PARALLEL_DECAY_MS

ペナルティ減衰の時間間隔（ミリ秒）。

### adaptivePenalty

```typescript
const adaptivePenalty = createAdaptivePenaltyController({
  isStable: STABLE_SUBAGENT_RUNTIME,
  maxPenalty: ADAPTIVE_PARALLEL_MAX_PENALTY,
  decayMs: ADAPTIVE_PARALLEL_DECAY_MS,
});
```

レート制限エラー時にペナルティを上げ、正常終了時に下げる制御。

## ランタイム容量管理

### reserveRuntimeCapacity

```typescript
const capacityCheck = await reserveRuntimeCapacity({
  toolName: "subagent_run",
  additionalRequests: 1,
  additionalLlm: 1,
  maxWaitMs: snapshot.limits.capacityWaitMs,
  pollIntervalMs: snapshot.limits.capacityPollMs,
  signal,
});
```

### waitForRuntimeOrchestrationTurn

```typescript
const queueWait = await waitForRuntimeOrchestrationTurn({
  toolName: "subagent_run",
  maxWaitMs: queueSnapshot.limits.capacityWaitMs,
  pollIntervalMs: queueSnapshot.limits.capacityPollMs,
  signal,
});
```

オーケストレーションキューでの待機制御。

## ライブモニター

### createSubagentLiveMonitor

```typescript
const liveMonitor = createSubagentLiveMonitor(ctx, {
  title: "Subagent Run (detailed live view)",
  items: [{ id: agent.id, name: agent.name }],
});
```

TUIでのリアルタイム進捗表示。

### renderSubagentLiveView

ライブビューのレンダリング関数。

## イベントハンドラ

### session_start

```typescript
pi.on("session_start", async (_event, ctx) => {
  const storage = loadStorage(ctx.cwd);
  saveStorage(ctx.cwd, storage);
  resetRuntimeTransientState();
  refreshRuntimeStatus(ctx);
  ctx.ui.notify("Subagent extension loaded...", "info");
});
```

### before_agent_start

```typescript
pi.on("before_agent_start", async (event, _ctx) => {
  // プロアクティブなマルチエージェント委譲ポリシーを注入
});
```

環境変数`PI_SUBAGENT_PROACTIVE_PROMPT`で制御可能（デフォルト: 有効）。

## エクスポート

```typescript
export {
  renderSubagentLiveView,
  createSubagentLiveMonitor,
} from "./subagents/live-monitor";

export {
  type SubagentParallelCapacityResolution,
  resolveSubagentParallelCapacity,
} from "./subagents/parallel-execution";

export {
  type SubagentNormalizedOutput,
  normalizeSubagentOutput,
  buildSubagentPrompt,
  runSubagentTask,
  isRetryableSubagentError,
  buildFailureSummary,
  resolveSubagentFailureOutcome,
  mergeSkillArrays,
  resolveEffectiveSkills,
  formatSkillsSection,
} from "./subagents/task-execution";
```

## 定数

| 定数 | 値 | 説明 |
|------|-----|------|
| `LIVE_PREVIEW_LINE_LIMIT` | 36 | ライブプレビューの行数制限 |
| `LIVE_LIST_WINDOW_SIZE` | 20 | リスト表示のウィンドウサイズ |
| `DEFAULT_AGENT_TIMEOUT_MS` | 300000 | デフォルトタイムアウト（5分） |

## 依存モジュール

- `./subagents/storage` - ストレージ管理
- `./subagents/live-monitor` - ライブモニター
- `./subagents/parallel-execution` - 並列実行制御
- `./subagents/task-execution` - タスク実行
- `../lib/agent-common` - 共通エージェント設定
- `../lib/agent-errors` - エラー処理
- `../lib/retry-with-backoff` - リトライロジック
- `../lib/cost-estimator` - コスト見積もり

## 環境変数

| 変数 | デフォルト | 説明 |
|------|-----------|------|
| `PI_SUBAGENT_PARALLEL_DEFAULT` | `"current"` | 並列実行のデフォルトモード |
| `PI_SUBAGENT_PROACTIVE_PROMPT` | `"1"` | プロアクティブポリシー注入 |
| `PI_DEBUG_COST_ESTIMATION` | - | コスト見積もりデバッグログ |
